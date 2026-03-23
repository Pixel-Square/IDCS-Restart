from django.urls import path

from . import admin_views


urlpatterns = [
    path('powerbi/', admin_views.powerbi_exports_home, name='reporting_admin_home'),
    path('powerbi/export/<str:format_key>/', admin_views.export_csv, name='reporting_admin_export_csv'),
]
