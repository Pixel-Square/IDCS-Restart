/**
 * TemplatePresetsPanel.tsx
 *
 * Pre-defined "poster element groups" for common IDCS event types.
 * One click inserts all text elements for a typical poster layout.
 * Users can then move/resize the inserted text boxes in Canva.
 */
import React, { useState } from 'react';
import { insertTextGroup } from '../utils/canvaHelpers';

interface Preset {
  id:          string;
  name:        string;
  description: string;
  color:       string;   // accent colour for the card
  elements: Array<{
    label:      string;   // shown in preview
    text:       string;   // default inserted text
    fontSize:   number;
    fontWeight: 'normal' | 'bold';
    color:      string;
  }>;
}

const PRESETS: Preset[] = [
  {
    id:          'seminar',
    name:        'Seminar / Conference',
    description: 'Title, subtitle, venue, date, chief guest, organised by',
    color:       '#7c3aed',
    elements: [
      { label: 'Event type',   text: 'National Seminar',               fontSize: 18, fontWeight: 'normal', color: '#7c3aed' },
      { label: 'Title',        text: 'Enter Seminar Title Here',       fontSize: 38, fontWeight: 'bold',   color: '#1a1a1a' },
      { label: 'Date & Time',  text: 'Date & Time',                    fontSize: 20, fontWeight: 'bold',   color: '#7c3aed' },
      { label: 'Venue',        text: 'Venue, Block, Institution',      fontSize: 16, fontWeight: 'normal', color: '#374151' },
      { label: 'Chief Guest',  text: 'Chief Guest: Name, Designation', fontSize: 16, fontWeight: 'normal', color: '#1d4ed8' },
      { label: 'Organised by', text: 'Organised by: Department, IDCS', fontSize: 13, fontWeight: 'normal', color: '#6b7280' },
    ],
  },
  {
    id:          'workshop',
    name:        'Workshop / Training',
    description: 'Workshop title, eligibility, date, registration info',
    color:       '#0ea5e9',
    elements: [
      { label: 'Workshop tag', text: 'Workshop on',                         fontSize: 16, fontWeight: 'normal', color: '#0ea5e9' },
      { label: 'Title',        text: 'Enter Workshop Title',                fontSize: 36, fontWeight: 'bold',   color: '#0c4a6e' },
      { label: 'For whom',     text: 'Open to: All UG Students',            fontSize: 15, fontWeight: 'normal', color: '#374151' },
      { label: 'Date & Time',  text: 'Date & Time',                         fontSize: 18, fontWeight: 'bold',   color: '#0ea5e9' },
      { label: 'Venue',        text: 'Venue',                               fontSize: 15, fontWeight: 'normal', color: '#374151' },
      { label: 'Register',     text: 'Register at: bit.ly/workshop-reg',    fontSize: 12, fontWeight: 'normal', color: '#6b7280' },
    ],
  },
  {
    id:          'cultural',
    name:        'Cultural / Fest',
    description: 'Fest name, events list, date, venue, contact',
    color:       '#f59e0b',
    elements: [
      { label: 'Fest name',    text: 'FEST NAME 2026',                      fontSize: 42, fontWeight: 'bold',   color: '#b45309' },
      { label: 'Tagline',      text: 'Celebrate · Create · Inspire',        fontSize: 16, fontWeight: 'normal', color: '#78350f' },
      { label: 'Date',         text: '15–16 March 2026',                    fontSize: 22, fontWeight: 'bold',   color: '#f59e0b' },
      { label: 'Venue',        text: 'Auditorium, Main Block',              fontSize: 16, fontWeight: 'normal', color: '#374151' },
      { label: 'Events',       text: 'Dance · Music · Quiz · Art',          fontSize: 15, fontWeight: 'normal', color: '#4b5563' },
      { label: 'Contact',      text: 'Contact: +91 99999 00000',            fontSize: 12, fontWeight: 'normal', color: '#6b7280' },
    ],
  },
  {
    id:          'guest_lecture',
    name:        'Guest Lecture',
    description: 'Speaker name, topic, date, venue, department',
    color:       '#10b981',
    elements: [
      { label: 'Type',         text: 'Guest Lecture',                       fontSize: 18, fontWeight: 'normal', color: '#10b981' },
      { label: 'Topic',        text: 'Topic: Enter Lecture Title',          fontSize: 30, fontWeight: 'bold',   color: '#064e3b' },
      { label: 'Speaker',      text: 'By: Speaker Name, Designation',       fontSize: 18, fontWeight: 'bold',   color: '#1a1a1a' },
      { label: 'Organisation', text: "Speaker's Organisation",              fontSize: 14, fontWeight: 'normal', color: '#4b5563' },
      { label: 'Date & Time',  text: 'Date & Time',                         fontSize: 18, fontWeight: 'bold',   color: '#10b981' },
      { label: 'Venue',        text: 'Venue',                               fontSize: 14, fontWeight: 'normal', color: '#374151' },
      { label: 'Dept.',        text: 'Dept. of Computer Science, IDCS',     fontSize: 12, fontWeight: 'normal', color: '#6b7280' },
    ],
  },
  {
    id:          'competition',
    name:        'Competition / Contest',
    description: 'Competition name, prizes, registration deadline',
    color:       '#ef4444',
    elements: [
      { label: 'Type',         text: 'Calling Entries for',                 fontSize: 16, fontWeight: 'normal', color: '#ef4444' },
      { label: 'Title',        text: 'Competition Name',                    fontSize: 36, fontWeight: 'bold',   color: '#7f1d1d' },
      { label: 'Prizes',       text: '🏆 Prizes up to ₹10,000',            fontSize: 18, fontWeight: 'bold',   color: '#ef4444' },
      { label: 'Eligibility',  text: 'Open to All College Students',        fontSize: 14, fontWeight: 'normal', color: '#374151' },
      { label: 'Last date',    text: 'Last Date to Register: DD Mon YYYY',  fontSize: 15, fontWeight: 'bold',   color: '#1a1a1a' },
      { label: 'Register',     text: 'Register: bit.ly/contest',            fontSize: 13, fontWeight: 'normal', color: '#6b7280' },
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function TemplatePresetsPanel() {
  const [toast, setToast]     = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleInsertPreset(preset: Preset) {
    setLoading(preset.id);
    try {
      await insertTextGroup(preset.elements);
      setToast(`${preset.name} inserted ✓`);
      setTimeout(() => setToast(null), 2200);
    } catch {
      setToast('Open a Canva design first, then try again.');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 }}>
        One-click starter layouts for common event types.
        Edit the inserted text in Canva to match your event.
      </p>

      {PRESETS.map((preset) => (
        <div key={preset.id} className="preset-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                width: 10, height: 10, borderRadius: '50%',
                background: preset.color, flexShrink: 0,
              }}
            />
            <span className="preset-card-title">{preset.name}</span>
          </div>
          <p className="preset-card-desc">{preset.description}</p>

          {/* Element preview list */}
          <div style={{ margin: '8px 0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {preset.elements.map((el) => (
              <span key={el.label} style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: '#f3f4f6', color: '#4b5563',
              }}>
                {el.label}
              </span>
            ))}
          </div>

          <button
            className="preset-card-btn"
            onClick={() => handleInsertPreset(preset)}
            disabled={loading === preset.id}
          >
            {loading === preset.id ? 'Inserting…' : `+ Insert ${preset.name}`}
          </button>
        </div>
      ))}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
