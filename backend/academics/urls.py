
from django.urls import path, include
from rest_framework.routers import DefaultRouter
<<<<<<< HEAD

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
=======
from .views import SectionAdvisorViewSet, HODStaffListView, HODSectionsView, TeachingAssignmentViewSet, AdvisorMyStudentsView, AdvisorStaffListView
from .views import AcademicYearViewSet
from .views import StaffAssignedSubjectsView, SectionStudentsView
from .views import SubjectBatchViewSet, PeriodAttendanceSessionViewSet, StaffPeriodsView, StudentAttendanceView
>>>>>>> origin/main

router = DefaultRouter()
router.register(r'section-advisors', SectionAdvisorViewSet, basename='section-advisor')
router.register(r'teaching-assignments', TeachingAssignmentViewSet, basename='teaching-assignment')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'subject-batches', SubjectBatchViewSet, basename='subject-batch')
router.register(r'period-attendance', PeriodAttendanceSessionViewSet, basename='period-attendance')

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
    path('advisor-staff/', AdvisorStaffListView.as_view()),
    path('sections/', HODSectionsView.as_view()),
    path('sections/<int:section_id>/students/', SectionStudentsView.as_view()),
    path('staff/assigned-subjects/', StaffAssignedSubjectsView.as_view()),
    path('staff/<int:staff_id>/assigned-subjects/', StaffAssignedSubjectsView.as_view()),

    # Advisor / attendance endpoints
    path('my-students/', AdvisorMyStudentsView.as_view()),
    path('staff/periods/', StaffPeriodsView.as_view()),
    path('student/attendance/', StudentAttendanceView.as_view()),
    # attendance endpoints removed
]
