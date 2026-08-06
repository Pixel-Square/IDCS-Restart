from backups_logs.registry import BackupSection
from .models import (
    PBASCustomDepartment,
    PBASNode,
    PBASSubmission,
    PBASVerificationTicket,
)


class PBASBackupSection(BackupSection):
    """
    Backup section for the PBAS module.

    RAW-ONLY: All models including departments and nodes represent
    tree-structured submission data. There is no clean config layer.

    Restore strategy: wipe-and-replace. Deletion order respects FK
    dependencies (tickets -> submissions -> nodes -> departments).
    """
    section_id = "pbas"
    display_name = "PBAS"

    def get_raw_queryset_map(self):
        return {
            PBASCustomDepartment: PBASCustomDepartment.objects.all(),
            PBASNode: PBASNode.objects.all(),
            PBASSubmission: PBASSubmission.objects.all(),
            PBASVerificationTicket: PBASVerificationTicket.objects.all(),
        }

    def get_config_queryset_map(self):
        return {}

    def restore_raw(self, data):
        from django.core import serializers
        PBASVerificationTicket.objects.all().delete()
        PBASSubmission.objects.all().delete()
        PBASNode.objects.all().delete()
        PBASCustomDepartment.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        raise NotImplementedError("pbas is a raw-only section with no config models.")
