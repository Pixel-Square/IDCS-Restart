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

    # ── Branding poster (generated via n8n → Canva Autofill) ─────────────────
    class PosterStatus(models.TextChoices):
        PENDING    = 'pending',    'Pending'
        GENERATING = 'generating', 'Generating'
        READY      = 'ready',      'Ready'
        FAILED     = 'failed',     'Failed'

    branding_poster_status    = models.CharField(
        max_length=16,
        choices=PosterStatus.choices,
        default=PosterStatus.PENDING,
    )
    branding_poster_url       = models.TextField(null=True, blank=True)
    branding_poster_design_id = models.CharField(max_length=256, blank=True)
    branding_poster_preview   = models.TextField(null=True, blank=True)
    # Stores the full payload that was last sent to n8n so it can be replayed
    branding_data             = models.JSONField(null=True, blank=True)

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


# ── Event Proposal Approval Workflow ─────────────────────────────────────────

class EventProposal(models.Model):
    """
    Multi-stage event proposal flowing through:
    Staff → Branding → HOD → HAA → Approved (notifications sent).
    """

    class Status(models.TextChoices):
        DRAFT                  = 'draft',                  'Draft'
        FORWARDED_TO_BRANDING  = 'forwarded_to_branding',  'Forwarded to Branding'
        FORWARDED_TO_HOD       = 'forwarded_to_hod',       'Forwarded to HOD'
        HOD_APPROVED           = 'hod_approved',           'HOD Approved'
        FORWARDED_TO_HAA       = 'forwarded_to_haa',       'Forwarded to HAA'
        HAA_APPROVED           = 'haa_approved',           'HAA Approved'
        REJECTED               = 'rejected',               'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Event details ────────────────────────────────────────────────────────
    title = models.CharField(max_length=512)
    department = models.ForeignKey(
        'academics.Department', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='event_proposals',
    )
    department_name = models.CharField(max_length=256, blank=True)
    event_type = models.CharField(max_length=128, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    venue = models.CharField(max_length=512, blank=True)
    mode = models.CharField(max_length=64, blank=True)
    expert_category = models.CharField(max_length=8, blank=True)
    is_repeated = models.BooleanField(default=False)
    participants = models.CharField(max_length=512, blank=True)

    # Coordinators
    coordinator_name = models.CharField(max_length=256, blank=True)
    co_coordinator_name = models.CharField(max_length=256, blank=True)

    # Chief guest
    chief_guest_name = models.CharField(max_length=256, blank=True)
    chief_guest_designation = models.CharField(max_length=256, blank=True)
    chief_guest_affiliation = models.CharField(max_length=256, blank=True)

    # Full form data kept as JSON for DOCX generation
    proposal_data = models.JSONField(default=dict, blank=True)

    # ── Generated assets ─────────────────────────────────────────────────────
    poster_url = models.TextField(blank=True)
    poster_data_url = models.TextField(blank=True)
    proposal_doc_url = models.TextField(blank=True)
    proposal_doc_name = models.CharField(max_length=256, blank=True)
    canva_design_id = models.CharField(max_length=256, blank=True)
    canva_edit_url = models.TextField(blank=True)

    # ── Workflow ─────────────────────────────────────────────────────────────
    status = models.CharField(
        max_length=32, choices=Status.choices, default=Status.DRAFT,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='event_proposals',
    )
    created_by_name = models.CharField(max_length=256, blank=True)

    # Branding review
    branding_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+',
    )
    branding_reviewed_by_name = models.CharField(max_length=256, blank=True)
    branding_reviewed_at = models.DateTimeField(null=True, blank=True)
    branding_note = models.TextField(blank=True)

    # HOD approval
    hod_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+',
    )
    hod_approved_by_name = models.CharField(max_length=256, blank=True)
    hod_approved_at = models.DateTimeField(null=True, blank=True)
    hod_note = models.TextField(blank=True)

    # HAA approval
    haa_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+',
    )
    haa_approved_by_name = models.CharField(max_length=256, blank=True)
    haa_approved_at = models.DateTimeField(null=True, blank=True)
    haa_note = models.TextField(blank=True)

    # Rejection
    rejection_reason = models.TextField(blank=True)
    rejected_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rejected_proposals',
    )
    rejected_at = models.DateTimeField(null=True, blank=True)

    # Path to the final poster file in default storage, set after branding review.
    final_poster_path = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # JSON blob for any extra unstructured data from the form
    extra_data = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['department']),
            models.Index(fields=['created_by']),
        ]

    def __str__(self) -> str:
        return f"{self.title} [{self.get_status_display()}]"


