# Added 'OBE.apps.ObeConfig', on 2026-01-27
# Added backend.OBE.apps.ObeConfig on 2026-01-27
import os
from pathlib import Path
from datetime import timedelta

# Make python-dotenv optional so local tooling (manage.py, migrations) can run
# even if the dependency isn't installed in the current environment.
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'dev-secret')

DEBUG = os.getenv('DEBUG', '0') == '1'

ALLOWED_HOSTS = (
    ['*'] if DEBUG else [
        'db.zynix.us',
        'idcs.zynix.us',
        '192.168.40.253',
        'localhost',
        '127.0.0.1',
        'localhost',
        '0.0.0.0',
        '.db.zynix.us',   # allow all subdomains
        '.idcs.zynix.us', # allow all subdomains
    ]
)

INSTALLED_APPS = [
    'grappelli',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'accounts',
    'academics',
    'curriculum',
    'college',
    'applications',
    'OBE.apps.ObeConfig',
    'template_api.apps.TemplateApiConfig',
    'question_bank.apps.QuestionBankConfig',
    'timetable',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
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

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME'),
        'USER': os.getenv('DB_USER'),
        'PASSWORD': os.getenv('DB_PASS'),
        'HOST': os.getenv('DB_HOST'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
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
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.ManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'accounts.User'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'EXCEPTION_HANDLER': 'curriculum.views.custom_exception_handler',
}

from rest_framework_simplejwt.settings import api_settings as jwt_api_settings

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('ACCESS_TOKEN_MINUTES', '60'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ...existing code...
# Restrict CORS to explicit origins when credentials (cookies/auth) are used.
# Wildcard '*' is invalid with `Access-Control-Allow-Credentials: true`.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    'http://localhost:81',
    'http://127.0.0.1:3000',
    'https://idcs.zynix.us',
    "http://192.168.40.253:81",
]
# Allow browser to include credentials (cookies or HTTP auth) in cross-origin requests
CORS_ALLOW_CREDENTIALS = True

# Allow configuring CSRF trusted origins via environment variable
# Provide comma-separated origins including scheme, e.g. 'https://db.zynix.us'
csrf_env = os.getenv('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [h.strip() for h in csrf_env.split(',') if h.strip()]
# In DEBUG add localhost aliases for convenience
if DEBUG:
    CSRF_TRUSTED_ORIGINS += ['http://localhost', 'http://127.0.0.1']
# Always allow the production dashboard hostname if not already present
if 'https://db.zynix.us' not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append('https://db.zynix.us')
# Always allow the production frontend hostname if not already present
if 'https://idcs.zynix.us' not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append('https://idcs.zynix.us')

# Optional: restrict which account may publish marks via the web UI/backend.
# Set to a username or email (string). If empty/None publishing remains unrestricted
# (aside from existing permission checks). Example: 'iqac.user@example.com'
OBE_PUBLISH_ALLOWED_USERNAME = os.getenv('OBE_PUBLISH_ALLOWED_USERNAME', '')
# ...existing code...
