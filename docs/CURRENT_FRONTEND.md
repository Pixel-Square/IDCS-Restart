# Current Frontend — Quick Overview

This document captures the current frontend state, run/run-test instructions, key files, API integration points, and recommended next steps.

Tech stack
- Framework: React + TypeScript (Vite)
- Bundler/dev server: Vite
- Auth: JWT (SimpleJWT on backend) — tokens sent via `Authorization: Bearer <token>`

How to run (local)
1. From `frontend/` install and start dev server:

```bash
cd frontend
npm install
npm run dev
```

2. Backend dev server (separate terminal):

```bash
cd backend
python -m pip install -r requirements.txt
python manage.py runserver
```

Key frontend files & folders
- `src/main.tsx` — app bootstrap and router
- `src/App.tsx` — top-level app
- `src/pages/` — page components (per-route views)
- `src/components/` — reusable UI components
- `src/services/` — API wrappers and auth utilities (JWT handling)

API integration points used by frontend
- Dashboard: `GET /api/accounts/dashboard/`
  - Auth: send `Authorization: Bearer <access_token>` header
  - Response shape (important keys):
    - `profile_type` (STUDENT/STAFF/None)
    - `roles` (list)
    - `permissions` (list of codes)
    - `profile_status` (string)
    - `capabilities` (grouped permission codes)
    - `flags` (derived booleans)
    - `entry_points` (derived booleans for UI entry availability)

Sample request (curl):

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:8000/api/accounts/dashboard/
```

Frontend expectations / constraints
- The frontend should treat `entry_points` as the truth for which top-level sections to show.
- `flags` are authoritative for boolean capabilities; `roles` are informational only.
- Do not depend on academic models or backend UI logic — the backend provides capability data only.

Recommended next steps
- Add a small integration test in `frontend/src/services` to fetch and validate dashboard keys.
- Add UI guards that rely on `entry_points` instead of role names.
- Add documentation for where JWTs are stored/renewed in `src/services/auth.*`.

Location
- This document: [docs/CURRENT_FRONTEND.md](docs/CURRENT_FRONTEND.md)
