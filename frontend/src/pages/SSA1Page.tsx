import React from 'react';

interface SSA1PageProps {
  onBack: () => void;
}

const columns = [
  { label: 'S.No', width: 60 },
  { label: 'SECTION', width: 80 },
  { label: 'Register No.', width: 130 },
  { label: 'Name / Max Marks', width: 200 },
  { label: 'ASMT1', width: 70 },
  { label: 'Total', width: 70 },
  { label: 'CO-1', width: 60 },
  { label: 'CO-2', width: 60 },
  { label: 'BTL-1', width: 60 },
  { label: 'BTL-2', width: 60 },
  { label: 'BTL-3', width: 60 },
  { label: 'BTL-4', width: 60 },
  { label: 'BTL-5', width: 60 },
  { label: 'BTL-6', width: 60 },
];

export default function SSA1Page({ onBack }: SSA1PageProps) {
  return (
    <div style={{ padding: '20px' }}>
      <button
        onClick={onBack}
        style={{
          padding: '10px 16px',
          fontSize: '14px',
          backgroundColor: '#f5f5f5',
          color: '#000',
          border: '1px solid #d9d9d9',
          borderRadius: '6px',
          cursor: 'pointer',
          marginBottom: '20px',
          transition: 'background-color 0.3s',
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e6e6e6')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
      >
        ← Back
      </button>

      <h2>SSA1</h2>
      <div style={{ overflowX: 'auto', marginTop: 24 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 900, width: '100%' }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.label}
                  style={{
                    border: '1px solid #d9d9d9',
                    background: '#f0f2f5',
                    padding: '8px 4px',
                    minWidth: col.width,
                    fontWeight: 600,
                    textAlign: 'center',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Data rows will go here in the future */}
            <tr>
              {columns.map((col, idx) => (
                <td
                  key={col.label + idx}
                  style={{
                    border: '1px solid #e0e0e0',
                    padding: '6px 4px',
                    textAlign: 'center',
                    color: '#bbb',
                  }}
                >
                  -
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
