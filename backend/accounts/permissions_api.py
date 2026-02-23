from rest_framework import permissions


class HasPermissionCode(permissions.BasePermission):
    """Checks custom RolePermission codes (accounts.Permission.code)."""

    required_permission_code: str = ''

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False

        required = getattr(view, 'required_permission_code', None) or self.required_permission_code
        required = str(required or '').strip().lower()
        if not required:
            return True

        try:
            from .utils import get_user_permissions

            perms = {str(p or '').strip().lower() for p in (get_user_permissions(user) or set())}
        except Exception:
            perms = set()

        return required in perms or bool(getattr(user, 'is_superuser', False))
