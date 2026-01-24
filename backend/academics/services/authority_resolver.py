"""Authority resolver utilities for approvals.

This module provides read-only resolvers to determine which staff member
should act for a given semantic role (mentor, advisor, HOD, AHOD, etc.)
for a student and academic year.

All functions are deterministic and avoid mutating DB state. They are
intended to be used by the approval engine.
"""
from typing import Optional, List

from django.db.models import Q

from academics.models import (
    StudentMentorMap,
    SectionAdvisor,
    DepartmentRole,
    AcademicYear,
)
from academics.models import StudentProfile
from academics.models import StaffProfile
from applications.models import ApprovalFlow, ApprovalStep


def is_staff_available(staff: StaffProfile, when=None) -> bool:
    """Stub availability check for a staff member.

    Replace this with a real check against leave calendars or user status.
    For now it returns True when the linked user is active.
    """
    user = getattr(staff, 'user', None)
    if user is None:
        return False
    return bool(getattr(user, 'is_active', False))


def get_student_mentor(student: StudentProfile, academic_year: AcademicYear) -> Optional[StaffProfile]:
    """Return the active mentor StaffProfile for `student` in `academic_year`.

    Returns None when no active mapping exists or mentor is unavailable.
    """
    if student is None or academic_year is None:
        return None

    mapping = (
        StudentMentorMap.objects
        .filter(student=student, academic_year=academic_year, is_active=True)
        .select_related('mentor__user', 'mentor__department')
        .first()
    )
    if not mapping:
        return None

    mentor = mapping.mentor
    return mentor if is_staff_available(mentor) else None


def get_section_advisor(student: StudentProfile, academic_year: AcademicYear) -> Optional[StaffProfile]:
    """Return the active advisor StaffProfile for the student's section in `academic_year`.

    Returns None when section/advisor not found or advisor unavailable.
    """
    if student is None or academic_year is None:
        return None

    section = getattr(student, 'section', None)
    if section is None:
        return None

    mapping = (
        SectionAdvisor.objects
        .filter(section=section, academic_year=academic_year, is_active=True)
        .select_related('advisor__user', 'advisor__department')
        .first()
    )
    if not mapping:
        return None

    advisor = mapping.advisor
    return advisor if is_staff_available(advisor) else None


def get_department_hod(student: StudentProfile, academic_year: AcademicYear) -> Optional[StaffProfile]:
    """Return the HOD StaffProfile for the student's department in `academic_year`.

    If multiple HOD entries exist only the first active one is returned.
    """
    dept = None
    sec = getattr(student, 'section', None)
    if sec and getattr(sec, 'semester', None) and getattr(sec.semester, 'course', None):
        dept = sec.semester.course.department

    if not dept:
        return None

    hod = (
        DepartmentRole.objects
        .filter(department=dept, role='HOD', academic_year=academic_year, is_active=True)
        .select_related('staff__user', 'staff__department')
        .first()
    )
    if not hod:
        return None
    staff = hod.staff
    return staff if is_staff_available(staff) else None


def get_department_ahod(student: StudentProfile, academic_year: AcademicYear) -> Optional[StaffProfile]:
    """Return an available AHOD for the student's department in `academic_year`.

    If multiple AHODs are present the first available is returned. Returns
    None when none found or available.
    """
    dept = None
    sec = getattr(student, 'section', None)
    if sec and getattr(sec, 'semester', None) and getattr(sec.semester, 'course', None):
        dept = sec.semester.course.department

    if not dept:
        return None

    ahods = (
        DepartmentRole.objects
        .filter(department=dept, role='AHOD', academic_year=academic_year, is_active=True)
        .select_related('staff__user', 'staff__department')
        .order_by('id')
    )
    for a in ahods:
        if is_staff_available(a.staff):
            return a.staff
    return None


def _get_flow_for_application(application):
    """Resolve the ApprovalFlow for an application (department-specific then global).

    Local utility used to make fallback decisions that depend on the flow.
    This duplicates a small amount of logic from the approval engine but stays
    fully read-only and avoids importing approval_engine.
    """
    if application is None:
        return None

    # determine department from application student or staff
    dept = None
    student = getattr(application, 'student_profile', None)
    staff_profile = getattr(application, 'staff_profile', None)
    if student is not None:
        sec = getattr(student, 'section', None)
        if sec and getattr(sec, 'semester', None) and getattr(sec.semester, 'course', None):
            dept = sec.semester.course.department
    elif staff_profile is not None:
        dept = getattr(staff_profile, 'department', None)

    qs = ApprovalFlow.objects.filter(application_type=application.application_type, is_active=True)
    if dept is not None:
        flow = qs.filter(department=dept).first()
        if flow:
            return flow
    return qs.filter(department__isnull=True).first()


def resolve_approver(role_code: str, application_instance) -> Optional[StaffProfile]:
    """Resolve the approver StaffProfile for a given semantic `role_code`.

    role_code is a semantic token (e.g. 'MENTOR', 'ADVISOR', 'HOD', 'AHOD').
    The function inspects `application_instance` (student/staff) and uses the
    appropriate mapping resolvers. Returns None when no approver can be
    determined or when available approvers are not found.

    The resolver is intentionally conservative: it prefers explicit mappings
    (StudentMentorMap, SectionAdvisor, DepartmentRole) and applies simple
    fallbacks (HOD -> AHOD, Mentor -> Advisor) when the primary authority is
    unavailable.
    """
    if not role_code or application_instance is None:
        return None

    role_key = role_code.strip().upper()

    # Try to resolve academic year: prefer any academic year linked on application
    academic_year = None
    # application may have no explicit academic_year; try to infer from mappings
    # Prefer year from student's active mapping when possible
    student = getattr(application_instance, 'student_profile', None)
    if student is None:
        # If only staff_profile present, we cannot resolve student-based authorities
        return None

    # pick current active academic year if exists in DB
    academic_year = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()

    # Role-specific resolution
    if role_key == 'MENTOR':
        mentor = get_student_mentor(student, academic_year)
        if mentor:
            return mentor
        # fallback to advisor if mentor unavailable
        advisor = get_section_advisor(student, academic_year)
        return advisor

    if role_key == 'ADVISOR':
        return get_section_advisor(student, academic_year)

    if role_key == 'HOD':
        hod = get_department_hod(student, academic_year)
        if hod:
            return hod
        # fallback to AHOD
        return get_department_ahod(student, academic_year)

    if role_key == 'AHOD':
        return get_department_ahod(student, academic_year)

    # Generic: for other roles (PS, IQAC_HEAD etc.) there is no academic mapper
    # Return None so callers can resolve via flow.override_roles or other config.
    return None
