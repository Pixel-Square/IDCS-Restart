import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import fetchWithAuth from '../services/fetchAuth';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { confirmMarkManagerLock, createEditRequest, fetchDraft, fetchPublishedLabSheet, publishLabSheet, saveDraft } from '../services/obe';
import { useEditWindow } from '../hooks/useEditWindow';
import { formatRemaining, usePublishWindow } from '../hooks/usePublishWindow';
import { useMarkTableLock } from '../hooks/useMarkTableLock';
import PublishLockOverlay from './PublishLockOverlay';

// Vite-friendly asset URL for lock GIF used in the floating panel
const lockPanelGif = new URL('https://static.vecteezy.com/system/resources/thumbnails/014/585/778/small/gold-locked-padlock-png.png', import.meta.url).href;

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
  ciaExamEnabled?: boolean;
  expCountA: number;
  expMaxA?: number;
  expCountB: number;
  expMaxB?: number;
  btlsA: Array<1 | 2 | 3 | 4 | 5 | 6>;
  btlsB: Array<1 | 2 | 3 | 4 | 5 | 6>;
  rowsByStudentId: Record<string, LabRowState>;

  // Mark Manager lock state
  markManagerLocked?: boolean;
  markManagerSnapshot?: string | null;
  markManagerApprovalUntil?: string | null;
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
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishedEditModalOpen, setPublishedEditModalOpen] = useState(false);
  const [viewMarksModalOpen, setViewMarksModalOpen] = useState(false);
  const [publishedViewSnapshot, setPublishedViewSnapshot] = useState<LabDraftPayload | null>(null);
  const [publishedViewLoading, setPublishedViewLoading] = useState(false);
  const [publishedViewError, setPublishedViewError] = useState<string | null>(null);

  const [markManagerModal, setMarkManagerModal] = useState<null | { mode: 'confirm' | 'request' }>(null);
  const [markManagerBusy, setMarkManagerBusy] = useState(false);
  const [markManagerError, setMarkManagerError] = useState<string | null>(null);
  const [markManagerAnimating, setMarkManagerAnimating] = useState(false);

  const [draft, setDraft] = useState<LabDraftPayload>({
    sheet: {
      termLabel: 'KRCT AY25-26',
      batchLabel: subjectId || '',
      coAEnabled: true,
      coBEnabled: true,
      ciaExamEnabled: true,
      expCountA: DEFAULT_EXPERIMENTS,
      expCountB: DEFAULT_EXPERIMENTS,
      btlsA: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1),
      btlsB: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1),
      rowsByStudentId: {},
          expMaxA: DEFAULT_EXPERIMENT_MAX,
          expMaxB: DEFAULT_EXPERIMENT_MAX,
      markManagerLocked: false,
      markManagerSnapshot: null,
      markManagerApprovalUntil: null,
    },
  });

  const key = useMemo(() => (subjectId ? storageKey(assessmentKey, subjectId) : ''), [assessmentKey, subjectId]);

  const {
    data: publishWindow,
    publishAllowed,
    remainingSeconds,
    refresh: refreshPublishWindow,
  } = usePublishWindow({ assessment: assessmentKey, subjectCode: String(subjectId || ''), teachingAssignmentId });

  const { data: markLock, refresh: refreshMarkLock } = useMarkTableLock({
    assessment: assessmentKey as any,
    subjectCode: String(subjectId || ''),
    teachingAssignmentId,
    options: { poll: false },
  });

  const { data: markManagerEditWindow } = useEditWindow({
    assessment: assessmentKey as any,
    subjectCode: String(subjectId || ''),
    scope: 'MARK_MANAGER',
    teachingAssignmentId,
    options: { poll: false },
  });

  const isPublished = Boolean(publishedViewSnapshot) || Boolean(publishedAt) || Boolean(markLock?.exists && markLock?.is_published);
  const entryOpen = !isPublished ? true : Boolean(markLock?.entry_open);
  const publishedEditLocked = Boolean(isPublished && !entryOpen);

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
          const ciaExamEnabled = Boolean((d.sheet as any).ciaExamEnabled ?? true);
          const expCountA = clampInt(Number((d.sheet as any).expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
          const expCountB = clampInt(Number((d.sheet as any).expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
          const btlsA = normalizeBtlArray((d.sheet as any).btlsA, expCountA);
          const btlsB = normalizeBtlArray((d.sheet as any).btlsB, expCountB);

          const loadedSnapshot = (d.sheet as any).markManagerSnapshot ?? null;
          const loadedApprovalUntil = (d.sheet as any).markManagerApprovalUntil ?? null;
          const loadedLockedRaw = (d.sheet as any).markManagerLocked;
          const loadedLocked = typeof loadedLockedRaw === 'boolean' ? loadedLockedRaw : Boolean(loadedSnapshot);

          setDraft({
            sheet: {
              termLabel: String((d.sheet as any).termLabel || (masterCfg as any)?.termLabel || 'KRCT AY25-26'),
              batchLabel: String(subjectId),
              coAEnabled,
              coBEnabled,
              ciaExamEnabled,
              expCountA,
              expCountB,
              btlsA,
              btlsB,
              rowsByStudentId: (d.sheet as any).rowsByStudentId && typeof (d.sheet as any).rowsByStudentId === 'object' ? (d.sheet as any).rowsByStudentId : {},
              markManagerLocked: loadedLocked,
              markManagerSnapshot: loadedSnapshot,
              markManagerApprovalUntil: loadedApprovalUntil,
            },
          });
          try {
            if (key) lsSet(key, { rowsByStudentId: (d.sheet as any).rowsByStudentId || {} });
          } catch {}
          // set saved metadata if backend provided it
          const updatedAt = (res as any)?.updated_at ?? null;
          const updatedBy = (res as any)?.updated_by ?? null;
          if (updatedAt) {
            try {
              setSavedAt(new Date(String(updatedAt)).toLocaleString());
            } catch {
              setSavedAt(String(updatedAt));
            }
          }
          if (updatedBy) {
            setSavedBy(String(updatedBy.name || updatedBy.username || updatedBy.id || ''));
          }
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

  // Mark Manager workflow:
  // - Editable before first confirmation.
  // - After confirmation, stays locked unless IQAC approves.
  // - Unlock when IQAC approves an edit window for MARK_MANAGER (one-time per approval window).
  useEffect(() => {
    if (!subjectId) return;

    if (isPublished && markLock?.exists) {
      const nextLocked = Boolean(markLock?.mark_manager_locked);
      if (Boolean(draft.sheet.markManagerLocked) !== nextLocked) {
        setDraft((p) => ({
          ...p,
          sheet: { ...p.sheet, markManagerLocked: nextLocked },
        }));
      }
      return;
    }

    const allowedByApproval = Boolean(markManagerEditWindow?.allowed_by_approval);
    const approvalUntil = markManagerEditWindow?.approval_until ? String(markManagerEditWindow.approval_until) : null;

    if (allowedByApproval && approvalUntil) {
      const lastApprovalUntil = draft.sheet.markManagerApprovalUntil ? String(draft.sheet.markManagerApprovalUntil) : null;
      if (Boolean(draft.sheet.markManagerLocked) && lastApprovalUntil !== approvalUntil) {
        setDraft((p) => ({
          ...p,
          sheet: { ...p.sheet, markManagerLocked: false, markManagerApprovalUntil: approvalUntil },
        }));
      }
      return;
    }

    // If no approval is active, ensure the sheet starts editable by default.
    // (markManagerLocked === true means the sheet is confirmed/locked and
    // should block edits; default should be editable until user clicks Save.)
    if (Boolean(draft.sheet.markManagerLocked)) {
      setDraft((p) => ({
        ...p,
        sheet: { ...p.sheet, markManagerLocked: false },
      }));
    }
  }, [
    subjectId,
    isPublished,
    markLock?.exists,
    markLock?.mark_manager_locked,
    markManagerEditWindow?.allowed_by_approval,
    markManagerEditWindow?.approval_until,
    draft.sheet.markManagerLocked,
    draft.sheet.markManagerApprovalUntil,
  ]);

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

  const markManagerLocked = Boolean(draft.sheet.markManagerLocked);
  const ciaExamEnabled = draft.sheet.ciaExamEnabled !== false;
  const tableBlocked = isPublished ? !entryOpen : markManagerLocked;

  function setCoEnabled(which: 'A' | 'B', enabled: boolean) {
    setDraft((p) => {
      if (Boolean(p.sheet.markManagerLocked)) return p;
      return {
        ...p,
        sheet: {
          ...p.sheet,
          coAEnabled: which === 'A' ? enabled : p.sheet.coAEnabled,
          coBEnabled: which === 'B' ? enabled : p.sheet.coBEnabled,
        },
      };
    });
  }

  function setExpMax(which: 'A' | 'B', v: number) {
    const next = clampInt(Number(v), 0, 100);
    setDraft((p) => {
      if (Boolean(p.sheet.markManagerLocked)) return p;
      return {
        ...p,
        sheet: {
          ...p.sheet,
          expMaxA: which === 'A' ? next : p.sheet.expMaxA,
          expMaxB: which === 'B' ? next : p.sheet.expMaxB,
        },
      };
    });
  }

  function setExpCount(which: 'A' | 'B', n: number) {
    const next = clampInt(n, 0, 12);
    setDraft((p) => {
      if (Boolean(p.sheet.markManagerLocked)) return p;
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
      // Allow BTL mapping edits (LAB needs BTL selection to stay usable).
      // Still respect publish/global locks.
      if (publishedEditLocked || globalLocked) return p;
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

  function setCiaExamEnabled(enabled: boolean) {
    setDraft((p) => {
      if (Boolean(p.sheet.markManagerLocked)) return p;
      return { ...p, sheet: { ...p.sheet, ciaExamEnabled: Boolean(enabled) } };
    });
  }

  function markManagerSnapshotOf(sheet: LabSheet): string {
    const expCountA2 = clampInt(Number(sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
    const expCountB2 = clampInt(Number(sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
    const btlsA2 = normalizeBtlArray((sheet as any).btlsA, expCountA2).slice(0, expCountA2);
    const btlsB2 = normalizeBtlArray((sheet as any).btlsB, expCountB2).slice(0, expCountB2);
    return JSON.stringify({
      coAEnabled: Boolean(sheet.coAEnabled),
      coBEnabled: Boolean(sheet.coBEnabled),
      ciaExamEnabled: Boolean((sheet as any).ciaExamEnabled ?? true),
      expCountA: expCountA2,
      expMaxA: clampInt(Number((sheet as any).expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100),
      expCountB: expCountB2,
      expMaxB: clampInt(Number((sheet as any).expMaxB ?? DEFAULT_EXPERIMENT_MAX), 0, 100),
      btlsA: btlsA2,
      btlsB: btlsB2,
    });
  }

  async function requestMarkManagerEdit() {
    if (!subjectId) return;
    setMarkManagerBusy(true);
    setMarkManagerError(null);
    try {
      await createEditRequest({
        assessment: assessmentKey as any,
        subject_code: String(subjectId),
        scope: 'MARK_MANAGER',
        reason: `Edit request: Mark Manager changes for ${label}`,
        teaching_assignment_id: teachingAssignmentId,
      });
      alert('Edit request sent to IQAC.');
    } catch (e: any) {
      setMarkManagerError(e?.message || 'Request failed');
      alert(e?.message || 'Request failed');
    } finally {
      setMarkManagerBusy(false);
    }
  }

  function setMark(studentId: number, which: 'A' | 'B', expIndex: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
      const maxA = clampInt(Number(p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const maxB = clampInt(Number(p.sheet.expMaxB ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const existing = p.sheet.rowsByStudentId?.[k];
      const baseMarksA = existing
        ? normalizeMarksArray((existing as any).marksA, expCountA2)
        : (Array.from({ length: expCountA2 }, () => '' as const) as Array<number | ''>);
      const baseMarksB = existing
        ? normalizeMarksArray((existing as any).marksB, expCountB2)
        : (Array.from({ length: expCountB2 }, () => '' as const) as Array<number | ''>);

      const marksA = [...baseMarksA];
      const marksB = [...baseMarksB];
      if (which === 'A') {
        if (value === '' || value == null) marksA[expIndex] = '';
        else {
          const n = Number(value);
          marksA[expIndex] = Number.isFinite(n) ? Math.max(0, Math.min(maxA, Math.trunc(n))) : '';
        }
      } else {
        if (value === '' || value == null) marksB[expIndex] = '';
        else {
          const n = Number(value);
          marksB[expIndex] = Number.isFinite(n) ? Math.max(0, Math.min(maxB, Math.trunc(n))) : '';
        }
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: {
              ...(existing || { studentId }),
              marksA,
              marksB,
              ciaExam:
                existing && (typeof (existing as any).ciaExam === 'number' || (existing as any).ciaExam === '')
                  ? ((existing as any).ciaExam as number | '')
                  : ('' as const),
            },
          },
        },
      };
    });
  }

  function setCiaExam(studentId: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
      const maxA = clampInt(Number(p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const maxB = clampInt(Number(p.sheet.expMaxB ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const existing = p.sheet.rowsByStudentId?.[k];
      const marksA = existing
        ? normalizeMarksArray((existing as any).marksA, expCountA2)
        : (Array.from({ length: expCountA2 }, () => '' as const) as Array<number | ''>);
      const marksB = existing
        ? normalizeMarksArray((existing as any).marksB, expCountB2)
        : (Array.from({ length: expCountB2 }, () => '' as const) as Array<number | ''>);

      let ciaVal: number | '' = '';
      if (value === '' || value == null) ciaVal = '';
      else {
        const n = Number(value);
        // CIA exam max might differ; clamp to the larger of A/B max to be safe
        const ciaMax = Math.max(maxA, maxB, DEFAULT_CIA_EXAM_MAX);
        ciaVal = Number.isFinite(n) ? Math.max(0, Math.min(ciaMax, Math.trunc(n))) : '';
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...(existing || { studentId }), marksA, marksB, ciaExam: ciaVal },
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
    if (globalLocked) {
      alert('Publishing is locked by IQAC.');
      return;
    }
    if (!publishAllowed) {
      alert('Publish window is closed. Please request IQAC approval.');
      return;
    }

    // After publish, keep the table locked (no edits) until IQAC approval.
    if (publishedAt) return;

    setPublishing(true);
    try {
      await publishLabSheet(assessmentKey, subjectId, draft, teachingAssignmentId);
      setPublishedAt(new Date().toLocaleString());
      await refreshPublishedSnapshot(false);
      refreshPublishWindow();
      refreshMarkLock({ silent: true });
        try {
          console.debug('obe:published dispatch', { assessment: assessmentKey, subjectId });
          window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId, assessment: assessmentKey } }));
        } catch {
          // ignore
        }
    } catch (e: any) {
      alert(e?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  async function refreshPublishedSnapshot(showLoading: boolean) {
    if (!subjectId) return;
    if (showLoading) setPublishedViewLoading(true);
    setPublishedViewError(null);
    try {
      const resp = await fetchPublishedLabSheet(assessmentKey as any, String(subjectId), teachingAssignmentId);
      const data = (resp as any)?.data ?? null;
      if (data && typeof data === 'object') {
        setPublishedViewSnapshot(data as LabDraftPayload);
      }
    } catch (e: any) {
      if (showLoading) setPublishedViewError(e?.message || 'Failed to load published marks');
    } finally {
      if (showLoading) setPublishedViewLoading(false);
    }
  }

  useEffect(() => {
    if (!subjectId) return;
    refreshPublishedSnapshot(false);
  }, [subjectId, assessmentKey]);

  const prevEntryOpenRef = React.useRef<boolean>(Boolean(entryOpen));
  useEffect(() => {
    // When IQAC opens MARK_ENTRY edits, re-hydrate the editable draft so the table
    // shows existing marks (prefer last saved draft; fall back to the published snapshot).
    if (!subjectId) return;
    if (!isPublished) return;

    const prev = prevEntryOpenRef.current;
    if (prev || !entryOpen) {
      prevEntryOpenRef.current = Boolean(entryOpen);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const resp = await fetchDraft(assessmentKey as any, String(subjectId), teachingAssignmentId);
        const data = (resp as any)?.data ?? null;
        if (!mounted) return;
        if (data && typeof data === 'object' && (data as any).sheet) {
          setDraft(data as LabDraftPayload);
          return;
        }
      } catch {
        // ignore and fall back
      }
      if (!mounted) return;
      if (publishedViewSnapshot && (publishedViewSnapshot as any).sheet) {
        setDraft(publishedViewSnapshot);
      }
    })();

    prevEntryOpenRef.current = Boolean(entryOpen);
    return () => {
      mounted = false;
    };
  }, [entryOpen, isPublished, subjectId, assessmentKey, publishedViewSnapshot]);

  useEffect(() => {
    // While locked after publish, periodically check if IQAC updated the lock row.
    if (!subjectId) return;
    if (!isPublished) return;
    if (entryOpen) return;
    const tid = window.setInterval(() => {
      refreshMarkLock({ silent: true });
    }, 30000);
    return () => window.clearInterval(tid);
  }, [entryOpen, isPublished, subjectId, refreshMarkLock]);

  useEffect(() => {
    if (!viewMarksModalOpen) return;
    if (!subjectId) return;
    setPublishedViewSnapshot(null);
    refreshPublishedSnapshot(true);
  }, [viewMarksModalOpen, subjectId, assessmentKey]);

  // identity (S.No, RegNo, Name) + experiments + total(avg) + CIA exam + CO(A,B) mark/% + BTL mark/%
  const headerCols = 3 + totalExpCols + 1 + (ciaExamEnabled ? 1 : 0) + 4 + visibleBtlIndices.length * 2;

  const expMaxA = clampInt(Number(draft.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
  const expMaxB = clampInt(Number(draft.sheet.expMaxB ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
  const coMaxA = expMaxA + (ciaExamEnabled ? DEFAULT_CIA_EXAM_MAX / 2 : 0);
  const coMaxB = expMaxB + (ciaExamEnabled ? DEFAULT_CIA_EXAM_MAX / 2 : 0);
  const maxExpMax = Math.max(expMaxA, expMaxB, DEFAULT_EXPERIMENT_MAX);

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

  const minTableWidth = Math.max(920, 360 + (totalExpCols + visibleBtlIndices.length * 2 + (ciaExamEnabled ? 1 : 0)) * 80);

  const coEnableStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 8,
  };

  const bigCheckboxStyle: React.CSSProperties = {
    width: 20,
    height: 20,
    transform: 'scale(1.5)',
    accentColor: '#9a3412',
  };

  const glitchingAnimation = markManagerAnimating ? 'markManagerGlitch 2s ease-in-out' : undefined;

  const floatingPanelStyle: React.CSSProperties = {
    position: 'absolute',
    left: '40%',
    top: 18,
    zIndex: 40,
    width: 160,
    background: 'rgba(255,255,255,0.98)',
    border: '1px solid #e5e7eb',
    padding: 10,
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
    boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
    filter: 'none',
  };

  return (
    <div>
      <style>{`
        @keyframes markManagerGlitch {
          0%, 100% { transform: translate(0,0); filter: none; }
          10% { transform: translate(-2px, 1px); }
          20% { transform: translate(2px, -1px); }
          30% { transform: translate(-1px, -2px); }
          40% { transform: translate(1px, 2px); }
          50% { transform: translate(-2px, -1px); }
          60% { transform: translate(2px, 1px); }
          70% { transform: translate(-1px, 1px); }
          80% { transform: translate(1px, -1px); }
          90% { transform: translate(-1px, 0); }
        }
        @keyframes markManagerDust {
          0% { opacity: 0.9; transform: translate(0,0) scale(1); }
          100% { opacity: 0; transform: translate(80px, -40px) scale(0.6); }
        }
        .markManagerDustParticle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: #d1d5db;
          border-radius: 50%;
          animation: markManagerDust 2s ease-out forwards;
        }
      `}</style>

      <div
        style={{
          margin: '0 0 10px 0',
          maxWidth: Math.min(minTableWidth, 1100),
          width: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>COs enabled</div>
        <div
          style={{
            ...coEnableStyle,
            border: '1px solid #fcd34d',
            background: markManagerLocked ? '#f3f4f6' : '#fff7ed',
            padding: 12,
            borderRadius: 12,
            alignItems: 'stretch',
            animation: glitchingAnimation,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {markManagerAnimating ? (
            <>
              {Array.from({ length: 20 }, (_, i) => (
                <div
                  key={i}
                  className="markManagerDustParticle"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 1}s`,
                  }}
                />
              ))}
            </>
          ) : null}

          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardList size={18} color={markManagerLocked ? '#6b7280' : '#9a3412'} />
              <div style={{ fontWeight: 950, color: '#111827' }}>Mark Manager</div>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setMarkManagerModal({ mode: markManagerLocked ? 'request' : 'confirm' })}
                className="obe-btn obe-btn-success"
                disabled={!subjectId || markManagerBusy}
              >
                {markManagerLocked ? 'Edit' : 'Save'}
              </button>
            </div>
          </div>

          <div style={{ width: '100%', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, fontSize: 12, color: '#111827' }}>
              <input type="checkbox" checked={coAEnabled} disabled={markManagerLocked} onChange={(e) => setCoEnabled('A', e.target.checked)} style={bigCheckboxStyle} />
              CO-{coA}
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, fontSize: 12, color: '#111827' }}>
              <input type="checkbox" checked={coBEnabled} disabled={markManagerLocked} onChange={(e) => setCoEnabled('B', e.target.checked)} style={bigCheckboxStyle} />
              CO-{coB}
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, fontSize: 12, color: '#111827' }}>
              <input type="checkbox" checked={ciaExamEnabled} disabled={markManagerLocked} onChange={(e) => setCiaExamEnabled(e.target.checked)} style={bigCheckboxStyle} />
              CIA Exam
            </label>
          </div>

          <div style={{ width: '100%', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            {coAEnabled ? (
              <div style={{ width: 200 }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>No. of experiments (CO-{coA})</div>
                <input type="number" className="obe-input" value={expCountA} onChange={(e) => setExpCount('A', Number(e.target.value))} min={0} max={12} disabled={markManagerLocked} />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Max marks (per experiment)</div>
                <input type="number" className="obe-input" value={draft.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX} onChange={(e) => setExpMax('A', Number(e.target.value))} min={0} max={100} disabled={markManagerLocked} />
              </div>
            ) : null}
            {coBEnabled ? (
              <div style={{ width: 200 }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>No. of experiments (CO-{coB})</div>
                <input type="number" className="obe-input" value={expCountB} onChange={(e) => setExpCount('B', Number(e.target.value))} min={0} max={12} disabled={markManagerLocked} />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Max marks (per experiment)</div>
                <input type="number" className="obe-input" value={draft.sheet.expMaxB ?? DEFAULT_EXPERIMENT_MAX} onChange={(e) => setExpMax('B', Number(e.target.value))} min={0} max={100} disabled={markManagerLocked} />
              </div>
            ) : null}
          </div>
        </div>

        {markManagerError ? <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{markManagerError}</div> : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button
          onClick={saveNow}
          className="obe-btn obe-btn-success"
          disabled={savingDraft || !subjectId || tableBlocked}
          style={tableBlocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
        >
          {savingDraft ? 'Saving…' : 'Save Draft'}
        </button>
        <button
          onClick={resetSheet}
          className="obe-btn obe-btn-danger"
          disabled={!subjectId || tableBlocked}
          style={tableBlocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
        >
          Reset
        </button>
        <button
          onClick={publish}
          className="obe-btn obe-btn-primary"
          disabled={!subjectId || publishing || tableBlocked || globalLocked || !publishAllowed}
          style={tableBlocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : !publishAllowed ? 'Publish window closed' : globalLocked ? 'Publishing locked' : 'Publish'}
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>

        <div style={{ flex: 1 }} />
        {savedAt ? <div style={{ fontSize: 12, color: '#6b7280' }}>Saved: {savedAt}</div> : null}
        {publishedAt ? <div style={{ fontSize: 12, color: '#6b7280' }}>Published: {publishedAt}</div> : null}
        {remainingSeconds != null && !publishAllowed ? <div style={{ fontSize: 12, color: '#6b7280' }}>Opens in: {formatRemaining(remainingSeconds)}</div> : null}
      </div>

      {error && <div style={{ marginBottom: 10, color: '#b91c1c' }}>{error}</div>}
      {loading ? (
        <div style={{ color: '#6b7280' }}>Loading roster…</div>
      ) : students.length === 0 ? (
        <div style={{ color: '#6b7280' }}>Select a Teaching Assignment to load students.</div>
      ) : (
        <div style={cardStyle}>
          <PublishLockOverlay locked={globalLocked}>
            <div style={{ position: 'relative' }}>
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
                {ciaExamEnabled ? <th style={cellTh} rowSpan={5}>CIA Exam</th> : null}
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
                    {Array.from({ length: visibleExpCountA }, (_, i) => (
                      <th key={`max_a_${i}`} style={cellTh}>{expMaxA}</th>
                    ))}
                    {Array.from({ length: visibleExpCountB }, (_, i) => (
                      <th key={`max_b_${i}`} style={cellTh}>{expMaxB}</th>
                    ))}
                  </>
                )}

                <th style={cellTh}>{coMaxA}</th>
                <th style={cellTh}>%</th>
                <th style={cellTh}>{coMaxB}</th>
                <th style={cellTh}>%</th>
                {visibleBtlIndices.map((n) => (
                  <React.Fragment key={`btlmax_${n}`}>
                    <th style={cellTh}>{maxExpMax}</th>
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
                              disabled={publishedEditLocked || globalLocked}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                opacity: 0,
                                cursor: markManagerLocked ? 'not-allowed' : 'pointer',
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
                              disabled={publishedEditLocked || globalLocked}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                opacity: 0,
                                cursor: markManagerLocked ? 'not-allowed' : 'pointer',
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
              {publishedEditLocked ? (
                <tr>
                  <td colSpan={headerCols} style={{ padding: 14, textAlign: 'center', color: '#065f46', fontWeight: 900 }}>
                    Published — students hidden
                  </td>
                </tr>
              ) : (
                <>
                  {students.map((s, idx) => {
                    const row = draft.sheet.rowsByStudentId?.[String(s.id)];
                    const marksA = normalizeMarksArray((row as any)?.marksA, expCountA);
                    const marksB = normalizeMarksArray((row as any)?.marksB, expCountB);
                    const ciaExamRaw = (row as any)?.ciaExam;
                    const ciaExamNum = ciaExamEnabled && typeof ciaExamRaw === 'number' && Number.isFinite(ciaExamRaw) ? ciaExamRaw : null;

                    const visibleMarksA = marksA.slice(0, visibleExpCountA);
                    const visibleMarksB = marksB.slice(0, visibleExpCountB);
                    const allVisibleMarks = visibleMarksA.concat(visibleMarksB);

                    const visibleBtlsA = normalizeBtlArray((draft.sheet as any).btlsA, expCountA).slice(0, visibleExpCountA);
                    const visibleBtlsB = normalizeBtlArray((draft.sheet as any).btlsB, expCountB).slice(0, visibleExpCountB);

                    const avgTotal = avgMarks(allVisibleMarks);
                    const avgA = avgMarks(visibleMarksA);
                    const avgB = avgMarks(visibleMarksB);

                    const coAMarkNum =
                      avgA == null && avgTotal == null && (!ciaExamEnabled || ciaExamNum == null)
                        ? null
                        : (avgA ?? 0) + (ciaExamEnabled ? (ciaExamNum ?? 0) / 2 : 0);
                    const coBMarkNum =
                      avgB == null && avgTotal == null && (!ciaExamEnabled || ciaExamNum == null)
                        ? null
                        : (avgB ?? 0) + (ciaExamEnabled ? (ciaExamNum ?? 0) / 2 : 0);

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
                                disabled={tableBlocked}
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
                                disabled={tableBlocked}
                            />
                          </td>
                        ))}

                        <td style={{ ...cellTd, textAlign: 'right', fontWeight: 800 }}>{avgTotal == null ? '' : avgTotal.toFixed(1)}</td>
                        {ciaExamEnabled ? (
                          <td style={{ ...cellTd, width: 90, minWidth: 90, background: '#fff7ed' }}>
                            <input
                              type="number"
                              value={(row as any)?.ciaExam ?? ''}
                              onChange={(e) => setCiaExam(s.id, e.target.value === '' ? '' : Number(e.target.value))}
                              style={inputStyle}
                              min={0}
                              max={Math.max(expMaxA, expMaxB, DEFAULT_CIA_EXAM_MAX)}
                              disabled={tableBlocked}
                            />
                          </td>
                        ) : null}
                        <td style={{ ...cellTd, textAlign: 'right' }}>{coAMarkNum == null ? '' : coAMarkNum.toFixed(1)}</td>
                        <td style={{ ...cellTd, textAlign: 'right' }}>{pct(coAMarkNum, coMaxA)}</td>
                        <td style={{ ...cellTd, textAlign: 'right' }}>{coBMarkNum == null ? '' : coBMarkNum.toFixed(1)}</td>
                        <td style={{ ...cellTd, textAlign: 'right' }}>{pct(coBMarkNum, coMaxB)}</td>
                        {visibleBtlIndices.map((n) => {
                          const m = btlAvgByIndex[n] ?? null;
                          const maxExpMax = Math.max(expMaxA, expMaxB, DEFAULT_EXPERIMENT_MAX);
                          return (
                            <React.Fragment key={`btlcell_${s.id}_${n}`}>
                              <td style={{ ...cellTd, textAlign: 'right' }}>{m == null ? '' : m.toFixed(1)}</td>
                              <td style={{ ...cellTd, textAlign: 'right' }}>{pct(m, maxExpMax)}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={headerCols} style={{ padding: 10, color: '#6b7280' }}>
                        No students.
                      </td>
                    </tr>
                  ) : null}
                </>
              )}
            </tbody>
                </table>
              </div>

              {/* Blue overlay when blocked by Mark Manager (after Save/confirmation) */}
              {markManagerLocked ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 30,
                    // Do not block interaction with header controls like BTL selection.
                    pointerEvents: 'none',
                    background: 'linear-gradient(180deg, rgba(72, 113, 195, 0.18) 0%, rgba(51, 55, 64, 0.22) 100%)',
                  }}
                />
              ) : null}

              {/* Green overlay when blocked after Publish */}
              {publishedEditLocked ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 30,
                    pointerEvents: 'auto',
                    background: 'linear-gradient(180deg, rgba(34,197,94,0.28) 0%, rgba(16,185,129,0.36) 100%)',
                  }}
                />
              ) : null}

              {/* Floating panel when blocked by Mark Manager */}
              {!markManagerLocked ? (
                <div style={floatingPanelStyle}>
                  <div style={{ width: 100, height: 72, display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 8 }}>
                    <img
                      src={'https://media.lordicon.com/icons/wired/flat/94-lock-unlock.gif'}
                      alt="locked"
                      style={{ maxWidth: 72, maxHeight: 72, display: 'block' }}
                    />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#111827' }}>Table Locked</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>Confirm the Mark Manager</div>
                  </div>
                </div>
              ) : null}

              {/* Floating panel when blocked after Publish */}
              {publishedEditLocked ? (
                <div style={floatingPanelStyle}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 900, color: '#065f46' }}>Published</div>
                    <div style={{ fontSize: 13, color: '#065f46' }}>Marks are locked. Request IQAC approval to edit.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button type="button" className="obe-btn" onClick={() => setViewMarksModalOpen(true)}>
                      View Marks
                    </button>
                    <button
                      type="button"
                      className="obe-btn obe-btn-success"
                      onClick={() => {
                        setPublishedEditModalOpen(true);
                      }}
                    >
                      Edit
                    </button>
                  </div>

                  <div
                    style={{
                      width: 170,
                      height: 92,
                      display: 'grid',
                      placeItems: 'center',
                      background: '#fff',
                      borderRadius: 10,
                      border: '1px solid rgba(2,6,23,0.08)',
                    }}
                  >
                    <img
                      src={new URL('../../assets/gif/lockong.png', import.meta.url).toString()}
                      alt="locked"
                      style={{ maxWidth: 150, maxHeight: 80, display: 'block' }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).onerror = null;
                        (e.currentTarget as HTMLImageElement).src = lockPanelGif;
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </PublishLockOverlay>
        </div>
      )}

            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {savedAt ? (
                <div>
                  Draft saved: {savedAt}
                  {savedBy ? <span style={{ marginLeft: 8, color: '#374151' }}>by <strong>{savedBy}</strong></span> : null}
                </div>
              ) : null}
              {publishedAt ? <div>Last published: {publishedAt}</div> : null}
            </div>

      {publishedEditModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 60,
          }}
          onClick={() => setPublishedEditModalOpen(false)}
        >
          <div
            style={{
              width: 'min(560px, 96vw)',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>Edit Request</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{String(assessmentKey).toUpperCase()} LAB</div>
            </div>

            <div style={{ fontSize: 13, color: '#374151', marginBottom: 10, lineHeight: 1.35 }}>
              <div>
                <strong>Subject:</strong> {label}
              </div>
              <div>
                <strong>Code:</strong> {String(subjectId || '—')}
              </div>
              <div>
                <strong>Published:</strong> {publishedAt || '—'}
              </div>
              <div>
                <strong>Saved:</strong> {savedAt || '—'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="obe-btn" onClick={() => setPublishedEditModalOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className="obe-btn obe-btn-primary"
                onClick={async () => {
                  if (!subjectId) return;
                  try {
                    await createEditRequest({
                      assessment: assessmentKey as any,
                      subject_code: String(subjectId),
                      scope: 'MARK_ENTRY',
                      reason: `Edit request: Marks entry for ${label}`,
                      teaching_assignment_id: teachingAssignmentId,
                    });
                    alert('Edit request sent to IQAC.');
                    setPublishedEditModalOpen(false);
                    refreshMarkLock({ silent: true });
                  } catch (e: any) {
                    alert(e?.message || 'Request failed');
                  }
                }}
              >
                Request Edit
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {markManagerModal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => {
            if (markManagerBusy) return;
            setMarkManagerModal(null);
          }}
        >
          <div
            style={{
              width: 'min(760px, 96vw)',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>
                {markManagerModal.mode === 'confirm' ? `Confirmation - ${label}` : `Request Edit - ${label}`}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{String(assessmentKey).toUpperCase()}</div>
            </div>

            {markManagerModal.mode === 'confirm' ? (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  Confirm the selected COs and settings. After confirming, Mark Manager will be locked.
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        <th style={{ textAlign: 'left', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>Item</th>
                        <th style={{ textAlign: 'right', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>Experiments</th>
                        <th style={{ textAlign: 'right', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>Max marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coAEnabled ? (
                        <tr>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-{coA}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{visibleExpCountA}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{expMaxA}</td>
                        </tr>
                      ) : null}
                      {coBEnabled ? (
                        <tr>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-{coB}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{visibleExpCountB}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{expMaxB}</td>
                        </tr>
                      ) : null}
                      {!coAEnabled && !coBEnabled ? (
                        <tr>
                          <td colSpan={3} style={{ padding: 10, color: '#6b7280' }}>
                            No COs selected.
                          </td>
                        </tr>
                      ) : null}
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CIA Exam</td>
                        <td colSpan={2} style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                          {ciaExamEnabled ? 'Enabled' : 'Disabled'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                This will send an edit request to IQAC. Mark Manager will remain locked until IQAC approves.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="obe-btn" disabled={markManagerBusy} onClick={() => setMarkManagerModal(null)}>
                Cancel
              </button>
              <button
                className="obe-btn obe-btn-success"
                disabled={markManagerBusy || !subjectId}
                onClick={async () => {
                  if (!subjectId) return;
                  if (markManagerModal.mode === 'request') {
                    setMarkManagerModal(null);
                    await requestMarkManagerEdit();
                    return;
                  }

                  setMarkManagerBusy(true);
                  setMarkManagerError(null);
                  try {
                    const snapshot = markManagerSnapshotOf(draft.sheet);
                    const approvalUntil = markManagerEditWindow?.approval_until
                      ? String(markManagerEditWindow.approval_until)
                      : draft.sheet.markManagerApprovalUntil || null;

                    const nextDraft: LabDraftPayload = {
                      ...draft,
                      sheet: {
                        ...draft.sheet,
                        markManagerLocked: true,
                        markManagerSnapshot: snapshot,
                        markManagerApprovalUntil: approvalUntil,
                      },
                    };

                    setDraft(nextDraft);
                    setMarkManagerModal(null);
                    setMarkManagerAnimating(true);

                    await saveDraft(assessmentKey, String(subjectId), nextDraft);
                    setSavedAt(new Date().toLocaleString());

                    // Persist Mark Manager confirmation to server lock row so the
                    // Mark Manager snapshot is updated and visible across tabs.
                    try {
                      await confirmMarkManagerLock(assessmentKey as any, String(subjectId), teachingAssignmentId);
                      refreshMarkLock({ silent: true });
                    } catch (err) {
                      console.warn('confirmMarkManagerLock failed', err);
                    }
                  } catch (e: any) {
                    setMarkManagerError(e?.message || 'Save failed');
                  } finally {
                    setMarkManagerBusy(false);
                    setTimeout(() => setMarkManagerAnimating(false), 2000);
                  }
                }}
              >
                {markManagerModal.mode === 'confirm' ? 'Confirm' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewMarksModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 70,
          }}
          onClick={() => setViewMarksModalOpen(false)}
        >
          <div
            style={{
              width: 'min(1100px, 96vw)',
              maxHeight: 'min(80vh, 900px)',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>View Marks</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{String(assessmentKey).toUpperCase()} LAB</div>
            </div>

            {publishedViewLoading ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading published marks…</div> : null}
            {publishedViewError ? (
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
                {publishedViewError}
              </div>
            ) : null}

            {(() => {
              const viewSheet = (publishedViewSnapshot && (publishedViewSnapshot as any).sheet) ? (publishedViewSnapshot as any).sheet : draft.sheet;
              const viewCiaEnabled = (viewSheet as any).ciaExamEnabled !== false;

              const viewExpA = clampInt(Number((viewSheet as any).expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
              const viewExpB = clampInt(Number((viewSheet as any).expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
              const viewCoAEnabled = Boolean((viewSheet as any).coAEnabled);
              const viewCoBEnabled = Boolean((viewSheet as any).coBEnabled);
              const viewVisibleExpA = viewCoAEnabled ? viewExpA : 0;
              const viewVisibleExpB = viewCoBEnabled ? viewExpB : 0;
              const viewTotalExp = viewVisibleExpA + viewVisibleExpB;

              const viewVisibleBtlsA = normalizeBtlArray((viewSheet as any).btlsA, viewExpA).slice(0, viewVisibleExpA);
              const viewVisibleBtlsB = normalizeBtlArray((viewSheet as any).btlsB, viewExpB).slice(0, viewVisibleExpB);
              const btlSet = new Set<number>();
              for (const v of viewVisibleBtlsA) btlSet.add(v);
              for (const v of viewVisibleBtlsB) btlSet.add(v);
              const viewBtls = [1, 2, 3, 4, 5, 6].filter((n) => btlSet.has(n));

              const viewExpMaxA = clampInt(Number((viewSheet as any).expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
              const viewExpMaxB = clampInt(Number((viewSheet as any).expMaxB ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
              const viewCoMaxA = viewExpMaxA + (viewCiaEnabled ? DEFAULT_CIA_EXAM_MAX / 2 : 0);
              const viewCoMaxB = viewExpMaxB + (viewCiaEnabled ? DEFAULT_CIA_EXAM_MAX / 2 : 0);
              const viewMaxExp = Math.max(viewExpMaxA, viewExpMaxB, DEFAULT_EXPERIMENT_MAX);
              const viewHeaderCols = 3 + viewTotalExp + 1 + (viewCiaEnabled ? 1 : 0) + 4 + viewBtls.length * 2;
              const viewMinWidth = Math.max(920, 360 + (viewTotalExp + viewBtls.length * 2 + (viewCiaEnabled ? 1 : 0)) * 80);

              return (
                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <table className="obe-table" style={{ width: 'max-content', minWidth: viewMinWidth, tableLayout: 'auto', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={cellTh} colSpan={viewHeaderCols}>
                          {label}
                        </th>
                      </tr>
                      <tr>
                        <th style={cellTh} rowSpan={5}>S.No</th>
                        <th style={cellTh} rowSpan={5}>Register No.</th>
                        <th style={cellTh} rowSpan={5}>Name of the Students</th>
                        <th style={cellTh} colSpan={Math.max(1, viewTotalExp)}>Experiments</th>
                        <th style={cellTh} rowSpan={5}>Total (Avg)</th>
                        {viewCiaEnabled ? <th style={cellTh} rowSpan={5}>CIA Exam</th> : null}
                        <th style={cellTh} colSpan={4}>CO ATTAINMENT</th>
                        {viewBtls.length ? <th style={cellTh} colSpan={viewBtls.length * 2}>BTL ATTAINMENT</th> : null}
                      </tr>
                      <tr>
                        {viewTotalExp === 0 ? (
                          <th style={cellTh}>—</th>
                        ) : (
                          <>
                            {Array.from({ length: viewVisibleExpA }, (_, i) => (
                              <th key={`v_coa_${i}`} style={cellTh}>{coA}</th>
                            ))}
                            {Array.from({ length: viewVisibleExpB }, (_, i) => (
                              <th key={`v_cob_${i}`} style={cellTh}>{coB}</th>
                            ))}
                          </>
                        )}
                        <th style={cellTh} colSpan={2}>CO-{coA}</th>
                        <th style={cellTh} colSpan={2}>CO-{coB}</th>
                        {viewBtls.map((n) => (
                          <th key={`v_btl_${n}`} style={cellTh} colSpan={2}>BTL-{n}</th>
                        ))}
                      </tr>
                      <tr>
                        {viewTotalExp === 0 ? (
                          <th style={cellTh}>—</th>
                        ) : (
                          <>
                            {Array.from({ length: viewTotalExp }, (_, i) => (
                              <th key={`v_max_${i}`} style={cellTh}>{viewMaxExp}</th>
                            ))}
                          </>
                        )}
                        <th style={cellTh}>{viewCoMaxA}</th>
                        <th style={cellTh}>%</th>
                        <th style={cellTh}>{viewCoMaxB}</th>
                        <th style={cellTh}>%</th>
                        {viewBtls.map((n) => (
                          <React.Fragment key={`v_btlmax_${n}`}>
                            <th style={cellTh}>{viewMaxExp}</th>
                            <th style={cellTh}>%</th>
                          </React.Fragment>
                        ))}
                      </tr>
                      <tr>
                        {viewTotalExp === 0 ? (
                          <th style={cellTh}>No experiments</th>
                        ) : (
                          <>
                            {Array.from({ length: viewVisibleExpA }, (_, i) => (
                              <th key={`v_ea_${i}`} style={cellTh}>E{i + 1}</th>
                            ))}
                            {Array.from({ length: viewVisibleExpB }, (_, i) => (
                              <th key={`v_eb_${i}`} style={cellTh}>E{i + 1}</th>
                            ))}
                          </>
                        )}
                        <th style={cellTh} colSpan={4 + viewBtls.length * 2} />
                      </tr>
                      <tr>
                        {viewTotalExp === 0 ? (
                          <th style={cellTh}>BTL</th>
                        ) : (
                          <>
                            {Array.from({ length: viewVisibleExpA }, (_, i) => (
                              <th key={`v_btla_${i}`} style={cellTh}>{viewVisibleBtlsA[i] ?? 1}</th>
                            ))}
                            {Array.from({ length: viewVisibleExpB }, (_, i) => (
                              <th key={`v_btlb_${i}`} style={cellTh}>{viewVisibleBtlsB[i] ?? 1}</th>
                            ))}
                          </>
                        )}
                        <th style={cellTh} colSpan={4 + viewBtls.length * 2} />
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, idx) => {
                        const row = (viewSheet as any)?.rowsByStudentId?.[String(s.id)];
                        const marksA = normalizeMarksArray((row as any)?.marksA, viewExpA).slice(0, viewVisibleExpA);
                        const marksB = normalizeMarksArray((row as any)?.marksB, viewExpB).slice(0, viewVisibleExpB);
                        const allVisible = marksA.concat(marksB);
                        const avgTotal = avgMarks(allVisible);
                        const avgA = avgMarks(marksA);
                        const avgB = avgMarks(marksB);
                        const ciaRaw = (row as any)?.ciaExam;
                        const ciaNum = viewCiaEnabled && typeof ciaRaw === 'number' && Number.isFinite(ciaRaw) ? ciaRaw : null;

                        const coAMarkNum =
                          avgA == null && avgTotal == null && (!viewCiaEnabled || ciaNum == null)
                            ? null
                            : (avgA ?? 0) + (viewCiaEnabled ? (ciaNum ?? 0) / 2 : 0);
                        const coBMarkNum =
                          avgB == null && avgTotal == null && (!viewCiaEnabled || ciaNum == null)
                            ? null
                            : (avgB ?? 0) + (viewCiaEnabled ? (ciaNum ?? 0) / 2 : 0);

                        const btlAvgByIndex: Record<number, number | null> = {};
                        for (const n of viewBtls) {
                          const marks: number[] = [];
                          for (let i = 0; i < marksA.length; i++) {
                            if (viewVisibleBtlsA[i] === n) {
                              const v = marksA[i];
                              if (typeof v === 'number' && Number.isFinite(v)) marks.push(v);
                            }
                          }
                          for (let i = 0; i < marksB.length; i++) {
                            if (viewVisibleBtlsB[i] === n) {
                              const v = marksB[i];
                              if (typeof v === 'number' && Number.isFinite(v)) marks.push(v);
                            }
                          }
                          btlAvgByIndex[n] = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
                        }

                        return (
                          <tr key={`v_${s.id}`}>
                            <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42 }}>{idx + 1}</td>
                            <td style={cellTd}>{s.reg_no}</td>
                            <td style={cellTd}>{s.name}</td>

                            {viewTotalExp === 0 ? (
                              <td style={{ ...cellTd, textAlign: 'center', color: '#6b7280' }}>—</td>
                            ) : (
                              <>
                                {Array.from({ length: viewVisibleExpA }, (_, i) => (
                                  <td key={`v_ma_${s.id}_${i}`} style={{ ...cellTd, width: 78, minWidth: 78, background: '#fff7ed', textAlign: 'center', fontWeight: 800 }}>
                                    {marksA[i] ?? ''}
                                  </td>
                                ))}
                                {Array.from({ length: viewVisibleExpB }, (_, i) => (
                                  <td key={`v_mb_${s.id}_${i}`} style={{ ...cellTd, width: 78, minWidth: 78, background: '#fff7ed', textAlign: 'center', fontWeight: 800 }}>
                                    {marksB[i] ?? ''}
                                  </td>
                                ))}
                              </>
                            )}

                            <td style={{ ...cellTd, textAlign: 'right', fontWeight: 800 }}>{avgTotal == null ? '' : avgTotal.toFixed(1)}</td>
                            {viewCiaEnabled ? (
                              <td style={{ ...cellTd, width: 90, minWidth: 90, background: '#fff7ed', textAlign: 'center', fontWeight: 800 }}>
                                {(row as any)?.ciaExam ?? ''}
                              </td>
                            ) : null}

                            <td style={{ ...cellTd, textAlign: 'right' }}>{coAMarkNum == null ? '' : coAMarkNum.toFixed(1)}</td>
                            <td style={{ ...cellTd, textAlign: 'right' }}>{pct(coAMarkNum, viewCoMaxA)}</td>
                            <td style={{ ...cellTd, textAlign: 'right' }}>{coBMarkNum == null ? '' : coBMarkNum.toFixed(1)}</td>
                            <td style={{ ...cellTd, textAlign: 'right' }}>{pct(coBMarkNum, viewCoMaxB)}</td>

                            {viewBtls.map((n) => {
                              const m = btlAvgByIndex[n] ?? null;
                              return (
                                <React.Fragment key={`v_btl_${s.id}_${n}`}>
                                  <td style={{ ...cellTd, textAlign: 'right' }}>{m == null ? '' : m.toFixed(1)}</td>
                                  <td style={{ ...cellTd, textAlign: 'right' }}>{pct(m, viewMaxExp)}</td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {students.length === 0 ? (
                        <tr>
                          <td colSpan={viewHeaderCols} style={{ padding: 10, color: '#6b7280' }}>
                            No students.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="obe-btn" onClick={() => setViewMarksModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
