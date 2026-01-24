"""Resolve the concrete User who should act for an ApprovalStep.

This module maps a semantic ApprovalStep.role to a concrete staff `User`
via the academics authority resolvers. It is read-only and deterministic.
"""
from typing import Optional

from django.contrib.auth import get_user_model

from applications import models as app_models
from academics.services import authority_resolver

User = get_user_model()


def resolve_current_approver(application: app_models.Application, approval_step: app_models.ApprovalStep) -> Optional[User]:
    """Return the `User` who is the approver for `approval_step` on `application`.

    - Uses `approval_step.role.name` as the semantic role code and delegates to
      `authority_resolver.resolve_approver` to map to a `StaffProfile`.
    - Returns `staff.user` when a staff mapping exists and the user is active.
    - Returns None when no concrete approver could be resolved.

    This function does not apply override rules; callers should separately
    consult `approval_engine.user_can_act` for override-based eligibility.
    """
    if application is None or approval_step is None:
        return None

    role = approval_step.role
    if not role or not getattr(role, 'name', None):
        return None

    role_code = role.name.strip().upper()

    # Use authority resolver to get a StaffProfile for the student on this application
    staff = authority_resolver.resolve_approver(role_code, application)
    if staff is None:
        return None

    user = getattr(staff, 'user', None)
    if user is None or not getattr(user, 'is_active', False):
        return None

    return user
