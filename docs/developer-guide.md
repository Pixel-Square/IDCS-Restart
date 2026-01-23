# Developer Guide

This guide helps contributors understand the codebase and common developer tasks.

Repository layout (important folders)
- `backend/` — Django project root
  - `accounts/` — auth models, serializers, views, token handling
  - `academics/` — profiles and academic masters (AcademicYear, Department, Program, Course, Semester, Section, Subject)
  - `erp/` — Django project settings and top-level urls
- `frontend/` — Vite + React app (TypeScript)

Important models (backend/accounts)
- `User` (custom): base user with a `roles` M2M through `UserRole`.
- `Role`, `Permission`, `RolePermission`, `UserRole` — role/permission mapping.

Important models (backend/academics)
- `AcademicYear` (name, is_active)
- `Department` (code, name)
- `Program` (name)
- `Course` (name, department, program)
- `Semester` (number, course)
- `Section` (name, semester)
- `Subject` (code, name, semester)
- `StudentProfile` (OneToOne User, reg_no, section FK, batch)
- `StaffProfile` (OneToOne User, staff_id, department FK, designation)

APIs and auth flow
- Login (`/api/accounts/token/`): accepts `identifier` + `password`. Identifier resolution order:
  1. If identifier contains `@` → lookup `User.email`.
  2. Else → lookup `academics.StudentProfile.reg_no`.
  3. Else → lookup `academics.StaffProfile.staff_id`.
- Successful login returns `refresh` + `access` tokens (JWT). Tokens include a `roles` claim.
- `/api/accounts/me/` returns user details and permissions resolved by `accounts.utils.get_user_permissions(user)`.

Frontend auth handling
- `frontend/src/services/auth.ts` creates an axios client that attaches `access` token
  and automatically attempts `token/refresh/` when a 401 occurs. On refresh failure the
  client calls `logout()`.

Admin
- `accounts.admin.UserAdmin` uses `DjangoUserAdmin` so passwords are hashed correctly.
- `academics.admin` registers academic masters and profile admin classes (inlines added to `User` admin earlier).

Developer commands
- Setup & run backend (from repo root):
```bash
cd backend
python -m venv .venv
. .venv/Scripts/Activate.ps1   # Windows PowerShell
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

- Frontend dev (from repo root):
```bash
cd frontend
npm install
npm run dev
```

- Typecheck & lint (frontend):
```bash
cd frontend
npm run typecheck
npm run lint
```

Maintenance notes
- When migrating profile fields from text -> FK, existing data may need backfilling.
- Keep auth logic in `accounts`; academic logic in `academics`.
- Prefer DB queries that use joins (`select_related`, `values_list`) to avoid N+1.

Next actions you might want
- Add fixtures or management commands to bootstrap Departments/Courses/Sections.
- Add tests for the token/refresh logic and `get_user_permissions`.
