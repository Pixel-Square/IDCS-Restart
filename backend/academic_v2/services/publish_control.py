"""
Publish Control Service for Academic 2.1

Handles:
- Checking publish control settings
- Auto-publish on due date
- Edit request workflow
"""

from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model


PENDING_STATUSES = ('PENDING', 'HOD_PENDING', 'IQAC_PENDING')


def _user_display_name(user) -> str | None:
    if not user:
        return None
    try:
        name = str(getattr(user, 'get_full_name', lambda: '')() or '').strip()
    except Exception:
        name = ''
    if name:
        return name
    try:
        username = str(getattr(user, 'username', '') or '').strip()
        if username:
            return username
    except Exception:
        pass
    try:
        email = str(getattr(user, 'email', '') or '').strip()
        if email:
            return email
    except Exception:
        pass
    return str(user)


def _exam_department(exam_assignment):
    """Best-effort department resolution for HOD routing."""
    try:
        ta = exam_assignment.section.teaching_assignment
        acad_section = getattr(ta, 'section', None)
        if acad_section is None:
            return None

        managing = getattr(acad_section, 'managing_department', None)
        if managing is not None:
            return managing

        batch = getattr(acad_section, 'batch', None)
        if batch is None:
            return None

        eff = getattr(batch, 'effective_department', None)
        if eff is not None:
            return eff

        dept = getattr(batch, 'department', None)
        if dept is not None:
            return dept

        course = getattr(batch, 'course', None)
        if course is not None:
            return getattr(course, 'department', None)
    except Exception:
        return None
    return None


def _resolve_approver(exam_assignment, role: str):
    """Resolve a single approver user (display only) for the given role."""
    role_u = str(role or '').strip().upper()

    User = get_user_model()
    qs = User.objects.filter(roles__name__iexact=role_u)

    if role_u == 'HOD':
        dept = _exam_department(exam_assignment)
        if dept is not None:
            qs = qs.filter(staff_profile__department=dept)

    return qs.distinct().order_by('first_name', 'username', 'email').first()


def _normalize_workflow(workflow) -> list[str]:
    """Normalize approval_workflow into ordered role names like ['HOD','IQAC']."""
    roles: list[str] = []
    raw = workflow or []
    for item in raw:
        if isinstance(item, str):
            role = item
        elif isinstance(item, dict):
            role = item.get('role')
        else:
            role = None
        role_u = str(role or '').strip().upper()
        if role_u and role_u not in roles:
            roles.append(role_u)
    return roles


def _first_pending_status(workflow_roles: list[str]) -> str:
    if workflow_roles and workflow_roles[0] == 'HOD':
        return 'HOD_PENDING'
    if workflow_roles and workflow_roles[0] == 'IQAC':
        return 'IQAC_PENDING'
    return 'PENDING'


def _latest_pending_request(exam_assignment):
    try:
        return (
            exam_assignment.edit_requests
            .filter(status__in=PENDING_STATUSES)
            .order_by('-requested_at')
            .first()
        )
    except Exception:
        return None


