from django.db import models
from django.conf import settings
from academics.models import Department
from django.core.exceptions import ValidationError


CLASS_TYPE_CHOICES = (
    ('THEORY', 'Theory'),
    ('LAB', 'Lab'),
    ('TCPL', 'Tcpl'),
    ('TCPR', 'Tcpr'),
    ('PRACTICAL', 'Practical'),
    ('AUDIT', 'Audit'),
    ('SPECIAL', 'Special'),
)


SPECIAL_ASSESSMENT_CHOICES = (
    ('ssa1', 'SSA1'),
    ('formative1', 'Formative1'),
    ('ssa2', 'SSA2'),
    ('formative2', 'Formative2'),
    ('cia1', 'CIA1'),
    ('cia2', 'CIA2'),
)


def _normalize_assessment_keys(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        # tolerate comma-separated strings
        parts = [p.strip() for p in value.split(',') if p.strip()]
        value = parts
    if not isinstance(value, (list, tuple)):
        return []
    out: list[str] = []
    for v in value:
        k = str(v or '').strip().lower()
        if k:
            out.append(k)
    # stable unique order
    seen = set()
    deduped: list[str] = []
    for k in out:
        if k in seen:
            continue
        seen.add(k)
        deduped.append(k)
    return deduped


class CurriculumMaster(models.Model):
    regulation = models.CharField(max_length=32)
    # Use Semester FK so curriculum entries relate to the canonical Semester model
    semester = models.ForeignKey('academics.Semester', on_delete=models.PROTECT, related_name='master_curricula')
    # For master entries targeted to specific departments only, these fields
    # are optional — departments may provide their own details.
    course_code = models.CharField(max_length=64, blank=True, null=True)
    course_name = models.CharField(max_length=255, blank=True, null=True)
    class_type = models.CharField(max_length=16, choices=CLASS_TYPE_CHOICES, default='THEORY')
    category = models.CharField(max_length=64, blank=True)

    l = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    t = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    p = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    s = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    c = models.PositiveSmallIntegerField(default=0, null=True, blank=True)

    internal_mark = models.PositiveSmallIntegerField(null=True, blank=True)
    external_mark = models.PositiveSmallIntegerField(null=True, blank=True)
    total_mark = models.PositiveSmallIntegerField(null=True, blank=True)

    # departments: if empty and for_all_departments is True -> applies to all departments
    departments = models.ManyToManyField(Department, blank=True, related_name='master_curricula')
    for_all_departments = models.BooleanField(default=True)

    # if editable, departments may edit their copies
    editable = models.BooleanField(default=False)

    # For class_type=SPECIAL: which assessment tables apply to this course.
    # Stored as list of assessment keys: ['ssa1','formative1','ssa2','formative2','cia1','cia2']
    enabled_assessments = models.JSONField(default=list, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Curriculum Master'
        verbose_name_plural = 'Curriculum Masters'

    def __str__(self):
        return f"{self.regulation} - Sem{self.semester} - {self.course_code or self.course_name or self.pk}"

    def clean(self):
        super().clean()
        self.enabled_assessments = _normalize_assessment_keys(self.enabled_assessments)
        allowed = {k for k, _ in SPECIAL_ASSESSMENT_CHOICES}
        invalid = [k for k in (self.enabled_assessments or []) if k not in allowed]
        if invalid:
            raise ValidationError({'enabled_assessments': f"Invalid assessment key(s): {', '.join(invalid)}"})
        if str(self.class_type or '').upper() == 'SPECIAL':
            if not self.enabled_assessments:
                raise ValidationError({'enabled_assessments': 'Select at least one assessment for Special courses.'})

    def save(self, *args, **kwargs):
        # Auto-calculate total_mark when internal/external provided
        if (self.internal_mark is not None or self.external_mark is not None) and not self.total_mark:
            im = self.internal_mark or 0
            em = self.external_mark or 0
            self.total_mark = im + em
        # Normalize + validate Special config
        self.full_clean()
        super().save(*args, **kwargs)


class CurriculumDepartment(models.Model):
    master = models.ForeignKey(CurriculumMaster, null=True, blank=True, on_delete=models.CASCADE, related_name='department_rows')
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='curriculum_rows')
    regulation = models.CharField(max_length=32)
    # link to Semester for consistent filtering with Section.semester
    semester = models.ForeignKey('academics.Semester', on_delete=models.PROTECT, related_name='department_curricula')
    course_code = models.CharField(max_length=64, blank=True, null=True)
    course_name = models.CharField(max_length=255, blank=True, null=True)
    class_type = models.CharField(max_length=16, choices=CLASS_TYPE_CHOICES, default='THEORY')
    category = models.CharField(max_length=64, blank=True)

    l = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    t = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    p = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    s = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    c = models.PositiveSmallIntegerField(default=0, null=True, blank=True)

    internal_mark = models.PositiveSmallIntegerField(null=True, blank=True)
    external_mark = models.PositiveSmallIntegerField(null=True, blank=True)
    total_mark = models.PositiveSmallIntegerField(null=True, blank=True)

    total_hours = models.PositiveIntegerField(null=True, blank=True)
    question_paper_type = models.CharField(max_length=64, default='QP1')
    editable = models.BooleanField(default=False)
    overridden = models.BooleanField(default=False)

    # Copied from master when present; for SPECIAL courses controls visible assessments.
    enabled_assessments = models.JSONField(default=list, blank=True)

    APPROVAL_PENDING = 'PENDING'
    APPROVAL_APPROVED = 'APPROVED'
    APPROVAL_REJECTED = 'REJECTED'
    APPROVAL_STATUS_CHOICES = (
        (APPROVAL_PENDING, 'Pending'),
        (APPROVAL_APPROVED, 'Approved'),
        (APPROVAL_REJECTED, 'Rejected'),
    )

    editable = models.BooleanField(default=False)
    overridden = models.BooleanField(default=False)
    approval_status = models.CharField(max_length=16, choices=APPROVAL_STATUS_CHOICES, default=APPROVAL_APPROVED)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_curriculum_rows')
    approved_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Department Curriculum'
        verbose_name_plural = 'Department Curricula'
        unique_together = ('department', 'regulation', 'semester', 'course_code')

    def __str__(self):
        return f"{self.department.code} - {self.regulation} - Sem{self.semester} - {self.course_code or self.course_name or self.pk}"

    def clean(self):
        super().clean()
        self.enabled_assessments = _normalize_assessment_keys(self.enabled_assessments)
        allowed = {k for k, _ in SPECIAL_ASSESSMENT_CHOICES}
        invalid = [k for k in (self.enabled_assessments or []) if k not in allowed]
        if invalid:
            raise ValidationError({'enabled_assessments': f"Invalid assessment key(s): {', '.join(invalid)}"})
        if str(self.class_type or '').upper() == 'SPECIAL':
            if not self.enabled_assessments:
                raise ValidationError({'enabled_assessments': 'Select at least one assessment for Special courses.'})

    def save(self, *args, **kwargs):
        # Auto-calculate total_mark when internal/external provided
        if (self.internal_mark is not None or self.external_mark is not None) and not self.total_mark:
            im = self.internal_mark or 0
            em = self.external_mark or 0
            self.total_mark = im + em
        # Prevent department-side edits when the linked master is not editable.
        if self.master and not getattr(self.master, 'editable', False) and self.pk:
            try:
                old = CurriculumDepartment.objects.get(pk=self.pk)
            except CurriculumDepartment.DoesNotExist:
                old = None
            if old is not None:
                protected_fields = [
                    'regulation', 'semester', 'course_code', 'course_name', 'class_type', 'category',
                    'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
                    'total_hours', 'question_paper_type',
                ]
                from django.core.exceptions import ValidationError
                for f in protected_fields:
                    if getattr(old, f) != getattr(self, f):
                        raise ValidationError(f"Field '{f}' cannot be modified for department entry because master is not editable.")
        self.full_clean()
        super().save(*args, **kwargs)
