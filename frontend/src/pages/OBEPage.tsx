import React, { useState, useEffect } from 'react';

type OBEItem = {
  id: number;
  course: string;
  outcome: string;
  assessment: string;
  target: string;
  achieved: string;
};

export default function OBEPage(): JSX.Element {
  const [data, setData] = useState<OBEItem[]>([]);

 

  const parsePercent = (s: string) => {
    const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const totalItems = data.length;
  const averageAchievement = totalItems
    ? (data.reduce((sum, it) => sum + parsePercent(it.achieved), 0) / totalItems).toFixed(1) + '%'
    : 'N/A';

  return (
    <main className="obe-page" style={{ padding: 16, fontFamily: 'Arial, sans-serif' }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Outcome Based Education (OBE)</h1>
        <p style={{ marginTop: 6, color: '#444' }}>
          Overview of course outcomes, assessment methods, targets and achieved values.
        </p>
      </header>

      <section
        aria-label="OBE Stats"
        style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}
      >
        <div style={{ padding: 8, border: '1px solid #e0e0e0', borderRadius: 6, minWidth: 120 }}>
          <strong>Total Items</strong>
          <div style={{ fontSize: 20, marginTop: 6 }}>{totalItems}</div>
        </div>

        <div style={{ padding: 8, border: '1px solid #e0e0e0', borderRadius: 6, minWidth: 160 }}>
          <strong>Average Achievement</strong>
          <div style={{ fontSize: 20, marginTop: 6 }}>{averageAchievement}</div>
        </div>
      </section>

      <section aria-label="OBE Table" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px' }}>#</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px' }}>Course</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px' }}>Outcome</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px' }}>Assessment Method</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px' }}>Target</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px' }}>Achieved</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, idx) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px', verticalAlign: 'top' }}>{idx + 1}</td>
                <td style={{ padding: '8px', verticalAlign: 'top' }}>{item.course}</td>
                <td style={{ padding: '8px', verticalAlign: 'top' }}>{item.outcome}</td>
                <td style={{ padding: '8px', verticalAlign: 'top' }}>{item.assessment}</td>
                <td style={{ padding: '8px', verticalAlign: 'top' }}>{item.target}</td>
                <td style={{ padding: '8px', verticalAlign: 'top' }}>{item.achieved}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
                  No data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
