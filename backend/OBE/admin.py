from django.contrib import admin

from .models import Cia1Mark


@admin.register(Cia1Mark)
class Cia1MarkAdmin(admin.ModelAdmin):
    list_display = ('subject', 'student', 'mark', 'updated_at')
    search_fields = ('subject__code', 'student__reg_no', 'student__user__username')
    list_filter = ('subject',)
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
