from django.urls import path
from django.contrib.auth import views as auth_views

from . import views
from .forms import PowerBIAuthenticationForm


urlpatterns = [
    path('', views.welcome, name='powerbi_welcome'),
    path(
        'login/',
        auth_views.LoginView.as_view(
            template_name='powerbi_portal/login.html',
            authentication_form=PowerBIAuthenticationForm,
        ),
        name='powerbi_login',
    ),
    path('logout/', auth_views.LogoutView.as_view(next_page='/powerbi/login/'), name='powerbi_logout'),

    path('dashboard/', views.dashboard, name='powerbi_dashboard'),
    path('profile/', views.profile, name='powerbi_profile'),

    path('notifications/', views.notifications, name='powerbi_notifications'),

    # Components
    path('components/', views.components, name='powerbi_components'),
    path('components/<str:view_name>/', views.component_table, name='powerbi_component_table'),
    path('components/<str:view_name>/<str:column_name>/', views.component_column, name='powerbi_component_column'),

    # Sheets
    path('sheets/', views.sheets, name='powerbi_sheets'),
    path('sheets/<int:sheet_id>/', views.sheet_detail, name='powerbi_sheet_detail'),
    path('sheets/<int:sheet_id>/add-column/', views.sheet_add_column, name='powerbi_sheet_add_column'),
    path('sheets/<int:sheet_id>/rename-column/', views.sheet_rename_column, name='powerbi_sheet_rename_column'),
    path('sheets/<int:sheet_id>/delete-column/', views.sheet_delete_column, name='powerbi_sheet_delete_column'),
    path('sheets/<int:sheet_id>/push-column/', views.sheet_push_column, name='powerbi_sheet_push_column'),
    path('sheets/<int:sheet_id>/push/', views.sheet_push, name='powerbi_sheet_push'),

    # Collaboration / Rooms
    path('collaboration/', views.collaboration, name='powerbi_collaboration'),
    path('collaboration/rooms/<int:room_id>/', views.room_detail, name='powerbi_room_detail'),
    path('collaboration/rooms/<int:room_id>/bi-connect/', views.room_bi_connect, name='powerbi_room_bi_connect'),
    path('collaboration/rooms/<int:room_id>/connection/', views.room_connection_update, name='powerbi_room_connection_update'),
    path('collaboration/rooms/<int:room_id>/request/', views.room_request_join, name='powerbi_room_request_join'),
    path('collaboration/rooms/<int:room_id>/members/', views.room_members, name='powerbi_room_members'),
    path('collaboration/rooms/<int:room_id>/sheets/create/', views.room_sheet_create, name='powerbi_room_sheet_create'),
    path('collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/delete/', views.room_sheet_delete, name='powerbi_room_sheet_delete'),
    path('collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/', views.room_sheet_detail, name='powerbi_room_sheet_detail'),
    path('collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/rename-column/', views.room_sheet_rename_column, name='powerbi_room_sheet_rename_column'),
    path('collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/delete-column/', views.room_sheet_delete_column, name='powerbi_room_sheet_delete_column'),
    path('collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/export/', views.room_sheet_export, name='powerbi_room_sheet_export'),

    # Public (no-login) Power BI Web feeds
    path('public/rooms/<str:token>/', views.public_room_bi, name='powerbi_public_room_bi'),
    path(
        'public/rooms/<str:token>/sheets/<int:room_sheet_id>.csv',
        views.public_room_sheet_csv,
        name='powerbi_public_room_sheet_csv',
    ),
]
