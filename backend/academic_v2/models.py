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
import re
from datetime import timedelta
from django.db import models
from django.db.models import UniqueConstraint, Q
from django.conf import settings
from django.utils import timezone


class AcV2GoogleSheetsOAuthCredential(models.Model):
    """Persist Google OAuth credentials for Google Sheets creation in the database."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='acv2_google_sheets_oauth_credentials', null=True, blank=True)
    google_user_email = models.EmailField(max_length=255, blank=True)
    access_token = models.TextField(blank=True)
    refresh_token = models.TextField(blank=True)
    token_uri = models.URLField(max_length=512, blank=True)
    client_id = models.CharField(max_length=512, blank=True)
    client_secret = models.CharField(max_length=512, blank=True)
    scopes = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_google_sheets_oauth_credential'
        verbose_name = 'Google Sheets OAuth Credential'
        verbose_name_plural = 'Google Sheets OAuth Credentials'

    def __str__(self):
        return self.google_user_email or 'Google Sheets OAuth Credential'


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

    # Shared CQI custom variables available to all CQI configs in this class type.
    cqi_global_custom_vars = models.JSONField(default=list, blank=True)
    
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

    def _is_cqi_assignment(self, e):
        if not isinstance(e, dict):
            return False
        if str(e.get('kind') or '').strip().lower() == 'cqi':
            return True
        if e.get('is_cqi') is True:
            return True
        code = str(e.get('exam') or '').strip().upper()
        return code == 'CQI'

    def get_enabled_exams(self):
        """Get list of enabled exam assignments."""
        return [
            e
            for e in (self.exam_assignments or [])
            if isinstance(e, dict) and e.get('enabled', True) and (not self._is_cqi_assignment(e))
        ]

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
    
    # Order/sequence for display in faculty view (within class_type + qp_type scope)
    order = models.IntegerField(default=0, db_index=True)
    
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

    # Optional: Academic cycle association
    cycle = models.ForeignKey(
        'AcV2Cycle',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='qp_patterns'
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

        # If publish control is disabled for the semester, do not lock after publish.
        # Allow unlimited edits/publish for the whole semester (subject to open_from gating).
        try:
            if config is not None and not bool(getattr(config, 'publish_control_enabled', False)):
                return True
        except Exception:
            pass

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
    co6_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    
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
        
        max_supported_co = 6
        co_totals = {i: 0 for i in range(1, max_supported_co + 1)}

        def _extract_cos(raw_co):
            """Normalize a CO spec into a validated list of CO numbers."""
            out = []

            def _push(v):
                try:
                    n = int(v)
                except Exception:
                    return
                if 1 <= n <= max_supported_co and n not in out:
                    out.append(n)

            if raw_co is None:
                return out

            if isinstance(raw_co, (list, tuple, set)):
                for item in raw_co:
                    if isinstance(item, str) and not item.strip():
                        continue
                    if isinstance(item, (list, tuple, set)):
                        for nested in item:
                            _push(nested)
                    else:
                        _push(item)
                return out

            if isinstance(raw_co, str):
                s = raw_co.strip()
                if not s:
                    return out
                # Supports forms like "1&2", "1,2", "[1,2]", "CO1&CO2".
                parts = re.split(r'[^0-9]+', s)
                for p in parts:
                    if p:
                        _push(p)
                return out

            _push(raw_co)
            return out
        
        keys = set(str(k) for k in (self.question_marks or {}).keys())
        q_base = 0
        if 'q0' in keys:
            q_base = 0
        elif 'q1' in keys and 'q0' not in keys:
            q_base = 1

        for i, co in enumerate(cos):
            q_key = f'q{i + q_base}'
            q_mark = (self.question_marks or {}).get(q_key, 0) or 0

            co_list = _extract_cos(co)
            if not co_list:
                continue

            split_mark = q_mark / len(co_list)
            for c in co_list:
                co_totals[c] += split_mark
        
        for co_num in range(1, max_supported_co + 1):
            setattr(self, f'co{co_num}_mark', round(co_totals[co_num], 2))


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
    co6_total = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    
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
        
        max_supported_co = 6
        co_totals = {i: 0 for i in range(1, max_supported_co + 1)}
        
        for key, value in wm.items():
            if value is None:
                continue
            # Key format: "SSA1_CO1", "CIA1_CO2", etc.
            parts = key.split('_')
            if len(parts) == 2 and parts[1].startswith('CO'):
                co_num = int(parts[1][2:])
                if 1 <= co_num <= max_supported_co:
                    co_totals[co_num] += float(value)
        
        for co_num in range(1, max_supported_co + 1):
            setattr(self, f'co{co_num}_total', round(co_totals[co_num], 2))
        
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
# COURSE OUTCOME (Admin-managed CO master list)
# ============================================================================

class AcV2CourseOutcome(models.Model):
    """
    Master list of Course Outcomes (CO) used by Academic 2.1 editors.
    Example rows: CO1, CO2, CO3, ...
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Numeric CO identifier used in question mappings (e.g., 1 for CO1)
    number = models.PositiveIntegerField(db_index=True)

    # Optional display label/description (e.g., "Problem Solving")
    name = models.CharField(max_length=120, blank=True, default='')

    # Explicit ordering for admin display and dropdown order
    display_order = models.PositiveIntegerField(default=0, db_index=True)

    is_active = models.BooleanField(default=True, db_index=True)

    college = models.ForeignKey(
        'college.College',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='acv2_course_outcomes',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_course_outcomes_updated',
    )

    class Meta:
        db_table = 'acv2_course_outcome'
        verbose_name = 'Course Outcome'
        verbose_name_plural = 'Course Outcomes'
        ordering = ['display_order', 'number']
        constraints = [
            UniqueConstraint(
                fields=['number', 'college'],
                condition=Q(college__isnull=False),
                name='unique_acv2_co_number_per_college',
            ),
            UniqueConstraint(
                fields=['number'],
                condition=Q(college__isnull=True),
                name='unique_acv2_co_number_global',
            ),
        ]

    def __str__(self):
        if self.name:
            return f"CO{self.number} - {self.name}"
        return f"CO{self.number}"


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
    
    # Link to the QP Pattern that represents the exam assignment for this class type.
    # This is what the admin configures in the QP Pattern Editor flow.
    exam_assignment = models.ForeignKey(
        AcV2QpPattern,
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

    # Snapshot of the question table for quick access in DB/admin.
    # Stored as an array of rows: [{title, max_marks, btl_level, co_number, enabled}, ...]
    question_table = models.JSONField(default=list, blank=True)

    # Optional pass mark (whole number) for this exam within the QP type.
    # When set, overrides the percentage-based pass mark calculation in reporting.
    pass_mark = models.PositiveSmallIntegerField(null=True, blank=True)

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
        exam_id = getattr(self, 'exam_assignment_id', None)
        if not exam_id:
            exam_info = " (No exam)"
        else:
            try:
                ea = self.exam_assignment
                label = getattr(ea, 'name', None) or getattr(ea, 'exam', None) or str(ea)
                exam_info = f" - {label}"
            except Exception:
                exam_info = f" - (Missing: {exam_id})"

        return f"{self.class_type.name} -> {self.qp_type.name}{exam_info}"


# ============================================================================
# WEIGHTS (Admin Weightage persistence)
# ============================================================================

class Weigthts(models.Model):
    """Persist WeightagePage settings per (class_type, qp_type, exam).

    Note: The table name is intentionally kept as 'Weigthts' to match
    existing naming used in operations/requests.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class_type = models.ForeignKey(
        AcV2ClassType,
        on_delete=models.CASCADE,
        related_name='weights_rows',
    )

    qp_type = models.CharField(max_length=50, db_index=True)
    exam = models.CharField(max_length=100, db_index=True)
    exam_display_name = models.CharField(max_length=150, blank=True, default='')

    weight = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    co_weights = models.JSONField(default=dict, blank=True)
    default_cos = models.JSONField(default=list, blank=True)

    # Mark Manager conditional config (optional)
    mark_manager_enabled = models.BooleanField(default=False)
    mm_co_weights_with_exam = models.JSONField(default=dict, blank=True)
    mm_co_weights_without_exam = models.JSONField(default=dict, blank=True)
    mm_exam_weight = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_weights_updated',
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'Weigthts'
        verbose_name = 'Weights'
        verbose_name_plural = 'Weights'
        constraints = [
            UniqueConstraint(
                fields=['class_type', 'qp_type', 'exam'],
                name='unique_weights_per_class_qp_exam',
            ),
        ]
        indexes = [
            models.Index(fields=['class_type', 'qp_type']),
            models.Index(fields=['qp_type', 'exam']),
        ]

    def __str__(self):
        nm = self.exam_display_name or self.exam
        return f"{self.class_type.name} / {self.qp_type} / {nm}"


# ============================================================================
# CYCLE (Academic Cycle e.g. ODD SEM 2024-25, EVEN SEM 2024-25)
# ============================================================================

class AcV2Cycle(models.Model):
    """
    Academic cycle definition.
    Used to associate exam templates with a specific academic cycle.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30, unique=True, db_index=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    inactive_semester_ids = models.JSONField(default=list, blank=True)
    order = models.IntegerField(default=0, db_index=True)

    college = models.ForeignKey(
        'college.College',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='acv2_cycles'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_cycle'
        verbose_name = 'Academic Cycle'
        verbose_name_plural = 'Academic Cycles'
        ordering = ['order', 'name']

    def __str__(self):
        return f"{self.name} ({self.code})"

    def is_semester_active(self, semester_id):
        if not self.is_active:
            return False
        if semester_id in (None, ''):
            return True
        normalized = {str(item).strip() for item in (self.inactive_semester_ids or []) if str(item).strip()}
        return str(semester_id).strip() not in normalized


# ============================================================================
# CQI (Continuous Quality Improvement) - Academic 2.1
# ============================================================================

class AcV2CqiAssignment(models.Model):
    """CQI assignment/config for a teaching assignment.

    Stores draft CQI entries keyed by student_id.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    teaching_assignment = models.OneToOneField(
        'academics.TeachingAssignment',
        on_delete=models.CASCADE,
        related_name='acv2_cqi_assignment',
    )

    # e.g. [1,2,3,4,5]
    co_numbers = models.JSONField(default=list, blank=True)

    # Business threshold used by the CQI UI rules (default matches legacy CQI page)
    threshold_percent = models.FloatField(default=58.0)

    # Shape: { "<student_id>": {"co1": number|null, "co2": number|null, ... } }
    draft_entries = models.JSONField(default=dict, blank=True)
    draft_updated_by = models.IntegerField(null=True, blank=True)
    draft_updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'acv2_cqi_assignment'
        verbose_name = 'CQI Assignment'
        verbose_name_plural = 'CQI Assignments'
        indexes = [
            models.Index(fields=['draft_updated_at']),
        ]

    def __str__(self):
        return f"CQI - TA {getattr(self.teaching_assignment, 'id', '')}"


class AcV2CqiAttained(models.Model):
    """Published CQI snapshot per teaching assignment.

    Table name uses 'attained' as requested.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    teaching_assignment = models.OneToOneField(
        'academics.TeachingAssignment',
        on_delete=models.CASCADE,
        related_name='acv2_cqi_attained',
    )

    co_numbers = models.JSONField(default=list, blank=True)
    # Shape: { "<student_id>": {"co1": number|null, ... } }
    entries = models.JSONField(default=dict, blank=True)

    published_by = models.IntegerField(null=True, blank=True)
    published_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Edit-request flow (mirrors AcV2ExamAssignment fields)
    has_pending_edit_request = models.BooleanField(default=False)
    edit_window_until = models.DateTimeField(null=True, blank=True)

    def get_semester_config(self):
        """Get semester config for publish control settings."""
        try:
            sec = self.teaching_assignment.acv2_sections.select_related(
                'course__semester__acv2_config'
            ).first()
            if sec:
                return sec.course.semester.acv2_config
        except Exception:
            pass
        return None

    class Meta:
        db_table = 'acv2_cqi_attained'
        verbose_name = 'CQI Attained'
        verbose_name_plural = 'CQI Attained'
        indexes = [
            models.Index(fields=['published_at']),
        ]

    def __str__(self):
        return f"CQI Attained - TA {getattr(self.teaching_assignment, 'id', '')}"


class AcV2CqiEditRequest(models.Model):
    """
    Edit request from faculty after publishing CQI.
    Mirrors AcV2EditRequest but linked to AcV2CqiAttained.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    cqi_attained = models.ForeignKey(
        'AcV2CqiAttained',
        on_delete=models.CASCADE,
        related_name='edit_requests',
    )

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='acv2_cqi_edit_requests',
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField()

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
    current_stage = models.IntegerField(default=1)
    approval_history = models.JSONField(default=list, blank=True)
    approved_until = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_cqi_reviewed_requests',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        db_table = 'acv2_cqi_edit_request'
        verbose_name = 'CQI Edit Request'
        verbose_name_plural = 'CQI Edit Requests'
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['cqi_attained', 'status']),
        ]

    def __str__(self):
        return f"CQI EditRequest #{self.id} - {self.status}"

    def approve(self, user, window_minutes=120, notes=''):
        now = timezone.now()
        self.status = 'APPROVED'
        self.reviewed_by = user
        self.reviewed_at = now
        self.approved_until = now + timedelta(minutes=window_minutes)

        self.cqi_attained.edit_window_until = self.approved_until
        self.cqi_attained.has_pending_edit_request = False
        self.cqi_attained.save(update_fields=['edit_window_until', 'has_pending_edit_request'])

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
        now = timezone.now()
        self.status = 'REJECTED'
        self.reviewed_by = user
        self.reviewed_at = now
        self.rejection_reason = reason

        self.cqi_attained.has_pending_edit_request = False
        self.cqi_attained.save(update_fields=['has_pending_edit_request'])

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


class AcV2CqiExam(models.Model):
    """Persisted CQI exam configuration.

    This normalizes CQI config out of AcV2ClassType.exam_assignments JSON so:
    - CO selections are stable and authoritative
    - conditions/formulas are persisted without UI normalization drift
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class_type = models.ForeignKey(
        'academic_v2.AcV2ClassType',
        on_delete=models.CASCADE,
        related_name='cqi_exams',
    )

    # Stored explicitly for robust matching even if qp_type FK cannot be resolved.
    qp_type_code = models.CharField(max_length=50, db_index=True)

    # Optional linkage to the resolved QP type row.
    qp_type = models.ForeignKey(
        'academic_v2.AcV2QpType',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cqi_exams',
    )

    # Optional linkage for future use (requested FK). This may be null for CQI.
    qp_assignment = models.ForeignKey(
        'academic_v2.AcV2QpAssignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cqi_exams',
    )

    exam_code = models.CharField(max_length=50)
    exam_display_name = models.CharField(max_length=100, blank=True)
    order = models.IntegerField(default=0, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)

    cqi_name = models.CharField(max_length=255, blank=True)
    cqi_code = models.CharField(max_length=50, blank=True)
    cycle_id = models.CharField(max_length=100, blank=True)

    cos = models.JSONField(default=list, blank=True)
    considered_exams = models.JSONField(default=list, blank=True)
    custom_vars = models.JSONField(default=list, blank=True)
    global_custom_vars = models.JSONField(default=list, blank=True)
    derived_variables = models.JSONField(default=list, blank=True)

    co_value_expr = models.TextField(blank=True)
    formula = models.TextField(blank=True)
    conditions = models.JSONField(default=list, blank=True)
    else_formula = models.TextField(blank=True)

    updated_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acv2_cqi_exam_updates',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_cqi_exam'
        verbose_name = 'CQI Exam'
        verbose_name_plural = 'CQI Exams'
        constraints = [
            UniqueConstraint(
                fields=['class_type', 'qp_type_code', 'exam_code'],
                name='unique_acv2_cqi_exam_per_ct_qpt_exam',
            )
        ]
        indexes = [
            models.Index(fields=['class_type', 'qp_type_code', 'order']),
            models.Index(fields=['class_type', 'qp_type_code', 'exam_code']),
        ]

    def __str__(self):
        nm = self.exam_display_name or self.exam_code
        return f"CQI Exam {nm} ({self.qp_type_code})"


class AcV2CqiMark(models.Model):
    """CQI marks per student, per CO, per section, for a specific CQI exam."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    cqi_exam = models.ForeignKey(
        'academic_v2.AcV2CqiExam',
        on_delete=models.CASCADE,
        related_name='marks',
    )
    section = models.ForeignKey(
        'academic_v2.AcV2Section',
        on_delete=models.CASCADE,
        related_name='cqi_marks',
    )
    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='acv2_cqi_marks',
    )

    co_number = models.PositiveSmallIntegerField()
    mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_cqi_mark'
        verbose_name = 'CQI Mark'
        verbose_name_plural = 'CQI Marks'
        constraints = [
            UniqueConstraint(
                fields=['cqi_exam', 'section', 'student', 'co_number'],
                name='unique_acv2_cqi_mark_per_exam_student_co',
            )
        ]
        indexes = [
            models.Index(fields=['cqi_exam', 'section']),
            models.Index(fields=['student']),
        ]

    def __str__(self):
        return f"CQI Mark {self.student_id} CO{self.co_number}"


# ============================================================================
# CQI TOKEN REGISTRY
# ============================================================================

class AcV2CqiToken(models.Model):
    """
    Master registry of CQI tokens available in the condition builder and formula editors.

    System tokens (is_system=True) are seeded by migration and cannot be deleted.
    Exam-specific tokens are generated dynamically at runtime from exam assignments;
    only core/co_alias tokens are stored here.

    is_dynamic_co:
        When True, the token code contains 'COX' which is replaced at evaluation
        time with the actual CO number (e.g. COX_PERCENT → CO2_PERCENT for CO2).
        The UI displays it as [COx_PERCENT] to signal this substitution.

    available_in_condition:
        Can be shown in the token dropdown of IF clause rows.

    available_in_formula:
        Can be shown in the + Token picker for THEN / ELSE / custom variable fields.
    """

    CATEGORY_CHOICES = [
        ('core',        'Core CQI'),       # BEFORE_CQI, AFTER_CQI, TOTAL_CQI, CQI, X
        ('co_alias',    'CO Alias'),        # CO-RAW, CO-MAX, CO-WEIGHT, CO-TOTAL-RAW, CO-TOTAL-WEIGHT
        ('co_dynamic',  'CO Dynamic'),      # COX_PERCENT, BEFORE_CQI_COX_TOTAL, AFTER_CQI_COX_TOTAL
        ('exam',        'Exam Token'),      # EXAM-OBT, EXAM-WEIGHT, EXAM-TOTAL (per-exam, generated at runtime)
        ('custom',      'Custom Variable'), # User-defined in the editor
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Token code used in expressions, e.g. BEFORE_CQI, COX_PERCENT
    code = models.CharField(max_length=80)

    # Human-readable label shown in the token picker
    label = models.CharField(max_length=200)

    # Extended description / tooltip text
    description = models.TextField(blank=True)

    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='custom')

    # True if 'COX' in the code is a placeholder for the current CO number
    is_dynamic_co = models.BooleanField(default=False)

    # System tokens cannot be deleted via the API
    is_system = models.BooleanField(default=False)

    # Whether this token can appear in the IF clause token dropdown
    available_in_condition = models.BooleanField(default=True)

    # Whether this token can appear in the THEN / ELSE / custom-var formula picker
    available_in_formula = models.BooleanField(default=True)

    # Optional college scope (NULL = global)
    college = models.ForeignKey(
        'college.College',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='cqi_tokens',
    )

    # Optional class-type scope (NULL = available for all class types)
    class_type = models.ForeignKey(
        AcV2ClassType,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='cqi_tokens',
    )

    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_cqi_token'
        verbose_name = 'CQI Token'
        verbose_name_plural = 'CQI Tokens'
        ordering = ['order', 'category', 'code']
        constraints = [
            UniqueConstraint(
                fields=['code', 'college', 'class_type'],
                condition=Q(college__isnull=False, class_type__isnull=False),
                name='unique_cqi_token_college_classtype',
            ),
            UniqueConstraint(
                fields=['code', 'college'],
                condition=Q(college__isnull=False, class_type__isnull=True),
                name='unique_cqi_token_college_global',
            ),
            UniqueConstraint(
                fields=['code'],
                condition=Q(college__isnull=True, class_type__isnull=True),
                name='unique_cqi_token_global',
            ),
        ]

    def __str__(self):
        scope = f" [{self.college}]" if self.college else ""
        return f"[{self.code}]{scope} — {self.label}"


class AcV2CqiOperator(models.Model):
    """
    Comparison operators available in the CQI condition builder (IF clause dropdown).

    Examples: < (Less than), <= (Less than or equal), == (Equals), etc.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # The operator string stored in if_clauses[].operator and written into the if expression
    code = models.CharField(max_length=10, unique=True)

    # Short display symbol (same as code in most cases, e.g. '<')
    symbol = models.CharField(max_length=10)

    # Readable label, e.g. 'Less than'
    label = models.CharField(max_length=80)

    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'acv2_cqi_operator'
        verbose_name = 'CQI Operator'
        verbose_name_plural = 'CQI Operators'
        ordering = ['order']

    def __str__(self):
        return f"{self.symbol}  ({self.label})"


# ============================================================================
# PASS MARK SETTINGS
# ============================================================================

class AcV2PassMarkSetting(models.Model):
    """
    Global pass mark configuration used in result analysis PDF and reports.
    out_of: the denominator (e.g. 100)
    pass_mark: the minimum mark to pass (e.g. 50)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    out_of = models.IntegerField(default=100, help_text='Total marks (denominator)')
    pass_mark = models.IntegerField(default=50, help_text='Minimum marks to pass')
    label = models.CharField(max_length=100, default='Default', help_text='Label for this setting')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_pass_mark_setting'
        verbose_name = 'Pass Mark Setting'
        verbose_name_plural = 'Pass Mark Settings'
        ordering = ['out_of']

    def __str__(self):
        return f"{self.label}: {self.pass_mark}/{self.out_of}"


# ============================================================================
# MY MARKS SETTINGS
# ============================================================================


class AcV2MyMarksSetting(models.Model):
    """Singleton settings for student My Marks access and profile requirements."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=40, default='DEFAULT', unique=True)
    viewing_enabled = models.BooleanField(default=False)
    require_profile_photo = models.BooleanField(default=False)
    require_mobile_number = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_my_marks_setting'
        verbose_name = 'My Marks Setting'
        verbose_name_plural = 'My Marks Settings'

    def __str__(self):
        return f"My Marks ({self.key})"


# ============================================================================
# ACADEMIC NOTIFICATION SETTINGS
# ============================================================================


class AcV2AcademicNotificationSetting(models.Model):
    """Singleton settings for Academic 2.1 WhatsApp notifications."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    key = models.CharField(max_length=40, default='DEFAULT', unique=True)

    # Student academic notifications (marks publish)
    student_publish_enabled = models.BooleanField(default=False)
    notify_on_first_publish = models.BooleanField(default=True)
    notify_on_row_edits_only = models.BooleanField(default=True)
    notify_on_every_publish_click = models.BooleanField(default=False)

    first_publish_template = models.TextField(default=(
        '✅ {course_code} - {course_name}\n'
        '{exam_name} marks are published by {faculty_name}.\n'
        'Student: {student_name} ({register_number})\n'
        'Mark: {mark}/{max_mark}'
    ))
    edited_rows_template = models.TextField(default=(
        '✏️ {course_code} - {course_name}\n'
        '{exam_name} marks were updated by {faculty_name}.\n'
        'Student: {student_name} ({register_number})\n'
        'Updated Mark: {mark}/{max_mark}'
    ))
    every_publish_template = models.TextField(default=(
        '📢 {course_code} - {course_name}\n'
        '{exam_name} marks publish action completed by {faculty_name}.\n'
        'Student: {student_name} ({register_number})\n'
        'Mark: {mark}/{max_mark}'
    ))

    # CQI announcement
    cqi_announce_enabled = models.BooleanField(default=False)
    cqi_announce_template = models.TextField(default=(
        '📣 CQI Announced\n'
        '{course_code} - {course_name}\n'
        'Faculty: {faculty_name}\n'
        'CO Attainments: {co_attainments}\n'
        'Satisfied Conditions: {satisfied_conditions}'
    ))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_academic_notification_setting'
        verbose_name = 'Academic Notification Setting'
        verbose_name_plural = 'Academic Notification Settings'

    def __str__(self):
        return f"Academic Notifications ({self.key})"


# ============================================================================
# ADMIN BYPASS SESSION + LOGS
# ============================================================================

import secrets as _secrets

class AcV2BypassSession(models.Model):
    """
    Tracks an admin's bypass session into a faculty's course.
    Created when admin clicks "Bypass" and updated when they exit.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='acv2_bypass_sessions_admin',
    )
    # The faculty whose course is being bypassed
    faculty_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='acv2_bypass_sessions_faculty',
    )
    # Teaching assignment (section) being bypassed
    teaching_assignment_id = models.IntegerField(null=True, blank=True)
    course_code = models.CharField(max_length=64, blank=True)
    course_name = models.CharField(max_length=255, blank=True)
    section_name = models.CharField(max_length=64, blank=True)

    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    # Shared bypass link token (if admin shared the link)
    share_token = models.CharField(max_length=64, blank=True, db_index=True)
    share_expires_at = models.DateTimeField(null=True, blank=True)
    shared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='acv2_bypass_sessions_shared',
    )
    # If this session was created via shared link, track who used it
    shared_accessed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='acv2_bypass_sessions_accessed',
    )
    # Share link usage limits — how many unique users may access this link
    share_max_uses = models.PositiveIntegerField(default=1)
    share_use_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'acv2_bypass_session'
        verbose_name = 'Bypass Session'
        verbose_name_plural = 'Bypass Sessions'
        ordering = ['-started_at']

    def __str__(self):
        return f"Bypass by {self.admin} on {self.course_code} @ {self.started_at.strftime('%Y-%m-%d %H:%M')}"

    @property
    def duration_seconds(self):
        end = self.ended_at or timezone.now()
        return int((end - self.started_at).total_seconds())

    @classmethod
    def generate_share_token(cls):
        return _secrets.token_urlsafe(32)


