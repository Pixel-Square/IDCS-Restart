import uuid
from django.db import models
from django.db.models import UniqueConstraint

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

