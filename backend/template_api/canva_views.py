"""
template_api/canva_views.py

Django proxy views for the Canva Connect REST API.
All browser fetch() calls from the React frontend target these endpoints so that:
  1. The Canva client_secret never leaves the server.
  2. CORS restrictions between the browser and api.canva.com are avoided.

Configuration (add to erp/settings.py or environment):
  CANVA_CLIENT_ID     = os.environ.get('CANVA_CLIENT_ID', '')
  CANVA_CLIENT_SECRET = os.environ.get('CANVA_CLIENT_SECRET', '')

Required pip packages: requests (already present in most Django projects)
"""

import base64
import hashlib
import json
import logging
import mimetypes
import secrets
import time
import os
from urllib.parse import urlencode, unquote, urlparse

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.http import JsonResponse
from django.shortcuts import redirect as dj_redirect
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import EventPosterAttachment, CanvaTemplate, CanvaServiceToken, CanvaOAuthState
from django.utils import timezone
from datetime import timedelta


def _get_service_token() -> str:
    """
    Return the stored branding-user Canva access_token (service-account token).
    Returns empty string if not set.
    """
    row = CanvaServiceToken.objects.first()
    return row.access_token if row else ''

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token'
CANVA_REVOKE_URL = 'https://api.canva.com/rest/v1/oauth/revoke'
CANVA_API_BASE = 'https://api.canva.com/rest/v1'

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_credentials():
    client_id = getattr(settings, 'CANVA_CLIENT_ID', '')
    client_secret = getattr(settings, 'CANVA_CLIENT_SECRET', '')
    return client_id, client_secret


def _canva_headers(access_token: str) -> dict:
    return {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
    }


def _fetch_image_bytes(image_url: str) -> tuple[bytes, str, str] | None:
    """Fetch image bytes server-side so Canva never has to reach local/private URLs."""
    try:
        parsed = urlparse(image_url)
        media_url = str(getattr(settings, 'MEDIA_URL', '/media/') or '/media/')
        local_hosts = {'127.0.0.1', 'localhost', '0.0.0.0', ''}

        if parsed.scheme in ('', 'http', 'https') and parsed.hostname in local_hosts and parsed.path.startswith(media_url):
            rel_path = parsed.path[len(media_url):].lstrip('/')
            if rel_path:
                from django.core.files.storage import default_storage

                if default_storage.exists(rel_path):
                    with default_storage.open(rel_path, 'rb') as fh:
                        content_bytes = fh.read()
                    content_type = mimetypes.guess_type(rel_path)[0] or 'application/octet-stream'
                    if not content_type.startswith('image/'):
                        logger.warning('Local upload is not recognized as an image: %s', rel_path)
                        return None
                    raw_name = os.path.basename(rel_path).strip() or 'idcs-upload.png'
                    return content_bytes, content_type, raw_name[:80]

        resp = requests.get(image_url, timeout=30)
        if not resp.ok:
            logger.warning('Failed to fetch image source (%s): %s', resp.status_code, image_url)
            return None

        content_type = resp.headers.get('Content-Type', 'application/octet-stream').split(';')[0].strip()
        if not content_type.startswith('image/'):
            logger.warning('Fetched upload source is not an image (%s): %s', content_type, image_url)
            return None

        raw_name = os.path.basename(parsed.path or '').strip() or 'idcs-upload'
        raw_name = unquote(raw_name)
        if '.' not in raw_name:
            ext = mimetypes.guess_extension(content_type) or '.png'
            raw_name = f'{raw_name}{ext}'

        return resp.content, content_type, raw_name[:80]
    except Exception as exc:
        logger.error('_fetch_image_bytes error for %s: %s', image_url, exc)
        return None


def _json_body(request) -> dict:
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, Exception):
        return {}


def _error(msg: str, status: int = 400) -> JsonResponse:
    return JsonResponse({'detail': msg}, status=status)


def _get_request_access_token(request, body: dict | None = None) -> str:
    body = body or {}
    return request.GET.get('access_token', '') or body.get('access_token', '') or _get_service_token()


def _canva_error(response: requests.Response, default_message: str) -> JsonResponse:
    """Return a clearer Django error from a Canva API error response."""
    try:
        payload = response.json()
    except Exception:
        payload = {}

    code = str(payload.get('code', '')).strip()
    message = str(payload.get('message', '')).strip()

    if code == 'missing_scope' and message:
        return _error(f'{default_message}: {message}. Reconnect Canva after backend restart.', response.status_code)
    if message:
        return _error(f'{default_message}: {message}', response.status_code)
    return _error(f'{default_message} ({response.status_code})', response.status_code)


# ── Server-side OAuth (PKCE, backend-handled – same flow as ecommerce starter kit) ──

CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize'

# Scopes must be enabled for the Canva client in the Developer Portal. If you
# request a scope that isn't enabled, Canva returns:
#   "Requested scopes are not allowed for this client."
_DEFAULT_CANVA_SCOPES = ' '.join([
    'design:content:read',
    'design:content:write',
])

CANVA_SCOPES = (getattr(settings, 'CANVA_SCOPES', '') or _DEFAULT_CANVA_SCOPES).strip()

_SESSION_KEYS = [
    'canva_pkce_verifier', 'canva_oauth_state',
    'canva_oauth_origin', 'canva_redirect_uri',
]


