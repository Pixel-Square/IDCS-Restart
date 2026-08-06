from django.apps import AppConfig

class FeedbackConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'feedback'
    verbose_name = 'FEEDBACK'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import FeedbackBackupSection

        try:
            section_registry.register(FeedbackBackupSection())
        except ValueError:
            # Already registered (e.g. during testing)
            pass
