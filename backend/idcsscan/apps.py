from django.apps import AppConfig


class IdcsscanConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'idcsscan'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import IdcsScanBackupSection
        section_registry.register(IdcsScanBackupSection())
