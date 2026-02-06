import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchDraft, publishLabSheet, saveDraft } from '../services/obe';
import { formatRemaining, usePublishWindow } from '../hooks/usePublishWindow';
import PublishLockOverlay from './PublishLockOverlay';

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
  ciaExam?: number | '';
};

type LabSheet = {
  termLabel: string;
  batchLabel: string;
  coAEnabled: boolean;
  coBEnabled: boolean;
  expCountA: number;
  expCountB: number;
  btlsA: Array<1 | 2 | 3 | 4 | 5 | 6>;
  btlsB: Array<1 | 2 | 3 | 4 | 5 | 6>;
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
const DEFAULT_EXPERIMENT_MAX = 25;
const DEFAULT_CIA_EXAM_MAX = 30;

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

function compareStudentName(a: { name?: string; reg_no?: string }, b: { name?: string; reg_no?: string }) {
  const an = String(a?.name || '').trim().toLowerCase();
  const bn = String(b?.name || '').trim().toLowerCase();
  if (an && bn) {
    const byName = an.localeCompare(bn);
    if (byName) return byName;
  } else if (an || bn) {
    return an ? -1 : 1;
  }

  return compareRegNo(a?.reg_no, b?.reg_no);
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

function normalizeBtlArray(raw: unknown, length: number): Array<1 | 2 | 3 | 4 | 5 | 6> {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Array<1 | 2 | 3 | 4 | 5 | 6> = [];
  for (let i = 0; i < length; i++) {
    const v = arr[i];
    const n = typeof v === 'number' ? v : Number(v);
    if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6) out.push(n);
    else out.push(1);
  }
  return out;
}

function sumMarks(arr: Array<number | ''>): number {
  return arr.reduce<number>((acc, v) => acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0);
}

function avgMarks(arr: Array<number | ''>): number | null {
  const nums = arr.filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(mark: number | null, max: number): string {
  if (mark == null) return '';
  if (!Number.isFinite(max) || max <= 0) return '0';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
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
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  const [draft, setDraft] = useState<LabDraftPayload>({
    sheet: {
      termLabel: 'KRCT AY25-26',
      batchLabel: subjectId || '',
      coAEnabled: true,
      coBEnabled: true,
      expCountA: DEFAULT_EXPERIMENTS,
      expCountB: DEFAULT_EXPERIMENTS,
      btlsA: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1),
      btlsB: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1),
      rowsByStudentId: {},
    },
  });

  const key = useMemo(() => (subjectId ? storageKey(assessmentKey, subjectId) : ''), [assessmentKey, subjectId]);

  const {
    data: publishWindow,
    publishAllowed,
    remainingSeconds,
    refresh: refreshPublishWindow,
  } = usePublishWindow({ assessment: assessmentKey, subjectCode: String(subjectId || ''), teachingAssignmentId });

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

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
          const btlsA = normalizeBtlArray((d.sheet as any).btlsA, expCountA);
          const btlsB = normalizeBtlArray((d.sheet as any).btlsB, expCountB);
          setDraft({
            sheet: {
              termLabel: String((d.sheet as any).termLabel || (masterCfg as any)?.termLabel || 'KRCT AY25-26'),
              batchLabel: String(subjectId),
              coAEnabled,
              coBEnabled,
              expCountA,
              expCountB,
              btlsA,
              btlsB,
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
        const sorted = [...roster].sort((a, b) => compareStudentName(a, b));
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
      const btlsA = normalizeBtlArray((p.sheet as any).btlsA, expCountA);
      const btlsB = normalizeBtlArray((p.sheet as any).btlsB, expCountB);
      const rowsByStudentId: Record<string, LabRowState> = { ...(p.sheet.rowsByStudentId || {}) };

      for (const s of students) {
        const k = String(s.id);
        const existing = rowsByStudentId[k];
        if (!existing) {
          rowsByStudentId[k] = {
            studentId: s.id,
            marksA: Array.from({ length: expCountA }, () => ''),
            marksB: Array.from({ length: expCountB }, () => ''),
            ciaExam: '',
          };
        } else {
          const marksA = normalizeMarksArray((existing as any).marksA, expCountA);
          const marksB = normalizeMarksArray((existing as any).marksB, expCountB);
          const rawCia = (existing as any).ciaExam;
          const ciaParsed = rawCia === '' || rawCia == null ? '' : Number(rawCia);
          const ciaExam = ciaParsed === '' ? '' : Number.isFinite(ciaParsed) ? ciaParsed : '';
          rowsByStudentId[k] = { ...existing, marksA, marksB, ciaExam };
        }
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          batchLabel: String(subjectId),
          expCountA,
          expCountB,
          btlsA,
          btlsB,
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

  const visibleBtlIndices = useMemo(() => {
    if (totalExpCols === 0) return [] as number[];
    const btlsA = normalizeBtlArray((draft.sheet as any).btlsA, expCountA).slice(0, visibleExpCountA);
    const btlsB = normalizeBtlArray((draft.sheet as any).btlsB, expCountB).slice(0, visibleExpCountB);
    const set = new Set<number>();
    for (const v of btlsA) set.add(v);
    for (const v of btlsB) set.add(v);
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [draft.sheet, expCountA, expCountB, totalExpCols, visibleExpCountA, visibleExpCountB]);

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

      const expCountA2 = which === 'A' ? next : clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = which === 'B' ? next : clampInt(Number(p.sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
      const btlsA = normalizeBtlArray((p.sheet as any).btlsA, expCountA2);
      const btlsB = normalizeBtlArray((p.sheet as any).btlsB, expCountB2);

      return {
        ...p,
        sheet: {
          ...p.sheet,
          expCountA: which === 'A' ? next : p.sheet.expCountA,
          expCountB: which === 'B' ? next : p.sheet.expCountB,
          btlsA,
          btlsB,
          rowsByStudentId,
        },
      };
    });
  }

  function setBtl(which: 'A' | 'B', expIndex: number, value: 1 | 2 | 3 | 4 | 5 | 6) {
    setDraft((p) => {
      const expCountA = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB = clampInt(Number(p.sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
      const btlsA = normalizeBtlArray((p.sheet as any).btlsA, expCountA);
      const btlsB = normalizeBtlArray((p.sheet as any).btlsB, expCountB);

      if (which === 'A') btlsA[expIndex] = value;
      else btlsB[expIndex] = value;

      return {
        ...p,
        sheet: {
          ...p.sheet,
          btlsA,
          btlsB,
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

  function setCiaExam(studentId: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...existing, ciaExam: value },
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

  async function resetSheet() {
    if (!subjectId) return;
    const ok = window.confirm('Reset all lab marks for this sheet? This clears the draft (students + experiments + CIA Exam).');
    if (!ok) return;

    const expCountA2 = clampInt(Number(draft.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
    const expCountB2 = clampInt(Number(draft.sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
    const clearedRowsByStudentId: Record<string, LabRowState> = {};
    for (const s of students) {
      clearedRowsByStudentId[String(s.id)] = {
        studentId: s.id,
        marksA: Array.from({ length: expCountA2 }, () => ''),
        marksB: Array.from({ length: expCountB2 }, () => ''),
        ciaExam: '',
      };
    }

    const nextDraft: LabDraftPayload = {
      sheet: {
        ...draft.sheet,
        rowsByStudentId: clearedRowsByStudentId,
      },
    };

    setDraft(nextDraft);

    try {
      if (key) lsSet(key, { rowsByStudentId: {} });
    } catch {
      // ignore
    }

    try {
      await saveDraft(assessmentKey, subjectId, nextDraft);
      setSavedAt(new Date().toLocaleString());
    } catch {
      // ignore
    }
  }

  async function publish() {
    if (!subjectId) return;
    setPublishing(true);
    try {
      await publishLabSheet(assessmentKey, subjectId, draft);
      setPublishedAt(new Date().toLocaleString());
      refreshPublishWindow();
      try {
        window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId } }));
      } catch {
        // ignore
      }
    } catch (e: any) {
      alert(e?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  // identity (S.No, RegNo, Name) + experiments + total(avg) + CIA exam + CO(A,B) mark/% + BTL mark/%
  const headerCols = 3 + totalExpCols + 1 + 1 + 4 + visibleBtlIndices.length * 2;

  const coMax = DEFAULT_EXPERIMENT_MAX + DEFAULT_CIA_EXAM_MAX / 2;

  const cellTh: React.CSSProperties = {
    border: '1px solid #111',
    padding: '6px 6px',
    background: '#ecfdf5',
    color: '#065f46',
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
    textAlign: 'right',
  };

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    background: '#fff',
    padding: 12,
  };

  const minTableWidth = Math.max(920, 360 + (totalExpCols + visibleBtlIndices.length * 2) * 80);

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

        <button onClick={resetSheet} className="obe-btn obe-btn-secondary" disabled={!subjectId || publishing || savingDraft || globalLocked}>
          Reset
        </button>

        <button onClick={saveNow} className="obe-btn obe-btn-success" disabled={savingDraft || !subjectId}>
          {savingDraft ? 'Saving…' : 'Save Draft'}
        </button>

        <button
          onClick={publish}
          className="obe-btn obe-btn-primary"
          disabled={!subjectId || publishing || savingDraft || globalLocked || !publishAllowed}
          title={
            globalLocked
              ? 'Publishing is globally locked.'
              : !publishAllowed
                ? 'Publish not allowed (due window / approval / global control).'
                : ''
          }
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
        {savedAt && <div style={{ fontSize: 12, color: '#6b7280' }}>Saved: {savedAt}</div>}
        {publishedAt && <div style={{ fontSize: 12, color: '#6b7280' }}>Published: {publishedAt}</div>}
        {remainingSeconds != null && !publishAllowed ? (
          <div style={{ fontSize: 12, color: '#6b7280' }}>Opens in: {formatRemaining(remainingSeconds)}</div>
        ) : null}
      </div>

      {error && <div style={{ marginBottom: 10, color: '#b91c1c' }}>{error}</div>}
      {loading ? (
        <div style={{ color: '#6b7280' }}>Loading roster…</div>
      ) : students.length === 0 ? (
        <div style={{ color: '#6b7280' }}>Select a Teaching Assignment to load students.</div>
      ) : (
        <div style={cardStyle}>
          <PublishLockOverlay locked={globalLocked}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: minTableWidth, width: '100%' }}>
            <thead>
              <tr>
                <th style={cellTh} colSpan={headerCols}>
                  {draft.sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {draft.sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {label}
                </th>
              </tr>
              <tr>
                <th style={cellTh} rowSpan={5}>S.No</th>
                <th style={cellTh} rowSpan={5}>Register No.</th>
                <th style={cellTh} rowSpan={5}>Name of the Students</th>

                <th style={cellTh} colSpan={Math.max(1, totalExpCols)}>Experiments</th>
                <th style={cellTh} rowSpan={5}>Total (Avg)</th>
                <th style={cellTh} rowSpan={5}>CIA Exam</th>
                <th style={cellTh} colSpan={4}>CO ATTAINMENT</th>
                {visibleBtlIndices.length ? <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th> : null}
              </tr>

              {/* CO mapping numbers row: 11111 / 22222 (or 33333 / 44444 for LAB2) */}
              <tr>
                {totalExpCols === 0 ? (
                  <th style={cellTh}>—</th>
                ) : (
                  <>
                    {Array.from({ length: visibleExpCountA }, (_, i) => (
                      <th key={`coa_${i}`} style={cellTh}>{coA}</th>
                    ))}
                    {Array.from({ length: visibleExpCountB }, (_, i) => (
                      <th key={`cob_${i}`} style={cellTh}>{coB}</th>
                    ))}
                  </>
                )}

                <th style={cellTh} colSpan={2}>CO-{coA}</th>
                <th style={cellTh} colSpan={2}>CO-{coB}</th>
                {visibleBtlIndices.map((n) => (
                  <th key={`btl_${n}`} style={cellTh} colSpan={2}>
                    BTL-{n}
                  </th>
                ))}
              </tr>

              {/* Max marks row for experiments */}
              <tr>
                {totalExpCols === 0 ? (
                  <th style={cellTh}>—</th>
                ) : (
                  <>
                    {Array.from({ length: totalExpCols }, (_, i) => (
                      <th key={`max_${i}`} style={cellTh}>{DEFAULT_EXPERIMENT_MAX}</th>
                    ))}
                  </>
                )}

                <th style={cellTh}>{coMax}</th>
                <th style={cellTh}>%</th>
                <th style={cellTh}>{coMax}</th>
                <th style={cellTh}>%</th>
                {visibleBtlIndices.map((n) => (
                  <React.Fragment key={`btlmax_${n}`}>
                    <th style={cellTh}>{DEFAULT_EXPERIMENT_MAX}</th>
                    <th style={cellTh}>%</th>
                  </React.Fragment>
                ))}
              </tr>

              {/* Experiment index row (E1..En) */}
              <tr>
                {totalExpCols === 0 ? (
                  <th style={cellTh}>No experiments</th>
                ) : (
                  <>
                    {Array.from({ length: visibleExpCountA }, (_, i) => (
                      <th key={`ea_${i}`} style={cellTh}>E{i + 1}</th>
                    ))}
                    {Array.from({ length: visibleExpCountB }, (_, i) => (
                      <th key={`eb_${i}`} style={cellTh}>E{i + 1}</th>
                    ))}
                  </>
                )}
                <th style={cellTh} colSpan={4 + visibleBtlIndices.length * 2} />
              </tr>

              <tr>
                {totalExpCols === 0 ? (
                  <th style={cellTh}>—</th>
                ) : (
                  <>
                    {Array.from({ length: visibleExpCountA }, (_, i) => {
                      const v = normalizeBtlArray((draft.sheet as any).btlsA, expCountA)[i] ?? 1;
                      return (
                        <th key={`btla_${i}`} style={cellTh}>
                          <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }} title={`BTL: ${v}`}>
                            <div
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                background: '#fff',
                                textAlign: 'center',
                                userSelect: 'none',
                                fontWeight: 800,
                              }}
                            >
                              {v}
                            </div>
                            <select
                              aria-label={`BTL for CO${coA} E${i + 1}`}
                              value={v}
                              onChange={(e) => setBtl('A', i, Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                opacity: 0,
                                cursor: 'pointer',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none',
                              }}
                            >
                              {[1, 2, 3, 4, 5, 6].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                      );
                    })}
                    {Array.from({ length: visibleExpCountB }, (_, i) => {
                      const v = normalizeBtlArray((draft.sheet as any).btlsB, expCountB)[i] ?? 1;
                      return (
                        <th key={`btlb_${i}`} style={cellTh}>
                          <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }} title={`BTL: ${v}`}>
                            <div
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                background: '#fff',
                                textAlign: 'center',
                                userSelect: 'none',
                                fontWeight: 800,
                              }}
                            >
                              {v}
                            </div>
                            <select
                              aria-label={`BTL for CO${coB} E${i + 1}`}
                              value={v}
                              onChange={(e) => setBtl('B', i, Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                opacity: 0,
                                cursor: 'pointer',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none',
                              }}
                            >
                              {[1, 2, 3, 4, 5, 6].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                      );
                    })}
                  </>
                )}
                <th style={cellTh} colSpan={4 + visibleBtlIndices.length * 2} />
              </tr>
            </thead>

            <tbody>
              {students.map((s, idx) => {
                const row = draft.sheet.rowsByStudentId?.[String(s.id)];
                const marksA = normalizeMarksArray((row as any)?.marksA, expCountA);
                const marksB = normalizeMarksArray((row as any)?.marksB, expCountB);
                const ciaExamRaw = (row as any)?.ciaExam;
                const ciaExamNum = typeof ciaExamRaw === 'number' && Number.isFinite(ciaExamRaw) ? ciaExamRaw : null;

                const visibleMarksA = marksA.slice(0, visibleExpCountA);
                const visibleMarksB = marksB.slice(0, visibleExpCountB);
                const allVisibleMarks = visibleMarksA.concat(visibleMarksB);

                const visibleBtlsA = normalizeBtlArray((draft.sheet as any).btlsA, expCountA).slice(0, visibleExpCountA);
                const visibleBtlsB = normalizeBtlArray((draft.sheet as any).btlsB, expCountB).slice(0, visibleExpCountB);

                const avgTotal = avgMarks(allVisibleMarks);
                const avgA = avgMarks(visibleMarksA);
                const avgB = avgMarks(visibleMarksB);

                // CO formula requested (Excel-style):
                // CO-A = AVERAGEIF(experiments, CO-A) + CIAExam/2
                // CO-B = AVERAGEIF(experiments, CO-B) + CIAExam/2
                const coAMarkNum = avgA == null && avgTotal == null && ciaExamNum == null ? null : (avgA ?? 0) + (ciaExamNum ?? 0) / 2;
                const coBMarkNum = avgB == null && avgTotal == null && ciaExamNum == null ? null : (avgB ?? 0) + (ciaExamNum ?? 0) / 2;

                const btlAvgByIndex: Record<number, number | null> = {};
                for (const n of visibleBtlIndices) {
                  const marks: number[] = [];
                  for (let i = 0; i < visibleMarksA.length; i++) {
                    if (visibleBtlsA[i] === n) {
                      const v = visibleMarksA[i];
                      if (typeof v === 'number' && Number.isFinite(v)) marks.push(v);
                    }
                  }
                  for (let i = 0; i < visibleMarksB.length; i++) {
                    if (visibleBtlsB[i] === n) {
                      const v = visibleMarksB[i];
                      if (typeof v === 'number' && Number.isFinite(v)) marks.push(v);
                    }
                  }
                  btlAvgByIndex[n] = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
                }

                return (
                  <tr key={s.id}>
                    <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42 }}>{idx + 1}</td>
                    <td style={cellTd}>{s.reg_no}</td>
                    <td style={cellTd}>{s.name}</td>

                    {/* Experiments for CO-A */}
                    {Array.from({ length: visibleExpCountA }, (_, i) => (
                      <td key={`ma${s.id}_${i}`} style={{ ...cellTd, width: 78, minWidth: 78, background: '#fff7ed' }}>
                        <input
                          type="number"
                          value={marksA[i]}
                          onChange={(e) => setMark(s.id, 'A', i, e.target.value === '' ? '' : Number(e.target.value))}
                          style={inputStyle}
                          min={0}
                          max={DEFAULT_EXPERIMENT_MAX}
                        />
                      </td>
                    ))}

                    {/* Experiments for CO-B */}
                    {Array.from({ length: visibleExpCountB }, (_, i) => (
                      <td key={`mb${s.id}_${i}`} style={{ ...cellTd, width: 78, minWidth: 78, background: '#fff7ed' }}>
                        <input
                          type="number"
                          value={marksB[i]}
                          onChange={(e) => setMark(s.id, 'B', i, e.target.value === '' ? '' : Number(e.target.value))}
                          style={inputStyle}
                          min={0}
                          max={DEFAULT_EXPERIMENT_MAX}
                        />
                      </td>
                    ))}

                    <td style={{ ...cellTd, textAlign: 'right', fontWeight: 800 }}>{avgTotal == null ? '' : avgTotal.toFixed(1)}</td>
                    <td style={{ ...cellTd, width: 90, minWidth: 90, background: '#fff7ed' }}>
                      <input
                        type="number"
                        value={(row as any)?.ciaExam ?? ''}
                        onChange={(e) => setCiaExam(s.id, e.target.value === '' ? '' : Number(e.target.value))}
                        style={inputStyle}
                        min={0}
                        max={DEFAULT_CIA_EXAM_MAX}
                      />
                    </td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{coAMarkNum == null ? '' : coAMarkNum.toFixed(1)}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{pct(coAMarkNum, coMax)}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{coBMarkNum == null ? '' : coBMarkNum.toFixed(1)}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{pct(coBMarkNum, coMax)}</td>
                    {visibleBtlIndices.map((n) => {
                      const m = btlAvgByIndex[n] ?? null;
                      return (
                        <React.Fragment key={`btlcell_${s.id}_${n}`}>
                          <td style={{ ...cellTd, textAlign: 'right' }}>{m == null ? '' : m.toFixed(1)}</td>
                          <td style={{ ...cellTd, textAlign: 'right' }}>{pct(m, DEFAULT_EXPERIMENT_MAX)}</td>
                        </React.Fragment>
                      );
                    })}
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
          </PublishLockOverlay>
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