class AcV2BypassLog(models.Model):
    """
    Audit log entry for actions taken during a bypass session.
    """
    ACTION_ENTER = 'ENTER'
    ACTION_EXIT = 'EXIT'
    ACTION_RESET_COURSE = 'RESET_COURSE'
    ACTION_RESET_EXAM = 'RESET_EXAM'
    ACTION_MESSAGE = 'MESSAGE'
    ACTION_MARK_EDIT = 'MARK_EDIT'
    ACTION_PUBLISH = 'PUBLISH'
    ACTION_UNPUBLISH = 'UNPUBLISH'
    ACTION_SHARE = 'SHARE'
    ACTION_SHARE_ACCESSED = 'SHARE_ACCESSED'
    ACTION_OTHER = 'OTHER'

    ACTION_CHOICES = [
        (ACTION_ENTER, 'Bypass Entered'),
        (ACTION_EXIT, 'Bypass Exited'),
        (ACTION_RESET_COURSE, 'Course Reset'),
        (ACTION_RESET_EXAM, 'Exam Reset'),
        (ACTION_MESSAGE, 'WhatsApp Message Sent'),
        (ACTION_MARK_EDIT, 'Marks Edited'),
        (ACTION_PUBLISH, 'Exam Published'),
        (ACTION_UNPUBLISH, 'Exam Unpublished'),
        (ACTION_SHARE, 'Bypass Link Shared'),
        (ACTION_SHARE_ACCESSED, 'Shared Bypass Accessed'),
        (ACTION_OTHER, 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        AcV2BypassSession,
        on_delete=models.CASCADE,
        related_name='logs',
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='acv2_bypass_logs',
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES, default=ACTION_OTHER)
    description = models.TextField(blank=True)
    extra = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'acv2_bypass_log'
        verbose_name = 'Bypass Log'
        verbose_name_plural = 'Bypass Logs'
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.action}] {self.description[:60]}"


