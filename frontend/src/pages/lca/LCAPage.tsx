import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { fetchLcaRevision, saveLcaRevision } from '../../services/lcaDb';
import { createEditRequest, fetchMarkTableLockStatus, formatEditRequestSentMessage, MarkTableLockStatusResponse } from '../../services/obe';

type NumberInputProps = {
  value: number | '';
  onChange: (value: number | '') => void;
  min?: number;
  max?: number;
  highlightError?: boolean;
};

function NumberInput({ value, onChange, min, max, highlightError }: NumberInputProps): JSX.Element {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') {
          onChange('');
        } else {
          onChange(Number(v));
        }
      }}
      min={min}
      max={max}
      style={{
        width: '100%',
        minWidth: 56,
        padding: '8px 6px',
        borderRadius: 8,
        border: highlightError ? '2px solid #ef4444' : '1px solid #e6eef8',
        background: highlightError ? '#fef2f2' : undefined,
        outline: 'none',
        fontSize: 15,
        boxSizing: 'border-box' as React.CSSProperties['boxSizing'],
      }}
    />
  );
}

type TriBandCounts = {
  band1: number | '';
  band2: number | '';
  band3: number | '';
};

type PrerequisiteRow = {
  name: string;
  band1: number | '';
  band2: number | '';
  band3: number | '';
};

function levelFromBands1to3(counts: TriBandCounts): 1 | 2 | 3 | '-' {
  const v1 = typeof counts.band1 === 'number' ? counts.band1 : 0;
  const v2 = typeof counts.band2 === 'number' ? counts.band2 : 0;
  const v3 = typeof counts.band3 === 'number' ? counts.band3 : 0;
  const total = v1 + v2 + v3;
  if (!total) return '-';
  const max = Math.max(v1, v2, v3);
  if (max === v1) return 1;
  if (max === v2) return 2;
  return 3;
}

function mapNumericLevelToLearnerBand(level: 1 | 2 | 3 | '-'): { label: string; code: 'LL' | 'ML' | 'HL' | '-' } {
  if (level === 1) return { label: 'LOW LEVEL', code: 'LL' };
  if (level === 2) return { label: 'MEDIUM LEVEL', code: 'ML' };
  if (level === 3) return { label: 'HIGH LEVEL', code: 'HL' };
  return { label: '—', code: '-' };
}

const styles: { [k: string]: React.CSSProperties } = {
  page: {
    padding: 0,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    margin: 0,
    fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    color: '#1f3947',
    background: 'transparent',
  },
  card: {
    background: '#fff',
    borderRadius: 0,
    padding: 18,
    border: 'none',
    boxShadow: 'none',
    width: '100%',
    margin: 0,
    flex: '1 1 auto',
    overflowX: 'auto' as React.CSSProperties['overflowX'],
  },
  // ensure large pages fit the viewport and become scrollable
  cardScrollable: {
    maxHeight: 'calc(100vh - 120px)',
    overflowY: 'auto' as React.CSSProperties['overflowY'],
    WebkitOverflowScrolling: 'touch' as any,
  },
  title: { margin: 0, color: '#0b4a6f', fontSize: 26, fontWeight: 700 },
  subtitle: { marginTop: 6, color: '#3d5566', fontSize: 15 },
  sectionTitle: { margin: '0 0 10px 0', color: '#0b3b57', fontSize: 19, fontWeight: 700 },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: 8,
  },
  th: {
    background: '#f3f8ff',
    color: '#0b4a6f',
    fontWeight: 700,
    padding: '10px 14px',
    border: '1px solid #e6eef8',
    textAlign: 'center',
    fontSize: 15,
    whiteSpace: 'nowrap',
  },
  thLeft: {
    background: '#f3f8ff',
    color: '#0b4a6f',
    fontWeight: 700,
    padding: '10px 14px',
    border: '1px solid #e6eef8',
    textAlign: 'left',
    fontSize: 15,
    minWidth: 120,
  },
  td: {
    padding: '10px 14px',
    border: '1px solid #eef6fb',
    color: '#234451',
    fontSize: 15,
    textAlign: 'center',
  },
  tdLeft: {
    padding: '10px 14px',
    border: '1px solid #eef6fb',
    color: '#234451',
    fontSize: 15,
    textAlign: 'left',
    minWidth: 120,
  },
  cellYellow: { background: '#fef9c3' },
  cellGreen: { background: '#ecfdf3' },
  link: { color: '#0b4a6f', textDecoration: 'underline', fontWeight: 700 },
  btn: {
    border: '1px solid #e6eef8',
    background: '#fbfdff',
    padding: '10px 14px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
    color: '#0b4a6f',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 10,
    background: '#fbfdff',
    border: '1px solid #e6eef8',
    fontSize: 15,
    color: '#234451',
  },
};

