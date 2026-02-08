from django.urls import path
from . import views

urlpatterns = [
    path('upload-cdap', views.upload_cdap),
    path('upload-articulation-matrix', views.upload_articulation_matrix),
    path('upload-docx', views.upload_docx),
    path('list-uploads', views.list_uploads),
    path('cdap-revision/<str:subject_id>', views.cdap_revision),
    path('articulation-matrix/<str:subject_id>', views.articulation_matrix),
    path('active-learning-mapping', views.active_learning_mapping),
    path('assessment-master-config', views.assessment_master_config),
    path('mark-entry/<str:subject_id>/', views.mark_entry_tabs, name='mark_entry_tabs'),
    path('cia1-marks/<str:subject_id>', views.cia1_marks),

    # Draft/publish APIs (used by React sheets)
    path('draft/<str:assessment>/<str:subject_id>', views.assessment_draft),

    path('ssa1-published/<str:subject_id>', views.ssa1_published),
    path('ssa1-publish/<str:subject_id>', views.ssa1_publish),

    path('ssa2-published/<str:subject_id>', views.ssa2_published),
    path('ssa2-publish/<str:subject_id>', views.ssa2_publish),

    path('formative1-published/<str:subject_id>', views.formative1_published),
    path('formative1-publish/<str:subject_id>', views.formative1_publish),

    path('formative2-published/<str:subject_id>', views.formative2_published),
    path('formative2-publish/<str:subject_id>', views.formative2_publish),

    path('cia1-published-sheet/<str:subject_id>', views.cia1_published_sheet),
    path('cia1-publish-sheet/<str:subject_id>', views.cia1_publish_sheet),

    path('cia2-marks/<str:subject_id>', views.cia2_marks),
    path('cia2-published-sheet/<str:subject_id>', views.cia2_published_sheet),
    path('cia2-publish-sheet/<str:subject_id>', views.cia2_publish_sheet),

    path('lab-published-sheet/<str:assessment>/<str:subject_id>', views.lab_published_sheet),
    path('lab-publish-sheet/<str:assessment>/<str:subject_id>', views.lab_publish_sheet),

    # Due schedules + publish requests
    path('publish-window/<str:assessment>/<str:subject_id>', views.publish_window),

    # Edit approvals (separate from publish window)
    path('edit-window/<str:assessment>/<str:subject_id>', views.edit_window),

    # Authoritative lock state per mark-entry table
    path('mark-table-lock/<str:assessment>/<str:subject_id>', views.mark_table_lock_status),
    path('mark-table-lock/<str:assessment>/<str:subject_id>/confirm-mark-manager', views.mark_table_lock_confirm_mark_manager),

    path('due-schedule-subjects', views.due_schedule_subjects),
    path('due-schedules', views.due_schedules),
    path('due-schedule-upsert', views.due_schedule_upsert),
    path('due-schedule-bulk-upsert', views.due_schedule_bulk_upsert),
    path('global-publish-controls', views.global_publish_controls),
    path('global-publish-controls/bulk-set', views.global_publish_controls_bulk_set),
    path('global-publish-controls/bulk-reset', views.global_publish_controls_bulk_reset),

    path('publish-request', views.publish_request_create),
    path('publish-requests/pending', views.publish_requests_pending),
    path('publish-requests/pending-count', views.publish_requests_pending_count),
    path('publish-requests/history', views.publish_requests_history),
    path('publish-requests/<int:req_id>/approve', views.publish_request_approve),
    path('publish-requests/<int:req_id>/reject', views.publish_request_reject),

    path('edit-request', views.edit_request_create),
    path('edit-requests/pending', views.edit_requests_pending),
    path('edit-requests/pending-count', views.edit_requests_pending_count),
    path('edit-requests/history', views.edit_requests_history),
    path('edit-requests/<int:req_id>/approve', views.edit_request_approve),
    path('edit-requests/<int:req_id>/reject', views.edit_request_reject),

    # IQAC tools
    path('iqac/reset/<str:assessment>/<str:subject_id>', views.iqac_reset_assessment),
]
