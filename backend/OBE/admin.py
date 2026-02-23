from django.contrib import admin

from .models import Cia1Mark, ObeMarkTableLock


@admin.register(Cia1Mark)
class Cia1MarkAdmin(admin.ModelAdmin):
    list_display = ('subject', 'student', 'mark', 'updated_at')
    search_fields = ('subject__code', 'student__reg_no', 'student__user__username')
    list_filter = ('subject',)


@admin.register(ObeMarkTableLock)
class ObeMarkTableLockAdmin(admin.ModelAdmin):
    list_display = (
        'assessment',
        'subject_code',
        'section_name',
        'staff_user',
        'is_published',
        'mark_entry_blocked',
        'mark_manager_locked',
        'updated_at',
    )
    search_fields = ('subject_code', 'subject_name', 'section_name', 'staff_user__username')
    list_filter = ('assessment', 'is_published', 'mark_entry_blocked', 'mark_manager_locked')
    raw_id_fields = ('staff_user', 'teaching_assignment', 'academic_year')
    readonly_fields = ('created_at', 'updated_at')
from .models import CdapRevision, CdapActiveLearningAnalysisMapping

@admin.register(CdapRevision)
class CdapRevisionAdmin(admin.ModelAdmin):
    list_display = ('subject_id', 'status', 'updated_at')
    search_fields = ('subject_id', 'status')
    readonly_fields = ('created_at', 'updated_at')




@admin.register(CdapActiveLearningAnalysisMapping)
class CdapActiveLearningAnalysisMappingAdmin(admin.ModelAdmin):
    list_display = ('id', 'updated_at')
    readonly_fields = ('updated_at',)
