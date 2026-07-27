from backups_logs.registry import BackupSection
from .models import (
    RequestTemplate,
    ApprovalStep,
    StaffRequest,
    StaffLeaveBalance,
    StaffFormUsage,
    ApprovalLog,
)


class StaffRequestsBackupSection(BackupSection):
    """
    Backup section for the Staff Requests module.

    CONFIG: RequestTemplate (form schemas, leave policies, attendance
    actions) and ApprovalStep (workflow step definitions). These define
    HOW requests are structured and routed.

    RAW: StaffRequest (submitted requests), StaffLeaveBalance (per-staff
    balances), StaffFormUsage (usage tracking), ApprovalLog (audit trail).

    Restore strategy: wipe-and-replace. Deletion order respects FK
    dependencies: logs → requests → balances/usage → steps → templates.
    """
    section_id = "staff_requests"
    display_name = "Staff Requests"

    def get_raw_queryset_map(self):
        return {
            RequestTemplate: RequestTemplate.objects.all(),
            ApprovalStep: ApprovalStep.objects.all(),
            StaffRequest: StaffRequest.objects.all(),
            StaffLeaveBalance: StaffLeaveBalance.objects.all(),
            StaffFormUsage: StaffFormUsage.objects.all(),
            ApprovalLog: ApprovalLog.objects.all(),
        }

    def get_config_queryset_map(self):
        return {
            RequestTemplate: RequestTemplate.objects.all(),
            ApprovalStep: ApprovalStep.objects.all(),
        }

    def restore_raw(self, data):
        from django.core import serializers
        ApprovalLog.objects.all().delete()
        StaffFormUsage.objects.all().delete()
        StaffLeaveBalance.objects.all().delete()
        StaffRequest.objects.all().delete()
        ApprovalStep.objects.all().delete()
        RequestTemplate.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        from django.core import serializers
        deserialized = list(serializers.deserialize('json', data))

        imported_pks = {
            RequestTemplate: set(),
            ApprovalStep: set(),
        }

        for des_obj in deserialized:
            model_class = des_obj.object.__class__
            if model_class in imported_pks:
                imported_pks[model_class].add(str(des_obj.object.pk))

        for obj in ApprovalStep.objects.all():
            if str(obj.pk) not in imported_pks[ApprovalStep]:
                obj.delete()
        for obj in RequestTemplate.objects.all():
            if str(obj.pk) not in imported_pks[RequestTemplate]:
                obj.delete()

        for des_obj in deserialized:
            des_obj.save()
