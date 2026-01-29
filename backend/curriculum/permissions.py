from rest_framework import permissions

from accounts.utils import get_user_permissions


class IsIQACOrReadOnly(permissions.BasePermission):
    """Allow safe methods to any authenticated user.

    For modifying curriculum masters, allow superusers, members of the IQAC or HAA groups,
    or users whose role-based permissions include the appropriate curriculum master edit code.
    This supports both legacy dotted codes (e.g. 'curriculum.master.edit') and
    uppercase codes (e.g. 'CURRICULUM_MASTER_EDIT').
    """

    WRITE_PERMS = {'curriculum.master.edit', 'CURRICULUM_MASTER_EDIT', 'CURRICULUM_MASTER_PUBLISH', 'curriculum.master.publish'}

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated

        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        # group-based shortcuts
        if user.groups.filter(name__in=['IQAC', 'HAA']).exists():
            return True

        # check role-permissions assigned via accounts.RolePermission
        perms = get_user_permissions(user)
        if perms & self.WRITE_PERMS:
            return True

        return False
