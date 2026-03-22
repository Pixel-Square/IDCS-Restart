from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import StaffSalaryViewSet

router = DefaultRouter()
router.register(r'salary', StaffSalaryViewSet, basename='staff-salary')

urlpatterns = [
    path('', include(router.urls)),
]
