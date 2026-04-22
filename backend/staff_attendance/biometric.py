from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from django.db import IntegrityError
from django.utils import timezone

from academics.models import StaffProfile
from .models import AttendanceRecord, AttendanceSettings, Holiday, StaffBiometricPunchLog


def _resolve_user_department_id(user) -> Optional[int]:
    try:
        profile = getattr(user, 'staff_profile', None)
        if not profile:
            return None

        # Prefer current-department resolver.
        if hasattr(profile, 'get_current_department'):
            try:
                dept = profile.get_current_department()
                if dept:
                    return dept.id
            except Exception:
                pass

        dept = getattr(profile, 'department', None)
        return getattr(dept, 'id', None)
    except Exception:
        return None


def _is_holiday_for_user(target_date, user) -> bool:
    # Sunday is always treated as holiday.
    try:
        if target_date.weekday() == 6:
            return True
    except Exception:
        pass

    holidays = Holiday.objects.filter(date=target_date).prefetch_related('departments')
    if not holidays.exists():
        return False

    user_dept_id = _resolve_user_department_id(user)
    for holiday in holidays:
        dept_ids = list(holiday.departments.values_list('id', flat=True))
        if not dept_ids:
            return True
        if user_dept_id is not None and user_dept_id in dept_ids:
            return True

    return False


def _is_approved_vacation_day(target_date, user) -> bool:
    """Return True when user has approved, non-cancelled vacation on target_date."""
    try:
        from staff_requests.models import StaffRequest

        qs = StaffRequest.objects.filter(
            applicant=user,
            status='approved',
            template__name__in=['Vacation Application', 'Vacation Application - SPL'],
        )

        target_iso = target_date.isoformat()
        for req in qs:
            form_data = req.form_data or {}
            if bool(form_data.get('vacation_cancelled')):
                continue
            from_iso = str(form_data.get('from_date') or '')
            to_iso = str(form_data.get('to_date') or from_iso)
            if not from_iso:
                continue
            if from_iso <= target_iso <= to_iso:
                return True
    except Exception:
        return False
    return False


def _backfill_absent_gaps_for_realtime(*, user, current_date, source: str) -> int:
    """Create absent rows for missing working days before `current_date`.

    Policy:
    - Only fills dates that have no AttendanceRecord row yet.
    - Skips Sundays + department-aware holidays.
    - Limits the fill window to avoid creating huge ranges on first-ever punch.
    """
    MAX_BACKFILL_DAYS = 31

    last_date = (
        AttendanceRecord.objects.filter(user=user, date__lt=current_date)
        .order_by('-date')
        .values_list('date', flat=True)
        .first()
    )
    if not last_date:
        return 0

    if last_date >= current_date:
        return 0

    start_date = last_date + timedelta(days=1)
    min_start = current_date - timedelta(days=MAX_BACKFILL_DAYS)
    if start_date < min_start:
        start_date = min_start

    if start_date >= current_date:
        return 0

    existing_dates = set(
        AttendanceRecord.objects.filter(user=user, date__gte=start_date, date__lt=current_date)
        .values_list('date', flat=True)
    )

    created = 0
    cursor = start_date
    while cursor < current_date:
        if (
            cursor not in existing_dates
            and not _is_holiday_for_user(cursor, user)
            and not _is_approved_vacation_day(cursor, user)
        ):
            AttendanceRecord.objects.create(
                user=user,
                date=cursor,
                morning_in=None,
                evening_out=None,
                fn_status='absent',
                an_status='absent',
                status='absent',
                source_file=source,
                notes=f'Auto-marked absent (no biometric data; inferred from next punch on {current_date})',
            )
            created += 1
        cursor += timedelta(days=1)

    return created


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


def _resolve_essl_skip_minutes() -> int:
    """Resolve fallback skip window for realtime eSSL punch mapping."""
    default_minutes = 30
    try:
        settings = AttendanceSettings.objects.first()
        if settings and settings.essl_skip_minutes is not None:
            return max(0, int(settings.essl_skip_minutes))
    except Exception:
        return default_minutes
    return default_minutes



