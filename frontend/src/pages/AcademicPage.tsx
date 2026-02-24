import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import OBEPage from './obe/OBEPage';
import OBEMasterPage from './obe/OBEMasterPage';
import OBEDueDatesPage from './obe/OBEDueDatesPage';

export default function AcademicPage(): JSX.Element {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialTab = (params.get('tab') as 'obe' | 'obe_master' | 'due_dates') || 'obe';
  const [tab, setTab] = useState<'obe' | 'obe_master' | 'due_dates'>(initialTab);

  // decide which tabs to show based on permissions exposed via window.__APP_ME__ if available
  const perms = (window as any).__APP_ME__?.permissions || (window as any).__ME__?.permissions || [];
  const lower = Array.isArray(perms) ? perms.map((p: any) => String(p || '').toLowerCase()) : [];
  const canObeMaster = lower.includes('obe.master.manage');

  const tabs = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    out.push({ key: 'obe', label: 'OBE' });
    if (canObeMaster) {
      out.push({ key: 'obe_master', label: 'OBE Master' });
      out.push({ key: 'due_dates', label: 'OBE: Due Dates' });
    }
    return out;
  }, [canObeMaster]);

  // ensure selected tab is available
  React.useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key as any || 'obe');
  }, [tabs, tab]);

  useEffect(() => {
    // respond to URL changes (e.g. /academic?tab=obe_master)
    const p = new URLSearchParams(location.search).get('tab') as 'obe' | 'obe_master' | 'due_dates' | null;
    if (p && tabs.some((t) => t.key === p) && p !== tab) setTab(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  return (
    <main style={{ padding: 18, minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Academic</h2>
        <div style={{ color: '#6b7280', marginTop: 6 }}>Quick access to OBE tools.</div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: tab === t.key ? '1px solid #10b981' : '1px solid #e5e7eb',
              background: tab === t.key ? '#ecfdf5' : '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
        {tab === 'obe' && <OBEPage />}
        {tab === 'obe_master' && canObeMaster && <OBEMasterPage />}
        {tab === 'due_dates' && canObeMaster && <OBEDueDatesPage />}
      </div>
    </main>
  );
}
