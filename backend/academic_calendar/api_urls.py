from django.urls import path

from . import api_views
from . import proposal_views

urlpatterns = [
    path('public-events/', api_views.public_events, name='academic_calendar_public_events'),
    path('public-stats/', api_views.public_stats, name='academic_calendar_public_stats'),
    path('config/', api_views.config, name='academic_calendar_config'),
    path('events/', api_views.events, name='academic_calendar_events'),
    path('events/<uuid:event_id>/update/', api_views.event_update, name='academic_calendar_event_update'),
    path('events/<uuid:event_id>/delete/', api_views.event_delete, name='academic_calendar_event_delete'),
    # n8n → Canva branding poster callback (secret-guarded, no auth cookie needed)
    path('events/<uuid:event_id>/poster-callback/', api_views.poster_callback, name='academic_calendar_poster_callback'),
    path('hod-colours/', api_views.hod_colours, name='academic_calendar_hod_colours'),
    path('hod-students/', api_views.hod_students, name='academic_calendar_hod_students'),
    path('upload/parse/', api_views.upload_parse, name='academic_calendar_upload_parse'),
    path('upload/import/', api_views.upload_import, name='academic_calendar_upload_import'),

    # ── Event Proposal Approval Workflow ─────────────────────────────────────
    path('proposals/', proposal_views.proposals_list_create, name='proposals_list_create'),
    path('proposals/delete-all/', proposal_views.proposals_delete_all, name='proposals_delete_all'),
    path('proposals/my-department-info/', proposal_views.my_department_info, name='proposal_my_department_info'),
    path('proposals/<uuid:proposal_id>/', proposal_views.proposal_detail, name='proposal_detail'),
    path('proposals/<uuid:proposal_id>/poster/', proposal_views.proposal_poster_download, name='proposal_poster_download'),
    path('proposals/<uuid:proposal_id>/final-download/', proposal_views.proposal_final_doc_download, name='proposal_final_doc_download'),
    path('proposals/<uuid:proposal_id>/branding-upload-final-poster/', proposal_views.branding_upload_final_poster, name='proposal_branding_upload_final_poster'),
    path('proposals/<uuid:proposal_id>/branding-forward/', proposal_views.branding_forward, name='proposal_branding_forward'),
    path('proposals/<uuid:proposal_id>/hod-approve/', proposal_views.hod_approve, name='proposal_hod_approve'),
    path('proposals/<uuid:proposal_id>/haa-approve/', proposal_views.haa_approve, name='proposal_haa_approve'),
    path('proposals/<uuid:proposal_id>/reject/', proposal_views.proposal_reject, name='proposal_reject'),

    # ── Notifications ────────────────────────────────────────────────────────
    path('notifications/', proposal_views.notifications_list, name='notifications_list'),
    path('notifications/unread-count/', proposal_views.notifications_unread_count, name='notifications_unread_count'),
    path('notifications/<int:notification_id>/read/', proposal_views.notification_mark_read, name='notification_mark_read'),
]
