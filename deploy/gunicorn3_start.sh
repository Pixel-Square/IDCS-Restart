#!/bin/bash
# Wrapper script for gunicorn3 — needed because systemd ExecStart
# cannot handle paths with spaces directly.

BACKEND_DIR="/home/iqac/idcs 3.0/backend"
GUNICORN="/home/iqac/idcs 3.0/backend/.venv/bin/gunicorn"
ENV_FILE="/home/iqac/idcs 3.0/backend/.env"

# Load environment file
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

WORKERS="${GUNICORN_WORKERS:-5}"
THREADS="${GUNICORN_THREADS:-2}"
TIMEOUT="${GUNICORN_TIMEOUT:-300}"
GRACEFUL="${GUNICORN_GRACEFUL_TIMEOUT:-30}"
KEEPALIVE="${GUNICORN_KEEPALIVE:-5}"
MAX_REQS="${GUNICORN_MAX_REQUESTS:-1500}"
MAX_JITTER="${GUNICORN_MAX_REQUESTS_JITTER:-150}"

cd "$BACKEND_DIR"

exec "$GUNICORN" \
  --worker-class gthread \
  --workers "$WORKERS" \
  --threads "$THREADS" \
  --timeout "$TIMEOUT" \
  --graceful-timeout "$GRACEFUL" \
  --keep-alive "$KEEPALIVE" \
  --max-requests "$MAX_REQS" \
  --max-requests-jitter "$MAX_JITTER" \
  --worker-tmp-dir /dev/shm \
  --bind unix:/run/gunicorn3/gunicorn3.sock \
  --access-logfile - \
  --error-logfile - \
  erp.wsgi:application
