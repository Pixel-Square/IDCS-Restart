from __future__ import annotations

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from academics.models import Department as AcademicDepartment
from academics.models import StaffProfile, StudentProfile
from college.models import College

from .utils import upload_to_pbas_submission


class PBASCustomDepartment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    # Optional 1:1 mapping to the Academics Department master table.
    # When present, this PBAS department represents that Department.
    academic_department = models.OneToOneField(
        AcademicDepartment,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='pbas_department',
    )
    # list[str] of staff_id allowed; empty => visible to all (for the viewer type)
    accesses = models.JSONField(default=list, blank=True)
    show_in_submission = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='pbas_custom_departments_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return self.title


class PBASNode(models.Model):
    class Audience(models.TextChoices):
        FACULTY = 'faculty', 'Faculty'
        STUDENT = 'student', 'Student'
        BOTH = 'both', 'Both'

    class InputMode(models.TextChoices):
        UPLOAD = 'upload', 'Upload'
        LINK = 'link', 'Link'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    department = models.ForeignKey(
        PBASCustomDepartment,
        related_name='nodes',
        on_delete=models.CASCADE,
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        related_name='children',
        on_delete=models.CASCADE,
    )

    label = models.CharField(max_length=500, default='', blank=True)
    audience = models.CharField(max_length=16, choices=Audience.choices, default=Audience.BOTH)
    input_mode = models.CharField(max_length=16, choices=InputMode.choices, default=InputMode.UPLOAD)

    # optional informational fields for the node definition
    link = models.URLField(null=True, blank=True)
    uploaded_name = models.CharField(max_length=255, null=True, blank=True)

    limit = models.IntegerField(null=True, blank=True)
    college_required = models.BooleanField(default=False)
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['department', 'parent']),
            models.Index(fields=['parent']),
        ]
        ordering = ('position', 'created_at')

    def __str__(self) -> str:
        return self.label or str(self.id)

    @property
    def is_leaf(self) -> bool:
        # Uses reverse relation; may hit DB
        try:
            return not self.children.exists()
        except Exception:
            return False


class PBASSubmission(models.Model):
    class SubmissionType(models.TextChoices):
        UPLOAD = 'upload', 'Upload'
        LINK = 'link', 'Link'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    node = models.ForeignKey(PBASNode, on_delete=models.CASCADE, related_name='submissions')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='pbas_submissions')

    submission_type = models.CharField(max_length=16, choices=SubmissionType.choices)
    link = models.URLField(null=True, blank=True)
    file = models.FileField(null=True, blank=True, upload_to=upload_to_pbas_submission)
    file_name = models.CharField(max_length=255, null=True, blank=True)
    college = models.ForeignKey(College, null=True, blank=True, on_delete=models.SET_NULL, related_name='pbas_submissions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['node', '-created_at']),
        ]

    def clean(self):
        # Model-level safety; main enforcement happens in serializer.
        if self.submission_type == self.SubmissionType.LINK:
            if not self.link:
                raise ValidationError({'link': 'Link is required for link submissions.'})
            if self.file:
                raise ValidationError({'file': 'File must be empty for link submissions.'})
        elif self.submission_type == self.SubmissionType.UPLOAD:
            if not self.file:
                raise ValidationError({'file': 'File is required for upload submissions.'})
            if self.link:
                raise ValidationError({'link': 'Link must be empty for upload submissions.'})

        if getattr(self, 'node', None) and getattr(self.node, 'college_required', False):
            if not self.college:
                raise ValidationError({'college': 'College is required for this PBAS node.'})

    def save(self, *args, **kwargs):
        if self.file and not self.file_name:
            try:
                self.file_name = getattr(self.file, 'name', None)
            except Exception:
                pass
        self.full_clean()
        return super().save(*args, **kwargs)


class PBASVerificationTicket(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        MENTOR_PENDING = 'mentor_pending', 'Mentor Pending'
        DEPT_PENDING = 'dept_pending', 'Department Pending'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    submission = models.OneToOneField(PBASSubmission, on_delete=models.CASCADE, related_name='verification_ticket')
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='pbas_verification_tickets')
    mentor = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='pbas_verification_tickets')
    department = models.ForeignKey(PBASCustomDepartment, on_delete=models.CASCADE, related_name='verification_tickets')

    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    forwarded_to_mentor_at = models.DateTimeField(null=True, blank=True)
    forwarded_to_department_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return f"PBASVerificationTicket({self.id})"

