import uuid
from django.db import models
from django.db.models import UniqueConstraint, Q
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


class LcaRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject_id = models.CharField(max_length=64, unique=True)
    status = models.TextField(default='draft')
    data = models.JSONField(default=dict)
    created_by = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lca_revisions'

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


class ObeCqiConfig(models.Model):
    """Global CQI configuration managed by IQAC.

    Stores selected CQI options (list), divider and multiplier used by CQI calculations.
    """

    # Singleton pattern: there should normally be only one row; use get_or_create(id=1)
    options = models.JSONField(default=list)
    divider = models.FloatField(default=2.0)
    multiplier = models.FloatField(default=0.15)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'obe_cqi_config'


class InternalMarkMapping(models.Model):
        """IQAC-managed internal mark mapping per Subject.

        Stores a JSON object like:
            { header: string[], cycles: string[], weights: number[] }
        """

        subject = models.OneToOneField('academics.Subject', on_delete=models.CASCADE, related_name='internal_mark_mapping')
        mapping = models.JSONField(default=dict)
        updated_by = models.IntegerField(null=True, blank=True)
        updated_at = models.DateTimeField(auto_now=True)

        class Meta:
                db_table = 'obe_internal_mark_mapping'


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
        ('review1', 'Review1'),
        ('ssa2', 'SSA2'),
        ('review2', 'Review2'),
        ('cia1', 'CIA1'),
        ('cia2', 'CIA2'),
        ('formative1', 'Formative1'),
        ('formative2', 'Formative2'),
        ('model', 'MODEL'),
        ('cdap', 'CDAP'),
        ('articulation', 'Articulation'),
        ('lca', 'LCA'),
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


class Review1Mark(models.Model):
    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='review1_marks')
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='review1_marks')
    mark = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'student'], name='unique_review1_mark_per_subject_student'),
        ]


class Review2Mark(models.Model):
    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='review2_marks')
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='review2_marks')
    mark = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['subject', 'student'], name='unique_review2_mark_per_subject_student'),
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


class ModelPublishedSheet(models.Model):
    """Published MODEL sheet snapshot (question-wise / full sheet) used for viewing and CO calculations.

    Stored separately from LabPublishedSheet so THEORY MODEL snapshots mirror CIA snapshots.
    """

    subject = models.OneToOneField('academics.Subject', on_delete=models.CASCADE, related_name='model_published_sheet')
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
        ('review1', 'Review 1 (Lab-style)'),
        ('review2', 'Review 2 (Lab-style)'),
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
    """Assessment due schedule per Semester + Subject + Assessment.

    Used to time-gate publishing in faculty mark entry screens.
    """

    ASSESSMENT_CHOICES = AssessmentDraft.ASSESSMENT_CHOICES

    # NOTE: Semester is the canonical grouping (derived from Section.semester).
    semester = models.ForeignKey('academics.Semester', on_delete=models.PROTECT, null=True, blank=True, related_name='obe_due_schedules')

    # Backward compatibility: older rows were stored against AcademicYear.
    academic_year = models.ForeignKey('academics.AcademicYear', on_delete=models.SET_NULL, null=True, blank=True, related_name='obe_due_schedules')
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
            UniqueConstraint(fields=['semester', 'subject_code', 'assessment'], name='unique_obe_due_schedule_semester'),
        ]
        indexes = [
            models.Index(fields=['semester', 'assessment']),
            models.Index(fields=['academic_year', 'assessment']),
            models.Index(fields=['subject_code', 'assessment']),
            models.Index(fields=['due_at']),
        ]

    def __str__(self) -> str:
        return f"{self.academic_year_id}:{self.subject_code}:{self.assessment} due {self.due_at}"  # pragma: no cover


