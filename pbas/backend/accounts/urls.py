from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    LoginView,
    MeView,
    DemoUsersView,
    RoleListView,
    DepartmentListView,
    CollegeListView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('token/', LoginView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', MeView.as_view(), name='auth_me'),
    path('demo-users/', DemoUsersView.as_view(), name='demo_users'),
    path('roles/', RoleListView.as_view(), name='roles_list'),
    path('departments/', DepartmentListView.as_view(), name='departments_list'),
    path('colleges/', CollegeListView.as_view(), name='colleges_list'),
]
