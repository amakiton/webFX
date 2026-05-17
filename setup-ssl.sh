#!/bin/bash
# ============================================================
# WebFX - HTTPS (SSL) Setup Script with Let's Encrypt
# ============================================================
# วิธีใช้:
#   chmod +x setup-ssl.sh
#   sudo ./setup-ssl.sh yourdomain.com
#
# ต้องมีโดเมนชี้มาที่ IP ของ VPS ก่อน!
# ถ้าไม่มีโดเมน จะใช้ self-signed certificate แทน
# ============================================================

set -e

DOMAIN=$1
EMAIL=${2:-"admin@$DOMAIN"}

echo "=============================="
echo "  WebFX SSL Setup"
echo "=============================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "กรุณารันด้วย sudo: sudo ./setup-ssl.sh yourdomain.com"
    exit 1
fi

if [ -z "$DOMAIN" ]; then
    echo ""
    echo "ไม่ได้ระบุโดเมน - จะติดตั้ง Self-Signed SSL แทน"
    echo "เว็บจะใช้ HTTPS ได้แต่จะขึ้นเตือน (ไม่มีโดเมนจริง)"
    echo ""

    # Generate self-signed certificate
    mkdir -p /etc/nginx/ssl
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/selfsigned.key \
        -out /etc/nginx/ssl/selfsigned.crt \
        -subj "/CN=webfx/O=WebFX/C=TH"

    # Configure Nginx with self-signed
    cat > /etc/nginx/sites-available/webfx << 'EOF'
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate /etc/nginx/ssl/selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/selfsigned.key;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

    ln -sf /etc/nginx/sites-available/webfx /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx

    echo ""
    echo "✅ Self-Signed SSL ติดตั้งเสร็จแล้ว!"
    echo "   เปิด: https://$(curl -s ifconfig.me)"
    echo "   (เบราว์เซอร์จะแจ้งเตือน ให้กด 'Advanced' > 'Proceed')"
    exit 0
fi

echo ""
echo "กำลังติดตั้ง SSL สำหรับ: $DOMAIN"
echo "อีเมล: $EMAIL"
echo ""

# Install certbot
apt update
apt install -y certbot python3-certbot-nginx

# Configure Nginx for domain
cat > /etc/nginx/sites-available/webfx << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root /var/www/html;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF

ln -sf /etc/nginx/sites-available/webfx /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Get SSL certificate
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" --redirect

# Auto-renew setup
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

echo ""
echo "=============================="
echo "✅ HTTPS ติดตั้งสำเร็จ!"
echo "=============================="
echo ""
echo "เว็บของคุณพร้อมใช้งานที่:"
echo "  https://$DOMAIN"
echo ""
echo "SSL จะต่ออายุอัตโนมัติทุก 3 เดือน"
echo "=============================="
