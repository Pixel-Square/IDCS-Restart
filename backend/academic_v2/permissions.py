"""Server-side permission classes for Academic 2.1 (academic_v2).

Admin = superuser or a role holding ``academic_v2.page.admin`` (the same code
the SPA uses to show the Academic 2.1 admin pages). The Django ``is_staff``
flag is deliberately not accepted: it marks admin-site access, and teaching
accounts can carry it.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

ACV2_ADMIN_PERMISSION = 'academic_v2.page.admin'

# DRF router actions that write through the serializer directly.
GENERIC_WRITE_ACTIONS = {'create', 'update', 'partial_update', 'destroy'}


def is_acv2_admin(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        return bool(user.has_perm(ACV2_ADMIN_PERMISSION))
    except Exception:
        return False


class IsAcV2Admin(BasePermission):
    """Every method, including reads, requires an Academic 2.1 admin."""

    message = 'Academic 2.1 administrator access is required.'

    def has_permission(self, request, view):
        return is_acv2_admin(request.user)


class IsAcV2AdminOrReadOnly(BasePermission):
    """Reads for any authenticated user; every write (custom actions included) for admins."""

    message = 'Academic 2.1 administrator access is required to change configuration.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return is_acv2_admin(user)


class IsAcV2AdminForGenericWrites(BasePermission):
    """Generic create/update/delete for admins only.

    Custom ``@action`` endpoints stay open to authenticated users because each
    one enforces its own workflow rule (approver role, requester ownership).
    """

    message = 'Use the workflow actions; direct edits require Academic 2.1 administrator access.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(view, 'action', None) in GENERIC_WRITE_ACTIONS:
            return is_acv2_admin(user)
        return True