def force_upsert_attendance_for_date(user, target_date, sorted_punches, source: str = 'essl_manual_retrieval'):
    """Rebuild attendance for (user, date) from scratch using all eSSL punches.

    Unlike upsert_attendance_from_punch (which never overwrites existing data),
    this function replaces morning_in / evening_out with the true earliest IN
    and latest valid OUT derived from the supplied punches, sorted chronologically.

    This is used exclusively during manual eSSL data retrieval so that existing
    attendance data is always refreshed with the authoritative machine data.
    """
    if not sorted_punches:
        return None, False

    skip_minutes = _resolve_essl_skip_minutes()
    is_vacation_day = _is_approved_vacation_day(target_date, user)

    # Determine true morning_in (earliest punch time) and evening_out (latest
    # punch at least skip_minutes after morning_in).
    morning_in = None
    evening_out = None

    for punch_dt in sorted_punches:
        local_dt = timezone.localtime(punch_dt)
        punch_time = local_dt.time().replace(microsecond=0)

        if morning_in is None:
            morning_in = punch_time
            continue

        morning_dt = datetime.combine(target_date, morning_in)
        punch_dt_combined = datetime.combine(target_date, punch_time)

        if punch_dt_combined < morning_dt:
            punch_dt_combined = morning_dt

        if (punch_dt_combined - morning_dt) >= timedelta(minutes=skip_minutes):
            if evening_out is None or punch_time > evening_out:
                evening_out = punch_time

    record, created = AttendanceRecord.objects.get_or_create(
        user=user,
        date=target_date,
        defaults={
            'morning_in': morning_in,
            'evening_out': evening_out,
            'status': 'vacation' if is_vacation_day else 'absent',
            'fn_status': None if is_vacation_day else 'absent',
            'an_status': None if is_vacation_day else 'absent',
            'source_file': source,
        },
    )

    changed = created

    if not created:
        # Overwrite with authoritative machine data
        if record.morning_in != morning_in:
            record.morning_in = morning_in
            changed = True
        if record.evening_out != evening_out:
            record.evening_out = evening_out
            changed = True

    # Vacation policy
    if is_vacation_day:
        if record.fn_status is not None:
            record.fn_status = None
            changed = True
        if record.an_status is not None:
            record.an_status = None
            changed = True
        if record.status != 'vacation':
            record.status = 'vacation'
            changed = True
    else:
        if changed:
            _seed_record_defaults(record)
            should_defer_an_until_out = bool(record.morning_in and not record.evening_out)
            record.update_status(defer_an_until_out=should_defer_an_until_out)

    if changed:
        record.source_file = source
        record.save()

    return record, changed


def upsert_attendance_from_punch(user, punch_dt: datetime, direction: str, source: str = 'essl_realtime'):

    local_dt = timezone.localtime(punch_dt)
    target_date = local_dt.date()
    punch_time = local_dt.time().replace(microsecond=0)
    is_vacation_day = _is_approved_vacation_day(target_date, user)

    # If the staff has scans on a later date, any missing *working* dates between
    # last saved attendance and this punch date should be created as absent.
    # (Holidays + Sundays are excluded.)
    gap_created = _backfill_absent_gaps_for_realtime(user=user, current_date=target_date, source=source)
    if gap_created > 0:
        # Keep LOP in sync when realtime creates inferred absences.
        # Best-effort: do not fail ingestion if balance sync fails.
        try:
            from django.core.management import call_command

            call_command('sync_absent_to_lop', user=getattr(user, 'username', ''))
        except Exception:
            pass

    record, created = AttendanceRecord.objects.get_or_create(
        user=user,
        date=target_date,
        defaults={
            'morning_in': None,
            'evening_out': None,
            'status': 'vacation' if is_vacation_day else 'absent',
            'fn_status': None if is_vacation_day else 'absent',
            'an_status': None if is_vacation_day else 'absent',
            'source_file': source,
        },
    )

    changed = False
    effective_direction = StaffBiometricPunchLog.Direction.IN
    skip_minutes = _resolve_essl_skip_minutes()

    # Self-heal stale/invalid data from older/manual flows where OUT was stored
    # equal to or earlier than IN (e.g., 08:32/08:32). Realtime policy should
    # always treat this as no valid OUT yet.
    if record.morning_in and record.evening_out and record.evening_out <= record.morning_in:
        record.evening_out = None
        changed = True

    # Realtime policy:
    # - First punch of the date is stored as IN (morning_in)
    # - OUT (evening_out) is stored only when a punch arrives at least `essl_skip_minutes` after morning_in
    # - Punches before that threshold are ignored for attendance (but still logged in StaffBiometricPunchLog)
    if not record.morning_in:
        record.morning_in = punch_time
        changed = True
    else:
        morning_dt = datetime.combine(target_date, record.morning_in)
        punch_dt_local = datetime.combine(target_date, punch_time)

        # Protect against clock anomalies where punch_time is earlier than morning_in.
        if punch_dt_local < morning_dt:
            punch_dt_local = morning_dt

        if (punch_dt_local - morning_dt) < timedelta(minutes=skip_minutes):
            # Too soon: skip setting OUT.
            effective_direction = 'SKIPPED'
        else:
            effective_direction = StaffBiometricPunchLog.Direction.OUT
            if not record.evening_out or punch_time > record.evening_out:
                record.evening_out = punch_time
                changed = True

    if created:
        changed = True

    # Vacation day policy: keep biometric in/out values only, no FN/AN or normal status writes.
    if is_vacation_day:
        if record.fn_status is not None:
            record.fn_status = None
            changed = True
        if record.an_status is not None:
            record.an_status = None
            changed = True
        if record.status != 'vacation':
            record.status = 'vacation'
            changed = True

        if changed:
            record.source_file = source
            record.save()
        return record, created, changed, effective_direction

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
