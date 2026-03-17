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
    path('proposal-docs/generate', canva_views.proposal_doc_generate, name='canva-proposal-doc-generate'),
    path('proposal-docs/<str:doc_id>/<str:filename>', canva_views.proposal_doc_download, name='canva-proposal-doc-download'),
    path('department-options', canva_views.department_options, name='canva-department-options'),
    # 4. HOD pages check this to see if a service token is available
    path('service_status',     canva_views.service_status,     name='canva-service-status'),

    # ── Legacy frontend-PKCE endpoints (kept for backwards compat) ────────────
    path('oauth/token',  canva_views.oauth_token,  name='canva-oauth-token'),
    path('oauth/revoke', canva_views.oauth_revoke,  name='canva-oauth-revoke'),

    # ── DB-backed IDCS template library ─────────────────────────────────────
    path('templates',         canva_views.templates_api,      name='canva-templates'),
    path('templates/<int:template_id>', canva_views.template_detail_api, name='canva-template-detail'),

    # ── Canva API proxy ───────────────────────────────────────────────────────
    path('brand-templates', canva_views.brand_templates, name='canva-brand-templates'),
    path('brand-templates/<str:brand_template_id>/dataset', canva_views.brand_template_dataset, name='canva-brand-template-dataset'),
    path('designs',      canva_views.designs,        name='canva-designs'),

    path('autofills',             canva_views.autofills_submit, name='canva-autofills-submit'),
    path('autofills/<str:job_id>', canva_views.autofills_poll,  name='canva-autofills-poll'),

    path('exports',               canva_views.exports_submit,  name='canva-exports-submit'),
    path('exports/<str:job_id>',  canva_views.exports_poll,    name='canva-exports-poll'),

    # ── Image proxy (server-side CORS bypass for Canva CDN thumbnails) ────────
    path('thumbnail-proxy',            canva_views.thumbnail_proxy, name='canva-thumbnail-proxy'),

    path('designs/<str:design_id>/info', canva_views.design_info,   name='canva-design-info'),

    # ── Poster Maker (new end-to-end flow) ───────────────────────────────────
    path('generate-poster', canva_views.generate_poster, name='canva-generate-poster'),
    path('upload-media',    canva_views.upload_media,    name='canva-upload-media'),
    path('poster-callback', canva_views.poster_callback, name='canva-poster-callback'),
    path('poster-maker',    canva_views.poster_maker,    name='canva-poster-maker'),
]

