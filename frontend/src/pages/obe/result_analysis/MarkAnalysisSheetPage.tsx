import React from 'react';

export type SheetCol = {
  key: string;
  label: string;
  max: number;
  weight: number;
};

export type SheetRow = {
  id: number;
  regNo: string;
  name: string;
  marks: Record<string, number | null>;
  total100: number | null;
};

type Props = {
  cols: SheetCol[];
  rows: SheetRow[];
  loading?: boolean;
  error?: string | null;
};

export default function MarkAnalysisSheetPage({
  cols,
  rows,
  loading,
  error,
}: Props): JSX.Element {
  const colCount = 2 + cols.length + 1;

  return (
    <div>
      {error && (
        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(700, 300 + cols.length * 160), fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#fef9c3' }}>
              <th style={{ border: '1px solid #e5e7eb', padding: '6px 10px', fontWeight: 700, fontSize: 11, color: '#92400e', textAlign: 'left', letterSpacing: '0.04em' }} colSpan={2}>WEIGHTS →</th>
              {cols.map((c) => (
                <th key={c.key} style={{ border: '1px solid #e5e7eb', padding: '6px 10px', textAlign: 'center', fontWeight: 800, color: '#92400e', fontSize: 13 }}>{c.weight}</th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: '6px 10px', textAlign: 'center', color: '#92400e', fontSize: 11, fontWeight: 700 }}>—</th>
            </tr>
            <tr style={{ background: '#fef9c3' }}>
              <th style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'left', fontWeight: 800, width: 120, color: '#1f2937' }}>Roll No.</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'left', fontWeight: 800, minWidth: 200, color: '#1f2937' }}>Name</th>
              {cols.map((c) => (
                <th key={c.key} style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'center', fontWeight: 800, width: 150, color: '#1f2937' }}>
                  {c.label}
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginTop: 1 }}>/ {c.max}</span>
                </th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'center', fontWeight: 800, width: 100, color: '#1f2937', background: '#fef08a' }}>
                Total<span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginTop: 1 }}>/ 100</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={colCount} style={{ padding: 20, color: '#6b7280', textAlign: 'center' }}>Loading marks…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={colCount} style={{ padding: 20, color: '#6b7280', textAlign: 'center' }}>No data available.</td></tr>
            )}
            {!loading && rows.map((r, idx) => (
              <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px', color: '#374151', fontWeight: 500 }}>{r.regNo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px', color: '#111827', fontWeight: 500 }}>{r.name}</td>
                {cols.map((c) => (
                  <td key={c.key} style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'center', color: r.marks[c.key] != null ? '#111827' : '#d1d5db' }}>
                    {r.marks[c.key] != null ? r.marks[c.key] : '—'}
                  </td>
                ))}
                <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 14, background: r.total100 != null ? 'rgba(254,240,138,0.3)' : undefined, color: r.total100 == null ? '#d1d5db' : r.total100 >= 75 ? '#059669' : r.total100 >= 50 ? '#2563eb' : r.total100 >= 40 ? '#d97706' : '#dc2626' }}>
                  {r.total100 != null ? r.total100 : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
