# Phase 1 — Module A: `accounts` (login, sessions, tokens, impersonation)

Date: 2026-10-23 · Branch `hostel` · Static review plus code reading. **Report only: no application
code changed.** Proposed diffs below are not applied; tests are written with each fix after approval.

Context decided by the owner (2026-10-23): one deployment and database per college (option A);
backups in India; payment gateway planned, not built; KR Tracker (Flutter) and KR-GATE (Electron)
are in production, so they keep bearer-token login.

Scope: `backend/accounts/` (views, serializers, impersonation, services/sms, management commands),
the auth-related settings in `erp/settings.py`, the WhatsApp OTP gateway (`whatsapp-server/server.js`)
and the Nginx proxy headers that feed rate limiting.

## Summary

| ID | Sev | OWASP 2025 | Location | Finding |
|---|---|---|---|---|
| ACC-01 | **Critical** | A07 | `accounts/management/commands/bulk_reset_passwords.py:9,49,97`; `academics/admin.py:401` | Passwords reset or defaulted to the register number / staff ID, with no forced change |
| ACC-02 | **High** | A07/A02 | `erp/settings.py` (`NUM_PROXIES` unset); `deploy/nginx_idcs.conf:64,77,93,174,188` | Login rate limit bypassed by sending a fake `X-Forwarded-For` |
| ACC-03 | **High** | A07/A09 | `accounts/serializers.py:600-739`; `erp/urls.py:22` | No per-account lockout, no failed-login logging; Django admin login at `/admin/` not rate-limited at all |
| ACC-04 | **High** | A01 | `accounts/serializers_impersonation.py:97-142` | IQAC role (not only superusers) can impersonate anyone, superusers included; restriction fails open |
| ACC-05 | **High** | A07/A04 | `erp/settings.py:298`; `frontend/src/services/fetchAuth.ts`; `coe/src/services/fetchAuth.ts` | JWT in `localStorage`, 1-day refresh, no rotation/blacklist, no logout, password change revokes nothing |
| ACC-06 | **High** | A07/A09 | `template_api/canva_views.py:388`; `academic_calendar/proposal_views.py:376,679` | JWT accepted in the URL query string |
| ACC-07 | Medium | A01/A07 | `accounts/views.py:633-647` | Self-service change of email (a login identifier) without re-authentication or validation; username change silently ignored |
| ACC-08 | Medium | A01/A08 | `accounts/views.py:649-651,731-813` | Students edit their own mobile number (bypassing OTP), roll numbers, degree, DOB |
| ACC-09 | Medium | A02 | `erp/settings.py:198` and `:255` | `AUTH_PASSWORD_VALIDATORS` defined twice; the second wins, so the minimum length is 8, not 10 |
| ACC-10 | Medium | A04 | `erp/settings.py` (no `PASSWORD_HASHERS`) | PBKDF2 (Django default) instead of Argon2id |
| ACC-11 | Medium | A07 | `accounts/serializers.py:672-677` | Inactive/debarred student status checked only at login; existing tokens keep working |
| ACC-12 | Medium | A09 | `accounts/services/sms.py:107` | Default SMS backend writes phone number + full message (OTPs) to the log |
| ACC-13 | Medium | A04/A07 | `whatsapp-server/server.js:92` | OTP from `Math.random()`; requesting a new OTP resets the 5-try limit |
| ACC-14 | Low | A07 | `accounts/serializers.py:654-658` | Login timing reveals whether an identifier exists |
| ACC-15 | Low | A09 | `accounts/serializers_impersonation.py:235-242` | Impersonation audit IP taken from the client-controlled first `X-Forwarded-For` entry |
| ACC-16 | Low | A09 | `accounts/serializers.py:679` | API login never updates `last_login`; no login/logout audit events; `impersonated_by` claim never read |
| ACC-17 | Low | A02 | `erp/settings.py:536` | A personal Gmail address is the default system email sender |
| ACC-18 | Low | A05 | `accounts/views.py:665-673` | Profile image accepted on extension **or** content type; no content check |
| ACC-19 | Low | A07 | `accounts/views.py:455-540` | Password checks in change-password / remove-mobile are not rate-limited |
| ACC-20 | Info | — | `accounts/authentication.py`, `accounts/middleware.py` | Dead code: `CustomAdminBackend` and `ShutdownLockdownMiddleware` are not installed |

