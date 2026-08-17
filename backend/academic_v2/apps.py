from django.apps import AppConfig


class AcademicV2Config(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'academic_v2'
    verbose_name = 'Academic 2.1 - OBE Mark Entry System'

    def ready(self):
        import academic_v2.signals  # noqa: F401