def check_publish_control(exam_assignment) -> dict:
    """
    Check publish control settings for an exam assignment.
    
    Returns:
        {
            'is_editable': bool,
            'is_locked': bool,
            'publish_control_enabled': bool,
            'due_at': datetime or None,
            'time_remaining': timedelta or None,
            'is_past_due': bool,
            'has_pending_request': bool,
            'edit_window_until': datetime or None,
            'status': str,
        }
    """
    semester_config = exam_assignment.get_semester_config()
    workflow_roles = _normalize_workflow(getattr(semester_config, 'approval_workflow', None) if semester_config else None)
    
    result = {
        'is_editable': True,
        'is_locked': False,
        'publish_control_enabled': False,
        'due_at': None,
        'time_remaining': None,
        'is_past_due': False,
        'has_pending_request': exam_assignment.has_pending_edit_request,
        'edit_window_until': exam_assignment.edit_window_until,
        'edit_window_until_publish': bool(getattr(exam_assignment, 'edit_window_until_publish', False)),
        'status': exam_assignment.status,
        'seal_animation_enabled': False,
        'seal_watermark_enabled': False,
        'seal_image': None,
        'approval_workflow_roles': workflow_roles,
        'approval_workflow_assignees': [
            {
                'role': r,
                'user_id': str(u.id) if u else None,
                'user_name': _user_display_name(u),
            }
            for r in workflow_roles
            for u in [_resolve_approver(exam_assignment, r)]
        ],
        'pending_request': None,
    }
    
    if semester_config:
        result['publish_control_enabled'] = semester_config.publish_control_enabled
        result['due_at'] = semester_config.due_at
        result['seal_animation_enabled'] = bool(getattr(semester_config, 'seal_animation_enabled', False))
        result['seal_watermark_enabled'] = bool(getattr(semester_config, 'seal_watermark_enabled', False))
        try:
            if getattr(semester_config, 'seal_image', None):
                result['seal_image'] = semester_config.seal_image.url
        except Exception:
            result['seal_image'] = None
        
        if semester_config.due_at:
            now = timezone.now()
            if now > semester_config.due_at:
                result['is_past_due'] = True
                result['time_remaining'] = timedelta(0)
            else:
                result['time_remaining'] = semester_config.due_at - now
    
    # Determine editability
    result['is_editable'] = exam_assignment.is_editable()
    result['is_locked'] = not result['is_editable'] and result['status'] in ['PUBLISHED', 'LOCKED']

    # If publish control is disabled, edit requests are irrelevant.
    if not result.get('publish_control_enabled'):
        result['has_pending_request'] = False
        result['pending_request'] = None

    # Pending request details + expiry
    pending = _latest_pending_request(exam_assignment)
    if pending is not None:
        now = timezone.now()
        validity_hours = None
        try:
            validity_hours = int(getattr(semester_config, 'edit_request_validity_hours', None)) if semester_config else None
        except Exception:
            validity_hours = None
        if validity_hours is not None and validity_hours > 0 and pending.expires_at is None:
            try:
                pending.expires_at = pending.requested_at + timedelta(hours=validity_hours)
                pending.save(update_fields=['expires_at'])
            except Exception:
                pass

        # If expired, mark it and clear pending flag so faculty can request again
        try:
            if pending.expires_at and pending.expires_at <= now and pending.status in PENDING_STATUSES:
                pending.status = 'EXPIRED'
                pending.save(update_fields=['status'])
                if getattr(exam_assignment, 'has_pending_edit_request', False):
                    exam_assignment.has_pending_edit_request = False
                    exam_assignment.save(update_fields=['has_pending_edit_request'])
                result['has_pending_request'] = False
                pending = None
        except Exception:
            pass

    if pending is not None:
        now = timezone.now()
        expires_remaining_seconds = None
        try:
            if pending.expires_at:
                expires_remaining_seconds = max(0, int((pending.expires_at - now).total_seconds()))
        except Exception:
            expires_remaining_seconds = None

        result['pending_request'] = {
            'id': str(pending.id),
            'status': pending.status,
            'current_stage': int(getattr(pending, 'current_stage', 1) or 1),
            'requested_at': pending.requested_at.isoformat() if pending.requested_at else None,
            'expires_at': pending.expires_at.isoformat() if pending.expires_at else None,
            'expires_remaining_seconds': expires_remaining_seconds,
            'reason': pending.reason,
            'approval_history': pending.approval_history or [],
        }

        # Add next approver metadata for tracking UI
        required_role = None
        try:
            stage_index = max(0, int(getattr(pending, 'current_stage', 1) or 1) - 1)
            if workflow_roles and stage_index < len(workflow_roles):
                required_role = workflow_roles[stage_index]
        except Exception:
            required_role = None

        if not required_role:
            st = str(pending.status or '').upper()
            if st == 'HOD_PENDING':
                required_role = 'HOD'
            elif st == 'IQAC_PENDING':
                required_role = 'IQAC'

        next_user = _resolve_approver(exam_assignment, required_role) if required_role else None
        result['pending_request']['required_role'] = required_role
        result['pending_request']['next_approver'] = {
            'role': required_role,
            'user_id': str(next_user.id) if next_user else None,
            'user_name': _user_display_name(next_user),
        } if required_role else None
    
    return result


