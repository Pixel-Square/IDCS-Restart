from django.contrib import admin
from .models import AttendanceRecord, UploadLog, Holiday, AttendanceSettings, DepartmentAttendanceSettings


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ['user', 'date', 'morning_in', 'evening_out', 'status', 'fn_status', 'an_status', 'uploaded_at']
    list_filter = ['status', 'fn_status', 'an_status', 'date', 'uploaded_at']
    search_fields = ['user__username', 'user__first_name', 'user__last_name']
    date_hierarchy = 'date'
    readonly_fields = ['uploaded_by', 'uploaded_at', 'source_file']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('user', 'date', 'status')
        }),
        ('Time Records', {
            'fields': ('morning_in', 'evening_out')
        }),
        ('Session Status', {
            'fields': ('fn_status', 'an_status'),
            'description': 'FN (Forenoon) and AN (Afternoon) attendance status'
        }),
        ('Additional Info', {
            'fields': ('notes',)
        }),
        ('Audit Information', {
            'fields': ('uploaded_by', 'uploaded_at', 'source_file'),
            'classes': ('collapse',)
        }),
    )


@admin.register(UploadLog)
class UploadLogAdmin(admin.ModelAdmin):
    list_display = ['filename', 'uploader', 'uploaded_at', 'target_date', 'processed_rows', 'success_count', 'error_count']
    list_filter = ['uploaded_at', 'target_date']
    search_fields = ['filename', 'uploader__username']
    readonly_fields = ['uploader', 'uploaded_at', 'processed_rows', 'success_count', 'error_count', 'errors']
    date_hierarchy = 'uploaded_at'
    
    def has_add_permission(self, request):
        # Prevent manual creation via admin
        return False


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ['date', 'name', 'is_sunday', 'is_removable', 'created_by', 'created_at']
    list_filter = ['date', 'is_sunday', 'is_removable', 'created_at']
    search_fields = ['name', 'notes']
    date_hierarchy = 'date'
    readonly_fields = ['created_by', 'created_at']
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(AttendanceSettings)
class AttendanceSettingsAdmin(admin.ModelAdmin):
    list_display = ['id', 'attendance_in_time_limit', 'mid_time_split', 'attendance_out_time_limit', 'lunch_from', 'lunch_to', 'apply_time_based_absence', 'updated_by', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']
    
    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)
    
    def has_add_permission(self, request):
        # Only allow one settings object
        if AttendanceSettings.objects.exists():
            return False
        return super().has_add_permission(request)
    
    def has_delete_permission(self, request, obj=None):
        # Prevent deletion of settings
        return False


@admin.register(DepartmentAttendanceSettings)
class DepartmentAttendanceSettingsAdmin(admin.ModelAdmin):
    list_display = ['name', 'get_departments', 'attendance_in_time_limit', 'attendance_out_time_limit', 'mid_time_split', 'lunch_from', 'lunch_to', 'enabled', 'updated_by', 'updated_at']
    list_filter = ['enabled', 'updated_at', 'departments']
    search_fields = ['name', 'description']
    filter_horizontal = ['departments']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Configuration', {
            'fields': ('name', 'description', 'departments')
        }),
        ('Time Limits', {
            'fields': ('attendance_in_time_limit', 'attendance_out_time_limit', 'mid_time_split', 'lunch_from', 'lunch_to')
        }),
        ('Settings', {
            'fields': ('apply_time_based_absence', 'enabled')
        }),
        ('Audit', {
            'fields': ('created_by', 'updated_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_departments(self, obj):
        return ', '.join([d.code for d in obj.departments.all()]) or 'None'
    get_departments.short_description = 'Departments'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


# Register any remaining staff_attendance models without explicit admin classes above.
from django.apps import apps as django_apps
from django.contrib.admin.sites import AlreadyRegistered

_staff_attendance_app_config = next((cfg for cfg in django_apps.get_app_configs() if cfg.name == 'staff_attendance'), None)
if _staff_attendance_app_config:
    for _model in _staff_attendance_app_config.get_models():
        if _model not in admin.site._registry:
            try:
                admin.site.register(_model)
            except AlreadyRegistered:
                pass
