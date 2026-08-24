from __future__ import annotations

from django.conf import settings
from django.db import models


class FingerprintEnrollment(models.Model):
    """Stores fingerprint biometric templates for students and staff."""

    class Finger(models.TextChoices):
        L_THUMB = "L_THUMB", "Left Thumb"
        L_INDEX = "L_INDEX", "Left Index"
        L_MIDDLE = "L_MIDDLE", "Left Middle"
        L_RING = "L_RING", "Left Ring"
        L_LITTLE = "L_LITTLE", "Left Little"
        R_THUMB = "R_THUMB", "Right Thumb"
        R_INDEX = "R_INDEX", "Right Index"
        R_MIDDLE = "R_MIDDLE", "Right Middle"
        R_RING = "R_RING", "Right Ring"
        R_LITTLE = "R_LITTLE", "Right Little"

    class TemplateFormat(models.TextChoices):
        ISO_19794_2 = "ISO_19794_2", "ISO 19794-2"
        ANSI_378 = "ANSI_378", "ANSI 378"
        ESSL_PROPRIETARY = "ESSL_PROPRIETARY", "ESSL Proprietary"
        RAW = "RAW", "Raw / Other"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fingerprint_enrollments",
    )
    finger = models.CharField(max_length=16, choices=Finger.choices)
    template = models.BinaryField(
        help_text="Raw fingerprint template bytes from the scanner SDK."
    )
    template_format = models.CharField(
        max_length=24,
        choices=TemplateFormat.choices,
        default=TemplateFormat.ISO_19794_2,
    )
    quality_score = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text="Enrollment quality score (0-100) reported by the device.",
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)
    enrolled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="Admin/security user who performed the enrollment.",
    )
    device_type = models.CharField(
        max_length=64, blank=True, default="",
        help_text="Scanner model, e.g. ESSL-X990, SecuGen-Hamster-Pro.",
    )
    is_active = models.BooleanField(default=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("user", "finger")
        ordering = ("user", "finger")
        indexes = [
            models.Index(fields=["user", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} – {self.get_finger_display()} ({'active' if self.is_active else 'inactive'})"


class BiometricFingerprintData(models.Model):
    """
    Dedicated table storing structured biometric fingerprint logs, slot assignments,
    hardware template hex/base64 records, and user associations.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="biometric_fingerprint_records",
    )
    reg_no = models.CharField(max_length=64, blank=True, default="", db_index=True)
    staff_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    finger_name = models.CharField(max_length=32, blank=True, default="Right Index")
    slot_id = models.IntegerField(null=True, blank=True, db_index=True, help_text="Hardware sensor slot number (1-300)")
    template_b64 = models.TextField(help_text="Base64 encoded template data")
    template_hash = models.CharField(max_length=64, blank=True, default="", db_index=True)
    quality_score = models.IntegerField(default=80)
    device_type = models.CharField(max_length=64, default="esp32_r307")
    device_ip = models.CharField(max_length=64, blank=True, default="")
    sensor_raw_output = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=["slot_id", "is_active"]),
            models.Index(fields=["reg_no", "is_active"]),
            models.Index(fields=["staff_id", "is_active"]),
            models.Index(fields=["template_hash", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"BiometricRecord #{self.id}: {self.reg_no or self.staff_id or self.user_id} (Slot {self.slot_id})"


class GatepassOfflineScan(models.Model):
    class Direction(models.TextChoices):
        OUT = "OUT", "OUT"
        IN = "IN", "IN"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PULLED = "PULLED", "Pulled"
        IGNORED = "IGNORED", "Ignored"

    uid = models.CharField(max_length=64, db_index=True)
    direction = models.CharField(max_length=3, choices=Direction.choices, default=Direction.OUT)
    recorded_at = models.DateTimeField()

    device_label = models.CharField(max_length=120, blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="gatepass_offline_uploads",
    )

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)

    pulled_at = models.DateTimeField(null=True, blank=True)
    pulled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="gatepass_offline_pulls",
    )
    pulled_security_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="gatepass_offline_pulled_as_security",
    )
    pull_error = models.TextField(blank=True, default="")

    ignored_at = models.DateTimeField(null=True, blank=True)
    ignored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="gatepass_offline_ignores",
    )

    class Meta:
        ordering = ("-recorded_at", "-id")
        indexes = [
            models.Index(fields=["status", "-recorded_at"]),
            models.Index(fields=["uid", "-recorded_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.uid} {self.direction} {self.status}"
