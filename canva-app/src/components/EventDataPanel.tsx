/**
 * EventDataPanel.tsx
 *
 * The main tab of the IDCS Poster Maker Canva App.
 *
 * Features:
 *  - Manual event fields (title, venue, date/time, coordinator, chief guests, dept)
 *  - Optional: load a pending event from IDCS via the REST API
 *  - "Add to Design" button per field → inserts a styled text element via @canva/design
 *  - "Add All" button → inserts all filled fields in one click
 */
import React, { useCallback, useEffect, useState } from 'react';
import { insertText, insertTextGroup } from '../utils/canvaHelpers';
import { fetchPendingEvents, type IDCSEvent } from '../utils/idcsApi';

// ── Toast helper ───────────────────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const show = useCallback((text: string, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 2200);
  }, []);
  return { msg, show };
}

// ── Field config ───────────────────────────────────────────────────────────────

interface FieldDef {
  key:       keyof FormState;
  label:     string;
  placeholder: string;
  multiline?: boolean;
  fontSize:  number;
  fontWeight: 'normal' | 'bold';
  color:     string;
}

const FIELDS: FieldDef[] = [
  { key: 'title',        label: 'Event Title',         placeholder: 'e.g. National Seminar on AI',          fontSize: 36, fontWeight: 'bold',   color: '#1a1a1a',  multiline: false },
  { key: 'department',   label: 'Department',          placeholder: 'e.g. Dept. of Computer Science',       fontSize: 20, fontWeight: 'normal', color: '#4b5563'  },
  { key: 'venue',        label: 'Venue',               placeholder: 'e.g. Seminar Hall, Block A',           fontSize: 18, fontWeight: 'normal', color: '#374151'  },
  { key: 'dateTime',     label: 'Date & Time',         placeholder: 'e.g. 15 March 2026, 10:00 AM',         fontSize: 20, fontWeight: 'bold',   color: '#7c3aed'  },
  { key: 'coordinator',  label: 'Coordinator(s)',      placeholder: 'e.g. Dr. A. Kumar, Prof. S. Ravi',     fontSize: 14, fontWeight: 'normal', color: '#6b7280',  multiline: true  },
  { key: 'chiefGuest',   label: 'Chief Guest(s)',      placeholder: 'e.g. Mr. John Doe, CEO of XYZ Corp',   fontSize: 16, fontWeight: 'normal', color: '#1d4ed8',  multiline: true  },
  { key: 'organizer',    label: 'Organized by',        placeholder: 'e.g. IQAC, KRGI College',              fontSize: 14, fontWeight: 'normal', color: '#6b7280'  },
  { key: 'contact',      label: 'Contact / RSVP',      placeholder: 'e.g. +91 99999 00000',                 fontSize: 13, fontWeight: 'normal', color: '#6b7280'  },
  { key: 'hashtag',      label: 'Hashtag / Tagline',   placeholder: 'e.g. #AIForAll',                       fontSize: 15, fontWeight: 'bold',   color: '#7c3aed'  },
];

interface FormState {
  title:       string;
  department:  string;
  venue:       string;
  dateTime:    string;
  coordinator: string;
  chiefGuest:  string;
  organizer:   string;
  contact:     string;
  hashtag:     string;
}

const EMPTY: FormState = {
  title: '', department: '', venue: '', dateTime: '',
  coordinator: '', chiefGuest: '', organizer: '', contact: '', hashtag: '',
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function EventDataPanel() {
  const [form, setForm]             = useState<FormState>(EMPTY);
  const [loading, setLoading]       = useState(false);
  const [events, setEvents]         = useState<IDCSEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const { msg: toast, show: showToast } = useToast();

  // ── Load pending events from IDCS ──────────────────────────────────────────
  async function loadEvents() {
    setLoading(true);
    const list = await fetchPendingEvents();
    setEvents(list);
    setEventsLoaded(true);
    setLoading(false);
  }

  // Populate form from a fetched IDCS event
  function populateFromEvent(ev: IDCSEvent) {
    setForm({
      title:       ev.title ?? '',
      department:  '',
      venue:       ev.venue ?? '',
      dateTime:    ev.dateTime ?? '',
      coordinator: ev.createdByName ?? '',
      chiefGuest:  (ev.chiefGuests ?? []).join(', '),
      organizer:   '',
      contact:     '',
      hashtag:     '',
    });
    showToast(`Loaded: ${ev.title}`);
  }

  // ── Insert handlers ────────────────────────────────────────────────────────

  async function handleInsertField(field: FieldDef) {
    const text = form[field.key].trim();
    if (!text) return;
    try {
      await insertText({ text, fontSize: field.fontSize, fontWeight: field.fontWeight, color: field.color });
      showToast(`"${field.label}" added ✓`);
    } catch (err) {
      showToast('Add to Design failed — open in Canva first.', true);
      console.error(err);
    }
  }

  async function handleInsertAll() {
    const items = FIELDS
      .filter((f) => form[f.key].trim())
      .map((f) => ({
        text:       form[f.key].trim(),
        fontSize:   f.fontSize,
        fontWeight: f.fontWeight,
        color:      f.color,
      }));
    if (items.length === 0) { showToast('Fill in at least one field first.', true); return; }
    try {
      await insertTextGroup(items);
      showToast(`${items.length} elements added ✓`);
    } catch (err) {
      showToast('Add to Design failed — open in Canva first.', true);
      console.error(err);
    }
  }

  const hasAny = FIELDS.some((f) => form[f.key].trim() !== '');

  return (
    <div>
      {/* ── Load from IDCS ─────────────────────────────────────────────── */}
      <div className="section-title">Load from IDCS</div>

      {!eventsLoaded ? (
        <button className="btn-insert" style={{ width: '100%', marginBottom: 12 }} onClick={loadEvents} disabled={loading}>
          {loading ? 'Loading…' : 'Fetch Pending Events'}
        </button>
      ) : events.length === 0 ? (
        <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
          No pending events found or backend unreachable. Fill in fields manually below.
        </p>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <select
            className="field-input"
            style={{ width: '100%' }}
            defaultValue=""
            onChange={(e) => {
              const ev = events.find((x) => x.id === e.target.value);
              if (ev) populateFromEvent(ev);
            }}
          >
            <option value="" disabled>— Choose an event —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="divider" />

      {/* ── Manual fields ──────────────────────────────────────────────── */}
      <div className="section-title">Event Details</div>

      {FIELDS.map((field) => (
        <div key={field.key} className="field-row">
          <label className="field-label">{field.label}</label>
          <div className="field-actions">
            {field.multiline ? (
              <textarea
                className="field-input field-textarea"
                placeholder={field.placeholder}
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
            ) : (
              <input
                type="text"
                className="field-input"
                placeholder={field.placeholder}
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
            )}
            <button
              className="btn-insert"
              title={`Add "${field.label}" text to design`}
              disabled={!form[field.key].trim()}
              onClick={() => handleInsertField(field)}
            >
              + Add
            </button>
          </div>
        </div>
      ))}

      <div className="divider" />

      {/* ── Bulk insert + clear ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-insert" style={{ flex: 1 }} disabled={!hasAny} onClick={handleInsertAll}>
          + Add All to Design
        </button>
        <button
          onClick={() => setForm(EMPTY)}
          style={{
            flex: '0 0 auto', padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
            background: '#fff', color: '#6b7280', fontSize: 12, cursor: 'pointer',
          }}
          title="Clear all fields"
        >
          Clear
        </button>
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`toast ${toast.error ? 'toast--error' : ''}`}>{toast.text}</div>
      )}
    </div>
  );
}
