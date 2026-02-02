from typing import Optional

from django.db.models import Exists, OuterRef

from applications import models as app_models
from applications.services import approval_engine


def _resolve_applicant_department(application) -> Optional[object]:
    """Return the department object for the applicant or None.

    Preference:
    - application.staff_profile.department
    - application.student_profile.section.semester.course.department
    """
    staff = getattr(application, 'staff_profile', None)
    if staff is not None and getattr(staff, 'department', None) is not None:
        return staff.department

    student = getattr(application, 'student_profile', None)
    try:
        if student is not None and student.section is not None:
            return student.section.batch.course.department
    except Exception:
        return None

    return None


def can_user_view_application(application: app_models.Application, user) -> bool:
    """Centralized check whether `user` may view `application`.

    Rules (True if any):
    - user is superuser
    - user is the applicant
    - user_can_act(application, user) is True
    - user has already acted on this application (ApprovalAction exists)
    - user is staff and belongs to same department as applicant

    Implementation notes:
    - No DB writes.
    - Use efficient exists() queries where appropriate.
    """
    if user is None:
        return False

    # Superuser short-circuit
    if getattr(user, 'is_superuser', False):
        return True

    # Applicant
    if application.applicant_user_id == getattr(user, 'id', None):
        return True

    # Approver / override
    try:
        if approval_engine.user_can_act(application, user):
            return True
    except Exception:
        # If the engine errors for some reason, fall through to other checks
        pass

    # Has already acted
    acted_exists = app_models.ApprovalAction.objects.filter(application=application, acted_by=user).exists()
    if acted_exists:
        return True

    # Staff in same department as applicant
    dept = _resolve_applicant_department(application)
    if dept is not None:
        # Check if there's a StaffProfile for this user in same department
        try:
            from academics.models import StaffProfile
        except Exception:
            StaffProfile = None

        if StaffProfile is not None:
            # direct profile match
            if StaffProfile.objects.filter(user=user, department=dept).exists():
                return True
            # allow HODs assigned via DepartmentRole to view applicant dept
            try:
                from academics.models import DepartmentRole
                staff_profile = getattr(user, 'staff_profile', None)
                if staff_profile and DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True, department=dept).exists():
                    return True
            except Exception:
                pass

    return False
