"""
Academic 2.1 Django Admin Configuration
"""

from django.contrib import admin
from .models import (
    AcV2SemesterConfig,
    AcV2ClassType,
    AcV2QpPattern,
    AcV2QpType,
    AcV2Question,
    AcV2QpAssignment,
    AcV2Course,
    AcV2Section,
    AcV2ExamAssignment,
    AcV2StudentMark,
    AcV2UserPatternOverride,
    AcV2EditRequest,
    AcV2InternalMark,
)


@admin.register(AcV2SemesterConfig)
class AcV2SemesterConfigAdmin(admin.ModelAdmin):
    list_display = ['semester', 'due_at', 'publish_control_enabled', 'updated_at']
    list_filter = ['publish_control_enabled', 'semester']
    search_fields = ['semester__name']
    readonly_fields = ['created_at', 'updated_at']
    

@admin.register(AcV2ClassType)
class AcV2ClassTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'college', 'total_internal_marks', 'is_active', 'updated_at']
    list_filter = ['is_active', 'college', 'allow_customize_questions']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']


class AcV2QuestionInline(admin.TabularInline):
    """Inline editor for questions within QP Pattern."""
    model = AcV2Question
    extra = 1
    fields = ['title', 'max_marks', 'btl_level', 'co_number', 'is_enabled', 'order']
    ordering = ['order']


@admin.register(AcV2QpPattern)
class AcV2QpPatternAdmin(admin.ModelAdmin):
    list_display = ['qp_type', 'class_type', 'batch', 'is_active', 'updated_at']
    list_filter = ['qp_type', 'is_active', 'class_type']
    search_fields = ['qp_type']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [AcV2QuestionInline]


@admin.register(AcV2Course)
class AcV2CourseAdmin(admin.ModelAdmin):
    list_display = ['subject', 'semester', 'class_type', 'co_count', 'class_type_name']
    list_filter = ['class_type_name', 'class_type', 'semester']
    search_fields = ['subject__name', 'subject__code']
    raw_id_fields = ['subject', 'semester', 'class_type']


@admin.register(AcV2Section)
class AcV2SectionAdmin(admin.ModelAdmin):
    list_display = ['section_name', 'course', 'faculty_user', 'student_count']
    list_filter = ['course__class_type', 'course__semester']
    search_fields = ['section_name', 'faculty_user__username']
    raw_id_fields = ['course', 'faculty_user', 'teaching_assignment']
    
    def student_count(self, obj):
        return 0  # Placeholder
    student_count.short_description = 'Students'


@admin.register(AcV2ExamAssignment)
class AcV2ExamAssignmentAdmin(admin.ModelAdmin):
    list_display = ['exam_display_name', 'section', 'qp_type', 'weight', 'status', 'published_at']
    list_filter = ['status', 'qp_type', 'section__course__class_type']
    search_fields = ['exam', 'exam_display_name', 'section__section_name']
    raw_id_fields = ['section', 'last_saved_by', 'published_by']
    readonly_fields = ['created_at', 'updated_at', 'last_saved_at', 'published_at']


@admin.register(AcV2StudentMark)
class AcV2StudentMarkAdmin(admin.ModelAdmin):
    list_display = ['reg_no', 'student_name', 'exam_assignment', 'total_mark', 'is_absent', 'is_exempted']
    list_filter = ['is_absent', 'is_exempted', 'exam_assignment__section__course']
    search_fields = ['reg_no', 'student_name']
    raw_id_fields = ['exam_assignment', 'student']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(AcV2UserPatternOverride)
class AcV2UserPatternOverrideAdmin(admin.ModelAdmin):
    list_display = ['course', 'exam_type', 'created_by', 'created_at']
    list_filter = ['exam_type']
    search_fields = ['course__subject__name', 'created_by__username']
    raw_id_fields = ['course', 'created_by']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(AcV2EditRequest)
class AcV2EditRequestAdmin(admin.ModelAdmin):
    list_display = ['exam_assignment', 'requested_by', 'status', 'requested_at', 'approved_until']
    list_filter = ['status', 'current_stage']
    search_fields = ['exam_assignment__exam', 'requested_by__username', 'reason']
    raw_id_fields = ['exam_assignment', 'requested_by', 'reviewed_by']
    readonly_fields = ['requested_at', 'reviewed_at']


@admin.register(AcV2InternalMark)
class AcV2InternalMarkAdmin(admin.ModelAdmin):
    list_display = ['reg_no', 'student_name', 'section', 'final_mark', 'computed_at']
    list_filter = ['section__course__class_type', 'section__course__semester']
    search_fields = ['reg_no', 'student_name']
    raw_id_fields = ['section', 'student']
    readonly_fields = ['computed_at']


@admin.register(AcV2QpType)
class AcV2QpTypeAdmin(admin.ModelAdmin):
    """Admin for QP Type master data."""
    list_display = ['name', 'code', 'college', 'is_active', 'updated_at']
    list_filter = ['is_active', 'college']
    search_fields = ['name', 'code', 'description']
    readonly_fields = ['created_at', 'updated_at']
    fields = ['name', 'code', 'description', 'college', 'is_active', 'updated_by', 'created_at', 'updated_at']


@admin.register(AcV2Question)
class AcV2QuestionAdmin(admin.ModelAdmin):
    """Admin for individual questions."""
    list_display = ['title', 'qp_pattern', 'max_marks', 'btl_level', 'co_number', 'is_enabled', 'order']
    list_filter = ['is_enabled', 'btl_level', 'co_number', 'qp_pattern']
    search_fields = ['title', 'qp_pattern__name']
    readonly_fields = ['created_at', 'updated_at']
    fields = ['qp_pattern', 'title', 'max_marks', 'btl_level', 'co_number', 'is_enabled', 'order', 'updated_by', 'created_at', 'updated_at']
    raw_id_fields = ['qp_pattern']
    ordering = ['qp_pattern', 'order']


@admin.register(AcV2QpAssignment)
class AcV2QpAssignmentAdmin(admin.ModelAdmin):
    """Admin for QP Assignments (Class Type -> QP Type -> Exam Assignment)."""
    list_display = ['class_type', 'qp_type', 'exam_assignment', 'weight', 'is_active', 'updated_at']
    list_filter = ['is_active', 'class_type', 'qp_type']
    search_fields = ['class_type__name', 'qp_type__name', 'exam_assignment__exam']
    raw_id_fields = ['class_type', 'qp_type', 'exam_assignment']
    readonly_fields = ['created_at', 'updated_at']
    fields = ['class_type', 'qp_type', 'exam_assignment', 'weight', 'is_active', 'config', 'updated_by', 'created_at', 'updated_at']
    ordering = ['class_type', 'qp_type']
