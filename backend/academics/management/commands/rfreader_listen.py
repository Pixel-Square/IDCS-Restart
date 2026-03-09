import time
from typing import Optional, Tuple

from django.core.management.base import BaseCommand
from django.utils import timezone

from academics.models import RFReaderGate, RFReaderStudent, RFReaderScan


def _parse_line(line: str) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Parse a CSV-ish line from the reader.

    Supported formats:
    - UID
    - UID,ROLL
    - UID,ROLL,NAME
    - UID,ROLL,NAME,IMPRES

    Returns (uid, roll, name, impres).
    """
    raw = (line or '').strip()
    if not raw:
        return None, None, None, None

    parts = [p.strip() for p in raw.split(',') if p.strip()]
    if not parts:
        return None, None, None, None

    uid = parts[0].upper()
    roll = parts[1] if len(parts) >= 2 else None
    name = parts[2] if len(parts) >= 3 else None
    impres = parts[3] if len(parts) >= 4 else None
    return uid, roll, name, impres


class Command(BaseCommand):
    help = 'Listen to an RF reader over serial (USB) and store scans in the DB.'

    def add_arguments(self, parser):
        parser.add_argument('--port', required=True, help='Serial port (e.g. COM13 or /dev/ttyUSB0)')
        parser.add_argument('--baud', type=int, default=115200, help='Baud rate (default: 115200)')
        parser.add_argument('--gate', default='Default Gate', help='Gate name to attach scans to')
        parser.add_argument(
            '--create-student-from-line',
            action='store_true',
            help='If line includes roll/name/impres, auto-create/update RFReaderStudent records.',
        )

    def handle(self, *args, **opts):
        try:
            import serial  # type: ignore
        except Exception as e:
            raise SystemExit(
                'pyserial is required. Add it to requirements and install it. Error: %s' % (e,)
            )

        port: str = opts['port']
        baud: int = opts['baud']
        gate_name: str = opts['gate']
        create_student: bool = bool(opts['create_student_from_line'])

        gate, _ = RFReaderGate.objects.get_or_create(name=gate_name, defaults={'is_active': True})

        self.stdout.write(self.style.SUCCESS(f'RFReader listening on {port} @ {baud}'))
        self.stdout.write('Tip: Close Arduino Serial Monitor to avoid "port busy" errors.')

        ser = serial.Serial(
            port=port,
            baudrate=baud,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1,
            xonxoff=False,
            rtscts=False,
            dsrdtr=False,
        )

        try:
            while True:
                try:
                    raw = ser.readline()
                    if not raw:
                        continue
                    line = raw.decode('utf-8', errors='ignore').strip()
                    if not line:
                        continue

                    uid, roll, name, impres = _parse_line(line)
                    if not uid:
                        continue

                    student = None
                    if uid:
                        student = RFReaderStudent.objects.filter(rf_uid__iexact=uid).first()

                    if create_student and roll:
                        obj, _created = RFReaderStudent.objects.update_or_create(
                            roll_no=roll,
                            defaults={
                                'name': name or (student.name if student else roll),
                                'impres_code': impres or (student.impres_code if student else ''),
                                'rf_uid': uid,
                                'is_active': True,
                            },
                        )
                        student = obj

                    RFReaderScan.objects.create(
                        gate=gate,
                        uid=uid,
                        student=student,
                        raw_line=line,
                        source='SERIAL',
                        scanned_at=timezone.now(),
                    )

                    disp = f'{uid}'
                    if student:
                        disp += f' -> {student.roll_no} {student.name}'
                    self.stdout.write(self.style.SUCCESS(f'SCAN: {disp}'))
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    self.stderr.write(f'Error: {e}')
                    time.sleep(0.25)
        finally:
            try:
                ser.close()
            except Exception:
                pass
            self.stdout.write('Stopped.')
