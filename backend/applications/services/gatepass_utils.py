"""Shared gatepass utility helpers.

These helpers extract date/time information from ApplicationData and compute
hard-expiry boundaries. Kept in a separate module so both idcsscan views and
management commands can import them without creating circular dependencies.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional

from django.utils import timezone
from django.utils.dateparse import parse_date

from applications import models as app_models


# ── Internal parsers ───────────────────────────────────────────────────────

def _parse_any_date(value) -> Optional[date]:
    raw = str(value or "").strip()
    if not raw:
        return None
    d = parse_date(raw)
    if d:
        return d
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _parse_clock_time(value) -> Optional[time]:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    for fmt in ("%I:%M %p", "%I:%M:%S %p"):
        try:
            return datetime.strptime(raw.upper(), fmt).time()
        except ValueError:
            continue
    return None


# ── Public API ─────────────────────────────────────────────────────────────

def extract_gate_date(app: app_models.Application) -> Optional[date]:
    """Best-effort extraction of the gatepass date from application data.

    Supports composite DATE IN OUT / DATE OUT IN fields and plain DATE fields.
    Returns None if the date cannot be determined.
    """
    rows = app.data.select_related("field").all()
    for row in sorted(rows, key=lambda r: (getattr(r.field, "order", 0), getattr(r.field, "field_key", ""))):
        ftype = str(getattr(row.field, "field_type", "") or "").upper()
        value = row.value

        if ftype in ("DATE IN OUT", "DATE OUT IN"):
            payload = value if isinstance(value, dict) else {}
            day = _parse_any_date(payload.get("date"))
            if day:
                return day

        if ftype == "DATE":
            if isinstance(value, dict) and "date" in value:
                day = _parse_any_date(value.get("date"))
            else:
                day = _parse_any_date(value)
            if day:
                return day

    return None


def gatepass_hard_expiry(app: app_models.Application) -> Optional[datetime]:
    """Return the hard expiry datetime (midnight of the day after the gatepass date).

    Returns None when the date cannot be extracted from the application data.
    """
    base_day = extract_gate_date(app)
    if base_day is None:
        return None
    tz = timezone.get_current_timezone()
    return timezone.make_aware(
        datetime.combine(base_day + timedelta(days=1), time.min), tz
    )


def is_gatepass_application(app: app_models.Application) -> bool:
    """Return True when the application is a gatepass (by application_type code/name)."""
    try:
        at = getattr(app, "application_type", None)
        code = str(getattr(at, "code", "") or "").strip().upper()
        name = str(getattr(at, "name", "") or "").strip().upper()
        return code == "GATEPASS" or name == "GATEPASS" or "GATEPASS" in name
    except Exception:
        return False
