# Power BI Step 2 - Reporting App (API + Admin)

Step 2 introduces a dedicated Django app: `reporting`.

## Setup command

Run:

```bash
python3 manage.py migrate reporting
```

This does two things:

- Creates/updates reporting SQL views from the Step 1 SQL script via migration.
- Seeds custom permission code `reporting.view_powerbi_data` in `accounts_permission`.

## Separate reporting portal (no admin model access)

You can use a standalone reporting-only login at:

- `/reporting-portal/login/`

This portal is independent of Django admin and gives only reporting CSV export access.

Configure portal users in `backend/.env` and restart gunicorn:

```env
# Multiple users (recommended)
REPORTING_PORTAL_USERS=bi_user1:StrongPass1,bi_user2:StrongPass2

# Optional single-user fallback
REPORTING_PORTAL_USERNAME=bi_user
REPORTING_PORTAL_PASSWORD=StrongPass
```

Portal routes:

- `/reporting-portal/login/`
- `/reporting-portal/home/`
- `/reporting-portal/export/theory/`
- `/reporting-portal/export/tcpr-tcpl/`
- `/reporting-portal/export/project-lab/`

## What was added

- API routes:
  - `/api/reporting/marks/theory/`
  - `/api/reporting/marks/tcpr-tcpl/`
  - `/api/reporting/marks/project-lab/`
- Admin routes:
  - `/admin/reporting/powerbi/`
  - CSV export links for all three formats
- Permission gate:
  - Superuser OR custom permission code `reporting.view_powerbi_data`

## API usage

Authentication:
- JWT token (same auth pattern as existing APIs)

Optional query filters:
- `year`, `sem`, `dept`, `sec`, `course_type`, `course_code`, `course_category`

Output options:
- JSON (default)
- CSV with `?format=csv`

Pagination params:
- `page` (default 1)
- `page_size` (default 500, capped server-side)

Example:

```bash
curl -H "Authorization: Bearer <JWT>" \
  "https://<host>/api/reporting/marks/theory/?year=2023&dept=CSE&page=1&page_size=1000"
```

CSV example:

```bash
curl -L -H "Authorization: Bearer <JWT>" \
  "https://<host>/api/reporting/marks/theory/?format=csv&year=2023" \
  -o theory.csv
```

## Admin usage

Open:
- `/admin/reporting/powerbi/`

Actions:
- Apply optional filters
- Download CSV for Theory / TCPR-TCPL / Project-Lab

## Note about permissions

If non-superuser staff must access reporting endpoints/pages, assign this permission code through your role-permission mapping:

- `reporting.view_powerbi_data`

and assign it to the relevant role(s).
