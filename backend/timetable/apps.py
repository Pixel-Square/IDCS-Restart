from django.apps import AppConfig


class TimetableConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'timetable'
    verbose_name = 'Timetable'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import TimetableBackupSection
        section_registry.register(TimetableBackupSection())
