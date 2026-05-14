/**
 * Range Analysis Card — Academic 2.1 Result Analysis (Redesigned)
 * Modern horizontal progress bar layout with clear statistics.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { computeRangeCounts, BELL_RANGES } from './BellGraphCard';
import { Users, TrendingUp, Award, BarChart2 } from 'lucide-react';

type Props = {
  totals: number[];
  studentCount?: number;
  loading?: boolean;
};

function useCountUp(target: number, duration = 950, delay = 0, started = true): number {
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

function Anim({ value, delay, started, suffix = '' }: { value: number; delay: number; started: boolean; suffix?: string }) {
  const v = useCountUp(value, 950, delay, started);
  return <>{v}{suffix}</>;
}

const rangeColor = (min: number): { bar: string; text: string } => {
  if (min < 40) return { bar: '#ef4444', text: '#dc2626' };
  if (min < 50) return { bar: '#f97316', text: '#ea580c' };
  if (min < 60) return { bar: '#eab308', text: '#ca8a04' };
  if (min < 75) return { bar: '#22c55e', text: '#16a34a' };
  if (min < 90) return { bar: '#3b82f6', text: '#2563eb' };
  return { bar: '#8b5cf6', text: '#7c3aed' };
};

export default function RangeAnalysisCard({ totals, studentCount, loading }: Props): JSX.Element {
  const counts    = useMemo(() => computeRangeCounts(totals), [totals]);
  const attended  = totals.length;
  const absent    = studentCount != null ? Math.max(0, studentCount - attended) : null;
  const passCount = totals.filter((v) => v >= 50).length;
  const failCount = attended - passCount;
  const passRate  = attended > 0 ? Math.round((passCount / attended) * 100) : 0;
  const avgScore  = attended > 0 ? Math.round((totals.reduce((a, b) => a + b, 0) / attended) * 10) / 10 : null;
  const highest   = attended > 0 ? Math.max(...totals) : null;
  const lowest    = attended > 0 ? Math.min(...totals) : null;
  const maxCount  = Math.max(1, ...counts.map((c) => c.count));

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, [totals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        <span className="ml-3 text-gray-500 text-sm">Calculating ranges\u2026</span>
      </div>
    );
  }

  if (attended === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <BarChart2 className="w-10 h-10 mb-3 text-gray-300" />
        <p className="font-medium text-gray-500">No marks data available for range analysis.</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes ra-fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .ra-statcard:hover { transform: translateY(-2px); transition: transform 0.15s; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24, animation: 'ra-fadeUp 0.4s ease both' }}>
        <div className="ra-statcard" style={{ background: '#fff', border: '1.5px solid #bfdbfe', borderTop: '4px solid #3b82f6', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(59,130,246,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Attended</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#1d4ed8', lineHeight: 1 }}>
                {visible ? <Anim value={attended} delay={0} started={visible} /> : attended}
              </div>
            </div>
            <div style={{ background: '#eff6ff', borderRadius: 8, padding: 6 }}><Users size={18} color="#3b82f6" /></div>
          </div>
          {absent != null && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
              {absent} absent{studentCount ? ` / ${studentCount} total` : ''}
            </div>
          )}
        </div>

        <div className="ra-statcard" style={{ background: '#fff', border: '1.5px solid #bbf7d0', borderTop: '4px solid #22c55e', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(34,197,94,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Pass</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#16a34a', lineHeight: 1 }}>
                {visible ? <Anim value={passCount} delay={40} started={visible} /> : passCount}
              </div>
            </div>
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 6 }}><Award size={18} color="#22c55e" /></div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
            Fail: <span style={{ color: failCount > 0 ? '#dc2626' : '#6b7280', fontWeight: 700 }}>{failCount}</span>
          </div>
        </div>

        <div className="ra-statcard" style={{ background: '#fff', border: `1.5px solid ${passRate >= 75 ? '#bbf7d0' : passRate >= 50 ? '#fed7aa' : '#fecaca'}`, borderTop: `4px solid ${passRate >= 75 ? '#22c55e' : passRate >= 50 ? '#f97316' : '#ef4444'}`, borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: passRate >= 75 ? '#4ade80' : passRate >= 50 ? '#fb923c' : '#f87171', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Pass Rate</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: passRate >= 75 ? '#16a34a' : passRate >= 50 ? '#ea580c' : '#dc2626', lineHeight: 1 }}>
                {visible ? <Anim value={passRate} delay={80} started={visible} suffix="%" /> : `${passRate}%`}
              </div>
            </div>
            <div style={{ background: passRate >= 75 ? '#f0fdf4' : passRate >= 50 ? '#fff7ed' : '#fef2f2', borderRadius: 8, padding: 6 }}>
              <TrendingUp size={18} color={passRate >= 75 ? '#22c55e' : passRate >= 50 ? '#f97316' : '#ef4444'} />
            </div>
          </div>
          <div style={{ marginTop: 10, background: '#f3f4f6', borderRadius: 4, height: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${passRate}%`, background: passRate >= 75 ? '#22c55e' : passRate >= 50 ? '#f97316' : '#ef4444', borderRadius: 4, transition: 'width 1s ease' }} />
          </div>
        </div>

        <div className="ra-statcard" style={{ background: '#fff', border: '1.5px solid #e9d5ff', borderTop: '4px solid #a855f7', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(168,85,247,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Class Avg</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#7c3aed', lineHeight: 1 }}>
                {avgScore != null ? (visible ? <Anim value={Math.round(avgScore)} delay={120} started={visible} /> : avgScore) : '\u2014'}
              </div>
            </div>
            <div style={{ background: '#f5f3ff', borderRadius: 8, padding: 6 }}><BarChart2 size={18} color="#a855f7" /></div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
            High: <span style={{ color: '#16a34a', fontWeight: 700 }}>{highest ?? '\u2014'}</span> \u00b7 Low: <span style={{ color: '#dc2626', fontWeight: 700 }}>{lowest ?? '\u2014'}</span>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', animation: 'ra-fadeUp 0.45s ease 0.1s both' }}>
        <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={16} /> Score Range Distribution
          </div>
          <span style={{ fontSize: 12, color: '#93c5fd', fontWeight: 600 }}>{attended} students</span>
        </div>

        <div style={{ padding: '0 20px 16px' }}>
          {counts.map((row, idx) => {
            const range = BELL_RANGES[idx];
            const { bar, text } = rangeColor(range.min);
            const pct = attended > 0 ? (row.count / attended) * 100 : 0;
            const barW = attended > 0 ? (row.count / maxCount) * 100 : 0;

            return (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: idx < counts.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ minWidth: 72, fontWeight: 700, fontSize: 13, color: '#374151', flexShrink: 0 }}>{row.label}</div>
                <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 18, overflow: 'hidden' }}>
                  {row.count > 0 && (
                    <div style={{ height: '100%', width: `${barW}%`, background: bar, borderRadius: 6, opacity: 0.85, minWidth: 4, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
                  )}
                </div>
                <div style={{ minWidth: 40, textAlign: 'right', fontWeight: 800, fontSize: 15, color: row.count > 0 ? text : '#d1d5db', flexShrink: 0 }}>{row.count}</div>
                <div style={{ minWidth: 48, textAlign: 'right', fontSize: 12, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>{pct > 0 ? `${pct.toFixed(1)}%` : '\u2014'}</div>
              </div>
            );
          })}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 0', borderTop: '2px solid #e5e7eb', marginTop: 4 }}>
            <div style={{ minWidth: 72, fontWeight: 800, fontSize: 13, color: '#1e3a5f' }}>Total</div>
            <div style={{ flex: 1 }} />
            <div style={{ minWidth: 40, textAlign: 'right', fontWeight: 900, fontSize: 16, color: '#1e3a5f' }}>{attended}</div>
            <div style={{ minWidth: 48, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#6b7280' }}>100%</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, animation: 'ra-fadeUp 0.5s ease 0.2s both' }}>
        <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pass Band (\u2265 50)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {counts.map((row, i) => BELL_RANGES[i].min >= 50 && row.count > 0 ? (
              <span key={row.label} style={{ fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '3px 10px' }}>{row.label}: {row.count}</span>
            ) : null)}
          </div>
        </div>
        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fail Band (&lt; 50)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {counts.map((row, i) => BELL_RANGES[i].min < 50 && row.count > 0 ? (
              <span key={row.label} style={{ fontSize: 12, fontWeight: 700, background: '#fee2e2', color: '#b91c1c', borderRadius: 20, padding: '3px 10px' }}>{row.label}: {row.count}</span>
            ) : null)}
          </div>
        </div>
      </div>
    </div>
  );
}
