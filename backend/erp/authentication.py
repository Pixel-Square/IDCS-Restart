"""
Authentication helpers for IDCS.

- ``JWTCookieAuthentication``: DRF authentication that accepts the access
  token either from the standard ``Authorization: Bearer <token>`` header
  (backwards-compatible with the existing React/Electron clients) or from an
  httpOnly cookie (the secure default that protects tokens from XSS).
- ``authenticate_request``: best-effort authentication for plain Django views
  (used by the protected media view).
- ``set_auth_cookies`` / ``clear_auth_cookies``: write/delete the httpOnly
  cookies on token endpoints.
"""
from __future__ import annotations

from django.conf import settings

from rest_framework_simplejwt.authentication import JWTAuthentication


def _cookie_settings():
    return {
        'access_name': str(getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'access_token') or 'access_token'),
        'refresh_name': str(getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'refresh_token') or 'refresh_token'),
        'secure': bool(getattr(settings, 'JWT_COOKIE_SECURE', not settings.DEBUG)),
        'samesite': str(getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax') or 'Lax'),
        'httponly': bool(getattr(settings, 'JWT_COOKIE_HTTPONLY', True)),
        'path': str(getattr(settings, 'JWT_COOKIE_PATH', '/') or '/'),
        'domain': str(getattr(settings, 'JWT_COOKIE_DOMAIN', '') or ''),
    }


class JWTCookieAuthentication(JWTAuthentication):
    """Authenticate via ``Authorization`` header, then fall back to cookie."""

    def authenticate(self, request):
        header = self.get_header(request)
        raw_token = None
        if header is not None:
            raw_token = self.get_raw_token(header)

        if raw_token is None:
            conf = _cookie_settings()
            cookie = request.COOKIES.get(conf['access_name'])
            if cookie:
                raw_token = cookie.encode('utf-8')

        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token


def authenticate_request(request):
    """Best-effort auth for plain Django views (returns user or None)."""
    user = getattr(request, 'user', None)
    if user is not None and user.is_authenticated:
        return user

    # Try header token first, then cookie.
    for auth_class in (JWTAuthentication(), JWTCookieAuthentication()):
        try:
            result = auth_class.authenticate(request)
        except Exception:  # noqa: BLE001 - any auth failure means "unauthenticated here"
            result = None
        if result is not None:
            auth_user, _token = result
            request.user = auth_user
            request._auth = _token  # type: ignore[attr-defined]
            return auth_user

    # If a session user was already resolved by middleware, use it. Use
    # getattr because a bare RequestFactory request has no `.user` attribute.
    user = getattr(request, 'user', None)
    if user is not None and user.is_authenticated:
        return user
    return None


def set_auth_cookies(response, access: str | None = None, refresh: str | None = None):
    """Attach httpOnly cookies for the access/refresh tokens to a response."""
    conf = _cookie_settings()
    kwargs = {
        'secure': conf['secure'],
        'httponly': conf['httponly'],
        'samesite': conf['samesite'],
        'path': conf['path'],
    }
    if conf['domain']:
        kwargs['domain'] = conf['domain']

    if access:
        response.set_cookie(conf['access_name'], access, max_age=_access_max_age(), **kwargs)
    if refresh:
        response.set_cookie(conf['refresh_name'], refresh, max_age=_refresh_max_age(), **kwargs)
    return response


def clear_auth_cookies(response):
    """Remove the auth cookies from a response (logout)."""
    conf = _cookie_settings()
    response.delete_cookie(conf['access_name'], path=conf['path'], domain=conf['domain'] or None)
    response.delete_cookie(conf['refresh_name'], path=conf['path'], domain=conf['domain'] or None)
    return response


def _access_max_age() -> int:
    from rest_framework_simplejwt.settings import api_settings
    lifetime = api_settings.ACCESS_TOKEN_LIFETIME
    return int(lifetime.total_seconds())


def _refresh_max_age() -> int:
    from rest_framework_simplejwt.settings import api_settings
    lifetime = api_settings.REFRESH_TOKEN_LIFETIME
    return int(lifetime.total_seconds())