def process_auto_publish(semester_config) -> dict:
    """
    Auto-publish all unpublished exams for a semester when due date passes.
    
    Called by cron job or manually.
    
    Returns:
        {
            'success': bool,
            'published_count': int,
            'errors': list,
        }
    """
    from ..models import AcV2ExamAssignment, AcV2DraftMark, AcV2StudentMark
    from .mark_calculation import compute_section_internal_marks
    from academics.models import StudentProfile
    
    if not semester_config.auto_publish_on_due:
        return {'success': True, 'published_count': 0, 'errors': []}
    
    if not semester_config.due_at:
        return {'success': True, 'published_count': 0, 'errors': []}
    
    now = timezone.now()
    if now <= semester_config.due_at:
        return {'success': True, 'published_count': 0, 'errors': ['Due date not yet passed']}
    
    # Find all DRAFT exams in this semester
    draft_exams = AcV2ExamAssignment.objects.filter(
        section__course__semester=semester_config.semester,
        status='DRAFT'
    ).select_related('section__course')
    
    published_count = 0
    errors = []
    
    with transaction.atomic():
        for exam in draft_exams:
            try:
                draft_data = exam.draft_data if isinstance(exam.draft_data, dict) else {}
                marks_map = draft_data.get('marks', {}) if isinstance(draft_data.get('marks', {}), dict) else {}
                if not marks_map:
                    marks_map = {
                        str(dm.student_id): {
                            'mark': float(dm.total_mark) if dm.total_mark is not None else None,
                            'co_marks': dm.question_marks if isinstance(dm.question_marks, dict) else {},
                            'is_absent': bool(dm.is_absent),
                        }
                        for dm in AcV2DraftMark.objects.filter(exam_assignment=exam)
                    }
                    if marks_map:
                        draft_data['marks'] = marks_map

                # Copy draft to published
                exam.published_data = draft_data
                exam.published_at = now
                exam.status = 'PUBLISHED' if semester_config.publish_control_enabled else 'DRAFT'
                exam.edit_window_until = None
                exam.edit_window_until_publish = False
                exam.save(update_fields=['published_data', 'published_at', 'status', 'edit_window_until', 'edit_window_until_publish'])

                if marks_map:
                    student_ids = list(marks_map.keys())
                    student_map = {
                        str(sp.id): sp
                        for sp in StudentProfile.objects.filter(id__in=student_ids).select_related('user')
                    }
                    for sid, payload in marks_map.items():
                        sp = student_map.get(str(sid))
                        if not sp:
                            continue
                        co_marks = payload.get('co_marks', {}) if isinstance(payload, dict) else {}
                        if not isinstance(co_marks, dict):
                            co_marks = {}
                        mark_val = payload.get('mark') if isinstance(payload, dict) else None
                        try:
                            mark_val = float(mark_val) if mark_val not in (None, '') else None
                        except (TypeError, ValueError):
                            mark_val = None

                        sm, _ = AcV2StudentMark.objects.update_or_create(
                            exam_assignment=exam,
                            student=sp,
                            defaults={
                                'reg_no': sp.reg_no or '',
                                'student_name': str(sp.user) if sp.user else sp.reg_no or '',
                                'total_mark': mark_val,
                                'question_marks': co_marks,
                                'is_absent': bool(payload.get('is_absent', False)) if isinstance(payload, dict) else False,
                            },
                        )
                        # Keep CO columns in sync with raw question marks for DB/admin reports.
                        qp_pattern = exam.get_qp_pattern() or {}
                        sm.calculate_co_marks(qp_pattern)
                        if mark_val is None:
                            sm.calculate_total()
                        sm.save(update_fields=['co1_mark', 'co2_mark', 'co3_mark', 'co4_mark', 'co5_mark', 'co6_mark', 'total_mark'])
                try:
                    compute_section_internal_marks(exam.section)
                except Exception:
                    pass
                published_count += 1
            except Exception as e:
                errors.append(f"{exam.section.course.subject_code} - {exam.exam}: {str(e)}")
    
    return {
        'success': len(errors) == 0,
        'published_count': published_count,
        'errors': errors,
    }


