from __future__ import annotations

from typing import Optional, Set

from applications import models as app_models


def _norm_role_name(value) -> str:
    return str(value or "").strip().upper()


# Highest authority first.
# This is used only to decide which *starter role* flow to prefer
# when a single user can initiate multiple flows.
ROLE_PRIORITY: list[str] = [
    "ADMIN",
    "PRINCIPAL",
    "HOD",
    "AHOD",
    "ADVISOR",
    "MENTOR",
    "FACULTY",
    "STAFF",
    "STUDENT",
]


def get_user_effective_role_names(user) -> Set[str]:
    """Return effective role names for a user.

    Includes:
    - User.roles (logical roles)
    - Staff DepartmentRole roles (HOD/AHOD)
    - Staff RoleAssignment roles (time-bound authority roles)

    Returns uppercase role names.
    """
    roles: Set[str] = set()

    if user is None:
        return roles

    try:
        roles.update({_norm_role_name(r.name) for r in user.roles.all()})
    except Exception:
        pass

    staff_profile = None
    try:
        staff_profile = getattr(user, "staff_profile", None)
    except Exception:
        staff_profile = None

    if staff_profile is not None:
        try:
            from academics.models import DepartmentRole

            dept_roles = (
                DepartmentRole.objects.filter(staff=staff_profile, is_active=True)
                .values_list("role", flat=True)
            )
            roles.update({_norm_role_name(r) for r in dept_roles})
        except Exception:
            pass

        try:
            from academics.models import RoleAssignment

            ra_roles = (
                RoleAssignment.objects.filter(staff=staff_profile, end_date__isnull=True)
                .values_list("role_name", flat=True)
            )
            roles.update({_norm_role_name(r) for r in ra_roles})
        except Exception:
            pass

    roles.discard("")
    return roles


def get_user_last_role_name(user) -> Optional[str]:
    """Best-effort "last role" for flow-starter preference.

    Heuristic:
    - Start with logical roles ordered by Role.id
    - Append active DepartmentRole roles ordered by DepartmentRole.id
    - Append active RoleAssignment role_name ordered by (created_at, id)

    The last non-empty role in this combined sequence is returned.
    """
    if user is None:
        return None

    ordered: list[str] = []

    try:
        ordered.extend([_norm_role_name(n) for n in user.roles.order_by("id").values_list("name", flat=True)])
    except Exception:
        pass

    staff_profile = None
    try:
        staff_profile = getattr(user, "staff_profile", None)
    except Exception:
        staff_profile = None

    if staff_profile is not None:
        try:
            from academics.models import DepartmentRole

            ordered.extend(
                [
                    _norm_role_name(n)
                    for n in DepartmentRole.objects.filter(staff=staff_profile, is_active=True)
                    .order_by("id")
                    .values_list("role", flat=True)
                ]
            )
        except Exception:
            pass

        try:
            from academics.models import RoleAssignment

            ordered.extend(
                [
                    _norm_role_name(n)
                    for n in RoleAssignment.objects.filter(staff=staff_profile, end_date__isnull=True)
                    .order_by("created_at", "id")
                    .values_list("role_name", flat=True)
                ]
            )
        except Exception:
            pass

    for name in reversed(ordered):
        if name:
            return name

    return None


def get_user_preferred_starter_roles(user) -> list[str]:
    """Return user roles ordered by preference for flow starter selection.

    We use a fixed priority list rather than relying on DB ordering.
    Only roles the user effectively has are returned.

    NOTE: Prefer using `get_user_preferred_starter_roles_for_type()` when an
    application_type is known (admin-configurable manual ordering).
    """
    effective = get_user_effective_role_names(user)
    preferred = [r for r in ROLE_PRIORITY if r in effective]

    # Include any other effective roles (unknown/custom) at the end.
    extras = sorted([r for r in effective if r not in set(ROLE_PRIORITY)])
    preferred.extend(extras)
    return preferred


