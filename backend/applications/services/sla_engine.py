from datetime import timedelta
from typing import Optional
from django.utils import timezone

from applications import models as app_models
from applications.services import notification_service


def get_step_deadline(application: app_models.Application) -> Optional[timezone.datetime]:
    """Return the datetime when the current step's SLA deadline elapses, or None.

    Heuristic: use the latest ApprovalAction acted_at if present, else application.submitted_at,
    else application.created_at as the step start time.
    """
    step = getattr(application, 'current_step', None)
    if step is None or getattr(step, 'sla_hours', None) is None:
        return None

    # Determine start time
    latest_action = application.actions.order_by('-acted_at').first()
    if latest_action and latest_action.acted_at:
        start = latest_action.acted_at
    elif application.submitted_at:
        start = application.submitted_at
    else:
        start = application.created_at

    return start + timedelta(hours=step.sla_hours)


def is_step_overdue(application: app_models.Application) -> bool:
    deadline = get_step_deadline(application)
    if deadline is None:
        return False
    return timezone.now() > deadline


def escalate_overdue_application(application: app_models.Application) -> bool:
    """Idempotently escalate an overdue application's current step.

    Returns True if an escalation was triggered (notification sent), False otherwise.
    Behavior:
    - If current step has `sla_hours` and `escalate_to_role` and is overdue,
      send notification to escalation role (via notification_service.notify_application_escalation).
    - Do not auto-approve. Do not modify application state here.
    - Idempotent: calling multiple times will re-notify but will not change DB.
    """
    step = getattr(application, 'current_step', None)
    if step is None:
        return False

    if getattr(step, 'sla_hours', None) is None:
        return False

    if not is_step_overdue(application):
        return False

    escalate_role = getattr(step, 'escalate_to_role', None)
    if not escalate_role:
        return False

    # Notify escalation role
    try:
        notification_service.notify_application_escalation(application, escalate_role)
    except Exception:
        # Non-fatal
        pass

    return True
