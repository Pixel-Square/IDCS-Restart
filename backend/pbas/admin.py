from django.contrib import admin

from .models import PBASCustomDepartment, PBASNode, PBASSubmission, PBASVerificationTicket


@admin.register(PBASCustomDepartment)
class PBASCustomDepartmentAdmin(admin.ModelAdmin):
    list_display = ('title', 'created_at')
    search_fields = ('title',)


@admin.register(PBASNode)
class PBASNodeAdmin(admin.ModelAdmin):
    list_display = ('label', 'department', 'parent', 'audience', 'input_mode', 'position', 'created_at')
    list_filter = ('audience', 'input_mode', 'college_required')
    search_fields = ('label',)


@admin.register(PBASSubmission)
class PBASSubmissionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'node', 'submission_type', 'college', 'created_at')
    list_filter = ('submission_type', 'created_at')


@admin.register(PBASVerificationTicket)
class PBASVerificationTicketAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'status',
        'student',
        'mentor',
        'department',
        'submission',
        'forwarded_to_mentor_at',
        'forwarded_to_department_at',
        'created_at',
    )
    list_filter = ('status', 'created_at')
    search_fields = ('id', 'submission__id')

