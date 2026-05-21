#!/bin/bash
# ========================================
# WebFX Auto-Deploy Script
# รัน git pull แล้ว restart backend service
# ========================================

set -e

# กำหนด path ของโปรเจค (ปรับตาม VPS ของคุณ)
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
LOG_FILE="$PROJECT_DIR/deploy/deploy.log"

# ========== Functions ==========

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ========== Deploy Steps ==========

log "===== Deploy Started ====="
log "Project dir: $PROJECT_DIR"

# 1. Pull latest code
cd "$PROJECT_DIR"
log "Pulling latest code..."
git fetch origin
git reset --hard origin/main
log "Git pull completed"

# 2. Install dependencies (if package.json changed)
cd "$BACKEND_DIR"
if git diff --name-only HEAD~1 HEAD | grep -q "backend/package.json"; then
    log "package.json changed - installing dependencies..."
    npm install --production
    log "npm install completed"
else
    log "No dependency changes - skipping npm install"
fi

# 3. Restart backend service
# ลองทั้ง PM2 และ systemd - ใช้อันที่มีอยู่
if command -v pm2 &> /dev/null; then
    log "Restarting with PM2..."
    pm2 restart webfx-backend 2>/dev/null || pm2 start server.js --name webfx-backend
    log "PM2 restart completed"
elif systemctl is-active --quiet webfx-backend 2>/dev/null; then
    log "Restarting with systemd..."
    sudo systemctl restart webfx-backend
    log "systemd restart completed"
else
    log "WARNING: No process manager found. Please restart manually."
    log "Consider using PM2: pm2 start backend/server.js --name webfx-backend"
fi

log "===== Deploy Completed ====="
