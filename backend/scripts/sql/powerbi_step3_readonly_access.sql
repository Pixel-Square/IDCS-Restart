-- Step 3: Provision read-only database access for Power BI users.
-- Run this as a PostgreSQL admin user.
-- Replace the placeholder password before execution.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pbi_readonly') THEN
        CREATE ROLE pbi_readonly LOGIN PASSWORD 'CHANGE_THIS_STRONG_PASSWORD';
    ELSE
        ALTER ROLE pbi_readonly LOGIN PASSWORD 'CHANGE_THIS_STRONG_PASSWORD';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE college_erp TO pbi_readonly;

GRANT USAGE ON SCHEMA reporting TO pbi_readonly;

GRANT SELECT ON reporting.vw_marks_theory TO pbi_readonly;
GRANT SELECT ON reporting.vw_marks_tcpr_tcpl TO pbi_readonly;
GRANT SELECT ON reporting.vw_marks_project_lab TO pbi_readonly;

-- Prevent accidental access to other schemas.
REVOKE ALL ON SCHEMA public FROM pbi_readonly;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM pbi_readonly;

-- Optional: keep future reporting tables/views readable if added later.
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting GRANT SELECT ON TABLES TO pbi_readonly;
