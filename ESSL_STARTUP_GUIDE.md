# IDCS Backend + ESSL Devices - Complete Startup Guide

## ✅ Status: All ESSL Devices are REACHABLE

ESSL Device Connectivity:
```
✓ 192.168.81.80:4370  - REACHABLE
✓ 192.168.81.87:4370  - REACHABLE
✓ 192.168.81.95:4370  - REACHABLE
✓ 192.168.81.81:4370  - REACHABLE
✓ 192.168.81.96:4370  - REACHABLE
```

---

## 🚀 SINGLE COMMAND TO RUN EVERYTHING

### Option 1: Using the automated startup script (Recommended)
```bash
/home/iqac/IDCS-Restart/start-all-services.sh
```

### Option 2: Quick one-liner command
```bash
cd /home/iqac/IDCS-Restart/backend && \
source .venv/bin/activate && \
python -m gunicorn --bind 0.0.0.0:8000 --workers 4 --timeout 120 erp.wsgi:application &
for ip_port in 192.168.81.80:4370 192.168.81.87:4370 192.168.81.95:4370 192.168.81.81:4370 192.168.81.96:4370; do
  python manage.py sync_essl_realtime --ip ${ip_port%:*} --port ${ip_port#*:} &
done
echo "All services started! Check logs and press Ctrl+C to stop."
wait
```

### Option 3: Using systemd services (Production)
```bash
# Copy service files and enable them
sudo cp /home/iqac/IDCS-Restart/deploy/essl_realtime.service /etc/systemd/system/

# Start the ESSL realtime service
sudo systemctl daemon-reload
sudo systemctl enable essl_realtime
sudo systemctl start essl_realtime

# Start gunicorn
sudo systemctl restart gunicorn
```

---

## 📊 What Each Command Does

### 1. Backend (Gunicorn)
**Command:**
```bash
cd /home/iqac/IDCS-Restart/backend && \
source .venv/bin/activate && \
python -m gunicorn --bind 0.0.0.0:8000 --workers 4 --timeout 120 erp.wsgi:application
```
- Starts Django REST API on **http://localhost:8000**
- 4 worker processes for handling requests
- 120-second timeout for long operations

### 2. ESSL Real-time Sync (All 5 Devices)
**Individual Command:**
```bash
python manage.py sync_essl_realtime --ip 192.168.81.80 --port 4370
```

**For All Devices:**
```bash
# Device 1
python manage.py sync_essl_realtime --ip 192.168.81.80 --port 4370 &

# Device 2
python manage.py sync_essl_realtime --ip 192.168.81.87 --port 4370 &

# Device 3
python manage.py sync_essl_realtime --ip 192.168.81.95 --port 4370 &

# Device 4
python manage.py sync_essl_realtime --ip 192.168.81.81 --port 4370 &

# Device 5
python manage.py sync_essl_realtime --ip 192.168.81.96 --port 4370 &
```

---

## 🔍 Health Checks

### Check Backend Status
```bash
curl -s http://localhost:8000/api/health/ | jq .
# or
curl http://localhost:8000/api/
```

### Check ESSL Sync Status
```bash
# View process status
ps aux | grep sync_essl_realtime

# View logs
tail -f /tmp/essl_*.log

# Monitor system processes
watch -n 1 'ps aux | grep -E "gunicorn|sync_essl"'
```

### Monitor Active ESSL Devices
```bash
netstat -tuln | grep 4370
# or
lsof -i :8000
```

---

## 🛑 Stopping Services

### Stop All Manually Started Services
```bash
# Kill all gunicorn processes
pkill -f gunicorn

# Kill all ESSL sync processes
pkill -f sync_essl_realtime
```

### Stop Systemd Services
```bash
sudo systemctl stop essl_realtime gunicorn
```

---

## 📝 Logs Location

- **Gunicorn**: 
  - Terminal output (if running in foreground)
  - `journalctl -u gunicorn -f` (if systemd)
  
- **ESSL Sync**:
  - Terminal output (if running in foreground)
  - Check individual device logs in `/tmp/essl_*.log`

---

## ⚙️ Environment Configuration

