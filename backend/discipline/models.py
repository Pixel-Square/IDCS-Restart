from django.db import models
from django.conf import settings


class DisciplineApprovalFlowConfig(models.Model):
    """
    Approval flow configuration for discipline committee incident processing.
    Defines the ordered list of roles:
    Start: Student -> Intermediate Role(s) (e.g. Mentor, HOD, etc.) -> Final Role (e.g. Principal / DisciplineCommitteeAdmin).
    """
    name = models.CharField(max_length=128, default='Default Discipline Flow')
    # List of role names in order: ['DISCIPLINE_COMMITTEE', 'HOD', 'PRINCIPAL']
    roles = models.JSONField(
        default=list,
        help_text="Ordered array of role strings through which the incident travels."
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Discipline Approval Flow Config'
        verbose_name_plural = 'Discipline Approval Flow Configs'

    def __str__(self):
        return f"{self.name} ({' -> '.join(self.roles)})"


class DisciplineCategory(models.Model):
    """Discipline violation category configuration with semester mappings and severity."""
    SEVERITY_CHOICES = (
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    )

    title = models.CharField(max_length=255, help_text="Category title / violation name")
    description = models.TextField(blank=True, default='', help_text="Guidance, protocol, or details")
    semesters = models.JSONField(
        default=list,
        help_text="Applicable semesters e.g. ['SEM 1', 'SEM 2', 'SEM 3', ...]"
    )
    severity = models.CharField(max_length=16, choices=SEVERITY_CHOICES, default='MEDIUM')
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Discipline Category'
        verbose_name_plural = 'Discipline Categories'
        ordering = ('-created_at',)

    def __str__(self):
        return f"{self.title} ({self.severity})"


class DisciplineIncidentLog(models.Model):
    """Incident log recorded by discipline committee members for a specific student."""
    STATUS_CHOICES = (
        ('REPORTED', 'Reported'),
        ('PENDING_FINE_PAYMENT', 'Pending Fine Payment'),
        ('RECEIPT_UPLOADED', 'Receipt Uploaded'),
        ('IN_APPROVAL', 'In Approval'),
        ('ACTION_TAKEN', 'Action Taken'),
        ('RESOLVED', 'Resolved'),
        ('DISMISSED', 'Dismissed'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='discipline_incidents',
        null=True, blank=True
    )
    # Cached student details in case of profile changes/archival
    student_name = models.CharField(max_length=255, blank=True, default='')
    reg_no = models.CharField(max_length=64, db_index=True)
    username = models.CharField(max_length=150, blank=True, default='')
    department_name = models.CharField(max_length=150, blank=True, default='')
    section_name = models.CharField(max_length=32, blank=True, default='')
    batch_name = models.CharField(max_length=64, blank=True, default='')

    category = models.ForeignKey(
        DisciplineCategory,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='incident_logs'
    )
    category_title = models.CharField(max_length=255, blank=True, default='')
    severity = models.CharField(max_length=16, choices=DisciplineCategory.SEVERITY_CHOICES, default='MEDIUM')
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='REPORTED', db_index=True)

    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reported_discipline_incidents'
    )
    reported_by_name = models.CharField(max_length=255, blank=True, default='')

    remarks = models.TextField(blank=True, default='', help_text="Incident notes and context")
    action_notes = models.TextField(blank=True, default='', help_text="Counseling, parent notification, or resolution notes")

    # ── Approval Flow & Fine Fields ──
    flow_roles = models.JSONField(default=list, help_text="Snapshot of the roles path for this incident")
    current_step_index = models.PositiveIntegerField(default=0, help_text="Index in flow_roles where the request currently is")
    current_role = models.CharField(max_length=100, blank=True, default='', help_text="Current approver role waiting for action")

    has_fine = models.BooleanField(default=False, help_text="True if a fine has been fixed for this incident")
    fine_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, help_text="Fine amount in Rupees")
    fine_fixed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='fine_fixed_discipline_incidents'
    )
    fine_fixed_at = models.DateTimeField(null=True, blank=True)

    # Student Uploaded Proof / Receipt Document
    receipt_document = models.FileField(upload_to='discipline/receipts/', null=True, blank=True)
    receipt_document_url = models.CharField(max_length=500, blank=True, default='')
    receipt_notes = models.TextField(blank=True, default='')
    receipt_uploaded_at = models.DateTimeField(null=True, blank=True)

    incident_date = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Discipline Incident Log'
        verbose_name_plural = 'Discipline Incident Logs'
        ordering = ('-incident_date',)

    def __str__(self):
        return f"{self.reg_no} - {self.category_title or (self.category.title if self.category else 'Incident')} ({self.status})"


class DisciplineIncidentAction(models.Model):
    """Audit log of each action in the approval flow (Fine fixed, Forwarded, Receipt uploaded, Approved)."""
    ACTION_CHOICES = (
        ('REPORTED', 'Incident Reported'),
        ('FINE_FIXED', 'Fine Fixed'),
        ('FINE_MODIFIED', 'Fine Modified'),
        ('RECEIPT_UPLOADED', 'Receipt Uploaded'),
        ('FORWARDED', 'Forwarded to Next Approver'),
        ('APPROVED', 'Approved & Completed'),
        ('REJECTED', 'Rejected'),
    )

    incident = models.ForeignKey(DisciplineIncidentLog, on_delete=models.CASCADE, related_name='actions')
    action_type = models.CharField(max_length=32, choices=ACTION_CHOICES)
    role_performed = models.CharField(max_length=100, blank=True, default='')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    user_name = models.CharField(max_length=255, blank=True, default='')
    comments = models.TextField(blank=True, default='')
    fine_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    document_url = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('created_at',)

    def __str__(self):
        return f"{self.incident.reg_no} - {self.action_type} by {self.user_name} ({self.role_performed})"

