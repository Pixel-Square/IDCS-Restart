import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchDraft, saveDraft } from '../services/obe';

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type LabRowState = {
  studentId: number;
  marksA: Array<number | ''>;
  marksB: Array<number | ''>;
};

type LabSheet = {
  termLabel: string;
  batchLabel: string;
  coAEnabled: boolean;
  coBEnabled: boolean;
  expCountA: number;
  expCountB: number;
  rowsByStudentId: Record<string, LabRowState>;
};

type LabDraftPayload = {
  sheet: LabSheet;
};

type Props = {
  subjectId?: string | null;
  teachingAssignmentId?: number;
  assessmentKey: 'formative1' | 'formative2';
  label: string;
  coA: number;
  coB: number;
  showCia1Embed?: boolean;
  cia1Embed?: React.ReactNode;
};

const DEFAULT_EXPERIMENTS = 5;

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

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function storageKey(assessmentKey: 'formative1' | 'formative2', subjectId: string) {
  return `${assessmentKey}_sheet_${subjectId}`;
}

function normalizeMarksArray(raw: unknown, length: number): Array<number | ''> {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Array<number | ''> = [];
  for (let i = 0; i < length; i++) {
    const v = arr[i];
    if (v === '' || v == null) {
      out.push('');
      continue;
    }
    const n = typeof v === 'number' ? v : Number(v);
    out.push(Number.isFinite(n) ? n : '');
  }
  return out;
}

function sumMarks(arr: Array<number | ''>): number {
  return arr.reduce<number>((acc, v) => acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0);
}

