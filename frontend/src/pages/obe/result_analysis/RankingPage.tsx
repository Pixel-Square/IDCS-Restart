import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/* ─── Podium card ─── */
interface PodiumProps {
  rank: 1 | 2 | 3;
  student: RankedStudent | null;
  visible: boolean;
}

interface RankedStudent {
  regNo: string;
  name: string;
  total: number;
  marks: Record<string, number | null>;
}

const PODIUM_COLORS: Record<number, { bg: string; glow: string; text: string; accent: string }> = {
  1: { bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 40%, #f59e0b 100%)', glow: 'rgba(251,191,36,0.5)', text: '#78350f', accent: '#d97706' },
  2: { bg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 40%, #94a3b8 100%)', glow: 'rgba(148,163,184,0.5)', text: '#1e293b', accent: '#64748b' },
  3: { bg: 'linear-gradient(135deg, #fef2e8 0%, #fed7aa 40%, #ea580c 100%)', glow: 'rgba(234,88,12,0.4)', text: '#7c2d12', accent: '#c2410c' },
};

const CUP_SVG: Record<number, JSX.Element> = {
  1: (
    <svg viewBox="0 0 64 80" width="72" height="90" fill="none">
      <ellipse cx="32" cy="10" rx="24" ry="10" fill="#f59e0b" opacity="0.3" />
      <path d="M12 4 H52 L46 34 Q44 50 32 54 Q20 50 18 34 Z" fill="url(#g1)" />
      <path d="M12 4 Q4 4 4 14 Q4 26 18 30" stroke="#f59e0b" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M52 4 Q60 4 60 14 Q60 26 46 30" stroke="#f59e0b" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="26" y="54" width="12" height="14" rx="3" fill="#d97706" />
      <rect x="20" y="66" width="24" height="6" rx="3" fill="#b45309" />
      <path d="M32 16 L34 22 L41 22 L35 26 L37 33 L32 29 L27 33 L29 26 L23 22 L30 22 Z" fill="#fff" opacity="0.9" />
      <defs>
        <linearGradient id="g1" x1="12" y1="4" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
    </svg>
  ),
  2: (
    <svg viewBox="0 0 64 80" width="62" height="78" fill="none">
      <path d="M12 4 H52 L46 34 Q44 50 32 54 Q20 50 18 34 Z" fill="url(#g2)" />
      <path d="M12 4 Q4 4 4 14 Q4 26 18 30" stroke="#94a3b8" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M52 4 Q60 4 60 14 Q60 26 46 30" stroke="#94a3b8" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="26" y="54" width="12" height="14" rx="3" fill="#64748b" />
      <rect x="20" y="66" width="24" height="6" rx="3" fill="#475569" />
      <path d="M32 16 L34 22 L41 22 L35 26 L37 33 L32 29 L27 33 L29 26 L23 22 L30 22 Z" fill="#fff" opacity="0.8" />
      <defs>
        <linearGradient id="g2" x1="12" y1="4" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
      </defs>
    </svg>
  ),
  3: (
    <svg viewBox="0 0 64 80" width="56" height="70" fill="none">
      <path d="M12 4 H52 L46 34 Q44 50 32 54 Q20 50 18 34 Z" fill="url(#g3)" />
      <path d="M12 4 Q4 4 4 14 Q4 26 18 30" stroke="#ea580c" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M52 4 Q60 4 60 14 Q60 26 46 30" stroke="#ea580c" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="26" y="54" width="12" height="14" rx="3" fill="#c2410c" />
      <rect x="20" y="66" width="24" height="6" rx="3" fill="#9a3412" />
      <path d="M32 16 L34 22 L41 22 L35 26 L37 33 L32 29 L27 33 L29 26 L23 22 L30 22 Z" fill="#fff" opacity="0.8" />
      <defs>
        <linearGradient id="g3" x1="12" y1="4" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fed7aa" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
      </defs>
    </svg>
  ),
};

function PodiumCard({ rank, student, visible }: PodiumProps) {
  const c = PODIUM_COLORS[rank];
  const animTotal = useCountUp(student?.total ?? 0, 1600, visible && !!student);
  const heights = { 1: 180, 2: 140, 3: 120 };
  const elevated = { 1: 0, 2: 40, 3: 60 };
  const rankLabels = { 1: '1st', 2: '2nd', 3: '3rd' };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: elevated[rank],
        transition: 'transform 0.3s ease',
        minWidth: 180,
        maxWidth: 220,
        flex: 1,
      }}
    >
      {/* Info card */}
      <div
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: `1.5px solid ${c.glow}`,
          borderRadius: 16,
          padding: '18px 20px 14px',
          textAlign: 'center',
          width: '100%',
          backdropFilter: 'blur(8px)',
          boxShadow: `0 0 24px ${c.glow}`,
          marginBottom: 10,
        }}
      >
        {/* Rank badge */}
        <div
          style={{
            display: 'inline-block',
            background: c.bg,
            color: c.text,
            fontWeight: 900,
            fontSize: 13,
            borderRadius: 20,
            padding: '3px 14px',
            marginBottom: 10,
            letterSpacing: '0.05em',
          }}
        >
          {rankLabels[rank]}
        </div>

        {/* Cup */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          {CUP_SVG[rank]}
        </div>

        {student ? (
          <>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: '#f1f5f9',
                lineHeight: 1.3,
                marginBottom: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 170,
              }}
              title={student.name}
            >
              {student.name}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>{student.regNo}</div>
            <div
              style={{
                fontSize: rank === 1 ? 36 : 28,
                fontWeight: 900,
                background: c.bg,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                lineHeight: 1.1,
              }}
            >
              {animTotal}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Total / 100</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#64748b', padding: '8px 0' }}>—</div>
        )}
      </div>

      {/* Podium base */}
      <div
        style={{
          width: '100%',
          height: heights[rank],
          borderRadius: '12px 12px 0 0',
          background: rank === 1
            ? 'linear-gradient(180deg, #f59e0b 0%, #b45309 100%)'
            : rank === 2
            ? 'linear-gradient(180deg, #94a3b8 0%, #475569 100%)'
            : 'linear-gradient(180deg, #ea580c 0%, #7c2d12 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 -4px 20px ${c.glow}`,
        }}
      >
        <span
          style={{
            fontSize: rank === 1 ? 52 : rank === 2 ? 42 : 36,
            fontWeight: 900,
            color: 'rgba(255,255,255,0.2)',
            userSelect: 'none',
          }}
        >
          {rank}
        </span>
      </div>
    </div>
  );
}

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
  const top3: (RankedStudent | null)[] = [null, null, null];
  rankedRows.slice(0, 3).forEach((r, i) => {
    top3[i] = { regNo: r.regNo, name: r.name, total: r.total100 ?? 0, marks: r.marks };
  });

  const totalAnimated = useCountUp(rankedRows.length, 1200, visible);

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

      {/* ── Podium Section ── */}
      <div
        style={{
          background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          borderRadius: 20,
          padding: '32px 24px 0',
          marginBottom: 32,
          overflow: 'hidden',
          position: 'relative',
          animation: 'fadeInUp 0.6s ease 0.1s both',
        }}
      >
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(251,191,36,0.04)' }} />
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(99,102,241,0.05)' }} />

        <div style={{ textAlign: 'center', marginBottom: 24, position: 'relative' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#f1f5f9', letterSpacing: '0.03em' }}>
            🏆 Class Toppers
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Top ranking students this cycle
          </div>
        </div>

        {rankedRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0 48px', color: '#64748b', fontSize: 15 }}>
            No students qualified for ranking this cycle.
          </div>
        ) : (
          /* Podium layout: 2nd | 1st | 3rd */
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: 16,
              maxWidth: 680,
              margin: '0 auto',
            }}
          >
            <PodiumCard rank={2} student={top3[1]} visible={visible} />
            <PodiumCard rank={1} student={top3[0]} visible={visible} />
            <PodiumCard rank={3} student={top3[2]} visible={visible} />
          </div>
        )}
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
                            color: isMedal ? PODIUM_COLORS[row.rank as 1 | 2 | 3].accent : '#374151',
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
