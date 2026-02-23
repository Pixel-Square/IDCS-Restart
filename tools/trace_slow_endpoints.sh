#!/usr/bin/env bash
set -euo pipefail

echo "== Slow request tracing (last 30 min) =="
echo

echo "[1] Gunicorn errors/timeouts"
journalctl -u gunicorn --since "30 min ago" --no-pager | grep -E "WORKER TIMEOUT|Traceback|ERROR|CRITICAL" || true

echo
echo "[2] Django slow-request warnings (from SlowRequestLoggingMiddleware)"
journalctl -u gunicorn --since "30 min ago" --no-pager | grep "SLOW_REQUEST" || true

echo
echo "[3] Nginx upstream failures (502/504)"
if [[ -f /var/log/nginx/error.log ]]; then
  sudo tail -n 5000 /var/log/nginx/error.log | grep -E "upstream timed out|connect\(\) to unix:/run/gunicorn.sock failed|502|504" || true
else
  echo "nginx error log not found at /var/log/nginx/error.log"
fi

echo
echo "[4] Top slow paths from gunicorn logs (SLOW_REQUEST)"
journalctl -u gunicorn --since "30 min ago" --no-pager \
  | grep "SLOW_REQUEST" \
  | sed -E 's/.*path=([^ ]+).*/\1/' \
  | sort | uniq -c | sort -nr | head -20 || true

echo
echo "Done. If SLOW_REQUEST is empty, ensure backend was restarted after middleware deployment."
