import logging
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from django.conf import settings

try:
    from twilio.rest import Client  # type: ignore

    _TWILIO_AVAILABLE = True
except Exception:
    Client = None  # type: ignore
    _TWILIO_AVAILABLE = False

log = logging.getLogger(__name__)


@dataclass
class SmsSendResult:
    ok: bool
    message: str = ''


@dataclass
class OtpVerifyResult:
    approved: bool
    message: str = ''


def _normalize_whatsapp_number(raw: str) -> str:
    """Normalize into digits-only with country code (no leading '+').

    Matches the whatsapp-web.js microservice style used elsewhere in this repo.
    """
    s = str(raw or '').strip()
    if not s:
        return ''

    if s.startswith('+'):
        digits = re.sub(r'\D+', '', s[1:])
    else:
        digits = re.sub(r'\D+', '', s)
    if not digits:
        return ''

    default_cc = str(getattr(settings, 'OBE_WHATSAPP_DEFAULT_COUNTRY_CODE', '91') or '91').strip()
    default_cc = re.sub(r'\D+', '', default_cc) or '91'

    # Local formats
    if len(digits) == 10:
        digits = f'{default_cc}{digits}'
    elif len(digits) == 11 and digits.startswith('0'):
        digits = f'{default_cc}{digits[1:]}'

    if len(digits) < 11:
        return ''
    return digits


def _is_safe_local_whatsapp_endpoint(endpoint: str) -> bool:
    try:
        from urllib.parse import urlparse

        parsed = urlparse(str(endpoint or ''))
    except Exception:
        return False

    if parsed.scheme not in {'http', 'https'}:
        return False
    if parsed.username or parsed.password:
        return False

    host = (parsed.hostname or '').strip().lower()
    return host in {'127.0.0.1', 'localhost', '::1'}


def _normalize_url_template(url: str) -> str:
    return str(url or '').strip()


