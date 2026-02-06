import uuid
from django.db import models
from django.db.models import UniqueConstraint
from django.conf import settings
from django.utils import timezone
from datetime import timedelta

class CdapRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject_id = models.CharField(max_length=64, unique=True)
    status = models.TextField(default='draft')
    rows = models.JSONField(default=list)
    books = models.JSONField(default=dict)
    active_learning = models.JSONField(default=dict)
    created_by = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cdap_revisions'

class CdapActiveLearningAnalysisMapping(models.Model):
    id = models.IntegerField(primary_key=True)
    mapping = models.JSONField(default=dict)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cdap_active_learning_analysis_mapping'


class ObeAssessmentMasterConfig(models.Model):
    id = models.IntegerField(primary_key=True)
    config = models.JSONField(default=dict)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'obe_assessment_master_config'


class Cia1Mark(models.Model):
    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='cia1_marks')
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='cia1_marks')
    mark = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'student'], name='unique_cia1_mark_per_subject_student'),
        ]


class AssessmentDraft(models.Model):
    """Draft storage for SSA/CIA/Formative sheets.

    Stores the full sheet JSON exactly as the frontend uses it.
    """

    ASSESSMENT_CHOICES = (
        ('ssa1', 'SSA1'),
        ('ssa2', 'SSA2'),
        ('cia1', 'CIA1'),
        ('cia2', 'CIA2'),
        ('formative1', 'Formative1'),
        ('formative2', 'Formative2'),
        ('model', 'MODEL'),
    )

    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='obe_drafts')
    assessment = models.CharField(max_length=20, choices=ASSESSMENT_CHOICES)
    data = models.JSONField(default=dict)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'assessment'], name='unique_obe_draft_per_subject_assessment'),
        ]


class Ssa1Mark(models.Model):
    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='ssa1_marks')
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='ssa1_marks')
    mark = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'student'], name='unique_ssa1_mark_per_subject_student'),
        ]


class Ssa2Mark(models.Model):
    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='ssa2_marks')
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='ssa2_marks')
    mark = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'student'], name='unique_ssa2_mark_per_subject_student'),
        ]


class Formative1Mark(models.Model):
    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='formative1_marks')
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='formative1_marks')

    skill1 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    skill2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    att1 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    att2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    total = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'student'], name='unique_formative1_mark_per_subject_student'),
        ]


class Formative2Mark(models.Model):
    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='formative2_marks')
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='formative2_marks')

    skill1 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    skill2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    att1 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    att2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    total = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'student'], name='unique_formative2_mark_per_subject_student'),
        ]


class Cia2Mark(models.Model):
    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='cia2_marks')
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='cia2_marks')
    mark = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'student'], name='unique_cia2_mark_per_subject_student'),
        ]


class Cia1PublishedSheet(models.Model):
    """Published CIA1 sheet snapshot (question-wise) used for CO attainment calculations."""

    subject = models.OneToOneField('academics.Subject', on_delete=models.CASCADE, related_name='cia1_published_sheet')
    data = models.JSONField(default=dict)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class Cia2PublishedSheet(models.Model):
    """Published CIA2 sheet snapshot (question-wise) used for CO attainment calculations."""

    subject = models.OneToOneField('academics.Subject', on_delete=models.CASCADE, related_name='cia2_published_sheet')
    data = models.JSONField(default=dict)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class LabPublishedSheet(models.Model):
    """Published Lab sheet snapshot (experiment-wise) used for CO attainment calculations."""

    ASSESSMENT_CHOICES = (
        ('cia1', 'CIA 1 LAB'),
        ('cia2', 'CIA 2 LAB'),
        ('model', 'MODEL LAB'),
        ('formative1', 'Lab 1 (Formative1)'),
        ('formative2', 'Lab 2 (Formative2)'),
    )

    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='lab_published_sheets')
    assessment = models.CharField(max_length=20, choices=ASSESSMENT_CHOICES)
    data = models.JSONField(default=dict)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'assessment'], name='unique_lab_published_sheet_per_subject_assessment'),
        ]


class ObeDueSchedule(models.Model):
    """Assessment due schedule per Academic Year + Subject + Assessment.

    Used to time-gate publishing in faculty mark entry screens.
    """

    ASSESSMENT_CHOICES = AssessmentDraft.ASSESSMENT_CHOICES

    academic_year = models.ForeignKey('academics.AcademicYear', on_delete=models.CASCADE, related_name='obe_due_schedules')
    subject = models.ForeignKey('academics.Subject', on_delete=models.SET_NULL, null=True, blank=True, related_name='obe_due_schedules')
    subject_code = models.CharField(max_length=64, db_index=True)
    subject_name = models.CharField(max_length=255, blank=True, default='')
    assessment = models.CharField(max_length=20, choices=ASSESSMENT_CHOICES)
    due_at = models.DateTimeField()

    is_active = models.BooleanField(default=True)
    created_by = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['academic_year', 'subject_code', 'assessment'], name='unique_obe_due_schedule'),
        ]
        indexes = [
            models.Index(fields=['academic_year', 'assessment']),
            models.Index(fields=['subject_code', 'assessment']),
            models.Index(fields=['due_at']),
        ]

    def __str__(self) -> str:
        return f"{self.academic_year_id}:{self.subject_code}:{self.assessment} due {self.due_at}"  # pragma: no cover


class ObePublishRequest(models.Model):
    """Faculty request to publish after the due time is over."""

    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    )

    ASSESSMENT_CHOICES = AssessmentDraft.ASSESSMENT_CHOICES

    staff_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='obe_publish_requests')
    academic_year = models.ForeignKey('academics.AcademicYear', on_delete=models.SET_NULL, null=True, blank=True, related_name='obe_publish_requests')
    subject_code = models.CharField(max_length=64, db_index=True)
    subject_name = models.CharField(max_length=255, blank=True, default='')
    assessment = models.CharField(max_length=20, choices=ASSESSMENT_CHOICES)
    reason = models.TextField(blank=True, default='')

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    approved_until = models.DateTimeField(null=True, blank=True)

    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='obe_publish_requests_reviewed')
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['staff_user', 'assessment']),
            models.Index(fields=['academic_year', 'assessment']),
        ]

    def mark_approved(self, reviewer, window_minutes: int = 120):
        now = timezone.now()
        self.status = 'APPROVED'
        self.reviewed_by = reviewer
        self.reviewed_at = now
        try:
            mins = int(window_minutes)
        except Exception:
            mins = 120
        mins = max(5, min(24 * 60, mins))
        self.approved_until = now + timedelta(minutes=mins)

    def mark_rejected(self, reviewer):
        now = timezone.now()
        self.status = 'REJECTED'
        self.reviewed_by = reviewer
        self.reviewed_at = now
        self.approved_until = None


class ObeGlobalPublishControl(models.Model):
    """Optional global override per Academic Year + Assessment.

    When present, this takes precedence over due schedules and publish requests.
    """

    ASSESSMENT_CHOICES = AssessmentDraft.ASSESSMENT_CHOICES

    academic_year = models.ForeignKey('academics.AcademicYear', on_delete=models.CASCADE, related_name='obe_global_publish_controls')
    assessment = models.CharField(max_length=20, choices=ASSESSMENT_CHOICES)
    is_open = models.BooleanField(default=True)

    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['academic_year', 'assessment'], name='unique_obe_global_publish_control'),
        ]
        indexes = [
            models.Index(fields=['academic_year', 'assessment']),
            models.Index(fields=['assessment', 'updated_at']),
        ]

    def __str__(self) -> str:
        return f"global:{self.academic_year_id}:{self.assessment} open={self.is_open}"

