# Applications App — Workflow & Architecture (snapshot)

This document describes the `applications` Django app, its DB-driven approval workflow, service layer, API surface, and current status as of the last edits.

## Purpose
- Provide a generic, configurable application (request) + approval workflow engine that supports:
  - DB-configured flows and steps (ApprovalFlow, ApprovalStep)
  - Dynamic approver resolution (mentor, advisor, HOD, AHOD, etc.)
  - Transactional service-layer approval processing (approve / reject / auto-skip)
  - Canonical application state machine (`current_state`)
  - Approver Inbox for end-users

## Key Models (high level)
- `ApplicationType` — metadata / schema for an application type (e.g., LEAVE)
- `ApplicationField` — form fields for `ApplicationType`
- `Application` — a submitted request instance; includes `current_step` FK, `current_state` (enum), `final_decision_at`, `applicant_user`, and legacy `status` kept in-sync
- `ApplicationData` — per-field values for an `Application`
- `ApprovalFlow` — named flow for a type (ordered steps)
- `ApprovalStep` — step in flow with `role` (semantic approver) and order
- `ApprovalAction` — records APPROVED/REJECTED actions by users (auditable history)
- `RoleApplicationPermission` — mapping of roles permitted to submit/act (if used)

Refer to `applications/models.py` for fields and constraints.

## State Machine
- Canonical state stored on `Application.current_state` (enum): e.g. DRAFT → SUBMITTED → IN_REVIEW → APPROVED/REJECTED/CANCELLED.
- `applications/services/application_state.py` exposes atomic functions: `submit_application()`, `move_to_in_review()`, `approve_application()`, `reject_application()`, `cancel_application()`.
- All state transitions are performed via these helpers to keep state authoritative and avoid race conditions.

## Service Layer
- `applications/services/approval_engine.py` — core approval processing (transactional):
  - `get_current_approval_step(application)`
  - `get_next_approval_step(application)`
  - `user_can_act(application, user)` — checks whether a user is eligible to act (role or override)
  - `process_approval(application, user, action, remarks=...)` — primary entrypoint for APPROVE/REJECT; records `ApprovalAction`, prevents duplicate approvals, auto-skips unavailable approvers, and delegates state transitions to `application_state` service.

- `applications/services/application_state.py` — encapsulates state changes and persists `final_decision_at` and legacy `status` for compatibility.

- `academics/services/authority_resolver.py` — maps semantic approver roles to concrete `StaffProfile` users (mentor/advisor/HOD/AHOD). Contains `is_staff_available()` stub which should be replaced by real leave/availability checks.

- `applications/services/approver_resolver.py` — given an `Application` and `ApprovalStep`, resolves concrete `User` (via `authority_resolver`).

- `applications/services/inbox_service.py` — builds the approver inbox for a `user`:
  - returns applications in `IN_REVIEW` whose resolved approver equals `user` or where `user_can_act()` returns True (override roles).
  - uses `select_related` and iteration to avoid N+1 queries.

## API Surface (implemented)
- `POST /api/applications/` — create application (via serializers)
- `GET /api/applications/my/` — list my applications
- `GET /api/applications/pending/` — list pending (legacy/simple filter)
- `GET /api/applications/inbox/` — (name=`approver-inbox`) Approver Inbox for current user (requires Bearer JWT)
- `GET /api/applications/{id}/` — detail view (owner or approver)
- `POST /api/applications/{id}/approve/` — approve action (calls `process_approval`)
- `POST /api/applications/{id}/reject/` — reject action (calls `process_approval`)

Files: see `applications/views/application_views.py` and `applications/views/inbox_views.py`.

## Serializers
- `applications/serializers/*` implement create/list/detail serializers for Application and `ApproverInboxItemSerializer` for inbox items.

## Admin & Management
- Models registered in `applications/admin.py` for CRUD and inspection in admin.
- Diagnostic scripts added in `scripts/`:
  - `inspect_approval.py` — inspects a specific application and its flow/steps/actions
  - `dump_app_state.py` — dumps application and approval action rows for debugging

## Migrations
- New models in `applications` and `academics` required migrations; previously created and applied migrations for academic mapping models (e.g., `StudentMentorMap`, `SectionAdvisor`, `DepartmentRole`). Use `python manage.py makemigrations` / `migrate` if schema changes are made.

## How the approval flow runs (sequence)
1. User submits an `Application` (status/state moves to SUBMITTED via `application_state.submit_application`).
2. System moves to IN_REVIEW and sets `current_step` = first `ApprovalStep` in `ApprovalFlow`.
3. `inbox_service` or `approval_engine.user_can_act()` determines who can act next:
   - First try: `approver_resolver.resolve_current_approver()` → a concrete `User` (mentor/advisor/etc.)
   - Fallback: role-based/override checks via `approval_engine.user_can_act()`
4. Approver calls `POST /approve/` or `/reject/` → `approval_engine.process_approval()`:
   - Validates approver eligibility
   - Creates `ApprovalAction` (APPROVED or REJECTED)
   - If APPROVE: sets next step or marks final APPROVED (via `application_state.approve_application()`)
   - If REJECT: marks application REJECTED immediately (via `application_state.reject_application()`)
   - Auto-skip: engine can skip steps for unavailable approvers (calls `is_staff_available()` stub)

## Testing / Quick checks
- Create or ensure a test user; set password via Django shell if necessary.
- Obtain JWT via `POST /api/accounts/token/` using `identifier` (email/reg_no/staff_id) and `password`.
- Call the inbox endpoint with `Authorization: Bearer <access>`.
- Approve/reject endpoints accept JSON `{ "remarks": "..." }`.

## Known Issues & TODOs
- `academics.services.is_staff_available()` is currently a stub — replace with real leave/availability checks.
- Some duplicate `ApprovalAction` rows were found in earlier debugging; the engine now prevents duplicates, but existing duplicates may need cleanup via a maintenance script.
- `inbox` view currently returns all items (no pagination). Consider adding pagination and filtering.
- Consider removing legacy `status` after migrating all code paths to `current_state`.

## Files to review
- `applications/models.py`
- `applications/admin.py`
- `applications/serializers/*.py`
- `applications/services/approval_engine.py`
- `applications/services/application_state.py`
- `applications/services/inbox_service.py`
- `applications/services/approver_resolver.py`
- `academics/services/authority_resolver.py`
- `applications/views/*.py` (including `inbox_views.py`)

## Next recommended steps
1. Wire real availability checks into `authority_resolver.is_staff_available`.
2. Add pagination/filtering to `/api/applications/inbox/` and optimize prefetching if necessary.
3. Add automated tests for the approval engine and resolver edge cases (auto-skip, override roles, duplicate actions).
4. Optional: add a small management command to reconcile duplicate `ApprovalAction` rows safely.

----
Document generated by developer assistant — updated snapshot of `applications` app workflow.
