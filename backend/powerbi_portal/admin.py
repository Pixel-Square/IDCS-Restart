from __future__ import annotations

from django.contrib import admin

from .models import (
    PowerBIExportLog,
    Room,
    RoomMember,
    RoomSheet,
    RoomSheetColumn,
    Sheet,
    SheetColumn,
)


@admin.register(Sheet)
class SheetAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'owner', 'base_view', 'updated_at')
    search_fields = ('name', 'owner__username', 'owner__email')


@admin.register(SheetColumn)
class SheetColumnAdmin(admin.ModelAdmin):
    list_display = ('id', 'sheet', 'source_view', 'source_column', 'header_label', 'sort_order')
    search_fields = ('sheet__name', 'source_view', 'source_column', 'header_label')


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'leader', 'created_at')
    search_fields = ('name', 'leader__username', 'leader__email')


@admin.register(RoomMember)
class RoomMemberAdmin(admin.ModelAdmin):
    list_display = ('id', 'room', 'user', 'role', 'created_at')
    list_filter = ('role',)
    search_fields = ('room__name', 'user__username', 'user__email')


@admin.register(RoomSheet)
class RoomSheetAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'room', 'base_view', 'updated_at')
    search_fields = ('name', 'room__name')


@admin.register(RoomSheetColumn)
class RoomSheetColumnAdmin(admin.ModelAdmin):
    list_display = ('id', 'room_sheet', 'source_view', 'source_column', 'header_label', 'sort_order')
    search_fields = ('room_sheet__name', 'source_view', 'source_column', 'header_label')


@admin.register(PowerBIExportLog)
class PowerBIExportLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'user', 'export_type', 'view_name', 'row_count', 'limit', 'ip_address')
    list_filter = ('view_name', 'created_at')
    search_fields = ('view_name', 'user__username', 'user__email', 'ip_address')
    readonly_fields = ('created_at',)


# Register any remaining powerbi_portal models without explicit admin classes above.
from django.apps import apps as django_apps
from django.contrib.admin.sites import AlreadyRegistered

_powerbi_portal_app_config = next((cfg for cfg in django_apps.get_app_configs() if cfg.name == 'powerbi_portal'), None)
if _powerbi_portal_app_config:
    for _model in _powerbi_portal_app_config.get_models():
        if _model not in admin.site._registry:
            try:
                admin.site.register(_model)
            except AlreadyRegistered:
                pass
