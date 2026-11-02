"""JWT authentication with account-state checks applied on every request.

SimpleJWT only checks ``is_active``. IDCS also needs to:

- refuse students whose status is INACTIVE or DEBAR, so existing tokens stop
  working as soon as the office changes the status (not only at next login);
- hold users with ``must_change_password`` to the password-change endpoint until
  they replace an office-issued password.

Use ``IDCSJWTAuthentication`` everywhere instead of SimpleJWT's class. It is the
default in ``REST_FRAMEWORK`` and modules that name an authentication class
explicitly import it under the ``JWTAuthentication`` name.
"""

from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

BLOCKED_STUDENT_STATUSES = {'INACTIVE', 'DEBAR'}

# Paths a user with a pending forced password change may still call.
PASSWORD_CHANGE_ALLOWED_SUFFIXES = ('/change-password/', '/me/', '/logout/')


def student_status_blocks_access(user) -> bool:
    try:
        profile = getattr(user, 'student_profile', None)
    except Exception:
        profile = None
    status = str(getattr(profile, 'status', '') or '').strip().upper()
    return status in BLOCKED_STUDENT_STATUSES


def user_can_authenticate(user) -> bool:
    """SimpleJWT USER_AUTHENTICATION_RULE: also applied when a refresh token is used."""
    return bool(user is not None and user.is_active and not student_status_blocks_access(user))


class IDCSJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, _token = result
        if student_status_blocks_access(user):
            raise AuthenticationFailed('Your student account is not active. Please contact administration.', code='account_inactive')
        if getattr(user, 'must_change_password', False) and not request.path.endswith(PASSWORD_CHANGE_ALLOWED_SUFFIXES):
            raise PermissionDenied('You must change your password before continuing.', code='password_change_required')
        return result
