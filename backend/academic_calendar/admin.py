from django.contrib import admin

from .models import AcademicCalendarEvent, HodColor


@admin.register(AcademicCalendarEvent)
class AcademicCalendarEventAdmin(admin.ModelAdmin):
    list_display = ('title', 'start_date', 'end_date', 'source', 'created_by')
    list_filter = ('source',)
    search_fields = ('title', 'description', 'audience_department')


@admin.register(HodColor)
class HodColorAdmin(admin.ModelAdmin):
    list_display = ('hod', 'color', 'updated_by', 'updated_at')
    search_fields = ('hod__username',)
