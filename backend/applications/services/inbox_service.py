"""Inbox service: list applications pending action for a user."""
from typing import List

from django.db.models import Prefetch

from applications import models as app_models
from applications.services import approver_resolver
from applications.services import approval_engine


def get_pending_approvals_for_user(user):
    """Return a QuerySet of Application objects requiring `user`'s action.

    Strategy:
    - Start with applications in state IN_REVIEW with a non-null current_step.
    - Prefetch related student, section, and current_step.role to minimize DB hits.
    - For each candidate, attempt to resolve a concrete approver via
      `approver_resolver.resolve_current_approver`. If that resolves to a
      user, include the application only when it matches `user`.
    - If no concrete approver found, fall back to `approval_engine.user_can_act`
      which covers override roles and role-based eligibility.

    Returns a QuerySet filtered by the selected application IDs.
    """
    Application = app_models.Application

    qs = Application.objects.filter(
        current_state=Application.ApplicationState.IN_REVIEW,
        current_step__isnull=False,
    ).select_related(
        'application_type',
        'applicant_user',
        'student_profile__section__semester__course__department',
        'current_step__role',
    )

    candidate_ids: List[int] = []
    for app in qs.iterator():
        # First try to resolve a concrete approver for this current_step
        resolved = approver_resolver.resolve_current_approver(app, app.current_step)
        if resolved is not None:
            if resolved.id == user.id:
                candidate_ids.append(app.id)
            continue

        # No concrete approver — check if user has override/role-based eligibility
        try:
            if approval_engine.user_can_act(app, user):
                candidate_ids.append(app.id)
        except Exception:
            # defensive: skip problematic applications
            continue

    if not candidate_ids:
        return Application.objects.none()

    return Application.objects.filter(id__in=candidate_ids).select_related(
        'application_type', 'applicant_user', 'student_profile__section__semester__course__department', 'current_step__role'
    ).order_by('-created_at')
