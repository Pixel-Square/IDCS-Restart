# Security Review — Student Bulk Import

Date: 2026-10-18
Scope: `backend/academics/student_import_views.py` (1,002 lines) and the settings that govern it
(`backend/erp/settings.py`). Reviewed statically; no live testing was performed.
Classification: contains security findings — do not distribute outside the maintainers.

## Summary

| # | Severity | Location | Vulnerability | Confidence |
|---|----------|----------|---------------|------------|
| 1 | High | `student_import_views.py:196` | Over-broad authorization: `is_staff` grants bulk import of all students | 9/10 |
| 2 | High | `student_import_views.py:863, 908` + `settings.py:198` | Passwords accepted from spreadsheet with no validation policy | 9/10 |
| 3 | High | `student_import_views.py:850` | Importer can change a student's email (password-reset channel) | 8/10 |
| 4 | Medium | `student_import_views.py:518` | No upload size / row cap; whole file read into memory | 8/10 |
| 5 | Medium | `student_import_views.py:990` | Raw exception text returned to the client | 9/10 |
| 6 | Medium | `student_import_views.py:567, 844` | Single transaction without per-row savepoints; partial row persistence | 8/10 |
| 7 | Low | `student_import_views.py:724` | Uncontrolled creation of `ModeOfTransportation` reference rows | 9/10 |
| 8 | Low | `student_import_views.py:894` | Predictable usernames; check-then-create race | 7/10 |
| 9 | Low | `student_import_views.py:496` | File type validated by extension only; unbounded xlsx parsing | 6/10 |
| 10 | Medium | `settings.py:241` | No default permission class and no throttling configured | 8/10 |
| 11 | Medium | `settings.py:198` | `AUTH_PASSWORD_VALIDATORS = []` project-wide | 9/10 |

## Details

### 1. High — Over-broad authorization on bulk import

`_has_import_permission()` returns true for `user.is_superuser or user.is_staff or
'students.view_all_students' in perms`. Because Django's `is_staff` flag is used for
admin-site access rather than for data ownership, any teaching or office account created
as staff can call `POST /api/students/import/` and create or overwrite student records
across every department.

