#!/usr/bin/env bash
# Single command to check ESSL IPs and start all services (backend + ESSL devices)
# Usage: ./start-all-services.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
VENV_PY="$BACKEND_DIR/.venv/bin/python"
ENV_FILE="$BACKEND_DIR/.env"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# ──────────────────────────────────────────────────────────────────────
# 1. Check prerequisites
# ──────────────────────────────────────────────────────────────────────

log_info "Checking prerequisites..."

if [ ! -f "$ENV_FILE" ]; then
  log_error "Environment file not found: $ENV_FILE"
  exit 1
fi

if [ ! -x "$VENV_PY" ]; then
  log_error "Python virtualenv not found at: $VENV_PY"
  exit 1
fi

log_success "Prerequisites check passed"

# ──────────────────────────────────────────────────────────────────────
# 2. Parse ESSL IPs from environment
# ──────────────────────────────────────────────────────────────────────

log_info "Extracting ESSL device IPs from .env..."

ESSL_IPS=$(grep -E '^ESSL_DEVICE_IPS=' "$ENV_FILE" | sed -E "s/^ESSL_DEVICE_IPS=//" | tr -d '"' | tr -d ' ') || true

if [ -z "${ESSL_IPS:-}" ]; then
  log_warning "No ESSL_DEVICE_IPS found in $ENV_FILE"
  DEVICE_ARRAY=()
else
  IFS=',' read -r -a DEVICE_ARRAY <<< "$ESSL_IPS"
  log_success "Found ${#DEVICE_ARRAY[@]} ESSL devices"
fi

# ──────────────────────────────────────────────────────────────────────
# 3. Check ESSL IP reachability
# ──────────────────────────────────────────────────────────────────────

log_info ""
log_info "Testing ESSL device connectivity..."
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REACHABLE_DEVICES=()
UNREACHABLE_DEVICES=()
TIMEOUT_SECONDS=3

for device_pair in "${DEVICE_ARRAY[@]}"; do
  IP="${device_pair%%:*}"
  PORT="${device_pair##*:}"
  
  # Use timeout with bash's /dev/tcp to check connectivity
  if timeout $TIMEOUT_SECONDS bash -c "echo >/dev/tcp/$IP/$PORT" 2>/dev/null; then
    log_success "✓ $IP:$PORT - REACHABLE"
    REACHABLE_DEVICES+=("$device_pair")
  else
    log_warning "✗ $IP:$PORT - UNREACHABLE (check network/device)"
    UNREACHABLE_DEVICES+=("$device_pair")
  fi
done

log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Reachable devices: ${#REACHABLE_DEVICES[@]}/${#DEVICE_ARRAY[@]}"

if [ ${#UNREACHABLE_DEVICES[@]} -gt 0 ]; then
  log_warning "Unreachable devices:"
  for device in "${UNREACHABLE_DEVICES[@]}"; do
    echo -e "  ${RED}✗${NC} $device"
  done
fi

# ──────────────────────────────────────────────────────────────────────
# 4. Start Django Backend with Gunicorn
# ──────────────────────────────────────────────────────────────────────

log_info ""
log_info "Starting Django backend with Gunicorn..."

cd "$BACKEND_DIR"

# Check if gunicorn is installed
if ! "$VENV_PY" -c "import gunicorn" 2>/dev/null; then
  log_error "Gunicorn not installed. Install with: pip install gunicorn"
  exit 1
fi

# Kill any existing gunicorn process on port 8000
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  log_warning "Found existing process on port 8000, stopping..."
  sudo systemctl stop gunicorn 2>/dev/null || pkill -f "gunicorn.*idcs" || true
  sleep 2
fi

# Start gunicorn in the background
log_info "Starting Gunicorn on http://0.0.0.0:8000"
"$VENV_PY" -m gunicorn \
  --bind 0.0.0.0:8000 \
  --workers 4 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile - \
  erp.wsgi:application &

GUNICORN_PID=$!
sleep 3

# Check if gunicorn started successfully
if kill -0 $GUNICORN_PID 2>/dev/null; then
  log_success "✓ Gunicorn started (PID: $GUNICORN_PID)"
else
  log_error "✗ Failed to start Gunicorn"
  exit 1
fi

# ──────────────────────────────────────────────────────────────────────
# 5. Start ESSL Real-time Sync for reachable devices
# ──────────────────────────────────────────────────────────────────────

if [ ${#REACHABLE_DEVICES[@]} -gt 0 ]; then
  log_info ""
  log_info "Starting ESSL real-time sync for reachable devices..."
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  for device_pair in "${REACHABLE_DEVICES[@]}"; do
    IP="${device_pair%%:*}"
    PORT="${device_pair##*:}"
    
    log_info "Starting sync for $IP:$PORT..."
    
    # Start the sync command in the background
    "$VENV_PY" manage.py sync_essl_realtime --ip "$IP" --port "$PORT" > "/tmp/essl_${IP}_${PORT}.log" 2>&1 &
    
    SYNC_PID=$!
    sleep 1
    
    if kill -0 $SYNC_PID 2>/dev/null; then
      log_success "✓ ESSL sync started for $IP:$PORT (PID: $SYNC_PID)"
    else
      log_error "✗ Failed to start ESSL sync for $IP:$PORT"
    fi
  done
else
  log_warning "No reachable ESSL devices found. Backend started but no device listeners active."
fi

log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ──────────────────────────────────────────────────────────────────────
# 6. Display summary
# ──────────────────────────────────────────────────────────────────────

log_info ""
log_success "╔════════════════════════════════════════════════════════════╗"
log_success "║ ALL SERVICES STARTED SUCCESSFULLY                          ║"
log_success "╚════════════════════════════════════════════════════════════╝"
log_info ""
log_info "Active Services:"
log_info "  • Backend API: http://localhost:8000"
if [ ${#REACHABLE_DEVICES[@]} -gt 0 ]; then
  log_info "  • ESSL Devices: ${#REACHABLE_DEVICES[@]} device(s) syncing in real-time"
fi
log_info ""
log_info "Logs:"
log_info "  • Gunicorn: journalctl -u gunicorn OR check terminal"
if [ ${#REACHABLE_DEVICES[@]} -gt 0 ]; then
  log_info "  • ESSL Sync: tail -f /tmp/essl_*.log"
fi
log_info ""
log_info "To check ESSL device status:"
log_info "  systemctl status essl-sync@*"
log_info ""
log_info "To stop all services:"
log_info "  kill $GUNICORN_PID"
log_info ""

# Keep script alive to maintain processes
log_info "Press Ctrl+C to stop all services..."
trap 'log_info "Shutting down..."; pkill -P $$ || true; exit 0' SIGINT SIGTERM

while true; do
  sleep 1
done
