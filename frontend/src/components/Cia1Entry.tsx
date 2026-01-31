import React, { useEffect, useMemo, useState } from 'react';
import { fetchCia1Marks, saveCia1Marks } from '../services/obe';
import { lsGet, lsSet } from '../utils/localStorage';

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type Props = {
  subjectId: string;
};

type QuestionDef = {
  key: string;
  label: string;
  max: number;
  co: 1 | 2;
  btl: 1 | 2 | 3 | 4 | 5 | 6;
};

// Tune these to match your CIA1 blueprint.
// The UI (headers, CO/BTL totals, max marks) is generated from this.
const QUESTIONS: QuestionDef[] = [
  { key: 'q1', label: 'Q1', max: 1, co: 1, btl: 1 },
  { key: 'q2', label: 'Q2', max: 1, co: 1, btl: 3 },
  { key: 'q3', label: 'Q3', max: 1, co: 1, btl: 4 },
  { key: 'q4', label: 'Q4', max: 2, co: 2, btl: 1 },
  { key: 'q5', label: 'Q5', max: 2, co: 2, btl: 1 },
  { key: 'q6', label: 'Q6', max: 2, co: 2, btl: 2 },
  { key: 'q7', label: 'Q7', max: 1, co: 1, btl: 2 },
  { key: 'q8', label: 'Q8', max: 2, co: 2, btl: 3 },
  { key: 'q9', label: 'Q9', max: 2, co: 2, btl: 5 },
];

type Cia1RowState = {
  studentId: number;
  absent: boolean;
  // question key -> mark
  q: Record<string, number>;
};

