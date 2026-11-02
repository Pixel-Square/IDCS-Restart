#!/usr/bin/env bash
set -euo pipefail

# High-capacity Gunicorn deploy for large test attendance bursts.
# This script installs the tuned service file, reloads systemd, and restarts Gunicorn.

PROJECT_ROOT="/home/iqac/IDCS-MAIN"
SERVICE_SOURCE="$PROJECT_ROOT/deploy/gunicorn.service"
SERVICE_TARGET="/etc/systemd/system/gunicorn.service"

if [[ ! -f "$SERVICE_SOURCE" ]]; then
  echo "Missing service template: $SERVICE_SOURCE"
  exit 1
fi

if [[ ! -d "/home/iqac/IDCS-Restart/backend" ]]; then
  echo "Warning: backend directory not found at /home/iqac/IDCS-Restart/backend"
  echo "The service template expects that path. Please verify the deployment path before continuing."
fi

sudo install -o root -g root -m 0644 "$SERVICE_SOURCE" "$SERVICE_TARGET"

sudo systemctl daemon-reload
sudo systemctl enable gunicorn
sudo systemctl restart gunicorn
sudo systemctl status gunicorn --no-pager -l --lines=30

printf "\n--- workers ---\n"
ps -eo pid,ppid,comm --forest | grep -E "gunicorn|python" | grep -v grep || true

printf "\nDone. Gunicorn should now be running with the higher concurrency settings for large attendance loads.\n"