def _get_manual_priority_for_type(application_type_id: int | None) -> Optional[list[str]]:
    if not application_type_id:
        return None
    try:
        rows = (
            app_models.ApplicationRoleHierarchy.objects.filter(application_type_id=application_type_id)
            .select_related('role')
            .order_by('rank', 'role__name')
        )
    except Exception:
        return None

    names: list[str] = []
    for row in rows:
        try:
            names.append(_norm_role_name(getattr(row.role, 'name', None)))
        except Exception:
            continue

    names = [n for n in names if n]
    return names or None


def _get_stage_priority_for_type(application_type_id: int | None, user, effective_roles: Set[str]) -> Optional[list[str]]:
    """Return ordered role names for the selected stage, or None.

    Stage selection:
    1) If user is explicitly assigned to any stage, pick the earliest stage by order.
    2) Else pick the first stage whose stage_roles intersect user's effective roles.

    Returned list is role names ordered by stage role rank.
    """
    if not application_type_id or user is None:
        return None

    try:
        user_id = getattr(user, 'id', None)
    except Exception:
        user_id = None
    if not user_id:
        return None

    try:
        stages_list = list(
            app_models.ApplicationRoleHierarchyStage.objects.filter(application_type_id=application_type_id)
            .order_by('order', 'id')
        )
    except Exception:
        return None
    if not stages_list:
        return None

    stage_ids = [sid for s in stages_list if (sid := getattr(s, 'id', None))]
    if not stage_ids:
        return None

    # Build lookup maps so we don't rely on Django reverse manager attributes,
    # which static type checkers typically cannot infer.
    try:
        pinned_stage_ids = set(
            app_models.ApplicationRoleHierarchyStageUser.objects.filter(
                stage_id__in=stage_ids,
                user_id=user_id,
            ).values_list('stage_id', flat=True)
        )
    except Exception:
        pinned_stage_ids = set()

    stage_roles_map: dict[int, list[str]] = {sid: [] for sid in stage_ids}
    try:
        stage_role_rows = (
            app_models.ApplicationRoleHierarchyStageRole.objects.filter(stage_id__in=stage_ids)
            .select_related('role')
            .order_by('rank', 'role__name')
        )
        for sr in stage_role_rows:
            sid = getattr(sr, 'stage_id', None)
            if not sid:
                continue
            stage_roles_map.setdefault(sid, [])
            stage_roles_map[sid].append(_norm_role_name(getattr(sr.role, 'name', None)))
    except Exception:
        stage_roles_map = {sid: [] for sid in stage_ids}

    for sid in list(stage_roles_map.keys()):
        stage_roles_map[sid] = [n for n in stage_roles_map[sid] if n]

    selected = None

    # (1) explicit user override
    for stage in stages_list:
        if getattr(stage, 'id', None) in pinned_stage_ids:
            selected = stage
            break

    # (2) role-intersection
    if selected is None:
        for stage in stages_list:
            sid = getattr(stage, 'id', None)
            if not sid:
                continue
            stage_role_names = stage_roles_map.get(sid) or []
            if not stage_role_names:
                continue
            if any((n in effective_roles) for n in stage_role_names):
                selected = stage
                break

    if selected is None:
        return None

    sid = getattr(selected, 'id', None)
    if not sid:
        return None
    ordered_roles = stage_roles_map.get(sid) or []
    ordered_roles = [n for n in ordered_roles if n]
    return ordered_roles or None


def get_user_preferred_starter_roles_for_type(user, *, application_type_id: int | None) -> list[str]:
    """Return user roles ordered by preference, allowing per-type overrides.

    If a manual priority exists for the application type, it is applied first.
    Any remaining effective roles fall back to the default ROLE_PRIORITY order,
    then any unknown/custom roles are appended alphabetically.
    """
    effective = get_user_effective_role_names(user)
    if not effective:
        return []

    stage_roles = _get_stage_priority_for_type(application_type_id, user, effective)
    if stage_roles:
        base = stage_roles
        base_set = set(base)
        preferred: list[str] = [r for r in base if r in effective]
        # keep legacy known roles not present in stage ordering
        preferred.extend([r for r in ROLE_PRIORITY if r in effective and r not in set(preferred)])
        extras = sorted([r for r in effective if r not in set(preferred)])
        preferred.extend(extras)
        return preferred

    manual = _get_manual_priority_for_type(application_type_id)
    base = manual or ROLE_PRIORITY
    base_set = set(base)

    preferred: list[str] = [r for r in base if r in effective]

    # Ensure legacy known roles not present in manual ordering still participate.
    if manual:
        preferred.extend([r for r in ROLE_PRIORITY if r in effective and r not in base_set])

    extras = sorted([r for r in effective if r not in set(preferred)])
    preferred.extend(extras)
    return preferred


