
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SectionAdvisorViewSet,
    HODStaffListView,
    StaffsPageView,
    DepartmentStaffListView,
    BatchStaffListView,
    StaffProfileCreateView,
    StaffProfileUpdateView,
    StaffProfileDeleteView,
    StaffStatusUpdateView,
    StaffImportView,
    HODSectionsView,
    SectionsByDeptYearView,
    TeachingAssignmentViewSet,
    AdvisorStaffListView,
    MyTeachingAssignmentsView,
    AdvisorMyStudentsView,
    TeachingAssignmentStudentsView,
    DepartmentsListView,
    MentorStaffListView,
    MentorStudentsForStaffView,
    MentorMapCreateView,
    MentorUnmapView,
    SpecialCourseAssessmentEditRequestViewSet,
    AcademicYearViewSet,
    SemesterViewSet,
    StaffAssignedSubjectsView,
    SectionStudentsView,
    IQACCourseTeachingMapView,
    SpecialCourseEnabledAssessmentsView,
    CustomSubjectsListView,
    SubjectBatchViewSet,
    PeriodAttendanceSessionViewSet,
    AttendanceUnlockRequestViewSet,
    StaffPeriodsView,
    StudentAttendanceView,
    StudentMarksView,
    BatchYearViewSet,
    AllStaffListView,
    StaffDepartmentAssignView,
    StaffDepartmentRoleRemoveView,
    BatchListView,
)
from .analytics_views import AttendanceAnalyticsView, AnalyticsFiltersView, ClassAttendanceReportView, TodayPeriodAttendanceView, PeriodAttendanceReportView, OverallSectionView, MyClassStudentsView, DailyAttendanceView, DailyAttendanceLockView, DailyAttendanceUnlockView, MyClassAttendanceAnalyticsView, DailyAttendanceSessionDetailView, SectionStudentAttendanceDayView, DailyAttendanceRevertAssignmentView, DailyAttendanceUnlockRequestView, PeriodAttendanceUnlockRequestView, HODUnlockRequestsView, PeriodAttendanceSwapView, PeriodAttendanceRevertAssignmentView, AttendanceAssignmentRequestView, AttendanceAssignmentRequestActionView, AttendanceNotificationCountView, BulkAttendanceSectionsView, BulkAttendanceDownloadView, BulkAttendanceImportView, BulkAttendanceLockedSessionsView, BulkDailyAttendanceUnlockRequestView, OverallDailyAttendanceReportView
from .views import UnifiedUnlockRequestsView, DepartmentStudentsView, AllStudentsView, MentorMyMenteesView
from .views import BulkAssignSecondarySectionView, RemoveSecondarySectionView
from .student_import_views import StudentImportTemplateDownloadView, StudentBulkImportView
from .rfreader_views import RFReaderGateListCreateView, RFReaderStudentListCreateView, RFReaderLastScanView
from .public_views import PublicProfileLookupView
from .barcode_views import StudentBarcodeLookupView
from .views import ExtStaffProfileListCreateView, ExtStaffProfileDetailView, ExtStaffProfileUsersView, ExtStaffProfileBulkImportView, ExtStaffProfileBulkDeleteView


