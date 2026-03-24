#!/usr/bin/env bash
# ─────────────────────────────────────────────────────
# SpaceDice — deploy repo → /opt/spacedice (prod)
#
# Copies everything except .env, data/, .venv/
# Then restarts the service.
#
# Usage: sudo bash deploy/deploy-prod.sh
# ─────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="/home/k1000/Projects/ClaudeAssisted/SpaceDice"
PROD_DIR="/opt/spacedice"
APP_USER="spacedice"

info()  { echo -e "\033[1;32m[+]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[!]\033[0m $*"; }
error() { echo -e "\033[1;31m[x]\033[0m $*"; exit 1; }

[[ $EUID -eq 0 ]] || error "Run as root: sudo bash deploy/deploy-prod.sh"
[[ -d "$REPO_DIR" ]] || error "Repo not found at $REPO_DIR"

info "Syncing $REPO_DIR → $PROD_DIR ..."

rsync -a --delete \
    --exclude='.env' \
    --exclude='data/' \
    --exclude='.venv/' \
    --exclude='.git/' \
    --exclude='__pycache__/' \
    --exclude='.pytest_cache/' \
    --exclude='*.pyc' \
    --exclude='tests/' \
    "$REPO_DIR/" "$PROD_DIR/"

chown -R "$APP_USER:$APP_USER" "$PROD_DIR"
# Preserve .env and data ownership
[[ -f "$PROD_DIR/.env" ]] && chown "$APP_USER:$APP_USER" "$PROD_DIR/.env"

info "Updating dependencies..."
cd "$PROD_DIR"
sudo -u "$APP_USER" HOME="$PROD_DIR" POETRY_VIRTUALENVS_IN_PROJECT=true \
    poetry install --only main --no-interaction 2>&1 | tail -1

info "Restarting spacedice..."
systemctl restart spacedice.service

sleep 4

HEALTH=$(curl -sf http://localhost/health 2>/dev/null || echo '{"status":"unreachable"}')
info "Health: $HEALTH"

info "Reloading nginx..."
nginx -t 2>/dev/null && systemctl reload nginx

info "Prod deployed: https://space-dice.com"
