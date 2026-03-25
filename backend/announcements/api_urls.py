from django.urls import path

from .api_views import (
    AnnouncementCreateView,
    AnnouncementDetailView,
    AnnouncementListView,
    AnnouncementMarkReadView,
    AnnouncementOptionsView,
    AnnouncementReadersView,
    AnnouncementSentListView,
    AnnouncementUnreadCountView,
    LegacyAnnouncementCreateView,
    LegacyAnnouncementListView,
    LegacyAnnouncementMarkReadView,
    LegacyAnnouncementOptionsView,
    LegacyAnnouncementSentListView,
)

urlpatterns = [
    path('announcements/', AnnouncementListView.as_view(), name='announcement-list'),
    path('announcements/create/', AnnouncementCreateView.as_view(), name='announcement-create'),
    path('announcements/<uuid:announcement_id>/', AnnouncementDetailView.as_view(), name='announcement-detail'),
    path('announcements/<uuid:announcement_id>/mark-read/', AnnouncementMarkReadView.as_view(), name='announcement-mark-read'),
    path('announcements/<uuid:announcement_id>/readers/', AnnouncementReadersView.as_view(), name='announcement-readers'),
    path('announcements/options/', AnnouncementOptionsView.as_view(), name='announcement-options'),
    path('announcements/sent/', AnnouncementSentListView.as_view(), name='announcement-sent-list'),
    path('announcements/unread-count/', AnnouncementUnreadCountView.as_view(), name='announcement-unread-count'),

    # Backward-compatible aliases
    path('announcements/announcements/', LegacyAnnouncementListView.as_view(), name='legacy-announcement-list'),
    path('announcements/announcements/create/', LegacyAnnouncementCreateView.as_view(), name='legacy-announcement-create'),
    path('announcements/announcements/<uuid:announcement_id>/mark-read/', LegacyAnnouncementMarkReadView.as_view(), name='legacy-announcement-mark-read-v2'),
    path('announcements/announcements/<uuid:announcement_id>/mark_as_read/', LegacyAnnouncementMarkReadView.as_view(), name='legacy-announcement-mark-read'),
    path('announcements/announcements/options/', LegacyAnnouncementOptionsView.as_view(), name='legacy-announcement-options-v2'),
    path('announcements/announcements/available_courses/', LegacyAnnouncementOptionsView.as_view(), name='legacy-announcement-options'),
    path('announcements/announcements/sent/', LegacyAnnouncementSentListView.as_view(), name='legacy-announcement-sent-list'),
]
