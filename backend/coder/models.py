"""
IDCS Coder - Models

All Coder-specific models. They reference existing IDCS models via FK
but do NOT duplicate User, Student, Faculty, Section, or Department tables.

References:
  - accounts.models.User  (settings.AUTH_USER_MODEL)
  - academics.models.StudentProfile
  - academics.models.StaffProfile
  - academics.models.Section
  - academics.models.Department
"""

from django.db import models
from django.conf import settings
from django.utils import timezone
import secrets


# ---------------------------------------------------------------------------
# Coder role constants (stored in accounts.Role table)
# ---------------------------------------------------------------------------
CODER_ROLE_ADMIN = 'CODE_ADMIN'
CODER_ROLE_COURSE_INCHARGE = 'CODE_COURSE_INCHARGE'
CODER_ROLE_SECTION_INCHARGE = 'CODE_SECTION_INCHARGE'


# ---------------------------------------------------------------------------
# CodeCourse
# ---------------------------------------------------------------------------

class CodeCourse(models.Model):
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('ARCHIVED', 'Archived'),
        ('DRAFT', 'Draft'),
    ]

    name = models.CharField(max_length=200)
    code = models.CharField(max_length=32, unique=True)
    description = models.TextField(blank=True, default='')
    thumbnail = models.ImageField(upload_to='coder/thumbnails/', null=True, blank=True)
    academic_year = models.CharField(max_length=16, blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='DRAFT')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='coder_courses_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-created_at',)
        verbose_name = 'Code Course'
        verbose_name_plural = 'Code Courses'

    def __str__(self):
        return f"{self.code} - {self.name}"


# ---------------------------------------------------------------------------
# CodeCourseIncharge  (linking faculty User to a course)
# ---------------------------------------------------------------------------

