import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchDraft, publishLabSheet, saveDraft } from '../services/obe';
import { usePublishWindow } from '../hooks/usePublishWindow';
import PublishLockOverlay from './PublishLockOverlay';

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type LabRowState = {
  studentId: number;
  absent?: boolean;
  absentKind?: 'AL' | 'ML' | 'SKL';
  marksA: Array<number | ''>;
  marksB: Array<number | ''>;
  ciaExam?: number | '';
};

type BtlLevel = '' | 1 | 2 | 3 | 4 | 5 | 6;

type LabSheet = {
  termLabel: string;
  batchLabel: string;
  coAEnabled: boolean;
  coBEnabled: boolean;
  expCountA: number;
  expCountB: number;
  btlA: BtlLevel[];
  btlB: BtlLevel[];
  expMaxA: number;
  expMaxB: number;
  rowsByStudentId: Record<string, LabRowState>;
};

type LabDraftPayload = {
  sheet: LabSheet;
};

type LabAssessmentKey = 'cia1' | 'cia2' | 'model';

type Props = {
  subjectId?: string | null;
  teachingAssignmentId?: number;
  assessmentKey: LabAssessmentKey;
  label: string;
  coA: number;
  coB?: number | null;
};

const DEFAULT_EXPERIMENTS = 5;
const DEFAULT_EXPERIMENT_MAX = 25;
const DEFAULT_CIA_EXAM_MAX = 30;

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
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

  const ar = String(a?.reg_no || '').trim();
  const br = String(b?.reg_no || '').trim();
  return ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
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

