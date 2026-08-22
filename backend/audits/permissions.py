"""Permission classes for the audits app."""
from rest_framework import permissions

from .services import user_is_iqac


class IsIQACOrSuperuser(permissions.BasePermission):
    """Full management access (assign auditors, review consolidated scores)."""

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return user_is_iqac(user)


class CanViewAudits(permissions.BasePermission):
    """Any authenticated staff/iqac user can hit list endpoints; object-level
    filtering happens in the views (auditor vs HOD vs IQAC scoping)."""

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(user and user.is_authenticated)
