from django.contrib import admin
from .models import TimetableTemplate, TimetableSlot, TimetableAssignment


@admin.register(TimetableTemplate)
class TimetableTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_by', 'is_public', 'parity', 'created_at')
    search_fields = ('name',)


@admin.register(TimetableSlot)
class TimetableSlotAdmin(admin.ModelAdmin):
    list_display = ('template', 'index', 'start_time', 'end_time', 'is_break', 'is_lunch', 'label')
    list_filter = ('template', 'is_break', 'is_lunch')
    ordering = ('template', 'index')


@admin.register(TimetableAssignment)
class TimetableAssignmentAdmin(admin.ModelAdmin):
    list_display = ('period', 'day', 'section', 'staff', 'curriculum_row', 'subject_text')
    list_filter = ('period__template', 'day')
    search_fields = ('subject_text',)
