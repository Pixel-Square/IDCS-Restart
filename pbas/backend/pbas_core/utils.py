from __future__ import annotations
import os
import re
from typing import Optional
from django.utils import timezone

_FILENAME_SAFE_RE = re.compile(r'[^A-Za-z0-9._-]+')

def sanitize_filename(name: str) -> str:
    base = os.path.basename(str(name or '').strip())
    if not base:
        return 'upload'
    base = base.replace(' ', '_')
    base = _FILENAME_SAFE_RE.sub('-', base)
    base = re.sub(r'-{2,}', '-', base).strip('-')
    return base[:180] or 'upload'

def upload_to_pbas_submission(instance, filename: str) -> str:
    ts = timezone.now().strftime('%Y%m%d%H%M%S%f')
    safe = sanitize_filename(filename)
    dept_id = None
    try:
        dept_id = str(instance.node.department_id)
    except Exception:
        dept_id = 'dept'

    user_id = None
    try:
        user_id = str(instance.user_id)
    except Exception:
        user_id = 'user'

    return f"pbas_submissions/{dept_id}/{user_id}/{ts}_{safe}"

def resolve_viewer_from_user(user) -> Optional[str]:
    if not user or not getattr(user, 'is_authenticated', False):
        return 'faculty'
    if getattr(user, 'student_profile', None) is not None:
        return 'student'
    return 'faculty'

def allowed_audiences_for_viewer(viewer: str) -> list[str]:
    v = (viewer or '').strip().lower()
    if v == 'faculty':
        return ['faculty', 'both']
    if v == 'student':
        return ['student', 'both']
    return ['both', 'faculty', 'student']

def user_staff_id(user) -> Optional[str]:
    try:
        sp = getattr(user, 'staff_profile', None)
        if sp:
            return str(sp.staff_id).strip()
    except Exception:
        pass
    return None

def user_student_reg_no(user) -> Optional[str]:
    try:
        sp = getattr(user, 'student_profile', None)
        if sp:
            return str(sp.reg_no).strip()
    except Exception:
        pass
    return None
