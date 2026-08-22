from django.contrib import admin
from .models import TimetableTemplate, TimetableSlot, TimetableAssignment, Venue
from .models import SpecialTimetable, SpecialTimetableEntry, PeriodSwapRequest
# from .models import TeacherConstraints, SubjectRequirements, TeacherSubjectMapping, GeneratedTimetable, GenerationLog


@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'venue_type', 'capacity', 'location', 'is_active')
    list_filter = ('venue_type', 'is_active')
    search_fields = ('name', 'code', 'location')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(TimetableTemplate)
class TimetableTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_by', 'is_public', 'parity', 'created_at')
    search_fields = ('name',)


@admin.register(TimetableSlot)
class TimetableSlotAdmin(admin.ModelAdmin):
    list_display = ('template', 'index', 'start_time', 'end_time', 'is_break', 'is_lunch', 'label')
    list_filter = ('template', 'is_break', 'is_lunch')
    ordering = ('template', 'index')
    # Hide index in the admin form; index is auto-managed
    exclude = ('index',)


@admin.register(TimetableAssignment)
class TimetableAssignmentAdmin(admin.ModelAdmin):
    list_display = ('period', 'day', 'section', 'staff', 'curriculum_row', 'venue', 'subject_text')
    list_filter = ('period__template', 'day')
    search_fields = ('subject_text',)


@admin.register(SpecialTimetable)
class SpecialTimetableAdmin(admin.ModelAdmin):
    list_display = ('name', 'section', 'created_by', 'is_active', 'created_at')
    list_filter = ('is_active',)


@admin.register(SpecialTimetableEntry)
class SpecialTimetableEntryAdmin(admin.ModelAdmin):
    list_display = ('timetable', 'date', 'period', 'staff', 'curriculum_row', 'subject_text', 'is_active')
    list_filter = ('timetable', 'date', 'period')


@admin.register(PeriodSwapRequest)
class PeriodSwapRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'section', 'requested_by', 'requested_to', 'from_date', 'to_date', 'status', 'created_at')
    list_filter = ('status', 'from_date', 'to_date', 'created_at')
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


"""
# ─────────────────────────────────────────────────────────────
# Automatic Timetable Generator Admin
# ─────────────────────────────────────────────────────────────


@admin.register(TeacherConstraints)
class TeacherConstraintsAdmin(admin.ModelAdmin):
    list_display = ('staff', 'max_weekly_hours', 'max_consecutive_periods', 'created_at')
    list_filter = ('prefers_morning', 'prefers_afternoon', 'created_at')
    search_fields = ('staff__user__first_name', 'staff__user__last_name', 'staff__staff_id')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Teacher', {
            'fields': ('staff',)
        }),
        ('Workload Constraints', {
            'fields': ('max_weekly_hours', 'max_consecutive_periods')
        }),
        ('Availability', {
            'fields': ('available_days', 'unavailable_periods')
        }),
        ('Preferences', {
            'fields': ('prefers_morning', 'prefers_afternoon', 'prefers_no_first_hour', 'prefers_no_last_hour')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(SubjectRequirements)
class SubjectRequirementsAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'theory_hours', 'lab_hours', 'tutorial_hours', 'created_at')
    list_filter = ('requires_consecutive_slots', 'cannot_be_first_period', 'cannot_be_last_period', 'created_at')
    search_fields = ('curriculum_row__course_code', 'subject__code')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Subject', {
            'fields': ('curriculum_row', 'subject')
        }),
        ('Hours Breakdown', {
            'fields': ('theory_hours', 'lab_hours', 'tutorial_hours', 'practical_hours')
        }),
        ('Lab Requirements', {
            'fields': ('requires_consecutive_slots', 'consecutive_slot_count', 'lab_slot_duration_minutes')
        }),
        ('Period Constraints', {
            'fields': ('cannot_be_first_period', 'cannot_be_last_period', 'preferred_days')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(TeacherSubjectMapping)
class TeacherSubjectMappingAdmin(admin.ModelAdmin):
    list_display = ('staff', 'curriculum_row', 'effectiveness_score', 'ranking', 'is_primary', 'created_at')
    list_filter = ('is_primary', 'ranking', 'academic_year', 'can_teach_theory', 'can_teach_lab', 'can_teach_tutorial')
    search_fields = ('staff__user__first_name', 'staff__user__last_name', 'staff__staff_id', 
                     'curriculum_row__course_code', 'subject__code')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Teacher & Subject', {
            'fields': ('staff', 'curriculum_row', 'subject', 'section', 'academic_year')
        }),
        ('Effectiveness', {
            'fields': ('effectiveness_score', 'ranking', 'years_of_experience', 'is_primary')
        }),
        ('Teaching Capabilities', {
            'fields': ('can_teach_theory', 'can_teach_lab', 'can_teach_tutorial')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(GeneratedTimetable)
class GeneratedTimetableAdmin(admin.ModelAdmin):
    list_display = ('name', 'template', 'academic_year', 'status', 'total_assignments', 'generated_at')
    list_filter = ('status', 'generation_algorithm', 'created_at', 'generated_at', 'published_at')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at', 'generated_at', 'published_at', 'total_assignments', 'constraint_violations', 'error_message')
    filter_horizontal = ('departments', 'sections')
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'template', 'academic_year')
        }),
        ('Scope', {
            'fields': ('departments', 'sections')
        }),
        ('Generation', {
            'fields': ('status', 'generation_algorithm', 'error_message')
        }),
        ('Results', {
            'fields': ('total_assignments', 'constraint_violations')
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'generated_at', 'published_at')
        }),
    )


@admin.register(GenerationLog)
class GenerationLogAdmin(admin.ModelAdmin):
    list_display = ('generated_timetable', 'level', 'message', 'created_at')
    list_filter = ('level', 'created_at', 'generated_timetable')
    search_fields = ('message', 'generated_timetable__name')
    readonly_fields = ('created_at',)
    
    def has_add_permission(self, request):
        # Logs are created automatically, not manually
        return False
    
    def has_delete_permission(self, request, obj=None):
        # Allow deletion of logs for cleanup
        return True
"""
