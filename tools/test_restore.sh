#!/usr/bin/env bash
#
# Verify that the most recent backup restores cleanly into a throwaway
# database. Use this on a schedule so "we have backups" is actually tested.
#
# Usage:
#   tools/test_restore.sh [backup_dir]
#
# Environment overrides:
#   DB_NAME, DB_USER, DB_PASS, DB_HOST, DB_PORT, TEST_DB
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

DB_NAME="${DB_NAME:-idcs}"
DB_USER="${DB_USER:-iqac}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
export PGPASSWORD="${PGPASSWORD:-${DB_PASS:-}}"

BACKUP_DIR="${1:-$REPO_ROOT/backups}"
TEST_DB="${TEST_DB:-${DB_NAME}_restore_test}"

LATEST="$(find "$BACKUP_DIR" -maxdepth 1 -name 'idcs_*.dump' -print | sort | tail -n 1)"
if [[ -z "$LATEST" ]]; then
    echo "no backup found in $BACKUP_DIR" >&2
    exit 1
fi

echo "[test-restore] testing restore of ${LATEST} into ${TEST_DB}"

createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB" 2>/dev/null || true

cleanup() {
    dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$TEST_DB" \
    --no-owner \
    --exit-on-error \
    "$LATEST"

TABLE_COUNT="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"

echo "[test-restore] OK: restored ${TABLE_COUNT} tables from ${LATEST}"
