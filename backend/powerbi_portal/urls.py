from django.urls import path
from django.contrib.auth import views as auth_views

from . import views
from .forms import PowerBIAuthenticationForm


urlpatterns = [
    path('powerbi/', views.welcome, name='powerbi_welcome'),
    path(
        'powerbi/login/',
        auth_views.LoginView.as_view(
            template_name='powerbi_portal/login.html',
            authentication_form=PowerBIAuthenticationForm,
        ),
        name='powerbi_login',
    ),
    path('powerbi/logout/', auth_views.LogoutView.as_view(next_page='/powerbi/login/'), name='powerbi_logout'),

    path('powerbi/dashboard/', views.dashboard, name='powerbi_dashboard'),
    path('powerbi/profile/', views.profile, name='powerbi_profile'),

    path('powerbi/notifications/', views.notifications, name='powerbi_notifications'),

    # Components
    path('powerbi/components/', views.components, name='powerbi_components'),
    path('powerbi/components/<str:view_name>/', views.component_table, name='powerbi_component_table'),
    path('powerbi/components/<str:view_name>/<str:column_name>/', views.component_column, name='powerbi_component_column'),

    # Sheets
    path('powerbi/sheets/', views.sheets, name='powerbi_sheets'),
    path('powerbi/sheets/<int:sheet_id>/', views.sheet_detail, name='powerbi_sheet_detail'),
    path('powerbi/sheets/<int:sheet_id>/add-column/', views.sheet_add_column, name='powerbi_sheet_add_column'),
    path('powerbi/sheets/<int:sheet_id>/rename-column/', views.sheet_rename_column, name='powerbi_sheet_rename_column'),
    path('powerbi/sheets/<int:sheet_id>/delete-column/', views.sheet_delete_column, name='powerbi_sheet_delete_column'),
    path('powerbi/sheets/<int:sheet_id>/push-column/', views.sheet_push_column, name='powerbi_sheet_push_column'),
    path('powerbi/sheets/<int:sheet_id>/push/', views.sheet_push, name='powerbi_sheet_push'),

    # Collaboration / Rooms
    path('powerbi/collaboration/', views.collaboration, name='powerbi_collaboration'),
    path('powerbi/collaboration/rooms/<int:room_id>/', views.room_detail, name='powerbi_room_detail'),
    path('powerbi/collaboration/rooms/<int:room_id>/request/', views.room_request_join, name='powerbi_room_request_join'),
    path('powerbi/collaboration/rooms/<int:room_id>/members/', views.room_members, name='powerbi_room_members'),
    path('powerbi/collaboration/rooms/<int:room_id>/sheets/create/', views.room_sheet_create, name='powerbi_room_sheet_create'),
    path('powerbi/collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/delete/', views.room_sheet_delete, name='powerbi_room_sheet_delete'),
    path('powerbi/collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/', views.room_sheet_detail, name='powerbi_room_sheet_detail'),
    path('powerbi/collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/rename-column/', views.room_sheet_rename_column, name='powerbi_room_sheet_rename_column'),
    path('powerbi/collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/delete-column/', views.room_sheet_delete_column, name='powerbi_room_sheet_delete_column'),
    path('powerbi/collaboration/rooms/<int:room_id>/sheets/<int:room_sheet_id>/export/', views.room_sheet_export, name='powerbi_room_sheet_export'),
]
