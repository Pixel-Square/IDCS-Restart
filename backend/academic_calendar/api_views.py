from __future__ import annotations

import json
import os
import uuid
from datetime import date, datetime
from io import BytesIO
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q

from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from academics.models import Department, DepartmentRole, StudentProfile
from academics.utils import get_user_effective_departments

from .models import AcademicCalendarEvent, HodColor


def _normalize_text(s: Any) -> str:
    if s is None:
        return ''
    return str(s).strip().lower().replace('\u00a0', ' ').replace('\t', ' ').replace('\n', ' ')


def _normalize_department_name(s: Any) -> str:
    import re

    t = _normalize_text(s)
    t = re.sub(r'[^a-z0-9 ]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _to_yyyy_mm_dd(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _safe_int(v: Any) -> Optional[int]:
    try:
        if v is None or v == '':
            return None
        return int(str(v).strip())
    except Exception:
        return None


def _clamp_dates(start: date, end: date) -> tuple[date, date]:
    if end < start:
        return start, start
    return start, end


def _department_matches_any(audience_csv: Optional[str], dept_names: List[str]) -> bool:
    if not audience_csv:
        return True
    wanted = {_normalize_department_name(x) for x in dept_names if x}
    if not wanted:
        return False
    parts = [_normalize_department_name(x) for x in str(audience_csv).split(',')]
    return any(p and p in wanted for p in parts)


def _get_staff_profile(user):
    return getattr(user, 'staff_profile', None)


def _get_student_profile(user):
    return getattr(user, 'student_profile', None)


def _is_iqac_user(user) -> bool:
    # Prefer role mapping when available
    try:
        if user.roles.filter(name__iexact='IQAC').exists():
            return True
    except Exception:
        pass

    sp = _get_staff_profile(user)
    if not sp:
        return False

    dept = getattr(sp, 'current_department', None)
    if not dept and hasattr(sp, 'get_current_department'):
        try:
            dept = sp.get_current_department()
        except Exception:
            dept = None
    if not dept:
        dept = getattr(sp, 'department', None)
    if not dept:
        return False

    code = _normalize_text(getattr(dept, 'code', None))
    name = _normalize_department_name(getattr(dept, 'name', None))
    short = _normalize_department_name(getattr(dept, 'short_name', None))
    return (code == 'iqac') or (name == 'iqac') or (short == 'iqac')


def _is_hod_user(user) -> bool:
    sp = _get_staff_profile(user)
    if not sp:
        return False

    try:
        if DepartmentRole.objects.filter(staff=sp, role='HOD', is_active=True).exists():
            return True
    except Exception:
        pass

    try:
        return user.roles.filter(name__iexact='HOD').exists()
    except Exception:
        return False


def _get_primary_department_display(user) -> str:
    sp = _get_staff_profile(user)
    if sp:
        dept = getattr(sp, 'current_department', None)
        if not dept and hasattr(sp, 'get_current_department'):
            try:
                dept = sp.get_current_department()
            except Exception:
                dept = None
        if not dept:
            dept = getattr(sp, 'department', None)
        if dept:
            return getattr(dept, 'name', '') or getattr(dept, 'code', '') or 'Unknown'

    st = _get_student_profile(user)
    if st:
        try:
            sec = st.current_section
            dept = sec and sec.batch and sec.batch.course and sec.batch.course.department
            if dept:
                return getattr(dept, 'name', '') or getattr(dept, 'code', '') or 'Unknown'
        except Exception:
            pass

    return 'Unknown'


def _derive_year_from_semester_number(sem_number: Any) -> Optional[int]:
    try:
        n = int(sem_number)
    except Exception:
        return None
    if n <= 0:
        return None
    return (n + 1) // 2


def _get_student_year(user) -> Optional[int]:
    st = _get_student_profile(user)
    if not st:
        return None
    try:
        sec = st.current_section
        sem = getattr(sec, 'semester', None)
        sem_number = getattr(sem, 'number', None)
        return _derive_year_from_semester_number(sem_number)
    except Exception:
        return None


def _roman_year(y: Optional[int]) -> Optional[str]:
    if not y:
        return None
    mapping = {1: 'I', 2: 'II', 3: 'III', 4: 'IV'}
    return mapping.get(int(y))


def _get_hod_owned_department_names(user) -> List[str]:
    ids = get_user_effective_departments(user)
    names: List[str] = []
    if ids:
        qs = Department.objects.filter(id__in=ids).values('name', 'code', 'short_name')
        for row in qs:
            for k in ('name', 'code', 'short_name'):
                v = row.get(k)
                if v:
                    names.append(str(v))

    primary = _get_primary_department_display(user)
    if primary:
        names.append(primary)

    seen = set()
    out = []
    for n in names:
        nn = _normalize_department_name(n)
        if not nn or nn in seen:
            continue
        seen.add(nn)
        out.append(n)
    return out


def _event_can_edit_delete(user, event: AcademicCalendarEvent) -> Dict[str, bool]:
    if not user or not user.is_authenticated:
        return {'can_edit': False, 'can_delete': False}

    if _get_student_profile(user) is not None:
        return {'can_edit': False, 'can_delete': False}

    if event.source == AcademicCalendarEvent.Source.IQAC:
        allowed = _is_iqac_user(user)
        return {'can_edit': bool(allowed), 'can_delete': bool(allowed)}

    if event.source == AcademicCalendarEvent.Source.HOD:
        if not _is_hod_user(user) and not _is_iqac_user(user):
            return {'can_edit': False, 'can_delete': False}

        # keep strict: IQAC cannot edit HOD events
        if _is_iqac_user(user):
            return {'can_edit': False, 'can_delete': False}

        if getattr(event, 'created_by_id', None) == getattr(user, 'id', None):
            return {'can_edit': True, 'can_delete': True}

        hod_dept = _get_primary_department_display(user)
        if event.audience_department and _department_matches_any(event.audience_department, [hod_dept]):
            return {'can_edit': True, 'can_delete': True}

    return {'can_edit': False, 'can_delete': False}


def _serialize_events(user, events: List[AcademicCalendarEvent]) -> List[Dict[str, Any]]:
    user_ids = [e.created_by_id for e in events if getattr(e, 'created_by_id', None)]
    colors = {c.hod_id: c.color for c in HodColor.objects.filter(hod_id__in=user_ids)}

    out: List[Dict[str, Any]] = []
    for e in events:
        perms = _event_can_edit_delete(user, e)
        out.append(
            {
                'id': str(e.id),
                'title': e.title,
                'description': e.description,
                'start_date': _to_yyyy_mm_dd(e.start_date),
                'end_date': _to_yyyy_mm_dd(e.end_date),
                'all_day': bool(e.all_day),
                'audience_department': e.audience_department,
                'year': e.year,
                'year_label': e.year_label,
                'source': e.source,
                'created_by': {'id': e.created_by_id, 'username': getattr(e.created_by, 'username', None)},
                'image_url': e.image_url,
                'audience_students': e.audience_students,
                'created_at': e.created_at.isoformat() if e.created_at else None,
                'updated_at': e.updated_at.isoformat() if e.updated_at else None,
                'creator_color': colors.get(e.created_by_id),
                **perms,
            }
        )
    return out


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def config(request):
    mode = (request.query_params.get('mode') or '').strip().lower()
    user = request.user

    if mode == 'iqac':
        if not _is_iqac_user(user):
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        hod_owned_departments: List[str] = []
        student_year: Optional[int] = None
    elif mode == 'hod':
        if _is_iqac_user(user) or not _is_hod_user(user):
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        hod_owned_departments = _get_hod_owned_department_names(user)
        student_year = None
    elif mode == 'student':
        if _get_student_profile(user) is None:
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        hod_owned_departments = []
        student_year = _get_student_year(user)
    else:
        return Response({'error': 'Invalid mode'}, status=status.HTTP_400_BAD_REQUEST)

    departments = list(Department.objects.order_by('code').values_list('name', flat=True))

    return Response(
        {
            'mode': mode,
            'showing_department': _get_primary_department_display(user),
            'student_year': student_year,
            'student_year_roman': _roman_year(student_year),
            'departments': departments,
            'hod_owned_departments': hod_owned_departments,
        }
    )


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def events(request):
    user = request.user

    if request.method == 'GET':
        month_start = request.query_params.get('monthStart')
        month_end = request.query_params.get('monthEnd')
        mode = (request.query_params.get('mode') or '').strip().lower()

        try:
            ms = date.fromisoformat(str(month_start))
            me = date.fromisoformat(str(month_end))
        except Exception:
            return Response({'error': 'Invalid monthStart/monthEnd'}, status=status.HTTP_400_BAD_REQUEST)

        qs = AcademicCalendarEvent.objects.select_related('created_by').filter(start_date__lte=me, end_date__gte=ms)

        if mode == 'iqac':
            if not _is_iqac_user(user):
                return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
            events_list = list(qs)
        elif mode == 'student':
            if _get_student_profile(user) is None:
                return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
            year = _get_student_year(user)
            if year:
                qs = qs.filter(Q(year__isnull=True) | Q(year=year))
            else:
                qs = qs.filter(Q(year__isnull=True))
            events_list = list(qs)
        elif mode == 'hod':
            if _is_iqac_user(user) or not _is_hod_user(user):
                return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
            owned = _get_hod_owned_department_names(user)
            prefilter = Q(audience_department__isnull=True) | Q(audience_department__exact='')
            for n in owned:
                if n:
                    prefilter |= Q(audience_department__icontains=str(n))
            qs = qs.filter(prefilter)
            events_list = [e for e in qs if _department_matches_any(e.audience_department, owned)]
        else:
            return Response({'error': 'Invalid mode'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'events': _serialize_events(user, events_list)})

    if _get_student_profile(user) is not None:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    mode = str(request.data.get('mode') or '').strip().lower()
    if mode == 'iqac':
        if not _is_iqac_user(user):
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        source = AcademicCalendarEvent.Source.IQAC
    elif mode == 'hod':
        if _is_iqac_user(user) or not _is_hod_user(user):
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        source = AcademicCalendarEvent.Source.HOD
    else:
        return Response({'error': 'Invalid mode'}, status=status.HTTP_400_BAD_REQUEST)

    title = str(request.data.get('title') or '').strip()
    if not title:
        return Response({'error': 'title is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        start = date.fromisoformat(str(request.data.get('start_date')))
    except Exception:
        return Response({'error': 'start_date is required (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        end_raw = request.data.get('end_date')
        end = date.fromisoformat(str(end_raw)) if end_raw else start
    except Exception:
        end = start

    start, end = _clamp_dates(start, end)

    description = str(request.data.get('description') or '').strip() or None
    all_day = str(request.data.get('all_day') or 'true').lower() in ('1', 'true', 'yes', 'on')
    year = _safe_int(request.data.get('year'))
    year_label = str(request.data.get('year_label') or '').strip() or None

    audience_departments: Any = request.data.get('audience_departments')
    if isinstance(audience_departments, str):
        try:
            parsed = json.loads(audience_departments)
            if isinstance(parsed, list):
                audience_departments = parsed
        except Exception:
            audience_departments = [x.strip() for x in audience_departments.split(',') if x.strip()]
    if audience_departments is None:
        audience_departments = []

    if source == AcademicCalendarEvent.Source.HOD:
        global_all = str(request.data.get('audience_all') or '').lower() in ('1', 'true', 'yes', 'on')
        if global_all:
            audience_department_str = None
        else:
            owned = _get_hod_owned_department_names(user)
            owned_norm = {_normalize_department_name(x) for x in owned if x}
            cleaned = []
            for d in (audience_departments or []):
                dn = _normalize_department_name(d)
                if dn and dn in owned_norm:
                    cleaned.append(d)
            if audience_departments and not cleaned:
                return Response({'error': 'Invalid audience_departments for HOD'}, status=status.HTTP_400_BAD_REQUEST)
            audience_department_str = ','.join(cleaned) if cleaned else None
    else:
        cleaned = [str(x).strip() for x in (audience_departments or []) if str(x).strip()]
        audience_department_str = ','.join(cleaned) if cleaned else None

    image_url = str(request.data.get('image_url') or '').strip() or None
    upload = request.FILES.get('image') if hasattr(request, 'FILES') else None
    if upload:
        ext = os.path.splitext(upload.name or '')[1]
        key = f"academic_calendar/{uuid.uuid4().hex}{ext}".strip('/')
        saved_path = default_storage.save(key, upload)
        try:
            image_url = default_storage.url(saved_path)
        except Exception:
            image_url = f"{settings.MEDIA_URL}{saved_path}"

    audience_students: Any = request.data.get('audience_students')
    if isinstance(audience_students, str):
        try:
            audience_students = json.loads(audience_students)
        except Exception:
            audience_students = None

    event = AcademicCalendarEvent.objects.create(
        title=title,
        description=description,
        start_date=start,
        end_date=end,
        all_day=all_day,
        audience_department=audience_department_str,
        year=year,
        year_label=year_label,
        source=source,
        created_by=user,
        image_url=image_url,
        audience_students=audience_students,
    )

    return Response({'event': _serialize_events(user, [event])[0]})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def event_update(request, event_id):
    user = request.user
    try:
        event = AcademicCalendarEvent.objects.select_related('created_by').get(id=event_id)
    except AcademicCalendarEvent.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    perms = _event_can_edit_delete(user, event)
    if not perms.get('can_edit'):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    title = str(request.data.get('title') or event.title or '').strip()
    if not title:
        return Response({'error': 'title is required'}, status=status.HTTP_400_BAD_REQUEST)

    description = str(request.data.get('description') or '').strip() or None
    all_day = str(request.data.get('all_day') or event.all_day).lower() in ('1', 'true', 'yes', 'on')
    year = _safe_int(request.data.get('year'))
    year_label = str(request.data.get('year_label') or '').strip() or None

    try:
        start = date.fromisoformat(str(request.data.get('start_date') or event.start_date))
        end = date.fromisoformat(str(request.data.get('end_date') or event.end_date))
    except Exception:
        return Response({'error': 'Invalid date'}, status=status.HTTP_400_BAD_REQUEST)

    start, end = _clamp_dates(start, end)

    audience_departments: Any = request.data.get('audience_departments')
    if isinstance(audience_departments, str):
        try:
            parsed = json.loads(audience_departments)
            if isinstance(parsed, list):
                audience_departments = parsed
        except Exception:
            audience_departments = [x.strip() for x in audience_departments.split(',') if x.strip()]
    if audience_departments is None:
        audience_departments = []

    if event.source == AcademicCalendarEvent.Source.HOD:
        global_all = str(request.data.get('audience_all') or '').lower() in ('1', 'true', 'yes', 'on')
        if global_all:
            audience_department_str = None
        else:
            owned = _get_hod_owned_department_names(user)
            owned_norm = {_normalize_department_name(x) for x in owned if x}
            cleaned = []
            for d in (audience_departments or []):
                dn = _normalize_department_name(d)
                if dn and dn in owned_norm:
                    cleaned.append(d)
            audience_department_str = ','.join(cleaned) if cleaned else None
    else:
        cleaned = [str(x).strip() for x in (audience_departments or []) if str(x).strip()]
        audience_department_str = ','.join(cleaned) if cleaned else None

    image_url = str(request.data.get('image_url') or '').strip() or None
    upload = request.FILES.get('image') if hasattr(request, 'FILES') else None
    if upload:
        ext = os.path.splitext(upload.name or '')[1]
        key = f"academic_calendar/{uuid.uuid4().hex}{ext}".strip('/')
        saved_path = default_storage.save(key, upload)
        try:
            image_url = default_storage.url(saved_path)
        except Exception:
            image_url = f"{settings.MEDIA_URL}{saved_path}"
    if image_url is None:
        image_url = event.image_url

    audience_students: Any = request.data.get('audience_students')
    if isinstance(audience_students, str):
        try:
            audience_students = json.loads(audience_students)
        except Exception:
            audience_students = event.audience_students
    elif audience_students is None:
        audience_students = event.audience_students

    event.title = title
    event.description = description
    event.start_date = start
    event.end_date = end
    event.all_day = all_day
    event.audience_department = audience_department_str
    event.year = year
    event.year_label = year_label
    event.image_url = image_url
    event.audience_students = audience_students
    event.save()

    return Response({'event': _serialize_events(user, [event])[0]})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def event_delete(request, event_id):
    user = request.user
    try:
        event = AcademicCalendarEvent.objects.get(id=event_id)
    except AcademicCalendarEvent.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    perms = _event_can_edit_delete(user, event)
    if not perms.get('can_delete'):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    event.delete()
    return Response({'success': True})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def hod_colours(request):
    if not _is_iqac_user(request.user):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        hod_roles = (
            DepartmentRole.objects.filter(role='HOD', is_active=True)
            .select_related('staff__user', 'department')
            .order_by('department__code')
        )
        users = []
        seen = set()
        for r in hod_roles:
            u = getattr(getattr(r, 'staff', None), 'user', None)
            if not u or u.id in seen:
                continue
            seen.add(u.id)
            users.append({'hod_user_id': u.id, 'username': getattr(u, 'username', ''), 'department': getattr(getattr(r, 'department', None), 'name', None)})

        color_map = {c.hod_id: c.color for c in HodColor.objects.filter(hod_id__in=[x['hod_user_id'] for x in users])}
        for x in users:
            x['color'] = color_map.get(x['hod_user_id'])
        return Response({'hods': users})

    hod_user_id = _safe_int(request.data.get('hod_user_id'))
    color = str(request.data.get('color') or '').strip()
    if not hod_user_id or not color:
        return Response({'error': 'hod_user_id and color are required'}, status=status.HTTP_400_BAD_REQUEST)

    obj, _ = HodColor.objects.get_or_create(hod_id=hod_user_id, defaults={'color': color, 'updated_by': request.user})
    if obj.color != color or obj.updated_by_id != request.user.id:
        obj.color = color
        obj.updated_by = request.user
        obj.save(update_fields=['color', 'updated_by', 'updated_at'])

    return Response({'success': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def hod_students(request):
    if _is_iqac_user(request.user) or not _is_hod_user(request.user):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    dept_ids = get_user_effective_departments(request.user)
    if not dept_ids:
        return Response({'students': []})

    qs = (
        StudentProfile.objects.select_related('user', 'section__semester', 'section__batch__course__department')
        .filter(section__batch__course__department_id__in=dept_ids)
        .order_by('reg_no')
    )

    students: List[Dict[str, Any]] = []
    for sp in qs[:5000]:
        sec = getattr(sp, 'current_section', None) or getattr(sp, 'section', None)
        dept = None
        try:
            dept = sec and sec.batch and sec.batch.course and sec.batch.course.department
        except Exception:
            dept = None
        sem_number = getattr(getattr(sec, 'semester', None), 'number', None)
        year = _derive_year_from_semester_number(sem_number)
        students.append({'id': sp.id, 'reg_no': sp.reg_no, 'username': getattr(getattr(sp, 'user', None), 'username', None), 'year': year, 'section': getattr(sec, 'name', None), 'department': getattr(dept, 'name', None) if dept else None})

    return Response({'students': students})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_parse(request):
    if not _is_iqac_user(request.user):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    uploaded = None
    if hasattr(request, 'FILES') and request.FILES:
        uploaded = request.FILES.get('file') or next(iter(request.FILES.values()))
    raw = uploaded.read() if uploaded else request.body
    if not raw:
        return Response({'success': False, 'events': [], 'errors': ['Empty upload']}, status=status.HTTP_400_BAD_REQUEST)

    try:
        import openpyxl
        from openpyxl.utils.datetime import from_excel
    except Exception:
        return Response({'success': False, 'events': [], 'errors': ['openpyxl not installed']}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    errors: List[str] = []
    events: List[Dict[str, Any]] = []
    try:
        wb = openpyxl.load_workbook(BytesIO(raw), data_only=True)
        ws = wb.worksheets[0]
    except Exception as e:
        return Response({'success': False, 'events': [], 'errors': [f'Failed to read Excel: {e}']}, status=status.HTTP_400_BAD_REQUEST)

    rows = []
    max_rows = min(ws.max_row or 0, 2000)
    max_cols = min(ws.max_column or 0, 60)
    for r in range(1, max_rows + 1):
        row = []
        for c in range(1, max_cols + 1):
            row.append(ws.cell(row=r, column=c).value)
        rows.append(row)

    def header_contains_date(row_vals: List[Any]) -> Optional[int]:
        for idx, v in enumerate(row_vals):
            if v is None:
                continue
            if 'date' in str(v).strip().lower():
                return idx
        return None

    header_row_index = None
    date_col = None
    header_map: Dict[str, int] = {}

    for i in range(min(10, len(rows))):
        dc = header_contains_date(rows[i])
        if dc is not None:
            header_row_index = i
            date_col = dc
            for j, v in enumerate(rows[i]):
                if v is None:
                    continue
                key = _normalize_text(v)
                if key:
                    header_map[key] = j
            break

    if date_col is None:
        best_col = None
        best_score = 0
        scan_rows = rows[: min(30, len(rows))]
        for c in range(max_cols):
            score = 0
            for rv in scan_rows:
                v = rv[c] if c < len(rv) else None
                if v is None:
                    continue
                if isinstance(v, (datetime, date)):
                    score += 2
                elif isinstance(v, (int, float)) and 1 <= float(v) <= 60000:
                    score += 1
                elif isinstance(v, str) and any(ch.isdigit() for ch in v) and ('-' in v or '/' in v):
                    score += 1
            if score > best_score:
                best_score = score
                best_col = c
        date_col = best_col
        header_row_index = 0

    if date_col is None:
        return Response({'success': False, 'events': [], 'errors': ['Could not detect date column']}, status=status.HTTP_400_BAD_REQUEST)

    def parse_date_cell(v: Any) -> Optional[date]:
        if v is None or v == '':
            return None
        if isinstance(v, datetime):
            return v.date()
        if isinstance(v, date):
            return v
        if isinstance(v, (int, float)):
            try:
                return from_excel(v).date()
            except Exception:
                return None
        if isinstance(v, str):
            s = v.strip()
            for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y'):
                try:
                    return datetime.strptime(s, fmt).date()
                except Exception:
                    pass
        return None

    def is_numeric_only_title(title: str) -> bool:
        t = title.strip()
        return bool(t) and all(ch.isdigit() or ch in '.,/- ' for ch in t)

    def find_title_col() -> int:
        for k in ('event', 'placement', 'training'):
            for hk, idx in header_map.items():
                if k in hk:
                    return idx
        day_cols = {idx for hk, idx in header_map.items() if 'day' in hk}
        for c in range(max_cols):
            if c == date_col or c in day_cols:
                continue
            non_empty = 0
            for rv in rows[header_row_index + 1 : header_row_index + 40]:
                v = rv[c] if c < len(rv) else None
                if v is None:
                    continue
                if str(v).strip():
                    non_empty += 1
            if non_empty >= 2:
                return c
        return 0 if date_col != 0 else 1

    title_col = find_title_col()
    desc_col = None
    for k in ('description', 'details', 'remark', 'remarks'):
        for hk, idx in header_map.items():
            if k in hk:
                desc_col = idx
                break
        if desc_col is not None:
            break

    for r_idx in range(header_row_index + 1, len(rows)):
        rv = rows[r_idx]
        d = parse_date_cell(rv[date_col] if date_col < len(rv) else None)
        if not d:
            continue

        title_val = rv[title_col] if title_col < len(rv) else None
        title = str(title_val).strip() if title_val is not None else ''
        if not title:
            for c in range(max_cols):
                if c == date_col:
                    continue
                v = rv[c] if c < len(rv) else None
                if v is None:
                    continue
                s = str(v).strip()
                if s:
                    title = s
                    break

        if not title or is_numeric_only_title(title):
            continue

        description = None
        if desc_col is not None and desc_col < len(rv) and rv[desc_col] is not None:
            description = str(rv[desc_col]).strip() or None

        events.append({'title': title, 'description': description, 'start_date': d.isoformat(), 'end_date': d.isoformat(), 'all_day': True, 'audience_department': None, 'year': None, 'source': 'iqac', 'image_url': None, 'audience_students': None})

    return Response({'success': True, 'events': events, 'errors': errors})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_import(request):
    if not _is_iqac_user(request.user):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    payload = request.data if isinstance(request.data, dict) else {}
    items = payload.get('events') if isinstance(payload, dict) else []
    if not isinstance(items, list) or not items:
        return Response({'error': 'events list required'}, status=status.HTTP_400_BAD_REQUEST)

    to_create: List[AcademicCalendarEvent] = []
    for it in items:
        try:
            title = str(it.get('title') or '').strip()
            if not title:
                continue
            sd = date.fromisoformat(str(it.get('start_date')))
            ed = date.fromisoformat(str(it.get('end_date') or it.get('start_date')))
            sd, ed = _clamp_dates(sd, ed)
            all_day = bool(it.get('all_day', True))
            audience_department = it.get('audience_department')
            if audience_department == '':
                audience_department = None
            year = _safe_int(it.get('year'))
            year_label = str(it.get('year_label') or '').strip() or None
            image_url = str(it.get('image_url') or '').strip() or None
            audience_students = it.get('audience_students')
            if isinstance(audience_students, str):
                try:
                    audience_students = json.loads(audience_students)
                except Exception:
                    audience_students = None

            to_create.append(
                AcademicCalendarEvent(
                    title=title,
                    description=str(it.get('description') or '').strip() or None,
                    start_date=sd,
                    end_date=ed,
                    all_day=all_day,
                    audience_department=audience_department,
                    year=year,
                    year_label=year_label,
                    source=AcademicCalendarEvent.Source.IQAC,
                    created_by=request.user,
                    image_url=image_url,
                    audience_students=audience_students,
                )
            )
        except Exception:
            continue

    inserted = 0
    with transaction.atomic():
        chunk = 100
        for start in range(0, len(to_create), chunk):
            batch = to_create[start : start + chunk]
            AcademicCalendarEvent.objects.bulk_create(batch, batch_size=chunk)
            inserted += len(batch)

    return Response({'inserted': inserted})
