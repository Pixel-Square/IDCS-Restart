import logging
from typing import List

from applications import models as app_models
from django.conf import settings
from django.contrib.auth import get_user_model

from accounts.services.sms import send_whatsapp

logger = logging.getLogger(__name__)


_APPLICATION_WA_FOOTER = 'Thanks, IDCS Gate KRCT'


def _whatsapp_enabled() -> bool:
    return bool(getattr(settings, 'APPLICATION_WHATSAPP_NOTIFICATIONS_ENABLED', False))


def _frontend_application_link(application_id: int) -> str:
    base = str(getattr(settings, 'FRONTEND_URL', '') or '').strip().rstrip('/')
    if not base:
        return ''
    return f'{base}/applications/{application_id}'


def _display_name(user) -> str:
    if not user:
        return ''
    first = str(getattr(user, 'first_name', '') or '').strip()
    last = str(getattr(user, 'last_name', '') or '').strip()
    name = f'{first} {last}'.strip()
    return name or str(getattr(user, 'username', '') or str(user))


def _resolve_whatsapp_number_for_application_user(application: app_models.Application) -> str:
    try:
        if getattr(application, 'student_profile', None):
            n = str(getattr(application.student_profile, 'mobile_number', '') or '').strip()
            if n:
                return n
        if getattr(application, 'staff_profile', None):
            n = str(getattr(application.staff_profile, 'mobile_number', '') or '').strip()
            if n:
                return n
        user = getattr(application, 'applicant_user', None)
        n = str(getattr(user, 'mobile_no', '') or '').strip() if user else ''
        return n
    except Exception:
        return ''


def _resolve_whatsapp_number_for_user(user) -> str:
    if not user:
        return ''
    try:
        # Try staff/student profile first if present
        sp = getattr(user, 'student_profile', None)
        if sp is not None:
            n = str(getattr(sp, 'mobile_number', '') or '').strip()
            if n:
                return n
        st = getattr(user, 'staff_profile', None)
        if st is not None:
            n = str(getattr(st, 'mobile_number', '') or '').strip()
            if n:
                return n
    except Exception:
        pass
    return str(getattr(user, 'mobile_no', '') or '').strip()


def _send_whatsapp_safe(to_number: str, message: str, *, tag: str = ''):
    if not _whatsapp_enabled():
        return
    try:
        msg = str(message or '').strip()
        footer = str(_APPLICATION_WA_FOOTER or '').strip()
        if footer:
            # Avoid double-appending if callers already included it.
            if footer.lower() not in msg.lower():
                msg = f'{msg}\n\n{footer}'.strip()

        result = send_whatsapp(to_number, msg)
        if not getattr(result, 'ok', False):
            logger.info('whatsapp_send_failed tag=%s to=%s msg=%s', tag, to_number, getattr(result, 'message', ''))
    except Exception:
        logger.exception('whatsapp_send_exception tag=%s to=%s', tag, to_number)


def _format_application_header(application: app_models.Application) -> str:
    app_type = ''
    try:
        app_type = getattr(getattr(application, 'application_type', None), 'name', '') or ''
    except Exception:
        app_type = ''
    app_id = getattr(application, 'pk', None) or getattr(application, 'id', None) or ''
    return f'Application #{app_id}{(" – " + app_type) if app_type else ""}'


def _format_remarks(remarks: str) -> str:
    r = str(remarks or '').strip()
    if not r:
        return ''
    return f'\nRemarks: {r}'


