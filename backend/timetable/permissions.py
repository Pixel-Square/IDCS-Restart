"""Server-side permission classes for timetable configuration."""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.utils import get_user_permissions

TIMETABLE_MANAGE_PERMISSION = 'timetable.manage_templates'


def is_timetable_manager(user) -> bool:
    """Superuser or a role holding ``timetable.manage_templates`` (the IQAC timetable page gate)."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        return TIMETABLE_MANAGE_PERMISSION in get_user_permissions(user)
    except Exception:
        return False


class IsTimetableManagerOrReadOnly(BasePermission):
    """Reads for any authenticated user; writes (custom actions included) for timetable managers."""

    message = 'Timetable management permission is required to change timetable configuration.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return is_timetable_manager(user)
