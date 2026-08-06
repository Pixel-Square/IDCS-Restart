from django.apps import AppConfig


class StaffRequestsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'staff_requests'
    verbose_name = 'Staff Requests'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import StaffRequestsBackupSection
        section_registry.register(StaffRequestsBackupSection())
