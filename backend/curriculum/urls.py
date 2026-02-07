from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CurriculumMasterViewSet, CurriculumDepartmentViewSet, ElectiveSubjectViewSet, ElectiveChoicesView

router = DefaultRouter()
router.register(r'master', CurriculumMasterViewSet, basename='curriculum-master')
router.register(r'department', CurriculumDepartmentViewSet, basename='curriculum-department')
router.register(r'elective', ElectiveSubjectViewSet, basename='curriculum-elective')

urlpatterns = [
    path('', include(router.urls)),
    path('elective-choices/', ElectiveChoicesView.as_view(), name='elective-choices'),
]