def notify_whatsapp_application_submitted(application: app_models.Application, first_step=None):
    if not _whatsapp_enabled():
        return

    try:
        application = (
            app_models.Application.objects
            .select_related('application_type', 'applicant_user', 'student_profile', 'staff_profile', 'current_step__role')
            .get(pk=application.pk)
        )
    except Exception:
        pass

    app_id = getattr(application, 'pk', None) or getattr(application, 'id', None) or 0
    link = _frontend_application_link(int(app_id) if app_id else 0)
    header = _format_application_header(application)
    applicant_name = _display_name(getattr(application, 'applicant_user', None))

    step = first_step or getattr(application, 'current_step', None)
    step_role = ''
    try:
        step_role = getattr(getattr(step, 'role', None), 'name', '') or ''
    except Exception:
        step_role = ''

    # Applicant confirmation
    to_applicant = _resolve_whatsapp_number_for_application_user(application)
    if to_applicant:
        msg = (
            f'Hello {applicant_name},\n'
            f'Your application has been submitted successfully.\n'
            f'{header}\n'
            f'Status: Pending{(" at " + step_role) if step_role else ""}.\n'
            f'{("Track: " + link) if link else ""}'
        ).strip()
        _send_whatsapp_safe(to_applicant, msg, tag='application_submitted_applicant')

    # Approver notification
    target_user_ids = _target_user_ids_for_step(application, step)
    if target_user_ids:
        User = get_user_model()
        users = list(User.objects.filter(id__in=target_user_ids))
        for u in users:
            to = _resolve_whatsapp_number_for_user(u)
            if not to:
                continue
            msg = (
                f'Hello {_display_name(u)},\n'
                f'New application received for approval.\n'
                f'{header}\n'
                f'Applicant: {applicant_name}\n'
                f'Pending at: {step_role or "Your role"}\n'
                f'{("Open: " + link) if link else ""}'
            ).strip()
            _send_whatsapp_safe(to, msg, tag='application_submitted_approver')


def notify_whatsapp_step_action(
    application: app_models.Application,
    *,
    actor,
    approved_step=None,
    action: str,
    remarks: str = '',
    is_override: bool = False,
    next_step=None,
):
    """Send WhatsApp updates to applicant and (when applicable) next approver.

    action: 'APPROVE' or 'REJECT'
    """
    if not _whatsapp_enabled():
        return

    action_norm = str(action or '').strip().upper()
    if action_norm not in {'APPROVE', 'REJECT'}:
        return

    try:
        application = (
            app_models.Application.objects
            .select_related('application_type', 'applicant_user', 'student_profile', 'staff_profile', 'current_step__role')
            .get(pk=application.pk)
        )
    except Exception:
        pass

    app_id = getattr(application, 'pk', None) or getattr(application, 'id', None) or 0
    header = _format_application_header(application)
    link = _frontend_application_link(int(app_id) if app_id else 0)
    applicant_name = _display_name(getattr(application, 'applicant_user', None))
    actor_name = _display_name(actor)

    step_role = ''
    try:
        step_role = getattr(getattr(approved_step, 'role', None), 'name', '') or ''
    except Exception:
        step_role = ''

    next_role = ''
    try:
        next_role = getattr(getattr(next_step, 'role', None), 'name', '') or ''
    except Exception:
        next_role = ''

    override_line = f'\nMode: Override (by {actor_name})' if is_override else ''
    remarks_block = _format_remarks(remarks)

    # Applicant update
    to_applicant = _resolve_whatsapp_number_for_application_user(application)
    if to_applicant:
        if action_norm == 'REJECT':
            msg = (
                f'Hello {applicant_name},\n'
                f'Update on your application:\n'
                f'{header}\n'
                f'Status: Rejected{(" at " + step_role) if step_role else ""}.\n'
                f'By: {actor_name}'
                f'{override_line}'
                f'{remarks_block}\n'
                f'{("View: " + link) if link else ""}'
            ).strip()
        else:
            next_line = f'\nNext stage: {next_role}' if next_role else '\nNext stage: Final approval (completed)'
            msg = (
                f'Hello {applicant_name},\n'
                f'Update on your application:\n'
                f'{header}\n'
                f'Stage approved{(" (" + step_role + ")") if step_role else ""}.\n'
                f'By: {actor_name}'
                f'{override_line}'
                f'{remarks_block}'
                f'{next_line}\n'
                f'{("Track: " + link) if link else ""}'
            ).strip()

        _send_whatsapp_safe(to_applicant, msg, tag=f'application_{action_norm.lower()}_applicant')

    # Next approver heads-up (only on approve when a next step exists)
    if action_norm == 'APPROVE' and next_step is not None:
        target_user_ids = _target_user_ids_for_step(application, next_step)
        if target_user_ids:
            User = get_user_model()
            users = list(User.objects.filter(id__in=target_user_ids))
            for u in users:
                to = _resolve_whatsapp_number_for_user(u)
                if not to:
                    continue
                msg = (
                    f'Hello {_display_name(u)},\n'
                    f'Application is waiting for your approval.\n'
                    f'{header}\n'
                    f'Applicant: {applicant_name}\n'
                    f'Pending at: {next_role or "Your role"}\n'
                    f'{("Open: " + link) if link else ""}'
                ).strip()
                _send_whatsapp_safe(to, msg, tag='application_next_approver')


