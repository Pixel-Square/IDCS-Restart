from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class AcademicCalendarEvent(models.Model):
    class Source(models.TextChoices):
        IQAC = 'iqac', 'IQAC'
        HOD = 'hod', 'HOD'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)

    start_date = models.DateField()
    end_date = models.DateField()
    all_day = models.BooleanField(default=True)

    # Comma-separated department names/codes (NULL/blank means global)
    audience_department = models.TextField(null=True, blank=True)

    # Optional targeting for students
    year = models.IntegerField(null=True, blank=True)
    year_label = models.CharField(max_length=64, null=True, blank=True)

    source = models.CharField(max_length=8, choices=Source.choices)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='academic_calendar_events')

    image_url = models.TextField(null=True, blank=True)
    audience_students = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['start_date']),
            models.Index(fields=['end_date']),
            models.Index(fields=['source']),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.start_date} - {self.end_date})"


class HodColor(models.Model):
    hod = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hod_color')
    color = models.CharField(max_length=16)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='updated_hod_colors')
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.hod_id}: {self.color}"
