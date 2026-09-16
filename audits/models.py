from decimal import Decimal

from django.conf import settings
from django.db import models

from academics.models import Department, StaffProfile


class AuditCycle(models.Model):
    """An academic audit cycle (e.g. Cycle 1 after CIA 1, Cycle 2 after CIA 2).

    Two cycles run per semester, each with a different set of auditors.
    """
    cycle = models.PositiveSmallIntegerField(unique=True)
    name = models.CharField(max_length=64, blank=True)
    label = models.CharField(
        max_length=128,
        blank=True,
        help_text='e.g. After CIA 1',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'audit_cycle'
        verbose_name = 'Audit Cycle'
        verbose_name_plural = 'Audit Cycles'
        ordering = ('cycle',)

    def __str__(self):
        return self.label or self.name or f'Cycle {self.cycle}'


class AuditQuestion(models.Model):
    """A question/parameter in the academic audit checklist."""
    sl_no = models.PositiveSmallIntegerField(unique=True, db_index=True)
    details = models.CharField(max_length=300)
    documents_checklist = models.TextField(blank=True)
    detailed_description = models.TextField(blank=True)
    max_marks = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('10.00'))
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'audit_question'
        verbose_name = 'Audit Question'
        verbose_name_plural = 'Audit Questions'
        ordering = ('sl_no',)

    def __str__(self):
        return f'{self.sl_no}. {self.details[:50]}'

    @property
    def atr_threshold(self):
        """Minimum score to avoid an ATR (60% of max marks)."""
        return round(float(self.max_marks) * 0.6, 2)


class AuditQuestionSet(models.Model):
    """A named set of audit questions that can be assigned to an audit."""
    name = models.CharField(max_length=128, unique=True)
    description = models.TextField(blank=True)
    questions = models.ManyToManyField(
        AuditQuestion,
        blank=True,
        related_name='question_sets',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_question_sets_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'audit_question_set'
        verbose_name = 'Audit Question Set'
        verbose_name_plural = 'Audit Question Sets'
        ordering = ('name',)

    def __str__(self):
        return self.name


class AuditRubric(models.Model):
    """An Audit Rubric PDF uploaded by IQAC for auditors to reference."""
    name = models.CharField(max_length=128)
    file = models.FileField(upload_to='audit_rubrics/')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_rubrics_uploaded',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'audit_rubric'
        verbose_name = 'Audit Rubric'
        verbose_name_plural = 'Audit Rubrics'
        ordering = ('-uploaded_at',)

    def __str__(self):
        return self.name


class AuditDepartmentAssignment(models.Model):
    """Assigns one or more auditors to audit a department for a cycle."""

    STATUS_CHOICES = (
        ('NOT_STARTED', 'Not Started'),
        ('IN_PROGRESS', 'In Progress'),
        ('SUBMITTED', 'Submitted'),
    )

    cycle = models.ForeignKey(AuditCycle, on_delete=models.CASCADE, related_name='assignments')
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='audit_assignments')
    auditors = models.ManyToManyField(StaffProfile, blank=True, related_name='audit_assignments')
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_assignments_created',
    )
    question_set = models.ForeignKey(
        AuditQuestionSet,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignments',
        help_text='Optional question set; if set, only those questions are used for this audit.',
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='NOT_STARTED')
    remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'audit_department_assignment'
        verbose_name = 'Audit Department Assignment'
        verbose_name_plural = 'Audit Department Assignments'
        ordering = ('cycle__cycle', 'department__code')
        unique_together = ('department', 'cycle')

    def __str__(self):
        return f'{self.department.code} - {self.cycle}'


class AuditScore(models.Model):
    """Marks and comments entered by an auditor for a single question."""
    assignment = models.ForeignKey(AuditDepartmentAssignment, on_delete=models.CASCADE, related_name='scores')
    question = models.ForeignKey(AuditQuestion, on_delete=models.CASCADE, related_name='audit_scores')
    marks = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    comments = models.TextField(blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_scores_entered',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'audit_score'
        verbose_name = 'Audit Score'
        verbose_name_plural = 'Audit Scores'
        ordering = ('question__sl_no',)
        unique_together = ('assignment', 'question')

    def __str__(self):
        return f'{self.assignment} - Q{self.question.sl_no} = {self.marks}'


class AuditATR(models.Model):
    """Action Taken Report (ATR) filled by HOD for questions scoring below 60%."""

    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('SUBMITTED', 'Submitted'),
    )

    assignment = models.ForeignKey(AuditDepartmentAssignment, on_delete=models.CASCADE, related_name='atrs')
    question = models.ForeignKey(AuditQuestion, on_delete=models.CASCADE, related_name='audit_atrs')
    action_taken = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='PENDING')
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_atrs_submitted',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'audit_atr'
        verbose_name = 'Audit ATR'
        verbose_name_plural = 'Audit ATRs'
        ordering = ('question__sl_no',)
        unique_together = ('assignment', 'question')

    def __str__(self):
        return f'ATR {self.assignment} - Q{self.question.sl_no}'
