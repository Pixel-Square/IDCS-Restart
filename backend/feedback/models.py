from django.db import models
from django.conf import settings
from academics.models import Department
import json


class FeedbackForm(models.Model):
    """Feedback form created by HOD for collecting feedback from staff/students."""
    
    TARGET_TYPE_CHOICES = (
        ('STAFF', 'Staff'),
        ('STUDENT', 'Student'),
    )
    
    TYPE_CHOICES = (
        ('SUBJECT_FEEDBACK', 'Subject Feedback'),
        ('OPEN_FEEDBACK', 'Open Feedback'),
    )
    
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('ACTIVE', 'Active'),
        ('CLOSED', 'Closed'),
    )
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_feedback_forms',
        help_text='User (HOD) who created this form'
    )
    target_type = models.CharField(
        max_length=10,
        choices=TARGET_TYPE_CHOICES,
        help_text='Target audience: staff or student'
    )
    type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        help_text='Type of feedback: subject-specific or open'
    )
    is_subject_based = models.BooleanField(
        default=False,
        help_text='True for subject-based feedback, False for open feedback'
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='feedback_forms',
        help_text='Department this feedback form belongs to'
    )
    # Student-specific fields (nullable for staff feedback)
    # Legacy single-value fields (kept for backward compatibility)
    year = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text='Year (1, 2, 3, or 4) for student feedback (legacy single value)'
    )
    semester = models.ForeignKey(
        'academics.Semester',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback_forms',
        help_text='Semester for student feedback (legacy single value)'
    )
    section = models.ForeignKey(
        'academics.Section',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback_forms',
        help_text='Section for student feedback (legacy single value)'
    )
    regulation = models.ForeignKey(
        'curriculum.Regulation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback_forms',
        help_text='Regulation for student feedback'
    )
    
    # Multi-class selection fields (JSON arrays)
    years = models.JSONField(
        default=list,
        blank=True,
        help_text='List of years (e.g., [1, 2, 3]) for multi-class feedback'
    )
    semesters = models.JSONField(
        default=list,
        blank=True,
        help_text='List of semester IDs for multi-class feedback'
    )
    sections = models.JSONField(
        default=list,
        blank=True,
        help_text='List of section IDs for multi-class feedback'
    )
    
    all_classes = models.BooleanField(
        default=False,
        help_text='True if feedback targets all classes/years in department'
    )
    active = models.BooleanField(
        default=True,
        help_text='If False, form is hidden from students/staff but data is preserved'
    )

    # Legacy DB column (exists in some deployments as NOT NULL with no DB default).
    # Keep it in the model so inserts always provide a value.
    COMMENT_MODE_CHOICES = (
        ('question_wise', 'Question-wise'),
        ('common', 'Common'),
    )
    comment_mode = models.CharField(
        max_length=20,
        choices=COMMENT_MODE_CHOICES,
        default='question_wise',
        help_text='Legacy field: how comments are collected. Kept for DB compatibility.'
    )

    common_comment_enabled = models.BooleanField(
        default=False,
        help_text='If True, collect one common comment per subject (or form) instead of per-question comments.'
    )
    allow_hod_view = models.BooleanField(
        default=False,
        help_text='If True, department HOD can view responses for this form (filtered by their department)'
    )
    anonymous = models.BooleanField(
        default=False,
        help_text='If True, student names and register numbers will be hidden from responses and exports'
    )
    form_name = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text='Custom name/title for the feedback form'
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='DRAFT',
        help_text='Status of the feedback form'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'feedback_forms'
        verbose_name = 'Feedback Form'
        verbose_name_plural = 'Feedback Forms'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Feedback Form #{self.id} - {self.get_type_display()} ({self.department.code})"