class ObeAssessmentControl(models.Model):
    """Assessment enable + edit control per Semester + Subject + Assessment.

    This is used by IQAC to:
    - Enable/disable an assessment (drives whether faculty can even open the page)
    - Set editable/read-only mode (without relying on global publish overrides)

    Kept separate from ObeDueSchedule so enabling does not require a due_at.
    """

    ASSESSMENT_CHOICES = AssessmentDraft.ASSESSMENT_CHOICES

    semester = models.ForeignKey('academics.Semester', on_delete=models.PROTECT, null=True, blank=True, related_name='obe_assessment_controls')

    # Backward compatibility: optionally scoped to AcademicYear.
    academic_year = models.ForeignKey('academics.AcademicYear', on_delete=models.SET_NULL, null=True, blank=True, related_name='obe_assessment_controls')

    subject_code = models.CharField(max_length=64, db_index=True)
    subject_name = models.CharField(max_length=255, blank=True, default='')
    assessment = models.CharField(max_length=20, choices=ASSESSMENT_CHOICES)

    is_enabled = models.BooleanField(default=True)
    is_open = models.BooleanField(default=True)

    created_by = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['semester', 'subject_code', 'assessment'], name='unique_obe_assessment_control_semester'),
        ]
        indexes = [
            models.Index(fields=['semester', 'assessment']),
            models.Index(fields=['academic_year', 'assessment']),
            models.Index(fields=['subject_code', 'assessment']),
        ]

    def __str__(self) -> str:
        return f"{self.semester_id}:{self.subject_code}:{self.assessment} enabled={self.is_enabled} open={self.is_open}"  # pragma: no cover


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


class ObeEditRequest(models.Model):
    """Faculty request to edit after publishing.

    This is distinct from `ObePublishRequest` (which is only for extending the publish window).
    Edit requests are scoped so IQAC can approve Mark Entry edits separately from Mark Manager edits.
    """

    STATUS_CHOICES = ObePublishRequest.STATUS_CHOICES
    ASSESSMENT_CHOICES = AssessmentDraft.ASSESSMENT_CHOICES

    SCOPE_CHOICES = (
        ('MARK_ENTRY', 'Mark Entry'),
        ('MARK_MANAGER', 'Mark Manager'),
    )

    staff_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='obe_edit_requests')
    academic_year = models.ForeignKey('academics.AcademicYear', on_delete=models.SET_NULL, null=True, blank=True, related_name='obe_edit_requests')
    teaching_assignment = models.ForeignKey('academics.TeachingAssignment', on_delete=models.SET_NULL, null=True, blank=True, related_name='obe_edit_requests')
    subject_code = models.CharField(max_length=64, db_index=True)
    subject_name = models.CharField(max_length=255, blank=True, default='')
    section_name = models.CharField(max_length=64, blank=True, default='')
    assessment = models.CharField(max_length=20, choices=ASSESSMENT_CHOICES)
    scope = models.CharField(max_length=24, choices=SCOPE_CHOICES, db_index=True)
    reason = models.TextField(blank=True, default='')

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    approved_until = models.DateTimeField(null=True, blank=True)

    # HOD pre-approval: if `hod_user` is set and `hod_approved` is False, the request
    # is pending with the department HOD and should not be visible in IQAC pending list.
    # Default hod_approved=True to preserve behavior for existing rows created before
    # introducing HOD routing.
    hod_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='obe_edit_requests_hod_inbox',
    )
    hod_approved = models.BooleanField(default=True, db_index=True)
    hod_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='obe_edit_requests_hod_reviewed',
    )
    hod_reviewed_at = models.DateTimeField(null=True, blank=True)

    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='obe_edit_requests_reviewed')
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['staff_user', 'assessment']),
            models.Index(fields=['academic_year', 'assessment']),
            models.Index(fields=['subject_code', 'assessment', 'scope']),
            models.Index(fields=['teaching_assignment', 'assessment', 'scope']),
            models.Index(fields=['hod_user', 'hod_approved', 'status']),
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


