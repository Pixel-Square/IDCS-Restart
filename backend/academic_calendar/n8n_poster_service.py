"""
academic_calendar/n8n_poster_service.py

Fires an n8n webhook whenever an AcademicCalendarEvent is created or updated so
that n8n can:
  1. Transform the event payload into Canva Autofill template variables.
  2. Call the Canva Design Autofill API to populate the branding poster template.
  3. Export the filled design as PNG/PDF.
  4. POST the result back to /api/academic-calendar/events/<id>/poster-callback/.

Configuration (add to .env / erp/settings.py):
  N8N_BRANDING_WEBHOOK_URL   = https://your-n8n.example.com/webhook/canva-poster
  N8N_WEBHOOK_SECRET         = <shared-secret-for-callback-validation>
  IDCS_BACKEND_URL           = https://idcs.krgi.co.in   (no trailing slash)
  CANVA_BRANDING_TEMPLATE_ID = <Canva brand-template-id>
"""
from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING

import requests
from django.conf import settings

if TYPE_CHECKING:
    from .models import AcademicCalendarEvent

logger = logging.getLogger(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _setting(name: str, default: str = '') -> str:
    return str(getattr(settings, name, '') or default).strip()


def _build_payload(event: 'AcademicCalendarEvent') -> dict:
    """
    Convert an AcademicCalendarEvent into the flat branding-poster payload
    expected by the n8n workflow.  All 27 fields required by the Canva template
    are included.  The caller may merge in extra data from event.branding_data
    before this payload is sent.
    """
    bd: dict = event.branding_data or {}

    # Date decomposition
    sd = event.start_date  # date object
    ed = event.end_date

    import calendar
    start_month = sd.strftime('%B') if sd else ''          # e.g. "March"
    start_day   = str(sd.day) if sd else ''                # e.g. "14"
    end_day     = str(ed.day) if ed else start_day         # e.g. "15"
    year_str    = str(sd.year) if sd else ''               # e.g. "2026"

    # Callback URL so n8n can POST the result back
    backend_url = _setting('IDCS_BACKEND_URL')
    callback_url = f'{backend_url}/api/academic-calendar/events/{event.id}/poster-callback/'

    payload = {
        # ── Event identity ────────────────────────────────────────────────────
        'event_id':             str(event.id),
        'callback_url':         callback_url,
        'secret':               _setting('N8N_WEBHOOK_SECRET'),
        'brand_template_id':    _setting('CANVA_BRANDING_TEMPLATE_ID'),
        'export_format':        bd.get('export_format', 'png'),

        # ── Canva template variable fields ────────────────────────────────────
        'event_name':               bd.get('event_name', event.title),
        'organizer_department':     bd.get('organizer_department', event.audience_department or ''),
        'start_month':              bd.get('start_month', start_month),
        'start_day':                bd.get('start_day', start_day),
        'end_day':                  bd.get('end_day', end_day),
        'year':                     bd.get('year', year_str),
        'event_time':               bd.get('event_time', ''),
        'venue_location':           bd.get('venue_location', ''),

        # Chief guest
        'chief_guest_name':         bd.get('chief_guest_name', ''),
        'chief_guest_position':     bd.get('chief_guest_position', ''),
        'chief_guest_company':      bd.get('chief_guest_company', ''),
        'chief_guest_location':     bd.get('chief_guest_location', ''),
        'chief_guest_photo_url':    bd.get('chief_guest_photo_url', ''),

        # Committee members (up to 6)
        'committee_member_1_name':  bd.get('committee_member_1_name', ''),
        'committee_member_1_role':  bd.get('committee_member_1_role', ''),
        'committee_member_2_name':  bd.get('committee_member_2_name', ''),
        'committee_member_2_role':  bd.get('committee_member_2_role', ''),
        'committee_member_3_name':  bd.get('committee_member_3_name', ''),
        'committee_member_3_role':  bd.get('committee_member_3_role', ''),
        'committee_member_4_name':  bd.get('committee_member_4_name', ''),
        'committee_member_4_role':  bd.get('committee_member_4_role', ''),
        'committee_member_5_name':  bd.get('committee_member_5_name', ''),
        'committee_member_5_role':  bd.get('committee_member_5_role', ''),
        'committee_member_6_name':  bd.get('committee_member_6_name', ''),
        'committee_member_6_role':  bd.get('committee_member_6_role', ''),

        # Socials / QR
        'qr_code_image_url':        bd.get('qr_code_image_url', ''),
        'website_text':             bd.get('website_text', ''),
        'instagram_handle':         bd.get('instagram_handle', ''),
    }
    return payload


# ── Public API ────────────────────────────────────────────────────────────────

def fire_n8n_branding(event: 'AcademicCalendarEvent') -> None:
    """
    Send the branding-poster payload to n8n synchronously.
    Marks the event as 'generating' before the call and 'failed' on error.
    Call fire_n8n_branding_async for a non-blocking fire-and-forget variant.
    """
    webhook_url = _setting('N8N_BRANDING_WEBHOOK_URL')
    if not webhook_url:
        logger.info(
            'N8N_BRANDING_WEBHOOK_URL is not configured — skipping poster generation '
            'for event %s', event.id,
        )
        return

    template_id = _setting('CANVA_BRANDING_TEMPLATE_ID')
    if not template_id:
        logger.warning(
            'CANVA_BRANDING_TEMPLATE_ID is not configured — skipping poster generation '
            'for event %s', event.id,
        )
        return

    payload = _build_payload(event)

    # Mark as generating (best-effort — do not crash if DB write fails)
    try:
        type(event).objects.filter(pk=event.pk).update(
            branding_poster_status='generating',
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning('Could not mark event %s as generating: %s', event.id, exc)

    try:
        resp = requests.post(
            webhook_url,
            json=payload,
            timeout=10,
            headers={'Content-Type': 'application/json'},
        )
        resp.raise_for_status()
        logger.info('n8n branding trigger sent for event %s → HTTP %s', event.id, resp.status_code)
    except requests.RequestException as exc:
        logger.error('n8n branding trigger FAILED for event %s: %s', event.id, exc)
        try:
            type(event).objects.filter(pk=event.pk).update(
                branding_poster_status='failed',
            )
        except Exception:  # noqa: BLE001
            pass


def fire_n8n_branding_async(event: 'AcademicCalendarEvent') -> None:
    """
    Non-blocking wrapper around fire_n8n_branding.
    Spawns a daemon thread so the HTTP response is returned immediately.
    """
    # Pass the pk so the thread can reload the event if needed.
    event_id = event.pk

    def _run() -> None:
        # Re-fetch inside the thread to get a fresh DB state
        from .models import AcademicCalendarEvent as _Ev
        try:
            ev = _Ev.objects.get(pk=event_id)
        except _Ev.DoesNotExist:
            return
        fire_n8n_branding(ev)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
