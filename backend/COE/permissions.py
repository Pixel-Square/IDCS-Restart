from rest_framework import permissions
from accounts.utils import get_user_permissions

COE_PORTAL_LOGIN_EMAIL = 'coe@krct.ac.in'
COE_PORTAL_ACCESS_PERMISSION = 'coe.portal.access'


class IsCoeUser(permissions.BasePermission):
    """
    Allows access only to authenticated users who:
    1. Are superusers, OR
    2. Have the dedicated COE email (coe@krct.ac.in), OR
    3. Hold the 'coe.portal.access' permission, OR
    4. Belong to the 'COE' role.
    """
    message = 'You do not have permission to access COE portal resources.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False

        if getattr(user, 'is_superuser', False):
            return True

        email = str(getattr(user, 'email', '') or '').strip().lower()
        if email == COE_PORTAL_LOGIN_EMAIL:
            return True

        if hasattr(user, 'roles') and user.roles.filter(name__iexact='COE').exists():
            return True

        perms = set(get_user_permissions(user) or [])
        return COE_PORTAL_ACCESS_PERMISSION in perms
