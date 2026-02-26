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
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Notes:
- The backend `AUTH_USER_MODEL` is `accounts.User` and includes a `role` FK. Role mappings are in `RoleMap`.
- The frontend uses `VITE_API_BASE` as the backend API base. If not set, it defaults to same-origin (and uses `http://localhost:8000` when running on localhost).
    - For Vite dev setups where Django runs on another port, either set `VITE_API_BASE` or use the Vite `/api` proxy (see `frontend/vite.config.ts`, configurable via `VITE_DEV_API_PROXY_TARGET`).