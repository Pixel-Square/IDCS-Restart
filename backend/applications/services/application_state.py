"""Service layer for canonical application state transitions.

All transitions are atomic and validate allowed transitions. State is
authoritative and stored on `Application.current_state`. These helpers also
keep legacy `status` in sync for backward compatibility.
"""
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from applications import models as app_models
from applications.services import approval_engine
from applications.services import notification_service
from applications.services import form_validator


def _snapshot_schema_for_application_type(application_type: app_models.ApplicationType) -> app_models.ApplicationFormVersion:
    """Create a new ApplicationFormVersion snapshot from live ApplicationField rows.

    Deactivates any existing active version for the same application_type.
    """
    # Build schema from ApplicationField rows
    fields = []
    for f in app_models.ApplicationField.objects.filter(application_type=application_type).order_by('order'):
        fields.append({
            'field_key': f.field_key,
            'label': f.label,
            'field_type': f.field_type,
            'is_required': f.is_required,
            'meta': f.meta or {},
        })

    # Deactivate existing active
    app_models.ApplicationFormVersion.objects.filter(application_type=application_type, is_active=True).update(is_active=False)

    # Determine next version number
    last = app_models.ApplicationFormVersion.objects.filter(application_type=application_type).order_by('-version').first()
    next_version = 1 if last is None else last.version + 1

    fv = app_models.ApplicationFormVersion.objects.create(
        application_type=application_type,
        version=next_version,
        schema={'fields': fields},
        is_active=True,
    )
    return fv


def _save_state(application: app_models.Application, state: str, current_step=None, final_at=None):
    """Internal helper to persist state changes atomically and keep legacy status in sync."""
    fields = []
    application.current_state = state
    fields.append('current_state')
    # keep legacy status for compatibility
    application.status = state
    fields.append('status')
    if current_step is not None:
        application.current_step = current_step
        fields.append('current_step')
    if final_at is not None:
        application.final_decision_at = final_at
        fields.append('final_decision_at')
    application.save(update_fields=fields)


@transaction.atomic
def submit_application(application: app_models.Application, user):
    """Submit an application.

    - Only the applicant may submit.
    - Moves state from DRAFT -> SUBMITTED.
    """
    if application.applicant_user_id != getattr(user, 'id', None):
        raise ValidationError('Only applicant may submit the application')

    if application.current_state not in (app_models.Application.ApplicationState.DRAFT,):
        raise ValidationError('Application is not in a state that can be submitted')

    # Ensure a flow exists and set initial current_step if unset
    flow = approval_engine._get_flow_for_application(application)
    first_step = None
    if flow:
        first_step = flow.steps.order_by('order').first()
    # Snapshot or bind form version
    active_fv = app_models.ApplicationFormVersion.objects.filter(application_type=application.application_type, is_active=True).first()
    if active_fv is None:
        # Create snapshot from current ApplicationField definitions
        active_fv = _snapshot_schema_for_application_type(application.application_type)

    # Bind form_version to application
    application.form_version = active_fv
    application.save(update_fields=['form_version'])

    # Validate application data against bound form version
    try:
        # pass queryset of ApplicationData
        form_validator.validate_application_data(active_fv, application.data.select_related('field').all())
    except Exception as exc:
        raise

    _save_state(application, app_models.Application.ApplicationState.SUBMITTED, current_step=first_step)
    # notify initial approver(s)
    try:
        notification_service.notify_application_submitted(application)
    except Exception:
        # non-fatal: notifications must not break state transitions
        pass
    return application


@transaction.atomic
def move_to_in_review(application: app_models.Application, step: app_models.ApprovalStep):
    """Move application to IN_REVIEW and set the provided `step` as current.

    This function is idempotent: calling it multiple times with the same step
    is allowed.
    """
    if step is None:
        raise ValidationError('step is required to move to IN_REVIEW')

    # Validate that step belongs to the application's flow
    flow = approval_engine._get_flow_for_application(application)
    if not flow or step.approval_flow_id != flow.id:
        raise ValidationError('Step does not belong to application approval flow')

    # Allowed from SUBMITTED or IN_REVIEW
    if application.current_state not in (app_models.Application.ApplicationState.SUBMITTED, app_models.Application.ApplicationState.IN_REVIEW,):
        raise ValidationError('Application must be SUBMITTED to move to IN_REVIEW')

    _save_state(application, app_models.Application.ApplicationState.IN_REVIEW, current_step=step)
    return application


@transaction.atomic
def approve_application(application: app_models.Application):
    """Mark application as APPROVED (terminal).

    Allowed only from IN_REVIEW.
    """
    if application.current_state == app_models.Application.ApplicationState.APPROVED:
        return application

    if application.current_state != app_models.Application.ApplicationState.IN_REVIEW:
        raise ValidationError('Application must be IN_REVIEW to be approved')

    now = timezone.now()
    _save_state(application, app_models.Application.ApplicationState.APPROVED, current_step=None, final_at=now)
    return application


@transaction.atomic
def reject_application(application: app_models.Application, rejected_by):
    """Mark application as REJECTED (terminal).

    Allowed only from IN_REVIEW.
    """
    if application.current_state == app_models.Application.ApplicationState.REJECTED:
        return application

    if application.current_state != app_models.Application.ApplicationState.IN_REVIEW:
        raise ValidationError('Application must be IN_REVIEW to be rejected')

    now = timezone.now()
    _save_state(application, app_models.Application.ApplicationState.REJECTED, current_step=None, final_at=now)
    return application


@transaction.atomic
def cancel_application(application: app_models.Application, cancelled_by):
    """Cancel an application. Only the applicant may cancel.

    Can transition from any state to CANCELLED.
    """
    if application.applicant_user_id != getattr(cancelled_by, 'id', None):
        raise ValidationError('Only applicant can cancel the application')

    now = timezone.now()
    _save_state(application, app_models.Application.ApplicationState.CANCELLED, current_step=None, final_at=now)
    return application
