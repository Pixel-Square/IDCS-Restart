#!/usr/bin/env bash
set -euo pipefail

# Installs periodic health checks in user crontab and prepares log rotation.
# Safe to re-run; it avoids duplicate cron entries.

ROOT_DIR="${ROOT_DIR:-/home/iqac/IDCS-Restart}"
CHECK_SCRIPT="${CHECK_SCRIPT:-$ROOT_DIR/tools/health_check.sh}"
CHECK_LOG="${CHECK_LOG:-$ROOT_DIR/check.txt}"
SCHEDULE="${SCHEDULE:-*/10 * * * *}"
CRON_TAG="# idcs-health-check"
LOGROTATE_TEMPLATE="${LOGROTATE_TEMPLATE:-$ROOT_DIR/deploy/logrotate_idcs_health.conf}"
INSTALL_LOGROTATE="${INSTALL_LOGROTATE:-0}"

if [[ ! -x "$CHECK_SCRIPT" ]]; then
  echo "health check script missing or not executable: $CHECK_SCRIPT"
  echo "run: chmod +x $CHECK_SCRIPT"
  exit 1
fi

touch "$CHECK_LOG"

cron_line="$SCHEDULE cd $ROOT_DIR && /bin/bash $CHECK_SCRIPT >> $CHECK_LOG 2>&1 $CRON_TAG"

existing_cron="$(crontab -l 2>/dev/null || true)"
if printf '%s\n' "$existing_cron" | grep -Fq "$CRON_TAG"; then
  echo "cron entry already present ($CRON_TAG), skipping add"
else
  {
    printf '%s\n' "$existing_cron" | sed '/^$/d'
    printf '%s\n' "$cron_line"
  } | crontab -
  echo "added cron entry: $cron_line"
fi

if [[ -f "$LOGROTATE_TEMPLATE" ]]; then
  echo "logrotate template found: $LOGROTATE_TEMPLATE"
else
  echo "logrotate template missing: $LOGROTATE_TEMPLATE"
  exit 1
fi

if [[ "$INSTALL_LOGROTATE" == "1" ]]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo cp "$LOGROTATE_TEMPLATE" /etc/logrotate.d/idcs-health-check
    sudo chmod 644 /etc/logrotate.d/idcs-health-check
    sudo logrotate -d /etc/logrotate.d/idcs-health-check >/dev/null
    echo "installed /etc/logrotate.d/idcs-health-check"
  else
    echo "sudo not found; cannot install logrotate config automatically"
    exit 1
  fi
else
  echo "logrotate install skipped (INSTALL_LOGROTATE=0)"
  echo "to install: INSTALL_LOGROTATE=1 bash tools/setup_health_monitoring.sh"
fi

echo "monitoring setup complete"
