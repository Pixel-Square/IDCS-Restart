from typing import Optional, Set
from . import authority_resolver
from .authority_resolver import *  # preserve legacy imports if any

from academics.models import (
    StudentProfile,
    StaffProfile,
    StudentSectionAssignment,
    StaffDepartmentAssignment,
    RoleAssignment,
)


def get_current_section(student: StudentProfile) -> Optional[StudentSectionAssignment]:
    return StudentSectionAssignment.objects.filter(
        student=student,
        end_date__isnull=True,
        section_type=StudentSectionAssignment.SECTION_TYPE_PRIMARY,
    ).select_related('section').order_by('-start_date').first()


def get_current_department(staff: StaffProfile) -> Optional[StaffDepartmentAssignment]:
    return StaffDepartmentAssignment.objects.filter(staff=staff, end_date__isnull=True).select_related('department').first()


def get_effective_roles(user) -> Set[str]:
    """Canonical effective-role resolver (mirrors academics/services.py).

    UserRole + active DepartmentRole (HOD/AHOD) + active RoleAssignment.
    """
    roles = set(r.name.upper() for r in user.roles.all())
    st = getattr(user, 'staff_profile', None)
    if st is not None:
        from academics.models import DepartmentRole
        dept_roles = DepartmentRole.objects.filter(
            staff=st, is_active=True
        ).values_list('role', flat=True)
        roles.update(str(r).strip().upper() for r in dept_roles if r)
        active = RoleAssignment.objects.filter(staff=st, end_date__isnull=True)
        roles.update([ra.role_name.upper() for ra in active])
    return roles
