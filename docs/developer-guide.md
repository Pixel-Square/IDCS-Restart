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

Attendance models (backend/academics)
- `TeachingAssignment` (staff FK, subject FK, section FK, academic_year FK, is_active)
- `AttendanceSession` (teaching_assignment FK, date, period?, created_by, is_locked, created_at)
- `AttendanceRecord` (attendance_session FK, student FK, status {Present/Absent}, marked_at)

APIs: Attendance
- Base path: `/api/attendance-sessions/` and `/api/attendance-records/` (registered in `academics/urls.py`)

- `AttendanceSessionViewSet` (`AttendanceSessionSerializer`)
  - Actions: `list`, `create`, `lock` (POST `/api/attendance-sessions/{id}/lock/`)
  - Permissions: staff may only see/create sessions for their own `TeachingAssignment`; users with `HOD`/`ADVISOR` roles may manage sessions scoped to their department; admins see all.
  - Validation: prevents duplicate session for same teaching_assignment+date+period.

- `AttendanceRecordViewSet` (`AttendanceRecordSerializer` / `BulkAttendanceRecordSerializer`)
  - Actions: `create` (supports bulk list), `list` (students see only their records; staff see records for their sessions)
  - Constraints: prevents duplicate records per (attendance_session, student); disallows marking when session is locked; staff may only mark for their own sessions.

Serializer & implementation notes
- `AttendanceSessionSerializer` accepts `teaching_assignment_id` on create and returns expanded `teaching_assignment` info (subject, section, academic_year).
- `AttendanceRecordSerializer` accepts `attendance_session_id` and student PK; `BulkAttendanceRecordSerializer` enforces all records belong to the same session and uses `bulk_create`.
- Permission checks currently use role-name checks (`HOD`, `ADVISOR`) and `staff_profile` ownership. Adjust role names or permission codes to match your deployment as needed.

Admin
- `AttendanceSession` and `AttendanceRecord` are registered in the admin with `raw_id_fields` for lookup performance and filters for dates/department/status.

Developer commands (attendance)
- Apply migrations added for attendance models:
```bash
cd backend
python manage.py migrate
```

- Manually test with the admin or DRF browseable API, or use cURL / Postman to exercise the endpoints. Example (create session):
```bash
curl -X POST -H "Authorization: Bearer <access>" -H "Content-Type: application/json" \
  -d '{"teaching_assignment_id": 1, "date": "2026-01-23", "period": "1"}' \
  https://localhost:8000/api/attendance-sessions/
```


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
