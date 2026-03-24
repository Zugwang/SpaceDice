#!/usr/bin/env bash
# ─────────────────────────────────────────────────────
# SpaceDice — quick redeploy (git pull + restart)
#
# Usage: sudo bash deploy/redeploy.sh
# ─────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/opt/spacedice"
APP_USER="spacedice"

info() { echo -e "\033[1;32m[+]\033[0m $*"; }

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash deploy/redeploy.sh"; exit 1; }

cd "$APP_DIR"

info "Pulling latest code..."
sudo -u "$APP_USER" git pull --ff-only

info "Updating dependencies..."
export POETRY_VIRTUALENVS_IN_PROJECT=true
sudo -u "$APP_USER" -E poetry install --only main --no-interaction 2>&1 | tail -1

info "Restarting gunicorn..."
systemctl restart spacedice.service

info "Reloading nginx..."
nginx -t && systemctl reload nginx

sleep 1
HEALTH=$(curl -sf http://localhost/health 2>/dev/null || echo '{"status":"unreachable"}')
info "Health: $HEALTH"
info "Done."
