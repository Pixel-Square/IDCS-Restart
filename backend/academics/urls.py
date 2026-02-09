
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SectionAdvisorViewSet, HODStaffListView, HODSectionsView, TeachingAssignmentViewSet, AdvisorMyStudentsView, AdvisorStaffListView, MyTeachingAssignmentsView, TeachingAssignmentStudentsView
from .views import SpecialCourseAssessmentEditRequestViewSet
from .views import AcademicYearViewSet
from .views import StaffAssignedSubjectsView, SectionStudentsView, IQACCourseTeachingMapView
from .views import SpecialCourseEnabledAssessmentsView
from .views import SubjectBatchViewSet, PeriodAttendanceSessionViewSet, StaffPeriodsView, StudentAttendanceView

router = DefaultRouter()
router.register(r'section-advisors', SectionAdvisorViewSet, basename='section-advisor')
router.register(r'teaching-assignments', TeachingAssignmentViewSet, basename='teaching-assignment')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'subject-batches', SubjectBatchViewSet, basename='subject-batch')
router.register(r'period-attendance', PeriodAttendanceSessionViewSet, basename='period-attendance')
router.register(r'special-assessment-edit-requests', SpecialCourseAssessmentEditRequestViewSet, basename='special-assessment-edit-request')

# Expose router at the app root so when the app is included under
# `/api/academics/` the router endpoints become `/api/academics/.../`.
urlpatterns = [
    # Router-provided endpoints
    path('', include(router.urls)),

    # Explicit teaching-assignment enabled assessments endpoint (faculty override)
    path('teaching-assignments/<int:pk>/enabled_assessments/', TeachingAssignmentViewSet.as_view({'get': 'enabled_assessments', 'post': 'enabled_assessments'})),
    path('teaching-assignments/<int:pk>/enabled_assessments/request-edit/', TeachingAssignmentViewSet.as_view({'post': 'enabled_assessments_request_edit'})),

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

    # IQAC / OBE Master helpers
    path('iqac/course-teaching/<str:course_code>/', IQACCourseTeachingMapView.as_view()),

    # SPECIAL course helpers
    path('special-courses/<str:course_code>/enabled_assessments/', SpecialCourseEnabledAssessmentsView.as_view()),

    # Advisor / attendance endpoints
    path('my-students/', AdvisorMyStudentsView.as_view()),
    path('staff/periods/', StaffPeriodsView.as_view()),
    path('student/attendance/', StudentAttendanceView.as_view()),
    # attendance endpoints removed
]
