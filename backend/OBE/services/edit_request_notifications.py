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

    # IMPORTANT: The Profile page stores the verified mobile on academics.StaffProfile.mobile_number.
    # Prefer that first so HOD/IQAC numbers come from their profile mobile.
    candidates = []

    staff_profile = getattr(user, 'staff_profile', None)
    if staff_profile is not None:
        candidates.extend(
            [
                getattr(staff_profile, 'mobile_number', None),
                getattr(staff_profile, 'whatsapp_number', None),
                getattr(staff_profile, 'mobile_no', None),
                getattr(staff_profile, 'mobile', None),
                getattr(staff_profile, 'phone', None),
                getattr(staff_profile, 'phone_number', None),
                getattr(staff_profile, 'contact_number', None),
            ]
        )

    candidates.extend(
        [
            getattr(user, 'whatsapp_number', None),
            getattr(user, 'mobile_no', None),
            getattr(user, 'mobile', None),
            getattr(user, 'phone', None),
            getattr(user, 'phone_number', None),
            getattr(user, 'contact_number', None),
        ]
    )

    candidates.append(getattr(user, 'username', None))

    for c in candidates:
        n = _normalize_whatsapp_number(str(c or ''))
        if n:
            return n
    return ''


def _display_name(user) -> str:
    """Return a human-readable name for a user object."""
    if user is None:
        return ''
    first = str(getattr(user, 'first_name', '') or '').strip()
    last = str(getattr(user, 'last_name', '') or '').strip()
    full = ' '.join(filter(None, [first, last]))
    if full:
        return full
    # fall back to staff profile name
    sp = getattr(user, 'staff_profile', None)
    if sp is not None:
        sp_name = str(getattr(sp, 'name', '') or getattr(sp, 'full_name', '') or '').strip()
        if sp_name:
            return sp_name
    return str(getattr(user, 'username', '') or '').strip()


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


def _build_created_message(edit_request, routed_to: str, department: dict | None = None, hod_name: str | None = None, routing_warning: str | None = None) -> str:
    subject_code = str(getattr(edit_request, 'subject_code', '') or '').strip() or '-'
    subject_name = str(getattr(edit_request, 'subject_name', '') or '').strip() or '-'
    assessment = str(getattr(edit_request, 'assessment', '') or '').strip().upper() or '-'
    scope = str(getattr(edit_request, 'scope', '') or '').strip().replace('_', ' ').title() or '-'

    if routed_to == 'HOD':
        dept_txt = '-'
        if isinstance(department, dict):
            dept_txt = str(department.get('short_name') or department.get('name') or department.get('code') or '-').strip()
        elif department is not None:
            dept_txt = str(getattr(department, 'short_name', '') or getattr(department, 'name', '') or getattr(department, 'code', '') or '-').strip()

        hod_txt = str(hod_name or '-')
        return (
            f'OBE Notice: Edit request created.\n'
            f'Request ID: {getattr(edit_request, "id", "-")}\n'
            f'Subject: {subject_code} - {subject_name}\n'
            f'Assessment: {assessment}\n'
            f'Scope: {scope}\n'
            f'Sent to: {dept_txt} HOD, {hod_txt}\n'
            'Please wait for HOD approval.'
        )

    # Default / routed to IQAC
    note = f"Note: {routing_warning}" if routing_warning else ''
    return (
        f'OBE Notice: Edit request created.\n'
        f'Request ID: {getattr(edit_request, "id", "-")}\n'
        f'Subject: {subject_code} - {subject_name}\n'
        f'Assessment: {assessment}\n'
        f'Scope: {scope}\n'
        f'Sent to: IQAC\n'
        f'{note}'
    )


def _build_approver_message(edit_request, staff_name: str, routed_to: str, dept_name: str = '') -> str:
    """Build a WhatsApp message addressed to the HOD or IQAC approver."""
    subject_code = str(getattr(edit_request, 'subject_code', '') or '').strip() or '-'
    subject_name = str(getattr(edit_request, 'subject_name', '') or '').strip() or '-'
    assessment = str(getattr(edit_request, 'assessment', '') or '').strip().upper() or '-'
    scope = str(getattr(edit_request, 'scope', '') or '').strip().replace('_', ' ').title() or '-'
    reason = str(getattr(edit_request, 'reason', '') or '').strip() or '-'
    req_id = getattr(edit_request, 'id', '-')
    staff_txt = str(staff_name or '-')

    if routed_to == 'HOD':
        return (
            f'OBE: New edit request pending your approval.\n'
            f'Request ID: {req_id}\n'
            f'Staff: {staff_txt}\n'
            f'Subject: {subject_code} - {subject_name}\n'
            f'Assessment: {assessment}\n'
            f'Scope: {scope}\n'
            f'Reason: {reason}\n'
            'Please review and approve/reject in the OBE portal.'
        )

    # IQAC
    dept_txt = str(dept_name or '-')
    return (
        f'OBE: New edit request routed to IQAC.\n'
        f'Request ID: {req_id}\n'
        f'Staff: {staff_txt}\n'
        f'Department: {dept_txt}\n'
        f'Subject: {subject_code} - {subject_name}\n'
        f'Assessment: {assessment}\n'
        f'Scope: {scope}\n'
        f'Reason: {reason}\n'
        'Please review and approve/reject in the OBE portal.'
    )