def send_sms(to_number: str, message: str) -> SmsSendResult:
    """Send SMS using a simple, configurable backend.

    Supported backends:
    - console (default): logs the SMS content to server logs.
    - http_get: calls SMS_GATEWAY_URL formatted with {to} and {message}.
    - twilio: uses Twilio Verify to send an OTP SMS (message content is ignored).
    - whatsapp: uses the existing local whatsapp-web.js microservice (message is sent as WhatsApp text).

    Configure:
            SMS_BACKEND=console|http_get|twilio|whatsapp
      SMS_GATEWAY_URL="https://.../?to={to}&message={message}"
            TWILIO_ACCOUNT_SID=ACxxxxxxxx
            TWILIO_AUTH_TOKEN=xxxxxxxx
            TWILIO_SERVICE_SID=VAxxxxxxxx
            OBE_WHATSAPP_API_URL="http://127.0.0.1:3000/send-whatsapp"
            OBE_WHATSAPP_API_KEY="..."
    """
    backend = str(getattr(settings, 'SMS_BACKEND', 'console') or 'console').strip().lower()

    to_number = str(to_number or '').strip()
    message = str(message or '').strip()

    if backend == 'console':
        log.warning('SMS(console) to=%s message=%s', to_number, message)
        return SmsSendResult(ok=True, message='Sent via console backend')

    if backend == 'http_get':
        url_tpl = _normalize_url_template(getattr(settings, 'SMS_GATEWAY_URL', ''))
        if not url_tpl:
            return SmsSendResult(ok=False, message='SMS_GATEWAY_URL is not configured')

        try:
            url = url_tpl.format(
                to=urllib.parse.quote_plus(to_number),
                message=urllib.parse.quote_plus(message),
            )
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read(1024)  # small read
                if 200 <= getattr(resp, 'status', 200) < 300:
                    return SmsSendResult(ok=True, message='Sent via http_get backend')
                return SmsSendResult(ok=False, message=f'Gateway HTTP {getattr(resp, "status", "?")}: {body!r}')
        except Exception as e:
            log.exception('SMS(http_get) failed')
            return SmsSendResult(ok=False, message=str(e))

    if backend == 'twilio':
        account_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', '').strip()
        auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', '').strip()
        service_sid = getattr(settings, 'TWILIO_SERVICE_SID', '').strip()

        if not all([account_sid, auth_token, service_sid]):
            return SmsSendResult(ok=False, message='Twilio credentials are not fully configured')

        if not _TWILIO_AVAILABLE:
            return SmsSendResult(ok=False, message='Twilio SDK is not installed (pip install twilio)')

        try:
            client = Client(account_sid, auth_token)  # type: ignore[misc]
            verification = client.verify.services(service_sid).verifications.create(
                to=to_number, channel='sms'
            )
            if verification.status in ['pending', 'approved']:
                return SmsSendResult(ok=True, message='Sent via Twilio')
            return SmsSendResult(ok=False, message=f'Twilio verification status: {verification.status}')
        except Exception as e:
            log.exception('SMS(Twilio) failed')
            return SmsSendResult(ok=False, message=str(e))

    if backend == 'whatsapp':
        endpoint = str(getattr(settings, 'OBE_WHATSAPP_API_URL', '') or '').strip()
        api_key = str(getattr(settings, 'OBE_WHATSAPP_API_KEY', '') or '').strip()
        if not endpoint or not api_key:
            return SmsSendResult(ok=False, message='WhatsApp API URL or API key not configured')

        allow_non_local = bool(getattr(settings, 'OBE_WHATSAPP_ALLOW_NON_LOCAL_URL', False))
        if not allow_non_local and not _is_safe_local_whatsapp_endpoint(endpoint):
            return SmsSendResult(ok=False, message='Unsafe WhatsApp API URL: only localhost/127.0.0.1 is allowed')

        recipient = _normalize_whatsapp_number(to_number)
        if not recipient:
            return SmsSendResult(ok=False, message='Invalid WhatsApp number')
        if not str(message or '').strip():
            return SmsSendResult(ok=False, message='Message is empty')

        payload = {
            'api_key': api_key,
            'to': recipient,
            'message': str(message).strip(),
        }

        try:
            import requests

            timeout = float(getattr(settings, 'OBE_WHATSAPP_TIMEOUT_SECONDS', 8.0) or 8.0)
            response = requests.post(endpoint, json=payload, timeout=timeout)
            if 200 <= int(getattr(response, 'status_code', 0) or 0) < 300:
                return SmsSendResult(ok=True, message='Sent via WhatsApp')
            return SmsSendResult(ok=False, message=f'WhatsApp HTTP {getattr(response, "status_code", "?")}: {response.text!r}')
        except Exception as e:
            log.exception('SMS(whatsapp) failed')
            return SmsSendResult(ok=False, message=str(e))

    return SmsSendResult(ok=False, message=f'Unsupported SMS_BACKEND: {backend}')


def verify_otp(to_number: str, code: str) -> OtpVerifyResult:
    """Verify an OTP for a mobile number.

    When SMS_BACKEND=twilio, this checks Twilio Verify for approval.
    For other backends, it returns not-approved (verification is handled locally).
    """
    backend = str(getattr(settings, 'SMS_BACKEND', 'console') or 'console').strip().lower()

    if backend != 'twilio':
        return OtpVerifyResult(approved=False, message='Non-twilio backend')

    account_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', '').strip()
    auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', '').strip()
    service_sid = getattr(settings, 'TWILIO_SERVICE_SID', '').strip()
    if not all([account_sid, auth_token, service_sid]):
        return OtpVerifyResult(approved=False, message='Twilio credentials are not fully configured')
    if not _TWILIO_AVAILABLE:
        return OtpVerifyResult(approved=False, message='Twilio SDK is not installed (pip install twilio)')

    try:
        client = Client(account_sid, auth_token)  # type: ignore[misc]
        check = client.verify.services(service_sid).verification_checks.create(to=to_number, code=code)
        return OtpVerifyResult(approved=(getattr(check, 'status', '') == 'approved'), message=str(getattr(check, 'status', '')))
    except Exception as e:
        log.exception('Twilio verify check failed')
        return OtpVerifyResult(approved=False, message=str(e))
