from django.apps import AppConfig


class AcademicCalendarConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'academic_calendar'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import AcademicCalendarBackupSection
        section_registry.register(AcademicCalendarBackupSection())
