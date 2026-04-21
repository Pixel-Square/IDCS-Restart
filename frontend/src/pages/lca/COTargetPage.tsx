import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchCdapRevision, fetchArticulationMatrix } from '../../services/cdapDb';
import { createEditRequest, fetchMyTeachingAssignments, formatEditRequestSentMessage } from '../../services/obe';
import { fetchDeptRows } from '../../services/curriculum';
import { fetchCoTargetRevision, fetchLcaRevision, saveCoTargetRevision } from '../../services/lcaDb';

const styles: { [k: string]: React.CSSProperties } = {
  page: { padding: '20px 24px', width: '100%', boxSizing: 'border-box', minHeight: '100vh', fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial", color: '#1f3947' },
  card: { background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #e6eef8', boxShadow: '0 6px 20px rgba(13,60,100,0.04)', overflowX: 'auto' as React.CSSProperties['overflowX'] },
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
  targetTable: { width: '100%', borderCollapse: 'collapse', border: '2px solid #0b3b57', tableLayout: 'fixed' as const },
  targetTh: { padding: '12px 10px', border: '1px solid #0b3b57', textAlign: 'center' as const, verticalAlign: 'middle' as const, fontWeight: 800, fontSize: 13, lineHeight: 1.35 },
  targetTd: { padding: '12px 10px', border: '1px solid #d7e3ee', textAlign: 'center' as const, verticalAlign: 'middle' as const, fontSize: 13, lineHeight: 1.35 },
  targetScaleValueTd: { padding: '12px 10px', border: '1px solid #d7e3ee', textAlign: 'center' as const, verticalAlign: 'middle' as const, fontSize: 20, lineHeight: 1.2, fontWeight: 900, color: '#0b3b57' },
  targetTdLabel: { padding: '12px 10px', border: '1px solid #d7e3ee', textAlign: 'left' as const, verticalAlign: 'middle' as const, fontSize: 13, lineHeight: 1.35, fontWeight: 700 },
  targetWeightInput: { ...({ width: '100%', maxWidth: 86, margin: '0 auto', display: 'block', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', textAlign: 'center' } as React.CSSProperties), background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' },
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
  type LearnerCentricCode = 'L1' | 'L2' | 'L3' | '-';

  const location = useLocation();
  const navigate = useNavigate();

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [revStatus, setRevStatus] = useState<string>('draft');
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [learnerCentricLevelCode, setLearnerCentricLevelCode] = useState<LearnerCentricCode>('-');

  const containerStyle = embedded ? { padding: 12, width: '100%', margin: 0 } as React.CSSProperties : styles.page;

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

  // API summary inputs
  const [apiSummary, setApiSummary] = useState<{ batchCay: string; noOfSuccessful: string; meanCgpa: string }>(
    { batchCay: '', noOfSuccessful: '', meanCgpa: '' }
  );

  const fixedLcaLevels = { l3: 60, l2: 55, l1: 50 };

  // Load previously saved CO Target inputs
  useEffect(() => {
    let mounted = true;
    const subjectId = String(courseCode || '').trim();
    if (!subjectId) return;
    (async () => {
      try {
        const res = await fetchCoTargetRevision(subjectId);
        setRevStatus(String((res as any)?.status || 'draft'));
        const d = (res as any)?.data || {};
        if (!mounted) return;
        if (Array.isArray(d.btlSelection) && d.btlSelection.length === 5) {
          setBtlSelection(d.btlSelection);
        }
        if (d.weights && typeof d.weights === 'object') {
          setWeights((p) => ({
            ...p,
            ico: Number((d.weights as any).ico ?? p.ico),
            bco: Number((d.weights as any).bco ?? p.bco),
            aco: Number((d.weights as any).aco ?? p.aco),
            api: Number((d.weights as any).api ?? p.api),
            iic: Number((d.weights as any).iic ?? p.iic),
          }));
        }
        if (Array.isArray(d.manuals) && d.manuals.length === 5) {
          setManuals(d.manuals);
        }
        if (d.apiSummary && typeof d.apiSummary === 'object') {
          setApiSummary((p) => ({
            batchCay: String((d.apiSummary as any).batchCay ?? p.batchCay),
            noOfSuccessful: String((d.apiSummary as any).noOfSuccessful ?? p.noOfSuccessful),
            meanCgpa: String((d.apiSummary as any).meanCgpa ?? p.meanCgpa),
          }));
        }
        setSaveNote('Loaded');
      } catch {
        // ignore load failures
      }
    })();
    return () => {
      mounted = false;
    };
  }, [courseCode]);

  const readOnly = String(revStatus || '').toLowerCase() === 'published';

  const handlePublish = async () => {
    const missingBtl = btlSelection.map((v, i) => v === null ? i : -1).filter((i) => i >= 0);
    if (missingBtl.length > 0) {
      setValidationErrors(new Set(['btl']));
      setSaveNote(`Please select a BTL level for: ${missingBtl.map((i) => `CO${i + 1}`).join(', ')}`);
      return;
    }
    setValidationErrors(new Set());
    const subjectId = String(courseCode || '').trim();
    if (!subjectId) {
      setSaveNote('Missing course code');
      return;
    }
    setSaveBusy(true);
    setSaveNote(null);
    setEditRequestOpen(false);
    try {
      await saveCoTargetRevision(
        subjectId,
        {
          btlSelection,
          weights,
          manuals,
          apiSummary,
          lcaLevels: fixedLcaLevels,
        },
        'published',
      );
      setRevStatus('published');
      setSaveNote('Published');
    } catch (e: any) {
      setSaveNote(String(e?.message || 'Publish failed'));
    } finally {
      setSaveBusy(false);
    }
  };

  const handleSendEditRequest = async () => {
    const subjectId = String(courseCode || '').trim();
    if (!subjectId) {
      setSaveNote('Missing course code');
      return;
    }
    const reason = String(editReason || '').trim();
    if (!reason) {
      setSaveNote('Please enter a reason');
      return;
    }
    setSaveBusy(true);
    setSaveNote(null);
    try {
      const created = await createEditRequest({
        assessment: 'lca' as any,
        subject_code: subjectId,
        scope: 'MARK_MANAGER',
        reason,
      });
      setSaveNote(formatEditRequestSentMessage(created));
      setEditRequestOpen(false);
    } catch (e: any) {
      setSaveNote(String(e?.message || 'Request failed'));
    } finally {
      setSaveBusy(false);
    }
  };

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

  function convertHundredScaleToThreeScale(value: number | null) {
    if (!Number.isFinite(value)) return null;
    return roundHalfUp(((value as number) * 3) / 100, 2);
  }

  function levelFromBands1to3(counts: { band1?: number | string; band2?: number | string; band3?: number | string }): 1 | 2 | 3 | '-' {
    const v1 = typeof counts.band1 === 'number' ? counts.band1 : Number(counts.band1) || 0;
    const v2 = typeof counts.band2 === 'number' ? counts.band2 : Number(counts.band2) || 0;
    const v3 = typeof counts.band3 === 'number' ? counts.band3 : Number(counts.band3) || 0;
    const total = v1 + v2 + v3;
    if (!total) return '-';
    const max = Math.max(v1, v2, v3);
    if (max === v1) return 1;
    if (max === v2) return 2;
    return 3;
  }

  function learnerCentricFromCourseLevel(level: string | null | undefined): LearnerCentricCode {
    if (level === 'EC') return 'L1';
    if (level === 'MC') return 'L2';
    if (level === 'HC') return 'L3';
    return '-';
  }

  function deriveLearnerCentricLevelFromRevision(data: any): LearnerCentricCode {
    const pbrLevel = learnerCentricFromCourseLevel(String(data?.pbrManualCourseLevel || '-'));
    if (pbrLevel !== '-') return pbrLevel;

    const prerequisites = Array.isArray(data?.prerequisites) ? data.prerequisites : [];
    const prereqLevels = prerequisites
      .map((row: any) => levelFromBands1to3({ band1: row?.band1, band2: row?.band2, band3: row?.band3 }))
      .filter((value: 1 | 2 | 3 | '-') : value is 1 | 2 | 3 => value !== '-');

    if (!prereqLevels.length) return '-';

    const average = prereqLevels.reduce((acc, value) => acc + value, 0) / prereqLevels.length;
    const standardized = Math.floor(Number(average.toFixed(2)));
    if (standardized === 1) return 'L1';
    if (standardized === 2) return 'L2';
    if (standardized === 3) return 'L3';
    return '-';
  }

  useEffect(() => {
    let mounted = true;
    const subjectId = String(courseCode || '').trim();
    if (!subjectId) return;
    (async () => {
      try {
        const res = await fetchLcaRevision(subjectId);
        if (!mounted) return;
        const d = (res as any)?.data || {};
        setLearnerCentricLevelCode(deriveLearnerCentricLevelFromRevision(d));
      } catch {
        if (!mounted) return;
        setLearnerCentricLevelCode('-');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [courseCode]);

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

  const apiGpaComputed = React.useMemo(() => {
    const strength = Number(apiSummary.batchCay);
    const noOfSuccessful = Number(apiSummary.noOfSuccessful);
    const meanCgpa = Number(apiSummary.meanCgpa);

    if (!Number.isFinite(strength) || !Number.isFinite(noOfSuccessful) || !Number.isFinite(meanCgpa) || strength <= 0) {
      return null;
    }

    return roundHalfUp((meanCgpa * noOfSuccessful / strength) * 10, 2);
  }, [apiSummary]);

  const acoComputed = React.useMemo(() => {
    return manuals.map((entry) => {
      const subValue = Number(entry?.aco);
      if (!Number.isFinite(subValue)) return null;
      return roundHalfUp((subValue * 3) / 100, 2);
    });
  }, [manuals]);

  const iicComputed = React.useMemo(() => {
    if (learnerCentricLevelCode === 'L1') return 50;
    if (learnerCentricLevelCode === 'L2') return 55;
    if (learnerCentricLevelCode === 'L3') return 60;
    return null;
  }, [learnerCentricLevelCode]);

  const coTargetComputed = React.useMemo(() => {
    return Array.from({ length: 5 }, (_, idx) => {
      const icoValue = icoComputed?.[idx]?.ico;
      const bcoValue = bcoComputed[idx];
      const acoValue = acoComputed[idx];

      if (
        !Number.isFinite(icoValue) ||
        !Number.isFinite(bcoValue) ||
        !Number.isFinite(acoValue) ||
        !Number.isFinite(apiGpaComputed) ||
        !Number.isFinite(iicComputed)
      ) {
        return { target: null, scale: null };
      }

      const target = roundHalfUp(
        (icoValue as number) * weights.ico +
          (bcoValue as number) * weights.bco +
          (acoValue as number) * weights.aco +
          (apiGpaComputed as number) * weights.api +
          (iicComputed as number) * weights.iic,
        2,
      );

      return {
        target,
        scale: convertHundredScaleToThreeScale(target),
      };
    });
  }, [acoComputed, apiGpaComputed, bcoComputed, icoComputed, iicComputed, weights]);

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

  const coLabels = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];

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
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={!readOnly ? handlePublish : () => setEditRequestOpen(true)}
                  disabled={saveBusy}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #e6eef8',
                    background: '#fbfdff',
                    cursor: saveBusy ? 'not-allowed' : 'pointer',
                    fontWeight: 800,
                    color: '#0b4a6f',
                    opacity: saveBusy ? 0.7 : 1,
                  }}
                >
                  {saveBusy ? 'Please wait…' : !readOnly ? 'Publish' : 'Request Edit'}
                </button>
                <button
                  onClick={() => navigate(-1)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e6eef8', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                >
                  ← Back
                </button>
              </div>
            ) : onClose ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={!readOnly ? handlePublish : () => setEditRequestOpen(true)}
                  disabled={saveBusy}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #e6eef8',
                    background: '#fbfdff',
                    cursor: saveBusy ? 'not-allowed' : 'pointer',
                    fontWeight: 800,
                    color: '#0b4a6f',
                    opacity: saveBusy ? 0.7 : 1,
                  }}
                >
                  {saveBusy ? 'Please wait…' : !readOnly ? 'Publish' : 'Request Edit'}
                </button>
                <button
                  onClick={onClose}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e6eef8', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {editRequestOpen && readOnly && (
          <div style={{ marginTop: -6, marginBottom: 10, background: '#fff7ed', border: '1px solid #fed7aa', color: '#7c2d12', padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Request edit approval (IQAC)</div>
            <textarea
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Reason for requesting edits"
              style={{ width: '100%', minHeight: 72, borderRadius: 10, border: '1px solid #fdba74', padding: 10, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="obe-btn obe-btn-secondary" onClick={() => setEditRequestOpen(false)} disabled={saveBusy}>
                Cancel
              </button>
              <button type="button" className="obe-btn obe-btn-primary" onClick={handleSendEditRequest} disabled={saveBusy}>
                {saveBusy ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        )}

        {saveNote && (
          <div style={{ marginTop: -6, marginBottom: 10, color: saveNote === 'Published' ? '#067647' : (validationErrors.size > 0 ? '#b42318' : '#557085'), fontWeight: 700, whiteSpace: 'pre-line', ...(validationErrors.size > 0 ? { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px' } : {}) }}>
            {saveNote}
          </div>
        )}

        <div style={{ pointerEvents: readOnly ? 'none' : 'auto', opacity: readOnly ? 0.94 : 1 }}>
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
                        <td style={styles.td}>{data.ico.toFixed(2)}</td>
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
                    <tr key={co} style={validationErrors.has('btl') && btlSelection[idx] === null ? { background: '#fef2f2' } : {}}>
                      <td style={{ ...styles.tdLeft, ...(validationErrors.has('btl') && btlSelection[idx] === null ? { borderLeft: '3px solid #ef4444' } : {}) }}>{co}</td>
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
                                if (validationErrors.size > 0) setValidationErrors(new Set());
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
                  {coLabels.map((co, idx) => (
                    <tr key={co}>
                      <td style={styles.tdLeft}>{co}</td>
                       <td style={styles.td}><input min={0} step="any" style={styles.inputNumber} type="number" value={manuals[idx]?.aco ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : e.target.value; setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], aco: v === null ? null : Number(v) }; return copy; }); }} onBlur={(e) => { const v = normalizeNumberInput(e.target.value, 2, true); setManuals((m) => { const copy = [...m]; copy[idx] = { ...copy[idx], aco: v }; return copy; }); }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 4. Average Performance Index (API) - spreadsheet style */}
            <div style={{ ...styles.card, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12, color: '#0b3b57', fontSize: 15 }}>4. Average Performance Index (API)</div>

              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Left: summary inputs */}
                <div style={{ flex: '1 1 260px', minWidth: 220 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: '#334e68', fontSize: 13 }}>Strength Summary</div>
                  <table style={{ borderCollapse: 'collapse', width: '100%', border: '1px solid #94a3b8', borderRadius: 6, overflow: 'hidden' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '10px 12px', background: '#f3f8ff', color: '#0b4a6f', fontWeight: 700, fontSize: 13, textAlign: 'left', borderBottom: '1px solid #94a3b8', borderRight: '1px solid #94a3b8' }}>FIELD</th>
                        <th style={{ padding: '10px 12px', background: '#f3f8ff', color: '#0b4a6f', fontWeight: 700, fontSize: 13, textAlign: 'center', borderBottom: '1px solid #94a3b8' }}>VALUE</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '10px 12px', background: '#fff', fontWeight: 700, fontSize: 13, borderRight: '1px solid #94a3b8', borderBottom: '1px solid #e2e8f0', minWidth: 160 }}>STRENGTH</td>
                        <td style={{ padding: '6px 10px', background: '#fef9c3', borderBottom: '1px solid #e2e8f0' }}>
                          <input
                            type="number"
                            min={0}
                            value={apiSummary.batchCay}
                            onChange={(e) => setApiSummary((p) => ({ ...p, batchCay: e.target.value }))}
                            placeholder="0"
                            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 14, outline: 'none', fontWeight: 700, boxSizing: 'border-box' }}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '10px 12px', background: '#fff', fontWeight: 700, fontSize: 13, borderRight: '1px solid #94a3b8', borderBottom: '1px solid #e2e8f0' }}>NO OF SUCCESSFUL</td>
                        <td style={{ padding: '6px 10px', background: '#fef9c3', borderBottom: '1px solid #e2e8f0' }}>
                          <input
                            type="number"
                            min={0}
                            value={apiSummary.noOfSuccessful}
                            onChange={(e) => setApiSummary((p) => ({ ...p, noOfSuccessful: e.target.value }))}
                            placeholder="0"
                            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 14, outline: 'none', fontWeight: 700, boxSizing: 'border-box' }}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '10px 12px', background: '#fff', fontWeight: 700, fontSize: 13, borderRight: '1px solid #94a3b8' }}>MEAN CGPA</td>
                        <td style={{ padding: '6px 10px', background: '#fef9c3' }}>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={apiSummary.meanCgpa}
                            onChange={(e) => setApiSummary((p) => ({ ...p, meanCgpa: e.target.value }))}
                            placeholder="0.00"
                            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 14, outline: 'none', fontWeight: 700, boxSizing: 'border-box' }}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* API summary line */}
                  <div style={{ marginTop: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: '#0b4a6f', fontWeight: 700, fontSize: 13 }}>API (GPA) =</span>
                    <span style={{ background: '#fff', border: '2px solid #0b4a6f', padding: '4px 14px', borderRadius: 6, fontWeight: 900, fontSize: 15, minWidth: 60, textAlign: 'center' }}>
                      {apiGpaComputed != null ? apiGpaComputed.toFixed(2) : '—'}
                    </span>
                    <span style={{ color: '#557085', fontSize: 13 }}>/100</span>
                  </div>
                </div>

              </div>
            </div>

            {/* 5. Improvement Index (IIC) - spreadsheet style (restyled to match image) */}
            <div style={{ ...styles.card, padding: 18, minHeight: 180 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>5. The Improvement Index on CO attainment (IIC)</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
                {/* Top: Learner Centric Approach (LCA) box */}
                <div style={{ border: '2px solid #0b3b57', borderRadius: 4, overflow: 'hidden', width: 280, background: '#fff' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                      <tr>
                        <td colSpan={2} style={{ padding: '10px 12px', background: '#f8fafc', fontWeight: 800, color: '#0b3b57' }}>Learner Centric Approach (LCA)</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'right', paddingRight: 20, fontWeight: 700 }}>L3</td>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'center', fontWeight: 800 }}>
                          <div style={{ width: 90, margin: '0 auto', padding: '6px 8px', borderRadius: 10, border: '1px solid #0b3b57', textAlign: 'center', fontWeight: 700, background: '#f5f5f5' }}>
                            {fixedLcaLevels.l3}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'right', paddingRight: 20, fontWeight: 700 }}>L2</td>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'center', fontWeight: 800 }}>
                          <div style={{ width: 90, margin: '0 auto', padding: '6px 8px', borderRadius: 10, border: '1px solid #0b3b57', textAlign: 'center', fontWeight: 700, background: '#f5f5f5' }}>
                            {fixedLcaLevels.l2}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'right', paddingRight: 20, fontWeight: 700 }}>L1</td>
                        <td style={{ padding: 10, background: '#bfdbfe', textAlign: 'center', fontWeight: 800 }}>
                          <div style={{ width: 90, margin: '0 auto', padding: '6px 8px', borderRadius: 10, border: '1px solid #0b3b57', textAlign: 'center', fontWeight: 700, background: '#f5f5f5' }}>
                            {fixedLcaLevels.l1}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Bottom: Course Outcome Attainment Targets table */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
                  <div style={{ width: '100%' }}>
                    <div style={{ fontWeight: 800, marginBottom: 8, textAlign: 'center', color: '#0b3b57' }}>The Course Outcome Attainment Targets</div>
                    <table style={styles.targetTable}>
                      <colgroup>
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '17%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={{ ...styles.targetTh, background: '#e6f2ff', color: '#0b3b57' }}>COs</th>
                          <th style={{ ...styles.targetTh, background: '#e6f8ff', color: '#0b4a6f' }}>ICO</th>
                          <th style={{ ...styles.targetTh, background: '#e6f8ff', color: '#0b4a6f' }}>BCO</th>
                          <th style={{ ...styles.targetTh, background: '#fde8f0', color: '#6b213f' }}>ACO</th>
                          <th style={{ ...styles.targetTh, background: '#fde8f0', color: '#6b213f' }}>API</th>
                          <th style={{ ...styles.targetTh, background: '#fde8f0', color: '#6b213f' }}>IIC</th>
                          <th style={{ ...styles.targetTh, background: '#fff7d6', color: '#6b4a00' }}>COs Targets</th>
                          <th style={{ ...styles.targetTh, background: '#fff7d6', color: '#6b4a00' }}>CO TARGET IN 3 POINT SCALE</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ ...styles.targetTdLabel, background: '#f3f8ff' }}>Weight Values</td>
                          <td style={styles.targetTd}><input min={0} step="any" style={styles.targetWeightInput} type="number" value={weights.ico} readOnly disabled aria-label="ICO weight (locked)" title="ICO weight is locked" /></td>
                          <td style={styles.targetTd}><input min={0} step="any" style={styles.targetWeightInput} type="number" value={weights.bco} readOnly disabled aria-label="BCO weight (locked)" title="BCO weight is locked" /></td>
                          <td style={styles.targetTd}><input min={0} step="any" style={styles.targetWeightInput} type="number" value={weights.aco} readOnly disabled aria-label="ACO weight (locked)" title="ACO weight is locked" /></td>
                          <td style={styles.targetTd}><input min={0} step="any" style={styles.targetWeightInput} type="number" value={weights.api} readOnly disabled aria-label="API weight (locked)" title="API weight is locked" /></td>
                          <td style={styles.targetTd}><input min={0} step="any" style={styles.targetWeightInput} type="number" value={weights.iic} readOnly disabled aria-label="IIC weight (locked)" title="IIC weight is locked" /></td>
                          <td style={styles.targetTd}></td>
                          <td style={styles.targetTd}></td>
                        </tr>
                        {['CO-1','CO-2','CO-3','CO-4','CO-5'].map((c, idx) => (
                          <tr key={c}>
                            <td style={styles.targetTdLabel}>{c}</td>
                            <td style={styles.targetTd}>{(icoComputed && icoComputed[idx]) ? icoComputed[idx].ico.toFixed(2) : ''}</td>
                            <td style={styles.targetTd}>{bcoComputed[idx] ?? ''}</td>
                            <td style={styles.targetTd}>{acoComputed[idx] != null ? acoComputed[idx]?.toFixed(2) : ''}</td>
                            <td style={styles.targetTd}>{apiGpaComputed != null ? apiGpaComputed.toFixed(2) : ''}</td>
                            <td style={styles.targetTd}>{iicComputed ?? ''}</td>
                            <td style={styles.targetTd}>{coTargetComputed[idx]?.target != null ? coTargetComputed[idx].target.toFixed(2) : ''}</td>
                            <td style={styles.targetScaleValueTd}>{coTargetComputed[idx]?.scale != null ? coTargetComputed[idx].scale.toFixed(2) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  
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
