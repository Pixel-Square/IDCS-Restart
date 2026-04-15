# Added 'OBE.apps.ObeConfig', on 2026-01-27
# Added backend.OBE.apps.ObeConfig on 2026-01-27
import os
import sys
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

# Make python-dotenv optional so local tooling (manage.py, migrations) can run
# even if the dependency isn't installed in the current environment.

# Improved environment loader: supports .env.development and .env.production
try:
    from dotenv import load_dotenv
    env = os.getenv('ENVIRONMENT', 'development')
    dotenv_file = BASE_DIR / f'.env.{env}'
    if os.path.exists(dotenv_file):
        load_dotenv(dotenv_path=dotenv_file, override=True)
    else:
        load_dotenv(dotenv_path=BASE_DIR / '.env', override=True)
except Exception:
    pass

_django_secret_key = os.getenv('DJANGO_SECRET_KEY', '')
if not _django_secret_key:
    if os.getenv('DEBUG', '0') == '1':
        _django_secret_key = 'dev-secret-do-not-use-in-production'
    else:
        raise RuntimeError(
            'DJANGO_SECRET_KEY environment variable is not set. '
            'Add it to backend/.env before starting the server.'
        )
SECRET_KEY = _django_secret_key

DEBUG = os.getenv('DEBUG', '0') == '1'
RUNNING_RUNSERVER = 'runserver' in sys.argv

ALLOWED_HOSTS = (
    ['*'] if DEBUG else [
        'cloud.krgi.co.in',    # Frontend domain via tunnel
        'db.krgi.co.in',       # Your new database domain
        'idcs.krgi.co.in',     # Your new frontend domain
        'krgi.co.in',
        '.krgi.co.in',         # Allow all campus subdomains through Cloudflare
        '192.168.40.253',      # Your local IP
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '.db.krgi.co.in',      # Allow all subdomains for the new domain
        '.idcs.krgi.co.in',    # Allow all subdomains for the new domain
    ]
)

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party apps
    'rest_framework',
    'corsheaders',
    
    # Local apps - order matters for dependencies
    'accounts',
    'college',
    'curriculum',  # Must come before academics
    'academics',
    'timetable',
    'pbas.apps.PbasConfig',
    'staff_attendance.apps.StaffAttendanceConfig',
    'idcsscan',
    'feedback',
    'academic_calendar',
    'applications',
    'OBE',
    'COE',
    'question_bank',
    'template_api',
    'reporting',
    'announcements.apps.AnnouncementsConfig',
    'lms.apps.LmsConfig',
]
# Staff requests dynamic forms & workflow engine
INSTALLED_APPS.append('staff_requests')
INSTALLED_APPS.append('staff_salary')

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'erp.middleware.SlowRequestLoggingMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'erp.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'erp.wsgi.application'

DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASS = os.getenv('DB_PASS')
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
_missing_db_env = [
    key for key, value in (
        ('DB_NAME', DB_NAME),
        ('DB_USER', DB_USER),
        ('DB_PASS', DB_PASS),
        ('DB_HOST', DB_HOST),
    )
    if not value
]
if _missing_db_env:
    raise RuntimeError(
        'Missing required database environment variables: '
        + ', '.join(_missing_db_env)
        + '. Add them to backend/.env before starting the server.'
    )

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': DB_NAME,
        'USER': DB_USER,
        'PASSWORD': DB_PASS,
        'HOST': DB_HOST,
        'PORT': DB_PORT,
        # Prevent "cursor ... does not exist" errors when running behind
        # PgBouncer in transaction pooling mode (named/server-side cursors
        # are not compatible with transaction pooling).
        'DISABLE_SERVER_SIDE_CURSORS': True,
        # Keep default short-lived connections unless explicitly overridden.
        # Reuse DB connections to avoid reconnect overhead under concurrent login bursts.
        'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
        'CONN_HEALTH_CHECKS': True,
        'OPTIONS': {
            'server_side_binding': False,
            # Fail faster on unhealthy DB instead of hanging workers for long periods.
            'connect_timeout': int(os.getenv('DB_CONNECT_TIMEOUT', '5')),
        },
    }
}



