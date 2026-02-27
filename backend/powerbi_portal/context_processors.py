from __future__ import annotations

from typing import Dict

from .models import RoomJoinRequest, Room


def powerbi_notifications(request) -> Dict[str, int]:
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return {'powerbi_notifications_count': 0}

    if getattr(user, 'is_superuser', False):
        # Superusers can act as leaders for all rooms.
        pending = RoomJoinRequest.objects.filter(status=RoomJoinRequest.STATUS_PENDING).count()
        return {'powerbi_notifications_count': int(pending)}

    room_ids = list(Room.objects.filter(leader=user).values_list('id', flat=True))
    if not room_ids:
        return {'powerbi_notifications_count': 0}

    pending = RoomJoinRequest.objects.filter(room_id__in=room_ids, status=RoomJoinRequest.STATUS_PENDING).count()
    return {'powerbi_notifications_count': int(pending)}
