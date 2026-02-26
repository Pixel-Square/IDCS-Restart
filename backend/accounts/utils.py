from typing import Set

from .models import RolePermission


def get_user_permissions(user) -> Set[str]:
    """Return a set of permission codes assigned to *user* via their roles.

    Uses the database efficiently by querying the RolePermission table and
    avoids loading unnecessary objects into Python.
    """
    if user is None:
        return set()

    # RolePermission -> role -> user_roles -> user
    qs = RolePermission.objects.filter(role__user_roles__user=user).values_list('permission__code', flat=True).distinct()
    # Strip trailing periods/whitespace that may have been entered incorrectly in the DB
    return {str(p).strip().rstrip('.') for p in qs if p}
