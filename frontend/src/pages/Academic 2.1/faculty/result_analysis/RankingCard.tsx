/**
 * Ranking Card — Academic 2.1 Result Analysis
 * Shows student rankings based on weighted total across all exams in a cycle.
 * Students must pass (≥ 50% of weighted total) to qualify for a rank.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Users, XCircle, AlertCircle } from 'lucide-react';
import { SheetExamCol, SheetStudentRow } from './MarkSheetTable';

type Props = {
  cols: SheetExamCol[];
  rows: SheetStudentRow[];
  loading?: boolean;
};

/* ─── Count-up animation ─── */
function useCountUp(target: number, duration = 1200, started = true): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!started) return;
    setVal(0);
    if (target === 0) return;
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(ease * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, started]);
  return val;
}

function AnimNum({ value, visible }: { value: number | null; visible: boolean }) {
  const v = useCountUp(value ?? 0, 1200, visible && value != null);
  if (value == null) return <span className="text-gray-400">—</span>;
  return <>{v}</>;
}

/* ─── Pass check: student needs a non-null total ≥ 50 ─── */
function isPassed(row: SheetStudentRow): boolean {
  return row.total100 != null && row.total100 >= 50;
}

const MEDAL: Record<number, { emoji: string; bg: string; text: string }> = {
  1: { emoji: '🥇', bg: '#fef9c3', text: '#92400e' },
  2: { emoji: '🥈', bg: '#f1f5f9', text: '#475569' },
  3: { emoji: '🥉', bg: '#fff7ed', text: '#9a3412' },
};

export default function RankingCard({ cols, rows, loading }: Props): JSX.Element {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, [rows, cols]);

  /* Build ranked list from passed students */
  const { rankedRows, failedCount } = useMemo(() => {
    const passed = rows.filter(isPassed);
    const sorted = [...passed].sort((a, b) => (b.total100 ?? 0) - (a.total100 ?? 0));
    let rank = 1;
    const ranked = sorted.map((r, i) => {
      if (i > 0 && r.total100 !== sorted[i - 1].total100) rank = i + 1;
      return { ...r, rank };
    });
    return { rankedRows: ranked, failedCount: rows.length - passed.length };
  }, [rows, cols]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        <span className="ml-3 text-gray-500 text-sm">Loading rankings…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <AlertCircle className="w-10 h-10 mb-3 text-gray-300" />
        <p className="font-medium text-gray-500">No student data available for ranking.</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .rk-row:hover { background: rgba(37,99,235,0.04) !important; }
      `}</style>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', animation: 'fadeInUp 0.4s ease both' }}>
        {[
          { icon: <Users size={18} />, label: 'Total Students', value: rows.length, color: '#1e3a5f', bg: '#eff6ff', border: '#bfdbfe' },
          { icon: <Trophy size={18} />, label: 'Ranked', value: rankedRows.length, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
          { icon: <XCircle size={18} />, label: 'Not Ranked (Fail / Absent)', value: failedCount, color: failedCount > 0 ? '#dc2626' : '#6b7280', bg: failedCount > 0 ? '#fef2f2' : '#f9fafb', border: failedCount > 0 ? '#fecaca' : '#e5e7eb' },
        ].map(({ icon, label, value, color, bg, border }) => (
          <div key={label} style={{ flex: 1, minWidth: 140, background: bg, border: `1.5px solid ${border}`, borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '14px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{label}</div>
          </div>
        ))}
        <div style={{ flex: 2, minWidth: 220, background: '#fff7ed', border: '1.5px solid #fed7aa', borderLeft: '4px solid #f59e0b', borderRadius: 12, padding: '14px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>Ranking Criteria</div>
          <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
            Students must achieve a <strong>weighted total ≥ 50/100</strong> to qualify for a rank.
            Absent or unentered marks are counted as 0.
          </div>
        </div>
      </div>

      {/* Ranking Table */}
      {rankedRows.length > 0 ? (
        <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', animation: 'fadeInUp 0.5s ease 0.15s both' }}>
          <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={16} /> Full Rankings
            </div>
            <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 600 }}>{rankedRows.length} Qualified Students</div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: '#f0f4ff' }}>
                  {['#', 'Rank', 'Register No.', 'Name',
                    ...cols.map((c) => c.examName),
                    'Total / 100',
                  ].map((h, i) => (
                    <th key={i} style={{ padding: '11px 14px', fontSize: 11, fontWeight: 800, color: '#374151', textAlign: i <= 1 || i >= cols.length + 3 ? 'center' : i === 3 ? 'left' : 'center', letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                      {h}
                      {i > 3 && i <= cols.length + 3 && (
                        <div style={{ fontWeight: 500, fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                          / {cols[i - 4]?.maxMarks}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((row, idx) => {
                  const isMedal = row.rank <= 3;
                  const medal = MEDAL[row.rank as 1 | 2 | 3];
                  const rowBg = isMedal ? medal.bg : idx % 2 === 0 ? '#fff' : '#f9fafb';
                  const totalColor = (row.total100 ?? 0) >= 75 ? '#16a34a' : (row.total100 ?? 0) >= 50 ? '#2563eb' : '#dc2626';
                  return (
                    <tr key={row.studentId} className="rk-row" style={{ background: rowBg, transition: 'background 0.15s' }}>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, color: '#9ca3af', borderBottom: '1px solid #f3f4f6' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: isMedal ? medal.text : '#374151', borderBottom: '1px solid #f3f4f6' }}>
                        {isMedal ? medal.emoji : row.rank}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'monospace', fontSize: 13, color: '#374151', borderBottom: '1px solid #f3f4f6' }}>{row.regNo}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 14, color: '#111827', borderBottom: '1px solid #f3f4f6' }}>{row.name}</td>
                      {cols.map((c) => {
                        const m = row.marks[c.examId];
                        const pass = m != null && m >= c.maxMarks * 0.5;
                        return (
                          <td key={c.examId} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: m != null ? 700 : 400, color: m == null ? '#9ca3af' : pass ? '#15803d' : '#dc2626', borderBottom: '1px solid #f3f4f6' }}>
                            <AnimNum value={m ?? null} visible={visible} />
                          </td>
                        );
                      })}
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 900, fontSize: 16, color: totalColor, borderBottom: '1px solid #f3f4f6' }}>
                        <AnimNum value={row.total100 ?? null} visible={visible} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '32px 24px', background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
          <XCircle style={{ width: 40, height: 40, color: '#fca5a5', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, color: '#b91c1c', fontSize: 15 }}>No students qualified for ranking</p>
          <p style={{ fontSize: 13, color: '#dc2626', marginTop: 4 }}>All students scored below 50 or have absent/unentered marks.</p>
        </div>
      )}

      {failedCount > 0 && rankedRows.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
          ⚠ {failedCount} student{failedCount > 1 ? 's' : ''} did not qualify (total below 50 or absent marks).
        </div>
      )}
    </div>
  );
}
