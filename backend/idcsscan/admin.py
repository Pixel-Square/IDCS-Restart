from django.contrib import admin

from .models import FingerprintEnrollment


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