def _check_flow_initiation(flow: app_models.ApprovalFlow, user, effective_roles: Set[str], application_type_id: int | None, preferred_rank: dict) -> tuple[bool, int]:
    try:
        steps = getattr(flow, "steps", None)
        if steps is None:
            return False, 10_000
        first_step = steps.select_related("role", "stage").order_by("order").first()
    except Exception:
        return False, 10_000

    if first_step is None:
        return False, 10_000

    stage_id = getattr(first_step, 'stage_id', None)
    if stage_id:
        # 1. Pinned exactly to this stage
        try:
            if app_models.ApplicationRoleHierarchyStageUser.objects.filter(stage_id=stage_id, user=user).exists():
                return True, -10  # Highest priority
        except Exception:
            pass

        # 2. Check if pinned to some other stage (if so, they act as that stage strictly)
        if application_type_id:
            try:
                if app_models.ApplicationRoleHierarchyStageUser.objects.filter(
                    user=user, stage__application_type_id=application_type_id
                ).exists():
                    # Pinned to a different stage, so cannot initiate this one
                    return False, 10_000
            except Exception:
                pass

        # 3. Not pinned, evaluate through stage roles
        can_init = False
        best_rank = 10_000
        try:
            stage_role_ids = list(
                app_models.ApplicationRoleHierarchyStageRole.objects
                .filter(stage_id=stage_id)
                .values_list('role_id', flat=True)
            )
            from accounts.models import Role
            for role_obj in Role.objects.filter(id__in=stage_role_ids):
                rn = _norm_role_name(getattr(role_obj, 'name', None))
                if _user_has_role(user, rn, effective_roles):
                    can_init = True
                    best_rank = min(best_rank, preferred_rank.get(rn, 10_000))
        except Exception:
            pass
        return can_init, best_rank

    # Normal Role step
    role = getattr(first_step, 'role', None)
    if role:
        role_name = _norm_role_name(getattr(role, 'name', None))
        if _user_has_role(user, role_name, effective_roles):
            return True, preferred_rank.get(role_name, 10_000)

    return False, 10_000


def _user_has_role(user, role_name: str, effective_roles: Set[str]) -> bool:
    role_key = _norm_role_name(role_name)
    if not role_key or user is None:
        return False

    if role_key in effective_roles:
        return True

    if role_key == "STUDENT":
        try:
            return getattr(user, "student_profile", None) is not None
        except Exception:
            return False

    if role_key == "STAFF":
        try:
            return getattr(user, "staff_profile", None) is not None
        except Exception:
            return False

    return False


def select_best_initiable_flow(
    flows_qs,
    user,
    *,
    application_type_id: int | None = None,
) -> Optional[app_models.ApprovalFlow]:
    """Pick the best flow from a candidate queryset for this user.

     Preference order:
     1) Pinned stage users for stage steps get highest priority.
     2) Flow whose starter role is the highest-priority role the user has.
     3) Any other flow whose starter role is initiable by the user.
     Tiebreaker: newest flow id.

    Returns None if no flows are initiable.
    """
    if flows_qs is None:
        return None

    flows = list(flows_qs.order_by("-id"))
    if not flows:
        return None

    effective_roles = get_user_effective_role_names(user)
    preferred_roles = get_user_preferred_starter_roles_for_type(user, application_type_id=application_type_id)
    preferred_rank = {name: idx for idx, name in enumerate(preferred_roles)}

    best_flow: Optional[app_models.ApprovalFlow] = None
    best_key: tuple[int, int] | None = None

    for flow in flows:
        can_initiate, rank = _check_flow_initiation(flow, user, effective_roles, application_type_id, preferred_rank)
        if not can_initiate:
            continue

        key = (rank, -int(getattr(flow, "id", 0) or 0))
        if best_key is None or key < best_key:
            best_key = key
            best_flow = flow

    return best_flow