def create_edit_request(exam_assignment, user, reason: str) -> dict:
    """
    Create an edit request for a published exam.
    
    Returns:
        {
            'success': bool,
            'request_id': str or None,
            'error': str or None,
        }
    """
    from ..models import AcV2EditRequest
    
    # Check if exam is published/locked
    if exam_assignment.status not in ['PUBLISHED', 'LOCKED']:
        return {
            'success': False,
            'request_id': None,
            'error': 'Exam is not published. Direct editing is allowed.',
        }
    
    # Check for existing pending request
    if exam_assignment.has_pending_edit_request:
        return {
            'success': False,
            'request_id': None,
            'error': 'An edit request is already pending for this exam.',
        }
    
    # Check semester config
    semester_config = exam_assignment.get_semester_config()
    if not semester_config or not semester_config.publish_control_enabled:
        return {
            'success': False,
            'request_id': None,
            'error': 'Publish control is disabled. Direct editing is allowed.',
        }
    
    workflow_roles = _normalize_workflow(getattr(semester_config, 'approval_workflow', None))
    validity_hours = None
    try:
        validity_hours = int(getattr(semester_config, 'edit_request_validity_hours', None))
    except Exception:
        validity_hours = None

    # Create request
    with transaction.atomic():
        now = timezone.now()
        request = AcV2EditRequest.objects.create(
            exam_assignment=exam_assignment,
            requested_by=user,
            reason=reason,
            status=_first_pending_status(workflow_roles),
            current_stage=1,
            expires_at=(now + timedelta(hours=validity_hours)) if (validity_hours is not None and validity_hours > 0) else None,
        )
        
        exam_assignment.has_pending_edit_request = True
        exam_assignment.save(update_fields=['has_pending_edit_request'])
    
    return {
        'success': True,
        'request_id': str(request.id),
        'error': None,
    }


def get_approval_inbox(user, role: str) -> list:
    """
    Get pending edit requests for approval based on user's role.
    
    Args:
        user: User instance
        role: Role string (HOD, IQAC, ADMIN)
    
    Returns:
        List of edit requests awaiting this role's approval.
    """
    from ..models import AcV2EditRequest
    
    # Determine which status to filter
    status_map = {
        'HOD': 'HOD_PENDING',
        'IQAC': 'IQAC_PENDING',
        'ADMIN': 'PENDING',
    }
    
    target_status = status_map.get(role, 'PENDING')
    
    requests = AcV2EditRequest.objects.filter(
        status=target_status
    ).select_related(
        'exam_assignment__section__course',
        'requested_by'
    ).order_by('-requested_at')
    
    return list(requests)


# ─────────────────────────────────────────────────────────────────────────────
# CQI publish-control helpers
# ─────────────────────────────────────────────────────────────────────────────

def _cqi_latest_pending_request(cqi_attained):
    try:
        return (
            cqi_attained.edit_requests
            .filter(status__in=PENDING_STATUSES)
            .order_by('-requested_at')
            .first()
        )
    except Exception:
        return None


