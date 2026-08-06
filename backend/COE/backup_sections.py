from backups_logs.registry import BackupSection
from .models import (
    CoeExamDummy,
    CoeArrearStudent,
    CoeAssignmentStore,
    CoeCourseSelectionStore,
    CoeKeyValueStore,
)


class CoeBackupSection(BackupSection):
    """
    Backup section for the COE module.

    RAW-ONLY: Stores active state of exam management data including
    dummy mappings, arrear students, assignments, and key-value state.
    There is no clean configuration layer.

    Restore strategy: wipe-and-replace.
    """
    section_id = "coe"
    display_name = "COE"

    def get_raw_queryset_map(self):
        return {
            CoeExamDummy: CoeExamDummy.objects.all(),
            CoeArrearStudent: CoeArrearStudent.objects.all(),
            CoeAssignmentStore: CoeAssignmentStore.objects.all(),
            CoeCourseSelectionStore: CoeCourseSelectionStore.objects.all(),
            CoeKeyValueStore: CoeKeyValueStore.objects.all(),
        }

    def get_config_queryset_map(self):
        return {}

    def restore_raw(self, data):
        from django.core import serializers
        CoeKeyValueStore.objects.all().delete()
        CoeCourseSelectionStore.objects.all().delete()
        CoeAssignmentStore.objects.all().delete()
        CoeArrearStudent.objects.all().delete()
        CoeExamDummy.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        raise NotImplementedError("coe is a raw-only section with no config models.")
