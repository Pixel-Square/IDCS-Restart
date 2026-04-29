import os
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum


def _material_upload_path(instance, filename: str) -> str:
    ext = os.path.splitext(filename or '')[1]
    return f"lms/study_materials/{uuid.uuid4().hex}{ext}"


class StaffStorageQuota(models.Model):
    DEFAULT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB

    staff = models.OneToOneField(
        'academics.StaffProfile',
        on_delete=models.CASCADE,
        related_name='lms_quota',
    )
    quota_bytes = models.BigIntegerField(default=DEFAULT_QUOTA_BYTES)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_lms_quotas',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Staff LMS Quota'
        verbose_name_plural = 'Staff LMS Quotas'

    def __str__(self):
        return f"{self.staff.staff_id} quota={self.quota_bytes}"

    @property
    def used_bytes(self) -> int:
        from lms.models import StudyMaterial

        total = StudyMaterial.objects.filter(
            uploaded_by=self.staff,
            material_type=StudyMaterial.TYPE_FILE,
        ).aggregate(total=Sum('file_size_bytes')).get('total')
        return int(total or 0)


class StudyMaterial(models.Model):
    TYPE_FILE = 'FILE'
    TYPE_LINK = 'LINK'
    TYPE_CHOICES = (
        (TYPE_FILE, 'File'),
        (TYPE_LINK, 'Link'),
    )

    uploaded_by = models.ForeignKey(
        'academics.StaffProfile',
        on_delete=models.CASCADE,
        related_name='study_materials',
    )
    course = models.ForeignKey(
        'academics.Course',
        on_delete=models.CASCADE,
        related_name='study_materials',
    )
    teaching_assignment = models.ForeignKey(
        'academics.TeachingAssignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_materials',
    )
    curriculum_row = models.ForeignKey(
        'curriculum.CurriculumDepartment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_materials',
    )
    elective_subject = models.ForeignKey(
        'curriculum.ElectiveSubject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='study_materials',
    )
    title = models.CharField(max_length=255)
    co_title = models.CharField(max_length=255, blank=True, default='')
    sub_topic = models.CharField(max_length=255, blank=True, default='ALL')
    description = models.TextField(blank=True)
    material_type = models.CharField(max_length=8, choices=TYPE_CHOICES)
    file = models.FileField(upload_to=_material_upload_path, null=True, blank=True)
    original_file_name = models.CharField(max_length=255, blank=True, default='')
    file_size_bytes = models.BigIntegerField(default=0)
    external_url = models.URLField(blank=True)
    shared_courses = models.ManyToManyField(
        'academics.Course',
        blank=True,
        related_name='shared_study_materials',
    )
    shared_teaching_assignments = models.ManyToManyField(
        'academics.TeachingAssignment',
        blank=True,
        related_name='shared_study_materials',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = [
            models.Index(fields=['course', '-created_at']),
            models.Index(fields=['uploaded_by', '-created_at']),
        ]

    def __str__(self):
        return f"{self.title} ({self.course_id})"

    def clean(self):
        super().clean()
        if self.material_type == self.TYPE_FILE:
            if not self.file:
                raise ValidationError({'file': 'File is required for file-type material.'})
            self.external_url = ''
        if self.material_type == self.TYPE_LINK:
            if not self.external_url:
                raise ValidationError({'external_url': 'URL is required for link-type material.'})
            self.file = None
            self.file_size_bytes = 0
        if self.teaching_assignment and self.uploaded_by_id:
            if self.teaching_assignment.staff_id != self.uploaded_by_id:
                raise ValidationError('Teaching assignment must belong to the uploading staff.')

    def save(self, *args, **kwargs):
        if self.material_type == self.TYPE_FILE and self.file:
            try:
                self.file_size_bytes = int(getattr(self.file, 'size', self.file_size_bytes or 0) or 0)
            except Exception:
                self.file_size_bytes = int(self.file_size_bytes or 0)
            if not self.original_file_name:
                try:
                    self.original_file_name = os.path.basename(str(getattr(self.file, 'name', '') or '')).strip()
                except Exception:
                    self.original_file_name = ''
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        stored_file = self.file
        result = super().delete(*args, **kwargs)
        try:
            if stored_file:
                stored_file.delete(save=False)
        except Exception:
            pass
        return result


class StudyMaterialDownloadLog(models.Model):
    material = models.ForeignKey(
        StudyMaterial,
        on_delete=models.CASCADE,
        related_name='download_logs',
    )
    downloaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='lms_download_logs',
    )
    downloaded_by_staff = models.ForeignKey(
        'academics.StaffProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='lms_download_logs',
    )
    downloaded_by_student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='lms_download_logs',
    )
    client_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    downloaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-downloaded_at',)
        indexes = [
            models.Index(fields=['material', '-downloaded_at']),
            models.Index(fields=['downloaded_by', '-downloaded_at']),
        ]

    def __str__(self):
        return f"material={self.material_id} by={self.downloaded_by_id} at={self.downloaded_at}"
