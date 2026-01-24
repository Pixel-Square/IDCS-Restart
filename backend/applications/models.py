from django.conf import settings
from django.db import models


class ApplicationType(models.Model):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Application Type'
        verbose_name_plural = 'Application Types'

    def __str__(self):
        return f"{self.name} ({self.code})"


class ApplicationField(models.Model):
    class FieldType(models.TextChoices):
        TEXT = 'TEXT', 'Text'
        DATE = 'DATE', 'Date'
        BOOLEAN = 'BOOLEAN', 'Boolean'
        FILE = 'FILE', 'File'
        NUMBER = 'NUMBER', 'Number'
        SELECT = 'SELECT', 'Select'

    application_type = models.ForeignKey(
        ApplicationType,
        on_delete=models.CASCADE,
        related_name='fields'
    )
    field_key = models.CharField(max_length=100)
    label = models.CharField(max_length=200)
    field_type = models.CharField(max_length=20, choices=FieldType.choices)
    is_required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = (('application_type', 'field_key'),)
        ordering = ('application_type', 'order', 'field_key')

    def __str__(self):
        return f"{self.application_type.code}: {self.label} ({self.field_key})"


class Application(models.Model):
    class ApplicationState(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        SUBMITTED = 'SUBMITTED', 'Submitted'
        IN_REVIEW = 'IN_REVIEW', 'In Review'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'
        CANCELLED = 'CANCELLED', 'Cancelled'

    application_type = models.ForeignKey(
        ApplicationType,
        on_delete=models.PROTECT,
        related_name='applications'
    )
    applicant_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='applications'
    )
    student_profile = models.ForeignKey(
        'academics.StudentProfile',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='applications'
    )
    staff_profile = models.ForeignKey(
        'academics.StaffProfile',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='applications'
    )
    # Canonical application state. Use the application state service to transition.
    current_state = models.CharField(max_length=20, choices=ApplicationState.choices, default=ApplicationState.DRAFT, db_index=True)
    # Legacy `status` retained for backwards compatibility (kept in sync by services).
    status = models.CharField(max_length=20, choices=ApplicationState.choices, default=ApplicationState.DRAFT)
    current_step = models.ForeignKey(
        'ApprovalStep',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='current_applications'
    )
    form_version = models.ForeignKey(
        'ApplicationFormVersion',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='applications'
    )
    final_decision_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self):
        return f"{self.application_type.code} by {self.applicant_user} ({self.status})"


class ApplicationData(models.Model):
    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name='data'
    )
    field = models.ForeignKey(
        ApplicationField,
        on_delete=models.PROTECT,
        related_name='values'
    )
    # store raw text or JSON serialized strings depending on field_type
    value = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = (('application', 'field'),)
        indexes = [models.Index(fields=['application', 'field'])]

    def __str__(self):
        return f"{self.application} - {self.field.field_key}"


class ApprovalFlow(models.Model):
    application_type = models.ForeignKey(
        ApplicationType,
        on_delete=models.CASCADE,
        related_name='approval_flows'
    )
    department = models.ForeignKey(
        'academics.Department',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='approval_flows'
    )
    is_active = models.BooleanField(default=True)
    # roles that are allowed to override this flow for this application_type/department
    override_roles = models.ManyToManyField('accounts.Role', blank=True, related_name='override_flows')

    class Meta:
        unique_together = (('application_type', 'department'),)

    def __str__(self):
        dept = self.department.name if self.department else 'Global'
        return f"Flow: {self.application_type.code} ({dept})"


class ApprovalStep(models.Model):
    approval_flow = models.ForeignKey(
        ApprovalFlow,
        on_delete=models.CASCADE,
        related_name='steps'
    )
    order = models.PositiveIntegerField()
    role = models.ForeignKey(
        'accounts.Role',
        on_delete=models.PROTECT,
        related_name='approval_steps'
    )
    sla_hours = models.PositiveIntegerField(null=True, blank=True)
    escalate_to_role = models.ForeignKey(
        'accounts.Role',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='escalation_steps'
    )
    can_override = models.BooleanField(default=False)
    auto_skip_if_unavailable = models.BooleanField(default=False)

    class Meta:
        ordering = ('approval_flow', 'order')
        unique_together = (('approval_flow', 'order'),)

    def __str__(self):
        return f"{self.approval_flow} - Step {self.order} ({self.role.name})"


class ApprovalAction(models.Model):
    class Action(models.TextChoices):
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'
        SKIPPED = 'SKIPPED', 'Skipped'

    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name='actions'
    )
    step = models.ForeignKey(
        ApprovalStep,
        on_delete=models.SET_NULL,
        null=True,
        related_name='actions'
    )
    acted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='approval_actions'
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    remarks = models.TextField(blank=True)
    acted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-acted_at',)

    def __str__(self):
        return f"{self.application} - {self.action} by {self.acted_by}"


# Role-level permissions for application-level capabilities (configurable, not hardcoded)
class RoleApplicationPermission(models.Model):
    role = models.ForeignKey('accounts.Role', on_delete=models.CASCADE, related_name='application_permissions')
    application_type = models.ForeignKey(ApplicationType, on_delete=models.CASCADE, related_name='role_permissions')
    can_edit_all = models.BooleanField(default=False)
    can_override_flow = models.BooleanField(default=False)

    class Meta:
        unique_together = (('role', 'application_type'),)

    def __str__(self):
        return f"{self.role.name} perms for {self.application_type.code}"


class ApplicationFormVersion(models.Model):
    application_type = models.ForeignKey(
        ApplicationType,
        on_delete=models.CASCADE,
        related_name='form_versions'
    )
    version = models.PositiveIntegerField()
    schema = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (('application_type', 'version'),)
        ordering = ('-created_at',)

    def __str__(self):
        return f"{self.application_type.code} v{self.version} {'(active)' if self.is_active else ''}"


class ApplicationAttachment(models.Model):
    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name='attachments'
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='uploaded_attachments'
    )
    file = models.FileField(upload_to='applications/attachments/%Y/%m/%d/')
    label = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ('-uploaded_at',)

    def __str__(self):
        return f"Attachment {self.id} for {self.application}"
