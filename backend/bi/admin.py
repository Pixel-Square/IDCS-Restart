from django.contrib import admin

from .models import DimStudent, DimSubject, DimTeachingAssignment, FactMark


class ReadOnlyAdminMixin:
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(DimStudent)
class DimStudentAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'student_id',
        'reg_no',
        'status',
        'dept_code',
        'course_name',
        'batch_name',
        'section_name',
        'username',
        'first_name',
        'last_name',
    )
    search_fields = ('reg_no', 'username', 'first_name', 'last_name', 'email')
    list_filter = ('status', 'dept_code', 'course_name')


@admin.register(DimSubject)
class DimSubjectAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('subject_id', 'subject_code', 'subject_name', 'semester_no', 'dept_code', 'course_name')
    search_fields = ('subject_code', 'subject_name')
    list_filter = ('dept_code', 'semester_no')


@admin.register(DimTeachingAssignment)
class DimTeachingAssignmentAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'teaching_assignment_id',
        'academic_year',
        'section_name',
        'subject_code',
        'subject_name',
        'staff_id',
        'staff_username',
        'is_active',
    )
    search_fields = ('subject_code', 'subject_name', 'staff_id', 'staff_username')
    list_filter = ('academic_year', 'is_active')


@admin.register(FactMark)
class FactMarkAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'assessment_key',
        'component_key',
        'subject_code',
        'reg_no',
        'score',
        'updated_at',
        'source_table',
    )
    search_fields = ('subject_code', 'subject_name', 'reg_no')
    list_filter = ('assessment_key', 'component_key')
    ordering = ('-updated_at',)
