# Security Audit — Whole Backend Sweep

Date: 2026-10-23
Scope: the whole repository, checked against the OWASP-style ERP checklist (access control,
injection, sessions, XSS, uploads, secrets, error leakage, business logic, backups). Reviewed
statically only. No live or staging testing was done, and dependency scanners could not run
because this environment has no network access.
Classification: contains exploitable findings. Do not distribute outside the maintainers.

Earlier review: `SECURITY-REVIEW.md` (student bulk import, all fixed).

## Remediation status (access control, 2026-10-23)

| # | Status | What changed |
|---|--------|--------------|
| 1 | **Open** | Dumps, keys and the bundled roster are still in git; needs credential rotation, then a history purge |
| 2 | Fixed | `/api/accounts/register/` route, view and serializer removed |
| 3 | Fixed | `academic_v2/permissions.py`: config viewsets need `academic_v2.page.admin` (or superuser) for every write; `exam-assignments`, `student-marks`, `internal-marks` are admin-only; edit-request generic PATCH/PUT/DELETE are admin-only (approve/reject/cancel keep their workflow checks); `_has_admin_bypass_access` no longer accepts `is_staff`. Also found and closed during the fix: the Google Sheets endpoints (any user could link a section to their own sheet and overwrite marks), now admin-only; `derive-mark-manager` requires the section's own faculty and respects the lock; the webhook needs a per-section HMAC token and refuses locked exams; CO attainment is limited to the course's own staff |
| 4 | Fixed | Fingerprint enroll/identify/allocate and device mode need a biometric operator role (LIBRARY/SECURITY/IQAC/ADMIN or `idcsscan.manage_cards`); BioSecure groups, sections and admin logs need a BioSecure admin role; fingerprint status only for self or operators |
| 5 | Fixed | `discipline/permissions.py`: incidents and student directory need login plus a staff role; non-committee staff see only their own submissions; edits need committee, deletes need discipline admin; the reporter is always the logged-in user (the username spoof is removed); category/flow writes are admin-only |
| 6 | Partly fixed | `erp/upload_security.py` (extension allow-list, size cap, magic-byte check, random filename) applied to discipline receipts and incident documents; receipt upload limited to the student concerned. Other upload fields and public `/media/` serving are still open |
| 7 | Open | Coder preview still served on the ERP origin |
| 8 | Fixed | All performance/subject analytics require login; list modes no longer fall back to the whole college; `PermissionDenied` now returns 403 instead of a 200 error body; exception text no longer returned |
| 9 | Fixed | Timetable templates, slots and rule viewsets need `timetable.manage_templates` for writes; timetable assignment delete now checks permission; batch-year writes are IQAC-only; COE hall plan, seating export, hall attendance PDF and external staff (which exposed `login_code`) need `IsCoeUser` |
| 10–13 | Open | Except: OTP request is now throttled (`THROTTLE_OTP_RATE`, default `5/min`) |
| 14 | Fixed | HOD department scope compares `str` IDs |

Tests: `backend/accounts/tests_security_phase2.py` (33 tests, all pass) pins each fix. Two existing tests that used a role-less user for admin writes now authenticate as superuser.

Deployment notes:
- **Google Sheets:** re-inject the Apps Script on every linked sheet (Admin → Google Sheets → Inject script). Scripts injected before this change send no token, so their pushes are rejected with 403.
- **KR Tracker:** discipline submissions must be made while logged in; anonymous submissions are rejected.
- **Discipline:** committee members (DISCIPLINE_COMMITTEE role) can still edit incidents but can no longer delete them; deletion needs DISCIPLINE_COMMITTEE_ADMIN, IQAC or ADMIN.
- **Academic 2.1:** staff whose admin access came only from Django's `is_staff` flag lose admin rights. Grant `academic_v2.page.admin` through a role if they need them.

## Summary