class CodeCourseIncharge(models.Model):
    course = models.ForeignKey(
        CodeCourse,
        on_delete=models.CASCADE,
        related_name='incharge_assignments',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='coder_incharge_assignments',
        help_text='Faculty/staff user who has CODE_COURSE_INCHARGE role',
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='coder_incharge_assignments_made',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('course', 'user')
        verbose_name = 'Course Incharge'
        verbose_name_plural = 'Course Incharges'

    def __str__(self):
        return f"{self.user} → {self.course}"


# ---------------------------------------------------------------------------
# CodeClass  (links a CodeCourse to an IDCS Section)
# ---------------------------------------------------------------------------

class CodeClass(models.Model):
    """A class/section within a CodeCourse.
    
    References the existing IDCS Section model instead of duplicating it.
    """
    course = models.ForeignKey(
        CodeCourse,
        on_delete=models.CASCADE,
        related_name='classes',
    )
    name = models.CharField(max_length=64, help_text='e.g. CSE-A, IT-B')
    # Link to existing IDCS Section (optional — may not always map 1:1)
    idcs_section = models.ForeignKey(
        'academics.Section',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='coder_classes',
        help_text='Linked IDCS section for automatic student enrollment',
    )
    academic_year = models.CharField(max_length=16, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('course', 'name')
        verbose_name = 'Code Class'
        verbose_name_plural = 'Code Classes'

    def __str__(self):
        return f"{self.course.code} / {self.name}"


# ---------------------------------------------------------------------------
# CodeSectionIncharge
# ---------------------------------------------------------------------------

class CodeSectionIncharge(models.Model):
    code_class = models.ForeignKey(
        CodeClass,
        on_delete=models.CASCADE,
        related_name='section_incharge_assignments',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='coder_section_incharge_assignments',
        help_text='User with CODE_SECTION_INCHARGE role',
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='coder_section_incharge_assignments_made',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('code_class', 'user')
        verbose_name = 'Section Incharge'
        verbose_name_plural = 'Section Incharges'

    def __str__(self):
        return f"{self.user} → {self.code_class}"


# ---------------------------------------------------------------------------
# CodeEnrollment  (Student → CodeClass)
# ---------------------------------------------------------------------------

class CodeEnrollment(models.Model):
    """Enrolls a student (via StudentProfile) into a CodeClass."""
    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='coder_enrollments',
    )
    code_class = models.ForeignKey(
        CodeClass,
        on_delete=models.CASCADE,
        related_name='enrollments',
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('student', 'code_class')
        verbose_name = 'Code Enrollment'
        verbose_name_plural = 'Code Enrollments'

    def __str__(self):
        return f"{self.student.reg_no} → {self.code_class}"


# ---------------------------------------------------------------------------
# CodeSession
# ---------------------------------------------------------------------------

class CodeSession(models.Model):
    SESSION_TYPE_CHOICES = [
        ('MCQ', 'MCQ'),
        ('LAB', 'Lab'),
        ('PROJECT', 'Project'),
    ]

    course = models.ForeignKey(
        CodeCourse,
        on_delete=models.CASCADE,
        related_name='sessions',
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=1)
    session_type = models.CharField(max_length=16, choices=SESSION_TYPE_CHOICES, default='LAB')
    is_published = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='coder_sessions_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('course', 'order')
        verbose_name = 'Code Session'
        verbose_name_plural = 'Code Sessions'

    def __str__(self):
        return f"{self.course.code} / Session {self.order}: {self.title}"


# ---------------------------------------------------------------------------
# CodeAssessment
# ---------------------------------------------------------------------------

class CodeAssessment(models.Model):
    ASSESSMENT_TYPE_CHOICES = [
        ('MCQ', 'MCQ'),
        ('CODING', 'Coding'),
    ]
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('PUBLISHED', 'Published'),
        ('CLOSED', 'Closed'),
    ]

    session = models.ForeignKey(
        CodeSession,
        on_delete=models.CASCADE,
        related_name='assessments',
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    assessment_type = models.CharField(max_length=16, choices=ASSESSMENT_TYPE_CHOICES)
    total_marks = models.PositiveIntegerField(default=0)
    duration_minutes = models.PositiveIntegerField(default=60)
    max_attempts = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='DRAFT')
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='coder_assessments_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('session', 'created_at')
        verbose_name = 'Code Assessment'
        verbose_name_plural = 'Code Assessments'

    def __str__(self):
        return f"{self.session} / {self.title} ({self.assessment_type})"


# ---------------------------------------------------------------------------
# MCQQuestion
# ---------------------------------------------------------------------------

class MCQQuestion(models.Model):
    assessment = models.ForeignKey(
        CodeAssessment,
        on_delete=models.CASCADE,
        related_name='mcq_questions',
    )
    question_text = models.TextField(help_text='The question (target column from Excel)')
    correct_answer = models.TextField()
    wrong_ans1 = models.TextField()
    wrong_ans2 = models.TextField()
    wrong_ans3 = models.TextField()
    order = models.PositiveIntegerField(default=0)
    marks = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ('assessment', 'order')
        verbose_name = 'MCQ Question'
        verbose_name_plural = 'MCQ Questions'

    def __str__(self):
        return f"Q{self.order}: {self.question_text[:60]}"


# ---------------------------------------------------------------------------
# CodingProject  (template project for a CODING assessment)
# ---------------------------------------------------------------------------

class CodingProject(models.Model):
    WORKSPACE_TYPE_CHOICES = [
        ('SINGLE_FILE', 'Single File'),
        ('PROJECT', 'Project'),
    ]
    SINGLE_FILE_LANGUAGE_CHOICES = [
        ('python', 'Python'),
        ('java', 'Java'),
        ('c', 'C'),
        ('cpp', 'C++'),
    ]
    PROJECT_TYPE_CHOICES = [
        ('CONSOLE', 'Console'),
        ('WEB', 'Web'),
        ('SPRING_BOOT', 'Spring Boot'),
        ('FRONTEND', 'Frontend'),
        ('FULL_STACK', 'Full Stack'),
    ]
    RUNTIME_CHOICES = [
        ('JAVA', 'Java'),
        ('PYTHON', 'Python'),
        ('NODE', 'Node.js'),
    ]
    BUILD_TOOL_CHOICES = [
        ('MAVEN', 'Maven'),
        ('GRADLE', 'Gradle'),
        ('NPM', 'npm'),
        ('NONE', 'None'),
    ]

    # --- Workspace type (SINGLE_FILE or PROJECT) ---
    workspace_type = models.CharField(
        max_length=16,
        choices=WORKSPACE_TYPE_CHOICES,
        default='SINGLE_FILE',
        help_text='Determines the coding environment type',
    )
    single_file_name = models.CharField(
        max_length=128, default='solution',
        help_text='Base file name without extension (e.g. HelloWorld)',
    )
    single_file_language = models.CharField(
        max_length=8,
        choices=SINGLE_FILE_LANGUAGE_CHOICES,
        default='java',
        help_text='Programming language for single-file mode',
    )

    assessment = models.OneToOneField(
        CodeAssessment,
        on_delete=models.CASCADE,
        related_name='coding_project',
    )
    supported_languages = models.JSONField(
        default=list,
        help_text='List of supported file extensions e.g. [".java", ".py"]',
    )
    time_limit_seconds = models.PositiveIntegerField(default=10)
    memory_limit_mb = models.PositiveIntegerField(default=256)
    cpu_limit = models.FloatField(default=0.5, help_text='Docker CPU limit (cores)')
    entry_point = models.CharField(
        max_length=256, blank=True, default='',
        help_text='Main file to execute e.g. src/Main.java',
    )
    build_command = models.CharField(
        max_length=512, blank=True, default='',
        help_text='Build command e.g. javac -d . src/Main.java',
    )
    run_command = models.CharField(
        max_length=512, blank=True, default='',
        help_text='Run command e.g. java Main',
    )

    # --- Web/Application execution fields ---
    project_type = models.CharField(
        max_length=16, choices=PROJECT_TYPE_CHOICES, default='CONSOLE',
        help_text='Type of project determines execution strategy',
    )
    runtime = models.CharField(
        max_length=16, choices=RUNTIME_CHOICES, default='JAVA',
    )
    runtime_version = models.CharField(
        max_length=16, default='21',
        help_text='Runtime version e.g. 21 for Java 21',
    )
    build_tool = models.CharField(
        max_length=16, choices=BUILD_TOOL_CHOICES, default='MAVEN',
    )
    start_command = models.CharField(
        max_length=512, blank=True, default='',
        help_text='Command to start the web application e.g. java -jar target/app.jar',
    )
    app_port = models.PositiveIntegerField(
        default=8080,
        help_text='Port the application binds to inside the container',
    )
    preview_enabled = models.BooleanField(
        default=False,
        help_text='Enable live preview panel for this assessment',
    )
    env_vars = models.JSONField(
        default=dict,
        help_text='Safe environment variables {KEY: VALUE} passed to the container',
    )
    working_directory = models.CharField(
        max_length=256, blank=True, default='',
        help_text='Working directory inside the container (defaults to /workspace)',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Coding Project'
        verbose_name_plural = 'Coding Projects'

    def __str__(self):
        return f"Project for {self.assessment}"


# ---------------------------------------------------------------------------
# ProjectFolder
# ---------------------------------------------------------------------------

class ProjectFolder(models.Model):
    project = models.ForeignKey(
        CodingProject,
        on_delete=models.CASCADE,
        related_name='folders',
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='sub_folders',
    )
    name = models.CharField(max_length=128)
    is_locked = models.BooleanField(
        default=False,
        help_text='If locked, students cannot create files inside this folder',
    )

    class Meta:
        unique_together = ('project', 'parent', 'name')
        verbose_name = 'Project Folder'
        verbose_name_plural = 'Project Folders'

    def __str__(self):
        return self.name

    def get_path(self):
        parts = [self.name]
        parent = self.parent
        while parent:
            parts.insert(0, parent.name)
            parent = parent.parent
        return '/'.join(parts)


# ---------------------------------------------------------------------------
# ProjectFile
# ---------------------------------------------------------------------------

class ProjectFile(models.Model):
    project = models.ForeignKey(
        CodingProject,
        on_delete=models.CASCADE,
        related_name='files',
    )
    folder = models.ForeignKey(
        ProjectFolder,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='files',
    )
    name = models.CharField(max_length=128)
    content = models.TextField(blank=True, default='')
    is_locked = models.BooleanField(
        default=False,
        help_text='If locked, students cannot delete or rename this file',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('project', 'folder', 'name')
        verbose_name = 'Project File'
        verbose_name_plural = 'Project Files'

    def __str__(self):
        return self.name

    def get_path(self):
        if self.folder:
            return f"{self.folder.get_path()}/{self.name}"
        return self.name


# ---------------------------------------------------------------------------
# LockedCodeRegion  (line-range locks inside a ProjectFile)
# ---------------------------------------------------------------------------

class LockedCodeRegion(models.Model):
    """Defines line ranges in a ProjectFile that students cannot modify."""
    file = models.ForeignKey(
        ProjectFile,
        on_delete=models.CASCADE,
        related_name='locked_regions',
    )
    start_line = models.PositiveIntegerField()
    start_column = models.PositiveIntegerField(default=1)
    end_line = models.PositiveIntegerField()
    end_column = models.PositiveIntegerField(default=1)
    label = models.CharField(max_length=128, blank=True, default='')

    class Meta:
        ordering = ('file', 'start_line')
        verbose_name = 'Locked Code Region'
        verbose_name_plural = 'Locked Code Regions'

    def __str__(self):
        return f"{self.file.name} lines {self.start_line}-{self.end_line}"


# ---------------------------------------------------------------------------
# TestCase
# ---------------------------------------------------------------------------

class TestCase(models.Model):
    assessment = models.ForeignKey(
        CodeAssessment,
        on_delete=models.CASCADE,
        related_name='test_cases',
    )
    input_data = models.TextField(blank=True, default='')
    expected_output = models.TextField(blank=True, default='')
    is_hidden = models.BooleanField(
        default=False,
        help_text='Hidden test cases are NOT sent to student browser',
    )
    order = models.PositiveIntegerField(default=0)
    marks = models.PositiveIntegerField(default=1)
    description = models.CharField(max_length=256, blank=True, default='')

    class Meta:
        ordering = ('assessment', 'order')
        verbose_name = 'Test Case'
        verbose_name_plural = 'Test Cases'

    def __str__(self):
        visibility = 'Hidden' if self.is_hidden else 'Public'
        return f"{visibility} TC {self.order} for {self.assessment}"


# ---------------------------------------------------------------------------
# CodeSubmission
# ---------------------------------------------------------------------------

class CodeSubmission(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('COMPILING', 'Compiling'),
        ('RUNNING', 'Running'),
        ('PASSED', 'Passed'),
        ('FAILED', 'Failed'),
        ('ERROR', 'Error'),
        ('REJECTED', 'Rejected'),  # locked-region tampering
        ('TIMEOUT', 'Timeout'),
    ]

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='coder_submissions',
    )
    assessment = models.ForeignKey(
        CodeAssessment,
        on_delete=models.CASCADE,
        related_name='submissions',
    )
    attempt_number = models.PositiveIntegerField(default=1)
    # Snapshot of submitted files: {filepath: content}
    source_snapshot = models.JSONField(default=dict)
    language = models.CharField(max_length=32, blank=True, default='')
    submitted_at = models.DateTimeField(auto_now_add=True)
    execution_time_ms = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='PENDING')
    score = models.FloatField(default=0)
    total_score = models.FloatField(default=0)
    passed_tests = models.PositiveIntegerField(default=0)
    failed_tests = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, default='')
    result_details = models.JSONField(
        default=dict,
        help_text='Per-test results — hidden test details are NOT included',
    )

    class Meta:
        ordering = ('-submitted_at',)
        verbose_name = 'Code Submission'
        verbose_name_plural = 'Code Submissions'

    def __str__(self):
        return f"{self.student.reg_no} / {self.assessment} / Attempt {self.attempt_number}"


# ---------------------------------------------------------------------------
# MCQSubmission
# ---------------------------------------------------------------------------

class MCQSubmission(models.Model):
    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='mcq_submissions',
    )
    assessment = models.ForeignKey(
        CodeAssessment,
        on_delete=models.CASCADE,
        related_name='mcq_submissions',
    )
    attempt_number = models.PositiveIntegerField(default=1)
    answers = models.JSONField(
        default=dict,
        help_text='{question_id: submitted_answer_text}',
    )
    score = models.FloatField(default=0)
    total_score = models.FloatField(default=0)
    submitted_at = models.DateTimeField(auto_now_add=True)
    result_details = models.JSONField(
        default=list,
        help_text='Per-question result — does NOT expose correct answers',
    )

    class Meta:
        ordering = ('-submitted_at',)
        verbose_name = 'MCQ Submission'
        verbose_name_plural = 'MCQ Submissions'

    def __str__(self):
        return f"{self.student.reg_no} MCQ / {self.assessment} / Attempt {self.attempt_number}"


