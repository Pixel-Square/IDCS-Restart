import hashlib
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
    readonly_fields = ("template_preview", "enrolled_at")
    exclude = ("template",)

    def template_preview(self, obj):
        if not obj or not obj.template:
            return "(Empty)"
        raw = bytes(obj.template)
        return f"{len(raw)} bytes [SHA256: {hashlib.sha256(raw).hexdigest()[:16]}...]"
    template_preview.short_description = "Template Raw Bytes"


from .models import (
    FingerprintEnrollment,
    BiometricFingerprintData,
    BioSecureClassGroup,
    BioSecureBatch,
    BioSecureAttendanceLog,
)


@admin.register(BioSecureClassGroup)
class BioSecureClassGroupAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "is_active", "created_at")
    filter_horizontal = ("sections",)
    search_fields = ("name",)


class BioSecureBatchInline(admin.TabularInline):
    model = BioSecureBatch
    extra = 1


@admin.register(BioSecureBatch)
class BioSecureBatchAdmin(admin.ModelAdmin):
    list_display = ("id", "group", "name", "start_time", "end_time", "days", "is_active")
    list_filter = ("group", "is_active")


@admin.register(BioSecureAttendanceLog)
class BioSecureAttendanceLogAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "group", "batch", "date", "placed", "verified_at")
    list_filter = ("placed", "date", "group")
    search_fields = ("student__username", "student__first_name", "student__last_name")
