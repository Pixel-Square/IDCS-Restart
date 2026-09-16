"""
Serializers for superuser impersonation functionality.
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from typing import Optional

User = get_user_model()


class SuperuserImpersonationSerializer(serializers.Serializer):
    """
    Allows a superuser to log in as another user.

    POST /accounts/impersonate/
    {
        "superuser_identifier": "admin@example.com",
        "superuser_password": "admin_password",
        "target_user_id": 123,
        "reason": "Debugging user issue"
    }

    Returns JWT tokens valid for the target user.
    """

    superuser_identifier = serializers.CharField(write_only=True, help_text="Email, reg_no, or staff_id of superuser")
    superuser_password = serializers.CharField(write_only=True, help_text="Superuser password")
    # Backward-compatible: older clients send target_user_id.
    target_user_id = serializers.IntegerField(
        write_only=True,
        required=False,
        help_text="(Legacy) DB ID of user to impersonate",
    )
    # Preferred: human identifiers that admins actually know.
    target_identifier = serializers.CharField(
        write_only=True,
        required=False,
        help_text="Target student's reg_no or staff's staff_id (can also be email/username)",
    )
    reason = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        default='',
        help_text="Reason for impersonation (for audit log)"
    )

    # Output fields
    refresh = serializers.CharField(read_only=True)
    access = serializers.CharField(read_only=True)
    user_id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    roles = serializers.ListField(read_only=True)
    impersonation_notice = serializers.CharField(read_only=True, help_text="Warning message for frontend")

    def validate(self, attrs):
        from accounts.serializers import _compute_effective_role_names

        superuser_identifier = attrs.get('superuser_identifier')
        superuser_password = attrs.get('superuser_password')
        target_user_id = attrs.get('target_user_id', None)
        target_identifier = (attrs.get('target_identifier') or '').strip()
        reason = attrs.get('reason', '').strip()

        if not superuser_identifier or not superuser_password:
            raise serializers.ValidationError('All fields required: superuser_identifier, superuser_password, and a target (target_identifier or target_user_id)')
        if not target_user_id and not target_identifier:
            raise serializers.ValidationError('Target is required: provide target_identifier (student reg_no / staff_id) or target_user_id')

        # ===== STEP 1: Authenticate superuser =====
        superuser: Optional[User] = None

        superuser = self._resolve_user_from_identifier(superuser_identifier)

        if superuser is None:
            raise serializers.ValidationError('Invalid superuser credentials.')

        # Verify password
        if not superuser.check_password(superuser_password):
            raise serializers.ValidationError('Invalid superuser credentials.')

        # ===== STEP 2: Check if this account is allowed to impersonate =====
        # In this codebase, "superuser" impersonation is used by the IQAC/admin flow.
        # Some deployments do not mark the IQAC account as Django `is_superuser=True`.
        # Accept either:
        # - Django superuser
        # - IQAC role (via RoleAssignment or User.roles)
        # - users with the custom permission code `admin.manage`
        is_django_superuser = bool(getattr(superuser, 'is_superuser', False))
        effective_roles = []
        try:
            effective_roles = _compute_effective_role_names(superuser) or []
        except Exception:
            effective_roles = []

        has_iqac_role = any(str(r or '').strip().upper() == 'IQAC' for r in effective_roles)
        has_admin_manage = False
        try:
            from accounts.utils import get_user_permissions

            perms = {str(p or '').strip().lower() for p in (get_user_permissions(superuser) or set())}
            has_admin_manage = 'admin.manage' in perms
        except Exception:
            has_admin_manage = False

        if not (is_django_superuser or has_iqac_role or has_admin_manage):
            raise serializers.ValidationError('Account is not authorized to impersonate users.')

        if not getattr(superuser, 'is_active', True):
            raise serializers.ValidationError('Superuser account is inactive.')

        # ===== STEP 3: Get target user =====
        target_user: Optional[User] = None

        if target_user_id:
            try:
                target_user = User.objects.get(id=target_user_id)
            except User.DoesNotExist:
                raise serializers.ValidationError(f'Target user with ID {target_user_id} not found.')
        else:
            target_user = self._resolve_user_from_identifier(target_identifier)
            if target_user is None:
                raise serializers.ValidationError('Target user not found for the given target_identifier.')

        if not getattr(target_user, 'is_active', True):
            raise serializers.ValidationError('Target user account is inactive.')

        # ===== STEP 4: Check impersonation permissions =====
        try:
            from accounts.models_impersonation import SuperuserImpersonationPermission

            perm = SuperuserImpersonationPermission.objects.filter(superuser=superuser).first()

            if perm:
                can_impersonate, reason_msg = perm.can_impersonate(target_user)
                if not can_impersonate:
                    raise serializers.ValidationError(reason_msg)
            # If no permission record exists, allow (backward compatibility / trust superuser)
        except ImportError:
            # If permission model doesn't exist yet, allow
            pass

        # ===== STEP 5: Create JWT for target user =====
        refresh = RefreshToken.for_user(target_user)

        # Add roles to token
        try:
            refresh['roles'] = _compute_effective_role_names(target_user)
        except Exception:
            refresh['roles'] = []

        # Mark token as impersonation token in metadata
        refresh['impersonated_by'] = superuser.id
        refresh['impersonated_at'] = str(serializers.DateTimeField().to_representation(
            __import__('django.utils.timezone', fromlist=['now']).now()
        ))

        # ===== STEP 6: Log the impersonation =====
        try:
            from accounts.models_impersonation import SuperuserImpersonationLog
            from django.utils import timezone

            request = self.context.get('request')
            ip_address = ''
            user_agent = ''

            if request:
                ip_address = self._get_client_ip(request)
                user_agent = request.META.get('HTTP_USER_AGENT', '')[:500]

            SuperuserImpersonationLog.log_impersonation(
                superuser=superuser,
                target_user=target_user,
                status='SUCCESS',
                ip_address=ip_address,
                user_agent=user_agent,
                reason=reason,
                metadata={
                    'accessed_at': str(timezone.now()),
                }
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f'Failed to log impersonation: {e}')

        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user_id': int(target_user.id),
            'name': (f"{getattr(target_user, 'first_name', '')} {getattr(target_user, 'last_name', '')}").strip() or str(getattr(target_user, 'username', '')),
            'roles': _compute_effective_role_names(target_user),
            'impersonation_notice': f'🔒 You are impersonating {target_user.username}. Session will be logged.',
        }

    @staticmethod
    def _resolve_user_from_identifier(identifier: str) -> Optional[User]:
        """Resolve a User by email, student reg_no, staff staff_id, username, or numeric user id."""
        identifier = (identifier or '').strip()
        if not identifier:
            return None

        # Email
        if '@' in identifier:
            user = User.objects.filter(email__iexact=identifier).first()
            if user:
                return user

        # Student/Staff profiles
        try:
            from academics.models import StudentProfile, StaffProfile

            sp = StudentProfile.objects.filter(reg_no__iexact=identifier).select_related('user').first()
            if sp and getattr(sp, 'user', None):
                return sp.user

            st = StaffProfile.objects.filter(staff_id__iexact=identifier).select_related('user').first()
            if st and getattr(st, 'user', None):
                return st.user
        except Exception:
            pass

        # Username
        user = User.objects.filter(username__iexact=identifier).first()
        if user:
            return user

        # Numeric fallback (legacy)
        if identifier.isdigit():
            return User.objects.filter(id=int(identifier)).first()

        return None

    @staticmethod
    def _get_client_ip(request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip


class SuperuserImpersonationHistorySerializer(serializers.Serializer):
    """Serializer for viewing impersonation history (audit log)."""

    id = serializers.IntegerField()
    superuser_id = serializers.IntegerField(source='superuser.id')
    superuser_username = serializers.CharField(source='superuser.username')
    target_user_id = serializers.IntegerField(source='target_user.id', allow_null=True)
    target_user_username = serializers.CharField(source='target_user.username', allow_null=True)
    status = serializers.CharField()
    ip_address = serializers.CharField()
    reason = serializers.CharField()
    created_at = serializers.DateTimeField()

    class Meta:
        fields = [
            'id', 'superuser_id', 'superuser_username',
            'target_user_id', 'target_user_username',
            'status', 'ip_address', 'reason', 'created_at'
        ]
