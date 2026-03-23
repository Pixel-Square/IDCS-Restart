# Power BI Step 1 Execution (Direct DB Views)

This is the executable runbook for Step 1: prepare BI-ready datasets in PostgreSQL for direct Power BI access.

## 1) Apply setup (preferred: Django migration)

Run this from backend root:

```bash
python3 manage.py migrate reporting
```

This migration applies the SQL from:

- `backend/scripts/sql/powerbi_step1_reporting_views.sql`

Alternative (manual DBA path):

```bash
cd /home/iqac/IDCS-Restart
psql -h <DB_HOST> -p <DB_PORT> -U <DB_ADMIN_USER> -d college_erp -f backend/scripts/sql/powerbi_step1_reporting_views.sql
```

## 2) Sanity checks (must pass)

```sql
SELECT COUNT(*) FROM reporting.vw_marks_theory;
SELECT COUNT(*) FROM reporting.vw_marks_tcpr_tcpl;
SELECT COUNT(*) FROM reporting.vw_marks_project_lab;
```

```sql
SELECT * FROM reporting.vw_marks_theory LIMIT 5;
SELECT * FROM reporting.vw_marks_tcpr_tcpl LIMIT 5;
SELECT * FROM reporting.vw_marks_project_lab LIMIT 5;
```

## 3) Create Power BI read-only DB user

```sql
CREATE ROLE pbi_readonly LOGIN PASSWORD '<STRONG_PASSWORD>';

GRANT CONNECT ON DATABASE college_erp TO pbi_readonly;
GRANT USAGE ON SCHEMA reporting TO pbi_readonly;

GRANT SELECT ON reporting.vw_marks_theory TO pbi_readonly;
GRANT SELECT ON reporting.vw_marks_tcpr_tcpl TO pbi_readonly;
GRANT SELECT ON reporting.vw_marks_project_lab TO pbi_readonly;

REVOKE ALL ON SCHEMA public FROM pbi_readonly;
```

## 4) Connection details to share with Power BI users

- Host: database host/IP reachable from user machine
- Port: DB port (current env indicates 6432)
- Database: `college_erp`
- Username: `pbi_readonly`
- Tables/Views to select:
  - `reporting.vw_marks_theory`
  - `reporting.vw_marks_tcpr_tcpl`
  - `reporting.vw_marks_project_lab`

## 5) Known behavior in v1 views

- `reg no (last 12 digit)` is normalized to last 12 digits from `reg_no`.
- `ese` is currently `NULL` because no dedicated ESE table is mapped yet.
- `before cqi` uses pre-CQI derived internal score.
- `after cqi` uses published CQI values from `obe_cqi_published`.
- If a course has partial data entry, missing mark fields resolve to `0` or `NULL` as applicable.

## 6) Rollback (if needed)

```sql
DROP VIEW IF EXISTS reporting.vw_marks_project_lab CASCADE;
DROP VIEW IF EXISTS reporting.vw_marks_tcpr_tcpl CASCADE;
DROP VIEW IF EXISTS reporting.vw_marks_theory CASCADE;
```
