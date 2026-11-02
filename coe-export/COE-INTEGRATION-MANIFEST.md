# COE Integration Manifest

Generated for IDCS-MAIN integration of the canonical COE module from IDCS-Restart.

## Source and export status

- Source application: [backend/COE/](../backend/COE/)
- Frontend module: [frontend/src/pages/COE/](../frontend/src/pages/COE/)
- Live DB connection configured in [backend/.env](../backend/.env) pointed at localhost:6432, database college_erp.
- Direct login to the live PostgreSQL endpoint failed in this workspace with server_login_retry, so the isolated export below was produced from the verified PostgreSQL snapshot [backup.dump](../backup.dump).
- Delivered SQL export: [coe_data_only.sql](coe_data_only.sql)
- Delivered row/sequence summary: [coe-table-counts.txt](coe-table-counts.txt)

## 1) Database schema and table manifest

### Current COE-managed tables

| Table | Django model | Purpose | Rows in export | Sequence current value |
| --- | --- | --- | ---: | ---: |
| COE_coeexamdummy | CoeExamDummy | Student ↔ dummy number mapping for exam scanning | 2728 | 6470 |
| COE_coearrearstudent | CoeArrearStudent | Arrear registrations for COE lists | 2 | 2 |
| COE_coeassignmentstore | CoeAssignmentStore | Hall/assignment allocation JSON by store key | 1 | 2 |
| COE_coecourseselectionstore | CoeCourseSelectionStore | Persisted course selection state by department/semester | 11 | 11 |
| COE_coekeyvaluestore | CoeKeyValueStore | Generic COE key/value persistence | 13 | 20 |
| COE_coestudentmarks | CoeStudentMarks | Row-based marks per dummy number | 1222 | 1281 |
| COE_coefinalresult | CoeFinalResult | Final result cache/export table | 1739 | 15801 |

### Model-to-table mapping notes

- There are no `managed = False` models in [backend/COE/models.py](../backend/COE/models.py).
- A transient proxy migration existed for ExternalStaffProfile, but it was deleted in migration 0010 and it does not have a backing table in the current schema.
- Table naming follows the uppercase app label `COE`, so the live tables are `COE_*`, not `coe_*`.

### Sequence manifest

| Sequence | Current value |
| --- | ---: |
| COE_coearrearstudent_id_seq | 2 |
| COE_coeassignmentstore_id_seq | 2 |
| COE_coecourseselectionstore_id_seq | 11 |
| COE_coeexamdummy_id_seq | 6470 |
| COE_coefinalresult_id_seq | 15801 |
| COE_coekeyvaluestore_id_seq | 20 |
| COE_coestudentmarks_id_seq | 1281 |

### Foreign-key dependencies and integrity constraints

Only one COE table has a real PostgreSQL FK constraint:

- `COE_coeexamdummy.student_id` → `academics_studentprofile.id`

All other COE tables are standalone and store denormalized values, JSON, or keys.

Operational dependencies used by the COE code but not enforced by FK on these tables:

- `accounts.User` for login identity and permissions
- `accounts.Permission` for `coe.portal.access` and `coe.manage.*`
- `academics.StudentProfile`
- `academics.Department`
- `academics.Section`
- `academics.StudentSectionAssignment`
- `academics.TeachingAssignment`
- `academics.StaffProfile`
- `curriculum.CurriculumDepartment`
- `curriculum.ElectiveChoice`
- `curriculum.ElectiveSubject`

## 2) Export files and validation

### Generated files

- [coe_data_only.sql](coe_data_only.sql) — selected COE tables plus their sequences, no unrelated tables
- [coe-table-counts.txt](coe-table-counts.txt) — row counts and sequence values
- [COE-INTEGRATION-MANIFEST.md](COE-INTEGRATION-MANIFEST.md) — this file
- [coe-checksums.txt](coe-checksums.txt) — SHA-256 checksums for the delivered artifacts

### Validation performed

- Verified that the SQL export contains only COE table data and sequence sets.
- Verified that the export does not contain `accounts_user`, `django_session`, or `auth_*` data blocks.
- Verified no obvious secrets/password/token fields were emitted in the export.

### Important limitation

A new binary custom-format `coe_isolated.dump` could not be regenerated in this workspace because the live PostgreSQL server was not reachable and server-side PostgreSQL binaries were not available to create a temporary local cluster. The SQL export is complete and isolated; if a custom archive is required later, rerun the same selection set against a reachable PostgreSQL instance and produce the archive with `pg_dump -Fc`.

## 3) Data import instructions for college_erp_mt

### Preferred import path

Use this when the target database already contains the required student/profile/core tables:

```bash
psql -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d college_erp_mt -v ON_ERROR_STOP=1 -f coe-export/coe_data_only.sql
```

### Emergency import path if FK enforcement blocks exam dummy rows

Use only if you have superuser or equivalent privileges and you know the target core tables are incomplete:

```bash
psql -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d college_erp_mt -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET session_replication_role = replica;
\i coe-export/coe_data_only.sql
SET session_replication_role = origin;
COMMIT;
SQL
```

### Post-import checks

1. Confirm the row counts match [coe-table-counts.txt](coe-table-counts.txt).
2. Verify `COE_coeexamdummy.student_id` still resolves to valid `academics_studentprofile` rows.
3. Re-run sequence alignment if needed:

