from decimal import Decimal, InvalidOperation
import re

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Q
from django.db.utils import OperationalError
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.core.exceptions import FieldError

from academics.models import Subject, StudentProfile, TeachingAssignment, Semester

# Mark Entry Tabs View (Faculty OBE Section)
@login_required
def mark_entry_tabs(request, subject_id):
    # Faculty-only page (must have a staff profile)
    if not hasattr(request.user, 'staff_profile'):
        return HttpResponseForbidden('Faculty access only.')

    subject = _get_subject(subject_id, request)
    tab = request.GET.get('tab', 'dashboard')
    saved = request.GET.get('saved') == '1'

    # Basic student list for the subject semester (fallback to all students)
    # Order students by name (last, first, username) for SSA1/CIA1/Formative1 display
    students = (
        StudentProfile.objects.select_related('user', 'section')
        .filter(section__semester=subject.semester)
        .order_by('user__last_name', 'user__first_name', 'user__username')
    )
    if not students.exists():
        students = StudentProfile.objects.select_related('user', 'section').all().order_by('user__last_name', 'user__first_name', 'user__username')

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
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.apps import apps

from .models import CdapRevision, CdapActiveLearningAnalysisMapping, ObeAssessmentMasterConfig
from .services.cdap_parser import parse_cdap_excel
from .services.articulation_parser import parse_articulation_matrix_excel
from .services.articulation_from_revision import build_articulation_matrix_from_revision_rows
from accounts.utils import get_user_permissions
from django.core.files.storage import default_storage
from django.conf import settings
import os


def _parse_int(value):
    try:
        if value is None:
            return None
        s = str(value).strip()
        if not s:
            return None
        return int(s)
    except Exception:
        return None


def _get_query_params(request):
    return getattr(request, 'query_params', {}) if hasattr(request, 'query_params') else request.GET


def _get_teaching_assignment_id_from_request(request, body: dict | None = None) -> int | None:
    if body and isinstance(body, dict) and body.get('teaching_assignment_id') is not None:
        ta_id = _parse_int(body.get('teaching_assignment_id'))
        if ta_id is not None:
            return ta_id
    qp = _get_query_params(request)
    return _parse_int(qp.get('teaching_assignment_id'))


def _resolve_section_name_from_ta(ta) -> str:
    if not ta:
        return ''
    sec = getattr(ta, 'section', None)
    if not sec:
        return ''
    return str(getattr(sec, 'name', None) or str(sec) or '').strip()


def _get_mark_table_lock_if_exists(*, staff_user, subject_code: str, assessment: str, teaching_assignment=None, academic_year=None, section_name: str = ''):
    from .models import ObeMarkTableLock

    if teaching_assignment is not None:
        return ObeMarkTableLock.objects.filter(teaching_assignment=teaching_assignment, assessment=str(assessment).lower()).first()

    qs = ObeMarkTableLock.objects.filter(
        teaching_assignment__isnull=True,
        staff_user=staff_user,
        subject_code=str(subject_code),
        assessment=str(assessment).lower(),
        section_name=str(section_name or ''),
    )
    if academic_year is not None:
        qs = qs.filter(academic_year=academic_year)
    return qs.order_by('-updated_at').first()


def _upsert_mark_table_lock(
    *,
    staff_user,
    subject_code: str,
    subject_name: str,
    assessment: str,
    teaching_assignment=None,
    academic_year=None,
    section_name: str = '',
    updated_by: int | None = None,
):
    from .models import ObeMarkTableLock

    assessment_key = str(assessment).lower()
    section_name = str(section_name or '').strip()
    subject_code = str(subject_code or '').strip()
    subject_name = str(subject_name or '').strip()

    defaults = {
        'staff_user': staff_user,
        'academic_year': academic_year,
        'subject_code': subject_code,
        'subject_name': subject_name,
        'section_name': section_name,
        'updated_by': updated_by,
    }

    if teaching_assignment is not None:
        obj, _created = ObeMarkTableLock.objects.update_or_create(
            teaching_assignment=teaching_assignment,
            assessment=assessment_key,
            defaults=defaults,
        )
        return obj

    obj, _created = ObeMarkTableLock.objects.update_or_create(
        teaching_assignment=None,
        staff_user=staff_user,
        subject_code=subject_code,
        assessment=assessment_key,
        section_name=section_name,
        academic_year=academic_year,
        defaults=defaults,
    )
    return obj


def _touch_lock_after_publish(request, *, subject_code: str, subject_name: str, assessment: str, teaching_assignment_id: int | None = None):
    from .models import ObeMarkTableLock

    ta = _resolve_staff_teaching_assignment(request, subject_code=subject_code, teaching_assignment_id=teaching_assignment_id)
    academic_year = getattr(ta, 'academic_year', None) if ta else None
    section_name = _resolve_section_name_from_ta(ta)

    lock = _upsert_mark_table_lock(
        staff_user=getattr(request, 'user', None),
        subject_code=subject_code,
        subject_name=subject_name,
        assessment=assessment,
        teaching_assignment=ta,
        academic_year=academic_year,
        section_name=section_name,
        updated_by=getattr(getattr(request, 'user', None), 'id', None),
    )

    lock.is_published = True
    lock.mark_manager_locked = True
    lock.mark_entry_unblocked_until = None
    lock.mark_manager_unlocked_until = None
    lock.recompute_blocks()
    lock.save(
        update_fields=[
            'is_published',
            'published_blocked',
            'mark_entry_blocked',
            'mark_manager_locked',
            'mark_entry_unblocked_until',
            'mark_manager_unlocked_until',
            'updated_by',
            'updated_at',
        ]
    )
    return lock


def _has_obe_master_access(user) -> bool:
    if user is None:
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return True
    try:
        perms = get_user_permissions(user)
    except Exception:
        perms = set()
    return 'obe.master.manage' in {str(p).lower() for p in (perms or set())}


def _require_obe_master(request):
    if not _has_obe_master_access(getattr(request, 'user', None)):
        return Response({'detail': 'OBE Master access only.'}, status=status.HTTP_403_FORBIDDEN)
    return None


def _has_obe_master_permission(user) -> bool:
    if user is None:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        perms = get_user_permissions(user)
    except Exception:
        perms = set()
    return 'obe.master.manage' in {str(p).lower() for p in (perms or set())}


