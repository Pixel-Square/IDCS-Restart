# RESTORE INSTRUCTIONS — IDCS Production Database on `iqac`

> **Date exported:** 2026-10-14 18:24 IST from `iqac2`  
> **Dump format:** PostgreSQL Custom (`-Fc`)  
> **DB engine required:** PostgreSQL ≥ 16 (dump was produced by PG 18.3)

---

## Prerequisites

1. **PostgreSQL 18.x** installed on `iqac` (recommended: match source version to avoid incompatibilities).
   If only PG 16/17 is available, test a dry-run restore first.

2. **`pg_restore`** in `PATH` — same major version as target PostgreSQL.

3. **Required roles** must be created **before** running the restore.  
   See [database-info.txt](./database-info.txt) for the full list.

4. **`college_erp` database** must not already exist on the target,  
   *or* you must be prepared to drop it (all data loss on target).

---

## Step 1 — Verify the dump file

```bash
# Confirm checksum matches exactly
sha256sum idcs-production.dump
# Expected: 93108c18fc603f03cda32f9bd2399576a0d1dc0372ac77e6c61d36c94deaef41

# Confirm dump header is readable
pg_restore --list idcs-production.dump | head -15
```

---

## Step 2 — Create required roles on `iqac`

Connect as a superuser (e.g., `sudo -u postgres psql`) and run:

```sql
-- Adjust passwords via secure channel — never hard-code here
CREATE ROLE erp_user       WITH LOGIN PASSWORD 'CHANGE_ME';
CREATE ROLE inoutx_user    WITH LOGIN PASSWORD 'CHANGE_ME';
CREATE ROLE pbi_readonly   WITH LOGIN PASSWORD 'CHANGE_ME';
CREATE ROLE powerbi_user   WITH LOGIN PASSWORD 'CHANGE_ME';
CREATE ROLE rohit          WITH LOGIN PASSWORD 'CHANGE_ME';
-- postgres superuser should already exist
```

---

## Step 3 — Create the target database

```bash
sudo -u postgres createdb -O postgres -E UTF8 college_erp
```

---

## Step 4 — Restore the dump

```bash
# Full restore (schema + data, all schemas)
sudo -u postgres pg_restore \
  --host=localhost \
  --port=5432 \
  --dbname=college_erp \
  --no-password \
  --no-owner \
  --role=postgres \
  --verbose \
  /path/to/idcs-production.dump \
  2>&1 | tee /tmp/idcs-restore.log

# Check for errors
grep -i "error\|fatal" /tmp/idcs-restore.log
```

> **`--no-owner`** is recommended when the `postgres` role on `iqac` differs.  
> Remove it only if all roles from Step 2 are already in place and you want exact ownership preserved.

---

## Step 5 — Verify the restore

```bash
sudo -u postgres psql -d college_erp -c "
  SELECT schemaname, count(*) AS tables
  FROM pg_stat_user_tables
  GROUP BY schemaname;
"
# Expected: public = 305 tables, reporting = (functions only)

sudo -u postgres psql -d college_erp -c "
  SELECT pg_size_pretty(pg_database_size('college_erp'));
"
# Expected: ~127 MB (uncompressed)
```

---

## Step 6 — Grant application permissions

If `erp_user` is the Django DB user on `iqac` (recommended over `postgres`):

```sql
GRANT CONNECT ON DATABASE college_erp TO erp_user;
GRANT USAGE ON SCHEMA public TO erp_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO erp_user;
```

---

## Step 7 — Update Django `.env` on `iqac`

```ini
DB_NAME=college_erp
DB_USER=erp_user       # or postgres — match what you created
DB_PASS=<secret>       # transfer via secure channel
DB_HOST=localhost
DB_PORT=5432
```

Then run Django migrations check (should report no pending migrations):

```bash
cd /path/to/idcs-mt/backend
source .venv/bin/activate
python manage.py migrate --check
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `role "postgres" does not exist` | Create postgres superuser: `createuser -s postgres` |
| `role "erp_user" does not exist` | Run Step 2 |
| Extension errors | Only `plpgsql` is required — it is built-in |
| Permission denied on sequences | Run the `ALTER DEFAULT PRIVILEGES` commands in Step 6 |
| Version mismatch warning | Use `pg_restore` from PG 18; or re-dump from `iqac2` with the target's `pg_dump` |
