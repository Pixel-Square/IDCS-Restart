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

    path('formative1-published/<str:subject_id>', views.formative1_published),
    path('formative1-publish/<str:subject_id>', views.formative1_publish),

    path('cia1-published-sheet/<str:subject_id>', views.cia1_published_sheet),
    path('cia1-publish-sheet/<str:subject_id>', views.cia1_publish_sheet),
]
