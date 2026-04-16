from django.contrib import admin
from .models import (
    RequestTemplate,
    ApprovalStep,
    StaffRequest,
    ApprovalLog,
    StaffLeaveBalance,
    StaffFormUsage,
    VacationEntitlementRule,
    VacationSemester,
    VacationSlot,
)


class ApprovalStepInline(admin.TabularInline):
    """Inline admin for ApprovalStep within RequestTemplate"""
    model = ApprovalStep
    extra = 1
    fields = ['step_order', 'approver_role']
    ordering = ['step_order']


@admin.register(RequestTemplate)
class RequestTemplateAdmin(admin.ModelAdmin):
    """Admin interface for RequestTemplate"""
    list_display = ['name', 'is_active', 'total_approval_steps', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'description']
    inlines = [ApprovalStepInline]
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'is_active')
        }),
        ('Form Configuration', {
            'fields': ('form_schema', 'allowed_roles'),
            'description': 'Define the dynamic form fields and allowed user roles'
        }),
        ('Leave & Attendance Policy', {
            'fields': ('leave_policy',),
            'classes': ('collapse',),
            'description': 'Configure leave balance tracking and attendance integration'
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at']
    
    def total_approval_steps(self, obj):
        """Display the number of approval steps"""
        return obj.approval_steps.count()
    total_approval_steps.short_description = 'Approval Steps'


@admin.register(ApprovalStep)
class ApprovalStepAdmin(admin.ModelAdmin):
    """Admin interface for ApprovalStep"""
    list_display = ['template', 'step_order', 'approver_role', 'created_at']
    list_filter = ['template', 'approver_role']
    search_fields = ['template__name', 'approver_role']
    ordering = ['template', 'step_order']
    
    fieldsets = (
        ('Step Configuration', {
            'fields': ('template', 'step_order', 'approver_role')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at']


class ApprovalLogInline(admin.TabularInline):
    """Inline admin for ApprovalLog within StaffRequest"""
    model = ApprovalLog
    extra = 0
    fields = ['step_order', 'approver', 'action', 'comments', 'action_date']
    readonly_fields = ['step_order', 'approver', 'action', 'comments', 'action_date']
    can_delete = False
    
    def has_add_permission(self, request, obj=None):
        return False


@admin.register(StaffRequest)
class StaffRequestAdmin(admin.ModelAdmin):
    """Admin interface for StaffRequest"""
    list_display = [
        'id', 'applicant', 'template', 'status', 
        'current_step', 'created_at'
    ]
    list_filter = ['status', 'template', 'created_at']
    search_fields = [
        'applicant__username', 
        'applicant__first_name', 
        'applicant__last_name',
        'template__name'
    ]
    inlines = [ApprovalLogInline]
    
    fieldsets = (
        ('Request Information', {
            'fields': ('applicant', 'template', 'form_data')
        }),
        ('Approval Status', {
            'fields': ('status', 'current_step')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at']
    
    def get_readonly_fields(self, request, obj=None):
        """Make certain fields readonly after creation"""
        if obj:  # Editing existing object
            return self.readonly_fields + ['applicant', 'template']
        return self.readonly_fields


@admin.register(ApprovalLog)
class ApprovalLogAdmin(admin.ModelAdmin):
    """Admin interface for ApprovalLog"""
    list_display = [
        'id', 'request', 'step_order', 'approver', 
        'action', 'action_date'
    ]
    list_filter = ['action', 'action_date']
    search_fields = [
        'request__applicant__username',
        'approver__username',
        'comments'
    ]
    
    fieldsets = (
        ('Approval Information', {
            'fields': ('request', 'step_order', 'approver', 'action')
        }),
        ('Details', {
            'fields': ('comments', 'action_date')
        }),
    )
    
    readonly_fields = ['action_date']
    
    def get_readonly_fields(self, request, obj=None):
        """Make all fields readonly after creation (audit trail)"""
        if obj:
            return [f.name for f in self.model._meta.fields]
        return self.readonly_fields
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of approval logs (audit trail)"""
        return False


@admin.register(StaffLeaveBalance)
class StaffLeaveBalanceAdmin(admin.ModelAdmin):
    """Admin interface for StaffLeaveBalance"""
    list_display = ['staff', 'leave_type', 'balance', 'updated_at']
    list_filter = ['leave_type', 'updated_at']
    search_fields = ['staff__username', 'staff__first_name', 'staff__last_name', 'leave_type']
    ordering = ['staff', 'leave_type']
    
    fieldsets = (
        ('Balance Information', {
            'fields': ('staff', 'leave_type', 'balance')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at']
    
    def get_readonly_fields(self, request, obj=None):
        """Make staff and leave_type readonly after creation"""
        if obj:  # Editing existing object
            return self.readonly_fields + ['staff', 'leave_type']
        return self.readonly_fields


@admin.register(StaffFormUsage)
class StaffFormUsageAdmin(admin.ModelAdmin):
    """Admin interface for StaffFormUsage (neutral form usage tracking)"""
    list_display = ['staff', 'template', 'usage_count', 'reset_period_start', 'reset_period_end', 'last_used']
    list_filter = ['template', 'reset_period_start', 'reset_period_end']
    search_fields = ['staff__username', 'staff__first_name', 'staff__last_name', 'template__name']
    ordering = ['staff', 'template', '-reset_period_start']
    
    fieldsets = (
        ('Usage Information', {
            'fields': ('staff', 'template', 'usage_count', 'last_used')
        }),
        ('Reset Period', {
            'fields': ('reset_period_start', 'reset_period_end')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at', 'last_used']
    
    def get_readonly_fields(self, request, obj=None):
        """Make staff, template, and reset period readonly after creation"""
        if obj:  # Editing existing object
            return self.readonly_fields + ['staff', 'template', 'reset_period_start', 'reset_period_end']
        return self.readonly_fields


@admin.register(VacationEntitlementRule)
class VacationEntitlementRuleAdmin(admin.ModelAdmin):
    list_display = ['condition', 'min_years', 'min_months', 'entitled_days', 'is_active', 'updated_at']
    list_filter = ['is_active', 'updated_at']
    ordering = ['id']


@admin.register(VacationSlot)
class VacationSlotAdmin(admin.ModelAdmin):
    list_display = [
        'slot_name',
        'semester_ref',
        'semester',
        'semester_from_date',
        'semester_to_date',
        'from_date',
        'to_date',
        'total_days',
        'is_active',
    ]
    list_filter = ['is_active', 'semester']
    search_fields = ['slot_name', 'semester']
    ordering = ['from_date', 'slot_name']


@admin.register(VacationSemester)
class VacationSemesterAdmin(admin.ModelAdmin):
    list_display = ['name', 'from_date', 'to_date', 'is_active', 'updated_at']
    list_filter = ['is_active']
    search_fields = ['name']
    ordering = ['from_date', 'name']
