# 🚀 IDCS Backend + ESSL - Quick Start Commands

## ✅ ESSL Device Status - ALL DEVICES ONLINE

```
✓ 192.168.81.80:4370  - REACHABLE
✓ 192.168.81.87:4370  - REACHABLE
✓ 192.168.81.95:4370  - REACHABLE
✓ 192.168.81.81:4370  - REACHABLE
✓ 192.168.81.96:4370  - REACHABLE
```

---

## 🎯 THE SINGLE COMMAND YOU NEED

### Best Option: Run the all-in-one script
```bash
/home/iqac/IDCS-Restart/run-all.sh
```

This single command:
- ✅ Activates Python environment
- ✅ Starts Django backend on port 8000 (Gunicorn)
- ✅ Starts all 5 ESSL device listeners
- ✅ Displays real-time logs
- ✅ Handles graceful shutdown with Ctrl+C

---

## Alternative Commands

### Option A: Copy-paste one-liner (for quick testing)
```bash
cd /home/iqac/IDCS-Restart/backend && source .venv/bin/activate && python -m gunicorn --bind 0.0.0.0:8000 --workers 4 --timeout 120 erp.wsgi:application & sleep 2 && for ip in 192.168.81.80 192.168.81.87 192.168.81.95 192.168.81.81 192.168.81.96; do python manage.py sync_essl_realtime --ip "$ip" --port 4370 &done && echo "All services started! Monitor with: ps aux | grep -E 'gunicorn|sync_essl'" && wait
```

### Option B: Step-by-step commands
```bash
# Step 1: Navigate and activate environment
cd /home/iqac/IDCS-Restart/backend
source .venv/bin/activate

# Step 2: Start backend
python -m gunicorn --bind 0.0.0.0:8000 --workers 4 --timeout 120 erp.wsgi:application &

# Step 3: Start ESSL devices (each in separate terminal or in background)
python manage.py sync_essl_realtime --ip 192.168.81.80 --port 4370 &
python manage.py sync_essl_realtime --ip 192.168.81.87 --port 4370 &
python manage.py sync_essl_realtime --ip 192.168.81.95 --port 4370 &
python manage.py sync_essl_realtime --ip 192.168.81.81 --port 4370 &
python manage.py sync_essl_realtime --ip 192.168.81.96 --port 4370 &

# Step 4: Monitor
echo "All services running!"
```

### Option C: Using systemd (for production)
```bash
# Enable and start the service
sudo systemctl enable essl_realtime gunicorn
sudo systemctl restart essl_realtime gunicorn

# Check status
sudo systemctl status essl_realtime gunicorn
```

---

## ✅ Verify Services Are Running

```bash
# Check backend
curl -s http://localhost:8000/api/ | head

# Check all running processes
ps aux | grep -E "gunicorn|sync_essl" | grep -v grep

# Check port usage
netstat -tuln | grep -E "8000|4370"

# View ESSL sync logs
tail -f /tmp/essl_*.log
```

---

## 🛑 Stop All Services

### From the script (if running in foreground)
```bash
# Press Ctrl+C in the terminal
```

### Manual stop
```bash
# Kill all services
pkill -f gunicorn
pkill -f sync_essl_realtime

# Or using systemctl
sudo systemctl stop gunicorn essl_realtime
```

---

## 📊 Service Details

| Service | Port | Command | Status |
|---------|------|---------|--------|
| **Django Backend** | 8000 | Gunicorn | ✅ Ready |
| **ESSL Device 1** | 4370 | sync_essl_realtime | ✅ Reachable |
| **ESSL Device 2** | 4370 | sync_essl_realtime | ✅ Reachable |
| **ESSL Device 3** | 4370 | sync_essl_realtime | ✅ Reachable |
| **ESSL Device 4** | 4370 | sync_essl_realtime | ✅ Reachable |
| **ESSL Device 5** | 4370 | sync_essl_realtime | ✅ Reachable |

---

## 📝 What the Commands Do

### Gunicorn Start
```bash
python -m gunicorn \
  --bind 0.0.0.0:8000        # Listen on all interfaces, port 8000
  --workers 4                 # 4 worker processes
  --timeout 120              # 120-second timeout
  erp.wsgi:application       # Django WSGI app
```

### ESSL Sync Start
```bash
python manage.py sync_essl_realtime \
  --ip 192.168.81.80         # Device IP
  --port 4370                # Device port
```

---

## 🔍 Troubleshooting

### "Address already in use" error
```bash
# Kill existing process on port 8000
sudo fuser -k 8000/tcp

# Or find what's using it
lsof -i :8000
sudo kill -9 <PID>
```

### ESSL sync fails to connect
```bash
# Check if device is reachable
ping 192.168.81.80
nc -zv 192.168.81.80 4370

# Check if pyzk is installed
python -c "from zk import ZK; print('pyzk is installed')"

# View detailed logs
tail -n 50 /tmp/essl_192.168.81.80.log
```

### Backend returns 500 errors
```bash
# Check database migrations
python manage.py migrate

# Check logs
tail -f /var/log/gunicorn.log

# Run health check
python manage.py shell -c "from django.core.management import call_command; call_command('check')"
```

---

## 📂 File Locations

| Item | Location |
|------|----------|
| Startup Script | `/home/iqac/IDCS-Restart/run-all.sh` |
| Backend Code | `/home/iqac/IDCS-Restart/backend/` |
| Configuration | `/home/iqac/IDCS-Restart/backend/.env` |
| Virtual Env | `/home/iqac/IDCS-Restart/backend/.venv/` |
| ESSL Logs | `/tmp/essl_*.log` |
| Service Files | `/home/iqac/IDCS-Restart/deploy/` |

---

## 🎓 Learning More

For detailed information, see:
- Full guide: [ESSL_STARTUP_GUIDE.md](ESSL_STARTUP_GUIDE.md)
- ESSL integration docs: [docs/STAFF_ATTENDANCE_ESSL_REALTIME.md](docs/STAFF_ATTENDANCE_ESSL_REALTIME.md)
- Backend README: [backend/README.md](backend/README.md)

---

## ⚡ TL;DR - Just Run This

```bash
/home/iqac/IDCS-Restart/run-all.sh
```

Done! Everything will start and you'll see all the logs in real-time. Press Ctrl+C to stop.
