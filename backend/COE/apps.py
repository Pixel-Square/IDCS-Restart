from django.apps import AppConfig


class CoeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'COE'
    verbose_name = 'COE Portal'

    def ready(self):
        # Register cache-busting signals so any curriculum / teaching assignment
        # change in IDCS automatically clears the COE students-map cache.
        from COE import signals as coe_signals
        coe_signals.register_all()
