"""
Academic 2.1 - OBE Mark Entry System Models

Database schema for complete OBE mark entry with:
- Semester-level due dates and publish control
- Class types with exam assignments
- QP patterns with titles, BTL, CO, enabled columns
- Mark entry per (exam, CO) with weighted calculations
- Edit request workflow with multi-stage approval
"""

import uuid
from datetime import timedelta
from django.db import models
from django.db.models import UniqueConstraint, Q
from django.conf import settings
from django.utils import timezone


# ============================================================================
# SEMESTER CONFIGURATION (Due dates, Publish control)
# ============================================================================

class AcV2SemesterConfig(models.Model):
    """
    Semester-level configuration.
    Due date here applies to ALL courses/exams in the semester.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    semester = models.OneToOneField(
        'academics.Semester',
        on_delete=models.CASCADE,
        related_name='acv2_config'
    )
    
    # ========== PUBLISH CONTROL ==========
    # Master switch: ON = lock after publish, OFF = unlimited edits
    publish_control_enabled = models.BooleanField(default=True)
    
    # Approval workflow stages
    # [{"stage": 1, "role": "HOD"}, {"stage": 2, "role": "IQAC"}]
    approval_workflow = models.JSONField(default=list, blank=True)
    
    # Default approval window in minutes
    approval_window_minutes = models.IntegerField(default=120)

    # Pending edit request validity window (hours). If expired, faculty can submit again.
    edit_request_validity_hours = models.IntegerField(default=24)

    # If enabled, approved edit access stays open until faculty clicks Publish again.
    # When disabled, edit access is granted only for approval_window_minutes.
    approval_until_publish = models.BooleanField(default=False)
    
    # ========== DUE DATE (Semester-wide) ==========
    # Opens mark entry for all exams
    open_from = models.DateTimeField(null=True, blank=True)
    
    # Due date - after this, all exams auto-publish if enabled
    due_at = models.DateTimeField(null=True, blank=True)
    
    # Auto publish when due date passes
    auto_publish_on_due = models.BooleanField(default=True)

    # ========== SEAL STAMP SETTINGS ==========
    # Show animated seal on publish success popup
    seal_animation_enabled = models.BooleanField(default=False)
    # Show watermark seal on mark entry table after publish
    seal_watermark_enabled = models.BooleanField(default=False)
    # Optional seal image for UI (stored in MEDIA_ROOT)
    seal_image = models.ImageField(upload_to='academic_v2/seals/', null=True, blank=True)
    
    # ========== METADATA ==========
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_semester_configs_updated'
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'acv2_semester_config'
        verbose_name = 'Semester Configuration'
        verbose_name_plural = 'Semester Configurations'

    def __str__(self):
        return f"Config: {self.semester}"

    def is_open(self):
        """Check if mark entry is currently open."""
        now = timezone.now()
        if self.open_from and now < self.open_from:
            return False
        if self.due_at and now > self.due_at:
            return False
        return True

    def time_remaining(self):
        """Get remaining time until due date."""
        if not self.due_at:
            return None
        now = timezone.now()
        if now > self.due_at:
            return timedelta(0)
        return self.due_at - now

    def get_approval_stages(self):
        """Get list of approval stages."""
        return self.approval_workflow or []


# ============================================================================
# CLASS TYPE CONFIGURATION (Replaces hardcoded class types)
# ============================================================================

class AcV2ClassType(models.Model):
    """
    User-created class types with exam assignments.
    Each class type defines what exams are available and their weights.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Basic info
    name = models.CharField(max_length=50)  # e.g., "THEORY", "TCPR", "LAB"
    short_code = models.CharField(max_length=10)  # e.g., "TH", "TC", "LB"
    display_name = models.CharField(max_length=100, blank=True)
    
    # Total internal marks (usually 40 or 100)
    total_internal_marks = models.DecimalField(max_digits=6, decimal_places=2, default=40)
    
    # Allow faculty to customize question patterns
    allow_customize_questions = models.BooleanField(default=False)
    
    # Exam assignments with weights
    # [
    #   { "exam_title": "SSA-1", "qp_type": "SSA", "weight": 5, "enabled": true,
    #     "covered_cos": [1, 2], "allow_customize": true },
    #   { "exam_title": "CIA-1", "qp_type": "CIA", "weight": 15, "enabled": true,
    #     "covered_cos": [1, 2, 3], "allow_customize": false },
    #   ...
    # ]
    exam_assignments = models.JSONField(default=list, blank=True)
    
    # Default number of COs
    default_co_count = models.IntegerField(default=5)
    
    # College scope (if multi-tenant)
    college = models.ForeignKey(
        'college.College',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='acv2_class_types'
    )
    
    is_active = models.BooleanField(default=True)
    
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_class_types_updated'
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'acv2_class_type'
        verbose_name = 'Class Type'
        verbose_name_plural = 'Class Types'
        constraints = [
            UniqueConstraint(
                fields=['name', 'college'],
                condition=Q(college__isnull=False),
                name='unique_acv2_class_type_per_college'
            ),
            UniqueConstraint(
                fields=['name'],
                condition=Q(college__isnull=True),
                name='unique_acv2_class_type_global'
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.short_code})"

    def get_enabled_exams(self):
        """Get list of enabled exam assignments."""
        return [e for e in (self.exam_assignments or []) if e.get('enabled', True)]

    def get_total_weight(self):
        """Calculate total weight of all enabled exams."""
        return sum(e.get('weight', 0) for e in self.get_enabled_exams())


