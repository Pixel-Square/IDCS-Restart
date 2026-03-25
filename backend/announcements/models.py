from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
import uuid


class Announcement(models.Model):
    TARGET_ALL = 'ALL'
    TARGET_DEPARTMENT = 'DEPARTMENT'
    TARGET_CLASS = 'CLASS'
    TARGET_ROLE = 'ROLE'

    TARGET_TYPE_CHOICES = (
        (TARGET_ALL, 'All Users'),
        (TARGET_DEPARTMENT, 'Department'),
        (TARGET_CLASS, 'Class'),
        (TARGET_ROLE, 'Role'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    content = models.TextField()
    attachment = models.FileField(upload_to='announcements/', null=True, blank=True)
    tag = models.CharField(max_length=64, null=True, blank=True)
    expiry_date = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='announcements_created',
    )
    target_type = models.CharField(max_length=16, choices=TARGET_TYPE_CHOICES)
    target_roles = models.JSONField(default=list, blank=True)
    department = models.ForeignKey(
        'academics.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='announcements',
    )
    target_departments = models.ManyToManyField(
        'academics.Department',
        related_name='department_announcements',
        blank=True,
    )
    target_class = models.ForeignKey(
        'academics.Section',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='announcements',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['target_type', '-created_at']),
            models.Index(fields=['department', '-created_at']),
            models.Index(fields=['target_class', '-created_at']),
            models.Index(fields=['is_active', '-created_at']),
            models.Index(fields=['expiry_date']),
        ]

    def clean(self):
        roles = self.target_roles or []
        if roles and not isinstance(roles, list):
            raise ValidationError({'target_roles': 'target_roles must be a list of role names.'})
        if self.target_type == self.TARGET_DEPARTMENT and self.pk:
            has_m2m_departments = self.target_departments.exists()
            if not self.department_id and not has_m2m_departments:
                raise ValidationError({'target_departments': 'At least one department is required when target_type is DEPARTMENT.'})
        if self.target_type == self.TARGET_CLASS and not self.target_class_id:
            raise ValidationError({'target_class': 'Class is required when target_type is CLASS.'})
        if self.target_type == self.TARGET_ROLE and not roles:
            raise ValidationError({'target_roles': 'At least one role is required when target_type is ROLE.'})

    def save(self, *args, **kwargs):
        if isinstance(self.target_roles, list):
            self.target_roles = [str(r or '').strip().upper() for r in self.target_roles if str(r or '').strip()]
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} ({self.target_type})"

    @property
    def is_expired(self) -> bool:
        return bool(self.expiry_date and self.expiry_date < timezone.now())


class AnnouncementReadStatus(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='announcement_read_statuses',
    )
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name='read_statuses',
    )
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ['user', 'announcement']
        indexes = [
            models.Index(fields=['user', 'is_read']),
            models.Index(fields=['announcement', 'user']),
        ]

    def __str__(self):
        state = 'read' if self.is_read else 'unread'
        return f"{self.user.username} {state} {self.announcement.title}"
