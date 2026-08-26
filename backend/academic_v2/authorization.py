"""
Unified authorization / academic-scope context for Academic Performance
(academic_v2).

Principle:
    ROLE       = what the user is allowed to do  (accounts.Role / Permission)
    ASSIGNMENT = which academic data may be seen (DepartmentRole, SectionAdvisor,
                 TeachingAssignment, StudentMentorMap)

This module is the SINGLE source of truth for Academic Performance
authorization. It reuses existing structures only:
- academics.services.get_effective_roles()  (canonical effective-role resolver:
  UserRole + active DepartmentRole + active RoleAssignment)
- accounts.utils.get_user_permissions()     (existing permission framework)
- existing seeded permissions (academic_v2.*) — nothing new is created.

No models, migrations, roles or permissions are introduced here.
"""

from typing import Set

from django.db.models import Q
from rest_framework.exceptions import PermissionDenied

# Existing seeded permissions that imply college-wide visibility.
COLLEGE_WIDE_PERMISSIONS = (
    'academic_v2.internal.view_all',
    'academic_v2.marks.view_all',
)
# Roles that are treated as college-wide (kept in sync with legacy behaviour).
COLLEGE_WIDE_ROLES = {'PRINCIPAL', 'SUPER_ADMIN', 'ADMIN', 'IQAC'}
# Department-scoped authority roles stored in academics.DepartmentRole.
HOD_DEPARTMENT_ROLES = ('HOD', 'AHOD')


def _effective_role_names(user) -> Set[str]:
    try:
        from academics.services import get_effective_roles
        return {str(r).upper() for r in get_effective_roles(user)}
    except Exception:
        try:
            return {str(r.name).upper() for r in user.roles.all()}
        except Exception:
            return set()


def _anonymous_scope() -> dict:
    return {
        'user_id': None,
        'username': 'Anonymous',
        'role': 'STAFF',
        'roles': [],
        'effective_roles': [],
        'permissions': [],
        'is_college_wide': False,
        'is_principal': False,
        'is_hod': False,
        'is_advisor': False,
        'is_faculty': False,
        'is_student': False,
        'allowed_departments': {'ids': [], 'codes': [], 'names': []},
        'current_department': None,
        'department_id': None,
        'department_code': None,
        'department_name': None,
        'lock_department': True,
        'advised_sections': [],
        'assigned_subjects': [],
        'mentee_ids': [],
        '_allowed_dept_id_set': set(),
        '_allowed_dept_code_set': set(),
        '_advised_section_ids': set(),
        '_ta_section_ids': set(),
        '_mentee_pk_set': set(),
        '_staff_profile_id': None,
    }


