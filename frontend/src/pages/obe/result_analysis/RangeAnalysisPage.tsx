import React, { useEffect, useMemo, useState } from 'react';
import { RANGES, computeRangeCounts } from './BellGraphPage';

type Props = {
  totals: number[];
  studentCount?: number;   // total enrolled (including absent)
  loading?: boolean;
};

/* ─── Count-up animation hook ─── */
function useCountUp(target: number, duration = 900, delay = 0, started = true): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!started) return;
    setVal(0);
    if (target === 0) return;
    let raf: number;
    const kickoff = setTimeout(() => {
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        setVal(Math.round(ease * target));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(kickoff); cancelAnimationFrame(raf); };
  }, [target, duration, delay, started]);
  return val;
}

/* ─── Animated stat value ─── */
function AnimVal({ value, delay, started }: { value: number; delay: number; started: boolean }) {
  const v = useCountUp(value, 900, delay, started);
  return <>{v}</>;
}

/* ═══════════════ MAIN COMPONENT ═══════════════ */
export default function RangeAnalysisPage({ totals, studentCount, loading }: Props): JSX.Element {
  const counts = useMemo(() => computeRangeCounts(totals), [totals]);
  const attended = totals.length;
  const absent   = studentCount != null ? Math.max(0, studentCount - attended) : null;
  const passCount = totals.filter((v) => v >= 50).length;
  const failCount = attended - passCount;
  const passRate  = attended > 0 ? Math.round((passCount / attended) * 100) : 0;
  const avgRaw    = attended > 0 ? totals.reduce((a, b) => a + b, 0) / attended : null;
  const avgScore  = avgRaw != null ? Math.round(avgRaw * 10) / 10 : null;
  const highest   = attended > 0 ? Math.max(...totals) : null;
  const lowest    = attended > 0 ? Math.min(...totals) : null;
  const maxCount  = Math.max(1, ...counts.map((c) => c.count));

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, [totals]);

  const barColor = (min: number) =>
    min < 40 ? '#ef4444' : min < 50 ? '#f59e0b' : min < 60 ? '#10b981' : min < 75 ? '#2563eb' : '#7c3aed';

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: 40, height: 40, border: '4px solid #e5e7eb', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ marginTop: 12, color: '#6b7280', fontSize: 15 }}>Calculating ranges…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ─── Stat card data ─── */
  type StatCard = { label: string; display: string; numVal?: number; color: string; bg: string; border: string; isRate?: boolean };
  const statCards: StatCard[] = [
    { label: 'Attended',  display: String(attended),          numVal: attended,   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
    { label: 'Absent',    display: absent != null ? String(absent) : '—', numVal: absent ?? 0, color: (absent ?? 0) > 0 ? '#dc2626' : '#6b7280', bg: (absent ?? 0) > 0 ? '#fef2f2' : '#f9fafb', border: (absent ?? 0) > 0 ? '#fecaca' : '#e5e7eb' },
    { label: 'Pass',      display: String(passCount),         numVal: passCount,  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    { label: 'Fail',      display: String(failCount),         numVal: failCount,  color: failCount > 0 ? '#dc2626' : '#6b7280', bg: failCount > 0 ? '#fef2f2' : '#f9fafb', border: failCount > 0 ? '#fecaca' : '#e5e7eb' },
    { label: 'Pass Rate', display: `${passRate}%`,                                color: passRate >= 75 ? '#16a34a' : passRate >= 50 ? '#d97706' : '#dc2626', bg: '#fff7ed', border: '#fed7aa', isRate: true },
    { label: 'Average',   display: avgScore != null ? String(avgScore) : '—',     color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    { label: 'Highest',   display: highest != null ? String(highest) : '—',       color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    { label: 'Lowest',    display: lowest != null ? String(lowest) : '—',         color: (lowest ?? 0) >= 50 ? '#16a34a' : (lowest ?? 0) >= 40 ? '#d97706' : '#dc2626', bg: '#fff7ed', border: '#fed7aa' },
  ];

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin     { to   { transform: rotate(360deg); } }
        .stat-card:hover    { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.10) !important; }
        .range-col:hover    { background: #f0f4ff !important; }
      `}</style>

      {/* ── Page title ── */}
      <div style={{ marginBottom: 20, animation: 'fadeInUp 0.35s ease both' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#111827', letterSpacing: '-0.01em' }}>Range Analysis</div>
        <div style={{ fontSize: 14, color: '#6b7280', marginTop: 3 }}>Distribution across score ranges (out of 100)</div>
      </div>

      {/* ════════════════════════ CLASS STATISTICS ════════════════════════ */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
        borderRadius: 14, padding: '16px 20px 20px', marginBottom: 24,
        boxShadow: '0 6px 24px rgba(30,58,95,0.18)',
        animation: 'fadeInUp 0.4s ease 0.05s both',
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
          Class Statistics
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {statCards.map((s, i) => (
            <div
              key={s.label}
              className="stat-card"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.20)',
                borderRadius: 10,
                padding: '12px 14px',
                backdropFilter: 'blur(4px)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                animation: `fadeInUp 0.4s ease ${0.05 + i * 0.04}s both`,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {s.isRate
                  ? `${s.display}`
                  : visible && s.numVal != null
                    ? <AnimVal value={s.numVal} delay={i * 40} started={visible} />
                    : s.display
                }
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════ VERTICAL RANGE TABLE ════════════════════════ */}
      <div style={{
        borderRadius: 14, border: '1.5px solid #e5e7eb',
        overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        animation: 'fadeInUp 0.45s ease 0.1s both',
      }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(90deg, #1e3a5f, #2563eb)' }}>
                {/* Row-label header */}
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', borderRight: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap', minWidth: 110 }}>
                  Range
                </th>
                {counts.map((r, idx) => {
                  const rMin = RANGES[idx].min;
                  const bc = barColor(rMin);
                  return (
                    <th key={r.label} style={{ padding: '10px 8px 6px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.12)', minWidth: 72 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{r.label}</div>
                      <div style={{ width: 28, height: 3, borderRadius: 2, background: bc, margin: '5px auto 0', opacity: 0.85 }} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* ── Bar visualization row ── */}
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase', borderRight: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>
                  Distribution
                </td>
                {counts.map((r, idx) => {
                  const rMin = RANGES[idx].min;
                  const bc = barColor(rMin);
                  const barH = visible && maxCount > 0 ? Math.max(r.count > 0 ? 6 : 0, Math.round((r.count / maxCount) * 80)) : 0;
                  return (
                    <td key={r.label} className="range-col" style={{ padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #f0f0f0', verticalAlign: 'bottom', transition: 'background 0.2s' }}>
                      <div style={{ height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        {r.count > 0 && (
                          <div style={{ fontSize: 11, fontWeight: 800, color: bc, lineHeight: 1 }}>{r.count}</div>
                        )}
                        <div style={{
                          width: 28, borderRadius: '4px 4px 0 0',
                          height: barH,
                          background: r.count > 0 ? `linear-gradient(180deg, ${bc}bb, ${bc})` : 'transparent',
                          boxShadow: r.count > 0 ? `0 0 8px ${bc}44` : 'none',
                          transition: `height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)`,
                          minHeight: 2,
                        }} />
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* ── Count row ── */}
              <tr style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '13px 16px', fontSize: 12, fontWeight: 700, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase', borderRight: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>
                  No. of Students
                </td>
                {counts.map((r, idx) => {
                  const rMin = RANGES[idx].min;
                  const bc = barColor(rMin);
                  return (
                    <td key={r.label} className="range-col" style={{ padding: '13px 6px', textAlign: 'center', borderRight: '1px solid #f0f0f0', transition: 'background 0.2s' }}>
                      {r.count > 0 ? (
                        <span style={{ fontSize: 20, fontWeight: 900, color: bc, fontVariantNumeric: 'tabular-nums' }}>
                          {visible ? <AnimVal value={r.count} delay={idx * 40} started={visible} /> : r.count}
                        </span>
                      ) : (
                        <span style={{ fontSize: 14, color: '#d1d5db' }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* ── % of Class row ── */}
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ padding: '13px 16px', fontSize: 12, fontWeight: 700, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase', borderRight: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>
                  % of Class
                </td>
                {counts.map((r, idx) => {
                  const pct = attended > 0 ? Math.round((r.count / attended) * 100) : 0;
                  return (
                    <td key={r.label} className="range-col" style={{ padding: '13px 6px', textAlign: 'center', borderRight: '1px solid #f0f0f0', transition: 'background 0.2s' }}>
                      {r.count > 0 ? (
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                          {visible ? <><AnimVal value={pct} delay={idx * 40} started={visible} />%</> : `${pct}%`}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: '#d1d5db' }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap', animation: 'fadeInUp 0.5s ease 0.2s both' }}>
        {[
          { color: '#ef4444', label: '0 – 39 · Fail' },
          { color: '#f59e0b', label: '40 – 49 · Below Average' },
          { color: '#10b981', label: '50 – 59 · Pass' },
          { color: '#2563eb', label: '60 – 74 · Good' },
          { color: '#7c3aed', label: '75 – 100 · Distinction' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#374151' }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: color, boxShadow: `0 0 6px ${color}88` }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
