from django.apps import AppConfig


class BackupsLogsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backups_logs'

    def ready(self):
        import backups_logs.signals
