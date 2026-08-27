from django.urls import path
from . import views_lca as views

urlpatterns = [
    # LCA & CDAP Core Revisions
    path('api/obe/lca-revision/<str:subject_id>', views.lca_revision, name='lca_revision'),
    path('api/obe/co-target-revision/<str:subject_id>', views.co_target_revision, name='co_target_revision'),
    path('api/obe/cdap-revision/<str:subject_id>', views.cdap_revision, name='cdap_revision'),
    path('api/obe/articulation-matrix/<str:subject_id>', views.articulation_matrix, name='articulation_matrix'),
    path('api/obe/active-learning-mapping', views.active_learning_mapping, name='active_learning_mapping'),
    
    # Excel Upload Parsers
    path('api/obe/upload-cdap', views.upload_cdap, name='upload_cdap'),
    path('api/obe/upload-articulation-matrix', views.upload_articulation_matrix, name='upload_articulation_matrix'),
]
