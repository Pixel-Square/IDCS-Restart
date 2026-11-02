# Phase 0 (Discovery) and Phase 0.5 (Multi-Tenant Isolation)

Date: 2026-10-23 · Branch: `hostel` · Method: static analysis plus schema introspection
(`manage.py shell`, model metadata only). **No student or staff rows were read or printed.**
No application code was changed in this phase.

Classification: internal — describes weaknesses. Do not publish.

Machine-readable inventories (regenerate with the scripts beside them):
- `phase0/model-inventory.json` — 306 local models: college FK, personal-data fields, unique constraints, FKs
- `phase0/route-inventory.json` — 3,498 URL routes: view, methods, permission and authentication classes

---

## Headline

1. **The system is single-tenant, not multi-tenant.** Only 7 of 306 models reference
   `college.College`, all nullable and all configuration tables. Students, staff, departments,
   marks, fees and attendance have no college dimension. The `College` table (355 rows) is a
   directory, and the app treats the first active row as "the" college. Running a second
   college on this instance today would expose every college's data to every other college.
   This conflicts with the brief, so a decision is needed before Phase 0.5 can be implemented
   (see §5.4).
2. **Authentication is SimpleJWT bearer tokens stored in browser `localStorage`** (High under
   the brief). Two desktop/mobile clients also depend on JWT, so the cookie migration must keep
   a token path for them.
3. **Sensitive data is stored in plaintext**: bank account numbers and IFSC codes, raw
   fingerprint templates, and Google OAuth refresh tokens and client secret. There is
   **no Aadhaar field** anywhere.

---

## 1. Detected stack (answers to the brief's placeholders)

