/**
 * Mark Sheet Table — Academic 2.1 Result Analysis
 * Shows student × exam marks table with weighted totals and averages row.
 */
import React from 'react';

export type SheetExamCol = {
  examId: string;
  examName: string;
  maxMarks: number;
  weight: number;
  isMarkManager?: boolean;
};

export type SheetStudentRow = {
  studentId: string;
  regNo: string;
  name: string;
  /** exam_id → mark (0-100 scale, i.e. already on maxMarks scale) */
  marks: Record<string, number | null>;
  /** Weighted total / 100 across all exams */
  total100: number | null;
};

type Props = {
  cols: SheetExamCol[];
  rows: SheetStudentRow[];
  loading?: boolean;
  error?: string | null;
};

function totalColor(v: number): string {
  if (v >= 75) return '#059669';
  if (v >= 50) return '#2563eb';
  if (v >= 40) return '#d97706';
  return '#dc2626';
}

export default function MarkSheetTable({ cols, rows, loading, error }: Props): JSX.Element {
  const colCount = 3 + cols.length + 1; // # | reg | name | exams | total

  /* Averages */
  const avgRow = cols.map((c) => {
    const vals = rows.map((r) => r.marks[c.examId]).filter((v): v is number => v != null);
    return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  });
  const avgTotal = (() => {
    const vals = rows.map((r) => r.total100).filter((v): v is number => v != null);
    return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  })();

  const wSum = cols.reduce((s, c) => s + (c.weight || 0), 0);

  return (
    <div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      {error && (
        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}
      <div style={{ overflowX: 'auto', animation: 'fadeIn 0.3s ease' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(700, 400 + cols.length * 170), fontSize: 13 }}>
          <thead>
            {/* Weight row */}
            <tr style={{ background: '#fef9c3' }}>
              <th colSpan={3} style={{ border: '1px solid #e5e7eb', padding: '6px 10px', fontWeight: 700, fontSize: 11, color: '#92400e', textAlign: 'left', letterSpacing: '0.04em' }}>
                WEIGHTS →
              </th>
              {cols.map((c) => (
                <th key={c.examId} style={{ border: '1px solid #e5e7eb', padding: '6px 10px', textAlign: 'center', fontWeight: 800, color: '#92400e', fontSize: 13 }}>
                  {c.weight || '—'}
                </th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: '6px 10px', textAlign: 'center', color: '#92400e', fontSize: 11, fontWeight: 700 }}>
                Σ {wSum > 0 ? wSum : '—'}
              </th>
            </tr>
            {/* Column header row */}
            <tr style={{ background: '#fef9c3' }}>
              <th style={{ border: '1px solid #e5e7eb', padding: '9px 10px', textAlign: 'center', fontWeight: 800, width: 48, color: '#1f2937' }}>#</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'left', fontWeight: 800, width: 120, color: '#1f2937' }}>Roll No.</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'left', fontWeight: 800, minWidth: 200, color: '#1f2937' }}>Name</th>
              {cols.map((c) => (
                <th key={c.examId} style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'center', fontWeight: 800, width: 160, color: '#1f2937' }}>
                  {c.examName}
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginTop: 1 }}>/ {c.maxMarks}</span>
                  {c.isMarkManager && (
                    <span style={{ display: 'inline-block', marginTop: 2, fontSize: 10, background: '#ede9fe', color: '#7c3aed', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>
                      MM
                    </span>
                  )}
                </th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'center', fontWeight: 800, width: 110, color: '#1f2937', background: '#fef08a' }}>
                Total<span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginTop: 1 }}>/ 100</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={colCount} style={{ padding: 32, textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#6b7280' }}>
                    <div style={{ width: 20, height: 20, border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Loading marks…
                  </div>
                  <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ padding: 32, color: '#6b7280', textAlign: 'center' }}>
                  No student data available.
                </td>
              </tr>
            )}
            {!loading && rows.map((r, idx) => (
              <tr key={r.studentId} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{idx + 1}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px', color: '#374151', fontWeight: 500 }}>{r.regNo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px', color: '#111827', fontWeight: 500 }}>{r.name}</td>
                {cols.map((c) => {
                  const v = r.marks[c.examId];
                  return (
                    <td key={c.examId} style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'center', color: v != null ? '#111827' : '#d1d5db' }}>
                      {v != null ? v : '—'}
                    </td>
                  );
                })}
                <td style={{
                  border: '1px solid #e5e7eb',
                  padding: '8px 12px',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: 14,
                  background: r.total100 != null ? 'rgba(254,240,138,0.3)' : undefined,
                  color: r.total100 == null ? '#d1d5db' : totalColor(r.total100),
                }}>
                  {r.total100 != null ? r.total100 : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          {/* Average row */}
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f0f9ff', borderTop: '2px solid #bfdbfe' }}>
                <td colSpan={3} style={{ border: '1px solid #e5e7eb', padding: '9px 12px', fontWeight: 800, fontSize: 13, color: '#1e40af' }}>
                  Average
                </td>
                {cols.map((c, i) => (
                  <td key={c.examId} style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: avgRow[i] != null ? '#1e40af' : '#d1d5db' }}>
                    {avgRow[i] != null ? avgRow[i] : '—'}
                  </td>
                ))}
                <td style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: avgTotal != null ? '#1e40af' : '#d1d5db', background: 'rgba(219,234,254,0.5)' }}>
                  {avgTotal != null ? avgTotal : '—'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
