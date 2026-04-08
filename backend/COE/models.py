from django.db import models

class CoeExamDummy(models.Model):
    """
    Maps a Student to a specific dummy number for a given exam session (semester).
    Used for scanning barcodes that represent dummy numbers.
    """
    # Using string reference to avoid circular imports if possible, or direct import if safe
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='coe_dummies')
    dummy_number = models.CharField(max_length=64, unique=True, db_index=True)
    semester = models.CharField(max_length=16)  # e.g. "SEM5"
    qp_type = models.CharField(max_length=16, default='QP1')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.dummy_number} ({self.student.reg_no})"


class CoeArrearStudent(models.Model):
    """Stores arrear exam registrations that should appear in COE students list."""

    batch = models.CharField(max_length=32)
    department = models.CharField(max_length=16, db_index=True)
    semester = models.CharField(max_length=16, db_index=True)
    course_code = models.CharField(max_length=64, db_index=True)
    course_name = models.CharField(max_length=255)
    student_register_number = models.CharField(max_length=64, db_index=True)
    student_name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['department', 'semester', 'course_code', 'student_register_number'],
                name='uniq_coe_arrear_dept_sem_course_reg',
            )
        ]
        indexes = [
            models.Index(fields=['department', 'semester']),
            models.Index(fields=['course_code', 'semester']),
        ]

    def __str__(self):
        return f"{self.department} {self.semester} {self.course_code} {self.student_register_number}"


class CoeAssignmentStore(models.Model):
    """Stores COE assignment data keyed by department/semester/date."""

    store_key = models.CharField(max_length=64, unique=True, db_index=True)
    assignments = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.store_key


class CoeCourseSelectionStore(models.Model):
    """
    Persists COE Course List selections (QP type, ESE type) and lock state
    per department+semester so they are available across all devices.
    """

    store_key = models.CharField(
        max_length=64, unique=True, db_index=True,
        help_text='department::semester, e.g. "BCA::SEM1"',
    )
    selections = models.JSONField(
        default=dict, blank=True,
        help_text='Map of courseKey -> {selected, qpType, eseType}',
    )
    is_locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.store_key} (locked={self.is_locked})"


class CoeKeyValueStore(models.Model):
    """Generic key-value store for COE page data that needs DB persistence across devices."""

    store_name = models.CharField(max_length=255, unique=True, db_index=True)
    data = models.JSONField(default=dict, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.store_name


class CoeStudentMarks(models.Model):
    """
    Row-based marks storage for COE mark entry.
    Each row stores marks for one dummy number instead of storing all marks in a single JSON blob.
    """

    dummy_number = models.CharField(max_length=64, unique=True, db_index=True)
    marks = models.JSONField(default=dict, blank=True, help_text='{"q1": "10", "q2": "5", ...}')
    qp_type = models.CharField(max_length=16, default='QP1', help_text='Question paper type: QP1, OE, etc.')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'COE Student Marks'
        verbose_name_plural = 'COE Student Marks'

    def __str__(self):
        return f"{self.dummy_number} ({self.qp_type})"

