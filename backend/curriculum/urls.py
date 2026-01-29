from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CurriculumMasterViewSet, CurriculumDepartmentViewSet

router = DefaultRouter()
router.register(r'master', CurriculumMasterViewSet, basename='curriculum-master')
router.register(r'department', CurriculumDepartmentViewSet, basename='curriculum-department')

urlpatterns = [
    path('', include(router.urls)),
]