| Item | Detected | Evidence |
|---|---|---|
| Backend | Django 4.2.28 (LTS, supported to Apr 2026 → **past end of support at today's date; verify**), DRF 3.16.1 | `backend/requirements.txt` |
| Database | PostgreSQL | `erp/settings.py` `DATABASES` |
| Cache | Redis via django-redis, `IGNORE_EXCEPTIONS=True` (throttles fail open if Redis is down) | `erp/settings.py:180-190` |
| Background jobs | **None** — no Celery, no cron/systemd timers in the repo | grep of settings, `deploy/` |
| App server | Gunicorn under systemd, runs as `iqac2`/`iqac` (not root) | `deploy/gunicorn-idcs.service:6` |
| Web server | Nginx on `localhost:80` | `deploy/*.conf` |
| Exposure | Cloudflare Tunnel (`cloudflared`) to `idcs/db/coe.krgi.co.in` **and** `idcs/db/coe/jadmin/jback2/mayav/api.zynix.us`, all to the same `localhost:80` | `deploy/cloudflared-idcs.yml` |
| Hosting | On-premises Linux desktop (`/home/iqac2/Desktop/idcs-mt`). Region is presumably India (campus) — **please confirm** | `deploy/gunicorn-idcs.service:9` |
| Auth (API) | `rest_framework_simplejwt` Bearer; access 60 min (env), refresh 1 day, **no rotation, no blacklist** | `erp/settings.py:298` |
| Auth (browser storage) | `access`, `refresh`, `access_token`, `refresh_token`, `me`, `roles`, `permissions` in `localStorage` | `frontend/src`, `coe/src` (≈60 call sites) |
| Auth (query string) | JWT accepted from `?token=`, `?access_token=`, `?jwt=` (ends up in Nginx/Cloudflare logs) | `template_api/canva_views.py:388`; `academic_calendar/proposal_views.py:376,679` |
| Auth (Django admin) | Session login at the default path `/admin/`, no MFA | `erp/urls.py:22` |
| Default permission | `IsAuthenticated` (deny-by-default already set) | `erp/settings.py` `REST_FRAMEWORK` |
| Exception handler | `curriculum.views.custom_exception_handler` | `erp/settings.py` |
| CI | None (`.github/` holds only `agents/`, no workflows) | |
| Institution | One institution group (KRCT / krgi.co.in) | `ALLOWED_HOSTS`, email domains |

Clients that call the API:

| Client | Tech | Auth | Note |
|---|---|---|---|
| `frontend/` (IDCS SPA) | React + Vite + TS, 502 files, ~200 routes, ~1,250 API calls | JWT in localStorage | Sourcemaps off unless `VITE_SOURCEMAP=true` |
| `coe/` (COE portal) | React + Vite, 55 files, 35 routes | JWT in localStorage | |
| `KR Tracker/` | Flutter (Android/iOS/web) | JWT | Bundles a real 2,950-student roster (`assets/offline_data.json`) |
| `KR-GATE-IDCS/` | Electron + React | JWT (verify) | Gate scanning |
| `whatsapp-server/` | Node | API key | OTP/notifications gateway |
| `gate/`, `coder/`, `esv/`, `root-website/`, `krgiweb/`, `LCA/` | React / misc | — | Not yet inventoried in depth |

---

## 2. Backend inventory (summary)

| Item | Count | Notes |
|---|---|---|
| Local Django apps | 25 | accounts, college, curriculum, academics, timetable, pbas, staff_attendance, idcsscan, feedback, academic_calendar, applications, OBE, academic_v2, COE, question_bank, template_api, reporting, announcements, lms, coder, discipline, audits, hostel, staff_requests, staff_salary |
| Models | 306 | academics 40, OBE 43, academic_v2 41, hostel 37, coder 18, … |
| URL routes | 3,498 | 1,903 DRF + 1,595 plain Django (mostly admin) |
| Unique DRF views | 749 | `academic_v2` is mounted **three times** (`/api/academic-v2/`, `/api/accounts/academic-v2/`, `/api/auth/academic-v2/`, see `accounts/urls.py:72`), tripling its attack surface |
| Permission classes in use | ~40 | top: IsAuthenticated (974 routes), IsHostelStaff (210), IsAcV2AdminOrReadOnly (174) |
| Middleware | 10 | standard stack + `SlowRequestLoggingMiddleware`; `accounts/middleware.py` exists but is **not installed** |
| Signal receivers | 14 | `academics/models.py`, `academic_v2/signals.py`, `accounts/models.py`, `curriculum/signals.py` |
| Management commands | 48 | |
| Admin registrations | 217 | |
| Serializers/admins with `fields = '__all__'` | 83 | academic_v2, hostel, OBE, timetable serializers + several admins — mass-assignment review in Phase 1 |
| Loose DB scripts in `backend/` root | 26 | `query_*.py`, `restore.py`, `import_old_data*.py`, … — can print personal data; should move out of the deploy tree |

**Routes reachable without login** (excluding token issue/refresh):

| Route | Guard | Phase 1 note |
|---|---|---|
| `accounts/mobile/request-otp/` | throttled 5/min | OK |
| `accounts/impersonate/` | superuser password + throttle | Review: no MFA on the most powerful action |
| `academic-v2/google-sheets/webhook/` | per-section HMAC (added 2026-10-23) | OK |
| `academic-v2/google-sheets/oauth/callback` | OAuth state | Review |
| `academics/public-profile/` | public by design | Check fields returned |
| `academics/ext-staff-form/public/<code>/…` (3) | form code | Public sign-up collects bank details — review |
| `academic-calendar/public-events/`, `public-stats/` | public | Check fields |
| `academic-calendar/events/<id>/poster-callback/` | shared secret in body | Review secret strength |
| `staff-attendance/biometric/realtime/` | `X-Biometric-Key` if configured, else login | Fails open to login if key unset |
| `colleges/search/`, `colleges/list/` | public | Directory only |
| `lms/materials/office-preview/<token>/` | token | Check expiry/entropy |
| `coder/preview/<token>/…` | token | Same-origin XSS (audit #7) |
| `obe/iqac/class-type-weights` | public | Config only |
| ~30 plain Django views (`/api/canva/*`, calendar downloads, `obe/mark-entry/`) | custom JWT decorators / `@login_required` | Not covered by DRF auth or throttles |

---

## 3. Frontend inventory (summary)

- **Token handling:** both SPAs read and write `access`/`refresh` (and `access_token`/`refresh_token`
  in the impersonation flow) in `localStorage`; `me` (profile JSON), `roles` and `permissions`
  are cached there as well. Any XSS gives full account takeover for up to a day (refresh lifetime).
- **Route guards:** `ProtectedRoute requiredRoles/requiredPermissions` in `frontend/src/App.tsx` are
  UX only. The 2026-10-23 fixes confirmed several places where the backend did not match them.
- **`dangerouslySetInnerHTML`:** `pages/lms/FilePreviewPage.tsx:257` (hand-rolled sanitiser;
  replace with DOMPurify), `pages/QuestionBankPage.tsx:409` (mermaid `securityLevel: 'strict'`).
- **`eval`/`new Function`:** none (the `coattainmentEngine.ts` hit is a comment).
- **File inputs:** 48 in `frontend/`, 5 in `coe/`.
- **Env vars in bundle:** only timeouts and `DEV`; no secrets. `frontend/.env.production` is tracked
  but holds only a proxy target.
- **No CSP** anywhere (Nginx confs or meta tags).

---

## 4. Personal-data inventory

Corrected manually after the pattern match (for example `rfid_uid` is not Aadhaar, and `capacity`
is not `city`).

| Category | Fields (model.field) | Exposure | Protection today |
|---|---|---|---|
| **Aadhaar** | **None stored** | — | Keep it that way; add a validator that rejects 12-digit Aadhaar-like values in free text (Phase 2) |
| **Bank details** | `academics.ExtStaffProfile.account_number/ifsc_code/bank_name/bank_branch_name/passbook_proof` (`academics/models.py:1836-1840`); `staff_salary.StaffSalaryDeclaration.account_no/ifsc_code` (`staff_salary/models.py:22-23`) | `ExtStaffProfileSerializer` (IQAC/COE/`view_staffs_page`), staff_salary views, public ext-staff sign-up form; passbook files under public `/media/ext_staff_passbook/` | **Plaintext**; passbook scans publicly fetchable |
| **Biometric** | `idcsscan.BiometricFingerprintData.template_b64` (`idcsscan/models.py:93`), `FingerprintEnrollment` | idcsscan views (operator roles since 2026-10-23) | **Plaintext** fingerprint templates — highest-sensitivity data in the system |
| **Health** | `academics.StudentProfile.blood_group` (`academics/models.py:626`) | student/profile serializers | Plaintext |
| **DOB / minors** | `StudentProfile.dob` (`:625`), `ExtStaffProfile.date_of_birth` | profile serializers, bulk import | Plaintext. First-year UG students are commonly 17, so **minors are almost certainly present**. Age can be derived from `dob` (not counted, to avoid reading data) |
| **Guardian** | `StudentProfile.father_name/mother_name/father_mobile/mother_mobile` (`:621-…`); `hostel.StudentLeaveRequest.guardian_contact`, `hostel.GatePass.guardian_contact` | profile serializers, `accounts.MeSerializer`, hostel | Plaintext |
| **Contact** | `accounts.User.email/mobile_no`; `StudentProfile.mobile_number`; `StaffProfile.mobile_number`; `ExtStaffProfile.mobile`; `hostel.StudentFacilityProfile.emergency_contact_phone`; `hostel.Visitor.phone_number` | many serializers; discipline directory exposes `email` | Plaintext |
| **Address** | `StudentProfile.address_line1-4/district/pincode`; `hostel.*.day_scholar_address` | profile serializers, hostel | Plaintext |
| **Identity** | `StudentProfile.gender`, `ExtStaffProfile.gender`, `reg_no`, `staff_id`, RFID UIDs | everywhere | Plaintext |
| **Photos** | `StudentProfile.profile_image`, `StaffProfile.profile_image` (`upload_to='profile_images/'`), `User.profile_image` | public `/media/profile_images/` | Publicly fetchable by path |
| **Academic records** | ~104 mark/grade/score fields (OBE, academic_v2, COE) | role-scoped (fixed 2026-10-23 for academic_v2) | — |
| **Fees / money** | ~42 fields (hostel fees/payments, discipline fines, staff_salary) | hostel staff roles, staff_salary | — |
| **Discipline** | `discipline.DisciplineIncidentLog` + documents | role-scoped since 2026-10-23 | Documents under public `/media/discipline/` |
| **Attendance / location** | staff biometric punch logs, BioSecure logs, gate-pass scans, RFID scans | role-scoped (partly) | — |
| **Device / IP** | `SuperuserImpersonationLog.ip_address/user_agent`, `lms.StudyMaterialDownloadLog.client_ip/user_agent`, `BrandingEventLog.ip_address` | admin | Retention undefined |
| **Credentials / secrets** | `AcV2GoogleSheetsOAuthCredential.access_token/refresh_token/client_secret` (`academic_v2/models.py:21-30`) **plaintext**; `CanvaServiceToken` **encrypted** (`erp/crypto_utils.py`, Fernet, key = `DATA_ENCRYPTION_KEY` or derived from `SECRET_KEY`); `MobileOtp.otp_hash` hashed; `User.password` PBKDF2 | — | Mixed |
| **Data outside the DB** | `backup.dump`, `backend/backup.dump`, `old_academic_structure_data.sql`, `specific_tables_dump.json`, `KR Tracker/assets/offline_data.json` committed to git | anyone with repo access | Audit #1, still open |

---

## 5. Phase 0.5: multi-tenant isolation audit

### 5.1 Verdict

There is **no tenant isolation**, because the application was built for one institution.
Every query is "unscoped" by definition, so the per-query checklist (raw SQL, `.all()`,
`get(pk=)`, aggregations, exports, signals, commands, admin, search) has one answer: **none of
them filter by college.** Listing all ~749 views individually would add no information until a
tenant key exists.

### 5.2 Findings

Severity assumes a second college is (or will be) served from this instance. If the deployment
stays one-college, T-01 to T-06 become design constraints, not vulnerabilities.

| ID | Severity | Location | Finding | Exploit scenario |
|---|---|---|---|---|
| T-01 | Critical | `phase0/model-inventory.json` (299/306 models) | No `college` FK on any core model (User, StudentProfile, StaffProfile, Department, Section, marks, fees, attendance, discipline, hostel) | College B's admin lists `/api/academics/students/` and receives College A's students |
| T-02 | Critical | `accounts/serializers.py:459` | "Current college" = `College.objects.filter(is_active=True).order_by('id').first()` | Every user of every college sees the same college identity |
| T-03 | High | `academics/models.py:564` (`reg_no` unique), `:939` (`staff_id` unique), `:95` (`Department.code` unique), `accounts/models.py:32` (`User.email` unique), `Program.name`, `AcademicYear(name, parity)` | Uniqueness is global, not per college | Onboarding College B fails on collisions (`CSE`, `2025-2026`), or an import silently updates College A's student with the same `reg_no` |
| T-04 | High | `accounts.Role` / `RolePermission` | Roles and permissions are global | An "IQAC" in College B is IQAC for every college |
| T-05 | High | `MEDIA_ROOT` layout (`profile_images/`, `discipline/…`, `ext_staff_passbook/`), Nginx `location /media/` | Flat, public file storage; no per-college prefix, no signed URLs | Guess a path and download another college's documents |
| T-06 | Medium | `erp/settings.py:180-190`; `idcsscan/views.py:4214` (`DEVICE_STATE` class dict) | Redis keys have no tenant prefix; in-process state is shared | Cached payloads and device state leak across colleges |
| T-07 | Medium | `reporting/services*.py` (Power BI SQL views via `VIEW_MAP`) | Reporting SQL views span the whole database | Report API-key holders receive every college's data |
| T-08 | Medium | `deploy/cloudflared-idcs.yml` | The same instance answers on `*.krgi.co.in` and `*.zynix.us` | Not a tenant split: a second brand on the same data. The `zynix.us` origins in `CORS`/`CSRF_TRUSTED_ORIGINS` widen the trusted set — confirm who owns them |
| T-09 | Low | `academic_v2` models with nullable `college` (`academic_v2/models.py:360,494,1601,1665,1960,2431`) | Partial, unused tenant columns | Gives a false sense of scoping |

### 5.3 Cross-tenant test suite: why it is not generated yet

The brief asks for tests that create College A and College B and prove isolation on every
endpoint. With no college dimension on the data, every such test would fail. The suite would
only restate T-01, and would block CI without telling you anything new. The harness design is
ready and uses `phase0/route-inventory.json`:

1. Factories build two colleges with dummy data (students, staff, marks, fees, files) and a user
   per role per college.
2. For each of the 749 DRF views and each method: call the list, detail, update, delete and
   export endpoints as College A users, substituting College B object IDs into the path
   parameters.
3. Assert 403/404 and that the body contains no College B identifiers.
4. Allow-list the genuinely global endpoints (colleges directory, token issue).

I will generate it as soon as the tenant key exists (option B or C below), or as a
per-deployment smoke test under option A.

### 5.4 Decision needed: tenancy model

| Option | What it means here | Isolation | Effort / risk | Fits |
|---|---|---|---|---|
| **A. Silo (one deployment + one DB per college)** | Keep the code single-tenant; run a separate instance, database, media folder, Redis DB and keys per college | Strongest (separate DB, keys, backups). Per-college export and erasure = drop that database | Low code change; more ops (one stack per college) | A handful of colleges; fastest path to DPDP per-college fiduciary separation |
| **B. Shared DB + `college` FK + TenantManager + Postgres RLS** (the brief's target) | Add a non-null `college` FK to ~299 models, backfill, rewrite global unique constraints as per-college, scope roles, rewrite reporting views, per-college media paths, RLS policies | Strong once complete; RLS is the backstop | **Very high**: every model, migration and raw query; data migration on live data; months of work | Many small colleges on shared infrastructure |
| **C. Schema-per-tenant (django-tenants)** | Each college gets its own Postgres schema; most models stay unchanged; `accounts`/`college` become shared apps | Strong (schema boundary) | Medium: router and middleware changes, migration tooling, cross-schema reporting work | Moderate number of colleges needing hard isolation without separate servers |

**Recommendation:** use **A** while there is one live college and few planned. Revisit **C**
when onboarding several more. B is the most invasive, and its tenant-filter bugs are exactly the
cross-college leaks the brief calls the worst-case failure.

---

## 6. Findings noticed during discovery (to be formalised in Phase 1)

| ID | Sev | Location | Finding |
|---|---|---|---|
| D-01 | High | `frontend/src`, `coe/src` | JWT access and refresh tokens in `localStorage` (brief: High). Migration plan must keep a token path for KR Tracker / KR-GATE |
| D-02 | High | `template_api/canva_views.py:388`; `academic_calendar/proposal_views.py:376,679` | JWT accepted in query strings, so it is logged by Nginx/Cloudflare |
| D-03 | High | `erp/settings.py:298` | No refresh rotation or blacklist; logout cannot revoke |
| D-04 | High | `idcsscan/models.py:93` | Raw fingerprint templates in plaintext |
| D-05 | High | `academics/models.py:1836-1840`, `staff_salary/models.py:22-23` | Bank account numbers in plaintext; passbook scans on public `/media/` |
| D-06 | High | `academic_v2/models.py:21-30` | Google OAuth refresh token and client secret in plaintext (Canva tokens are already encrypted, so the pattern exists) |
| D-07 | Medium | `erp/crypto_utils.py:13-22` | Encryption key falls back to a hash of `SECRET_KEY`, so rotating one rotates both; no key versioning |
| D-08 | Medium | `accounts/urls.py:72` (+ `api/auth/` alias) | `academic_v2` mounted three times |
| D-09 | Medium | `erp/urls.py:22` | Django admin at the default `/admin/`, no MFA, reachable through the tunnel |
| D-10 | Medium | `erp/settings.py:189` | Redis `IGNORE_EXCEPTIONS=True`, so rate limits fail open when Redis is down |
| D-11 | Medium | 83 × `fields = '__all__'` | Mass-assignment candidates |
| D-12 | Medium | `requirements.txt` | Django 4.2 LTS support ends April 2026, so it is unsupported at today's date — plan an upgrade to 5.2 LTS (**verify**) |
| D-13 | Low | `backend/*.py` (26 scripts) | Ad-hoc DB scripts in the deploy tree |
| D-14 | Low | `accounts/middleware.py` | Middleware present but not installed — confirm whether it was meant to enforce something |

---

## 7. Owner decisions (2026-10-23)

| Question | Answer | Consequence |
|---|---|---|
| Tenancy | **Option A: one deployment + one database per college** | No `college` FK refactor. Isolation = separate stack, database, media folder, Redis DB and keys per college. Cross-tenant tests become a per-deployment smoke test (no shared data paths). T-01–T-07 are design constraints, not vulnerabilities, as long as each college has its own deployment |
| `zynix.us` | Owner's domain; replace with `krgi.co.in` | Done 2026-10-23 (see changelog) |
| Hosting / backups | On campus, all backups in India | CERT-In 180-day in-India log retention is achievable locally |
| Payment gateway | Not yet; planned | Phase 1 fee logic covers manual recording only; gateway design goes into Phase 2/A06 |
| KR Tracker / KR-GATE | In production | Bearer-token login stays for them; the browser moves to an HttpOnly cookie (ACC-05) |
| Processors | Owner asked what to provide | Draft register with instructions: `compliance/processor-register-DRAFT.md` |

## 8. Original questions

1. **Tenancy:** how many colleges run on this instance today, and how many are planned in the
   next 12 months? Which option (A / B / C) should I design for? Phase 0.5 implementation
   depends on this.
2. **`zynix.us`:** who owns these domains (your company as vendor?), and should they serve
   KRCT production data?
3. **Hosting:** is the server physically on campus in India? Is there an off-site backup
   location (provider and region)?
4. **Payment gateway:** do any fees go through an online gateway (which one), or are payments
   recorded manually? I found no gateway integration in the code.
5. **Mobile/desktop:** are KR Tracker (Flutter) and KR-GATE (Electron) in production use? This
   decides whether JWT stays for them after the browser moves to cookies.
6. **Students under 18:** can you confirm the admission age profile, or should I add a DOB-based
   age check in Phase 2 instead of assuming?
7. **SMS/WhatsApp/email processors:** besides the self-hosted WhatsApp gateway and Twilio
   settings, which providers are live (for the DPDP processor register)?

Next phase on approval: Phase 1 (OWASP Top 10:2025), app by app, starting with `accounts`
(authentication), then `academics`, `academic_v2`, `hostel` (fees).
