import React from 'react';
import { Link } from 'react-router-dom';

const styles: { [k: string]: React.CSSProperties } = {
  page: {
    padding: 28,
    maxWidth: 1100,
    margin: '18px auto',
    fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    color: '#1f3947',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 18,
    border: '1px solid #e6eef8',
    boxShadow: '0 6px 20px rgba(13,60,100,0.04)',
  },
  tabs: { display: 'flex', gap: 8, marginBottom: 14 },
  tab: {
    padding: '8px 12px',
    borderRadius: 8,
    background: '#fbfdff',
    border: '1px solid #e6eef8',
    color: '#0b4a6f',
    textDecoration: 'none',
    fontWeight: 700,
  },
  tabActive: {
    padding: '8px 12px',
    borderRadius: 8,
    background: '#0b4a6f',
    border: '1px solid #0b4a6f',
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 700,
  },
  title: { margin: '6px 0 0 0', color: '#0b4a6f', fontSize: 22, fontWeight: 700 },
  coursePill: {
    display: 'inline-block',
    marginTop: 8,
    padding: '8px 12px',
    borderRadius: 8,
    background: '#fbfdff',
    border: '1px solid #e6eef8',
    color: '#0b4a6f',
    fontWeight: 700,
  },
  notice: {
    marginTop: 18,
    padding: 18,
    borderRadius: 10,
    border: '1px solid #e6eef8',
    background: '#fbfdff',
    color: '#3d5566',
  },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: 12, tableLayout: 'fixed' as React.CSSProperties['tableLayout'] },
  th: {
    background: '#f3f8ff',
    color: '#0b4a6f',
    fontWeight: 700,
    padding: '10px',
    border: '1px solid #e6eef8',
    textAlign: 'center',
    fontSize: 13,
  },
  thLeft: {
    background: '#f3f8ff',
    color: '#0b4a6f',
    fontWeight: 700,
    padding: '10px',
    border: '1px solid #e6eef8',
    textAlign: 'left',
    fontSize: 13,
    minWidth: 180,
  },
  td: { padding: '10px', border: '1px solid #eef6fb', color: '#234451', fontSize: 13, textAlign: 'center' },
  tdLeft: { padding: '10px', border: '1px solid #eef6fb', color: '#234451', fontSize: 13, textAlign: 'left' },
};

const sampleRows = [
  { co: 'CO1', ico: 0.4, bco: 0.3, aco: 0.1, api: 0.1, iic: 0.1, targets: 68, scale: 2.03 },
  { co: 'CO2', ico: 0.4, bco: 0.3, aco: 0.1, api: 0.1, iic: 0.1, targets: 66, scale: 1.99 },
  { co: 'CO3', ico: 0.4, bco: 0.3, aco: 0.1, api: 0.1, iic: 0.1, targets: 67, scale: 2.01 },
];

export default function COTargetPage({
  courseCode = 'MEB1223',
  courseName = 'Power Plant Engineering',
}: {
  courseCode?: string;
  courseName?: string;
}): JSX.Element {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.tabs}>
          <Link to="#" style={styles.tab}>LCA Instructions</Link>
          <Link to="#" style={styles.tab}>LCA</Link>
          <Link to="#" style={styles.tab}>CDAP</Link>
          <Link to="#" style={styles.tab}>Articulation Matrix</Link>
          <Link to="#" style={styles.tabActive}>CO Target</Link>
        </div>

        <h3 style={{ margin: 0, color: '#0b4a6f' }}>Course</h3>
        <div style={styles.coursePill}>{courseCode} — {courseName}</div>

        <div style={styles.notice}>
          <strong>CO Target — Read Only</strong>
          <div style={{ marginTop: 6 }}>This is a read-only view of the Course Outcome Attainment targets. No actions are available on this screen.</div>
        </div>

        <h4 style={{ marginTop: 18, color: '#0b3b57' }}>Course Outcome Attainment Targets</h4>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.thLeft}>COs</th>
              <th style={styles.th}>ICO</th>
              <th style={styles.th}>BCO</th>
              <th style={styles.th}>ACO</th>
              <th style={styles.th}>API</th>
              <th style={styles.th}>IIC</th>
              <th style={styles.th}>COs Targets</th>
              <th style={styles.th}>CO TARGET IN 3 POINT SCALE</th>
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((r) => (
              <tr key={r.co}>
                <td style={styles.tdLeft}>{r.co}</td>
                <td style={styles.td}>{r.ico.toFixed(1)}</td>
                <td style={styles.td}>{r.bco.toFixed(1)}</td>
                <td style={styles.td}>{r.aco.toFixed(1)}</td>
                <td style={styles.td}>{r.api.toFixed(1)}</td>
                <td style={styles.td}>{r.iic.toFixed(1)}</td>
                <td style={styles.td}>{r.targets}</td>
                <td style={styles.td}>{r.scale.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 12, color: '#6b7b86', fontSize: 13 }}>Target table is generated automatically. This view is read-only.</div>
      </div>
    </div>
  );
}
