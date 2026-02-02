import React from 'react';
import C1CQIPage from './C1CQIPage';

type Props = {
  courseId: string;
};

type SubKey = 'c1' | 'c2';

export default function CQIPage({ courseId }: Props): JSX.Element {
  const [active, setActive] = React.useState<SubKey>('c1');

  const navItem = (key: SubKey, label: string, desc: string) => {
    const isActive = active === key;
    return (
      <button
        key={key}
        onClick={() => setActive(key)}
        style={{
          textAlign: 'left',
          padding: 12,
          borderRadius: 12,
          border: isActive ? '1px solid rgba(13, 76, 111, 0.35)' : '1px solid rgba(148, 163, 184, 0.45)',
          background: isActive ? 'linear-gradient(180deg,#e6f6ff,#ffffff)' : '#ffffff',
          boxShadow: isActive ? '0 10px 24px rgba(2, 132, 199, 0.12)' : 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontWeight: 900, color: isActive ? '#0b4a6f' : '#111827' }}>{label}</div>
        <div style={{ marginTop: 4, fontSize: 12, color: isActive ? '#0f4c5c' : '#64748b' }}>{desc}</div>
      </button>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 14, alignItems: 'start' }}>
      <aside
        style={{
          position: 'sticky',
          top: 12,
          alignSelf: 'start',
          padding: 14,
          borderRadius: 14,
          border: '1px solid rgba(226, 232, 240, 0.9)',
          background: 'linear-gradient(180deg,#f8fbff,#ffffff)',
          boxShadow: '0 10px 28px rgba(2, 6, 23, 0.06)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 900, color: '#0b4a6f' }}>CQI</div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>Continuous Quality Improvement</div>

        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {navItem('c1', 'C1-CQI', 'Student-wise CO issues (threshold based)')}
          {navItem('c2', 'C2-CQI', 'Coming soon')}
        </div>

        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>Rule</div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#334155', lineHeight: 1.4 }}>
            CO is flagged when its 3pt attainment is below <b>1.74</b>.
          </div>
        </div>
      </aside>

      <section>
        {active === 'c1' && <C1CQIPage courseId={courseId} />}

        {active === 'c2' && (
          <div
            style={{
              padding: 18,
              borderRadius: 14,
              border: '1px solid rgba(226, 232, 240, 0.9)',
              background: 'linear-gradient(180deg,#ffffff,#f8fafc)',
              boxShadow: '0 8px 22px rgba(2, 6, 23, 0.05)',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900, color: '#0b4a6f' }}>C2-CQI</div>
            <div style={{ marginTop: 8, color: '#64748b' }}>We’ll build this next.</div>
          </div>
        )}
      </section>
    </div>
  );
}
