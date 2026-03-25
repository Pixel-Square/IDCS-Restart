from typing import Set

from .models import RolePermission


def get_user_permissions(user) -> Set[str]:
    """Return a set of permission codes assigned to *user* via their roles.

    Only permissions granted to `accounts.Role` entries explicitly linked to
    the user (via `User.roles` / `UserRole`) are returned. Do not derive
    permissions from department-role or assignment tables — this ensures the
    UI shows items only when the user actually has the Role record.
    """
    if user is None:
        return set()

    qs = RolePermission.objects.filter(role__user_roles__user=user).values_list('permission__code', flat=True).distinct()
    return {str(p).strip().rstrip('.') for p in qs if p}
