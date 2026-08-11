"""
Views for superuser impersonation functionality.
"""
import logging
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import permissions
from django.contrib.auth import get_user_model
from accounts.serializers_impersonation import (
    SuperuserImpersonationSerializer,
    SuperuserImpersonationHistorySerializer,
    _403_PREFIX,
)
from accounts.permissions_api import HasPermissionCode

User = get_user_model()

log = logging.getLogger(__name__)


class SuperuserImpersonateView(APIView):
    """
    POST /accounts/impersonate/
    
    Allow a superuser to log in as another user without knowing their password.
    
    Request body:
    {
        "superuser_identifier": "admin@example.com",
        "superuser_password": "admin_password",
        "target_user_id": 123,
        "reason": "Debugging user issue (optional)"
    }
    
    Response:
    {
        "access": "<jwt_token>",
        "refresh": "<refresh_token>",
        "user_id": 123,
        "name": "John Doe",
        "roles": ["STUDENT"],
        "impersonation_notice": "🔒 You are impersonating john. Session will be logged."
    }
    """
    
    authentication_classes = []  # Don't require authentication for login attempt
    permission_classes = [permissions.AllowAny]
    
    def post(self, request):
        serializer = SuperuserImpersonationSerializer(
            data=request.data,
            context={'request': request}
        )
        
        if serializer.is_valid():
            return Response(serializer.validated_data, status=status.HTTP_200_OK)

        # Log failures for production debugging (never log passwords).
        try:
            data = request.data or {}
            safe_payload = {
                'superuser_identifier': str(data.get('superuser_identifier', '')).strip(),
                'target_user_id': data.get('target_user_id', None),
                'target_identifier': str(data.get('target_identifier', '')).strip(),
                'has_password': bool(data.get('superuser_password')),
                'ip': request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '')),
                'ua': (request.META.get('HTTP_USER_AGENT', '') or '')[:200],
            }
            log.warning('Impersonation login failed: payload=%s errors=%s', safe_payload, serializer.errors)
        except Exception:
            pass

        # Check if any error message carries the 403-sentinel prefix that the
        # serializer embeds for *authorization* failures (as opposed to credential
        # or validation failures which should remain 401).
        def _strip_sentinel(errors):
            """Recursively walk serializer errors, strip the sentinel prefix,
            and return (has_403_error, cleaned_errors)."""
            found = False
            if isinstance(errors, list):
                cleaned = []
                for item in errors:
                    if isinstance(item, str) and item.startswith(_403_PREFIX):
                        found = True
                        cleaned.append(item[len(_403_PREFIX):])
                    else:
                        sub_found, sub_item = _strip_sentinel(item)
                        found = found or sub_found
                        cleaned.append(sub_item)
                return found, cleaned
            if isinstance(errors, dict):
                cleaned = {}
                for key, val in errors.items():
                    sub_found, sub_val = _strip_sentinel(val)
                    found = found or sub_found
                    cleaned[key] = sub_val
                return found, cleaned
            return found, errors

        has_403, clean_errors = _strip_sentinel(serializer.errors)
        if has_403:
            return Response(clean_errors, status=status.HTTP_403_FORBIDDEN)

        return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)


