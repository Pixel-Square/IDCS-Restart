"""
IDCS Coder - URL Configuration

All endpoints under /api/coder/
"""
from django.urls import path
from .views import (
    CoderMeView,

    # Admin
    AdminCourseListCreateView,
    AdminCourseDetailView,
    AdminCourseInchargeView,
    AdminClassListCreateView,
    AdminClassDetailView,
    AdminSectionInchargeView,
    AdminEnrollmentView,
    AdminAnalyticsView,
    AdminUserSearchView,
    AdminSectionListView,

    # Incharge
    InchargeCoursesView,
    InchargeCourseDetailView,
    InchargeSessionListCreateView,
    InchargeSessionDetailView,
    InchargeAssessmentListCreateView,
    InchargeAssessmentDetailView,
    InchargeSubmissionsView,

    # MCQ
    MCQImportView,
    MCQQuestionListCreateView,
    MCQQuestionDetailView,

    # Coding Project
    CodingProjectView,
    ProjectFileListCreateView,
    ProjectFileDetailView,
    LockedRegionView,
    ProjectFolderListCreateView,
    ProjectFolderDetailView,
    ProjectTreeView,
    TemplateListView,
    ApplyTemplateView,
    ImportZipView,

    # Test Cases
    TestCaseListCreateView,
    TestCaseDetailView,

    # Student
    StudentDashboardView,
    StudentCoursesView,
    StudentCourseDetailView,
    StudentAssessmentDetailView,
    StudentMCQSubmitView,
    StudentCodeRunView,
    StudentCodeSubmitView,
    StudentSubmissionStatusView,
    StudentProgressView,

    # Section Incharge
    SectionInchargeClassesView,
    SectionInchargeStudentsView,
    SectionInchargeStudentDetailView,
    SectionInchargeAnalyticsView,

    # Execution
    ExecutionSessionStartView,
    ExecutionSessionDetailView,
    ExecutionSessionStopView,
    ExecutionSessionLogsView,
    PreviewProxyView,
)

