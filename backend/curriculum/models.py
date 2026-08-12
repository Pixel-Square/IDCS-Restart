from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError


CLASS_TYPE_CHOICES = (
    ('THEORY', 'Theory'),
    ('THEORY_PMBL', 'Theory (PMBL)'),
    ('LAB', 'Lab'),
    ('PURE_LAB', 'Pure Lab'),
    ('LAB_2', 'Lab 2'),
    ('TCPL', 'Tcpl'),
    ('TCPR', 'Tcpr'),
    ('PRACTICAL', 'Practical'),
    ('PRBL', 'PRBL'),
    ('PROJECT', 'Project'),
    ('AUDIT', 'Audit'),
    ('SPECIAL', 'Special'),
    ('ENGLISH', 'English'),
)

def validate_question_paper_type_code(value: str):
    """Validate the QP type code against the DB-managed QuestionPaperType table.

    We intentionally avoid Django model field `choices` here so new QP types
    added in admin immediately work across the system.
    """
    code = (value or '').strip()
    if not code:
        return
    try:
        from django.db import connection
        if 'curriculum_questionpapertype' not in connection.introspection.table_names():
            return
    except Exception:
        # Be defensive during early migrations / introspection failures
        return
    if not QuestionPaperType.objects.filter(code=code).exists():
        raise ValidationError(f"Invalid Question Paper Type: {code}")


class QuestionPaperType(models.Model):
    """DB-managed list of valid Question Paper Types (e.g. QP1, QP2, ASPR).

    Seeded via migration 0023. Can be extended through the admin.
    """
    code = models.CharField(max_length=32, unique=True)
    label = models.CharField(max_length=64)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Question Paper Type'
        verbose_name_plural = 'Question Paper Types'
        ordering = ('sort_order', 'code')

    def __str__(self):
        return self.label or self.code



