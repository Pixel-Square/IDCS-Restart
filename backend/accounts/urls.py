from django.urls import path
from .views import (
    RegisterView, 
    MeView, 
    CustomTokenObtainPairView, 
    MobileOtpRequestView, 
    MobileOtpVerifyView, 
    MobileRemoveView,
    ChangePasswordView,
    ProfileUpdateView,
    NotificationTemplateApiView,
    UserQueryListCreateView,
    UserQueryDetailView,
    AllQueriesListView,
    QueryUpdateView,
    WhatsAppGatewayStatusView,
    WhatsAppGatewayQrView,
    WhatsAppGatewayDisconnectView,
    WhatsAppGatewayRestartView,
    WhatsAppGatewaySendTestView,
    WhatsAppGatewayClearSessionView,
)
from rest_framework_simplejwt.views import TokenRefreshView
from .api.dashboard import DashboardView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('me/', MeView.as_view(), name='me'),
    path('mobile/request-otp/', MobileOtpRequestView.as_view(), name='mobile_request_otp'),
    path('mobile/verify-otp/', MobileOtpVerifyView.as_view(), name='mobile_verify_otp'),
    path('mobile/remove/', MobileRemoveView.as_view(), name='mobile_remove'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('profile/update/', ProfileUpdateView.as_view(), name='profile_update'),
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('notification-templates/', NotificationTemplateApiView.as_view(), name='notification_templates'),
    path('queries/', UserQueryListCreateView.as_view(), name='user_queries'),
    path('queries/<int:pk>/', UserQueryDetailView.as_view(), name='user_query_detail'),
    path('queries/all/', AllQueriesListView.as_view(), name='all_queries'),
    path('queries/<int:pk>/update/', QueryUpdateView.as_view(), name='query_update'),

    # IQAC Settings: WhatsApp gateway pairing/status
    path('settings/whatsapp/status/',     WhatsAppGatewayStatusView.as_view(),   name='settings_whatsapp_status'),
    path('settings/whatsapp/qr/',         WhatsAppGatewayQrView.as_view(),       name='settings_whatsapp_qr'),
    path('settings/whatsapp/disconnect/', WhatsAppGatewayDisconnectView.as_view(), name='settings_whatsapp_disconnect'),
    path('settings/whatsapp/restart/',    WhatsAppGatewayRestartView.as_view(),  name='settings_whatsapp_restart'),
    path('settings/whatsapp/send-test/',  WhatsAppGatewaySendTestView.as_view(), name='settings_whatsapp_send_test'),
    path('settings/whatsapp/clear-session/', WhatsAppGatewayClearSessionView.as_view(), name='settings_whatsapp_clear_session'),
]
