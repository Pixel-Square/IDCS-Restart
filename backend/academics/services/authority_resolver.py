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


def _get_student_department(student: StudentProfile):
    dept = None
    sec = getattr(student, 'section', None)
    if sec and getattr(sec, 'batch', None) and getattr(sec.batch, 'course', None):
        dept = sec.batch.course.department
    if not dept:
        dept = getattr(student, 'home_department', None)
    return dept


def _get_application_department(application_instance):
    """Return the applicant's department for an application.

    Works for both student applications and staff applications.
    """
    if application_instance is None:
        return None

    student = getattr(application_instance, 'student_profile', None)
    if student is None:
        try:
            applicant_user = getattr(application_instance, 'applicant_user', None)
            student = getattr(applicant_user, 'student_profile', None) if applicant_user is not None else None
        except Exception:
            student = None

    if student is not None:
        dept = _get_student_department(student)
        if dept is not None:
            return dept

    staff_profile = getattr(application_instance, 'staff_profile', None)
    if staff_profile is None:
        try:
            applicant_user = getattr(application_instance, 'applicant_user', None)
            staff_profile = getattr(applicant_user, 'staff_profile', None) if applicant_user is not None else None
        except Exception:
            staff_profile = None

    if staff_profile is not None:
        return getattr(staff_profile, 'department', None)

    return None


def get_department_hod_by_department(dept, academic_year: AcademicYear) -> Optional[StaffProfile]:
    if not dept or academic_year is None:
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


def get_department_ahod_by_department(dept, academic_year: AcademicYear) -> Optional[StaffProfile]:
    if not dept or academic_year is None:
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


def is_staff_available(staff: StaffProfile, when=None) -> bool:
    """Stub availability check for a staff member.

    Replace this with a real check against leave calendars or user status.
    For now it returns True when the linked user is active.
    """
    user = getattr(staff, 'user', None)
    if user is None:
        return False
    return bool(getattr(user, 'is_active', False))


def get_student_mentor(student: StudentProfile) -> Optional[StaffProfile]:
    """Return the active mentor StaffProfile for `student`.

    Mentor mappings are not year-scoped; return the current active mapping.
    Returns None when no active mapping exists or mentor is unavailable.
    """
    if student is None:
        return None

    mapping = (
        StudentMentorMap.objects
        .filter(student=student, is_active=True)
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
    dept = _get_student_department(student) if student is not None else None
    return get_department_hod_by_department(dept, academic_year)


def get_department_ahod(student: StudentProfile, academic_year: AcademicYear) -> Optional[StaffProfile]:
    """Return an available AHOD for the student's department in `academic_year`.

    If multiple AHODs are present the first available is returned. Returns
    None when none found or available.
    """
    dept = _get_student_department(student) if student is not None else None
    return get_department_ahod_by_department(dept, academic_year)


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
        if sec and getattr(sec, 'batch', None) and getattr(sec.batch, 'course', None):
            dept = sec.batch.course.department
    elif staff_profile is not None:
        dept = getattr(staff_profile, 'department', None)

    qs = ApprovalFlow.objects.filter(application_type=application.application_type, is_active=True)
    qs_with_steps = qs.filter(steps__isnull=False).distinct()
    dept_flow = None
    global_flow = None

    if dept is not None:
        dept_flow = qs_with_steps.filter(department=dept).order_by('-id').first()
        if dept_flow is not None:
            try:
                if dept_flow.steps.exists():
                    return dept_flow
            except Exception:
                return dept_flow

    global_flow = qs_with_steps.filter(department__isnull=True).order_by('-id').first()
    if global_flow is not None:
        try:
            if global_flow.steps.exists():
                return global_flow
        except Exception:
            return global_flow

    return dept_flow or global_flow


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

    # pick current active academic year if exists in DB
    academic_year = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()

    student = getattr(application_instance, 'student_profile', None)
    if student is None:
        # Backward-compatible fallback: older Application rows may not have
        # student_profile set even though applicant_user has one.
        try:
            applicant_user = getattr(application_instance, 'applicant_user', None)
            student = getattr(applicant_user, 'student_profile', None) if applicant_user is not None else None
        except Exception:
            student = None

    # Role-specific resolution
    if role_key == 'MENTOR':
        if student is None:
            return None
        mentor = get_student_mentor(student)
        if mentor:
            return mentor
        # fallback to advisor if mentor unavailable
        advisor = get_section_advisor(student, academic_year)
        return advisor

    if role_key == 'ADVISOR':
        if student is None:
            return None
        return get_section_advisor(student, academic_year)

    if role_key == 'HOD':
        dept = _get_application_department(application_instance)
        hod = get_department_hod_by_department(dept, academic_year)
        if hod:
            return hod
        # fallback to AHOD
        return get_department_ahod_by_department(dept, academic_year)

    if role_key == 'AHOD':
        dept = _get_application_department(application_instance)
        return get_department_ahod_by_department(dept, academic_year)

    # Generic: for other roles (PS, IQAC_HEAD etc.) there is no academic mapper
    # Return None so callers can resolve via flow.override_roles or other config.
    return None