def _compute_scope(user) -> dict:
    """Internal scope builder. Returns public fields plus '_' private sets used
    by enforcement helpers. Result is cached per user instance."""
    if not user or not getattr(user, 'is_authenticated', False):
        return _anonymous_scope()
    cached = getattr(user, '_ap_authorization_scope', None)
    if cached is not None:
        return cached

    from accounts.utils import get_user_permissions
    from academics.models import (
        DepartmentRole, SectionAdvisor, StudentMentorMap, StaffProfile,
        TeachingAssignment,
    )

    role_names = _effective_role_names(user)
    try:
        permissions = {str(p) for p in get_user_permissions(user)}
    except Exception:
        permissions = set()
    is_superuser = bool(getattr(user, 'is_superuser', False))

    scope: dict = {}
    scope['user_id'] = user.pk
    scope['username'] = getattr(user, 'username', '')
    scope['effective_roles'] = sorted(role_names)
    scope['roles'] = sorted(role_names)
    scope['permissions'] = sorted(permissions)

    # College-wide = explicit all-college permission OR designated role.
    is_college_wide = (
        is_superuser
        or bool(set(COLLEGE_WIDE_PERMISSIONS) & permissions)
        or bool(role_names & COLLEGE_WIDE_ROLES)
    )
    scope['is_college_wide'] = is_college_wide

    is_hod = 'HOD' in role_names or 'AHOD' in role_names
    is_advisor = 'ADVISOR' in role_names or 'CLASS_ADVISOR' in role_names
    is_faculty = bool(role_names & {'STAFF', 'FACULTY', 'AP'}) or is_hod or is_advisor
    scope.update({
        'is_principal': is_college_wide,
        'is_hod': is_hod,
        'is_advisor': is_advisor,
        'is_faculty': is_faculty,
        'is_student': 'STUDENT' in role_names,
    })

    # ── ASSIGNMENT: which academic data the user may access ──────────────
    dept_id_set: Set[str] = set()
    dept_code_set: Set[str] = set()
    dept_id_list, dept_code_list, dept_name_list = [], [], []
    current_department = None
    advised_sections = []
    advised_section_ids: Set[str] = set()
    assigned_subjects = []
    ta_section_ids: Set[str] = set()
    mentee_ids: list = []
    mentee_pk_set: Set[str] = set()

    staff_profile = StaffProfile.objects.filter(user=user).select_related('department').first()

    if staff_profile:
        try:
            dept = staff_profile.get_current_department()
        except Exception:
            dept = None
        if dept is None:
            dept = staff_profile.department
        if dept is not None:
            current_department = {
                'id': str(dept.id),
                'code': dept.code or dept.short_name or str(dept.id),
                'name': dept.name,
            }

        # HOD / AHOD authority over departments — possibly MANY departments.
        for row in DepartmentRole.objects.filter(
            staff=staff_profile, role__in=HOD_DEPARTMENT_ROLES, is_active=True
        ).select_related('department'):
            d = row.department
            if d is None:
                continue
            did = str(d.id)
            dcode = str(d.code or d.short_name or did)
            if did not in dept_id_set:
                dept_id_set.add(did)
                dept_code_set.add(dcode.upper())
                dept_id_list.append(did)
                dept_code_list.append(dcode)
                dept_name_list.append(d.name)

        # A scoped (non college-wide) user always keeps their home department.
        if not is_college_wide and current_department:
            did = current_department['id']
            if did not in dept_id_set:
                dept_id_set.add(did)
                dept_code_set.add(current_department['code'].upper())
                dept_id_list.append(did)
                dept_code_list.append(current_department['code'])
                dept_name_list.append(current_department['name'])

        # Advisor class scope (existing SectionAdvisor mapping).
        for sa in SectionAdvisor.objects.filter(
            advisor=staff_profile, is_active=True
        ).select_related('section', 'section__semester', 'section__batch'):
            sec = sa.section
            if sec:
                advised_section_ids.add(str(sec.id))
                advised_sections.append({
                    'section_id': str(sec.id),
                    'section_name': sec.name,
                    'semester': str(sec.semester.number) if sec.semester else '5',
                    'batch': str(sec.batch.name) if (sec.batch and sec.batch.name) else '2023',
                })

        # Subject-staff scope via existing TeachingAssignment.
        for ta in TeachingAssignment.objects.filter(
            staff=staff_profile, is_active=True
        ).select_related('subject', 'section'):
            if ta.section_id:
                ta_section_ids.add(str(ta.section_id))
            assigned_subjects.append({
                'assignment_id': str(ta.id),
                'subject_name': ta.subject.name if ta.subject else 'Course',
                'subject_code': ta.subject.code if ta.subject else 'SUB',
                'section_name': ta.section.name if ta.section else 'A',
                'section_id': str(ta.section_id) if ta.section_id else None,
            })

        # Mentor scope — data comes from StudentMentorMap, NOT the MENTOR role.
        for sid in StudentMentorMap.objects.filter(
            mentor=staff_profile, is_active=True
        ).values_list('student_id', flat=True):
            mentee_pk_set.add(str(sid))
            mentee_ids.append(str(sid))

    scope['_staff_profile_id'] = str(staff_profile.pk) if staff_profile else None
    scope['current_department'] = current_department
    scope['department_id'] = current_department['id'] if current_department else None
    scope['department_code'] = current_department['code'] if current_department else None
    scope['department_name'] = current_department['name'] if current_department else None
    scope['allowed_departments'] = {
        'ids': dept_id_list,
        'codes': dept_code_list,
        'names': dept_name_list,
    }
    scope['_allowed_dept_id_set'] = dept_id_set
    scope['_allowed_dept_code_set'] = dept_code_set
    scope['lock_department'] = not is_college_wide
    scope['advised_sections'] = advised_sections
    scope['_advised_section_ids'] = advised_section_ids
    scope['assigned_subjects'] = assigned_subjects
    scope['_ta_section_ids'] = ta_section_ids
    scope['mentee_ids'] = mentee_ids
    scope['_mentee_pk_set'] = mentee_pk_set

    # Primary display role (legacy precedence preserved).
    if is_college_wide:
        primary_role = 'PRINCIPAL'
    elif is_hod:
        primary_role = 'HOD'
    elif is_advisor or advised_sections:
        primary_role = 'ADVISOR'
        scope['is_advisor'] = True
    elif scope['is_faculty'] or assigned_subjects:
        primary_role = 'FACULTY'
    elif scope['is_student']:
        primary_role = 'STUDENT'
    else:
        primary_role = 'STAFF'
    scope['role'] = primary_role

    try:
        setattr(user, '_ap_authorization_scope', scope)
    except Exception:
        pass
    return scope


def build_authorization_context(user) -> dict:
    """Public authorization context safe to return to the frontend."""
    scope = _compute_scope(user)
    return {k: v for k, v in scope.items() if not k.startswith('_')}


def get_performance_scope(user) -> dict:
    """Full internal scope (includes private sets) for server-side enforcement."""
    if not user or not getattr(user, 'is_authenticated', False):
        return _anonymous_scope()
    return _compute_scope(user)


