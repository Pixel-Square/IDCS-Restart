from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from .serializers import (
    UserSerializer, 
    RegisterSerializer, 
    MeSerializer, 
    IdentifierTokenObtainPairSerializer, 
    NotificationTemplateSerializer,
    UserQuerySerializer,
    UserQueryListSerializer,
)
from rest_framework_simplejwt.views import TokenObtainPairView
from django.utils import timezone
from datetime import timedelta
import re
import logging
from django.conf import settings
from urllib.parse import urlparse
import posixpath

from .models import MobileOtp, NotificationTemplate, UserQuery, Role
from .services.sms import send_sms, send_whatsapp, verify_otp
from .permissions_api import HasPermissionCode

log = logging.getLogger(__name__)

User = get_user_model()


class CustomTokenObtainPairView(TokenObtainPairView):
    # Uses identifier-based serializer (identifier may be email, student reg_no, or staff staff_id)
    serializer_class = IdentifierTokenObtainPairSerializer


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)


class MeView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        serializer = MeSerializer(request.user)
        return Response(serializer.data)


def _normalize_mobile_number(raw: str) -> str:
    """Normalize a user-entered mobile into a consistent E.164-like form.

    - Returns a string starting with '+' and digits only.
    - Accepts common Indian local formats and adds default country code.
    - Returns '' if invalid.

    NOTE: This is used for OTP send/verify and profile storage.
    """

    s = str(raw or '').strip()
    if not s:
        return ''

    # Strip everything to digits, then re-add '+' prefix.
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

    # Guard against accidental double country-code prefix (e.g. 9191XXXXXXXXXX)
    # caused by clients that prepend the default country code to an already-prefixed number.
    try:
        cc_len = len(default_cc)
        if cc_len and digits.startswith(default_cc + default_cc) and len(digits) == (cc_len * 2 + 10):
            digits = digits[cc_len:]
    except Exception:
        pass

    # E.164 sanity (country code + national number)
    if len(digits) < 11 or len(digits) > 15:
        return ''
    return f'+{digits}'


def _set_verified_mobile_on_profile(user, mobile_number: str, verified_at):
    """Persist verified mobile number on the attached student/staff profile."""
    if hasattr(user, 'student_profile') and getattr(user, 'student_profile') is not None:
        sp = user.student_profile
        sp.mobile_number = mobile_number
        sp.mobile_number_verified_at = verified_at
        sp.save(update_fields=['mobile_number', 'mobile_number_verified_at'])
        return
    if hasattr(user, 'staff_profile') and getattr(user, 'staff_profile') is not None:
        st = user.staff_profile
        st.mobile_number = mobile_number
        st.mobile_number_verified_at = verified_at
        st.save(update_fields=['mobile_number', 'mobile_number_verified_at'])
        return
    # If no profile, still allow storing on User


