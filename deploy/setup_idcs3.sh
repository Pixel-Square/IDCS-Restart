#!/bin/bash
# IDCS 3.0 Deployment Setup Script (v2 — fixes space-in-path issues)
# Run with: sudo bash "/home/iqac/idcs 3.0/deploy/setup_idcs3.sh"

set -e

DEPLOY_DIR="/home/iqac/idcs 3.0/deploy"

echo "=== [1/5] Making gunicorn3 wrapper script executable ==="
chmod +x /home/iqac/gunicorn3_start.sh
echo "  /home/iqac/gunicorn3_start.sh is executable"

echo ""
echo "=== [2/5] Installing gunicorn3 systemd service ==="
cp "${DEPLOY_DIR}/gunicorn3.service" /etc/systemd/system/gunicorn3.service
systemctl daemon-reload
systemctl enable gunicorn3
systemctl restart gunicorn3
sleep 4
systemctl status gunicorn3 --no-pager | head -20

echo ""
echo "=== [3/5] Installing nginx config for idcs3.krgi.co.in and db3.krgi.co.in ==="
cp "${DEPLOY_DIR}/nginx_idcs3.conf" /etc/nginx/sites-available/idcs3

if [ ! -L /etc/nginx/sites-enabled/idcs3 ]; then
    ln -s /etc/nginx/sites-available/idcs3 /etc/nginx/sites-enabled/idcs3
    echo "  Symlink created: /etc/nginx/sites-enabled/idcs3"
else
    echo "  Symlink already exists, config updated in place."
fi

echo ""
echo "=== [4/5] Testing nginx config ==="
nginx -t

echo ""
echo "=== [5/5] Reloading nginx ==="
systemctl reload nginx

echo ""
echo "✓ Done!"
echo "  gunicorn3 socket : $(ls -la /run/gunicorn3/ 2>/dev/null | tail -1)"
echo "  Test frontend    : curl -I http://idcs3.krgi.co.in"
echo "  Test backend     : curl -I http://db3.krgi.co.in/admin/"
