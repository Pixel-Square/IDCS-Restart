"""
template_api/canva_urls.py

URL patterns for the Canva Connect proxy endpoints.
Mounted at /api/canva/ in erp/urls.py.
"""
from django.urls import path
from . import canva_views

urlpatterns = [
    # OAuth
    path('oauth/token',  canva_views.oauth_token,  name='canva-oauth-token'),
    path('oauth/revoke', canva_views.oauth_revoke,  name='canva-oauth-revoke'),

    # Designs (list + create)
    path('designs',      canva_views.designs,        name='canva-designs'),

    # Autofill
    path('autofills',             canva_views.autofills_submit, name='canva-autofills-submit'),
    path('autofills/<str:job_id>', canva_views.autofills_poll,   name='canva-autofills-poll'),

    # Exports
    path('exports',               canva_views.exports_submit,  name='canva-exports-submit'),
    path('exports/<str:job_id>',  canva_views.exports_poll,    name='canva-exports-poll'),

    # Event poster storage
    path('events/<str:event_id>/poster', canva_views.event_poster, name='canva-event-poster'),
]
