from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q


class Sheet(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='powerbi_sheets',
    )
    name = models.CharField(max_length=128)
    # Keep a single base view for correctness (no implicit joins).
    base_view = models.CharField(max_length=128, default='bi_obe_student_subject_wide')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'PowerBI Sheet'
        verbose_name_plural = 'PowerBI Sheets'
        constraints = [
            models.UniqueConstraint(fields=['owner', 'name'], name='uniq_powerbi_sheet_owner_name'),
        ]
        ordering = ('-updated_at',)

    def __str__(self) -> str:
        return f'{self.name}'


class SheetColumn(models.Model):
    sheet = models.ForeignKey(Sheet, on_delete=models.CASCADE, related_name='columns')
    source_view = models.CharField(max_length=128)
    source_column = models.CharField(max_length=128)
    header_label = models.CharField(max_length=128)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'PowerBI Sheet Column'
        verbose_name_plural = 'PowerBI Sheet Columns'
        ordering = ('sort_order', 'id')
        constraints = [
            models.UniqueConstraint(
                fields=['sheet', 'source_view', 'source_column'],
                name='uniq_powerbi_sheet_column_once',
            )
        ]

    def __str__(self) -> str:
        return f'{self.sheet_id}:{self.source_view}.{self.source_column}'


class Room(models.Model):
    name = models.CharField(max_length=128)
    leader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='powerbi_led_rooms',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'PowerBI Room'
        verbose_name_plural = 'PowerBI Rooms'
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return self.name


class RoomMember(models.Model):
    ROLE_LEADER = 'LEADER'
    ROLE_CO_LEADER = 'CO_LEADER'
    ROLE_MEMBER = 'MEMBER'
    ROLE_CHOICES = (
        (ROLE_LEADER, 'Leader'),
        (ROLE_CO_LEADER, 'Co-Leader'),
        (ROLE_MEMBER, 'Member'),
    )

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='powerbi_room_memberships',
    )
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default=ROLE_MEMBER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'PowerBI Room Member'
        verbose_name_plural = 'PowerBI Room Members'
        constraints = [
            models.UniqueConstraint(fields=['room', 'user'], name='uniq_powerbi_room_user'),
            models.UniqueConstraint(
                fields=['room'],
                condition=Q(role='LEADER'),
                name='uniq_powerbi_one_leader_per_room',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.room_id}:{self.user_id}:{self.role}'


class RoomSheet(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='room_sheets')
    name = models.CharField(max_length=128)
    base_view = models.CharField(max_length=128, default='bi_obe_student_subject_wide')
    created_from_sheet = models.ForeignKey(
        Sheet,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pushed_copies',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='powerbi_created_room_sheets',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'PowerBI Room Sheet'
        verbose_name_plural = 'PowerBI Room Sheets'
        constraints = [
            models.UniqueConstraint(fields=['room', 'name'], name='uniq_powerbi_room_sheet_name'),
        ]
        ordering = ('-updated_at',)

    def __str__(self) -> str:
        return f'{self.room_id}:{self.name}'


class RoomSheetColumn(models.Model):
    room_sheet = models.ForeignKey(RoomSheet, on_delete=models.CASCADE, related_name='columns')
    source_view = models.CharField(max_length=128)
    source_column = models.CharField(max_length=128)
    header_label = models.CharField(max_length=128)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'PowerBI Room Sheet Column'
        verbose_name_plural = 'PowerBI Room Sheet Columns'
        ordering = ('sort_order', 'id')
        constraints = [
            models.UniqueConstraint(
                fields=['room_sheet', 'source_view', 'source_column'],
                name='uniq_powerbi_room_sheet_column_once',
            )
        ]

    def __str__(self) -> str:
        return f'{self.room_sheet_id}:{self.source_view}.{self.source_column}'


class PowerBIExportLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='powerbi_export_logs',
    )
    view_name = models.CharField(max_length=128)
    limit = models.IntegerField(null=True, blank=True)
    row_count = models.IntegerField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')
    export_type = models.CharField(max_length=8, default='xlsx')
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True)
    room_sheet = models.ForeignKey(RoomSheet, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'PowerBI Export Log'
        verbose_name_plural = 'PowerBI Export Logs'
        ordering = ('-created_at',)

    def __str__(self) -> str:
        who = getattr(self.user, 'username', None) or 'unknown'
        return f"{self.view_name} by {who} @ {self.created_at:%Y-%m-%d %H:%M:%S}"


class RoomJoinRequest(models.Model):
    STATUS_PENDING = 'PENDING'
    STATUS_APPROVED = 'APPROVED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    )

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='join_requests')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='powerbi_room_join_requests',
    )
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)

    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='powerbi_room_join_requests_decided',
    )
    decided_reason = models.TextField(blank=True, default='')
    decided_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'PowerBI Room Join Request'
        verbose_name_plural = 'PowerBI Room Join Requests'
        ordering = ('-updated_at',)
        constraints = [
            models.UniqueConstraint(fields=['room', 'user'], name='uniq_powerbi_room_join_request'),
        ]

    def __str__(self) -> str:
        return f'{self.room_id}:{self.user_id}:{self.status}'
