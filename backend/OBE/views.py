from decimal import Decimal, InvalidOperation

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Q
from django.db.utils import OperationalError
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render

from academics.models import Subject, StudentProfile, TeachingAssignment

# Mark Entry Tabs View (Faculty OBE Section)
@login_required
def mark_entry_tabs(request, subject_id):
    # Faculty-only page (must have a staff profile)
    if not hasattr(request.user, 'staff_profile'):
        return HttpResponseForbidden('Faculty access only.')

    subject = get_object_or_404(Subject, code=subject_id)
    tab = request.GET.get('tab', 'dashboard')
    saved = request.GET.get('saved') == '1'

    # Basic student list for the subject semester (fallback to all students)
    students = (
        StudentProfile.objects.select_related('user', 'section')
        .filter(section__semester=subject.semester)
        .order_by('reg_no')
    )
    if not students.exists():
        students = StudentProfile.objects.select_related('user', 'section').all().order_by('reg_no')

    from .models import Cia1Mark

    errors: list[str] = []

    if request.method == 'POST' and tab == 'cia1':
        with transaction.atomic():
            for s in students:
                key = f'mark_{s.id}'
                raw = (request.POST.get(key) or '').strip()

                if raw == '':
                    # Blank => clear stored mark
                    Cia1Mark.objects.filter(subject=subject, student=s).delete()
                    continue

                try:
                    mark = Decimal(raw)
                except (InvalidOperation, ValueError):
                    errors.append(f'Invalid mark for {s.reg_no}: {raw}')
                    continue

                Cia1Mark.objects.update_or_create(
                    subject=subject,
                    student=s,
                    defaults={'mark': mark},
                )

        if not errors:
            return redirect(f"{request.path}?tab=cia1&saved=1")

    try:
        marks = {
            m.student_id: m.mark
            for m in Cia1Mark.objects.filter(subject=subject, student__in=students)
        }
    except OperationalError:
        marks = {}
    cia1_rows = [{'student': s, 'mark': marks.get(s.id)} for s in students]

    context = {
        'subject': subject,
        'students': students,
        'tab': tab,
        'saved': saved,
        'cia1_rows': cia1_rows,
        'errors': errors,
    }
    return render(request, 'OBE/mark_entry_tabs.html', context)
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import CdapRevision, CdapActiveLearningAnalysisMapping
from .services.cdap_parser import parse_cdap_excel
from .services.articulation_parser import parse_articulation_matrix_excel
from .services.articulation_from_revision import build_articulation_matrix_from_revision_rows
from accounts.utils import get_user_permissions


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def cia1_marks(request, subject_id):
    """CIA1 marks API used by the React Faculty → OBE → Mark Entry → CIA1 screen.

    - GET: returns roster + current marks
    - PUT: upserts/clears marks
    """
    user = request.user
    staff_profile = getattr(user, 'staff_profile', None)
    if not staff_profile:
        return Response({'detail': 'Faculty access only.'}, status=status.HTTP_403_FORBIDDEN)

    subject = get_object_or_404(Subject, code=subject_id)

    role_names = {r.name.upper() for r in user.roles.all()}
    tas = TeachingAssignment.objects.select_related('section', 'academic_year').filter(
        subject=subject,
        is_active=True,
    )

    # Staff: only their teaching assignments; HOD/ADVISOR: within their department
    if 'HOD' in role_names or 'ADVISOR' in role_names:
        if getattr(staff_profile, 'department_id', None):
            tas = tas.filter(section__semester__course__department=staff_profile.department)
    else:
        tas = tas.filter(staff=staff_profile)

    # Prefer active academic year assignments when present
    if tas.filter(academic_year__is_active=True).exists():
        tas = tas.filter(academic_year__is_active=True)

    section_ids = list(tas.values_list('section_id', flat=True).distinct())
    if not section_ids:
        return Response({'detail': 'No teaching assignment found for this subject.'}, status=status.HTTP_403_FORBIDDEN)

    students = (
        StudentProfile.objects.select_related('user', 'section')
        .filter(
            Q(section_id__in=section_ids)
            | Q(section_assignments__section_id__in=section_ids, section_assignments__end_date__isnull=True)
        )
        .distinct()
        .order_by('reg_no')
    )

    from .models import Cia1Mark

    # If the DB hasn't been migrated yet, avoid returning Django's HTML 500 page.
    try:
        # Quick touch to ensure table exists.
        Cia1Mark.objects.none().count()
    except OperationalError:
        return Response(
            {
                'detail': 'CIA1 marks table is missing. Run database migrations first.',
                'how_to_fix': [
                    'cd backend',
                    'python manage.py migrate',
                ],
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    if request.method == 'PUT':
        payload = request.data or {}
        incoming = payload.get('marks', {})
        if incoming is None:
            incoming = {}

        marks_map: dict[int, object] = {}
        if isinstance(incoming, list):
            for item in incoming:
                try:
                    sid = int(item.get('student_id'))
                except Exception:
                    continue
                marks_map[sid] = item.get('mark')
        elif isinstance(incoming, dict):
            for k, v in incoming.items():
                try:
                    marks_map[int(k)] = v
                except Exception:
                    continue
        else:
            return Response({'detail': 'Invalid marks payload.'}, status=status.HTTP_400_BAD_REQUEST)

        errors: list[str] = []
        try:
            with transaction.atomic():
                for s in students:
                    if s.id not in marks_map:
                        continue
                    raw = marks_map.get(s.id)

                    if raw is None or (isinstance(raw, str) and raw.strip() == ''):
                        Cia1Mark.objects.filter(subject=subject, student=s).delete()
                        continue

                    try:
                        mark = Decimal(str(raw))
                    except (InvalidOperation, ValueError):
                        errors.append(f'Invalid mark for {s.reg_no}: {raw}')
                        continue

                    Cia1Mark.objects.update_or_create(
                        subject=subject,
                        student=s,
                        defaults={'mark': mark},
                    )
        except OperationalError:
            return Response(
                {
                    'detail': 'CIA1 marks table is missing. Run database migrations first.',
                    'how_to_fix': [
                        'cd backend',
                        'python manage.py migrate',
                    ],
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if errors:
            return Response({'detail': 'Validation error.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    try:
        existing = {
            m.student_id: (str(m.mark) if m.mark is not None else None)
            for m in Cia1Mark.objects.filter(subject=subject, student__in=students)
        }
    except OperationalError:
        existing = {}

    out_students = []
    for s in students:
        full_name = ''
        try:
            full_name = s.user.get_full_name()
        except Exception:
            full_name = ''

        out_students.append({
            'id': s.id,
            'reg_no': s.reg_no,
            'name': full_name or s.user.username,
            'section': str(s.section) if s.section else None,
        })

    return Response({
        'subject': {'code': subject.code, 'name': subject.name},
        'students': out_students,
        'marks': existing,
    })


def _require_permissions(request, required_codes: set[str]):
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    if getattr(user, 'is_superuser', False):
        return None

    user_perms = set(get_user_permissions(user))
    if user_perms.intersection(required_codes):
        return None

    needed = ', '.join(sorted(required_codes))
    return Response({'detail': f'Permission required: {needed}.'}, status=status.HTTP_403_FORBIDDEN)


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def upload_cdap(request):
    auth = _require_permissions(request, {'obe.cdap.upload'})
    if auth:
        return auth
    if 'file' not in request.FILES:
        return Response({'detail': 'Missing file'}, status=status.HTTP_400_BAD_REQUEST)
    parsed = parse_cdap_excel(request.FILES['file'])
    return Response(parsed)


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def upload_articulation_matrix(request):
    auth = _require_permissions(request, {'obe.cdap.upload'})
    if auth:
        return auth
    if 'file' not in request.FILES:
        return Response({'detail': 'Missing file'}, status=status.HTTP_400_BAD_REQUEST)
    parsed = parse_articulation_matrix_excel(request.FILES['file'])
    return Response(parsed)


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def cdap_revision(request, subject_id):
    required = {'obe.view'} if request.method == 'GET' else {'obe.cdap.upload'}
    auth = _require_permissions(request, required)
    if auth:
        return auth

    if request.method == 'GET':
        rev = CdapRevision.objects.filter(subject_id=subject_id).first()
        if not rev:
            return Response({
                'subject_id': str(subject_id),
                'status': 'draft',
                'rows': [],
                'books': {'textbook': '', 'reference': ''},
                'active_learning': {'grid': [], 'dropdowns': []},
            })
        return Response({
            'subject_id': str(rev.subject_id),
            'status': rev.status,
            'rows': rev.rows,
            'books': rev.books,
            'active_learning': rev.active_learning,
        })

    body = request.data or {}
    if body is None:
        return Response({'detail': 'Invalid JSON'}, status=status.HTTP_400_BAD_REQUEST)

    defaults = {
        'rows': body.get('rows', []),
        'books': body.get('books', {}),
        'active_learning': body.get('active_learning', {}),
        'status': body.get('status', 'draft'),
        'updated_by': getattr(request.user, 'id', None),
    }

    obj = CdapRevision.objects.filter(subject_id=subject_id).first()
    if obj:
        for k, v in defaults.items():
            setattr(obj, k, v)
        obj.save(update_fields=list(defaults.keys()) + ['updated_at'])
    else:
        obj = CdapRevision(subject_id=subject_id, created_by=getattr(request.user, 'id', None), **defaults)
        obj.save()

    return Response({
        'subject_id': str(obj.subject_id),
        'status': obj.status,
        'rows': obj.rows,
        'books': obj.books,
        'active_learning': obj.active_learning,
    })


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def active_learning_mapping(request):
    required = {'obe.view'} if request.method == 'GET' else {'obe.master.manage'}
    auth = _require_permissions(request, required)
    if auth:
        return auth

    row = CdapActiveLearningAnalysisMapping.objects.filter(id=1).first()

    if request.method == 'GET':
        return Response({
            'mapping': row.mapping if row else {},
            'updated_at': row.updated_at.isoformat() if row and row.updated_at else None,
        })

    body = request.data or {}
    if body is None:
        return Response({'detail': 'Invalid JSON'}, status=status.HTTP_400_BAD_REQUEST)

    mapping = body.get('mapping', {})
    if row:
        row.mapping = mapping
        row.updated_by = getattr(request.user, 'id', None)
        row.save(update_fields=['mapping', 'updated_by', 'updated_at'])
    else:
        row = CdapActiveLearningAnalysisMapping(id=1, mapping=mapping, updated_by=getattr(request.user, 'id', None))
        row.save()

    return Response({'mapping': row.mapping, 'updated_at': row.updated_at.isoformat()})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def articulation_matrix(request, subject_id: str):
    auth = _require_permissions(request, {'obe.view'})
    if auth:
        return auth

    rev = CdapRevision.objects.filter(subject_id=subject_id).first()
    rows = []
    extras = {}
    if rev and isinstance(rev.rows, list):
        rows = rev.rows

    if rev and isinstance(getattr(rev, 'active_learning', None), dict):
        maybe = rev.active_learning.get('articulation_extras')
        if isinstance(maybe, dict):
            extras = maybe

    matrix = build_articulation_matrix_from_revision_rows(rows)

    # Get global mapping from OBE Master for the last 3 rows
    global_mapping_row = CdapActiveLearningAnalysisMapping.objects.filter(id=1).first()
    global_mapping = global_mapping_row.mapping if global_mapping_row and isinstance(global_mapping_row.mapping, dict) else {}

    # Apply to Units 1-4: replace the last 3 rows with OBE Master mapping
    if isinstance(matrix.get('units'), list):
        for u in matrix['units']:
            unit_idx = u.get('unit_index', 0)
            
            # For Units 1-4, use OBE Master mapping; for Unit 5+, use articulation extras
            if unit_idx in [1, 2, 3, 4] and global_mapping:
                # Get the extras for this unit to determine activity names and hours
                unit_label = str(u.get('unit') or '')
                picked = extras.get(unit_label, [])
                
                base_rows = u.get('rows') or []
                next_serial = 0
                try:
                    next_serial = max(int(r.get('s_no') or 0) for r in base_rows) if base_rows else 0
                except Exception:
                    next_serial = len(base_rows)
                
                # Add the last 3 rows based on saved extras but with OBE Master PO mapping
                for rr in picked:
                    next_serial += 1
                    
                    # Get the activity name from topic_name
                    activity_name = str(rr.get('topic_name') or rr.get('topic') or '').strip()
                    co_mapped = rr.get('co_mapped') or ''
                    hours_value = rr.get('hours') or rr.get('class_session_hours') or 2
                    
                    # Try to convert hours to number
                    try:
                        hours_value = int(hours_value) if hours_value != '-' else 2
                    except:
                        hours_value = 2
                    
                    # Get PO mapping from global mapping using activity name as key
                    po_mapping = global_mapping.get(activity_name, [])
                    if not isinstance(po_mapping, list):
                        po_mapping = []
                    
                    # Build PO values: if checked, use hours; else '-'
                    po_vals = []
                    for i in range(11):
                        is_checked = po_mapping[i] if i < len(po_mapping) else False
                        po_vals.append(hours_value if is_checked else '-')
                    
                    # PSO values remain as '-' for now
                    pso_vals = ['-', '-', '-']
                    
                    u.setdefault('rows', []).append({
                        'excel_row': rr.get('excel_row'),
                        's_no': next_serial,
                        'co_mapped': co_mapped,
                        'topic_no': rr.get('topic_no') or '-',
                        'topic_name': activity_name,
                        'po': po_vals,
                        'pso': pso_vals,
                        'hours': hours_value,
                    })
                    
            else:
                # For other units, use articulation extras as-is
                unit_label = str(u.get('unit') or '')
                picked = extras.get(unit_label)
                if not isinstance(picked, list) or not picked:
                    continue
                base_rows = u.get('rows') or []
                next_serial = 0
                try:
                    next_serial = max(int(r.get('s_no') or 0) for r in base_rows) if base_rows else 0
                except Exception:
                    next_serial = len(base_rows)
                for rr in picked:
                    next_serial += 1
                    u.setdefault('rows', []).append({
                        'excel_row': rr.get('excel_row'),
                        's_no': next_serial,
                        'co_mapped': rr.get('co_mapped') or rr.get('co_mapped'.upper()) or rr.get('co') or rr.get('label') or '',
                        'topic_no': rr.get('topic_no') or '',
                        'topic_name': rr.get('topic_name') or rr.get('topic') or '',
                        'po': rr.get('po') or [],
                        'pso': rr.get('pso') or [],
                        'hours': rr.get('hours') or rr.get('class_session_hours') or '',
                    })

    matrix['meta'] = {**(matrix.get('meta') or {}), 'subject_id': str(subject_id)}
    return Response(matrix)
