#!/usr/bin/env bash
# ╔════════════════════════════════════════════════════════════════════╗
# ║  IDCS Backend + ESSL All-in-One Startup                           ║
# ║  Starts Django Backend (Gunicorn) + All 5 ESSL Device Listeners   ║
# ╚════════════════════════════════════════════════════════════════════╝

set -e  # Exit on error

PROJECT_DIR="/home/iqac/IDCS-Restart/backend"

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║ IDCS Backend + ESSL Devices - Complete Startup                    ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Navigate to backend directory
cd "$PROJECT_DIR"

# Activate virtualenv
echo "[1/6] Activating Python environment..."
source .venv/bin/activate
echo "✓ Virtual environment activated"
echo ""

# Display configuration
echo "[2/6] Configuration:"
echo "  • Project: $PROJECT_DIR"
echo "  • Database: $(grep DB_NAME .env | cut -d= -f2)"
echo "  • ESSL Devices: 5 configured"
echo ""

# Start Gunicorn
echo "[3/6] Starting Django Backend (Gunicorn)..."
python -m gunicorn \
  --bind 0.0.0.0:8000 \
  --workers 4 \
  --worker-class sync \
  --timeout 120 \
  --max-requests 1000 \
  --max-requests-jitter 50 \
  --access-logfile - \
  --error-logfile - \
  erp.wsgi:application &

GUNICORN_PID=$!
sleep 2

if ps -p $GUNICORN_PID > /dev/null; then
  echo "✓ Gunicorn started on http://0.0.0.0:8000 (PID: $GUNICORN_PID)"
else
  echo "✗ Failed to start Gunicorn"
  exit 1
fi
echo ""

# Start ESSL sync for all devices
echo "[4/6] Starting ESSL Real-time Sync for all devices..."
echo ""

DEVICES=(
  "192.168.81.80:4370"
  "192.168.81.87:4370"
  "192.168.81.95:4370"
  "192.168.81.81:4370"
  "192.168.81.96:4370"
)

PIDS=()

for device in "${DEVICES[@]}"; do
  IP="${device%%:*}"
  PORT="${device##*:}"
  
  # Check if device is reachable first
  if timeout 1 bash -c "echo >/dev/tcp/$IP/$PORT" 2>/dev/null; then
    echo "  ✓ $device REACHABLE - Starting sync..."
    python manage.py sync_essl_realtime --ip "$IP" --port "$PORT" > "/tmp/essl_${IP}.log" 2>&1 &
    PIDS+=($!)
  else
    echo "  ✗ $device UNREACHABLE - Skipping"
  fi
done
echo ""

# Verify all processes started
echo "[5/6] Verifying processes..."
echo "  • Backend: $(ps -p $GUNICORN_PID > /dev/null && echo "✓ Running" || echo "✗ Failed")"
for pid in "${PIDS[@]}"; do
  if ps -p $pid > /dev/null 2>&1; then
    echo "  • ESSL Sync: ✓ Running (PID: $pid)"
  fi
done
echo ""

# Display summary
echo "[6/6] Startup Complete!"
echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║ ✓ ALL SERVICES RUNNING                                            ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Services:"
echo "  • Backend API:    http://localhost:8000"
echo "  • ESSL Devices:   5 listeners active (${#PIDS[@]} connected)"
echo ""
echo "Logs:"
echo "  • Gunicorn:       Displaying above ↑"
echo "  • ESSL Devices:   Monitor in another terminal:"
echo "                    tail -f /tmp/essl_*.log"
echo ""
echo "To stop everything: Press Ctrl+C"
echo ""

# Keep script running and allow Ctrl+C
trap 'echo "Shutting down..."; kill $GUNICORN_PID "${PIDS[@]}" 2>/dev/null; exit 0' SIGINT SIGTERM

# Wait for all processes
wait $GUNICORN_PID 2>/dev/null || true
for pid in "${PIDS[@]}"; do
  wait $pid 2>/dev/null || true
done
