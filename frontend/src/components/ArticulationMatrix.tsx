import React from 'react';

type MatrixRow = {
  excel_row?: number;
  s_no: number | string;
  co_mapped: string;
  topic_no: number | string;
  topic_name: string;
  po: Array<number | string>;
  pso: Array<number | string>;
  hours: number | string;
};

type UnitBlock = {
  unit: string;
  header_row?: number;
  rows: MatrixRow[];
};

type CoPoSummaryRow = {
  label: string;
  po: Array<number | string>;
  pso: Array<number | string>;
  average: number | string;
};

type ArticulationMatrixPayload = {
  units: UnitBlock[];
  summaries?: {
    co_po_summary?: {
      rows: CoPoSummaryRow[];
      average?: CoPoSummaryRow;
    };
  };
  meta?: { sheet_used?: string };
};

function cell(v: any) {
  if (v === '-' || v === null || v === undefined || v === '') return '';
  return String(v);
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<any>> }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  fontSize: 12,
                  color: '#111827',
                  background: '#f9fafb',
                  padding: '10px 10px',
                  borderBottom: '1px solid #e5e7eb',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              {r.map((v, cIdx) => (
                <td
                  key={cIdx}
                  style={{
                    padding: '8px 10px',
                    borderBottom: '1px solid #f3f4f6',
                    fontSize: 12,
                    color: '#111827',
                    whiteSpace: cIdx === 3 ? 'normal' : 'nowrap',
                    maxWidth: cIdx === 3 ? 360 : undefined,
                  }}
                >
                  {cell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ArticulationMatrix({ subjectId, matrix }: { subjectId: string; matrix: ArticulationMatrixPayload | null }) {
  if (!subjectId) {
    return <div style={{ color: '#6b7280', fontSize: 13 }}>Select a course to view the Articulation Matrix.</div>;
  }

  if (!matrix) {
    return (
      <div style={{ border: '1px dashed #bbb', padding: 16, borderRadius: 8, color: '#666' }}>
        No articulation matrix loaded yet for <b>{subjectId}</b>. Upload the Excel to parse page-2.
      </div>
    );
  }

  const units = Array.isArray(matrix.units) ? matrix.units : [];
  const summary = matrix.summaries?.co_po_summary;

  const unitHeaders = [
    'S. No',
    'CO Mapped',
    'Topic No.',
    'Topic Name',
    ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`),
    ...Array.from({ length: 3 }, (_, i) => `PSO${i + 1}`),
    'Hours',
  ];

  const blankRow = Array.from({ length: unitHeaders.length }, () => '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {matrix.meta?.sheet_used && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Sheet: <b>{matrix.meta.sheet_used}</b>
        </div>
      )}

      {units.map((u) => {
        const rows = (u.rows || []).map((r) => [
          r.s_no,
          r.co_mapped,
          r.topic_no,
          r.topic_name,
          ...(r.po || []),
          ...(r.pso || []),
          r.hours,
        ]);

        return (
          <section key={u.unit}>
            <h3 style={{ margin: '6px 0 10px 0' }}>{u.unit}</h3>
            <Table headers={unitHeaders} rows={rows} />
          </section>
        );
      })}

      {/* Placeholder tables (requested): keep visible even without rows */}
      <section>
        <h3 style={{ margin: '6px 0 10px 0' }}>BLANK TABLE 1</h3>
        <Table headers={unitHeaders} rows={[blankRow]} />
      </section>

      <section>
        <h3 style={{ margin: '6px 0 10px 0' }}>BLANK TABLE 2</h3>
        <Table headers={unitHeaders} rows={[blankRow]} />
      </section>

      {summary?.rows?.length ? (
        <section>
          <h3 style={{ margin: '6px 0 10px 0' }}>CO → PO/PSO Summary</h3>
          <Table
            headers={[
              'CO',
              ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`),
              ...Array.from({ length: 3 }, (_, i) => `PSO${i + 1}`),
              'Average',
            ]}
            rows={[
              ...summary.rows.map((r) => [r.label, ...r.po, ...r.pso, r.average]),
              ...(summary.average ? [[summary.average.label, ...summary.average.po, ...summary.average.pso, summary.average.average]] : []),
            ]}
          />
        </section>
      ) : null}
    </div>
  );
}
