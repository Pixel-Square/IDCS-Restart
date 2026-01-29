from django.urls import path
from . import views

urlpatterns = [
    path('upload-cdap', views.upload_cdap),
    path('upload-articulation-matrix', views.upload_articulation_matrix),
    path('cdap-revision/<str:subject_id>', views.cdap_revision),
    path('articulation-matrix/<str:subject_id>', views.articulation_matrix),
    path('active-learning-mapping', views.active_learning_mapping),
]
