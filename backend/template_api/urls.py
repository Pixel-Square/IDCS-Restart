from django.urls import path
from . import views

urlpatterns = [
    path('scan-docx', views.scan_docx),
]