# ============================================================================
# QP PATTERN CONFIGURATION (Table Creator)
# ============================================================================

class AcV2QpPattern(models.Model):
    """
    Question paper pattern configuration.
    Defines question structure: titles, max marks, BTL, CO mapping.
    Acts as a reusable exam template that can be assigned to class types.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Human-readable name for this exam template (e.g. "CAT 1 Theory", "Model Exam Lab")
    name = models.CharField(max_length=100, blank=True)

    # Default weight (%) when this exam is assigned to a class type
    default_weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    
    # QP type (SSA, CIA, FA, MODEL, LAB, etc.)
    qp_type = models.CharField(max_length=50)
    
    # Optional: Link to specific class type
    class_type = models.ForeignKey(
        AcV2ClassType,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='qp_patterns'
    )
    
    # Pattern structure
    # {
    #   "titles": ["Part A - Q1", "Part A - Q2", "Part B - Q1", ...],
    #   "marks": [2, 2, 6, 6, 10, 5],
    #   "btls": [2, 2, 4, 4, 5, null],
    #   "cos": [1, 1, 2, 2, 3, null],
    #   "enabled": [true, true, true, true, true, true]
    # }
    pattern = models.JSONField(default=dict, blank=True)
    
    # Optional: Batch-level override
    batch = models.ForeignKey(
        'academics.Batch',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='acv2_qp_patterns'
    )
    
    # College scope
    college = models.ForeignKey(
        'college.College',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='acv2_qp_patterns'
    )
    
    is_active = models.BooleanField(default=True)
    
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_qp_patterns_updated'
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'acv2_qp_pattern'
        verbose_name = 'QP Pattern'
        verbose_name_plural = 'QP Patterns'
        indexes = [
            models.Index(fields=['qp_type', 'class_type']),
            models.Index(fields=['batch', 'qp_type']),
        ]

    def __str__(self):
        ct = self.class_type.name if self.class_type else 'Global'
        return f"{self.qp_type} - {ct}"

    def get_questions(self):
        """Get list of questions from pattern."""
        p = self.pattern or {}
        titles = p.get('titles', [])
        marks = p.get('marks', [])
        btls = p.get('btls', [])
        cos = p.get('cos', [])
        enabled = p.get('enabled', [True] * len(titles))
        
        questions = []
        for i in range(len(titles)):
            questions.append({
                'index': i,
                'title': titles[i] if i < len(titles) else f'Q{i+1}',
                'max': marks[i] if i < len(marks) else 0,
                'btl': btls[i] if i < len(btls) else None,
                'co': cos[i] if i < len(cos) else None,
                'enabled': enabled[i] if i < len(enabled) else True,
            })
        return questions


# ============================================================================
# COURSE / SECTION / EXAM ASSIGNMENT
# ============================================================================

class AcV2Course(models.Model):
    """Course in a semester with class type."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Link to existing Subject
    subject = models.ForeignKey(
        'academics.Subject',
        on_delete=models.CASCADE,
        related_name='acv2_courses'
    )
    
    semester = models.ForeignKey(
        'academics.Semester',
        on_delete=models.CASCADE,
        related_name='acv2_courses'
    )
    
    # Denormalized for quick access
    subject_code = models.CharField(max_length=64, db_index=True)
    subject_name = models.CharField(max_length=255)
    
    # Class type determines exam structure
    class_type = models.ForeignKey(
        AcV2ClassType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='courses'
    )
    
    # Fallback class type name if FK not set
    class_type_name = models.CharField(max_length=50, default='THEORY')
    
    # Question paper type (e.g., QP1 FINAL, REGULAR)
    question_paper_type = models.CharField(max_length=50, null=True, blank=True)
    
    # Number of COs for this course
    co_count = models.IntegerField(default=5)
    co_titles = models.JSONField(default=list, blank=True)  # ["CO1", "CO2", ...]
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_course'
        verbose_name = 'Course'
        verbose_name_plural = 'Courses'
        constraints = [
            UniqueConstraint(
                fields=['subject', 'semester'],
                name='unique_acv2_course_per_subject_semester'
            )
        ]
        indexes = [
            models.Index(fields=['subject_code', 'semester']),
            models.Index(fields=['class_type_name']),
        ]

    def __str__(self):
        return f"{self.subject_code} - {self.subject_name}"


