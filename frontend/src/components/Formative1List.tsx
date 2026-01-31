import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type F1RowState = {
  studentId: number;
  skill1: number | '';
  skill2: number | '';
  att1: number | '';
  att2: number | '';
};

type F1Sheet = {
  termLabel: string;
  batchLabel: string;
  rowsByStudentId: Record<string, F1RowState>;
};

// Component Props
interface Formative1ListProps {
  subjectId?: string | null;
  subject?: any | null;
  teachingAssignmentId?: number;
}

const MAX_PART = 5;
const MAX_TOTAL = 20;
const MAX_CO = 10;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function pct(mark: number, max: number) {
  if (!max) return '-';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
}

function compareRegNo(aRaw: unknown, bRaw: unknown): number {
  const aStr = String(aRaw ?? '').trim();
  const bStr = String(bRaw ?? '').trim();

  const ra = aStr.replace(/[^0-9]/g, '');
  const rb = bStr.replace(/[^0-9]/g, '');

  if (ra && rb) {
    try {
      const aBig = BigInt(ra);
      const bBig = BigInt(rb);
      if (aBig < bBig) return -1;
      if (aBig > bBig) return 1;
    } catch {
      if (ra.length !== rb.length) return ra.length - rb.length;
      if (ra < rb) return -1;
      if (ra > rb) return 1;
    }
  } else if (ra && !rb) {
    return -1;
  } else if (!ra && rb) {
    return 1;
  }

  if (aStr < bStr) return -1;
  if (aStr > bStr) return 1;
  return 0;
}

