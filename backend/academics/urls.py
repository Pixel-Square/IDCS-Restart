
from django.urls import path, include
from rest_framework.routers import DefaultRouter

# Combined imports from recent branches
from .views import (
    MyTeachingAssignmentsView,
    SectionAdvisorViewSet,
    HODStaffListView,
    HODSectionsView,
    TeachingAssignmentStudentsView,
    TeachingAssignmentViewSet,
    AdvisorMyStudentsView,
    DayAttendanceSessionViewSet,
    StudentDayAttendanceView,
    StaffAssignedSubjectsView,
)

router = DefaultRouter()
router.register(r'section-advisors', SectionAdvisorViewSet, basename='section-advisor')
router.register(r'teaching-assignments', TeachingAssignmentViewSet, basename='teaching-assignment')
router.register(r'day-attendance-sessions', DayAttendanceSessionViewSet, basename='day-attendance-session')

# Expose router at the app root so when the app is included under
# `/api/academics/` the router endpoints become `/api/academics/.../`.
urlpatterns = [
    # Router-provided endpoints
    path('', include(router.urls)),

    # Teaching assignment helpers
    path('my-teaching-assignments/', MyTeachingAssignmentsView.as_view()),
    path('teaching-assignments/<int:ta_id>/students/', TeachingAssignmentStudentsView.as_view()),

    # HOD / staff endpoints
    path('hod-staff/', HODStaffListView.as_view()),
    path('sections/', HODSectionsView.as_view()),
    path('staff/assigned-subjects/', StaffAssignedSubjectsView.as_view()),
    path('staff/<int:staff_id>/assigned-subjects/', StaffAssignedSubjectsView.as_view()),

    # Advisor / attendance endpoints
    path('my-students/', AdvisorMyStudentsView.as_view()),
    path('attendance/day/', StudentDayAttendanceView.as_view()),
]