@require_http_methods(['GET'])
def oauth_authorize(request):
    """
    GET /api/canva/oauth/authorize?origin=<frontend-origin>

    Generates PKCE code_verifier + code_challenge, stores them in the server
    session (mirroring the starter-kit's signed-cookie approach), then redirects
    the browser to Canva's authorisation page.

    The ?origin parameter lets the backend know which frontend URL to redirect
    back to after a successful/failed token exchange.
    """
    client_id, client_secret = _get_credentials()
    if not client_id:
        return _error('CANVA_CLIENT_ID is not configured.', 500)

    origin = request.GET.get('origin', '').rstrip('/')
    if not origin:
        scheme = 'https' if request.is_secure() else 'http'
        origin = f'{scheme}://{request.get_host()}'

    # PKCE — code_verifier (43-byte base64url) + code_challenge (SHA-256)
    verifier  = secrets.token_urlsafe(43)
    digest    = hashlib.sha256(verifier.encode('ascii')).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')
    state     = secrets.token_urlsafe(16)

    # redirect_uri: Canva sends the browser here after authorisation.
    # Must be registered in the Canva Developer Portal.
    redirect_uri = getattr(settings, 'CANVA_REDIRECT_URI', None) or \
                   f'{origin}/api/canva/oauth/callback'

    # Purge stale states older than 10 minutes
    CanvaOAuthState.objects.filter(
        created_at__lt=timezone.now() - timedelta(minutes=10)
    ).delete()

    # Store PKCE state in DB (not session) so it survives hostname changes,
    # e.g. localhost vs 127.0.0.1 in development.
    CanvaOAuthState.objects.filter(state=state).delete()  # safety
    CanvaOAuthState.objects.create(
        state=state,
        verifier=verifier,
        redirect_uri=redirect_uri,
        origin=origin,
    )

    params = urlencode({
        'response_type':         'code',
        'client_id':             client_id,
        'redirect_uri':          redirect_uri,
        'scope':                 CANVA_SCOPES,
        'code_challenge':        challenge,
        'code_challenge_method': 'S256',
        'state':                 state,
    })
    return dj_redirect(f'{CANVA_AUTH_URL}?{params}')


@require_http_methods(['GET'])
def oauth_callback(request):
    """
    GET /api/canva/oauth/callback?code=...&state=...

    Canva redirects here.  Validates state, exchanges the authorisation code for
    OAuth tokens, persists them in the session, and redirects the browser back to
    the frontend templates page.
    """
    code  = request.GET.get('code', '')
    state = request.GET.get('state', '')

    # Look up PKCE state from DB (hostname-independent)
    try:
        state_obj = CanvaOAuthState.objects.get(state=state)
        verifier     = state_obj.verifier
        redirect_uri = state_obj.redirect_uri
        origin       = state_obj.origin
        state_obj.delete()  # one-time use
    except CanvaOAuthState.DoesNotExist:
        origin = ''
        logger.warning('Canva OAuth: unknown or expired state %r', state)
        verifier = redirect_uri = ''

    front_ok  = f'{origin}/branding/templates?canva_connected=1' if origin else '/branding/templates?canva_connected=1'
    front_err = lambda msg: dj_redirect(
        f'{origin}/branding/templates?canva_error={requests.utils.quote(str(msg))}'
        if origin else f'/branding/templates?canva_error={requests.utils.quote(str(msg))}'
    )

    error = request.GET.get('error')
    if error:
        desc = request.GET.get('error_description', error)
        return front_err(desc)

    if not code:
        return front_err('no_code_returned')

    if not verifier:
        logger.warning('Canva OAuth: no verifier found for state %r', state)
        return front_err('state_mismatch')

    client_id, client_secret = _get_credentials()
    resp = requests.post(
        CANVA_TOKEN_URL,
        data={
            'grant_type':    'authorization_code',
            'code':           code,
            'code_verifier':  verifier,
            'redirect_uri':   redirect_uri,
            'client_id':      client_id,
            'client_secret':  client_secret,
        },
        timeout=15,
    )

    if not resp.ok:
        logger.error('Canva callback token exchange failed (%s): %s', resp.status_code, resp.text)
        return front_err(f'token_exchange_failed_{resp.status_code}')

    data        = resp.json()
    expires_at  = int((time.time() + data.get('expires_in', 3600)) * 1000)
    user_obj    = data.get('user', {})

    request.session['canva_access_token']  = data.get('access_token', '')
    request.session['canva_refresh_token'] = data.get('refresh_token', '')
    request.session['canva_expires_at']    = expires_at
    request.session['canva_user_id']       = user_obj.get('id', '')
    request.session['canva_display_name']  = user_obj.get('display_name', 'Canva User')
    request.session.modified = True

    # ── Also persist as the IDCS branding service token ─────────────────────
    # This allows HODs to invoke Canva API calls without connecting their own
    # Canva account — the backend uses this token automatically.
    CanvaServiceToken.objects.all().delete()
    CanvaServiceToken.objects.create(
        access_token  = data.get('access_token', ''),
        refresh_token = data.get('refresh_token', ''),
        expires_at    = expires_at,
        user_id       = user_obj.get('id', ''),
        display_name  = user_obj.get('display_name', 'Canva User'),
    )

    # Clean up PKCE keys
    for key in _SESSION_KEYS:
        request.session.pop(key, None)

    return dj_redirect(front_ok)


