import uuid
from django.db import models
from django.conf import settings

class SectionRegistryMeta(models.Model):
    """
    DB-backed cache of registered sections for admin display purposes.
    Helps maintain referential integrity of what sections exist.
    """
    section_id = models.CharField(max_length=128, unique=True, help_text="Matches the section_id in the registry")
    display_name = models.CharField(max_length=255)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Section Registry Meta"

    def __str__(self):
        return self.display_name


class BackupSnapshot(models.Model):
    """
    Represents a raw data snapshot for a specific section.
    """
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    section_id = models.CharField(
        max_length=128, 
        help_text="References registry section_id"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True
    )
    file_reference = models.CharField(max_length=512, blank=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='pending')
    schema_version = models.CharField(
        max_length=32, 
        default='1.0',
        help_text="For future compatibility checks"
    )
    notes = models.TextField(blank=True, null=True)
    task_id = models.CharField(
        max_length=255, blank=True, null=True,
        help_text="Celery task ID tracking this operation"
    )

    def __str__(self):
        return f"Snapshot {self.id} for {self.section_id}"


class ConfigExport(models.Model):
    """
    Represents an export of configuration/settings data.
    """
    EXPORT_TYPE_CHOICES = (
        ('manual', 'Manual'),
        ('semester_archive', 'Semester Archive'),
    )
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    section_id = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True
    )
    file_reference = models.CharField(max_length=512, blank=True)
    export_type = models.CharField(max_length=32, choices=EXPORT_TYPE_CHOICES, default='manual')
    
    academic_year = models.CharField(max_length=32, blank=True, null=True, help_text="Only set when semester_archive")
    semester_label = models.CharField(max_length=32, blank=True, null=True)
    
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='pending')
    schema_version = models.CharField(max_length=32, default='1.0')
    task_id = models.CharField(
        max_length=255, blank=True, null=True,
        help_text="Celery task ID tracking this operation"
    )

    def __str__(self):
        return f"Config Export {self.id} for {self.section_id}"


class ActivityLog(models.Model):
    """
    Audit trail for backup, restore, and config import/export activities.
    """
    ACTION_TYPE_CHOICES = (
        ('backup', 'Backup Created'),
        ('restore', 'Backup Restored'),
        ('config_export', 'Config Exported'),
        ('config_import', 'Config Imported'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    action_type = models.CharField(max_length=32, choices=ACTION_TYPE_CHOICES)
    section_id = models.CharField(max_length=128)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    success = models.BooleanField(default=True)
    detail = models.TextField(blank=True, help_text="Error messages or summary")
    
    related_snapshot = models.ForeignKey(
        BackupSnapshot, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='activity_logs'
    )
    related_export = models.ForeignKey(
        ConfigExport, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='activity_logs'
    )

    def __str__(self):
        return f"{self.action_type} on {self.section_id} at {self.timestamp}"