class ObeEditNotificationLog(models.Model):
    CHANNEL_EMAIL = 'EMAIL'
    CHANNEL_WHATSAPP = 'WHATSAPP'
    CHANNEL_CHOICES = (
        (CHANNEL_EMAIL, 'Email'),
        (CHANNEL_WHATSAPP, 'WhatsApp'),
    )

    STATUS_SUCCESS = 'SUCCESS'
    STATUS_FAILED = 'FAILED'
    STATUS_SKIPPED = 'SKIPPED'
    STATUS_CHOICES = (
        (STATUS_SUCCESS, 'Success'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_SKIPPED, 'Skipped'),
    )

    edit_request = models.ForeignKey('ObeEditRequest', on_delete=models.CASCADE, related_name='notification_logs')
    channel = models.CharField(max_length=16, choices=CHANNEL_CHOICES, db_index=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, db_index=True)
    recipient = models.CharField(max_length=255, blank=True, default='')
    message = models.TextField(blank=True, default='')
    response_status_code = models.IntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True, default='')
    error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['edit_request', 'channel', 'created_at'], name='obe_editnotif_req_chan_idx'),
            models.Index(fields=['channel', 'status', 'created_at'], name='obe_editnotif_chan_stat_idx'),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"ObeEditNotificationLog(req={self.edit_request_id}, channel={self.channel}, status={self.status})"


class ObeGlobalPublishControl(models.Model):
    """Optional global override per Semester + Assessment.

    When present, this takes precedence over due schedules and publish requests.
    """

    ASSESSMENT_CHOICES = AssessmentDraft.ASSESSMENT_CHOICES

    semester = models.ForeignKey('academics.Semester', on_delete=models.PROTECT, null=True, blank=True, related_name='obe_global_publish_controls')

    # Backward compatibility
    academic_year = models.ForeignKey('academics.AcademicYear', on_delete=models.SET_NULL, null=True, blank=True, related_name='obe_global_publish_controls')
    assessment = models.CharField(max_length=20, choices=ASSESSMENT_CHOICES)
    is_open = models.BooleanField(default=True)

    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=['semester', 'assessment'], name='unique_obe_global_publish_control_semester'),
        ]
        indexes = [
            models.Index(fields=['semester', 'assessment']),
            models.Index(fields=['academic_year', 'assessment']),
            models.Index(fields=['assessment', 'updated_at']),
        ]

    def __str__(self) -> str:
        return f"global:sem={self.semester_id or '-'} ay={self.academic_year_id or '-'}:{self.assessment} open={self.is_open}"


