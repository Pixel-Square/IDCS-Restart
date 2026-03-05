import React, { useEffect, useMemo, useState } from 'react';
import { SheetCol, SheetRow } from './MarkAnalysisSheetPage';

type Props = {
  cols: SheetCol[];
  rows: SheetRow[];
  loading?: boolean;
};

/* ─── Count-up animation hook ─── */
function useCountUp(target: number, duration = 1400, started = true): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!started) return;
    setVal(0);
    if (target === 0) return;
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setVal(Math.round(ease * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, started]);
  return val;
}

/* ─── Pass/Fail check (50% of each column's max) ─── */
const PASS_PCT = 0.5;
function isPassed(row: SheetRow, cols: SheetCol[]): boolean {
  for (const col of cols) {
    const mark = row.marks[col.key];
    if (mark == null) return false; // absent / not entered = fail
    if (mark < col.max * PASS_PCT) return false;
  }
  return true;
}

const MEDAL_ACCENT: Record<number, string> = {
  1: '#d97706',
  2: '#64748b',
  3: '#c2410c',
};

/* ─── Animated count number ─── */
function AnimNum({ value, visible }: { value: number | null; visible: boolean }) {
  const v = useCountUp(value ?? 0, 1200, visible && value != null);
  if (value == null) return <span style={{ color: '#94a3b8' }}>—</span>;
  return <>{v}</>;
}

/* ═══════════════════════ MAIN COMPONENT ═══════════════════════ */
export default function RankingPage({ cols, rows, loading }: Props): JSX.Element {
  const [visible, setVisible] = useState(false);

  /* Trigger animations when data arrives */
  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, [rows, cols]);

  /* ── Build ranked list ── */
  const rankedRows = useMemo(() => {
    const passed = rows.filter((r) => isPassed(r, cols) && r.total100 != null);
    // Sort descending by total
    const sorted = [...passed].sort((a, b) => (b.total100 ?? 0) - (a.total100 ?? 0));
    // Assign ranks with ties
    let rank = 1;
    return sorted.map((r, i) => {
      if (i > 0 && r.total100 !== sorted[i - 1].total100) rank = i + 1;
      return { ...r, rank };
    });
  }, [rows, cols]);

  const failedCount = rows.length - rankedRows.length;

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            width: 40,
            height: 40,
            border: '4px solid #e5e7eb',
            borderTopColor: '#1e3a5f',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Loading rankings…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
        No student data available.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 18px rgba(251,191,36,0.4); }
          50%       { box-shadow: 0 0 38px rgba(251,191,36,0.8); }
        }
        .rank-row:hover { background: rgba(37,99,235,0.06) !important; }
      `}</style>

      {/* ── Summary strip ── */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 28,
          flexWrap: 'wrap',
          animation: 'fadeInUp 0.5s ease both',
        }}
      >
        {[
          { label: 'Total Students', value: rows.length, color: '#1e3a5f' },
          { label: 'Ranked Students', value: rankedRows.length, color: '#16a34a' },
          { label: 'Not Ranked (Fail)', value: failedCount, color: '#dc2626' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              flex: 1,
              minWidth: 140,
              background: '#fff',
              border: `1.5px solid ${color}22`,
              borderLeft: `4px solid ${color}`,
              borderRadius: 12,
              padding: '14px 20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{label}</div>
          </div>
        ))}
        <div
          style={{
            flex: 2,
            minWidth: 220,
            background: '#fff7ed',
            border: '1.5px solid #fed7aa',
            borderLeft: '4px solid #f59e0b',
            borderRadius: 12,
            padding: '14px 20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
            Ranking Criteria
          </div>
          <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
            Students must score ≥ 50% in <strong>every</strong> component to qualify for a rank.
            Absent or unentered marks are treated as fail.
          </div>
        </div>
      </div>

      {/* ── Ranking Table ── */}
      {rankedRows.length > 0 && (
        <div
          style={{
            background: '#fff',
            border: '1.5px solid #e5e7eb',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            animation: 'fadeInUp 0.6s ease 0.2s both',
          }}
        >
          {/* Table header */}
          <div style={{ background: '#1e3a5f', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>
              📋 Full Rankings
            </div>
            <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>
              {rankedRows.length} Qualified Students
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#f0f4ff' }}>
                  <th style={thStyle}>Sl. No</th>
                  <th style={thStyle}>Rank</th>
                  <th style={thStyle}>Register No.</th>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 160 }}>Name</th>
                  {cols.map((c) => (
                    <th key={c.key} style={{ ...thStyle, minWidth: 70 }}>
                      <div>{c.label}</div>
                      <div style={{ fontWeight: 500, fontSize: 10, color: '#6b7280', marginTop: 1 }}>/ {c.max}</div>
                    </th>
                  ))}
                  <th style={{ ...thStyle, background: '#1e3a5f', color: '#fff', minWidth: 80 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((row, idx) => {
                  const isMedal = row.rank <= 3;
                  const medalColors: Record<number, string> = { 1: '#fef9c3', 2: '#f1f5f9', 3: '#fff7ed' };
                  const rowBg = isMedal ? medalColors[row.rank] : idx % 2 === 0 ? '#fff' : '#f9fafb';
                  const totalColor =
                    (row.total100 ?? 0) >= 75 ? '#16a34a'
                    : (row.total100 ?? 0) >= 50 ? '#2563eb'
                    : '#dc2626';
                  return (
                    <tr key={row.id} className="rank-row" style={{ background: rowBg, transition: 'background 0.15s' }}>
                      <td style={tdCenter}>{idx + 1}</td>
                      <td style={tdCenter}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 800,
                            fontSize: 14,
                            color: isMedal ? MEDAL_ACCENT[row.rank as 1 | 2 | 3] : '#374151',
                          }}
                        >
                          {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : row.rank}
                        </span>
                      </td>
                      <td style={{ ...tdCenter, fontFamily: 'monospace', fontSize: 13 }}>{row.regNo}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, fontSize: 14, color: '#111827' }}>{row.name}</td>
                      {cols.map((c) => {
                        const m = row.marks[c.key];
                        const passing = m != null && m >= c.max * PASS_PCT;
                        return (
                          <td key={c.key} style={{ ...tdCenter, color: m == null ? '#9ca3af' : passing ? '#15803d' : '#dc2626', fontWeight: m != null ? 700 : 400 }}>
                            <AnimNum value={m ?? null} visible={visible} />
                          </td>
                        );
                      })}
                      <td style={{ ...tdCenter, fontWeight: 900, fontSize: 16, color: totalColor }}>
                        <AnimNum value={row.total100 ?? null} visible={visible} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Shared styles ─── */
const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 12,
  fontWeight: 800,
  color: '#374151',
  textAlign: 'center',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  borderBottom: '2px solid #e5e7eb',
  whiteSpace: 'nowrap',
};

const tdCenter: React.CSSProperties = {
  padding: '11px 14px',
  fontSize: 14,
  textAlign: 'center',
  borderBottom: '1px solid #f3f4f6',
};

const tdStyle: React.CSSProperties = {
  padding: '11px 14px',
  fontSize: 14,
  borderBottom: '1px solid #f3f4f6',
};
