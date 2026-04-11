#!/usr/bin/env bash
# One-liner setup: Check ESSL IPs + Start Backend + Start ESSL Sync
# Usage: source ./setup-and-run.sh

PROJECT_ROOT="/home/iqac/IDCS-Restart"
BACKEND_DIR="$PROJECT_ROOT/backend"
cd "$BACKEND_DIR" && source .venv/bin/activate

# Parse ESSL IPs
ESSL_IPS=$(grep ESSL_DEVICE_IPS .env | cut -d= -f2 | tr -d '"')
echo "ESSL Devices: $ESSL_IPS"

# Function to check if IP:port is reachable
check_device() {
  local IP_PORT=$1
  local IP="${IP_PORT%%:*}"
  local PORT="${IP_PORT##*:}"
  timeout 2 bash -c "echo >/dev/tcp/$IP/$PORT" 2>/dev/null && echo "✓ REACHABLE" || echo "✗ UNREACHABLE"
}

# Check all devices
echo "━━━ ESSL Device Connectivity Check ━━━"
for device in $(echo "$ESSL_IPS" | tr ',' ' '); do
  echo -n "$device: "
  check_device "$device"
done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start gunicorn
echo "Starting Gunicorn on http://localhost:8000"
python -m gunicorn --bind 0.0.0.0:8000 --workers 4 --timeout 120 erp.wsgi:application > /tmp/gunicorn.log 2>&1 &
GUNICORN_PID=$!
sleep 3
echo "✓ Gunicorn started (PID: $GUNICORN_PID)"

# Start ESSL sync for each device  
echo "Starting ESSL real-time sync for all devices..."
for device in $(echo "$ESSL_IPS" | tr ',' ' '); do
  IP="${device%%:*}"
  PORT="${device##*:}"
  python manage.py sync_essl_realtime --ip "$IP" --port "$PORT" > "/tmp/essl_${IP}.log" 2>&1 &
  echo "✓ Started sync for $IP:$PORT (PID: $!)"
done

echo ""
echo "All services running! View logs:"
echo "  • Gunicorn: tail -f /tmp/gunicorn.log"
echo "  • ESSL: tail -f /tmp/essl_*.log"
echo ""
echo "Press Ctrl+C in any terminal to stop processes"
