from django.contrib import admin
from .models import TimetableTemplate, TimetableSlot, TimetableAssignment
from .models import SpecialTimetable, SpecialTimetableEntry, PeriodSwapRequest


@admin.register(TimetableTemplate)
class TimetableTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_by', 'is_public', 'parity', 'created_at')
    search_fields = ('name',)


@admin.register(TimetableSlot)
class TimetableSlotAdmin(admin.ModelAdmin):
    list_display = ('template', 'index', 'start_time', 'end_time', 'is_break', 'is_lunch', 'label')
    list_filter = ('college', 'template', 'is_break', 'is_lunch')
    ordering = ('template', 'index')
    # Hide index in the admin form; index is auto-managed
    exclude = ('index',)


@admin.register(TimetableAssignment)
class TimetableAssignmentAdmin(admin.ModelAdmin):
    list_display = ('period', 'day', 'section', 'staff', 'curriculum_row', 'subject_text')
    list_filter = ('college', 'period__template', 'day')
    search_fields = ('subject_text',)


@admin.register(SpecialTimetable)
class SpecialTimetableAdmin(admin.ModelAdmin):
    list_display = ('name', 'section', 'created_by', 'is_active', 'created_at')
    list_filter = ('college', 'is_active',)


@admin.register(SpecialTimetableEntry)
class SpecialTimetableEntryAdmin(admin.ModelAdmin):
    list_display = ('timetable', 'date', 'period', 'staff', 'curriculum_row', 'subject_text', 'is_active')
    list_filter = ('college', 'timetable', 'date', 'period')


@admin.register(PeriodSwapRequest)
class PeriodSwapRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'section', 'requested_by', 'requested_to', 'from_date', 'to_date', 'status', 'created_at')
    list_filter = ('college', 'status', 'from_date', 'to_date', 'created_at')
    search_fields = ('section__name', 'requested_by__staff_id', 'requested_to__staff_id', 'reason', 'response_message')
    readonly_fields = ('created_at', 'updated_at', 'responded_at')
    fieldsets = (
        ('Request Information', {
            'fields': ('section', 'requested_by', 'requested_to', 'status')
        }),
        ('From Period', {
            'fields': ('from_date', 'from_period', 'from_subject_text')
        }),
        ('To Period', {
            'fields': ('to_date', 'to_period', 'to_subject_text')
        }),
        ('Messages', {
            'fields': ('reason', 'response_message')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at', 'responded_at')
        }),
    )
