from collections import defaultdict

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.utils import get_user_permissions
from academics.models import StudentProfile
from .models import CoeArrearStudent


COE_PORTAL_LOGIN_EMAIL = 'coe@krct.ac.in'
COE_PORTAL_ACCESS_PERMISSION = 'coe.portal.access'

FEATURE_PERMISSION_MAP = {
    'exam_control': 'coe.manage.exams',
    'results': 'coe.manage.results',
    'circulars': 'coe.manage.circulars',
    'academic_calendar': 'coe.manage.calendar',
}

DEPARTMENT_LABELS = ('ALL', 'AIDS', 'AIML', 'CSE', 'CIVIL', 'ECE', 'EEE', 'IT', 'MECH')


def _normalize_department_label(raw_values: list[str]) -> str | None:
    """Map DB department variants to the canonical frontend labels.

    Examples handled:
    - ME / MECH / MECHANICAL -> MECH
    - AI&DS / AIDS -> AIDS
    - AI&ML / AIML -> AIML
    - CIVIL ENGINEERING -> CIVIL
    """
    parts = [str(v or '').strip().upper() for v in raw_values if str(v or '').strip()]
    if not parts:
        return None

    joined = ' '.join(parts)

    if any(p in ('AIDS', 'AI&DS', 'AI AND DS', 'ARTIFICIAL INTELLIGENCE AND DATA SCIENCE') for p in parts) or 'DATA SCIENCE' in joined:
        return 'AIDS'
    if any(p in ('AIML', 'AI&ML', 'AI AND ML', 'ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING') for p in parts) or 'MACHINE LEARNING' in joined:
        return 'AIML'
    if any(p in ('CSE', 'COMPUTER SCIENCE') for p in parts):
        return 'CSE'
    if any(p in ('CIVIL',) for p in parts) or 'CIVIL' in joined:
        return 'CIVIL'
    if any(p in ('ECE',) for p in parts) or 'ELECTRONICS' in joined and 'COMMUNICATION' in joined:
        return 'ECE'
    if any(p in ('EEE',) for p in parts) or 'ELECTRICAL' in joined and 'ELECTRONICS' in joined:
        return 'EEE'
    if any(p in ('IT', 'INFORMATION TECHNOLOGY') for p in parts) or 'INFORMATION TECHNOLOGY' in joined:
        return 'IT'
    if any(p in ('MECH', 'ME') for p in parts) or 'MECHANICAL' in joined:
        return 'MECH'

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

    def get(self, request):
        user = request.user
        permission_codes = {str(p or '').strip().lower() for p in get_user_permissions(user)}

        if not _has_portal_access(user, permission_codes):
            return Response({'detail': 'You do not have access to the COE portal.'}, status=status.HTTP_403_FORBIDDEN)

        department_filter = str(request.query_params.get('department', 'ALL') or 'ALL').strip().upper()
        if department_filter not in DEPARTMENT_LABELS:
            return Response({'detail': 'Invalid department filter.'}, status=status.HTTP_400_BAD_REQUEST)
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

        from academics.models import TeachingAssignment, StudentSectionAssignment
        from .models import CoeExamDummy
        from curriculum.models import ElectiveChoice

        ta_qs = TeachingAssignment.objects.filter(is_active=True).select_related(
            'subject',
            'section',
            'section__semester',
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
            short = str(getattr(dept, 'short_name', '') or '').strip().upper()
            code = str(getattr(dept, 'code', '') or '').strip().upper()
            name = str(getattr(dept, 'name', '') or '').strip().upper()
            return _normalize_department_label([short, code, name])

        def _resolve_semester(ta):
            try:
                sem = ta.section.semester
                if sem:
                    return int(sem.number)
            except Exception:
                pass
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
            return None

        def _resolve_course(ta):
            try:
                if ta.elective_subject:
                    code = str(getattr(ta.elective_subject, 'course_code', '') or '').strip()
                    name = str(getattr(ta.elective_subject, 'course_name', '') or '').strip()
                    return code, name
            except Exception:
                pass
            try:
                if ta.curriculum_row:
                    code = str(getattr(ta.curriculum_row, 'course_code', '') or '').strip()
                    name = str(getattr(ta.curriculum_row, 'course_name', '') or '').strip()
                    return code, name
            except Exception:
                pass
            try:
                if ta.subject:
                    code = str(getattr(ta.subject, 'code', '') or '').strip()
                    name = str(getattr(ta.subject, 'name', '') or '').strip()
                    return code, name
            except Exception:
                pass
            return '', ''

        def _student_name(sp):
            u = getattr(sp, 'user', None)
            if not u:
                return str(getattr(sp, 'reg_no', '') or '')
            full = f"{str(getattr(u, 'first_name', '') or '').strip()} {str(getattr(u, 'last_name', '') or '').strip()}".strip()
            return full or str(getattr(u, 'username', '') or '')

        dept_course_map = defaultdict(dict)

        for ta in ta_qs:
            dept_name = _resolve_department(ta)
            if not dept_name:
                continue

            ta_sem_number = _resolve_semester(ta)
            if sem_number is not None and ta_sem_number is not None and ta_sem_number != sem_number:
                continue

            if department_filter != 'ALL' and dept_name != department_filter:
                continue

            course_code, course_name = _resolve_course(ta)
            if not course_code and not course_name:
                continue

            course_key = f"{course_code}::{course_name}".strip(':')
            if course_key not in dept_course_map[dept_name]:
                dept_course_map[dept_name][course_key] = {
                    'course_code': course_code,
                    'course_name': course_name,
                    'students_map': {},
                }

            course_entry = dept_course_map[dept_name][course_key]

            students_for_ta = []
            if getattr(ta, 'section_id', None):
                assign_qs = StudentSectionAssignment.objects.filter(
                    section=ta.section,
                    end_date__isnull=True,
                ).exclude(student__status__in=['INACTIVE', 'DEBAR']).select_related('student__user')
                students_for_ta = [a.student for a in assign_qs]
            elif getattr(ta, 'elective_subject_id', None):
                eqs = ElectiveChoice.objects.filter(
                    elective_subject_id=getattr(ta, 'elective_subject_id', None),
                    is_active=True,
                ).exclude(student__isnull=True).select_related('student__user')
                if getattr(ta, 'academic_year_id', None):
                    eqs_ay = eqs.filter(academic_year_id=getattr(ta, 'academic_year_id', None))
                    if eqs_ay.exists():
                        eqs = eqs_ay
                students_for_ta = [c.student for c in eqs if getattr(c, 'student', None) is not None]

            for sp in students_for_ta:
                sid = getattr(sp, 'id', None)
                if sid is None:
                    continue
                course_entry['students_map'][sid] = {
                    'id': sid,
                    'reg_no': str(getattr(sp, 'reg_no', '') or ''),
                    'name': _student_name(sp),
                    'is_arrear': False,
                }

        # Include students from sections that lack a TeachingAssignment but have mandatory Curriculum courses
        from academics.models import Section
        from curriculum.models import CurriculumDepartment
        
        section_qs = Section.objects.all().select_related('batch', 'batch__course', 'batch__course__department', 'semester')
        if sem_number is not None:
            section_qs = section_qs.filter(semester__number=sem_number)
            
        for sec in section_qs:
            if not getattr(sec, 'batch_id', None) or not getattr(sec, 'semester_id', None):
                continue
                
            try:
                dept_obj = sec.batch.course.department
            except Exception:
                dept_obj = None
            if not dept_obj:
                continue
                
            short = str(getattr(dept_obj, 'short_name', '') or '').strip().upper()
            code_ = str(getattr(dept_obj, 'code', '') or '').strip().upper()
            name_ = str(getattr(dept_obj, 'name', '') or '').strip().upper()
            dept_name = _normalize_department_label([short, code_, name_])
            if not dept_name:
                continue

            if department_filter != 'ALL' and dept_name != department_filter:
                continue

            assign_qs = StudentSectionAssignment.objects.filter(
                section=sec,
                end_date__isnull=True,
            ).exclude(student__status__in=['INACTIVE', 'DEBAR']).select_related('student__user')
            
            if not assign_qs.exists():
                continue
                
            students_for_sec = [a.student for a in assign_qs]
            
            mandatory_courses = CurriculumDepartment.objects.filter(
                department=dept_obj,
                semester=sec.semester,
                is_elective=False
            )
            
            for mc in mandatory_courses:
                course_code = str(getattr(mc, 'course_code', '') or '').strip()
                course_name = str(getattr(mc, 'course_name', '') or '').strip()
                if not course_code and not course_name:
                    continue
                
                # Skip dummy elective group placeholders incorrectly marked as mandatory
                if not course_code and 'elective' in course_name.lower():
                    continue

                course_key = f"{course_code}::{course_name}".strip(':')
                if course_key not in dept_course_map[dept_name]:
                    dept_course_map[dept_name][course_key] = {
                        'course_code': course_code,
                        'course_name': course_name,
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
                students = list(c['students_map'].values())
                students.sort(key=lambda s: (1 if s.get('is_arrear') else 0, s.get('reg_no') or '', s.get('name') or ''))
                courses_out.append(
                    {
                        'course_code': c['course_code'],
                        'course_name': c['course_name'],
                        'students': students,
                    }
                )
            courses_out.sort(key=lambda c: ((c.get('course_code') or ''), (c.get('course_name') or '')))
            departments_out.append({'department': dept_name, 'courses': courses_out})

        saved_dummies_out = []
        if sem_number is not None:
            semester_label = f'SEM{sem_number}'
            saved_qs = CoeExamDummy.objects.filter(semester=semester_label).select_related('student__user')
            for row in saved_qs:
                student = getattr(row, 'student', None)
                if not student:
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
                        'semester': str(getattr(row, 'semester', '') or ''),
                        'qp_type': str(getattr(row, 'qp_type', 'QP1') or 'QP1').strip().upper(),
                    }
                )

        return Response(
            {
                'department_filter': department_filter,
                'semester_filter': f'SEM{sem_number}' if sem_number is not None else None,
                'departments': departments_out,
                'saved_dummies': saved_dummies_out,
            }
        )