function normalizeBtlArray(raw: unknown, length: number, defaultValue: BtlLevel = 1): BtlLevel[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: BtlLevel[] = [];
  for (let i = 0; i < length; i++) {
    const v = arr[i];
    if (v === '' || v == null) {
      out.push(defaultValue);
      continue;
    }
    const n = typeof v === 'number' ? v : Number(v);
    out.push(Number.isFinite(n) && n >= 1 && n <= 6 ? (Math.trunc(n) as 1 | 2 | 3 | 4 | 5 | 6) : defaultValue);
  }
  return out;
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

function storageKey(assessmentKey: LabAssessmentKey, subjectId: string) {
  return `${assessmentKey}_sheet_${subjectId}`;
}

export default function LabCourseMarksEntry({
  subjectId,
  teachingAssignmentId,
  assessmentKey,
  label,
  coA,
  coB,
}: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  const [showAbsenteesOnly, setShowAbsenteesOnly] = useState(false);

  const key = useMemo(() => (subjectId ? storageKey(assessmentKey, String(subjectId)) : ''), [assessmentKey, subjectId]);

  const { data: publishWindow, publishAllowed, remainingSeconds, refresh: refreshPublishWindow } = usePublishWindow({
    assessment: assessmentKey,
    subjectCode: String(subjectId || ''),
    teachingAssignmentId,
  });

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

  const [draft, setDraft] = useState<LabDraftPayload>(() => ({
    sheet: {
      termLabel: 'KRCT AY25-26',
      batchLabel: String(subjectId || ''),
      coAEnabled: true,
      coBEnabled: Boolean(coB),
      expCountA: DEFAULT_EXPERIMENTS,
      expCountB: Boolean(coB) ? DEFAULT_EXPERIMENTS : 0,
      expMaxA: DEFAULT_EXPERIMENT_MAX,
      expMaxB: Boolean(coB) ? DEFAULT_EXPERIMENT_MAX : 0,
      btlA: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1 as const),
      btlB: Boolean(coB) ? Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1 as const) : [],
      rowsByStudentId: {},
    },
  }));

  // Load master config for term label
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setDraft((p) => ({
          ...p,
          sheet: {
            ...p.sheet,
            termLabel: String((cfg as any)?.termLabel || p.sheet.termLabel || 'KRCT AY25-26'),
            batchLabel: String(subjectId || p.sheet.batchLabel || ''),
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
        const res = await fetchDraft<LabDraftPayload>(assessmentKey, String(subjectId));
        if (!mounted) return;
        const d = (res as any)?.draft as LabDraftPayload | null;
        if (d && typeof d === 'object' && d.sheet && typeof d.sheet === 'object') {
          const coAEnabled = Boolean((d.sheet as any).coAEnabled ?? true);
          const coBEnabled = Boolean((d.sheet as any).coBEnabled ?? Boolean(coB));
          const expCountA = clampInt(Number((d.sheet as any).expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
          const expCountB = clampInt(Number((d.sheet as any).expCountB ?? (Boolean(coB) ? DEFAULT_EXPERIMENTS : 0)), 0, 12);
          const expMaxA = Number.isFinite(Number((d.sheet as any).expMaxA)) ? Number((d.sheet as any).expMaxA) : DEFAULT_EXPERIMENT_MAX;
          const expMaxB = Number.isFinite(Number((d.sheet as any).expMaxB)) ? Number((d.sheet as any).expMaxB) : (Boolean(coB) ? DEFAULT_EXPERIMENT_MAX : 0);
          const btlA = normalizeBtlArray((d.sheet as any).btlA, expCountA, 1);
          const btlB = normalizeBtlArray((d.sheet as any).btlB, expCountB, 1);
          setDraft({
            sheet: {
              termLabel: String((d.sheet as any).termLabel || 'KRCT AY25-26'),
              batchLabel: String(subjectId),
              coAEnabled,
              coBEnabled,
              expCountA,
              expCountB,
              expMaxA,
              expMaxB,
              btlA,
              btlB,
              rowsByStudentId:
                (d.sheet as any).rowsByStudentId && typeof (d.sheet as any).rowsByStudentId === 'object'
                  ? (d.sheet as any).rowsByStudentId
                  : {},
            },
          });
          try {
            if (key) lsSet(key, { rowsByStudentId: (d.sheet as any).rowsByStudentId || {} });
          } catch {
            // ignore
          }
        } else {
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
  }, [assessmentKey, subjectId, key, coB]);

  // Fetch roster
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!teachingAssignmentId) {
        setStudents([]);
        return;
      }
      setLoadingRoster(true);
      setRosterError(null);
      try {
        const res = await fetchTeachingAssignmentRoster(teachingAssignmentId);
        if (!mounted) return;
        const roster = (res?.students || []) as any[];
        const sorted = roster
          .map((s: any) => ({
            id: Number(s.id),
            reg_no: String(s.reg_no ?? ''),
            name: String(s.name ?? ''),
            section: s.section ?? null,
          }))
          .filter((s: any) => Number.isFinite(s.id))
          .sort(compareStudentName);
        setStudents(sorted);

        // Ensure rows exist for each student
        setDraft((p) => {
          const expCountA = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
          const expCountB = clampInt(Number(p.sheet.expCountB ?? (Boolean(coB) ? DEFAULT_EXPERIMENTS : 0)), 0, 12);
          const rowsByStudentId: Record<string, LabRowState> = { ...(p.sheet.rowsByStudentId || {}) };

          for (const st of sorted) {
            const k = String(st.id);
            if (rowsByStudentId[k]) continue;
            rowsByStudentId[k] = {
              studentId: st.id,
              absent: false,
              absentKind: undefined,
              marksA: Array.from({ length: expCountA }, () => ''),
              marksB: Array.from({ length: expCountB }, () => ''),
              ciaExam: '',
            };
          }

          return {
            ...p,
            sheet: { ...p.sheet, rowsByStudentId },
          };
        });
      } catch (e: any) {
        if (!mounted) return;
        setStudents([]);
        setRosterError(e?.message || 'Failed to load roster');
      } finally {
        if (mounted) setLoadingRoster(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [teachingAssignmentId, coB]);

  // Local mirror (for dashboard counts)
  useEffect(() => {
    if (!key) return;
    try {
      lsSet(key, { rowsByStudentId: draft.sheet.rowsByStudentId });
    } catch {
      // ignore
    }
  }, [draft.sheet.rowsByStudentId, key]);

  // Autosave draft (debounced)
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        await saveDraft(assessmentKey, String(subjectId), draft);
        if (!cancelled) setSavedAt(new Date().toLocaleString());
      } catch {
        // ignore
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [assessmentKey, subjectId, draft]);

  const expCountA = clampInt(Number(draft.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
  const expCountB = clampInt(Number(draft.sheet.expCountB ?? (Boolean(coB) ? DEFAULT_EXPERIMENTS : 0)), 0, 12);
  const coAEnabled = Boolean(draft.sheet.coAEnabled);
  const coBEnabled = Boolean(coB) && Boolean(draft.sheet.coBEnabled);

  const visibleExpCountA = coAEnabled ? expCountA : 0;
  const visibleExpCountB = coBEnabled ? expCountB : 0;
  const totalExpCols = visibleExpCountA + visibleExpCountB;

  const hasAbsentees = useMemo(() => {
    if (assessmentKey !== 'model') return false;
    const rows = draft.sheet.rowsByStudentId || {};
    return Object.values(rows).some((r) => Boolean((r as any)?.absent));
  }, [assessmentKey, draft.sheet.rowsByStudentId]);

  const renderStudents = useMemo(() => {
    if (assessmentKey !== 'model') return students;
    if (!showAbsenteesOnly) return students;
    return students.filter((s) => Boolean(draft.sheet.rowsByStudentId?.[String(s.id)]?.absent));
  }, [assessmentKey, students, showAbsenteesOnly, draft.sheet.rowsByStudentId]);

  function setAbsent(studentId: number, v: boolean) {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;
      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? 0), 0, 12);

      if (v) {
        return {
          ...p,
          sheet: {
            ...p.sheet,
            rowsByStudentId: {
              ...p.sheet.rowsByStudentId,
              [k]: {
                ...existing,
                absent: true,
                absentKind: ((existing as any).absentKind || 'AL') as any,
                marksA: Array.from({ length: expCountA2 }, () => ''),
                marksB: Array.from({ length: expCountB2 }, () => ''),
                ciaExam: '',
              },
            },
          },
        };
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...existing, absent: false, absentKind: undefined },
          },
        },
      };
    });
  }

  function setAbsentKind(studentId: number, absentKind: 'AL' | 'ML' | 'SKL') {
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
            [k]: { ...existing, absent: true, absentKind },
          },
        },
      };
    });
  }

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

      const btlA = which === 'A' ? normalizeBtlArray((p.sheet as any).btlA, next, 1) : normalizeBtlArray((p.sheet as any).btlA, clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12), 1);
      const btlB = which === 'B' ? normalizeBtlArray((p.sheet as any).btlB, next, 1) : normalizeBtlArray((p.sheet as any).btlB, clampInt(Number(p.sheet.expCountB ?? (Boolean(coB) ? DEFAULT_EXPERIMENTS : 0)), 0, 12), 1);
      const expMaxA2 = which === 'A' ? (p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX) : Number(p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX);
      const expMaxB2 = which === 'B' ? (p.sheet.expMaxB ?? DEFAULT_EXPERIMENT_MAX) : Number(p.sheet.expMaxB ?? (Boolean(coB) ? DEFAULT_EXPERIMENT_MAX : 0));

      return {
        ...p,
        sheet: {
          ...p.sheet,
          expCountA: which === 'A' ? next : p.sheet.expCountA,
          expCountB: which === 'B' ? next : p.sheet.expCountB,
          btlA,
          btlB,
          expMaxA: expMaxA2,
          expMaxB: expMaxB2,
          rowsByStudentId,
        },
      };
    });
  }

  function setExpMax(which: 'A' | 'B', v: number) {
    const next = clampInt(Number(v), 0, 100);
    setDraft((p) => {
      const expMaxA2 = which === 'A' ? next : clampInt(Number(p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const expMaxB2 = which === 'B' ? next : clampInt(Number(p.sheet.expMaxB ?? (Boolean(coB) ? DEFAULT_EXPERIMENT_MAX : 0)), 0, 100);

      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? (Boolean(coB) ? DEFAULT_EXPERIMENTS : 0)), 0, 12);

      const rowsByStudentId: Record<string, LabRowState> = {};
      for (const [k, row] of Object.entries(p.sheet.rowsByStudentId || {})) {
        const marksA = normalizeMarksArray((row as any).marksA, expCountA2).map((m) => (typeof m === 'number' ? clampInt(m, 0, expMaxA2) : ''));
        const marksB = normalizeMarksArray((row as any).marksB, expCountB2).map((m) => (typeof m === 'number' ? clampInt(m, 0, expMaxB2) : ''));
        rowsByStudentId[k] = { ...row, marksA, marksB };
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          expMaxA: expMaxA2,
          expMaxB: expMaxB2,
          rowsByStudentId,
        },
      };
    });
  }

  function setBtl(which: 'A' | 'B', expIndex: number, value: BtlLevel) {
    setDraft((p) => {
      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? (Boolean(coB) ? DEFAULT_EXPERIMENTS : 0)), 0, 12);
      const btlA = normalizeBtlArray((p.sheet as any).btlA, expCountA2, 1);
      const btlB = normalizeBtlArray((p.sheet as any).btlB, expCountB2, 1);
      if (which === 'A') btlA[expIndex] = value;
      else btlB[expIndex] = value;

      return {
        ...p,
        sheet: {
          ...p.sheet,
          btlA,
          btlB,
        },
      };
    });
  }

  function setMark(studentId: number, which: 'A' | 'B', expIndex: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;

      if (assessmentKey === 'model') {
        const absent = Boolean((existing as any).absent);
        const kind = absent ? String((existing as any).absentKind || 'AL').toUpperCase() : '';
        const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));
        if (absent && !canEditAbsent) return p;
      }

      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? (Boolean(coB) ? DEFAULT_EXPERIMENTS : 0)), 0, 12);

      const expMaxA2 = clampInt(Number(p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const expMaxB2 = clampInt(Number(p.sheet.expMaxB ?? (Boolean(coB) ? DEFAULT_EXPERIMENT_MAX : 0)), 0, 100);

      const marksA = normalizeMarksArray((existing as any).marksA, expCountA2);
      const marksB = normalizeMarksArray((existing as any).marksB, expCountB2);

      const nextValue =
        value === ''
          ? ''
          : which === 'A'
            ? clampInt(Number(value), 0, expMaxA2)
            : clampInt(Number(value), 0, expMaxB2);

      if (which === 'A') marksA[expIndex] = nextValue;
      else marksB[expIndex] = nextValue;

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

      if (assessmentKey === 'model') {
        const absent = Boolean((existing as any).absent);
        const kind = absent ? String((existing as any).absentKind || 'AL').toUpperCase() : '';
        const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));
        if (absent && !canEditAbsent) return p;
      }
      const nextValue = value === '' ? '' : clampInt(Number(value), 0, DEFAULT_CIA_EXAM_MAX);
      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...existing, ciaExam: nextValue },
          },
        },
      };
    });
  }

  async function saveNow() {
    if (!subjectId) return;
    setSavingDraft(true);
    try {
      await saveDraft(assessmentKey, String(subjectId), draft);
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
    const ok = window.confirm(`Reset all marks for ${label}? This clears the draft for all students.`);
    if (!ok) return;

    const expCountA2 = clampInt(Number(draft.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
    const expCountB2 = clampInt(Number(draft.sheet.expCountB ?? (Boolean(coB) ? DEFAULT_EXPERIMENTS : 0)), 0, 12);

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
        btlA: Array.from({ length: expCountA2 }, () => 1 as const),
        btlB: Array.from({ length: expCountB2 }, () => 1 as const),
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
      await saveDraft(assessmentKey, String(subjectId), nextDraft);
      setSavedAt(new Date().toLocaleString());
    } catch {
      // ignore
    }
  }

  async function publish() {
    if (!subjectId) return;
    setPublishing(true);
    try {
      await publishLabSheet(assessmentKey, String(subjectId), draft);
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

  const expMaxA = Number.isFinite(Number(draft.sheet.expMaxA)) ? Number(draft.sheet.expMaxA) : DEFAULT_EXPERIMENT_MAX;
  const expMaxB = Number.isFinite(Number(draft.sheet.expMaxB)) ? Number(draft.sheet.expMaxB) : (Boolean(coB) ? DEFAULT_EXPERIMENT_MAX : 0);

  const coMaxA = expMaxA + DEFAULT_CIA_EXAM_MAX / 2;
  const coMaxB = expMaxB + DEFAULT_CIA_EXAM_MAX / 2;

  const btlA = normalizeBtlArray((draft.sheet as any).btlA, expCountA, 1);
  const btlB = normalizeBtlArray((draft.sheet as any).btlB, expCountB, 1);

  const visibleBtlIndices = useMemo(() => {
    if (totalExpCols === 0) return [] as number[];
    const set = new Set<number>();
    for (let i = 0; i < visibleExpCountA; i++) {
      const v = btlA[i];
      if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) set.add(v);
    }
    for (let i = 0; i < visibleExpCountB; i++) {
      const v = btlB[i];
      if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) set.add(v);
    }
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [btlA, btlB, totalExpCols, visibleExpCountA, visibleExpCountB]);

  const headerCols = 3 + totalExpCols + 1 + 1 + (coB ? 4 : 2) + visibleBtlIndices.length * 2;

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

  const minTableWidth = Math.max(900, 360 + (totalExpCols + visibleBtlIndices.length * 2) * 80);

  const coEnableStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 8,
  };

  const btlSelectStyle: React.CSSProperties = {
    width: 66,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    padding: '4px 6px',
    fontSize: 12,
    background: '#fff',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 360 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>COs enabled</div>
            <div style={coEnableStyle}>
              {[1, 2, 3, 4, 5].map((n) => {
                const isA = n === coA;
                const isB = Boolean(coB) && n === coB;
                const applicable = isA || isB;
                const checked = isA ? coAEnabled : isB ? coBEnabled : false;
                const expCount = isA ? expCountA : expCountB;
                const expMax = isA ? expMaxA : expMaxB;
                return (
                  <div
                    key={n}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '6px 8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      background: '#fff',
                      opacity: applicable ? 1 : 0.55,
                    }}
                    title={!applicable ? 'This CO is not part of this lab sheet' : undefined}
                  >
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700, fontSize: 12, color: '#111827' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!applicable}
                        onChange={(e) => {
                          const next = e.target.checked;
                          if (isA) setCoEnabled('A', next);
                          if (isB) setCoEnabled('B', next);
                        }}
                      />
                      CO-{n}
                    </label>

                    {applicable && checked ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>No. of experiments</div>
                        <input
                          type="number"
                          className="obe-input"
                          value={expCount}
                          onChange={(e) => setExpCount(isA ? 'A' : 'B', Number(e.target.value))}
                          min={0}
                          max={12}
                        />
                        <div style={{ fontSize: 11, color: '#6b7280' }}>Max marks</div>
                        <input
                          type="number"
                          className="obe-input"
                          value={expMax}
                          onChange={(e) => setExpMax(isA ? 'A' : 'B', Number(e.target.value))}
                          min={0}
                          max={100}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={saveNow} className="obe-btn obe-btn-success" disabled={savingDraft || !subjectId}>
            {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={resetSheet} className="obe-btn obe-btn-danger" disabled={!subjectId}>
            Reset
          </button>
          <button
            onClick={publish}
            className="obe-btn obe-btn-primary"
            disabled={!subjectId || publishing || !publishAllowed}
            title={!publishAllowed ? 'Publish window closed' : 'Publish'}
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {loadingRoster ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading roster…</div> : null}
      {rosterError ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #ef444433',
            color: '#991b1b',
            padding: 10,
            borderRadius: 10,
            marginBottom: 10,
            maxWidth: '100%',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {rosterError}
        </div>
      ) : null}

      <div style={cardStyle}>
        <PublishLockOverlay
          locked={globalLocked}
        >
          <div className="obe-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="obe-table" style={{ width: 'max-content', minWidth: minTableWidth, tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={cellTh} colSpan={headerCols}>
                    {label}
                  </th>
                </tr>
                <tr>
                  <th style={cellTh} rowSpan={5}>
                    S.No
                  </th>
                  <th style={cellTh} rowSpan={5}>
                    R.No
                  </th>
                  <th style={cellTh} rowSpan={5}>
                    Name of the Students
                  </th>

                  <th style={cellTh} colSpan={totalExpCols || 1}>
                    Experiments
                  </th>
                  <th style={cellTh} rowSpan={5}>
                    AVG
                  </th>
                  <th style={cellTh} rowSpan={5}>
                    CIA Exam
                  </th>
                  <th style={cellTh} colSpan={coB ? 4 : 2}>
                    CO ATTAINMENT
                  </th>
                  {visibleBtlIndices.length ? (
                    <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>
                      BTL ATTAINMENT
                    </th>
                  ) : null}
                </tr>

                <tr>
                  {totalExpCols === 0 ? (
                    <th style={cellTh}>—</th>
                  ) : (
                    <>
                      {Array.from({ length: visibleExpCountA }, (_, i) => (
                        <th key={`coa_${i}`} style={cellTh}>
                          {coA}
                        </th>
                      ))}
                      {Array.from({ length: visibleExpCountB }, (_, i) => (
                        <th key={`cob_${i}`} style={cellTh}>
                          {coB}
                        </th>
                      ))}
                    </>
                  )}

                  <th style={cellTh} colSpan={2}>
                    CO-{coA}
                  </th>
                  {coB ? (
                    <th style={cellTh} colSpan={2}>
                      CO-{coB}
                    </th>
                  ) : null}
                  {visibleBtlIndices.map((n) => (
                    <th key={`btl_${n}`} style={cellTh} colSpan={2}>
                      BTL-{n}
                    </th>
                  ))}
                </tr>

                <tr>
                  {totalExpCols === 0 ? (
                    <th style={cellTh}>—</th>
                  ) : (
                    <>
                      {Array.from({ length: totalExpCols }, (_, i) => (
                        <th key={`max_${i}`} style={cellTh}>
                          {i < visibleExpCountA ? expMaxA : expMaxB}
                        </th>
                      ))}
                    </>
                  )}

                  <th style={cellTh}>{coMaxA}</th>
                  <th style={cellTh}>%</th>
                  {coB ? (
                    <>
                      <th style={cellTh}>{coMaxB}</th>
                      <th style={cellTh}>%</th>
                    </>
                  ) : null}
                  {visibleBtlIndices.map((n) => (
                    <React.Fragment key={`btlmax_${n}`}>
                      <th style={cellTh}>{Math.max(expMaxA, expMaxB)}</th>
                      <th style={cellTh}>%</th>
                    </React.Fragment>
                  ))}
                </tr>

                <tr>
                  {totalExpCols === 0 ? (
                    <th style={cellTh}>No experiments</th>
                  ) : (
                    <>
                      {Array.from({ length: visibleExpCountA }, (_, i) => (
                        <th key={`ea_${i}`} style={cellTh}>
                          E{i + 1}
                        </th>
                      ))}
                      {Array.from({ length: visibleExpCountB }, (_, i) => (
                        <th key={`eb_${i}`} style={cellTh}>
                          E{i + 1}
                        </th>
                      ))}
                    </>
                  )}
                  <th style={cellTh} colSpan={(coB ? 4 : 2) + visibleBtlIndices.length * 2} />
                </tr>

                <tr>
                  {totalExpCols === 0 ? (
                    <th style={cellTh}>BTL</th>
                  ) : (
                    <>
                      {Array.from({ length: visibleExpCountA }, (_, i) => (
                        <th key={`btlA_${i}`} style={cellTh}>
                          <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }} title={`BTL: ${btlA[i] || 1}`}>
                            <div
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                background: '#fff',
                                textAlign: 'center',
                                userSelect: 'none',
                                fontWeight: 800,
                                borderRadius: 8,
                              }}
                            >
                              {btlA[i] || 1}
                            </div>
                            <select
                              value={btlA[i] || 1}
                              onChange={(e) => setBtl('A', i, Number(e.target.value) as any)}
                              aria-label={`BTL for CO-${coA} E${i + 1}`}
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
                      ))}
                      {Array.from({ length: visibleExpCountB }, (_, i) => (
                        <th key={`btlB_${i}`} style={cellTh}>
                          <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }} title={`BTL: ${btlB[i] || 1}`}>
                            <div
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                background: '#fff',
                                textAlign: 'center',
                                userSelect: 'none',
                                fontWeight: 800,
                                borderRadius: 8,
                              }}
                            >
                              {btlB[i] || 1}
                            </div>
                            <select
                              value={btlB[i] || 1}
                              onChange={(e) => setBtl('B', i, Number(e.target.value) as any)}
                              aria-label={`BTL for CO-${coB} E${i + 1}`}
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
                      ))}
                    </>
                  )}
                  <th style={cellTh} colSpan={(coB ? 4 : 2) + visibleBtlIndices.length * 2} />
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

                  const visibleBtlsA = btlA.slice(0, visibleExpCountA);
                  const visibleBtlsB = btlB.slice(0, visibleExpCountB);

                  const avgTotal = avgMarks(allVisibleMarks);
                  const avgA = avgMarks(visibleMarksA);
                  const avgB = avgMarks(visibleMarksB);

                  const hasAny = avgTotal != null || ciaExamNum != null;
                  const coAMarkNum = !hasAny ? null : (avgA ?? 0) + (ciaExamNum ?? 0) / 2;
                  const coBMarkNum = !hasAny ? null : (avgB ?? 0) + (ciaExamNum ?? 0) / 2;

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

                      {Array.from({ length: visibleExpCountA }, (_, i) => (
                        <td key={`ma${s.id}_${i}`} style={{ ...cellTd, width: 78, minWidth: 78, background: '#fff7ed' }}>
                          <input
                            type="number"
                            value={marksA[i]}
                            onChange={(e) => setMark(s.id, 'A', i, e.target.value === '' ? '' : Number(e.target.value))}
                            style={inputStyle}
                            min={0}
                            max={expMaxA}
                          />
                        </td>
                      ))}

                      {Array.from({ length: visibleExpCountB }, (_, i) => (
                        <td key={`mb${s.id}_${i}`} style={{ ...cellTd, width: 78, minWidth: 78, background: '#fff7ed' }}>
                          <input
                            type="number"
                            value={marksB[i]}
                            onChange={(e) => setMark(s.id, 'B', i, e.target.value === '' ? '' : Number(e.target.value))}
                            style={inputStyle}
                            min={0}
                            max={expMaxB}
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
                      <td style={{ ...cellTd, textAlign: 'right' }}>{pct(coAMarkNum, coMaxA)}</td>

                      {coB ? (
                        <>
                          <td style={{ ...cellTd, textAlign: 'right' }}>{coBMarkNum == null ? '' : coBMarkNum.toFixed(1)}</td>
                          <td style={{ ...cellTd, textAlign: 'right' }}>{pct(coBMarkNum, coMaxB)}</td>
                        </>
                      ) : null}

                      {visibleBtlIndices.map((n) => {
                        const m = btlAvgByIndex[n] ?? null;
                        return (
                          <React.Fragment key={`btlcell_${s.id}_${n}`}>
                            <td style={{ ...cellTd, textAlign: 'right' }}>{m == null ? '' : m.toFixed(1)}</td>
                              <td style={{ ...cellTd, textAlign: 'right' }}>{pct(m, Math.max(expMaxA, expMaxB))}</td>
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

      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {savedAt ? <div>Draft saved: {savedAt}</div> : null}
        {publishedAt ? <div>Last published: {publishedAt}</div> : null}
      </div>
    </div>
  );
}
