import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import OBEDueDatesPage from '../OBEDueDatesPage';
import AcademicControllerCoursesPage from './AcademicControllerCoursesPage';
import AcademicControllerWeightsPage from './AcademicControllerWeightsPage';

type TabKey = 'dashboard' | 'due_dates' | 'courses' | 'weights';

export default function AcademicControllerPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialTab = (params.get('tab') as TabKey) || 'dashboard';
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    const p = new URLSearchParams(location.search).get('tab') as TabKey | null;
    if (p && p !== tab) setTab(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'weights', label: 'Weights' },
    { key: 'due_dates', label: 'OBE Due Dates' },
    { key: 'courses', label: 'Courses' },
  ];

  return (
    <main style={{ padding: 18, minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Academic Controller</h2>
        <div style={{ color: '#6b7280', marginTop: 6 }}>IQAC tools for OBE oversight.</div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              navigate(`/iqac/academic-controller?tab=${encodeURIComponent(t.key)}`);
            }}
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
        {tab === 'dashboard' && (
          <div style={{ color: '#6b7280' }}>Dashboard coming soon.</div>
        )}
        {tab === 'weights' && <AcademicControllerWeightsPage />}
        {tab === 'due_dates' && <OBEDueDatesPage />}
        {tab === 'courses' && <AcademicControllerCoursesPage />}
      </div>
    </main>
  );
}
