from django.urls import path
from .views import RegisterView, MeView, CustomTokenObtainPairView, MobileOtpRequestView, MobileOtpVerifyView, NotificationTemplateApiView
from rest_framework_simplejwt.views import TokenRefreshView
from .api.dashboard import DashboardView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('me/', MeView.as_view(), name='me'),
    path('mobile/request-otp/', MobileOtpRequestView.as_view(), name='mobile_request_otp'),
    path('mobile/verify-otp/', MobileOtpVerifyView.as_view(), name='mobile_verify_otp'),
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('notification-templates/', NotificationTemplateApiView.as_view(), name='notification_templates'),
]
