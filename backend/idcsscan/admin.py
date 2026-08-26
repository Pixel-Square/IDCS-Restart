from django.contrib import admin
from .models import (
    FingerprintEnrollment,
    BiometricFingerprintData,
    BioSecureClassGroup,
    BioSecureBatch,
    BioSecureAttendanceLog,
)


@admin.register(FingerprintEnrollment)
class FingerprintEnrollmentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "get_finger_display",
        "template_format",
        "quality_score",
        "device_type",
        "is_active",
        "enrolled_at",
    )
    list_filter = ("template_format", "device_type", "is_active")
    search_fields = ("user__username", "user__email", "device_type")
    readonly_fields = ("template", "enrolled_at")


@admin.register(BiometricFingerprintData)
class BiometricFingerprintDataAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "slot_id",
        "user",
        "reg_no",
        "staff_id",
        "finger_name",
        "sample_index",
        "quality_score",
        "device_type",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "device_type", "finger_name")
    search_fields = ("user__username", "user__first_name", "user__last_name", "reg_no", "staff_id", "slot_id")
    ordering = ("slot_id",)


@admin.register(BioSecureClassGroup)
class BioSecureClassGroupAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "is_active", "created_at")
    filter_horizontal = ("sections",)
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(BioSecureBatch)
class BioSecureBatchAdmin(admin.ModelAdmin):
    list_display = ("id", "group", "name", "start_time", "end_time", "days", "is_active")
    list_filter = ("is_active", "group")
    search_fields = ("name", "group__name")


@admin.register(BioSecureAttendanceLog)
class BioSecureAttendanceLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "group",
        "batch",
        "date",
        "placed",
        "verified_at",
        "finger_name",
        "slot_id",
        "created_at",
    )
    list_filter = ("placed", "date", "group", "batch")
    search_fields = (
        "student__username",
        "student__first_name",
        "student__last_name",
        "group__name",
        "finger_name",
    )
    date_hierarchy = "date"
    ordering = ("-date", "-verified_at")

