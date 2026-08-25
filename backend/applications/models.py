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
        TIME = 'TIME', 'Time'
        DATE_IN_OUT = 'DATE IN OUT', 'Date In Out'
        DATE_OUT_IN = 'DATE OUT IN', 'Date Out In'
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
    # Gatepass exit scan tracking — set when Security scans the student out
    gatepass_scanned_at = models.DateTimeField(null=True, blank=True)
    gatepass_scanned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='gatepass_scans',
    )

    # Gatepass entry scan tracking — set when Security scans the student back in
    gatepass_in_scanned_at = models.DateTimeField(null=True, blank=True)
    gatepass_in_scanned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='gatepass_in_scans',
    )

    class GatepassScanMode(models.TextChoices):
        ONLINE = 'ONLINE', 'Online'
        OFFLINE = 'OFFLINE', 'Offline'

    # Scan source mode (ONLINE/OFFLINE). Defaults to ONLINE for backwards compatibility.
    gatepass_scanned_mode = models.CharField(
        max_length=10,
        choices=GatepassScanMode.choices,
        default=GatepassScanMode.ONLINE,
    )
    gatepass_in_scanned_mode = models.CharField(
        max_length=10,
        choices=GatepassScanMode.choices,
        default=GatepassScanMode.ONLINE,
    )

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
    # Overall SLA for the entire flow (hours from submission to final decision)
    sla_hours = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Total SLA for this flow in hours (measured from submission).'
    )
    # roles that are allowed to override this flow for this application_type/department
    override_roles = models.ManyToManyField('accounts.Role', blank=True, related_name='override_flows')

    class Meta:
        pass

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
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='approval_steps'
    )
    stage = models.ForeignKey(
        'applications.ApplicationRoleHierarchyStage',
        null=True,
        blank=True,
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
    # Final step ends the flow (approve/reject). Non-final steps escalate to the next role.
    is_final = models.BooleanField(default=False)
    can_override = models.BooleanField(default=False)
    auto_skip_if_unavailable = models.BooleanField(default=False)

    class Meta:
        ordering = ('approval_flow', 'order')
        unique_together = (('approval_flow', 'order'),)

    def __str__(self):
        label = None
        if self.stage_id:
            label = self.stage.name
        elif self.role_id:
            label = self.role.name
        else:
            label = 'Unassigned'
        return f"{self.approval_flow} - Step {self.order} ({label})"


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


class ApplicationRoleHierarchy(models.Model):
    """Manual role priority override for flow starter selection.

    Lower rank means higher priority.
    When empty for a given application_type, the system falls back to the
    default ordering defined in `applications.services.flow_selection`.
    """

    application_type = models.ForeignKey(
        ApplicationType,
        on_delete=models.CASCADE,
        related_name='role_hierarchy',
    )
    role = models.ForeignKey(
        'accounts.Role',
        on_delete=models.CASCADE,
        related_name='application_role_hierarchy',
    )
    rank = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = (('application_type', 'role'),)
        ordering = ('application_type', 'rank', 'role')

    def __str__(self):
        return f"{self.application_type.code}: {self.role.name} (rank {self.rank})"


class ApplicationRoleHierarchyStage(models.Model):
    """A stage (group) for manual role hierarchy configuration.

    Stages are evaluated in ascending `order`.
    A stage may contain:
    - specific users (absolute override)
    - a ranked list of roles
    """

    application_type = models.ForeignKey(
        ApplicationType,
        on_delete=models.CASCADE,
        related_name='role_hierarchy_stages',
    )
    name = models.CharField(max_length=120, default='Stage')
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ('application_type', 'order', 'id')

    def __str__(self):
        return f"{self.application_type.code}: {self.name} (#{self.order})"


class ApplicationRoleHierarchyStageRole(models.Model):
    stage = models.ForeignKey(
        ApplicationRoleHierarchyStage,
        on_delete=models.CASCADE,
        related_name='stage_roles',
    )
    role = models.ForeignKey(
        'accounts.Role',
        on_delete=models.CASCADE,
        related_name='role_hierarchy_stage_roles',
    )
    rank = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = (('stage', 'role'),)
        ordering = ('stage', 'rank', 'role')

    def __str__(self):
        return f"{self.stage} -> {self.role.name} (rank {self.rank})"


class ApplicationRoleHierarchyStageUser(models.Model):
    stage = models.ForeignKey(
        ApplicationRoleHierarchyStage,
        on_delete=models.CASCADE,
        related_name='stage_users',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='application_role_hierarchy_stage_users',
    )

    class Meta:
        unique_together = (('stage', 'user'),)

    def __str__(self):
        return f"{self.stage} -> {self.user}"


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