def _cqi_resolve_approver(cqi_attained, role: str):
    """Resolve approver user for a CQI context (HOD look-up by TA department)."""
    role_u = str(role or '').strip().upper()
    User = get_user_model()
    qs = User.objects.filter(roles__name__iexact=role_u)
    if role_u == 'HOD':
        try:
            ta = cqi_attained.teaching_assignment
            sec = ta.section  # AcademicSection
            dept = (
                getattr(sec, 'managing_department', None)
                or getattr(getattr(sec, 'batch', None), 'effective_department', None)
                or getattr(getattr(sec, 'batch', None), 'department', None)
            )
            if dept is not None:
                qs = qs.filter(staff_profile__department=dept)
        except Exception:
            pass
    return qs.distinct().order_by('first_name', 'username', 'email').first()


def _build_cqi_pending_request_payload(pending, workflow_roles, cqi_attained):
    """Return serialisable dict describing a CQI pending request."""
    now = timezone.now()
    expires_remaining_seconds = None
    try:
        if pending.expires_at:
            expires_remaining_seconds = max(0, int((pending.expires_at - now).total_seconds()))
    except Exception:
        pass

    # Requester display info
    requester = pending.requested_by
    try:
        req_name = requester.get_full_name() or requester.username or ''
    except Exception:
        req_name = str(requester)
    try:
        req_username = requester.username or ''
    except Exception:
        req_username = ''
    try:
        req_staff_id = requester.staff_profile.employee_id or '' if hasattr(requester, 'staff_profile') else ''
    except Exception:
        req_staff_id = ''

    payload = {
        'id': str(pending.id),
        'status': pending.status,
        'current_stage': int(getattr(pending, 'current_stage', 1) or 1),
        'requested_at': pending.requested_at.isoformat() if pending.requested_at else None,
        'expires_at': pending.expires_at.isoformat() if pending.expires_at else None,
        'expires_remaining_seconds': expires_remaining_seconds,
        'reason': pending.reason,
        'approval_history': pending.approval_history or [],
        'requested_by_name': req_name,
        'requested_by_username': req_username,
        'requested_by_staff_id': req_staff_id,
    }

    # Required role + next approver
    required_role = None
    try:
        stage_index = max(0, int(getattr(pending, 'current_stage', 1) or 1) - 1)
        if workflow_roles and stage_index < len(workflow_roles):
            required_role = workflow_roles[stage_index]
    except Exception:
        pass
    if not required_role:
        st = str(pending.status or '').upper()
        if st == 'HOD_PENDING':
            required_role = 'HOD'
        elif st == 'IQAC_PENDING':
            required_role = 'IQAC'

    next_user = _cqi_resolve_approver(cqi_attained, required_role) if required_role else None
    payload['required_role'] = required_role
    payload['next_approver'] = {
        'role': required_role,
        'user_id': str(next_user.id) if next_user else None,
        'user_name': _user_display_name(next_user),
    } if required_role else None

    return payload


