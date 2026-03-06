from django.contrib import admin
from .models import AttendanceRecord, UploadLog, Holiday


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ['user', 'date', 'morning_in', 'evening_out', 'status', 'uploaded_at']
    list_filter = ['status', 'date', 'uploaded_at']
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
    list_display = ['date', 'name', 'created_by', 'created_at']
    list_filter = ['date', 'created_at']
    search_fields = ['name', 'notes']
    date_hierarchy = 'date'
    readonly_fields = ['created_by', 'created_at']
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
