from typing import List

from django.db.models import QuerySet

from .models import DepartmentRole, StaffProfile, SectionAdvisor


def get_user_staff_profile(user):
    """Safely return the user's linked `StaffProfile`, if any.

    Reverse one-to-one access (`user.staff_profile`) can raise
    `RelatedObjectDoesNotExist` for users that do not have a staff profile.
    Some API flows (including OBE academic-controller screens) intentionally
    allow such users, so callers should receive `None` rather than a 500.
    """
    if not user or not getattr(user, 'pk', None):
        return None

    try:
        return user.staff_profile
    except Exception:
        try:
            return StaffProfile.objects.filter(user_id=user.pk).select_related('department', 'user').first()
        except Exception:
            return None


def get_user_hod_department_ids(user) -> List[int]:
    """Return list of department IDs the user is HOD/AHOD for.

    Includes departments from active DepartmentRole entries for the user's
    `staff_profile`. Returns an empty list if no staff_profile or no roles.
    """
    staff_profile = get_user_staff_profile(user)
    if not staff_profile:
        return []

    qs = DepartmentRole.objects.filter(staff=staff_profile, role__in=['HOD', 'AHOD'], is_active=True).values_list('department_id', flat=True)
    return list(qs)


def get_user_effective_departments(user) -> List[int]:
    """Return department ids the user should see data for.

    This combines the staff's `current_department` (if any) with HOD/AHOD
    assignments from DepartmentRole so multi-department HODs see all mapped
    departments.
    """
    depts = []
    staff_profile = get_user_staff_profile(user)
    if staff_profile:
        try:
            cur = getattr(staff_profile, 'current_department', None) or staff_profile.get_current_department()
            if cur:
                depts.append(getattr(cur, 'id', None))
        except Exception:
            try:
                if getattr(staff_profile, 'department', None):
                    depts.append(getattr(staff_profile.department, 'id', None))
            except Exception:
                pass

        # Advisors should be able to act for the departments of the sections
        # they advise, even when their StaffProfile.department/current_department
        # is not populated.
        try:
            advisor_dept_ids = (
                SectionAdvisor.objects
                .filter(advisor=staff_profile, is_active=True, academic_year__is_active=True)
                .values_list('section__batch__course__department_id', flat=True)
                .distinct()
            )
            depts += [d for d in advisor_dept_ids if d]
        except Exception:
            pass

    # include HOD/AHOD mapped departments
    depts += get_user_hod_department_ids(user)
    # dedupe and filter falsy
    return [d for d in sorted(set([int(x) for x in depts if x]))]
