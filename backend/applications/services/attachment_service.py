from typing import List

from django.db.models import QuerySet

from applications import models as app_models
from applications.services import approval_engine
from applications.services import access_control


def can_upload(application: app_models.Application, user) -> bool:
    # Attachments allowed only in DRAFT or IN_REVIEW
    if application.current_state not in (app_models.Application.ApplicationState.DRAFT, app_models.Application.ApplicationState.IN_REVIEW):
        return False

    # Applicant can upload
    if application.applicant_user_id == getattr(user, 'id', None):
        return True

    # Allow override roles (configurable) to upload optionally
    try:
        if approval_engine._user_has_override(user, application):
            return True
    except Exception:
        pass

    return False


def can_delete(application: app_models.Application, user) -> bool:
    # Same rules: only in DRAFT or IN_REVIEW
    if application.current_state not in (app_models.Application.ApplicationState.DRAFT, app_models.Application.ApplicationState.IN_REVIEW):
        return False

    # Only applicant or override may delete
    if application.applicant_user_id == getattr(user, 'id', None):
        return True

    try:
        if approval_engine._user_has_override(user, application):
            return True
    except Exception:
        pass

    return False


def list_attachments(application: app_models.Application, user) -> QuerySet:
    # Viewing attachments: reuse access_control
    if not access_control.can_user_view_application(application, user):
        return app_models.ApplicationAttachment.objects.none()

    return application.attachments.filter(is_deleted=False).select_related('uploaded_by')
