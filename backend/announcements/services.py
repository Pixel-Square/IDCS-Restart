from dataclasses import dataclass
from typing import Iterable, Optional, Sequence, Set

from django.db.models import Q
from django.utils import timezone

from accounts.utils import get_user_permissions
from rest_framework.exceptions import ValidationError as DRFValidationError
from academics.models import (
    AcademicYear,
    Department,
    DepartmentRole,
    Section,
    SectionAdvisor,
    StaffDepartmentAssignment,
    StaffProfile,
    StudentProfile,
)

from .models import Announcement, AnnouncementReadStatus

ROLE_PRINCIPAL = 'PRINCIPAL'
ROLE_IQAC = 'IQAC'
ROLE_HOD = 'HOD'
ROLE_STAFF = 'STAFF'
ROLE_STUDENT = 'STUDENT'


@dataclass
class AnnouncementScope:
    roles: Set[str]
    permissions: Set[str]
    department_ids: Set[int]
    section_ids: Set[int]
    is_superuser: bool = False


def get_actor_role(user=None, roles: Optional[Iterable[str]] = None) -> str:
    role_list = []
    if roles is not None:
        role_list = [str(r or '').upper() for r in roles]
    elif user is not None:
        try:
            role_list = list(user.roles.values_list('name', flat=True))
        except Exception:
            role_list = []
    normalized = [str(r or '').strip().upper() for r in role_list if str(r or '').strip()]
    priority = [ROLE_PRINCIPAL, ROLE_IQAC, ROLE_HOD, ROLE_STAFF, ROLE_STUDENT]
    for role in priority:
        if role in normalized:
            return role
    return ''


def get_allowed_target_roles(user=None) -> Sequence[str]:
    actor_role = get_actor_role(user=user)
    if actor_role == ROLE_PRINCIPAL:
        return [ROLE_PRINCIPAL, ROLE_IQAC, ROLE_HOD, ROLE_STAFF, ROLE_STUDENT]
    if actor_role == ROLE_IQAC:
        return [ROLE_HOD, ROLE_STAFF, ROLE_STUDENT]
    if actor_role == ROLE_HOD:
        return [ROLE_STAFF, ROLE_STUDENT]
    if actor_role == ROLE_STAFF:
        return [ROLE_STUDENT]
    return []