@csrf_exempt
@require_http_methods(['GET', 'DELETE'])
def connection_status(request):
    """
    GET    /api/canva/oauth/connection  → returns current session connection info
    DELETE /api/canva/oauth/connection  → revokes token + clears session
    """
    if request.method == 'DELETE':
        access_token = request.session.get('canva_access_token') or _get_service_token()
        if access_token:
            client_id, client_secret = _get_credentials()
            try:
                requests.post(
                    CANVA_REVOKE_URL,
                    data={
                        'token':         access_token,
                        'client_id':     client_id,
                        'client_secret': client_secret,
                    },
                    timeout=10,
                )
            except Exception:
                pass
        for key in ['canva_access_token', 'canva_refresh_token',
                    'canva_expires_at', 'canva_user_id', 'canva_display_name']:
            request.session.pop(key, None)
        request.session.modified = True
        CanvaServiceToken.objects.all().delete()  # clear DB service token too
        return JsonResponse({'ok': True})

    # Primary: session (same-host requests)
    access_token = request.session.get('canva_access_token')
    if access_token:
        return JsonResponse({
            'connected':    True,
            'access_token': access_token,
            'expires_at':   request.session.get('canva_expires_at', 0),
            'user_id':      request.session.get('canva_user_id', ''),
            'display_name': request.session.get('canva_display_name', 'Canva User'),
        })

    # Fallback: DB service token (handles hostname mismatches in dev, e.g.
    # callback through 127.0.0.1 but app running on localhost).
    row = CanvaServiceToken.objects.first()
    if row and row.access_token:
        now_ms = int(time.time() * 1000)
        # Auto-refresh if token has expired or expires within 5 minutes
        if row.expires_at and now_ms >= (row.expires_at - 5 * 60 * 1000):
            if row.refresh_token:
                try:
                    client_id, client_secret = _get_credentials()
                    resp = requests.post(
                        CANVA_TOKEN_URL,
                        data={
                            'grant_type':    'refresh_token',
                            'refresh_token':  row.refresh_token,
                            'client_id':      client_id,
                            'client_secret':  client_secret,
                        },
                        timeout=15,
                    )
                    if resp.ok:
                        rdata = resp.json()
                        row.access_token  = rdata.get('access_token', row.access_token)
                        row.refresh_token = rdata.get('refresh_token', row.refresh_token)
                        row.expires_at    = int((time.time() + rdata.get('expires_in', 3600)) * 1000)
                        row.save()
                        logger.info('Canva service token auto-refreshed OK')
                    else:
                        logger.warning('Canva token refresh failed (%s): %s', resp.status_code, resp.text[:200])
                        # Token expired and refresh failed — user must reconnect
                        return JsonResponse({'connected': False, 'reason': 'token_expired'})
                except Exception as exc:
                    logger.error('Canva token refresh error: %s', exc)
                    return JsonResponse({'connected': False, 'reason': 'token_expired'})
            else:
                # No refresh token stored — user must reconnect
                return JsonResponse({'connected': False, 'reason': 'token_expired'})

        return JsonResponse({
            'connected':    True,
            'access_token': row.access_token,
            'expires_at':   row.expires_at,
            'user_id':      row.user_id,
            'display_name': row.display_name or 'Canva User',
        })

    return JsonResponse({'connected': False})


# ── IDCS Template library (DB-backed, shared across all users) ────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def templates_api(request):
    """
    GET  /api/canva/templates → list saved IDCS Canva Brand Templates only
    POST /api/canva/templates → save a new template { name, canva_design_id,
                                                       thumbnail_url, is_brand_template,
                                                       edit_url, saved_by }
    """
    if request.method == 'GET':
        items = CanvaTemplate.objects.filter(is_brand_template=True).order_by('-saved_at')
        return JsonResponse({
            'templates': [
                {
                    'id':               t.id,
                    'name':             t.name,
                    'canvaTemplateId':  t.canva_design_id,
                    'previewUrl':       t.thumbnail_url,
                    'is_brand_template': t.is_brand_template,
                    'editUrl':          t.edit_url,
                    'savedBy':          t.saved_by,
                    'savedAt':          t.saved_at.isoformat(),
                }
                for t in items
            ]
        })

    body = _json_body(request)
    name            = body.get('name', '').strip()
    canva_design_id = body.get('canva_design_id', '').strip() or body.get('canvaTemplateId', '').strip()
    if not name or not canva_design_id:
        return _error('name and canva_design_id are required.')

    t = CanvaTemplate.objects.create(
        name              = name,
        canva_design_id   = canva_design_id,
        thumbnail_url     = body.get('thumbnail_url', '') or body.get('previewUrl', ''),
        is_brand_template = bool(body.get('is_brand_template', False)),
        edit_url          = body.get('edit_url', '') or body.get('editUrl', ''),
        saved_by          = body.get('saved_by', '') or body.get('savedBy', ''),
    )
    return JsonResponse({
        'id': t.id, 'name': t.name, 'canvaTemplateId': t.canva_design_id,
    }, status=201)


@csrf_exempt
@require_http_methods(['DELETE'])
def template_detail_api(request, template_id: int):
    """DELETE /api/canva/templates/<id>"""
    try:
        CanvaTemplate.objects.get(id=template_id).delete()
        return JsonResponse({'ok': True})
    except CanvaTemplate.DoesNotExist:
        return _error('Template not found.', 404)


# ── Service-account status (for HOD pages) ───────────────────────────────────

@require_http_methods(['GET'])
def service_status(request):
    """
    GET /api/canva/service_status
    Returns whether the branding user has connected Canva (i.e. a service token
    is stored in the DB). HOD pages use this to know whether Canva features
    are available without requiring the HOD to connect their own Canva account.
    """
    row = CanvaServiceToken.objects.first()
    if row and row.access_token:
        return JsonResponse({
            'available':    True,
            'display_name': row.display_name,
        })
    return JsonResponse({'available': False})


# ── OAuth (legacy frontend-PKCE helper, kept for backwards-compat) ───────────

@csrf_exempt
@require_http_methods(['POST'])
def oauth_token(request):
    """
    Exchange an authorisation code for Canva OAuth tokens.
    Expects JSON body: { code, code_verifier, redirect_uri }
    """
    client_id, client_secret = _get_credentials()
    if not client_id or not client_secret:
        return _error('Canva credentials (CANVA_CLIENT_ID / CANVA_CLIENT_SECRET) are not configured.', 500)

    body = _json_body(request)
    code = body.get('code', '')
    verifier = body.get('code_verifier', '')
    redirect_uri = body.get('redirect_uri', '')

    if not code or not verifier or not redirect_uri:
        return _error('code, code_verifier and redirect_uri are required.')

    resp = requests.post(
        CANVA_TOKEN_URL,
        data={
            'grant_type':    'authorization_code',
            'code':           code,
            'code_verifier':  verifier,
            'redirect_uri':   redirect_uri,
            'client_id':      client_id,
            'client_secret':  client_secret,
        },
        timeout=15,
    )

    if not resp.ok:
        logger.error('Canva token exchange failed: %s', resp.text)
        return _error(f'Canva token exchange failed: {resp.status_code}', resp.status_code)

    data = resp.json()
    return JsonResponse({
        'access_token':  data.get('access_token'),
        'refresh_token': data.get('refresh_token'),
        'expires_in':    data.get('expires_in', 3600),
        'user_id':       data.get('user', {}).get('id', ''),
        'display_name':  data.get('user', {}).get('display_name', 'Canva User'),
    })