def _get_iqac_users():
    """Return a queryset of active IQAC/HAA users."""
    try:
        from django.contrib.auth import get_user_model
        from django.db.models import Q
        User = get_user_model()
        # This project sometimes uses Django groups and sometimes uses the custom Role M2M.
        # Include both so notifications reach the real IQAC/HAA accounts.
        qs = (
            User.objects.filter(is_active=True)
            .filter(Q(groups__name__in=['IQAC', 'HAA']) | Q(roles__name__in=['IQAC', 'HAA']))
            .distinct()
        )
        return list(qs)
    except Exception:
        return []


def _send_whatsapp_to_user(user, message: str, edit_request=None) -> NotificationOutcome:
    """Resolve WhatsApp number for *user* and send *message* to them."""
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

    recipient = _resolve_staff_whatsapp_number(user)
    if not recipient:
        return NotificationOutcome(status=ObeEditNotificationLog.STATUS_SKIPPED, message=message, error='No WhatsApp number configured for user')

    payload = {'api_key': api_key, 'to': recipient, 'message': message}
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
        logger.exception('WhatsApp send failed for user=%s edit_request=%s', getattr(user, 'id', None), getattr(edit_request, 'id', None))
        return NotificationOutcome(
            status=ObeEditNotificationLog.STATUS_FAILED,
            recipient=recipient,
            message=message,
            error=str(exc),
        )


def notify_approver_of_new_request(edit_request, hod_user=None, routed_to: str = 'IQAC', department=None, staff_name: str = '') -> None:
    """Send WhatsApp to the HOD (or all IQAC users) when a new edit request is created.

    The mobile number is taken from the approver's profile (User.mobile_no /
    StaffProfile.mobile_number or similar fields).
    """
    try:
        dept_name = ''
        if department is not None:
            if isinstance(department, dict):
                dept_name = str(department.get('short_name') or department.get('name') or department.get('code') or '').strip()
            else:
                dept_name = str(
                    getattr(department, 'short_name', '') or
                    getattr(department, 'name', '') or
                    getattr(department, 'code', '') or ''
                ).strip()

        message = _build_approver_message(edit_request, staff_name=staff_name, routed_to=routed_to, dept_name=dept_name)

        if routed_to == 'HOD' and hod_user is not None:
            outcome = _send_whatsapp_to_user(hod_user, message, edit_request=edit_request)
            _log_notification(edit_request, ObeEditNotificationLog.CHANNEL_WHATSAPP, outcome)
        else:
            # Route to all active IQAC users
            iqac_users = _get_iqac_users()
            if not iqac_users:
                outcome = NotificationOutcome(
                    status=ObeEditNotificationLog.STATUS_SKIPPED,
                    message=message,
                    error='No IQAC users found',
                )
                _log_notification(edit_request, ObeEditNotificationLog.CHANNEL_WHATSAPP, outcome)
            else:
                for iqac_user in iqac_users:
                    outcome = _send_whatsapp_to_user(iqac_user, message, edit_request=edit_request)
                    _log_notification(edit_request, ObeEditNotificationLog.CHANNEL_WHATSAPP, outcome)
    except Exception:
        logger.exception('notify_approver_of_new_request failed for edit_request=%s', getattr(edit_request, 'id', None))


def notify_edit_request_created(edit_request, routed_to: str, department: dict | None = None, hod_name: str | None = None, routing_warning: str | None = None) -> None:
    """Send notifications when an edit-request is created/routed.

    This will send both email and WhatsApp (subject to settings) and persist logs.
    """
    try:
        message = _build_created_message(edit_request, routed_to, department=department, hod_name=hod_name, routing_warning=routing_warning)

        email_outcome = _send_email(edit_request, message)
        _log_notification(edit_request, ObeEditNotificationLog.CHANNEL_EMAIL, email_outcome)

        whatsapp_outcome = _send_whatsapp(edit_request, message)
        _log_notification(edit_request, ObeEditNotificationLog.CHANNEL_WHATSAPP, whatsapp_outcome)
    except Exception:
        logger.exception('Failed to notify edit_request created for edit_request=%s', getattr(edit_request, 'id', None))