class AcV2Section(models.Model):
    """Section within a Course - linked to TeachingAssignment."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    course = models.ForeignKey(
        AcV2Course,
        on_delete=models.CASCADE,
        related_name='sections'
    )
    
    # Link to existing TeachingAssignment
    teaching_assignment = models.ForeignKey(
        'academics.TeachingAssignment',
        on_delete=models.CASCADE,
        related_name='acv2_sections'
    )
    
    # Denormalized
    section_name = models.CharField(max_length=64)
    
    # Faculty assigned
    faculty_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_sections'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_section'
        verbose_name = 'Section'
        verbose_name_plural = 'Sections'
        constraints = [
            UniqueConstraint(
                fields=['course', 'teaching_assignment'],
                name='unique_acv2_section_per_course_ta'
            )
        ]

    def __str__(self):
        return f"{self.course.subject_code} - {self.section_name}"


class AcV2ExamAssignment(models.Model):
    """
    Exam Assignment (SSA1, CIA1, etc.) within a Section.
    Inherits due date from semester config.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    section = models.ForeignKey(
        AcV2Section,
        on_delete=models.CASCADE,
        related_name='exam_assignments'
    )
    
    # Exam identifier
    exam = models.CharField(max_length=50)  # SSA1, CIA1, FA1, MODEL, etc.
    exam_display_name = models.CharField(max_length=100, blank=True)
    qp_type = models.CharField(max_length=50, blank=True)  # SSA, CIA, FA, MODEL
    
    # Max marks and weight
    max_marks = models.DecimalField(max_digits=6, decimal_places=2, default=50)
    weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # Weight in %
    
    # Which COs this exam covers (JSON array: [1, 2] or [1, 2, 3])
    covered_cos = models.JSONField(default=list, blank=True)
    
    # QP Pattern for questions (can override class-level pattern)
    # If null, uses pattern from AcV2QpPattern based on qp_type
    qp_pattern = models.JSONField(default=dict, blank=True)
    
    # Whether faculty can customize questions for this exam
    allow_customize = models.BooleanField(default=False)
    
    # ========== STATE ==========
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('PUBLISHED', 'Published'),
        ('LOCKED', 'Locked'),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    
    # Draft data (marks before publish)
    # { "rows": { "student_id": { "q1": 5, "q2": 3, ... }, ... } }
    draft_data = models.JSONField(default=dict, blank=True)
    
    # Published snapshot
    published_data = models.JSONField(default=dict, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_published_exams'
    )
    
    # ========== EDIT REQUEST STATE ==========
    has_pending_edit_request = models.BooleanField(default=False)
    edit_window_until = models.DateTimeField(null=True, blank=True)
    edit_window_until_publish = models.BooleanField(default=False)
    
    # Timestamps
    last_saved_at = models.DateTimeField(null=True, blank=True)
    last_saved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_saved_exams'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_exam_assignment'
        verbose_name = 'Exam Assignment'
        verbose_name_plural = 'Exam Assignments'
        constraints = [
            UniqueConstraint(
                fields=['section', 'exam'],
                name='unique_acv2_exam_per_section'
            )
        ]
        indexes = [
            models.Index(fields=['section', 'exam']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.section} - {self.exam}"

    def get_semester_config(self):
        """Get semester config for due date and publish control."""
        try:
            return self.section.course.semester.acv2_config
        except Exception:
            return None

    def is_past_due(self):
        """Check if semester due date has passed."""
        config = self.get_semester_config()
        if not config or not config.due_at:
            return False
        return timezone.now() > config.due_at

    def is_editable(self):
        """Check if this exam can be edited."""
        # Mark entry can be gated by semester open window
        config = self.get_semester_config()
        if config and config.open_from and timezone.now() < config.open_from:
            return False

        # Check edit window first
        if self.edit_window_until and self.edit_window_until > timezone.now():
            return True

        # Unlimited edit access until the next Publish
        if self.edit_window_until_publish:
            return True
        
        # If DRAFT, check due date
        if self.status == 'DRAFT':
            if self.is_past_due():
                return False
            return True
        
        # PUBLISHED or LOCKED - not editable unless edit window
        return False

    def get_qp_pattern(self):
        """Get the QP pattern for this exam (from local or global)."""
        if self.qp_pattern:
            return self.qp_pattern
        
        # Try to find from AcV2QpPattern
        qp_type = ''
        try:
            qp_type = (self.section.course.question_paper_type or '').strip()
        except Exception:
            qp_type = ''
        if not qp_type:
            qp_type = (self.qp_type or '').strip() or (self.exam or '').strip() or ''
        exam_key = (self.exam_display_name or self.exam or '').strip()

        ct = None
        try:
            ct = self.section.course.class_type
        except Exception:
            ct = None

        base_qs = AcV2QpPattern.objects.filter(qp_type=qp_type, is_active=True)
        pattern = None

        if ct is not None:
            scoped = base_qs.filter(class_type=ct)
            if exam_key:
                pattern = scoped.filter(name__iexact=exam_key).order_by('-updated_at').first()
            else:
                pattern = scoped.order_by('-updated_at').first()
        
        if pattern:
            return pattern.pattern
        
        # Fallback to global pattern
        global_qs = base_qs.filter(class_type__isnull=True)
        if exam_key:
            pattern = global_qs.filter(name__iexact=exam_key).order_by('-updated_at').first()
        else:
            pattern = global_qs.order_by('-updated_at').first()
        
        return pattern.pattern if pattern else {}


# ============================================================================
# STUDENT MARKS
# ============================================================================

class AcV2StudentMark(models.Model):
    """
    Individual student marks for an Exam Assignment.
    Stores marks per CO and question-wise breakdown.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    exam_assignment = models.ForeignKey(
        AcV2ExamAssignment,
        on_delete=models.CASCADE,
        related_name='student_marks'
    )
    
    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='acv2_marks'
    )
    
    # Denormalized for quick display
    reg_no = models.CharField(max_length=50)
    student_name = models.CharField(max_length=255)
    
    # ========== CO MARKS (Columns) ==========
    # Each CO gets its own column - computed from question marks
    co1_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    co2_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    co3_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    co4_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    co5_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    
    # Total mark for this exam (sum of all questions)
    total_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    
    # Weighted mark (after applying exam weight for internal marks)
    weighted_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    
    # Question-wise marks (for detailed sheets)
    # { "q1": 8, "q2": 10, "q3": 15, ... }
    question_marks = models.JSONField(default=dict, blank=True)
    
    # Attendance/status
    is_absent = models.BooleanField(default=False)
    is_exempted = models.BooleanField(default=False)
    remarks = models.CharField(max_length=255, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_student_mark'
        verbose_name = 'Student Mark'
        verbose_name_plural = 'Student Marks'
        constraints = [
            UniqueConstraint(
                fields=['exam_assignment', 'student'],
                name='unique_acv2_student_mark_per_exam'
            )
        ]
        indexes = [
            models.Index(fields=['exam_assignment', 'reg_no']),
            models.Index(fields=['student']),
        ]

    def __str__(self):
        return f"{self.reg_no} - {self.exam_assignment.exam}"

    def calculate_total(self):
        """Sum all question marks."""
        total = sum(
            v for v in self.question_marks.values() 
            if v is not None and isinstance(v, (int, float))
        )
        self.total_mark = total
        return total

    def calculate_co_marks(self, qp_pattern):
        """Calculate CO marks based on question→CO mapping."""
        cos = qp_pattern.get('cos', [])
        marks = qp_pattern.get('marks', [])
        
        co_totals = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        
        for i, co in enumerate(cos):
            q_key = f'q{i+1}'
            q_mark = self.question_marks.get(q_key, 0) or 0
            
            if co is not None:
                # Handle "1&2" style multi-CO questions
                if isinstance(co, str) and '&' in co:
                    co_list = [int(c.strip()) for c in co.split('&')]
                    for c in co_list:
                        if 1 <= c <= 5:
                            co_totals[c] += q_mark / len(co_list)
                elif isinstance(co, int) and 1 <= co <= 5:
                    co_totals[co] += q_mark
        
        self.co1_mark = round(co_totals[1], 2)
        self.co2_mark = round(co_totals[2], 2)
        self.co3_mark = round(co_totals[3], 2)
        self.co4_mark = round(co_totals[4], 2)
        self.co5_mark = round(co_totals[5], 2)


class AcV2DraftMark(models.Model):
    """
    Per-student draft marks snapshot.
    Used to preserve draft values independently of published marks and lock state.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    exam_assignment = models.ForeignKey(
        AcV2ExamAssignment,
        on_delete=models.CASCADE,
        related_name='draft_marks'
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='acv2_draft_marks'
    )

    reg_no = models.CharField(max_length=50)
    student_name = models.CharField(max_length=255)

    total_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    question_marks = models.JSONField(default=dict, blank=True)
    is_absent = models.BooleanField(default=False)

    last_saved_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_draft_mark'
        verbose_name = 'Draft Mark'
        verbose_name_plural = 'Draft Marks'
        constraints = [
            UniqueConstraint(
                fields=['exam_assignment', 'student'],
                name='unique_acv2_draft_mark_per_exam'
            )
        ]
        indexes = [
            models.Index(fields=['exam_assignment', 'reg_no']),
            models.Index(fields=['student']),
        ]

    def __str__(self):
        return f"Draft {self.reg_no} - {self.exam_assignment.exam}"


# ============================================================================
# FACULTY PATTERN OVERRIDE
# ============================================================================

class AcV2UserPatternOverride(models.Model):
    """
    Faculty's custom QP pattern override for a specific course + exam.
    Only created if ClassType.allow_customize_questions = True.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Scope
    course = models.ForeignKey(
        AcV2Course,
        on_delete=models.CASCADE,
        related_name='user_pattern_overrides'
    )
    exam_type = models.CharField(max_length=50)  # CIA1, SSA1, etc.
    
    # Who customized
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='acv2_pattern_overrides'
    )
    
    # Same pattern structure as AcV2QpPattern
    pattern = models.JSONField(default=dict, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_user_pattern_override'
        verbose_name = 'User Pattern Override'
        verbose_name_plural = 'User Pattern Overrides'
        constraints = [
            UniqueConstraint(
                fields=['course', 'exam_type', 'created_by'],
                name='unique_acv2_user_pattern_per_course_exam_user'
            )
        ]


# ============================================================================
# EDIT REQUEST (Approval Workflow)
# ============================================================================

class AcV2EditRequest(models.Model):
    """
    Edit request from faculty after publish.
    Follows multi-stage approval workflow defined in semester config.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    exam_assignment = models.ForeignKey(
        AcV2ExamAssignment,
        on_delete=models.CASCADE,
        related_name='edit_requests'
    )
    
    # Requester info
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='acv2_edit_requests'
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField()
    
    # Status
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('HOD_PENDING', 'Pending HOD Approval'),
        ('IQAC_PENDING', 'Pending IQAC Approval'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('EXPIRED', 'Expired'),
        ('CANCELLED', 'Cancelled'),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    
    # Current approval stage
    current_stage = models.IntegerField(default=1)
    
    # Approval history
    # [{"stage": 1, "role": "HOD", "user_id": 123, "user_name": "...",
    #   "action": "APPROVED", "at": "...", "notes": "..."}]
    approval_history = models.JSONField(default=list, blank=True)
    
    # When approved, edit window ends at
    approved_until = models.DateTimeField(null=True, blank=True)

    # Pending request expires at (after this, faculty can request again)
    expires_at = models.DateTimeField(null=True, blank=True)
    
    # Final reviewer
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_reviewed_requests'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        db_table = 'acv2_edit_request'
        verbose_name = 'Edit Request'
        verbose_name_plural = 'Edit Requests'
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['exam_assignment', 'status']),
            models.Index(fields=['requested_by', 'status']),
        ]

    def __str__(self):
        return f"EditRequest #{self.id} - {self.exam_assignment.exam} - {self.status}"

    def approve(self, user, window_minutes=120, notes=''):
        """Approve the request and grant edit window."""
        now = timezone.now()
        self.status = 'APPROVED'
        self.reviewed_by = user
        self.reviewed_at = now
        self.approved_until = now + timedelta(minutes=window_minutes)
        
        # Update exam assignment
        self.exam_assignment.edit_window_until = self.approved_until
        self.exam_assignment.edit_window_until_publish = False
        self.exam_assignment.has_pending_edit_request = False
        self.exam_assignment.save(update_fields=['edit_window_until', 'edit_window_until_publish', 'has_pending_edit_request'])
        
        # Add to history
        history = self.approval_history or []
        history.append({
            'stage': self.current_stage,
            'user_id': user.id,
            'user_name': str(user),
            'action': 'APPROVED',
            'at': now.isoformat(),
            'notes': notes,
            'window_minutes': window_minutes,
        })
        self.approval_history = history
        self.save()

    def reject(self, user, reason=''):
        """Reject the request."""
        now = timezone.now()
        self.status = 'REJECTED'
        self.reviewed_by = user
        self.reviewed_at = now
        self.rejection_reason = reason
        
        # Update exam assignment
        self.exam_assignment.has_pending_edit_request = False
        self.exam_assignment.save(update_fields=['has_pending_edit_request'])
        
        # Add to history
        history = self.approval_history or []
        history.append({
            'stage': self.current_stage,
            'user_id': user.id,
            'user_name': str(user),
            'action': 'REJECTED',
            'at': now.isoformat(),
            'reason': reason,
        })
        self.approval_history = history
        self.save()


