from __future__ import annotations

from django.conf import settings
from django.db import models


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
