from django.db import models
from django.conf import settings
from django.utils import timezone
import uuid


class Announcement(models.Model):
    """Announcement created by HOD or IQAC to be sent to specific courses/classes."""
    
    SOURCE_CHOICES = (
        ('hod', 'HOD'),
        ('iqac', 'IQAC'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    content = models.TextField()
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='announcements_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Course/Class targeting
    courses = models.ManyToManyField(
        'academics.Course',
        through='AnnouncementCourse',
        related_name='announcements',
        blank=True
    )
    
    # Optional: publish schedule
    is_published = models.BooleanField(default=True)
    published_at = models.DateTimeField(null=True, blank=True)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['source', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.title} by {self.get_source_display()}"
    
    def save(self, *args, **kwargs):
        if self.is_published and not self.published_at:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)


class AnnouncementCourse(models.Model):
    """Through model to track which courses receive an announcement."""
    
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name='course_targets'
    )
    course = models.ForeignKey(
        'academics.Course',
        on_delete=models.CASCADE,
        related_name='announcement_targets'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['announcement', 'course']
        indexes = [
            models.Index(fields=['announcement', 'course']),
        ]
    
    def __str__(self):
        return f"{self.announcement.title} -> {self.course.code}"


class AnnouncementRead(models.Model):
    """Track which users have read which announcements."""
    
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name='reads'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='announcement_reads'
    )
    read_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['announcement', 'user']
        indexes = [
            models.Index(fields=['announcement', 'user']),
            models.Index(fields=['user', '-read_at']),
        ]
    
    def __str__(self):
        return f"{self.user.username} read {self.announcement.title}"
