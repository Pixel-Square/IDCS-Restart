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
