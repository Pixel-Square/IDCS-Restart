from django.urls import path

from . import views

app_name = 'college'

urlpatterns = [
    path('search/', views.search_colleges, name='search_colleges'),
    path('list/', views.list_all_colleges, name='list_all_colleges'),
]
