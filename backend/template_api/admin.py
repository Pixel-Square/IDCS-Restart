from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered

from .models import CanvaOAuthState, CanvaServiceToken, CanvaTemplate, EventPosterAttachment


@admin.register(CanvaServiceToken)
class CanvaServiceTokenAdmin(admin.ModelAdmin):
    list_display = ('id', 'display_name', 'user_id', 'expires_at', 'updated_at')
    search_fields = ('display_name', 'user_id')
    readonly_fields = ('updated_at',)


@admin.register(CanvaOAuthState)
class CanvaOAuthStateAdmin(admin.ModelAdmin):
    list_display = ('id', 'state', 'origin', 'created_at')
    search_fields = ('state', 'origin', 'redirect_uri')
    readonly_fields = ('created_at',)


@admin.register(CanvaTemplate)
class CanvaTemplateAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'canva_design_id', 'is_brand_template', 'saved_by', 'saved_at')
    search_fields = ('name', 'canva_design_id', 'saved_by')
    list_filter = ('is_brand_template', 'saved_at')


@admin.register(EventPosterAttachment)
class EventPosterAttachmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'event_id', 'canva_design_id', 'format', 'uploaded_at')
    search_fields = ('event_id', 'canva_design_id', 'source_url')
    list_filter = ('format', 'uploaded_at')


# Register any remaining template_api models without explicit admin classes above.
_template_api_app_config = next((cfg for cfg in apps.get_app_configs() if cfg.name == 'template_api'), None)
if _template_api_app_config:
    for _model in _template_api_app_config.get_models():
        if _model not in admin.site._registry:
            try:
                admin.site.register(_model)
            except AlreadyRegistered:
                pass