@csrf_exempt
@require_http_methods(['POST'])
def oauth_revoke(request):
    """Revoke a Canva access token."""
    client_id, client_secret = _get_credentials()
    body = _json_body(request)
    access_token = body.get('access_token', '')
    if not access_token:
        return _error('access_token is required.')

    resp = requests.post(
        CANVA_REVOKE_URL,
        data={
            'token':         access_token,
            'client_id':     client_id,
            'client_secret': client_secret,
        },
        timeout=10,
    )
    return JsonResponse({'ok': resp.ok})


# ── Designs ───────────────────────────────────────────────────────────────────

@require_http_methods(['GET'])
def brand_templates(request):
    """
    GET /api/canva/brand-templates?query=...&dataset=non_empty
         → list the user's Canva Brand Templates with autofill datasets.
    """
    access_token = _get_request_access_token(request)
    query = request.GET.get('query', '').strip()
    continuation = request.GET.get('continuation', '').strip()

    if not access_token:
        # Canva not configured — return empty list so the UI degrades gracefully
        return JsonResponse({'items': []}, status=200)

    params = {
        'limit': request.GET.get('limit', '100'),
        'ownership': request.GET.get('ownership', 'any'),
        'sort_by': request.GET.get('sort_by', 'modified_descending'),
        'dataset': request.GET.get('dataset', 'non_empty'),
    }
    if query:
        params['query'] = query
    if continuation:
        params['continuation'] = continuation

    resp = requests.get(
        f'{CANVA_API_BASE}/brand-templates',
        headers=_canva_headers(access_token),
        params=params,
        timeout=20,
    )
    if not resp.ok:
        logger.error('Canva list brand templates failed: %s', resp.text)
        return _canva_error(resp, 'Failed to list brand templates')
    return JsonResponse(resp.json())


@require_http_methods(['GET'])
def brand_template_dataset(request, brand_template_id: str):
    """
    GET /api/canva/brand-templates/<brand_template_id>/dataset
         → return the Canva autofill dataset definition for this Brand Template.
    """
    access_token = _get_request_access_token(request)
    if not access_token:
        return JsonResponse({'dataset': {}}, status=200)

    resp = requests.get(
        f'{CANVA_API_BASE}/brand-templates/{brand_template_id}/dataset',
        headers=_canva_headers(access_token),
        timeout=20,
    )
    if not resp.ok:
        logger.error('Canva get brand template dataset failed: %s', resp.text)
        return _canva_error(resp, 'Failed to load brand template dataset')
    return JsonResponse(resp.json())

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def designs(request):
    """
    GET  /api/canva/designs?access_token=...&query=...
         → list the user's Canva designs (up to 50)

    POST /api/canva/designs
         body: { access_token, template_id }
         → create a new design from an existing template/design
    """
    if request.method == 'GET':
        access_token = request.GET.get('access_token', '') or _get_service_token()
        query = request.GET.get('query', '')
        if not access_token:
            return _error('access_token not provided and no Canva service token is configured.')

        params = {'limit': 50}
        if query:
            params['query'] = query

        resp = requests.get(
            f'{CANVA_API_BASE}/designs',
            headers=_canva_headers(access_token),
            params=params,
            timeout=15,
        )
        if not resp.ok:
            logger.error('Canva list designs failed: %s', resp.text)
            return _error(f'Failed to list designs ({resp.status_code})', resp.status_code)
        return JsonResponse(resp.json())

    # POST: create design from template
    body = _json_body(request)
    access_token = body.get('access_token', '') or _get_service_token()
    template_id  = body.get('template_id', '')
    if not access_token or not template_id:
        return _error('access_token (or service token) and template_id are required.')

    payload = {
        'design_type': {
            'type': 'from_template',
            'template_id': template_id,
        }
    }
    resp = requests.post(
        f'{CANVA_API_BASE}/designs',
        headers=_canva_headers(access_token),
        json=payload,
        timeout=15,
    )
    if not resp.ok:
        logger.error('Canva create design failed: %s', resp.text)
        return _error(f'Failed to create design ({resp.status_code})', resp.status_code)
    return JsonResponse(resp.json())


# ── Autofill ──────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def autofills_submit(request):
    """
    POST /api/canva/autofills
    body: { access_token, brand_template_id, data: { field_key: { type, text } } }
    """
    body = _json_body(request)
    access_token      = body.get('access_token', '') or _get_service_token()
    brand_template_id = body.get('brand_template_id', '')
    data_fields       = body.get('data', {})

    if not access_token or not brand_template_id:
        return _error('access_token (or service token) and brand_template_id are required.')

    payload = {
        'brand_template_id': brand_template_id,
        'data':              data_fields,
    }
    resp = requests.post(
        f'{CANVA_API_BASE}/autofills',
        headers=_canva_headers(access_token),
        json=payload,
        timeout=15,
    )
    if not resp.ok:
        logger.error('Canva autofill submit failed: %s', resp.text)
        return _error(f'Autofill failed ({resp.status_code})', resp.status_code)
    return JsonResponse(resp.json())


@require_http_methods(['GET'])
def autofills_poll(request, job_id: str):
    """
    GET /api/canva/autofills/<job_id>?access_token=...
    """
    access_token = request.GET.get('access_token', '') or _get_service_token()
    if not access_token:
        return _error('access_token not provided and no service token configured.')

    resp = requests.get(
        f'{CANVA_API_BASE}/autofills/{job_id}',
        headers=_canva_headers(access_token),
        timeout=15,
    )
    if not resp.ok:
        return _error(f'Autofill poll failed ({resp.status_code})', resp.status_code)
    return JsonResponse(resp.json())


# ── Image / Thumbnail proxy (server-side, avoids CORS on CDN URLs) ────────────

