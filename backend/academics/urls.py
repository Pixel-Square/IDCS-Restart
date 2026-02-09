from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SectionAdvisorViewSet, HODStaffListView, HODSectionsView, TeachingAssignmentViewSet, AdvisorMyStudentsView, AdvisorStaffListView, DepartmentsListView
from .views import MentorStaffListView, MentorStudentsForStaffView, MentorMapCreateView, MentorUnmapView, MentorMyMenteesView
from .views import AcademicYearViewSet
from .views import StaffAssignedSubjectsView, SectionStudentsView
from .views import SubjectBatchViewSet, PeriodAttendanceSessionViewSet, StaffPeriodsView, StudentAttendanceView
from .analytics_views import AttendanceAnalyticsView, AnalyticsFiltersView

router = DefaultRouter()
router.register(r'section-advisors', SectionAdvisorViewSet, basename='section-advisor')
router.register(r'teaching-assignments', TeachingAssignmentViewSet, basename='teaching-assignment')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'subject-batches', SubjectBatchViewSet, basename='subject-batch')
router.register(r'period-attendance', PeriodAttendanceSessionViewSet, basename='period-attendance')

# Expose router at the app root so when the app is included under
# `/api/academics/` the endpoints become `/api/academics/section-advisors/`, etc.
urlpatterns = [
    path('', include(router.urls)),
    path('hod-staff/', HODStaffListView.as_view()),
    path('advisor-staff/', AdvisorStaffListView.as_view()),
    path('mentor/staff/', MentorStaffListView.as_view()),
    path('mentor/staff/<int:staff_id>/students/', MentorStudentsForStaffView.as_view()),
    path('mentor/map/', MentorMapCreateView.as_view()),
    path('mentor/unmap/', MentorUnmapView.as_view()),
    path('mentor/my-mentees/', MentorMyMenteesView.as_view()),
    path('departments/', DepartmentsListView.as_view()),
    path('sections/', HODSectionsView.as_view()),
    path('sections/<int:section_id>/students/', SectionStudentsView.as_view()),
    path('staff/assigned-subjects/', StaffAssignedSubjectsView.as_view()),
    path('staff/<int:staff_id>/assigned-subjects/', StaffAssignedSubjectsView.as_view()),
    path('my-students/', AdvisorMyStudentsView.as_view()),
    path('staff/periods/', StaffPeriodsView.as_view()),
    path('student/attendance/', StudentAttendanceView.as_view()),
    path('analytics/attendance/', AttendanceAnalyticsView.as_view()),
    path('analytics/filters/', AnalyticsFiltersView.as_view()),
]