class FeedbackQuestion(models.Model):
    """Questions within a feedback form."""

    QUESTION_TYPE_CHOICES = (
        ('rating', 'Rating'),
        ('text', 'Text'),
        ('radio', 'Radio + Comment'),
        ('rating_radio_comment', 'Rating + Radio + Comment'),
    )
    
    ANSWER_TYPE_CHOICES = (
        ('STAR', 'Star Rating'),
        ('TEXT', 'Text Response'),
        ('BOTH', 'Star Rating and Text'),  # New option for backward compatibility
    )
    
    feedback_form = models.ForeignKey(
        FeedbackForm,
        on_delete=models.CASCADE,
        related_name='questions',
        help_text='Feedback form this question belongs to'
    )
    question = models.TextField(help_text='The question text')
    
    # Legacy field - kept for backward compatibility
    answer_type = models.CharField(
        max_length=10,
        choices=ANSWER_TYPE_CHOICES,
        default='BOTH',
        help_text='Type of answer: star rating, text, or both (legacy field)'
    )
    
    # New flexible fields
    question_type = models.CharField(
        max_length=50,
        choices=QUESTION_TYPE_CHOICES,
        default='rating',
        help_text='Question rendering/validation type. Defaults to rating for backward compatibility.'
    )
    allow_rating = models.BooleanField(
        default=True,
        help_text='Allow star rating (1-5) for this question'
    )
    allow_comment = models.BooleanField(
        default=True,
        help_text='Allow text comment for this question'
    )

    # Legacy/compat field (exists in DB as NOT NULL, no default).
    # Keep it aligned with allow_comment to prevent insert failures.
    comment_enabled = models.BooleanField(
        default=True,
        help_text='Legacy field. Mirrors allow_comment.'
    )

    # Legacy DB column (exists in some deployments as NOT NULL with no DB default).
    # Default must be set at the ORM layer to prevent NULL inserts.
    is_mandatory = models.BooleanField(
        default=False,
        help_text='Legacy field. Whether this question is mandatory.'
    )
    
    order = models.PositiveIntegerField(
        default=0,
        help_text='Display order of the question'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'feedback_questions'
        verbose_name = 'Feedback Question'
        verbose_name_plural = 'Feedback Questions'
        ordering = ['feedback_form', 'order']
    
    def __str__(self):
        return f"Q{self.order}: {self.question[:50]}..."


class FeedbackQuestionOption(models.Model):
    """Radio options for own-type questions."""

    question = models.ForeignKey(
        FeedbackQuestion,
        on_delete=models.CASCADE,
        related_name='options',
        help_text='Question this option belongs to'
    )
    option_text = models.CharField(max_length=255, help_text='Option label')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'feedback_question_options'
        verbose_name = 'Feedback Question Option'
        verbose_name_plural = 'Feedback Question Options'
        ordering = ['id']

    def __str__(self):
        return f"Option({self.question_id}): {self.option_text[:50]}"


class FeedbackResponse(models.Model):
    """Individual responses/answers to feedback questions."""
    
    feedback_form = models.ForeignKey(
        FeedbackForm,
        on_delete=models.CASCADE,
        related_name='responses',
        help_text='Feedback form this response belongs to'
    )
    question = models.ForeignKey(
        FeedbackQuestion,
        on_delete=models.CASCADE,
        related_name='responses',
        help_text='Question being answered'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='feedback_responses',
        help_text='User who submitted this response'
    )
    
    # Subject feedback fields (CAMU-style workflow)
    teaching_assignment = models.ForeignKey(
        'academics.TeachingAssignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback_responses',
        help_text='Teaching assignment this feedback relates to (for subject feedback). Subject and staff can be accessed via teaching_assignment.subject and teaching_assignment.staff'
    )
    
    # Subject fields - store subject directly for PE/OE/EE support
    # Even when teaching_assignment is NULL, subject can be stored via elective_subject
    subject = models.ForeignKey(
        'academics.Subject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback_responses',
        help_text='Subject being rated (can be from teaching_assignment.subject or elective)'
    )
    
    elective_subject = models.ForeignKey(
        'curriculum.ElectiveSubject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback_responses_elective',
        help_text='Elective subject being rated (for PE/OE/EE subjects)'
    )
    
    answer_star = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text='Star rating (1-5), used when answer_type is STAR'
    )
    answer_text = models.TextField(
        blank=True,
        help_text='Text response, used when answer_type is TEXT'
    )

    common_comment = models.TextField(
        null=True,
        blank=True,
        help_text='Subject-level/common comment (stored per response row for compatibility).'
    )

    selected_option_text = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_column='selected_option_text',
        help_text='Selected radio option text (for radio / rating_radio_comment questions)'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'feedback_responses'
        verbose_name = 'Feedback Response'
        verbose_name_plural = 'Feedback Responses'
        ordering = ['-created_at']
        # For subject feedback: unique per form, question, user, AND teaching assignment
        # For open feedback: unique per form, question, user (teaching_assignment is NULL)
        unique_together = ('feedback_form', 'question', 'user', 'teaching_assignment')
    
    def __str__(self):
        if self.teaching_assignment:
            return f"Response by {self.user.username} to Q{self.question.id} for {self.teaching_assignment}"
        return f"Response by {self.user.username} to Q{self.question.id}"


class FeedbackFormSubmission(models.Model):
    """Tracks per-user completion status for a feedback form."""

    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('SUBMITTED', 'Submitted'),
    )

    feedback_form = models.ForeignKey(
        FeedbackForm,
        on_delete=models.CASCADE,
        related_name='submission_statuses',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='feedback_form_submissions',
    )
    submission_status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='PENDING',
    )
    total_subjects = models.PositiveIntegerField(default=0)
    responded_subjects = models.PositiveIntegerField(default=0)
    submitted_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'feedback_form_submissions'
        unique_together = ('feedback_form', 'user')

    def __str__(self):
        return f"Form #{self.feedback_form_id} / {self.user.username} - {self.submission_status}"
