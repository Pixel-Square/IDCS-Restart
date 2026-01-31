from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AttendanceSessionViewSet, AttendanceRecordViewSet, MyTeachingAssignmentsView, SubjectViewSet, StudentProfileViewSet, TeachingAssignmentStudentsView

router = DefaultRouter()
router.register(r'attendance-sessions', AttendanceSessionViewSet, basename='attendance-session')
router.register(r'attendance-records', AttendanceRecordViewSet, basename='attendance-record')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'students', StudentProfileViewSet, basename='student')

urlpatterns = [
    path('my-teaching-assignments/', MyTeachingAssignmentsView.as_view()),
    path('teaching-assignments/<int:ta_id>/students/', TeachingAssignmentStudentsView.as_view()),
    # Expose router endpoints directly under /api/academics/
    # Resulting paths:
    #   - /api/academics/subjects/
    #   - /api/academics/students/
    #   - /api/academics/attendance-sessions/
    #   - /api/academics/attendance-records/
    path('', include(router.urls)),
]
