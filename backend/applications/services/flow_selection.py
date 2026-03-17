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
    """
    effective = get_user_effective_role_names(user)
    preferred = [r for r in ROLE_PRIORITY if r in effective]

    # Include any other effective roles (unknown/custom) at the end.
    extras = sorted([r for r in effective if r not in set(ROLE_PRIORITY)])
    preferred.extend(extras)
    return preferred


def _flow_starter_role_name(flow: app_models.ApprovalFlow) -> Optional[str]:
    if flow is None:
        return None

    try:
        steps = getattr(flow, "steps", None)
        if steps is None:
            return None
        first_step = steps.select_related("role").order_by("order").first()
    except Exception:
        first_step = None

    if first_step is None or getattr(first_step, "role", None) is None:
        return None

    return _norm_role_name(getattr(first_step.role, "name", None))


def _user_can_initiate_role(user, role_name: str, effective_roles: Set[str]) -> bool:
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


def select_best_initiable_flow(flows_qs, user) -> Optional[app_models.ApprovalFlow]:
    """Pick the best flow from a candidate queryset for this user.

     Preference order:
     1) Flow whose starter role is the highest-priority role the user has
         (e.g., HOD/AHOD preferred over STAFF).
     2) Any other flow whose starter role is initiable by the user.
     Tiebreaker: newest flow id.

    Returns None if no flows are initiable.
    """
    if flows_qs is None:
        return None

    flows = list(flows_qs.order_by("-id"))
    if not flows:
        return None

    effective_roles = get_user_effective_role_names(user)
    preferred_roles = get_user_preferred_starter_roles(user)
    preferred_rank = {name: idx for idx, name in enumerate(preferred_roles)}

    best_flow: Optional[app_models.ApprovalFlow] = None
    best_key: tuple[int, int] | None = None

    for flow in flows:
        starter = _flow_starter_role_name(flow)
        if not starter:
            continue

        if not _user_can_initiate_role(user, starter, effective_roles):
            continue

        # Rank by user's preferred starter role ordering.
        # Unknown starter roles that are still initiable will be considered after known roles.
        rank = preferred_rank.get(starter, 10_000)
        key = (rank, -int(getattr(flow, "id", 0) or 0))
        if best_key is None or key < best_key:
            best_key = key
            best_flow = flow

    return best_flow