function storageKey(subjectId: string) {
  return `formative1_sheet_${subjectId}`;
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

export default function Formative1List({ subjectId, teachingAssignmentId }: Formative1ListProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjectData, setSubjectData] = useState<any>(null);
  const [btlPickerOpen, setBtlPickerOpen] = useState(true);
  const [selectedBtls, setSelectedBtls] = useState<number[]>([]);

  const [sheet, setSheet] = useState<F1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId || '',
    rowsByStudentId: {},
  });

  const key = useMemo(() => (subjectId ? storageKey(subjectId) : ''), [subjectId]);

  const visibleBtlIndices = useMemo(() => {
    const set = new Set(selectedBtls);
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [selectedBtls]);

  const totalTableCols = useMemo(() => {
    // Base columns: S.No, Section, RegNo, Name, Skill1, Skill2, Att1, Att2, Total = 9
    // CO columns (CO-1 mark/% + CO-2 mark/%) = 4
    // BTL columns = selected count * 2
    return 13 + visibleBtlIndices.length * 2;
  }, [visibleBtlIndices.length]);

  useEffect(() => {
    // load persisted selected BTLs per subject
    if (subjectId) {
      const sk = `formative1_selected_btls_${subjectId}`;
      const stored = lsGet<number[]>(sk);
      if (Array.isArray(stored)) setSelectedBtls(stored.filter((n) => Number.isFinite(n) && n >= 1 && n <= 6));
    }
  }, [subjectId]);

  useEffect(() => {
    if (!subjectId) return;
    const sk = `formative1_selected_btls_${subjectId}`;
    lsSet(sk, selectedBtls);
    }, [selectedBtls, subjectId]);

  useEffect(() => {
    let mounted = true;

    const loadRoster = async () => {
      if (!subjectId) return;
      setLoading(true);
      setError(null);

      try {
        // If a teaching assignment is specified, fetch roster by TA (preferred)
        let roster: Student[] = [];
        if (typeof teachingAssignmentId === 'number') {
          const resp = await fetchTeachingAssignmentRoster(teachingAssignmentId);
          const ta = resp.teaching_assignment;
          if (!mounted) return;
          setSubjectData({ subject_name: resp.teaching_assignment.subject_name, section: resp.teaching_assignment.section_name });
          roster = (resp.students || []).map((s: TeachingAssignmentRosterStudent) => ({
            id: Number(s.id),
            reg_no: String(s.reg_no ?? ''),
            name: String(s.name ?? ''),
            section: s.section ?? null,
          })).filter((s) => Number.isFinite(s.id));
          roster.sort((a, b) => compareRegNo(a.reg_no, b.reg_no));
          setStudents(roster);
        } else {
          const subjectRes = await fetch(`${API_BASE}/api/academics/subjects/?code=${encodeURIComponent(subjectId)}`, {
            headers: authHeaders(),
          });

          if (!subjectRes.ok) {
            const text = await subjectRes.text();
            throw new Error(`Failed to fetch subject: ${subjectRes.status} ${text}`);
          }

          const subjectList = await subjectRes.json();
          if (!Array.isArray(subjectList) || subjectList.length === 0) {
            throw new Error(`Subject with code ${subjectId} not found`);
          }

          const subj = subjectList[0];
          if (!mounted) return;
          setSubjectData(subj);

          const params = new URLSearchParams({
            department: String(subj.department ?? ''),
            year: String(subj.year ?? ''),
            section: String(subj.section ?? ''),
          });

          const studentsRes = await fetch(`${API_BASE}/api/academics/students/?${params.toString()}`, {
            headers: authHeaders(),
          });

          if (!studentsRes.ok) {
            const text = await studentsRes.text();
            throw new Error(`Failed to fetch students: ${studentsRes.status} ${text}`);
          }

          const studentsData = await studentsRes.json();
          roster = (Array.isArray(studentsData) ? studentsData : [])
            .map((s: any) => ({
              id: Number(s.id),
              reg_no: String(s.reg_no ?? ''),
              name: String(s.name ?? ''),
              section: s.section ?? null,
            }))
            .filter((s) => Number.isFinite(s.id));

          roster.sort((a, b) => compareRegNo(a.reg_no, b.reg_no));

          if (!mounted) return;
          setStudents(roster);
        }

        // Load local sheet and merge with roster.
        const stored = key ? lsGet<F1Sheet>(key) : null;
        const base: F1Sheet =
          stored && typeof stored === 'object'
            ? {
                termLabel: String((stored as any).termLabel || 'KRCT AY25-26'),
                batchLabel: String((stored as any).batchLabel || subjectId),
                rowsByStudentId:
                  (stored as any).rowsByStudentId && typeof (stored as any).rowsByStudentId === 'object'
                    ? (stored as any).rowsByStudentId
                    : {},
              }
            : { termLabel: 'KRCT AY25-26', batchLabel: subjectId, rowsByStudentId: {} };

        const merged: Record<string, F1RowState> = { ...base.rowsByStudentId };
        for (const s of roster) {
          const sid = String(s.id);
          const existing = merged[sid];
          merged[sid] = {
            studentId: s.id,
            skill1: typeof existing?.skill1 === 'number' ? clamp(Number(existing?.skill1), 1, MAX_PART) : '',
            skill2: typeof existing?.skill2 === 'number' ? clamp(Number(existing?.skill2), 1, MAX_PART) : '',
            att1: typeof existing?.att1 === 'number' ? clamp(Number(existing?.att1), 1, MAX_PART) : '',
            att2: typeof existing?.att2 === 'number' ? clamp(Number(existing?.att2), 1, MAX_PART) : '',
          };
        }

        setSheet({ ...base, batchLabel: base.batchLabel || subjectId, rowsByStudentId: merged });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load Formative 1 roster');
        setStudents([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadRoster();
    return () => {
      mounted = false;
    };
  }, [subjectId, key]);

  const updateMark = (studentId: number, patch: Partial<F1RowState>) => {
    setSheet((prev) => {
      const sid = String(studentId);
      const existing = prev.rowsByStudentId[sid] || ({ studentId, skill1: '', skill2: '', att1: '', att2: '' } as F1RowState);

      const merged: F1RowState = { ...existing, ...patch, studentId } as F1RowState;

      const normalize = (v: number | '' | undefined) => {
        if (v === '' || v == null) return '';
        const n = clamp(Number(v), 1, MAX_PART);
        return Number.isFinite(n) ? n : '';
      };

      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [sid]: {
            ...merged,
            skill1: normalize(merged.skill1),
            skill2: normalize(merged.skill2),
            att1: normalize(merged.att1),
            att2: normalize(merged.att2),
          },
        },
      };
    });
  };

  const saveLocal = () => {
    if (!key) return;
    lsSet(key, sheet);
    alert('Formative 1 sheet saved locally.');
  };

  const exportSheetCsv = () => {
    if (!subjectId) return;

    const out = students.map((s, i) => {
      const row = sheet.rowsByStudentId[String(s.id)] || {
        studentId: s.id,
        skill1: '',
        skill2: '',
        att1: '',
        att2: '',
      } as F1RowState;

      const skill1 = typeof row.skill1 === 'number' ? clamp(Number(row.skill1), 1, MAX_PART) : null;
      const skill2 = typeof row.skill2 === 'number' ? clamp(Number(row.skill2), 1, MAX_PART) : null;
      const att1 = typeof row.att1 === 'number' ? clamp(Number(row.att1), 1, MAX_PART) : null;
      const att2 = typeof row.att2 === 'number' ? clamp(Number(row.att2), 1, MAX_PART) : null;

      const total = skill1 != null && skill2 != null && att1 != null && att2 != null ? clamp(skill1 + skill2 + att1 + att2, 0, MAX_TOTAL) : '';
      const co1 = skill1 != null && att1 != null ? clamp(skill1 + att1, 0, MAX_CO) : '';
      const co2 = skill2 != null && att2 != null ? clamp(skill2 + att2, 0, MAX_CO) : '';

      const btlMaxByIndex = [0, 0, 10, 10, 0, 0];
      const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
      const btlShare = typeof total === 'number' && visibleIndicesZeroBased.length ? round1((total as number) / visibleIndicesZeroBased.length) : '';
      const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
        if (btlShare === '') return '';
        if (!visibleIndicesZeroBased.includes(idx)) return '';
        if (max > 0) return clamp(btlShare as number, 0, max);
        return round1(btlShare as number);
      });

      return {
        sno: i + 1,
        section: s.section ?? '',
        registerNo: s.reg_no,
        name: s.name,
        skill1: skill1 ?? '',
        skill2: skill2 ?? '',
        att1: att1 ?? '',
        att2: att2 ?? '',
        total: total === '' ? '' : total,
        co1_mark: co1 === '' ? '' : co1,
        co1_pct: co1 === '' ? '' : pct(co1 as number, MAX_CO),
        co2_mark: co2 === '' ? '' : co2,
        co2_pct: co2 === '' ? '' : pct(co2 as number, MAX_CO),
        btl1_mark: btlMarksByIndex[0] ?? '',
        btl1_pct: btlMarksByIndex[0] === '' ? '' : pct(Number(btlMarksByIndex[0]), btlMaxByIndex[0]),
        btl2_mark: btlMarksByIndex[1] ?? '',
        btl2_pct: btlMarksByIndex[1] === '' ? '' : pct(Number(btlMarksByIndex[1]), btlMaxByIndex[1]),
        btl3_mark: btlMarksByIndex[2] ?? '',
        btl3_pct: btlMarksByIndex[2] === '' ? '' : pct(Number(btlMarksByIndex[2]), btlMaxByIndex[2]),
        btl4_mark: btlMarksByIndex[3] ?? '',
        btl4_pct: btlMarksByIndex[3] === '' ? '' : pct(Number(btlMarksByIndex[3]), btlMaxByIndex[3]),
        btl5_mark: btlMarksByIndex[4] ?? '',
        btl5_pct: btlMarksByIndex[4] === '' ? '' : pct(Number(btlMarksByIndex[4]), btlMaxByIndex[4]),
        btl6_mark: btlMarksByIndex[5] ?? '',
        btl6_pct: btlMarksByIndex[5] === '' ? '' : pct(Number(btlMarksByIndex[5]), btlMaxByIndex[5]),
      };
    });

    downloadCsv(`${subjectId}_FORMATIVE1_sheet.csv`, out);
  };

  if (!subjectId) {
    return <div style={{ color: '#6b7280' }}>Select a course to start Formative 1 entry.</div>;
  }

  if (loading) return <div style={{ color: '#6b7280' }}>Loading Formative 1 roster…</div>;

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
    textAlign: 'center',
  };

  return (
    <div>
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #ef444433',
            color: '#991b1b',
            padding: 10,
            borderRadius: 10,
            marginBottom: 10,
          }}
        >
          {error}
        </div>
      )}

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
          <div style={{ fontWeight: 800, fontSize: 16 }}>Formative 1 Sheet</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            Excel-like layout (Skill + Attitude → Total + CO). Subject: <b>{subjectId}</b>
          </div>
          {subjectData && (
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
              {String(subjectData.department || '')} • Year {String(subjectData.year || '')} • Section {String(subjectData.section || '')}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={saveLocal} style={{ padding: '6px 10px' }} disabled={students.length === 0}>
            Save Local
          </button>
          <button onClick={exportSheetCsv} style={{ padding: '6px 10px' }} disabled={students.length === 0}>
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
            <button onClick={() => setBtlPickerOpen((v) => !v)} style={{ padding: '6px 10px' }}>
              BTL Columns
            </button>
          <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center' }}>
            Term
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.termLabel}</div>
          </label>
          <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center' }}>
            Sheet Label
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.batchLabel}</div>
          </label>
          <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
            Skill/Attitude max: 5 each | Total: 20 | CO-1: 10 | CO-2: 10
          </div>
        </div>

          {btlPickerOpen && (
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 12,
                background: '#fff',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>BTL columns to show</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} />
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#111827' }}>
                    <input type="checkbox" checked={selectedBtls.includes(n)} onChange={() => setSelectedBtls((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.concat(n).sort((a, b) => a - b)))} />
                    BTL-{n}
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                Selected: {visibleBtlIndices.length ? visibleBtlIndices.map((n) => `BTL-${n}`).join(', ') : 'None'}
              </div>
            </div>
          )}
      </div>

      {students.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>No students found for this subject.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #111', borderRadius: 6, position: 'relative' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={cellTh} colSpan={totalTableCols}>
                  {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; FORMATIVE 1
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
                <th style={cellTh} colSpan={2}>
                  Skill
                </th>
                <th style={cellTh} colSpan={2}>
                  Attitude
                </th>
                <th style={cellTh} rowSpan={3}>
                  Total
                </th>
                <th style={cellTh} colSpan={4}>
                  CIA 1
                </th>
                {visibleBtlIndices.length ? (
                  <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>
                    BTL
                  </th>
                ) : null}
              </tr>
              <tr>
                <th style={cellTh}>1</th>
                <th style={cellTh}>2</th>
                <th style={cellTh}>1</th>
                <th style={cellTh}>2</th>
                <th style={cellTh} colSpan={2}>
                  CO-1
                </th>
                <th style={cellTh} colSpan={2}>
                  CO-2
                </th>
                {visibleBtlIndices.map((n) => (
                  <th key={`btlhead-${n}`} style={cellTh} colSpan={2}>
                    BTL-{n}
                  </th>
                ))}
              </tr>
              <tr>
                <th style={cellTh} />
                <th style={cellTh} />
                <th style={cellTh} />
                <th style={cellTh} />
                <th style={cellTh}>Mark</th>
                <th style={cellTh}>%</th>
                <th style={cellTh}>Mark</th>
                <th style={cellTh}>%</th>
                {visibleBtlIndices.map((n) => (
                  <React.Fragment key={`btl-sub-${n}`}>
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
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_PART}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_PART}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_PART}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_PART}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_TOTAL}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_CO}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_CO}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
              </tr>

              {students.map((s, i) => {
                const row = sheet.rowsByStudentId[String(s.id)] || ({ studentId: s.id, skill1: '', skill2: '', att1: '', att2: '' } as F1RowState);

                const skill1 = typeof row.skill1 === 'number' ? clamp(Number(row.skill1), 1, MAX_PART) : '';
                const skill2 = typeof row.skill2 === 'number' ? clamp(Number(row.skill2), 1, MAX_PART) : '';
                const att1 = typeof row.att1 === 'number' ? clamp(Number(row.att1), 1, MAX_PART) : '';
                const att2 = typeof row.att2 === 'number' ? clamp(Number(row.att2), 1, MAX_PART) : '';

                const total = skill1 !== '' && skill2 !== '' && att1 !== '' && att2 !== '' ? clamp((skill1 as number) + (skill2 as number) + (att1 as number) + (att2 as number), 0, MAX_TOTAL) : '';
                const co1 = skill1 !== '' && att1 !== '' ? clamp((skill1 as number) + (att1 as number), 0, MAX_CO) : '';
                const co2 = skill2 !== '' && att2 !== '' ? clamp((skill2 as number) + (att2 as number), 0, MAX_CO) : '';

                const btlMaxByIndex = [0, 0, 10, 10, 0, 0];
                const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                const btlShare = typeof total === 'number' && visibleIndicesZeroBased.length ? round1((total as number) / visibleIndicesZeroBased.length) : '';
                const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
                  if (btlShare === '') return '';
                  if (!visibleIndicesZeroBased.includes(idx)) return '';
                  if (max > 0) return clamp(btlShare as number, 0, max);
                  return round1(btlShare as number);
                });

                const disabledInputs = visibleBtlIndices.length === 0;

                return (
                  <tr key={s.id}>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{s.section ?? ''}</td>
                    <td style={cellTd}>{s.reg_no}</td>
                    <td style={cellTd}>{s.name || '—'}</td>

                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        type="number"
                        min={1}
                        max={MAX_PART}
                        value={row.skill1 === '' ? '' : row.skill1}
                        disabled={disabledInputs}
                        onChange={(e) => updateMark(s.id, { skill1: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </td>
                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        type="number"
                        min={1}
                        max={MAX_PART}
                        value={row.skill2 === '' ? '' : row.skill2}
                        disabled={disabledInputs}
                        onChange={(e) => updateMark(s.id, { skill2: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </td>
                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        type="number"
                        min={1}
                        max={MAX_PART}
                        value={row.att1 === '' ? '' : row.att1}
                        disabled={disabledInputs}
                        onChange={(e) => updateMark(s.id, { att1: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </td>
                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        type="number"
                        min={1}
                        max={MAX_PART}
                        value={row.att2 === '' ? '' : row.att2}
                        disabled={disabledInputs}
                        onChange={(e) => updateMark(s.id, { att2: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </td>

                    <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{total}</td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co1 === '' ? '' : pct(co1 as number, MAX_CO)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co2 === '' ? '' : pct(co2 as number, MAX_CO)}</td>
                    {visibleBtlIndices.map((n) => {
                      const idx = n - 1;
                      const mark = btlMarksByIndex[idx];
                      const max = btlMaxByIndex[idx] ?? 0;
                      return (
                        <React.Fragment key={`btl-cells-${n}`}>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{mark}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{mark === '' ? '' : pct(Number(mark), max)}</td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {visibleBtlIndices.length === 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(255,255,255,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 10,
                padding: 20,
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700 }}>BTL columns not selected</div>
              <div style={{ color: '#6b7280' }}>Select one or more BTL columns to enable entry.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setBtlPickerOpen(true)} style={{ padding: '6px 10px' }}>
                  Open BTL Picker
                </button>
                <button onClick={() => setSelectedBtls([3, 4])} style={{ padding: '6px 10px' }}>
                  Quick: BTL-3/4
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {key && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
          Saved key: <span style={{ fontFamily: 'monospace' }}>{key}</span>
        </div>
      )}
    </div>
  );
}