class ObeMarkTableLock(models.Model):
    """Authoritative lock state for an OBE mark-entry table.

    Why this exists:
    - Frontend currently infers lock state from multiple signals (published snapshot exists,
      local flags like `publishedEditLocked`, and edit-window approvals).
    - A single DB row per (teaching assignment + assessment) makes locking deterministic
      and reusable for SSA1/SSA2/CIA1/CIA2/Formative1/Formative2/MODEL.

    Semantics (aligned to current UX):
    - `mark_entry_blocked=True` means mark-entry cells must be blocked/readonly.
    - `mark_manager_locked=True` means Mark Manager config must be locked.
    - Mark entry is considered OPEN only when BOTH:
        - `mark_entry_blocked` is False
        - `mark_manager_locked` is True (manager confirmed/locked)

    Note on approvals:
    - If you want time-bound IQAC approvals, store the *_unblocked_until fields
      and recompute the booleans at request time.
    """

    ASSESSMENT_CHOICES = AssessmentDraft.ASSESSMENT_CHOICES

    teaching_assignment = models.ForeignKey(
        'academics.TeachingAssignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='obe_mark_table_locks',
    )

    # Who owns this table in the UI (faculty user)
    staff_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='obe_mark_table_locks',
    )

    # Denormalized identifiers (kept for stable lookup even if TA changes)
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='obe_mark_table_locks',
    )
    subject_code = models.CharField(max_length=64, db_index=True)
    subject_name = models.CharField(max_length=255, blank=True, default='')
    section_name = models.CharField(max_length=64, blank=True, default='')

    assessment = models.CharField(max_length=20, choices=ASSESSMENT_CHOICES, db_index=True)

    # Published indicates the faculty has published at least once.
    is_published = models.BooleanField(default=False, db_index=True)

    # Lock flags
    published_blocked = models.BooleanField(default=False)
    mark_entry_blocked = models.BooleanField(default=False)

    # IMPORTANT: locked=True means Mark Manager is NOT editable.
    # (This matches current frontend `markManagerLocked` usage.)
    mark_manager_locked = models.BooleanField(default=False)

    # Optional time-bound override windows (for IQAC approvals)
    mark_entry_unblocked_until = models.DateTimeField(null=True, blank=True)
    mark_manager_unlocked_until = models.DateTimeField(null=True, blank=True)

    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # Preferred key (no collisions): one lock row per TeachingAssignment + assessment.
            UniqueConstraint(
                fields=['teaching_assignment', 'assessment'],
                condition=Q(teaching_assignment__isnull=False),
                name='unique_obe_mark_table_lock_ta',
            ),
            # Fallback key for legacy flows where teaching_assignment is not provided.
            UniqueConstraint(
                fields=['staff_user', 'subject_code', 'assessment', 'section_name', 'academic_year'],
                condition=Q(teaching_assignment__isnull=True),
                name='unique_obe_mark_table_lock_fallback',
            ),
        ]
        indexes = [
            models.Index(fields=['subject_code', 'assessment']),
            models.Index(fields=['staff_user', 'assessment']),
            models.Index(fields=['academic_year', 'assessment']),
            models.Index(fields=['assessment', 'updated_at']),
        ]

    def __str__(self) -> str:  # pragma: no cover
        sec = f"/{self.section_name}" if self.section_name else ''
        return f"lock:{self.subject_code}{sec}:{self.assessment} published={self.is_published} entry_blocked={self.mark_entry_blocked} manager_locked={self.mark_manager_locked}"

    def recompute_blocks(self, now=None):
        """Recompute boolean flags from time-window fields.

        This avoids needing cron jobs to re-lock after an approval window expires.
        """
        now = now or timezone.now()

        # published_blocked is a convenience mirror: a published sheet implies the
        # published-lock overlay should be shown (unless mark-entry is unblocked).
        self.published_blocked = bool(self.is_published)

        if self.mark_entry_unblocked_until and self.mark_entry_unblocked_until > now:
            self.mark_entry_blocked = False
        else:
            # Default: block mark-entry after publish; allow before publish.
            self.mark_entry_blocked = bool(self.is_published)

        if self.mark_manager_unlocked_until and self.mark_manager_unlocked_until > now:
            self.mark_manager_locked = False
        else:
            # If an unlock window is not active, the Mark Manager should be locked.
            # This ensures time-bound approvals automatically re-lock when they expire.
            # Pre-publish flows may keep this False, but after publish we default to locked.
            self.mark_manager_locked = bool(self.is_published) or bool(self.mark_manager_locked)


class ObeQpPatternConfig(models.Model):
    class_type = models.CharField(max_length=50)
    question_paper_type = models.CharField(max_length=50, null=True, blank=True)
    exam = models.CharField(max_length=50)
    pattern = models.JSONField(default=list)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=['class_type', 'question_paper_type', 'exam'],
                name='unique_qp_pattern_per_class_type_qp_exam'
            )
        ]


class ClassTypeWeights(models.Model):
    """IQAC-controlled weights per class type.

    Used in CO attainment and Internal Mark calculations.
    """

    class_type = models.CharField(max_length=50, unique=True)
    ssa1 = models.DecimalField(max_digits=7, decimal_places=2, default=1.5)
    cia1 = models.DecimalField(max_digits=7, decimal_places=2, default=3)
    formative1 = models.DecimalField(max_digits=7, decimal_places=2, default=2.5)
    internal_mark_weights = models.JSONField(default=list, blank=True)

    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'obe_class_type_weights'
        verbose_name = 'Class Type Weights'
        verbose_name_plural = 'Class Type Weights'


class IqacResetNotification(models.Model):
    """Notification created when IQAC resets a course assessment.
    
    Staff sees this notification once when opening the course/exam page.
    After dismissal (is_read=True), won't show again until the next reset.
    """
    teaching_assignment = models.ForeignKey('academics.TeachingAssignment', on_delete=models.CASCADE, related_name='reset_notifications')
    assessment = models.CharField(max_length=50)
    reset_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='iqac_resets')
    reset_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'obe_iqac_reset_notifications'
        ordering = ['-reset_at']
        indexes = [
            models.Index(fields=['teaching_assignment', 'is_read']),
        ]
