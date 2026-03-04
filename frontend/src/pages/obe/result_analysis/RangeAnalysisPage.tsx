import React, { useEffect, useMemo, useState } from 'react';
import { RANGES, computeRangeCounts } from './BellGraphPage';

type Props = {
  totals: number[];
  loading?: boolean;
};

/* ─── Count-up animation hook ─── */
function useCountUp(target: number, duration = 1000, delay = 0, started = true): number {
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

/* ─── Single row with its own animating values ─── */
interface RowProps {
  label: string;
  count: number;
  pct: number;
  barPct: number;
  barColor: string;
  isEven: boolean;
  rMin: number;
  visible: boolean;
  delay: number;
}

function RangeRow({ label, count, pct, barPct, barColor, isEven, visible, delay }: RowProps) {
  const animCount = useCountUp(count, 900, delay, visible);
  const animPct   = useCountUp(pct,   900, delay, visible);

  return (
    <div
      className="range-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr 100px 3fr',
        background: isEven ? '#fff' : '#f8fafc',
        borderTop: '1px solid #e5e7eb',
        alignItems: 'center',
        transition: 'background 0.2s',
      }}
    >
      <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: 15, color: '#111827', borderRight: '1px solid #f0f0f0', letterSpacing: '0.01em' }}>
        {label}
      </div>
      <div style={{ padding: '14px 16px', textAlign: 'center', fontSize: count > 0 ? 22 : 18, fontWeight: count > 0 ? 900 : 400, color: count > 0 ? '#111827' : '#d1d5db', borderRight: '1px solid #f0f0f0', fontVariantNumeric: 'tabular-nums' }}>
        {count > 0 ? (animCount > 0 ? animCount : '0') : '—'}
      </div>
      <div style={{ padding: '14px 12px', textAlign: 'center', fontSize: pct > 0 ? 16 : 14, fontWeight: pct > 0 ? 800 : 400, color: pct > 0 ? '#374151' : '#d1d5db', borderRight: '1px solid #f0f0f0', fontVariantNumeric: 'tabular-nums' }}>
        {count > 0 ? `${animPct}%` : '—'}
      </div>
      <div style={{ padding: '14px 20px' }}>
        {count > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 14, borderRadius: 7, background: '#e5e7eb', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: visible ? `${barPct}%` : '0%',
                  background: `linear-gradient(90deg, ${barColor}cc, ${barColor})`,
                  borderRadius: 7,
                  transition: `width ${0.8 + delay * 0.001}s cubic-bezier(0.34, 1.56, 0.64, 1)`,
                  boxShadow: `0 0 8px ${barColor}66`,
                }}
              />
            </div>
            <span style={{ minWidth: 36, fontSize: 15, fontWeight: 800, color: barColor, textAlign: 'right' }}>
              {animCount}
            </span>
          </div>
        ) : (
          <div style={{ height: 14, borderRadius: 7, background: '#f3f4f6', display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
            <span style={{ fontSize: 12, color: '#d1d5db' }}>no data</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ MAIN COMPONENT ═══════════════ */
export default function RangeAnalysisPage({ totals, loading }: Props): JSX.Element {
  const counts = useMemo(() => computeRangeCounts(totals), [totals]);
  const total = totals.length;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, [totals]);

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: 40, height: 40, border: '4px solid #e5e7eb', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ marginTop: 12, color: '#6b7280', fontSize: 15 }}>Calculating ranges…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const maxCount = Math.max(1, ...counts.map((c) => c.count));
  const passCount = totals.filter((v) => v >= 50).length;
  const distinctions = totals.filter((v) => v >= 75).length;
  const avgScore = total > 0 ? Math.round(totals.reduce((a, b) => a + b, 0) / total) : 0;

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .range-row:hover { background: #f0f4ff !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24, animation: 'fadeInUp 0.4s ease both' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#111827', letterSpacing: '-0.01em' }}>Range Analysis</div>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>Distribution of students across score ranges (out of 100)</div>
        </div>
        {total > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Total', value: total, bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
              { label: 'Pass (≥50)', value: passCount, bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' },
              { label: 'Distinct. (≥75)', value: distinctions, bg: '#faf5ff', border: '#ddd6fe', color: '#7c3aed' },
              { label: 'Class Avg', value: avgScore, bg: '#fff7ed', border: '#fed7aa', color: '#c2410c' },
            ].map(({ label, value, bg, border, color }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '8px 16px', textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color }}>{value}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', animation: 'fadeInUp 0.5s ease 0.1s both' }}>
        {/* Headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 3fr', background: 'linear-gradient(90deg, #1e3a5f, #2563eb)', color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {['Range', 'No. of Students', '% of Class', 'Distribution'].map((h) => (
            <div key={h} style={{ padding: '14px 16px', borderRight: '1px solid rgba(255,255,255,0.15)' }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {counts.map((row, idx) => {
          const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
          const barPct = maxCount > 0 ? (row.count / maxCount) * 100 : 0;
          const rMin = RANGES[idx].min;
          const barColor = rMin < 40 ? '#ef4444' : rMin < 50 ? '#f59e0b' : rMin < 60 ? '#10b981' : rMin < 75 ? '#2563eb' : '#7c3aed';
          return (
            <RangeRow key={row.label} label={row.label} count={row.count} pct={pct} barPct={barPct} barColor={barColor} isEven={idx % 2 === 0} rMin={rMin} visible={visible} delay={idx * 60} />
          );
        })}

        {/* Footer */}
        {total > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 3fr', background: '#f0f4ff', borderTop: '2px solid #1e3a5f33', fontWeight: 900, fontSize: 15 }}>
            <div style={{ padding: '14px 18px', color: '#1e3a5f', borderRight: '1px solid #e5e7eb' }}>Total</div>
            <div style={{ padding: '14px 16px', textAlign: 'center', color: '#111827', borderRight: '1px solid #e5e7eb', fontSize: 20 }}>{total}</div>
            <div style={{ padding: '14px 12px', textAlign: 'center', color: '#374151', borderRight: '1px solid #e5e7eb' }}>100%</div>
            <div style={{ padding: '14px 20px', color: '#6b7280', fontSize: 13, display: 'flex', alignItems: 'center' }}>All {total} students accounted</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', animation: 'fadeInUp 0.5s ease 0.2s both' }}>
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