| # | Sev | Area | Finding |
|---|-----|------|---------|
| 1 | Critical | Secrets / data | Full production PostgreSQL dumps and a 2,950-student roster are committed to git |
| 2 | Critical | Access control | Open self-registration turns every "logged-in only" endpoint into a public one |
| 3 | Critical | Business logic | Any logged-in user can switch off mark locking and reassign section faculty (academic_v2 viewsets) |
| 4 | Critical | Access control | Biometric attendance can be faked, and enrolled users listed, without logging in (idcsscan) |
| 5 | High | Access control | Discipline incidents and student directory readable without login; any user can edit or delete incidents |
| 6 | High | Uploads / XSS | Uploads unvalidated and served publicly from the app origin; receipt upload is an IDOR |
| 7 | High | XSS | Coder preview serves student HTML/JS on the ERP origin, where JWTs sit in localStorage |
| 8 | Medium | Access control | Faculty and subject analytics list modes leak college-wide data to anonymous users |
| 9 | Medium | Access control | Timetable, batch-year, hall-plan and biosecure group endpoints writable by any logged-in user |
| 10 | Medium | Business logic | Hostel payments: no overpay cap, no replay protection, too many roles may record cash |
| 11 | Medium | Sessions | No token revocation on logout, no per-account lockout, no 2FA, OTP request unthrottled |
| 12 | Medium | Error leakage | 74+ endpoints return `str(exception)` to the client |
| 13 | Medium | Recovery | No backup automation and no CI in the repository |
| 14 | Low | Correctness | HOD scope check compares `int` to `str`, so legitimate HODs get 403 |

Checked and found **OK**: settings secrets (env-based, fails closed without `DJANGO_SECRET_KEY`),
DB credentials, secure cookies, HSTS, CORS allow-list, the raw SQL in `reporting/` (view names come
from a fixed `VIEW_MAP`), formula evaluators (AST walkers, no `eval`), no `subprocess`/`pickle` in
request paths, password hashing (Django PBKDF2), React output escaping, mermaid in `strict` mode,
superuser impersonation (needs the superuser password, throttled, logged), COE marks views
(`IsCoeUser`), hostel fee transaction handling (`select_for_update` + `atomic`, rejects amounts ≤ 0).
A git-history scan for hard-coded credential assignments found nothing.

---

## 1. Production database dumps committed to git — Critical

Tracked files:

- `backup.dump` (7.2 MB) and `backend/backup.dump` (16.4 MB): `pg_dump` custom-format archives
  containing `academics_studentprofile`, `accounts_mobileotp`, `accounts_*` and the other tables.
  These are complete databases, including user password hashes and student PII.
- `old_academic_structure_data.sql` (19 MB), `specific_tables_dump.json`.
- `KR Tracker/assets/offline_data.json`: names, register numbers and usernames of 2,950 students,
  **bundled into the mobile app**, so anyone who installs the APK can extract it.
