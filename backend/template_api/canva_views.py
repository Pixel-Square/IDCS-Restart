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
import secrets
import time
import os
from urllib.parse import urlencode

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


def _json_body(request) -> dict:
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, Exception):
        return {}


def _error(msg: str, status: int = 400) -> JsonResponse:
    return JsonResponse({'detail': msg}, status=status)


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
    GET  /api/canva/templates → list all saved IDCS Canva templates
    POST /api/canva/templates → save a new template { name, canva_design_id,
                                                       thumbnail_url, is_brand_template,
                                                       edit_url, saved_by }
    """
    if request.method == 'GET':
        items = CanvaTemplate.objects.all().order_by('-saved_at')
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

# ── Generate poster (autofill → export → proxy) — one-shot synchronous call ──

@csrf_exempt
@require_http_methods(['POST'])
def generate_poster(request):
    """
    POST /api/canva/generate-poster
    body: {
        brand_template_id: str,       # Canva brand-template ID to autofill
        format: 'png' | 'pdf',        # export format
        fields: {                     # map of Canva data-set field keys → text values
            event_title: str,
            event_type: str,
            department: str,
            date_time: str,
            venue: str,
            organizer: str,
            description: str,
            contact: str,
            resource_person: str,
            resource_designation: str,
            faculty_coordinator_1: str,
            faculty_coordinator_2: str,
            student_coordinator: str,
            participants: str,
        }
    }

    Full workflow executed synchronously (max ~60 s):
      1. Submit autofill job  → job_id
      2. Poll autofill        → design_id  (max 30 s)
      3. Submit export job    → job_id
      4. Poll export          → export CDN URL(s)  (max 30 s)
      5. Proxy first export image as base64 data-URL
      6. Return { design_id, dataUrl, export_url }

    Returns an HTTP 200 even when the data-URL cannot be proxied — the
    frontend can still offer a direct CDN download link via export_url.
    """
    import time as _time

    body              = _json_body(request)
    brand_template_id = body.get('brand_template_id', '').strip()
    fmt               = body.get('format', 'png').lower()
    fields            = body.get('fields', {})
    access_token      = body.get('access_token', '') or _get_service_token()

    if not access_token:
        return _error(
            'Canva service token not available. Ask the Branding admin to reconnect Canva.',
            503,
        )
    if not brand_template_id:
        return _error('brand_template_id is required.', 400)
    if fmt not in ('png', 'pdf'):
        return _error('format must be png or pdf.', 400)

    # Build autofill data — only send non-empty fields
    autofill_data: dict = {}
    for key, value in fields.items():
        if value and str(value).strip():
            autofill_data[key] = {'type': 'text', 'text': str(value).strip()}

    # ── 1. Submit autofill ───────────────────────────────────────────────────
    af_resp = requests.post(
        f'{CANVA_API_BASE}/autofills',
        headers=_canva_headers(access_token),
        json={'brand_template_id': brand_template_id, 'data': autofill_data},
        timeout=20,
    )
    if not af_resp.ok:
        logger.error('Canva autofill submit failed (%s): %s', af_resp.status_code, af_resp.text[:400])
        try:
            err_body = af_resp.json()
        except Exception:
            err_body = {}
        err_code = err_body.get('code', '')
        if err_code == 'missing_scope' or 'missing_scope' in af_resp.text:
            missing = err_body.get('message', 'Missing scopes: [design:content:write]')
            return _error(
                f'The Canva service token is missing required permissions ({missing}). '
                f'To fix: 1) Open the Canva Developer Portal → your app → Permissions and enable '
                f'"design:content:write". 2) In IDCS go to Settings → Canva and click '
                f'"Reconnect Canva Account" to issue a new token with the updated scopes.',
                403,
            )
        return _error(
            f'Canva autofill failed ({af_resp.status_code}). '
            f'Make sure the template is a Brand Template with data-set fields configured. '
            f'Detail: {af_resp.text[:200]}',
            af_resp.status_code,
        )

    af_body   = af_resp.json()
    af_job_id = (
        af_body.get('job', {}).get('id')
        or af_body.get('id')
        or ''
    )
    if not af_job_id:
        return _error('Canva returned no autofill job ID.', 500)

    # ── 2. Poll autofill (max 30 s) ──────────────────────────────────────────
    design_id: str | None = None
    for _ in range(20):
        _time.sleep(1.5)
        p = requests.get(
            f'{CANVA_API_BASE}/autofills/{af_job_id}',
            headers=_canva_headers(access_token),
            timeout=15,
        )
        if not p.ok:
            continue
        pd = p.json()
        job_obj  = pd.get('job', pd)          # Canva wraps result in 'job'
        status   = str(job_obj.get('status', '')).lower()
        if status == 'success':
            design_id = (
                job_obj.get('result', {}).get('design', {}).get('id')
                or job_obj.get('design', {}).get('id')
            )
            break
        if status in ('failed', 'error'):
            err = job_obj.get('error', {}).get('message', 'Unknown Canva error')
            return _error(f'Canva autofill job failed: {err}', 500)

    if not design_id:
        return _error(
            'Canva autofill timed out — the autofill job did not complete within 30 s. '
            'Check that the Brand Template has correctly named data-set fields.',
            504,
        )

    # ── 3. Submit export ─────────────────────────────────────────────────────
    ex_resp = requests.post(
        f'{CANVA_API_BASE}/exports',
        headers=_canva_headers(access_token),
        json={
            'design_id': design_id,
            'format':    {'type': 'PNG' if fmt == 'png' else 'PDF'},
        },
        timeout=20,
    )
    if not ex_resp.ok:
        logger.error('Canva export submit failed (%s): %s', ex_resp.status_code, ex_resp.text)
        return _error(f'Export submit failed ({ex_resp.status_code})', ex_resp.status_code)

    ex_body   = ex_resp.json()
    ex_job_id = (
        ex_body.get('job', {}).get('id')
        or ex_body.get('id')
        or ''
    )
    if not ex_job_id:
        return _error('Canva returned no export job ID.', 500)

    # ── 4. Poll export (max 30 s) ────────────────────────────────────────────
    export_url: str | None = None
    for _ in range(20):
        _time.sleep(1.5)
        ep = requests.get(
            f'{CANVA_API_BASE}/exports/{ex_job_id}',
            headers=_canva_headers(access_token),
            timeout=15,
        )
        if not ep.ok:
            continue
        epd      = ep.json()
        ep_job   = epd.get('job', epd)
        ep_status = str(ep_job.get('status', '')).lower()
        if ep_status == 'success':
            urls = ep_job.get('urls') or ep_job.get('result', {}).get('urls') or []
            if urls:
                export_url = urls[0]
            break
        if ep_status in ('failed', 'error'):
            return _error('Canva export job failed.', 500)

    if not export_url:
        # Return design_id so the user can still view it in Canva editor
        return JsonResponse({
            'design_id':  design_id,
            'dataUrl':    None,
            'export_url': None,
            'warning':    'Export URL not ready yet. Try downloading directly from Canva.',
        })

    # ── 5. Proxy export image as base64 data-URL ─────────────────────────────
    data_url: str | None = None
    try:
        img_r = requests.get(export_url, timeout=30)
        img_r.raise_for_status()
        ct = img_r.headers.get('Content-Type', f'image/{fmt}').split(';')[0].strip()
        if not ct.startswith('image/') and fmt != 'pdf':
            ct = f'image/{fmt}'
        data_url = f'data:{ct};base64,{base64.b64encode(img_r.content).decode("ascii")}'
    except Exception as exc:
        logger.warning('Could not proxy export image: %s', exc)

    return JsonResponse({
        'design_id':  design_id,
        'dataUrl':    data_url,
        'export_url': export_url,
    })

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


# ── n8n proxy: route poster generation through n8n then return result ─────────

@csrf_exempt
@require_http_methods(['POST'])
def trigger_n8n_poster(request):
    """
    POST /api/canva/trigger-n8n-poster

    Routes the poster-generation request through the n8n automation workflow
    and returns the result to the caller in the same shape as generate_poster.

    Flow:
      Frontend → Django (this view) → n8n webhook (sync)
        → n8n calls /api/canva/generate-poster
        → Django calls Canva API (autofill → poll → export → proxy)
        → n8n responds with { ok, design_id, dataUrl, poster_url, preview_link }
      → Django returns { design_id, dataUrl, export_url } to frontend

    Falls back to calling generate_poster() directly if n8n is not configured
    or not reachable, so the form always works even without n8n running.

    Body: same as generate_poster (brand_template_id, format, fields, event_id?)
    """
    body = _json_body(request)
    brand_template_id = body.get('brand_template_id', '').strip()
    fmt               = body.get('format', 'png').lower()
    fields            = body.get('fields', {})
    event_id          = body.get('event_id', '').strip()

    if not brand_template_id:
        return _error('brand_template_id is required.', 400)

    webhook_url = str(getattr(settings, 'N8N_BRANDING_WEBHOOK_URL', '') or '').strip()
    if not webhook_url:
        # n8n not configured — generate directly (graceful fallback)
        logger.info('N8N_BRANDING_WEBHOOK_URL not set — generating poster directly.')
        return generate_poster(request)

    backend_url  = str(getattr(settings, 'IDCS_BACKEND_URL', 'http://localhost:8000') or '').rstrip('/')
    secret       = str(getattr(settings, 'N8N_WEBHOOK_SECRET', '') or '')
    callback_url = (
        f'{backend_url}/api/academic-calendar/events/{event_id}/poster-callback/'
        if event_id
        else f'{backend_url}/api/canva/noop-callback'
    )

    # Build the n8n webhook payload.
    # form_fields are passed pre-built so the n8n Code node uses them directly
    # without having to know the HOD form field names.
    payload = {
        'event_id':          event_id or 'preview',
        'callback_url':      callback_url,
        'secret':            secret,
        'brand_template_id': brand_template_id,
        'export_format':     fmt,
        'idcs_backend_url':  backend_url,
        'form_fields':       fields,
    }

    try:
        resp = requests.post(
            webhook_url,
            json=payload,
            timeout=135,  # n8n allows up to 120 s for the Canva request
            headers={'Content-Type': 'application/json'},
        )
    except requests.exceptions.ConnectionError:
        logger.warning('n8n not reachable at %s — falling back to direct Canva call.', webhook_url)
        return generate_poster(request)
    except requests.exceptions.Timeout:
        return _error('Poster generation timed out (n8n did not respond in time). Try again.', 504)
    except Exception as exc:
        logger.error('n8n proxy error: %s', exc)
        return generate_poster(request)

    if not resp.ok:
        logger.error('n8n returned HTTP %s: %s', resp.status_code, resp.text[:300])
        return generate_poster(request)

    try:
        n8n_data = resp.json()
    except ValueError:
        logger.error('n8n returned non-JSON response — falling back.')
        return generate_poster(request)

    if n8n_data.get('error') and not n8n_data.get('ok'):
        return _error(n8n_data['error'], 500)

    return JsonResponse({
        'design_id':  n8n_data.get('design_id', ''),
        'dataUrl':    n8n_data.get('dataUrl', ''),
        'export_url': n8n_data.get('poster_url', ''),
    })


@csrf_exempt
@require_http_methods(['POST'])
def noop_callback(request):
    """
    POST /api/canva/noop-callback
    Silent no-op target for n8n poster callbacks that have no persistent event
    (e.g. live preview requests from the HOD form).
    """
    return JsonResponse({'ok': True})