Verified OK: generic login error for wrong identifier or password; `is_active` checked at login and
refresh (SimpleJWT 5.5.1); passwords never returned by serializers; WhatsApp gateway admin views are
IQAC/superuser-only; `UserQueryDetailView` is owner-scoped; roles in the JWT are not trusted by the
backend (no code reads them).

---

## ACC-01 — Default passwords equal to register number / staff ID (Critical)

**Where:** `bulk_reset_passwords.py:9` ("Staff password = staff_id, Student password = reg_no"),
`:49`, `:97` (`user.set_password(new_password)`), `:64,73` (prints each password), `:122` ("All students
can now login with their reg_no as password"). Same pattern in the Django-admin importer,
`academics/admin.py:401` (`password = str(password) if password else reg_no`). Nothing forces a
change at first login: there is no `must_change_password` flag anywhere.

**Exploit:** register numbers and staff IDs appear on ID cards, attendance sheets and notice boards.
Anyone who knows one logs in as that student (marks, fees, address, parents' phones) or that staff
member (mark entry). Combined with ACC-02, the attacker does not even need the list.

**Status in production: unknown.** Please check on the server with the count-only command below
(it prints numbers, never names or passwords).

**Fix (proposed):**
1. Delete `bulk_reset_passwords.py`; replace it with `issue_initial_passwords` that generates random
   12-character one-time passwords, writes them to an encrypted export for the college office, and
   sets `must_change_password=True`.
2. Add `User.must_change_password` (migration, default `False`; adds a column, rewrites no data).
3. New DRF permission `PasswordChangeNotRequired`, added to `DEFAULT_PERMISSION_CLASSES`: while the
   flag is set, every endpoint except `me/`, `change-password/` and token refresh returns 403
   `{"code": "password_change_required"}`. `ChangePasswordView` clears the flag.
4. `academics/admin.py:401`: require a password column, or generate one with the flag set.
5. After deploying: run the check, then set the flag for every account it flags.

```diff
--- a/backend/academics/admin.py
+++ b/backend/academics/admin.py
@@ -401 +401,3 @@
-                    password = str(password) if password else reg_no
+                    if not password:
+                        password = get_random_string(14)
+                        must_change = True
```

Count-only check (to run on the server; reads hashes, prints counts):

```python
# python manage.py shell -c "exec(open('check_default_passwords.py').read())"
from academics.models import StudentProfile, StaffProfile
s = sum(1 for sp in StudentProfile.objects.select_related('user').iterator() if sp.user and sp.reg_no and sp.user.check_password(sp.reg_no))
t = sum(1 for st in StaffProfile.objects.select_related('user').iterator() if st.user and st.staff_id and st.user.check_password(st.staff_id))
print('students with password == reg_no:', s); print('staff with password == staff_id:', t)
```
(Slow by design — one hash check per account; run it off-peak.)

**Test:**
```python
def test_flagged_user_blocked_until_password_changed(self):
    self.student.must_change_password = True; self.student.save()
    self.client.force_authenticate(self.student)
    self.assertEqual(self.client.get('/api/academic-v2/cycles/').status_code, 403)
    self.client.post('/api/accounts/change-password/', {...valid change...})
    self.assertEqual(self.client.get('/api/academic-v2/cycles/').status_code, 200)
```

---

## ACC-02 — Rate-limit bypass with a forged `X-Forwarded-For` (High)

**Where:** Nginx sends `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
(`deploy/nginx_idcs.conf:64` and four more), which **appends** to whatever the client sent.
`REST_FRAMEWORK` has no `NUM_PROXIES`, so DRF's `get_ident()` uses the whole header string
(`rest_framework/throttling.py`, `''.join(xff.split())`) as the throttle key.

**Exploit:** send `X-Forwarded-For: <random>` with every login request. Each value is a new bucket,
so the 10/min `auth` limit (and the OTP and impersonation limits) never trigger: unlimited password
guessing, including ACC-01's predictable passwords. The opposite also happens: without the header,
every user arrives as `127.0.0.1` from cloudflared and shares one bucket, so 10 failed logins
anywhere lock out the whole college for a minute.

**Fix (proposed):**
```diff
--- a/deploy/nginx_idcs.conf   (http or server block)
+    # Requests arrive from cloudflared on localhost; trust Cloudflare's client IP only from there.
+    set_real_ip_from 127.0.0.1;
+    set_real_ip_from ::1;
+    real_ip_header CF-Connecting-IP;
@@ every location that proxies to gunicorn
-        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_set_header X-Forwarded-For $remote_addr;   # overwrite, never append
--- a/backend/erp/settings.py
@@ REST_FRAMEWORK = {
+    'NUM_PROXIES': int(os.getenv('DRF_NUM_PROXIES', '1')),
```
Also add one helper, `erp.client_ip.get_client_ip(request)`, with the same rule. Use it for the
impersonation log (ACC-15), the LMS download log and the branding log.

**Test:**
```python
@override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, 'NUM_PROXIES': 1})
def test_spoofed_forwarded_for_does_not_reset_login_throttle(self):
    for i in range(11):
        res = self.client.post('/api/accounts/token/', {'identifier': 'x', 'password': 'y'},
                               HTTP_X_FORWARDED_FOR=f'10.0.0.{i}, 203.0.113.7')
    self.assertEqual(res.status_code, 429)
```

---

## ACC-03 — No account lockout, no failed-login trail, admin login unthrottled (High)

**Where:** `IdentifierTokenObtainPairSerializer.validate` calls `user.check_password()` directly
(`serializers.py:657`), so Django's `user_login_failed` signal never fires and lockout libraries cannot
hook in. `/admin/` (`erp/urls.py:22`) is a plain Django login: DRF throttles do not apply.

**Exploit:** slow, distributed guessing against one account never trips an IP limit. `/admin/` can
be brute-forced at full speed through the tunnel.

**Fix (proposed):**
1. Add `accounts.backends.IdentifierBackend` (email / username / reg_no / staff_id resolution moved out
   of the serializer). The serializer calls `django.contrib.auth.authenticate(request, identifier=…,
   password=…)`.
2. Add **django-axes** (`AXES_FAILURE_LIMIT=5`, `AXES_COOLOFF_TIME=timedelta(minutes=15)`,
   `AXES_LOCKOUT_PARAMETERS=[['username', 'ip_address']]`, `AXES_IPWARE_META_PRECEDENCE_ORDER=['REMOTE_ADDR']`
   after ACC-02). It covers both the API and `/admin/`. Migration: axes tables only.
3. Move admin to an env-configured path (`ADMIN_URL`), restrict it in Nginx to the campus LAN, and add
   MFA (django-otp TOTP) for superusers and IQAC — tracked as ACC-03b.

**Test:** six bad passwords for one user from six different IPs → the seventh correct-password attempt
is rejected with 429/403 until the cool-off ends; the same holds for `/admin/login/`.

---

## ACC-04 — Impersonation open to IQAC and fail-open restrictions (High)

**Where:** `serializers_impersonation.py:97-108` accepts Django superuser **or** IQAC role **or**
`admin.manage`. `:133-142`: if no `SuperuserImpersonationPermission` row exists, everything is allowed
("backward compatibility / trust superuser"). No check stops impersonating a superuser or another
IQAC. Tokens are normal 1-day tokens. The `impersonated_by` claim (`:154`) is never read, so actions
taken while impersonating are recorded as the target's.

**Exploit:** an IQAC account (or anyone holding its password) impersonates a Django superuser and gains
everything superusers can do over the API. Its actions are attributed to the victim.

**Fix (proposed):**
```diff
-        if not (is_django_superuser or has_iqac_role or has_admin_manage):
+        if not is_django_superuser:
             raise serializers.ValidationError('Account is not authorized to impersonate users.')
@@
-            if perm:
-                can_impersonate, reason_msg = perm.can_impersonate(target_user)
-                if not can_impersonate:
-                    raise serializers.ValidationError(reason_msg)
-            # If no permission record exists, allow (backward compatibility / trust superuser)
+            if target_user.is_superuser or _is_privileged(target_user):
+                raise serializers.ValidationError('Privileged accounts cannot be impersonated.')
+            if perm is None:
+                raise serializers.ValidationError('No impersonation grant for this account.')
+            can_impersonate, reason_msg = perm.can_impersonate(target_user)
+            if not can_impersonate:
+                raise serializers.ValidationError(reason_msg)
@@
-        refresh = RefreshToken.for_user(target_user)
+        access = AccessToken.for_user(target_user)          # no refresh token
+        access.set_exp(lifetime=timedelta(minutes=15))
+        access['impersonated_by'] = superuser.id
```
Add a small middleware that reads `impersonated_by` from the validated token and records the real
actor on every write request (feeds the Phase 2 audit log). If IQAC genuinely needs "view as user",
give it a read-only mode that rejects unsafe methods.

**Test:** an IQAC-only account gets 401 from `/api/accounts/impersonate/`; a superuser without a grant
row gets 401; impersonating a superuser target gets 401; the issued token has no refresh token and
expires in ≤ 15 minutes.

---

## ACC-05 — Token storage, lifetime and revocation (High) — migration plan

**Where:** `SIMPLE_JWT` (`erp/settings.py:298`): access 60 min, refresh 1 day, no
`ROTATE_REFRESH_TOKENS`, no blacklist app. Both SPAs keep `access`/`refresh` (plus `me`, `roles`,
`permissions`) in `localStorage`. There is no logout endpoint (logout = deleting localStorage).
`ChangePasswordView` (`views.py:537`) revokes nothing.

**Exploit:** any XSS (see audit #6/#7: public same-origin uploads, coder preview) reads the refresh token
and keeps the account for a day. Even after the victim changes their password, the stolen refresh token
keeps working.

**Plan (two steps, both proposed):**

*Step 1 — revocation (small, safe):*
```diff
 INSTALLED_APPS += [
+    'rest_framework_simplejwt.token_blacklist',
 ]
 SIMPLE_JWT = {
-    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('ACCESS_TOKEN_MINUTES', '60'))),
+    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('ACCESS_TOKEN_MINUTES', '15'))),
     'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
