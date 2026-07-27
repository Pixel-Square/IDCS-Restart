from backups_logs.registry import BackupSection
from .models import (
    QuestionPaperType,
    Regulation,
    DepartmentGroup,
    DepartmentGroupMapping,
    CurriculumMaster,
    CurriculumDepartment,
    ElectiveSubject,
    ElectiveChoice,
)


class CurriculumBackupSection(BackupSection):
    """
    Backup section for the Curriculum module.

    CONFIG: QuestionPaperType (QP type definitions), Regulation (regulation
    codes), DepartmentGroup and DepartmentGroupMapping (department grouping
    for curriculum management). These define structural rules for how
    curricula are organized.

    RAW: CurriculumMaster (master curriculum entries), CurriculumDepartment
    (per-department copies), ElectiveSubject (elective options),
    ElectiveChoice (student elective selections).

    Note: CurriculumMaster/Department have M2M and FK references into
    academics (Department, Semester, BatchYear). These are external
    references that resolve correctly as long as the referenced records
    still exist.

    Restore strategy: wipe-and-replace. Deletion order respects FK
    dependencies.
    """
    section_id = "curriculum"
    display_name = "Curriculum"

    def get_raw_queryset_map(self):
        return {
            QuestionPaperType: QuestionPaperType.objects.all(),
            Regulation: Regulation.objects.all(),
            DepartmentGroup: DepartmentGroup.objects.all(),
            DepartmentGroupMapping: DepartmentGroupMapping.objects.all(),
            CurriculumMaster: CurriculumMaster.objects.all(),
            CurriculumDepartment: CurriculumDepartment.objects.all(),
            ElectiveSubject: ElectiveSubject.objects.all(),
            ElectiveChoice: ElectiveChoice.objects.all(),
        }

    def get_config_queryset_map(self):
        return {
            QuestionPaperType: QuestionPaperType.objects.all(),
            Regulation: Regulation.objects.all(),
            DepartmentGroup: DepartmentGroup.objects.all(),
            DepartmentGroupMapping: DepartmentGroupMapping.objects.all(),
        }

    def restore_raw(self, data):
        from django.core import serializers
        # Delete in reverse dependency order
        ElectiveChoice.objects.all().delete()
        ElectiveSubject.objects.all().delete()
        CurriculumDepartment.objects.all().delete()
        CurriculumMaster.objects.all().delete()
        DepartmentGroupMapping.objects.all().delete()
        DepartmentGroup.objects.all().delete()
        Regulation.objects.all().delete()
        QuestionPaperType.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        from django.core import serializers
        deserialized = list(serializers.deserialize('json', data))

        imported_pks = {
            QuestionPaperType: set(),
            Regulation: set(),
            DepartmentGroup: set(),
            DepartmentGroupMapping: set(),
        }

        for des_obj in deserialized:
            model_class = des_obj.object.__class__
            if model_class in imported_pks:
                imported_pks[model_class].add(str(des_obj.object.pk))

        # Delete in reverse dep order
        for obj in DepartmentGroupMapping.objects.all():
            if str(obj.pk) not in imported_pks[DepartmentGroupMapping]:
                obj.delete()
        for obj in DepartmentGroup.objects.all():
            if str(obj.pk) not in imported_pks[DepartmentGroup]:
                obj.delete()
        for obj in Regulation.objects.all():
            if str(obj.pk) not in imported_pks[Regulation]:
                obj.delete()
        for obj in QuestionPaperType.objects.all():
            if str(obj.pk) not in imported_pks[QuestionPaperType]:
                obj.delete()

        for des_obj in deserialized:
            des_obj.save()
