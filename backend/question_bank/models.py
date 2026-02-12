from django.conf import settings
from django.db import models


class QuestionBankTitle(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='question_bank_titles')
    title = models.CharField(max_length=255)
    exam_type = models.CharField(max_length=64, null=True, blank=True)
    exam_date = models.DateField(null=True, blank=True)
    sections = models.JSONField(null=True, blank=True)
    faculty_identifier = models.CharField(max_length=64, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.title


class QuestionBankQuestion(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='question_bank_questions')

    title = models.CharField(max_length=255, blank=True, null=True)
    title_obj = models.ForeignKey(QuestionBankTitle, on_delete=models.SET_NULL, null=True, blank=True, related_name='questions')

    question_text = models.TextField()
    answer_text = models.TextField(default='')

    options = models.JSONField(null=True, blank=True)
    image_urls = models.JSONField(null=True, blank=True)

    correct_answer = models.CharField(max_length=255, null=True, blank=True)

    btl = models.IntegerField(null=True, blank=True)
    marks = models.IntegerField(null=True, blank=True)

    chapter = models.CharField(max_length=255, null=True, blank=True)
    course_outcomes = models.CharField(max_length=255, null=True, blank=True)
    course_outcomes_numbers = models.CharField(max_length=255, null=True, blank=True)

    type = models.CharField(max_length=32, null=True, blank=True)
    status = models.CharField(max_length=32, default='pending')

    source_file_path = models.CharField(max_length=512, null=True, blank=True)

    excel_type = models.CharField(max_length=64, null=True, blank=True)
    course_code = models.CharField(max_length=64, null=True, blank=True)
    course_name = models.CharField(max_length=255, null=True, blank=True)
    semester = models.CharField(max_length=64, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.id}: {self.question_text[:50]}"
