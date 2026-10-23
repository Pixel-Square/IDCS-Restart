"""Role based permission helpers for the Hostel module.

Access is enforced on the server (never only by hiding frontend navigation).
Role names live in ``accounts.Role`` and are also seeded by a data migration.
"""

from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import RESIDENCE_HOSTELLER

# Canonical role names handled by this module.
ROLE_COLLEGE_ADMIN = 'COLLEGE_ADMIN'
ROLE_HOSTEL_ADMIN = 'HOSTEL_ADMIN'
ROLE_WARDEN = 'WARDEN'
ROLE_DEPUTY_WARDEN = 'DEPUTY_WARDEN'
ROLE_MATRON = 'MATRON'
ROLE_MAINTENANCE_STAFF = 'MAINTENANCE_STAFF'
ROLE_MESS_COORDINATOR = 'MESS_COORDINATOR'
ROLE_TRANSPORT_COORDINATOR = 'TRANSPORT_COORDINATOR'
ROLE_SECURITY_STAFF = 'SECURITY_STAFF'
ROLE_STUDENT = 'STUDENT'

# Alias spellings that may already exist in installations / imported roles.
_ADMIN_ROLES = {
    'ADMIN',
    'SUPER_ADMIN',
    'COLLEGE_ADMIN',
    'COLLEGE ADMIN',
    'PRINCIPAL',
    'IQAC',
}
_HOSTEL_ADMIN_ROLES = {
    'HOSTEL_ADMIN',
    'HOSTEL ADMIN',
    'HOSTELADMIN',
}
_WARDEN_ROLES = {
    'WARDEN',
    'DEPUTY_WARDEN',
    'DEPUTY WARDEN',
    'DEPUTYWARDEN',
    'MATRON',
    'HOSTEL_WARDEN',
}
_MAINTENANCE_ROLES = {
    'MAINTENANCE_STAFF',
    'MAINTENANCE STAFF',
    'MAINTENANCESTAFF',
    'MAINTENANCE',
}
_MESS_ROLES = {
    'MESS_COORDINATOR',
    'MESS COORDINATOR',
    'MESSCOORDINATOR',
}
_TRANSPORT_ROLES = {
    'TRANSPORT_COORDINATOR',
    'TRANSPORT COORDINATOR',
    'TRANSPORTCOORDINATOR',
}
_SECURITY_ROLES = {
    'SECURITY',
    'SECURITY_STAFF',
    'SECURITY STAFF',
    'SECURITYSTAFF',
}
_STUDENT_ROLES = {'STUDENT'}


def user_role_names(user) -> set:
    if not user or not getattr(user, 'is_authenticated', False):
        return set()
    try:
        return {str(name).strip().upper() for name in user.roles.values_list('name', flat=True)}
    except Exception:
        return set()


def is_super_admin(user) -> bool:
    return bool(user and getattr(user, 'is_authenticated', False) and getattr(user, 'is_superuser', False))


def is_college_admin(user) -> bool:
    return is_super_admin(user) or bool(user_role_names(user) & _ADMIN_ROLES)


def is_hostel_admin(user) -> bool:
    return is_college_admin(user) or bool(user_role_names(user) & _HOSTEL_ADMIN_ROLES)


def is_warden(user) -> bool:
    return bool(user_role_names(user) & _WARDEN_ROLES)


def is_hostel_staff(user) -> bool:
    """Any role that may operate the hostel back-office."""
    if is_hostel_admin(user) or is_warden(user):
        return True
    roles = user_role_names(user)
    return bool(
        roles
        & (
            _MAINTENANCE_ROLES
            | _MESS_ROLES
            | _TRANSPORT_ROLES
            | _SECURITY_ROLES
        )
    )


def is_student(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if hasattr(user, 'student_profile'):
        return True
    return bool(user_role_names(user) & _STUDENT_ROLES)


def warden_building_ids(user) -> set:
    """Building ids a warden / deputy warden is responsible for."""
    if not user or not getattr(user, 'is_authenticated', False):
        return set()
    from .models import HostelWardenAssignment

    return set(
        HostelWardenAssignment.objects.filter(user=user, is_active=True).values_list('building_id', flat=True)
    )


def can_manage_building(user, building) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if is_hostel_admin(user):
        return True
    if not is_warden(user):
        return False
    if building is None:
        return False
    building_id = getattr(building, 'id', building)
    return building_id in warden_building_ids(user)


def student_facility(user):
    """Return the StudentFacilityProfile for a student user (or None)."""
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    student = getattr(user, 'student_profile', None)
    if student is None:
        return None
    return getattr(student, 'hostel_facility', None)


def is_hosteller_user(user) -> bool:
    facility = student_facility(user)
    return bool(facility and facility.residence_category == RESIDENCE_HOSTELLER)


class _RolePermission(BasePermission):
    message = 'You do not have permission to perform this action.'

    def has_permission(self, request, view):
        return self.check(request.user)

    def check(self, user):
        raise NotImplementedError


class IsHostelAdmin(_RolePermission):
    message = 'Hostel administrator access is required.'

    def check(self, user):
        return is_hostel_admin(user)


class IsHostelStaff(_RolePermission):
    message = 'Hostel staff access is required.'

    def check(self, user):
        return is_hostel_staff(user)


class IsWardenOrHostelAdmin(_RolePermission):
    message = 'Warden or hostel administrator access is required.'

    def check(self, user):
        return is_hostel_admin(user) or is_warden(user)


class IsStudentUser(_RolePermission):
    message = 'This endpoint is available to students only.'

    def check(self, user):
        return is_student(user)


class IsHostellerStudent(_RolePermission):
    """Gate for the hostel portal pages.

    A student can only use the hostel portal once they have selected
    ``Hosteller`` as their residence category. Day Scholars (and students who
    have not selected anything yet) are rejected with a clear message.
    """

    message = (
        'The Hostel portal is available only to students who selected '
        'Hosteller as their residence category.'
    )

    def check(self, user):
        if is_hostel_staff(user) or is_college_admin(user):
            return True
        return is_hosteller_user(user)


class IsAdminOrReadOnly(BasePermission):
    """Hostel staff may read; only hostel administrators may write."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return is_hostel_staff(request.user)
        return is_hostel_admin(request.user)


class IsAuthenticatedStaffOrStudent(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)
