"""
IDCS Coder - Custom Permissions

These permission classes verify:
1. Authentication (JWT token valid)
2. Role (CODE_ADMIN / CODE_COURSE_INCHARGE / CODE_SECTION_INCHARGE / STUDENT)
3. Resource ownership (incharge can only access their own courses etc.)
"""

from rest_framework.permissions import BasePermission
from .models import (
    CODER_ROLE_ADMIN,
    CODER_ROLE_COURSE_INCHARGE,
    CODER_ROLE_SECTION_INCHARGE,
    CodeCourseIncharge,
    CodeSectionIncharge,
)


def _has_coder_role(user, role_name):
    """Check if user has a specific coder role via UserRole → Role."""
    if not user or not user.is_authenticated:
        return False
    return user.user_roles.filter(role__name=role_name).exists()


def _user_role_names(user):
    if not user or not user.is_authenticated:
        return set()
    return set(user.user_roles.values_list('role__name', flat=True))


class IsCodeAdmin(BasePermission):
    message = 'You must have the CODE_ADMIN role to perform this action.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return _has_coder_role(request.user, CODER_ROLE_ADMIN)


class IsCodeCourseIncharge(BasePermission):
    message = 'You must have the CODE_COURSE_INCHARGE role to perform this action.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return _has_coder_role(request.user, CODER_ROLE_COURSE_INCHARGE)


class IsCodeSectionIncharge(BasePermission):
    message = 'You must have the CODE_SECTION_INCHARGE role to perform this action.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return _has_coder_role(request.user, CODER_ROLE_SECTION_INCHARGE)


class IsCodeAdminOrCourseIncharge(BasePermission):
    message = 'CODE_ADMIN or CODE_COURSE_INCHARGE role required.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        roles = _user_role_names(request.user)
        return bool(roles & {CODER_ROLE_ADMIN, CODER_ROLE_COURSE_INCHARGE})


class IsAuthenticatedCoder(BasePermission):
    """Any authenticated user with at least one coder role."""
    message = 'Coder role required.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        roles = _user_role_names(request.user)
        return bool(roles & {
            CODER_ROLE_ADMIN,
            CODER_ROLE_COURSE_INCHARGE,
            CODER_ROLE_SECTION_INCHARGE,
            'STUDENT',
        })


class IsCourseInchargeForCourse(BasePermission):
    """
    Object-level permission: checks that the requesting user is an
    active incharge for the given CodeCourse.

    Used in views where the course is retrieved by URL kwarg.
    The view must set `course_object` on the view instance before calling this.
    """
    message = 'You are not an incharge for this course.'

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        if _has_coder_role(user, CODER_ROLE_ADMIN):
            return True
        # obj is expected to be a CodeCourse instance
        from .models import CodeCourse
        if isinstance(obj, CodeCourse):
            course = obj
        else:
            return False
        return CodeCourseIncharge.objects.filter(
            course=course,
            user=user,
            is_active=True,
        ).exists()


def get_user_coder_role(user):
    """Return the primary Coder role name or None."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return CODER_ROLE_ADMIN
    roles = _user_role_names(user)
    for role in [CODER_ROLE_ADMIN, CODER_ROLE_COURSE_INCHARGE, CODER_ROLE_SECTION_INCHARGE]:
        if role in roles:
            return role
    if 'STUDENT' in roles:
        return 'STUDENT'
    return None