@require_http_methods(['GET'])
def thumbnail_proxy(request):
    """
    GET /api/canva/thumbnail-proxy/?url=<encoded_thumbnail_url>

    Fetches the given URL server-side (using the requests library) and returns
    the image bytes encoded as a data-URL JSON:

        { "dataUrl": "data:image/png;base64,..." }

    This completely avoids CORS restrictions: Canva CDN images cannot be fetched
    directly from the browser's origin, but the backend has no such restriction.
    The endpoint is intentionally unauthenticated because the URLs are already
    short-lived signed CDN tokens that only Canva knows how to generate.
    """
    url = request.GET.get('url', '').strip()
    if not url:
        return _error('url query parameter is required.', 400)

    # Basic allowlist: only proxy canva.com CDN and storage URLs
    from urllib.parse import urlparse
    parsed = urlparse(url)
    allowed_hosts = (
        'canva.com', 'canva-assets.com', 'canva-edge.com',
        'canvaassets.com', 'storage.googleapis.com',
        # local dev / tests
        '127.0.0.1', 'localhost',
    )
    if not any(parsed.netloc.endswith(h) for h in allowed_hosts):
        # Fallback: allow if it looks like a data-URL (nothing to proxy)
        if not url.startswith('data:'):
            return _error('URL host not allowed.', 403)

    if url.startswith('data:'):
        # Already a data-URL — return as-is
        return JsonResponse({'dataUrl': url})

    try:
        resp = requests.get(
            url,
            timeout=20,
            headers={
                'User-Agent': 'IDCS-Server/1.0',
                'Accept':     'image/*,*/*',
            },
            stream=False,
        )
    except requests.RequestException as exc:
        return _error(f'Could not fetch thumbnail: {exc}', 502)

    if not resp.ok:
        return _error(f'Remote server returned {resp.status_code}', resp.status_code)

    content_type = resp.headers.get('Content-Type', 'image/png').split(';')[0].strip()
    if not content_type.startswith('image/'):
        content_type = 'image/png'

    img_b64 = base64.b64encode(resp.content).decode('ascii')
    return JsonResponse({'dataUrl': f'data:{content_type};base64,{img_b64}'})


@require_http_methods(['GET'])
def design_info(request, design_id: str):
    """
    GET /api/canva/designs/<design_id>/info

    Fetches the design metadata from the Canva API using the service token.
    Returns { id, title, thumbnailUrl } so the frontend can load any saved
    Canva template as a background image without the HOD needing a Canva session.
    """
    token = _get_service_token()
    if not token:
        return _error('Canva service token not available. Ask the Branding admin to reconnect.', 503)

    resp = requests.get(
        f'{CANVA_API_BASE}/designs/{design_id}',
        headers=_canva_headers(token),
        timeout=15,
    )
    if not resp.ok:
        logger.error('Canva design info failed (%s): %s', resp.status_code, resp.text[:300])
        return _error(f'Canva API returned {resp.status_code}', resp.status_code)

    data   = resp.json()
    design = data.get('design', data)  # Canva wraps in 'design' key
    thumbnail = design.get('thumbnail', {})

    return JsonResponse({
        'id':           design.get('id', design_id),
        'title':        design.get('title', ''),
        'thumbnailUrl': thumbnail.get('url', ''),
        'editUrl':      design.get('urls', {}).get('edit_url', ''),
    })


# ── Exports ───────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def exports_submit(request):
    """
    POST /api/canva/exports
    body: { access_token, design_id, format: 'png' | 'pdf' }
    """
    body = _json_body(request)
    access_token = body.get('access_token', '') or _get_service_token()
    design_id    = body.get('design_id', '')
    fmt          = body.get('format', 'png').lower()

    if not access_token or not design_id:
        return _error('access_token (or service token) and design_id are required.')
    if fmt not in ('png', 'pdf'):
        return _error('format must be png or pdf.')

    format_type = 'PNG' if fmt == 'png' else 'PDF'
    payload = {
        'design_id': design_id,
        'format':    {'type': format_type},
    }
    resp = requests.post(
        f'{CANVA_API_BASE}/exports',
        headers=_canva_headers(access_token),
        json=payload,
        timeout=15,
    )
    if not resp.ok:
        logger.error('Canva export submit failed: %s', resp.text)
        return _error(f'Export failed ({resp.status_code})', resp.status_code)
    return JsonResponse(resp.json())


@require_http_methods(['GET'])
def exports_poll(request, job_id: str):
    """
    GET /api/canva/exports/<job_id>?access_token=...
    """
    access_token = request.GET.get('access_token', '') or _get_service_token()
    if not access_token:
        return _error('access_token not provided and no service token configured.')

    resp = requests.get(
        f'{CANVA_API_BASE}/exports/{job_id}',
        headers=_canva_headers(access_token),
        timeout=15,
    )
    if not resp.ok:
        return _error(f'Export poll failed ({resp.status_code})', resp.status_code)
    return JsonResponse(resp.json())


# ── Event poster storage ──────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def event_poster(request, event_id: str):
    """
    POST /api/canva/events/<event_id>/poster
    body: { canva_design_id, export_urls: [url, ...], format }

    Downloads each URL from Canva CDN and stores it as an EventPosterAttachment.
    Returns: { stored_urls: [...], attachment_ids: [...] }

    GET /api/canva/events/<event_id>/poster
    Returns list of stored posters for the event.
    """
    if request.method == 'GET':
        attachments = EventPosterAttachment.objects.filter(event_id=event_id)
        return JsonResponse({
            'attachments': [
                {
                    'id':         a.id,
                    'format':     a.format,
                    'url':        request.build_absolute_uri(a.file.url) if a.file else '',
                    'uploaded_at': a.uploaded_at.isoformat(),
                }
                for a in attachments
            ]
        })

    # POST
    body = _json_body(request)
    canva_design_id = body.get('canva_design_id', '')
    export_urls     = body.get('export_urls', [])
    fmt             = body.get('format', 'png').lower()

    if not export_urls:
        return _error('export_urls is required.')

    stored_urls    = []
    attachment_ids = []

    for url in export_urls[:5]:  # safety cap
        try:
            cdn_resp = requests.get(url, timeout=30, stream=True)
            cdn_resp.raise_for_status()

            ext = 'pdf' if fmt == 'pdf' else 'png'
            filename = f'event_{event_id}_canva_{canva_design_id[:12]}.{ext}'
            content_file = ContentFile(cdn_resp.content, name=filename)

            attachment = EventPosterAttachment.objects.create(
                event_id=event_id,
                canva_design_id=canva_design_id,
                format=fmt,
                file=content_file,
                source_url=url,
            )
            attachment_ids.append(attachment.id)
            stored_urls.append(request.build_absolute_uri(attachment.file.url))

        except Exception as exc:
            logger.error('Failed to store poster from %s: %s', url, exc)

    return JsonResponse({
        'stored_urls':    stored_urls,
        'attachment_ids': attachment_ids,
    })


# ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
# IDCS POSTER MAKER  (new end-to-end flow: Frontend → Django → n8n → Canva)
# ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

# ── Image helpers ─────────────────────────────────────────────────────────────

def _upload_image_url_to_canva(image_url: str, access_token: str) -> str | None:
    """
    Upload an image into Canva's asset library and return the resulting asset ID.

    Important: user uploads in local development are typically saved under
    localhost/127.0.0.1 media URLs, which Canva cannot fetch directly. So the
    backend downloads the bytes first, then sends them to Canva's binary asset
    upload API.

    Returns the Canva asset_id on success, or None if it fails.

    Canva API: POST /v1/asset-uploads with raw bytes and
    Asset-Upload-Metadata header.
    """
    try:
        fetched = _fetch_image_bytes(image_url)
        if not fetched:
            return None

        content_bytes, content_type, filename = fetched
        name_b64 = base64.b64encode(filename.encode('utf-8')).decode('ascii')
        resp = requests.post(
            f'{CANVA_API_BASE}/asset-uploads',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/octet-stream',
                'Asset-Upload-Metadata': json.dumps({'name_base64': name_b64}),
            },
            data=content_bytes,
            timeout=20,
        )
        if not resp.ok:
            logger.warning('Canva asset-upload submit failed (%s): %s', resp.status_code, resp.text[:200])
            return None

        job_id = resp.json().get('job', {}).get('id', '')
        if not job_id:
            return None

        # Poll up to 40 s (20 × 2 s)
        for _ in range(20):
            time.sleep(2)
            poll = requests.get(
                f'{CANVA_API_BASE}/asset-uploads/{job_id}',
                headers=_canva_headers(access_token),
                timeout=15,
            )
            if not poll.ok:
                continue
            data = poll.json().get('job', {})
            status = data.get('status', '')
            if status == 'success':
                asset_id = data.get('asset', {}).get('id', '')
                return asset_id or None
            if status == 'failed':
                logger.warning('Canva asset-upload job failed: %s', data)
                return None
    except Exception as exc:
        logger.error('_upload_image_url_to_canva error: %s', exc)
    return None


def _run_generate_poster(brand_template_id: str, fields: dict, fmt: str, access_token: str) -> dict:
    """
    Core poster generation logic (synchronous, called inline).

    1. For each image-URL field → upload to Canva assets → swap to asset_id field
    2. Submit autofill job
    3. Poll autofill until done → design_id
    4. Submit export job (PNG or PDF)
    5. Poll export until done → export_url
    6. Optionally fetch export_url as base64 dataUrl
    Returns dict with keys: design_id, export_url, dataUrl, error
    """
    result = {'design_id': '', 'export_url': '', 'dataUrl': '', 'error': ''}
    warnings: list[str] = []

    if not access_token:
        result['error'] = 'No Canva service token available.'
        return result

    # ── Step 1: handle image URL fields ────────────────────────────────────
    autofill_data = {}
    for key, value in fields.items():
        if isinstance(value, dict):
            ftype = value.get('type', 'text')
            if ftype == 'text':
                autofill_data[key] = {'type': 'text', 'text': str(value.get('text', ''))}
            elif ftype == 'image':
                image_url = value.get('url', '')
                if image_url:
                    asset_id = _upload_image_url_to_canva(image_url, access_token)
                    if asset_id:
                        autofill_data[key] = {'type': 'image', 'asset_id': asset_id}
                    else:
                        logger.warning('Skipping image field %s — upload failed', key)
                        warnings.append(f'Image field "{key}" could not be uploaded to Canva')
            # skip unknown types
        elif isinstance(value, str) and value.strip():
            # shorthand: bare string → text field
            autofill_data[key] = {'type': 'text', 'text': value.strip()}

    if not autofill_data:
        result['error'] = 'No valid autofill fields provided.'
        return result

    # ── Step 2: submit autofill ─────────────────────────────────────────────
    af_resp = requests.post(
        f'{CANVA_API_BASE}/autofills',
        headers=_canva_headers(access_token),
        json={'brand_template_id': brand_template_id, 'data': autofill_data},
        timeout=20,
    )
    if not af_resp.ok:
        result['error'] = f'Autofill submit failed ({af_resp.status_code}): {af_resp.text[:200]}'
        return result

    af_job_id = af_resp.json().get('job', {}).get('id', '')
    if not af_job_id:
        result['error'] = 'No autofill job ID returned.'
        return result

    # ── Step 3: poll autofill ───────────────────────────────────────────────
    design_id = ''
    for _ in range(30):  # 60 s max
        time.sleep(2)
        poll = requests.get(
            f'{CANVA_API_BASE}/autofills/{af_job_id}',
            headers=_canva_headers(access_token),
            timeout=15,
        )
        if not poll.ok:
            continue
        pdata = poll.json().get('job', {})
        if pdata.get('status') == 'success':
            design_id = (
                pdata.get('result', {}).get('design', {}).get('id', '')
            )
            break
        if pdata.get('status') == 'failed':
            result['error'] = f'Autofill job failed: {pdata}'
            return result

    if not design_id:
        result['error'] = 'Autofill job timed out.'
        return result

    result['design_id'] = design_id

    # ── Step 4: submit export ───────────────────────────────────────────────
    # Canva expects lowercase format type values like 'pdf' or 'png'
    format_type = fmt if fmt in ('pdf', 'png') else 'png'
    ex_resp = requests.post(
        f'{CANVA_API_BASE}/exports',
        headers=_canva_headers(access_token),
        json={'design_id': design_id, 'format': {'type': format_type}},
        timeout=20,
    )
    if not ex_resp.ok:
        # Still return design_id; export failure is non-fatal (user can open in Canva)
        result['error'] = f'Export submit warning ({ex_resp.status_code})'
        logger.warning('Export submit failed: %s', ex_resp.text[:200])
        return result

    ex_job_id = ex_resp.json().get('job', {}).get('id', '')
    if not ex_job_id:
        return result  # return design_id without export URL

    # ── Step 5: poll export ─────────────────────────────────────────────────
    export_url = ''
    for _ in range(30):  # 60 s max
        time.sleep(2)
        epoll = requests.get(
            f'{CANVA_API_BASE}/exports/{ex_job_id}',
            headers=_canva_headers(access_token),
            timeout=15,
        )
        if not epoll.ok:
            continue
        edata = epoll.json().get('job', {})
        if edata.get('status') == 'success':
            urls = edata.get('urls', [])
            export_url = urls[0] if urls else ''
            break
        if edata.get('status') == 'failed':
            logger.warning('Export job failed: %s', edata)
            break  # non-fatal

    result['export_url'] = export_url

    # ── Step 6: fetch export_url as base64 (for inline preview / download) ─
    if export_url:
        try:
            img_resp = requests.get(export_url, timeout=30, stream=False)
            if img_resp.ok:
                mime = img_resp.headers.get('Content-Type', 'image/png').split(';')[0]
                result['dataUrl'] = f'data:{mime};base64,' + base64.b64encode(img_resp.content).decode()
        except Exception as exc:
            logger.warning('Failed to fetch export image: %s', exc)

    if warnings:
        warning_text = '; '.join(warnings)
        result['error'] = f"{result['error']}; {warning_text}".strip('; ').strip()

    return result


