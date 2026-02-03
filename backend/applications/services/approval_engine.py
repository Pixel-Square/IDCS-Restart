from typing import Optional

from django.db import transaction
from django.utils import timezone
from django.core.exceptions import PermissionDenied

from applications import models as app_models
from applications.services import application_state
from applications.services import notification_service


def _get_applicant_department(application):
    """Resolve a department for the applicant (staff or student).

    Preference order:
    - application.staff_profile.department
    - application.student_profile.section.semester.course.department
    - None
    """
    staff = getattr(application, 'staff_profile', None)
    if staff is not None and getattr(staff, 'department', None) is not None:
        return staff.department

    student = getattr(application, 'student_profile', None)
    try:
        if student is not None and student.section is not None:
            # sections are batch-wise; resolve course via section.batch
            return student.section.batch.course.department
    except Exception:
        # Defensive: if relationship missing, fall back to None
        return None

    return None


def _get_flow_for_application(application) -> Optional[app_models.ApprovalFlow]:
    """Return the best-matching ApprovalFlow for the application.

    Prefer department-specific flow, fallback to global (department is NULL).
    """
    dept = _get_applicant_department(application)
    qs = app_models.ApprovalFlow.objects.filter(application_type=application.application_type, is_active=True)
    if dept is not None:
        flow = qs.filter(department=dept).first()
        if flow:
            return flow

    return qs.filter(department__isnull=True).first()


def get_current_approval_step(application) -> Optional[app_models.ApprovalStep]:
    """Return the current ApprovalStep for an application.

    If `application.current_step` is set it is returned. Otherwise the first
    step in the matching approval flow (ordered by `order`) is returned.
    Returns None if no flow or no steps exist.
    """
    if application.current_step_id:
        # Refresh from DB to ensure up-to-date instance
        return app_models.ApprovalStep.objects.filter(pk=application.current_step_id).first()

    flow = _get_flow_for_application(application)
    if not flow:
        return None

    return flow.steps.order_by('order').first()


def get_next_approval_step(application, current_step: Optional[app_models.ApprovalStep]) -> Optional[app_models.ApprovalStep]:
    """Return the next approval step after `current_step` for the application's flow.

    If `current_step` is None, returns the first step.
    Returns None when no further steps exist.
    """
    flow = _get_flow_for_application(application)
    if not flow:
        return None

    qs = flow.steps.order_by('order')
    if current_step is None:
        return qs.first()

    return qs.filter(order__gt=current_step.order).first()


def is_approver_available(role, application) -> bool:
    """Stub to check approver availability.

    Currently returns True for all roles. Replace with real availability
    checks (on-leave, inactive etc.) in business logic later.
    """
    return True


def _user_roles(user):
    # Using the `roles` m2m on user
    return list(user.roles.all())


def _user_has_override(user, application) -> bool:
    """Return True if the user may override the approval flow for this application.

    This checks two configurable mechanisms (no hardcoded role names):
    - If any of the user's roles are present in the ApprovalFlow.override_roles M2M.
    - If any RoleApplicationPermission exists for the user's role + application_type
      with `can_override_flow` or `can_edit_all` set.
    """
    flow = _get_flow_for_application(application)
    if not flow:
        return False

    user_roles = _user_roles(user)
    if not user_roles:
        return False

    # Flow-level overrides
    override_roles = set(flow.override_roles.all())
    if any(r in override_roles for r in user_roles):
        return True

    # RoleApplicationPermission checks
    perms = app_models.RoleApplicationPermission.objects.filter(
        application_type=application.application_type,
        role__in=user_roles
    )
    if perms.filter(can_override_flow=True).exists() or perms.filter(can_edit_all=True).exists():
        return True

    return False


def user_can_act(application: app_models.Application, user) -> bool:
    """Return True if `user` is authorized to act (approve/reject) on `application`.

    This central helper encapsulates the minimal authorization rules used by
    views to identify pending approvals. It delegates to flow configuration
    and role-based permissions. It does NOT mutate state.
    """
    # Quick guard
    if user is None or not getattr(user, 'is_active', True):
        return False

    current_step = get_current_approval_step(application)
    # If user has override rights for this application -> can act
    if _user_has_override(user, application):
        return True

    if current_step is None:
        return False

    # User can act if any of their roles matches the current step role
    user_roles = _user_roles(user)
    if current_step.role in user_roles:
        return True

    # SLA escalation: if current step is overdue and user has the escalate role, allow action
    try:
        from applications.services import sla_engine
        if getattr(current_step, 'escalate_to_role', None) and sla_engine.is_step_overdue(application):
            if current_step.escalate_to_role in user_roles:
                return True
    except Exception:
        # defensive: ignore SLA errors
        pass

    return False


