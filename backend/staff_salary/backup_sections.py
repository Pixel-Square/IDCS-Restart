from backups_logs.registry import BackupSection
from .models import (
    SalaryPFConfig,
    SalaryFormulaConfig,
    SalaryDeductionType,
    SalaryEarnType,
    StaffSalaryDeclaration,
    SalaryBankDeclaration,
    SalaryEMIPlan,
    SalaryMonthlyInput,
    SalaryMonthPublish,
    SalaryPublishedReceipt,
)


class StaffSalaryBackupSection(BackupSection):
    """
    Backup section for the Staff Salary module.

    CONFIG: SalaryPFConfig, SalaryFormulaConfig, SalaryDeductionType, SalaryEarnType.
    These define global calculation rules and types.

    RAW: StaffSalaryDeclaration, SalaryBankDeclaration, SalaryEMIPlan,
    SalaryMonthlyInput, SalaryMonthPublish, SalaryPublishedReceipt.
    These track the actual per-staff declarations, monthly inputs, and receipts.

    Restore strategy: wipe-and-replace. Deletion order respects FK dependencies.
    """
    section_id = "staff_salary"
    display_name = "Staff Salary"

    def get_raw_queryset_map(self):
        return {
            SalaryPFConfig: SalaryPFConfig.objects.all(),
            SalaryFormulaConfig: SalaryFormulaConfig.objects.all(),
            SalaryDeductionType: SalaryDeductionType.objects.all(),
            SalaryEarnType: SalaryEarnType.objects.all(),
            SalaryBankDeclaration: SalaryBankDeclaration.objects.all(),
            StaffSalaryDeclaration: StaffSalaryDeclaration.objects.all(),
            SalaryEMIPlan: SalaryEMIPlan.objects.all(),
            SalaryMonthlyInput: SalaryMonthlyInput.objects.all(),
            SalaryMonthPublish: SalaryMonthPublish.objects.all(),
            SalaryPublishedReceipt: SalaryPublishedReceipt.objects.all(),
        }

    def get_config_queryset_map(self):
        return {
            SalaryPFConfig: SalaryPFConfig.objects.all(),
            SalaryFormulaConfig: SalaryFormulaConfig.objects.all(),
            SalaryDeductionType: SalaryDeductionType.objects.all(),
            SalaryEarnType: SalaryEarnType.objects.all(),
        }

    def restore_raw(self, data):
        from django.core import serializers
        SalaryPublishedReceipt.objects.all().delete()
        SalaryMonthPublish.objects.all().delete()
        SalaryMonthlyInput.objects.all().delete()
        SalaryEMIPlan.objects.all().delete()
        StaffSalaryDeclaration.objects.all().delete()
        SalaryBankDeclaration.objects.all().delete()
        SalaryEarnType.objects.all().delete()
        SalaryDeductionType.objects.all().delete()
        SalaryFormulaConfig.objects.all().delete()
        SalaryPFConfig.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        from django.core import serializers
        deserialized = list(serializers.deserialize('json', data))

        imported_pks = {
            SalaryPFConfig: set(),
            SalaryFormulaConfig: set(),
            SalaryDeductionType: set(),
            SalaryEarnType: set(),
        }

        for des_obj in deserialized:
            model_class = des_obj.object.__class__
            if model_class in imported_pks:
                imported_pks[model_class].add(str(des_obj.object.pk))

        # Delete existing in reverse dep order
        for obj in SalaryEarnType.objects.all():
            if str(obj.pk) not in imported_pks[SalaryEarnType]:
                obj.delete()
        for obj in SalaryDeductionType.objects.all():
            if str(obj.pk) not in imported_pks[SalaryDeductionType]:
                obj.delete()
        for obj in SalaryFormulaConfig.objects.all():
            if str(obj.pk) not in imported_pks[SalaryFormulaConfig]:
                obj.delete()
        for obj in SalaryPFConfig.objects.all():
            if str(obj.pk) not in imported_pks[SalaryPFConfig]:
                obj.delete()

        for des_obj in deserialized:
            des_obj.save()
