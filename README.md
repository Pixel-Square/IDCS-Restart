# College ERP Base (Modular Monolith)

This workspace contains a minimal starter for a college ERP login system:

- Backend: Django + Django REST Framework using JWT (djangorestframework-simplejwt). A modular `accounts` app contains `User`, `Role`, and `RoleMap` models.
- Frontend: React + TypeScript (Vite). Simple login page stores JWT in localStorage and calls a protected `me` endpoint.
- Supabase SQL: `supabase_init.sql` contains minimal schema for `roles` and `role_maps`.

Quick start:

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.sample .env
# configure DATABASE_URL or DB_* for Supabase/postgres
python manage.py makemigrations
python manage.py migrate  # ✓ Automatically loads 10 default templates
python manage.py createsuperuser
python manage.py runserver
```

**Note:** Running `migrate` automatically creates 10 default request templates (5 normal + 5 SPL) with complete configurations. See [docs/DEFAULT_TEMPLATES_SETUP.md](docs/DEFAULT_TEMPLATES_SETUP.md) for details.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Default Request Templates

The system includes **10 pre-configured request templates** that are automatically loaded during migration:

### For Regular Staff
- Casual Leave (12 days/year)
- Compensatory Leave (COL)
- Late Entry Permission
- ON Duty
- Others

### For Administrative Roles (SPL)
- Casual Leave - SPL
- Compensatory Leave - SPL
- Late Entry Permission - SPL
- ON Duty - SPL
- Others - SPL

**Features:**
- Complete form schemas with all fields
- Approval workflows (HOD → HR for normal, PRINCIPAL for SPL)
- Leave policies with allocations
- Attendance actions (auto-update attendance records)
- Role-based permissions
- **Fully editable by HR** through Django admin

For detailed documentation, see [docs/DEFAULT_TEMPLATES_SETUP.md](docs/DEFAULT_TEMPLATES_SETUP.md)

Notes:
- The backend `AUTH_USER_MODEL` is `accounts.User` and includes a `role` FK. Role mappings are in `RoleMap`.
- The frontend uses `VITE_API_BASE` as the backend API base. If not set, it defaults to same-origin (and uses `http://localhost:8000` when running on localhost).
    - For Vite dev setups where Django runs on another port, either set `VITE_API_BASE` or use the Vite `/api` proxy (see `frontend/vite.config.ts`, configurable via `VITE_DEV_API_PROXY_TARGET`).

Operations:
- Health check script: `tools/health_check.sh`
- Monitoring setup helper: `tools/setup_health_monitoring.sh`
- Logrotate template: `deploy/logrotate_idcs_health.conf`
- Production runbook: `docs/PRODUCTION_OBSERVABILITY_RUNBOOK.md`
- Slow endpoint tracing: `tools/trace_slow_endpoints.sh`