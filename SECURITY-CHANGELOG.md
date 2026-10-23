# Security Change Log

Running record of security fixes to IDCS. Add new entries at the top. Each entry
lists what changed, where, why, how it was verified, and anything someone has to
do after deploying it.

Classification: describes exploitable weaknesses (some still open). Keep inside
the maintainer team, and do not push it anywhere public.

Related documents:
- `SECURITY-REVIEW.md`: student bulk import review (2026-10-18, all fixed)
- `SECURITY-AUDIT-2026-10-23.md`: whole-backend audit, findings #1–#14 and their status

---

## Open items (update as they close)

| Audit # | Item | Notes |
|---|---|---|
| 1 | Database dumps, TLS key, n8n key and 2,950-student roster committed to git | Rotate passwords and keys first, then purge history with `git filter-repo` |
| 6 | Other upload fields unvalidated; `/media/` served publicly, without login | `erp/upload_security.validate_upload` is ready to reuse |
| 7 | Coder preview serves student HTML/JS on the ERP origin | Move to a separate domain, or add a CSP `sandbox` |
| 10 | Hostel payments: no overpay cap, no replay protection, too many roles can record cash | |
| 11 | No JWT revocation on logout, no per-account lockout, no 2FA, tokens in `localStorage`, no CSP | OTP throttle done (2026-10-23) |
| 12 | Many endpoints still return `str(exception)` to the client | Fixed only in the analytics views |
| 13 | No backup automation or CI in the repo | |
| — | `is_staff` still acts as an admin shortcut in `timetable/views.py` `TimetableAssignmentViewSet.perform_create` / `perform_update` and in the timetable template/special-timetable querysets | |
| — | `faculty_exam_marks` GET pulls live from a linked Google Sheet without checking the exam lock | |
| — | Pre-existing failing tests unrelated to the security work: `academic_v2.tests_qp_type_api` secure-delete (passes a code where the view expects a UUID pk); `timetable.tests_venue` (imports a missing `Venue` model); six `timetable.tests_section_timetable_view` tests (fake `SimpleNamespace` user breaks `UserRateThrottle`) | |

---

## 2026-10-23: Access-control fixes (audit #2, #3, #4, #5, #6 partial, #8, #9, #14)

Status: applied to the working tree on branch `hostel`, **not committed**.

### New files
| File | Purpose |
|---|---|
| `backend/academic_v2/permissions.py` | `is_acv2_admin`, `IsAcV2Admin`, `IsAcV2AdminOrReadOnly`, `IsAcV2AdminForGenericWrites`. Admin = superuser or `academic_v2.page.admin`; `is_staff` deliberately not accepted |
| `backend/discipline/permissions.py` | Tiers: admin (IQAC/ADMIN/DC admin roles or `discipline.manage_config`), committee (DC roles only), reporter (STAFF/FACULTY role, `discipline.log_incident`, or a staff profile) |
| `backend/timetable/permissions.py` | `IsTimetableManagerOrReadOnly`: writes need superuser or `timetable.manage_templates` |
| `backend/erp/upload_security.py` | `validate_upload()`: extension allow-list, size cap (5 MB default), magic-byte check, random filename |
| `backend/accounts/tests_security_phase2.py` | 33 regression tests, one per closed hole |

### Changes by finding

**#2 Open self-registration**
- `backend/accounts/urls.py`, `views.py`, `serializers.py`: removed the `register/` route, `RegisterView` and `RegisterSerializer`. Nothing in any client used them.

**#3 Academic 2.1 marks and configuration** (`backend/academic_v2/views.py`)
- `IsAcV2AdminOrReadOnly` on: SemesterConfig, SemesterGroup (including the `@action` overrides), Version, ClassType, Cycle, CqiToken, QpType, CourseOutcome, QpPattern, Course, Section, UserPatternOverride.
- `IsAcV2Admin` (reads too) on: ExamAssignment, StudentMark, InternalMark. Faculty enter marks through the scoped `/exams/<id>/…` views, which are unchanged.
- `IsAcV2AdminForGenericWrites` on: EditRequest, CqiEditRequest. A plain PATCH could previously set `status: APPROVED`; the approve/reject/cancel actions keep their own checks.
- `_has_admin_bypass_access()` now delegates to `is_acv2_admin`, dropping `is_staff`.
- Google Sheets, a new hole found during the fix: any user could link a section to their own sheet and sync marks over it.
  - `google_sheet_links`, `oauth_status`, `oauth_start`, `sync_to_sheet`, `sync_from_sheet`, `pull_live`, `inject_script` and `create` now call `_require_admin`.
  - `google_sheets_derive_mark_manager` requires the section's faculty (`_user_owns_acv2_section`), checks the exam belongs to that section, and respects `is_editable()` when `apply` is set.
  - `google_sheets_webhook` verifies a per-section HMAC token (`google_sheets_service.webhook_token_for_section` / `verify_webhook_token`) and returns 409 on locked exams. The generated Apps Script now embeds `WEBHOOK_TOKEN` and sends `token`.