# ---------------------------------------------------------------------------
# StudentProgress
# ---------------------------------------------------------------------------

class StudentProgress(models.Model):
    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='coder_progress',
    )
    course = models.ForeignKey(
        CodeCourse,
        on_delete=models.CASCADE,
        related_name='student_progress',
    )
    completed_sessions = models.JSONField(
        default=list,
        help_text='List of completed CodeSession IDs',
    )
    in_progress_sessions = models.JSONField(
        default=list,
        help_text='List of in-progress CodeSession IDs',
    )
    overall_score = models.FloatField(default=0)
    total_possible_score = models.FloatField(default=0)
    last_accessed_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('student', 'course')
        verbose_name = 'Student Progress'
        verbose_name_plural = 'Student Progress'

    def __str__(self):
        return f"{self.student.reg_no} → {self.course.code}"

    @property
    def percentage(self):
        if self.total_possible_score == 0:
            return 0
        return round((self.overall_score / self.total_possible_score) * 100, 1)


# ---------------------------------------------------------------------------
# CodeExecution  (execution log — internal use)
# ---------------------------------------------------------------------------

class CodeExecution(models.Model):
    STATUS_CHOICES = [
        ('QUEUED', 'Queued'),
        ('RUNNING', 'Running'),
        ('DONE', 'Done'),
        ('ERROR', 'Error'),
        ('TIMEOUT', 'Timeout'),
    ]

    submission = models.ForeignKey(
        CodeSubmission,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='executions',
    )
    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='coder_executions',
    )
    assessment = models.ForeignKey(
        CodeAssessment,
        on_delete=models.CASCADE,
        related_name='executions',
    )
    is_run_only = models.BooleanField(
        default=False,
        help_text='True = Run (public tests only); False = Submit (full evaluation)',
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='QUEUED')
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    stdout = models.TextField(blank=True, default='')
    stderr = models.TextField(blank=True, default='')
    exit_code = models.IntegerField(null=True, blank=True)
    execution_time_ms = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ('-started_at',)
        verbose_name = 'Code Execution'
        verbose_name_plural = 'Code Executions'

    def __str__(self):
        return f"Exec {self.pk} / {self.student.reg_no}"