- `KR Tracker/ssl/key.pem`: a TLS private key.
- `tools/.n8n.env` (contains `N8N_ENCRYPTION_KEY`) and `tools/.n8n_data/.n8n/database.sqlite`
  (n8n's credential store, encrypted with that same key).

Remote: `github.com/Pixel-Square/IDCS-Restart`. Its visibility could not be checked from here.
Anyone with read access to the repo, now or at any point in its history, has these files.

Fix:
1. `git rm --cached` all of the above and add them to `.gitignore` (`*.dump`, `*.sql`, `*.sqlite`,
   `**/ssl/*.pem`, `tools/.n8n*`).
2. Purge them from history with `git filter-repo`, then force-push and have every clone re-clone.
   This step is destructive; coordinate it with the team.
3. **Assume compromise:** force a password reset for all users (the dumps contain hashes), rotate
   the n8n encryption key and every credential stored in n8n, and replace the TLS key.
4. Stop bundling real student data in the KR Tracker app. Fetch it after login instead.

## 2. Open self-registration — Critical

`backend/accounts/views.py:52`: `RegisterView` is `AllowAny` at `POST /api/accounts/register/`.
`RegisterSerializer` (`accounts/serializers.py:124`) creates a user from any username and password,
without running `validate_password`. The new account has no roles, but it **passes
`IsAuthenticated`**, which is the global default and the only check on many endpoints. Findings 3,
5, 6 and 9 can therefore all be exploited by an outsider: register an account, then call the API.

Fix: delete the route, or restrict it to admins. Then re-audit every view whose only check is
`IsAuthenticated` (the list in this report comes from a heuristic scan).

## 3. Mark-locking and course configuration writable by anyone — Critical

`backend/academic_v2/views.py`: full `ModelViewSet` CRUD guarded only by `IsAuthenticated`:

| Route (`/api/academic-v2/…`) | Class | Impact |
|---|---|---|
| `semester-configs/` | `AcV2SemesterConfigViewSet` :2633 (docstring says "Admin only") | `PATCH {"publish_control_enabled": false}` disables mark locking for the whole semester; `open_from`/due dates editable |
| `sections/` | `AcV2SectionViewSet` :3419 | `faculty_user` is writable: a user can make themselves the faculty of any class, then enter marks |
| `courses/`, `qp-types/`, `course-outcomes/`, `cycles/`, `versions/` | :3406, :3239, :3273, :3115, :2898 | Change or delete course structure and QP weightings that feed mark calculation |
| `pattern-overrides/` | `AcV2UserPatternOverrideViewSet` :4372 | Override mark patterns |

A student account (or a self-registered one, see #2) can unlock and change published marks.

Fix: add a permission class (e.g. IQAC/admin for writes, `IsAuthenticated` for reads), add tests
asserting a student gets 403 on every unsafe method, and make the mark-save path re-check the lock
server-side rather than trusting config the client can change.

## 4. Biometric attendance spoofing without login — Critical

`backend/idcsscan/views.py`, all `AllowAny`, under `/api/idscan/`:

- `fingerprint/identify/` (`FingerprintIdentifyView`, POST at :3569): `{"slot": N}` records a
  BioSecure attendance log for whoever is enrolled in slot N and returns their profile payload.
  Looping N over 1..1000 lists every enrolled person **and marks them all present**.
- `fingerprint/enroll/` (`FingerprintEnrollView` :3068, whose docstring says "Requires SECURITY /
  IQAC / ADMIN"): creates fingerprint data for any `user_id`/`reg_no`.
- `biosecure/device/mode/` (`BioSecureDeviceModeView` :4166): anyone can GET the device state or
  switch it to ENROLL for any user. The state is a class-level dict, so it is also shared across
  workers inconsistently.

Fix: authenticate devices with a per-device secret header, the way
`staff_attendance/realtime_views.py` already does with `X-Biometric-Key` and `compare_digest`.
Require a role for enroll and mode changes. Store device mode in the DB or cache, not on the class.

## 5. Discipline module — High

`backend/discipline/views.py`, under `/api/discipline/`:

- `logs/` (`DisciplineIncidentLogsView` :271) is `AllowAny`: anyone can list every student's
  incidents with search, and anyone can POST new incidents.
- `students/` (`DisciplineStudentDirectoryView` :804) is `AllowAny`: the full active-student
  directory, including emails.
- `logs/<id>/` (`DisciplineIncidentLogDetailView` :509) and `categories/<id>/` (:226) are
  `IsAuthenticated` only: any student can PUT or DELETE any incident, **including their own**.

Fix: role checks (discipline staff / HOD) on list, create, update and delete. Students should only
use `student-my-incidents/`.

## 6. File uploads — High

- `discipline/views.py:741` `DisciplineStudentUploadReceiptView`: no ownership check. Any user can
  attach a file to any incident and set its status to `RECEIPT_UPLOADED`. There is no type or size
  check, and the stored URL uses the client's original filename.
- No model `FileField` in the project uses `FileExtensionValidator`. The only content-type checks
  are in a few views (`template_api`, `academic_calendar`, `accounts`).
- `/media/` is served by nginx (`idcs5.krgi.co.in.conf:67`) and by Django
  (`erp/urls.py:68-76`) **without authentication**, from the same origin as the SPA. An uploaded
  `.html` or `.svg` file executes as stored XSS against staff, and the JWTs are in `localStorage`.
  Sensitive uploads such as `ext_staff_passbook/` (bank passbooks), discipline receipts and
  certificates are publicly fetchable by anyone who knows or guesses the path.

Fix: whitelist extensions and sniff content per field; rename to UUIDs; serve private files
through an authenticated view (nginx `X-Accel-Redirect` + `internal`); on `/media/`, add
`Content-Disposition: attachment` and `Content-Security-Policy: sandbox` (or use a separate
cookie-less domain).

## 7. Coder preview runs student code on the ERP origin — High

`coder/views.py:1948` `PreviewProxyView` proxies student-built web apps through
`/api/coder/preview/<token>/…` on the main domain. Student JavaScript runs on the same origin as
the ERP, so it can read `localStorage['access_token']` from any staff member who opens the preview.

Fix: serve previews from a separate domain (e.g. `preview.krgi.co.in`), or add
`Content-Security-Policy: sandbox allow-scripts` without `allow-same-origin` to proxied responses.

## 8. Analytics list modes leak to anonymous users — Medium

`academic_v2/academic_performance_views.py` and `subject_analysis_views.py` declare `AllowAny`
throughout. Most paths are safe because `allowed_student_q` denies anonymous scope, but
`clamp_department_param` returns `''` (no filter) when the scope has no department, so:

- `GET /api/academic-v2/performance/faculty-wise/` returns **every faculty member in the college**
  with average marks %, pass % and attendance %, without login.
- `GET /api/academic-v2/performance/subject-wise/` returns every subject with faculty names.
- Logged-in students get the same college-wide lists.

Fix: switch these views to `IsAuthenticated`, and make `clamp_department_param` deny when a
non-college-wide scope has no department.

## 9. Other configuration writable by any logged-in user — Medium

From the heuristic scan (verify each one):
`timetable/views.py` (`slots`, `credit-allocations`, `class-type-exceptions`, `course-exceptions`,
`group-allocations`, `special-periods`, `venue exceptions`), `academics/views.py:10038`
`BatchYearViewSet` (`batch-years/`, full CRUD), `COE/hall_allocation_views.py:561`
`PublishHallPlanView`, `COE/external_staff_views.py:133` `AssignExternalCodesView`,
`COE/hall_attendance_pdf_views.py:30`, `idcsscan/views.py:3884` `BioSecureGroupDetailView` (PUT/DELETE).

## 10. Hostel fee payments — Medium

`hostel/services.py:896` `record_fee_payment` handles the basics correctly. Gaps:
- No cap at `amount_due - amount_paid`; overpayment is accepted.
- Payments are accepted on `PAID` or `WAIVED` fees.
- No idempotency: replaying the same request, or reusing a `reference_no`, creates a duplicate
  payment. Add a unique constraint on `(method, reference_no)` where `reference_no` is non-blank,
  or an idempotency key.
- `IsHostelStaff` (`hostel/permissions.py:95`) includes security, mess, transport and maintenance
  roles, so any of them can record a cash payment. Restrict to hostel admin / accounts.
- Add a DB `CheckConstraint(amount__gt=0)` on `FeePayment`.

## 11. Sessions and login — Medium

- `SIMPLE_JWT` has no `token_blacklist` and no refresh rotation, so logout cannot revoke a token
  (it stays valid for the 60-minute access / 1-day refresh lifetime).
- Login is throttled at 10/min per IP only, with no per-account lockout, so distributed guessing
  goes unchecked.
- No 2FA for superusers, IQAC, COE or accounts staff.
- `MobileOtpRequestView` (`accounts/views.py:181`) is unauthenticated and unthrottled, which allows
  WhatsApp/SMS bombing at your cost.
- JWTs are kept in `localStorage`, and no `Content-Security-Policy` is set anywhere. That makes
  every XSS a token theft.

## 12. Error leakage — Medium

At least 74 responses return `str(e)` (e.g. `academics/views.py` ×14, `timetable/views.py` ×8,
`staff_salary/views.py` ×5, `academic_performance_views.py`; some return it with HTTP 200). These
can expose SQL, paths and model internals. Apply the bulk-import pattern instead: a generic message
plus a correlation ID, with details sent to the server log.

## 13. Backups and CI — Medium

The repo has no `pg_dump` schedule, no restore test and no `.github/workflows`, although
`tools/generate_iqac_pbi_report.py` tells IQAC that nightly backups are tested. Confirm on the
server; if they are missing, add a nightly off-server `pg_dump -Fc`, a monthly restore drill, and a
CI job running tests, `bandit`, `pip-audit`, `npm audit` and `gitleaks`.

## 14. HOD scope type mismatch — Low (fails closed)

`_allowed_dept_id_set` holds `str` IDs, but `academic_performance_views.py` (FacultyWise detail)
and `subject_analysis_views.py:209` test `staff.department_id` / `department_id` (`int`) against
it. The checks never match, so legitimate HODs get 403. Wrap the IDs in `str(...)`.

---

## Not done (needs a network or a staging server)

- `pip-audit -r backend/requirements.txt`, `npm audit` (frontend, coe, KR Tracker),
  `gitleaks detect --log-opts=--all`, Semgrep/Bandit full run.
- DAST (OWASP ZAP) and manual cross-role testing on staging with accounts for student, staff, HOD,
  COE, hostel and admin.
- Verify the GitHub repo's visibility and who has access.

## Suggested order

1. #1 secrets/dumps (rotate first, then purge) and #2 registration.
2. #3 mark locking, #4 biometrics, #5 discipline.
3. #6/#7 uploads and preview origin, plus a CSP.
4. The rest, each with a role-matrix test (student → 403) so it can't regress.