@csrf_exempt
@require_http_methods(['POST'])
def generate_poster(request):
    """
    POST /api/canva/generate-poster

    Called by n8n (or directly) to generate a poster from a Canva brand template.

    Body (JSON):
      {
        "brand_template_id": "BAxxxxxxxx",
        "fields": {
          "event_name":      { "type": "text", "text": "..." },
          "event_date":      { "type": "text", "text": "..." },
          "chief_guest_photo": { "type": "image", "url": "https://..." }
        },
        "format": "png"   // "png" | "pdf"
      }

    Returns:
      { "design_id": "...", "export_url": "...", "dataUrl": "data:image/...", "error": "" }
    """
    body = _json_body(request)
    brand_template_id = body.get('brand_template_id', '').strip()
    fields            = body.get('fields', {})
    fmt               = body.get('format', 'png').lower()

    if not brand_template_id:
        return _error('brand_template_id is required.')
    if not fields:
        return _error('fields is required.')

    access_token = _get_service_token()
    if not access_token:
        return _error('No Canva service token available. Ask the Branding admin to connect Canva.', 503)

    result = _run_generate_poster(brand_template_id, fields, fmt, access_token)

    if result.get('error') and not result.get('design_id'):
        return _error(result['error'], 500)

    return JsonResponse({
        'design_id':  result['design_id'],
        'export_url': result['export_url'],
        'dataUrl':    result['dataUrl'],
        'warning':    result.get('error', ''),
    })


# ── Media upload (for poster images) ──────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def upload_media(request):
    """
    POST /api/canva/upload-media
    Multipart form upload: field name = 'file'

    Saves the uploaded file to MEDIA_ROOT/poster-uploads/<uuid>.<ext>
    and returns { "url": "http://.../<media_url>" } — an absolute URL usable
    by n8n and Canva's asset-upload APIs.
    """
    uploaded = request.FILES.get('file')
    if not uploaded:
        return _error('No file attached. Use multipart form with field name "file".')

    import uuid
    from pathlib import Path
    from django.conf import settings as dj_settings
    from django.core.files.storage import default_storage

    ext = Path(uploaded.name).suffix.lower() or '.png'
    filename = f'poster-uploads/{uuid.uuid4().hex}{ext}'

    from django.core.files.base import ContentFile as CF
    saved_path = default_storage.save(filename, CF(uploaded.read()))
    file_url = request.build_absolute_uri(dj_settings.MEDIA_URL + saved_path)
    return JsonResponse({'url': file_url, 'path': saved_path})


@csrf_exempt
@require_http_methods(['POST'])
def poster_callback(request):
    """Accept n8n poster callbacks for the synchronous poster-maker flow."""
    body = _json_body(request)
    logger.info(
        'Poster maker callback received: design_id=%s poster_url=%s',
        body.get('design_id', ''),
        body.get('poster_url', ''),
    )
    return JsonResponse({'ok': True})


# ── Poster Maker orchestrator (called by the React frontend) ──────────────────

