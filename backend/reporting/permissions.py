from rest_framework.permissions import BasePermission


REQUIRED_PERMISSION = 'reporting.view_powerbi_data'


def can_access_reporting(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        return bool(user.has_perm(REQUIRED_PERMISSION))
    except Exception:
        return False


class CanViewPowerBIData(BasePermission):
    message = 'You do not have reporting access.'

    def has_permission(self, request, view):
        return can_access_reporting(getattr(request, 'user', None))
