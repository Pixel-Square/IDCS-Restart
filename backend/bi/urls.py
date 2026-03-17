from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DimStudentViewSet,
    DimSubjectViewSet,
    DimTeachingAssignmentViewSet,
    FactMarkViewSet,
)
from .simple_export import (
    login_simple,
    download_students_simple,
    download_subjects_simple,
    download_staff_simple,
)

router = DefaultRouter()
router.register(r'students', DimStudentViewSet, basename='student')
router.register(r'subjects', DimSubjectViewSet, basename='subject')
router.register(r'teaching-assignments', DimTeachingAssignmentViewSet, basename='teaching-assignment')
router.register(r'marks', FactMarkViewSet, basename='mark')

urlpatterns = [
    path('', include(router.urls)),
    
    # Simple CSV export with just username/password (No JWT tokens)
    path('simple/login/', login_simple, name='login_simple'),
    path('simple/download/students/', download_students_simple, name='download_students'),
    path('simple/download/subjects/', download_subjects_simple, name='download_subjects'),
    path('simple/download/staff/', download_staff_simple, name='download_staff'),
]
