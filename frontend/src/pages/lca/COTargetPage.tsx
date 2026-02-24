import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchCdapRevision, fetchArticulationMatrix } from '../../services/cdapDb';
import { fetchMyTeachingAssignments } from '../../services/obe';
import { fetchDeptRows } from '../../services/curriculum';

const styles: { [k: string]: React.CSSProperties } = {
  page: { padding: 28, maxWidth: 1100, margin: '18px auto', fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial", color: '#1f3947' },
  card: { background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #e6eef8', boxShadow: '0 6px 20px rgba(13,60,100,0.04)' },
  headerRow: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  label: { color: '#557085', fontSize: 12, fontWeight: 700 },
  codeBox: { background: '#fbfdff', border: '1px solid #e6eef8', padding: '10px 14px', borderRadius: 8, fontWeight: 800, color: '#0b4a6f', fontSize: 18 },
  nameBox: { background: '#fff', padding: '6px 10px', color: '#234451' },
  sectionTitle: { marginTop: 8, marginBottom: 12, color: '#0b3b57', fontSize: 16, fontWeight: 700 },
  paragraph: { color: '#334e68', lineHeight: 1.45, margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: 12 },
  th: { background: '#f3f8ff', color: '#0b4a6f', fontWeight: 700, padding: '12px', border: '1px solid #e6eef8', textAlign: 'center', fontSize: 13 },
  td: { padding: '12px', border: '1px solid #eef6fb', color: '#234451', fontSize: 13, textAlign: 'center' },
  tdLeft: { padding: '10px', border: '1px solid #eef6fb', color: '#234451', fontSize: 13, textAlign: 'left' },
  checkbox: { transform: 'scale(1.2)', cursor: 'pointer', margin: '0' },
  inputNumber: { width: 80, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1e3f0', textAlign: 'center' },
  note: { color: '#557085', fontSize: 13, marginTop: 8 },
};

export default function COTargetPage({
  courseCode = ' ',
  courseName = ' ',
  embedded = false,
  onClose,
}: {
  courseCode?: string;
  courseName?: string;
  embedded?: boolean;
  onClose?: () => void;
}): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();

  const containerStyle = embedded ? { padding: 12, maxWidth: 980, width: '100%', margin: '0 auto' } as React.CSSProperties : styles.page;

  // Display name state — will be set from multiple fallbacks so UI shows as soon as available
  const [cdapCourseName, setCdapCourseName] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>(() => {
    const fromProp = courseName && courseName.trim() ? courseName.trim() : '';
    const fromState = (location.state as any)?.courseName || '';
    const fromQuery = new URLSearchParams(location.search).get('name') || '';
    return fromProp || fromState || fromQuery || '';
  });

  const resolvedCourseName = displayName || cdapCourseName || '';

  const [teachingAssignmentId, setTeachingAssignmentId] = useState<number | null>(() => {
    try {
      const qp = new URLSearchParams(location.search);
      const raw = qp.get('teaching_assignment_id') || qp.get('teachingAssignmentId');
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  });

  // articulation matrix and derived 3s-scale rows (CO1..CO5 -> array of numbers)
  const [articulation, setArticulation] = useState<any | null>(null);
  const [threeScaleRows, setThreeScaleRows] = useState<number[][] | null>(null);

  // BTL selection state for table 2 (1..6 or null)
  const [btlSelection, setBtlSelection] = useState<(number | null)[]>(() => Array(5).fill(null));

  // weights for ICO, BCO, ACO, API, IIC (entered in the weight row of big table)
  const [weights, setWeights] = useState<{ ico: number; bco: number; aco: number; api: number; iic: number }>(
    { ico: 0.4, bco: 0.3, aco: 0.1, api: 0.1, iic: 0.1 }
  );

  // manual entries for ACO, API, IIC per CO (5 rows)
  const [manuals, setManuals] = useState<Array<{ aco?: number | null; api?: number | null; iic?: number | null }>>(
    Array.from({ length: 5 }, () => ({ aco: null, api: null, iic: null }))
  );

  // helper: round half up to given decimals
  function roundHalfUp(value: number, decimals: number) {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function normalizeNumberInput(raw: string | number | null, decimals = 2, allowNull = true) {
    if (raw === null || raw === undefined || raw === '') return allowNull ? null : 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) return allowNull ? null : 0;
    const v = roundHalfUp(n, decimals);
    return v < 0 ? 0 : v;
  }

  // fetch articulation matrix and compute 3s-scale per-CO rows (CO1..CO5)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!courseCode) return;
        const mat = await fetchArticulationMatrix(courseCode, typeof teachingAssignmentId === 'number' ? teachingAssignmentId : undefined);
        if (!mounted || !mat) return;
        setArticulation(mat);

        // compute per-CO values exactly like ArticulationMatrix "CO → PO/PSO Summary" (3s scale)
        // 1) raw = colSum/sumHours, rounded to 2dp
        // 2) multiply by 3, rounded to 2dp
        // 3) if 0 -> treated as blank and NOT counted for ICO rubric
        const units = Array.isArray(mat.units) ? mat.units : [];
        const threeRows: number[][] = [];

        const toThreeScale = (raw: number): number | null => {
          if (!Number.isFinite(raw)) return null;
          const roundedRaw = roundHalfUp(raw, 2);
          const mul = roundHalfUp(roundedRaw * 3, 2);
          return mul === 0 ? null : mul;
        };

        for (let i = 0; i < 5; i++) {
          const unit = units[i];
          if (!unit || !Array.isArray(unit.rows) || unit.rows.length === 0) {
            threeRows.push([]);
            continue;
          }

          const rowsArr = unit.rows;
          const sumHours = rowsArr.reduce((acc: number, r: any) => {
            const h = Number(r.hours);
            return acc + (Number.isFinite(h) ? h : 0);
          }, 0);

          const poCount = 11;
          const psoCount = 3;
          const values: number[] = [];

          for (let j = 0; j < poCount; j++) {
            const colSum = rowsArr.reduce((acc: number, r: any) => {
              const v = Number((r.po && r.po[j]) ?? 0);
              return acc + (Number.isFinite(v) ? v : 0);
            }, 0);
            if (sumHours > 0) {
              const raw = colSum / sumHours;
              const conv = toThreeScale(raw);
              if (conv != null) values.push(conv);
            }
          }

          for (let j = 0; j < psoCount; j++) {
            const colSum = rowsArr.reduce((acc: number, r: any) => {
              const v = Number((r.pso && r.pso[j]) ?? 0);
              return acc + (Number.isFinite(v) ? v : 0);
            }, 0);
            if (sumHours > 0) {
              const raw = colSum / sumHours;
              const conv = toThreeScale(raw);
              if (conv != null) values.push(conv);
            }
          }

          threeRows.push(values);
        }

        setThreeScaleRows(threeRows);
      } catch (e) {
        // ignore fetch errors
      }
    })();
    return () => { mounted = false; };
  }, [courseCode, teachingAssignmentId]);

  // Derived ICO computations from threeScaleRows
  const icoComputed = React.useMemo(() => {
    if (!threeScaleRows) return null;
    return threeScaleRows.map((vals) => {
      if (!Array.isArray(vals) || vals.length === 0) return { high: 0, med: 0, low: 0, total: 0, ico: 0 };
      let high = 0, med = 0, low = 0;
      vals.forEach((v) => {
        const num = Number(v);
        if (!Number.isFinite(num)) return;
        if (num >= 1.98) high++;
        else if (num >= 0.99) med++;
        else low++;
      });
      const total = high * 3 + med * 2 + low * 1;
      const denomCount = high + med + low;
      const icoVal = denomCount ? roundHalfUp((total / (denomCount * 3)) * 100, 2) : 0;
      return { high, med, low, total, ico: icoVal };
    });
  }, [threeScaleRows]);

  // computed BCO values (based on BTL selection)
  const bcoComputed = React.useMemo(() => btlSelection.map((s) => (s ? s * 10 : null)), [btlSelection]);

  // computed big table derived values (rounded weighted sum and final col)
  const bigTableComputed = React.useMemo(() => {
    const rowsOut: Array<{ weightedRounded: number; final: number }> = [];
    for (let i = 0; i < 5; i++) {
      const ico = icoComputed && icoComputed[i] ? icoComputed[i].ico : 0;
      const bco = bcoComputed[i] ?? 0;
      const aco = manuals[i]?.aco ?? 0;
      const api = manuals[i]?.api ?? 0;
      const iic = manuals[i]?.iic ?? 0;
      const sum = (ico * weights.ico) + (bco * weights.bco) + (aco * weights.aco) + (api * weights.api) + (iic * weights.iic);
      const rounded = Math.round(sum);
      const final = roundHalfUp(rounded * 0.03, 2);
      rowsOut.push({ weightedRounded: rounded, final });
    }
    return rowsOut;
  }, [icoComputed, bcoComputed, manuals, weights]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!cdapCourseName && courseCode && typeof teachingAssignmentId === 'number') {
          const data = await fetchCdapRevision(courseCode, teachingAssignmentId);
          if (!mounted || !data) return;
          // Try several common fields where course name may be stored
          const candidate =
            data.course_name || data.subject_name || data.courseName ||
            (data.revision && (data.revision.course_name || data.revision.courseName || data.revision.subject_name)) ||
            '';
          if (candidate) setCdapCourseName(String(candidate));
        }
      } catch (e) {
        // ignore fetch errors — fallback to other name sources
      }
    })();
    return () => { mounted = false; };
  }, [courseCode, cdapCourseName, teachingAssignmentId]);

  // update displayName when cdapCourseName becomes available
  useEffect(() => {
    if (cdapCourseName && !displayName) setDisplayName(cdapCourseName);
  }, [cdapCourseName, displayName]);

  // Secondary fallback: try to fetch course name from user's teaching assignments
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (displayName) return; // already have a name
        if (!courseCode) return;
        // 1) try teaching assignments
        try {
          const list = await fetchMyTeachingAssignments();
          if (!mounted) return;
          const matches = (list || []).filter((a) => String(a.subject_code) === String(courseCode));
          const any = matches[0] || null;
          if (teachingAssignmentId == null && any && (any as any).id != null) {
            const idNum = Number((any as any).id);
            if (Number.isFinite(idNum)) setTeachingAssignmentId(idNum);
          }
          if (any && any.subject_name) {
            setDisplayName(String(any.subject_name));
            return;
          }
        } catch {
          // ignore TA fetch errors
        }

        // 2) try curriculum dept rows
        try {
          const rows = await fetchDeptRows();
          if (!mounted) return;
          const code = String(courseCode);
          const codeU = code.toUpperCase();
          const pick = (rows || []).find((r) => String((r as any)?.course_code || '').trim() === code || String((r as any)?.course_code || '').trim().toUpperCase() === codeU);
          if (pick && (pick as any).course_name) {
            setDisplayName(String((pick as any).course_name));
            return;
          }
        } catch {
          // ignore curriculum fetch errors
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [courseCode, resolvedCourseName, displayName, teachingAssignmentId]);

  const rows = [
    { co: 'CO1', ico: 0.4, bco: 0.3, aco: 0.1, api: 0.1, iic: 0.1, target: 68, scale: 2.03 },
    { co: 'CO2', ico: 0.4, bco: 0.3, aco: 0.1, api: 0.1, iic: 0.1, target: 66, scale: 1.99 },
    { co: 'CO3', ico: 0.4, bco: 0.3, aco: 0.1, api: 0.1, iic: 0.1, target: 67, scale: 2.01 },
    { co: 'CO4', ico: 0.4, bco: 0.3, aco: 0.1, api: 0.1, iic: 0.1, target: 67, scale: 2.02 },
    { co: 'CO5', ico: 0.0, bco: 0.5, aco: 0.0, api: 0.0, iic: 0.0, target: 74, scale: 2.22 },
  ];

  return (
    <div style={containerStyle}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={styles.headerRow}>
            <div>
              <div style={styles.label}>COURSE CODE</div>
              <div style={styles.codeBox}>{courseCode}</div>
            </div>

            <div style={{ marginLeft: 12 }}>
              <div style={styles.label}>COURSE NAME</div>
              <div style={styles.nameBox}>{resolvedCourseName}</div>
            </div>
          </div>

          <div>
            {!embedded ? (
              <button
                onClick={() => navigate(-1)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e6eef8', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                ← Back
              </button>
            ) : onClose ? (
              <button
                onClick={onClose}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e6eef8', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Close
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ ...styles.card, padding: 14, marginTop: 0 }}>
          <div style={styles.sectionTitle}>Course Outcome Attainment — Targets</div>
          {/* removed automatic generation note per request */}
          {/* Render 5 smaller blocks/tables similar to the spreadsheet layout (stacked vertically) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
            {/* 1. ICO rubric */}
            <div style={{ ...styles.card, padding: 16, minHeight: 140 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>1. Rubrics for Impact (ICO)</div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>CO</th>
                    <th style={styles.th}>High (3)</th>
                    <th style={styles.th}>Medium (2)</th>
                    <th style={styles.th}>Low (1)</th>
                    <th style={styles.th}>Total</th>
                    <th style={styles.th}>ICO</th>
                  </tr>
                </thead>
                <tbody>
                  {['CO1','CO2','CO3','CO4','CO5'].map((co, idx) => {
                    const data = icoComputed && icoComputed[idx] ? icoComputed[idx] : { high: 0, med: 0, low: 0, total: 0, ico: 0 };
                    return (
                      <tr key={co}>
                        <td style={styles.tdLeft}>{co}</td>
                        <td style={styles.td}>{data.high}</td>
                        <td style={styles.td}>{data.med}</td>
                        <td style={styles.td}>{data.low}</td>
                        <td style={styles.td}>{data.total}</td>
                        <td style={styles.td}>{data.ico.toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 2. BCO / BTL table */}
            <div style={{ ...styles.card, padding: 16, minHeight: 140 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>2. BTL Level (BCO)</div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>CO</th>
                    <th style={styles.th}>BTL-1</th>
                    <th style={styles.th}>BTL-2</th>
                    <th style={styles.th}>BTL-3</th>
                    <th style={styles.th}>BTL-4</th>
                    <th style={styles.th}>BTL-5</th>
                    <th style={styles.th}>BTL-6</th>
                    <th style={styles.th}>BCO</th>
                  </tr>
                </thead>
                <tbody>
                  {['CO1','CO2','CO3','CO4','CO5'].map((co, idx) => (
                    <tr key={co}>
                      <td style={styles.tdLeft}>{co}</td>
                      {Array.from({ length: 6 }, (_, levelIdx) => {
                        const level = levelIdx + 1;
                        const selected = btlSelection[idx] === level;
                        return (
                          <td key={level} style={styles.td}>
                            <input
                              type="checkbox"
                              aria-label={`BTL-${level} for ${co}`}
                              style={styles.checkbox}
                              checked={!!selected}
                              onChange={() => {
                                setBtlSelection((prev) => {
                                  const copy = [...prev];
                                  if (copy[idx] === level) copy[idx] = null; // untick -> enable all
                                  else copy[idx] = level; // select this, others auto-disabled via checked logic
                                  return copy;
                                });
                              }}
                              disabled={btlSelection[idx] != null && btlSelection[idx] !== level}
                              title={btlSelection[idx] != null && btlSelection[idx] !== level ? 'Disabled while another BTL is selected' : `Select BTL-${level}`}
                            />
                          </td>
                        );
                      })}
                      <td style={styles.td}>{bcoComputed[idx] ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 3. Last year's ACO */}
            <div style={{ ...styles.card, padding: 16, minHeight: 120 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>3. Last year's Average CO attainment (ACO)</div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>COs</th>
                    <th style={styles.th}>SUB</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.co}>
                      <td style={styles.tdLeft}>{r.co}</td>
                       <td style={styles.td}><input min={0} step="any" style={styles.inputNumber} type="number" value={manuals[idx]?.aco ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : e.target.value; setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], aco: v === null ? null : Number(v) }; return copy; }); }} onBlur={(e) => { const v = normalizeNumberInput(e.target.value, 2, true); setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], aco: v }; return copy; }); }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 4. Average Performance Index (API) - spreadsheet style */}
            <div style={{ ...styles.card, padding: 16, minHeight: 120 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>4. Average Performance Index (API)</div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* Left: small table with yellow values (values cleared) - expanded */}
                <div style={{ border: '1px solid #94a3b8', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: 8, minWidth: 220, background: '#fff', fontWeight: 700, borderRight: '1px solid #94a3b8' }}>BATCH (CAY)</td>
                        <td style={{ padding: 8, background: '#fde68a', fontWeight: 800, textAlign: 'center' }}></td>
                      </tr>
                      <tr>
                        <td style={{ padding: 8, background: '#fff', borderTop: '1px solid #94a3b8', borderRight: '1px solid #94a3b8' }}>NO OF SUCCESSFUL</td>
                        <td style={{ padding: 8, background: '#fde68a', fontWeight: 800, textAlign: 'center' }}></td>
                      </tr>
                      <tr>
                        <td style={{ padding: 8, background: '#fff', borderTop: '1px solid #94a3b8', borderRight: '1px solid #94a3b8' }}>MEAN CGPA</td>
                        <td style={{ padding: 8, background: '#fde68a', fontWeight: 800, textAlign: 'center' }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Per-CO API manual inputs (sync to big table manuals[idx].api) */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Per-CO API (manual)</div>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>CO</th>
                        <th style={styles.th}>API</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['CO1','CO2','CO3','CO4','CO5'].map((co, idx) => (
                        <tr key={co}>
                          <td style={styles.tdLeft}>{co}</td>
                              <td style={styles.td}><input min={0} step="any" style={styles.inputNumber} type="number" value={manuals[idx]?.api ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : e.target.value; setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], api: v === null ? null : Number(v) }; return copy; }); }} onBlur={(e) => { const v = normalizeNumberInput(e.target.value, 2, true); setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], api: v }; return copy; }); }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Centered API summary line */}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ color: '#234451', fontWeight: 700 }}>Average Performance Index of the student's batch (API) - GPA =</div>
                <div style={{ border: '2px solid #0b4a6f', padding: '6px 10px', fontWeight: 900 }}></div>
                <div>/100</div>
              </div>
            </div>

            {/* 5. Improvement Index (IIC) - spreadsheet style (restyled to match image) */}
            <div style={{ ...styles.card, padding: 18, minHeight: 180 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>5. The Improvement Index on CO attainment (IIC)</div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* Left: Learner Centric Approach (LCA) box */}
                <div style={{ border: '2px solid #0b3b57', borderRadius: 4, overflow: 'hidden', width: 360, background: '#fff' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                      <tr>
                        <td colSpan={2} style={{ padding: 12, background: '#f8fafc', fontWeight: 800, color: '#0b3b57' }}>Learner Centric Approach (LCA)</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'right', paddingRight: 20, fontWeight: 700 }}>L3</td>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'center', fontWeight: 800 }}></td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'right', paddingRight: 20, fontWeight: 700 }}>L2</td>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'center', fontWeight: 800 }}></td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'right', paddingRight: 20, fontWeight: 700 }}>L1</td>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'center', fontWeight: 800 }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Right: large Course Outcome Attainment Targets table + green note box */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
                  <div style={{ width: '100%' }}>
                    <div style={{ fontWeight: 800, marginBottom: 8, textAlign: 'center', color: '#0b3b57' }}>The Course Outcome Attainment Targets</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #0b3b57' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: 10, borderRight: '1px solid #0b3b57', background: '#e6f2ff', color: '#0b3b57' }}>COs</th>
                          <th style={{ padding: 10, borderRight: '1px solid #0b3b57', background: '#e6f8ff', color: '#0b4a6f' }}>ICO</th>
                          <th style={{ padding: 10, borderRight: '1px solid #0b3b57', background: '#e6f8ff', color: '#0b4a6f' }}>BCO</th>
                          <th style={{ padding: 10, borderRight: '1px solid #0b3b57', background: '#fde8f0', color: '#6b213f' }}>ACO</th>
                          <th style={{ padding: 10, borderRight: '1px solid #0b3b57', background: '#fde8f0', color: '#6b213f' }}>API</th>
                          <th style={{ padding: 10, borderRight: '1px solid #0b3b57', background: '#fde8f0', color: '#6b213f' }}>IIC</th>
                          <th style={{ padding: 10, borderRight: '1px solid #0b3b57', background: '#fff7d6', color: '#6b4a00' }}>COs Targets</th>
                          <th style={{ padding: 10, background: '#fff7d6', color: '#6b4a00' }}>CO TARGET IN 3 POINT SCALE</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: 10, borderTop: '1px solid #e6eef8', background: '#f3f8ff', fontWeight: 700 }}>Weight Values</td>
                          <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}><input min={0} step="any" style={styles.inputNumber} type="number" value={weights.ico} onChange={(e) => setWeights((w) => ({ ...w, ico: Number(e.target.value || 0) }))} onBlur={(e) => setWeights((w) => ({ ...w, ico: normalizeNumberInput(e.target.value, 2, false) as number }))} /></td>
                          <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}><input min={0} step="any" style={styles.inputNumber} type="number" value={weights.bco} onChange={(e) => setWeights((w) => ({ ...w, bco: Number(e.target.value || 0) }))} onBlur={(e) => setWeights((w) => ({ ...w, bco: normalizeNumberInput(e.target.value, 2, false) as number }))} /></td>
                          <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}><input min={0} step="any" style={styles.inputNumber} type="number" value={weights.aco} onChange={(e) => setWeights((w) => ({ ...w, aco: Number(e.target.value || 0) }))} onBlur={(e) => setWeights((w) => ({ ...w, aco: normalizeNumberInput(e.target.value, 2, false) as number }))} /></td>
                          <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}><input min={0} step="any" style={styles.inputNumber} type="number" value={weights.api} onChange={(e) => setWeights((w) => ({ ...w, api: Number(e.target.value || 0) }))} onBlur={(e) => setWeights((w) => ({ ...w, api: normalizeNumberInput(e.target.value, 2, false) as number }))} /></td>
                          <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}><input min={0} step="any" style={styles.inputNumber} type="number" value={weights.iic} onChange={(e) => setWeights((w) => ({ ...w, iic: Number(e.target.value || 0) }))} onBlur={(e) => setWeights((w) => ({ ...w, iic: normalizeNumberInput(e.target.value, 2, false) as number }))} /></td>
                          <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}></td>
                          <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}></td>
                        </tr>
                        {['CO-1','CO-2','CO-3','CO-4','CO-5'].map((c, idx) => (
                          <tr key={c}>
                            <td style={{ padding: 10, borderTop: '1px solid #eef6fb', textAlign: 'left', fontWeight: 700 }}>{c}</td>
                            <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}>{(icoComputed && icoComputed[idx]) ? icoComputed[idx].ico.toFixed(2) + '%' : ''}</td>
                            <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}>{bcoComputed[idx] ?? ''}</td>
                               <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}><input min={0} step="any" style={styles.inputNumber} type="number" value={manuals[idx]?.aco ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : e.target.value; setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], aco: v === null ? null : Number(v) }; return copy; }); }} onBlur={(e) => { const v = normalizeNumberInput(e.target.value, 2, true); setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], aco: v }; return copy; }); }} /></td>
                                 <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}><input min={0} step="any" style={styles.inputNumber} type="number" value={manuals[idx]?.api ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : e.target.value; setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], api: v === null ? null : Number(v) }; return copy; }); }} onBlur={(e) => { const v = normalizeNumberInput(e.target.value, 2, true); setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], api: v }; return copy; }); }} /></td>
                                 <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}><input min={0} step="any" style={styles.inputNumber} type="number" value={manuals[idx]?.iic ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : e.target.value; setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], iic: v === null ? null : Number(v) }; return copy; }); }} onBlur={(e) => { const v = normalizeNumberInput(e.target.value, 2, true); setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], iic: v }; return copy; }); }} /></td>
                            <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}>{bigTableComputed[idx]?.weightedRounded ?? ''}</td>
                            <td style={{ padding: 10, borderTop: '1px solid #eef6fb' }}>{bigTableComputed[idx]?.final ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ width: '100%', background: '#86efac', padding: 12, borderRadius: 6, border: '2px solid #16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontWeight: 700 }}>
                    TARGET TABLE WILL BE GENERATED AUTOMATICALLY
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