class AnnouncementScopeService:
    """Visibility helpers kept intentionally simple for stability."""

    @classmethod
    def build_scope(cls, user) -> AnnouncementScope:
        roles: Set[str] = set()
        permissions: Set[str] = set()
        dept_ids: Set[int] = set()
        section_ids: Set[int] = set()

        if not user or not getattr(user, 'is_authenticated', False):
            return AnnouncementScope(roles=set(), permissions=set(), department_ids=set(), section_ids=set(), is_superuser=False)

        try:
            roles = {str(r or '').strip().upper() for r in user.roles.values_list('name', flat=True)}
        except Exception:
            roles = set()

        try:
            permissions = {str(p or '').strip().lower() for p in get_user_permissions(user)}
        except Exception:
            permissions = set()

        # Staff department sources
        try:
            staff_profile = getattr(user, 'staff_profile', None)
        except Exception:
            staff_profile = None
        if staff_profile and getattr(staff_profile, 'department_id', None):
            dept_ids.add(staff_profile.department_id)

        # Active staff department assignments
        if staff_profile:
            try:
                for dept_id in StaffDepartmentAssignment.objects.filter(
                    staff=staff_profile,
                    end_date__isnull=True,
                ).values_list('department_id', flat=True):
                    if dept_id:
                        dept_ids.add(dept_id)
            except Exception:
                pass

        # Active department roles (HOD/AHOD) for current academic year
        try:
            active_ay = AcademicYear.objects.filter(is_active=True).first()
        except Exception:
            active_ay = None
        if staff_profile:
            try:
                dept_role_qs = DepartmentRole.objects.filter(staff=staff_profile, is_active=True)
                if active_ay:
                    dept_role_qs = dept_role_qs.filter(academic_year=active_ay)
                for dept_id in dept_role_qs.values_list('department_id', flat=True):
                    if dept_id:
                        dept_ids.add(dept_id)
            except Exception:
                pass

        # Student department + section
        try:
            student_profile: Optional[StudentProfile] = getattr(user, 'student_profile', None)
        except Exception:
            student_profile = None
        if student_profile:
            if getattr(student_profile, 'home_department_id', None):
                dept_ids.add(student_profile.home_department_id)
            try:
                current_section = student_profile.get_current_section()
                if current_section is not None and getattr(current_section, 'id', None):
                    section_ids.add(current_section.id)
                    section_dept = cls._section_department_id(current_section)
                    if section_dept:
                        dept_ids.add(section_dept)
            except Exception:
                pass

        # Advisor sections (staff)
        if staff_profile:
            try:
                advisor_qs = SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True)
                if active_ay:
                    advisor_qs = advisor_qs.filter(academic_year=active_ay)
                for section_id, dept_id in advisor_qs.values_list('section_id', 'section__batch__course__department_id'):
                    if section_id:
                        section_ids.add(section_id)
                    if dept_id:
                        dept_ids.add(dept_id)
            except Exception:
                pass

        is_superuser = bool(getattr(user, 'is_superuser', False))
        return AnnouncementScope(
            roles=roles,
            permissions=permissions,
            department_ids=dept_ids,
            section_ids=section_ids,
            is_superuser=is_superuser,
        )

    @classmethod
    def queryset_for_user(cls, user, scope: Optional[AnnouncementScope] = None):
        if scope is None:
            scope = cls.build_scope(user)

        if not user or not getattr(user, 'is_authenticated', False):
            return Announcement.objects.none()

        now = timezone.now()
        base_qs = (
            Announcement.objects.filter(is_active=True)
            .filter(Q(expiry_date__isnull=True) | Q(expiry_date__gt=now))
            .select_related('created_by', 'department', 'target_class')
            .prefetch_related('target_departments')
            .order_by('-created_at')
        )

        visible_ids = []
        for announcement in base_qs:
            # Keep creator visibility so users can track their own sent items in All.
            if announcement.created_by_id == getattr(user, 'id', None):
                visible_ids.append(announcement.id)
                continue
            if cls.can_user_see(user, announcement):
                visible_ids.append(announcement.id)
        if not visible_ids:
            return Announcement.objects.none()
        return base_qs.filter(id__in=visible_ids)

    @classmethod
    def sent_queryset_for_user(cls, user):
        if not user or not getattr(user, 'is_authenticated', False):
            return Announcement.objects.none()
        now = timezone.now()
        return (
            Announcement.objects.filter(created_by=user, is_active=True)
            .filter(Q(expiry_date__isnull=True) | Q(expiry_date__gt=now))
            .select_related('created_by', 'department', 'target_class')
            .prefetch_related('target_departments')
            .order_by('-created_at')
        )

    @classmethod
    def validate_create_payload(cls, user, scope: AnnouncementScope, payload: dict):
        actor_role = get_actor_role(user=user, roles=scope.roles)
        target_type = payload.get('target_type')
        target_roles = [str(r or '').strip().upper() for r in (payload.get('target_roles') or []) if str(r or '').strip()]

        if actor_role == ROLE_STUDENT:
            raise DRFValidationError({'detail': 'Students cannot create announcements.'})

        allowed_roles = set(get_allowed_target_roles(user))
        invalid_roles = [r for r in target_roles if r not in allowed_roles]
        if invalid_roles:
            raise DRFValidationError({'target_roles': f'Invalid target roles: {", ".join(invalid_roles)}'})

        if actor_role == ROLE_HOD and ROLE_IQAC in target_roles:
            raise DRFValidationError({'target_roles': 'HOD cannot target IQAC.'})

        if actor_role == ROLE_STAFF and target_type != Announcement.TARGET_CLASS:
            raise DRFValidationError({'target_type': 'Staff can create class announcements only.'})

        if actor_role == ROLE_STAFF and any(r in {ROLE_HOD, ROLE_IQAC, ROLE_STAFF} for r in target_roles):
            raise DRFValidationError({'target_roles': 'Staff can only target students.'})
        return True

    @classmethod
    def create_options_for_user(cls, user, scope: AnnouncementScope):
        actor_role = get_actor_role(user=user, roles=scope.roles)
        can_create = 'announcements.create_announcement' in scope.permissions or scope.is_superuser
        allowed_target_types = cls._allowed_target_types(actor_role)
        allowed_target_roles = list(get_allowed_target_roles(user))

        department_locked = actor_role in {ROLE_HOD, ROLE_STAFF}
        forced_department_ids: Sequence[int] = list(scope.department_ids) if department_locked else []
        allow_multiple_departments = actor_role in {ROLE_PRINCIPAL, ROLE_IQAC}

        departments_qs = Department.objects.all()
        if actor_role == ROLE_HOD and scope.department_ids:
            departments_qs = departments_qs.filter(id__in=scope.department_ids)
        departments = list(departments_qs.order_by('name').values('id', 'code', 'name'))

        class_locked = False
        forced_class_id: Optional[int] = None
        classes = []
        if actor_role in {ROLE_PRINCIPAL, ROLE_IQAC}:
            classes = list(
                Section.objects.select_related('batch', 'batch__course', 'batch__department')
                .order_by('batch__name', 'name')
                .values('id', 'name', 'batch__name')
            )
        elif actor_role == ROLE_HOD and scope.department_ids:
            classes = list(
                Section.objects.filter(
                    Q(batch__course__department_id__in=scope.department_ids)
                    | Q(batch__department_id__in=scope.department_ids)
                    | Q(managing_department_id__in=scope.department_ids)
                )
                .select_related('batch', 'batch__course', 'batch__department')
                .order_by('batch__name', 'name')
                .values('id', 'name', 'batch__name')
            )
        elif actor_role == ROLE_STAFF and scope.section_ids:
            classes = list(
                Section.objects.filter(id__in=scope.section_ids)
                .select_related('batch', 'batch__course', 'batch__department')
                .order_by('batch__name', 'name')
                .values('id', 'name', 'batch__name')
            )
            if len(scope.section_ids) == 1:
                class_locked = True
                forced_class_id = list(scope.section_ids)[0]

        formatted_classes = [
            {
                'id': item['id'],
                'name': item['name'],
                'label': f"{item.get('batch__name', '')} / {item.get('name', '')}".strip(' /'),
            }
            for item in classes
        ]

        return {
            'can_create': can_create,
            'allowed_target_types': allowed_target_types,
            'allowed_target_roles': allowed_target_roles,
            'departments': departments,
            'classes': formatted_classes,
            'department_locked': department_locked,
            'allow_multiple_departments': allow_multiple_departments,
            'forced_department_ids': forced_department_ids,
            'class_locked': class_locked,
            'forced_class_id': forced_class_id,
            'show_sent_tab': can_create,
            'user_roles': list(scope.roles),
        }

    @classmethod
    def unread_count_for_user(cls, user, scope: Optional[AnnouncementScope] = None) -> int:
        if scope is None:
            scope = cls.build_scope(user)
        announcements = cls.queryset_for_user(user, scope)
        count = 0
        for announcement in announcements:
            if announcement.created_by_id == getattr(user, 'id', None):
                continue
            read = AnnouncementReadStatus.objects.filter(announcement=announcement, user=user, is_read=True).exists()
            if not read:
                count += 1
        return count

    @staticmethod
    def can_user_see(user, announcement: Announcement) -> bool:
        if user is None or not getattr(user, 'is_authenticated', False):
            return False

        role = get_actor_role(user=user)

        # TARGET_ALL without explicit audience roles is truly global.
        # If roles are present, they must be respected.
        if announcement.target_type == Announcement.TARGET_ALL:
            if announcement.target_roles:
                return role in announcement.target_roles
            return True

        # For non-ALL types, target_roles must be populated and include the user's role
        if not announcement.target_roles:
            return False
        if role not in announcement.target_roles:
            return False

        if announcement.target_type == Announcement.TARGET_ROLE:
            return True

        if announcement.target_type == Announcement.TARGET_DEPARTMENT:
            user_dept_id = AnnouncementScopeService._user_department_id(user)
            if announcement.department_id and user_dept_id:
                return announcement.department_id == user_dept_id
            if user_dept_id:
                return announcement.target_departments.filter(id=user_dept_id).exists()
            return False

        if announcement.target_type == Announcement.TARGET_CLASS:
            user_class_id = AnnouncementScopeService._user_class_id(user)
            if user_class_id and announcement.target_class_id:
                return user_class_id == announcement.target_class_id
            return False

        return False

    @staticmethod
    def _section_department_id(section: Section) -> Optional[int]:
        try:
            if getattr(section, 'managing_department_id', None):
                return section.managing_department_id
        except Exception:
            pass
        try:
            batch = getattr(section, 'batch', None)
            if batch is None:
                return None
            if getattr(batch, 'course_id', None) and getattr(batch.course, 'department_id', None):
                return batch.course.department_id
            if getattr(batch, 'department_id', None):
                return batch.department_id
        except Exception:
            return None
        return None

    @staticmethod
    def _user_department_id(user) -> Optional[int]:
        try:
            sp: Optional[StaffProfile] = getattr(user, 'staff_profile', None)
        except Exception:
            sp = None
        if sp and getattr(sp, 'department_id', None):
            return sp.department_id
        try:
            sa = StaffDepartmentAssignment.objects.filter(staff=sp, end_date__isnull=True).values_list('department_id', flat=True).first()
            if sa:
                return sa
        except Exception:
            pass
        try:
            st: Optional[StudentProfile] = getattr(user, 'student_profile', None)
        except Exception:
            st = None
        if st and getattr(st, 'home_department_id', None):
            return st.home_department_id
        # Fallback for students where home_department is empty but current section is mapped.
        if st:
            try:
                section = st.get_current_section()
                if section is not None:
                    dept_id = AnnouncementScopeService._section_department_id(section)
                    if dept_id:
                        return dept_id
            except Exception:
                pass
        return None

    @staticmethod
    def _user_class_id(user) -> Optional[int]:
        try:
            st: Optional[StudentProfile] = getattr(user, 'student_profile', None)
        except Exception:
            st = None
        if st:
            try:
                section = st.get_current_section()
                if section and getattr(section, 'id', None):
                    return section.id
            except Exception:
                pass
            if getattr(st, 'section_id', None):
                return st.section_id
        return None

    @staticmethod
    def _allowed_target_types(actor_role: str) -> Sequence[str]:
        if actor_role == ROLE_PRINCIPAL:
            return [Announcement.TARGET_ALL, Announcement.TARGET_DEPARTMENT, Announcement.TARGET_CLASS]
        if actor_role == ROLE_IQAC:
            return [Announcement.TARGET_ALL, Announcement.TARGET_DEPARTMENT, Announcement.TARGET_CLASS]
        if actor_role == ROLE_HOD:
            return [Announcement.TARGET_DEPARTMENT, Announcement.TARGET_CLASS]
        if actor_role == ROLE_STAFF:
            return [Announcement.TARGET_CLASS]
        if actor_role == ROLE_STUDENT:
            return []
        return [Announcement.TARGET_ALL]