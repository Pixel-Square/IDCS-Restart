from django.urls import path
from . import views

urlpatterns = [
    path('upload-cdap', views.upload_cdap),
    path('upload-articulation-matrix', views.upload_articulation_matrix),
    path('upload-docx', views.upload_docx),
    path('list-uploads', views.list_uploads),
    path('cdap-revision/<str:subject_id>', views.cdap_revision),
    path('lca-revision/<str:subject_id>', views.lca_revision),
    path('co-target-revision/<str:subject_id>', views.co_target_revision),
    path('articulation-matrix/<str:subject_id>', views.articulation_matrix),
    path('active-learning-mapping', views.active_learning_mapping),
    path('assessment-master-config', views.assessment_master_config),
    path('mark-entry/<str:subject_id>/', views.mark_entry_tabs, name='mark_entry_tabs'),
    path('cia1-marks/<str:subject_id>', views.cia1_marks),

    # Draft/publish APIs (used by React sheets)
    path('draft/<str:assessment>/<str:subject_id>', views.assessment_draft),

    # CQI (draft + publish)
    path('cqi-draft/<str:subject_id>', views.cqi_draft),
    path('cqi-save/<str:subject_id>', views.cqi_save),
    path('cqi-published/<str:subject_id>', views.cqi_published),
    path('cqi-publish/<str:subject_id>', views.cqi_publish),

    path('ssa1-published/<str:subject_id>', views.ssa1_published),
    path('ssa1-publish/<str:subject_id>', views.ssa1_publish),

    path('review1-published/<str:subject_id>', views.review1_published),
    path('review1-publish/<str:subject_id>', views.review1_publish),

    path('ssa2-published/<str:subject_id>', views.ssa2_published),
    path('ssa2-publish/<str:subject_id>', views.ssa2_publish),

    path('review2-published/<str:subject_id>', views.review2_published),
    path('review2-publish/<str:subject_id>', views.review2_publish),

    path('formative1-published/<str:subject_id>', views.formative1_published),
    path('formative1-publish/<str:subject_id>', views.formative1_publish),

    path('formative2-published/<str:subject_id>', views.formative2_published),
    path('formative2-publish/<str:subject_id>', views.formative2_publish),

    path('cia1-published-sheet/<str:subject_id>', views.cia1_published_sheet),
    path('cia1-publish-sheet/<str:subject_id>', views.cia1_publish_sheet),

    path('cia2-marks/<str:subject_id>', views.cia2_marks),
    path('cia2-published-sheet/<str:subject_id>', views.cia2_published_sheet),
    path('cia2-publish-sheet/<str:subject_id>', views.cia2_publish_sheet),

    path('model-published-sheet/<str:subject_id>', views.model_published_sheet),
    path('model-publish-sheet/<str:subject_id>', views.model_publish_sheet),

    # CIA protected Excel template
    path('cia-export-template/<str:assessment>/<str:subject_id>', views.cia_export_template_xlsx),

    path('lab-published-sheet/<str:assessment>/<str:subject_id>', views.lab_published_sheet),
    path('lab-publish-sheet/<str:assessment>/<str:subject_id>', views.lab_publish_sheet),

    # Due schedules + publish requests
    path('publish-window/<str:assessment>/<str:subject_id>', views.publish_window),
    path('auto-publish/<str:assessment>/<str:subject_id>', views.auto_publish_due),

    # Edit approvals (separate from publish window)
    path('edit-window/<str:assessment>/<str:subject_id>', views.edit_window),

    # Authoritative lock state per mark-entry table
    path('mark-table-lock/<str:assessment>/<str:subject_id>', views.mark_table_lock_status),
    path('mark-table-lock/<str:assessment>/<str:subject_id>/confirm-mark-manager', views.mark_table_lock_confirm_mark_manager),

    path('due-schedule-subjects', views.due_schedule_subjects),
    path('due-schedules', views.due_schedules),
    path('due-schedule-upsert', views.due_schedule_upsert),
    path('due-schedule-bulk-upsert', views.due_schedule_bulk_upsert),
    path('due-schedule-bulk-delete', views.due_schedule_bulk_delete),
    path('due-schedule-delete', views.due_schedule_delete),

    path('assessment-controls', views.assessment_controls),
    path('assessment-controls/', views.assessment_controls),
    path('assessment-controls/bulk-set', views.assessment_controls_bulk_set),
    path('assessment-controls/bulk-set/', views.assessment_controls_bulk_set),

    # Semester helpers (OBE Master)
    path('semesters', views.obe_semesters),

    path('global-publish-controls', views.global_publish_controls),
    path('global-publish-controls/', views.global_publish_controls),
    path('global-publish-controls/bulk-set', views.global_publish_controls_bulk_set),
    path('global-publish-controls/bulk-set/', views.global_publish_controls_bulk_set),
    path('global-publish-controls/bulk-reset', views.global_publish_controls_bulk_reset),
    path('global-publish-controls/bulk-reset/', views.global_publish_controls_bulk_reset),

    path('publish-request', views.publish_request_create),
    path('publish-requests/pending', views.publish_requests_pending),
    path('publish-requests/pending-count', views.publish_requests_pending_count),
    path('publish-requests/hod/pending', views.publish_requests_hod_pending),
    path('publish-requests/hod/pending-count', views.publish_requests_hod_pending_count),
    path('publish-requests/history', views.publish_requests_history),
    path('publish-requests/<int:req_id>/hod-approve', views.publish_request_hod_approve),
    path('publish-requests/<int:req_id>/hod-reject', views.publish_request_hod_reject),
    path('publish-requests/<int:req_id>/approve', views.publish_request_approve),
    path('publish-requests/<int:req_id>/reject', views.publish_request_reject),

    path('edit-request', views.edit_request_create),
    path('edit-requests/my-latest', views.edit_requests_my_latest),
    path('edit-requests/pending', views.edit_requests_pending),
    path('edit-requests/hod/pending', views.edit_requests_hod_pending),
    path('edit-requests/pending-count', views.edit_requests_pending_count),
    path('edit-requests/hod/pending-count', views.edit_requests_hod_pending_count),
    path('edit-requests/history', views.edit_requests_history),
    path('edit-requests/<int:req_id>/hod-approve', views.edit_request_hod_approve),
    path('edit-requests/<int:req_id>/hod-reject', views.edit_request_hod_reject),
    path('edit-requests/<int:req_id>/approve', views.edit_request_approve),
    path('edit-requests/<int:req_id>/reject', views.edit_request_reject),

    # IQAC tools
    path('reset/<str:assessment>/<str:subject_id>', views.faculty_reset_assessment),
    path('iqac/reset/<str:assessment>/<str:subject_id>', views.iqac_reset_assessment),
    path('iqac/reset-notifications', views.get_reset_notifications),
    path('iqac/reset-notifications/dismiss', views.dismiss_reset_notifications),
    path('iqac/class-type-weights', views.class_type_weights_list),
    path('iqac/class-type-weights/save', views.class_type_weights_upsert),
    path('iqac/internal-mark-mapping/<str:subject_id>', views.internal_mark_mapping_get),
    path('iqac/internal-mark-mapping/<str:subject_id>/save', views.internal_mark_mapping_upsert),
    path('iqac/final-internal-marks/sync', views.iqac_sync_final_internal_marks),
    path('iqac/final-internal-marks/student/<int:student_id>', views.final_internal_marks_by_student),

    # IQAC QP Pattern config
    path('iqac/qp-pattern', views.qp_pattern_get),
    path('iqac/qp-pattern/save', views.qp_pattern_upsert),

    # IQAC Customizable Exam (batch-scoped QP pattern overrides)
    path('iqac/custom-exam/batches', views.iqac_custom_exam_batches),
    path('iqac/custom-exam/qp-pattern', views.iqac_batch_qp_pattern_get),
    path('iqac/custom-exam/qp-pattern/save', views.iqac_batch_qp_pattern_upsert),
    # IQAC CQI global configuration
    path('iqac/cqi-config', views.iqac_cqi_get),
    path('iqac/cqi-config/save', views.iqac_cqi_upsert),
    # Aggregated progress view for HOD/Advisor (per section/staff/course/assessment)
    path('progress', views.obe_progress_overview),
    # IQAC main: lightweight department list with stats for progress drill-down
    path('progress/departments', views.obe_progress_departments),
]
