from __future__ import annotations

import secrets

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .biometric import ingest_biometric_punch


class BiometricRealtimeIngestView(APIView):
    """
    Real-time ingestion endpoint for biometric punches.

    Expected JSON payload:
    {
      "device_ip": "192.168.81.80",
      "device_port": 4370,
      "records": [
        {
          "uid": "539EA5BB",
          "staff_id": "3171022",
          "direction": "IN",
          "timestamp": "2026-03-25T08:58:00+05:30"
        }
      ]
    }

    Security:
    - If STAFF_BIOMETRIC_INGEST_KEY is set in settings/env, caller must pass
      header X-Biometric-Key with that value.
    - If the key is not set, endpoint requires an authenticated user.
    """

    permission_classes = [AllowAny]

    def _is_key_valid(self, request) -> bool:
        expected_key = getattr(settings, 'STAFF_BIOMETRIC_INGEST_KEY', '') or ''
        if not expected_key:
            return False
        provided = request.headers.get('X-Biometric-Key', '')
        return bool(provided) and secrets.compare_digest(provided, expected_key)

    def post(self, request, *args, **kwargs):
        expected_key = getattr(settings, 'STAFF_BIOMETRIC_INGEST_KEY', '') or ''
        if expected_key:
            if not self._is_key_valid(request):
                return Response({'detail': 'Invalid biometric ingest key.'}, status=status.HTTP_403_FORBIDDEN)
        elif not request.user or not request.user.is_authenticated:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        payload = request.data if isinstance(request.data, dict) else {}
        records = payload.get('records')
        if not isinstance(records, list):
            records = [payload]

        if not records:
            return Response({'error': 'records is required and must contain at least one item.'}, status=status.HTTP_400_BAD_REQUEST)

        device_ip = str(payload.get('device_ip') or '').strip()
        device_port = payload.get('device_port')
        if device_port is not None:
            try:
                device_port = int(device_port)
            except (TypeError, ValueError):
                device_port = None

        created_logs = 0
        duplicate_logs = 0
        attendance_updates = 0
        unresolved = []
        errors = []

        for idx, raw in enumerate(records[:5000], start=1):
            if not isinstance(raw, dict):
                errors.append({'index': idx, 'error': 'record must be an object'})
                continue

            uid = str(raw.get('uid') or raw.get('rfid_uid') or '').strip()
            staff_id = str(raw.get('staff_id') or raw.get('user_id') or '').strip()
            direction = str(raw.get('direction') or raw.get('punch_state') or '').strip()
            timestamp = raw.get('timestamp') or raw.get('recorded_at') or raw.get('punch_time')

            result = ingest_biometric_punch(
                raw_uid=uid,
                raw_staff_id=staff_id,
                raw_direction=direction,
                raw_timestamp=timestamp,
                source='essl_realtime_api',
                device_ip=device_ip,
                device_port=device_port,
                payload=raw,
            )

            if result['created_log']:
                created_logs += 1
            else:
                duplicate_logs += 1

            if result['attendance_updated']:
                attendance_updates += 1

            if result['user'] is None:
                unresolved.append({
                    'index': idx,
                    'uid': uid,
                    'staff_id': staff_id,
                    'reason': 'No matching StaffProfile by staff_id or rfid_uid',
                })

        return Response({
            'success': True,
            'total_received': len(records[:5000]),
            'created_logs': created_logs,
            'duplicate_logs': duplicate_logs,
            'attendance_updates': attendance_updates,
            'unresolved_count': len(unresolved),
            'unresolved': unresolved[:100],
            'errors': errors[:100],
        }, status=status.HTTP_200_OK)