# Django cache config using Redis (shared across all gunicorn workers).
# django-redis is installed; locmem is NEVER shared between workers so sessions
# always miss and hit the DB — use Redis to fix that.
_REDIS_URL = os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/1')
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': _REDIS_URL,
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'SOCKET_CONNECT_TIMEOUT': 5,
            'SOCKET_TIMEOUT': 5,
            'IGNORE_EXCEPTIONS': True,  # degrade gracefully if Redis blips
        },
        'TIMEOUT': 300,  # 5 minutes default TTL
    }
}

# Keep sessions mostly in cache to reduce DB pressure during concurrent auth traffic.
SESSION_ENGINE = os.getenv('SESSION_ENGINE', 'django.contrib.sessions.backends.cached_db')
SESSION_CACHE_ALIAS = 'default'

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Include the project-level `static/` folder so Django's staticfiles
# finders can locate the logo, admin CSS and other project assets.
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

# In production use ManifestStaticFilesStorage so static filenames are
# hashed for long-term caching. If you hit ManifestMissingFileError
# run collectstatic with the non-manifest storage to find missing refs.
# Temporarily using standard storage for better admin popup compatibility
if DEBUG:
    STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'
else:
    STATICFILES_STORAGE = os.getenv(
        'STATICFILES_STORAGE',
        'django.contrib.staticfiles.storage.ManifestStaticFilesStorage',
    )

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'accounts.User'

# Username is a display name only; login uses email/reg_no/staff_id.
# Suppress the warning about USERNAME_FIELD not being unique.
SILENCED_SYSTEM_CHECKS = ['auth.W004']

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'EXCEPTION_HANDLER': 'curriculum.views.custom_exception_handler',
}

