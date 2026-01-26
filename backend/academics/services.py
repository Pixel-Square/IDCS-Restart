from typing import Optional, Set
from .models import StudentProfile, StaffProfile, StudentSectionAssignment, StaffDepartmentAssignment, RoleAssignment
from django.utils import timezone


def get_current_section(student: StudentProfile) -> Optional[StudentSectionAssignment]:
    return StudentSectionAssignment.objects.filter(student=student, end_date__isnull=True).select_related('section').first()


def get_current_department(staff: StaffProfile) -> Optional[StaffDepartmentAssignment]:
    return StaffDepartmentAssignment.objects.filter(staff=staff, end_date__isnull=True).select_related('department').first()


def get_effective_roles(user) -> Set[str]:
    """Return effective role names for a user combining static `user.roles` and active `RoleAssignment`s."""
    roles = set(r.name.upper() for r in user.roles.all())
    st = getattr(user, 'staff_profile', None)
    if st is not None:
        active = RoleAssignment.objects.filter(staff=st, end_date__isnull=True)
        roles.update([ra.role_name.upper() for ra in active])
    return roles
