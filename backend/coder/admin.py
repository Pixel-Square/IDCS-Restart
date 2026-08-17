from django.contrib import admin
from .models import (
    CodeCourse,
    CodeCourseIncharge,
    CodeClass,
    CodeSectionIncharge,
    CodeEnrollment,
    CodeSession,
    CodeAssessment,
    MCQQuestion,
    CodingProject,
    ProjectFolder,
    ProjectFile,
    LockedCodeRegion,
    TestCase,
    CodeSubmission,
    MCQSubmission,
    StudentProgress,
    CodeExecution,
)


@admin.register(CodeCourse)
class CodeCourseAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'academic_year', 'status', 'created_at']
    list_filter = ['status', 'academic_year']
    search_fields = ['name', 'code']


@admin.register(CodeCourseIncharge)
class CodeCourseInchargeAdmin(admin.ModelAdmin):
    list_display = ['course', 'user', 'is_active', 'assigned_at']
    list_filter = ['is_active', 'course']
    search_fields = ['user__username', 'user__email', 'course__name']


@admin.register(CodeClass)
class CodeClassAdmin(admin.ModelAdmin):
    list_display = ['name', 'course', 'idcs_section', 'academic_year', 'is_active']
    list_filter = ['is_active', 'course']
    search_fields = ['name', 'course__name']


@admin.register(CodeSectionIncharge)
class CodeSectionInchargeAdmin(admin.ModelAdmin):
    list_display = ['code_class', 'user', 'is_active', 'assigned_at']
    list_filter = ['is_active']
    search_fields = ['user__username', 'code_class__name']


@admin.register(CodeEnrollment)
class CodeEnrollmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'code_class', 'is_active', 'enrolled_at']
    list_filter = ['is_active', 'code_class__course']
    search_fields = ['student__reg_no', 'student__user__username']


@admin.register(CodeSession)
class CodeSessionAdmin(admin.ModelAdmin):
    list_display = ['course', 'order', 'title', 'session_type', 'is_published']
    list_filter = ['session_type', 'is_published', 'course']
    search_fields = ['title', 'course__name']
    ordering = ['course', 'order']


@admin.register(CodeAssessment)
class CodeAssessmentAdmin(admin.ModelAdmin):
    list_display = ['session', 'title', 'assessment_type', 'status', 'total_marks', 'duration_minutes']
    list_filter = ['assessment_type', 'status']
    search_fields = ['title', 'session__course__name']


@admin.register(MCQQuestion)
class MCQQuestionAdmin(admin.ModelAdmin):
    list_display = ['assessment', 'order', 'question_text_short', 'marks']
    list_filter = ['assessment__session__course']
    search_fields = ['question_text', 'assessment__title']

    def question_text_short(self, obj):
        return obj.question_text[:60]
    question_text_short.short_description = 'Question'


@admin.register(CodingProject)
class CodingProjectAdmin(admin.ModelAdmin):
    list_display = ['assessment', 'time_limit_seconds', 'memory_limit_mb', 'entry_point']


@admin.register(ProjectFolder)
class ProjectFolderAdmin(admin.ModelAdmin):
    list_display = ['name', 'project', 'parent', 'is_locked']
    list_filter = ['is_locked']


@admin.register(ProjectFile)
class ProjectFileAdmin(admin.ModelAdmin):
    list_display = ['name', 'project', 'folder', 'is_locked', 'updated_at']
    list_filter = ['is_locked']
    search_fields = ['name']


@admin.register(LockedCodeRegion)
class LockedCodeRegionAdmin(admin.ModelAdmin):
    list_display = ['file', 'start_line', 'end_line', 'label']


@admin.register(TestCase)
class TestCaseAdmin(admin.ModelAdmin):
    list_display = ['assessment', 'order', 'is_hidden', 'marks', 'description']
    list_filter = ['is_hidden', 'assessment__session__course']


@admin.register(CodeSubmission)
class CodeSubmissionAdmin(admin.ModelAdmin):
    list_display = ['student', 'assessment', 'attempt_number', 'status', 'score', 'submitted_at']
    list_filter = ['status', 'assessment__session__course']
    search_fields = ['student__reg_no', 'assessment__title']


@admin.register(MCQSubmission)
class MCQSubmissionAdmin(admin.ModelAdmin):
    list_display = ['student', 'assessment', 'attempt_number', 'score', 'total_score', 'submitted_at']
    list_filter = ['assessment__session__course']
    search_fields = ['student__reg_no', 'assessment__title']


@admin.register(StudentProgress)
class StudentProgressAdmin(admin.ModelAdmin):
    list_display = ['student', 'course', 'overall_score', 'total_possible_score', 'last_accessed_at']
    list_filter = ['course']
    search_fields = ['student__reg_no', 'course__name']


@admin.register(CodeExecution)
class CodeExecutionAdmin(admin.ModelAdmin):
    list_display = ['student', 'assessment', 'is_run_only', 'status', 'started_at', 'execution_time_ms']
    list_filter = ['status', 'is_run_only']