# Slow endpoint tracing
SLOW_REQUEST_LOG_ENABLED = os.getenv('SLOW_REQUEST_LOG_ENABLED', '1') == '1'
SLOW_REQUEST_LOG_MS = int(os.getenv('SLOW_REQUEST_LOG_MS', '1200'))

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('ACCESS_TOKEN_MINUTES', '60'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Staff biometric realtime ingestion security.
# If this is set, callers to /api/staff-attendance/biometric/realtime/
# must provide header: X-Biometric-Key: <value>
STAFF_BIOMETRIC_INGEST_KEY = os.getenv('STAFF_BIOMETRIC_INGEST_KEY', '').strip()

# API key for machine-to-machine reads from reporting API endpoints.
# Callers can pass it in header X-Reporting-Api-Key (preferred) or X-API-Key.
REPORTING_API_KEY = os.getenv('REPORTING_API_KEY', '').strip()

# eSSL/ZKTeco realtime listener defaults (used by sync_essl_realtime command).
ESSL_DEVICE_IP = os.getenv('ESSL_DEVICE_IP', '192.168.81.80').strip()
ESSL_DEVICE_PORT = int(os.getenv('ESSL_DEVICE_PORT', '4370'))
ESSL_DEVICE_PASSWORD = int(os.getenv('ESSL_DEVICE_PASSWORD', '0'))
ESSL_RECONNECT_DELAY = int(os.getenv('ESSL_RECONNECT_DELAY', '5'))
ESSL_CONNECT_TIMEOUT = int(os.getenv('ESSL_CONNECT_TIMEOUT', '8'))

# --- SMS / OTP ---
# OTP verification uses `accounts.services.sms.send_sms`.
# By default, SMS_BACKEND=console which logs the SMS (useful for dev).
# To actually send OTP messages, configure one of these backends:
# - HTTP GET SMS gateway:
#     SMS_BACKEND=http_get
#     SMS_GATEWAY_URL="https://your-sms-provider.example/send?to={to}&message={message}"
# - Twilio Verify:
#     SMS_BACKEND=twilio
#     TWILIO_ACCOUNT_SID=AC...
#     TWILIO_AUTH_TOKEN=...
#     TWILIO_SERVICE_SID=VA...
# - WhatsApp (reuses the existing whatsapp-web.js microservice settings used by OBE notifications):
#     SMS_BACKEND=whatsapp
#     OBE_WHATSAPP_API_URL="http://127.0.0.1:3000/send-whatsapp"
#     OBE_WHATSAPP_API_KEY="..."
SMS_BACKEND = str(os.getenv('SMS_BACKEND', 'console') or 'console').strip().lower()
SMS_GATEWAY_URL = str(os.getenv('SMS_GATEWAY_URL', '') or '').strip()

# --- Twilio SMS / OTP ---
# Twilio credentials for OTP verification
TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN', '')
TWILIO_SERVICE_SID = os.getenv('TWILIO_SERVICE_SID', '')

# Restrict CORS to explicit origins when credentials (cookies/auth) are used.
# Wildcard '*' is invalid with `Access-Control-Allow-Credentials: true`.
# In local development, allow all origins to avoid brittle localhost/port mismatches.
CORS_ALLOW_ALL_ORIGINS = DEBUG

def _split_env_csv(name: str) -> list[str]:
    return [v.strip() for v in str(os.getenv(name, '') or '').split(',') if v.strip()]


_PROD_WEB_ORIGINS = [
    # Electron desktop app (packaged) uses a custom scheme origin.
    # This must be explicitly allowed or requests will fail with generic
    # "Failed to fetch" errors due to CORS.
    'app://-',
    # Some Electron configurations / file:// flows can use Origin: null.
    'null',
    'https://idcs.krgi.co.in',
    'https://db.krgi.co.in',
    'https://cloud.krgi.co.in',
    'https://coe.krgi.co.in',
]

# CSRF trusted origins must be absolute http(s) origins in Django 4+.
_PROD_CSRF_ORIGINS = [
    'https://idcs.krgi.co.in',
    'https://db.krgi.co.in',
    'https://cloud.krgi.co.in',
    'https://coe.krgi.co.in',
]

_DEFAULT_DEBUG_ORIGINS = [
    'http://localhost',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:82',
    'http://localhost:81',
    'http://localhost:8000',
    'http://localhost:83',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:82',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:83',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5176',
    'http://127.0.0.1:5177',
]

CORS_ALLOWED_ORIGINS = _split_env_csv('CORS_ALLOWED_ORIGINS') or list(_PROD_WEB_ORIGINS)

if DEBUG:
    CORS_ALLOWED_ORIGINS += _DEFAULT_DEBUG_ORIGINS
    CORS_ALLOWED_ORIGINS += _split_env_csv('CORS_DEV_EXTRA_ORIGINS')

# Always keep production origins allowed unless explicitly overridden at deploy level.
for _origin in _PROD_WEB_ORIGINS:
    if _origin not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(_origin)

# De-duplicate while preserving order.
CORS_ALLOWED_ORIGINS = list(dict.fromkeys(CORS_ALLOWED_ORIGINS))

# Allow browser to include credentials (cookies or HTTP auth) in cross-origin requests
CORS_ALLOW_CREDENTIALS = True

# Allow configuring CSRF trusted origins via environment variable
# Provide comma-separated origins including scheme, e.g. 'https://db.zynix.us'
CSRF_TRUSTED_ORIGINS = _split_env_csv('CSRF_TRUSTED_ORIGINS') or list(_PROD_CSRF_ORIGINS)
# In DEBUG add localhost aliases for convenience
if DEBUG:
    CSRF_TRUSTED_ORIGINS += [
        'http://localhost',
        'http://127.0.0.1',
        'http://localhost:82',
        'http://127.0.0.1:82',
        'http://localhost:83',
        'http://127.0.0.1:83',
    ]
    CSRF_TRUSTED_ORIGINS += _split_env_csv('CSRF_DEV_EXTRA_ORIGINS')
# Always allow the production dashboard hostname if not already present
if 'https://db.krgi.co.in' not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append('https://db.krgi.co.in')
# Always allow the production frontend hostname if not already present
if 'https://idcs.krgi.co.in' not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append('https://idcs.krgi.co.in')
if 'https://cloud.krgi.co.in' not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append('https://cloud.krgi.co.in')
if 'https://coe.krgi.co.in' not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append('https://coe.krgi.co.in')

CSRF_TRUSTED_ORIGINS = list(dict.fromkeys(CSRF_TRUSTED_ORIGINS))

# --- Production security hardening ---
# Keep these settings env-driven so local development remains frictionless,
# while production defaults become secure-by-default.
DATA_ENCRYPTION_KEY = os.getenv('DATA_ENCRYPTION_KEY', '')

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
# Disabled: Cloudflare Tunnel already enforces HTTPS at the edge;
# enabling this causes infinite redirect loops when the tunnel delivers
# requests as HTTP to the origin server.
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', '0' if DEBUG else '1') == '1'
CSRF_COOKIE_SECURE = os.getenv('CSRF_COOKIE_SECURE', '0' if DEBUG else '1') == '1'

SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '0' if DEBUG else '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv('SECURE_HSTS_INCLUDE_SUBDOMAINS', '0' if DEBUG else '1') == '1'
SECURE_HSTS_PRELOAD = os.getenv('SECURE_HSTS_PRELOAD', '0' if DEBUG else '1') == '1'

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = os.getenv('SECURE_REFERRER_POLICY', 'strict-origin-when-cross-origin')

# Optional: restrict which account may publish marks via the web UI/backend.
# Set to a username or email (string). If empty/None publishing remains unrestricted
# (aside from existing permission checks). Example: 'iqac.user@example.com'
OBE_PUBLISH_ALLOWED_USERNAME = os.getenv('OBE_PUBLISH_ALLOWED_USERNAME', '')
# OBE edit-request approval notifications
# Email notification uses Django SMTP settings.
OBE_EDIT_NOTIFICATION_EMAIL_ENABLED = os.getenv('OBE_EDIT_NOTIFICATION_EMAIL_ENABLED', '1') == '1'
OBE_NOTIFICATION_EMAIL_TIMEOUT = int(os.getenv('OBE_NOTIFICATION_EMAIL_TIMEOUT', '10'))

# WhatsApp notification uses local Node.js whatsapp-web.js microservice.
OBE_EDIT_NOTIFICATION_WHATSAPP_ENABLED = os.getenv('OBE_EDIT_NOTIFICATION_WHATSAPP_ENABLED', '1') == '1'
OBE_WHATSAPP_API_URL = os.getenv('OBE_WHATSAPP_API_URL', 'http://127.0.0.1:3000/send-whatsapp')
# Optional: if the local gateway is down, you can provide a secondary WhatsApp send endpoint.
# Example: https://db.krgi.co.in/whatsapp/send-whatsapp
OBE_WHATSAPP_API_URL_FALLBACK = os.getenv('OBE_WHATSAPP_API_URL_FALLBACK', '')
# Optional explicit base URL for gateway status/QR endpoints (used by IQAC Settings page).
# If empty, the backend derives the base URL from OBE_WHATSAPP_API_URL.
OBE_WHATSAPP_GATEWAY_BASE_URL = os.getenv('OBE_WHATSAPP_GATEWAY_BASE_URL', '')
# Optional secondary base URL for the IQAC Settings QR/Status page.
OBE_WHATSAPP_GATEWAY_BASE_URL_FALLBACK = os.getenv('OBE_WHATSAPP_GATEWAY_BASE_URL_FALLBACK', '')
OBE_WHATSAPP_API_KEY = os.getenv('OBE_WHATSAPP_API_KEY', '')
OBE_WHATSAPP_TIMEOUT_SECONDS = float(os.getenv('OBE_WHATSAPP_TIMEOUT_SECONDS', '8'))
OBE_WHATSAPP_DEFAULT_COUNTRY_CODE = os.getenv('OBE_WHATSAPP_DEFAULT_COUNTRY_CODE', '91')
OBE_WHATSAPP_ALLOW_NON_LOCAL_URL = os.getenv('OBE_WHATSAPP_ALLOW_NON_LOCAL_URL', '0') == '1'

# Applications WhatsApp notifications (approval workflow)
# Uses the same whatsapp-web.js gateway configured by OBE_WHATSAPP_* settings.
# Enable by setting: APPLICATION_WHATSAPP_NOTIFICATIONS_ENABLED=1
APPLICATION_WHATSAPP_NOTIFICATIONS_ENABLED = os.getenv('APPLICATION_WHATSAPP_NOTIFICATIONS_ENABLED', '0') == '1'

# WhatsApp gateway conventions vary; these paths control what the IQAC Settings page proxies.
OBE_WHATSAPP_GATEWAY_STATUS_PATH = os.getenv('OBE_WHATSAPP_GATEWAY_STATUS_PATH', '/status')
OBE_WHATSAPP_GATEWAY_QR_IMAGE_PATH = os.getenv('OBE_WHATSAPP_GATEWAY_QR_IMAGE_PATH', '/qr.png')
OBE_WHATSAPP_GATEWAY_QR_PATH = os.getenv('OBE_WHATSAPP_GATEWAY_QR_PATH', '/qr')

# --- Email (Linux local relay) configuration ---
# Use Django SMTP backend with the local MTA (Postfix/Sendmail) listening on localhost:25.
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', 'rohit08sk@gmail.com')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', '1') == '1'
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', '0') == '1'
EMAIL_TIMEOUT = int(os.getenv('EMAIL_TIMEOUT', '10'))
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'rohit08sk@gmail.com')

