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

    lower_perms = {p.lower() for p in perm_codes}

    def any_contains_all(parts: List[str]) -> bool:
        for p in lower_perms:
            if all(s in p for s in parts):
                return True
        return False

    # explicit tokens that imply master edit/create/publish
    master_edit_tokens = ('edit', 'create', 'manage', 'publish', 'write')
    def has_master_edit():
        for t in master_edit_tokens:
            if any_contains_all(['curriculum', 'master', t]):
                return True
        # also accept canonical codes like CURRICULUM_MASTER_EDIT
        if any(p in lower_perms for p in ('curriculum_master_edit', 'curriculum_master_publish')):
            return True
        return False

    def has_master_view():
        # view if there are explicit view/read/list/retrieve permissions for master
        view_tokens = ('view', 'read', 'list', 'retrieve')
        for t in view_tokens:
            if any_contains_all(['curriculum', 'master', t]):
                return True
        # fallback: if there is any curriculum.master.* style permission, treat as view
        if any(p for p in lower_perms if 'curriculum' in p and 'master' in p):
            return True
        return False

    def has_department_approve():
        return any_contains_all(['curriculum', 'approve']) or any_contains_all(['department', 'approve', 'curriculum'])

    def has_department_fill():
        tokens = ('fill', 'submit', 'complete', 'edit')
        for t in tokens:
            if any_contains_all(['curriculum', t]) or any_contains_all(['department', t]):
                return True
        return False

    flags = {
        'is_student': profile_type == 'STUDENT',
        'is_staff': profile_type == 'STAFF',
        'can_view_curriculum_master': has_master_view(),
        'can_edit_curriculum_master': has_master_edit(),
        'can_approve_department_curriculum': has_department_approve(),
        'can_fill_department_curriculum': has_department_fill(),
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