type CourseLevelCode = 'HC' | 'MC' | 'EC' | '-';
type LearnerCentricCode = 'L1' | 'L2' | 'L3' | '-';

type PbrSummary = {
  fileName: string;
  studentsCount: number;
  meanGpa: number;
  courseLevel: Exclude<CourseLevelCode, '-'>;
};

function normalizeHeaderKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseNumericCell(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function courseLevelFromMeanGpa(meanGpa: number): Exclude<CourseLevelCode, '-'> {
  // Mirrors the sheet: 0-6 => HARD (HC), 6-8 => MEDIUM (MC), >8 => EASY (EC)
  // Resolve boundary by including 6 in HC and 8 in MC.
  if (meanGpa <= 6) return 'HC';
  if (meanGpa <= 8) return 'MC';
  return 'EC';
}

function learnerCentricFromCourseLevel(level: CourseLevelCode): LearnerCentricCode {
  // As requested:
  // EC => L1, MC => L2, HC => L3
  if (level === 'EC') return 'L1';
  if (level === 'MC') return 'L2';
  if (level === 'HC') return 'L3';
  return '-';
}

// Note: dynamically import 'xlsx' inside parsePbrExcel to avoid build-time resolution errors
// (helps show a clear error if the dependency is missing).
 
 async function parsePbrExcel(file: File): Promise<PbrSummary> {
  // Dynamic import so Vite doesn't fail the build when 'xlsx' is not installed.
  // Use a variable module name with @vite-ignore to bypass Vite's static import analysis.
  let XLSX: any;
  try {
    const moduleName = 'xlsx';
    // @vite-ignore
    XLSX = await import(/* @vite-ignore */ moduleName);
  } catch (e) {
    throw new Error(
      'Missing dependency "xlsx". Install it with: npm install xlsx  (or yarn add xlsx / pnpm add xlsx)'
    );
  }
 
   const buf = await file.arrayBuffer();
   const wb = XLSX.read(buf, { type: 'array' });
   const sheetName = wb.SheetNames?.[0];
   if (!sheetName) throw new Error('No sheet found in the Excel file.');
   const ws = wb.Sheets[sheetName];
   const rows = (XLSX.utils.sheet_to_json(ws, { defval: '' }) || []) as Array<Record<string, unknown>>;
   if (!rows.length) throw new Error('Excel sheet is empty.');
 
   const headers = Object.keys(rows[0] || {});
   const byNorm = new Map<string, string>();
   headers.forEach((h) => byNorm.set(normalizeHeaderKey(h), h));
 
   const gradeKey =
     byNorm.get('grade') ||
     headers.find((h) => normalizeHeaderKey(h).includes('grade')) ||
     null;
 
   const gpaKey =
     byNorm.get('gpaconversion') ||
     byNorm.get('gpaconvert') ||
     headers.find((h) => {
       const n = normalizeHeaderKey(h);
       return n.includes('gpaconversion') || n.includes('gpaconvert') || n === 'gpa';
     }) ||
     null;
 
   if (!gradeKey || !gpaKey) {
     throw new Error('Excel must contain columns for "Grade" and "GPA conversion".');
   }
 
   const gpas: number[] = [];
   for (const r of rows) {
     const grade = String((r as any)[gradeKey] ?? '').trim();
     if (!grade) continue;
     const gpa = parseNumericCell((r as any)[gpaKey]);
     if (gpa === null) continue;
     gpas.push(gpa);
   }
 
   if (!gpas.length) throw new Error('No numeric "GPA conversion" values found.');
   const mean = gpas.reduce((a, b) => a + b, 0) / gpas.length;
   const meanRounded = Number(mean.toFixed(2));
 
   return {
     fileName: file.name,
     studentsCount: gpas.length,
     meanGpa: meanRounded,
     courseLevel: courseLevelFromMeanGpa(meanRounded),
   };
}

export default function LCAPage({
  courseId,
  courseCode: courseCodeProp,
  courseName: courseNameProp,
  embedded,
}: {
  courseId?: string;
  courseCode?: string | null;
  courseName?: string | null;
  embedded?: boolean;
}): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const isPbrRoute = (location.pathname || '').toLowerCase().includes('/lca/pbr');

  const [actionBusy, setActionBusy] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [markLock, setMarkLock] = useState<MarkTableLockStatusResponse | null>(null);
  const [revStatus, setRevStatus] = useState<string>('draft');
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  const [courseMeta, setCourseMeta] = useState({
    courseCode: courseCodeProp ?? courseId ?? '',
    courseName: courseNameProp ?? '',
    credit: '',
    courseModule: '',
  });

  useEffect(() => {
    setCourseMeta((prev) => ({
      ...prev,
      courseCode: courseCodeProp ?? courseId ?? prev.courseCode,
      courseName: courseNameProp ?? prev.courseName,
    }));
  }, [courseId, courseCodeProp, courseNameProp]);

  const subjectIdForRequests = useMemo(() => {
    return String(courseCodeProp ?? courseId ?? courseMeta.courseCode ?? '').trim();
  }, [courseCodeProp, courseId, courseMeta.courseCode]);

  const isPublished = useMemo(() => {
    if (markLock?.exists) return Boolean(markLock.is_published);
    return String(revStatus || '').toLowerCase() === 'published';
  }, [markLock?.exists, markLock?.is_published, revStatus]);

  const entryOpen = useMemo(() => {
    if (!isPublished) return true;
    if (!markLock) return false;
    return Boolean(markLock.entry_open);
  }, [isPublished, markLock]);

  const readOnly = useMemo(() => Boolean(isPublished && !entryOpen), [isPublished, entryOpen]);

  // Load previously saved LCA inputs
  useEffect(() => {
    let mounted = true;
    const subjectId = subjectIdForRequests;
    if (!subjectId) return;
    (async () => {
      try {
        const res = await fetchLcaRevision(subjectId);
        setRevStatus(String((res as any)?.status || 'draft'));
        const d = (res as any)?.data || {};
        if (!mounted) return;
        if (d.courseMeta && typeof d.courseMeta === 'object') {
          setCourseMeta((p) => ({
            ...p,
            credit: String((d.courseMeta as any).credit ?? p.credit ?? ''),
            courseModule: String((d.courseMeta as any).courseModule ?? p.courseModule ?? ''),
          }));
        }
        if (d.currentGpaCounts && typeof d.currentGpaCounts === 'object') {
          setCurrentGpaCounts({
            band1: (d.currentGpaCounts as any).band1 ?? '',
            band2: (d.currentGpaCounts as any).band2 ?? '',
            band3: (d.currentGpaCounts as any).band3 ?? '',
          });
        }
        if (Array.isArray(d.prerequisites)) {
          const rows = (d.prerequisites as any[]).map((r, idx) => ({
            name: String(r?.name || `Prerequisite ${idx + 1}`),
            band1: r?.band1 ?? '',
            band2: r?.band2 ?? '',
            band3: r?.band3 ?? '',
          }));
          if (rows.length) setPrerequisites(rows);
        }
        if (typeof d.pbrManualCourseLevel === 'string') {
          setPbrManualCourseLevel(d.pbrManualCourseLevel as any);
        }
        setActionNote('Loaded');
      } catch {
        // Ignore load failures (page still usable)
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, courseCodeProp]);

  // Fetch publish/lock state for read-only behavior
  useEffect(() => {
    let mounted = true;
    const subjectId = subjectIdForRequests;
    if (!subjectId) return;
    (async () => {
      try {
        const lock = await fetchMarkTableLockStatus('lca' as any, subjectId);
        if (!mounted) return;
        setMarkLock(lock);
      } catch {
        // best-effort; if lock status cannot be verified and the server says published, default to read-only
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectIdForRequests]);

  const handleFinalize = async () => {
    // Validate required fields before finalizing
    const errs = new Set<string>();
    if (!String(courseMeta.credit || '').trim()) errs.add('credit');
    if (!String(courseMeta.courseModule || '').trim()) errs.add('courseModule');
    const hasGpa = currentGpaCounts.band1 !== '' || currentGpaCounts.band2 !== '' || currentGpaCounts.band3 !== '';
    if (!hasGpa) errs.add('gpa');
    if (errs.size > 0) {
      setValidationErrors(errs);
      const labels: string[] = [];
      if (errs.has('credit')) labels.push('Credit of the Course');
      if (errs.has('courseModule')) labels.push('Course Module');
      if (errs.has('gpa')) labels.push('at least one GPA band count (Number of Students)');
      setActionNote(`Please fill in: ${labels.join(', ')}`);
      return;
    }
    setValidationErrors(new Set());
    const subjectId = subjectIdForRequests;
    if (!subjectId) {
      setActionNote('Missing course code');
      return;
    }
    setActionBusy(true);
    setActionNote(null);
    setEditRequestOpen(false);
    try {
      await saveLcaRevision(
        subjectId,
        {
          courseMeta: { credit: courseMeta.credit, courseModule: courseMeta.courseModule },
          currentGpaCounts,
          prerequisites,
          pbrManualCourseLevel,
        },
        'published',
      );
      setRevStatus('published');
      setActionNote('Finalized');
      try {
        const lock = await fetchMarkTableLockStatus('lca' as any, subjectId);
        setMarkLock(lock);
      } catch {
        // ignore
      }
    } catch (e: any) {
      setActionNote(String(e?.message || 'Publish failed'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleSendEditRequest = async () => {
    const subjectId = subjectIdForRequests;
    if (!subjectId) {
      setActionNote('Missing course code');
      return;
    }
    const reason = String(editReason || '').trim();
    if (!reason) {
      setActionNote('Please enter a reason');
      return;
    }
    setActionBusy(true);
    setActionNote(null);
    try {
      const created = await createEditRequest({
        assessment: 'lca' as any,
        subject_code: subjectId,
        scope: 'MARK_MANAGER',
        reason,
      });
      setActionNote(formatEditRequestSentMessage(created));
      setEditRequestOpen(false);
    } catch (e: any) {
      setActionNote(String(e?.message || 'Request failed'));
    } finally {
      setActionBusy(false);
    }
  };

  const [currentGpaCounts, setCurrentGpaCounts] = useState<TriBandCounts>({ band1: '', band2: '', band3: '' });
  const cgpLevel = useMemo(() => levelFromBands1to3(currentGpaCounts), [currentGpaCounts]);

  const [prerequisites, setPrerequisites] = useState<PrerequisiteRow[]>([
    { name: 'Prerequisite 1', band1: '', band2: '', band3: '' },
  ]);

  const prereqLevels = useMemo(() => {
    return prerequisites.map((p) => levelFromBands1to3({ band1: p.band1, band2: p.band2, band3: p.band3 }));
  }, [prerequisites]);

  const prereqAverage = useMemo(() => {
    const numeric = prereqLevels.filter((v): v is 1 | 2 | 3 => v !== '-');
    if (!numeric.length) return '' as const;
    const sum = numeric.reduce((acc, v) => acc + v, 0);
    return Number((sum / numeric.length).toFixed(2));
  }, [prereqLevels]);

  const standardizedLearnerLevel = useMemo(() => {
    if (prereqAverage === '') return '' as const;
    // As requested: neglect digits after decimal point
    return Math.floor(prereqAverage) as 1 | 2 | 3 | 0;
  }, [prereqAverage]);

  const standardizedLearnerLevelSafe: 1 | 2 | 3 | '-' = useMemo(() => {
    if (standardizedLearnerLevel === '' || standardizedLearnerLevel === 0) return '-';
    if (standardizedLearnerLevel === 1 || standardizedLearnerLevel === 2 || standardizedLearnerLevel === 3) return standardizedLearnerLevel;
    return '-';
  }, [standardizedLearnerLevel]);

  const learnersAt = useMemo(() => mapNumericLevelToLearnerBand(standardizedLearnerLevelSafe), [standardizedLearnerLevelSafe]);
  const baseLearnerCentricLevelCode = useMemo(
    () => (standardizedLearnerLevelSafe === '-' ? '-' : (`L${standardizedLearnerLevelSafe}` as LearnerCentricCode)),
    [standardizedLearnerLevelSafe],
  );

  const [pbrCay1, setPbrCay1] = useState<PbrSummary | null>(null);
  const [pbrCay2, setPbrCay2] = useState<PbrSummary | null>(null);
  const [pbrError, setPbrError] = useState<string | null>(null);
  const [pbrBusy, setPbrBusy] = useState<'cay1' | 'cay2' | null>(null);
  // Manual course level to use when Excel files are not provided
  const [pbrManualCourseLevel, setPbrManualCourseLevel] = useState<CourseLevelCode>('-');

  const pbrCourseLevel: CourseLevelCode = useMemo(() => {
    // Preference: CAY-2 > CAY-1 > manual selection (used when excels are not available)
    if (pbrCay2) return pbrCay2.courseLevel;
    if (pbrCay1) return pbrCay1.courseLevel;
    if (pbrManualCourseLevel && pbrManualCourseLevel !== '-') return pbrManualCourseLevel;
    return '-';
  }, [pbrCay1, pbrCay2, pbrManualCourseLevel]);

  const pbrLearnerCentricLevelCode: LearnerCentricCode = useMemo(
    () => learnerCentricFromCourseLevel(pbrCourseLevel),
    [pbrCourseLevel],
  );

  const learnerCentricLevelCode: LearnerCentricCode = useMemo(() => {
    if (pbrLearnerCentricLevelCode !== '-') return pbrLearnerCentricLevelCode;
    return baseLearnerCentricLevelCode;
  }, [baseLearnerCentricLevelCode, pbrLearnerCentricLevelCode]);

  const courseBasePath = courseId ? `/obe/course/${encodeURIComponent(courseId)}` : '/obe/course';

  const handleExcelUpload = async (which: 'cay1' | 'cay2', file: File | null) => {
    setPbrError(null);
    if (!file) {
      if (which === 'cay1') setPbrCay1(null);
      else setPbrCay2(null);
      return;
    }
    try {
      setPbrBusy(which);
      const parsed = await parsePbrExcel(file);
      if (which === 'cay1') setPbrCay1(parsed);
      else setPbrCay2(parsed);
    } catch (e: any) {
      setPbrError(String(e?.message || e || 'Failed to parse Excel'));
      if (which === 'cay1') setPbrCay1(null);
      else setPbrCay2(null);
    } finally {
      setPbrBusy(null);
    }
  };

  const wrap = (inner: React.ReactNode) => {
    if (embedded) return <>{inner}</>;
    return (
      <div style={styles.page}>
        <div style={styles.card}>{inner}</div>
      </div>
    );
  };

  if (isPbrRoute) {
    return wrap(
      <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h2 style={styles.title}>Previous Batch Result (PBR)</h2>
              <div style={styles.subtitle}>Upload up to 2 Excel files (max 2).</div>
            </div>
            <button type="button" onClick={() => navigate(`${courseBasePath}/lca`)} style={styles.btn}>
              Back
            </button>
          </div>

          <div style={{ height: 14 }} />

          {/* Manual course level selection - used when Excel files are not provided */}
          <div style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ color: '#0b4a6f', fontWeight: 700 }}>Fallback course level (if no Excel):</div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="pbrManual"
                value="HC"
                checked={pbrManualCourseLevel === 'HC'}
                onChange={() => setPbrManualCourseLevel('HC')}
              />
              HARD COURSE (HC)
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="pbrManual"
                value="MC"
                checked={pbrManualCourseLevel === 'MC'}
                onChange={() => setPbrManualCourseLevel('MC')}
              />
              MEDIUM COURSE (MC)
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="pbrManual"
                value="EC"
                checked={pbrManualCourseLevel === 'EC'}
                onChange={() => setPbrManualCourseLevel('EC')}
              />
              EASY COURSE (EC)
            </label>
            <button
              type="button"
              onClick={() => setPbrManualCourseLevel('-')}
              style={{ marginLeft: 8, ...styles.btn, padding: '6px 8px' }}
            >
              Clear
            </button>
          </div>

          <table style={styles.table}>
            <tbody>
              <tr>
                <td style={{ ...styles.tdLeft, fontWeight: 800, width: 220 }}>CAY-1 Excel</td>
                <td style={{ ...styles.tdLeft, ...styles.cellGreen }}>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => handleExcelUpload('cay1', e.target.files?.[0] || null)}
                  />
                </td>
              </tr>
              <tr>
                <td style={{ ...styles.tdLeft, fontWeight: 800 }}>CAY-2 Excel</td>
                <td style={{ ...styles.tdLeft, ...styles.cellGreen }}>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => handleExcelUpload('cay2', e.target.files?.[0] || null)}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {pbrBusy && (
            <div style={{ marginTop: 10, fontSize: 15, color: '#3d5566' }}>
              Parsing {pbrBusy.toUpperCase()} Excel…
            </div>
          )}
          {pbrError && (
            <div style={{ marginTop: 10, fontSize: 15, color: '#b42318', fontWeight: 700 }}>
              {pbrError}
            </div>
          )}

          <div style={{ height: 14 }} />

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thLeft}>DATASET</th>
                <th style={styles.th}>FILE</th>
                <th style={styles.th}>STUDENTS</th>
                <th style={styles.th}>MEAN GPA</th>
                <th style={styles.th}>COURSE LEVEL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...styles.tdLeft, fontWeight: 900 }}>CAY-1</td>
                <td style={styles.tdLeft}>{pbrCay1?.fileName || '—'}</td>
                <td style={styles.td}>{pbrCay1?.studentsCount ?? '—'}</td>
                <td style={styles.td}>{pbrCay1 ? pbrCay1.meanGpa : '—'}</td>
                <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{pbrCay1?.courseLevel || '—'}</td>
              </tr>
              <tr>
                <td style={{ ...styles.tdLeft, fontWeight: 900 }}>CAY-2</td>
                <td style={styles.tdLeft}>{pbrCay2?.fileName || '—'}</td>
                <td style={styles.td}>{pbrCay2?.studentsCount ?? '—'}</td>
                <td style={styles.td}>{pbrCay2 ? pbrCay2.meanGpa : '—'}</td>
                <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{pbrCay2?.courseLevel || '—'}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ height: 14 }} />

          <table style={styles.table}>
            <tbody>
              <tr>
                <td style={{ ...styles.tdLeft, fontWeight: 900, width: 220 }}>PREVIOUS BATCH RESULT (PBR)</td>
                <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{pbrCourseLevel === '-' ? '—' : pbrCourseLevel}</td>
                <td style={{ ...styles.tdLeft, fontWeight: 900 }}>Learner Centric Level</td>
                <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{pbrLearnerCentricLevelCode === '-' ? '—' : pbrLearnerCentricLevelCode}</td>
              </tr>
              <tr>
                <td style={{ ...styles.tdLeft, color: '#557085' }} colSpan={4}>
                  Course level rule: mean GPA 0–6 = HC, 6–8 = MC, &gt;8 = EC. PBR uses CAY-2 when provided; otherwise CAY-1.
                </td>
              </tr>
            </tbody>
          </table>
      </>
    );
  }

  return wrap(
    <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <h2 style={styles.title}>Learner Centric Approach</h2>
            <div style={styles.subtitle}>Enter values in the highlighted cells; levels are computed automatically.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {!readOnly ? (
              <button
                type="button"
                onClick={handleFinalize}
                disabled={actionBusy}
                style={{
                  ...styles.btn,
                  background: styles.cellGreen.background,
                  color: '#067647',
                  opacity: actionBusy ? 0.7 : 1,
                  cursor: actionBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {actionBusy ? 'Finalizing…' : 'Finalize'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditRequestOpen(true)}
                disabled={actionBusy}
                style={{
                  ...styles.btn,
                  opacity: actionBusy ? 0.7 : 1,
                  cursor: actionBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {actionBusy ? 'Please wait…' : 'Request Edit'}
              </button>
            )}
            <div style={{ ...styles.pill, fontWeight: 800 }}>INDEX</div>
          </div>
        </div>

        {editRequestOpen && readOnly && (
          <div style={{ marginBottom: 12, background: '#fff7ed', border: '1px solid #fed7aa', color: '#7c2d12', padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Request edit approval (IQAC)</div>
            <textarea
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Reason for requesting edits"
              style={{ width: '100%', minHeight: 72, borderRadius: 10, border: '1px solid #fdba74', padding: 10, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="obe-btn obe-btn-secondary" onClick={() => setEditRequestOpen(false)} disabled={actionBusy}>
                Cancel
              </button>
              <button type="button" className="obe-btn obe-btn-primary" onClick={handleSendEditRequest} disabled={actionBusy}>
                {actionBusy ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        )}

        {actionNote && (
          <div style={{ marginBottom: 12, color: actionNote === 'Finalized' ? '#067647' : (validationErrors.size > 0 ? '#b42318' : '#3d5566'), fontWeight: 700, whiteSpace: 'pre-line', ...(validationErrors.size > 0 ? { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px' } : {}) }}>
            {actionNote}
          </div>
        )}

        <div style={{ pointerEvents: readOnly ? 'none' : 'auto', opacity: readOnly ? 0.94 : 1 }}>

        {/* Course meta (kept simple; layout matches the sheet) */}
        <table style={styles.table}>
          <tbody>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }}>COURSE CODE</td>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen }}>
                <input
                  value={courseMeta.courseCode}
                  readOnly
                  disabled
                  aria-disabled="true"
                  title="Course code is locked"
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 15, outline: 'none', cursor: 'not-allowed', color: '#234451' }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }}>COURSE NAME</td>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen }}>
                <input
                  value={courseMeta.courseName}
                  readOnly
                  disabled
                  aria-disabled="true"
                  title="Course name is locked"
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 15, outline: 'none', cursor: 'not-allowed', color: '#234451' }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }}>CREDIT OF THE COURSE</td>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen, ...(validationErrors.has('credit') ? { border: '2px solid #ef4444' } : {}) }}>
                <input
                  value={courseMeta.credit}
                  onChange={(e) => {
                    setCourseMeta((p) => ({ ...p, credit: e.target.value }));
                    if (validationErrors.has('credit')) setValidationErrors((p) => { const s = new Set(p); s.delete('credit'); return s; });
                  }}
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 15, outline: 'none' }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }}>COURSE MODULE</td>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen, ...(validationErrors.has('courseModule') ? { border: '2px solid #ef4444' } : {}) }}>
                <input
                  value={courseMeta.courseModule}
                  onChange={(e) => {
                    setCourseMeta((p) => ({ ...p, courseModule: e.target.value }));
                    if (validationErrors.has('courseModule')) setValidationErrors((p) => { const s = new Set(p); s.delete('courseModule'); return s; });
                  }}
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 15, outline: 'none' }}
                />
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: 16 }} />

        <div style={styles.sectionTitle}>STEP 1: Identifying Learner profile</div>

        {/* 1.1 CURRENT GPA PROFILE */}
          <table style={styles.table}>
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
          <thead>
            <tr>
              <th style={styles.thLeft} colSpan={4}>1.1 CURRENT GPA PROFILE (CGP)</th>
              <th style={styles.th} rowSpan={3} colSpan={2}>LEVEL</th>
            </tr>
            <tr>
              <th style={styles.thLeft}>Current batch mean GPA</th>
              <th style={styles.th}>1</th>
              <th style={styles.th}>2</th>
              <th style={styles.th}>3</th>
            </tr>
            <tr>
              <th style={styles.thLeft}>GPA</th>
              <th style={styles.th}>0 - 5</th>
              <th style={styles.th}>5 - 7.5</th>
              <th style={styles.th}>&gt; 7.5</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }}>NUMBER OF STUDENTS (CAY-1)</td>
              <td style={{ ...styles.td, ...styles.cellYellow }}>
                <NumberInput value={currentGpaCounts.band1} highlightError={validationErrors.has('gpa')} onChange={(v) => { setCurrentGpaCounts((p) => ({ ...p, band1: v })); if (validationErrors.has('gpa')) setValidationErrors((p) => { const s = new Set(p); s.delete('gpa'); return s; }); }} />
              </td>
              <td style={{ ...styles.td, ...styles.cellYellow }}>
                <NumberInput value={currentGpaCounts.band2} highlightError={validationErrors.has('gpa')} onChange={(v) => { setCurrentGpaCounts((p) => ({ ...p, band2: v })); if (validationErrors.has('gpa')) setValidationErrors((p) => { const s = new Set(p); s.delete('gpa'); return s; }); }} />
              </td>
              <td style={{ ...styles.td, ...styles.cellYellow }}>
                <NumberInput value={currentGpaCounts.band3} highlightError={validationErrors.has('gpa')} onChange={(v) => { setCurrentGpaCounts((p) => ({ ...p, band3: v })); if (validationErrors.has('gpa')) setValidationErrors((p) => { const s = new Set(p); s.delete('gpa'); return s; }); }} />
              </td>
              <td style={{ ...styles.td, fontWeight: 800, color: '#0b4a6f' }} colSpan={2}>{cgpLevel}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: 14 }} />

        {/* 1.2 PREREQUISITE PROFILE */}
        <table style={styles.table}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={styles.thLeft} colSpan={4}>1.2 PRE REQUISITE PROFILE (PRP)</th>
              <th style={styles.th}>LEVEL</th>
              <th style={styles.th}> </th>
            </tr>
            <tr>
              <th style={styles.thLeft}> </th>
              <th style={styles.th}>1</th>
              <th style={styles.th}>2</th>
              <th style={styles.th}>3</th>
              <th style={styles.th}> </th>
              <th style={styles.th}> </th>
            </tr>
            <tr>
              <th style={styles.thLeft}> </th>
              <th style={styles.th}>0 - 5</th>
              <th style={styles.th}>5 - 7.5</th>
              <th style={styles.th}>&gt; 7.5</th>
              <th style={styles.th}> </th>
              <th style={styles.th}> </th> 
            </tr>
          </thead>
          <tbody>
            {prerequisites.map((p, idx) => (
              <tr key={p.name}>
                <td style={{ ...styles.tdLeft, fontWeight: 700 }}>{p.name}</td>
                <td style={{ ...styles.td, ...styles.cellYellow }}>
                  <NumberInput
                    value={p.band1}
                    onChange={(v) =>
                      setPrerequisites((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], band1: v };
                        return next;
                      })
                    }
                  />
                </td>
                <td style={{ ...styles.td, ...styles.cellYellow }}>
                  <NumberInput
                    value={p.band2}
                    onChange={(v) =>
                      setPrerequisites((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], band2: v };
                        return next;
                      })
                    }
                  />
                </td>
                <td style={{ ...styles.td, ...styles.cellYellow }}>
                  <NumberInput
                    value={p.band3}
                    onChange={(v) =>
                      setPrerequisites((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], band3: v };
                        return next;
                      })
                    }
                  />
                </td>
                <td style={{ ...styles.td, fontWeight: 800, color: '#0b4a6f' }}>{prereqLevels[idx]}</td>
                <td style={{ ...styles.td }}>
                  <button
                    type="button"
                    title="Delete prerequisite"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setPrerequisites((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...styles.tdLeft }} colSpan={6}>
                <button
                  type="button"
                  style={{ ...styles.btn, padding: '6px 10px' }}
                  onClick={() =>
                    setPrerequisites((prev) => [...prev, { name: `Prerequisite ${prev.length + 1}`, band1: '', band2: '', band3: '' }])
                  }
                  aria-label="Add prerequisite"
                >
                  +
                </button>
                <span style={{ marginLeft: 10, fontSize: 15, color: '#557085' }}>
                  Add next prerequisite
                </span>
              </td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }} colSpan={5}>AVERAGE</td>
              <td style={{ ...styles.td, fontWeight: 800 }}>{prereqAverage === '' ? '-' : prereqAverage}</td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }} colSpan={5}>
                Standardized level of Learner profile as per the above norms
              </td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900, color: '#0b4a6f' }}>
                {standardizedLearnerLevelSafe === '-' ? '-' : standardizedLearnerLevelSafe}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: 14 }} />

        {/* LL / ML / HL mapping */}
        <table style={styles.table}>
          <tbody>
            <tr>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen, fontWeight: 900 }}>LOW LEVEL</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>LL</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>1</td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen, fontWeight: 900 }}>MEDIUM LEVEL</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>ML</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>2</td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen, fontWeight: 900 }}>HIGH LEVEL</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>HL</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>3</td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: 14 }} />

        {/* Learners are at */}
        <table style={styles.table}>
          <tbody>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 800 }}>The Learners are at</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{learnersAt.label}</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{learnersAt.code}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: 14 }} />

        {/* 1.3 PBR */}
        <table style={styles.table}>
          <tbody>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 900 }}>
                <Link style={styles.link} to={`${courseBasePath}/lca/pbr`}>
                  PREVIOUS BATCH RESULT (PBR)
                </Link>
              </td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{pbrCourseLevel === '-' ? '—' : pbrCourseLevel}</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{pbrCay2 ? 'COURSE LEVEL (CAY-2)' : 'COURSE LEVEL (CAY-1)'}</td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }}> </td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{pbrCay1 ? `Mean GPA: ${pbrCay1.meanGpa}` : '—'}</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{pbrCay2 ? `Mean GPA: ${pbrCay2.meanGpa}` : '—'}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: 12 }} />

        {/* Learner Centric Level */}
        <table style={styles.table}>
          <tbody>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 900 }}>Learner Centric Level</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{learnerCentricLevelCode}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </>
  );
}
