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
            'hod_obe_requests': False,
            'obe_master_requests': False,
            'academic_calendar_admin': False,
        }
        return {
            'username': '',
            'email': '',
            'is_iqac_main': False,
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

    # Treat Django superusers as isolated admins: do not derive additional
    # roles from staff/student profile mappings. Keep only explicit
    # `accounts.Role` memberships when isolating.
    is_admin_isolated = bool(getattr(user, 'is_superuser', False))
    if is_admin_isolated and 'SUPER_ADMIN' not in {str(x).upper() for x in role_names}:
        role_names.append('SUPER_ADMIN')

    # Compute role_features early so page visibility can rely on explicit
    # role → feature assignments rather than staff/student profile values.
    try:
        role_features = list(
            models.Role.objects.filter(
                user_roles__user=user
            ).values_list('features__code', flat=True).distinct()
        )
        role_features = {f for f in role_features if f}
    except Exception:
        role_features = set()

    # Department roles (HOD/AHOD) are modeled in academics.DepartmentRole,
    # not necessarily as accounts.Role. Expose them as effective roles so the
    # frontend can show HOD pages in the sidebar.
    dept_role_names = set()
    try:
        # Skip deriving department/mentor/advisor roles for isolated admins
        if not is_admin_isolated:
            staff_profile = getattr(user, 'staff_profile', None)
            if staff_profile is not None:
                from academics.models import DepartmentRole
                from academics.models import StudentMentorMap, SectionAdvisor

                dept_roles = DepartmentRole.objects.filter(staff=staff_profile, is_active=True).values_list('role', flat=True)
                for r in dept_roles:
                    if r:
                        dept_role_names.add(str(r).upper())

                has_active_mentor_mentees = StudentMentorMap.objects.filter(mentor=staff_profile, is_active=True).exists()
                has_active_advisee_sections = SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True).exists()

                if has_active_mentor_mentees:
                    dept_role_names.add('MENTOR')
                if has_active_advisee_sections:
                    dept_role_names.add('ADVISOR')
        else:
            has_active_mentor_mentees = False
            has_active_advisee_sections = False
    except Exception:
        dept_role_names = set()
        has_active_mentor_mentees = False
        has_active_advisee_sections = False

    for r in sorted(dept_role_names):
        if r not in {str(x).upper() for x in role_names}:
            role_names.append(r)

    is_iqac_main = False
    try:
        is_iqac_main = ('IQAC' in {str(r or '').upper() for r in role_names}) and str(getattr(user, 'username', '') or '').strip() == '000000'
    except Exception:
        is_iqac_main = False

    Permission = models.Permission
    try:
        perms_qs = Permission.objects.filter(permission_roles__role__in=roles_qs).distinct()
        perm_codes = sorted({p.code for p in perms_qs})
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception('Error fetching permissions for user')
        perm_codes = []

    grouped: Dict[str, List[str]] = {}
    for code in perm_codes:
        group = _group_permission_code(code)
        grouped.setdefault(group, []).append(code)

    lower_perms = {p.lower() for p in perm_codes}
    role_names_upper = {str(r).upper() for r in role_names}

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

    # Role-based flags: prefer explicit role membership, permissions, or
    # role_features rather than using `staff_profile`/`student_profile`.
    STAFF_ROLE_SET = {'STAFF', 'FACULTY', 'ADMIN', 'EXT_STAFF', 'HOD', 'AHOD', 'IQAC', 'HR', 'SECURITY'}
    flags = {
        'is_student': 'STUDENT' in role_names_upper,
        'is_staff': bool(role_names_upper & STAFF_ROLE_SET),
        'can_view_curriculum_master': has_master_view(),
        'can_edit_curriculum_master': has_master_edit(),
        'can_approve_department_curriculum': has_department_approve(),
        'can_fill_department_curriculum': has_department_fill(),
        'can_manage_timetable_templates': ('timetable.manage_templates' in lower_perms) or ('timetable_staff' in role_features),
        'can_assign_timetable': ('timetable.assign' in lower_perms) or ('HOD' in role_names_upper),
        'can_view_timetable': ('timetable.view' in lower_perms) or ('timetable_student' in role_features) or ('timetable_staff' in role_features),
        'can_assign_advisor': ('academics.assign_advisor' in lower_perms) or ('ADVISOR' in role_names_upper),
        'can_assign_teaching': ('academics.assign_teaching' in lower_perms) or ('HOD' in role_names_upper),
        'can_view_feedback_page': ('feedback.feedback_page' in lower_perms) or ('feedback' in role_features),
        'can_create_feedback': ('feedback.create' in lower_perms) or ('feedback' in role_features),
        'can_reply_feedback': ('feedback.reply' in lower_perms) or ('feedback' in role_features),
        'can_access_coe_portal': ('coe.portal.access' in lower_perms) or str(getattr(user, 'email', '') or '').strip().lower() == 'coe@krct.ac.in' or ('coe' in role_features),
        'can_manage_academic_calendar': ('academic_calendar.admin' in lower_perms) or ('academic_calendar' in role_features),
        'can_manage_elective_poll': ('curriculum.manage_elective_poll' in lower_perms) or ('obe' in role_features),
        'can_choose_elective': 'curriculum.choose_elective' in lower_perms,
        'can_hod_elective_manage': 'curriculum.hod_elective_manage' in lower_perms,
        'can_upload_certificates': 'STUDENT' in role_names_upper,
        'can_review_certificates': (has_active_mentor_mentees or ('MENTOR' in role_names_upper) or ('certificates.review' in lower_perms) or ('certificates' in role_features)),
        'can_view_certificate_achievements': bool(
            'MENTOR' in role_names_upper
            or 'ADVISOR' in role_names_upper
            or 'HOD' in role_names_upper
            or 'IQAC' in role_names_upper
            or ('certificates' in role_features)
        ),
        'can_view_achievement_reports': 'IQAC' in role_names_upper or ('certificates' in role_features),
    }

    # `hod_role_present` should reflect explicit `accounts.Role` membership only.
    # Do NOT treat DepartmentRole/RoleAssignment-inferred roles as equivalent
    # for enabling certain entry points (like HOD: OBE Requests).
    try:
        hod_role_present = roles_qs.filter(name__iexact='HOD').exists()
    except Exception:
        hod_role_present = any(str(r).upper() == 'HOD' for r in role_names)
    entry_points = {
        'curriculum_master': bool(flags.get('can_edit_curriculum_master') or flags.get('can_view_curriculum_master')),
        'department_curriculum': bool(flags.get('can_fill_department_curriculum') or flags.get('can_approve_department_curriculum')),
        'student_curriculum_view': bool(flags.get('is_student')),
        'certificates_upload': bool(flags.get('can_upload_certificates')),
        'certificates_review': bool(flags.get('can_review_certificates')),
        'certificates_review': bool(flags.get('can_review_certificates')),
        'certificates_achievements': bool(flags.get('can_view_certificate_achievements')),
        'certificates_reports': bool(flags.get('can_view_achievement_reports')),
        'timetable_templates': bool(flags.get('can_manage_timetable_templates')),
        'timetable_assignments': bool(flags.get('can_assign_timetable') or ('HOD' in role_names_upper)),
        'hod_advisors': bool(flags.get('can_assign_advisor') or hod_role_present),
        'hod_teaching': bool(flags.get('can_assign_teaching') or hod_role_present),
        'staff_students': bool('students.view_students' in lower_perms),
        'hod_obe_requests': ('obe.hod_obe_requests' in lower_perms),
        'obe_master_requests': ('obe.master_obe_requests' in lower_perms),
        'feedback_page': bool(flags.get('can_view_feedback_page')),
        'coe_portal': bool(flags.get('can_access_coe_portal')),
        'academic_calendar_admin': bool(flags.get('can_manage_academic_calendar')),
        'elective_poll': bool(flags.get('can_manage_elective_poll') or flags.get('can_choose_elective') or flags.get('can_hod_elective_manage')),
        # Pages like My Calendar, Staff Salary, Event Attending rely on explicit
        # role features or permissions rather than profile existence.
        'my_calendar': ('my_calendar' in role_features) or ('calendar.view' in lower_perms),
        'staff_salary': ('staff_salary' in role_features) or ('staff_salary.view' in lower_perms),
        'events_attending': ('events' in role_features) or ('events.view' in lower_perms) or ('events.create_proposal' in lower_perms),
    }

    # ── College Feature Flags ──────────────────────────────────────────────────
    # Determine which college this user belongs to (via their profile).
    # Returns the list of enabled feature codes for that college.
    # If the user has no college (e.g. SUPER_ADMIN), return empty list so the
    # sidebar shows all items it would normally show via role/perm checks.
    college_features: List[str] = []
    college_id: Optional[int] = None
    try:
        _sp = getattr(user, 'student_profile', None)
        if _sp is not None:
            college_id = getattr(_sp, 'college_id', None)
        if college_id is None:
            _st = getattr(user, 'staff_profile', None)
            if _st is not None:
                college_id = getattr(_st, 'college_id', None)

        if college_id is not None:
            from college.models import CollegeFeature
            college_features = list(
                CollegeFeature.objects.filter(
                    college_id=college_id,
                    is_enabled=True,
                ).values_list('feature__code', flat=True)
            )
    except Exception:
        college_features = []

    # ── Role-assigned Feature Flags ───────────────────────────────────────────
    # Collect all features assigned to the user's roles.
    # This lets the frontend check "does this user's role have feature X?"
    # independently from the college-level feature toggle.
    role_features: List[str] = []
    try:
        role_features = list(
            models.Role.objects.filter(
                user_roles__user=user
            ).values_list('features__code', flat=True).distinct()
        )
        # filter out None values (roles with no features assigned)
        role_features = [f for f in role_features if f]
    except Exception:
        role_features = []

    return {
        'username': str(getattr(user, 'username', '') or ''),
        'email': str(getattr(user, 'email', '') or ''),
        'is_iqac_main': bool(is_iqac_main),
        'profile_type': profile_type,
        'roles': role_names,
        'permissions': perm_codes,
        'profile_status': profile_status,
        'capabilities': grouped,
        'flags': flags,
        'entry_points': entry_points,
        'college_features': college_features,
        'role_features': role_features,
        # Expose the user's college ID so the frontend can build
        # college-admin links (e.g. /colleges/:id) for ADMIN role users.
        'college_id': college_id,
    }


__all__ = ['resolve_dashboard_capabilities']