def _target_user_ids_for_step(application: app_models.Application, step) -> List[int]:
    """Resolve concrete approver user ids for a given step, if any."""
    if step is None:
        return []
    try:
        from applications.services import approver_resolver
    except Exception:
        return []

    try:
        resolved = approver_resolver.resolve_current_approver(application, step)
        if resolved is None:
            return []
        return [resolved.id]
    except Exception:
        return []


def _log(event: str, application: app_models.Application, target_user_ids: List[int], reason: str):
    payload = {
        'event': event,
        'application_id': getattr(application, 'pk', None) or getattr(application, 'id', None),
        'application_type': getattr(application.application_type, 'code', None),
        'current_state': application.current_state,
        'target_user_ids': target_user_ids,
        'reason': reason,
    }
    logger.info('%s', payload)


def notify_application_submitted(application: app_models.Application):
    """Notify that an application was submitted. Targets initial approver(s)."""
    step = getattr(application, 'current_step', None)
    target_user_ids = _target_user_ids_for_step(application, step)
    _log('application_submitted', application, target_user_ids, 'Application submitted by applicant')
    try:
        notify_whatsapp_application_submitted(application, first_step=step)
    except Exception:
        pass


def notify_application_approved_step(application: app_models.Application, step):
    """Notify that a step was approved; include next approver(s) as targets (if any).

    `step` is the step that was approved or the next step depending on caller semantics;
    we resolve target ids from `step`.
    """
    target_user_ids = _target_user_ids_for_step(application, step)
    _log('application_step_approved', application, target_user_ids, f'Step {getattr(step, "order", None)} approved')


def notify_application_final_approved(application: app_models.Application):
    """Notify that the application reached final APPROVED state."""
    _log('application_final_approved', application, [], 'Application fully approved')


def notify_application_rejected(application: app_models.Application):
    """Notify that the application was rejected."""
    _log('application_rejected', application, [], 'Application rejected')


def notify_application_auto_skipped(application: app_models.Application, skipped_step):
    """Notify that a step was auto-skipped due to approver unavailability."""
    target_user_ids = _target_user_ids_for_step(application, skipped_step)
    _log('application_step_auto_skipped', application, target_user_ids, f'Step {getattr(skipped_step, "order", None)} auto-skipped')


def notify_application_override(application: app_models.Application, actor):
    """Notify that an override action occurred (actor performed override)."""
    uid = getattr(actor, 'id', None)
    _log('application_override', application, [uid] if uid else [], f'Override by user {uid}')


def notify_application_escalation(application: app_models.Application, escalate_role):
    """Notify that an application step was escalated to a role."""
    role_id = getattr(escalate_role, 'id', None)
    reason = f'Escalation to role {getattr(escalate_role, "name", None)}'
    # We cannot resolve concrete users here reliably; include role id in target_user_ids for now.
    _log('application_escalated', application, [role_id] if role_id else [], reason)
