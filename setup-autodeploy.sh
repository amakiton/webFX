#!/bin/bash
# ============================================================
# WebFX - Auto Deploy Setup Script
# ============================================================
# วิธีใช้:
#   chmod +x setup-autodeploy.sh
#   sudo ./setup-autodeploy.sh
#
# หลังรันแล้ว ทุกครั้งที่ push โค้ดขึ้น GitHub
# เว็บจะอัปเดตอัตโนมัติภายใน 1 นาที!
# ============================================================

set -e

REPO_URL="https://github.com/amakiton/webFX.git"
WEB_DIR="/var/www/html"
DEPLOY_SCRIPT="/opt/webfx-deploy.sh"
WEBHOOK_PORT=9000

echo "=============================="
echo "  WebFX Auto-Deploy Setup"
echo "=============================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "กรุณารันด้วย sudo: sudo ./setup-autodeploy.sh"
    exit 1
fi

# ========== Method 1: Cron (ทุก 1 นาที) ==========
echo ""
echo "[1/3] ตั้งค่า Auto-pull ทุก 1 นาที..."

# Create deploy script
cat > $DEPLOY_SCRIPT << 'EOF'
#!/bin/bash
cd /var/www/html
git fetch origin main 2>/dev/null
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
    git pull origin main
    echo "$(date): Updated to $(git rev-parse --short HEAD)" >> /var/log/webfx-deploy.log
fi
EOF
chmod +x $DEPLOY_SCRIPT

# Add cron job (every 1 minute)
(crontab -l 2>/dev/null | grep -v "webfx-deploy"; echo "* * * * * $DEPLOY_SCRIPT") | crontab -

echo "   ✅ Cron job ตั้งค่าแล้ว (ตรวจสอบทุก 1 นาที)"

# ========== Method 2: Webhook (Real-time) ==========
echo ""
echo "[2/3] ตั้งค่า Webhook สำหรับ Real-time deploy..."

# Install webhook
apt install -y webhook 2>/dev/null || {
    echo "   กำลังติดตั้ง webhook..."
    apt update && apt install -y webhook
}

# Create webhook config
mkdir -p /etc/webhook
cat > /etc/webhook/hooks.json << EOF
[
  {
    "id": "webfx-deploy",
    "execute-command": "$DEPLOY_SCRIPT",
    "command-working-directory": "$WEB_DIR",
    "response-message": "Deploy triggered",
    "trigger-rule": {
      "match": {
        "type": "payload-hash-sha1",
        "secret": "webfx-secret-2024",
        "parameter": {
          "source": "header",
          "name": "X-Hub-Signature"
        }
      }
    }
  }
]
EOF

# Create systemd service for webhook
cat > /etc/systemd/system/webhook.service << EOF
[Unit]
Description=WebFX Webhook Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/webhook -hooks /etc/webhook/hooks.json -port $WEBHOOK_PORT -verbose
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable webhook
systemctl restart webhook

echo "   ✅ Webhook server กำลังทำงานที่ port $WEBHOOK_PORT"

# ========== Method 3: Open firewall ==========
echo ""
echo "[3/3] เปิด firewall สำหรับ webhook..."
ufw allow $WEBHOOK_PORT/tcp 2>/dev/null || true
echo "   ✅ Port $WEBHOOK_PORT เปิดแล้ว"

# ========== Done ==========
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_IP")

echo ""
echo "=============================="
echo "✅ Auto-Deploy ตั้งค่าเสร็จแล้ว!"
echo "=============================="
echo ""
echo "📋 วิธีการทำงาน:"
echo "   1. Cron: ตรวจสอบ GitHub ทุก 1 นาที (อัตโนมัติ)"
echo "   2. Webhook: อัปเดตทันที เมื่อ push (ต้องตั้งค่า GitHub)"
echo ""
echo "🔗 ตั้ง GitHub Webhook (เพื่อ Real-time):"
echo "   1. ไปที่: https://github.com/amakiton/webFX/settings/hooks/new"
echo "   2. Payload URL: http://$SERVER_IP:$WEBHOOK_PORT/hooks/webfx-deploy"
echo "   3. Content type: application/json"
echo "   4. Secret: webfx-secret-2024"
echo "   5. Events: Just the push event"
echo "   6. กด Add webhook"
echo ""
echo "📁 Log file: /var/log/webfx-deploy.log"
echo "   ดู log: tail -f /var/log/webfx-deploy.log"
echo "=============================="