# ============================================================================
# INTERNAL MARK (Computed, Read-Only for Faculty)
# ============================================================================

class AcV2InternalMark(models.Model):
    """
    Computed internal marks per student per section.
    This is READ-ONLY for faculty - computed from all exam assignments.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    section = models.ForeignKey(
        AcV2Section,
        on_delete=models.CASCADE,
        related_name='internal_marks'
    )
    
    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='acv2_internal_marks'
    )
    
    # Denormalized
    reg_no = models.CharField(max_length=50)
    student_name = models.CharField(max_length=255)
    
    # ========== WEIGHTED MARKS PER (EXAM, CO) ==========
    # { "SSA1_CO1": 2.3, "SSA1_CO2": 2.4, "CIA1_CO1": 4.8, "CIA1_CO2": 4.9, ... }
    weighted_marks = models.JSONField(default=dict, blank=True)
    
    # ========== TOTALS PER CO ==========
    co1_total = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    co2_total = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    co3_total = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    co4_total = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    co5_total = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    
    # Final internal mark (e.g., /40)
    final_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    
    # Out of (usually 40 or 100)
    max_mark = models.DecimalField(max_digits=6, decimal_places=2, default=40)
    
    # Computation metadata
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_internal_mark'
        verbose_name = 'Internal Mark'
        verbose_name_plural = 'Internal Marks'
        constraints = [
            UniqueConstraint(
                fields=['section', 'student'],
                name='unique_acv2_internal_mark_per_section_student'
            )
        ]
        indexes = [
            models.Index(fields=['section', 'reg_no']),
        ]

    def __str__(self):
        return f"{self.reg_no} - {self.section} - {self.final_mark}/{self.max_mark}"

    def calculate_totals(self):
        """Calculate CO totals and final mark from weighted_marks."""
        wm = self.weighted_marks or {}
        
        co_totals = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        
        for key, value in wm.items():
            if value is None:
                continue
            # Key format: "SSA1_CO1", "CIA1_CO2", etc.
            parts = key.split('_')
            if len(parts) == 2 and parts[1].startswith('CO'):
                co_num = int(parts[1][2:])
                if 1 <= co_num <= 5:
                    co_totals[co_num] += float(value)
        
        self.co1_total = round(co_totals[1], 2)
        self.co2_total = round(co_totals[2], 2)
        self.co3_total = round(co_totals[3], 2)
        self.co4_total = round(co_totals[4], 2)
        self.co5_total = round(co_totals[5], 2)
        
        self.final_mark = round(sum(co_totals.values()), 2)


# ============================================================================
# QP TYPE MASTER TABLE (New)
# ============================================================================

class AcV2QpType(models.Model):
    """
    Master table for Question Paper Types.
    Defines the type of exam (SSA, CIA, MODEL, LAB, THEORY, etc.)
    Can be global or scoped to a specific class type.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Type name (e.g., "SSA-1", "CIA-1", "MODEL EXAM", "LAB EXAM")
    name = models.CharField(max_length=100, unique=True, db_index=True)
    
    # Type code (e.g., "SSA", "CIA", "MODEL", "LAB")
    code = models.CharField(max_length=20, unique=True, db_index=True)
    
    # Optional: Link to specific class type (if null, it's global)
    class_type = models.ForeignKey(
        AcV2ClassType,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='qp_types'
    )
    
    # Description
    description = models.TextField(blank=True)
    
    # Is this type active and available for use?
    is_active = models.BooleanField(default=True, db_index=True)
    
    # College scope (if multi-tenant)
    college = models.ForeignKey(
        'college.College',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='acv2_qp_types'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_qp_types_updated'
    )
    
    class Meta:
        db_table = 'acv2_qp_type'
        verbose_name = 'QP Type'
        verbose_name_plural = 'QP Types'
        constraints = [
            UniqueConstraint(
                fields=['name', 'college'],
                condition=Q(college__isnull=False),
                name='unique_acv2_qp_type_per_college'
            ),
            UniqueConstraint(
                fields=['code', 'college'],
                condition=Q(college__isnull=False),
                name='unique_acv2_qp_type_code_per_college'
            ),
        ]
        indexes = [
            models.Index(fields=['is_active', 'college']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.code})"


