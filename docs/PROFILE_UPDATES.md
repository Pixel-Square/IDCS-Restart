**Profile & Role Safety — 4-Phase Summary**

This document summarizes the four phases of identity, role, and lifecycle updates applied to the ERP backend. It explains design goals, key code locations, compatibility notes, and recommended follow-ups.

**Overview**
- **Goal:** Make user identity, profile, and role data safe, auditable, and time-aware so the ERP can evolve without corrupting history or enabling privilege escalation.
- **Scope:** `accounts` and `academics` apps only. NO academic logic or permission tables were reworked beyond safety guards.

**Phase 1 — Profile integrity & immutable identifiers**
- **Why:** Prevent orphan or dual-profile users and identifier collisions.
- **What changed:**
  - Enforced one-to-one `User` ↔ `StudentProfile` / `StaffProfile`.
  - Added immutability checks for identifiers `reg_no` and `staff_id` (raise `ValidationError` when modified).
  - Identifier uniqueness preserved (`unique=True`).
  - Admin inlines made identifiers readonly when editing existing profiles.
  - `/api/accounts/me/` now includes `profile_type` and minimal `profile` payload.
- **Files touched:** [backend/academics/models.py](backend/academics/models.py), [backend/accounts/serializers.py](backend/accounts/serializers.py), [backend/accounts/admin.py](backend/accounts/admin.py)
- **Notes:** Validation occurs at model and admin form levels.

**Phase 2 — Role ↔ Profile integrity**
- **Why:** Prevent students from acquiring staff privileges and vice-versa; ensure authorization assumptions are valid.
- **What changed:**
  - Centralized validator `validate_roles_for_user(user, roles)` added.
  - Validation enforced in `UserRole.save()` and via `m2m_changed` on `User.roles` (blocks invalid adds/removals and prevents leaving zero roles).
  - Admin form for `UserRole` surfaces validation errors (friendly admin errors instead of exception pages).
- **Files touched:** [backend/accounts/models.py](backend/accounts/models.py), [backend/accounts/admin.py](backend/accounts/admin.py)
- **Notes:** Legacy users with invalid role/profile combos should be scanned and remediated (not silently fixed).

**Phase 3 — Lifecycle & safe deactivation**
- **Why:** Avoid hard-deleting profiles/users (loss of history) and support reversible offboarding (graduation, resignation, suspension).
- **What changed:**
  - Profile `status` added: `ACTIVE | INACTIVE | ALUMNI | RESIGNED`.
  - Removed destructive `post_delete` signals that deleted `User` when a profile was deleted.
  - `accounts.services.deactivate_user(user, profile_status, reason, actor)` implemented — sets `user.is_active=False`, updates profile status, logs operation.
  - Admin UX: actions added to deactivate users/profiles and to mark `ALUMNI` / `RESIGNED`; delete actions remain available as explicit admin actions for permanent purge.
  - `/api/accounts/me/` includes `profile.status` in the `profile` object.
- **Files touched:** [backend/academics/models.py](backend/academics/models.py), [backend/accounts/services.py](backend/accounts/services.py), [backend/accounts/serializers.py](backend/accounts/serializers.py), admin files.

**Phase 4 — Time-bound assignments (history preservation)**
- **Why:** Affiliations (department, section, authority roles) change over time and must be queryable historically.
- **What changed:**
  - Introduced assignment models that are immutable in history:
    - `StudentSectionAssignment` (student → section, start/end)
    - `StaffDepartmentAssignment` (staff → department, start/end)
    - `RoleAssignment` (staff → term-based authority, start/end)
  - New assignments auto-end prior active assignment of the same type; DB-level unique constraints prevent multiple active assignments.
  - Profile properties/helpers added to resolve effective values (`current_section`, `current_department`) that fall back to legacy fields.
  - Admin interfaces to create/end assignments and to display the effective current affiliation.
- **Files touched:** [backend/academics/models.py](backend/academics/models.py), [backend/academics/admin.py](backend/academics/admin.py), [backend/academics/services/__init__.py](backend/academics/services/__init__.py)

**Backwards compatibility & migration guidance**
- Legacy static fields (`StudentProfile.section`, `StaffProfile.department`) were retained as fallbacks and marked read-only in admin. This enables a gradual migration.
- Recommended non-destructive backfill plan:
  1. Run a script to create a `*_Assignment` row for every profile that has a legacy field set (use `start_date` = profile creation or sensible archive date).
  2. Verify reports use `current_*` helpers before switching all callers.
 3. After a deprecation period, consider dropping legacy fields in a separate migration.

**Admin & operational notes**
- Admin contains both safe actions (deactivate, mark alumni/resigned, end assignment) and explicit destructive actions (permanent delete). Use permanent delete only when necessary and after export/backups.
- Validation errors are surfaced in admin forms rather than raising exception pages (improves admin UX).

**Testing checklist**
- Unit tests for:
  - role ↔ profile validation function and `m2m_changed` behavior
  - `deactivate_user` lifecycle function
  - assignment creation auto-ends previous active assignment
  - `current_section` / `current_department` fallbacks
- Integration tests for `/api/accounts/me/` payload and admin actions.

**Next recommended actions**
- Add management command to scan for legacy invalid role/profile states and report or fix them.
- Add non-destructive backfill command to populate assignment tables from legacy profile fields.
- Add an audit/log table for lifecycle events (deactivation, permanent deletes) if auditability is required beyond server logs.

If you want, I can add the backfill management command next. Reply with "Backfill now" and I will implement it.
