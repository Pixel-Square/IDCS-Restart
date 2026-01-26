from typing import Dict, List, Optional
import re

from . import models


def _infer_profile_type(user) -> Optional[str]:
    if hasattr(user, 'student_profile') and getattr(user, 'student_profile') is not None:
        return 'STUDENT'
    if hasattr(user, 'staff_profile') and getattr(user, 'staff_profile') is not None:
        return 'STAFF'
    return None


def _get_profile_status(user) -> Optional[str]:
    sp = getattr(user, 'student_profile', None)
    if sp is not None:
        return getattr(sp, 'status', None)
    st = getattr(user, 'staff_profile', None)
    if st is not None:
        return getattr(st, 'status', None)
    return None


def _group_permission_code(code: str) -> str:
    if not code:
        return 'other'
    parts = re.split(r'[.:/]', code)
    if not parts:
        return 'other'
    return parts[0].lower()


def resolve_dashboard_capabilities(user) -> Dict:
    if user is None:
        raise ValueError('user is required')

    if not getattr(user, 'is_active', False):
        flags_inactive = {
            'is_student': False,
            'is_staff': False,
            'can_view_curriculum_master': False,
            'can_edit_curriculum_master': False,
            'can_approve_department_curriculum': False,
            'can_fill_department_curriculum': False,
        }
        entry_points_inactive = {
            'curriculum_master': False,
            'department_curriculum': False,
            'student_curriculum_view': False,
        }
        return {
            'profile_type': None,
            'roles': [],
            'permissions': [],
            'profile_status': 'INACTIVE',
            'capabilities': {},
            'flags': flags_inactive,
            'entry_points': entry_points_inactive,
        }

    profile_type = _infer_profile_type(user)
    profile_status = _get_profile_status(user)

    roles_qs = user.roles.all()
    role_names = [r.name for r in roles_qs]

    Permission = models.Permission
    perms_qs = Permission.objects.filter(permission_roles__role__in=roles_qs).distinct()
    perm_codes = sorted({p.code for p in perms_qs})

    grouped: Dict[str, List[str]] = {}
    for code in perm_codes:
        group = _group_permission_code(code)
        grouped.setdefault(group, []).append(code)

    lower_perms = [p.lower() for p in perm_codes]

    def _any_contains(subs: List[str]) -> bool:
        for p in lower_perms:
            if all(s in p for s in subs):
                return True
        return False

    flags = {
        'is_student': True if profile_type == 'STUDENT' else False,
        'is_staff': True if profile_type == 'STAFF' else False,
        'can_view_curriculum_master': _any_contains(['curriculum', 'view']) or _any_contains(['curriculum', 'read']) or _any_contains(['curriculum', 'retrieve']) or _any_contains(['curriculum', 'list']) or _any_contains(['curriculum', 'master']),
        # Only treat explicit master permissions as master-edit access
        'can_edit_curriculum_master': _any_contains(['curriculum', 'master']),
        'can_approve_department_curriculum': _any_contains(['curriculum', 'approve']) or _any_contains(['department', 'approve', 'curriculum']) or _any_contains(['curriculum', 'approve', 'department']),
        'can_fill_department_curriculum': _any_contains(['curriculum', 'fill']) or _any_contains(['curriculum', 'submit']) or _any_contains(['department', 'fill']) or _any_contains(['department', 'submit']) or _any_contains(['curriculum', 'complete']),
    }

    entry_points = {
        'curriculum_master': bool(flags.get('can_edit_curriculum_master') or flags.get('can_view_curriculum_master')),
        'department_curriculum': bool(flags.get('can_fill_department_curriculum') or flags.get('can_approve_department_curriculum')),
        'student_curriculum_view': bool(flags.get('is_student')),
    }

    return {
        'profile_type': profile_type,
        'roles': role_names,
        'permissions': perm_codes,
        'profile_status': profile_status,
        'capabilities': grouped,
        'flags': flags,
        'entry_points': entry_points,
    }


__all__ = ['resolve_dashboard_capabilities']
