from django.apps import AppConfig


class AnnouncementsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'announcements'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import AnnouncementsBackupSection
        
        try:
            section_registry.register(AnnouncementsBackupSection())
        except ValueError:
            # Already registered (e.g. during testing)
            pass
