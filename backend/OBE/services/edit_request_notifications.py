import logging
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

from django.conf import settings
from django.core.mail import get_connection
from django.core.mail import send_mail
from django.utils import timezone

from OBE.models import ObeEditNotificationLog

logger = logging.getLogger(__name__)


@dataclass
class NotificationOutcome:
    status: str
    recipient: str = ''
    message: str = ''
    response_status_code: Optional[int] = None
    response_body: str = ''
    error: str = ''


def _truncate(value: str, limit: int = 2000) -> str:
    raw = str(value or '')
    return raw if len(raw) <= limit else (raw[: limit - 3] + '...')


def _resolve_staff_email(user) -> str:
    email = str(getattr(user, 'email', '') or '').strip()
    return email


def _normalize_whatsapp_number(raw: str) -> str:
    s = str(raw or '').strip()
    if not s:
        return ''
    if s.startswith('+'):
        digits = '+' + re.sub(r'\D+', '', s[1:])
    else:
        digits = re.sub(r'\D+', '', s)
    if digits.startswith('+'):
        digits_only = digits[1:]
    else:
        digits_only = digits

    if not digits_only:
        return ''

    default_cc = str(getattr(settings, 'OBE_WHATSAPP_DEFAULT_COUNTRY_CODE', '91') or '91').strip()
    default_cc = re.sub(r'\D+', '', default_cc)
    if not default_cc:
        default_cc = '91'

    # Common local format handling:
    # - 10 digits => assume local mobile number and prepend default country code
    # - 11 digits starting with 0 => drop trunk prefix and prepend default country code
    # - 12+ digits => assume country code already present
    if len(digits_only) == 10:
        digits_only = f'{default_cc}{digits_only}'
    elif len(digits_only) == 11 and digits_only.startswith('0'):
        digits_only = f'{default_cc}{digits_only[1:]}'

    if len(digits_only) < 11:
        return ''

    return digits_only


def _is_safe_local_whatsapp_endpoint(endpoint: str) -> bool:
    try:
        parsed = urlparse(endpoint)
    except Exception:
        return False

    if parsed.scheme not in {'http', 'https'}:
        return False
    if parsed.username or parsed.password:
        return False

    host = (parsed.hostname or '').strip().lower()
    if host in {'127.0.0.1', 'localhost', '::1'}:
        return True
    return False


def _resolve_staff_whatsapp_number(user) -> str:
    # Temporary override for faculty 3171009
    try:
        if str(getattr(user, 'staff_id', '')) == '3171009':
            return _normalize_whatsapp_number('+917695837343')
        staff_profile = getattr(user, 'staff_profile', None)
        if staff_profile and str(getattr(staff_profile, 'staff_id', '')) == '3171009':
            return _normalize_whatsapp_number('+917695837343')
    except Exception:
        pass

    candidates = [
        getattr(user, 'whatsapp_number', None),
        getattr(user, 'mobile_no', None),
        getattr(user, 'mobile', None),
        getattr(user, 'phone', None),
        getattr(user, 'phone_number', None),
        getattr(user, 'contact_number', None),
    ]

    staff_profile = getattr(user, 'staff_profile', None)
    if staff_profile is not None:
        candidates.extend(
            [
                getattr(staff_profile, 'whatsapp_number', None),
                getattr(staff_profile, 'mobile_no', None),
                getattr(staff_profile, 'mobile', None),
                getattr(staff_profile, 'phone', None),
                getattr(staff_profile, 'phone_number', None),
                getattr(staff_profile, 'contact_number', None),
            ]
        )

    candidates.append(getattr(user, 'username', None))

    for c in candidates:
        n = _normalize_whatsapp_number(str(c or ''))
        if n:
            return n
    return ''


def _build_notification_message(edit_request) -> str:
    subject_code = str(getattr(edit_request, 'subject_code', '') or '').strip() or '-'
    subject_name = str(getattr(edit_request, 'subject_name', '') or '').strip() or '-'
    assessment = str(getattr(edit_request, 'assessment', '') or '').strip().upper() or '-'
    scope = str(getattr(edit_request, 'scope', '') or '').strip().replace('_', ' ').title() or '-'
    approved_until = getattr(edit_request, 'approved_until', None)
    approved_until_text = timezone.localtime(approved_until).strftime('%Y-%m-%d %H:%M:%S %Z') if approved_until else '-'

    return (
        'IQAC Update: Your Request Edit has been approved.\n'
        f'Subject: {subject_code} - {subject_name}\n'
        f'Assessment: {assessment}\n'
        f'Scope: {scope}\n'
        f'Edit access until: {approved_until_text}\n'
        'Please complete the edits and republish before 24 hours.'
    )


def _log_notification(edit_request, channel: str, outcome: NotificationOutcome) -> None:
    try:
        ObeEditNotificationLog.objects.create(
            edit_request=edit_request,
            channel=channel,
            status=outcome.status,
            recipient=_truncate(outcome.recipient, 255),
            message=_truncate(outcome.message, 4000),
            response_status_code=outcome.response_status_code,
            response_body=_truncate(outcome.response_body, 4000),
            error=_truncate(outcome.error, 4000),
        )
    except Exception:
        logger.exception('Failed to persist notification log for edit_request=%s channel=%s', getattr(edit_request, 'id', None), channel)