# ============================================================================
# QUESTION MODEL (New)
# Stores individual questions with metadata
# ============================================================================

class AcV2Question(models.Model):
    """
    Individual question within a QP Pattern.
    Each question has title, max marks, BTL level, CO mapping.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Link to QP Pattern
    qp_pattern = models.ForeignKey(
        AcV2QpPattern,
        on_delete=models.CASCADE,
        related_name='questions'
    )
    
    # Question details
    title = models.CharField(max_length=255)  # e.g., "Q1", "Part A - Q1"
    max_marks = models.DecimalField(max_digits=5, decimal_places=2)
    
    # BTL (Bloom's Taxonomy Level) 1-6
    btl_level = models.IntegerField(
        null=True,
        blank=True,
        choices=[(i, f'BTL {i}') for i in range(1, 7)]
    )
    
    # CO (Course Outcome) number
    co_number = models.IntegerField(null=True, blank=True)
    
    # Whether this question is enabled/active
    is_enabled = models.BooleanField(default=True)
    
    # Question order/sequence in the pattern
    order = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_questions_updated'
    )
    
    class Meta:
        db_table = 'acv2_question'
        verbose_name = 'Question'
        verbose_name_plural = 'Questions'
        constraints = [
            UniqueConstraint(
                fields=['qp_pattern', 'order'],
                name='unique_question_order_per_pattern'
            ),
        ]
        indexes = [
            models.Index(fields=['qp_pattern', 'order']),
            models.Index(fields=['co_number']),
            models.Index(fields=['is_enabled']),
        ]
        ordering = ['order']
    
    def __str__(self):
        return f"{self.title} ({self.max_marks} marks, CO{self.co_number})"


# ============================================================================
# QP ASSIGNMENT (New)
# Junction table: Class Type -> QP Type -> Exam Assignment
# ============================================================================

class AcV2QpAssignment(models.Model):
    """
    Maps QP Types to Class Types and Exam Assignments.
    Allows linking which QP Types are used for specific exam types.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Links to the three tables
    class_type = models.ForeignKey(
        AcV2ClassType,
        on_delete=models.CASCADE,
        related_name='qp_assignments'
    )
    
    qp_type = models.ForeignKey(
        AcV2QpType,
        on_delete=models.CASCADE,
        related_name='assignments'
    )
    
    # Link to exam assignment (optional - can be null for template)
    exam_assignment = models.ForeignKey(
        AcV2ExamAssignment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qp_assignments'
    )
    
    # Weight/percentage for this exam type within the class type
    weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    
    # Is this assignment active?
    is_active = models.BooleanField(default=True)
    
    # Additional configuration
    # Can store exam-specific settings like "allow_customize", "covered_cos", etc.
    config = models.JSONField(default=dict, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_qp_assignments_updated'
    )
    
    class Meta:
        db_table = 'acv2_qp_assignment'
        verbose_name = 'QP Assignment'
        verbose_name_plural = 'QP Assignments'
        constraints = [
            UniqueConstraint(
                fields=['class_type', 'qp_type', 'exam_assignment'],
                name='unique_qp_assignment'
            ),
        ]
        indexes = [
            models.Index(fields=['class_type', 'qp_type']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        exam_info = f" - {self.exam_assignment.exam}" if self.exam_assignment else " (Template)"
        return f"{self.class_type.name} -> {self.qp_type.name}{exam_info}"
