from django.contrib import admin

from .models import Certificate, StudentAchievement, CertificateAuditLog


@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    list_display = ('id', 'student', 'mentor', 'title', 'status', 'created_at', 'reviewed_at')
    list_filter = ('status', 'certificate_type', 'created_at')
    search_fields = ('title', 'student__reg_no', 'student__user__username', 'mentor__user__username')
    readonly_fields = ('file_hash', 'created_at', 'updated_at', 'reviewed_at')


@admin.register(StudentAchievement)
class StudentAchievementAdmin(admin.ModelAdmin):
    list_display = ('id', 'student', 'title', 'achievement_type', 'verified_by', 'verified_at')
    list_filter = ('achievement_type', 'verified_at')
    search_fields = ('title', 'student__reg_no', 'student__user__username')


@admin.register(CertificateAuditLog)
class CertificateAuditLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'certificate', 'action', 'actor', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('certificate__title', 'actor__username')
    readonly_fields = ('created_at',)
