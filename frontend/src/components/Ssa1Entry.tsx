import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';

type Props = { subjectId: string };

type Ssa1Row = {
  section: string;
  registerNo: string;
  name: string;
  asmt1: number;
};

type Ssa1Sheet = {
  termLabel: string;
  batchLabel: string;
  rows: Ssa1Row[];
};

const MAX_ASMT1 = 20;
const CO_MAX = { co1: 10, co2: 10 };
const BTL_MAX = { btl1: 0, btl2: 0, btl3: 10, btl4: 10, btl5: 0, btl6: 0 };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(mark: number, max: number) {
  if (!max) return '-';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
}

function storageKey(subjectId: string) {
  return `ssa1_sheet_${subjectId}`;
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')]
    .concat(
      rows.map((r) =>
        headers
          .map((h) => {
            const v = r[h];
            const s = String(v ?? '').replace(/\n/g, ' ');
            return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      ),
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Ssa1Entry({ subjectId }: Props) {
  const key = useMemo(() => storageKey(subjectId), [subjectId]);
  const [sheet, setSheet] = useState<Ssa1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    rows: [],
  });

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<Ssa1Sheet>(key);
    if (stored && typeof stored === 'object' && Array.isArray((stored as any).rows)) {
      setSheet({
        termLabel: String((stored as any).termLabel || 'KRCT AY25-26'),
        batchLabel: String((stored as any).batchLabel || subjectId),
        rows: (stored as any).rows,
      });
    } else {
      setSheet({ termLabel: 'KRCT AY25-26', batchLabel: subjectId, rows: [] });
    }
  }, [key, subjectId]);

  const saveLocal = () => {
    lsSet(key, sheet);
    alert('SSA1 sheet saved locally.');
  };

  const addRow = () => {
    setSheet((prev) => ({
      ...prev,
      rows: prev.rows.concat({ section: '', registerNo: '', name: '', asmt1: 0 }),
    }));
  };

  const removeLastRow = () => {
    setSheet((prev) => ({ ...prev, rows: prev.rows.slice(0, Math.max(0, prev.rows.length - 1)) }));
  };

  const clearAll = () => {
    if (!confirm('Clear all rows for SSA1?')) return;
    setSheet((prev) => ({ ...prev, rows: [] }));
  };

  const updateRow = (idx: number, patch: Partial<Ssa1Row>) => {
    setSheet((prev) => {
      const copy = prev.rows.slice();
      const existing = copy[idx] || { section: '', registerNo: '', name: '', asmt1: 0 };
      copy[idx] = { ...existing, ...patch };
      return { ...prev, rows: copy };
    });
  };

  const exportSheetCsv = () => {
    const out = sheet.rows.map((r, i) => {
      const asmt1 = clamp(Number(r.asmt1 || 0), 0, MAX_ASMT1);
      const total = asmt1;
      const co1 = clamp(asmt1, 0, CO_MAX.co1);
      const co2 = clamp(asmt1 - CO_MAX.co1, 0, CO_MAX.co2);
      const btl1 = 0;
      const btl2 = 0;
      const btl3 = co1;
      const btl4 = co2;
      const btl5 = 0;
      const btl6 = 0;

      return {
        sno: i + 1,
        section: r.section,
        registerNo: r.registerNo,
        name: r.name,
        asmt1,
        total,
        co1_mark: co1,
        co1_pct: pct(co1, CO_MAX.co1),
        co2_mark: co2,
        co2_pct: pct(co2, CO_MAX.co2),
        btl1_mark: btl1,
        btl1_pct: pct(btl1, BTL_MAX.btl1),
        btl2_mark: btl2,
        btl2_pct: pct(btl2, BTL_MAX.btl2),
        btl3_mark: btl3,
        btl3_pct: pct(btl3, BTL_MAX.btl3),
        btl4_mark: btl4,
        btl4_pct: pct(btl4, BTL_MAX.btl4),
        btl5_mark: btl5,
        btl5_pct: pct(btl5, BTL_MAX.btl5),
        btl6_mark: btl6,
        btl6_pct: pct(btl6, BTL_MAX.btl6),
      };
    });

    downloadCsv(`${subjectId}_SSA1_sheet.csv`, out);
  };

  const cellTh: React.CSSProperties = {
    border: '1px solid #111',
    padding: '6px 6px',
    background: '#f3f4f6',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 12,
    whiteSpace: 'nowrap',
  };

  const cellTd: React.CSSProperties = {
    border: '1px solid #111',
    padding: '6px 6px',
    fontSize: 12,
    whiteSpace: 'nowrap',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 12,
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>SSA1 Sheet</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            Excel-like layout (CO + BTL attainment). Subject: <b>{subjectId}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={addRow} style={{ padding: '6px 10px' }}>
            Add Row
          </button>
          <button
            onClick={removeLastRow}
            style={{ padding: '6px 10px' }}
            disabled={!sheet.rows.length}
            title={!sheet.rows.length ? 'No rows to remove' : 'Remove last row'}
          >
            Remove Last
          </button>
          <button
            onClick={clearAll}
            style={{ padding: '6px 10px' }}
            disabled={!sheet.rows.length}
            title={!sheet.rows.length ? 'No rows to clear' : 'Clear all rows'}
          >
            Clear
          </button>
          <button onClick={saveLocal} style={{ padding: '6px 10px' }}>
            Save Local
          </button>
          <button
            onClick={exportSheetCsv}
            style={{ padding: '6px 10px' }}
            disabled={!sheet.rows.length}
            title={!sheet.rows.length ? 'Add at least one row to export' : 'Export as CSV'}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 12,
          background: '#fff',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#374151' }}>
            Term
            <input
              value={sheet.termLabel}
              onChange={(e) => setSheet((p) => ({ ...p, termLabel: e.target.value }))}
              style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8 }}
            />
          </label>
          <label style={{ fontSize: 12, color: '#374151' }}>
            Sheet Label
            <input
              value={sheet.batchLabel}
              onChange={(e) => setSheet((p) => ({ ...p, batchLabel: e.target.value }))}
              style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8 }}
            />
          </label>
          <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
            CO split: 10 + 10; BTL active: BTL-3, BTL-4
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #111', borderRadius: 6 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1200 }}>
          <thead>
            <tr>
              <th style={cellTh} colSpan={22}>
                {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; SSA1
              </th>
            </tr>
            <tr>
              <th style={cellTh} rowSpan={3}>
                S.No
              </th>
              <th style={cellTh} rowSpan={3}>
                SECTION
              </th>
              <th style={cellTh} rowSpan={3}>
                Register No.
              </th>
              <th style={cellTh} rowSpan={3}>
                Name of the Students
              </th>
              <th style={cellTh} rowSpan={3}>
                ASMT1
              </th>
              <th style={cellTh} rowSpan={3}>
                Total
              </th>
              <th style={cellTh} colSpan={4}>
                CO ATTAINMENT
              </th>
              <th style={cellTh} colSpan={12}>
                BTL ATTAINMENT
              </th>
            </tr>
            <tr>
              <th style={cellTh} colSpan={2}>
                CO-1
              </th>
              <th style={cellTh} colSpan={2}>
                CO-2
              </th>
              <th style={cellTh} colSpan={2}>
                BTL-1
              </th>
              <th style={cellTh} colSpan={2}>
                BTL-2
              </th>
              <th style={cellTh} colSpan={2}>
                BTL-3
              </th>
              <th style={cellTh} colSpan={2}>
                BTL-4
              </th>
              <th style={cellTh} colSpan={2}>
                BTL-5
              </th>
              <th style={cellTh} colSpan={2}>
                BTL-6
              </th>
            </tr>
            <tr>
              {Array.from({ length: 8 }).flatMap((_, i) => (
                <React.Fragment key={i}>
                  <th style={cellTh}>Mark</th>
                  <th style={cellTh}>%</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} colSpan={4}>
                Name / Max Marks
              </td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_ASMT1}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_ASMT1}</td>

              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{CO_MAX.co1}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{CO_MAX.co2}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>

              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{BTL_MAX.btl1}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{BTL_MAX.btl2}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{BTL_MAX.btl3}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{BTL_MAX.btl4}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{BTL_MAX.btl5}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{BTL_MAX.btl6}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
            </tr>

            {sheet.rows.length === 0 ? (
              <tr>
                <td style={{ ...cellTd, textAlign: 'center', color: '#6b7280' }} colSpan={22}>
                  No rows yet. Click “Add Row” to start.
                </td>
              </tr>
            ) : (
              sheet.rows.map((r, i) => {
                const asmt1 = clamp(Number(r.asmt1 || 0), 0, MAX_ASMT1);
                const total = asmt1;

                const co1 = clamp(asmt1, 0, CO_MAX.co1);
                const co2 = clamp(asmt1 - CO_MAX.co1, 0, CO_MAX.co2);

                const btl1 = 0;
                const btl2 = 0;
                const btl3 = co1;
                const btl4 = co2;
                const btl5 = 0;
                const btl6 = 0;

                return (
                  <tr key={i}>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{i + 1}</td>
                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        value={r.section}
                        onChange={(e) => updateRow(i, { section: e.target.value })}
                        placeholder="A"
                      />
                    </td>
                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        value={r.registerNo}
                        onChange={(e) => updateRow(i, { registerNo: e.target.value })}
                        placeholder="8117..."
                      />
                    </td>
                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        value={r.name}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        placeholder="Student name"
                      />
                    </td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <input
                        style={{ ...inputStyle, textAlign: 'center' }}
                        type="number"
                        value={asmt1}
                        min={0}
                        max={MAX_ASMT1}
                        onChange={(e) => updateRow(i, { asmt1: Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{total}</td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co1, CO_MAX.co1)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co2, CO_MAX.co2)}</td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl1}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl1, BTL_MAX.btl1)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl2}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl2, BTL_MAX.btl2)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl3}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl3, BTL_MAX.btl3)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl4}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl4, BTL_MAX.btl4)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl5}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl5, BTL_MAX.btl5)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl6}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl6, BTL_MAX.btl6)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
        Saved key: <span style={{ fontFamily: 'monospace' }}>{key}</span>
      </div>
    </div>
  );
}