class MobileOtpRequestView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        raw_mobile = (request.data or {}).get('mobile_number')
        mobile = _normalize_mobile_number(raw_mobile)
        if not mobile:
            return Response({'detail': 'Invalid mobile number.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        cooldown_seconds = 30
        ttl_minutes = 5

        # Load configurable OTP template (IQAC-managed).
        template_text = 'Your OTP is {otp}. It is valid for {expiry} minutes.'
        try:
            tpl = NotificationTemplate.objects.filter(code='mobile_verify', enabled=True).first()
            if tpl and str(getattr(tpl, 'template', '') or '').strip():
                template_text = str(tpl.template)
            if tpl and getattr(tpl, 'expiry_minutes', None):
                ttl_minutes = int(tpl.expiry_minutes)
        except Exception:
            # Fall back to defaults.
            pass

        backend = str(getattr(settings, 'SMS_BACKEND', 'console') or 'console').strip().lower()

        last = (
            MobileOtp.objects.filter(user=request.user, purpose='VERIFY_MOBILE', mobile_number=mobile)
            .order_by('-created_at')
            .first()
        )
        if last and last.created_at and (now - last.created_at).total_seconds() < cooldown_seconds:
            retry_after = int(cooldown_seconds - (now - last.created_at).total_seconds())
            return Response(
                {'detail': 'Please wait before requesting another OTP.', 'retry_after_seconds': max(retry_after, 1)},
                status=429,
            )

        # For non-Twilio backends we generate a local OTP.
        # For Twilio Verify, Twilio generates/sends the OTP, but we still
        # create a row to enforce cooldown/attempt limits.
        code = MobileOtp.generate_code(6)
        otp = MobileOtp(
            user=request.user,
            purpose='VERIFY_MOBILE',
            mobile_number=mobile,
            expires_at=now + timedelta(minutes=ttl_minutes),
        )
        otp.set_code(code)
        otp.save()

        if backend == 'twilio':
            sms_message = ''
        else:
            full_name = ''
            try:
                full_name = str(getattr(request.user, 'get_full_name', lambda: '')() or '').strip()
            except Exception:
                full_name = ''
            ctx = {
                '{otp}': code,
                '{expiry}': str(ttl_minutes),
                '{mobile}': str(mobile),
                '{username}': str(getattr(request.user, 'username', '') or ''),
                '{name}': full_name or str(getattr(request.user, 'username', '') or ''),
            }
            sms_message = str(template_text)
            for k, v in ctx.items():
                sms_message = sms_message.replace(k, v)
        sms = send_sms(mobile, sms_message)
        if not sms.ok:
            # In production, hard-fail when OTP delivery fails.
            # In DEBUG, keep the OTP row and return the OTP for local testing,
            # because WhatsApp microservice may not be running/paired yet.
            if bool(getattr(settings, 'DEBUG', False)):
                detail = ''
                try:
                    detail = str(getattr(sms, 'message', '') or '')
                except Exception:
                    detail = ''

                return Response(
                    {
                        'ok': True,
                        'mobile_number': mobile,
                        'expires_in_seconds': ttl_minutes * 60,
                        'cooldown_seconds': cooldown_seconds,
                        'delivery_backend': backend,
                        'delivery_error': detail,
                        'debug_otp': code,
                    }
                )

            otp.delete()
            # surface delivery error (useful when WhatsApp client is not ready)
            detail = 'Failed to send OTP. Please try again.'
            try:
                if getattr(sms, 'message', None):
                    detail = f'{detail} ({sms.message})'
            except Exception:
                pass
            return Response({'detail': detail}, status=status.HTTP_502_BAD_GATEWAY)

        resp = {
            'ok': True,
            'mobile_number': mobile,
            'expires_in_seconds': ttl_minutes * 60,
            'cooldown_seconds': cooldown_seconds,
            'delivery_backend': backend,
        }

        # Developer ergonomics: when using console backend in DEBUG, include the OTP
        # in the response so local setups can complete verification without a real SMS gateway.
        try:
            if backend == 'console' and bool(getattr(settings, 'DEBUG', False)):
                resp['debug_otp'] = code
        except Exception:
            pass

        return Response(resp)


class NotificationTemplateApiView(APIView):
    """List/update notification templates. IQAC-only via notifications.manage."""

    permission_classes = (permissions.IsAuthenticated, HasPermissionCode)
    required_permission_code = 'notifications.manage'

    def get(self, request):
        qs = NotificationTemplate.objects.all().order_by('code')
        return Response({'templates': NotificationTemplateSerializer(qs, many=True).data})

    def put(self, request):
        payload = request.data or {}
        templates = payload.get('templates')
        if not isinstance(templates, list):
            return Response({'detail': 'templates must be a list'}, status=status.HTTP_400_BAD_REQUEST)

        updated = []
        for row in templates:
            if not isinstance(row, dict):
                continue
            code = str(row.get('code') or '').strip()
            if not code:
                continue
            obj, _ = NotificationTemplate.objects.get_or_create(
                code=code,
                defaults={'name': code, 'template': '', 'enabled': False},
            )

            # update allowed fields
            if 'name' in row:
                obj.name = str(row.get('name') or '').strip() or obj.name
            if 'template' in row:
                obj.template = str(row.get('template') or '')
            if 'enabled' in row:
                obj.enabled = bool(row.get('enabled'))
            if 'expiry_minutes' in row:
                exp = row.get('expiry_minutes')
                if exp in (None, ''):
                    obj.expiry_minutes = None
                else:
                    try:
                        obj.expiry_minutes = int(exp)
                    except Exception:
                        pass

            obj.save()
            updated.append(obj)

        return Response({'ok': True, 'templates': NotificationTemplateSerializer(updated, many=True).data})


class MobileOtpVerifyView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        raw_mobile = (request.data or {}).get('mobile_number')
        code = str((request.data or {}).get('otp') or '').strip()

        mobile = _normalize_mobile_number(raw_mobile)
        if not mobile:
            return Response({'detail': 'Invalid mobile number.'}, status=status.HTTP_400_BAD_REQUEST)
        if not code or not re.fullmatch(r'\d{4,8}', code):
            return Response({'detail': 'Invalid OTP.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        otp = (
            MobileOtp.objects.filter(
                user=request.user,
                purpose='VERIFY_MOBILE',
                mobile_number=mobile,
                verified_at__isnull=True,
            )
            .order_by('-created_at')
            .first()
        )
        if not otp:
            return Response({'detail': 'OTP not found. Please request a new OTP.'}, status=status.HTTP_400_BAD_REQUEST)
        if otp.attempts >= 5:
            return Response({'detail': 'Too many attempts. Please request a new OTP.'}, status=status.HTTP_400_BAD_REQUEST)

        backend = str(getattr(settings, 'SMS_BACKEND', 'console') or 'console').strip().lower()
        if backend != 'twilio' and otp.is_expired():
            return Response({'detail': 'OTP expired. Please request a new OTP.'}, status=status.HTTP_400_BAD_REQUEST)
        if backend == 'twilio':
            res = verify_otp(mobile, code)
            if not res.approved:
                otp.attempts = int(otp.attempts or 0) + 1
                otp.save(update_fields=['attempts'])
                return Response({'detail': 'Invalid or expired OTP.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            if not otp.check_code(code):
                otp.attempts = int(otp.attempts or 0) + 1
                otp.save(update_fields=['attempts'])
                return Response({'detail': 'Incorrect OTP.'}, status=status.HTTP_400_BAD_REQUEST)

        otp.verified_at = now
        otp.save(update_fields=['verified_at'])

        # Persist to profile (student/staff) and also mirror to User.mobile_no
        _set_verified_mobile_on_profile(request.user, mobile, now)
        try:
            request.user.mobile_no = mobile
            request.user.save(update_fields=['mobile_no'])
        except Exception:
            pass

        # Cleanup older OTP rows for this mobile
        try:
            MobileOtp.objects.filter(user=request.user, purpose='VERIFY_MOBILE', mobile_number=mobile).exclude(pk=otp.pk).delete()
        except Exception:
            pass

        # Best-effort WhatsApp confirmation message after verification.
        # This is independent of SMS_BACKEND so users who verify via SMS can still
        # receive a WhatsApp confirmation when the WhatsApp gateway is configured.
        whatsapp_confirmation = None
        try:
            template_text = (
                'IDCS: Your mobile number {mobile} has been verified successfully. '
                'You now have access to your Academic Panel and can manage your requests. Thank you.'
            )
            try:
                tpl = NotificationTemplate.objects.filter(code='mobile_verified', enabled=True).first()
                if tpl and str(getattr(tpl, 'template', '') or '').strip():
                    template_text = str(tpl.template)
            except Exception:
                pass

            full_name = ''
            try:
                full_name = str(getattr(request.user, 'get_full_name', lambda: '')() or '').strip()
            except Exception:
                full_name = ''

            ctx = {
                '{mobile}': str(mobile),
                '{username}': str(getattr(request.user, 'username', '') or ''),
                '{name}': full_name or str(getattr(request.user, 'username', '') or ''),
            }
            msg = str(template_text)
            for k, v in ctx.items():
                msg = msg.replace(k, v)

            outcome = send_whatsapp(mobile, msg)
            whatsapp_confirmation = {'ok': bool(outcome.ok), 'message': str(getattr(outcome, 'message', '') or '')}
            if not outcome.ok:
                log.warning('WhatsApp verify-confirmation not delivered: %s', whatsapp_confirmation.get('message'))
        except Exception:
            log.exception('Failed to send WhatsApp mobile-verified confirmation')

        # Return updated me payload for convenience
        serializer = MeSerializer(request.user)
        resp = {'ok': True, 'me': serializer.data}
        if whatsapp_confirmation is not None:
            resp['whatsapp_confirmation'] = whatsapp_confirmation
        return Response(resp)


class MobileRemoveView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        password = str((request.data or {}).get('password') or '').strip()
        if not password:
            return Response({'detail': 'Password is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Verify password
        if not request.user.check_password(password):
            return Response({'detail': 'Incorrect password.'}, status=status.HTTP_400_BAD_REQUEST)

        # Remove mobile from profile
        if hasattr(request.user, 'student_profile') and getattr(request.user, 'student_profile') is not None:
            sp = request.user.student_profile
            sp.mobile_number = ''
            sp.mobile_number_verified_at = None
            sp.save(update_fields=['mobile_number', 'mobile_number_verified_at'])
        elif hasattr(request.user, 'staff_profile') and getattr(request.user, 'staff_profile') is not None:
            st = request.user.staff_profile
            st.mobile_number = ''
            st.mobile_number_verified_at = None
            st.save(update_fields=['mobile_number', 'mobile_number_verified_at'])

        # Also clear from User.mobile_no if present
        try:
            request.user.mobile_no = ''
            request.user.save(update_fields=['mobile_no'])
        except Exception:
            pass

        # Return updated me payload
        serializer = MeSerializer(request.user)
        return Response({'ok': True, 'me': serializer.data})


class ChangePasswordView(APIView):
    """Allow authenticated users to change their password."""
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        current_password = str((request.data or {}).get('current_password') or '').strip()
        new_password = str((request.data or {}).get('new_password') or '').strip()
        confirm_password = str((request.data or {}).get('confirm_password') or '').strip()

        # Validate required fields
        if not current_password:
            return Response({'detail': 'Current password is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not new_password:
            return Response({'detail': 'New password is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not confirm_password:
            return Response({'detail': 'Please confirm your new password.'}, status=status.HTTP_400_BAD_REQUEST)

        # Verify current password
        if not request.user.check_password(current_password):
            return Response({'detail': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate new password matches confirmation
        if new_password != confirm_password:
            return Response({'detail': 'New passwords do not match.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate new password is different from current
        if current_password == new_password:
            return Response({'detail': 'New password must be different from current password.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate password strength (minimum 6 characters)
        if len(new_password) < 6:
            return Response({'detail': 'New password must be at least 6 characters long.'}, status=status.HTTP_400_BAD_REQUEST)

        # Set new password
        request.user.set_password(new_password)
        request.user.save()

        return Response({'ok': True, 'message': 'Password changed successfully.'}, status=status.HTTP_200_OK)


class ProfileUpdateView(APIView):
    """Allow authenticated users to update their profile information (name, email, username)."""
    permission_classes = (permissions.IsAuthenticated,)

    def patch(self, request):
        user = request.user
        
        # Extract fields that can be updated
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        email = request.data.get('email')
        username = request.data.get('username')

        # Update user fields if provided
        updated = False

        if first_name is not None:
            user.first_name = str(first_name).strip()
            updated = True

        if last_name is not None:
            user.last_name = str(last_name).strip()
            updated = True

        if email is not None:
            user.email = str(email).strip()
            updated = True

        if username is not None:
            new_username = str(username).strip()
            if not new_username:
                return Response({'detail': 'Username cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

            # Check if username is already taken by another user
            User = get_user_model()
            if User.objects.filter(username=new_username).exclude(pk=user.pk).exists():
                return Response({'detail': 'Username already exists.'}, status=status.HTTP_400_BAD_REQUEST)

            user.username = new_username
            updated = True

        if updated:
            user.save()

        # Return updated user data
        serializer = MeSerializer(user)
        return Response({'ok': True, 'user': serializer.data}, status=status.HTTP_200_OK)


def _user_is_iqac(user) -> bool:
    try:
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        return user.roles.filter(name__iexact='IQAC').exists() or bool(getattr(user, 'is_superuser', False))
    except Exception:
        return False


def _whatsapp_gateway_base_url() -> str:
    """Return the base URL where the WhatsApp gateway is hosted.

    Supports either:
    - settings.OBE_WHATSAPP_GATEWAY_BASE_URL (preferred; explicit)
    - derived from settings.OBE_WHATSAPP_API_URL (legacy)

    If OBE_WHATSAPP_API_URL includes a path (e.g. https://db.krgi.co.in/whatsapp/send),
    this returns the directory base (https://db.krgi.co.in/whatsapp).
    """

    explicit_base = str(getattr(settings, 'OBE_WHATSAPP_GATEWAY_BASE_URL', '') or '').strip()
    if explicit_base:
        try:
            parsed = urlparse(explicit_base)
            if not parsed.scheme or not parsed.netloc:
                return ''
            path = (parsed.path or '').rstrip('/')
            return f"{parsed.scheme}://{parsed.netloc}{path}" if path else f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            return ''

    endpoint = str(getattr(settings, 'OBE_WHATSAPP_API_URL', '') or '').strip()
    if not endpoint:
        return ''
    try:
        parsed = urlparse(endpoint)
        if not parsed.scheme or not parsed.netloc:
            return ''

        path = parsed.path or ''
        if not path or path == '/':
            base_path = ''
        else:
            # If URL is a specific endpoint, return its directory.
            # Example: /whatsapp/send-message -> /whatsapp
            normalized = path.rstrip('/')
            base_path = posixpath.dirname(normalized)
            if base_path == '/':
                base_path = ''

        return f"{parsed.scheme}://{parsed.netloc}{base_path}" if base_path else f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        return ''


def _derive_gateway_base_from_api_url(endpoint: str) -> str:
    endpoint = str(endpoint or '').strip()
    if not endpoint:
        return ''
    try:
        parsed = urlparse(endpoint)
        if not parsed.scheme or not parsed.netloc:
            return ''

        path = parsed.path or ''
        if not path or path == '/':
            base_path = ''
        else:
            normalized = path.rstrip('/')
            base_path = posixpath.dirname(normalized)
            if base_path == '/':
                base_path = ''

        return f"{parsed.scheme}://{parsed.netloc}{base_path}" if base_path else f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        return ''


def _whatsapp_gateway_base_url_candidates() -> list[str]:
    """Ordered base URLs to try for the WhatsApp gateway status/QR proxy."""

    bases: list[str] = []

    explicit = str(getattr(settings, 'OBE_WHATSAPP_GATEWAY_BASE_URL', '') or '').strip()
    fallback = str(getattr(settings, 'OBE_WHATSAPP_GATEWAY_BASE_URL_FALLBACK', '') or '').strip()
    api_url = str(getattr(settings, 'OBE_WHATSAPP_API_URL', '') or '').strip()
    api_url_fallback = str(getattr(settings, 'OBE_WHATSAPP_API_URL_FALLBACK', '') or '').strip()

    for candidate in (explicit, _derive_gateway_base_from_api_url(api_url), fallback, _derive_gateway_base_from_api_url(api_url_fallback)):
        c = str(candidate or '').strip().rstrip('/')
        if not c:
            continue
        if c not in bases:
            bases.append(c)

    return bases


def _friendly_gateway_error_message(exc: Exception) -> str:
    raw = str(exc or '').strip()
    if not raw:
        raw = exc.__class__.__name__

    lowered = raw.lower()
    if 'winerror 10061' in lowered or 'connection refused' in lowered:
        return 'Gateway connection refused (service not running or blocked).'
    if 'name or service not known' in lowered or 'getaddrinfo failed' in lowered:
        return 'Gateway hostname could not be resolved.'
    if 'timed out' in lowered or 'read timed out' in lowered or 'connect timeout' in lowered:
        return 'Gateway request timed out.'
    return 'Gateway request failed.'


def _normalize_gateway_path(value: str, default: str) -> str:
    s = str(value or '').strip()
    if not s:
        s = default
    if not s.startswith('/'):
        s = '/' + s
    return s


class WhatsAppGatewayStatusView(APIView):
    """IQAC-only: best-effort status proxy for the WhatsApp gateway microservice."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        if not _user_is_iqac(request.user):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)

        bases = _whatsapp_gateway_base_url_candidates()
        if not bases:
            return Response({'ok': False, 'detail': 'WhatsApp gateway is not configured.', 'gateway_base_url': ''})

        # Try a conventional status endpoint. If not available, just verify reachability.
        try:
            import requests

            timeout = float(getattr(settings, 'OBE_WHATSAPP_TIMEOUT_SECONDS', 8.0) or 8.0)

            status_path = _normalize_gateway_path(
                getattr(settings, 'OBE_WHATSAPP_GATEWAY_STATUS_PATH', '/status'),
                '/status',
            )

            last_error: Exception | None = None
            for base in bases:
                try:
                    url = f'{base}{status_path}'
                    r = requests.get(url, timeout=timeout)
                    if 200 <= int(r.status_code or 0) < 300:
                        try:
                            payload = r.json()
                        except Exception:
                            payload = {'raw': (r.text or '').strip()}
                        return Response({'ok': True, 'gateway_base_url': base, 'status': payload})

                    # If status endpoint isn't implemented (404), still try reachability below.

                    # Fallback: attempt hitting base
                    r2 = requests.get(base, timeout=timeout)
                    if 200 <= int(r2.status_code or 0) < 500:
                        return Response({'ok': True, 'gateway_base_url': base, 'status': {'http_status': int(r2.status_code or 0)}})
                    last_error = Exception(f'Gateway HTTP {int(r2.status_code or 0)}')
                except Exception as e:
                    last_error = e
                    continue

            # All candidates failed
            base0 = bases[0] if bases else ''
            detail = _friendly_gateway_error_message(last_error) if last_error else 'Gateway request failed.'
            payload = {'ok': False, 'gateway_base_url': base0, 'detail': detail}
            if bool(getattr(settings, 'DEBUG', False)) and last_error is not None:
                payload['debug_error'] = str(last_error)
            return Response(payload)
        except Exception as e:
            log.exception('WhatsApp gateway status check failed')
            base0 = bases[0] if bases else ''
            payload = {
                'ok': False,
                'gateway_base_url': base0,
                'detail': _friendly_gateway_error_message(e),
            }
            if bool(getattr(settings, 'DEBUG', False)):
                payload['debug_error'] = str(e)
            return Response(payload)


class WhatsAppGatewayQrView(APIView):
    """IQAC-only: best-effort QR proxy.

    Supports common gateway patterns:
    - GET /qr.png -> image
    - GET /qr -> JSON with {qr|qr_text|data_url} or plain text QR payload
    """

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        if not _user_is_iqac(request.user):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)

        bases = _whatsapp_gateway_base_url_candidates()
        if not bases:
            return Response({'ok': False, 'detail': 'WhatsApp gateway is not configured.', 'gateway_base_url': ''})

        try:
            import base64
            import requests

            timeout = float(getattr(settings, 'OBE_WHATSAPP_TIMEOUT_SECONDS', 8.0) or 8.0)

            img_path = _normalize_gateway_path(
                getattr(settings, 'OBE_WHATSAPP_GATEWAY_QR_IMAGE_PATH', '/qr.png'),
                '/qr.png',
            )
            qr_path = _normalize_gateway_path(
                getattr(settings, 'OBE_WHATSAPP_GATEWAY_QR_PATH', '/qr'),
                '/qr',
            )

            last_error: Exception | None = None
            for base in bases:
                try:
                    # 1) Image endpoint
                    img_url = f'{base}{img_path}'
                    r = requests.get(img_url, timeout=timeout)
                    ct = str(r.headers.get('content-type', '') or '').lower()
                    if 200 <= int(r.status_code or 0) < 300 and ct.startswith('image/'):
                        b64 = base64.b64encode(r.content or b'').decode('ascii')
                        return Response({'ok': True, 'mode': 'image', 'gateway_base_url': base, 'data_url': f'data:{ct};base64,{b64}'})

                    # 2) JSON/text endpoint
                    qr_url = f'{base}{qr_path}'
                    r2 = requests.get(qr_url, timeout=timeout)
                    if not (200 <= int(r2.status_code or 0) < 300):
                        # Common case: gateway doesn't implement these endpoints.
                        if int(r2.status_code or 0) == 404:
                            last_error = Exception('QR endpoint is not available on this gateway. Use Open Pairing Page.')
                        else:
                            last_error = Exception(f'QR endpoint HTTP {int(r2.status_code or 0)}')
                        continue

                    ct2 = str(r2.headers.get('content-type', '') or '').lower()
                    if 'application/json' in ct2:
                        try:
                            payload = r2.json() or {}
                        except Exception:
                            payload = {}

                        data_url = str(payload.get('data_url') or payload.get('qr_data_url') or '').strip()
                        if data_url.startswith('data:image/'):
                            return Response({'ok': True, 'mode': 'image', 'gateway_base_url': base, 'data_url': data_url})

                        qr_text = str(payload.get('qr') or payload.get('qr_text') or payload.get('text') or '').strip()
                        if qr_text:
                            return Response({'ok': True, 'mode': 'text', 'gateway_base_url': base, 'qr_text': qr_text})

                        last_error = Exception('QR payload not available from gateway.')
                        continue

                    # Plain text QR payload
                    text = str(r2.text or '').strip()
                    if text:
                        return Response({'ok': True, 'mode': 'text', 'gateway_base_url': base, 'qr_text': text})

                    last_error = Exception('QR not available.')
                    continue
                except Exception as e:
                    last_error = e
                    continue

            base0 = bases[0] if bases else ''
            detail = _friendly_gateway_error_message(last_error) if last_error else 'Gateway request failed.'
            payload = {'ok': False, 'gateway_base_url': base0, 'detail': detail}
            if bool(getattr(settings, 'DEBUG', False)) and last_error is not None:
                payload['debug_error'] = str(last_error)
            return Response(payload)
        except Exception as e:
            log.exception('WhatsApp gateway QR fetch failed')
            base0 = bases[0] if bases else ''
            payload = {
                'ok': False,
                'gateway_base_url': base0,
                'detail': _friendly_gateway_error_message(e),
            }
            if bool(getattr(settings, 'DEBUG', False)):
                payload['debug_error'] = str(e)
            return Response(payload)


class WhatsAppGatewayDisconnectView(APIView):
    """IQAC-only: proxy a disconnect/logout request to the Node gateway."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        if not _user_is_iqac(request.user):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)

        bases = _whatsapp_gateway_base_url_candidates()
        if not bases:
            return Response({'ok': False, 'detail': 'WhatsApp gateway is not configured.'})

        api_key = str(getattr(settings, 'OBE_WHATSAPP_API_KEY', '') or '').strip()
        timeout = float(getattr(settings, 'OBE_WHATSAPP_TIMEOUT_SECONDS', 8.0) or 8.0)

        try:
            import requests as _requests

            for base in bases:
                try:
                    r = _requests.post(
                        f'{base}/disconnect',
                        json={'api_key': api_key},
                        headers={'X-Api-Key': api_key} if api_key else {},
                        timeout=timeout,
                    )
                    if 200 <= int(r.status_code or 0) < 300:
                        try:
                            payload = r.json()
                        except Exception:
                            payload = {'ok': True}
                        return Response(payload)
                except Exception:
                    continue

            return Response({'ok': False, 'detail': 'Gateway disconnect request failed.'})
        except Exception as e:
            log.exception('WhatsApp gateway disconnect failed')
            return Response({'ok': False, 'detail': str(e)})


class WhatsAppGatewayRestartView(APIView):
    """IQAC-only: proxy a restart (re-initialise) request to the Node gateway."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        if not _user_is_iqac(request.user):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)

        bases = _whatsapp_gateway_base_url_candidates()
        if not bases:
            return Response({'ok': False, 'detail': 'WhatsApp gateway is not configured.'})

        api_key = str(getattr(settings, 'OBE_WHATSAPP_API_KEY', '') or '').strip()
        timeout = float(getattr(settings, 'OBE_WHATSAPP_TIMEOUT_SECONDS', 8.0) or 8.0)

        try:
            import requests as _requests

            for base in bases:
                try:
                    r = _requests.post(
                        f'{base}/restart',
                        json={'api_key': api_key},
                        headers={'X-Api-Key': api_key} if api_key else {},
                        timeout=timeout,
                    )
                    if 200 <= int(r.status_code or 0) < 300:
                        try:
                            payload = r.json()
                        except Exception:
                            payload = {'ok': True}
                        return Response(payload)
                except Exception:
                    continue

            return Response({'ok': False, 'detail': 'Gateway restart request failed.'})
        except Exception as e:
            log.exception('WhatsApp gateway restart failed')
            return Response({'ok': False, 'detail': str(e)})


class WhatsAppGatewaySendTestView(APIView):
    """IQAC-only: send a test WhatsApp message via the gateway."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        if not _user_is_iqac(request.user):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)

        to = str((request.data or {}).get('to') or '').strip()
        if not to:
            return Response({'ok': False, 'detail': '"to" phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from .services.sms import send_whatsapp
        message = str((request.data or {}).get('message') or '').strip() or (
            f'✅ Test message from IDCS. Gateway working correctly. Sent at {__import__("datetime").datetime.now().strftime("%d/%m/%Y %H:%M")}.'
        )

        result = send_whatsapp(to, message)
        return Response({'ok': result.ok, 'detail': result.message})


class WhatsAppGatewayClearSessionView(APIView):
    """IQAC-only: wipe the Node session data and force a fresh QR pairing."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        if not _user_is_iqac(request.user):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)

        bases = _whatsapp_gateway_base_url_candidates()
        if not bases:
            return Response({'ok': False, 'detail': 'WhatsApp gateway is not configured.'})

        api_key = str(getattr(settings, 'OBE_WHATSAPP_API_KEY', '') or '').strip()
        timeout = float(getattr(settings, 'OBE_WHATSAPP_TIMEOUT_SECONDS', 8.0) or 8.0)

        try:
            import requests as _requests

            for base in bases:
                try:
                    r = _requests.post(
                        f'{base}/clear-session',
                        json={'api_key': api_key},
                        headers={'X-Api-Key': api_key} if api_key else {},
                        timeout=timeout,
                    )
                    if 200 <= int(r.status_code or 0) < 300:
                        try:
                            payload = r.json()
                        except Exception:
                            payload = {'ok': True}
                        return Response(payload)
                except Exception:
                    continue

            return Response({'ok': False, 'detail': 'Gateway clear-session request failed.'})
        except Exception as e:
            log.exception('WhatsApp gateway clear-session failed')
            return Response({'ok': False, 'detail': str(e)})


class UserQueryListCreateView(APIView):
    """List all queries for the current user or create a new query."""
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        """Get all queries for the current user."""
        queries = UserQuery.objects.filter(user=request.user).order_by('-created_at')
        serializer = UserQueryListSerializer(queries, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Create a new query."""
        serializer = UserQuerySerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserQueryDetailView(APIView):
    """Retrieve a specific query by ID."""
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request, pk):
        """Get a specific query for the current user."""
        try:
            query = UserQuery.objects.get(pk=pk, user=request.user)
            serializer = UserQuerySerializer(query)
            return Response(serializer.data)
        except UserQuery.DoesNotExist:
            return Response({'detail': 'Query not found.'}, status=status.HTTP_404_NOT_FOUND)


class AllQueriesListView(APIView):
    """List all queries from all users - for admin/receivers only."""
    permission_classes = (permissions.IsAuthenticated, HasPermissionCode)
    required_permission_code = 'queries.manage'

    def get(self, request):
        """Get all queries with optional status, department, and role filters."""
        status_filter = request.GET.get('status')
        dept_filter = request.GET.get('department')
        role_filter = request.GET.get('role')
        
        queries = UserQuery.objects.select_related('user').prefetch_related(
            'user__user_roles__role',
            'user__staff_profile__department',
            'user__student_profile__section__batch__course__department'
        ).all()
        
        if status_filter:
            queries = queries.filter(status=status_filter)
        
        # Department filter
        if dept_filter:
            from django.db.models import Q
            queries = queries.filter(
                Q(user__staff_profile__department_id=dept_filter) |
                Q(user__student_profile__section__batch__course__department_id=dept_filter)
            )
        
        # Role filter
        if role_filter:
            queries = queries.filter(user__user_roles__role__name=role_filter)
        
        queries = queries.order_by('-created_at').distinct()
        
        # Store count before serialization
        filtered_count = queries.count()
        
        serializer = UserQuerySerializer(queries, many=True)
        
        # Get unique departments and roles for filter options
        from academics.models import Department
        departments = Department.objects.all().order_by('code').values('id', 'code', 'name', 'short_name')
        roles = Role.objects.all().order_by('name').values('id', 'name')
        
        return Response({
            'queries': serializer.data,
            'departments': list(departments),
            'roles': list(roles),
            'total_count': UserQuery.objects.count(),
            'filtered_count': filtered_count
        })


class QueryUpdateView(APIView):
    """Update query status and admin notes - for admin/receivers only."""
    permission_classes = (permissions.IsAuthenticated, HasPermissionCode)
    required_permission_code = 'queries.manage'

    def patch(self, request, pk):
        """Update query status and/or admin notes."""
        try:
            query = UserQuery.objects.get(pk=pk)
        except UserQuery.DoesNotExist:
            return Response({'detail': 'Query not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        # Update allowed fields
        if 'status' in request.data:
            query.status = request.data['status']
        if 'admin_notes' in request.data:
            query.admin_notes = request.data['admin_notes']
        
        query.save()
        serializer = UserQuerySerializer(query)
        return Response(serializer.data)
