from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from django.db import IntegrityError
from django.utils import timezone

from academics.models import StaffProfile
from .models import AttendanceRecord, StaffBiometricPunchLog


def normalize_uid(raw_uid: str) -> str:
    return (raw_uid or '').strip().upper()


def normalize_staff_id(raw_staff_id: str) -> str:
    return (raw_staff_id or '').strip()


def normalize_direction(raw_direction: str) -> str:
    value = (raw_direction or '').strip().upper()
    if value in ('IN', 'CHECKIN', 'CHECK_IN', '0'):
        return StaffBiometricPunchLog.Direction.IN
    if value in ('OUT', 'CHECKOUT', 'CHECK_OUT', '1'):
        return StaffBiometricPunchLog.Direction.OUT
    return StaffBiometricPunchLog.Direction.UNKNOWN


def parse_punch_time(raw_value) -> Optional[datetime]:
    if isinstance(raw_value, datetime):
        dt = raw_value
    elif isinstance(raw_value, str):
        raw = raw_value.strip()
        if not raw:
            return None
        try:
            dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        except ValueError:
            return None
    else:
        return None

    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return timezone.localtime(dt)


def resolve_staff_user(raw_staff_id: str = '', raw_uid: str = ''):
    staff_id = normalize_staff_id(raw_staff_id)
    uid = normalize_uid(raw_uid)

    if staff_id:
        profile = StaffProfile.objects.select_related('user').filter(staff_id=staff_id).first()
        if profile and profile.user:
            return profile.user

    if uid:
        profile = StaffProfile.objects.select_related('user').filter(rfid_uid__iexact=uid).first()
        if profile and profile.user:
            return profile.user

    return None


def _seed_record_defaults(record: AttendanceRecord):
    if record.fn_status is None and (record.morning_in or record.evening_out):
        record.fn_status = 'absent'
    if record.an_status is None and (record.morning_in or record.evening_out):
        record.an_status = 'absent'


def upsert_attendance_from_punch(user, punch_dt: datetime, direction: str, source: str = 'essl_realtime'):
    local_dt = timezone.localtime(punch_dt)
    target_date = local_dt.date()
    punch_time = local_dt.time().replace(microsecond=0)

    record, created = AttendanceRecord.objects.get_or_create(
        user=user,
        date=target_date,
        defaults={
            'morning_in': None,
            'evening_out': None,
            'status': 'absent',
            'fn_status': 'absent',
            'an_status': 'absent',
            'source_file': source,
        },
    )

    changed = False
    effective_direction = StaffBiometricPunchLog.Direction.IN

    # Self-heal stale/invalid data from older/manual flows where OUT was stored
    # equal to or earlier than IN (e.g., 08:32/08:32). Realtime policy should
    # always treat this as no valid OUT yet.
    if record.morning_in and record.evening_out and record.evening_out <= record.morning_in:
        record.evening_out = None
        changed = True

    # Realtime policy:
    # - First punch of the date is stored as IN (morning_in)
    # - OUT (evening_out) is stored only when a punch arrives at least 30 minutes after morning_in
    # - Punches before that 30-min threshold are ignored for attendance (but still logged in StaffBiometricPunchLog)
    if not record.morning_in:
        record.morning_in = punch_time
        changed = True
    else:
        morning_dt = datetime.combine(target_date, record.morning_in)
        punch_dt_local = datetime.combine(target_date, punch_time)

        # Protect against clock anomalies where punch_time is earlier than morning_in.
        if punch_dt_local < morning_dt:
            punch_dt_local = morning_dt

        if (punch_dt_local - morning_dt) < timedelta(minutes=30):
            # Too soon: skip setting OUT.
            effective_direction = 'SKIPPED'
        else:
            effective_direction = StaffBiometricPunchLog.Direction.OUT
            if not record.evening_out or punch_time > record.evening_out:
                record.evening_out = punch_time
                changed = True

    if created:
        changed = True

    if changed:
        should_defer_an_until_out = bool(record.morning_in and not record.evening_out)
        _seed_record_defaults(record)
        record.source_file = source
        record.update_status(defer_an_until_out=should_defer_an_until_out)
        record.save()

    return record, created, changed, effective_direction


def ingest_biometric_punch(*, raw_uid: str = '', raw_staff_id: str = '', raw_direction: str = '', raw_timestamp=None,
                           source: str = 'essl_realtime', device_ip: str = '', device_port: Optional[int] = None,
                           payload: Optional[dict] = None):
    payload = payload or {}
    direction = normalize_direction(raw_direction)
    punch_dt = parse_punch_time(raw_timestamp)
    if punch_dt is None:
        punch_dt = timezone.localtime(timezone.now())

    raw_uid_norm = normalize_uid(raw_uid)
    raw_staff_id_norm = normalize_staff_id(raw_staff_id)

    user = resolve_staff_user(raw_staff_id=raw_staff_id_norm, raw_uid=raw_uid_norm)

    try:
        log = StaffBiometricPunchLog.objects.create(
            user=user,
            raw_uid=raw_uid_norm,
            raw_staff_id=raw_staff_id_norm,
            punch_time=punch_dt,
            direction=direction,
            source=source,
            device_ip=device_ip or None,
            device_port=device_port,
            payload=payload,
        )
        created_log = True
    except IntegrityError:
        # Duplicate punch from device retries; treat as already ingested.
        log = StaffBiometricPunchLog.objects.filter(
            raw_uid=raw_uid_norm,
            raw_staff_id=raw_staff_id_norm,
            punch_time=punch_dt,
            direction=direction,
            source=source,
        ).first()
        created_log = False

    attendance_record = None
    attendance_updated = False
    effective_direction = direction
    if user:
        attendance_record, _, attendance_updated, effective_direction = upsert_attendance_from_punch(
            user=user,
            punch_dt=punch_dt,
            direction=direction,
            source=source,
        )

    return {
        'user': user,
        'log': log,
        'created_log': created_log,
        'attendance_record': attendance_record,
        'attendance_updated': attendance_updated,
        'direction': direction,
        'effective_direction': effective_direction,
        'punch_time': punch_dt,
    }
