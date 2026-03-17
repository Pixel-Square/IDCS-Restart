from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered
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


# Register any remaining OBE models that don't have explicit admin classes above.
obe_app_config = next((cfg for cfg in apps.get_app_configs() if cfg.name == 'OBE'), None)


def _build_default_admin(model):
    field_names = {f.name for f in model._meta.fields}

    list_display_candidates = [
        'id',
        'assessment',
        'subject',
        'subject_code',
        'section_name',
        'student',
        'staff_user',
        'mark',
        'status',
        'updated_at',
        'created_at',
    ]
    list_display = tuple(name for name in list_display_candidates if name in field_names) or ('id',)

    list_filter_candidates = ['assessment', 'status', 'is_published', 'created_at', 'updated_at']
    list_filter = tuple(name for name in list_filter_candidates if name in field_names)

    search_fields = []
    if 'subject_code' in field_names:
        search_fields.append('subject_code')
    if 'section_name' in field_names:
        search_fields.append('section_name')
    if 'status' in field_names:
        search_fields.append('status')
    if 'assessment' in field_names:
        search_fields.append('assessment')
    if 'subject' in field_names:
        search_fields.extend(['subject__code', 'subject__name'])
    if 'student' in field_names:
        search_fields.extend(['student__reg_no', 'student__user__username'])
    if 'staff_user' in field_names:
        search_fields.append('staff_user__username')

    readonly_fields = tuple(name for name in ('created_at', 'updated_at') if name in field_names)

    attrs = {
        'list_display': list_display,
        'list_filter': list_filter,
        'search_fields': tuple(search_fields),
        'readonly_fields': readonly_fields,
    }
    return type(f'{model.__name__}AutoAdmin', (admin.ModelAdmin,), attrs)


if obe_app_config:
    for model in obe_app_config.get_models():
        if model not in admin.site._registry:
            try:
                admin.site.register(model, _build_default_admin(model))
            except AlreadyRegistered:
                pass
