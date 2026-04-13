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
    
    result = {
        'is_editable': True,
        'is_locked': False,
        'publish_control_enabled': False,
        'due_at': None,
        'time_remaining': None,
        'is_past_due': False,
        'has_pending_request': exam_assignment.has_pending_edit_request,
        'edit_window_until': exam_assignment.edit_window_until,
        'status': exam_assignment.status,
    }
    
    if semester_config:
        result['publish_control_enabled'] = semester_config.publish_control_enabled
        result['due_at'] = semester_config.due_at
        
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
    from .models import AcV2ExamAssignment
    
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
                # Copy draft to published
                exam.published_data = exam.draft_data
                exam.published_at = now
                exam.status = 'PUBLISHED' if semester_config.publish_control_enabled else 'DRAFT'
                exam.save(update_fields=['published_data', 'published_at', 'status'])
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
    from .models import AcV2EditRequest
    
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
    
    # Create request
    with transaction.atomic():
        request = AcV2EditRequest.objects.create(
            exam_assignment=exam_assignment,
            requested_by=user,
            reason=reason,
            status='PENDING',
            current_stage=1,
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
    from .models import AcV2EditRequest
    
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
