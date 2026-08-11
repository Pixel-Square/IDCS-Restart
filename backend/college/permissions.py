"""
College-scoped permission classes.

* ``IsCollegeMember`` — user belongs to the request's college (or is super admin).
* ``IsCollegeAdminOrSuperAdmin`` — user has COLLEGE ADMIN role for the request's
  college, or is super admin / SUPER_ADMIN.
"""

from rest_framework.permissions import BasePermission


def _user_college_id(user) -> int | None:
    """Return the college id from the user's student or staff profile."""
    if not user or not user.is_authenticated:
        return None
    sp = getattr(user, 'student_profile', None)
    if sp is not None and getattr(sp, 'college_id', None) is not None:
        return sp.college_id
    st = getattr(user, 'staff_profile', None)
    if st is not None and getattr(st, 'college_id', None) is not None:
        return st.college_id
    return None


class IsCollegeMember(BasePermission):
    """Allow access only if the user's profile college matches the request college.

    Super admins always pass.
    """

    message = 'You must be a member of this college.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(request.user, 'is_superuser', False):
            return True
        if request.college_id is None:
            return False
        uid = _user_college_id(request.user)
        return uid is not None and uid == request.college_id


class IsCollegeAdminOrSuperAdmin(BasePermission):
    """Allow access for COLLEGE ADMIN of the current college, or super admins.

    A user is a college admin when:
    * They have the ``COLLEGE ADMIN`` role, AND
    * Their profile college matches the request's college.
    """

    message = 'Only college administrators can perform this action.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(request.user, 'is_superuser', False):
            return True
        # SUPER_ADMIN role: they're super admin globally
        try:
            if request.user.roles.filter(name='SUPER_ADMIN').exists():
                return True
        except Exception:
            pass
        # COLLEGE ADMIN must match the request college
        try:
            if request.user.roles.filter(name__iexact='COLLEGE ADMIN').exists():
                uid = _user_college_id(request.user)
                return uid is not None and uid == request.college_id
        except Exception:
            pass
        return False