class Regulation(models.Model):
    """Canonical Regulation model to centralise regulation metadata.

    Existing code previously used free-text `regulation` fields on curriculum
    rows. This model provides a single place to store regulation codes and
    optional descriptive names. Use the `regulation_obj` property on rows to
    access the related `Regulation` instance (created on demand).
    """

    code = models.CharField(max_length=32)
    name = models.CharField(max_length=255, blank=True)
    college = models.ForeignKey(
        'college.College',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='regulations',
        help_text='College associated with this regulation for college-scoped management.',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Regulation'
        verbose_name_plural = 'Regulations'
        unique_together = (('college', 'code'),)

    def __str__(self):
        return self.code


class DepartmentGroup(models.Model):
    """Group model to organize departments into logical groups.

    This model allows departments to be grouped together for curriculum
    management purposes. For example, grouping all engineering departments
    or all science departments together.
    """

    code = models.CharField(max_length=32)
    name = models.CharField(max_length=255)
    college = models.ForeignKey('college.College', on_delete=models.CASCADE, null=True, blank=True, related_name='department_groups')
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Department Group'
        verbose_name_plural = 'Department Groups'
        unique_together = (('college', 'code'),)
        ordering = ('code',)
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class DepartmentGroupMapping(models.Model):
    """Mapping between department groups and individual departments.

    This model creates a many-to-many relationship between DepartmentGroup
    and Department from the academics app. A department can belong to multiple
    groups, and a group can contain multiple departments.
    """
    college = models.ForeignKey('college.College', on_delete=models.CASCADE, null=True, blank=True, related_name='departmentgroupmappings')

    group = models.ForeignKey(DepartmentGroup, on_delete=models.CASCADE, related_name='department_mappings')
    department = models.ForeignKey('academics.Department', on_delete=models.CASCADE, related_name='group_mappings')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Department Group Mapping'
        verbose_name_plural = 'Department Group Mappings'
        unique_together = ('group', 'department')
        ordering = ('group', 'department')
    
    def __str__(self):
        return f"{self.group.code} -> {self.department.code}"



SPECIAL_ASSESSMENT_CHOICES = (
    ('ssa1', 'SSA1'),
    ('formative1', 'Formative1'),
    ('ssa2', 'SSA2'),
    ('formative2', 'Formative2'),
    ('cia1', 'CIA1'),
    ('cia2', 'CIA2'),
    ('model', 'Model'),
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


class CurriculumColumnConfig(models.Model):
    college = models.ForeignKey('college.College', on_delete=models.CASCADE, related_name='curriculum_columns')
    key = models.CharField(max_length=64, help_text="JSON key, e.g. 'credits'")
    label = models.CharField(max_length=64, help_text="Display label, e.g. 'Credits (C)'")
    data_type = models.CharField(max_length=16, choices=[('int', 'Integer'), ('str', 'Text'), ('float', 'Float')], default='str')
    is_active = models.BooleanField(default=True)
    is_core = models.BooleanField(default=False, help_text="Core columns cannot be deleted, only hidden")
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Curriculum Column Config'
        verbose_name_plural = 'Curriculum Column Configs'
        unique_together = ('college', 'key')
        ordering = ('sort_order', 'key')

    def __str__(self):
        return f"{self.college} - {self.label} ({self.key})"


FIELD_DATA_TYPE_CHOICES = [
    ('int', 'Integer'),
    ('float', 'Float'),
    ('text', 'Text'),
    ('bool', 'Boolean'),
    ('select', 'Select'),
]

FIELD_SCOPE_CHOICES = [
    ('master', 'Master Only'),
    ('department', 'Department Only'),
    ('both', 'Both'),
]

# Core field keys that are always kept (migrated from explicit DB columns)
CORE_FIELD_KEYS = {
    'course_name', 'class_type', 'category', 'is_elective', 'is_dept_core',
    'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
    'qp_type', 'mnemonic', 'question_paper_type', 'total_hours',
}


class CurriculumFieldSchema(models.Model):
    """Defines which fields exist in curriculum data JSON per college.

    Core fields (is_core=True) are seeded from existing DB columns and cannot
    be permanently deleted — only hidden. Custom fields (is_core=False) can be
    added by college admins and removed with double-password confirmation.

    Fields created at Master scope replicate automatically to all Department
    curriculum rows for that college when the field is added.
    """
    college = models.ForeignKey(
        'college.College',
        on_delete=models.CASCADE,
        related_name='curriculum_field_schemas',
    )
    key = models.CharField(
        max_length=64,
        help_text="Unique field key used as JSON key, e.g. 'co_attainment'",
    )
    label = models.CharField(max_length=128, help_text="Display label shown in column header")
    data_type = models.CharField(
        max_length=16,
        choices=FIELD_DATA_TYPE_CHOICES,
        default='text',
    )
    options = models.JSONField(
        default=list,
        blank=True,
        help_text='For select type: list of option values, e.g. ["A","B","C"]',
    )
    default_value = models.CharField(max_length=255, blank=True, default='')
    is_core = models.BooleanField(
        default=False,
        help_text='Core fields are seeded from original DB columns. They can be hidden but not deleted.',
    )
    scope = models.CharField(
        max_length=16,
        choices=FIELD_SCOPE_CHOICES,
        default='both',
        help_text='Which curriculum type this field applies to.',
    )
    is_active = models.BooleanField(default=True)
    # For department-level overrides: departments may hide master-inherited fields
    hidden_for_departments = models.ManyToManyField(
        'academics.Department',
        blank=True,
        related_name='hidden_curriculum_fields',
        help_text='Departments that have removed this master field from their view.',
    )
    sort_order = models.PositiveSmallIntegerField(default=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Curriculum Field Schema'
        verbose_name_plural = 'Curriculum Field Schemas'
        unique_together = (('college', 'key'),)
        ordering = ('sort_order', 'key')

    def __str__(self):
        return f"{self.college_id} - {self.label} ({self.key})"

    def can_delete(self):
        """Core fields cannot be deleted, only hidden."""
        return not self.is_core

    def replicate_to_department_rows(self):
        """Add this field (with default value) to all existing department rows for this college."""
        from django.db import transaction
        key = self.key
        default = self._typed_default()
        with transaction.atomic():
            rows = CurriculumDepartment.objects.filter(college=self.college)
            update_list = []
            for row in rows.iterator():
                data = row.dynamic_data or {}
                if key not in data:
                    data[key] = default
                    row.dynamic_data = data
                    update_list.append(row)
            if update_list:
                CurriculumDepartment.objects.bulk_update(update_list, ['dynamic_data'], batch_size=500)

    def replicate_to_master_rows(self):
        """Add this field (with default value) to all existing master rows for this college."""
        from django.db import transaction
        key = self.key
        default = self._typed_default()
        with transaction.atomic():
            rows = CurriculumMaster.objects.filter(college=self.college)
            update_list = []
            for row in rows.iterator():
                data = row.dynamic_data or {}
                if key not in data:
                    data[key] = default
                    row.dynamic_data = data
                    update_list.append(row)
            if update_list:
                CurriculumMaster.objects.bulk_update(update_list, ['dynamic_data'], batch_size=500)

    def _typed_default(self):
        """Return the default value coerced to the correct Python type based on data_type."""
        raw = self.default_value or ''
        try:
            if self.data_type == 'int':
                return int(raw) if raw.strip() else None
            elif self.data_type == 'float':
                return float(raw) if raw.strip() else None
            elif self.data_type == 'bool':
                return raw.lower() in ('true', '1', 'yes') if raw.strip() else False
        except (ValueError, TypeError):
            pass
        return raw  # 'text', 'select', or fallback



class CurriculumMaster(models.Model):
    regulation = models.CharField(max_length=32)
    college = models.ForeignKey('college.College', on_delete=models.CASCADE, null=True, blank=True, related_name='master_curricula')
    # Use Semester FK so curriculum entries relate to the canonical Semester model
    semester = models.ForeignKey('academics.Semester', on_delete=models.PROTECT, related_name='master_curricula')
    batch = models.ForeignKey('academics.BatchYear', on_delete=models.SET_NULL, null=True, blank=True, related_name='master_curricula', help_text='Optional batch year this curriculum applies to')
    # For master entries targeted to specific departments only, these fields
    # are optional — departments may provide their own details.
    course_code = models.CharField(max_length=64, blank=True, null=True)
    course_name = models.CharField(max_length=255, blank=True, null=True)
    class_type = models.CharField(max_length=16, choices=CLASS_TYPE_CHOICES, default='THEORY')
    qp_type = models.CharField(max_length=16, default='QP1', blank=True, null=True, validators=[validate_question_paper_type_code])
    category = models.CharField(max_length=64, blank=True)
    is_elective = models.BooleanField(default=False)
    # Dept-Core flag: subjects like Program Core / Engineering Science that are taught
    # department-wise inside a shared S&H Year-1 section.  During these periods students
    # regroup by home_department; the timetable auto-resolves the subject variant per
    # student via ElectiveSubject.department == student.home_department (no ElectiveChoice
    # needed — the mapping is automatic).
    is_dept_core = models.BooleanField(
        default=False,
        help_text='True for department-specific core subjects taught inside shared (S&H) Year-1 sections. '
                  'Each department owns an ElectiveSubject child; timetable auto-resolves by home_department.'
    )

    l = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    t = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    p = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    s = models.PositiveSmallIntegerField(default=0, null=True, blank=True)
    c = models.PositiveSmallIntegerField(default=0, null=True, blank=True)

    internal_mark = models.PositiveSmallIntegerField(null=True, blank=True)
    external_mark = models.PositiveSmallIntegerField(null=True, blank=True)
    total_mark = models.PositiveSmallIntegerField(null=True, blank=True)

    # departments: if empty and for_all_departments is True -> applies to all departments
    departments = models.ManyToManyField('academics.Department', blank=True, related_name='master_curricula')
    for_all_departments = models.BooleanField(default=True)

    # if editable, departments may edit their copies
    editable = models.BooleanField(default=False)

    # For class_type=SPECIAL: which assessment tables apply to this course.
    # Stored as list of assessment keys: ['ssa1','formative1','ssa2','formative2','cia1','cia2']
    enabled_assessments = models.JSONField(default=list, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    dynamic_data = models.JSONField(default=dict, blank=True, help_text="Dynamic schema per-college configuration")

    class Meta:
        verbose_name = 'Curriculum Master'
        verbose_name_plural = 'Curriculum Masters'

    def __str__(self):
        return f"{self.regulation} - Sem{self.semester} - {self.course_code or self.course_name or self.pk}"


    @property
    def regulation_obj(self):
        """Return the `Regulation` instance for this row's regulation code.

        This will create the `Regulation` record on demand if it does not
        already exist, scoped to the row's college.
        Returns `None` when the regulation string is empty.
        """
        code = (self.regulation or '').strip()
        if not code:
            return None
        college_id = self.college_id
        if college_id:
            obj, _ = Regulation.objects.get_or_create(code=code, college_id=college_id)
        else:
            obj, _ = Regulation.objects.get_or_create(code=code, college__isnull=True)
        return obj

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
        # Auto-assign college from request context if not explicitly set
        try:
            from college.tenant import auto_assign_college
            auto_assign_college(self)
        except Exception:
            pass
        # Ensure a Regulation record exists for this regulation string (college-scoped)
        try:
            code = (self.regulation or '').strip()
            if code:
                if self.college_id:
                    Regulation.objects.get_or_create(code=code, college_id=self.college_id)
                else:
                    Regulation.objects.get_or_create(code=code, college__isnull=True)
        except Exception:
            # defensive: don't fail saving the curriculum row if regulation creation fails
            pass
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
    department = models.ForeignKey('academics.Department', on_delete=models.CASCADE, related_name='curriculum_rows')
    regulation = models.CharField(max_length=32)
    college = models.ForeignKey('college.College', on_delete=models.CASCADE, null=True, blank=True, related_name='department_curricula')
    # link to Semester for consistent filtering with Section.semester
    semester = models.ForeignKey('academics.Semester', on_delete=models.PROTECT, related_name='department_curricula')
    batch = models.ForeignKey('academics.BatchYear', on_delete=models.SET_NULL, null=True, blank=True, related_name='department_curricula', help_text='Optional batch year this curriculum applies to')
    course_code = models.CharField(max_length=64, blank=True, null=True)
    mnemonic = models.CharField(max_length=16, blank=True, null=True)
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
    question_paper_type = models.CharField(max_length=64, default='QP1', blank=True, validators=[validate_question_paper_type_code])
    editable = models.BooleanField(default=False)
    overridden = models.BooleanField(default=False)
    # Dept-Core flag: see CurriculumMaster.is_dept_core for full explanation.
    is_dept_core = models.BooleanField(
        default=False,
        help_text='Mark this subject as a department-core variant for shared Year-1 S&H sections.'
    )

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
    dynamic_data = models.JSONField(default=dict, blank=True, help_text="Dynamic schema per-college configuration")
    approved_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Department Curriculum'
        verbose_name_plural = 'Department Curricula'
        unique_together = ('department', 'regulation', 'semester', 'course_code', 'batch')

    def __str__(self):
        return f"{self.department.code} - {self.regulation} - Sem{self.semester} - {self.course_code or self.course_name or self.pk}"


    @property
    def regulation_obj(self):
        code = (self.regulation or '').strip()
        if not code:
            return None
        college_id = self.college_id or (self.department.college_id if self.department_id else None)
        if college_id:
            obj, _ = Regulation.objects.get_or_create(code=code, college_id=college_id)
        else:
            obj, _ = Regulation.objects.get_or_create(code=code, college__isnull=True)
        return obj

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
        # Auto-assign college from department or request context if not explicitly set
        try:
            from college.tenant import auto_assign_college
            auto_assign_college(self)
        except Exception:
            pass
        # Fallback: derive college from department if still unset
        if not self.college_id and self.department_id:
            self.college_id = self.department.college_id
        # Ensure a Regulation record exists for this regulation string (college-scoped)
        try:
            code = (self.regulation or '').strip()
            if code:
                if self.college_id:
                    Regulation.objects.get_or_create(code=code, college_id=self.college_id)
                else:
                    Regulation.objects.get_or_create(code=code, college__isnull=True)
        except Exception:
            pass
        # Auto-calculate total_mark when internal/external provided
        if (self.internal_mark is not None or self.external_mark is not None) and not self.total_mark:
            im = self.internal_mark or 0
            em = self.external_mark or 0
            self.total_mark = im + em

        # Track manual overrides: if any content fields change and it's NOT a system sync, set overridden=True
        if self.pk and self.master and not getattr(self, '_syncing', False):
            try:
                old = CurriculumDepartment.objects.get(pk=self.pk)
                content_fields = [
                    'regulation', 'semester', 'course_code', 'course_name', 'class_type', 'category',
                    'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark',
                    'is_elective', 'is_dept_core', 'enabled_assessments'
                ]
                for f in content_fields:
                    if getattr(old, f) != getattr(self, f):
                        self.overridden = True
                        break
            except Exception:
                pass

        # Prevent department-side edits when the linked master is not editable.
        if self.master and not getattr(self.master, 'editable', False) and self.pk and not getattr(self, '_syncing', False):
            try:
                old = CurriculumDepartment.objects.get(pk=self.pk)
            except CurriculumDepartment.DoesNotExist:
                old = None
            if old is not None:
                protected_fields = [
                    'regulation', 'semester', 'course_code', 'course_name', 'class_type', 'category',
                    'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
                    'total_hours',
                    'is_elective',
                ]
                from django.core.exceptions import ValidationError
                for f in protected_fields:
                    if getattr(old, f) != getattr(self, f):
                        raise ValidationError(f"Field '{f}' cannot be modified for department entry because master is not editable.")
        self.full_clean()
        super().save(*args, **kwargs)


class ElectiveSubject(models.Model):
    """An individual elective option which belongs to a parent department curriculum row.

    The parent is expected to be a `CurriculumDepartment` row that has `is_elective=True`.
    Elective options copy the same fields as department curricula so they can be offered
    and managed independently (e.g. course_code, course_name, marks, hours).
    """

    parent = models.ForeignKey(CurriculumDepartment, on_delete=models.CASCADE, related_name='elective_options')
    # keep a reference to department for quick filtering
    department = models.ForeignKey('academics.Department', on_delete=models.CASCADE, related_name='elective_subjects')
    # optional department group mapping to organize electives by group
    department_group = models.ForeignKey(DepartmentGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='elective_subjects')
    batch = models.ForeignKey('academics.BatchYear', on_delete=models.SET_NULL, null=True, blank=True, related_name='elective_subjects', help_text='Optional batch year this elective applies to')
    regulation = models.CharField(max_length=32)
    college = models.ForeignKey('college.College', on_delete=models.CASCADE, null=True, blank=True, related_name='elective_subjects')
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
    question_paper_type = models.CharField(max_length=64, default='QP1', blank=True, validators=[validate_question_paper_type_code])

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

    # Allow blocking specific departments from choosing this elective
    blocked_departments = models.ManyToManyField('academics.Department', blank=True, related_name='blocked_elective_subjects')

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
        college_id = self.college_id or (self.department.college_id if self.department_id else None)
        if college_id:
            obj, _ = Regulation.objects.get_or_create(code=code, college_id=college_id)
        else:
            obj, _ = Regulation.objects.get_or_create(code=code, college__isnull=True)
        return obj

    def save(self, *args, **kwargs):
        # Auto-assign college from department or request context if not explicitly set
        try:
            from college.tenant import auto_assign_college
            auto_assign_college(self)
        except Exception:
            pass
        if not self.college_id and self.department_id:
            self.college_id = self.department.college_id
        # Ensure a Regulation record exists for this regulation string (college-scoped)
        try:
            code = (self.regulation or '').strip()
            if code:
                if self.college_id:
                    Regulation.objects.get_or_create(code=code, college_id=self.college_id)
                else:
                    Regulation.objects.get_or_create(code=code, college__isnull=True)
        except Exception:
            pass
        if (self.internal_mark is not None or self.external_mark is not None) and not self.total_mark:
            im = self.internal_mark or 0
            em = self.external_mark or 0
            self.total_mark = im + em
        super().save(*args, **kwargs)


class ElectiveChoice(models.Model):
    college = models.ForeignKey('college.College', on_delete=models.CASCADE, null=True, blank=True, related_name='electivechoices')
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
        permissions = [
            ('import_elective_choices', 'Can import elective student mappings'),
        ]

    def __str__(self):
        try:
            return f"{self.student} -> {self.elective_subject.course_code or self.elective_subject.course_name} ({getattr(self.academic_year, 'name', '')})"
        except Exception:
            return f"ElectiveChoice #{self.pk}"

class ElectivePoll(models.Model):
    """A polling session for an elective."""
    parent_elective_name = models.CharField(max_length=255)
    batch_year = models.ForeignKey('academics.BatchYear', on_delete=models.SET_NULL, null=True, blank=True, related_name='elective_polls')
    department_group = models.ForeignKey(DepartmentGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='elective_polls')
    college = models.ForeignKey('college.College', on_delete=models.CASCADE, null=True, blank=True, related_name='elective_polls')

    is_active = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Elective Poll'
        verbose_name_plural = 'Elective Polls'
        permissions = [
            ('choose_elective', 'Can choose elective subjects'),
            ('hod_elective_manage', 'Can view elective poll status for department students'),
        ]

    def __str__(self):
        return f"Poll for {self.parent_elective_name}"


class ElectivePollSubject(models.Model):
    """The subjects offered in a particular poll."""
    poll = models.ForeignKey(ElectivePoll, on_delete=models.CASCADE, related_name='poll_subjects')
    elective_subject = models.ForeignKey(ElectiveSubject, on_delete=models.CASCADE, related_name='poll_associations')
    college = models.ForeignKey('college.College', on_delete=models.CASCADE, null=True, blank=True, related_name='elective_poll_subjects')
    seats = models.PositiveIntegerField(null=True, blank=True)
    staff = models.ForeignKey('academics.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='elective_poll_subjects')
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Elective Poll Subject'
        verbose_name_plural = 'Elective Poll Subjects'

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        
        # Auto-assign teaching assignment if staff is present
        if self.staff:
            try:
                from academics.models import AcademicYear, TeachingAssignment
                ay = AcademicYear.objects.filter(is_active=True).first()
                if ay:
                    # We use get_or_create to avoid duplicates if saved multiple times
                    TeachingAssignment.objects.get_or_create(
                        staff=self.staff,
                        elective_subject=self.elective_subject,
                        academic_year=ay,
                        defaults={'is_active': True}
                    )
            except ImportError:
                pass

    def __str__(self):
        return f"{self.elective_subject.course_name} in {self.poll}"

# Signals for cascading cleanup
from django.db.models.signals import post_delete
from django.dispatch import receiver

@receiver(post_delete, sender=ElectivePollSubject)
def cleanup_poll_subject_data(sender, instance, **kwargs):
    """Cleanup choices and assignments when a subject is removed from a poll."""
    subject = instance.elective_subject
    
    # Delete choices associated with this elective subject
    ElectiveChoice.objects.filter(elective_subject=subject).delete()

    # Delete teaching assignments for this staff-subject pair
    if instance.staff:
        try:
            from academics.models import TeachingAssignment
            TeachingAssignment.objects.filter(
                elective_subject=subject,
                staff=instance.staff,
                section_id__isnull=True
            ).delete()
        except ImportError:
            pass

    # Finally, delete the master ElectiveSubject record itself if it's not
    # linked to any other polls (prevents orphaned subject records).
    if not sender.objects.filter(elective_subject=subject).exists():
        subject.delete()
