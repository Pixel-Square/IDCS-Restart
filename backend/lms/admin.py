from django.contrib import admin

from lms.models import StaffStorageQuota, StudyMaterial, StudyMaterialDownloadLog


@admin.register(StudyMaterial)
class StudyMaterialAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'title',
        'uploaded_by',
        'course',
        'material_type',
        'file_size_bytes',
        'created_at',
    )
    search_fields = (
        'title',
        'uploaded_by__staff_id',
        'uploaded_by__user__username',
        'course__name',
    )
    list_filter = ('material_type', 'course__department', 'created_at')


@admin.register(StaffStorageQuota)
class StaffStorageQuotaAdmin(admin.ModelAdmin):
    list_display = ('staff', 'quota_bytes', 'updated_at', 'updated_by')
    search_fields = ('staff__staff_id', 'staff__user__username')


@admin.register(StudyMaterialDownloadLog)
class StudyMaterialDownloadLogAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'material',
        'downloaded_by',
        'downloaded_by_staff',
        'downloaded_by_student',
        'downloaded_at',
    )
    search_fields = (
        'material__title',
        'downloaded_by__username',
        'downloaded_by_staff__staff_id',
        'downloaded_by_student__reg_no',
    )
    list_filter = ('downloaded_at',)
