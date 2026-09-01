"""
Database-backed integration tests for the hardened auth flows:

- login (identifier + password) issues JWT pair + httpOnly cookies
- refresh rotates tokens and blacklists the old one
- refresh accepts the refresh token via httpOnly cookie
- logout blacklists the refresh token
- registration is admin-only by default, open when ENABLE_OPEN_REGISTRATION=1
"""
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

User = get_user_model()


class AuthFlowTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='teststaff',
            email='teststaff@college.edu',
            password='StrongPass123!',
        )

    def login(self):
        resp = self.client.post(
            '/api/accounts/token/',
            {'identifier': 'teststaff@college.edu', 'password': 'StrongPass123!'},
            format='json',
        )
        return resp


class LoginFlowTests(AuthFlowTestCase):
    def test_login_returns_tokens_and_http_only_cookies(self):
        resp = self.login()
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        self.assertIn('refresh', resp.data)
        # httpOnly cookies are also emitted so clients can drop localStorage.
        self.assertIn('access_token', resp.cookies)
        self.assertIn('refresh_token', resp.cookies)
        self.assertTrue(resp.cookies['access_token']['httponly'])

    def test_login_rejects_bad_password(self):
        resp = self.client.post(
            '/api/accounts/token/',
            {'identifier': 'teststaff@college.edu', 'password': 'wrong'},
            format='json',
        )
        # The serializer raises ValidationError, which DRF maps to HTTP 400.
        self.assertEqual(resp.status_code, 400)


class RefreshFlowTests(AuthFlowTestCase):
    def test_refresh_rotates_and_blacklists_old_token(self):
        refresh = self.login().data['refresh']

        first = self.client.post(
            '/api/accounts/token/refresh/', {'refresh': refresh}, format='json'
        )
        self.assertEqual(first.status_code, 200)
        self.assertNotEqual(first.data['refresh'], refresh)

        # The old refresh token must now be blacklisted.
        replay = self.client.post(
            '/api/accounts/token/refresh/', {'refresh': refresh}, format='json'
        )
        self.assertEqual(replay.status_code, 401)

    def test_refresh_accepts_cookie_without_body(self):
        refresh = self.login().data['refresh']
        self.client.cookies['refresh_token'] = refresh
        resp = self.client.post('/api/accounts/token/refresh/', {}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)


class LogoutFlowTests(AuthFlowTestCase):
    def test_logout_blacklists_refresh_token(self):
        tokens = self.login().data
        access, refresh = tokens['access'], tokens['refresh']

        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + access)
        resp = self.client.post(
            '/api/accounts/logout/', {'refresh': refresh}, format='json'
        )
        self.assertEqual(resp.status_code, 205)

        replay = self.client.post(
            '/api/accounts/token/refresh/', {'refresh': refresh}, format='json'
        )
        self.assertEqual(replay.status_code, 401)


class RegisterFlowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='adminuser', email='adminuser@college.edu', password='StrongPass123!'
        )

    def _register_payload(self):
        return {'username': 'newbie', 'email': 'newbie@college.edu', 'password': 'SomePass123!'}

    def test_register_forbidden_for_anonymous(self):
        resp = self.client.post('/api/accounts/register/', self._register_payload(), format='json')
        # Unauthenticated -> DRF IsAdminUser denies with 401 (no credentials).
        self.assertEqual(resp.status_code, 401)
        self.assertFalse(User.objects.filter(email='newbie@college.edu').exists())

    def test_register_allowed_for_admin(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post('/api/accounts/register/', self._register_payload(), format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(User.objects.filter(email='newbie@college.edu').exists())

    @override_settings(ENABLE_OPEN_REGISTRATION=True)
    def test_register_open_when_enabled(self):
        resp = self.client.post('/api/accounts/register/', self._register_payload(), format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(User.objects.filter(email='newbie@college.edu').exists())


class SuperAdminIsolationTests(APITestCase):
    def setUp(self):
        self.sa = User.objects.create_superuser(
            username='superadmin', email='admin@example.com', password='StrongPass123!'
        )

    def _login(self, sa_key=None):
        payload = {'identifier': 'admin@example.com', 'password': 'StrongPass123!'}
        if sa_key is not None:
            payload['sa_key'] = sa_key
        return self.client.post('/api/accounts/token/', payload, format='json')

    def test_super_admin_login_fails_closed_without_configured_key(self):
        # No SUPER_ADMIN_ACCESS_KEY configured -> the super-admin account
        # must not be able to authenticate via the token endpoint.
        resp = self._login(sa_key='anything')
        self.assertEqual(resp.status_code, 400)
        self.assertNotIn('access', resp.data)

    @override_settings(SUPER_ADMIN_ACCESS_KEY='test-sa-secret')
    def test_super_admin_login_requires_correct_key(self):
        self.assertEqual(self._login(sa_key='wrong-key').status_code, 400)
        resp = self._login(sa_key='test-sa-secret')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
