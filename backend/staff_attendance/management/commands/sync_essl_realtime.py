"""
Run a long-lived realtime sync from eSSL biometric device to AttendanceRecord.

Example:
  python manage.py sync_essl_realtime --ip 192.168.81.80 --port 4370
"""

from __future__ import annotations

import time

from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils import timezone

from staff_attendance.biometric import ingest_biometric_punch


class Command(BaseCommand):
    help = 'Continuously pull realtime punches from eSSL/ZKTeco device and sync to staff attendance'

    def add_arguments(self, parser):
        parser.add_argument('--ip', type=str, default=getattr(settings, 'ESSL_DEVICE_IP', '192.168.81.80'), help='Device IP address')
        parser.add_argument('--port', type=int, default=getattr(settings, 'ESSL_DEVICE_PORT', 4370), help='Device TCP port')
        parser.add_argument('--password', type=int, default=getattr(settings, 'ESSL_DEVICE_PASSWORD', 0), help='Device comm key/password')
        parser.add_argument('--timeout', type=int, default=getattr(settings, 'ESSL_CONNECT_TIMEOUT', 8), help='Connection timeout in seconds')
        parser.add_argument('--reconnect-delay', type=int, default=getattr(settings, 'ESSL_RECONNECT_DELAY', 5), help='Seconds before reconnect attempts')

    def _normalize_direction(self, punch_value):
        # ZKTeco punch state commonly uses 0=IN, 1=OUT.
        if punch_value in (0, '0', 'IN', 'in'):
            return 'IN'
        if punch_value in (1, '1', 'OUT', 'out'):
            return 'OUT'
        return 'UNKNOWN'

    def handle(self, *args, **options):
        try:
            from zk import ZK  # type: ignore
        except ImportError:
            self.stdout.write(self.style.ERROR('Missing dependency: pyzk. Install with: pip install pyzk'))
            return

        ip = options['ip']
        port = options['port']
        password = options['password']
        timeout = options['timeout']
        reconnect_delay = options['reconnect_delay']

        self.stdout.write(self.style.SUCCESS(
            f'Starting realtime eSSL sync for {ip}:{port} (Ctrl+C to stop)'
        ))

        while True:
            conn = None
            try:
                zk = ZK(ip, port=port, timeout=timeout, password=password, force_udp=False, ommit_ping=False)
                conn = zk.connect()
                conn.disable_device()
                self.stdout.write(self.style.SUCCESS(f'Connected to device {ip}:{port}'))
                conn.enable_device()

                for attendance in conn.live_capture(new_timeout=10):
                    if attendance is None:
                        continue

                    raw_uid = str(getattr(attendance, 'uid', '') or '')
                    raw_staff_id = str(getattr(attendance, 'user_id', '') or '')
                    raw_direction = self._normalize_direction(getattr(attendance, 'punch', None))
                    raw_timestamp = getattr(attendance, 'timestamp', None) or timezone.now()

                    result = ingest_biometric_punch(
                        raw_uid=raw_uid,
                        raw_staff_id=raw_staff_id,
                        raw_direction=raw_direction,
                        raw_timestamp=raw_timestamp,
                        source='essl_realtime_device',
                        device_ip=ip,
                        device_port=port,
                        payload={
                            'uid': raw_uid,
                            'user_id': raw_staff_id,
                            'punch': getattr(attendance, 'punch', None),
                            'timestamp': str(raw_timestamp),
                        },
                    )

                    staff_label = raw_staff_id or raw_uid or 'UNKNOWN'
                    mapped = 'mapped' if result['user'] else 'unmapped'
                    display_direction = result.get('effective_direction') or result['direction']
                    status_line = (
                        f"[{result['punch_time'].isoformat()}] {staff_label} "
                        f"{display_direction} ({mapped})"
                    )
                    self.stdout.write(status_line)

            except KeyboardInterrupt:
                self.stdout.write(self.style.WARNING('Stopping realtime sync on user interrupt.'))
                break
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f'Device sync error: {exc}'))
                self.stdout.write(f'Retrying in {reconnect_delay} seconds...')
                time.sleep(max(reconnect_delay, 1))
            finally:
                if conn is not None:
                    try:
                        conn.disconnect()
                    except Exception:
                        pass
