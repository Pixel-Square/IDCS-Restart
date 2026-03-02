from __future__ import annotations

from rest_framework.permissions import BasePermission, SAFE_METHODS


IQAC_MANAGER_ROLE_NAMES = {'IQAC', 'ADMIN', 'PRINCIPAL', 'PS'}


def _user_has_any_role(user, names: set[str]) -> bool:
    try:
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'is_superuser', False):
            return True
        # accounts.User has .roles M2M; be case-insensitive
        for n in names:
            if user.roles.filter(name__iexact=str(n)).exists():
                return True
        return False
    except Exception:
        return False


class IsIQACManager(BasePermission):
    def has_permission(self, request, view):
        return _user_has_any_role(getattr(request, 'user', None), IQAC_MANAGER_ROLE_NAMES)


class IsAuthenticatedSubmitter(BasePermission):
    def has_permission(self, request, view):
        u = getattr(request, 'user', None)
        return bool(u and u.is_authenticated)