urlpatterns = [
    # -----------------------------------------------------------------------
    # Auth / Context
    # -----------------------------------------------------------------------
    path('me/', CoderMeView.as_view(), name='coder-me'),

    # -----------------------------------------------------------------------
    # CODE_ADMIN
    # -----------------------------------------------------------------------
    path('admin/courses/', AdminCourseListCreateView.as_view(), name='coder-admin-courses'),
    path('admin/courses/<int:pk>/', AdminCourseDetailView.as_view(), name='coder-admin-course-detail'),
    path('admin/course-incharges/', AdminCourseInchargeView.as_view(), name='coder-admin-incharges'),
    path('admin/classes/', AdminClassListCreateView.as_view(), name='coder-admin-classes'),
    path('admin/classes/<int:pk>/', AdminClassDetailView.as_view(), name='coder-admin-class-detail'),
    path('admin/section-incharges/', AdminSectionInchargeView.as_view(), name='coder-admin-section-incharges'),
    path('admin/enrollments/sync/', AdminEnrollmentView.as_view(), name='coder-admin-enrollment-sync'),
    path('admin/analytics/', AdminAnalyticsView.as_view(), name='coder-admin-analytics'),
    
    path('admin/users/search/', AdminUserSearchView.as_view(), name='coder-admin-user-search'),
    path('admin/sections/', AdminSectionListView.as_view(), name='coder-admin-sections'),

    # -----------------------------------------------------------------------
    # CODE_COURSE_INCHARGE
    # -----------------------------------------------------------------------
    path('courses/', InchargeCoursesView.as_view(), name='coder-incharge-courses'),
    path('courses/<int:pk>/', InchargeCourseDetailView.as_view(), name='coder-incharge-course-detail'),
    path('sessions/', InchargeSessionListCreateView.as_view(), name='coder-sessions'),
    path('sessions/<int:pk>/', InchargeSessionDetailView.as_view(), name='coder-session-detail'),
    path('assessments/', InchargeAssessmentListCreateView.as_view(), name='coder-assessments'),
    path('assessments/<int:pk>/', InchargeAssessmentDetailView.as_view(), name='coder-assessment-detail'),
    path('submissions/', InchargeSubmissionsView.as_view(), name='coder-incharge-submissions'),

    # MCQ
    path('mcq/import/', MCQImportView.as_view(), name='coder-mcq-import'),
    path('questions/', MCQQuestionListCreateView.as_view(), name='coder-questions'),
    path('questions/<int:pk>/', MCQQuestionDetailView.as_view(), name='coder-question-detail'),

    # Coding project / files / folders
    path('projects/<int:assessment_id>/', CodingProjectView.as_view(), name='coder-project'),
    path('projects/<int:assessment_id>/tree/', ProjectTreeView.as_view(), name='coder-project-tree'),
    path('files/', ProjectFileListCreateView.as_view(), name='coder-files'),
    path('files/<int:pk>/', ProjectFileDetailView.as_view(), name='coder-file-detail'),
    path('folders/', ProjectFolderListCreateView.as_view(), name='coder-folders'),
    path('folders/<int:pk>/', ProjectFolderDetailView.as_view(), name='coder-folder-detail'),
    path('locked-regions/', LockedRegionView.as_view(), name='coder-locked-regions'),
    path('locked-regions/<int:pk>/', LockedRegionView.as_view(), name='coder-locked-region-detail'),

    # Templates
    path('templates/', TemplateListView.as_view(), name='coder-templates'),
    path('projects/<int:project_id>/apply-template/', ApplyTemplateView.as_view(), name='coder-apply-template'),
    path('projects/<int:project_id>/import-zip/', ImportZipView.as_view(), name='coder-import-zip'),

    # Test cases
    path('testcases/', TestCaseListCreateView.as_view(), name='coder-testcases'),
    path('testcases/<int:pk>/', TestCaseDetailView.as_view(), name='coder-testcase-detail'),

    # -----------------------------------------------------------------------
    # STUDENT
    # -----------------------------------------------------------------------
    path('student/dashboard/', StudentDashboardView.as_view(), name='coder-student-dashboard'),
    path('student/courses/', StudentCoursesView.as_view(), name='coder-student-courses'),
    path('student/courses/<int:pk>/', StudentCourseDetailView.as_view(), name='coder-student-course-detail'),
    path('student/assessments/<int:pk>/', StudentAssessmentDetailView.as_view(), name='coder-student-assessment'),
    path('student/assessments/<int:assessment_id>/mcq/submit/', StudentMCQSubmitView.as_view(), name='coder-student-mcq-submit'),
    path('student/assessments/<int:assessment_id>/run/', StudentCodeRunView.as_view(), name='coder-student-run'),
    path('student/assessments/<int:assessment_id>/submit/', StudentCodeSubmitView.as_view(), name='coder-student-submit'),
    path('student/submissions/<int:submission_id>/', StudentSubmissionStatusView.as_view(), name='coder-student-submission-status'),
    path('student/progress/<int:course_id>/', StudentProgressView.as_view(), name='coder-student-progress'),

    # -----------------------------------------------------------------------
    # CODE_SECTION_INCHARGE (read-only)
    # -----------------------------------------------------------------------
    path('section/classes/', SectionInchargeClassesView.as_view(), name='coder-section-classes'),
    path('section/classes/<int:class_id>/students/', SectionInchargeStudentsView.as_view(), name='coder-section-students'),
    path('section/classes/<int:class_id>/students/<int:student_id>/', SectionInchargeStudentDetailView.as_view(), name='coder-section-student-detail'),
    path('section/classes/<int:class_id>/analytics/', SectionInchargeAnalyticsView.as_view(), name='coder-section-analytics'),

    # -----------------------------------------------------------------------
    # Execution Sessions (Web Preview)
    # -----------------------------------------------------------------------
    path('student/assessments/<int:assessment_id>/execute/', ExecutionSessionStartView.as_view(), name='coder-exec-start'),
    path('executions/<int:session_id>/', ExecutionSessionDetailView.as_view(), name='coder-exec-detail'),
    path('executions/<int:session_id>/stop/', ExecutionSessionStopView.as_view(), name='coder-exec-stop'),
    path('executions/<int:session_id>/logs/', ExecutionSessionLogsView.as_view(), name='coder-exec-logs'),

    # Preview proxy — must be authenticated; never exposes container ports
    path('preview/<str:token>/', PreviewProxyView.as_view(), name='coder-preview'),
    path('preview/<str:token>/<path:subpath>', PreviewProxyView.as_view(), name='coder-preview-subpath'),
]