# --- Django Admin Configuration ---
# Allow Django admin popups to work properly by setting X-Frame-Options to SAMEORIGIN
# This prevents the "Cannot read properties of null (reading 'dismissAddRelatedObjectPopup')" error
X_FRAME_OPTIONS = 'SAMEORIGIN'

# ── Canva Connect API ─────────────────────────────────────────────────────────
# Register your app at https://www.canva.com/developers/ and set these in .env:
#   CANVA_CLIENT_ID=<your-client-id>
#   CANVA_CLIENT_SECRET=<your-client-secret>
CANVA_CLIENT_ID     = os.getenv('CANVA_CLIENT_ID', '')
CANVA_CLIENT_SECRET = os.getenv('CANVA_CLIENT_SECRET', '')
# Full URL that Canva redirects the browser to after authorisation.
# Must be registered in the Canva Developer Portal under your app's "Redirect URLs".
# Dev (via Vite proxy):   http://localhost:5174/api/canva/oauth/callback
# Production (via Nginx): https://idcs.krgi.co.in/api/canva/oauth/callback
CANVA_REDIRECT_URI  = os.getenv('CANVA_REDIRECT_URI', '')

# Canva OAuth scopes (space-separated). Keep minimal by default; Canva will
# reject auth requests if scopes are not enabled for the client.
CANVA_SCOPES = os.getenv(
    'CANVA_SCOPES',
    'design:content:read design:content:write',
)

# ── n8n Branding Poster Automation ────────────────────────────────────────────
# Webhook URL of the n8n workflow that drives Canva autofill poster generation.
# Set this to the URL shown in the "Receive Event Webhook" node after activating
# the workflow in n8n (e.g. https://n8n.example.com/webhook/canva-poster).
N8N_BRANDING_WEBHOOK_URL = os.getenv('N8N_BRANDING_WEBHOOK_URL', '')

# Shared secret validated by the IDCS poster-callback endpoint and sent back
# by n8n when it POSTs the generated poster URL.  Must match on both sides.
N8N_WEBHOOK_SECRET = os.getenv('N8N_WEBHOOK_SECRET', '')

# Public base URL of this Django backend (no trailing slash).
# Used to build the callback URL embedded in the n8n payload.
# E.g.: https://idcs.krgi.co.in
IDCS_BACKEND_URL = os.getenv('IDCS_BACKEND_URL', '')

# Canva Brand Template ID for the event branding poster.
# Copy this from the Canva URL of the template design:
#   https://www.canva.com/design/<TEMPLATE_ID>/edit
CANVA_BRANDING_TEMPLATE_ID = os.getenv('CANVA_BRANDING_TEMPLATE_ID', '')
