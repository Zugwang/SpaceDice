#!/usr/bin/env bash
# ─────────────────────────────────────────────────────
# SpaceDice Reloaded — VPS setup (zero Docker)
#
# Usage:
#   1. Clone repo to /opt/spacedice on your VPS
#   2. cp .env.example .env && edit .env (NASA_API_KEY, SECRET_KEY, DOMAIN)
#   3. sudo bash deploy/setup.sh
#
# Requires: Ubuntu/Debian VPS with root access
# ─────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/opt/spacedice"
APP_USER="spacedice"
DOMAIN=""

# ─── Helpers ──────────────────────────────────────────
info()  { echo -e "\033[1;32m[+]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[!]\033[0m $*"; }
error() { echo -e "\033[1;31m[x]\033[0m $*"; exit 1; }

# ─── Preflight ────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Run as root: sudo bash deploy/setup.sh"
[[ -f "$APP_DIR/.env" ]] || error ".env not found — cp .env.example .env and edit it first"

# Read DOMAIN from .env
DOMAIN=$(grep -E '^DOMAIN=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
[[ -n "$DOMAIN" && "$DOMAIN" != "spacedice.example.com" ]] || error "Set DOMAIN in .env (got: '$DOMAIN')"

info "Deploying SpaceDice to $DOMAIN"

# ─── 1. System deps ──────────────────────────────────
info "Installing system packages..."
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip pipx nginx certbot python3-certbot-nginx curl > /dev/null

# Install poetry system-wide if not present
if ! command -v poetry &> /dev/null; then
    info "Installing Poetry..."
    pipx install poetry
    # Ensure pipx bin is in PATH for this script
    export PATH="$PATH:$HOME/.local/bin"
fi

# ─── 2. App user ─────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
    info "Creating system user: $APP_USER"
    useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

# ─── 3. Virtualenv + deps ────────────────────────────
info "Installing Python dependencies with Poetry..."
cd "$APP_DIR"

# Poetry needs a venv in-project for systemd to find it
export POETRY_VIRTUALENVS_IN_PROJECT=true

# Run poetry install as the app user (owns the venv)
sudo -u "$APP_USER" -E poetry install --only main --no-interaction 2>&1 | tail -1

info "Venv at $APP_DIR/.venv ($($(echo "$APP_DIR/.venv/bin/python") --version))"

# ─── 4. Data dir ─────────────────────────────────────
mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/data"

# ─── 5. Systemd units ────────────────────────────────
info "Installing systemd units..."
cp "$APP_DIR/deploy/spacedice.service"       /etc/systemd/system/
cp "$APP_DIR/deploy/spacedice-fetch.service"  /etc/systemd/system/
cp "$APP_DIR/deploy/spacedice-fetch.timer"    /etc/systemd/system/

systemctl daemon-reload
systemctl enable spacedice.service
systemctl enable spacedice-fetch.timer

# ─── 6. Nginx ────────────────────────────────────────
info "Configuring nginx for $DOMAIN..."
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$APP_DIR/deploy/spacedice-nginx.conf" \
    > /etc/nginx/sites-available/spacedice

ln -sf /etc/nginx/sites-available/spacedice /etc/nginx/sites-enabled/spacedice

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# ─── 7. SSL — certbot ────────────────────────────────
# First, start nginx with HTTP-only for certbot challenge
# Temporarily replace the config with HTTP-only
cat > /etc/nginx/sites-available/spacedice <<TMPCONF
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://unix:/run/spacedice/gunicorn.sock;
        proxy_set_header Host \$host;
    }
    location /static/ {
        alias /opt/spacedice/static/;
    }
}
TMPCONF

nginx -t 2>/dev/null && systemctl restart nginx

info "Requesting SSL certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
    --register-unsafely-without-email 2>&1 | tail -3 || {
    warn "Certbot failed — is DNS for $DOMAIN pointing to this server?"
    warn "You can re-run: sudo certbot --nginx -d $DOMAIN"
    warn "Continuing with HTTP-only config for now..."
}

# Re-apply the full nginx config (certbot may have modified it)
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$APP_DIR/deploy/spacedice-nginx.conf" \
    > /etc/nginx/sites-available/spacedice

# If certbot succeeded, the certs exist; if not, fall back to HTTP
if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    info "SSL certificate installed"
else
    warn "No SSL cert found — falling back to HTTP-only"
    cat > /etc/nginx/sites-available/spacedice <<HTTPCONF
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/m;
server {
    listen 80;
    server_name $DOMAIN;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self';" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript font/woff2;
    gzip_min_length 256;
    location /static/ {
        alias /opt/spacedice/static/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    location /api/ {
        limit_req zone=api burst=5 nodelay;
        proxy_pass http://unix:/run/spacedice/gunicorn.sock;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /health {
        proxy_pass http://unix:/run/spacedice/gunicorn.sock;
        proxy_set_header Host \$host;
        access_log off;
    }
    location / {
        proxy_pass http://unix:/run/spacedice/gunicorn.sock;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
HTTPCONF
fi

nginx -t && systemctl reload nginx

# ─── 8. Start app ────────────────────────────────────
info "Starting SpaceDice..."
systemctl restart spacedice.service
systemctl start spacedice-fetch.timer

# Wait for socket
sleep 2

# ─── 9. Initial data fetch ───────────────────────────
if [[ ! -f "$APP_DIR/data/neows.db" ]] || [[ $(stat -c%s "$APP_DIR/data/neows.db" 2>/dev/null || echo 0) -lt 1000 ]]; then
    info "Running initial NASA data fetch (last 90 days)..."
    sudo -u "$APP_USER" bash -c "cd $APP_DIR && .venv/bin/python scripts/fetch_nasa.py --init --days 90" || {
        warn "Initial fetch failed — you can re-run manually:"
        warn "  sudo -u spacedice /opt/spacedice/.venv/bin/python /opt/spacedice/scripts/fetch_nasa.py --init --days 6275"
    }
fi

# ─── 10. Health check ────────────────────────────────
info "Running health check..."
if curl -sf http://localhost/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost/health)
    info "Health OK: $HEALTH"
else
    warn "Health check failed — check logs: journalctl -u spacedice -f"
fi

# ─── Done ─────────────────────────────────────────────
echo ""
info "========================================="
info "  SpaceDice deployed!"
info "========================================="
info ""
info "  URL:      https://$DOMAIN"
info "  Logs:     journalctl -u spacedice -f"
info "  Restart:  sudo systemctl restart spacedice"
info "  Fetch:    sudo systemctl start spacedice-fetch"
info "  Status:   sudo systemctl status spacedice"
info "  Timer:    sudo systemctl list-timers spacedice*"
info ""
info "  Files:"
info "    App:    $APP_DIR/"
info "    DB:     $APP_DIR/data/neows.db"
info "    Logs:   journalctl -u spacedice"
info "    Nginx:  /etc/nginx/sites-available/spacedice"
info "    Units:  /etc/systemd/system/spacedice*"
info ""
info "  Cron: daily fetch at 06:00 UTC (±15min jitter)"
info "  SSL:  auto-renewed by certbot timer"
info ""