class SuperuserImpersonationHistoryView(APIView):
    """
    GET /accounts/impersonation-history/
    
    View impersonation audit log.
    Only superusers can access this.
    
    Query parameters:
    - superuser_id: Filter by superuser who performed impersonation
    - target_user_id: Filter by target user
    - status: Filter by status (SUCCESS, FAILED, DENIED, DISABLED)
    - limit: Number of records (default 100, max 1000)
    - offset: Pagination offset
    """
    
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        # Only superusers can view this
        if not getattr(request.user, 'is_superuser', False):
            return Response(
                {'detail': 'Only superusers can access impersonation history.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            from accounts.models_impersonation import SuperuserImpersonationLog
        except ImportError:
            return Response(
                {'detail': 'Impersonation logging not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        # Get filters
        superuser_id = request.query_params.get('superuser_id')
        target_user_id = request.query_params.get('target_user_id')
        filter_status = request.query_params.get('status')
        limit = min(int(request.query_params.get('limit', 100)), 1000)
        offset = int(request.query_params.get('offset', 0))
        
        # Build query
        qs = SuperuserImpersonationLog.objects.all()
        
        if superuser_id:
            try:
                qs = qs.filter(superuser_id=int(superuser_id))
            except (ValueError, TypeError):
                pass
        
        if target_user_id:
            try:
                qs = qs.filter(target_user_id=int(target_user_id))
            except (ValueError, TypeError):
                pass
        
        if filter_status:
            qs = qs.filter(status=filter_status)
        
        # Get total count
        total = qs.count()
        
        # Paginate
        logs = qs.order_by('-created_at')[offset:offset+limit]
        
        serializer = SuperuserImpersonationHistorySerializer(logs, many=True)
        
        return Response({
            'count': total,
            'limit': limit,
            'offset': offset,
            'results': serializer.data
        })


class SuperuserImpersonationPermissionView(APIView):
    """
    GET/PUT /accounts/impersonation-permissions/<user_id>/
    
    Get or update impersonation permissions for a specific superuser.
    Only accessible by superusers or users with admin.manage permission.
    
    PUT body:
    {
        "can_impersonate_any": true,
        "allowed_target_roles": [1, 2, 3],
        "allowed_departments": "COMP,ETC,MECH",
        "expires_at": "2025-12-31T23:59:59Z",
        "is_active": true
    }
    """
    
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, user_id):
        """Get impersonation permissions for a user."""
        if not self._check_admin_access(request):
            return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            from accounts.models_impersonation import SuperuserImpersonationPermission
        except ImportError:
            return Response(
                {'detail': 'Impersonation permissions not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        try:
            perm = SuperuserImpersonationPermission.objects.get(superuser_id=user_id)
            return Response({
                'user_id': perm.superuser.id,
                'username': perm.superuser.username,
                'can_impersonate_any': perm.can_impersonate_any,
                'allowed_target_roles': [r.id for r in perm.allowed_target_roles.all()],
                'allowed_departments': perm.allowed_departments,
                'expires_at': perm.expires_at,
                'is_active': perm.is_active,
                'created_at': perm.created_at,
                'updated_at': perm.updated_at,
            })
        except:
            return Response(
                {'detail': 'No permissions configured for this user. They have no impersonation rights.'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    def put(self, request, user_id):
        """Update impersonation permissions for a user."""
        if not self._check_admin_access(request):
            return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            from accounts.models_impersonation import SuperuserImpersonationPermission
        except ImportError:
            return Response(
                {'detail': 'Impersonation permissions not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        perm, created = SuperuserImpersonationPermission.objects.get_or_create(
            superuser=user,
            defaults={'can_impersonate_any': False}
        )
        
        # Update fields
        if 'can_impersonate_any' in request.data:
            perm.can_impersonate_any = bool(request.data.get('can_impersonate_any'))
        
        if 'allowed_departments' in request.data:
            perm.allowed_departments = str(request.data.get('allowed_departments', '')).strip()
        
        if 'expires_at' in request.data:
            perm.expires_at = request.data.get('expires_at')
        
        if 'is_active' in request.data:
            perm.is_active = bool(request.data.get('is_active'))
        
        perm.save()
        
        # Handle allowed_target_roles
        if 'allowed_target_roles' in request.data:
            role_ids = request.data.get('allowed_target_roles', [])
            if isinstance(role_ids, list):
                from accounts.models import Role
                roles = Role.objects.filter(id__in=role_ids)
                perm.allowed_target_roles.set(roles)
        
        return Response({
            'ok': True,
            'user_id': perm.superuser.id,
            'username': perm.superuser.username,
            'can_impersonate_any': perm.can_impersonate_any,
            'allowed_target_roles': [r.id for r in perm.allowed_target_roles.all()],
            'allowed_departments': perm.allowed_departments,
            'expires_at': perm.expires_at,
            'is_active': perm.is_active,
        })
    
    @staticmethod
    def _check_admin_access(request):
        """Check if user is superuser or has admin.manage permission."""
        if getattr(request.user, 'is_superuser', False):
            return True
        
        try:
            return request.user.has_perm('admin.manage')
        except Exception:
            return False
