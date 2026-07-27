from django.apps import AppConfig


class StaffSalaryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'staff_salary'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import StaffSalaryBackupSection
        section_registry.register(StaffSalaryBackupSection())