- `faculty_course_coattainment`: only the teaching assignment's own staff or an admin.
- `course_internal_summary`: admin-only (it leaked exam/section IDs).

**#4 Biometrics** (`backend/idcsscan/views.py`)
- Added `_has_biosecure_admin_permission`, `CanManageBiometrics` (card-management or scan permission) and `IsBioSecureAdmin` (IQAC/ADMIN/SECURITY/HOD/BIOSECURE_ADMIN).
- `CanManageBiometrics` on: FingerprintAllocateSlot, FingerprintEnroll, FingerprintIdentify, BioSecureDeviceMode (previously `AllowAny` on three of them).
- `IsBioSecureAdmin` on: BioSecureGroupList, BioSecureGroupDetail, BioSecureSectionsList, BioSecureAdminLogs.
- FingerprintStatus: callers see only their own status unless they are an operator.

**#5 Discipline** (`backend/discipline/views.py`)
- Incident list/create and student directory: `CanReportIncident` (were `AllowAny`). Non-committee staff only see `reported_by=request.user`.
- The reporter is always `request.user`; the anonymous `reported_by_username` spoof path is removed.
- Incident detail: GET for committee, reporter, the student concerned or the current approver; PUT/PATCH need committee; DELETE needs admin.
- Category create/edit/delete and flow POST: admin. Category GET: login required.
- Barcode Excel/ZIP exports: committee.
- `student-authorities`: students can only look up their own approval chain.
- Committee membership is decided by role name only, because migration `accounts.0036` grants `discipline.view_admin`/`view_logs` to every STAFF/FACULTY role.

**#6 Uploads (partial)** (`backend/discipline/views.py`)
- Receipt upload: only the incident's student or a discipline admin; file passed through `validate_upload`; the stored URL is taken from the saved file rather than the client filename.
- Incident document (multipart and base64 camera snapshot): passed through `validate_upload`, so `data:image/svg+xml` is rejected.

**#8 Analytics** (`backend/academic_v2/academic_performance_views.py`, `subject_analysis_views.py`)
- All 10 `AllowAny` views now use `IsAuthenticated`.
- Faculty-wise and subject-wise list modes: a non-college-wide user with no department sees only their own teaching assignments, instead of the whole college.
- The catch-all `except Exception` blocks re-raise `APIException` (so 403 stays 403) and return a generic message instead of `str(e)`.

**#9 Other configuration**
- `backend/timetable/views.py`: `IsTimetableManagerOrReadOnly` on TimetableTemplate, TimetableSlot, CreditAllocation, ClassTypeException, GroupAllocation, VenueExceptionRule, CourseExceptionRule, SpecialPeriodRule; added `TimetableAssignmentViewSet.perform_destroy` (previously anyone could delete).
- `backend/academics/views.py`: `BatchYearViewSet` writes need IQAC or superuser (`_SuperuserOr(IsIQAC)`).
- `backend/COE/`: `IsCoeUser` on all external-staff views (which exposed `login_code`), SeatingArrangementExcelView (both files), PublishHallPlanView and HallAttendancePdfView.

**#11 (partial)**
- `backend/accounts/views.py` `MobileOtpRequestView`: `ScopedRateThrottle`, scope `otp`.
- `backend/erp/settings.py`: `'otp': os.getenv('THROTTLE_OTP_RATE', '5/min')`.

**#14 HOD scope type bug**
- Department ID comparisons now cast to `str` in FacultyWise detail and SubjectWise detail.

### Test changes
- `academic_v2/tests_qp_type_api.py` and `academic_v2/tests_google_sheets.py` used role-less users for admin writes. They now authenticate as superuser.

### Verification
- `python manage.py check`: clean (the existing `academic_v2` namespace warning remains).
- `python manage.py test accounts.tests_security_phase2 --keepdb`: 33/33 pass.
- Also run: `accounts.tests_security_phase1`, `academic_v2.tests_qp_type_api`, `academic_v2.tests_google_sheets`, `academic_v2.tests_import_excel`, `academics.tests_batch_setup`, `academics.tests_sync_assignments`, `academics.tests_database_integrity`, `academics.tests_student_import_reg`, `timetable.*`. The only failures are the pre-existing ones listed under Open items.

### After deploying
1. Re-inject the Apps Script on every linked Google Sheet. Old scripts send no token and get 403.
2. KR Tracker staff must be logged in to submit incidents.
3. Discipline committee members can edit but no longer delete incidents.
4. Anyone who relied on Django `is_staff` for Academic 2.1 admin needs a role with `academic_v2.page.admin`.
5. Optional: set `THROTTLE_OTP_RATE` if `5/min` is too strict.

---

## 2026-10-18: Student bulk import

See `SECURITY-REVIEW.md` (findings 1–11, all fixed): `students.bulk_import` permission (migration `academics.0106`), password validators, upload caps, per-row savepoints, generic errors, `DEFAULT_PERMISSION_CLASSES = IsAuthenticated`, throttles on token issue and import.
