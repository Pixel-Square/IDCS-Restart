import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

type NumberInputProps = {
  value: number | '';
  onChange: (value: number | '') => void;
  min?: number;
  max?: number;
};

function NumberInput({ value, onChange, min, max }: NumberInputProps): JSX.Element {
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
        width: 76,
        padding: '6px 8px',
        borderRadius: 8,
        border: '1px solid #e6eef8',
        outline: 'none',
        fontSize: 13,
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
  title: { margin: 0, color: '#0b4a6f', fontSize: 22, fontWeight: 700 },
  subtitle: { marginTop: 6, color: '#3d5566', fontSize: 13 },
  sectionTitle: { margin: '0 0 10px 0', color: '#0b3b57', fontSize: 16 },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: 8 },
  th: {
    background: '#f3f8ff',
    color: '#0b4a6f',
    fontWeight: 700,
    padding: '8px 10px',
    border: '1px solid #e6eef8',
    textAlign: 'center',
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  thLeft: {
    background: '#f3f8ff',
    color: '#0b4a6f',
    fontWeight: 700,
    padding: '8px 10px',
    border: '1px solid #e6eef8',
    textAlign: 'left',
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '8px 10px',
    border: '1px solid #eef6fb',
    color: '#234451',
    fontSize: 13,
    textAlign: 'center',
  },
  tdLeft: {
    padding: '8px 10px',
    border: '1px solid #eef6fb',
    color: '#234451',
    fontSize: 13,
    textAlign: 'left',
  },
  cellYellow: { background: '#fef9c3' },
  cellGreen: { background: '#ecfdf3' },
  link: { color: '#0b4a6f', textDecoration: 'underline', fontWeight: 700 },
  btn: {
    border: '1px solid #e6eef8',
    background: '#fbfdff',
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
    color: '#0b4a6f',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 10,
    background: '#fbfdff',
    border: '1px solid #e6eef8',
    fontSize: 13,
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

export default function LCAPage({ courseId, courseCode: courseCodeProp, courseName: courseNameProp }: { courseId?: string; courseCode?: string | null; courseName?: string | null }): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const isPbrRoute = (location.pathname || '').toLowerCase().includes('/lca/pbr');

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

  const pbrCourseLevel: CourseLevelCode = useMemo(() => {
    if (pbrCay2) return pbrCay2.courseLevel;
    if (pbrCay1) return pbrCay1.courseLevel;
    return '-';
  }, [pbrCay1, pbrCay2]);

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

  if (isPbrRoute) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
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
            <div style={{ marginTop: 10, fontSize: 13, color: '#3d5566' }}>
              Parsing {pbrBusy.toUpperCase()} Excel…
            </div>
          )}
          {pbrError && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#b42318', fontWeight: 700 }}>
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
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <h2 style={styles.title}>Learner Centric Approach</h2>
            <div style={styles.subtitle}>Enter values in the highlighted cells; levels are computed automatically.</div>
          </div>
          <div style={{ ...styles.pill, fontWeight: 800 }}>INDEX</div>
        </div>

        {/* Course meta (kept simple; layout matches the sheet) */}
        <table style={styles.table}>
          <tbody>
            <tr>
              <td style={{ ...styles.tdLeft, width: 220, fontWeight: 700 }}>COURSE CODE</td>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen }}>
                <input
                  value={courseMeta.courseCode}
                  readOnly
                  disabled
                  aria-disabled="true"
                  title="Course code is locked"
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, outline: 'none', cursor: 'not-allowed', color: '#234451' }}
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
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, outline: 'none', cursor: 'not-allowed', color: '#234451' }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }}>CREDIT OF THE COURSE</td>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen }}>
                <input
                  value={courseMeta.credit}
                  onChange={(e) => setCourseMeta((p) => ({ ...p, credit: e.target.value }))
                  }
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, outline: 'none' }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }}>COURSE MODULE</td>
              <td style={{ ...styles.tdLeft, ...styles.cellGreen }}>
                <input
                  value={courseMeta.courseModule}
                  onChange={(e) => setCourseMeta((p) => ({ ...p, courseModule: e.target.value }))
                  }
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, outline: 'none' }}
                />
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: 16 }} />

        <div style={styles.sectionTitle}>STEP 1: Identifying Learner profile</div>

        {/* 1.1 CURRENT GPA PROFILE */}
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.thLeft} colSpan={5}>1.1 CURRENT GPA PROFILE (CGP)</th>
              <th style={styles.th}>LEVEL</th>
            </tr>
            <tr>
              <th style={styles.thLeft}>Current batch mean GPA</th>
              <th style={styles.th}>1</th>
              <th style={styles.th}>2</th>
              <th style={styles.th}>3</th>
              <th style={styles.th}> </th>
              <th style={styles.th}> </th>
            </tr>
            <tr>
              <th style={styles.thLeft}>GPA</th>
              <th style={styles.th}>0 - 5</th>
              <th style={styles.th}>5 - 7.5</th>
              <th style={styles.th}>&gt; 7.5</th>
              <th style={styles.th}> </th>
              <th style={styles.th}> </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...styles.tdLeft, fontWeight: 700 }}>NUMBER OF STUDENTS (CAY-1)</td>
              <td style={{ ...styles.td, ...styles.cellYellow }}>
                <NumberInput value={currentGpaCounts.band1} onChange={(v) => setCurrentGpaCounts((p) => ({ ...p, band1: v }))} />
              </td>
              <td style={{ ...styles.td, ...styles.cellYellow }}>
                <NumberInput value={currentGpaCounts.band2} onChange={(v) => setCurrentGpaCounts((p) => ({ ...p, band2: v }))} />
              </td>
              <td style={{ ...styles.td, ...styles.cellYellow }}>
                <NumberInput value={currentGpaCounts.band3} onChange={(v) => setCurrentGpaCounts((p) => ({ ...p, band3: v }))} />
              </td>
              <td style={styles.td}> </td>
              <td style={{ ...styles.td, fontWeight: 800, color: '#0b4a6f' }}>{cgpLevel}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: 14 }} />

        {/* 1.2 PREREQUISITE PROFILE */}
        <table style={styles.table}>
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
                <span style={{ marginLeft: 10, fontSize: 13, color: '#557085' }}>
                  Add next prerequisite (no limit)
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
              <td style={{ ...styles.tdLeft, fontWeight: 800, width: 220 }}>The Learners are at</td>
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
              <td style={{ ...styles.tdLeft, fontWeight: 900, width: 260 }}>
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
              <td style={{ ...styles.tdLeft, fontWeight: 900, width: 260 }}>Learner Centric Level</td>
              <td style={{ ...styles.td, ...styles.cellGreen, fontWeight: 900 }}>{learnerCentricLevelCode}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
