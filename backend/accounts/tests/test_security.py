"""
Security smoke tests for the hardening changes (DB-free, fast).

Covers:
- Protected media serving (public prefixes, private files, signed URLs, traversal).
- Registration lockdown (admin-only by default).
- JWT httpOnly cookie set/clear helpers.
- Scoped API throttling wiring.
"""
import os
import tempfile
import urllib.parse

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings
from rest_framework.permissions import AllowAny, IsAdminUser

from accounts.views import (
    CookieTokenRefreshView,
    CustomTokenObtainPairView,
    RegisterView,
)
from erp.authentication import clear_auth_cookies, set_auth_cookies
from erp.media_views import ProtectedMediaView, signed_media_url
from staff_attendance.realtime_views import BiometricRealtimeIngestView


class RegisterLockdownTests(SimpleTestCase):
    def test_register_requires_admin_by_default(self):
        perms = RegisterView().get_permissions()
        self.assertEqual(len(perms), 1)
        self.assertIsInstance(perms[0], IsAdminUser)

    @override_settings(ENABLE_OPEN_REGISTRATION=True)
    def test_register_allows_any_when_enabled(self):
        perms = RegisterView().get_permissions()
        self.assertEqual(len(perms), 1)
        self.assertIsInstance(perms[0], AllowAny)


class CookieAuthTests(SimpleTestCase):
    def test_set_auth_cookies_httponly(self):
        resp = HttpResponse()
        set_auth_cookies(resp, access='header.payload.sig', refresh='r.header.sig')
        self.assertIn('access_token', resp.cookies)
        self.assertIn('refresh_token', resp.cookies)
        self.assertTrue(resp.cookies['access_token']['httponly'])
        self.assertTrue(resp.cookies['refresh_token']['httponly'])

    def test_clear_auth_cookies(self):
        resp = HttpResponse()
        clear_auth_cookies(resp)
        self.assertIn('access_token', resp.cookies)
        self.assertEqual(int(resp.cookies['access_token']['max-age']), 0)


class ThrottleConfigTests(SimpleTestCase):
    def test_scoped_throttles_wired(self):
        self.assertEqual(CustomTokenObtainPairView.throttle_scope, 'login')
        self.assertEqual(CookieTokenRefreshView.throttle_scope, 'refresh')
        self.assertEqual(RegisterView.throttle_scope, 'register')
        self.assertEqual(BiometricRealtimeIngestView.throttle_scope, 'biometric_ingest')


class ProtectedMediaTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = cls.tmp.name
        os.makedirs(os.path.join(cls.root, 'private'), exist_ok=True)
        os.makedirs(os.path.join(cls.root, 'profile_images'), exist_ok=True)
        with open(os.path.join(cls.root, 'private', 'secret.txt'), 'w') as fh:
            fh.write('top-secret')
        with open(os.path.join(cls.root, 'profile_images', 'avatar.png'), 'wb') as fh:
            fh.write(b'\x89PNG\r\n\x1a\n')

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()
        super().tearDownClass()

    def _request(self, path, query=''):
        url = '/media/' + path
        if query:
            url += '?' + query
        return RequestFactory().get(url)

    def _settings(self):
        return self.settings(
            MEDIA_ROOT=self.root,
            MEDIA_URL='/media/',
            USE_X_ACCEL_REDIRECT=False,
            PUBLIC_MEDIA_PREFIXES=['profile_images/'],
        )

    def test_public_prefix_served_anonymously(self):
        with self._settings():
            resp = ProtectedMediaView().get(
                self._request('profile_images/avatar.png'), 'profile_images/avatar.png'
            )
        self.assertEqual(resp.status_code, 200)

    def test_private_file_requires_auth(self):
        with self._settings():
            resp = ProtectedMediaView().get(
                self._request('private/secret.txt'), 'private/secret.txt'
            )
        self.assertEqual(resp.status_code, 403)

    def test_signed_url_grants_access(self):
        with self._settings():
            signed = signed_media_url('private/secret.txt', ttl_seconds=60)
            query = urllib.parse.urlsplit(signed).query
            resp = ProtectedMediaView().get(
                self._request('private/secret.txt', query), 'private/secret.txt'
            )
        self.assertEqual(resp.status_code, 200)

    def test_expired_signed_url_rejected(self):
        with self._settings():
            signed = signed_media_url('private/secret.txt', ttl_seconds=-1)
            query = urllib.parse.urlsplit(signed).query
            resp = ProtectedMediaView().get(
                self._request('private/secret.txt', query), 'private/secret.txt'
            )
        self.assertEqual(resp.status_code, 403)

    def test_path_traversal_rejected(self):
        with self._settings():
            resp = ProtectedMediaView().get(
                self._request('../secret.txt'), '../secret.txt'
            )
        self.assertEqual(resp.status_code, 404)
