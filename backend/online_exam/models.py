from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import datetime, time


class OnlineExam(models.Model):
    START_MODE_CHOICES = (
        ('MANUAL', 'Manual Start'),
        ('AUTO', 'Auto Start'),
    )

    STATUS_CHOICES = (
        ('SCHEDULED', 'Scheduled'),
        ('RUNNING', 'Running'),
        ('ENDED', 'Ended'),
    )

    title = models.CharField(max_length=255)
    exam_date = models.DateField()
    start_mode = models.CharField(max_length=16, choices=START_MODE_CHOICES, default='MANUAL')
    auto_start_time = models.TimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='SCHEDULED')

    actual_start_time = models.DateTimeField(null=True, blank=True)
    actual_end_time = models.DateTimeField(null=True, blank=True)

    course_code = models.CharField(max_length=64)
    course_name = models.CharField(max_length=255)

    sections = models.ManyToManyField('academics.Section', related_name='online_exams', blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_online_exams'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    is_results_published = models.BooleanField(default=False)
    results_published_at = models.DateTimeField(null=True, blank=True)

    cooldown_seconds = models.PositiveIntegerField(default=30, help_text="Cooldown seconds timer for proctoring warning")
    max_violations = models.PositiveIntegerField(default=3, help_text="Maximum allowed violations before student is kicked")

    class Meta:
        ordering = ['-exam_date', '-created_at']

    def __str__(self):
        return f"{self.title} ({self.course_code}) - {self.exam_date}"

    def check_and_update_auto_status(self):
        """Auto-start scheduled exam if start_mode is AUTO and start time has arrived."""
        if self.status == 'SCHEDULED' and self.start_mode == 'AUTO' and self.auto_start_time:
            now = timezone.localtime(timezone.now())
            exam_dt = datetime.combine(self.exam_date, self.auto_start_time)
            # Make exam_dt aware in current timezone
            exam_dt = timezone.make_aware(exam_dt, timezone.get_current_timezone())
            if now >= exam_dt:
                self.status = 'RUNNING'
                self.actual_start_time = exam_dt
                self.save(update_fields=['status', 'actual_start_time', 'updated_at'])


class OnlineExamIncharge(models.Model):
    exam = models.ForeignKey(OnlineExam, on_delete=models.CASCADE, related_name='incharges')
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incharge_exams'
    )
    faculty_id = models.CharField(max_length=64, blank=True)
    staff_name = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=128, default='Exam Incharge')

    @property
    def staff_id_display(self):
        return self.faculty_id

    def __str__(self):
        return f"{self.staff_name} - {self.role} for {self.exam.title}"


class OnlineExamQuestion(models.Model):
    exam = models.ForeignKey(OnlineExam, on_delete=models.CASCADE, related_name='questions')
    question_number = models.PositiveIntegerField(default=1)
    question_text = models.TextField()
    option_a = models.TextField()
    option_b = models.TextField()
    option_c = models.TextField()
    option_d = models.TextField()
    correct_answer = models.CharField(max_length=32, help_text="A, B, C, or D")
    co = models.PositiveIntegerField(default=1, help_text="Course Outcome whole number (e.g. 1, 2, 3)")
    marks = models.PositiveIntegerField(default=1, help_text="Max marks whole number (e.g. 1, 2)")

    class Meta:
        ordering = ['question_number']

    def __str__(self):
        return f"Q{self.question_number}: {self.question_text[:40]}"


class OnlineExamSubmission(models.Model):
    STATUS_CHOICES = (
        ('IN_PROGRESS', 'In Progress'),
        ('SUBMITTED', 'Submitted'),
        ('KICKED', 'Kicked'),
    )

    exam = models.ForeignKey(OnlineExam, on_delete=models.CASCADE, related_name='submissions')
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='online_exam_submissions'
    )
    student_reg_no = models.CharField(max_length=64, blank=True)
    student_name = models.CharField(max_length=255, blank=True)
    answers = models.JSONField(default=dict, blank=True)  # { "1": "A", "2": "C" }
    score = models.IntegerField(default=0)
    total_questions = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='SUBMITTED')
    started_at = models.DateTimeField(default=timezone.now)
    submitted_at = models.DateTimeField(null=True, blank=True)

    violations_count = models.PositiveIntegerField(default=0)
    kicked_reason = models.CharField(max_length=255, blank=True)
    kicked_at = models.DateTimeField(null=True, blank=True)
    is_retest_allowed = models.BooleanField(default=False)
    retest_granted_at = models.DateTimeField(null=True, blank=True)
    retest_granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='retests_granted'
    )

    class Meta:
        unique_together = ('exam', 'student')

    def __str__(self):
        return f"{self.student_reg_no} - {self.exam.title} ({self.score}/{self.total_questions})"


class OnlineExamQuestionBank(models.Model):
    title = models.CharField(max_length=255)
    course_code = models.CharField(max_length=64, blank=True)
    course_name = models.CharField(max_length=255, blank=True)
    questions_count = models.PositiveIntegerField(default=0)
    questions_data = models.JSONField(default=list)  # list of question dicts
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_online_exam_question_banks'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.questions_count} questions)"

