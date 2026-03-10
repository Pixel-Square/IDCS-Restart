from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
import json


class RequestTemplate(models.Model):
    """
    Template for different types of staff requests (Leave, OD, Permission, etc.)
    Defines the dynamic form schema and approval workflow.
    """
    name = models.CharField(max_length=100, unique=True, help_text="e.g., Leave, OD, Permission")
    description = models.TextField(blank=True, help_text="Description of this request type")
    is_active = models.BooleanField(default=True, help_text="Only active templates can be used")
    
    # JSON Schema for dynamic form fields
    # Example: [{"name": "from_date", "type": "date", "label": "From Date", "required": true}, ...]
    form_schema = models.JSONField(
        default=list,
        help_text="Array of field definitions: [{name, type, label, required, options}, ...]"
    )
    
    # Roles allowed to submit this type of request
    # Example: ["FACULTY", "STAFF", "HOD"]
    allowed_roles = models.JSONField(
        default=list,
        help_text="List of role names that can submit this request type"
    )
    
    # Ledger Policy (legacy field - kept for backward compatibility)
    ledger_policy = models.JSONField(
        default=dict,
        blank=True,
        help_text="Legacy ledger policy configuration"
    )
    
    # Leave and Attendance Policy
    # Example: {
    #   "action": "deduct",  // "deduct", "earn", or "neutral"
    #   "allotment_per_role": {"STAFF": 6, "HOD": 10},  // Initial balance for deduct action (optional)
    #   "from_date": "2026-06-01",  // REQUIRED: Start date for reset period (e.g., academic year start)
    #   "to_date": "2027-05-31",  // REQUIRED: End date for reset period (e.g., academic year end)
    #   "overdraft_name": "LOP",  // Loss of Pay tracking field name
    #   "lop_non_reset": true,  // If true, LOP accumulates indefinitely (recommended: true)
    #   "attendance_status": "CL",  // Status code for attendance register
    #   
    #   // LOP Logic: LOP = Total absent days - Approved deduct form days covering those dates
    #   // When staff marked absent: LOP increases automatically
    #   // When deduct form approved for absent date: LOP decreases by that count
    #   // Example: Absent 4 days = LOP:4, then approve leave for 2 absent days = LOP:2
    #   
    #   // Reset Behavior (run: python manage.py reset_leave_balances):
    #   // - COL (earn): Resets to 0 when to_date passes
    #   // - Deduct forms: Reset to allotment_per_role when new period starts
    #   // - LOP: Resets to 0 when to_date passes (unless lop_non_reset=true)
    #   
    #   "max_uses": 5,  // For neutral action: max uses per staff per period
    #   "usage_reset_duration": "monthly",  // For neutral action: "yearly" or "monthly"
    #   "usage_from_date": "2026-01-01",  // For neutral: optional custom usage reset period start
    #   "usage_to_date": "2026-01-31"  // For neutral: optional custom usage reset period end
    # }
    leave_policy = models.JSONField(
        default=dict,
        blank=True,
        help_text="Leave and attendance policy configuration"
    )
    
    # Attendance Action on Approval
    # Example: {
    #   "change_status": true,
    #   "from_status": "absent",
    #   "to_status": "present",
    #   "apply_to_dates": ["date", "from_date"],  // Which form fields contain dates to update
    #   "date_format": "YYYY-MM-DD"
    # }
    attendance_action = models.JSONField(
        default=dict,
        blank=True,
        help_text="Configuration for attendance status changes on approval"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
        verbose_name = 'Request Template'
        verbose_name_plural = 'Request Templates'
        permissions = (
            ('manage_templates', 'Full control over creating and editing forms/workflows'),
        )
    
    def __str__(self):
        return f"{self.name} {'(Active)' if self.is_active else '(Inactive)'}"
    
    def clean(self):
        """Validate form_schema structure"""
        if not isinstance(self.form_schema, list):
            raise ValidationError("form_schema must be a list of field definitions")
        
        for field in self.form_schema:
            if not isinstance(field, dict):
                raise ValidationError("Each field in form_schema must be a dictionary")
            if 'name' not in field or 'type' not in field:
                raise ValidationError("Each field must have 'name' and 'type' properties")
    
    def validate_form_data(self, form_data):
        """
        Validate that form_data matches the form_schema requirements.
        Returns (is_valid, errors_dict)
        """
        errors = {}
        
        if not isinstance(form_data, dict):
            return False, {"_general": "Form data must be a dictionary"}
        
        for field_def in self.form_schema:
            field_name = field_def.get('name')
            is_required = field_def.get('required', False)
            field_value = form_data.get(field_name)
            
            if is_required and not field_value:
                errors[field_name] = f"{field_def.get('label', field_name)} is required"
        
        return len(errors) == 0, errors


class ApprovalStep(models.Model):
    """
    Defines a step in the approval workflow for a RequestTemplate.
    Approval flows sequentially through these steps.
    """
    template = models.ForeignKey(
        RequestTemplate,
        on_delete=models.CASCADE,
        related_name='approval_steps'
    )
    step_order = models.IntegerField(help_text="Sequential order (1, 2, 3...)")
    approver_role = models.CharField(
        max_length=50,
        help_text="Role name of the approver (e.g., 'HOD', 'HR', 'PRINCIPAL')"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['template', 'step_order']
        unique_together = [['template', 'step_order']]
        verbose_name = 'Approval Step'
        verbose_name_plural = 'Approval Steps'
    
    def __str__(self):
        return f"{self.template.name} - Step {self.step_order}: {self.approver_role}"


class StaffRequest(models.Model):
    """
    An actual staff request submission (Leave, OD, etc.)
    Tracks the applicant, form data, and current approval status.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    applicant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_requests'
    )
    template = models.ForeignKey(
        RequestTemplate,
        on_delete=models.PROTECT,
        related_name='requests'
    )
    
    # User's answers to the template's form_schema
    form_data = models.JSONField(
        default=dict,
        help_text="User responses matching the template's form_schema"
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    # Current step in the approval workflow (starts at 1)
    current_step = models.IntegerField(default=1)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Staff Request'
        verbose_name_plural = 'Staff Requests'
        indexes = [
            models.Index(fields=['status', 'current_step']),
            models.Index(fields=['applicant', 'status']),
        ]
        permissions = (
            ('view_all_requests', 'Global view access to monitor all staff requests'),
            ('approve_requests', 'Access to the Pending Approvals dashboard'),
        )
    
    def __str__(self):
        return f"{self.template.name} by {self.applicant.get_full_name() or self.applicant.username} - {self.status}"
    
    def clean(self):
        """Validate form_data against template schema"""
        if self.template:
            is_valid, errors = self.template.validate_form_data(self.form_data)
            if not is_valid:
                raise ValidationError({'form_data': errors})
    
    def get_current_approval_step(self):
        """Get the ApprovalStep object for the current step"""
        try:
            return self.template.approval_steps.get(step_order=self.current_step)
        except ApprovalStep.DoesNotExist:
            return None
    
    def get_required_approver_role(self):
        """Get the role name required for the current approval step"""
        step = self.get_current_approval_step()
        return step.approver_role if step else None
    
    def is_final_step(self):
        """Check if current step is the last approval step"""
        max_step = self.template.approval_steps.aggregate(
            models.Max('step_order')
        )['step_order__max']
        return self.current_step >= (max_step or 0)
    
    def advance_to_next_step(self):
        """Move to the next approval step"""
        self.current_step += 1
        self.save(update_fields=['current_step', 'updated_at'])
    
    def mark_approved(self):
        """Mark the request as fully approved"""
        self.status = 'approved'
        self.save(update_fields=['status', 'updated_at'])
    
    def mark_rejected(self):
        """Mark the request as rejected"""
        self.status = 'rejected'
        self.save(update_fields=['status', 'updated_at'])


class StaffLeaveBalance(models.Model):
    """
    Tracks leave balances for each staff member by leave type.
    Balances are updated when requests are approved.
    """
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='leave_balances'
    )
    leave_type = models.CharField(
        max_length=100,
        help_text="Leave type name (e.g., 'Casual Leave', 'COL', 'OD', 'LOP')"
    )
    balance = models.FloatField(
        default=0.0,
        help_text="Current balance for this leave type"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = [['staff', 'leave_type']]
        ordering = ['staff', 'leave_type']
        verbose_name = 'Staff Leave Balance'
        verbose_name_plural = 'Staff Leave Balances'
    
    def __str__(self):
        return f"{self.staff.get_full_name() or self.staff.username} - {self.leave_type}: {self.balance}"


class StaffFormUsage(models.Model):
    """
    Tracks usage count for neutral forms (like OD) per staff member.
    Used to enforce max_uses limits and track when usage exceeds allowed count.
    """
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='form_usages'
    )
    template = models.ForeignKey(
        RequestTemplate,
        on_delete=models.CASCADE,
        related_name='staff_usages'
    )
    usage_count = models.IntegerField(
        default=0,
        help_text="Number of times this form has been used in current period"
    )
    reset_period_start = models.DateField(
        help_text="Start date of current tracking period"
    )
    reset_period_end = models.DateField(
        help_text="End date of current tracking period"
    )
    last_used = models.DateTimeField(
        null=True, 
        blank=True,
        help_text="Last time this form was used"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = [['staff', 'template', 'reset_period_start']]
        ordering = ['staff', 'template']
        verbose_name = 'Staff Form Usage'
        verbose_name_plural = 'Staff Form Usages'
    
    def __str__(self):
        return f"{self.staff.get_full_name() or self.staff.username} - {self.template.name}: {self.usage_count} uses"
    
    def is_within_limit(self, max_uses):
        """Check if usage is within allowed limit"""
        if max_uses is None:
            return True
        return self.usage_count < max_uses
    
    def increment_usage(self):
        """Increment usage count and update last_used timestamp"""
        from django.utils import timezone
        self.usage_count += 1
        self.last_used = timezone.now()
        self.save(update_fields=['usage_count', 'last_used', 'updated_at'])


class ApprovalLog(models.Model):
    """
    Audit trail of all approval actions on a StaffRequest.
    Records who approved/rejected at each step and their comments.
    """
    ACTION_CHOICES = [
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    request = models.ForeignKey(
        StaffRequest,
        on_delete=models.CASCADE,
        related_name='approval_logs'
    )
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_request_approval_logs'
    )
    step_order = models.IntegerField(help_text="Which approval step this action relates to")
    action = models.CharField(
        max_length=20,
        choices=ACTION_CHOICES
    )
    comments = models.TextField(blank=True)
    action_date = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['step_order', 'action_date']
        verbose_name = 'Approval Log'
        verbose_name_plural = 'Approval Logs'
    
    def __str__(self):
        return f"Step {self.step_order}: {self.action} by {self.approver.get_full_name() or self.approver.username}"
