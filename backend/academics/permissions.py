from rest_framework import permissions
from academics.models import DepartmentRole
from accounts.utils import get_user_permissions


class IsHODOfDepartment(permissions.BasePermission):
    """Allow access only to users who are HOD of the relevant department.

    For safe methods (GET), allow if the user is an HOD of any department (caller
    will typically filter queryset by HOD departments). For unsafe methods check
    that the user has the appropriate permission (e.g. 'academics.assign_advisor')
    when acting on a specific section/instance.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # Allow list/retrieve for HODs (queryset is filtered in the viewset)
        if request.method in permissions.SAFE_METHODS:
            staff_profile = getattr(user, 'staff_profile', None)
            if not staff_profile:
                return False
            hod_depts = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True)
            return hod_depts.exists()
        # For unsafe methods, require authentication here; detailed checks in has_object_permission
        return True

    def has_object_permission(self, request, view, obj):
        # obj is a SectionAdvisor instance
        user = request.user
        if not user or not user.is_authenticated:
            return False
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return False

        # Section's department
        sec = getattr(obj, 'section', None)
        dept = None
        if sec and getattr(sec, 'batch', None) and getattr(sec.batch, 'course', None):
            dept = sec.batch.course.department

        # user must be active HOD of that department
        if not dept:
            return False
        hod_exists = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True, department=dept).exists()
        if not hod_exists:
            return False

        # finally, check for action-specific perms
        # Check custom role-permissions (accounts.RolePermission) first, fall back to Django perms
        perms = get_user_permissions(user)
        if request.method in ('POST',):
            return ('academics.assign_advisor' in perms) or user.has_perm('academics.add_sectionadvisor')
        if request.method in ('PUT', 'PATCH'):
            return ('academics.change_sectionadvisor' in perms) or user.has_perm('academics.change_sectionadvisor')
        if request.method in ('DELETE',):
            return ('academics.delete_sectionadvisor' in perms) or user.has_perm('academics.delete_sectionadvisor')
        return True
