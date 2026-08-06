from django.apps import AppConfig


class ApplicationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'applications'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import ApplicationsBackupSection
        section_registry.register(ApplicationsBackupSection())
    verbose_name = 'Applications / Workflow'
