# IDCS Frontend & Backend Hosting Fix - Summary

## ✅ Issues Fixed

1. **JAPANESE-APP Tunnel Interference** - Stopped the conflicting JAPANESE-APP Cloudflare tunnel that was interfering with IDCS hosting
2. **Missing nginx configurations** - Created proper nginx configs for `idcs.krgi.co.in` (frontend) and `db.krgi.co.in` (backend)
3. **Disabled sites** - Enabled the nginx sites that were not active
4. **Tunnel misconfiguration** - Properly configured the Cloudflare tunnel to route hostnames to localhost:80
5. **Service reliability** - Created a systemd service to auto-start the tunnel on reboot

## 📋 What Was Changed

### 1. Nginx Configuration Files Created
- **[deploy/idcs.krgi.co.in.conf](deploy/idcs.krgi.co.in.conf)** - Frontend serving at idcs.krgi.co.in
  - Serves React app from `/home/iqac2/IDCS-Restart/frontend/build`
  - Proxies `/api/` to gunicorn backend
  - Proxies `/admin/` to Django admin
  - Serves static files from backend

- **[deploy/db.krgi.co.in.conf](deploy/db.krgi.co.in.conf)** - Backend API at db.krgi.co.in
  - Proxies all requests to gunicorn backend
  - Serves static and media files
  - Full 50M upload support

### 2. Nginx Sites Enabled
```
/etc/nginx/sites-enabled/
├── idcs.krgi.co.in → idcs.krgi.co.in.conf
├── db.krgi.co.in → db.krgi.co.in.conf
└── coe.krgi.co.in → (existing, unchanged)
```

### 3. Cloudflare Tunnel Configuration
- **File**: `/home/iqac2/.cloudflared/config.yml`
- **Tunnel ID**: 1cecf802-4574-4ea9-9979-acec7d92c106
- **Routes**:
  - `idcs.krgi.co.in` → localhost:80
  - `db.krgi.co.in` → localhost:80
  - `coe.krgi.co.in` → localhost:80

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
| Frontend (idcs.krgi.co.in) | ✅ Running | HTTP 200, nginx serving React app |
| Backend API (db.krgi.co.in) | ✅ Running | Django backend responding |
| Gunicorn (Unix socket) | ✅ Running | 9 workers, 2 threads each |
| Nginx | ✅ Running | 16 worker processes |
| Cloudflare Tunnel | ✅ Running | 4 connections established |
| Systemd Service | ✅ Enabled | Auto-starts on boot |

## 🚀 Verification

Frontend test:
```bash
curl -I https://idcs.krgi.co.in
# Should return: HTTP 200 OK
```

Backend test:
```bash
curl https://db.krgi.co.in/api/
# Should return Django API response
```

## 📝 Important Notes

1. **NO other tunnels running** - Only the IDCS production tunnel is active
2. **JAPANESE-APP isolation** - The Japanese app tunnel was completely stopped and removed from active services
3. **Cloudflare rules** - Ensure in Cloudflare dashboard that:
   - idcs.krgi.co.in routes to this tunnel
   - db.krgi.co.in routes to this tunnel
   - coe.krgi.co.in routes to this tunnel

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

If `idcs.krgi.co.in` shows "Error 1033":
1. Check tunnel status: `sudo systemctl status cloudflared`
2. Check logs: `sudo journalctl -u cloudflared -n 50`
3. Verify config: `cat /home/iqac2/.cloudflared/config.yml`
4. Restart if needed: `sudo systemctl restart cloudflared`

If backend returns 502:
1. Check gunicorn: `ps aux | grep gunicorn`
2. Check socket: `ls -la /run/gunicorn/`
3. Check nginx config: `sudo nginx -t`
