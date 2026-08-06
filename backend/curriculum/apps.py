from django.apps import AppConfig


class CurriculumConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'curriculum'
    verbose_name = 'Curriculum'
    def ready(self):
        # import signals to ensure receivers are registered
        try:
            from . import signals  # noqa: F401
        except Exception:
            pass
