# Security Hardening (2026-08)

This documents the security fixes applied to the IDCS codebase and the
deployment steps required to activate them.

## Changes

1. **Protected media serving** — `/media/` is no longer served directly by
   nginx. Every media request is authorized by `erp.media_views.ProtectedMediaView`
   and handed off via `X-Accel-Redirect` to an `internal` nginx location.
   - Anonymous access is allowed only for `PUBLIC_MEDIA_PREFIXES`
     (profile images, announcement covers/themes, event posters).
   - Everything else requires a valid session, JWT header, JWT httpOnly cookie,
     or a short-lived signed URL (`erp.media_views.signed_media_url`).
   - nginx configs updated: `deploy/nginx_idcs.conf`, `deploy/nginx_idcs3.conf`,
     `deploy/nginx_gate.conf`.

2. **Registration lockdown** — `RegisterView` now requires an admin
   (`IsAdminUser`) unless `ENABLE_OPEN_REGISTRATION=1` is explicitly set.

3. **Password policy** — `AUTH_PASSWORD_VALIDATORS` now enforces
   similarity/minimum-length/common-password/numeric checks
   (`PASSWORD_MIN_LENGTH`, default 8).

4. **API rate limiting** — DRF throttling enabled globally
   (`anon`/`user`) plus scoped limits on login, refresh, OTP, register and
   biometric ingest (`THROTTLE_*` env vars).

5. **Biometric key enforcement** — production refuses to start if
   `STAFF_BIOMETRIC_INGEST_KEY` is missing or shorter than 24 characters.

6. **JWT httpOnly cookies + refresh rotation** — token endpoints additionally
   set `httpOnly` cookies so clients can stop storing tokens in localStorage.
   Refresh tokens are rotated and blacklisted on every refresh.

7. **Backups** — `tools/backup_db.sh`, `tools/restore_db.sh`,
   `tools/test_restore.sh`, and systemd units
   (`deploy/idcs_backup.service` / `.timer`) for scheduled, verified, off-site
   capable backups.

8. **CI** — `.github/workflows/ci.yml` runs `check --deploy`, a compileall
   syntax pass, and the account test suite against PostgreSQL.

## Required deployment steps

```bash
# 1. Run the new blacklist migrations BEFORE enabling rotation (required once):
python manage.py migrate token_blacklist

# 2. Set the new environment variables (see backend/.env.example):
#    STAFF_BIOMETRIC_INGEST_KEY (>= 24 chars), THROTTLE_*, JWT_COOKIE_*,
#    ENABLE_OPEN_REGISTRATION, PASSWORD_MIN_LENGTH, PUBLIC_MEDIA_PREFIXES,
#    USE_X_ACCEL_REDIRECT

# 3. Reload nginx (media must now proxy to gunicorn):
sudo nginx -t && sudo systemctl reload nginx

# 4. Install and enable the backup timer:
sudo systemctl enable --now idcs_backup.timer

# 5. Test a restore once:
tools/test_restore.sh
```

## Notes / caveats

- In development (`runserver` / `DEBUG=True`) media still streams directly via
  Django's static serve — protection is a production concern.
- Clients that fetch protected media in `<img>`/`<a>` tags must use the
  httpOnly cookie (same-origin) or a signed URL (`signed_media_url`).
- `USE_X_ACCEL_REDIRECT` defaults to on in production; if you deploy without
  nginx in front, set it to `0` to stream files from Django directly.
