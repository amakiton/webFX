#!/bin/bash
# WebFX Auto-Deploy Script

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
LOG_FILE="$PROJECT_DIR/deploy/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "===== Deploy Started ====="
log "Project dir: $PROJECT_DIR"

# 1. Pull latest code
log "Pulling latest code..."
git fetch origin
git reset --hard origin/main
log "Git pull completed"

# 2. Install dependencies if changed
if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -q "backend/package.json"; then
    log "package.json changed - installing dependencies..."
    cd "$BACKEND_DIR"
    npm install --production
    log "npm install completed"
else
    log "No dependency changes - skipping npm install"
fi

# 3. Restart backend
if command -v pm2 &> /dev/null; then
    log "Restarting backend with PM2..."
    pm2 restart webfx-backend 2>/dev/null || pm2 start "$BACKEND_DIR/server.js" --name webfx-backend
    log "PM2 restart completed"
else
    log "WARNING: PM2 not found. Please restart backend manually."
fi

log "===== Deploy Completed ====="
