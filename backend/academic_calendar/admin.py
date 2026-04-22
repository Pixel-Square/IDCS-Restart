from django.contrib import admin

from .models import AcademicCalendarEvent, HodColor, CalendarEventLabel, CalendarEventAssignment


@admin.register(AcademicCalendarEvent)
class AcademicCalendarEventAdmin(admin.ModelAdmin):
    list_display = ('title', 'start_date', 'end_date', 'source', 'created_by')
    list_filter = ('source',)
    search_fields = ('title', 'description', 'audience_department')


@admin.register(HodColor)
class HodColorAdmin(admin.ModelAdmin):
    list_display = ('hod', 'color', 'updated_by', 'updated_at')
    search_fields = ('hod__username',)


@admin.register(CalendarEventLabel)
class CalendarEventLabelAdmin(admin.ModelAdmin):
    list_display = ('title', 'color', 'semesters', 'visible_roles', 'created_by', 'created_at')
    search_fields = ('title',)
    list_filter = ('created_by',)


@admin.register(CalendarEventAssignment)
class CalendarEventAssignmentAdmin(admin.ModelAdmin):
    list_display = ('event', 'calendar_ref', 'start_date', 'end_date', 'created_by', 'created_at')
    list_filter = ('event',)
    search_fields = ('calendar_ref', 'description')
    raw_id_fields = ('event',)
