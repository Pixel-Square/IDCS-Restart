# Power BI Step 3 - Direct DB Connection Implementation

This step switches the BI team from Excel-based source files to direct PostgreSQL views while preserving the same final column format.

## 1) Provision read-only DB login for BI team

Run:

python3 manage.py migrate reporting

Then execute SQL script as DB admin:

/home/iqac/IDCS-Restart/backend/scripts/sql/powerbi_step3_readonly_access.sql

Important:
- Change the placeholder password in the script before execution.
- Share credentials only with BI owners.

## 2) Verify DB user access

Login as pbi_readonly and run:

SELECT COUNT(*) FROM reporting.vw_marks_theory;
SELECT COUNT(*) FROM reporting.vw_marks_tcpr_tcpl;
SELECT COUNT(*) FROM reporting.vw_marks_project_lab;

Expected:
- Queries succeed on reporting schema.
- Access to public/application tables should be denied.

## 3) Connect Power BI Desktop to direct DB

In Power BI Desktop:
1. Get Data -> PostgreSQL database.
2. Server: db.krgi.co.in:5432 (direct PostgreSQL)
3. Database: college_erp
4. Authentication: Database username/password.
5. Username: pbi_readonly
6. Select these objects:
   - reporting.vw_marks_theory
   - reporting.vw_marks_tcpr_tcpl
   - reporting.vw_marks_project_lab

Note:
- Use port 5432 for direct PostgreSQL connections in this setup.
- If PgBouncer userlist is not updated, `password authentication failed` can happen even when PostgreSQL role/password is correct.

## 4) Migrate existing Excel-based PBIX with minimal break

If dashboard currently uses Excel tables:
1. Open Transform Data.
2. Duplicate existing Excel queries as backup.
3. Add new PostgreSQL queries from reporting views.
4. Rename new queries to old table names used in visuals (or rebind model relations).
5. Ensure column names match exactly with existing measures.
6. Refresh and validate visuals.

## 5) Validation checklist before go-live

1. Row counts by year/department match old Excel source outputs.
2. Internal, before cqi, after cqi parity checks pass for sample classes.
3. Reg no is correctly last 12 digits.
4. Exports from reporting portal and Power BI imported data are consistent.
5. Refresh test completes without credential errors.

## 6) Operating model

- Daily refresh in Power BI (or manual refresh if Desktop-only workflow).
- SQL/view changes happen only through reporting migration process.
- Do not connect BI users to transactional schemas.
