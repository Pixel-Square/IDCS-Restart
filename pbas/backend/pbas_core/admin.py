from django.contrib import admin
from .models import (
    PBASCustomDepartment,
    PBASApprovalFlow,
    PBASNode,
    PBASNodeApproverHistory,
    PBASSubmission,
    PBASVerificationTicket,
    PBASDuration,
)

@admin.register(PBASCustomDepartment)
class PBASCustomDepartmentAdmin(admin.ModelAdmin):
    list_display = ('title', 'show_in_submission', 'created_at')

@admin.register(PBASApprovalFlow)
class PBASApprovalFlowAdmin(admin.ModelAdmin):
    list_display = ('id', 'staff_flow', 'student_flow', 'updated_at')

@admin.register(PBASNode)
class PBASNodeAdmin(admin.ModelAdmin):
    list_display = ('label', 'department', 'parent', 'pbas_credit', 'audience', 'input_mode')
    list_filter = ('department', 'audience', 'input_mode')

@admin.register(PBASSubmission)
class PBASSubmissionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'node', 'status', 'current_step', 'created_at')
    list_filter = ('status', 'current_step')

@admin.register(PBASDuration)
class PBASDurationAdmin(admin.ModelAdmin):
    list_display = ('title', 'start_date', 'end_date', 'created_at')
