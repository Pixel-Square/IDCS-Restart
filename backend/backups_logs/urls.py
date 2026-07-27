from django.urls import path
from .views import (
    BackupsLandingAPIView, 
    TriggerSnapshotAPIView, 
    ListSnapshotsAPIView,
    TriggerConfigExportAPIView,
    ListConfigExportsAPIView,
    PreviewConfigImportAPIView,
    RestoreSnapshotAPIView,
    ConfirmConfigImportAPIView,
    ActivityLogListAPIView,
    TaskStatusAPIView,
    TriggerSemesterEndAPIView
)

app_name = 'backups_logs'

urlpatterns = [
    path('landing/', BackupsLandingAPIView.as_view(), name='backups-landing'),
    path('snapshot/<str:section_id>/', TriggerSnapshotAPIView.as_view(), name='trigger-snapshot'),
    path('snapshots/<str:section_id>/', ListSnapshotsAPIView.as_view(), name='list-snapshots'),
    path('restore-snapshot/<str:snapshot_id>/', RestoreSnapshotAPIView.as_view(), name='restore-snapshot'),
    
    path('config-export/<str:section_id>/', TriggerConfigExportAPIView.as_view(), name='trigger-config-export'),
    path('config-exports/<str:section_id>/', ListConfigExportsAPIView.as_view(), name='list-config-exports'),
    path('config-import-preview/', PreviewConfigImportAPIView.as_view(), name='preview-config-import'),
    path('config-import/<str:export_id>/', ConfirmConfigImportAPIView.as_view(), name='confirm-config-import'),
    
    path('activity/', ActivityLogListAPIView.as_view(), name='activity-logs'),
    path('status/<str:task_id>/', TaskStatusAPIView.as_view(), name='task-status'),
    path('trigger-semester-end/', TriggerSemesterEndAPIView.as_view(), name='trigger-semester-end'),
]
