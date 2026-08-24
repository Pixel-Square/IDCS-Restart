from django.contrib import admin

from .models import FingerprintEnrollment, BiometricFingerprintData


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
        "user",
        "reg_no",
        "staff_id",
        "finger_name",
        "slot_id",
        "quality_score",
        "device_type",
        "is_active",
        "created_at",
    )
    list_filter = ("device_type", "is_active", "finger_name")
    search_fields = ("reg_no", "staff_id", "user__username", "user__first_name", "user__last_name")
    readonly_fields = ("created_at", "updated_at")
