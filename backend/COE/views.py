from collections import defaultdict
import json
import time

from django.core.cache import cache
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.utils import get_user_permissions
from academics.models import StudentProfile, Department
from .models import CoeArrearStudent


COE_PORTAL_LOGIN_EMAIL = 'coe@krct.ac.in'
COE_PORTAL_ACCESS_PERMISSION = 'coe.portal.access'

FEATURE_PERMISSION_MAP = {
    'exam_control': 'coe.manage.exams',
    'results': 'coe.manage.results',
    'circulars': 'coe.manage.circulars',
    'academic_calendar': 'coe.manage.calendar',
}

# Fallback cache for local/dev environments where shared cache backends
# are configured but unavailable (e.g., Redis down with IGNORE_EXCEPTIONS=True).
_LOCAL_STUDENTS_MAP_CACHE: dict[str, tuple[float, dict]] = {}
_LOCAL_STUDENTS_MAP_BYTES_CACHE: dict[str, tuple[float, bytes]] = {}


def _normalize_department_label(raw_values: list[str]) -> str | None:
    """Map DB department variants (codes, IDs, names) to canonical labels."""

    def _match_aliases(parts: list[str]) -> str | None:
        joined = ' '.join(parts)

        if any(p in ('AIDS', 'AI&DS', 'AI AND DS', 'ARTIFICIAL INTELLIGENCE AND DATA SCIENCE') for p in parts) or 'DATA SCIENCE' in joined:
            return 'AIDS'
        if any(p in ('AIML', 'AI&ML', 'AI AND ML', 'ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING') for p in parts) or 'MACHINE LEARNING' in joined:
            return 'AIML'
        if any(p in ('CSE', 'COMPUTER SCIENCE') for p in parts):
            return 'CSE'
        if any(p in ('CIVIL', 'CE') for p in parts) or 'CIVIL' in joined:
            return 'CE'
        if any(p in ('ECE',) for p in parts) or ('ELECTRONICS' in joined and 'COMMUNICATION' in joined):
            return 'ECE'
        if any(p in ('EEE',) for p in parts) or ('ELECTRICAL' in joined and 'ELECTRONICS' in joined):
            return 'EEE'
        if any(p in ('IT', 'INFORMATION TECHNOLOGY') for p in parts) or 'INFORMATION TECHNOLOGY' in joined:
            return 'IT'
        if any(p in ('MECH', 'ME') for p in parts) or 'MECHANICAL' in joined:
            return 'ME'
        return None

    parts = [str(v or '').strip().upper() for v in raw_values if str(v or '').strip()]
    if not parts:
        return None

    direct = _match_aliases(parts)
    if direct:
        return direct

    # Try resolving against Department table (code, short name, name, id).
    dept_obj = None
    numeric_parts = [p for p in parts if p.isdigit()]
    if numeric_parts:
        try:
            dept_obj = Department.objects.filter(id__in=[int(p) for p in numeric_parts]).first()
        except Exception:
            dept_obj = None

    if not dept_obj:
        for part in parts:
            dept_obj = (
                Department.objects.filter(
                    Q(code__iexact=part)
                    | Q(short_name__iexact=part)
                    | Q(name__iexact=part)
                ).first()
            )
            if dept_obj:
                break

    if dept_obj:
        canonical_parts = [
            str(getattr(dept_obj, 'short_name', '') or '').strip().upper(),
            str(getattr(dept_obj, 'code', '') or '').strip().upper(),
            str(getattr(dept_obj, 'name', '') or '').strip().upper(),
        ]
        canonical = _match_aliases([p for p in canonical_parts if p])
        if canonical:
            return canonical
        for value in canonical_parts:
            if value:
                return value

    return None


def _normalized_email(user) -> str:
    return str(getattr(user, 'email', '') or '').strip().lower()


def _is_coe_login(user) -> bool:
    return _normalized_email(user) == COE_PORTAL_LOGIN_EMAIL


def _has_portal_access(user, permission_codes: set[str]) -> bool:
    if getattr(user, 'is_superuser', False):
        return True
    if _is_coe_login(user):
        return True
    return COE_PORTAL_ACCESS_PERMISSION in permission_codes


def _parse_semester_label(value: str) -> str | None:
    raw = str(value or '').strip().upper()
    if not raw:
        return None
    if raw.startswith('SEM'):
        raw = raw.replace('SEM', '', 1)
    try:
        sem_number = int(raw)
    except Exception:
        return None
    if sem_number < 1 or sem_number > 8:
        return None
    return f'SEM{sem_number}'


def _serialize_arrear_row(row) -> dict:
    return {
        'id': row.id,
        'batch': str(row.batch or ''),
        'department': str(row.department or ''),
        'semester': str(row.semester or ''),
        'course_code': str(row.course_code or ''),
        'course_name': str(row.course_name or ''),
        'student_register_number': str(row.student_register_number or ''),
        'student_name': str(row.student_name or ''),
        'updated_at': row.updated_at.isoformat() if row.updated_at else None,
    }


def _validate_arrear_payload(payload: dict, *, allow_partial: bool = False) -> tuple[dict, str | None]:
    required_fields = [
        'batch',
        'department',
        'semester',
        'course_code',
        'course_name',
        'student_register_number',
        'student_name',
    ]

    cleaned: dict = {}
    for field in required_fields:
        has_value = field in payload
        raw = payload.get(field)
        value = str(raw or '').strip()

        if not allow_partial or has_value:
            if not value:
                return {}, f'{field} is required.'
            cleaned[field] = value

    if 'department' in cleaned:
        normalized_dept = _normalize_department_label([cleaned['department']])
        if not normalized_dept:
            return {}, 'Invalid department. Use one of AIDS, AIML, CSE, CIVIL, ECE, EEE, IT, MECH.'
        cleaned['department'] = normalized_dept

    if 'semester' in cleaned:
        normalized_sem = _parse_semester_label(cleaned['semester'])
        if not normalized_sem:
            return {}, 'Invalid semester. Use SEM1..SEM8.'
        cleaned['semester'] = normalized_sem

    if 'course_code' in cleaned:
        cleaned['course_code'] = cleaned['course_code'].upper()

    if 'student_register_number' in cleaned:
        cleaned['student_register_number'] = cleaned['student_register_number'].upper()

    return cleaned, None


class CoePortalContextView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        permission_codes: set[str] = set()
        if not getattr(user, 'is_superuser', False) and not _is_coe_login(user):
            permission_codes = {str(p or '').strip().lower() for p in get_user_permissions(user)}

        if not _has_portal_access(user, permission_codes):
            return Response({'detail': 'You do not have access to the COE portal.'}, status=status.HTTP_403_FORBIDDEN)

        is_coe_login = _is_coe_login(user)

        features = {
            feature_key: bool(is_coe_login or permission_code in permission_codes)
            for feature_key, permission_code in FEATURE_PERMISSION_MAP.items()
        }

        return Response(
            {
                'portal_access': True,
                'is_coe_login': is_coe_login,
                'portal_login_email': COE_PORTAL_LOGIN_EMAIL,
                'access_via_permission': bool(COE_PORTAL_ACCESS_PERMISSION in permission_codes),
                'permissions': sorted([p for p in permission_codes if p.startswith('coe.')]),
                'features': features,
            }
        )


class CoeArrearStudentsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        permission_codes = {str(p or '').strip().lower() for p in get_user_permissions(user)}
        if not _has_portal_access(user, permission_codes):
            return Response({'detail': 'You do not have access to the COE portal.'}, status=status.HTTP_403_FORBIDDEN)

        department_raw = str(request.query_params.get('department', '') or '').strip()
        semester_raw = str(request.query_params.get('semester', '') or '').strip()

        qs = CoeArrearStudent.objects.all().order_by(
            'department',
            'semester',
            'course_code',
            'student_register_number',
        )

        if department_raw:
            dept = _normalize_department_label([department_raw])
            if not dept:
                return Response({'detail': 'Invalid department filter.'}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(department=dept)

        if semester_raw:
            sem = _parse_semester_label(semester_raw)
            if not sem:
                return Response({'detail': 'Invalid semester filter. Use SEM1..SEM8.'}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(semester=sem)

        return Response({'results': [_serialize_arrear_row(row) for row in qs]})

    def post(self, request):
        user = request.user
        permission_codes = {str(p or '').strip().lower() for p in get_user_permissions(user)}
        if not _has_portal_access(user, permission_codes):
            return Response({'detail': 'You do not have access to the COE portal.'}, status=status.HTTP_403_FORBIDDEN)

        payload = request.data or {}
        cleaned, error = _validate_arrear_payload(payload, allow_partial=False)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        row, created = CoeArrearStudent.objects.update_or_create(
            department=cleaned['department'],
            semester=cleaned['semester'],
            course_code=cleaned['course_code'],
            student_register_number=cleaned['student_register_number'],
            defaults={
                'batch': cleaned['batch'],
                'course_name': cleaned['course_name'],
                'student_name': cleaned['student_name'],
            },
        )

        return Response(
            {
                'created': bool(created),
                'record': _serialize_arrear_row(row),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class CoeArrearBulkUpsertView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = request.user
        permission_codes = {str(p or '').strip().lower() for p in get_user_permissions(user)}
        if not _has_portal_access(user, permission_codes):
            return Response({'detail': 'You do not have access to the COE portal.'}, status=status.HTTP_403_FORBIDDEN)

        rows = (request.data or {}).get('rows', [])
        if not isinstance(rows, list) or len(rows) == 0:
            return Response({'detail': 'rows must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        updated_count = 0
        errors: list[str] = []

        for idx, item in enumerate(rows, start=1):
            if not isinstance(item, dict):
                errors.append(f'Row {idx}: invalid object.')
                continue

            cleaned, error = _validate_arrear_payload(item, allow_partial=False)
            if error:
                errors.append(f'Row {idx}: {error}')
                continue

            _, created = CoeArrearStudent.objects.update_or_create(
                department=cleaned['department'],
                semester=cleaned['semester'],
                course_code=cleaned['course_code'],
                student_register_number=cleaned['student_register_number'],
                defaults={
                    'batch': cleaned['batch'],
                    'course_name': cleaned['course_name'],
                    'student_name': cleaned['student_name'],
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        return Response(
            {
                'created': created_count,
                'updated': updated_count,
                'errors': errors,
            },
            status=status.HTTP_200_OK,
        )


class CoeArrearStudentDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def put(self, request, pk: int):
        user = request.user
        permission_codes = {str(p or '').strip().lower() for p in get_user_permissions(user)}
        if not _has_portal_access(user, permission_codes):
            return Response({'detail': 'You do not have access to the COE portal.'}, status=status.HTTP_403_FORBIDDEN)

        row = CoeArrearStudent.objects.filter(pk=pk).first()
        if not row:
            return Response({'detail': 'Arrear record not found.'}, status=status.HTTP_404_NOT_FOUND)

        cleaned, error = _validate_arrear_payload(request.data or {}, allow_partial=False)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        duplicate_qs = CoeArrearStudent.objects.filter(
            department=cleaned['department'],
            semester=cleaned['semester'],
            course_code=cleaned['course_code'],
            student_register_number=cleaned['student_register_number'],
        ).exclude(pk=row.pk)
        if duplicate_qs.exists():
            return Response(
                {'detail': 'Another arrear record already exists for this department, semester, course code and register number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        row.batch = cleaned['batch']
        row.department = cleaned['department']
        row.semester = cleaned['semester']
        row.course_code = cleaned['course_code']
        row.course_name = cleaned['course_name']
        row.student_register_number = cleaned['student_register_number']
        row.student_name = cleaned['student_name']
        row.save()

        return Response({'record': _serialize_arrear_row(row)}, status=status.HTTP_200_OK)

    def delete(self, request, pk: int):
        user = request.user
        permission_codes = {str(p or '').strip().lower() for p in get_user_permissions(user)}
        if not _has_portal_access(user, permission_codes):
            return Response({'detail': 'You do not have access to the COE portal.'}, status=status.HTTP_403_FORBIDDEN)

        row = CoeArrearStudent.objects.filter(pk=pk).first()
        if not row:
            return Response({'detail': 'Arrear record not found.'}, status=status.HTTP_404_NOT_FOUND)

        row.delete()
        return Response({'deleted': True}, status=status.HTTP_200_OK)


class CoeStudentsCourseMapView(APIView):
    permission_classes = (IsAuthenticated,)
    CACHE_TTL_SECONDS = 90

    def get(self, request):
        user = request.user
        permission_codes = {str(p or '').strip().lower() for p in get_user_permissions(user)}

        if not _has_portal_access(user, permission_codes):
            return Response({'detail': 'You do not have access to the COE portal.'}, status=status.HTTP_403_FORBIDDEN)

        department_raw = str(request.query_params.get('department', 'ALL') or 'ALL').strip()
        if not department_raw or department_raw.upper() == 'ALL':
            department_filter = 'ALL'
        else:
            # Handle unencoded & in query params like ?department=AI&ML
            if department_raw.upper() == 'AI' and 'ML' in request.query_params:
                department_raw = 'AI&ML'
            elif department_raw.upper() == 'AI' and 'DS' in request.query_params:
                department_raw = 'AI&DS'
            elif department_raw.upper() == 'S' and 'H' in request.query_params:
                department_raw = 'S&H'
            elif department_raw.upper() == 'T' and 'P' in request.query_params:
                department_raw = 'T&P'
            normalized = _normalize_department_label([department_raw])
            if not normalized:
                return Response({'detail': 'Invalid department filter.'}, status=status.HTTP_400_BAD_REQUEST)
            department_filter = normalized
        semester_raw = str(request.query_params.get('semester', '') or '').strip().upper()

        sem_number = None
        if semester_raw:
            if semester_raw.startswith('SEM'):
                semester_raw = semester_raw.replace('SEM', '', 1)
            try:
                sem_number = int(semester_raw)
            except Exception:
                return Response({'detail': 'Invalid semester. Use SEM1..SEM8.'}, status=status.HTTP_400_BAD_REQUEST)
            if sem_number < 1 or sem_number > 8:
                return Response({'detail': 'Semester must be between SEM1 and SEM8.'}, status=status.HTTP_400_BAD_REQUEST)

        section_raw = str(request.query_params.get('section', 'ALL') or 'ALL').strip().upper()
        section_filter = 'ALL' if not section_raw or section_raw == 'ALL' else section_raw

        cache_key = f"coe:students-map:v14:dept={department_filter}:sem={sem_number or 'ALL'}:sec={section_filter}"
        cache_key_bytes = f"{cache_key}:bytes"

        cached_bytes = cache.get(cache_key_bytes)
        if cached_bytes is not None:
            return HttpResponse(cached_bytes, content_type='application/json')

        local_cached_bytes = _LOCAL_STUDENTS_MAP_BYTES_CACHE.get(cache_key)
        if local_cached_bytes:
            expires_at, payload_bytes = local_cached_bytes
            if expires_at > time.time():
                return HttpResponse(payload_bytes, content_type='application/json')
            _LOCAL_STUDENTS_MAP_BYTES_CACHE.pop(cache_key, None)

        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            payload_bytes = json.dumps(cached_payload, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
            cache.set(cache_key_bytes, payload_bytes, timeout=self.CACHE_TTL_SECONDS)
            _LOCAL_STUDENTS_MAP_BYTES_CACHE[cache_key] = (time.time() + self.CACHE_TTL_SECONDS, payload_bytes)
            return HttpResponse(payload_bytes, content_type='application/json')

        local_cached = _LOCAL_STUDENTS_MAP_CACHE.get(cache_key)
        if local_cached:
            expires_at, payload = local_cached
            if expires_at > time.time():
                payload_bytes = json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
                _LOCAL_STUDENTS_MAP_BYTES_CACHE[cache_key] = (time.time() + self.CACHE_TTL_SECONDS, payload_bytes)
                return HttpResponse(payload_bytes, content_type='application/json')
            _LOCAL_STUDENTS_MAP_CACHE.pop(cache_key, None)

        from academics.models import TeachingAssignment, StudentSectionAssignment
        from .models import CoeExamDummy
        from curriculum.models import ElectiveChoice

        ta_qs = TeachingAssignment.objects.filter(is_active=True).select_related(
            'subject',
            'section',
            'section__semester',
            'section__batch',
            'section__batch__course',
            'section__batch__course__department',
            'curriculum_row',
            'curriculum_row__department',
            'curriculum_row__semester',
            'elective_subject',
            'elective_subject__department',
            'elective_subject__semester',
            'academic_year',
        )

        if sem_number is not None:
            ta_qs = ta_qs.filter(
                Q(section__semester__number=sem_number)
                | Q(curriculum_row__semester__number=sem_number)
                | Q(elective_subject__semester__number=sem_number)
            )

        def _resolve_department(ta):
            dept = None
            try:
                dept = ta.section.batch.course.department
            except Exception:
                dept = None
            if not dept:
                try:
                    dept = ta.elective_subject.department
                except Exception:
                    dept = None
            if not dept:
                try:
                    dept = ta.curriculum_row.department
                except Exception:
                    dept = None
            if not dept:
                return None
            return _department_label_from_obj(dept)

        def _resolve_semester(ta):
            try:
                sem = ta.curriculum_row.semester
                if sem:
                    return int(sem.number)
            except Exception:
                pass
            try:
                sem = ta.elective_subject.semester
                if sem:
                    return int(sem.number)
            except Exception:
                pass
            try:
                sem = ta.subject.semester
                if sem:
                    return int(sem.number)
            except Exception:
                pass
            try:
                sem = ta.section.semester
                if sem:
                    return int(sem.number)
            except Exception:
                pass
            return None

        # Build a lookup: (section_id) → list of CurriculumDepartment rows so we can
        # find the up-to-date course_code for TAs that only have ta.subject set.
        # This avoids serving stale course codes when the Subject master is edited but
        # the TeachingAssignment's curriculum_row FK wasn't backfilled.
        _ta_section_to_curriculum: dict = {}  # populated lazily below

        def _resolve_course(ta):
            # Priority 1: ElectiveSubject (authoritative for electives)
            try:
                if ta.elective_subject:
                    c_sem = getattr(getattr(ta.curriculum_row, 'semester', None), 'number', None) if ta.curriculum_row else None
                    e_sem = getattr(getattr(ta.elective_subject, 'semester', None), 'number', None)
                    if not (c_sem and e_sem and c_sem != e_sem):
                        code = str(getattr(ta.elective_subject, 'course_code', '') or '').strip()
                        name = str(getattr(ta.elective_subject, 'course_name', '') or '').strip()
                        if code or name:
                            return code, name
            except Exception:
                pass

            # Priority 2: curriculum_row FK — ALWAYS the authoritative source for
            # mandatory courses; reflects any course_code edits made in IDCS immediately.
            try:
                if ta.curriculum_row:
                    code = str(getattr(ta.curriculum_row, 'course_code', '') or '').strip()
                    name = str(getattr(ta.curriculum_row, 'course_name', '') or '').strip()
                    if code or name:
                        return code, name
            except Exception:
                pass

            # Priority 3: Fall back to ta.subject, but cross-reference against the
            # CurriculumDepartment table to get the CURRENT course_code (not the
            # possibly-stale subject.code snapshot stored in the TeachingAssignment).
            try:
                if ta.subject:
                    subject_code_raw = str(getattr(ta.subject, 'code', '') or '').strip()
                    subject_name_raw = str(getattr(ta.subject, 'name', '') or '').strip()

                    # Try to find a CurriculumDepartment row that matches this TA's
                    # section + semester + subject name (name is more stable than code).
                    if subject_name_raw:
                        section_id = getattr(ta, 'section_id', None)
                        try:
                            from curriculum.models import CurriculumDepartment
                            from academics.models import Section
                            sec = ta.section if section_id else None
                            sem_id = getattr(sec, 'semester_id', None) if sec else None
                            dept_id = None
                            try:
                                dept_id = sec.batch.course.department_id
                            except Exception:
                                pass

                            qs = CurriculumDepartment.objects.filter(
                                course_name__iexact=subject_name_raw
                            )
                            if dept_id:
                                qs = qs.filter(department_id=dept_id)
                            if sem_id:
                                qs = qs.filter(semester_id=sem_id)
                            cur = qs.first()
                            if cur and (cur.course_code or cur.course_name):
                                return (
                                    str(cur.course_code or '').strip(),
                                    str(cur.course_name or '').strip(),
                                )
                        except Exception:
                            pass

                    # Last resort: use whatever is stored in ta.subject directly
                    return subject_code_raw, subject_name_raw
            except Exception:
                pass

            return '', ''

        def _student_name(sp):
            u = getattr(sp, 'user', None)
            if not u:
                return str(getattr(sp, 'reg_no', '') or '')
            full = f"{str(getattr(u, 'first_name', '') or '').strip()} {str(getattr(u, 'last_name', '') or '').strip()}".strip()
            return full or str(getattr(u, 'username', '') or '')

        def _student_department(sp):
            dept = getattr(sp, 'home_department', None)
            if not dept:
                try:
                    dept = sp.section.batch.course.department
                except Exception:
                    dept = None
            if not dept:
                return None
            return _department_label_from_obj(dept)

        ta_rows = list(ta_qs)
        ta_section_ids = {getattr(ta, 'section_id', None) for ta in ta_rows if getattr(ta, 'section_id', None)}
        elective_subject_ids = {getattr(ta, 'elective_subject_id', None) for ta in ta_rows if getattr(ta, 'elective_subject_id', None)}

        from academics.models import Section, Department as AcademicsDepartment
        from curriculum.models import CurriculumDepartment, ElectiveSubject, ElectiveChoice

        # Collect IDs of CurriculumDepartment rows that are parents of ElectiveSubject
        elective_parent_cd_ids = set(
            ElectiveSubject.objects.exclude(parent_id__isnull=True).values_list('parent_id', flat=True)
        )

        def _is_curriculum_elective(row) -> bool:
            if not row:
                return False
            if getattr(row, 'is_elective', False):
                return True
            cat = str(getattr(row, 'category', '') or '').strip().upper()
            if cat in ('OE', 'PE', 'EM', 'EE', 'OP', 'ELECTIVE') or cat.startswith(('OE', 'PE', 'EM', 'EE')):
                return True
            name = str(getattr(row, 'course_name', '') or '').strip().lower()
            if 'elective' in name:
                return True
            code = str(getattr(row, 'course_code', '') or '').strip().upper()
            if '*' in code or 'XX' in code or code.endswith(('X', 'X*')):
                return True
            row_id = getattr(row, 'id', None)
            if row_id and row_id in elective_parent_cd_ids:
                return True
            return False

        def _is_placeholder_course(code: str, name: str) -> bool:
            clean_code = (code or '').strip().upper()
            clean_name = (name or '').strip().lower()
            if not clean_code and not clean_name:
                return True
            if not clean_code and any(k in clean_name for k in ['elective', 'program core', 'project phase']):
                return True
            if '*' in clean_code or 'XX' in clean_code or clean_code.endswith(('X', 'X*')):
                return True
            return False

        # Query all ElectiveSubject for the matching semester (and department)
        elective_filter_qs = ElectiveSubject.objects.all().select_related('department', 'semester')
        if sem_number is not None:
            elective_filter_qs = elective_filter_qs.filter(semester__number=sem_number)
        if department_filter != 'ALL':
            all_depts_list = list(AcademicsDepartment.objects.all())
            matching_dept_ids = [
                d.id for d in all_depts_list
                if _normalize_department_label([
                    str(getattr(d, 'short_name', '') or ''),
                    str(getattr(d, 'code', '') or ''),
                    str(getattr(d, 'name', '') or ''),
                ]) == department_filter
            ]
            if matching_dept_ids:
                elective_filter_qs = elective_filter_qs.filter(
                    Q(department_id__in=matching_dept_ids) |
                    Q(choices__student__home_department_id__in=matching_dept_ids, choices__is_active=True) |
                    Q(choices__student__section__batch__course__department_id__in=matching_dept_ids, choices__is_active=True)
                ).distinct()

        section_qs = Section.objects.all().select_related(
            'batch', 'batch__course', 'batch__course__department', 'semester', 'managing_department'
        )
        if sem_number is not None:
            section_qs = section_qs.filter(semester__number=sem_number)
        section_rows = list(section_qs)

        section_department_label_map: dict[int, str] = {}
        section_semester_number_map: dict[int, int] = {}
        for sec in section_rows:
            sec_id = getattr(sec, 'id', None)
            if not sec_id:
                continue
            sec_sem_num = getattr(getattr(sec, 'semester', None), 'number', None)
            try:
                if sec_sem_num is not None:
                    section_semester_number_map[sec_id] = int(sec_sem_num)
            except Exception:
                pass
            sec_dept = None
            try:
                sec_dept = sec.batch.course.department
            except Exception:
                sec_dept = None
            sec_dept_label = _normalize_department_label([
                str(getattr(sec_dept, 'short_name', '') or '').strip().upper(),
                str(getattr(sec_dept, 'code', '') or '').strip().upper(),
                str(getattr(sec_dept, 'name', '') or '').strip().upper(),
            ]) if sec_dept else None
            if sec_dept_label:
                section_department_label_map[sec_id] = sec_dept_label

        # Build the set of S&H-managed section IDs (cross-department year-1 sections).
        # These are different from department-specific sections that may share the same
        # letter name (e.g. both S&H Section A and CSE Section A can exist).
        def _is_sh_managed(sec_obj) -> bool:
            md = getattr(sec_obj, 'managing_department', None)
            if md and getattr(md, 'code', '') in ('S&H', 'SH'):
                return True
            if md and 'humanities' in str(getattr(md, 'name', '')).lower():
                return True
            if 'S&H' in str(getattr(sec_obj, 'batch', '') or ''):
                return True
            return False

        sh_section_ids: set[int] = {
            getattr(sec, 'id')
            for sec in section_rows
            if getattr(sec, 'id', None) and _is_sh_managed(sec)
        }

        section_ids = set(ta_section_ids)
        section_ids.update(getattr(sec, 'id', None) for sec in section_rows if getattr(sec, 'id', None))

        section_students_map: dict[int, list] = defaultdict(list)
        student_section_name_map: dict[int, str] = {}
        # Maps student_id → section_id so we can validate S&H membership later
        student_section_id_map: dict[int, int] = {}
        if section_ids:
            assignments = (
                StudentSectionAssignment.objects.filter(
                    section_id__in=section_ids,
                    end_date__isnull=True,
                )
                .exclude(student__status__in=['INACTIVE', 'DEBAR'])
                .select_related('student__user', 'student__home_department', 'student__section__batch__course__department', 'section')
            )
            for assignment in assignments:
                if getattr(assignment, 'student', None) is not None:
                    sec_id = getattr(assignment, 'section_id')
                    section_students_map[sec_id].append(assignment.student)
                    student_section_name_map[assignment.student.id] = getattr(assignment.section, 'name', '')
                    student_section_id_map[assignment.student.id] = sec_id

            assigned_student_ids = set(student_section_name_map.keys())
            direct_profiles = (
                StudentProfile.objects.filter(
                    section_id__in=section_ids,
                )
                .exclude(id__in=assigned_student_ids)
                .exclude(status__in=['INACTIVE', 'DEBAR'])
                .select_related('user', 'home_department', 'section__batch__course__department', 'section')
            )
            for sp in direct_profiles:
                if sp.section_id:
                    section_students_map[sp.section_id].append(sp)
                    student_section_name_map[sp.id] = getattr(sp.section, 'name', '')
                    student_section_id_map[sp.id] = sp.section_id

        def _resolved_student_department(sp):
            dept = getattr(sp, 'home_department', None)
            if dept is not None:
                dept_label = _normalize_department_label([
                    str(getattr(dept, 'short_name', '') or '').strip().upper(),
                    str(getattr(dept, 'code', '') or '').strip().upper(),
                    str(getattr(dept, 'name', '') or '').strip().upper(),
                ])
                if dept_label:
                    return dept_label

            sid = getattr(sp, 'id', None)
            if sid is not None:
                mapped_section_id = student_section_id_map.get(sid)
                if mapped_section_id is not None:
                    mapped_label = section_department_label_map.get(mapped_section_id)
                    if mapped_label:
                        return mapped_label

            profile_section_id = getattr(sp, 'section_id', None)
            if profile_section_id is not None:
                mapped_label = section_department_label_map.get(profile_section_id)
                if mapped_label:
                    return mapped_label

            return None

        def _resolved_student_section_name(sp):
            sid = getattr(sp, 'id', None)
            if sid is not None:
                mapped_name = student_section_name_map.get(sid)
                if mapped_name:
                    return str(mapped_name)
            return str(getattr(getattr(sp, 'section', None), 'name', '') or '')

        elective_students_all: dict[int, list] = defaultdict(list)
        elective_students_by_year: dict[tuple[int, int], list] = defaultdict(list)
        elective_year_has_rows: set[tuple[int, int]] = set()
        elective_students_by_code: dict[str, list] = defaultdict(list)
        elective_subject_by_id: dict[int, object] = {}
        elective_students_by_dept_subject: dict[tuple[str, int], list] = defaultdict(list)

        choice_qs = ElectiveChoice.objects.filter(is_active=True)
        if sem_number is not None:
            choice_qs = choice_qs.filter(
                Q(elective_subject__semester__number=sem_number) |
                Q(student__section__semester__number=sem_number)
            )
        choice_qs = (
            choice_qs
            .exclude(student__isnull=True)
            .exclude(student__status__in=['INACTIVE', 'DEBAR'])
            .select_related(
                'student__user',
                'student__home_department',
                'student__section',
                'student__section__semester',
                'student__section__batch__course__department',
                'elective_subject',
                'elective_subject__semester',
                'elective_subject__department',
            )
        )
        for choice in choice_qs:
            student = getattr(choice, 'student', None)
            es = getattr(choice, 'elective_subject', None)
            ay_id = getattr(choice, 'academic_year_id', None)
            if student is None or es is None:
                continue
            es_id = es.id
            elective_subject_by_id[es_id] = es
            elective_students_all[es_id].append(student)
            if ay_id is not None:
                key = (es_id, ay_id)
                elective_year_has_rows.add(key)
                elective_students_by_year[key].append(student)
            c_code = str(getattr(es, 'course_code', '') or '').strip().upper()
            if c_code:
                elective_students_by_code[c_code].append(student)
            resolved_dept = _resolved_student_department(student)
            if resolved_dept:
                elective_students_by_dept_subject[(resolved_dept, es_id)].append(student)

        mandatory_courses_by_dept_sem: dict[tuple[int, int], list] = defaultdict(list)
        
        # Build curriculum courses for all depts/sems matching the filter
        # EXCLUDING any course that is an elective or placeholder slot!
        curriculum_filter_qs = CurriculumDepartment.objects.all().select_related('department', 'semester')
        
        if sem_number is not None:
            curriculum_filter_qs = curriculum_filter_qs.filter(semester__number=sem_number)
        
        # If filtering by department, include courses for that department
        if department_filter != 'ALL' and not (sem_number in (1, 2) and section_filter != 'ALL'):
            from academics.models import Department as AcademicsDepartment
            matching_depts = list(
                AcademicsDepartment.objects.filter(
                    Q(short_name__iexact=department_filter)
                    | Q(code__iexact=department_filter)
                    | Q(name__iexact=department_filter)
                )
            )
            if matching_depts:
                curriculum_filter_qs = curriculum_filter_qs.filter(
                    department_id__in=[d.id for d in matching_depts]
                )
        
        mandatory_courses_by_dept: dict[int, list] = defaultdict(list)
        # Populate mandatory_courses_by_dept_sem with ONLY TRUE MANDATORY CORE COURSES
        for row in curriculum_filter_qs:
            # Skip any course that is an elective or placeholder slot!
            if _is_curriculum_elective(row) or _is_placeholder_course(getattr(row, 'course_code', ''), getattr(row, 'course_name', '')):
                continue
            key = (getattr(row, 'department_id', None), getattr(row, 'semester_id', None))
            mandatory_courses_by_dept_sem[key].append(row)
            if getattr(row, 'department_id', None):
                mandatory_courses_by_dept[getattr(row, 'department_id')].append(row)
        
        # Also keep the section-based dept_sem_pairs for backward compatibility
        # when sections have students
        dept_sem_pairs = {
            (getattr(getattr(getattr(sec, 'batch', None), 'course', None), 'department_id', None), getattr(sec, 'semester_id', None))
            for sec in section_rows
            if getattr(getattr(getattr(sec, 'batch', None), 'course', None), 'department_id', None) and getattr(sec, 'semester_id', None)
        }

        department_label_cache: dict[object, str | None] = {}

        def _department_label_from_obj(dept_obj):
            if not dept_obj:
                return None
            cache_key = getattr(dept_obj, 'id', None) or (
                str(getattr(dept_obj, 'short_name', '') or '').strip().upper(),
                str(getattr(dept_obj, 'code', '') or '').strip().upper(),
                str(getattr(dept_obj, 'name', '') or '').strip().upper(),
            )
            if cache_key in department_label_cache:
                return department_label_cache[cache_key]
            label = _normalize_department_label([
                str(getattr(dept_obj, 'short_name', '') or '').strip().upper(),
                str(getattr(dept_obj, 'code', '') or '').strip().upper(),
                str(getattr(dept_obj, 'name', '') or '').strip().upper(),
            ])
            department_label_cache[cache_key] = label
            return label

        dept_course_map = defaultdict(dict)

        for ta in ta_rows:
            dept_name = _resolve_department(ta)
            if not dept_name:
                continue

            ta_sem_number = _resolve_semester(ta)
            if sem_number is not None and (ta_sem_number is None or ta_sem_number != sem_number):
                continue

            course_code, course_name = _resolve_course(ta)
            if not course_code and not course_name:
                continue

            if sem_number in (1, 2) and (course_code.upper().startswith('GE') or dept_name in ('S&H', 'SH')):
                dept_name = 'S&H'

            if department_filter != 'ALL' and dept_name != department_filter:
                continue

            course_key = f"{course_code}::{course_name}".strip(':')
            if course_key not in dept_course_map[dept_name]:
                dept_course_map[dept_name][course_key] = {
                    'course_code': course_code,
                    'course_name': course_name,
                    'semester_number': ta_sem_number or sem_number,
                    'is_elective': False,
                    'students_map': {},
                }

            course_entry = dept_course_map[dept_name][course_key]

            students_for_ta = []
            elective_subject_id = getattr(ta, 'elective_subject_id', None)
            ta_academic_year_id = getattr(ta, 'academic_year_id', None)

            # For elective courses, roster must come from ElectiveChoice mapping,
            # not from full section roster.
            if elective_subject_id or course_entry.get('is_elective') or _is_curriculum_elective(getattr(ta, 'curriculum_row', None)):
                # Mark this course as an elective in the map
                course_entry['is_elective'] = True
                if elective_subject_id:
                    if ta_academic_year_id is not None and (elective_subject_id, ta_academic_year_id) in elective_year_has_rows:
                        students_for_ta = elective_students_by_year.get((elective_subject_id, ta_academic_year_id), [])
                    if not students_for_ta:
                        students_for_ta = elective_students_all.get(elective_subject_id, [])

            # Fallback to section roster ONLY for non-elective courses!
            if not students_for_ta and getattr(ta, 'section_id', None) and not course_entry.get('is_elective'):
                students_for_ta = section_students_map.get(getattr(ta, 'section_id'), [])

            for sp in students_for_ta:
                sid = getattr(sp, 'id', None)
                if sid is None:
                    continue
                if sem_number is not None:
                    sp_sec = getattr(sp, 'section', None)
                    sp_sem = getattr(sp_sec, 'semester_id', None)
                    if sp_sem is not None and sp_sem != sem_number:
                        continue
                sec_name = student_section_name_map.get(sid, str(getattr(getattr(sp, 'section', None), 'name', '') or ''))
                if section_filter != 'ALL' and sec_name.upper() != section_filter:
                    continue
                # For year-1 section queries, only include students that are in
                # an S&H-managed section. Multiple sections can share the same
                # letter name (e.g. S&H Section A vs CSE Section A).
                if section_filter != 'ALL' and sem_number in (1, 2) and sh_section_ids:
                    sp_sec_id = student_section_id_map.get(sid)
                    if sp_sec_id is not None and sp_sec_id not in sh_section_ids:
                        continue
                if sid not in course_entry['students_map']:
                    course_entry['students_map'][sid] = {
                        'id': sid,
                        'reg_no': str(getattr(sp, 'reg_no', '') or ''),
                        'name': _student_name(sp),
                        'is_arrear': False,
                        'section': sec_name,
                        'department': _student_department(sp) or dept_name,
                    }

        # Pre-populate dept_course_map with ALL curriculum courses from mandatory_courses_by_dept_sem
        # This ensures courses are displayed even if they have no students assigned yet
        for (dept_id, sem_id), courses in mandatory_courses_by_dept_sem.items():
            dept_obj = None
            try:
                from academics.models import Department as AcademicsDepartment
                dept_obj = AcademicsDepartment.objects.get(id=dept_id)
            except Exception:
                pass
            
            if not dept_obj:
                continue
            
            dept_name = _department_label_from_obj(dept_obj)
            if not dept_name:
                continue
            
            for mc in courses:
                mc_sem = getattr(mc, 'semester', None)
                mc_sem_number = int(getattr(mc_sem, 'number', 0)) if mc_sem and getattr(mc_sem, 'number', None) else None
                if sem_number is not None and mc_sem_number is not None and mc_sem_number != sem_number:
                    continue

                course_code = str(getattr(mc, 'course_code', '') or '').strip()
                course_name = str(getattr(mc, 'course_name', '') or '').strip()
                if not course_code and not course_name:
                    continue
                if not course_code:
                    continue
                if _is_placeholder_course(course_code, course_name) or _is_curriculum_elective(mc):
                    continue

                target_dept = dept_name
                if sem_number in (1, 2) and (course_code.upper().startswith('GE') or dept_name in ('S&H', 'SH')):
                    target_dept = 'S&H'

                if department_filter != 'ALL' and target_dept != department_filter:
                    continue
                
                course_key = f"{course_code}::{course_name}".strip(':')
                if course_key not in dept_course_map[target_dept]:
                    dept_course_map[target_dept][course_key] = {
                        'course_code': course_code,
                        'course_name': course_name,
                        'semester_number': mc_sem_number or sem_number,
                        'is_elective': False,
                        'students_map': {},
                    }

        # Include students from sections that lack a TeachingAssignment but have mandatory Curriculum courses
        for sec in section_rows:
            if not getattr(sec, 'batch_id', None):
                continue

            sec_name = str(getattr(sec, 'name', '') or '').strip()
            if section_filter != 'ALL' and sec_name.upper() != section_filter:
                continue

            is_sh = _is_sh_managed(sec)

            if section_filter != 'ALL' and sem_number in (1, 2) and not is_sh:
                continue

            students_for_sec = section_students_map.get(getattr(sec, 'id', None), [])
            if not students_for_sec:
                continue

            if is_sh:
                # Year-1 S&H section:
                # 1. Common courses (Maths, English, Physics, etc.) apply to the full section.
                if department_filter in ('ALL', 'S&H', 'SH', 'SCIENCE & HUMANITIES'):
                    common_courses = []
                    for (dept_id_key, sem_id_key), mc_list in mandatory_courses_by_dept_sem.items():
                        for mc in mc_list:
                            mc_code = str(getattr(mc, 'course_code', '') or '').strip().upper()
                            if mc_code and (mc_code.startswith('GE') or getattr(mc, 'department_id', None) == getattr(sec.managing_department, 'id', None)):
                                if mc not in common_courses:
                                    common_courses.append(mc)

                    for mc in common_courses:
                        c_code = str(getattr(mc, 'course_code', '') or '').strip()
                        c_name = str(getattr(mc, 'course_name', '') or '').strip()
                        if not c_code:
                            continue
                        c_key = f"{c_code}::{c_name}".strip(':')
                        if c_key not in dept_course_map['S&H']:
                            dept_course_map['S&H'][c_key] = {
                                'course_code': c_code,
                                'course_name': c_name,
                                'semester_number': sem_number or 1,
                                'is_elective': False,
                                'students_map': {},
                            }
                        c_entry = dept_course_map['S&H'][c_key]
                        for sp in students_for_sec:
                            sid = getattr(sp, 'id', None)
                            if sid is None:
                                continue
                            if sid not in c_entry['students_map']:
                                c_entry['students_map'][sid] = {
                                    'id': sid,
                                    'reg_no': str(getattr(sp, 'reg_no', '') or ''),
                                    'name': _student_name(sp),
                                    'is_arrear': False,
                                    'section': sec_name,
                                    'department': _student_department(sp) or 'S&H',
                                }

                # 2. Core courses: specific to the student's degree department.
                dept_to_students = defaultdict(list)
                for sp in students_for_sec:
                    d_obj = getattr(sp, 'home_department', None)
                    d_name = _student_department(sp)
                    if d_name:
                        dept_to_students[(d_obj, d_name)].append(sp)

                for (sp_dept_obj, sp_dept_name), st_list in dept_to_students.items():
                    if department_filter != 'ALL' and sp_dept_name != department_filter:
                        continue

                    sp_dept_id = getattr(sp_dept_obj, 'id', None)
                    core_courses = mandatory_courses_by_dept.get(sp_dept_id, [])
                    if not core_courses:
                        core_courses = mandatory_courses_by_dept_sem.get((sp_dept_id, getattr(sec, 'semester_id', None)), [])

                    for mc in core_courses:
                        mc_code = str(getattr(mc, 'course_code', '') or '').strip().upper()
                        if not mc_code or mc_code.startswith('GE'):
                            continue

                        mc_sem = getattr(mc, 'semester', None)
                        mc_sem_number = int(getattr(mc_sem, 'number', 0)) if mc_sem and getattr(mc_sem, 'number', None) else None
                        if sem_number is not None and mc_sem_number is not None and mc_sem_number != sem_number:
                            continue

                        c_code = str(getattr(mc, 'course_code', '') or '').strip()
                        c_name = str(getattr(mc, 'course_name', '') or '').strip()
                        if not c_code:
                            continue

                        c_key = f"{c_code}::{c_name}".strip(':')
                        if c_key not in dept_course_map[sp_dept_name]:
                            dept_course_map[sp_dept_name][c_key] = {
                                'course_code': c_code,
                                'course_name': c_name,
                                'semester_number': mc_sem_number or sem_number,
                                'is_elective': False,
                                'students_map': {},
                            }
                        c_entry = dept_course_map[sp_dept_name][c_key]

                        for sp in st_list:
                            sid = getattr(sp, 'id', None)
                            if sid is None:
                                continue
                            if sid not in c_entry['students_map']:
                                c_entry['students_map'][sid] = {
                                    'id': sid,
                                    'reg_no': str(getattr(sp, 'reg_no', '') or ''),
                                    'name': _student_name(sp),
                                    'is_arrear': False,
                                    'section': sec_name,
                                    'department': sp_dept_name,
                                }
            else:
                dept_obj = None
                try:
                    dept_obj = sec.batch.course.department
                except Exception:
                    dept_obj = None
                if not dept_obj:
                    continue

                dept_name = _department_label_from_obj(dept_obj)
                if not dept_name:
                    continue

                if department_filter != 'ALL' and dept_name != department_filter:
                    continue

                mandatory_courses = mandatory_courses_by_dept.get(getattr(dept_obj, 'id', None), [])
                if not mandatory_courses:
                    mandatory_courses = mandatory_courses_by_dept_sem.get((getattr(dept_obj, 'id', None), getattr(sec, 'semester_id', None)), [])

                for mc in mandatory_courses:
                    # Skip any course that is an elective or placeholder slot!
                    if _is_curriculum_elective(mc) or _is_placeholder_course(getattr(mc, 'course_code', ''), getattr(mc, 'course_name', '')):
                        continue

                    mc_sem = getattr(mc, 'semester', None)
                    mc_sem_number = int(getattr(mc_sem, 'number', 0)) if mc_sem and getattr(mc_sem, 'number', None) else None
                    if sem_number is not None and mc_sem_number is not None and mc_sem_number != sem_number:
                        continue

                    course_code = str(getattr(mc, 'course_code', '') or '').strip()
                    course_name = str(getattr(mc, 'course_name', '') or '').strip()
                    if not course_code and not course_name:
                        continue

                    course_key = f"{course_code}::{course_name}".strip(':')
                    if course_key not in dept_course_map[dept_name]:
                        dept_course_map[dept_name][course_key] = {
                            'course_code': course_code,
                            'course_name': course_name,
                            'semester_number': mc_sem_number or sem_number,
                            'is_elective': False,
                            'students_map': {},
                        }
                    course_entry = dept_course_map[dept_name][course_key]

                    for sp in students_for_sec:
                        sid = getattr(sp, 'id', None)
                        if sid is None:
                            continue
                        if sid not in course_entry['students_map']:
                            course_entry['students_map'][sid] = {
                                'id': sid,
                                'reg_no': str(getattr(sp, 'reg_no', '') or ''),
                                'name': _student_name(sp),
                                'is_arrear': False,
                                'section': sec_name,
                                'department': dept_name,
                            }

        # Ensure all Elective courses for the department and semester are included,
        # with their enrolled students from ElectiveChoice
        for es in elective_filter_qs:
            dept_obj = getattr(es, 'department', None)
            offering_dept = _department_label_from_obj(dept_obj) if dept_obj else None

            es_code = str(getattr(es, 'course_code', '') or '').strip()
            es_name = str(getattr(es, 'course_name', '') or '').strip()
            if not es_code and not es_name:
                continue
            if _is_placeholder_course(es_code, es_name):
                continue

            es_sem = getattr(es, 'semester', None)
            es_sem_number = int(getattr(es_sem, 'number', 0)) if es_sem and getattr(es_sem, 'number', None) else None
            if sem_number is not None and es_sem_number is not None and es_sem_number != sem_number:
                continue

            course_key = f"{es_code}::{es_name}".strip(':')
            students_for_es = elective_students_all.get(es.id, [])

            target_depts = set()
            if offering_dept:
                target_depts.add(offering_dept)
            for sp in students_for_es:
                sp_d = _resolved_student_department(sp)
                if sp_d:
                    target_depts.add(sp_d)

            for target_dept in target_depts:
                if department_filter != 'ALL' and target_dept != department_filter:
                    continue

                if course_key not in dept_course_map[target_dept]:
                    dept_course_map[target_dept][course_key] = {
                        'course_code': es_code,
                        'course_name': es_name,
                        'semester_number': es_sem_number or sem_number,
                        'is_elective': True,
                        'students_map': {},
                    }
                course_entry = dept_course_map[target_dept][course_key]
                course_entry['is_elective'] = True

                for sp in students_for_es:
                    sid = getattr(sp, 'id', None)
                    if sid is None:
                        continue
                    sp_d = _resolved_student_department(sp) or offering_dept
                    # ONLY add student to target_dept if student actually belongs to target_dept!
                    if sp_d != target_dept:
                        continue
                    sec_name = _resolved_student_section_name(sp)
                    if section_filter != 'ALL' and sec_name.upper() != section_filter:
                        continue

                    if sid not in course_entry['students_map']:
                        course_entry['students_map'][sid] = {
                            'id': sid,
                            'reg_no': str(getattr(sp, 'reg_no', '') or ''),
                            'name': _student_name(sp),
                            'is_arrear': False,
                            'section': sec_name,
                            'department': sp_d,
                        }

        # Check CurriculumDepartment rows that are electives with real course codes
        for cd in curriculum_filter_qs:
            if not _is_curriculum_elective(cd):
                continue
            cd_code = str(getattr(cd, 'course_code', '') or '').strip()
            cd_name = str(getattr(cd, 'course_name', '') or '').strip()
            if _is_placeholder_course(cd_code, cd_name):
                continue
            cd_sem = getattr(cd, 'semester', None)
            cd_sem_number = int(getattr(cd_sem, 'number', 0)) if cd_sem and getattr(cd_sem, 'number', None) else None
            if sem_number is not None and cd_sem_number is not None and cd_sem_number != sem_number:
                continue

            dept_obj = getattr(cd, 'department', None)
            cd_dept = _department_label_from_obj(dept_obj) if dept_obj else None
            if not cd_dept:
                continue
            if department_filter != 'ALL' and cd_dept != department_filter:
                continue

            course_key = f"{cd_code}::{cd_name}".strip(':')
            if course_key not in dept_course_map[cd_dept]:
                dept_course_map[cd_dept][course_key] = {
                    'course_code': cd_code,
                    'course_name': cd_name,
                    'semester_number': cd_sem_number or sem_number,
                    'is_elective': True,
                    'students_map': {},
                }
            course_entry = dept_course_map[cd_dept][course_key]
            course_entry['is_elective'] = True

            # If students exist in ElectiveChoice matching this code, add ONLY those students:
            matching_students = elective_students_by_code.get(cd_code.upper(), [])
            for sp in matching_students:
                sid = getattr(sp, 'id', None)
                if sid is None:
                    continue
                sp_d = _resolved_student_department(sp) or cd_dept
                if sp_d != cd_dept:
                    continue
                sec_name = _resolved_student_section_name(sp)
                if section_filter != 'ALL' and sec_name.upper() != section_filter:
                    continue
                if sid not in course_entry['students_map']:
                    course_entry['students_map'][sid] = {
                        'id': sid,
                        'reg_no': str(getattr(sp, 'reg_no', '') or ''),
                        'name': _student_name(sp),
                        'is_arrear': False,
                        'section': sec_name,
                        'department': sp_d,
                    }

        # Final elective pass: always merge electives from actual ElectiveChoice rows
        # keyed by each student's resolved department.
        for (target_dept, es_id), students_for_es in elective_students_by_dept_subject.items():
            if department_filter != 'ALL' and target_dept != department_filter:
                continue

            es = elective_subject_by_id.get(es_id)
            if es is None:
                continue

            es_code = str(getattr(es, 'course_code', '') or '').strip()
            es_name = str(getattr(es, 'course_name', '') or '').strip()
            if not es_code and not es_name:
                continue
            if _is_placeholder_course(es_code, es_name):
                continue

            es_sem = getattr(es, 'semester', None)
            es_sem_number = int(getattr(es_sem, 'number', 0)) if es_sem and getattr(es_sem, 'number', None) else None
            if sem_number is not None and es_sem_number is not None and es_sem_number != sem_number:
                continue

            course_key = f"{es_code}::{es_name}".strip(':')
            if course_key not in dept_course_map[target_dept]:
                dept_course_map[target_dept][course_key] = {
                    'course_code': es_code,
                    'course_name': es_name,
                    'semester_number': es_sem_number or sem_number,
                    'is_elective': True,
                    'students_map': {},
                }

            course_entry = dept_course_map[target_dept][course_key]
            course_entry['is_elective'] = True

            for sp in students_for_es:
                sid = getattr(sp, 'id', None)
                if sid is None:
                    continue

                sec_name = _resolved_student_section_name(sp)
                if section_filter != 'ALL' and sec_name.upper() != section_filter:
                    continue

                if sem_number is not None:
                    sp_sec_id = student_section_id_map.get(sid)
                    if sp_sec_id is None:
                        sp_sec_id = getattr(sp, 'section_id', None)
                    sp_sem_num = section_semester_number_map.get(sp_sec_id) if sp_sec_id else None
                    if sp_sem_num is not None and sp_sem_num != sem_number:
                        continue

                if sid not in course_entry['students_map']:
                    course_entry['students_map'][sid] = {
                        'id': sid,
                        'reg_no': str(getattr(sp, 'reg_no', '') or ''),
                        'name': _student_name(sp),
                        'is_arrear': False,
                        'section': sec_name,
                        'department': target_dept,
                    }

        arrear_qs = CoeArrearStudent.objects.all()
        if sem_number is not None:
            arrear_qs = arrear_qs.filter(semester=f'SEM{sem_number}')
        if department_filter != 'ALL':
            arrear_qs = arrear_qs.filter(department=department_filter)

        arrear_rows = list(arrear_qs.order_by('department', 'course_code', 'student_register_number'))
        reg_nos = list({str(r.student_register_number or '').strip() for r in arrear_rows if str(r.student_register_number or '').strip()})
        student_profiles = {
            s.reg_no.upper(): s
            for s in StudentProfile.objects.filter(reg_no__in=reg_nos).select_related('user')
        }

        for row in arrear_rows:
            dept_name = str(row.department or '').strip().upper()
            if not dept_name:
                continue

            course_code = str(row.course_code or '').strip()
            course_name = str(row.course_name or '').strip()

            # Prefer matching existing course by code to avoid name-variant mismatches
            # (e.g. "Data Structures" vs "DATA STRUCTURES") creating separate buckets.
            matched_course_key = None
            if dept_name in dept_course_map and course_code:
                for existing_key, existing_entry in dept_course_map[dept_name].items():
                    existing_code = str(existing_entry.get('course_code') or '').strip().upper()
                    if existing_code and existing_code == course_code.upper():
                        matched_course_key = existing_key
                        break

            course_key = matched_course_key or f"{course_code}::{course_name}".strip(':')

            if course_key not in dept_course_map[dept_name]:
                dept_course_map[dept_name][course_key] = {
                    'course_code': course_code,
                    'course_name': course_name,
                    'semester_number': sem_number,
                    'students_map': {},
                }

            profile = student_profiles.get(str(row.student_register_number or '').strip().upper())
            profile_id = getattr(profile, 'id', None)
            fallback_id = int(1_000_000_000 + int(getattr(row, 'id', 0) or 0))
            student_id = int(profile_id if profile_id is not None else fallback_id)

            course_entry = dept_course_map[dept_name][course_key]
            row_id = int(getattr(row, 'id', 0) or 0)
            course_entry['students_map'][f'ARREAR::{row_id}'] = {
                'id': student_id,
                'reg_no': str(row.student_register_number or ''),
                'name': str(row.student_name or ''),
                'is_arrear': True,
            }

        departments_out = []
        for dept_name in sorted(dept_course_map.keys()):
            courses_raw = list(dept_course_map[dept_name].values())
            courses_out = []
            for c in courses_raw:
                c_sem_num = c.get('semester_number')
                if sem_number is not None and c_sem_num is not None and c_sem_num != sem_number:
                    continue
                students = list(c['students_map'].values())
                if section_filter != 'ALL' and len(students) == 0:
                    continue
                students.sort(key=lambda s: (1 if s.get('is_arrear') else 0, s.get('section') or '', s.get('reg_no') or '', s.get('name') or ''))
                c_sem_str = f"SEM{c_sem_num}" if c_sem_num else (f"SEM{sem_number}" if sem_number else '')
                courses_out.append(
                    {
                        'course_code': c['course_code'],
                        'course_name': c['course_name'],
                        'semester': c_sem_str,
                        'is_elective': bool(c.get('is_elective', False)),
                        'students': students,
                    }
                )
            courses_out.sort(key=lambda c: ((c.get('course_code') or ''), (c.get('course_name') or '')))
            if courses_out:
                departments_out.append({'department': dept_name, 'courses': courses_out})

        saved_dummies_out = []
        if sem_number is not None:
            semester_label = f'SEM{sem_number}'
            saved_qs = CoeExamDummy.objects.filter(semester=semester_label).select_related('student__user')
            for row in saved_qs:
                student = getattr(row, 'student', None)
                if not student:
                    continue

                # Scope saved dummy rows to the student's canonical department label
                # so frontend remapping does not leak across departments in same semester.
                student_dept = _normalize_department_label([
                    str(getattr(getattr(student, 'home_department', None), 'short_name', '') or '').strip().upper(),
                    str(getattr(getattr(student, 'home_department', None), 'code', '') or '').strip().upper(),
                    str(getattr(getattr(student, 'home_department', None), 'name', '') or '').strip().upper(),
                ])
                if department_filter != 'ALL' and student_dept != department_filter:
                    continue

                user_obj = getattr(student, 'user', None)
                first_name = str(getattr(user_obj, 'first_name', '') or '').strip() if user_obj else ''
                last_name = str(getattr(user_obj, 'last_name', '') or '').strip() if user_obj else ''
                full_name = f"{first_name} {last_name}".strip()
                saved_dummies_out.append(
                    {
                        'dummy': str(getattr(row, 'dummy_number', '') or ''),
                        'reg_no': str(getattr(student, 'reg_no', '') or ''),
                        'name': full_name or str(getattr(user_obj, 'username', '') or '') if user_obj else str(getattr(student, 'reg_no', '') or ''),
                        'department': student_dept,
                        'semester': str(getattr(row, 'semester', '') or ''),
                        'qp_type': str(getattr(row, 'qp_type', 'QP1') or 'QP1').strip().upper(),
                    }
                )

        all_sections_set = set()
        if sem_number in (1, 2):
            all_sections_set.update(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'])
        for sec in section_rows:
            s_name = str(getattr(sec, 'name', '') or '').strip()
            if s_name:
                all_sections_set.add(s_name)
        for dept_dict in dept_course_map.values():
            for c_dict in dept_dict.values():
                for s_info in c_dict.get('students_map', {}).values():
                    s_sec = s_info.get('section')
                    if s_sec:
                        all_sections_set.add(s_sec)

        response_payload = {
            'department_filter': department_filter,
            'semester_filter': f'SEM{sem_number}' if sem_number is not None else None,
            'section_filter': section_filter if section_filter != 'ALL' else None,
            'sections': sorted(list(all_sections_set)),
            'departments': departments_out,
            'saved_dummies': saved_dummies_out,
        }
        payload_bytes = json.dumps(response_payload, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        cache.set(cache_key, response_payload, timeout=self.CACHE_TTL_SECONDS)
        cache.set(cache_key_bytes, payload_bytes, timeout=self.CACHE_TTL_SECONDS)
        _LOCAL_STUDENTS_MAP_CACHE[cache_key] = (time.time() + self.CACHE_TTL_SECONDS, response_payload)
        _LOCAL_STUDENTS_MAP_BYTES_CACHE[cache_key] = (time.time() + self.CACHE_TTL_SECONDS, payload_bytes)
        return HttpResponse(payload_bytes, content_type='application/json')
