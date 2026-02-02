from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SectionAdvisorViewSet, HODStaffListView, HODSectionsView, TeachingAssignmentViewSet, AdvisorMyStudentsView
from .views import DayAttendanceSessionViewSet, StudentDayAttendanceView

router = DefaultRouter()
router.register(r'section-advisors', SectionAdvisorViewSet, basename='section-advisor')
router.register(r'teaching-assignments', TeachingAssignmentViewSet, basename='teaching-assignment')
router.register(r'day-attendance-sessions', DayAttendanceSessionViewSet, basename='day-attendance-session')

# Expose router at the app root so when the app is included under
# `/api/academics/` the endpoints become `/api/academics/section-advisors/`, etc.
urlpatterns = [
    path('', include(router.urls)),
    path('hod-staff/', HODStaffListView.as_view()),
    path('sections/', HODSectionsView.as_view()),
    path('my-students/', AdvisorMyStudentsView.as_view()),
    path('attendance/day/', StudentDayAttendanceView.as_view()),
]
