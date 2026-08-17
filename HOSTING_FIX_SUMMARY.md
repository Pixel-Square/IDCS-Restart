# IDCS Frontend & Backend Hosting Fix - Summary

## ✅ Issues Fixed

1. **JAPANESE-APP Tunnel Interference** - Stopped the conflicting JAPANESE-APP Cloudflare tunnel that was interfering with IDCS hosting
2. **Missing nginx configurations** - Created proper nginx configs for `idcs.zynix.us` (frontend) and `db.zynix.us` (backend)
3. **Disabled sites** - Enabled the nginx sites that were not active
4. **Tunnel misconfiguration** - Properly configured the Cloudflare tunnel to route hostnames to localhost:80
5. **Service reliability** - Created a systemd service to auto-start the tunnel on reboot

## 📋 What Was Changed

### 1. Nginx Configuration Files Created
- **[deploy/nginx_idcs_zynix.conf](deploy/nginx_idcs_zynix.conf)** - Frontend serving at idcs.zynix.us
  - Serves React app from `/home/iqac2/IDCS-Restart/frontend/build`
  - Proxies `/api/` to gunicorn backend
  - Proxies `/admin/` to Django admin
  - Serves static files from backend

- **[deploy/nginx_db_zynix.conf](deploy/nginx_db_zynix.conf)** - Backend API at db.zynix.us
  - Proxies all requests to gunicorn backend
  - Serves static and media files
  - Full 50M upload support

### 2. Nginx Sites Enabled
```
/etc/nginx/sites-enabled/
├── idcs.zynix.us → nginx_idcs_zynix.conf
├── db.zynix.us → nginx_db_zynix.conf
└── coe.zynix.us → (existing, unchanged)
```

### 3. Cloudflare Tunnel Configuration
- **File**: `/home/iqac2/.cloudflared/config.yml`
- **Tunnel ID**: 1cecf802-4574-4ea9-9979-acec7d92c106
- **Routes**:
  - `idcs.zynix.us` → localhost:80
  - `db.zynix.us` → localhost:80
  - `coe.zynix.us` → localhost:80

### 4. Systemd Service Created
- **File**: `/etc/systemd/system/cloudflared.service`
- **Status**: Enabled and running
- **Behavior**: Auto-restarts on failure, auto-starts on boot

### 5. Processes Stopped
- Stopped JAPANESE-APP tunnel (PID 191408)
- Stopped old root token-based tunnel (PID 259949)
- Only active: IDCS production tunnel (configured via systemd service)

## 🔧 Current Status

| Component | Status | Details |
|-----------|--------|---------|
| Frontend (idcs.zynix.us) | ✅ Running | HTTP 200, nginx serving React app |
| Backend API (db.zynix.us) | ✅ Running | Django backend responding |
| Gunicorn (Unix socket) | ✅ Running | 9 workers, 2 threads each |
| Nginx | ✅ Running | 16 worker processes |
| Cloudflare Tunnel | ✅ Running | 4 connections established |
| Systemd Service | ✅ Enabled | Auto-starts on boot |

## 🚀 Verification

Frontend test:
```bash
curl -I https://idcs.zynix.us
# Should return: HTTP 200 OK
```

Backend test:
```bash
curl https://db.zynix.us/api/
# Should return Django API response
```

## 📝 Important Notes

1. **NO other tunnels running** - Only the IDCS production tunnel is active
2. **JAPANESE-APP isolation** - The Japanese app tunnel was completely stopped and removed from active services
3. **Cloudflare rules** - Ensure in Cloudflare dashboard that:
   - idcs.zynix.us routes to this tunnel
   - db.zynix.us routes to this tunnel
   - coe.zynix.us routes to this tunnel

## 🔄 Maintenance Commands

### Check tunnel status:
```bash
sudo systemctl status cloudflared
```

### View tunnel logs:
```bash
sudo journalctl -u cloudflared -f
```

### Restart tunnel:
```bash
sudo systemctl restart cloudflared
```

### Verify nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Monitor processes:
```bash
ps aux | grep -E "(nginx|gunicorn|cloudflared)" | grep -v grep
```

## ⚠️ Troubleshooting

If `idcs.zynix.us` shows "Error 1033":
1. Check tunnel status: `sudo systemctl status cloudflared`
2. Check logs: `sudo journalctl -u cloudflared -n 50`
3. Verify config: `cat /home/iqac2/.cloudflared/config.yml`
4. Restart if needed: `sudo systemctl restart cloudflared`

If backend returns 502:
1. Check gunicorn: `ps aux | grep gunicorn`
2. Check socket: `ls -la /run/gunicorn/`
3. Check nginx config: `sudo nginx -t`
