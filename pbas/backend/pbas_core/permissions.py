from rest_framework.permissions import BasePermission

IQAC_MANAGER_ROLES = {'IQAC', 'ADMIN', 'PRINCIPAL', 'PBAS_ADMIN', 'PBAS_MANAGER', 'PBASADMIN'}
APPROVER_ROLES = {'HOD', 'PRINCIPAL', 'PBAS_APPROVER', 'IQAC', 'ADMIN', 'PBAS_ADMIN', 'MENTOR'}

def _user_has_any_role(user, names: set[str]) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        user_roles = {r.name.upper() for r in user.roles.all()}
        return bool(user_roles & names)
    except Exception:
        return False

class IsIQACManager(BasePermission):
    def has_permission(self, request, view):
        return _user_has_any_role(getattr(request, 'user', None), IQAC_MANAGER_ROLES)

class IsApprover(BasePermission):
    def has_permission(self, request, view):
        u = getattr(request, 'user', None)
        if not u or not u.is_authenticated:
            return False
        if getattr(u, 'is_superuser', False):
            return True
        if _user_has_any_role(u, APPROVER_ROLES):
            return True
        # Also check if assigned to any node
        try:
            return u.pbas_approver_nodes.exists()
        except Exception:
            return False

class IsAuthenticatedSubmitter(BasePermission):
    def has_permission(self, request, view):
        u = getattr(request, 'user', None)
        return bool(u and u.is_authenticated)