All settings are read from `/home/iqac/IDCS-Restart/backend/.env`:

```env
# ESSL Device Configuration
ESSL_DEVICE_IPS=192.168.81.80:4370,192.168.81.87:4370,192.168.81.95:4370,192.168.81.81:4370,192.168.81.96:4370
ESSL_DEVICE_PORT=4370
ESSL_DEVICE_PASSWORD=0
ESSL_CONNECT_TIMEOUT=8
ESSL_RECONNECT_DELAY=5

# Django Configuration
DEBUG=0
DB_HOST=localhost
DB_NAME=college_erp
DB_USER=erp_user
DB_PASS=erp_root
DB_PORT=6432
```

---

## 🚨 Troubleshooting

### Issue: ESSL devices show as unreachable
```bash
# 1. Check network connectivity
ping 192.168.81.80

# 2. Check if network interface is up
ip route show

# 3. Check firewall rules
sudo ufw status

# 4. Verify device configuration
grep ESSL backend/.env
```

### Issue: Gunicorn fails to start
```bash
# 1. Check if port 8000 is already in use
sudo lsof -i :8000

# 2. Kill existing process
sudo pkill -f "gunicorn"

# 3. Check for Python errors
python manage.py check

# 4. Run migrations
python manage.py migrate
```

### Issue: ESSL sync not connecting
```bash
# 1. Check device is running
ping 192.168.81.80

# 2. Check if port 4370 is open
nc -zv 192.168.81.80 4370

# 3. Verify pyzk library
python -c "from zk import ZK; print('pyzk installed')"

# 4. Check logs
tail -f /tmp/essl_192.168.81.80.log
```

---

## 🔄 Full Integration Test

```bash
#!/bin/bash
# Run this to test everything

PROJECT_ROOT="/home/iqac/IDCS-Restart"
cd "$PROJECT_ROOT/backend"

# Activate virtualenv
source .venv/bin/activate

# 1. Check connectivity
echo "=== Testing ESSL Device Connectivity ==="
for device in 192.168.81.80 192.168.81.87 192.168.81.95 192.168.81.81 192.168.81.96; do
  timeout 2 bash -c "echo >/dev/tcp/$device/4370" 2>/dev/null && \
    echo "✓ $device:4370 REACHABLE" || echo "✗ $device:4370 UNREACHABLE"
done

# 2. Check database
echo ""
echo "=== Testing Database Connection ==="
python manage.py migrate --check

# 3. Start services
echo ""
echo "=== Starting Services ==="
python -m gunicorn --bind 0.0.0.0:8000 --workers 4 erp.wsgi:application &
echo "Backend started on http://localhost:8000"

for ip in 192.168.81.80 192.168.81.87 192.168.81.95 192.168.81.81 192.168.81.96; do
  python manage.py sync_essl_realtime --ip "$ip" --port 4370 &
  echo "ESSL sync started for $ip:4370"
done

echo ""
echo "All services started! Press Ctrl+C to stop."
wait
```

---

## 📌 Quick Reference

| Service | Command | Port | Status |
|---------|---------|------|--------|
| Backend (Gunicorn) | `gunicorn erp.wsgi:application` | 8000 | ✅ Ready |
| ESSL Device 1 | `sync_essl_realtime --ip 192.168.81.80` | 4370 | ✅ Reachable |
| ESSL Device 2 | `sync_essl_realtime --ip 192.168.81.87` | 4370 | ✅ Reachable |
| ESSL Device 3 | `sync_essl_realtime --ip 192.168.81.95` | 4370 | ✅ Reachable |
| ESSL Device 4 | `sync_essl_realtime --ip 192.168.81.81` | 4370 | ✅ Reachable |
| ESSL Device 5 | `sync_essl_realtime --ip 192.168.81.96` | 4370 | ✅ Reachable |

---

## 🎯 Recommended Approach

**For Development:**
Use Option 1 (automated script) - it handles everything and provides colored output.

**For Production:**
Use Option 3 (systemd services) - they auto-restart and integrate with system monitoring.

**For Quick Testing:**
Use Option 2 (one-liner) - it's fast and shows everything in real-time.
