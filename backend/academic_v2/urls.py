"""
Academic 2.1 URL Configuration
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    AcV2SemesterConfigViewSet,
    AcV2ClassTypeViewSet,
    AcV2CycleViewSet,
    AcV2QpTypeViewSet,
    AcV2QpPatternViewSet,
    AcV2CourseViewSet,
    AcV2SectionViewSet,
    AcV2ExamAssignmentViewSet,
    AcV2StudentMarkViewSet,
    AcV2EditRequestViewSet,
    AcV2InternalMarkViewSet,
    AcV2UserPatternOverrideViewSet,
    course_internal_summary,
    get_pattern_for_exam,
    faculty_course_info,
    faculty_courses_status,
    faculty_exam_info,
    faculty_exam_marks,
    faculty_exam_publish,
    faculty_exam_request_edit,
    faculty_exam_confirm_mark_manager,
    faculty_course_co_summary,
    faculty_course_cqi_draft,
    faculty_course_cqi_published,
    faculty_course_cqi_publish,
    faculty_exam_export_template,
    faculty_exam_import_marks,
    admin_secure_delete,
    admin_pass_mark_settings,
    # Bypass API
    bypass_start,
    bypass_end,
    bypass_add_log,
    bypass_reset_course,
    bypass_reset_exam,
    bypass_send_message,
    bypass_create_share_link,
    bypass_validate_share,
    bypass_session_detail,
    bypass_sessions_list,
    admin_courses_list,
    admin_course_faculty,
    faculty_reset_notices,
)

app_name = 'academic_v2'

router = DefaultRouter()
router.register(r'semester-configs', AcV2SemesterConfigViewSet, basename='semester-config')
router.register(r'class-types', AcV2ClassTypeViewSet, basename='class-type')
router.register(r'cycles', AcV2CycleViewSet, basename='cycle')
router.register(r'qp-types', AcV2QpTypeViewSet, basename='qp-type')
router.register(r'qp-patterns', AcV2QpPatternViewSet, basename='qp-pattern')
router.register(r'courses', AcV2CourseViewSet, basename='course')
router.register(r'sections', AcV2SectionViewSet, basename='section')
router.register(r'exam-assignments', AcV2ExamAssignmentViewSet, basename='exam-assignment')
router.register(r'student-marks', AcV2StudentMarkViewSet, basename='student-mark')
router.register(r'edit-requests', AcV2EditRequestViewSet, basename='edit-request')
router.register(r'internal-marks', AcV2InternalMarkViewSet, basename='internal-mark')
router.register(r'pattern-overrides', AcV2UserPatternOverrideViewSet, basename='pattern-override')

urlpatterns = [
    path('', include(router.urls)),
    
    # Helper endpoints
    path('courses/<uuid:course_id>/internal-summary/', course_internal_summary, name='course-internal-summary'),
    path('courses/<uuid:course_id>/pattern/<str:exam_type>/', get_pattern_for_exam, name='get-pattern-for-exam'),
    path('faculty/courses/', faculty_courses_status, name='faculty-courses-status'),
    path('faculty/courses/<int:ta_id>/', faculty_course_info, name='faculty-course-info'),
    path('exams/<uuid:exam_id>/', faculty_exam_info, name='faculty-exam-info'),
    path('exams/<uuid:exam_id>/marks/', faculty_exam_marks, name='faculty-exam-marks'),
    path('exams/<uuid:exam_id>/publish/', faculty_exam_publish, name='faculty-exam-publish'),
    path('exams/<uuid:exam_id>/request-edit/', faculty_exam_request_edit, name='faculty-exam-request-edit'),
    path('exams/<uuid:exam_id>/confirm-mark-manager/', faculty_exam_confirm_mark_manager, name='faculty-exam-confirm-mark-manager'),
    path('exams/<uuid:exam_id>/export-template/', faculty_exam_export_template, name='faculty-exam-export-template'),
    path('exams/<uuid:exam_id>/import-marks/', faculty_exam_import_marks, name='faculty-exam-import-marks'),
    path('faculty/courses/<int:ta_id>/co-summary/', faculty_course_co_summary, name='faculty-course-co-summary'),
    path('faculty/courses/<int:ta_id>/cqi-draft/', faculty_course_cqi_draft, name='faculty-course-cqi-draft'),
    path('faculty/courses/<int:ta_id>/cqi-published/', faculty_course_cqi_published, name='faculty-course-cqi-published'),
    path('faculty/courses/<int:ta_id>/cqi-publish/', faculty_course_cqi_publish, name='faculty-course-cqi-publish'),
    path('faculty/courses/<int:ta_id>/reset-notices/', faculty_reset_notices, name='faculty-reset-notices'),
    path('admin/secure-delete/', admin_secure_delete, name='admin-secure-delete'),
    path('admin/pass-mark-settings/', admin_pass_mark_settings, name='admin-pass-mark-settings'),

    # Admin CourseManager
    path('admin/courses/', admin_courses_list, name='admin-courses-list'),
    path('admin/courses/<int:ta_id>/faculty/', admin_course_faculty, name='admin-course-faculty'),

    # Admin Bypass
    path('admin/bypass/sessions/', bypass_sessions_list, name='bypass-sessions-list'),
    path('admin/bypass/start/', bypass_start, name='bypass-start'),
    path('admin/bypass/<uuid:session_id>/end/', bypass_end, name='bypass-end'),
    path('admin/bypass/<uuid:session_id>/log/', bypass_add_log, name='bypass-add-log'),
    path('admin/bypass/<uuid:session_id>/reset-course/', bypass_reset_course, name='bypass-reset-course'),
    path('admin/bypass/<uuid:session_id>/reset-exam/<uuid:exam_id>/', bypass_reset_exam, name='bypass-reset-exam'),
    path('admin/bypass/<uuid:session_id>/send-message/', bypass_send_message, name='bypass-send-message'),
    path('admin/bypass/<uuid:session_id>/share/', bypass_create_share_link, name='bypass-create-share'),
    path('admin/bypass/share/<str:token>/', bypass_validate_share, name='bypass-validate-share'),
    path('admin/bypass/<uuid:session_id>/detail/', bypass_session_detail, name='bypass-session-detail'),
]
