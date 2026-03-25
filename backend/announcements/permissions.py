from rest_framework.permissions import BasePermission

from accounts.utils import get_user_permissions


class HasAnnouncementPagePermission(BasePermission):
    """Allow users with announcements.view_announcement_page permission."""

    required_code = "announcements.view_announcement_page"

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False):
            return True
        try:
            perms = {str(p or "").strip().lower() for p in (get_user_permissions(user) or [])}
        except Exception:
            perms = set()
        return self.required_code in perms


class HasAnnouncementCreatePermission(BasePermission):
    """Allow users with announcements.create_announcement permission."""

    required_code = "announcements.create_announcement"

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False):
            return True
        try:
            perms = {str(p or "").strip().lower() for p in (get_user_permissions(user) or [])}
        except Exception:
            perms = set()
        return self.required_code in perms


class HasAnnouncementManagePermission(BasePermission):
    """Allow users with announcements.manage_announcement permission."""

    required_code = "announcements.manage_announcement"

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False):
            return True
        try:
            perms = {str(p or "").strip().lower() for p in (get_user_permissions(user) or [])}
        except Exception:
            perms = set()
        return self.required_code in perms