def check_cqi_publish_control(cqi_attained) -> dict:
    """Return publish-control info for a published CQI record.

    Shape mirrors the relevant parts of check_publish_control() for exams so
    the frontend can reuse the same modal/timer components.
    """
    semester_config = cqi_attained.get_semester_config()
    workflow_roles = _normalize_workflow(
        getattr(semester_config, 'approval_workflow', None) if semester_config else None
    )

    now = timezone.now()

    publish_control_enabled = bool(getattr(semester_config, 'publish_control_enabled', False)) if semester_config else False

    # Edit window: if approved window is active the faculty can freely re-publish.
    # When publish control is disabled, CQI should remain editable even after publish.
    edit_window_until = cqi_attained.edit_window_until
    has_edit_window = bool(edit_window_until and edit_window_until > now)
    is_editable = (True if not publish_control_enabled else has_edit_window)
    is_locked = (False if not publish_control_enabled else not has_edit_window)

    result = {
        'is_editable': is_editable,
        'is_locked': is_locked,
        'publish_control_enabled': publish_control_enabled,
        'due_at': None,
        'open_from': None,
        'is_past_due': False,
        'has_pending_request': bool(cqi_attained.has_pending_edit_request) if publish_control_enabled else False,
        'edit_window_until': edit_window_until.isoformat() if edit_window_until else None,
        'approval_workflow_roles': workflow_roles,
        'approval_workflow_assignees': [
            {
                'role': r,
                'user_id': str(u.id) if u else None,
                'user_name': _user_display_name(u),
            }
            for r in workflow_roles
            for u in [_cqi_resolve_approver(cqi_attained, r)]
        ],
        'pending_request': None,
    }

    if semester_config:
        result['due_at'] = semester_config.due_at.isoformat() if semester_config.due_at else None
        result['open_from'] = semester_config.open_from.isoformat() if semester_config.open_from else None
        if semester_config.due_at and now > semester_config.due_at:
            result['is_past_due'] = True

    # If publish control is disabled, edit requests are irrelevant.
    if not publish_control_enabled:
        result['has_pending_request'] = False
        result['pending_request'] = None
        return result

    # Handle pending request (check expiry, etc.)
    pending = _cqi_latest_pending_request(cqi_attained)
    if pending is not None:
        validity_hours = None
        try:
            validity_hours = int(getattr(semester_config, 'edit_request_validity_hours', None)) if semester_config else None
        except Exception:
            pass
        if validity_hours and validity_hours > 0 and pending.expires_at is None:
            try:
                pending.expires_at = pending.requested_at + timedelta(hours=validity_hours)
                pending.save(update_fields=['expires_at'])
            except Exception:
                pass
        # Expire stale pending requests
        try:
            if pending.expires_at and pending.expires_at <= now and pending.status in PENDING_STATUSES:
                pending.status = 'EXPIRED'
                pending.save(update_fields=['status'])
                if cqi_attained.has_pending_edit_request:
                    cqi_attained.has_pending_edit_request = False
                    cqi_attained.save(update_fields=['has_pending_edit_request'])
                result['has_pending_request'] = False
                pending = None
        except Exception:
            pass

    if pending is not None:
        result['pending_request'] = _build_cqi_pending_request_payload(
            pending, workflow_roles, cqi_attained
        )

    return result


def create_cqi_edit_request(cqi_attained, user, reason: str) -> dict:
    """Create an edit request for a published CQI snapshot."""
    from ..models import AcV2CqiEditRequest

    semester_config = cqi_attained.get_semester_config()
    if not semester_config or not getattr(semester_config, 'publish_control_enabled', False):
        return {'success': False, 'request_id': None, 'error': 'Publish control is disabled. Direct editing is allowed.'}

    now_ts = timezone.now()
    try:
        if cqi_attained.edit_window_until and cqi_attained.edit_window_until > now_ts:
            return {'success': False, 'request_id': None, 'error': 'An edit window is already open. Direct editing is allowed.'}
    except Exception:
        pass

    if cqi_attained.has_pending_edit_request:
        return {'success': False, 'request_id': None, 'error': 'An edit request is already pending.'}
    workflow_roles = _normalize_workflow(
        getattr(semester_config, 'approval_workflow', None) if semester_config else None
    )
    validity_hours = None
    try:
        validity_hours = int(getattr(semester_config, 'edit_request_validity_hours', None)) if semester_config else None
    except Exception:
        pass

    with transaction.atomic():
        req = AcV2CqiEditRequest.objects.create(
            cqi_attained=cqi_attained,
            requested_by=user,
            reason=reason,
            status=_first_pending_status(workflow_roles),
            current_stage=1,
            expires_at=(now_ts + timedelta(hours=validity_hours)) if (validity_hours and validity_hours > 0) else None,
        )
        cqi_attained.has_pending_edit_request = True
        cqi_attained.save(update_fields=['has_pending_edit_request'])

    return {'success': True, 'request_id': str(req.id), 'error': None}