def _require_obe_master_permission(request):
    if not _has_obe_master_permission(getattr(request, 'user', None)):
        return Response({'detail': 'OBE Master permission required.'}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([AllowAny])
def class_type_weights_list(request):
    """Return current class-type weights as a mapping keyed by normalized class type."""
    from .models import ClassTypeWeights

    try:
        objs = ClassTypeWeights.objects.all()
    except Exception:
        objs = []

    out = {}
    for o in objs:
        out[str(o.class_type).upper()] = {
            'ssa1': float(o.ssa1) if o.ssa1 is not None else None,
            'cia1': float(o.cia1) if o.cia1 is not None else None,
            'formative1': float(o.formative1) if o.formative1 is not None else None,
            'internal_mark_weights': (o.internal_mark_weights if isinstance(getattr(o, 'internal_mark_weights', None), list) else None),
            'updated_at': (o.updated_at.isoformat() if getattr(o, 'updated_at', None) else None),
            'updated_by': o.updated_by,
        }
    return Response({'results': out})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def class_type_weights_upsert(request):
    """Upsert multiple class-type weights. Requires OBE master permission (IQAC).

    Body: { CLASS_TYPE: { ssa1: number, cia1: number, formative1: number, internal_mark_weights?: number[] }, ... }
    """
    auth = _require_obe_master_permission(request)
    if auth:
        return auth

    data = request.data if isinstance(request.data, dict) else {}
    if not isinstance(data, dict):
        return Response({'detail': 'Invalid payload'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import ClassTypeWeights

    user_id = getattr(getattr(request, 'user', None), 'id', None)
    out = {}
    with transaction.atomic():
        for k, v in data.items():
            try:
                ct = str(k or '').strip().upper()
                ssa = float(v.get('ssa1')) if v and v.get('ssa1') is not None else None
                cia = float(v.get('cia1')) if v and v.get('cia1') is not None else None
                f1 = float(v.get('formative1')) if v and v.get('formative1') is not None else None
            except Exception:
                continue

            im = None
            try:
                im_raw = v.get('internal_mark_weights') if isinstance(v, dict) else None
                if isinstance(im_raw, list):
                    im = []
                    for x in im_raw:
                        try:
                            im.append(float(x))
                        except Exception:
                            im.append(0)
            except Exception:
                im = None

            if not ct:
                continue

            existing = None
            try:
                existing = ClassTypeWeights.objects.filter(class_type=ct).first()
            except Exception:
                existing = None
            existing_im = getattr(existing, 'internal_mark_weights', None) if existing is not None else None
            if not isinstance(existing_im, list):
                existing_im = []

            obj, created = ClassTypeWeights.objects.update_or_create(
                class_type=ct,
                defaults={
                    'ssa1': ssa if ssa is not None else 0,
                    'cia1': cia if cia is not None else 0,
                    'formative1': f1 if f1 is not None else 0,
                    'internal_mark_weights': im if im is not None else existing_im,
                    'updated_by': user_id,
                },
            )
            out[ct] = {
                'ssa1': float(obj.ssa1),
                'cia1': float(obj.cia1),
                'formative1': float(obj.formative1),
                'internal_mark_weights': (obj.internal_mark_weights if isinstance(getattr(obj, 'internal_mark_weights', None), list) else []),
            }

    return Response({'results': out})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def internal_mark_mapping_get(request, subject_id: str):
    """Get IQAC-managed internal mark mapping for a subject.

    Returns:
      { subject: { code, name }, mapping: object|null, updated_at, updated_by }
    """
    from .models import InternalMarkMapping

    subject = _get_subject(subject_id, request)
    obj = None
    try:
        obj = InternalMarkMapping.objects.select_related('subject').filter(subject=subject).first()
    except Exception:
        obj = None

    return Response({
        'subject': {'code': getattr(subject, 'code', str(subject_id)), 'name': getattr(subject, 'name', '')},
        'mapping': (obj.mapping if obj else None),
        'updated_at': (obj.updated_at.isoformat() if obj and getattr(obj, 'updated_at', None) else None),
        'updated_by': (obj.updated_by if obj else None),
    })


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def internal_mark_mapping_upsert(request, subject_id: str):
    """Upsert internal mark mapping for a subject. Requires OBE master permission (IQAC).

    Body: { mapping: object }
    """
    auth = _require_obe_master_permission(request)
    if auth:
        return auth

    payload = request.data if isinstance(request.data, dict) else {}
    mapping = payload.get('mapping') if isinstance(payload, dict) else None
    if mapping is None:
        return Response({'detail': 'mapping is required'}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(mapping, dict):
        return Response({'detail': 'mapping must be an object'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import InternalMarkMapping

    subject = _get_subject(subject_id, request)
    user_id = getattr(getattr(request, 'user', None), 'id', None)

    with transaction.atomic():
        obj, _created = InternalMarkMapping.objects.update_or_create(
            subject=subject,
            defaults={'mapping': mapping, 'updated_by': user_id},
        )

    return Response({
        'status': 'ok',
        'subject': {'code': getattr(subject, 'code', str(subject_id)), 'name': getattr(subject, 'name', '')},
        'mapping': obj.mapping,
        'updated_at': (obj.updated_at.isoformat() if getattr(obj, 'updated_at', None) else None),
        'updated_by': obj.updated_by,
    })


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def iqac_reset_assessment(request, assessment: str, subject_id: str):
    """IQAC/OBE Master: reset a single assessment for a course.

    Clears:
    - Draft JSON (AssessmentDraft)
    - Published data for that assessment (marks tables / published snapshots)
    - Mark table lock row for the teaching assignment + assessment

    Does NOT affect other assessments.

    Query/body:
    - teaching_assignment_id (required for deterministic lock reset)
    """
    auth = _require_obe_master_permission(request)
    if auth:
        return auth

    assessment_key = str(assessment or '').strip().lower()
    if assessment_key not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    subject = _get_subject(subject_id, request)
    ta_id = _get_teaching_assignment_id_from_request(request, request.data if isinstance(request.data, dict) else None)
    if ta_id is None:
        return Response({'detail': 'teaching_assignment_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        ta = TeachingAssignment.objects.select_related('section', 'academic_year').filter(id=int(ta_id), is_active=True).first()
    except Exception:
        ta = None

    if ta is None:
        return Response({'detail': 'Invalid teaching_assignment_id.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import AssessmentDraft
    from .models import LabPublishedSheet, Cia1PublishedSheet, Cia2PublishedSheet
    from .models import Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark, Formative1Mark, Formative2Mark, Cia1Mark, Cia2Mark
    from .models import ObeMarkTableLock

    deleted = {
        'draft': 0,
        'published': 0,
        'lock': 0,
    }

    with transaction.atomic():
        # Draft
        try:
            deleted['draft'] = int(AssessmentDraft.objects.filter(subject=subject, assessment=assessment_key).delete()[0] or 0)
        except Exception:
            deleted['draft'] = 0

        # Published
        try:
            if assessment_key == 'ssa1':
                deleted['published'] += int(Ssa1Mark.objects.filter(subject=subject).delete()[0] or 0)
            elif assessment_key == 'review1':
                deleted['published'] += int(Review1Mark.objects.filter(subject=subject).delete()[0] or 0)
            elif assessment_key == 'ssa2':
                deleted['published'] += int(Ssa2Mark.objects.filter(subject=subject).delete()[0] or 0)
            elif assessment_key == 'review2':
                deleted['published'] += int(Review2Mark.objects.filter(subject=subject).delete()[0] or 0)
            elif assessment_key == 'formative1':
                deleted['published'] += int(Formative1Mark.objects.filter(subject=subject).delete()[0] or 0)
                deleted['published'] += int(LabPublishedSheet.objects.filter(subject=subject, assessment='formative1').delete()[0] or 0)
            elif assessment_key == 'formative2':
                deleted['published'] += int(Formative2Mark.objects.filter(subject=subject).delete()[0] or 0)
                deleted['published'] += int(LabPublishedSheet.objects.filter(subject=subject, assessment='formative2').delete()[0] or 0)
            elif assessment_key == 'cia1':
                deleted['published'] += int(Cia1PublishedSheet.objects.filter(subject=subject).delete()[0] or 0)
                deleted['published'] += int(Cia1Mark.objects.filter(subject=subject).delete()[0] or 0)
                deleted['published'] += int(LabPublishedSheet.objects.filter(subject=subject, assessment='cia1').delete()[0] or 0)
            elif assessment_key == 'cia2':
                deleted['published'] += int(Cia2PublishedSheet.objects.filter(subject=subject).delete()[0] or 0)
                deleted['published'] += int(Cia2Mark.objects.filter(subject=subject).delete()[0] or 0)
                deleted['published'] += int(LabPublishedSheet.objects.filter(subject=subject, assessment='cia2').delete()[0] or 0)
            elif assessment_key == 'model':
                deleted['published'] += int(LabPublishedSheet.objects.filter(subject=subject, assessment='model').delete()[0] or 0)
        except Exception:
            pass

        # Lock row (per teaching assignment)
        try:
            deleted['lock'] = int(ObeMarkTableLock.objects.filter(teaching_assignment=ta, assessment=assessment_key).delete()[0] or 0)
        except Exception:
            deleted['lock'] = 0

    return Response({'status': 'reset', 'assessment': assessment_key, 'subject_code': subject.code, 'deleted': deleted})


def _parse_due_at(value):
    if value is None:
        return None
    if isinstance(value, str):
        dt = parse_datetime(value)
        if dt is None:
            return None
        if timezone.is_naive(dt):
            try:
                dt = timezone.make_aware(dt, timezone.get_current_timezone())
            except Exception:
                pass
        return dt
    return None


def _resolve_staff_teaching_assignment(request, subject_code: str, teaching_assignment_id: int | None = None):
    user = getattr(request, 'user', None)
    staff_profile = getattr(user, 'staff_profile', None)

    qs = TeachingAssignment.objects.select_related('academic_year', 'subject', 'curriculum_row', 'section').filter(is_active=True)
    if teaching_assignment_id is not None:
        if staff_profile is not None:
            ta = qs.filter(id=teaching_assignment_id, staff=staff_profile).first()
        elif _has_obe_master_access(user):
            ta = qs.filter(id=teaching_assignment_id).first()
        else:
            ta = None
        if ta is not None:
            return ta

    if not staff_profile:
        return None

    # fallback: match by subject code
    qs = qs.filter(staff=staff_profile).filter(
        Q(subject__code=subject_code) | Q(curriculum_row__course_code=subject_code)
    )
    # prefer active academic year
    if qs.filter(academic_year__is_active=True).exists():
        qs = qs.filter(academic_year__is_active=True)
    return qs.order_by('-id').first()


def _resolve_curriculum_row_for_subject(request, subject_code: str, teaching_assignment_id: int | None = None):
    """Best-effort curriculum row lookup for a subject code.

    Preference:
    1) TeachingAssignment.curriculum_row (most accurate)
    2) CurriculumDepartment match for staff user's department
    3) Any CurriculumDepartment match
    """
    try:
        ta = _resolve_staff_teaching_assignment(request, subject_code=subject_code, teaching_assignment_id=teaching_assignment_id)
        row = getattr(ta, 'curriculum_row', None)
        if row is not None:
            return row
    except Exception:
        row = None

    try:
        from curriculum.models import CurriculumDepartment

        staff_profile = getattr(getattr(request, 'user', None), 'staff_profile', None)
        dept = getattr(staff_profile, 'current_department', None) if staff_profile else None
        qs = CurriculumDepartment.objects.all().select_related('master', 'department')
        if dept is not None:
            qs = qs.filter(department=dept)
        code = str(subject_code or '').strip()
        if code:
            qs = qs.filter(course_code__iexact=code)
        return qs.order_by('-updated_at').first()
    except Exception:
        return None


def _enforce_assessment_enabled_for_course(request, *, subject_code: str, assessment: str, teaching_assignment_id: int | None = None):
    """Reject requests for disabled assessments on SPECIAL courses."""
    assessment_key = str(assessment or '').strip().lower()
    if not assessment_key:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    row = _resolve_curriculum_row_for_subject(request, subject_code=subject_code, teaching_assignment_id=teaching_assignment_id)
    class_type = str(getattr(row, 'class_type', '') or '').strip().upper() if row else ''
    if class_type != 'SPECIAL':
        return None

    enabled = None
    # Prefer the globally locked SPECIAL selection (if present), otherwise fall
    # back to curriculum-row configuration.
    try:
        from academics.models import SpecialCourseAssessmentSelection

        ta = _resolve_staff_teaching_assignment(request, subject_code=subject_code, teaching_assignment_id=teaching_assignment_id)
        academic_year = getattr(ta, 'academic_year', None) if ta else None
        if row is not None and academic_year is not None and getattr(row, 'master_id', None) is not None:
            sel = SpecialCourseAssessmentSelection.objects.filter(curriculum_row__master_id=row.master_id, academic_year=academic_year).order_by('id').first()
            if sel is not None:
                enabled = getattr(sel, 'enabled_assessments', None)
    except Exception:
        enabled = None

    if enabled is None:
        enabled = getattr(row, 'enabled_assessments', None) or []
    enabled_set = {str(x).strip().lower() for x in enabled if str(x).strip()}
    if assessment_key not in enabled_set:
        return Response(
            {
                'detail': 'Assessment not enabled for this Special course.',
                'how_to_fix': [
                    'Edit Curriculum Master → set Class type = Special and enable this assessment.',
                    'Propagate the master to departments if needed.',
                ],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def _get_due_schedule_for_request(request, subject_code: str, assessment: str, teaching_assignment_id: int | None = None):
    from .models import ObeDueSchedule, ObePublishRequest, ObeGlobalPublishControl
    now = timezone.now()

    ta = _resolve_staff_teaching_assignment(request, subject_code=subject_code, teaching_assignment_id=teaching_assignment_id)
    academic_year = getattr(ta, 'academic_year', None) if ta else None

    schedule = None
    if academic_year is not None:
        schedule = ObeDueSchedule.objects.filter(
            academic_year=academic_year,
            subject_code=str(subject_code),
            assessment=str(assessment).lower(),
            is_active=True,
        ).order_by('-updated_at').first()

    due_at = getattr(schedule, 'due_at', None)
    allowed_by_due = True
    remaining_seconds = None
    if due_at is not None:
        allowed_by_due = now < due_at
        remaining_seconds = int(max(0, (due_at - now).total_seconds()))

    approval = None
    if academic_year is not None:
        approval = ObePublishRequest.objects.filter(
            staff_user=getattr(request, 'user', None),
            academic_year=academic_year,
            subject_code=str(subject_code),
            assessment=str(assessment).lower(),
            status='APPROVED',
            approved_until__gt=now,
        ).order_by('-updated_at').first()

    allowed_by_approval = approval is not None
    approval_until = getattr(approval, 'approved_until', None)

    # Check for an optional global override (takes precedence)
    global_override = None
    global_override_active = False
    global_is_open = None
    global_updated_at = None
    global_updated_by = None
    allowed_by_global = None
    if academic_year is not None:
        try:
            global_override = ObeGlobalPublishControl.objects.filter(
                academic_year=academic_year,
                assessment=str(assessment).lower(),
            ).order_by('-updated_at').first()
        except OperationalError:
            # Missing table or DB error — treat as no global override so UI won't 500.
            global_override = None
        if global_override is not None:
            global_override_active = True
            global_is_open = bool(getattr(global_override, 'is_open', True))
            global_updated_at = getattr(global_override, 'updated_at', None)
            global_updated_by = getattr(global_override, 'updated_by', None)
            allowed_by_global = global_is_open

    # Final decision:
    # - If a global override exists and it is OPEN, publishing is allowed regardless of due time.
    # - If a global override exists and it is CLOSED, publishing is allowed only when an explicit
    #   IQAC approval exists (so approving a request actually enables publishing).
    # - If no global override exists, normal due/approval logic applies.
    if global_override_active:
        if bool(global_is_open):
            publish_allowed = True
        else:
            publish_allowed = bool(allowed_by_approval)
    else:
        publish_allowed = bool(allowed_by_due or allowed_by_approval)

    return {
        'academic_year': academic_year,
        'teaching_assignment': ta,
        'schedule': schedule,
        'due_at': due_at,
        'now': now,
        'remaining_seconds': remaining_seconds,
        'allowed_by_due': allowed_by_due,
        'allowed_by_approval': allowed_by_approval,
        'approval_until': approval_until,
        'publish_allowed': publish_allowed,
        'global_override_active': global_override_active,
        'global_is_open': global_is_open,
        'global_updated_at': global_updated_at,
        'global_updated_by': global_updated_by,
        'allowed_by_global': allowed_by_global,
    }


def _enforce_publish_window(request, subject_code: str, assessment: str):
    # Accept optional TA id to correctly resolve academic year
    ta_id_raw = getattr(request, 'query_params', {}).get('teaching_assignment_id') if hasattr(request, 'query_params') else request.GET.get('teaching_assignment_id')
    ta_id = None
    try:
        if ta_id_raw:
            ta_id = int(str(ta_id_raw))
    except Exception:
        ta_id = None

    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject_code, assessment=assessment, teaching_assignment_id=ta_id)
    if gate is not None:
        return gate

    info = _get_due_schedule_for_request(request, subject_code=subject_code, assessment=assessment, teaching_assignment_id=ta_id)
    if info.get('publish_allowed'):
        return None

    due_at = info.get('due_at')
    now = info.get('now')
    # If a global override exists and it is closed, return a distinct message
    if info.get('global_override_active') and (info.get('global_is_open') is False):
        return Response(
            {
                'detail': 'Publishing is disabled globally by IQAC for this assessment.',
                'assessment': str(assessment).lower(),
                'subject_code': str(subject_code),
                'due_at': due_at.isoformat() if due_at else None,
                'now': now.isoformat() if now else None,
                'remaining_seconds': info.get('remaining_seconds'),
                'how_to_fix': [
                    'Contact IQAC to enable global publishing for this assessment or reset the global override.',
                ],
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return Response(
        {
            'detail': 'Publish window closed. Please request approval from IQAC.',
            'assessment': str(assessment).lower(),
            'subject_code': str(subject_code),
            'due_at': due_at.isoformat() if due_at else None,
            'now': now.isoformat() if now else None,
            'remaining_seconds': info.get('remaining_seconds'),
            'how_to_fix': [
                'Use the Request button in the OBE mark entry page',
                'Or ask IQAC to approve your publish request',
            ],
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _faculty_only(request):
    user = request.user
    staff_profile = getattr(user, 'staff_profile', None)
    if not staff_profile:
        # Allow OBE Master / IQAC users to act as faculty for OBE flows (they may pass
        # a `teaching_assignment_id` to identify the section). This permits IQAC users
        # with the `obe.master.manage` permission (or superusers) to access and edit
        # mark-entry endpoints without requiring a staff_profile.
        if _has_obe_master_permission(user):
            return None, None
        return None, Response({'detail': 'Faculty access only.'}, status=status.HTTP_403_FORBIDDEN)
    return staff_profile, None


def _get_subject(subject_id: str, request=None):
    """Resolve a Subject by code.

    If the Subject row does not exist (common when curriculum is used without
    seeding academics.Subject), create a minimal Subject record so OBE drafts/
    publish flows do not 404.
    """
    code = str(subject_id or '').strip()
    if not code:
        return get_object_or_404(Subject, code=code)

    existing = Subject.objects.filter(code=code).select_related('semester').first()
    if existing:
        return existing

    # Best-effort: derive name + semester from CurriculumDepartment for the staff's department.
    name = code
    semester = None
    try:
        from curriculum.models import CurriculumDepartment

        staff_profile = getattr(getattr(request, 'user', None), 'staff_profile', None)
        dept = getattr(staff_profile, 'current_department', None) if staff_profile else None
        if dept:
            row = (
                CurriculumDepartment.objects.filter(department=dept, course_code=code)
                .select_related('semester')
                .order_by('-updated_at')
                .first()
            )
            if row:
                name = row.course_name or name
                semester = row.semester
    except Exception:
        # Fall back to any semester if curriculum lookup fails.
        pass

    if semester is None:
        semester = Semester.objects.order_by('id').first()

    if semester is None:
        # No semester exists in the DB; cannot create a Subject.
        return get_object_or_404(Subject, code=code)

    obj, _created = Subject.objects.get_or_create(
        code=code,
        defaults={
            'name': str(name)[:128],
            'semester': semester,
            'course': None,
        },
    )
    return obj


def _coerce_decimal_or_none(raw):
    if raw is None:
        return None
    if isinstance(raw, str) and raw.strip() == '':
        return None
    try:
        return Decimal(str(raw))
    except (InvalidOperation, ValueError):
        return None


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def assessment_draft(request, assessment: str, subject_id: str):
    """Shared draft endpoint.

    - GET: returns draft JSON (or null)
    - PUT: saves draft JSON

    Assessment: ssa1 | ssa2 | cia1 | cia2 | formative1 | formative2 | model
    """
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    if assessment not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    subject = _get_subject(subject_id, request)

    ta_id = _get_teaching_assignment_id_from_request(request, request.data if request.method == 'PUT' else None)
    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject.code, assessment=assessment, teaching_assignment_id=ta_id)
    if gate is not None:
        return gate

    from .models import AssessmentDraft

    if request.method == 'PUT':
        body = request.data or {}
        data = body.get('data', None)
        if data is None:
            return Response({'detail': 'Missing draft data.'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(data, (dict, list)):
            return Response({'detail': 'Invalid draft data.'}, status=status.HTTP_400_BAD_REQUEST)

        AssessmentDraft.objects.update_or_create(
            subject=subject,
            assessment=assessment,
            defaults={'data': data, 'updated_by': getattr(request.user, 'id', None)},
        )
        return Response({'status': 'draft_saved'})

    draft = AssessmentDraft.objects.filter(subject=subject, assessment=assessment).first()
    draft_data = draft.data if draft else None
    updated_at = draft.updated_at.isoformat() if draft and getattr(draft, 'updated_at', None) else None
    updated_by = None
    if draft and getattr(draft, 'updated_by', None):
        try:
            User = apps.get_model(settings.AUTH_USER_MODEL)
            u = User.objects.filter(id=getattr(draft, 'updated_by')).first()
            if u:
                updated_by = {'id': getattr(u, 'id', None), 'username': getattr(u, 'username', None), 'name': ' '.join(filter(None, [getattr(u, 'first_name', ''), getattr(u, 'last_name', '')])).strip() or getattr(u, 'username', None)}
        except Exception:
            updated_by = {'id': getattr(draft, 'updated_by', None)}

    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'draft': draft_data, 'updated_at': updated_at, 'updated_by': updated_by})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def ssa1_published(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    ta_id = _get_teaching_assignment_id_from_request(request)
    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject.code, assessment='ssa1', teaching_assignment_id=ta_id)
    if gate is not None:
        return gate
    from .models import Ssa1Mark
    try:
        rows = Ssa1Mark.objects.filter(subject=subject)
        marks = {str(r.student_id): (str(r.mark) if r.mark is not None else None) for r in rows}
    except OperationalError:
        marks = {}
    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def ssa1_publish(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err
    subject = _get_subject(subject_id, request)

    gate = _enforce_publish_window(request, subject.code, 'ssa1')
    if gate is not None:
        return gate

    body = request.data or {}
    data = body.get('data', None)
    if data is None or not isinstance(data, dict):
        return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

    rows = data.get('rows', [])
    if not isinstance(rows, list):
        return Response({'detail': 'Invalid rows.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import Ssa1Mark

    errors: list[str] = []
    with transaction.atomic():
        for item in rows:
            try:
                sid = int(item.get('studentId'))
            except Exception:
                continue
            student = StudentProfile.objects.filter(id=sid).first()
            if not student:
                continue

            mark = _coerce_decimal_or_none(item.get('total'))
            if item.get('total') not in (None, '',) and mark is None:
                errors.append(f'Invalid mark for student {sid}: {item.get("total")}')
                continue

            if mark is None:
                Ssa1Mark.objects.filter(subject=subject, student=student).delete()
            else:
                Ssa1Mark.objects.update_or_create(subject=subject, student=student, defaults={'mark': mark})

    if errors:
        return Response({'detail': 'Validation error.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    try:
        ta_id = _get_teaching_assignment_id_from_request(request)
        _touch_lock_after_publish(
            request,
            subject_code=subject.code,
            subject_name=subject.name,
            assessment='ssa1',
            teaching_assignment_id=ta_id,
        )
    except OperationalError:
        pass

    return Response({'status': 'published'})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def review1_published(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    ta_id = _get_teaching_assignment_id_from_request(request)
    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject.code, assessment='review1', teaching_assignment_id=ta_id)
    if gate is not None:
        return gate
    from .models import Review1Mark
    try:
        rows = Review1Mark.objects.filter(subject=subject)
        marks = {str(r.student_id): (str(r.mark) if r.mark is not None else None) for r in rows}
    except OperationalError:
        marks = {}
    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def review1_publish(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err
    subject = _get_subject(subject_id, request)

    gate = _enforce_publish_window(request, subject.code, 'review1')
    if gate is not None:
        return gate

    body = request.data or {}
    data = body.get('data', None)
    if data is None or not isinstance(data, dict):
        return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

    rows = data.get('rows', [])
    if not isinstance(rows, list):
        return Response({'detail': 'Invalid rows.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import Review1Mark

    errors: list[str] = []
    with transaction.atomic():
        for item in rows:
            try:
                sid = int(item.get('studentId'))
            except Exception:
                continue
            student = StudentProfile.objects.filter(id=sid).first()
            if not student:
                continue

            mark = _coerce_decimal_or_none(item.get('total'))
            if item.get('total') not in (None, '',) and mark is None:
                errors.append(f'Invalid mark for student {sid}: {item.get("total")}')
                continue

            if mark is None:
                Review1Mark.objects.filter(subject=subject, student=student).delete()
            else:
                Review1Mark.objects.update_or_create(subject=subject, student=student, defaults={'mark': mark})

    if errors:
        return Response({'detail': 'Validation error.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    try:
        ta_id = _get_teaching_assignment_id_from_request(request)
        _touch_lock_after_publish(
            request,
            subject_code=subject.code,
            subject_name=subject.name,
            assessment='review1',
            teaching_assignment_id=ta_id,
        )
    except OperationalError:
        pass

    return Response({'status': 'published'})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def ssa2_published(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    ta_id = _get_teaching_assignment_id_from_request(request)
    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject.code, assessment='ssa2', teaching_assignment_id=ta_id)
    if gate is not None:
        return gate
    from .models import Ssa2Mark
    try:
        rows = Ssa2Mark.objects.filter(subject=subject)
        marks = {str(r.student_id): (str(r.mark) if r.mark is not None else None) for r in rows}
    except OperationalError:
        marks = {}
    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def ssa2_publish(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err
    subject = _get_subject(subject_id, request)

    gate = _enforce_publish_window(request, subject.code, 'ssa2')
    if gate is not None:
        return gate

    body = request.data or {}
    data = body.get('data', None)
    if data is None or not isinstance(data, dict):
        return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

    rows = data.get('rows', [])
    if not isinstance(rows, list):
        return Response({'detail': 'Invalid rows.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import Ssa2Mark

    errors: list[str] = []
    with transaction.atomic():
        for item in rows:
            try:
                sid = int(item.get('studentId'))
            except Exception:
                continue
            student = StudentProfile.objects.filter(id=sid).first()
            if not student:
                continue

            mark = _coerce_decimal_or_none(item.get('total'))
            if item.get('total') not in (None, '',) and mark is None:
                errors.append(f'Invalid mark for student {sid}: {item.get("total")}')
                continue

            if mark is None:
                Ssa2Mark.objects.filter(subject=subject, student=student).delete()
            else:
                Ssa2Mark.objects.update_or_create(subject=subject, student=student, defaults={'mark': mark})

    if errors:
        return Response({'detail': 'Validation error.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    try:
        ta_id = _get_teaching_assignment_id_from_request(request)
        _touch_lock_after_publish(
            request,
            subject_code=subject.code,
            subject_name=subject.name,
            assessment='ssa2',
            teaching_assignment_id=ta_id,
        )
    except OperationalError:
        pass

    return Response({'status': 'published'})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def review2_published(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    ta_id = _get_teaching_assignment_id_from_request(request)
    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject.code, assessment='review2', teaching_assignment_id=ta_id)
    if gate is not None:
        return gate
    from .models import Review2Mark
    try:
        rows = Review2Mark.objects.filter(subject=subject)
        marks = {str(r.student_id): (str(r.mark) if r.mark is not None else None) for r in rows}
    except OperationalError:
        marks = {}
    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def review2_publish(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err
    subject = _get_subject(subject_id, request)

    gate = _enforce_publish_window(request, subject.code, 'review2')
    if gate is not None:
        return gate

    body = request.data or {}
    data = body.get('data', None)
    if data is None or not isinstance(data, dict):
        return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

    rows = data.get('rows', [])
    if not isinstance(rows, list):
        return Response({'detail': 'Invalid rows.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import Review2Mark

    errors: list[str] = []
    with transaction.atomic():
        for item in rows:
            try:
                sid = int(item.get('studentId'))
            except Exception:
                continue
            student = StudentProfile.objects.filter(id=sid).first()
            if not student:
                continue

            mark = _coerce_decimal_or_none(item.get('total'))
            if item.get('total') not in (None, '',) and mark is None:
                errors.append(f'Invalid mark for student {sid}: {item.get("total")}')
                continue

            if mark is None:
                Review2Mark.objects.filter(subject=subject, student=student).delete()
            else:
                Review2Mark.objects.update_or_create(subject=subject, student=student, defaults={'mark': mark})

    if errors:
        return Response({'detail': 'Validation error.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    try:
        ta_id = _get_teaching_assignment_id_from_request(request)
        _touch_lock_after_publish(
            request,
            subject_code=subject.code,
            subject_name=subject.name,
            assessment='review2',
            teaching_assignment_id=ta_id,
        )
    except OperationalError:
        pass

    return Response({'status': 'published'})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def formative1_published(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    ta_id = _get_teaching_assignment_id_from_request(request)
    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject.code, assessment='formative1', teaching_assignment_id=ta_id)
    if gate is not None:
        return gate
    from .models import Formative1Mark
    try:
        rows = Formative1Mark.objects.filter(subject=subject)
        marks = {
            str(r.student_id): {
                'skill1': str(r.skill1) if r.skill1 is not None else None,
                'skill2': str(r.skill2) if r.skill2 is not None else None,
                'att1': str(r.att1) if r.att1 is not None else None,
                'att2': str(r.att2) if r.att2 is not None else None,
                'total': str(r.total) if r.total is not None else None,
            }
            for r in rows
        }
    except OperationalError:
        marks = {}
    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def formative1_publish(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err
    subject = _get_subject(subject_id, request)

    gate = _enforce_publish_window(request, subject.code, 'formative1')
    if gate is not None:
        return gate

    body = request.data or {}
    data = body.get('data', None)
    if data is None or not isinstance(data, dict):
        return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

    rows_by = data.get('rowsByStudentId', {})
    if not isinstance(rows_by, dict):
        return Response({'detail': 'Invalid rowsByStudentId.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import Formative1Mark

    errors: list[str] = []
    with transaction.atomic():
        for sid_str, item in rows_by.items():
            try:
                sid = int(sid_str)
            except Exception:
                continue
            student = StudentProfile.objects.filter(id=sid).first()
            if not student:
                continue

            skill1 = _coerce_decimal_or_none((item or {}).get('skill1'))
            skill2 = _coerce_decimal_or_none((item or {}).get('skill2'))
            att1 = _coerce_decimal_or_none((item or {}).get('att1'))
            att2 = _coerce_decimal_or_none((item or {}).get('att2'))

            # If any is missing, treat as no published mark.
            if skill1 is None or skill2 is None or att1 is None or att2 is None:
                Formative1Mark.objects.filter(subject=subject, student=student).delete()
                continue

            total = skill1 + skill2 + att1 + att2

            Formative1Mark.objects.update_or_create(
                subject=subject,
                student=student,
                defaults={'skill1': skill1, 'skill2': skill2, 'att1': att1, 'att2': att2, 'total': total},
            )

    if errors:
        return Response({'detail': 'Validation error.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    try:
        ta_id = _get_teaching_assignment_id_from_request(request)
        _touch_lock_after_publish(
            request,
            subject_code=subject.code,
            subject_name=subject.name,
            assessment='formative1',
            teaching_assignment_id=ta_id,
        )
    except OperationalError:
        pass
    return Response({'status': 'published'})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def formative2_published(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    ta_id = _get_teaching_assignment_id_from_request(request)
    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject.code, assessment='formative2', teaching_assignment_id=ta_id)
    if gate is not None:
        return gate
    from .models import Formative2Mark
    try:
        rows = Formative2Mark.objects.filter(subject=subject)
        marks = {
            str(r.student_id): {
                'skill1': str(r.skill1) if r.skill1 is not None else None,
                'skill2': str(r.skill2) if r.skill2 is not None else None,
                'att1': str(r.att1) if r.att1 is not None else None,
                'att2': str(r.att2) if r.att2 is not None else None,
                'total': str(r.total) if r.total is not None else None,
            }
            for r in rows
        }
    except OperationalError:
        marks = {}
    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def formative2_publish(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err
    subject = _get_subject(subject_id, request)

    gate = _enforce_publish_window(request, subject.code, 'formative2')
    if gate is not None:
        return gate

    body = request.data or {}
    data = body.get('data', None)
    if data is None or not isinstance(data, dict):
        return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

    rows_by = data.get('rowsByStudentId', {})
    if not isinstance(rows_by, dict):
        return Response({'detail': 'Invalid rowsByStudentId.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import Formative2Mark

    errors: list[str] = []
    with transaction.atomic():
        for sid_str, item in rows_by.items():
            try:
                sid = int(sid_str)
            except Exception:
                continue
            student = StudentProfile.objects.filter(id=sid).first()
            if not student:
                continue

            skill1 = _coerce_decimal_or_none((item or {}).get('skill1'))
            skill2 = _coerce_decimal_or_none((item or {}).get('skill2'))
            att1 = _coerce_decimal_or_none((item or {}).get('att1'))
            att2 = _coerce_decimal_or_none((item or {}).get('att2'))

            # If any is missing, treat as no published mark.
            if skill1 is None or skill2 is None or att1 is None or att2 is None:
                Formative2Mark.objects.filter(subject=subject, student=student).delete()
                continue

            total = skill1 + skill2 + att1 + att2

            Formative2Mark.objects.update_or_create(
                subject=subject,
                student=student,
                defaults={'skill1': skill1, 'skill2': skill2, 'att1': att1, 'att2': att2, 'total': total},
            )

    if errors:
        return Response({'detail': 'Validation error.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    try:
        ta_id = _get_teaching_assignment_id_from_request(request)
        _touch_lock_after_publish(
            request,
            subject_code=subject.code,
            subject_name=subject.name,
            assessment='formative2',
            teaching_assignment_id=ta_id,
        )
    except OperationalError:
        pass
    return Response({'status': 'published'})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def cia1_published_sheet(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    ta_id = _get_teaching_assignment_id_from_request(request)
    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject.code, assessment='cia1', teaching_assignment_id=ta_id)
    if gate is not None:
        return gate
    from .models import Cia1PublishedSheet
    row = Cia1PublishedSheet.objects.filter(subject=subject).first()
    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'data': row.data if row else None})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def cia1_publish_sheet(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    gate = _enforce_publish_window(request, subject.code, 'cia1')
    if gate is not None:
        return gate
    body = request.data or {}
    data = body.get('data', None)
    if data is None or not isinstance(data, dict):
        return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import Cia1PublishedSheet, Cia1Mark

    # Save the snapshot
    Cia1PublishedSheet.objects.update_or_create(
        subject=subject,
        defaults={'data': data, 'updated_by': getattr(request.user, 'id', None)},
    )

    # Also upsert totals into the existing CIA1 totals table.
    questions = data.get('questions', [])
    if not isinstance(questions, list):
        questions = []
    rows_by = data.get('rowsByStudentId', {})
    if not isinstance(rows_by, dict):
        rows_by = {}

    qkeys = [str(q.get('key')) for q in questions if isinstance(q, dict) and q.get('key')]

    with transaction.atomic():
        for sid_str, row in rows_by.items():
            try:
                sid = int(sid_str)
            except Exception:
                continue
            student = StudentProfile.objects.filter(id=sid).first()
            if not student:
                continue

            absent = bool((row or {}).get('absent'))
            if absent:
                total_dec = Decimal('0')
            else:
                q = (row or {}).get('q', {})
                if not isinstance(q, dict):
                    q = {}
                total = Decimal('0')
                for k in qkeys:
                    v = q.get(k)
                    dec = _coerce_decimal_or_none(v)
                    if dec is None:
                        continue
                    total += dec
                total_dec = total

            Cia1Mark.objects.update_or_create(
                subject=subject,
                student=student,
                defaults={'mark': total_dec},
            )

    try:
        ta_id = _get_teaching_assignment_id_from_request(request)
        _touch_lock_after_publish(
            request,
            subject_code=subject.code,
            subject_name=subject.name,
            assessment='cia1',
            teaching_assignment_id=ta_id,
        )
    except OperationalError:
        pass

    return Response({'status': 'published'})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def cia2_published_sheet(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    ta_id = _get_teaching_assignment_id_from_request(request)
    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject.code, assessment='cia2', teaching_assignment_id=ta_id)
    if gate is not None:
        return gate
    from .models import Cia2PublishedSheet
    try:
        row = Cia2PublishedSheet.objects.filter(subject=subject).first()
        data = row.data if row else None
    except OperationalError:
        data = None
    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'data': data})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def cia2_publish_sheet(request, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    subject = _get_subject(subject_id, request)

    gate = _enforce_publish_window(request, subject.code, 'cia2')
    if gate is not None:
        return gate
    body = request.data or {}
    data = body.get('data', None)
    if data is None or not isinstance(data, dict):
        return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import Cia2PublishedSheet, Cia2Mark

    # Save the snapshot
    Cia2PublishedSheet.objects.update_or_create(
        subject=subject,
        defaults={'data': data, 'updated_by': getattr(request.user, 'id', None)},
    )

    # Also upsert totals into the existing CIA2 totals table.
    questions = data.get('questions', [])
    if not isinstance(questions, list):
        questions = []
    rows_by = data.get('rowsByStudentId', {})
    if not isinstance(rows_by, dict):
        rows_by = {}

    qkeys = [str(q.get('key')) for q in questions if isinstance(q, dict) and q.get('key')]

    with transaction.atomic():
        for sid_str, row in rows_by.items():
            try:
                sid = int(sid_str)
            except Exception:
                continue
            student = StudentProfile.objects.filter(id=sid).first()
            if not student:
                continue

            absent = bool((row or {}).get('absent'))
            if absent:
                total_dec = Decimal('0')
            else:
                q = (row or {}).get('q', {})
                if not isinstance(q, dict):
                    q = {}
                total = Decimal('0')
                for k in qkeys:
                    v = q.get(k)
                    dec = _coerce_decimal_or_none(v)
                    if dec is None:
                        continue
                    total += dec
                total_dec = total

            Cia2Mark.objects.update_or_create(
                subject=subject,
                student=student,
                defaults={'mark': total_dec},
            )

    try:
        ta_id = _get_teaching_assignment_id_from_request(request)
        _touch_lock_after_publish(
            request,
            subject_code=subject.code,
            subject_name=subject.name,
            assessment='cia2',
            teaching_assignment_id=ta_id,
        )
    except OperationalError:
        pass

    return Response({'status': 'published'})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def lab_published_sheet(request, assessment: str, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    assessment = str(assessment or '').lower().strip()
    if assessment not in ('cia1', 'cia2', 'model', 'formative1', 'formative2'):
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    subject = _get_subject(subject_id, request)
    from .models import LabPublishedSheet
    try:
        row = LabPublishedSheet.objects.filter(subject=subject, assessment=assessment).first()
        data = row.data if row else None
    except OperationalError:
        data = None
    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'assessment': assessment, 'data': data})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def lab_publish_sheet(request, assessment: str, subject_id: str):
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    assessment = str(assessment or '').lower().strip()
    if assessment not in ('cia1', 'cia2', 'model', 'formative1', 'formative2'):
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    subject = _get_subject(subject_id, request)

    gate = _enforce_publish_window(request, subject.code, assessment)
    if gate is not None:
        return gate

    body = request.data or {}
    data = body.get('data', None)
    if data is None or not isinstance(data, dict):
        return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import LabPublishedSheet

    LabPublishedSheet.objects.update_or_create(
        subject=subject,
        assessment=assessment,
        defaults={'data': data, 'updated_by': getattr(request.user, 'id', None)},
    )

    try:
        ta_id = _get_teaching_assignment_id_from_request(request)
        _touch_lock_after_publish(
            request,
            subject_code=subject.code,
            subject_name=subject.name,
            assessment=str(assessment).lower(),
            teaching_assignment_id=ta_id,
        )
    except OperationalError:
        pass

    return Response({'status': 'published'})


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

    # Subject may not exist when teaching assignments reference curriculum rows only.
    subject = Subject.objects.filter(code=subject_id).first()

    role_names = {r.name.upper() for r in user.roles.all()}
    try:
        tas = TeachingAssignment.objects.select_related('section', 'academic_year', 'curriculum_row').filter(is_active=True)
        if subject is not None:
            tas = tas.filter(Q(subject=subject) | Q(curriculum_row__course_code=subject.code))
        else:
            tas = tas.filter(Q(subject__code=subject_id) | Q(curriculum_row__course_code=subject_id))
    except (ValueError, FieldError) as e:
        return Response(
            {
                'detail': 'CIA1 teaching assignment query failed.',
                'error': str(e),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Staff: only their teaching assignments; HOD/ADVISOR: within their department
    try:
        if 'HOD' in role_names or 'ADVISOR' in role_names:
            if getattr(staff_profile, 'department_id', None):
                # Semester is canonical (no course FK). Department lives on Course -> Batch.
                tas = tas.filter(section__batch__course__department=staff_profile.department)
        else:
            tas = tas.filter(staff=staff_profile)
    except (ValueError, FieldError) as e:
        return Response(
            {
                'detail': 'CIA1 teaching assignment filtering failed.',
                'error': str(e),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Prefer active academic year assignments when present
    if tas.filter(academic_year__is_active=True).exists():
        tas = tas.filter(academic_year__is_active=True)

    # If UI provided an explicit teaching assignment id, scope roster to that section.
    ta_id_raw = getattr(request, 'query_params', {}).get('teaching_assignment_id') if hasattr(request, 'query_params') else request.GET.get('teaching_assignment_id')
    ta_id = None
    try:
        if ta_id_raw:
            ta_id = int(str(ta_id_raw))
    except Exception:
        ta_id = None

    if ta_id is not None:
        ta = tas.filter(id=ta_id).first()
        if not ta:
            return Response({'detail': 'Teaching assignment not found for this subject.'}, status=status.HTTP_403_FORBIDDEN)
        section_ids = [ta.section_id]
    else:
        section_ids = list(tas.values_list('section_id', flat=True).distinct())
    if not section_ids:
        return Response({'detail': 'No teaching assignment found for this subject.'}, status=status.HTTP_403_FORBIDDEN)

    # Order roster by student name
    try:
        students = (
            StudentProfile.objects.select_related('user', 'section')
            .filter(
                Q(section_id__in=section_ids)
                | Q(section_assignments__section_id__in=section_ids, section_assignments__end_date__isnull=True)
            )
            .distinct()
            .order_by('user__last_name', 'user__first_name', 'user__username')
        )
    except (ValueError, FieldError) as e:
        return Response(
            {
                'detail': 'CIA1 roster query failed.',
                'error': str(e),
                'how_to_fix': [
                    'Ensure the selected Teaching Assignment has a valid Section and Semester',
                    'Ensure student section assignments are consistent',
                ],
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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

    subject_payload = None
    if subject is not None:
        subject_payload = {'code': subject.code, 'name': subject.name}
    else:
        # Fall back to curriculum_row info if available.
        any_ta = tas.first()
        cr = getattr(any_ta, 'curriculum_row', None) if any_ta else None
        subject_payload = {
            'code': str(subject_id),
            'name': (getattr(cr, 'course_name', None) or str(subject_id)),
        }

    return Response({
        'subject': subject_payload,
        'students': out_students,
        'marks': existing,
    })


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def cia2_marks(request, subject_id):
    """CIA2 marks API used by the React Faculty → OBE → Mark Entry → CIA2 screen.

    - GET: returns roster + current marks
    - PUT: upserts/clears marks
    """
    user = request.user
    staff_profile = getattr(user, 'staff_profile', None)
    if not staff_profile:
        return Response({'detail': 'Faculty access only.'}, status=status.HTTP_403_FORBIDDEN)

    # Subject may not exist when teaching assignments reference curriculum rows only.
    subject = Subject.objects.filter(code=subject_id).first()

    role_names = {r.name.upper() for r in user.roles.all()}
    try:
        tas = TeachingAssignment.objects.select_related('section', 'academic_year', 'curriculum_row').filter(is_active=True)
        if subject is not None:
            tas = tas.filter(Q(subject=subject) | Q(curriculum_row__course_code=subject.code))
        else:
            tas = tas.filter(Q(subject__code=subject_id) | Q(curriculum_row__course_code=subject_id))
    except (ValueError, FieldError) as e:
        return Response(
            {
                'detail': 'CIA2 teaching assignment query failed.',
                'error': str(e),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Staff: only their teaching assignments; HOD/ADVISOR: within their department
    try:
        if 'HOD' in role_names or 'ADVISOR' in role_names:
            if getattr(staff_profile, 'department_id', None):
                tas = tas.filter(section__batch__course__department=staff_profile.department)
        else:
            tas = tas.filter(staff=staff_profile)
    except (ValueError, FieldError) as e:
        return Response(
            {
                'detail': 'CIA2 teaching assignment filtering failed.',
                'error': str(e),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Prefer active academic year assignments when present
    if tas.filter(academic_year__is_active=True).exists():
        tas = tas.filter(academic_year__is_active=True)

    # If UI provided an explicit teaching assignment id, scope roster to that section.
    ta_id_raw = getattr(request, 'query_params', {}).get('teaching_assignment_id') if hasattr(request, 'query_params') else request.GET.get('teaching_assignment_id')
    ta_id = None
    try:
        if ta_id_raw:
            ta_id = int(str(ta_id_raw))
    except Exception:
        ta_id = None

    if ta_id is not None:
        ta = tas.filter(id=ta_id).first()
        if not ta:
            return Response({'detail': 'Teaching assignment not found for this subject.'}, status=status.HTTP_403_FORBIDDEN)
        section_ids = [ta.section_id]
    else:
        section_ids = list(tas.values_list('section_id', flat=True).distinct())
    if not section_ids:
        return Response({'detail': 'No teaching assignment found for this subject.'}, status=status.HTTP_403_FORBIDDEN)

    # Order roster by student name
    try:
        students = (
            StudentProfile.objects.select_related('user', 'section')
            .filter(
                Q(section_id__in=section_ids)
                | Q(section_assignments__section_id__in=section_ids, section_assignments__end_date__isnull=True)
            )
            .distinct()
            .order_by('user__last_name', 'user__first_name', 'user__username')
        )
    except (ValueError, FieldError) as e:
        return Response(
            {
                'detail': 'CIA2 roster query failed.',
                'error': str(e),
                'how_to_fix': [
                    'Ensure the selected Teaching Assignment has a valid Section and Semester',
                    'Ensure student section assignments are consistent',
                ],
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    from .models import Cia2Mark

    # If the DB hasn't been migrated yet, avoid returning Django's HTML 500 page.
    try:
        Cia2Mark.objects.none().count()
    except OperationalError:
        return Response(
            {
                'detail': 'CIA2 marks table is missing. Run database migrations first.',
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
                        Cia2Mark.objects.filter(subject=subject, student=s).delete()
                        continue

                    try:
                        mark = Decimal(str(raw))
                    except (InvalidOperation, ValueError):
                        errors.append(f'Invalid mark for {s.reg_no}: {raw}')
                        continue

                    Cia2Mark.objects.update_or_create(
                        subject=subject,
                        student=s,
                        defaults={'mark': mark},
                    )
        except OperationalError:
            return Response(
                {
                    'detail': 'CIA2 marks table is missing. Run database migrations first.',
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
            for m in Cia2Mark.objects.filter(subject=subject, student__in=students)
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

    subject_payload = None
    if subject is not None:
        subject_payload = {'code': subject.code, 'name': subject.name}
    else:
        any_ta = tas.first()
        cr = getattr(any_ta, 'curriculum_row', None) if any_ta else None
        subject_payload = {
            'code': str(subject_id),
            'name': (getattr(cr, 'course_name', None) or str(subject_id)),
        }

    return Response({
        'subject': subject_payload,
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


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def upload_docx(request):
    """Accept a .docx file upload for Exam Management. Saves file and returns stored path."""
    auth = _require_permissions(request, {'obe.cdap.upload'})
    if auth:
        return auth

    if 'file' not in request.FILES:
        return Response({'detail': 'Missing file'}, status=status.HTTP_400_BAD_REQUEST)

    f = request.FILES['file']
    # Ensure upload directory exists under MEDIA_ROOT if configured
    upload_dir = os.path.join('obe', 'uploads')
    try:
        saved_path = default_storage.save(os.path.join(upload_dir, f.name), f)
    except Exception as e:
        return Response({'detail': f'Failed to save file: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    file_url = None
    try:
        file_url = default_storage.url(saved_path)
    except Exception:
        file_url = saved_path

    return Response({'saved_path': saved_path, 'file_url': file_url})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def list_uploads(request):
    """List files under the OBE uploads folder. Returns name, path and url for each file."""
    auth = _require_permissions(request, {'obe.cdap.upload'})
    if auth:
        return auth

    upload_dir = os.path.join('obe', 'uploads')
    files_list = []
    try:
        # default_storage.listdir returns (dirs, files)
        dirs, files = default_storage.listdir(upload_dir)
        for fname in files:
            rel_path = os.path.join(upload_dir, fname)
            try:
                url = default_storage.url(rel_path)
            except Exception:
                url = rel_path
            files_list.append({'name': fname, 'path': rel_path, 'url': url})
    except Exception:
        # If directory doesn't exist or other error, return empty list
        files_list = []

    return Response({'files': files_list})


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


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def assessment_master_config(request):
    required = {'obe.view'} if request.method == 'GET' else {'obe.master.manage'}
    auth = _require_permissions(request, required)
    if auth:
        return auth

    row = ObeAssessmentMasterConfig.objects.filter(id=1).first()

    if request.method == 'GET':
        return Response({
            'config': row.config if row else {},
            'updated_at': row.updated_at.isoformat() if row and row.updated_at else None,
        })

    body = request.data or {}
    if body is None:
        return Response({'detail': 'Invalid JSON'}, status=status.HTTP_400_BAD_REQUEST)

    config = body.get('config', {})
    if row:
        row.config = config
        row.updated_by = getattr(request.user, 'id', None)
        row.save(update_fields=['config', 'updated_by', 'updated_at'])
    else:
        row = ObeAssessmentMasterConfig(id=1, config=config, updated_by=getattr(request.user, 'id', None))
        row.save()

    return Response({'config': row.config, 'updated_at': row.updated_at.isoformat()})


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


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def publish_window(request, assessment: str, subject_id: str):
    """Return publish window status for a staff user (used by UI to disable publish + show countdown)."""
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    assessment_key = str(assessment or '').strip().lower()
    if assessment_key not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    subject_code = str(subject_id or '').strip()
    ta_id_raw = getattr(request, 'query_params', {}).get('teaching_assignment_id') if hasattr(request, 'query_params') else request.GET.get('teaching_assignment_id')
    ta_id = None
    try:
        if ta_id_raw:
            ta_id = int(str(ta_id_raw))
    except Exception:
        ta_id = None

    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject_code, assessment=assessment_key, teaching_assignment_id=ta_id)
    if gate is not None:
        return gate

    info = _get_due_schedule_for_request(request, subject_code=subject_code, assessment=assessment_key, teaching_assignment_id=ta_id)

    due_at = info.get('due_at')
    now = info.get('now')
    academic_year = info.get('academic_year')
    ta = info.get('teaching_assignment')

    return Response(
        {
            'assessment': assessment_key,
            'subject_code': subject_code,
            'publish_allowed': bool(info.get('publish_allowed')),
            'allowed_by_due': bool(info.get('allowed_by_due')),
            'allowed_by_approval': bool(info.get('allowed_by_approval')),
            'global_override_active': bool(info.get('global_override_active')),
            'global_is_open': bool(info.get('global_is_open')) if info.get('global_override_active') else None,
            'allowed_by_global': bool(info.get('allowed_by_global')) if info.get('global_override_active') else None,
            'due_at': due_at.isoformat() if due_at else None,
            'now': now.isoformat() if now else None,
            'remaining_seconds': info.get('remaining_seconds'),
            'approval_until': (info.get('approval_until').isoformat() if info.get('approval_until') else None),
            'academic_year': {
                'id': getattr(academic_year, 'id', None),
                'name': getattr(academic_year, 'name', None),
            }
            if academic_year
            else None,
            'teaching_assignment_id': getattr(ta, 'id', None) if ta else None,
        }
    )


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def edit_window(request, assessment: str, subject_id: str):
    """Return edit window status for a staff user after publishing.

    This is separate from `publish_window` and is scoped:
    - MARK_ENTRY: unblock the marks entry table after publish
    - MARK_MANAGER: allow changing the mark manager configuration after confirmation
    """
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    assessment_key = str(assessment or '').strip().lower()
    if assessment_key not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    qp = getattr(request, 'query_params', {}) if hasattr(request, 'query_params') else request.GET
    scope_raw = str(qp.get('scope') or '').strip().upper()
    if scope_raw in {'MARKS', 'MARKS_ENTRY', 'MARK_ENTRY', 'TABLE'}:
        scope = 'MARK_ENTRY'
    elif scope_raw in {'MARK_MANAGER', 'MANAGER'}:
        scope = 'MARK_MANAGER'
    else:
        return Response({'detail': 'scope is required (MARK_ENTRY or MARK_MANAGER).'}, status=status.HTTP_400_BAD_REQUEST)

    subject_code = str(subject_id or '').strip()
    ta_id_raw = qp.get('teaching_assignment_id')
    ta_id = None
    try:
        if ta_id_raw:
            ta_id = int(str(ta_id_raw))
    except Exception:
        ta_id = None

    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject_code, assessment=assessment_key, teaching_assignment_id=ta_id)
    if gate is not None:
        return gate

    # Reuse schedule resolver to determine academic year for this staff+subject.
    info = _get_due_schedule_for_request(request, subject_code=subject_code, assessment=assessment_key, teaching_assignment_id=ta_id)
    academic_year = info.get('academic_year')
    ta = info.get('teaching_assignment')
    now = timezone.now()

    allowed_by_approval = False
    approval_until = None
    if academic_year is not None:
        from .models import ObeEditRequest

        qs = ObeEditRequest.objects.filter(
            staff_user=getattr(request, 'user', None),
            academic_year=academic_year,
            subject_code=str(subject_code),
            assessment=str(assessment_key).lower(),
            scope=str(scope),
            status='APPROVED',
            approved_until__gt=now,
        )
        if ta is not None:
            qs = qs.filter(teaching_assignment=ta)
        approval = qs.order_by('-updated_at').first()
        if approval is not None:
            allowed_by_approval = True
            approval_until = getattr(approval, 'approved_until', None)

    return Response(
        {
            'assessment': assessment_key,
            'subject_code': subject_code,
            'scope': scope,
            'allowed_by_approval': bool(allowed_by_approval),
            'approval_until': approval_until.isoformat() if approval_until else None,
            'now': now.isoformat() if now else None,
            'academic_year': {
                'id': getattr(academic_year, 'id', None),
                'name': getattr(academic_year, 'name', None),
            }
            if academic_year
            else None,
            'teaching_assignment_id': getattr(ta, 'id', None) if ta else None,
        }
    )


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def mark_table_lock_status(request, assessment: str, subject_id: str):
    """Faculty: return authoritative lock state for a mark-entry table.

    Query params:
    - teaching_assignment_id (optional but recommended)

    Derived semantics:
    - entry_open is True only when mark_entry is unblocked AND mark manager is locked/confirmed.
    """
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    assessment_key = str(assessment or '').strip().lower()
    if assessment_key not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    subject_code = str(subject_id or '').strip()
    qp = _get_query_params(request)
    ta_id = _parse_int(qp.get('teaching_assignment_id'))

    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject_code, assessment=assessment_key, teaching_assignment_id=ta_id)
    if gate is not None:
        return gate

    ta = _resolve_staff_teaching_assignment(request, subject_code=subject_code, teaching_assignment_id=ta_id)
    academic_year = getattr(ta, 'academic_year', None) if ta else None
    section_name = _resolve_section_name_from_ta(ta)

    try:
        lock = _get_mark_table_lock_if_exists(
            staff_user=getattr(request, 'user', None),
            subject_code=subject_code,
            assessment=assessment_key,
            teaching_assignment=ta,
            academic_year=academic_year,
            section_name=section_name,
        )
    except OperationalError:
        lock = None

    # Default for pre-publish flows: Mark Manager is editable, but the marks table is NOT open
    # until Mark Manager is confirmed/locked.
    if lock is None:
        # For OBE Master / IQAC users we want to avoid showing the "Table Locked" overlay;
        # treat the table as open and mark-manager editable so IQAC can view/edit without
        # restrictions. Non-master users keep the conservative default of entry_closed.
        if _has_obe_master_permission(getattr(request, 'user', None)):
            return Response(
                {
                    'assessment': assessment_key,
                    'subject_code': subject_code,
                    'teaching_assignment_id': getattr(ta, 'id', None) if ta else None,
                    'academic_year': {
                        'id': getattr(academic_year, 'id', None),
                        'name': getattr(academic_year, 'name', None),
                    }
                    if academic_year
                    else None,
                    'section_name': section_name or None,
                    'exists': False,
                    'is_published': False,
                    'published_blocked': False,
                    'mark_entry_blocked': False,
                    'mark_manager_locked': False,
                    'mark_entry_unblocked_until': None,
                    'mark_manager_unlocked_until': None,
                    'entry_open': True,
                    'mark_manager_editable': True,
                }
            )

        return Response(
            {
                'assessment': assessment_key,
                'subject_code': subject_code,
                'teaching_assignment_id': getattr(ta, 'id', None) if ta else None,
                'academic_year': {
                    'id': getattr(academic_year, 'id', None),
                    'name': getattr(academic_year, 'name', None),
                }
                if academic_year
                else None,
                'section_name': section_name or None,
                'exists': False,
                'is_published': False,
                'published_blocked': False,
                'mark_entry_blocked': False,
                'mark_manager_locked': False,
                'mark_entry_unblocked_until': None,
                'mark_manager_unlocked_until': None,
                'entry_open': False,
                'mark_manager_editable': True,
            }
        )

    # Effective values (apply time windows without needing cron)
    try:
        lock.recompute_blocks()
    except Exception:
        pass

    is_published = bool(getattr(lock, 'is_published', False))
    # During an approved MARK_MANAGER window, Mark Manager is unlocked and editable.
    # In that window, we also allow the marks table to open if mark-entry is unblocked
    # (so both can be edited without the published overlay blocking the page).
    now = timezone.now()
    manager_unlocked_active = bool(getattr(lock, 'mark_manager_unlocked_until', None) and getattr(lock, 'mark_manager_unlocked_until', None) > now)
    entry_open = (not bool(getattr(lock, 'mark_entry_blocked', False))) and (bool(getattr(lock, 'mark_manager_locked', False)) or manager_unlocked_active)
    mark_manager_editable = not bool(getattr(lock, 'mark_manager_locked', False))

    # IQAC / OBE master users should not be blocked by lock rows; present the table as open.
    if _has_obe_master_permission(getattr(request, 'user', None)):
        entry_open = True
        mark_manager_editable = True

    return Response(
        {
            'assessment': assessment_key,
            'subject_code': subject_code,
            'teaching_assignment_id': getattr(getattr(lock, 'teaching_assignment', None), 'id', None),
            'academic_year': {
                'id': getattr(getattr(lock, 'academic_year', None), 'id', None),
                'name': getattr(getattr(lock, 'academic_year', None), 'name', None),
            }
            if getattr(lock, 'academic_year', None)
            else None,
            'section_name': getattr(lock, 'section_name', None) or None,
            'exists': True,
            'is_published': is_published,
            'published_blocked': bool(getattr(lock, 'published_blocked', False)),
            'mark_entry_blocked': bool(getattr(lock, 'mark_entry_blocked', False)),
            'mark_manager_locked': bool(getattr(lock, 'mark_manager_locked', False)),
            'mark_entry_unblocked_until': getattr(lock, 'mark_entry_unblocked_until', None).isoformat() if getattr(lock, 'mark_entry_unblocked_until', None) else None,
            'mark_manager_unlocked_until': getattr(lock, 'mark_manager_unlocked_until', None).isoformat() if getattr(lock, 'mark_manager_unlocked_until', None) else None,
            'entry_open': bool(entry_open),
            'mark_manager_editable': bool(mark_manager_editable),
            'updated_at': getattr(lock, 'updated_at', None).isoformat() if getattr(lock, 'updated_at', None) else None,
        }
    )


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def mark_table_lock_confirm_mark_manager(request, assessment: str, subject_id: str):
    """Faculty: confirm/re-lock Mark Manager in DB.

    This is used after an IQAC MARK_MANAGER approval window: when the staff
    presses Confirm, we re-lock Mark Manager immediately so the marks table can
    open (if MARK_ENTRY is unblocked).
    """
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    assessment_key = str(assessment or '').strip().lower()
    if assessment_key not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    subject_code = str(subject_id or '').strip()
    ta_id = _get_teaching_assignment_id_from_request(request, request.data if isinstance(request.data, dict) else None)

    gate = _enforce_assessment_enabled_for_course(request, subject_code=subject_code, assessment=assessment_key, teaching_assignment_id=ta_id)
    if gate is not None:
        return gate

    ta = _resolve_staff_teaching_assignment(request, subject_code=subject_code, teaching_assignment_id=ta_id)
    academic_year = getattr(ta, 'academic_year', None) if ta else None
    section_name = _resolve_section_name_from_ta(ta)

    subject = _get_subject(subject_code, request)

    try:
        lock = _upsert_mark_table_lock(
            staff_user=getattr(request, 'user', None),
            subject_code=subject_code,
            subject_name=getattr(subject, 'name', '') or subject_code,
            assessment=assessment_key,
            teaching_assignment=ta,
            academic_year=academic_year,
            section_name=section_name,
            updated_by=getattr(getattr(request, 'user', None), 'id', None),
        )

        lock.mark_manager_locked = True
        lock.mark_manager_unlocked_until = None
        lock.recompute_blocks()
        lock.save(
            update_fields=[
                'mark_manager_locked',
                'mark_manager_unlocked_until',
                'published_blocked',
                'mark_entry_blocked',
                'updated_by',
                'updated_at',
            ]
        )
    except OperationalError:
        return Response({'detail': 'Database unavailable.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    entry_open = (not bool(getattr(lock, 'mark_entry_blocked', False))) and bool(getattr(lock, 'mark_manager_locked', False))
    return Response(
        {
            'status': 'ok',
            'assessment': assessment_key,
            'subject_code': subject_code,
            'exists': True,
            'is_published': bool(getattr(lock, 'is_published', False)),
            'mark_entry_blocked': bool(getattr(lock, 'mark_entry_blocked', False)),
            'mark_manager_locked': bool(getattr(lock, 'mark_manager_locked', False)),
            'mark_entry_unblocked_until': getattr(lock, 'mark_entry_unblocked_until', None).isoformat() if getattr(lock, 'mark_entry_unblocked_until', None) else None,
            'mark_manager_unlocked_until': getattr(lock, 'mark_manager_unlocked_until', None).isoformat() if getattr(lock, 'mark_manager_unlocked_until', None) else None,
            'entry_open': bool(entry_open),
        }
    )


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def due_schedule_subjects(request):
    """IQAC helper: list subject codes taught in the selected academic years."""
    auth = _require_obe_master(request)
    if auth:
        return auth

    raw = (
        getattr(request, 'query_params', {}).get('academic_year_ids')
        if hasattr(request, 'query_params')
        else request.GET.get('academic_year_ids')
    ) or (
        getattr(request, 'query_params', {}).get('academic_year_id')
        if hasattr(request, 'query_params')
        else request.GET.get('academic_year_id')
    )

    ay_ids: list[int] = []
    for part in str(raw or '').split(','):
        part = part.strip()
        if not part:
            continue
        try:
            ay_ids.append(int(part))
        except Exception:
            continue

    if not ay_ids:
        return Response({'detail': 'academic_year_ids is required.'}, status=status.HTTP_400_BAD_REQUEST)

    tas = TeachingAssignment.objects.select_related('academic_year', 'subject', 'curriculum_row').filter(is_active=True, academic_year_id__in=ay_ids)

    out: dict[str, dict[str, dict]] = {}
    for ta in tas:
        ay_id = str(getattr(ta, 'academic_year_id', '') or '')
        if not ay_id:
            continue

        code = None
        name = None
        try:
            if getattr(ta, 'curriculum_row', None):
                code = getattr(ta.curriculum_row, 'course_code', None)
                name = getattr(ta.curriculum_row, 'course_name', None)
        except Exception:
            pass
        try:
            if not code and getattr(ta, 'subject', None):
                code = getattr(ta.subject, 'code', None)
                name = name or getattr(ta.subject, 'name', None)
        except Exception:
            pass

        code = str(code or '').strip()
        if not code:
            continue

        out.setdefault(ay_id, {})
        if code not in out[ay_id]:
            out[ay_id][code] = {
                'subject_code': code,
                'subject_name': str(name or '').strip(),
            }

    return Response(
        {
            'academic_year_ids': ay_ids,
            'subjects_by_academic_year': {
                ay: sorted(list(items.values()), key=lambda x: (x.get('subject_code') or ''))
                for ay, items in out.items()
            },
        }
    )


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def due_schedules(request):
    """IQAC: list due schedules for academic years."""
    auth = _require_obe_master(request)
    if auth:
        return auth

    raw = (
        getattr(request, 'query_params', {}).get('academic_year_ids')
        if hasattr(request, 'query_params')
        else request.GET.get('academic_year_ids')
    )
    ay_ids: list[int] = []
    for part in str(raw or '').split(','):
        part = part.strip()
        if not part:
            continue
        try:
            ay_ids.append(int(part))
        except Exception:
            continue

    from .models import ObeDueSchedule
    qs = ObeDueSchedule.objects.select_related('academic_year').all().order_by('academic_year_id', 'subject_code', 'assessment')
    if ay_ids:
        qs = qs.filter(academic_year_id__in=ay_ids)

    items = []
    for r in qs:
        items.append(
            {
                'id': r.id,
                'academic_year': {
                    'id': r.academic_year_id,
                    'name': getattr(r.academic_year, 'name', None),
                },
                'subject_code': r.subject_code,
                'subject_name': r.subject_name,
                'assessment': r.assessment,
                'due_at': r.due_at.isoformat() if r.due_at else None,
                'is_active': bool(r.is_active),
                'updated_at': r.updated_at.isoformat() if r.updated_at else None,
            }
        )

    return Response({'results': items})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def due_schedule_upsert(request):
    """IQAC: create/update a due schedule row."""
    auth = _require_obe_master(request)
    if auth:
        return auth

    body = request.data or {}
    ay_id = body.get('academic_year_id')
    subject_code = str(body.get('subject_code') or '').strip()
    subject_name = str(body.get('subject_name') or '').strip()
    assessment = str(body.get('assessment') or '').strip().lower()
    due_at = _parse_due_at(body.get('due_at'))

    if not ay_id or not subject_code or not assessment or due_at is None:
        return Response({'detail': 'academic_year_id, subject_code, assessment, due_at are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if assessment not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)

    from academics.models import AcademicYear, Subject
    from .models import ObeDueSchedule

    ay = AcademicYear.objects.filter(id=int(ay_id)).first()
    if not ay:
        return Response({'detail': 'Academic year not found.'}, status=status.HTTP_404_NOT_FOUND)

    subj = Subject.objects.filter(code=subject_code).first()
    if not subject_name and subj is not None:
        subject_name = subj.name

    obj, _created = ObeDueSchedule.objects.update_or_create(
        academic_year=ay,
        subject_code=subject_code,
        assessment=assessment,
        defaults={
            'subject': subj,
            'subject_name': subject_name,
            'due_at': due_at,
            'is_active': True,
            'updated_by': getattr(request.user, 'id', None),
            'created_by': getattr(request.user, 'id', None),
        },
    )

    return Response(
        {
            'id': obj.id,
            'academic_year_id': obj.academic_year_id,
            'subject_code': obj.subject_code,
            'subject_name': obj.subject_name,
            'assessment': obj.assessment,
            'due_at': obj.due_at.isoformat() if obj.due_at else None,
            'updated_at': obj.updated_at.isoformat() if obj.updated_at else None,
        }
    )


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def due_schedule_bulk_upsert(request):
    """IQAC: bulk upsert due schedules for many subjects and/or assessments."""
    auth = _require_obe_master(request)
    if auth:
        return auth

    body = request.data or {}
    ay_id = body.get('academic_year_id')
    assessments = body.get('assessments') or []
    subject_codes = body.get('subject_codes') or []
    due_at = _parse_due_at(body.get('due_at'))

    if not ay_id or due_at is None:
        return Response({'detail': 'academic_year_id and due_at are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not isinstance(assessments, list) or not assessments:
        return Response({'detail': 'assessments must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)

    if not isinstance(subject_codes, list) or not subject_codes:
        return Response({'detail': 'subject_codes must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)

    norm_assessments = [str(a).strip().lower() for a in assessments]
    bad = [a for a in norm_assessments if a not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}]
    if bad:
        return Response({'detail': f'Invalid assessments: {bad}'}, status=status.HTTP_400_BAD_REQUEST)

    from academics.models import AcademicYear, Subject
    from .models import ObeDueSchedule

    ay = AcademicYear.objects.filter(id=int(ay_id)).first()
    if not ay:
        return Response({'detail': 'Academic year not found.'}, status=status.HTTP_404_NOT_FOUND)

    updated = 0
    for code in [str(s).strip() for s in subject_codes]:
        if not code:
            continue
        subj = Subject.objects.filter(code=code).first()
        name = getattr(subj, 'name', '') if subj else ''
        for a in norm_assessments:
            ObeDueSchedule.objects.update_or_create(
                academic_year=ay,
                subject_code=code,
                assessment=a,
                defaults={
                    'subject': subj,
                    'subject_name': name,
                    'due_at': due_at,
                    'is_active': True,
                    'updated_by': getattr(request.user, 'id', None),
                    'created_by': getattr(request.user, 'id', None),
                },
            )
            updated += 1

    return Response({'status': 'ok', 'updated': updated})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def global_publish_controls(request):
    """IQAC: list global publish overrides for selected academic years and assessments.

    Query params: academic_year_ids (comma separated), assessments (comma separated)
    """
    auth = _require_obe_master(request)
    if auth:
        return auth

    raw_ay = (getattr(request, 'query_params', {}).get('academic_year_ids') if hasattr(request, 'query_params') else request.GET.get('academic_year_ids')) or ''
    raw_assess = (getattr(request, 'query_params', {}).get('assessments') if hasattr(request, 'query_params') else request.GET.get('assessments')) or ''

    ay_ids: list[int] = []
    for part in str(raw_ay or '').split(','):
        part = part.strip()
        if not part:
            continue
        try:
            ay_ids.append(int(part))
        except Exception:
            continue

    assessments = [a.strip().lower() for a in str(raw_assess or '').split(',') if a and a.strip()]

    from .models import ObeGlobalPublishControl

    qs = ObeGlobalPublishControl.objects.select_related('academic_year')
    if ay_ids:
        qs = qs.filter(academic_year_id__in=ay_ids)
    if assessments:
        qs = qs.filter(assessment__in=assessments)

    out = []
    for r in qs.order_by('academic_year_id', 'assessment'):
        out.append({
            'id': r.id,
            'academic_year': {'id': getattr(r, 'academic_year_id', None), 'name': getattr(getattr(r, 'academic_year', None), 'name', None)} if r.academic_year_id else None,
            'assessment': r.assessment,
            'is_open': bool(r.is_open),
            'updated_at': r.updated_at.isoformat() if r.updated_at else None,
            'updated_by': r.updated_by,
        })

    return Response({'results': out})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def global_publish_controls_bulk_set(request):
    """IQAC: set (create/update) global publish override for combinations of academic_year_ids and assessments.

    Body: { academic_year_ids: [1,2], assessments: ['ssa1'], is_open: true }
    """
    auth = _require_obe_master(request)
    if auth:
        return auth

    body = request.data or {}
    ay_ids = body.get('academic_year_ids') or []
    assessments = body.get('assessments') or []
    is_open = bool(body.get('is_open') if body.get('is_open') is not None else True)

    try:
        ay_ids = [int(a) for a in ay_ids]
    except Exception:
        ay_ids = []
    assessments = [str(a).strip().lower() for a in assessments if str(a).strip()]

    if not ay_ids or not assessments:
        return Response({'detail': 'academic_year_ids and assessments are required.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import ObeGlobalPublishControl
    updated = 0
    for ay in ay_ids:
        for a in assessments:
            obj, created = ObeGlobalPublishControl.objects.update_or_create(
                academic_year_id=ay,
                assessment=a,
                defaults={
                    'is_open': is_open,
                    'updated_by': getattr(request.user, 'id', None),
                },
            )
            updated += 1

    return Response({'status': 'ok', 'updated': updated})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def global_publish_controls_bulk_reset(request):
    """IQAC: remove global publish override rows to fall back to due dates.

    Body: { academic_year_ids: [1,2], assessments: ['ssa1'] }
    """
    auth = _require_obe_master(request)
    if auth:
        return auth

    body = request.data or {}
    ay_ids = body.get('academic_year_ids') or []
    assessments = body.get('assessments') or []

    try:
        ay_ids = [int(a) for a in ay_ids]
    except Exception:
        ay_ids = []
    assessments = [str(a).strip().lower() for a in assessments if str(a).strip()]

    if not ay_ids or not assessments:
        return Response({'detail': 'academic_year_ids and assessments are required.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import ObeGlobalPublishControl
    qs = ObeGlobalPublishControl.objects.filter(academic_year_id__in=ay_ids, assessment__in=assessments)
    deleted, _ = qs.delete()
    return Response({'status': 'ok', 'deleted': int(deleted)})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def publish_request_create(request):
    """Faculty: create a publish request after the due time is closed."""
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    body = request.data or {}
    assessment = str(body.get('assessment') or '').strip().lower()
    subject_code = str(body.get('subject_code') or body.get('subject_id') or '').strip()
    reason = str(body.get('reason') or '').strip()
    force = bool(body.get('force'))
    ta_id = None
    try:
        if body.get('teaching_assignment_id') is not None:
            ta_id = int(str(body.get('teaching_assignment_id')))
    except Exception:
        ta_id = None

    if assessment not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)
    if not subject_code:
        return Response({'detail': 'subject_code is required.'}, status=status.HTTP_400_BAD_REQUEST)

    info = _get_due_schedule_for_request(request, subject_code=subject_code, assessment=assessment, teaching_assignment_id=ta_id)
    if (not force) and info.get('publish_allowed') and info.get('allowed_by_due'):
        return Response({'detail': 'Publish is still open; request is not needed.'}, status=status.HTTP_400_BAD_REQUEST)

    academic_year = info.get('academic_year')
    if academic_year is None:
        return Response({'detail': 'Unable to resolve academic year for this subject.'}, status=status.HTTP_400_BAD_REQUEST)

    from .models import ObePublishRequest

    # If a pending request already exists, update reason and keep status pending.
    existing = ObePublishRequest.objects.filter(
        staff_user=request.user,
        academic_year=academic_year,
        subject_code=subject_code,
        assessment=assessment,
        status='PENDING',
    ).order_by('-created_at').first()

    if existing:
        existing.reason = reason
        existing.subject_name = existing.subject_name or (getattr(info.get('schedule'), 'subject_name', '') or '')
        existing.save(update_fields=['reason', 'subject_name', 'updated_at'])
        req = existing
    else:
        req = ObePublishRequest.objects.create(
            staff_user=request.user,
            academic_year=academic_year,
            subject_code=subject_code,
            subject_name=(getattr(info.get('schedule'), 'subject_name', '') or ''),
            assessment=assessment,
            reason=reason,
        )

    return Response(
        {
            'id': req.id,
            'status': req.status,
            'created_at': req.created_at.isoformat() if req.created_at else None,
        }
    )


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def publish_requests_pending(request):
    """IQAC: list pending publish requests."""
    auth = _require_obe_master(request)
    if auth:
        return auth

    from .models import ObePublishRequest

    qs = (
        ObePublishRequest.objects.select_related('staff_user', 'academic_year')
        .filter(status='PENDING')
        .order_by('-created_at')
    )

    def staff_name(u):
        if not u:
            return None
        try:
            full = ' '.join([str(getattr(u, 'first_name', '') or '').strip(), str(getattr(u, 'last_name', '') or '').strip()]).strip()
            return full or getattr(u, 'username', None)
        except Exception:
            return getattr(u, 'username', None)

    out = []
    for r in qs:
        u = getattr(r, 'staff_user', None)
        out.append(
            {
                'id': r.id,
                'status': r.status,
                'assessment': r.assessment,
                'subject_code': r.subject_code,
                'subject_name': r.subject_name,
                'reason': r.reason,
                'requested_at': r.created_at.isoformat() if r.created_at else None,
                'academic_year': {
                    'id': r.academic_year_id,
                    'name': getattr(getattr(r, 'academic_year', None), 'name', None),
                }
                if r.academic_year_id
                else None,
                'staff': {
                    'id': getattr(u, 'id', None),
                    'username': getattr(u, 'username', None),
                    'name': staff_name(u),
                },
            }
        )

    return Response({'results': out})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def publish_requests_history(request):
    """IQAC: list reviewed publish requests (approved/rejected)."""
    auth = _require_obe_master(request)
    if auth:
        return auth

    from .models import ObePublishRequest

    qp = getattr(request, 'query_params', {}) if hasattr(request, 'query_params') else request.GET
    statuses_raw = str(qp.get('statuses') or '').strip()
    if statuses_raw:
        statuses = [s.strip().upper() for s in statuses_raw.split(',') if s.strip()]
    else:
        statuses = ['APPROVED', 'REJECTED']
    statuses = [s for s in statuses if s in {'APPROVED', 'REJECTED'}]
    if not statuses:
        statuses = ['APPROVED', 'REJECTED']

    try:
        limit = int(qp.get('limit') or 200)
    except Exception:
        limit = 200
    limit = max(1, min(500, limit))

    qs = (
        ObePublishRequest.objects.select_related('staff_user', 'academic_year', 'reviewed_by')
        .filter(status__in=statuses)
        .order_by('-updated_at')
    )[:limit]

    def user_name(u):
        if not u:
            return None
        try:
            full = ' '.join([
                str(getattr(u, 'first_name', '') or '').strip(),
                str(getattr(u, 'last_name', '') or '').strip(),
            ]).strip()
            return full or getattr(u, 'username', None)
        except Exception:
            return getattr(u, 'username', None)

    def staff_department(u):
        try:
            sp = getattr(u, 'staff_profile', None)
            if not sp:
                return None
            dept = None
            try:
                dept = sp.get_current_department()
            except Exception:
                dept = getattr(sp, 'department', None)
            return getattr(dept, 'name', None) if dept else None
        except Exception:
            return None

    out = []
    for r in qs:
        u = getattr(r, 'staff_user', None)
        reviewer = getattr(r, 'reviewed_by', None)
        out.append(
            {
                'id': r.id,
                'status': r.status,
                'assessment': r.assessment,
                'subject_code': r.subject_code,
                'subject_name': r.subject_name,
                'reason': r.reason,
                'requested_at': r.created_at.isoformat() if r.created_at else None,
                'academic_year': {
                    'id': r.academic_year_id,
                    'name': getattr(getattr(r, 'academic_year', None), 'name', None),
                }
                if r.academic_year_id
                else None,
                'staff': {
                    'id': getattr(u, 'id', None),
                    'username': getattr(u, 'username', None),
                    'name': user_name(u),
                    'department': staff_department(u),
                },
                'reviewed_by': {
                    'id': getattr(reviewer, 'id', None),
                    'username': getattr(reviewer, 'username', None),
                    'name': user_name(reviewer),
                }
                if reviewer
                else None,
                'reviewed_at': r.reviewed_at.isoformat() if getattr(r, 'reviewed_at', None) else None,
                'approved_until': r.approved_until.isoformat() if getattr(r, 'approved_until', None) else None,
            }
        )

    return Response({'results': out})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def publish_requests_pending_count(request):
    auth = _require_obe_master(request)
    if auth:
        return auth
    from .models import ObePublishRequest
    return Response({'pending': int(ObePublishRequest.objects.filter(status='PENDING').count())})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def publish_request_approve(request, req_id: int):
    auth = _require_obe_master(request)
    if auth:
        return auth

    from .models import ObePublishRequest
    row = ObePublishRequest.objects.filter(id=req_id).first()
    if not row:
        return Response({'detail': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)

    minutes = (request.data or {}).get('window_minutes')
    try:
        minutes_int = int(minutes) if minutes is not None else 120
    except Exception:
        minutes_int = 120

    row.mark_approved(request.user, window_minutes=minutes_int)
    row.save(update_fields=['status', 'approved_until', 'reviewed_by', 'reviewed_at', 'updated_at'])
    return Response({'status': 'approved', 'approved_until': row.approved_until.isoformat() if row.approved_until else None})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def publish_request_reject(request, req_id: int):
    auth = _require_obe_master(request)
    if auth:
        return auth

    from .models import ObePublishRequest
    row = ObePublishRequest.objects.filter(id=req_id).first()
    if not row:
        return Response({'detail': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)

    row.mark_rejected(request.user)
    row.save(update_fields=['status', 'approved_until', 'reviewed_by', 'reviewed_at', 'updated_at'])
    return Response({'status': 'rejected'})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def edit_request_create(request):
    """Faculty: create a scoped edit request after publishing."""
    staff_profile, err = _faculty_only(request)
    if err:
        return err

    body = request.data if isinstance(request.data, dict) else {}
    assessment = str(body.get('assessment') or '').strip().lower()
    subject_code = str(body.get('subject_code') or '').strip()
    reason = str(body.get('reason') or '').strip()
    scope_raw = str(body.get('scope') or '').strip().upper()
    ta_id = None
    try:
        if body.get('teaching_assignment_id') is not None:
            ta_id = int(str(body.get('teaching_assignment_id')))
    except Exception:
        ta_id = None

    if assessment not in {'ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'}:
        return Response({'detail': 'Invalid assessment.'}, status=status.HTTP_400_BAD_REQUEST)
    if not subject_code:
        return Response({'detail': 'subject_code is required.'}, status=status.HTTP_400_BAD_REQUEST)

    if scope_raw in {'MARKS', 'MARKS_ENTRY', 'MARK_ENTRY', 'TABLE'}:
        scope = 'MARK_ENTRY'
    elif scope_raw in {'MARK_MANAGER', 'MANAGER'}:
        scope = 'MARK_MANAGER'
    else:
        return Response({'detail': 'scope is required (MARK_ENTRY or MARK_MANAGER).'}, status=status.HTTP_400_BAD_REQUEST)

    info = _get_due_schedule_for_request(request, subject_code=subject_code, assessment=assessment, teaching_assignment_id=ta_id)
    academic_year = info.get('academic_year')
    if academic_year is None:
        return Response({'detail': 'Unable to resolve academic year for this subject.'}, status=status.HTTP_400_BAD_REQUEST)

    ta = _resolve_staff_teaching_assignment(request, subject_code=subject_code, teaching_assignment_id=ta_id)
    section_name = _resolve_section_name_from_ta(ta)

    from .models import ObeEditRequest

    existing = ObeEditRequest.objects.filter(
        staff_user=request.user,
        academic_year=academic_year,
        subject_code=subject_code,
        assessment=assessment,
        scope=scope,
        status='PENDING',
    ).order_by('-created_at').first()

    if existing:
        existing.reason = reason
        existing.subject_name = existing.subject_name or (getattr(info.get('schedule'), 'subject_name', '') or '')
        if getattr(existing, 'teaching_assignment_id', None) is None and ta is not None:
            existing.teaching_assignment = ta
        if not getattr(existing, 'section_name', None) and section_name:
            existing.section_name = section_name
        existing.save(update_fields=['reason', 'subject_name', 'teaching_assignment', 'section_name', 'updated_at'])
        req = existing
    else:
        req = ObeEditRequest.objects.create(
            staff_user=request.user,
            academic_year=academic_year,
            subject_code=subject_code,
            subject_name=(getattr(info.get('schedule'), 'subject_name', '') or ''),
            assessment=assessment,
            scope=scope,
            reason=reason,
            teaching_assignment=ta,
            section_name=section_name,
        )

    return Response({'id': req.id, 'status': req.status, 'scope': req.scope, 'created_at': req.created_at.isoformat() if req.created_at else None})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def edit_requests_pending(request):
    """IQAC: list pending edit requests."""
    auth = _require_obe_master(request)
    if auth:
        return auth

    from .models import ObeEditRequest

    qp = getattr(request, 'query_params', {}) if hasattr(request, 'query_params') else request.GET
    scope_raw = str(qp.get('scope') or '').strip().upper()
    scope_filter = None
    if scope_raw in {'MARK_ENTRY', 'MARK_MANAGER'}:
        scope_filter = scope_raw

    qs = ObeEditRequest.objects.select_related('staff_user', 'academic_year').filter(status='PENDING')
    if scope_filter:
        qs = qs.filter(scope=scope_filter)
    qs = qs.order_by('-created_at')

    def staff_name(u):
        if not u:
            return None
        try:
            full = ' '.join([str(getattr(u, 'first_name', '') or '').strip(), str(getattr(u, 'last_name', '') or '').strip()]).strip()
            return full or getattr(u, 'username', None)
        except Exception:
            return getattr(u, 'username', None)

    out = []
    for r in qs:
        u = getattr(r, 'staff_user', None)
        out.append(
            {
                'id': r.id,
                'status': r.status,
                'assessment': r.assessment,
                'scope': r.scope,
                'subject_code': r.subject_code,
                'subject_name': r.subject_name,
                'reason': r.reason,
                'requested_at': r.created_at.isoformat() if r.created_at else None,
                'academic_year': {
                    'id': r.academic_year_id,
                    'name': getattr(getattr(r, 'academic_year', None), 'name', None),
                }
                if r.academic_year_id
                else None,
                'staff': {
                    'id': getattr(u, 'id', None),
                    'username': getattr(u, 'username', None),
                    'name': staff_name(u),
                },
            }
        )

    return Response({'results': out})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def edit_requests_history(request):
    """IQAC: list reviewed edit requests (approved/rejected)."""
    auth = _require_obe_master(request)
    if auth:
        return auth

    from .models import ObeEditRequest

    qp = getattr(request, 'query_params', {}) if hasattr(request, 'query_params') else request.GET
    statuses_raw = str(qp.get('statuses') or '').strip()
    if statuses_raw:
        statuses = [s.strip().upper() for s in statuses_raw.split(',') if s.strip()]
    else:
        statuses = ['APPROVED', 'REJECTED']
    statuses = [s for s in statuses if s in {'APPROVED', 'REJECTED'}]
    if not statuses:
        statuses = ['APPROVED', 'REJECTED']

    scope_raw = str(qp.get('scope') or '').strip().upper()
    scope_filter = None
    if scope_raw in {'MARK_ENTRY', 'MARK_MANAGER'}:
        scope_filter = scope_raw

    try:
        limit = int(qp.get('limit') or 200)
    except Exception:
        limit = 200
    limit = max(1, min(500, limit))

    qs = ObeEditRequest.objects.select_related('staff_user', 'academic_year', 'reviewed_by').filter(status__in=statuses)
    if scope_filter:
        qs = qs.filter(scope=scope_filter)
    qs = qs.order_by('-updated_at')[:limit]

    def user_name(u):
        if not u:
            return None
        try:
            full = ' '.join([
                str(getattr(u, 'first_name', '') or '').strip(),
                str(getattr(u, 'last_name', '') or '').strip(),
            ]).strip()
            return full or getattr(u, 'username', None)
        except Exception:
            return getattr(u, 'username', None)

    out = []
    for r in qs:
        u = getattr(r, 'staff_user', None)
        reviewer = getattr(r, 'reviewed_by', None)
        out.append(
            {
                'id': r.id,
                'status': r.status,
                'assessment': r.assessment,
                'scope': r.scope,
                'subject_code': r.subject_code,
                'subject_name': r.subject_name,
                'reason': r.reason,
                'requested_at': r.created_at.isoformat() if r.created_at else None,
                'academic_year': {
                    'id': r.academic_year_id,
                    'name': getattr(getattr(r, 'academic_year', None), 'name', None),
                }
                if r.academic_year_id
                else None,
                'staff': {
                    'id': getattr(u, 'id', None),
                    'username': getattr(u, 'username', None),
                    'name': user_name(u),
                },
                'reviewed_by': {
                    'id': getattr(reviewer, 'id', None),
                    'username': getattr(reviewer, 'username', None),
                    'name': user_name(reviewer),
                }
                if reviewer
                else None,
                'reviewed_at': r.reviewed_at.isoformat() if getattr(r, 'reviewed_at', None) else None,
                'approved_until': r.approved_until.isoformat() if getattr(r, 'approved_until', None) else None,
            }
        )

    return Response({'results': out})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def edit_requests_pending_count(request):
    auth = _require_obe_master(request)
    if auth:
        return auth
    from .models import ObeEditRequest
    qp = getattr(request, 'query_params', {}) if hasattr(request, 'query_params') else request.GET
    scope_raw = str(qp.get('scope') or '').strip().upper()
    qs = ObeEditRequest.objects.filter(status='PENDING')
    if scope_raw in {'MARK_ENTRY', 'MARK_MANAGER'}:
        qs = qs.filter(scope=scope_raw)
    return Response({'pending': int(qs.count())})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def edit_request_approve(request, req_id: int):
    auth = _require_obe_master(request)
    if auth:
        return auth

    from .models import ObeEditRequest
    row = ObeEditRequest.objects.filter(id=req_id).first()
    if not row:
        return Response({'detail': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)

    minutes = (request.data or {}).get('window_minutes')
    try:
        minutes_int = int(minutes) if minutes is not None else 120
    except Exception:
        minutes_int = 120

    row.mark_approved(request.user, window_minutes=minutes_int)
    row.save(update_fields=['status', 'approved_until', 'reviewed_by', 'reviewed_at', 'updated_at'])

    # SPECIAL course enabled-assessment selection edit requests are surfaced in the central OBE queue
    # as assessment='model' + scope='MARK_MANAGER' with a distinct reason. When IQAC approves here,
    # also approve the underlying SPECIAL selection edit request so faculty can edit the "Select Exams" panel.
    try:
        assessment_key = str(getattr(row, 'assessment', '') or '').strip().lower()
        scope_key = str(getattr(row, 'scope', '') or '').strip().upper()
        reason_txt = str(getattr(row, 'reason', '') or '')
        is_special_selection_req = (
            assessment_key == 'model'
            and scope_key == 'MARK_MANAGER'
            and 'enabled assessments (special course global selection)' in reason_txt.lower()
        )
    except Exception:
        is_special_selection_req = False

    if is_special_selection_req:
        try:
            from academics.models import SpecialCourseAssessmentEditRequest
            from django.db.models import Q

            staff_profile = getattr(getattr(row, 'staff_user', None), 'staff_profile', None)
            academic_year = getattr(row, 'academic_year', None)
            subject_code = str(getattr(row, 'subject_code', '') or '').strip()

            if staff_profile is not None and academic_year is not None and subject_code:
                latest = (
                    SpecialCourseAssessmentEditRequest.objects.filter(
                        requested_by=staff_profile,
                        selection__academic_year=academic_year,
                    )
                    .filter(
                        Q(selection__curriculum_row__course_code__iexact=subject_code)
                        | Q(selection__curriculum_row__master__course_code__iexact=subject_code)
                    )
                    .order_by('-requested_at')
                    .first()
                )
                if latest is not None:
                    latest.status = SpecialCourseAssessmentEditRequest.STATUS_APPROVED
                    latest.reviewed_by = request.user
                    latest.reviewed_at = timezone.now()
                    latest.used_at = None
                    latest.can_edit_until = getattr(row, 'approved_until', None)
                    latest.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'used_at', 'can_edit_until'])
        except Exception:
            # best-effort only
            pass

        # Do NOT update OBE mark-table locks for special-selection edit requests.
        return Response({'status': 'approved', 'scope': row.scope, 'approved_until': row.approved_until.isoformat() if row.approved_until else None})

    # Sync to authoritative lock row so the UI can use one source of truth.
    try:
        ta = getattr(row, 'teaching_assignment', None)
        academic_year = getattr(row, 'academic_year', None)
        section_name = str(getattr(row, 'section_name', '') or '').strip() or _resolve_section_name_from_ta(ta)

        lock = _upsert_mark_table_lock(
            staff_user=getattr(row, 'staff_user', None),
            subject_code=str(getattr(row, 'subject_code', '') or ''),
            subject_name=str(getattr(row, 'subject_name', '') or ''),
            assessment=str(getattr(row, 'assessment', '') or ''),
            teaching_assignment=ta,
            academic_year=academic_year,
            section_name=section_name,
            updated_by=getattr(getattr(request, 'user', None), 'id', None),
        )

        lock.is_published = True

        if str(getattr(row, 'scope', '')).upper() == 'MARK_ENTRY':
            lock.mark_entry_unblocked_until = getattr(row, 'approved_until', None)
        elif str(getattr(row, 'scope', '')).upper() == 'MARK_MANAGER':
            approved_until = getattr(row, 'approved_until', None)
            lock.mark_manager_unlocked_until = approved_until
            # New logic: when MARK_MANAGER is approved for edit, also unlock the marks table
            # from the published lock for the same window.
            lock.mark_entry_unblocked_until = approved_until
            lock.mark_manager_locked = False

        lock.recompute_blocks()
        lock.save(
            update_fields=[
                'is_published',
                'published_blocked',
                'mark_entry_blocked',
                'mark_manager_locked',
                'mark_entry_unblocked_until',
                'mark_manager_unlocked_until',
                'updated_by',
                'updated_at',
            ]
        )
    except OperationalError:
        pass

    return Response({'status': 'approved', 'scope': row.scope, 'approved_until': row.approved_until.isoformat() if row.approved_until else None})


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def edit_request_reject(request, req_id: int):
    auth = _require_obe_master(request)
    if auth:
        return auth

    from .models import ObeEditRequest
    row = ObeEditRequest.objects.filter(id=req_id).first()
    if not row:
        return Response({'detail': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)

    row.mark_rejected(request.user)
    row.save(update_fields=['status', 'approved_until', 'reviewed_by', 'reviewed_at', 'updated_at'])

    # Mirror rejection into SPECIAL-course enabled-assessment selection edit requests when they were
    # routed through the OBE edit-request queue.
    try:
        assessment_key = str(getattr(row, 'assessment', '') or '').strip().lower()
        scope_key = str(getattr(row, 'scope', '') or '').strip().upper()
        reason_txt = str(getattr(row, 'reason', '') or '')
        is_special_selection_req = (
            assessment_key == 'model'
            and scope_key == 'MARK_MANAGER'
            and 'enabled assessments (special course global selection)' in reason_txt.lower()
        )
    except Exception:
        is_special_selection_req = False

    if is_special_selection_req:
        try:
            from academics.models import SpecialCourseAssessmentEditRequest
            from django.db.models import Q

            staff_profile = getattr(getattr(row, 'staff_user', None), 'staff_profile', None)
            academic_year = getattr(row, 'academic_year', None)
            subject_code = str(getattr(row, 'subject_code', '') or '').strip()

            if staff_profile is not None and academic_year is not None and subject_code:
                latest = (
                    SpecialCourseAssessmentEditRequest.objects.filter(
                        requested_by=staff_profile,
                        selection__academic_year=academic_year,
                    )
                    .filter(
                        Q(selection__curriculum_row__course_code__iexact=subject_code)
                        | Q(selection__curriculum_row__master__course_code__iexact=subject_code)
                    )
                    .order_by('-requested_at')
                    .first()
                )
                if latest is not None:
                    latest.status = SpecialCourseAssessmentEditRequest.STATUS_REJECTED
                    latest.reviewed_by = request.user
                    latest.reviewed_at = timezone.now()
                    latest.used_at = None
                    latest.can_edit_until = None
                    latest.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'used_at', 'can_edit_until'])
        except Exception:
            pass

    return Response({'status': 'rejected', 'scope': row.scope})
