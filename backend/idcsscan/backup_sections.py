from backups_logs.registry import BackupSection
from .models import GatepassOfflineScan


class IdcsScanBackupSection(BackupSection):
    """
    Backup section for the IDCS Scan (Gatepass) module.

    RAW-ONLY: Single transactional model recording offline gatepass scans.
    No config/settings layer exists.

    Restore strategy: wipe-and-replace — all scan records are deleted
    then restored from snapshot. Appropriate because scans are standalone
    records with no inter-model FK dependencies within this app.
    """
    section_id = "idcsscan"
    display_name = "IDCS Scan (Gatepass)"

    def get_raw_queryset_map(self):
        return {
            GatepassOfflineScan: GatepassOfflineScan.objects.all(),
        }

    def get_config_queryset_map(self):
        return {}

    def restore_raw(self, data):
        from django.core import serializers
        GatepassOfflineScan.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        raise NotImplementedError("idcsscan is a raw-only section with no config models.")
