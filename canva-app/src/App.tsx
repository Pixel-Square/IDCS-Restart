/**
 * App.tsx — IDCS Poster Maker (Canva App panel)
 *
 * This mini-app runs inside a Canva editor iframe panel.
 * It lets Branding / HOD users inject event details directly into
 * the active Canva design via the @canva/design SDK.
 *
 * Tabs:
 *   1. Event Data  — fill in event fields, click to add text to design
 *   2. Presets     — ready-made text groups / poster element sets
 *   3. Help        — setup instructions + Canva App ID info
 */
import React, { useState } from 'react';
import EventDataPanel from './components/EventDataPanel';
import TemplatePresetsPanel from './components/TemplatePresetsPanel';

type Tab = 'event' | 'presets' | 'help';

export default function App() {
  const [tab, setTab] = useState<Tab>('event');

  return (
    <div className="idcs-app">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="idcs-header">
        <div className="idcs-logo">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="20" height="20" rx="5" fill="#7c3aed" />
            <text x="3" y="15" fontSize="12" fill="white" fontWeight="bold">ID</text>
          </svg>
          <span>IDCS Poster Maker</span>
        </div>
      </header>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <nav className="idcs-tabs">
        {(
          [
            { id: 'event',   label: 'Event Data' },
            { id: 'presets', label: 'Presets'    },
            { id: 'help',    label: 'Help'       },
          ] as { id: Tab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`idcs-tab ${tab === id ? 'idcs-tab--active' : ''}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <main className="idcs-content">
        {tab === 'event'   && <EventDataPanel />}
        {tab === 'presets' && <TemplatePresetsPanel />}
        {tab === 'help'    && <HelpPanel />}
      </main>
    </div>
  );
}

// ── Inline help panel (no separate file needed) ────────────────────────────

function HelpPanel() {
  return (
    <div className="help-panel">
      <section>
        <h3>How to use</h3>
        <ol>
          <li>Open a poster design in Canva.</li>
          <li>Open this app from the <strong>Apps</strong> panel.</li>
          <li>Fill in event details in the <em>Event Data</em> tab.</li>
          <li>Click <strong>Add to Design</strong> next to any field to insert a text element.</li>
          <li>Drag the inserted text to the correct position on your poster.</li>
          <li>Use the <em>Presets</em> tab to insert pre-styled text groups.</li>
        </ol>
      </section>

      <section>
        <h3>App details</h3>
        <p>
          <strong>App ID:</strong>{' '}
          <code>{(globalThis as unknown as Record<string, string>).CANVA_APP_ID ?? 'AAHAAJpXAcc'}</code>
        </p>
        <p>
          <strong>Origin:</strong>{' '}
          <code>https://app-aahaajpxacc.canva-apps.com</code>
        </p>
      </section>

      <section>
        <h3>Developer portal</h3>
        <p>
          Manage this app at{' '}
          <a href="https://www.canva.com/developers/apps" target="_blank" rel="noopener noreferrer">
            canva.com/developers/apps
          </a>
        </p>
      </section>
    </div>
  );
}
