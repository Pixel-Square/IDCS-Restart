#!/usr/bin/env bash
#
# PostgreSQL backup for IDCS.
#
# Reads DB_* / PGPASSWORD from backend/.env when present, then runs pg_dump
# into a timestamped custom-format archive, verifies it, applies retention,
# and optionally pushes a copy off-site.
#
# Usage:
#   tools/backup_db.sh [backup_dir] [retention_days]
#
# Environment overrides:
#   DB_NAME, DB_USER, DB_PASS, DB_HOST, DB_PORT
#   OFFSITE_RSYNC_TARGET   e.g. "user@host:/backups/idcs/"  (optional)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
ENV_FILE="$BACKEND_DIR/.env"

# Load DB credentials from the backend env file (values with no spaces).
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
RETENTION_DAYS="${2:-14}"
mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d_%H%M%S)"
FILENAME="idcs_${DB_NAME}_${TS}.dump"
OUT="$BACKUP_DIR/$FILENAME"

echo "[backup] dumping ${DB_NAME} -> ${OUT}"
pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --no-owner \
    --verbose \
    -f "$OUT"

# Verify the archive is readable before trusting it.
pg_restore --list "$OUT" > /dev/null
echo "[backup] archive verified: $OUT"

# Off-site copy (optional).
if [[ -n "${OFFSITE_RSYNC_TARGET:-}" ]]; then
    echo "[backup] syncing off-site -> ${OFFSITE_RSYNC_TARGET}"
    rsync -az "$OUT" "$OFFSITE_RSYNC_TARGET"
fi

# Retention: keep only the newest N days of local backups.
find "$BACKUP_DIR" -maxdepth 1 -name 'idcs_*.dump' -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] done"