type Cia1Sheet = {
  termLabel: string;
  batchLabel: string;
  rowsByStudentId: Record<string, Cia1RowState>;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(mark: number, max: number) {
  if (!max) return '-';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
}

function sheetKey(subjectId: string) {
  return `cia1_sheet_${subjectId}`;
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

export default function Cia1Entry({ subjectId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [serverTotals, setServerTotals] = useState<Record<number, number | null>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Cia1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    rowsByStudentId: {},
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!subjectId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCia1Marks(subjectId);
        if (!mounted) return;
        setStudents(data.students || []);
        const apiMarks = data.marks || {};
        const totals: Record<number, number | null> = {};
        for (const [k, v] of Object.entries(apiMarks)) {
          const sid = Number(k);
          if (!Number.isFinite(sid)) continue;
          if (v === null || v === undefined || v === '') {
            totals[sid] = null;
            continue;
          }
          const n = Number(v);
          totals[sid] = Number.isFinite(n) ? n : null;
        }
        setServerTotals(totals);

        // Load local sheet and merge with roster.
        const stored = lsGet<Cia1Sheet>(sheetKey(subjectId));
        const base: Cia1Sheet =
          stored && typeof stored === 'object'
            ? {
                termLabel: String((stored as any).termLabel || 'KRCT AY25-26'),
                batchLabel: String((stored as any).batchLabel || subjectId),
                rowsByStudentId: (stored as any).rowsByStudentId && typeof (stored as any).rowsByStudentId === 'object' ? (stored as any).rowsByStudentId : {},
              }
            : { termLabel: 'KRCT AY25-26', batchLabel: subjectId, rowsByStudentId: {} };

        // Ensure every roster student has an entry.
        const merged: Record<string, Cia1RowState> = { ...base.rowsByStudentId };
        for (const s of data.students || []) {
          const key = String(s.id);
          if (merged[key]) {
            merged[key] = {
              studentId: s.id,
              absent: Boolean((merged[key] as any).absent),
              q: { ...(merged[key] as any).q },
            };
          } else {
            merged[key] = {
              studentId: s.id,
              absent: false,
              q: Object.fromEntries(QUESTIONS.map((q) => [q.key, 0])),
            };
          }

          // Backfill missing question keys.
          for (const q of QUESTIONS) {
            if (!(q.key in (merged[key].q || {}))) merged[key].q[q.key] = 0;
          }
        }

        setSheet({ ...base, batchLabel: base.batchLabel || subjectId, rowsByStudentId: merged });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load CIA1 roster');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  const totalsMax = useMemo(() => QUESTIONS.reduce((sum, q) => sum + q.max, 0), []);
  const coMax = useMemo(() => {
    const co1 = QUESTIONS.filter((q) => q.co === 1).reduce((sum, q) => sum + q.max, 0);
    const co2 = QUESTIONS.filter((q) => q.co === 2).reduce((sum, q) => sum + q.max, 0);
    return { co1, co2 };
  }, []);
  const btlMax = useMemo(() => {
    const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const q of QUESTIONS) out[q.btl] += q.max;
    return out as Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  }, []);

  const setAbsent = (studentId: number, absent: boolean) => {
    setSheet((prev) => {
      const key = String(studentId);
      const existing = prev.rowsByStudentId[key] || {
        studentId,
        absent: false,
        q: Object.fromEntries(QUESTIONS.map((q) => [q.key, 0])),
      };

      const next: Cia1RowState = absent
        ? { ...existing, absent: true, q: Object.fromEntries(QUESTIONS.map((q) => [q.key, 0])) }
        : { ...existing, absent: false };

      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [key]: next,
        },
      };
    });
  };

  const setQuestionMark = (studentId: number, qKey: string, value: number) => {
    setSheet((prev) => {
      const key = String(studentId);
      const existing = prev.rowsByStudentId[key] || {
        studentId,
        absent: false,
        q: Object.fromEntries(QUESTIONS.map((q) => [q.key, 0])),
      };
      const def = QUESTIONS.find((q) => q.key === qKey);
      const max = def?.max ?? totalsMax;

      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [key]: {
            ...existing,
            q: {
              ...(existing.q || {}),
              [qKey]: clamp(Number(value || 0), 0, max),
            },
          },
        },
      };
    });
  };

  const payload = useMemo(() => {
    const out: Record<number, number | null> = {};
    for (const s of students) {
      const row = sheet.rowsByStudentId[String(s.id)];
      if (!row) {
        out[s.id] = null;
        continue;
      }
      if (row.absent) {
        out[s.id] = 0;
        continue;
      }
      const total = QUESTIONS.reduce((sum, q) => sum + clamp(Number(row.q?.[q.key] || 0), 0, q.max), 0);
      out[s.id] = total;
    }
    return out;
  }, [students, sheet.rowsByStudentId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCia1Marks(subjectId, payload);
      setSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setError(e?.message || 'Failed to save CIA1 marks');
    } finally {
      setSaving(false);
    }
  };

  const saveLocal = () => {
    lsSet(sheetKey(subjectId), sheet);
    alert('CIA1 sheet saved locally.');
  };

  const exportSheetCsv = () => {
    const out = students.map((s, i) => {
      const row = sheet.rowsByStudentId[String(s.id)] || {
        studentId: s.id,
        absent: false,
        q: Object.fromEntries(QUESTIONS.map((q) => [q.key, 0])),
      };

      const qMarks = Object.fromEntries(
        QUESTIONS.map((q) => [q.key, row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)]),
      );
      const total = row.absent ? 0 : QUESTIONS.reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0);

      const co1 = QUESTIONS.filter((q) => q.co === 1).reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0);
      const co2 = QUESTIONS.filter((q) => q.co === 2).reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0);

      const btl = {
        1: QUESTIONS.filter((q) => q.btl === 1).reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0),
        2: QUESTIONS.filter((q) => q.btl === 2).reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0),
        3: QUESTIONS.filter((q) => q.btl === 3).reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0),
        4: QUESTIONS.filter((q) => q.btl === 4).reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0),
        5: QUESTIONS.filter((q) => q.btl === 5).reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0),
        6: QUESTIONS.filter((q) => q.btl === 6).reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0),
      } as Record<1 | 2 | 3 | 4 | 5 | 6, number>;

      return {
        sno: i + 1,
        section: s.section ?? '',
        registerNo: s.reg_no,
        name: s.name,
        absent: row.absent ? 1 : 0,
        ...qMarks,
        total,
        co1_mark: co1,
        co1_pct: pct(co1, coMax.co1),
        co2_mark: co2,
        co2_pct: pct(co2, coMax.co2),
        btl1_mark: btl[1],
        btl1_pct: pct(btl[1], btlMax[1]),
        btl2_mark: btl[2],
        btl2_pct: pct(btl[2], btlMax[2]),
        btl3_mark: btl[3],
        btl3_pct: pct(btl[3], btlMax[3]),
        btl4_mark: btl[4],
        btl4_pct: pct(btl[4], btlMax[4]),
        btl5_mark: btl[5],
        btl5_pct: pct(btl[5], btlMax[5]),
        btl6_mark: btl[6],
        btl6_pct: pct(btl[6], btlMax[6]),
      };
    });

    downloadCsv(`${subjectId}_CIA1_sheet.csv`, out);
  };

  if (loading) return <div style={{ color: '#6b7280' }}>Loading CIA1 roster…</div>;

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
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 10 }}>
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
          <div style={{ fontWeight: 800, fontSize: 16 }}>CIA1 Sheet</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            Excel-like layout (Q-wise + CO + BTL). Subject: <b>{subjectId}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={saveLocal} style={{ padding: '6px 10px' }} disabled={students.length === 0}>
            Save Local
          </button>
          <button onClick={exportSheetCsv} style={{ padding: '6px 10px' }} disabled={students.length === 0}>
            Export CSV
          </button>
          <button onClick={save} disabled={saving || students.length === 0} style={{ padding: '6px 10px' }}>
            {saving ? 'Saving…' : 'Save Totals to Server'}
          </button>
          {savedAt && (
            <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
              Saved: {savedAt}
            </div>
          )}
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
            Total max: {totalsMax} | Questions: {QUESTIONS.length} | COs: 1–2 | BTLs: 1–6
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>No students found for this subject.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #111', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1600 }}>
            <thead>
              <tr>
                <th style={cellTh} colSpan={5 + QUESTIONS.length + 1 + 4 + 12}>
                  {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; CIA1
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
                  ABSENT
                </th>

                <th style={cellTh} colSpan={QUESTIONS.length}>
                  QUESTIONS
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
                {QUESTIONS.map((q) => (
                  <th key={q.key} style={cellTh}>
                    {q.label}
                  </th>
                ))}
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
                {QUESTIONS.map((q) => (
                  <th key={q.key} style={cellTh}>
                    {q.max}
                  </th>
                ))}
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
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>-</td>

                {QUESTIONS.map((q) => (
                  <td key={q.key} style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>
                    {q.max}
                  </td>
                ))}
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{totalsMax}</td>

                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{coMax.co1}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{coMax.co2}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>

                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{btlMax[1]}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{btlMax[2]}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{btlMax[3]}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{btlMax[4]}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{btlMax[5]}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{btlMax[6]}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
              </tr>

              {students.map((s, i) => {
                const row = sheet.rowsByStudentId[String(s.id)] || {
                  studentId: s.id,
                  absent: false,
                  q: Object.fromEntries(QUESTIONS.map((q) => [q.key, 0])),
                };

                const qMarks = QUESTIONS.map((q) => (row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)));
                const total = row.absent ? 0 : qMarks.reduce((sum, v) => sum + v, 0);

                const co1 = QUESTIONS.filter((q) => q.co === 1).reduce((sum, q) => sum + (row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)), 0);
                const co2 = QUESTIONS.filter((q) => q.co === 2).reduce((sum, q) => sum + (row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)), 0);

                const btl = {
                  1: QUESTIONS.filter((q) => q.btl === 1).reduce((sum, q) => sum + (row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)), 0),
                  2: QUESTIONS.filter((q) => q.btl === 2).reduce((sum, q) => sum + (row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)), 0),
                  3: QUESTIONS.filter((q) => q.btl === 3).reduce((sum, q) => sum + (row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)), 0),
                  4: QUESTIONS.filter((q) => q.btl === 4).reduce((sum, q) => sum + (row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)), 0),
                  5: QUESTIONS.filter((q) => q.btl === 5).reduce((sum, q) => sum + (row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)), 0),
                  6: QUESTIONS.filter((q) => q.btl === 6).reduce((sum, q) => sum + (row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)), 0),
                } as Record<1 | 2 | 3 | 4 | 5 | 6, number>;

                const serverTotal = serverTotals[s.id];

                return (
                  <tr key={s.id}>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{i + 1}</td>
                    <td style={cellTd}>{s.section ?? ''}</td>
                    <td style={cellTd}>{s.reg_no}</td>
                    <td style={cellTd}>{s.name}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={row.absent}
                        onChange={(e) => setAbsent(s.id, e.target.checked)}
                      />
                    </td>

                    {QUESTIONS.map((q) => (
                      <td key={q.key} style={{ ...cellTd, textAlign: 'center' }}>
                        <input
                          style={{ ...inputStyle, textAlign: 'center', opacity: row.absent ? 0.5 : 1 }}
                          type="number"
                          min={0}
                          max={q.max}
                          value={row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)}
                          onChange={(e) => setQuestionMark(s.id, q.key, Number(e.target.value))}
                          disabled={row.absent}
                        />
                      </td>
                    ))}

                    <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }} title={serverTotal != null ? `Server total: ${serverTotal}` : undefined}>
                      {total}
                    </td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co1, coMax.co1)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co2, coMax.co2)}</td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl[1]}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl[1], btlMax[1])}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl[2]}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl[2], btlMax[2])}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl[3]}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl[3], btlMax[3])}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl[4]}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl[4], btlMax[4])}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl[5]}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl[5], btlMax[5])}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{btl[6]}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl[6], btlMax[6])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
