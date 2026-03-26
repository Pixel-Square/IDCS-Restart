#!/usr/bin/env bash
# Wrapper to run the Django management command `sync_essl_realtime` for one device
# Usage: essl-sync-wrapper <instance>
# Examples:
#   essl-sync-wrapper 192.168.81.80
#   essl-sync-wrapper 192.168.81.80_4370

set -euo pipefail

INSTANCE="$1"
if [ -z "${INSTANCE:-}" ]; then
  echo "Usage: $0 <instance>" 1>&2
  echo "Instance examples: 192.168.81.80  or 192.168.81.80_4370" 1>&2
  exit 2
fi

# parse ip and optional port
IP="${INSTANCE%%_*}"
PORT_PART="${INSTANCE#${IP}_}"
if [ "$PORT_PART" = "$IP" ]; then
  PORT="${ESSL_DEVICE_PORT:-4370}"
else
  PORT="$PORT_PART"
fi

# Adjust these paths if your deployment differs
# If the script was copied to /usr/local/bin, dirname "$0" won't be inside
# the repo. Use the repo path explicitly so systemd-launched wrapper finds
# the backend virtualenv reliably.
PROJECT_DIR="/home/iqac/IDCS-Restart/backend"
VENV_PY="$PROJECT_DIR/.venv/bin/python"

if [ ! -x "$VENV_PY" ]; then
  echo "Python executable not found at $VENV_PY" 1>&2
  echo "Ensure virtualenv is created at backend/.venv" 1>&2
  exit 3
fi

cd "$PROJECT_DIR"

# Export .env variables into the environment if backend/.env exists
if [ -f "$PROJECT_DIR/.env" ]; then
  # Safely parse .env WITHOUT sourcing to avoid executing malformed lines
  # Format assumed: KEY=VALUE (VALUE may contain colons/spaces). Lines starting
  # with # are ignored. This preserves spaces and special chars in values.
  while IFS= read -r line || [ -n "$line" ]; do
    # trim leading/trailing whitespace
    line="${line##+([[:space:]])}"
    line="${line%%+([[:space:]])}"
    # skip empty or commented lines
    case "$line" in
      ''|\#*) continue ;;
    esac
    # skip lines without '='
    if ! echo "$line" | grep -q '='; then
      continue
    fi
    key="${line%%=*}"
    val="${line#*=}"
    # trim spaces around key
    key="${key##+([[:space:]])}"
    key="${key%%+([[:space:]])}"
    # remove surrounding quotes from val if present
    if [ "${val#\"}" != "$val" ] && [ "${val%\"}" != "$val" ]; then
      val="${val#\"}"
      val="${val%\"}"
    elif [ "${val#\'}" != "$val" ] && [ "${val%\'}" != "$val" ]; then
      val="${val#\'}"
      val="${val%\'}"
    fi
    export "$key=$val"
  done < "$PROJECT_DIR/.env"
fi

exec "$VENV_PY" manage.py sync_essl_realtime --ip "$IP" --port "$PORT"
