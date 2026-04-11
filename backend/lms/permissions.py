from accounts.utils import get_user_permissions
from academics.models import DepartmentRole


def _effective_role_names(user):
    names = set()
    try:
        names.update({str(r.name or '').upper() for r in user.roles.all() if r and getattr(r, 'name', None)})
    except Exception:
        pass
    try:
        staff_profile = getattr(user, 'staff_profile', None)
        if staff_profile is not None:
            dept_roles = DepartmentRole.objects.filter(staff=staff_profile, is_active=True).values_list('role', flat=True)
            names.update({str(r or '').upper() for r in dept_roles if r})
    except Exception:
        pass
    return names


def is_iqac_user(user):
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    roles = _effective_role_names(user)
    if 'IQAC' in roles:
        return True
    try:
        perms = {str(p or '').lower() for p in get_user_permissions(user)}
    except Exception:
        perms = set()
    return 'lms.quota.manage' in perms or 'lms.materials.view_all' in perms


def is_hod_or_ahod_user(user):
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    roles = _effective_role_names(user)
    return 'HOD' in roles or 'AHOD' in roles


def get_hod_department_ids(user):
    staff_profile = getattr(user, 'staff_profile', None)
    if not staff_profile:
        return set()
    qs = DepartmentRole.objects.filter(
        staff=staff_profile,
        is_active=True,
        role__in=['HOD', 'AHOD'],
    ).values_list('department_id', flat=True)
    return {int(x) for x in qs}
