#!/usr/bin/env bash
# ─────────────────────────────────────────────────────
# SpaceDice — deploy repo → /opt/spacedice-beta
#
# Serves the app at https://space-dice.com/beta/
# Uses a separate Gunicorn instance on its own socket.
#
# Usage: sudo bash deploy/deploy-beta.sh
# ─────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="/home/k1000/Projects/ClaudeAssisted/SpaceDice"
BETA_DIR="/opt/spacedice-beta"
PROD_DIR="/opt/spacedice"
APP_USER="spacedice"

info()  { echo -e "\033[1;32m[+]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[!]\033[0m $*"; }
error() { echo -e "\033[1;31m[x]\033[0m $*"; exit 1; }

[[ $EUID -eq 0 ]] || error "Run as root: sudo bash deploy/deploy-beta.sh"
[[ -d "$REPO_DIR" ]] || error "Repo not found at $REPO_DIR"

# ─── 1. Sync code ──────────────────────────────────
info "Syncing $REPO_DIR → $BETA_DIR ..."
mkdir -p "$BETA_DIR"

rsync -a --delete \
    --exclude='.env' \
    --exclude='data/' \
    --exclude='.venv/' \
    --exclude='.git/' \
    --exclude='__pycache__/' \
    --exclude='.pytest_cache/' \
    --exclude='*.pyc' \
    --exclude='tests/' \
    "$REPO_DIR/" "$BETA_DIR/"

# Share the prod DB (symlink data dir)
if [[ ! -e "$BETA_DIR/data" ]]; then
    ln -s "$PROD_DIR/data" "$BETA_DIR/data"
    info "Symlinked data → $PROD_DIR/data"
fi

# Copy .env from prod if not present
if [[ ! -f "$BETA_DIR/.env" ]]; then
    cp "$PROD_DIR/.env" "$BETA_DIR/.env"
fi

chown -R "$APP_USER:$APP_USER" "$BETA_DIR"

# ─── 2. Venv + deps ────────────────────────────────
info "Installing dependencies..."
cd "$BETA_DIR"
sudo -u "$APP_USER" HOME="$BETA_DIR" POETRY_VIRTUALENVS_IN_PROJECT=true \
    poetry install --only main --no-interaction 2>&1 | tail -1

# ─── 3. Gunicorn config for beta ───────────────────
cat > "$BETA_DIR/gunicorn-beta.conf.py" <<'PYCONF'
import os
bind = "unix:/run/spacedice-beta/gunicorn.sock"
workers = 2
threads = 1
worker_class = "sync"
accesslog = "-"
errorlog = "-"
loglevel = "info"
graceful_timeout = 30
timeout = 120
PYCONF
chown "$APP_USER:$APP_USER" "$BETA_DIR/gunicorn-beta.conf.py"

# ─── 4. Systemd unit ───────────────────────────────
cat > /etc/systemd/system/spacedice-beta.service <<EOF
[Unit]
Description=SpaceDice Beta (Gunicorn)
After=network.target

[Service]
Type=notify
User=$APP_USER
Group=$APP_USER
RuntimeDirectory=spacedice-beta
WorkingDirectory=$BETA_DIR
EnvironmentFile=$BETA_DIR/.env
Environment=SCRIPT_NAME=/beta
ExecStart=$BETA_DIR/.venv/bin/gunicorn \\
    --config gunicorn-beta.conf.py \\
    "app:create_app()"
ExecReload=/bin/kill -s HUP \$MAINPID

PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$PROD_DIR/data /run/spacedice-beta
NoNewPrivileges=true

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable spacedice-beta.service

# ─── 5. Nginx — add /beta/ location ────────────────
NGINX_CONF="/etc/nginx/sites-available/spacedice"

if ! grep -q 'location /beta/' "$NGINX_CONF"; then
    info "Adding /beta/ location to nginx..."
    # Insert before the main "location / {" block (the last one in the 443 server)
    sudo sed -i '/location \/ {/{
        # Only match the one inside the 443 block (after ssl lines)
        /proxy_pass.*gunicorn\.sock/!b
        # This is the fallback location in the HTTP block, skip
        b
    }' "$NGINX_CONF"

    # Simpler approach: insert the beta block right before "location / {"
    # We target the last occurrence (in the 443 server block)
    python3 -c "
import re
with open('$NGINX_CONF') as f:
    content = f.read()

beta_block = '''
    # Beta instance
    location /beta/static/ {
        alias $BETA_DIR/static/;
        expires 1d;
        add_header Cache-Control \"public\";
        access_log off;
    }
    location /beta/ {
        proxy_pass http://unix:/run/spacedice-beta/gunicorn.sock;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_set_header SCRIPT_NAME /beta;
    }
'''

# Insert before the last 'location / {' in the 443 block
parts = content.rsplit('location / {', 1)
if len(parts) == 2:
    content = parts[0] + beta_block + '\n    location / {' + parts[1]

with open('$NGINX_CONF', 'w') as f:
    f.write(content)
"
fi

nginx -t 2>/dev/null || { error "nginx config invalid"; }
systemctl reload nginx

# ─── 6. Start beta ─────────────────────────────────
info "Starting spacedice-beta..."
systemctl restart spacedice-beta.service

sleep 2

HEALTH=$(curl -sf http://localhost/beta/health 2>/dev/null || echo '{"status":"unreachable"}')
info "Beta health: $HEALTH"

info "Beta deployed: https://space-dice.com/beta/"
