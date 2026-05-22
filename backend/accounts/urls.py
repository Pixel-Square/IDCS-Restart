from django.urls import path
from .views_impersonate import (
    SuperuserImpersonateView,
    SuperuserImpersonationHistoryView,
    SuperuserImpersonationPermissionView,
)
from .views import (
    RegisterView, 
    MeView, 
    CustomTokenObtainPairView, 
    MobileOtpRequestView, 
    MobileOtpVerifyView, 
    MobileRemoveView,
    ChangePasswordView,
    ForgotPasswordRequestOtpView,
    ForgotPasswordVerifyOtpView,
    ForgotPasswordResetView,
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
    ProfileImageUpdateRequestView,
    ProfileImageUpdateRequestReviewView,
    UCStateView,
)
from rest_framework_simplejwt.views import TokenRefreshView
from .api.dashboard import DashboardView
from .api.roles import RolesListView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('me/', MeView.as_view(), name='me'),
    path('mobile/request-otp/', MobileOtpRequestView.as_view(), name='mobile_request_otp'),
    path('mobile/verify-otp/', MobileOtpVerifyView.as_view(), name='mobile_verify_otp'),
    path('mobile/remove/', MobileRemoveView.as_view(), name='mobile_remove'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('forgot-password/request-otp/', ForgotPasswordRequestOtpView.as_view(), name='forgot_password_request_otp'),
    path('forgot-password/verify-otp/', ForgotPasswordVerifyOtpView.as_view(), name='forgot_password_verify_otp'),
    path('forgot-password/reset/', ForgotPasswordResetView.as_view(), name='forgot_password_reset'),
    path('profile/update/', ProfileUpdateView.as_view(), name='profile_update'),
    path('profile-image-update-requests/', ProfileImageUpdateRequestView.as_view(), name='profile_image_update_requests'),
    path('profile-image-update-requests/review/', ProfileImageUpdateRequestReviewView.as_view(), name='profile_image_update_requests_review_list'),
    path('profile-image-update-requests/<int:request_id>/review/', ProfileImageUpdateRequestReviewView.as_view(), name='profile_image_update_request_review'),
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Superuser impersonation
    path('impersonate/', SuperuserImpersonateView.as_view(), name='superuser_impersonate'),
    path('impersonation-history/', SuperuserImpersonationHistoryView.as_view(), name='impersonation_history'),
    path('impersonation-permissions/<int:user_id>/', SuperuserImpersonationPermissionView.as_view(), name='impersonation_permissions'),
    
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('roles/', RolesListView.as_view(), name='roles'),
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
    # Under-construction state (read: any auth, write: IQAC only)
    path('uc-state/', UCStateView.as_view(), name='uc_state'),
]
