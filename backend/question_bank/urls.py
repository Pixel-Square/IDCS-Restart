from django.urls import path
from . import views

urlpatterns = [
    path('questions', views.import_questions),
    path('questions/list', views.list_questions),
]
