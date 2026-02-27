from django.urls import path

from . import api_views

urlpatterns = [
    path('config/', api_views.config, name='academic_calendar_config'),
    path('events/', api_views.events, name='academic_calendar_events'),
    path('events/<uuid:event_id>/update/', api_views.event_update, name='academic_calendar_event_update'),
    path('events/<uuid:event_id>/delete/', api_views.event_delete, name='academic_calendar_event_delete'),
    path('hod-colours/', api_views.hod_colours, name='academic_calendar_hod_colours'),
    path('hod-students/', api_views.hod_students, name='academic_calendar_hod_students'),
    path('upload/parse/', api_views.upload_parse, name='academic_calendar_upload_parse'),
    path('upload/import/', api_views.upload_import, name='academic_calendar_upload_import'),
]