def _send_email(edit_request, message: str) -> NotificationOutcome:
    enabled = bool(getattr(settings, 'OBE_EDIT_NOTIFICATION_EMAIL_ENABLED', True))
    if not enabled:
        return NotificationOutcome(status=ObeEditNotificationLog.STATUS_SKIPPED, message=message, error='Email notification disabled')

    to_email = _resolve_staff_email(getattr(edit_request, 'staff_user', None))
    if not to_email:
        return NotificationOutcome(status=ObeEditNotificationLog.STATUS_SKIPPED, message=message, error='No recipient email configured')

    mail_subject = f"[IQAC] Request Edit Approved - {str(getattr(edit_request, 'assessment', '') or '').upper()}"
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
    timeout = int(getattr(settings, 'OBE_NOTIFICATION_EMAIL_TIMEOUT', 10) or 10)

    try:
        connection = get_connection(timeout=timeout)
        sent_count = send_mail(
            subject=mail_subject,
            message=message,
            from_email=from_email,
            recipient_list=[to_email],
            fail_silently=False,
            connection=connection,
        )
        if int(sent_count or 0) <= 0:
            return NotificationOutcome(
                status=ObeEditNotificationLog.STATUS_FAILED,
                recipient=to_email,
                message=message,
                error='SMTP accepted request but no recipients were delivered',
            )
        return NotificationOutcome(
            status=ObeEditNotificationLog.STATUS_SUCCESS,
            recipient=to_email,
            message=message,
            response_status_code=200,
            response_body=f'smtp_timeout={timeout}',
        )
    except Exception as exc:
        logger.exception('Email notification failed for edit_request=%s', getattr(edit_request, 'id', None))
        return NotificationOutcome(
            status=ObeEditNotificationLog.STATUS_FAILED,
            recipient=to_email,
            message=message,
            error=str(exc),
        )


def _send_whatsapp(edit_request, message: str) -> NotificationOutcome:
    enabled = bool(getattr(settings, 'OBE_EDIT_NOTIFICATION_WHATSAPP_ENABLED', True))
    if not enabled:
        return NotificationOutcome(status=ObeEditNotificationLog.STATUS_SKIPPED, message=message, error='WhatsApp notification disabled')

    endpoint = str(getattr(settings, 'OBE_WHATSAPP_API_URL', '') or '').strip()
    api_key = str(getattr(settings, 'OBE_WHATSAPP_API_KEY', '') or '').strip()
    if not endpoint or not api_key:
        return NotificationOutcome(status=ObeEditNotificationLog.STATUS_SKIPPED, message=message, error='WhatsApp API URL or API key not configured')

    allow_non_local = bool(getattr(settings, 'OBE_WHATSAPP_ALLOW_NON_LOCAL_URL', False))
    if not allow_non_local and not _is_safe_local_whatsapp_endpoint(endpoint):
        return NotificationOutcome(
            status=ObeEditNotificationLog.STATUS_SKIPPED,
            message=message,
            error='Unsafe WhatsApp API URL: only localhost/127.0.0.1 is allowed',
        )

    recipient = _resolve_staff_whatsapp_number(getattr(edit_request, 'staff_user', None))
    if not recipient:
        return NotificationOutcome(status=ObeEditNotificationLog.STATUS_SKIPPED, message=message, error='No recipient WhatsApp number configured')

    payload = {
        'api_key': api_key,
        'to': recipient,
        'message': message,
    }

    try:
        import requests

        timeout = float(getattr(settings, 'OBE_WHATSAPP_TIMEOUT_SECONDS', 8.0) or 8.0)
        response = requests.post(endpoint, json=payload, timeout=timeout)
        body = response.text or ''
        if 200 <= response.status_code < 300:
            return NotificationOutcome(
                status=ObeEditNotificationLog.STATUS_SUCCESS,
                recipient=recipient,
                message=message,
                response_status_code=response.status_code,
                response_body=body,
            )
        return NotificationOutcome(
            status=ObeEditNotificationLog.STATUS_FAILED,
            recipient=recipient,
            message=message,
            response_status_code=response.status_code,
            response_body=body,
            error=f'Non-success status code: {response.status_code}',
        )
    except Exception as exc:
        logger.exception('WhatsApp notification failed for edit_request=%s', getattr(edit_request, 'id', None))
        return NotificationOutcome(
            status=ObeEditNotificationLog.STATUS_FAILED,
            recipient=recipient,
            message=message,
            error=str(exc),
        )


def notify_edit_request_approved(edit_request) -> None:
    message = _build_notification_message(edit_request)

    email_outcome = _send_email(edit_request, message)
    _log_notification(edit_request, ObeEditNotificationLog.CHANNEL_EMAIL, email_outcome)

    whatsapp_outcome = _send_whatsapp(edit_request, message)
    _log_notification(edit_request, ObeEditNotificationLog.CHANNEL_WHATSAPP, whatsapp_outcome)