```sql
SELECT setval('public."COE_coeexamdummy_id_seq"', (SELECT COALESCE(MAX(id), 1) FROM public."COE_coeexamdummy"), true);
```

Repeat for the other sequences in the summary file.

## 4) Backend code integration guide

### Copy these backend directories/files into IDCS-MAIN

- [backend/COE/](../backend/COE/)
- Ensure the following support packages remain installed because COE code imports them:
  - `djangorestframework`
  - `django-cors-headers`
  - `reportlab`
  - `openpyxl`

### settings.py

The current repository already has the COE app enabled in [backend/erp/settings.py](../backend/erp/settings.py). For IDCS-MAIN, make sure the local apps list contains:

```python
'COE',
```

Recommended if you want the AppConfig hook to be explicit:

```python
'COE.apps.CoeConfig',
```

The app config registers cache-busting signals automatically on startup.

### urls.py

The current repository already mounts COE under [backend/erp/urls.py](../backend/erp/urls.py):

```python
path('api/coe/', include('COE.urls')),
```

Inside [backend/COE/urls.py](../backend/COE/urls.py), the active endpoints are:

- `portal/`
- `students-map/`
- `arrears/`
- `arrears/bulk-upsert/`
- `arrears/<int:pk>/`
- `save-dummies/`
- `reset-dummies/`
- `assignments/`
- `course-selections/`
- `kv-store/`
- `external-staff/`
- `external-staff/admin-source/`
- `external-staff/academics-profiles/`
- `external-staff/db-mirror/`
- `external-staff/assign-codes/`
- `seating-arrangement-excel/`
- `publish-hall-plan/`
- `student-hall-plan/`
- `hall-attendance-pdf/`

### Migration synchronization

If the target schema already exists, use the normal migrate path first:

```bash
python manage.py migrate COE
```

If the initial schema is already present in the target database from a prior manual load, align Django state with:

```bash
python manage.py migrate COE --fake-initial
```

Then run normal migrations for any newer deltas.

### Backend quirks to preserve

- The COE app label is uppercase `COE`; do not rename it to lowercase without planning a table rename migration.
- `COE_coeexamdummy` is the only COE table with an FK and should be imported only after `academics_studentprofile` exists.
- The COE app is cache-sensitive: signals clear cache keys whenever curriculum, teaching assignment, section assignment, or arrear student data changes.

## 5) Frontend code integration guide

### Copy these frontend directories/files into IDCS-MAIN

- [frontend/src/pages/COE/](../frontend/src/pages/COE/)
- [frontend/src/services/coe.ts](../frontend/src/services/coe.ts)
- [frontend/src/utils/coeKvStore.ts](../frontend/src/utils/coeKvStore.ts)
- [frontend/src/utils/coeBundleFinalizeStore.ts](../frontend/src/utils/coeBundleFinalizeStore.ts)
- [frontend/src/pages/HallSelectionPage.tsx](../frontend/src/pages/HallSelectionPage.tsx)

### App routes

Keep the COE routes in [frontend/src/App.tsx](../frontend/src/App.tsx):

- `/coe`
- `/coe/students`
- `/coe/courses`
- `/coe/arrears`
- `/coe/bundle-allocation`
- `/coe/bundle-barcodes`
- `/coe/bar-scan`
- `/coe/bar-scan/entry`
- `/coe/retrival`
- `/coe/one-page-report`

### Sidebar navigation

The sidebar gate in [frontend/src/components/layout/DashboardSidebar.tsx](../frontend/src/components/layout/DashboardSidebar.tsx) should continue to show COE entries when the user has `coe.portal.access` or the COE login email `coe@krct.ac.in`.

### API client expectations

The COE frontend service client in [frontend/src/services/coe.ts](../frontend/src/services/coe.ts) expects these backend routes:

- `/api/coe/portal/`
- `/api/coe/students-map/`
- `/api/coe/save-dummies/`
- `/api/coe/reset-dummies/`
- `/api/coe/arrears/`
- `/api/coe/arrears/bulk-upsert/`
- `/api/coe/course-selections/`

The frontend also persists COE KV-backed browser state through `/api/coe/kv-store/` via [frontend/src/utils/coeKvStore.ts](../frontend/src/utils/coeKvStore.ts).

### Frontend quirks to preserve

- The COE UI relies heavily on browser-local state plus DB-backed KV synchronization.
- `coe-course-bundle-dummies-v1` has custom sanitization logic for a specific ECE sem 8 bundle edge case.
- The student list and course list pages derive section and semester filters dynamically and cache them client-side.

## 6) Known quirks, gaps, and fixes to keep in mind

1. The backend contains `marks_views.py` and `final_result_views.py`, but they are not currently mounted in [backend/COE/urls.py](../backend/COE/urls.py). If IDCS-MAIN expects these APIs, wire them in explicitly.
2. The frontend marks store currently calls `/api/coe/student-marks/`. Verify that the target integration exposes a matching backend route, because it is not present in the active COE URL config in this repository.
3. Hall allocation and attendance PDF generation depend on `openpyxl` and `reportlab`.
4. Final-result logic merges RE into MECH and assumes the department aliases documented in the backend code.
5. COE data is intentionally denormalized; do not try to normalize the export on import.

## 7) Checksums

See [coe-checksums.txt](coe-checksums.txt) for the authoritative SHA-256 hashes of the delivered export artifacts.

