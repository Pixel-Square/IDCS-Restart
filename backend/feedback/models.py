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
    allow_rating = models.BooleanField(
        default=True,
        help_text='Allow star rating (1-5) for this question'
    )
    allow_comment = models.BooleanField(
        default=True,
        help_text='Allow text comment for this question'
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
    
    answer_star = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text='Star rating (1-5), used when answer_type is STAR'
    )
    answer_text = models.TextField(
        blank=True,
        help_text='Text response, used when answer_type is TEXT'
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
