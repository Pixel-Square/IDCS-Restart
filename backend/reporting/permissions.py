from rest_framework.permissions import BasePermission


REQUIRED_PERMISSION = 'reporting.view_powerbi_data'
ACADEMIC_STAFF_PERMISSION = 'academic_v2.page.staff'


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


def is_reporting_api_key_auth(request) -> bool:
    auth = getattr(request, 'auth', None)
    return isinstance(auth, dict) and auth.get('scheme') == 'reporting_api_key'


class CanViewPowerBIDataOrApiKey(BasePermission):
    message = 'You do not have reporting access.'

    def has_permission(self, request, view):
        if is_reporting_api_key_auth(request):
            return True
        return can_access_reporting(getattr(request, 'user', None))


def can_access_course_dashboard(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        return bool(user.has_perm(REQUIRED_PERMISSION) or user.has_perm(ACADEMIC_STAFF_PERMISSION))
    except Exception:
        return False


class CanViewCourseDashboardOrApiKey(BasePermission):
    message = 'You do not have reporting access.'

    def has_permission(self, request, view):
        if is_reporting_api_key_auth(request):
            return True
        return can_access_course_dashboard(getattr(request, 'user', None))