@csrf_exempt
@require_http_methods(['POST'])
def poster_maker(request):
    """
    POST /api/canva/poster-maker

    Accepts EITHER:
      (a) multipart/form-data  —  fields: brand_template_id, format, event_data (JSON string),
                                  files:  logo_file, chief_guest_photo, qr_code_file, ...
      (b) application/json     —  { brand_template_id, format, event_data: { ... },
                                    image_urls: { logo: "...", chief_guest_photo: "..." } }

    This view:
      1. Saves any uploaded files → Django media → gets absolute URLs
      2. Calls n8n webhook if N8N_BRANDING_WEBHOOK_URL is configured
         (n8n then calls /api/canva/generate-poster)
      3. Otherwise calls _run_generate_poster() directly
      4. Returns { design_id, export_url, dataUrl, canva_edit_url, warning }
    """
    content_type = request.content_type or ''

    # ── Parse input ────────────────────────────────────────────────────────
    if 'multipart' in content_type or 'form-data' in content_type:
        brand_template_id = request.POST.get('brand_template_id', '').strip()
        fmt               = request.POST.get('format', 'png').lower()
        event_data_raw    = request.POST.get('event_data', '{}')
        explicit_fields_raw = request.POST.get('fields', '{}')
        try:
            event_data = json.loads(event_data_raw)
        except Exception:
            event_data = {}
        try:
            explicit_fields = json.loads(explicit_fields_raw)
        except Exception:
            explicit_fields = {}

        # Save uploaded images to media
        image_urls = {}
        image_field_names = [
            'logo_file', 'chief_guest_photo', 'chief_guest_photo_2',
            'chief_guest_photo_3', 'qr_code_file', 'banner_image',
            'extra_image_1', 'extra_image_2',
        ]
        for field_name in image_field_names:
            f = request.FILES.get(field_name)
            if not f:
                continue
            try:
                import uuid
                from pathlib import Path
                ext = Path(f.name).suffix.lower() or '.png'
                fname = f'poster-uploads/{uuid.uuid4().hex}{ext}'
                from django.core.files.storage import default_storage
                from django.core.files.base import ContentFile as CF
                saved = default_storage.save(fname, CF(f.read()))
                image_urls[field_name.replace('_file', '')] = request.build_absolute_uri(
                    settings.MEDIA_URL + saved
                )
            except Exception as exc:
                logger.error('Failed to save upload %s: %s', field_name, exc)

    else:
        body              = _json_body(request)
        brand_template_id = body.get('brand_template_id', '').strip()
        fmt               = body.get('format', 'png').lower()
        event_data        = body.get('event_data', {})
        image_urls        = body.get('image_urls', {})
        explicit_fields   = body.get('fields', {})

    if not brand_template_id:
        return _error('brand_template_id is required.')
    if fmt not in ('png', 'pdf'):
        fmt = 'png'

    # ── Build Canva autofill fields ────────────────────────────────────────
    if isinstance(explicit_fields, dict) and explicit_fields:
        fields = explicit_fields
    else:
        # Map event_data keys → Canva field names (text fields)
        fields: dict = {}
        text_field_map = {
            'event_name':               'event_name',
            'event_title':              'event_name',
            'title':                    'event_name',
            'organizer_department':     'organizer_department',
            'department':               'organizer_department',
            'start_month':              'start_month',
            'start_day':                'start_day',
            'end_day':                  'end_day',
            'year':                     'year',
            'event_date':               'event_date',
            'date_time':                'event_date',
            'event_time':               'event_time',
            'venue_location':           'venue_location',
            'venue':                    'venue_location',
            'chief_guest_name':         'chief_guest_name',
            'chief_guest_position':     'chief_guest_position',
            'chief_guest_company':      'chief_guest_company',
            'chief_guest_location':     'chief_guest_location',
            'committee_member_1_name':  'committee_member_1_name',
            'committee_member_1_role':  'committee_member_1_role',
            'committee_member_2_name':  'committee_member_2_name',
            'committee_member_2_role':  'committee_member_2_role',
            'committee_member_3_name':  'committee_member_3_name',
            'committee_member_3_role':  'committee_member_3_role',
            'committee_member_4_name':  'committee_member_4_name',
            'committee_member_4_role':  'committee_member_4_role',
            'committee_member_5_name':  'committee_member_5_name',
            'committee_member_5_role':  'committee_member_5_role',
            'committee_member_6_name':  'committee_member_6_name',
            'committee_member_6_role':  'committee_member_6_role',
            'website_text':             'website_text',
            'instagram_handle':         'instagram_handle',
            'resource_person':          'resource_person',
            'coordinators':             'coordinators',
            'faculty_coordinator_1':    'faculty_coordinator_1',
            'faculty_coordinator_2':    'faculty_coordinator_2',
            'student_coordinator':      'student_coordinator',
            'participants':             'participants',
            'event_type':               'event_type',
        }
        for src_key, canva_key in text_field_map.items():
            val = str(event_data.get(src_key, '')).strip()
            if val and canva_key not in fields:
                fields[canva_key] = {'type': 'text', 'text': val}

        # image fields
        image_canva_map = {
            'logo':               'logo',
            'chief_guest_photo':  'chief_guest_photo',
            'chief_guest_photo_2': 'chief_guest_photo_2',
            'chief_guest_photo_3': 'chief_guest_photo_3',
            'qr_code':            'qr_code_image',
            'banner_image':       'banner_image',
            'extra_image_1':      'extra_image_1',
            'extra_image_2':      'extra_image_2',
        }
        for src_key, canva_key in image_canva_map.items():
            url = (image_urls.get(src_key) or event_data.get(src_key + '_url', '')).strip()
            if url:
                fields[canva_key] = {'type': 'image', 'url': url}

    if not fields:
        return _error('No event data provided.')

    # ── Try n8n webhook first; fall back to direct Canva call ─────────────
    n8n_url = getattr(settings, 'N8N_BRANDING_WEBHOOK_URL', '').strip()
    if n8n_url:
        try:
            n8n_payload = {
                'brand_template_id': brand_template_id,
                'fields':            fields,
                'form_fields':       fields,
                'format':            fmt,
                'export_format':     fmt,
                'event_id':          str(event_data.get('event_id', 'manual')),
                'callback_url':      'http://127.0.0.1:8000/api/canva/poster-callback',
                'secret':            getattr(settings, 'N8N_WEBHOOK_SECRET', ''),
                'idcs_backend_url':  'http://127.0.0.1:8000',
            }
            n8n_resp = requests.post(n8n_url, json=n8n_payload, timeout=180)
            if n8n_resp.ok:
                data = n8n_resp.json()
                if data.get('ok'):
                    return JsonResponse({
                        'design_id':     data.get('design_id', ''),
                        'export_url':    data.get('poster_url', ''),
                        'dataUrl':       data.get('dataUrl', ''),
                        'canva_edit_url': f"https://www.canva.com/design/{data.get('design_id', '')}/edit" if data.get('design_id') else '',
                        'via_n8n':       True,
                    })
                else:
                    logger.warning('n8n returned error: %s', data.get('error'))
        except Exception as exc:
            logger.warning('n8n call failed (%s) — falling back to direct Canva', exc)

    # ── Direct Canva path ─────────────────────────────────────────────────
    access_token = _get_service_token()
    if not access_token:
        return _error('No Canva service token. Ask the Branding admin to connect Canva first.', 503)

    result = _run_generate_poster(brand_template_id, fields, fmt, access_token)

    if result.get('error') and not result.get('design_id'):
        return _error(result['error'], 500)

    design_id = result.get('design_id', '')
    return JsonResponse({
        'design_id':      design_id,
        'export_url':     result.get('export_url', ''),
        'dataUrl':        result.get('dataUrl', ''),
        'canva_edit_url': f'https://www.canva.com/design/{design_id}/edit' if design_id else '',
        'warning':        result.get('error', ''),
        'via_n8n':        False,
    })