# ───────────────────────── enforcement helpers ────────────────────────────

def _dept_in_scope(scope, value) -> bool:
    v = str(value or '').strip()
    if not v:
        return False
    return v in scope['_allowed_dept_id_set'] or v.upper() in scope['_allowed_dept_code_set']


def clamp_department_param(scope, requested) -> str:
    """Validate a user-supplied department filter against authorized scope.

    - College-wide users may pass any department (including none).
    - Scoped users may only pass one of their allowed departments; an empty
      value defaults to their primary department; anything else → 403.
    """
    req = str(requested or '').strip()
    if scope['is_college_wide']:
        return req
    if req:
        if _dept_in_scope(scope, req):
            return req
        raise PermissionDenied('Requested department is outside your authorized scope.')
    return scope['department_id'] or ''


def clamp_department_list(scope, requested_list) -> list:
    """Validate a multi-select department filter. Returns the effective list."""
    reqs = [str(d).strip() for d in (requested_list or []) if str(d).strip()]
    if scope['is_college_wide']:
        return reqs
    allowed_ids = sorted(scope['_allowed_dept_id_set'])
    if not reqs:
        return allowed_ids or ([scope['department_id']] if scope['department_id'] else [])
    clamped = []
    for r in reqs:
        if _dept_in_scope(scope, r):
            clamped.append(r)
        else:
            raise PermissionDenied('Requested department is outside your authorized scope.')
    return clamped


def allowed_student_q(scope, student_dept_q_func):
    """Q restricting a StudentProfile queryset to the authorized dataset.

    Returns None when the user is college-wide (no restriction); otherwise a
    Q covering allowed departments ∪ advised sections ∪ taught sections ∪
    mentees. Deny-all for an authenticated user with zero academic scope.
    """
    if scope['is_college_wide']:
        return None
    combined = Q()
    for did in scope['_allowed_dept_id_set']:
        combined |= student_dept_q_func(did)
    if scope['_advised_section_ids']:
        combined |= Q(section_id__in=scope['_advised_section_ids'])
    if scope['_ta_section_ids']:
        combined |= Q(section_id__in=scope['_ta_section_ids'])
    if scope['_mentee_pk_set']:
        combined |= Q(pk__in=scope['_mentee_pk_set'])
    if not combined:
        return Q(pk__in=[])  # deny-all
    return combined


def allowed_mark_student_q(scope):
    """Q restricting mark rows (via their `student` FK) to the authorized dataset."""
    if scope['is_college_wide']:
        return None
    extra = Q()
    if scope['_allowed_dept_id_set']:
        dept_q = Q()
        for did in scope['_allowed_dept_id_set']:
            dept_q |= Q(student__home_department_id=did)
        extra |= dept_q
    if scope['_advised_section_ids'] or scope['_ta_section_ids']:
        secs = scope['_advised_section_ids'] | scope['_ta_section_ids']
        extra |= Q(student__section_id__in=secs)
    if scope['_mentee_pk_set']:
        extra |= Q(student_id__in=scope['_mentee_pk_set'])
    return extra if extra else Q(pk__in=[])


def assert_student_in_scope(scope, student) -> None:
    """Raise PermissionDenied unless `student` is inside the authorized scope."""
    if scope['is_college_wide']:
        return
    if student is None:
        raise PermissionDenied('Student not found.')
    if str(student.pk) in scope['_mentee_pk_set']:
        return
    section = getattr(student, 'section', None)
    if section is not None and str(section.pk) in (
        scope['_advised_section_ids'] | scope['_ta_section_ids']
    ):
        return
    dept_ids = set()
    hd = getattr(student, 'home_department', None)
    if hd is not None:
        dept_ids.add(str(hd.pk))
    try:
        batch_course_dept = student.section.batch.course.department
        if batch_course_dept is not None:
            dept_ids.add(str(batch_course_dept.pk))
    except Exception:
        pass
    try:
        home = getattr(student, 'home_department', None)
    except Exception:
        home = None
    if home is not None and str(home.pk) in scope['_allowed_dept_id_set']:
        return
    if dept_ids & scope['_allowed_dept_id_set']:
        return
    raise PermissionDenied('Requested student is outside your authorized scope.')


def assert_section_in_scope(scope, section) -> None:
    """Raise PermissionDenied unless `section` is inside the authorized scope.

    Allowed when: college-wide, HOD/AHOD of the section's department, the
    section's advisor, or subject-staff teaching in that section.
    """
    if scope['is_college_wide']:
        return
    if section is None:
        raise PermissionDenied('Section not found.')
    if str(section.pk) in (scope['_advised_section_ids'] | scope['_ta_section_ids']):
        return
    try:
        dept = section.batch.course.department
    except Exception:
        dept = None
    if dept is not None and str(dept.pk) in scope['_allowed_dept_id_set']:
        return
    raise PermissionDenied('Requested section is outside your authorized scope.')
