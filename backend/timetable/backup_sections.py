from backups_logs.registry import BackupSection
from .models import (
    TimetableTemplate,
    TimetableSlot,
    TimetableAssignment,
    SpecialTimetable,
    SpecialTimetableEntry,
    PeriodSwapRequest,
)


class TimetableBackupSection(BackupSection):
    """
    Backup section for the Timetable module.

    CONFIG: TimetableTemplate and TimetableSlot — these define the
    structural layout of period slots (times, breaks, labels). They are
    reusable across semesters and sections.

    RAW: TimetableAssignment, SpecialTimetable, SpecialTimetableEntry,
    PeriodSwapRequest — actual schedule assignments and swap requests
    for specific sections/dates.

    Restore strategy: wipe-and-replace. Deletion order respects FK
    dependencies: entries → special timetables → assignments → slots →
    templates.
    """
    section_id = "timetable"
    display_name = "Timetable"

    def get_raw_queryset_map(self):
        return {
            TimetableTemplate: TimetableTemplate.objects.all(),
            TimetableSlot: TimetableSlot.objects.all(),
            TimetableAssignment: TimetableAssignment.objects.all(),
            SpecialTimetable: SpecialTimetable.objects.all(),
            SpecialTimetableEntry: SpecialTimetableEntry.objects.all(),
            PeriodSwapRequest: PeriodSwapRequest.objects.all(),
        }

    def get_config_queryset_map(self):
        return {
            TimetableTemplate: TimetableTemplate.objects.all(),
            TimetableSlot: TimetableSlot.objects.all(),
        }

    def restore_raw(self, data):
        from django.core import serializers
        # Delete in reverse dependency order
        PeriodSwapRequest.objects.all().delete()
        SpecialTimetableEntry.objects.all().delete()
        SpecialTimetable.objects.all().delete()
        TimetableAssignment.objects.all().delete()
        TimetableSlot.objects.all().delete()
        TimetableTemplate.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        from django.core import serializers
        deserialized = list(serializers.deserialize('json', data))

        imported_pks = {
            TimetableTemplate: set(),
            TimetableSlot: set(),
        }

        for des_obj in deserialized:
            model_class = des_obj.object.__class__
            if model_class in imported_pks:
                imported_pks[model_class].add(str(des_obj.object.pk))

        # Delete config objects NOT in the imported data (reverse dep order)
        for obj in TimetableSlot.objects.all():
            if str(obj.pk) not in imported_pks[TimetableSlot]:
                obj.delete()
        for obj in TimetableTemplate.objects.all():
            if str(obj.pk) not in imported_pks[TimetableTemplate]:
                obj.delete()

        # Upsert imported objects
        for des_obj in deserialized:
            des_obj.save()
