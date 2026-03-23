from django.urls import path

from . import portal_views


urlpatterns = [
    path('', portal_views.portal_login, name='reporting_portal_login'),
    path('login/', portal_views.portal_login, name='reporting_portal_login_alias'),
    path('logout/', portal_views.portal_logout, name='reporting_portal_logout'),
    path('home/', portal_views.portal_home, name='reporting_portal_home'),
    path('export/<str:format_key>/', portal_views.portal_export_csv, name='reporting_portal_export_csv'),
]
