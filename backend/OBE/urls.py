from django.urls import path
from . import views

urlpatterns = [
    path('upload-cdap', views.upload_cdap),
    path('cdap-revision/<uuid:subject_id>', views.cdap_revision),
    path('active-learning-mapping', views.active_learning_mapping),
]