+    'ROTATE_REFRESH_TOKENS': True,
+    'BLACKLIST_AFTER_ROTATION': True,
+    'UPDATE_LAST_LOGIN': True,
```
Plus `POST /api/accounts/logout/` (blacklists the given refresh token) and, in `ChangePasswordView`,
blacklisting every outstanding token for the user. Migration: adds the two blacklist tables; no data
rewritten. Mobile apps keep working (they already store and refresh tokens). They just must save
the rotated refresh token each time — **check KR Tracker and KR-GATE do this before enabling rotation**.

*Step 2 — browser moves to an HttpOnly cookie (keeps bearer for mobile):*
- New `POST /api/accounts/web/login|refresh|logout`. The refresh token goes in a cookie
  `idcs_refresh` (`HttpOnly; Secure; SameSite=Strict; Path=/api/accounts/web/`). The access token is
  returned in the body and held **in memory only** in `fetchAuth.ts`.
- `web/refresh` requires the `X-CSRFToken` header (double-submit) because it is cookie-authenticated.
- `fetchAuth.ts` (frontend and coe): drop all `localStorage` token code; on page load call `web/refresh`;
  on 401 refresh once, then redirect to login. Rewrite the 8 files that set `Authorization` by hand to
  use the wrapper. Stop caching `me`/`roles`/`permissions` in `localStorage` (keep in memory or
  `sessionStorage` without tokens).
- `/api/accounts/token/` and `/token/refresh/` stay unchanged for KR Tracker and KR-GATE.

**Tests:** after logout, refreshing with the old refresh token returns 401; after a password change,
all previously issued refresh tokens return 401; `web/login` sets a cookie with `HttpOnly`, `Secure`,
`SameSite=Strict` and returns no refresh token in the body; `web/refresh` without the CSRF header
returns 403.

---

## ACC-06 — JWT in query strings (High)

**Where:** `template_api/canva_views.py:388-392` reads `?token=`, `?access_token=`, `?jwt=`;
`academic_calendar/proposal_views.py:376,679` use the same helper for downloads.

**Exploit:** full-privilege tokens land in Cloudflare and Nginx access logs, browser history and
`Referer` headers sent to Canva.

**Fix:** issue a single-purpose signed download ticket (`django.core.signing.TimestampSigner`, payload
`{user_id, resource_id, purpose}`, `max_age=60`). The SPA requests it with the normal Authorization
header, then navigates to `…?ticket=…`. Remove the JWT query fallback.
**Test:** `GET …/final-download/?token=<valid JWT>` returns 401; a ticket for proposal A cannot download
proposal B; a ticket older than 60 s returns 401.

---

## ACC-07 — Email change without re-authentication; username ignored (Medium)

**Where:** `views.py:633-635` sets `user.email` from the request with no password check, format check or
uniqueness check (a duplicate raises `IntegrityError` → 500 at the later `user.save()`). Email is a
login identifier (`serializers.py:620`). `:639-647` validates a new username but never assigns it.

**Exploit:** someone with a briefly stolen token rebinds the account's email (an identifier they then
control for any future email-based reset flow) without knowing the password.

**Fix:** remove `email` and `username` from `ProfileUpdateView`. Add `POST /api/accounts/change-email/`
that requires `current_password`, validates with `EmailValidator`, checks uniqueness
case-insensitively, and records an audit event (an email-confirmation link can follow when outgoing
email is institutional — ACC-17).
**Test:** PATCH profile with a new email leaves it unchanged; change-email with a wrong password returns
400; a duplicate email returns 400, not 500.

## ACC-08 — Students edit verified or official fields (Medium)

**Where:** `views.py:649-651` (`user.mobile_no`) and `:731-733` (`student_profile.mobile_number`) bypass
the OTP flow (`mobile_number_verified_at` stays stale). `:753-762` (`dept_roll_no`, `section_roll_no`,
`degree`, `gender`) and `:783` (`dob`) are official academic identity.

**Fix:** explicit allow-list for self-service (address lines, district, pincode, blood group, transport,
boarding point, parent names/phones). Mobile changes only through OTP verify. Roll numbers, degree,
DOB and gender become office-only (or go through a correction request — this also serves the DPDP
"right to correction" in Phase 2).
**Test:** a student PATCH with `dept_roll_no`/`dob`/`mobile_number` leaves them unchanged, and the
response lists the ignored fields.

## ACC-09 — Duplicate password-validator block (Medium)

Delete the second block (`erp/settings.py:255-271`) so the stronger first block (min 10) applies.
**Test:** `validate_password('Abcdefgh1!')` (10 characters) passes and `'Abcdef1!x'` (9) fails.

## ACC-10 — Argon2id (Medium)

Add `argon2-cffi` and put
`PASSWORD_HASHERS = ['django.contrib.auth.hashers.Argon2PasswordHasher', 'django.contrib.auth.hashers.PBKDF2PasswordHasher', …]`.
Existing hashes upgrade on each user's next login; no migration, no data rewrite.
**Test:** after `set_password`, `user.password` starts with `argon2$`; logging in with a legacy PBKDF2
hash succeeds and upgrades it.

## ACC-11 — Debarred/inactive students keep access (Medium)

Subclass `JWTAuthentication.get_user()` to reject users whose `student_profile.status` is `INACTIVE` or
`DEBAR` (and make `TokenRefresh` use the same rule via `USER_AUTHENTICATION_RULE`). With ACC-05 step 1,
blacklist the student's tokens when the status changes.
**Test:** a token issued before debarment returns 401 on the next request and on refresh.

## ACC-12 — OTPs in logs (Medium)

`sms.py:107` logs `to=<full number> message=<full text>`. Log `to=******1234 len=<n>` only. In
production (`DEBUG=0`) refuse the `console` backend at startup (`ImproperlyConfigured`).
**Test:** with `assertLogs`, sending an OTP produces no log line containing the digits or the full
number.

## ACC-13 — Weak OTP generation and attempt reset (Medium)

`server.js:92`: use `crypto.randomInt(0, 10)` (or `randomInt(100000, 1000000)`). Cap OTP requests per
mobile number (for example 3 per 15 minutes) in the Node gateway, and keep the attempt counter across
re-requests within that window.
**Test (Node):** the fourth request in the window returns 429; after five wrong codes, a new request
does not reset the counter.

## ACC-14 — Timing-based user enumeration (Low)

When no user matches, run `make_password(password)` (or check against a fixed dummy hash) before
raising, so both paths cost one hash.
**Test:** unit-test that the dummy hash path calls the hasher once (mock `check_password`/`make_password`).

## ACC-15 — Spoofable IP in the impersonation audit log (Low)

Replace `_get_client_ip` with the shared helper from ACC-02 (`REMOTE_ADDR` after Nginx real-IP).
**Test:** a request with a forged `X-Forwarded-For` is logged with the real `REMOTE_ADDR`.

## ACC-16 — No login audit trail (Low)

`UPDATE_LAST_LOGIN=True` (ACC-05) plus `user_logged_in` / `user_login_failed` / logout receivers that
write to the Phase 2 append-only audit log (user id, masked identifier, IP, user agent, result).
Read `impersonated_by` in the audit middleware (ACC-04).

## ACC-17 — Personal Gmail as system sender (Low)

Remove the default `EMAIL_HOST_USER` value (`settings.py:536`); require it from the environment and use
an institutional mailbox. Listed in the processor register as row 2.

## ACC-18 — Profile image validation (Low)

Use `erp.upload_security.validate_upload(file, allowed=('jpg','jpeg','png'), max_bytes=2 MB)` for both
the multipart path (`views.py:665-675`) and the legacy base64 path (`:566-620`).
**Test:** an HTML payload named `photo.png` with `Content-Type: image/png` returns 400.

## ACC-19 — Unthrottled password confirmations (Low)

Give `ChangePasswordView` and `MobileRemoveView` `throttle_scope = 'auth'`, and count their failures in
axes (ACC-03).

## ACC-20 — Dead code (Info)

Remove `accounts/authentication.py` (`CustomAdminBackend` is not in `AUTHENTICATION_BACKENDS`) and decide
whether `ShutdownLockdownMiddleware` should be kept as a documented emergency kill switch (it is not
installed).

---

## Proposed order of fixes (each with its tests, each its own change)

1. ACC-02 (Nginx + `NUM_PROXIES`) and ACC-09: small, no data impact.
2. ACC-01: `must_change_password` (migration, adds a column), remove the reset command, fix the admin importer.
3. ACC-04: impersonation.
4. ACC-03: identifier backend + django-axes (migration: axes tables).
5. ACC-05 step 1: rotation, blacklist, logout, revoke on password change (migration: blacklist tables).
   **Confirm the mobile apps store rotated refresh tokens first.**
6. ACC-07, ACC-08, ACC-11, ACC-12, ACC-10, ACC-14–ACC-19.
7. ACC-05 step 2 (cookie for the browser) and ACC-06 (download tickets), together with frontend changes.

Migrations in steps 2, 4 and 5 only add tables or columns; none rewrites or encrypts existing data.
Take a `pg_dump -Fc` backup before applying them anyway.
