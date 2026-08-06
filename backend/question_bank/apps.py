from django.apps import AppConfig


class QuestionBankConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'question_bank'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import QuestionBankBackupSection
        section_registry.register(QuestionBankBackupSection())
