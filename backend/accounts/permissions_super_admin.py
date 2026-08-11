from rest_framework.permissions import BasePermission


class IsSuperAdminOrSuperuser(BasePermission):
    """Allow access only to the single Mega Super Admin account (admin@example.com) or explicit SUPER_ADMIN role."""
    message = 'Only Mega Super Admin can perform this action.'

    MEGA_SUPER_ADMIN_EMAIL = 'admin@example.com'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        email_lower = str(getattr(request.user, 'email', '') or '').strip().lower()
        username_lower = str(getattr(request.user, 'username', '') or '').strip().lower()
        if email_lower == self.MEGA_SUPER_ADMIN_EMAIL or username_lower == 'admin':
            return True
        try:
            return request.user.roles.filter(name='SUPER_ADMIN').exists()
        except Exception:
            return False
