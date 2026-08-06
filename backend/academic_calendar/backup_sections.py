from backups_logs.registry import BackupSection
from .models import AcademicCalendarEvent, HodColor, EventProposal


class AcademicCalendarBackupSection(BackupSection):
    """
    Backup section for the Academic Calendar module.

    RAW-ONLY: All three models (AcademicCalendarEvent, HodColor,
    EventProposal) represent transactional/user-created data. There are
    no structural template or settings models that would constitute a
    config layer.

    Restore strategy: wipe-and-replace — delete all records then restore
    from snapshot. EventProposal has FK to academics.Department (SET_NULL)
    and accounts.User (CASCADE/SET_NULL) but those are external references
    that will resolve correctly as long as the referenced records still exist.
    """
    section_id = "academic_calendar"
    display_name = "Academic Calendar"

    def get_raw_queryset_map(self):
        return {
            AcademicCalendarEvent: AcademicCalendarEvent.objects.all(),
            HodColor: HodColor.objects.all(),
            EventProposal: EventProposal.objects.all(),
        }

    def get_config_queryset_map(self):
        return {}

    def restore_raw(self, data):
        from django.core import serializers
        # Delete in safe order (no inter-model FKs within this app)
        EventProposal.objects.all().delete()
        HodColor.objects.all().delete()
        AcademicCalendarEvent.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        raise NotImplementedError("academic_calendar is a raw-only section with no config models.")
