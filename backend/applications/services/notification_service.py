import logging
from typing import List

from applications import models as app_models

logger = logging.getLogger(__name__)


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
        'application_id': application.id,
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
