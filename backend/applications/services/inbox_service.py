"""Inbox service: list applications pending action for a user."""
from typing import List

from applications import models as app_models
from applications.services import approver_resolver
from applications.services import approval_engine


def get_pending_approvals_for_user(user):
    """Return a list of Application objects requiring `user`'s action.

    Strategy:
    - Start with applications in state IN_REVIEW with a non-null current_step.
    - Prefetch related student, section, and current_step.role to minimize DB hits.
    - For each candidate, attempt to resolve a concrete approver via
      `approver_resolver.resolve_current_approver`. If that resolves to a
      user, include the application only when it matches `user`.
    - If no concrete approver found, fall back to `approval_engine.user_can_act`
      which covers override roles and role-based eligibility.

    Returns a list of Applications sorted by newest first.
    """
    Application = app_models.Application

    qs = Application.objects.filter(
        current_state=Application.ApplicationState.IN_REVIEW,
    ).exclude(
        applicant_user_id=getattr(user, 'id', None),
    ).select_related(
        'application_type',
        'applicant_user',
        'student_profile__section__batch__course__department',
        'current_step__role',
        'current_step__stage',
    ).order_by('-created_at')

    pending_apps = []
    for app in qs.iterator():
        # Never show a user's own submissions as items to approve.
        if getattr(app, 'applicant_user_id', None) == getattr(user, 'id', None):
            continue

        current_step = approval_engine.get_current_approval_step(app)
        if current_step is None:
            continue

        # First try to resolve a concrete approver for the resolved current step
        resolved = approver_resolver.resolve_current_approver(app, current_step)
        if resolved is not None:
            if resolved.id == user.id:
                # Override the in-memory step so serialization shows the active-flow step.
                app.current_step = current_step
                pending_apps.append(app)
            continue

        # No concrete approver — check if user has override/role-based eligibility
        try:
            if approval_engine.user_can_act(app, user):
                app.current_step = current_step
                pending_apps.append(app)
        except Exception:
            # defensive: skip problematic applications
            continue

    return pending_apps
