import React, { useState } from 'react';

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
  if (v === '-' || v === null || v === undefined || v === '') return ' - ';
  return String(v);
}

function roundHalfUp(value: number, decimals: number) {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
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

function CollapsibleTable({
  title,
  headers,
  rows,
  collapsedByDefault = false,
  showToggle = true,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<any>>;
  collapsedByDefault?: boolean;
  showToggle?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsedByDefault);

  const previewRows = rows?.length ? [rows[0]] : [];

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: '6px 0 10px 0', flex: 1 }}>{title}</h3>
        {showToggle ? (
          <button
            aria-label={expanded ? 'Collapse table' : 'Expand table'}
            onClick={() => setExpanded((s) => !s)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              padding: 6,
              color: '#374151',
            }}
          >
            {expanded ? '▼' : '►'}
          </button>
        ) : null}
      </div>

      {expanded ? <Table headers={headers} rows={rows} /> : <Table headers={headers} rows={previewRows} />}
    </section>
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

      {/* Filled / placeholder tables (replacing BLANK TABLE 1 & 2) */}
      {/* First table: collapsed by default, shows only first row preview and dropdown to expand */}
      {(() => {
        const courseDeliveryRows: Array<Array<any>> = [];

        const buildRowForUnit = (unitIndex: number, label: string) => {
          const unit = units[unitIndex];
          if (!unit || !Array.isArray(unit.rows) || unit.rows.length === 0) {
            return [label, ...Array.from({ length: 11 }, () => ''), ...Array.from({ length: 3 }, () => ''), ''];
          }

          // sum of hours (x)
          const rows = unit.rows;
          const sumHours = rows.reduce((acc, r) => {
            const h = Number(r.hours);
            return acc + (Number.isFinite(h) ? h : 0);
          }, 0);

          const poValues: Array<number | string> = [];
          for (let j = 0; j < 11; j++) {
            const colSum = rows.reduce((acc, r) => {
              const v = Number((r.po && r.po[j]) ?? 0);
              return acc + (Number.isFinite(v) ? v : 0);
            }, 0);
            if (sumHours > 0) {
              const raw = colSum / sumHours;
              const rounded = roundHalfUp(raw, 2);
              poValues.push(rounded.toFixed(2));
            } else {
              poValues.push('');
            }
          }

          const psoValues: Array<number | string> = [];
          for (let j = 0; j < 3; j++) {
            const colSum = rows.reduce((acc, r) => {
              const v = Number((r.pso && r.pso[j]) ?? 0);
              return acc + (Number.isFinite(v) ? v : 0);
            }, 0);
            if (sumHours > 0) {
              const raw = colSum / sumHours;
              const rounded = roundHalfUp(raw, 2);
              psoValues.push(rounded.toFixed(2));
            } else {
              psoValues.push('');
            }
          }

          return [label, ...poValues, ...psoValues, sumHours || ''];
        };

        for (let i = 0; i < 5; i++) {
          courseDeliveryRows.push(buildRowForUnit(i, `CO${i + 1}`));
        }

        const summaryRows: Array<Array<any>> = (() => {
          const data: Array<Array<any>> = [];
          const cols = 11 + 3;

          // per-CO rows: multiply each PO/PSO by 3; if result is 0 -> keep as blank to show '-'
          courseDeliveryRows.forEach((r) => {
            const label = r[0];
            const poPso = r.slice(1, 1 + cols);
            const converted = poPso.map((v) => {
              if (v === '' || v === null || v === undefined) return '';
              const n = Number(String(v));
              if (!Number.isFinite(n)) return '';
              const mul = n * 3;
              const rounded = roundHalfUp(mul, 2);
              return rounded === 0 ? '' : rounded.toFixed(2);
            });

            const nums = converted.map((s) => (s === '' ? null : Number(s))).filter((n) => n !== null) as number[];
            const avg = nums.length ? roundHalfUp(nums.reduce((a, b) => a + b, 0) / nums.length, 2).toFixed(2) : '';
            data.push([label, ...converted, avg]);
          });

          // column averages
          const colAverages: Array<any> = [];
          for (let c = 0; c < cols; c++) {
            const vals: number[] = [];
            for (let r = 0; r < data.length; r++) {
              const v = data[r][1 + c];
              if (v === '' || v === null || v === undefined) continue;
              const n = Number(v);
              if (Number.isFinite(n)) vals.push(n);
            }
            if (vals.length) {
              colAverages.push(roundHalfUp(vals.reduce((a, b) => a + b, 0) / vals.length, 2).toFixed(2));
            } else {
              colAverages.push('');
            }
          }

          const rowAvgs = data.map((r) => r[r.length - 1]).filter((v) => v !== '' ).map(Number);
          const overallAvg = rowAvgs.length ? roundHalfUp(rowAvgs.reduce((a, b) => a + b, 0) / rowAvgs.length, 2).toFixed(2) : '';

          data.push(['Average', ...colAverages, overallAvg]);

          return data;
        })();

        return (
          <>
            <CollapsibleTable
              title="CO → PO/PSO (Course Delivery)"
              headers={['COs', ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`), ...Array.from({ length: 3 }, (_, i) => `PSO${i + 1}`), 'Course delivery']}
              rows={courseDeliveryRows}
              collapsedByDefault={true}
            />

            {/* Second table: visible by default and includes Average row */}
            <CollapsibleTable
              title="CO → PO/PSO Summary"
              headers={['COs', ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`), ...Array.from({ length: 3 }, (_, i) => `PSO${i + 1}`), 'Average']}
              rows={summaryRows}
              collapsedByDefault={false}
              showToggle={false}
            />
          </>
        );
      })()}

      

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
