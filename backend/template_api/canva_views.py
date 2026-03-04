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

import json
import logging
import tempfile
import os

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import EventPosterAttachment

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


# ── OAuth ─────────────────────────────────────────────────────────────────────

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
        access_token = request.GET.get('access_token', '')
        query = request.GET.get('query', '')
        if not access_token:
            return _error('access_token query param is required.')

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
    access_token = body.get('access_token', '')
    template_id  = body.get('template_id', '')
    if not access_token or not template_id:
        return _error('access_token and template_id are required.')

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
    access_token      = body.get('access_token', '')
    brand_template_id = body.get('brand_template_id', '')
    data_fields       = body.get('data', {})

    if not access_token or not brand_template_id:
        return _error('access_token and brand_template_id are required.')

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
    access_token = request.GET.get('access_token', '')
    if not access_token:
        return _error('access_token is required.')

    resp = requests.get(
        f'{CANVA_API_BASE}/autofills/{job_id}',
        headers=_canva_headers(access_token),
        timeout=15,
    )
    if not resp.ok:
        return _error(f'Autofill poll failed ({resp.status_code})', resp.status_code)
    return JsonResponse(resp.json())


# ── Exports ───────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def exports_submit(request):
    """
    POST /api/canva/exports
    body: { access_token, design_id, format: 'png' | 'pdf' }
    """
    body = _json_body(request)
    access_token = body.get('access_token', '')
    design_id    = body.get('design_id', '')
    fmt          = body.get('format', 'png').lower()

    if not access_token or not design_id:
        return _error('access_token and design_id are required.')
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
    access_token = request.GET.get('access_token', '')
    if not access_token:
        return _error('access_token is required.')

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
