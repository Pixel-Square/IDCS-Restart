from django.contrib import admin
from . import models


class ApplicationDataInline(admin.TabularInline):
    model = models.ApplicationData
    extra = 0
    readonly_fields = ('field', 'value')


class ApplicationAttachmentInline(admin.TabularInline):
    model = models.ApplicationAttachment
    extra = 0
    fields = ('file', 'label', 'uploaded_by', 'uploaded_at', 'is_deleted')
    readonly_fields = ('uploaded_by', 'uploaded_at')


class ApplicationAdmin(admin.ModelAdmin):
    list_display = ('id', 'application_type', 'applicant_user', 'status', 'current_step', 'submitted_at', 'created_at')
    list_filter = ('application_type', 'status')
    search_fields = ('applicant_user__username', 'applicant_user__email')
    inlines = (ApplicationDataInline, ApplicationAttachmentInline)
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at', 'submitted_at')


class ApplicationFieldAdmin(admin.ModelAdmin):
    list_display = ('application_type', 'field_key', 'label', 'field_type', 'is_required', 'order')
    list_filter = ('application_type', 'field_type', 'is_required')
    search_fields = ('field_key', 'label')


class ApplicationTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_active')
    search_fields = ('name', 'code')


class ApplicationFormVersionAdmin(admin.ModelAdmin):
    list_display = ('application_type', 'version', 'is_active', 'created_at')
    list_filter = ('application_type', 'is_active')
    readonly_fields = ('created_at',)


class ApprovalStepInline(admin.TabularInline):
    model = models.ApprovalStep
    extra = 0
    fields = ('order', 'role', 'can_override', 'auto_skip_if_unavailable')


class ApprovalFlowAdmin(admin.ModelAdmin):
    list_display = ('application_type', 'department', 'is_active')
    inlines = (ApprovalStepInline,)
    filter_horizontal = ('override_roles',)


class ApprovalActionAdmin(admin.ModelAdmin):
    list_display = ('application', 'step', 'acted_by', 'action', 'acted_at')
    search_fields = ('acted_by__username', 'application__applicant_user__username')


class RoleApplicationPermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'application_type', 'can_edit_all', 'can_override_flow')
    list_filter = ('can_edit_all', 'can_override_flow')


admin.site.register(models.ApplicationType, ApplicationTypeAdmin)
admin.site.register(models.ApplicationField, ApplicationFieldAdmin)
admin.site.register(models.Application, ApplicationAdmin)
admin.site.register(models.ApplicationData)
admin.site.register(models.ApprovalFlow, ApprovalFlowAdmin)
admin.site.register(models.ApprovalStep)
admin.site.register(models.ApprovalAction, ApprovalActionAdmin)
admin.site.register(models.RoleApplicationPermission, RoleApplicationPermissionAdmin)
admin.site.register(models.ApplicationAttachment)
admin.site.register(models.ApplicationFormVersion, ApplicationFormVersionAdmin)