Impact: mass modification of academic identity data, department/section reassignment,
mentor reassignment, and password reset of arbitrary students (see #2). This is the
classic broken-access-control pattern: the check exists, but it is role-level, not
object-level.

Recommended fix:
- Require a dedicated permission code (for example `students.bulk_import`) granted only to
  the registrar / admissions role, and drop the blanket `is_staff` bypass.
- Scope updates to the importer's department(s); reject rows outside that scope instead of
  silently updating them.
- Record the importer's identity against every created/updated row.

### 2. High — No password policy applied to imported passwords

The import path calls `user_obj.set_password(password)` (line 863) and
`new_user.set_password(password)` (line 908) with the raw spreadsheet value. No
`validate_password()` call exists anywhere in the module, and the project sets
`AUTH_PASSWORD_VALIDATORS = []`, so Django enforces nothing.

The downloadable template also ships a sample row containing the literal password
`Student@123`, which invites every batch to share one credential.

Impact: a single leaked spreadsheet yields working credentials for hundreds of accounts.
Under the DPDP Act 2023 this is a personal-data security safeguard failure.

Recommended fix:
- Populate `AUTH_PASSWORD_VALIDATORS` (UserAttributeSimilarity, MinimumLength >= 10,
  CommonPassword, NumericPassword).
- Run `django.contrib.auth.password_validation.validate_password()` before each
  `set_password()` and report failures as row errors.
- Replace the sample password with a blank cell plus instructions.
- Force password change on first login for imported accounts.

### 3. High — Silent email change enables account takeover

For existing students, `user_obj.email` is overwritten from the spreadsheet (line 850)
with no verification. Email is normally the password-reset destination, so an importer can
redirect a student's reset link to an address they control and take over the account.

Recommended fix:
- Do not change email through bulk import; route it through a verified profile-change flow.
- If bulk correction is required, require a second privileged permission and log the
  before/after value with the actor.

### 4. Medium — No upload size or row-count limit

The CSV branch does `uploaded_file.read().decode('utf-8-sig')` (line 518), loading the
entire upload into memory, and neither branch caps file size or row count. Django's
`DATA_UPLOAD_MAX_MEMORY_SIZE` does not cover file uploads, and
`FILE_UPLOAD_MAX_MEMORY_SIZE` only decides when a spooled temp file is used.

Impact: a single large or maliciously crafted file can exhaust a worker's memory and take
the API down during admission season.

Recommended fix:
- Reject `uploaded_file.size` above a few MB (configurable) and cap rows (e.g. 5,000).
- Stream the CSV with `io.TextIOWrapper(uploaded_file.file, encoding='utf-8-sig')` rather
  than reading it whole.
- Move imports above a threshold to a background job and return a job id.

### 5. Medium — Internal error details leaked to the client

Line 990 appends `f'Row {row_idx}: Unexpected error - {exc}'` and the result is returned in
the response body. Exception text can include database errors, table and column names, and
filesystem paths.

Recommended fix: return a generic row message plus a correlation id; log the exception
server-side with that id.

### 6. Medium — Transaction handling can lose the whole import, and half-apply a row

The loop runs inside a single `with transaction.atomic():` (line 567) with a per-row
`except Exception`. In Django, any `DatabaseError` inside an atomic block marks the
transaction as needing rollback; catching the exception does not clear that state, so every
subsequent row raises `TransactionManagementError` and the import aborts after one bad row.

Separately, the "password required" branch at line 844 `continue`s after
`existing.save()` at line 787 has already written the profile changes. The row is reported
as an error but its department, section, mentor and address changes are persisted, and
`updated_count` is never incremented — so the report and the database disagree.

Recommended fix:
- Wrap each row body in its own `transaction.atomic()` so a failure rolls back to a
  savepoint and the loop continues.
- Perform all validation before the first write in a row.

### 7. Low — Arbitrary reference data creation

Line 724 creates a `ModeOfTransportation` row from any unrecognised spreadsheet value
(`mot_raw.strip().title()`), so the reference table can be polluted by typo'd input.

Recommended fix: reject unknown modes and report the allowed values.

### 8. Low — Predictable usernames and a creation race

Line 894 derives the username from the student's full name and increments a counter until
it is free. Names are guessable, and two concurrent imports of the same name can both pass
the existence check; the unique constraint then fails one row (see #6).

Recommended fix: use the registration number as the username, or a random suffix, and
handle `IntegrityError` explicitly.

### 9. Low — Extension-only file validation

`filename.endswith(('.xlsx', '.xls'))` is the only type check. Content is then parsed by
openpyxl with no guard against compressed-archive abuse. Note that `.xls` is accepted by
the extension check but `load_workbook` cannot read legacy BIFF files, so it fails later
inside the generic exception handler.

Recommended fix: validate magic bytes, accept only `.xlsx`, and bound archive entry count
and uncompressed size.

### 10. Medium — No default permission class, no throttling

`REST_FRAMEWORK` in `settings.py:241` sets only the JWT authentication class and a custom
exception handler. There is no `DEFAULT_PERMISSION_CLASSES`, so any view that forgets
`permission_classes` is publicly reachable, and no `DEFAULT_THROTTLE_CLASSES`, so the login
and import endpoints have no rate limit.

Recommended fix: set `DEFAULT_PERMISSION_CLASSES = ['rest_framework.permissions.IsAuthenticated']`,
add `AnonRateThrottle`/`UserRateThrottle` scopes, and use a stricter scope on auth
endpoints.

### 11. Medium — Password validators disabled project-wide

`AUTH_PASSWORD_VALIDATORS = []` (line 198) means no minimum length, no common-password
check, and no similarity check anywhere in the system — registration, admin, and import.

Recommended fix: enable the four standard validators with `MinimumLength` at 10 or higher.

## Ready-to-run checks

```bash
cd backend
python manage.py check --deploy
pip-audit -r requirements.txt
bandit -r . -x ./migrations,./scratch -ll
semgrep --config p/django --config p/secrets .
gitleaks detect --source .. --report-format json --report-path gitleaks.json
```

Then run `OWASP ZAP` baseline against a staging deployment with synthetic data, followed by
manual cross-role access testing using student, teacher, HOD, accounts and admin accounts.

## DPDP Act 2023 notes

- Student records contain guardians' phone numbers, addresses and dates of birth; treat
  them as personal data requiring purpose limitation and minimum collection.
- Bulk import/export must be an audited operation: actor, timestamp, row count, and the set
  of fields changed.
- Mask PII in logs and in non-production database copies.
- Define retention and erasure handling for alumni records.

## Out of scope

Payment/fee flows, result publication, attendance, hostel allocation, the Flutter client and
the Electron gate app were not reviewed here.
