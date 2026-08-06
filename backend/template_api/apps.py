from django.apps import AppConfig


class TemplateApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'template_api'
    verbose_name = 'Branding'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import TemplateApiBackupSection
        section_registry.register(TemplateApiBackupSection())
