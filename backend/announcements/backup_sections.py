from backups_logs.registry import BackupSection
from .models import Announcement, AnnouncementReadStatus


class AnnouncementsBackupSection(BackupSection):
    """
    Backup section for the Announcements module.

    RAW-ONLY: This section intentionally has no config/raw split.
    Announcements currently consists only of transactional data (posted
    announcements and their read-status tracking). There are no
    structural/template/settings models (e.g. AnnouncementCategory,
    AnnouncementTemplate) that would constitute a "config" layer.

    This is a deliberate design gap, not a bug. If category/template
    models are added in the future, this section should be updated to
    implement get_config_queryset_map() and import_config().

    Restore strategy: wipe-and-replace — all existing announcements and
    read statuses are deleted, then the snapshot data is restored in full.
    This is appropriate because announcements are standalone records with
    no complex inter-model dependencies beyond the Announcement→ReadStatus
    FK (handled by deletion order).
    """
    section_id = "announcements"
    display_name = "Announcements"

    def get_raw_queryset_map(self):
        return {
            Announcement: Announcement.objects.all(),
            AnnouncementReadStatus: AnnouncementReadStatus.objects.all(),
        }

    def get_config_queryset_map(self):
        # Intentionally empty — raw-only section. See class docstring.
        return {}

    def restore_raw(self, data):
        from django.core import serializers
        
        # Wipe-and-replace: delete in reverse dependency order, then restore.
        AnnouncementReadStatus.objects.all().delete()
        Announcement.objects.all().delete()
        
        deserialized = list(serializers.deserialize('json', data))
        for des_obj in deserialized:
            des_obj.save()

    def import_config(self, data):
        # No config models exist for this section.
        raise NotImplementedError(
            "Announcements is a raw-only section with no config models. "
            "See class docstring for rationale."
        )
