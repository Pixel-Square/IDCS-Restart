from django.apps import AppConfig


class PbasConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'pbas'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import PBASBackupSection
        section_registry.register(PBASBackupSection())

