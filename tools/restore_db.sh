#!/usr/bin/env bash
#
# Restore a PostgreSQL backup into the IDCS database.
#
# DESTRUCTIVE: uses --clean --if-exists, so it drops existing objects first.
# Refuses to run unless you explicitly pass --force (or set FORCE_RESTORE=1).
#
# Usage:
#   tools/restore_db.sh <dump_file> [--force]
#
# Environment overrides:
#   DB_NAME, DB_USER, DB_PASS, DB_HOST, DB_PORT
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
ENV_FILE="$BACKEND_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

DUMP_FILE="${1:-}"
FORCE="${2:-}"

if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
    echo "usage: tools/restore_db.sh <dump_file> [--force]" >&2
    exit 1
fi

if [[ "$FORCE" != "--force" && "${FORCE_RESTORE:-0}" != "1" ]]; then
    echo "refusing to restore: this drops existing objects." >&2
    echo "re-run with: tools/restore_db.sh '$DUMP_FILE' --force" >&2
    exit 2
fi

DB_NAME="${DB_NAME:-idcs}"
DB_USER="${DB_USER:-iqac}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
export PGPASSWORD="${PGPASSWORD:-${DB_PASS:-}}"

echo "[restore] restoring ${DUMP_FILE} -> ${DB_HOST}:${DB_PORT}/${DB_NAME}"
pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --clean \
    --if-exists \
    --no-owner \
    --exit-on-error \
    --verbose \
    "$DUMP_FILE"

echo "[restore] done"
