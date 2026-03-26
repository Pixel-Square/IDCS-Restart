#!/usr/bin/env bash
# Helper to enable & start systemd instances for device IP:PORT pairs listed
# in the script arguments or read from backend/.env `ESSL_DEVICE_IPS`.

set -euo pipefail

if [ "$#" -gt 0 ]; then
  PAIRS=("$@")
else
  # Try to read from backend/.env
  ENV_FILE="$(pwd)/backend/.env"
  if [ -f "$ENV_FILE" ]; then
    # extract ESSL_DEVICE_IPS value (comma separated)
    ESSL_IPS=$(grep -E '^ESSL_DEVICE_IPS=' "$ENV_FILE" | sed -E "s/^ESSL_DEVICE_IPS=//" | tr -d '"') || true
    if [ -z "${ESSL_IPS:-}" ]; then
      echo "No ESSL_DEVICE_IPS found in $ENV_FILE and no args provided." 1>&2
      echo "Usage: $0 [ip:port ...]" 1>&2
      exit 2
    fi
    IFS=',' read -r -a PAIRS <<< "$ESSL_IPS"
  else
    echo "No args provided and backend/.env not found." 1>&2
    echo "Usage: $0 [ip:port ...]" 1>&2
    exit 2
  fi
fi

for pair in "${PAIRS[@]}"; do
  inst="${pair/:/_}"
  echo "Enabling and starting essl-sync@$inst.service (requires sudo)"
  sudo systemctl enable --now "essl-sync@${inst}.service"
done

echo "All requested units enabled/started. Use 'sudo systemctl status essl-sync@<inst>' to check." 
