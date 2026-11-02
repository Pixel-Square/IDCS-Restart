#!/usr/bin/env bash
# =============================================================================
# activate-coe-hosting.sh — Run this with sudo to go live on coe.krgi.co.in
#
# What this script does:
#   1. Copies the new nginx config to /etc/nginx/sites-available/coe
#      (overwrites the old symlink → makes it a real file pointing to IDCS-MAIN)
#   2. Ensures /etc/nginx/sites-enabled/coe symlink is correct
#   3. Tests nginx config
#   4. Reloads nginx
#   5. Prints service status
#
# Usage (run as root or with sudo):
#   sudo bash /home/iqac/IDCS-MAIN/deploy/activate-coe-hosting.sh
# =============================================================================

set -euo pipefail

NEW_CONF="/home/iqac/IDCS-MAIN/deploy/coe.krgi.co.in.conf"
NGINX_AVAIL="/etc/nginx/sites-available/coe"
NGINX_ENABLED="/etc/nginx/sites-enabled/coe"
FRONTEND_DIST="/home/iqac/IDCS-MAIN/coe/dist"
GUNICORN_SOCK="/run/gunicorn-idcs/idcs.sock"

echo "================================================================"
echo " COE → IDCS-MAIN Activation Script"
echo " $(date)"
echo "================================================================"
echo ""

# ── Pre-flight checks ──────────────────────────────────────────────
echo "[1/6] Pre-flight checks..."

if [ ! -f "$NEW_CONF" ]; then
    echo "ERROR: New nginx config not found at: $NEW_CONF"
    exit 1
fi

if [ ! -f "$FRONTEND_DIST/index.html" ]; then
    echo "ERROR: Frontend dist not found at: $FRONTEND_DIST/index.html"
    echo "       Run: cd /home/iqac/IDCS-MAIN/coe && npm run build"
    exit 1
fi

if [ ! -S "$GUNICORN_SOCK" ]; then
    echo "WARNING: gunicorn-idcs socket not found at $GUNICORN_SOCK"
    echo "         Is gunicorn-idcs.service running?"
    systemctl status gunicorn-idcs.service --no-pager || true
    echo ""
    echo "Proceeding anyway — nginx will serve static files correctly."
    echo "Restart gunicorn-idcs with: systemctl restart gunicorn-idcs.service"
fi

echo "   ✓ Pre-flight checks passed."
echo ""

# ── Step 1: Install new nginx config ──────────────────────────────
echo "[2/6] Installing new nginx config to $NGINX_AVAIL..."

# Remove the old symlink (was pointing to IDCS-Restart)
if [ -L "$NGINX_AVAIL" ]; then
    rm -f "$NGINX_AVAIL"
    echo "   ✓ Removed old symlink: $NGINX_AVAIL"
elif [ -f "$NGINX_AVAIL" ]; then
    cp -f "$NGINX_AVAIL" "${NGINX_AVAIL}.bak.$(date +%Y%m%d%H%M%S)"
    echo "   ✓ Backed up old config file."
fi

# Copy the new config as a real file
cp -f "$NEW_CONF" "$NGINX_AVAIL"
echo "   ✓ Copied $NEW_CONF → $NGINX_AVAIL"
echo ""

# ── Step 2: Ensure sites-enabled symlink ──────────────────────────
echo "[3/6] Ensuring /etc/nginx/sites-enabled/coe symlink..."

if [ -L "$NGINX_ENABLED" ]; then
    CURRENT_TARGET=$(readlink "$NGINX_ENABLED")
    if [ "$CURRENT_TARGET" != "$NGINX_AVAIL" ]; then
        rm -f "$NGINX_ENABLED"
        ln -s "$NGINX_AVAIL" "$NGINX_ENABLED"
        echo "   ✓ Updated symlink: $NGINX_ENABLED → $NGINX_AVAIL"
    else
        echo "   ✓ Symlink already correct: $NGINX_ENABLED → $NGINX_AVAIL"
    fi
elif [ ! -e "$NGINX_ENABLED" ]; then
    ln -s "$NGINX_AVAIL" "$NGINX_ENABLED"
    echo "   ✓ Created symlink: $NGINX_ENABLED → $NGINX_AVAIL"
else
    echo "   WARNING: $NGINX_ENABLED exists but is not a symlink — manual review needed."
fi
echo ""

# ── Step 3: Test nginx config ──────────────────────────────────────
echo "[4/6] Testing nginx configuration..."
nginx -t
echo "   ✓ nginx config test passed."
echo ""

# ── Step 4: Reload nginx ───────────────────────────────────────────
echo "[5/6] Reloading nginx..."
systemctl reload nginx
echo "   ✓ nginx reloaded successfully."
echo ""

# ── Step 5: Status report ──────────────────────────────────────────
echo "[6/6] Service status:"
echo ""
echo "--- nginx ---"
systemctl status nginx --no-pager -l | head -20

echo ""
echo "--- gunicorn-idcs ---"
systemctl status gunicorn-idcs --no-pager -l | head -20

echo ""
echo "================================================================"
echo " ACTIVATION COMPLETE"
echo "================================================================"
echo ""
echo " → Test the site:   curl -I http://coe.krgi.co.in/"
echo " → Test the API:    curl -s https://coe.krgi.co.in/api/coe/portal/ | head -c 200"
echo " → Public URL:      https://coe.krgi.co.in/"
echo ""
echo " → Nginx config:    $NGINX_AVAIL"
echo " → Frontend dist:   $FRONTEND_DIST"
echo " → Backend socket:  $GUNICORN_SOCK"
echo ""
echo " If something is wrong, check:"
echo "   journalctl -u nginx --since '5 minutes ago'"
echo "   journalctl -u gunicorn-idcs --since '5 minutes ago'"
echo ""