export default function LabEntry({
  subjectId,
  teachingAssignmentId,
  assessmentKey,
  label,
  coA,
  coB,
  showCia1Embed,
  cia1Embed,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [masterCfg, setMasterCfg] = useState<any>(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [draft, setDraft] = useState<LabDraftPayload>({
    sheet: {
      termLabel: 'KRCT AY25-26',
      batchLabel: subjectId || '',
      coAEnabled: true,
      coBEnabled: true,
      expCountA: DEFAULT_EXPERIMENTS,
      expCountB: DEFAULT_EXPERIMENTS,
      rowsByStudentId: {},
    },
  });

  const key = useMemo(() => (subjectId ? storageKey(assessmentKey, subjectId) : ''), [assessmentKey, subjectId]);

  // Load master config (term label)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
        setDraft((p) => ({
          ...p,
          sheet: {
            ...p.sheet,
            termLabel: String((cfg as any)?.termLabel || p.sheet.termLabel || 'KRCT AY25-26'),
            batchLabel: subjectId || p.sheet.batchLabel,
          },
        }));
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  // Load draft from backend
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<LabDraftPayload>(assessmentKey, subjectId);
        if (!mounted) return;
        const d = (res as any)?.draft as LabDraftPayload | null;
        if (d && typeof d === 'object' && d.sheet && typeof d.sheet === 'object') {
          const coAEnabled = Boolean((d.sheet as any).coAEnabled ?? true);
          const coBEnabled = Boolean((d.sheet as any).coBEnabled ?? true);
          const expCountA = clampInt(Number((d.sheet as any).expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
          const expCountB = clampInt(Number((d.sheet as any).expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
          setDraft({
            sheet: {
              termLabel: String((d.sheet as any).termLabel || (masterCfg as any)?.termLabel || 'KRCT AY25-26'),
              batchLabel: String(subjectId),
              coAEnabled,
              coBEnabled,
              expCountA,
              expCountB,
              rowsByStudentId: (d.sheet as any).rowsByStudentId && typeof (d.sheet as any).rowsByStudentId === 'object' ? (d.sheet as any).rowsByStudentId : {},
            },
          });
          try {
            if (key) lsSet(key, { rowsByStudentId: (d.sheet as any).rowsByStudentId || {} });
          } catch {}
        } else {
          // fallback to localStorage
          const stored = key ? (lsGet<any>(key) as any) : null;
          const rowsByStudentId = stored?.rowsByStudentId && typeof stored.rowsByStudentId === 'object' ? stored.rowsByStudentId : {};
          setDraft((p) => ({
            ...p,
            sheet: { ...p.sheet, batchLabel: String(subjectId), rowsByStudentId },
          }));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [assessmentKey, subjectId, key, masterCfg]);

  // Fetch roster
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!teachingAssignmentId) {
        setStudents([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetchTeachingAssignmentRoster(teachingAssignmentId);
        if (!mounted) return;
        const roster = (res?.students || []) as Student[];
        const sorted = [...roster].sort((a, b) => compareRegNo(a.reg_no, b.reg_no));
        setStudents(sorted);
      } catch (e: any) {
        if (!mounted) return;
        setStudents([]);
        setError(e?.message || 'Failed to load roster');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [teachingAssignmentId]);

  // Merge roster into rowsByStudentId
  useEffect(() => {
    if (!subjectId) return;
    if (students.length === 0) return;

    setDraft((p) => {
      const expCountA = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB = clampInt(Number(p.sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
      const rowsByStudentId: Record<string, LabRowState> = { ...(p.sheet.rowsByStudentId || {}) };

      for (const s of students) {
        const k = String(s.id);
        const existing = rowsByStudentId[k];
        if (!existing) {
          rowsByStudentId[k] = {
            studentId: s.id,
            marksA: Array.from({ length: expCountA }, () => ''),
            marksB: Array.from({ length: expCountB }, () => ''),
          };
        } else {
          const marksA = normalizeMarksArray((existing as any).marksA, expCountA);
          const marksB = normalizeMarksArray((existing as any).marksB, expCountB);
          rowsByStudentId[k] = { ...existing, marksA, marksB };
        }
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          batchLabel: String(subjectId),
          expCountA,
          expCountB,
          rowsByStudentId,
        },
      };
    });
  }, [students, subjectId]);

  // Persist local mirror for counts/dashboard
  useEffect(() => {
    if (!key) return;
    try {
      lsSet(key, { rowsByStudentId: draft.sheet.rowsByStudentId });
    } catch {
      // ignore
    }
  }, [draft.sheet.rowsByStudentId, key]);

  // Autosave draft to backend (debounced)
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        await saveDraft(assessmentKey, subjectId, draft);
        if (!cancelled) setSavedAt(new Date().toLocaleString());
      } catch {
        // ignore autosave errors
      }
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [assessmentKey, subjectId, draft]);

  const expCountA = clampInt(Number(draft.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
  const expCountB = clampInt(Number(draft.sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
  const coAEnabled = Boolean(draft.sheet.coAEnabled);
  const coBEnabled = Boolean(draft.sheet.coBEnabled);

  const visibleExpCountA = coAEnabled ? expCountA : 0;
  const visibleExpCountB = coBEnabled ? expCountB : 0;
  const totalExpCols = visibleExpCountA + visibleExpCountB;

  function setCoEnabled(which: 'A' | 'B', enabled: boolean) {
    setDraft((p) => ({
      ...p,
      sheet: {
        ...p.sheet,
        coAEnabled: which === 'A' ? enabled : p.sheet.coAEnabled,
        coBEnabled: which === 'B' ? enabled : p.sheet.coBEnabled,
      },
    }));
  }

  function setExpCount(which: 'A' | 'B', n: number) {
    const next = clampInt(n, 0, 12);
    setDraft((p) => {
      const rowsByStudentId: Record<string, LabRowState> = { ...(p.sheet.rowsByStudentId || {}) };
      for (const k of Object.keys(rowsByStudentId)) {
        const row = rowsByStudentId[k];
        if (which === 'A') {
          const marksA = normalizeMarksArray((row as any)?.marksA, next);
          rowsByStudentId[k] = { ...row, marksA };
        } else {
          const marksB = normalizeMarksArray((row as any)?.marksB, next);
          rowsByStudentId[k] = { ...row, marksB };
        }
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          expCountA: which === 'A' ? next : p.sheet.expCountA,
          expCountB: which === 'B' ? next : p.sheet.expCountB,
          rowsByStudentId,
        },
      };
    });
  }

  function setMark(studentId: number, which: 'A' | 'B', expIndex: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;
      const marksA = normalizeMarksArray((existing as any).marksA, clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12));
      const marksB = normalizeMarksArray((existing as any).marksB, clampInt(Number(p.sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12));

      if (which === 'A') marksA[expIndex] = value;
      else marksB[expIndex] = value;

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...existing, marksA, marksB },
          },
        },
      };
    });
  }

  async function saveNow() {
    if (!subjectId) return;
    setSavingDraft(true);
    try {
      await saveDraft(assessmentKey, subjectId, draft);
      setSavedAt(new Date().toLocaleString());
      alert('Draft saved.');
    } catch (e: any) {
      alert(e?.message || 'Draft save failed');
    } finally {
      setSavingDraft(false);
    }
  }

  const headerCols = 4 + totalExpCols + 1 + 4; // identity + experiments + total + CIA1

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 220 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
              <input type="checkbox" checked={coAEnabled} onChange={(e) => setCoEnabled('A', e.target.checked)} />
              CO{coA}
            </label>
            {coAEnabled && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>No. of Experiments for CO{coA}</div>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={expCountA}
                  onChange={(e) => setExpCount('A', Number(e.target.value))}
                  className="obe-input"
                />
              </div>
            )}
          </div>

          <div style={{ minWidth: 220 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
              <input type="checkbox" checked={coBEnabled} onChange={(e) => setCoEnabled('B', e.target.checked)} />
              CO{coB}
            </label>
            {coBEnabled && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>No. of Experiments for CO{coB}</div>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={expCountB}
                  onChange={(e) => setExpCount('B', Number(e.target.value))}
                  className="obe-input"
                />
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={saveNow} className="obe-btn obe-btn-success" disabled={savingDraft || !subjectId}>
          {savingDraft ? 'Saving…' : 'Save Draft'}
        </button>
        {savedAt && <div style={{ fontSize: 12, color: '#6b7280' }}>Saved: {savedAt}</div>}
      </div>

      {error && <div style={{ marginBottom: 10, color: '#b91c1c' }}>{error}</div>}
      {loading ? (
        <div style={{ color: '#6b7280' }}>Loading roster…</div>
      ) : students.length === 0 ? (
        <div style={{ color: '#6b7280' }}>Select a Teaching Assignment to load students.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="obe-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(90deg,#f3f4f6,#e0e7ff)', borderBottom: '2px solid #d1d5db' }}>
                <th style={{ padding: 8 }} rowSpan={4}>S.No</th>
                <th style={{ padding: 8 }} rowSpan={4}>SECTION</th>
                <th style={{ padding: 8 }} rowSpan={4}>Register No.</th>
                <th style={{ padding: 8 }} rowSpan={4}>Name of the Students</th>

                <th style={{ padding: 8, textAlign: 'center' }} colSpan={Math.max(1, totalExpCols)}>
                  Experiments
                </th>
                <th style={{ padding: 8 }} rowSpan={4}>Total</th>
                <th style={{ padding: 8, textAlign: 'center' }} colSpan={4}>CIA 1</th>
              </tr>

              {/* CO mapping numbers row: 11111 / 22222 (or 33333 / 44444 for LAB2) */}
              <tr style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
                {totalExpCols === 0 ? (
                  <th style={{ padding: 8, textAlign: 'center', color: '#6b7280' }}>—</th>
                ) : (
                  <>
                    {Array.from({ length: visibleExpCountA }, (_, i) => (
                      <th key={`coa_${i}`} style={{ padding: 8, textAlign: 'center' }}>{coA}</th>
                    ))}
                    {Array.from({ length: visibleExpCountB }, (_, i) => (
                      <th key={`cob_${i}`} style={{ padding: 8, textAlign: 'center' }}>{coB}</th>
                    ))}
                  </>
                )}

                <th style={{ padding: 8, textAlign: 'center' }} colSpan={2}>CO-{coA}</th>
                <th style={{ padding: 8, textAlign: 'center' }} colSpan={2}>CO-{coB}</th>
              </tr>

              {/* Max marks row for experiments */}
              <tr style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
                {totalExpCols === 0 ? (
                  <th style={{ padding: 8, textAlign: 'center', color: '#6b7280' }}>—</th>
                ) : (
                  <>
                    {Array.from({ length: totalExpCols }, (_, i) => (
                      <th key={`max_${i}`} style={{ padding: 8, textAlign: 'center' }}>25</th>
                    ))}
                  </>
                )}

                <th style={{ padding: 8, textAlign: 'center' }}>Mark</th>
                <th style={{ padding: 8, textAlign: 'center' }}>%</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Mark</th>
                <th style={{ padding: 8, textAlign: 'center' }}>%</th>
              </tr>

              {/* Experiment index row (E1..En) */}
              <tr style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
                {totalExpCols === 0 ? (
                  <th style={{ padding: 8, textAlign: 'center', color: '#6b7280' }}>No experiments</th>
                ) : (
                  <>
                    {Array.from({ length: visibleExpCountA }, (_, i) => (
                      <th key={`ea_${i}`} style={{ padding: 8, textAlign: 'center' }}>E{i + 1}</th>
                    ))}
                    {Array.from({ length: visibleExpCountB }, (_, i) => (
                      <th key={`eb_${i}`} style={{ padding: 8, textAlign: 'center' }}>E{i + 1}</th>
                    ))}
                  </>
                )}
                <th style={{ padding: 8 }} colSpan={4} />
              </tr>
            </thead>

            <tbody>
              {students.map((s, idx) => {
                const row = draft.sheet.rowsByStudentId?.[String(s.id)];
                const marksA = normalizeMarksArray((row as any)?.marksA, expCountA);
                const marksB = normalizeMarksArray((row as any)?.marksB, expCountB);
                const totalA = sumMarks(marksA);
                const totalB = sumMarks(marksB);
                const total = totalA + totalB;

                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: 8 }}>{idx + 1}</td>
                    <td style={{ padding: 8 }}>{s.section || ''}</td>
                    <td style={{ padding: 8 }}>{s.reg_no}</td>
                    <td style={{ padding: 8 }}>{s.name}</td>

                    {/* Experiments for CO-A */}
                    {Array.from({ length: visibleExpCountA }, (_, i) => (
                      <td key={`ma${s.id}_${i}`} style={{ padding: 6 }}>
                        <input
                          type="number"
                          value={marksA[i]}
                          onChange={(e) => setMark(s.id, 'A', i, e.target.value === '' ? '' : Number(e.target.value))}
                          className="obe-input"
                          style={{ width: 70 }}
                        />
                      </td>
                    ))}

                    {/* Experiments for CO-B */}
                    {Array.from({ length: visibleExpCountB }, (_, i) => (
                      <td key={`mb${s.id}_${i}`} style={{ padding: 6 }}>
                        <input
                          type="number"
                          value={marksB[i]}
                          onChange={(e) => setMark(s.id, 'B', i, e.target.value === '' ? '' : Number(e.target.value))}
                          className="obe-input"
                          style={{ width: 70 }}
                        />
                      </td>
                    ))}

                    <td style={{ padding: 8, fontWeight: 800 }}>{total}</td>

                    {/* CIA1 columns are part of the exact sheet header; values come from the embedded CIA1 table */}
                    <td style={{ padding: 8, color: '#6b7280' }} colSpan={4}>
                      —
                    </td>
                  </tr>
                );
              })}

              {students.length === 0 && (
                <tr>
                  <td colSpan={headerCols} style={{ padding: 10, color: '#6b7280' }}>
                    No students.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCia1Embed && (
        <div style={{ marginTop: 18 }}>
          <h4 style={{ margin: '0 0 8px 0' }}>CIA 1 Table</h4>
          <div style={{ color: '#6b7280', marginBottom: 10, fontSize: 13 }}>
            This section is shown for {label}.
          </div>
          {cia1Embed || <div style={{ color: '#6b7280' }}>CIA1 embed not configured.</div>}
        </div>
      )}
    </div>
  );
}
