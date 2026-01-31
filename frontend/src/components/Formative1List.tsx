import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';

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
  skill1: number;
  skill2: number;
  att1: number;
  att2: number;
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
}

const MAX_PART = 5;
const MAX_TOTAL = 20;
const MAX_CO = 10;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

export default function Formative1List({ subjectId }: Formative1ListProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjectData, setSubjectData] = useState<any>(null);

  const [sheet, setSheet] = useState<F1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId || '',
    rowsByStudentId: {},
  });

  const key = useMemo(() => (subjectId ? storageKey(subjectId) : ''), [subjectId]);

  useEffect(() => {
    let mounted = true;

    const loadRoster = async () => {
      if (!subjectId) return;
      setLoading(true);
      setError(null);

      try {
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
        const roster: Student[] = (Array.isArray(studentsData) ? studentsData : [])
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
            skill1: clamp(Number(existing?.skill1 || 0), 0, MAX_PART),
            skill2: clamp(Number(existing?.skill2 || 0), 0, MAX_PART),
            att1: clamp(Number(existing?.att1 || 0), 0, MAX_PART),
            att2: clamp(Number(existing?.att2 || 0), 0, MAX_PART),
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
      const existing = prev.rowsByStudentId[sid] || {
        studentId,
        skill1: 0,
        skill2: 0,
        att1: 0,
        att2: 0,
      };

      const next: F1RowState = {
        ...existing,
        ...patch,
        studentId,
      };

      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [sid]: {
            ...next,
            skill1: clamp(Number(next.skill1 || 0), 0, MAX_PART),
            skill2: clamp(Number(next.skill2 || 0), 0, MAX_PART),
            att1: clamp(Number(next.att1 || 0), 0, MAX_PART),
            att2: clamp(Number(next.att2 || 0), 0, MAX_PART),
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
        skill1: 0,
        skill2: 0,
        att1: 0,
        att2: 0,
      };

      const skill1 = clamp(Number(row.skill1 || 0), 0, MAX_PART);
      const skill2 = clamp(Number(row.skill2 || 0), 0, MAX_PART);
      const att1 = clamp(Number(row.att1 || 0), 0, MAX_PART);
      const att2 = clamp(Number(row.att2 || 0), 0, MAX_PART);
      const total = clamp(skill1 + skill2 + att1 + att2, 0, MAX_TOTAL);
      const co1 = clamp(skill1 + att1, 0, MAX_CO);
      const co2 = clamp(skill2 + att2, 0, MAX_CO);

      return {
        sno: i + 1,
        section: s.section ?? '',
        registerNo: s.reg_no,
        name: s.name,
        skill1,
        skill2,
        att1,
        att2,
        total,
        co1_mark: co1,
        co1_pct: pct(co1, MAX_CO),
        co2_mark: co2,
        co2_pct: pct(co2, MAX_CO),
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
            Skill/Attitude max: 5 each | Total: 20 | CO-1: 10 | CO-2: 10
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>No students found for this subject.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #111', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={cellTh} colSpan={13}>
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
                const row = sheet.rowsByStudentId[String(s.id)] || {
                  studentId: s.id,
                  skill1: 0,
                  skill2: 0,
                  att1: 0,
                  att2: 0,
                };

                const skill1 = clamp(Number(row.skill1 || 0), 0, MAX_PART);
                const skill2 = clamp(Number(row.skill2 || 0), 0, MAX_PART);
                const att1 = clamp(Number(row.att1 || 0), 0, MAX_PART);
                const att2 = clamp(Number(row.att2 || 0), 0, MAX_PART);

                const total = clamp(skill1 + skill2 + att1 + att2, 0, MAX_TOTAL);
                const co1 = clamp(skill1 + att1, 0, MAX_CO);
                const co2 = clamp(skill2 + att2, 0, MAX_CO);

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
                        min={0}
                        max={MAX_PART}
                        value={skill1}
                        onChange={(e) => updateMark(s.id, { skill1: Number(e.target.value) })}
                      />
                    </td>
                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        type="number"
                        min={0}
                        max={MAX_PART}
                        value={skill2}
                        onChange={(e) => updateMark(s.id, { skill2: Number(e.target.value) })}
                      />
                    </td>
                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        type="number"
                        min={0}
                        max={MAX_PART}
                        value={att1}
                        onChange={(e) => updateMark(s.id, { att1: Number(e.target.value) })}
                      />
                    </td>
                    <td style={cellTd}>
                      <input
                        style={inputStyle}
                        type="number"
                        min={0}
                        max={MAX_PART}
                        value={att2}
                        onChange={(e) => updateMark(s.id, { att2: Number(e.target.value) })}
                      />
                    </td>

                    <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{total}</td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co1, MAX_CO)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co2, MAX_CO)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