# ============================================================================
# VISUAL ADMIN - Power BI Link Management
# ============================================================================

class VisualAdminStaffLink(models.Model):
    """
    Stores the Power BI URL configuration for a staff member.
    - overall_url: a single URL used for all courses (when use_course_urls=False)
    - use_course_urls: if True, per-course URLs from VisualAdminCourseLink are used
    """
    staff = models.OneToOneField(
        'academics.StaffProfile',
        on_delete=models.CASCADE,
        related_name='visual_admin_link',
    )
    overall_url = models.TextField(blank=True, default='')
    use_course_urls = models.BooleanField(
        default=False,
        help_text='If True, per-course links are used instead of the overall URL.',
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='visual_admin_staff_link_updates',
    )

    class Meta:
        db_table = 'visual_admin_staff_link'
        verbose_name = 'Visual Admin Staff Link'
        verbose_name_plural = 'Visual Admin Staff Links'

    def __str__(self):
        return f"VisualAdminStaffLink({self.staff})"


class VisualAdminCourseLink(models.Model):
    """
    Per-course Power BI URL for a staff member's teaching assignment.
    Only used when VisualAdminStaffLink.use_course_urls is True.
    """
    staff_link = models.ForeignKey(
        VisualAdminStaffLink,
        on_delete=models.CASCADE,
        related_name='course_links',
    )
    teaching_assignment = models.ForeignKey(
        'academics.TeachingAssignment',
        on_delete=models.CASCADE,
        related_name='visual_admin_course_links',
        null=True, blank=True,
    )
    url = models.TextField(blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'visual_admin_course_link'
        verbose_name = 'Visual Admin Course Link'
        verbose_name_plural = 'Visual Admin Course Links'
        unique_together = ('staff_link', 'teaching_assignment')

    def __str__(self):
        return f"VisualAdminCourseLink({self.staff_link.staff} - TA#{self.teaching_assignment_id})"


# ============================================================================
# PUBLISH SETTINGS
# ============================================================================


class AcV2PublishSetting(models.Model):
    """Singleton settings for the Mark Entry publish workflow."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=40, default='DEFAULT', unique=True)

    # If enabled, faculty cannot publish unless every non-absent student cell is filled.
    must_fill_all_cells = models.BooleanField(
        default=False,
        help_text='Block publish if any non-absent student has an empty mark cell.',
    )

    # How many seconds the "Publishing In Progress" animation plays in the UI.
    publish_progress_duration = models.PositiveSmallIntegerField(
        default=4,
        help_text='Seconds the publish progress animation plays (1–30).',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'acv2_publish_setting'
        verbose_name = 'Publish Setting'
        verbose_name_plural = 'Publish Settings'

    def __str__(self):
        return f"PublishSetting(must_fill={self.must_fill_all_cells}, duration={self.publish_progress_duration}s)"
