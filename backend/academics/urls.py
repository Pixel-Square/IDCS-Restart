from django.urls import path, include
from rest_framework.routers import DefaultRouter
<<<<<<< HEAD
from .views import AttendanceSessionViewSet, AttendanceRecordViewSet, MyTeachingAssignmentsView, SubjectViewSet, StudentProfileViewSet, TeachingAssignmentStudentsView

router = DefaultRouter()
router.register(r'attendance-sessions', AttendanceSessionViewSet, basename='attendance-session')
router.register(r'attendance-records', AttendanceRecordViewSet, basename='attendance-record')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'students', StudentProfileViewSet, basename='student')
=======
from .views import SectionAdvisorViewSet, HODStaffListView, HODSectionsView, TeachingAssignmentViewSet, AdvisorMyStudentsView
from .views import DayAttendanceSessionViewSet, StudentDayAttendanceView
from .views import StaffAssignedSubjectsView

router = DefaultRouter()
router.register(r'section-advisors', SectionAdvisorViewSet, basename='section-advisor')
router.register(r'teaching-assignments', TeachingAssignmentViewSet, basename='teaching-assignment')
router.register(r'day-attendance-sessions', DayAttendanceSessionViewSet, basename='day-attendance-session')
>>>>>>> origin/main

# Expose router at the app root so when the app is included under
# `/api/academics/` the endpoints become `/api/academics/section-advisors/`, etc.
urlpatterns = [
<<<<<<< HEAD
    path('my-teaching-assignments/', MyTeachingAssignmentsView.as_view()),
    path('teaching-assignments/<int:ta_id>/students/', TeachingAssignmentStudentsView.as_view()),
    # Expose router endpoints directly under /api/academics/
    # Resulting paths:
    #   - /api/academics/subjects/
    #   - /api/academics/students/
    #   - /api/academics/attendance-sessions/
    #   - /api/academics/attendance-records/
    path('', include(router.urls)),
=======
    path('', include(router.urls)),
    path('hod-staff/', HODStaffListView.as_view()),
    path('sections/', HODSectionsView.as_view()),
    path('staff/assigned-subjects/', StaffAssignedSubjectsView.as_view()),
    path('staff/<int:staff_id>/assigned-subjects/', StaffAssignedSubjectsView.as_view()),
    path('my-students/', AdvisorMyStudentsView.as_view()),
    path('attendance/day/', StudentDayAttendanceView.as_view()),
>>>>>>> origin/main
]
