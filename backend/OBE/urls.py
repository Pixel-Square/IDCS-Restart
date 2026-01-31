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
    path('mark-entry/<str:subject_id>/', views.mark_entry_tabs, name='mark_entry_tabs'),
    path('cia1-marks/<str:subject_id>', views.cia1_marks),
]