router = DefaultRouter()
router.register(r'section-advisors', SectionAdvisorViewSet, basename='section-advisor')
router.register(r'teaching-assignments', TeachingAssignmentViewSet, basename='teaching-assignment')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'semesters', SemesterViewSet, basename='semester')
router.register(r'subject-batches', SubjectBatchViewSet, basename='subject-batch')
router.register(r'batch-years', BatchYearViewSet, basename='batch-year')
router.register(r'period-attendance', PeriodAttendanceSessionViewSet, basename='period-attendance')
router.register(r'attendance-unlock-requests', AttendanceUnlockRequestViewSet, basename='attendance-unlock-request')
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
    path('staffs-page/', StaffsPageView.as_view()),
    path('all-staff/', AllStaffListView.as_view()),
    path('batch-staff/', BatchStaffListView.as_view()),
    path('batches/', BatchListView.as_view(), name='batch-list'),
    path('staff-department-assign/', StaffDepartmentAssignView.as_view()),
    path('staff-department-role-remove/', StaffDepartmentRoleRemoveView.as_view()),
    path('department-staff/', DepartmentStaffListView.as_view()),
    path('staffs/', StaffProfileCreateView.as_view()),
    path('staffs/import/', StaffImportView.as_view()),
    path('staffs/<int:pk>/', StaffProfileUpdateView.as_view()),
    path('staffs/<int:pk>/delete/', StaffProfileDeleteView.as_view()),
    path('staffs/<int:pk>/status/', StaffStatusUpdateView.as_view()),
    path('advisor-staff/', AdvisorStaffListView.as_view()),
    path('mentor/staff/', MentorStaffListView.as_view()),
    path('mentor/staff/<int:staff_id>/students/', MentorStudentsForStaffView.as_view()),
    path('mentor/map/', MentorMapCreateView.as_view()),
    path('mentor/unmap/', MentorUnmapView.as_view()),
    path('departments/', DepartmentsListView.as_view()),
    path('sections/', HODSectionsView.as_view()),
    path('sections/by-dept-year/', SectionsByDeptYearView.as_view()),
    path('sections/<int:section_id>/students/', SectionStudentsView.as_view()),
    path('staff/assigned-subjects/', StaffAssignedSubjectsView.as_view()),
    path('staff/<int:staff_id>/assigned-subjects/', StaffAssignedSubjectsView.as_view()),

    # IQAC / OBE Master helpers
    path('iqac/course-teaching/<str:course_code>/', IQACCourseTeachingMapView.as_view()),

    # SPECIAL course helpers
    path('special-courses/<str:course_code>/enabled_assessments/', SpecialCourseEnabledAssessmentsView.as_view()),

    # department / all students endpoints
    path('my-students/', AdvisorMyStudentsView.as_view()),  # used by MentorAssign
    path('mentor/my-mentees/', MentorMyMenteesView.as_view()),
    path('department-students/', DepartmentStudentsView.as_view()),
    path('all-students/', AllStudentsView.as_view()),
    path('bulk-assign-secondary-section/', BulkAssignSecondarySectionView.as_view()),
    path('remove-secondary-section/', RemoveSecondarySectionView.as_view()),
    path('students/import/', StudentBulkImportView.as_view()),
    path('students/import/template/', StudentImportTemplateDownloadView.as_view()),
    path('staff/periods/', StaffPeriodsView.as_view()),
    path('student/attendance/', StudentAttendanceView.as_view()),
    path('student/marks/', StudentMarksView.as_view()),
    path('custom-subjects/', CustomSubjectsListView.as_view()),
    path('analytics/attendance/', AttendanceAnalyticsView.as_view()),
    path('analytics/filters/', AnalyticsFiltersView.as_view()),
    path('analytics/class-report/', ClassAttendanceReportView.as_view()),
    path('analytics/today-periods/', TodayPeriodAttendanceView.as_view()),

    # Public helpers for krgiweb
    path('public-profile/', PublicProfileLookupView.as_view()),
    path('analytics/period-log/', PeriodAttendanceReportView.as_view()),
    path('analytics/overall-section/', OverallSectionView.as_view()),
    path('analytics/my-class-students/', MyClassStudentsView.as_view()),
    path('analytics/daily-attendance/', DailyAttendanceView.as_view()),
    path('analytics/daily-attendance/<int:session_id>/', DailyAttendanceSessionDetailView.as_view()),
    path('analytics/daily-attendance-lock/<int:session_id>/', DailyAttendanceLockView.as_view()),
    path('analytics/daily-attendance-unlock/<int:session_id>/', DailyAttendanceUnlockView.as_view()),
    path('analytics/daily-attendance-revert/<int:session_id>/', DailyAttendanceRevertAssignmentView.as_view()),
    path('analytics/period-attendance-swap/', PeriodAttendanceSwapView.as_view()),
    path('analytics/period-attendance-revert/<int:session_id>/', PeriodAttendanceRevertAssignmentView.as_view()),
    path('analytics/section-student-day/', SectionStudentAttendanceDayView.as_view()),
    path('attendance-analytics/', MyClassAttendanceAnalyticsView.as_view()),  # My Class endpoint
    
    # Two-stage unlock request endpoints
    path('daily-attendance-unlock-request/', DailyAttendanceUnlockRequestView.as_view()),
    path('period-attendance-unlock-request/', PeriodAttendanceUnlockRequestView.as_view()),
    path('hod-unlock-requests/', HODUnlockRequestsView.as_view()),
    path('unified-unlock-requests/', UnifiedUnlockRequestsView.as_view()),

    # RFReader (IQAC) endpoints
    path('rfreader/gates/', RFReaderGateListCreateView.as_view()),
    path('rfreader/students/', RFReaderStudentListCreateView.as_view()),
    path('rfreader/last-scan/', RFReaderLastScanView.as_view()),
    path('attendance-assignment-requests/', AttendanceAssignmentRequestView.as_view()),
    path('attendance-assignment-requests/<int:pk>/<str:action>/', AttendanceAssignmentRequestActionView.as_view()),
    path('analytics/attendance-notification-count/', AttendanceNotificationCountView.as_view()),
    path('analytics/overall-daily-attendance-report/', OverallDailyAttendanceReportView.as_view()),

    # Daily bulk attendance (Excel)
    path('bulk-attendance/sections/', BulkAttendanceSectionsView.as_view()),
    path('bulk-attendance/download/', BulkAttendanceDownloadView.as_view()),
    path('bulk-attendance/locked-sessions/', BulkAttendanceLockedSessionsView.as_view()),
    path('bulk-attendance/import/', BulkAttendanceImportView.as_view()),
    path('bulk-attendance/unlock-request/', BulkDailyAttendanceUnlockRequestView.as_view()),
    
    # Barcode Lookup
    path('student/lookup/<str:code>/', StudentBarcodeLookupView.as_view()),

    # External Staff Profiles
    path('ext-staff-profiles/', ExtStaffProfileListCreateView.as_view(), name='ext-staff-profiles-list'),
    path('ext-staff-profiles/available-users/', ExtStaffProfileUsersView.as_view(), name='ext-staff-profiles-users'),
    path('ext-staff-profiles/import/', ExtStaffProfileBulkImportView.as_view(), name='ext-staff-profiles-import'),
    path('ext-staff-profiles/bulk-delete/', ExtStaffProfileBulkDeleteView.as_view(), name='ext-staff-profiles-bulk-delete'),
    path('ext-staff-profiles/<int:pk>/', ExtStaffProfileDetailView.as_view(), name='ext-staff-profiles-detail'),
]