# ── Calendar Event Label + Assignment (IQAC Calendar Admin) ──────────────────

class CalendarEventLabel(models.Model):
    """
    A reusable event definition created by IQAC admin.
    Stores display metadata: title, hex color, which roles can see it,
    and which year-semesters it applies to.
    Semesters stored as JSON list, e.g. ["COMMON"] or ["I", "III"].
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    color = models.CharField(max_length=16)                      # hex, e.g. '#3B82F6'
    visible_roles = models.JSONField(default=list, blank=True)   # e.g. ["STUDENT","STAFF"]
    semesters = models.JSONField(default=list, blank=True)       # e.g. ["COMMON"] or ["I","II"]
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='calendar_event_labels',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']
        indexes = [models.Index(fields=['created_at'])]

    def __str__(self) -> str:
        return f"{self.title} ({self.color})"


class CalendarEventAssignment(models.Model):
    """
    Assigns a CalendarEventLabel to a date range within a specific academic calendar.
    calendar_ref stores the frontend calendar id (UUID/timestamp string).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(
        CalendarEventLabel, on_delete=models.CASCADE,
        related_name='assignments',
    )
    calendar_ref = models.CharField(max_length=64)  # frontend calendar id
    start_date = models.DateField()
    end_date = models.DateField()
    description = models.TextField(blank=True)
    extra_data = models.JSONField(null=True, blank=True)  # any additional structured data
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='calendar_event_assignments',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['start_date']
        indexes = [
            models.Index(fields=['calendar_ref']),
            models.Index(fields=['start_date', 'end_date']),
            models.Index(fields=['event']),
        ]

    def __str__(self) -> str:
        return f"{self.event.title}: {self.start_date} → {self.end_date}"


# ── Academic Calendar (date-wise) ───────────────────────────────────────────

class AcademicCalendar(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    from_date = models.DateField()
    to_date = models.DateField()
    academic_year = models.CharField(max_length=16)  # e.g. "2025-26"
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='academic_calendars',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-from_date', '-created_at']
        indexes = [
            models.Index(fields=['from_date']),
            models.Index(fields=['to_date']),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.academic_year})"


class AcademicCalendarDay(models.Model):
    calendar = models.ForeignKey(
        AcademicCalendar, on_delete=models.CASCADE,
        related_name='days',
    )
    date = models.DateField()
    day_name = models.CharField(max_length=16)
    working_days = models.CharField(max_length=64, blank=True)
    ii_year = models.CharField(max_length=64, blank=True)
    iii_year = models.CharField(max_length=64, blank=True)
    iv_year = models.CharField(max_length=64, blank=True)
    i_year = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ['date']
        unique_together = [['calendar', 'date']]
        indexes = [
            models.Index(fields=['calendar', 'date']),
        ]

    def __str__(self) -> str:
        return f"{self.calendar_id} {self.date}"


class AcademicCalendarHoliday(models.Model):
    calendar = models.ForeignKey(
        AcademicCalendar, on_delete=models.CASCADE,
        related_name='holidays',
    )
    date = models.DateField()
    name = models.CharField(max_length=200)
    source = models.CharField(max_length=32, default='working_days')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date']
        unique_together = [['calendar', 'date', 'name']]
        indexes = [
            models.Index(fields=['calendar', 'date']),
        ]

    def __str__(self) -> str:
        return f"{self.date} - {self.name}"
