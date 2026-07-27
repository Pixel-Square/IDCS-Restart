from django.apps import AppConfig


class CoeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'COE'
    verbose_name = 'COE Portal'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import CoeBackupSection
        section_registry.register(CoeBackupSection())
