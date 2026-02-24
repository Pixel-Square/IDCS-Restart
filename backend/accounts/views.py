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

from .models import MobileOtp, NotificationTemplate, UserQuery
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
    s = str(raw or '').strip()
    if not s:
        return ''
    # keep leading +, strip everything else to digits
    plus = s.startswith('+')
    digits = re.sub(r'[^0-9]', '', s)
    if plus:
        s2 = f'+{digits}'
    else:
        s2 = digits
    # Basic sanity: allow 10-15 digits (E.164-like)
    digits_only = re.sub(r'[^0-9]', '', s2)
    if len(digits_only) < 10 or len(digits_only) > 15:
        return ''
    return s2


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
            otp.delete()
            # surface delivery error (useful when WhatsApp client is not ready)
            detail = 'Failed to send OTP. Please try again.'
            try:
                if getattr(sms, 'message', None):
                    detail = f'{detail} ({sms.message})'
            except Exception:
                pass
            return Response({'detail': detail}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            {
                'ok': True,
                'mobile_number': mobile,
                'expires_in_seconds': ttl_minutes * 60,
                'cooldown_seconds': cooldown_seconds,
            }
        )


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
        """Get all queries with optional status filter."""
        status_filter = request.GET.get('status')
        queries = UserQuery.objects.select_related('user').all()
        
        if status_filter:
            queries = queries.filter(status=status_filter)
        
        queries = queries.order_by('-created_at')
        serializer = UserQuerySerializer(queries, many=True)
        return Response(serializer.data)


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
