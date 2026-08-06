from rest_framework.permissions import BasePermission


class IsSuperAdminOrSuperuser(BasePermission):
    """Allow access only to users with SUPER_ADMIN role or Django superusers."""
    message = 'Only Super Admins can perform this action.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(request.user, 'is_superuser', False):
            return True
        try:
            return request.user.roles.filter(name='SUPER_ADMIN').exists()
        except Exception:
            return False
