"""
template_api/canva_urls.py

URL patterns for the Canva Connect proxy endpoints.
Mounted at /api/canva/ in erp/urls.py.
"""
from django.urls import path
from . import canva_views

urlpatterns = [
    # ── Server-side OAuth (PKCE handled entirely on the backend) ──────────────
    # 1. Browser navigates here → Django builds auth URL + redirects to Canva
    path('oauth/authorize',    canva_views.oauth_authorize,    name='canva-oauth-authorize'),
    # 2. Canva redirects here with ?code=...&state=...
    path('oauth/callback',     canva_views.oauth_callback,     name='canva-oauth-callback'),
    # 3. Frontend polls this to get the access_token stored in session
    path('oauth/connection',   canva_views.connection_status,  name='canva-oauth-connection'),
    # 4. HOD pages check this to see if a service token is available
    path('service_status',     canva_views.service_status,     name='canva-service-status'),

    # ── Legacy frontend-PKCE endpoints (kept for backwards compat) ────────────
    path('oauth/token',  canva_views.oauth_token,  name='canva-oauth-token'),
    path('oauth/revoke', canva_views.oauth_revoke,  name='canva-oauth-revoke'),

    # ── DB-backed IDCS template library ─────────────────────────────────────
    path('templates',         canva_views.templates_api,      name='canva-templates'),
    path('templates/<int:template_id>', canva_views.template_detail_api, name='canva-template-detail'),

    # ── Canva API proxy ───────────────────────────────────────────────────────
    path('designs',      canva_views.designs,        name='canva-designs'),

    path('autofills',             canva_views.autofills_submit, name='canva-autofills-submit'),
    path('autofills/<str:job_id>', canva_views.autofills_poll,  name='canva-autofills-poll'),

    path('exports',               canva_views.exports_submit,  name='canva-exports-submit'),
    path('exports/<str:job_id>',  canva_views.exports_poll,    name='canva-exports-poll'),

    # ── Image proxy (server-side CORS bypass for Canva CDN thumbnails) ────────
    path('thumbnail-proxy',            canva_views.thumbnail_proxy, name='canva-thumbnail-proxy'),
    path('designs/<str:design_id>/info', canva_views.design_info,   name='canva-design-info'),

    # ── One-shot poster generator: autofill → export → proxy image ───────────
    path('generate-poster',      canva_views.generate_poster,      name='canva-generate-poster'),
    # ── n8n-proxied poster generator (falls back to generate-poster) ─────────
    path('trigger-n8n-poster',   canva_views.trigger_n8n_poster,   name='canva-trigger-n8n-poster'),
    path('noop-callback',        canva_views.noop_callback,        name='canva-noop-callback'),
]