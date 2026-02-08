from django.db import models
from django.conf import settings
from academics.models import Department


CLASS_TYPE_CHOICES = (
    ('THEORY', 'Theory'),
    ('LAB', 'Lab'),
    ('TCPL', 'Tcpl'),
    ('TCPR', 'Tcpr'),
    ('PRACTICAL', 'Practical'),
    ('AUDIT', 'Audit'),
)


class Regulation(models.Model):
    """Canonical Regulation model to centralise regulation metadata.

    Existing code previously used free-text `regulation` fields on curriculum
    rows. This model provides a single place to store regulation codes and
    optional descriptive names. Use the `regulation_obj` property on rows to
    access the related `Regulation` instance (created on demand).
    """

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Regulation'
        verbose_name_plural = 'Regulations'

    def __str__(self):
        return self.code



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
    is_elective = models.BooleanField(default=False)

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

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Curriculum Master'
        verbose_name_plural = 'Curriculum Masters'

    def __str__(self):
        return f"{self.regulation} - Sem{self.semester} - {self.course_code or self.course_name or self.pk}"

    @property
    def regulation_obj(self):
        """Return the `Regulation` instance for this row's regulation code.

        This will create the `Regulation` record on demand if it does not
        already exist. Returns `None` when the regulation string is empty.
        """
        code = (self.regulation or '').strip()
        if not code:
            return None
        obj, _ = Regulation.objects.get_or_create(code=code)
        return obj

    def save(self, *args, **kwargs):
        # Auto-calculate total_mark when internal/external provided
        if (self.internal_mark is not None or self.external_mark is not None) and not self.total_mark:
            im = self.internal_mark or 0
            em = self.external_mark or 0
            self.total_mark = im + em
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
    is_elective = models.BooleanField(default=False)

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

    @property
    def regulation_obj(self):
        code = (self.regulation or '').strip()
        if not code:
            return None
        obj, _ = Regulation.objects.get_or_create(code=code)
        return obj

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
                    'is_elective',
                ]
                from django.core.exceptions import ValidationError
                for f in protected_fields:
                    if getattr(old, f) != getattr(self, f):
                        raise ValidationError(f"Field '{f}' cannot be modified for department entry because master is not editable.")
        super().save(*args, **kwargs)


class ElectiveSubject(models.Model):
    """An individual elective option which belongs to a parent department curriculum row.

    The parent is expected to be a `CurriculumDepartment` row that has `is_elective=True`.
    Elective options copy the same fields as department curricula so they can be offered
    and managed independently (e.g. course_code, course_name, marks, hours).
    """

    parent = models.ForeignKey(CurriculumDepartment, on_delete=models.CASCADE, related_name='elective_options')
    # keep a reference to department for quick filtering
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='elective_subjects')
    regulation = models.CharField(max_length=32)
    semester = models.ForeignKey('academics.Semester', on_delete=models.PROTECT, related_name='elective_subjects')

    course_code = models.CharField(max_length=64, blank=True, null=True)
    course_name = models.CharField(max_length=255, blank=True, null=True)
    class_type = models.CharField(max_length=16, choices=CLASS_TYPE_CHOICES, default='THEORY')
    category = models.CharField(max_length=64, blank=True)
    is_elective = models.BooleanField(default=True)

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

    APPROVAL_PENDING = 'PENDING'
    APPROVAL_APPROVED = 'APPROVED'
    APPROVAL_REJECTED = 'REJECTED'
    APPROVAL_STATUS_CHOICES = (
        (APPROVAL_PENDING, 'Pending'),
        (APPROVAL_APPROVED, 'Approved'),
        (APPROVAL_REJECTED, 'Rejected'),
    )

    approval_status = models.CharField(max_length=16, choices=APPROVAL_STATUS_CHOICES, default=APPROVAL_APPROVED)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_elective_subjects')
    approved_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Elective Subject'
        verbose_name_plural = 'Elective Subjects'
        unique_together = ('parent', 'course_code')

    def __str__(self):
        return f"Elective {self.course_code or self.course_name or self.pk} (parent={self.parent_id})"

    @property
    def regulation_obj(self):
        code = (self.regulation or '').strip()
        if not code:
            return None
        obj, _ = Regulation.objects.get_or_create(code=code)
        return obj

    def save(self, *args, **kwargs):
        if (self.internal_mark is not None or self.external_mark is not None) and not self.total_mark:
            im = self.internal_mark or 0
            em = self.external_mark or 0
            self.total_mark = im + em
        super().save(*args, **kwargs)


class ElectiveChoice(models.Model):
    """Mapping of students who have chosen an elective subject for an academic year.

    This model records the student, the chosen `ElectiveSubject` option and the
    `AcademicYear` for which the choice applies. Duplicate choices for the same
    student+elective+year are prevented by a unique constraint.
    """

    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='elective_choices')
    elective_subject = models.ForeignKey(ElectiveSubject, on_delete=models.CASCADE, related_name='choices')
    academic_year = models.ForeignKey('academics.AcademicYear', null=True, blank=True, on_delete=models.PROTECT, related_name='elective_choices')

    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Elective Choice'
        verbose_name_plural = 'Elective Choices'
        unique_together = ('student', 'elective_subject', 'academic_year')

    def __str__(self):
        try:
            return f"{self.student} -> {self.elective_subject.course_code or self.elective_subject.course_name} ({getattr(self.academic_year, 'name', '')})"
        except Exception:
            return f"ElectiveChoice #{self.pk}"
