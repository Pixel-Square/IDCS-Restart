from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html
from django.utils.http import urlencode

from .models import Cia1Mark, ObeMarkTableLock


@admin.register(Cia1Mark)
class Cia1MarkAdmin(admin.ModelAdmin):
    list_display = ('subject', 'student', 'mark', 'updated_at', 'bi')
    search_fields = ('subject__code', 'student__reg_no', 'student__user__username')
    list_filter = ('subject',)

    def bi(self, obj):
        try:
            base = reverse('admin:bi_factmark_changelist')
        except Exception:
            return '-'
        qs = urlencode(
            {
                'assessment_key__exact': 'cia1',
                'subject_code__exact': getattr(getattr(obj, 'subject', None), 'code', '') or '',
                'reg_no__exact': getattr(getattr(obj, 'student', None), 'reg_no', '') or '',
            }
        )
        return format_html('<a href="{}?{}" title="Open in BI">📊 BI</a>', base, qs)

    bi.short_description = 'BI'


@admin.register(ObeMarkTableLock)
class ObeMarkTableLockAdmin(admin.ModelAdmin):
    list_display = (
        'bi',
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

    def bi(self, obj):
        try:
            base = reverse('admin:bi_factmark_changelist')
        except Exception:
            return '-'
        qs = urlencode(
            {
                'assessment_key__exact': str(getattr(obj, 'assessment', '') or '').strip().lower(),
                'subject_code__exact': str(getattr(obj, 'subject_code', '') or '').strip(),
            }
        )
        return format_html('<a href="{}?{}" title="Open marks in BI">📊 BI</a>', base, qs)

    bi.short_description = 'BI'
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
