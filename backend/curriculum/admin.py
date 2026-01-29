from django.contrib import admin
from .models import CurriculumMaster, CurriculumDepartment


@admin.register(CurriculumMaster)
class CurriculumMasterAdmin(admin.ModelAdmin):
    list_display = ('regulation', 'semester', 'course_code', 'course_name', 'for_all_departments', 'editable')
    list_filter = ('regulation', 'semester', 'for_all_departments', 'editable')
    search_fields = ('course_code', 'course_name')
    filter_horizontal = ('departments',)
    actions = ['propagate_to_departments']

    def propagate_to_departments(self, request, queryset):
        # trigger save() to cause post_save propagation for selected masters
        for obj in queryset:
            obj.save()
        self.message_user(request, f"Triggered propagation for {queryset.count()} master(s)")
    propagate_to_departments.short_description = 'Propagate selected masters to departments'


@admin.register(CurriculumDepartment)
class CurriculumDepartmentAdmin(admin.ModelAdmin):
    list_display = ('department', 'regulation', 'semester', 'course_code', 'course_name', 'editable', 'overridden')
    list_filter = ('department', 'regulation', 'semester', 'editable', 'overridden')
    search_fields = ('course_code', 'course_name')

    def get_readonly_fields(self, request, obj=None):
        # If this department row is linked to a master which is not editable,
        # show core curriculum fields as read-only in admin to prevent edits.
        ro = list(super().get_readonly_fields(request, obj))
        if obj and obj.master and not getattr(obj.master, 'editable', False):
            ro += [
                'regulation', 'semester', 'course_code', 'course_name', 'class_type', 'category',
                'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
                'total_hours', 'question_paper_type',
            ]
        return ro

    def has_change_permission(self, request, obj=None):
        # Allow viewing in admin but prevent save via admin form if master is not editable.
        if obj and obj.master and not getattr(obj.master, 'editable', False):
            # still allow access to change page (read-only), but block POSTs via form
            if request.method != 'GET':
                return False
        return super().has_change_permission(request, obj=obj)
