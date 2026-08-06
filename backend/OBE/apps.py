from django.apps import AppConfig

class ObeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'OBE'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import ObeBackupSection
        section_registry.register(ObeBackupSection())