def auto_skip_unavailable_steps(application, start_step: Optional[app_models.ApprovalStep]) -> Optional[app_models.ApprovalStep]:
    """Advance from start_step until an available approver is found.

    Records SKIPPED ApprovalAction entries for steps that are auto-skipped.
    Returns the first available step or None if no steps remain.
    """
    flow = _get_flow_for_application(application)
    if not flow:
        return None

    steps_qs = flow.steps.order_by('order')

    # Start from the step after `start_step` (or from the first step if None)
    if start_step is None:
        iterator = steps_qs.iterator()
    else:
        iterator = steps_qs.filter(order__gt=start_step.order).iterator()

    for step in iterator:
        if is_approver_available(step.role, application):
            return step

        # If not available but allowed to auto-skip, record a SKIPPED action
        if step.auto_skip_if_unavailable:
            app_models.ApprovalAction.objects.create(
                application=application,
                step=step,
                acted_by=None,
                action=app_models.ApprovalAction.Action.SKIPPED,
                remarks='Auto-skipped: approver unavailable',
                acted_at=timezone.now(),
            )
            try:
                notification_service.notify_application_auto_skipped(application, step)
            except Exception:
                pass
            # Continue to next step
            continue
        else:
            # Approver unavailable and not auto-skippable — block the flow here
            return None

    return None


def process_approval(application: app_models.Application, user, action: str, remarks: Optional[str] = None) -> app_models.Application:
    """Process an approval action by `user` on `application`.

    action must be one of: "APPROVE" or "REJECT" (case-insensitive).

    Rules implemented:
    - Only the current approver (role) may approve, unless the user has an
      override permission (configurable via flow.override_roles or role perms).
    - A REJECT immediately marks the application REJECTED and stops the flow.
    - APPROVE records an ApprovalAction and moves the application to the next
      available step (auto-skipping unavailable approvers). If there are no
      further steps, the application is marked APPROVED.

    This function uses a DB transaction and locks the application row for update.
    """
    action_norm = action.strip().upper()
    if action_norm not in ('APPROVE', 'REJECT'):
        raise ValueError('action must be "APPROVE" or "REJECT"')

    with transaction.atomic():
        # Lock the application row to avoid races
        application = app_models.Application.objects.select_for_update().get(pk=application.pk)

        flow = _get_flow_for_application(application)
        if not flow:
            raise ValueError('No approval flow configured for this application')

        current_step = get_current_approval_step(application)

        user_is_override = _user_has_override(user, application)

        # If there's no current step but flow exists, set first step
        if current_step is None:
            current_step = flow.steps.order_by('order').first()

        # Permission check: either user matches current step role, or they may override
        allowed = False
        if current_step and current_step.role in _user_roles(user):
            allowed = True

        if user_is_override:
            allowed = True

        if not allowed:
            raise PermissionDenied('User is not authorized to take this action on the application')

        # Map action to ApprovalAction.Action values
        mapped_action = app_models.ApprovalAction.Action.APPROVED if action_norm == 'APPROVE' else app_models.ApprovalAction.Action.REJECTED

        # Defensive: prevent duplicate APPROVED entries for the same application+step.
        if mapped_action == app_models.ApprovalAction.Action.APPROVED:
            exists = app_models.ApprovalAction.objects.filter(
                application=application,
                step=current_step,
                action=app_models.ApprovalAction.Action.APPROVED
            ).exists()
            if exists:
                raise ValueError('This step has already been approved')

        # Record the approval action
        app_models.ApprovalAction.objects.create(
            application=application,
            step=current_step,
            acted_by=user,
            action=mapped_action,
            remarks=remarks or '',
        )

        # Notify override if applicable
        try:
            if user_is_override:
                notification_service.notify_application_override(application, user)
        except Exception:
            pass

        # Notify that this step was approved/rejected
        try:
            notification_service.notify_application_approved_step(application, current_step)
        except Exception:
            pass

        # If REJECT -> hard reject using application state service
        if mapped_action == app_models.ApprovalAction.Action.REJECTED:
            application_state.reject_application(application, rejected_by=user)
            try:
                notification_service.notify_application_rejected(application)
            except Exception:
                pass
            return app_models.Application.objects.get(pk=application.pk)

        # APPROVE -> advance
        next_step = get_next_approval_step(application, current_step)

        # Attempt to auto-skip unavailable steps
        next_available = auto_skip_unavailable_steps(application, current_step)
        # If auto-skip returns a step, use it; otherwise use next_step
        target_step = next_available or next_step

        if target_step is None:
            # No more steps — finalize as APPROVED using state service
            application_state.approve_application(application)
            try:
                notification_service.notify_application_final_approved(application)
            except Exception:
                pass
            return app_models.Application.objects.get(pk=application.pk)

        # Otherwise set current_step and ensure state is IN_REVIEW
        application_state.move_to_in_review(application, target_step)
        return app_models.Application.objects.get(pk=application.pk)