# ---------------------------------------------------------------------------
# CodeExecutionSession  (live web application execution session)
# ---------------------------------------------------------------------------

class CodeExecutionSession(models.Model):
    """Tracks a running web application container for a student."""
    STATUS_CHOICES = [
        ('QUEUED', 'Queued'),
        ('BUILDING', 'Building'),
        ('STARTING', 'Starting'),
        ('RUNNING', 'Running'),
        ('FAILED', 'Failed'),
        ('STOPPED', 'Stopped'),
        ('EXPIRED', 'Expired'),
    ]

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='coder_execution_sessions',
    )
    assessment = models.ForeignKey(
        CodeAssessment,
        on_delete=models.CASCADE,
        related_name='execution_sessions',
    )
    container_id = models.CharField(
        max_length=128, blank=True, default='',
        help_text='Docker container ID',
    )
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default='QUEUED',
    )
    internal_port = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Host-side mapped port for this container',
    )
    preview_token = models.CharField(
        max_length=64, unique=True, db_index=True,
        help_text='Secure token for the preview proxy URL',
    )
    build_log = models.TextField(blank=True, default='')
    run_log = models.TextField(blank=True, default='')
    source_snapshot = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(
        help_text='Session auto-expires at this time',
    )
    exit_code = models.IntegerField(null=True, blank=True)
    last_activity = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-started_at',)
        verbose_name = 'Code Execution Session'
        verbose_name_plural = 'Code Execution Sessions'

    def save(self, *args, **kwargs):
        if not self.preview_token:
            self.preview_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"ExecSession {self.pk} / {self.student.reg_no} / {self.status}"
