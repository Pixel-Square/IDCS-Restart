from django.db import models
from django.conf import settings
from django.utils import timezone

# Import related models via app label to avoid circular imports at import time

DAYS_OF_WEEK = (
    (1, 'Monday'),
    (2, 'Tuesday'),
    (3, 'Wednesday'),
    (4, 'Thursday'),
    (5, 'Friday'),
    (6, 'Saturday'),
    (7, 'Sunday'),
)


class TimetableTemplate(models.Model):
    """A saved template that defines the days and periods (slots) for a timetable.

    IQAC users define a template once (days, periods, start/end times, breaks)
    and reuse it for assigning actual subjects for a class/section.
    """
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    is_public = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)
    PARITY_CHOICES = (
        ('BOTH', 'Both'),
        ('ODD', 'Odd'),
        ('EVEN', 'Even'),
    )
    parity = models.CharField(max_length=4, choices=PARITY_CHOICES, default='BOTH')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Timetable Template'
        verbose_name_plural = 'Timetable Templates'

    def __str__(self):
        return self.name


class TimetableSlot(models.Model):
    """A single period definition within a template.

    Period definitions are shared across all days within the same template so
    you only define the set of periods once (index 1..N, start/end times,
    labels, breaks). Assignments reference a period + day.
    """
    template = models.ForeignKey(TimetableTemplate, on_delete=models.CASCADE, related_name='periods')
    index = models.PositiveSmallIntegerField(default=1)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    is_break = models.BooleanField(default=False)
    is_lunch = models.BooleanField(default=False)
    label = models.CharField(max_length=64, blank=True, null=True)

    class Meta:
        verbose_name = 'Period Definition'
        verbose_name_plural = 'Period Definitions'
        ordering = ('template', 'index')
        constraints = [
            models.UniqueConstraint(fields=['template', 'index'], name='unique_period_per_template_index')
        ]

    def __str__(self):
        return f"{self.template.name} — #{self.index} ({self.label or ''})"


class TimetableAssignment(models.Model):
    """An assignment of a subject/staff to a specific day+period for a section.

    Periods are defined per-template (shared across days). Assignments reference
    a `period` (PeriodDefinition) and a `day` (1..7). Academic year is not stored
    on assignments per request; templates can be marked for ODD/EVEN parity.
    """
    period = models.ForeignKey('TimetableSlot', on_delete=models.CASCADE, related_name='assignments')
    day = models.PositiveSmallIntegerField(choices=DAYS_OF_WEEK)
    section = models.ForeignKey('academics.Section', on_delete=models.CASCADE, related_name='timetable_assignments')
    staff = models.ForeignKey('academics.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='timetable_assignments')
    # prefer linking to curriculum row; fallback to free-text subject name
    curriculum_row = models.ForeignKey('curriculum.CurriculumDepartment', on_delete=models.SET_NULL, null=True, blank=True, related_name='timetable_assignments')
    subject_text = models.CharField(max_length=256, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Timetable Assignment'
        verbose_name_plural = 'Timetable Assignments'
        constraints = [
            models.UniqueConstraint(fields=['period', 'day', 'section'], name='unique_period_day_section'),
        ]

    def __str__(self):
        subj = self.curriculum_row.course_code if self.curriculum_row else (self.subject_text or 'Unassigned')
        return f"{self.section} | {self.period} @ {self.get_day_display()} → {subj} ({getattr(self.staff, 'staff_id', 'no-staff')})"
