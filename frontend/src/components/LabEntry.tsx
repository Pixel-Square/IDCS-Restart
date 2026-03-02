import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import fetchWithAuth from '../services/fetchAuth';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import {
  confirmMarkManagerLock,
  createEditRequest,
  createPublishRequest,
  fetchDraft,
  fetchPublishedLabSheet,
  formatApiErrorMessage,
  formatEditRequestSentMessage,
  publishLabSheet,
  saveDraft,
} from '../services/obe';
import { ensureMobileVerified } from '../services/auth';
import { useEditWindow } from '../hooks/useEditWindow';
import { formatRemaining, usePublishWindow } from '../hooks/usePublishWindow';
import { useMarkTableLock } from '../hooks/useMarkTableLock';
import { useEditRequestPending } from '../hooks/useEditRequestPending';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import PublishLockOverlay from './PublishLockOverlay';
import AssessmentContainer from './containers/AssessmentContainer';
import { ModalPortal } from './ModalPortal';


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
  marksByCo?: Record<string, Array<number | ''>>;
  ciaExam?: number | '';
  caaExamByCo?: Record<string, number | ''>;
};

type CoConfig = {
  enabled: boolean;
  expCount: number;
  expMax: number;
  btl: Array<1 | 2 | 3 | 4 | 5 | 6>;
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
  coConfigs?: Record<string, CoConfig>;
  rowsByStudentId: Record<string, LabRowState>;

  // Mark Manager lock state
  markManagerLocked?: boolean;
  markManagerSnapshot?: string | null;
  markManagerApprovalUntil?: string | null;
};

type LabDraftPayload = {
  sheet: LabSheet;
};

type CoMeta = {
  coNumber: number;
  expCount: number;
  expMax: number;
  btl: Array<1 | 2 | 3 | 4 | 5 | 6>;
};

type Props = {
  subjectId?: string | null;
  teachingAssignmentId?: number;
  assessmentKey: 'formative1' | 'formative2' | 'review1' | 'review2';
  label: string;
  coA: number;
  coB: number;
  allCos?: number[];
  showCia1Embed?: boolean;
  cia1Embed?: React.ReactNode;
  tcprMode?: boolean;
};

const DEFAULT_EXPERIMENTS = 5;
const DEFAULT_EXPERIMENT_MAX = 25;
const DEFAULT_CIA_EXAM_MAX = 30;
const LAB_REVIEW_EXPERIMENT_WEIGHT: Record<number, number> = { 1: 9, 2: 9, 3: 4.5, 4: 9, 5: 9 };
const LAB_REVIEW_CAA_WEIGHT: Record<number, number> = { 1: 3, 2: 3, 3: 1.5, 4: 3, 5: 3 };
const LAB_REVIEW_CAA_RAW_MAX: Record<number, number> = { 1: 20, 2: 20, 3: 10, 4: 20, 5: 20 };
const LAB_REVIEW_CO_MAX: Record<number, number> = { 1: 12, 2: 12, 3: 6, 4: 12, 5: 12 };

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

function storageKey(assessmentKey: 'formative1' | 'formative2' | 'review1' | 'review2', subjectId: string) {
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

function normalizeCaaByCo(raw: unknown): Record<string, number | ''> {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number | ''> = {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v === '' || v == null) {
      out[k] = '';
      continue;
    }
    const n = typeof v === 'number' ? v : Number(v);
    out[k] = Number.isFinite(n) ? n : '';
  }
  return out;
}

function pct(mark: number | null, max: number): string {
  if (mark == null) return '';
  if (!Number.isFinite(max) || max <= 0) return '0';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
}

function buildCoConfigs(sheet: LabSheet, allCos: number[], coA: number, coB: number): Record<string, CoConfig> {
  const existing = (sheet.coConfigs && typeof sheet.coConfigs === 'object') ? sheet.coConfigs as Record<string, any> : {};
  const out: Record<string, CoConfig> = {};
  for (const n of allCos) {
    const k = String(n);
    const cur = existing[k];
    if (cur && typeof cur === 'object' && 'enabled' in cur) {
      const expCount = clampInt(Number(cur.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
      out[k] = {
        enabled: Boolean(cur.enabled),
        expCount,
        expMax: clampInt(Number(cur.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100),
        btl: normalizeBtlArray(cur.btl, expCount),
      };
    } else if (n === coA) {
      const expCount = clampInt(Number((sheet as any).expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      out[k] = {
        enabled: Boolean((sheet as any).coAEnabled ?? true),
        expCount,
        expMax: clampInt(Number((sheet as any).expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100),
        btl: normalizeBtlArray((sheet as any).btlsA, expCount),
      };
    } else if (n === coB) {
      const expCount = clampInt(Number((sheet as any).expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
      out[k] = {
        enabled: Boolean((sheet as any).coBEnabled ?? true),
        expCount,
        expMax: clampInt(Number((sheet as any).expMaxB ?? DEFAULT_EXPERIMENT_MAX), 0, 100),
        btl: normalizeBtlArray((sheet as any).btlsB, expCount),
      };
    } else {
      out[k] = {
        enabled: false,
        expCount: DEFAULT_EXPERIMENTS,
        expMax: DEFAULT_EXPERIMENT_MAX,
        btl: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1 as const),
      };
    }
  }
  return out;
}

function getRowMarksForCo(row: any, coNumber: number, expCount: number, coA: number, coB: number): Array<number | ''> {
  const marksByCo = row?.marksByCo;
  if (marksByCo && typeof marksByCo === 'object') {
    const byCo = (marksByCo as any)[String(coNumber)];
    if (Array.isArray(byCo)) return normalizeMarksArray(byCo, expCount);
  }
  if (coNumber === coA) return normalizeMarksArray(row?.marksA, expCount);
  if (coNumber === coB) return normalizeMarksArray(row?.marksB, expCount);
  return Array.from({ length: expCount }, () => '' as const);
}

export default function LabEntry({
  subjectId,
  teachingAssignmentId,
  assessmentKey,
  label,
  coA,
  coB,
  allCos,
  showCia1Embed,
  cia1Embed,
}: Props) {
  const reviewFixedTable = assessmentKey === 'review1' || assessmentKey === 'review2';

  // `selectableCosArr` controls what we render in Mark Manager.
  // For Review 1/Review 2, we want CO1..CO5 checkboxes visible.
  const selectableCosArr = useMemo(() => (allCos && allCos.length > 0 ? allCos : [coA, coB]), [allCos, coA, coB]);

  // `tableCosArr` controls what the table is allowed to render.
  // Per requirement: Review pages should NOT change the table layout.
  const tableCosArr = useMemo(() => (reviewFixedTable ? [coA, coB] : selectableCosArr), [reviewFixedTable, selectableCosArr, coA, coB]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [masterCfg, setMasterCfg] = useState<any>(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const draftLoadedRef = React.useRef(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishedEditModalOpen, setPublishedEditModalOpen] = useState(false);
  const [editRequestReason, setEditRequestReason] = useState('');
  const [editRequestBusy, setEditRequestBusy] = useState(false);
  const [editRequestError, setEditRequestError] = useState<string | null>(null);
  const [viewMarksModalOpen, setViewMarksModalOpen] = useState(false);
  const [publishedViewSnapshot, setPublishedViewSnapshot] = useState<LabDraftPayload | null>(null);
  const [publishedViewLoading, setPublishedViewLoading] = useState(false);
  const [publishedViewError, setPublishedViewError] = useState<string | null>(null);

  const [markManagerModal, setMarkManagerModal] = useState<null | { mode: 'confirm' | 'request' }>(null);
  const [markManagerBusy, setMarkManagerBusy] = useState(false);

  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
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
    loading: publishWindowLoading,
    error: publishWindowError,
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

  // Published state should come from the DB lock row, not from the published snapshot
  // (the snapshot endpoint can return empty objects even when not published).
  const isPublished = Boolean(publishedAt) || Boolean(markLock?.exists && markLock?.is_published);
  // Authoritative: backend computes `entry_open` from mark_entry_blocked + mark_manager_locked/unlock windows.
  // If we don't have a lock row yet, treat entry as open (table is hidden until Mark Manager is confirmed anyway).
  const entryOpen = markLock?.exists ? Boolean(markLock?.entry_open) : true;
  const publishedEditLocked = Boolean(isPublished && !entryOpen);

  // Restore publishedAt from backend when markLock indicates the table was published.
  // Avoid gating on `!publishedAt` so it still updates after refresh/poll.
  useEffect(() => {
    if (!markLock?.is_published || !markLock?.updated_at) return;
    let next: string;
    try {
      next = new Date(String(markLock.updated_at)).toLocaleString();
    } catch {
      next = String(markLock.updated_at);
    }
    if (next !== (publishedAt || '')) setPublishedAt(next);
  }, [markLock?.is_published, markLock?.updated_at, publishedAt]);

  const {
    pending: markEntryReqPending,
    pendingUntilMs: markEntryReqPendingUntilMs,
    setPendingUntilMs: setMarkEntryReqPendingUntilMs,
    refresh: refreshMarkEntryReqPending,
  } = useEditRequestPending({
    enabled: Boolean(isPublished && publishedEditLocked) && Boolean(subjectId),
    assessment: assessmentKey as any,
    subjectCode: subjectId ? String(subjectId) : null,
    scope: 'MARK_ENTRY',
    teachingAssignmentId,
  });

  useLockBodyScroll(Boolean(publishedEditModalOpen) || Boolean(markManagerModal) || Boolean(viewMarksModalOpen));

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
    draftLoadedRef.current = false;
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
          const normalizedRows: Record<string, LabRowState> = {};
          const rawRows = (d.sheet as any).rowsByStudentId && typeof (d.sheet as any).rowsByStudentId === 'object' ? (d.sheet as any).rowsByStudentId : {};
          for (const [sid, row0] of Object.entries(rawRows)) {
            const row: any = row0 && typeof row0 === 'object' ? row0 : {};
            const marksA = normalizeMarksArray(row.marksA, expCountA);
            const marksB = normalizeMarksArray(row.marksB, expCountB);
            const rawCia = row.ciaExam;
            const ciaParsed = rawCia === '' || rawCia == null ? '' : Number(rawCia);
            const ciaExam = ciaParsed === '' ? '' : Number.isFinite(ciaParsed) ? ciaParsed : '';
            normalizedRows[String(sid)] = {
              ...row,
              studentId: Number.isFinite(Number(row.studentId)) ? Number(row.studentId) : Number(sid),
              marksA,
              marksB,
              ciaExam,
              caaExamByCo: normalizeCaaByCo(row.caaExamByCo),
            };
          }

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
              rowsByStudentId: normalizedRows,
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

          // If the saved draft has no actual marks but we have a published snapshot, prefer the snapshot.
          // This handles the case where autosave saved an empty draft after publish.
          const hasAnyMarks = Object.values(normalizedRows).some((row: LabRowState) => {
            const aHas = row.marksA?.some((v) => v !== '' && v != null);
            const bHas = row.marksB?.some((v) => v !== '' && v != null);
            return aHas || bHas || (row.ciaExam !== '' && row.ciaExam != null);
          });
          if (!hasAnyMarks && Object.keys(normalizedRows).length > 0) {
            // Draft has students but no marks — try to restore from published snapshot
            try {
              const pubResp = await fetchPublishedLabSheet(assessmentKey as any, String(subjectId), teachingAssignmentId);
              const pubData = (pubResp as any)?.data ?? null;
              if (mounted && pubData && typeof pubData === 'object' && (pubData as any).sheet) {
                const pubSheet = (pubData as any).sheet;
                const pubRows = pubSheet.rowsByStudentId && typeof pubSheet.rowsByStudentId === 'object' ? pubSheet.rowsByStudentId : {};
                const pubHasMarks = Object.values(pubRows).some((row: any) => {
                  return row?.marksA?.some((v: any) => v !== '' && v != null) || row?.marksB?.some((v: any) => v !== '' && v != null) || (row?.ciaExam !== '' && row?.ciaExam != null);
                });
                if (pubHasMarks) {
                  setDraft(pubData as LabDraftPayload);
                }
              }
            } catch {
              // ignore — keep empty draft
            }
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
      if (mounted) draftLoadedRef.current = true;
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
            caaExamByCo: {},
            ciaExam: '',
          };
        } else {
          const marksA = normalizeMarksArray((existing as any).marksA, expCountA);
          const marksB = normalizeMarksArray((existing as any).marksB, expCountB);
          const rawCia = (existing as any).ciaExam;
          const ciaParsed = rawCia === '' || rawCia == null ? '' : Number(rawCia);
          const ciaExam = ciaParsed === '' ? '' : Number.isFinite(ciaParsed) ? ciaParsed : '';
          const caaExamByCo = normalizeCaaByCo((existing as any).caaExamByCo);
          rowsByStudentId[k] = { ...existing, marksA, marksB, ciaExam, caaExamByCo };
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

    // Source of truth: if a DB lock row exists, mirror its state.
    // This ensures "Save & Lock" persists immediately and across reloads.
    if (markLock?.exists) {
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
      // New approval window: unlock so user can edit Mark Manager.
      if (lastApprovalUntil !== approvalUntil) {
        setDraft((p) => ({
          ...p,
          sheet: { ...p.sheet, markManagerLocked: false, markManagerApprovalUntil: approvalUntil },
        }));
      }
      return;
    }
  }, [
    subjectId,
    markLock?.exists,
    markLock?.mark_manager_locked,
    markManagerEditWindow?.allowed_by_approval,
    markManagerEditWindow?.approval_until,
    draft.sheet.markManagerLocked,
    draft.sheet.markManagerApprovalUntil,
  ]);

  // Autosave draft to backend (debounced)
  // Guard: do not autosave until the initial draft has been loaded from the backend
  // to prevent overwriting real marks with an empty initial draft.
  useEffect(() => {
    if (!subjectId) return;
    if (!draftLoadedRef.current) return;
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

  const coConfigs = useMemo(() => buildCoConfigs(draft.sheet, selectableCosArr, coA, coB), [draft.sheet, selectableCosArr, coA, coB]);

  const enabledCoMetas: CoMeta[] = useMemo(() => {
    return tableCosArr
      .filter((n) => coConfigs[String(n)]?.enabled)
      .map((n) => {
        const cfg = coConfigs[String(n)]!;
        return { coNumber: n, expCount: cfg.expCount, expMax: cfg.expMax, btl: cfg.btl };
      });
  }, [coConfigs, tableCosArr]);

  const totalExpCols = useMemo(() => enabledCoMetas.reduce((sum, m) => sum + m.expCount, 0), [enabledCoMetas]);
  const hasEnabledCos = enabledCoMetas.length > 0;
  const ciaExamEnabled = draft.sheet.ciaExamEnabled !== false;

  const visibleBtlIndices = useMemo(() => {
    if (totalExpCols === 0) return [] as number[];
    const set = new Set<number>();
    for (const m of enabledCoMetas) {
      for (const v of m.btl.slice(0, m.expCount)) set.add(v);
    }
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [enabledCoMetas, totalExpCols]);

  const coAttainmentCols = hasEnabledCos ? enabledCoMetas.length * 2 : 2;
  const maxExpMax = useMemo(() => enabledCoMetas.reduce((mx, m) => Math.max(mx, m.expMax), DEFAULT_EXPERIMENT_MAX), [enabledCoMetas]);

  // Back-compat A/B variables used by the legacy Review table layout.
  const coAConfig = coConfigs[String(coA)];
  const coBConfig = coConfigs[String(coB)];
  const coAEnabled = Boolean(coAConfig?.enabled);
  const coBEnabled = Boolean(coBConfig?.enabled);
  const expCountA = clampInt(Number(coAConfig?.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
  const expCountB = clampInt(Number(coBConfig?.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
  const expMaxA = clampInt(Number(coAConfig?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
  const expMaxB = clampInt(Number(coBConfig?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
  const visibleExpCountA = coAEnabled ? expCountA : 0;
  const visibleExpCountB = coBEnabled ? expCountB : 0;
  const coMaxA = Number(LAB_REVIEW_CO_MAX[coA] ?? 0);
  const coMaxB = Number(LAB_REVIEW_CO_MAX[coB] ?? 0);

  const markManagerLocked = Boolean(draft.sheet.markManagerLocked);
  
  // Table visibility and blocking logic:
  // - BEFORE Mark Manager confirm: table is HIDDEN
  // - AFTER Mark Manager confirm: table is VISIBLE
  // - Table editability is driven by backend `entry_open` (blocks after publish unless IQAC unblocks)
  const tableVisible = markManagerLocked; // Only show table after Mark Manager is confirmed
  const tableBlocked = Boolean(globalLocked || (markLock?.exists ? !markLock?.entry_open : false));

  function setCoEnabled(coNumber: number, enabled: boolean) {
    setDraft((p) => {
      if (p.sheet.markManagerLocked) return p;
      const cfgs = buildCoConfigs(p.sheet, selectableCosArr, coA, coB);
      cfgs[String(coNumber)] = { ...cfgs[String(coNumber)], enabled };
      return { ...p, sheet: { ...p.sheet, coConfigs: cfgs } };
    });
  }

  function setExpMax(coNumber: number, v: number) {
    const next = clampInt(Number(v), 0, 100);
    setDraft((p) => {
      if (p.sheet.markManagerLocked) return p;
      const cfgs = buildCoConfigs(p.sheet, selectableCosArr, coA, coB);
      cfgs[String(coNumber)] = { ...cfgs[String(coNumber)], expMax: next };
      return { ...p, sheet: { ...p.sheet, coConfigs: cfgs } };
    });
  }

  function setExpCount(coNumber: number, n: number) {
    const next = clampInt(n, 0, 12);
    setDraft((p) => {
      if (p.sheet.markManagerLocked) return p;
      const cfgs = buildCoConfigs(p.sheet, selectableCosArr, coA, coB);
      const old = cfgs[String(coNumber)];
      cfgs[String(coNumber)] = {
        ...old,
        expCount: next,
        btl: normalizeBtlArray(old.btl, next),
      };
      // Resize per-CO marks arrays
      const rowsByStudentId: Record<string, LabRowState> = { ...(p.sheet.rowsByStudentId || {}) };
      for (const k of Object.keys(rowsByStudentId)) {
        const row = rowsByStudentId[k];
        const mbc = (row as any).marksByCo && typeof (row as any).marksByCo === 'object' ? { ...(row as any).marksByCo } : {};
        mbc[String(coNumber)] = normalizeMarksArray(mbc[String(coNumber)], next);
        rowsByStudentId[k] = { ...row, marksByCo: mbc } as LabRowState;
      }
      return { ...p, sheet: { ...p.sheet, coConfigs: cfgs, rowsByStudentId } };
    });
  }

  function setCoBtl(coNumber: number, expIndex: number, value: 1 | 2 | 3 | 4 | 5 | 6) {
    setDraft((p) => {
      if (publishedEditLocked || globalLocked) return p;
      const cfgs = buildCoConfigs(p.sheet, selectableCosArr, coA, coB);
      const old = cfgs[String(coNumber)];
      const btl = [...old.btl];
      btl[expIndex] = value;
      cfgs[String(coNumber)] = { ...old, btl };
      return { ...p, sheet: { ...p.sheet, coConfigs: cfgs } };
    });
  }

  function setBtl(which: 'A' | 'B', expIndex: number, value: 1 | 2 | 3 | 4 | 5 | 6) {
    const coNumber = which === 'A' ? coA : coB;
    setCoBtl(coNumber, expIndex, value);
  }

  function setCiaExamEnabled(enabled: boolean) {
    setDraft((p) => {
      if (p.sheet.markManagerLocked) return p;
      return { ...p, sheet: { ...p.sheet, ciaExamEnabled: Boolean(enabled) } };
    });
  }

  function markManagerSnapshotOf(sheet: LabSheet): string {
    const cfgs = buildCoConfigs(sheet, selectableCosArr, coA, coB);
    const enabled = selectableCosArr
      .filter((n) => cfgs[String(n)]?.enabled)
      .map((n) => {
        const c = cfgs[String(n)];
        return { co: n, expCount: c.expCount, expMax: c.expMax };
      });
    return JSON.stringify({ enabled, ciaExamEnabled: Boolean((sheet as any).ciaExamEnabled ?? true) });
  }

  async function requestMarkManagerEdit() {
    if (!subjectId) return;
    setMarkManagerBusy(true);
    setMarkManagerError(null);
    try {
      const created = await createEditRequest({
        assessment: assessmentKey as any,
        subject_code: String(subjectId),
        scope: 'MARK_MANAGER',
        reason: `Edit request: Mark Manager changes for ${label}`,
        teaching_assignment_id: teachingAssignmentId,
      });
      alert(formatEditRequestSentMessage(created));
    } catch (e: any) {
      const msg = formatApiErrorMessage(e, 'Request failed');
      setMarkManagerError(msg);
      alert(`Edit request failed: ${msg}`);
    } finally {
      setMarkManagerBusy(false);
    }
  }

  function setMark(studentId: number, coNumber: number, expIndex: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const cfgs = buildCoConfigs(p.sheet, selectableCosArr, coA, coB);
      const cfg = cfgs[String(coNumber)];
      const maxMark = cfg ? cfg.expMax : DEFAULT_EXPERIMENT_MAX;
      const expCount = cfg ? cfg.expCount : DEFAULT_EXPERIMENTS;
      const existing = p.sheet.rowsByStudentId?.[k];
      const mbc = (existing as any)?.marksByCo && typeof (existing as any).marksByCo === 'object'
        ? { ...(existing as any).marksByCo }
        : {};
      const coMarks = [...normalizeMarksArray(mbc[String(coNumber)] ?? getRowMarksForCo(existing, coNumber, expCount, coA, coB), expCount)];

      if (value === '' || value == null) coMarks[expIndex] = '';
      else {
        const n = Number(value);
        coMarks[expIndex] = Number.isFinite(n) ? Math.max(0, Math.min(maxMark, Math.trunc(n))) : '';
      }
      mbc[String(coNumber)] = coMarks;

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: {
              ...(existing || { studentId, marksA: [], marksB: [] }),
              marksByCo: mbc,
            },
          },
        },
      };
    });
  }

  function setCiaExam(studentId: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];

      let ciaVal: number | '' = '';
      if (value === '' || value == null) ciaVal = '';
      else {
        const n = Number(value);
        const ciaMax = DEFAULT_CIA_EXAM_MAX;
        ciaVal = Number.isFinite(n) ? Math.max(0, Math.min(ciaMax, Math.trunc(n))) : '';
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...(existing || { studentId, marksA: [], marksB: [] }), ciaExam: ciaVal },
          },
        },
      };
    });
  }

  function setCaaExamByCo(studentId: number, coNumber: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;

      const coKey = String(clampInt(Number(coNumber), 1, 5));
      const maxRaw = Number(LAB_REVIEW_CAA_RAW_MAX[Number(coKey)] || 0);
      const nextValue = value === '' ? '' : clampInt(Number(value), 0, maxRaw > 0 ? maxRaw : 0);

      const caaExamByCo: Record<string, number | ''> = {
        ...normalizeCaaByCo((existing as any).caaExamByCo),
        [coKey]: nextValue,
      };

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...existing, caaExamByCo } as LabRowState,
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
    } catch (e: any) {
      alert(e?.message || 'Draft save failed');
    } finally {
      setSavingDraft(false);
    }
  }

  // Auto-save draft when switching tabs
  const draftRef = React.useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    const handler = () => {
      if (!subjectId || tableBlocked) return;
      saveDraft(assessmentKey, subjectId, draftRef.current).catch(() => {});
    };
    window.addEventListener('obe:before-tab-switch', handler);
    return () => window.removeEventListener('obe:before-tab-switch', handler);
  }, [subjectId, assessmentKey, tableBlocked]);

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
        caaExamByCo: {},
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

    // If already published and locked, use Publish as the entry-point to request edits.
    if (isPublished && publishedEditLocked) {
      if (markEntryReqPending) {
        alert('Edit request is pending. Please wait for approval.');
        return;
      }

      const mobileOk = await ensureMobileVerified();
      if (!mobileOk) {
        alert('Please verify your mobile number in Profile before requesting edits.');
        window.location.href = '/profile';
        return;
      }

      setPublishedEditModalOpen(true);
      return;
    }

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

  async function requestApproval() {
    if (!subjectId) return;
    setRequesting(true);
    setRequestMessage(null);
    try {
      await createPublishRequest({
        assessment: assessmentKey,
        subject_code: subjectId,
        reason: requestReason,
        teaching_assignment_id: teachingAssignmentId
      });
      setRequestMessage('Request sent to IQAC successfully.');
      setRequestReason('');
      refreshPublishWindow();
    } catch (e: any) {
      setRequestMessage(e?.message || 'Failed to send request.');
    } finally {
      setRequesting(false);
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

  const prevEntryOpenRef = React.useRef<boolean | null>(null);
  useEffect(() => {
    // When IQAC opens MARK_ENTRY edits (transition or initial load),
    // re-hydrate the editable draft so the table shows existing marks
    // (prefer last saved draft; fall back to the published snapshot).
    if (!subjectId) return;
    if (!isPublished) return;
    if (!entryOpen) {
      prevEntryOpenRef.current = false;
      return;
    }

    // Skip if entry was already open (no transition)
    const prev = prevEntryOpenRef.current;
    prevEntryOpenRef.current = true;
    if (prev === true) return;

    let mounted = true;
    (async () => {
      try {
        const resp = await fetchDraft(assessmentKey as any, String(subjectId), teachingAssignmentId);
        const d = (resp as any)?.draft ?? null;
        if (!mounted) return;
        if (d && typeof d === 'object' && (d as any).sheet) {
          // Check if the draft has actual marks
          const rows = (d as any).sheet?.rowsByStudentId;
          const hasMarks = rows && Object.values(rows).some((row: any) =>
            row?.marksA?.some((v: any) => v !== '' && v != null) ||
            row?.marksB?.some((v: any) => v !== '' && v != null) ||
            (row?.ciaExam !== '' && row?.ciaExam != null)
          );
          if (hasMarks) {
            setDraft(d as LabDraftPayload);
            draftLoadedRef.current = true;
            return;
          }
        }
      } catch {
        // ignore and fall back
      }
      if (!mounted) return;
      // Fall back to published snapshot
      if (publishedViewSnapshot && (publishedViewSnapshot as any).sheet) {
        setDraft(publishedViewSnapshot);
        draftLoadedRef.current = true;
      }
    })();

    return () => {
      mounted = false;
    };
  }, [entryOpen, isPublished, subjectId, assessmentKey, publishedViewSnapshot, teachingAssignmentId]);

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

  // identity + experiments + total + CIA exam + CO attainment + BTL
  const headerCols = 3 + Math.max(totalExpCols, 1) + 1 + coAttainmentCols + visibleBtlIndices.length * 2;

  const cellTh: React.CSSProperties = {
    border: '1px solid #111',
    padding: '4px 4px',
    background: '#ecfdf5',
    color: '#065f46',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const cellTd: React.CSSProperties = {
    border: '1px solid #111',
    padding: '4px 4px',
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 11,
    textAlign: 'center',
  };

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 12,
    background: '#fff',
  };

  const minTableWidth = '100%';

  const coEnableStyle: React.CSSProperties = {
    display: 'flex',
    width: '100%',
    maxWidth: 1200,
    margin: '0 auto',
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
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 40,
    width: 360,
    background: '#fff',
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
    <AssessmentContainer>
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
          maxWidth: '100%',
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

          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardList size={20} color={markManagerLocked ? '#6b7280' : '#9a3412'} />
              <div style={{ fontWeight: 950, color: '#111827', fontSize: 14 }}>Mark Manager</div>
              {markManagerLocked && (
                <span style={{ fontSize: 11, color: '#fff', background: '#dc2626', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                  LOCKED
                </span>
              )}
              {!markManagerLocked && (
                <span style={{ fontSize: 11, color: '#fff', background: '#16a34a', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                  EDITABLE
                </span>
              )}
            </div>

            <button
              onClick={() => setMarkManagerModal({ mode: markManagerLocked ? 'request' : 'confirm' })}
              className="obe-btn obe-btn-success"
              disabled={!subjectId || markManagerBusy}
              style={{ minWidth: 100 }}
            >
              {markManagerBusy ? 'Saving...' : markManagerLocked ? 'Request Edit' : 'Save & Lock'}
            </button>
          </div>

          <div style={{ width: '100%', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            {selectableCosArr.map((coNum) => {
              const cfg = coConfigs[String(coNum)];
              const disabled = markManagerLocked || (reviewFixedTable && coNum !== coA && coNum !== coB);
              return (
                <label key={coNum} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, fontSize: 12, color: '#111827' }}>
                  <input type="checkbox" checked={cfg?.enabled || false} disabled={disabled} onChange={(e) => setCoEnabled(coNum, e.target.checked)} style={bigCheckboxStyle} />
                  CO-{coNum}
                </label>
              );
            })}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, fontSize: 12, color: '#111827' }}>
              <input type="checkbox" checked={ciaExamEnabled} disabled={markManagerLocked} onChange={(e) => setCiaExamEnabled(e.target.checked)} style={bigCheckboxStyle} />
              CIA Exam
            </label>
          </div>

          <div
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 10,
              marginTop: 8,
            }}
          >
            {enabledCoMetas.map((m) => (
              <div key={m.coNumber} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>No. of experiments (CO-{m.coNumber})</div>
                <input type="number" className="obe-input" value={m.expCount} onChange={(e) => setExpCount(m.coNumber, Number(e.target.value))} min={0} max={12} disabled={markManagerLocked} />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Max marks (per experiment)</div>
                <input type="number" className="obe-input" value={m.expMax} onChange={(e) => setExpMax(m.coNumber, Number(e.target.value))} min={0} max={100} disabled={markManagerLocked} />
              </div>
            ))}
          </div>
        </div>

        {markManagerError ? <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{markManagerError}</div> : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={resetSheet}
            className="obe-btn obe-btn-danger"
            disabled={!subjectId || !tableVisible || tableBlocked}
            title={!tableVisible ? 'Save & Lock Mark Manager first to enable table' : tableBlocked ? 'Table locked after publish' : 'Clear all marks'}
          >
            Reset All
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={saveNow}
            className="obe-btn obe-btn-success"
            disabled={savingDraft || !subjectId || !tableVisible || tableBlocked}
            title={!tableVisible ? 'Save & Lock Mark Manager first to enable table' : tableBlocked ? 'Table locked after publish' : 'Save current draft'}
          >
            {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={publish}
            className="obe-btn obe-btn-primary"
            disabled={publishedEditLocked ? markEntryReqPending : !subjectId || publishing || !tableVisible || tableBlocked || globalLocked || !publishAllowed}
            title={!tableVisible ? 'Save & Lock Mark Manager first' : tableBlocked ? 'Table locked after publish' : !publishAllowed ? 'Publish window closed' : globalLocked ? 'Publishing locked by IQAC' : 'Publish marks'}
          >
            {publishedEditLocked ? (markEntryReqPending ? 'Request Pending' : 'Request Edit') : publishing ? 'Publishing…' : 'Publish'}
          </button>
          {savedAt && <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>Saved: {savedAt}</div>}
          {publishedAt && <div style={{ fontSize: 12, color: '#16a34a', alignSelf: 'center' }}>Published: {publishedAt}</div>}
        </div>
      </div>

      {error && (
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
          {error}
        </div>
      )}

      <div style={{ marginBottom: 10, fontSize: 12, color: publishAllowed ? '#065f46' : '#b91c1c' }}>
        {publishWindowLoading ? (
          'Checking publish due time…'
        ) : publishWindowError ? (
          publishWindowError
        ) : publishWindow?.due_at ? (
          <>
            Due: {new Date(publishWindow.due_at).toLocaleString()} • Remaining: {formatRemaining(remainingSeconds)}
            {publishWindow.allowed_by_approval && publishWindow.approval_until ? (
              <> • Approved until {new Date(publishWindow.approval_until).toLocaleString()}</>
            ) : null}
          </>
        ) : (
          'Due time not set by IQAC.'
        )}
      </div>

      {globalLocked ? (
        <div style={{ marginBottom: 10, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Publishing disabled by IQAC</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Global publishing is turned OFF for this assessment. You can view the sheet, but editing and publishing are locked.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="obe-btn" onClick={() => refreshPublishWindow()} disabled={publishWindowLoading}>Refresh</button>
          </div>
        </div>
      ) : !publishAllowed ? (
        <div style={{ marginBottom: 10, border: '1px solid #fecaca', background: '#fff7ed', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Publish time is over</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Send a request to IQAC to approve publishing.</div>
          <textarea
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={3}
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="obe-btn" onClick={() => refreshPublishWindow()} disabled={requesting || publishWindowLoading}>Refresh</button>
            <button className="obe-btn obe-btn-primary" onClick={requestApproval} disabled={requesting}>{requesting ? 'Requesting…' : 'Request Approval'}</button>
          </div>
          {requestMessage ? <div style={{ marginTop: 8, fontSize: 12, color: '#065f46' }}>{requestMessage}</div> : null}
        </div>
      ) : null}
      {loading ? (
        <div style={{ color: '#6b7280' }}>Loading roster…</div>
      ) : students.length === 0 ? (
        <div style={{ color: '#6b7280' }}>Select a Teaching Assignment to load students.</div>
      ) : !tableVisible ? (
        <div style={{ 
          padding: '20px', 
          textAlign: 'center', 
          background: '#fff7ed',
          borderRadius: 12,
          border: '1px solid #fcd34d',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
            📋 Mark Manager Configuration Required
          </div>
          <div style={{ fontSize: 12, color: '#78350f' }}>
            Please configure and lock the Mark Manager above to enable the table.
          </div>
        </div>
      ) : (
        <div style={cardStyle}>
          <PublishLockOverlay locked={globalLocked}>
            <div
              className="obe-table-wrapper"
              style={{
                width: '100%',
                maxWidth: '100%',
                overflowX: 'scroll',
                overflowY: 'hidden',
                WebkitOverflowScrolling: 'touch',
                overscrollBehaviorX: 'contain',
                scrollbarGutter: 'stable',
              }}
            >
              <table className="obe-table" style={{ minWidth: minTableWidth, width: '100%', borderCollapse: 'collapse' }}>
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
                <th style={cellTh} rowSpan={5}>
                  <div>Total</div>
                  <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 900 }}>{ciaExamEnabled ? 'CIA exam' : 'Avg'}</div>
                  {ciaExamEnabled && <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 900 }}>{DEFAULT_CIA_EXAM_MAX}</div>}
                </th>
                <th style={cellTh} colSpan={coAttainmentCols}>CO ATTAINMENT</th>
                {visibleBtlIndices.length ? <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th> : null}
              </tr>

              {/* CO mapping numbers row */}
              <tr>
                {totalExpCols === 0 ? (
                  <th style={cellTh}>—</th>
                ) : (
                  <>
                    {enabledCoMetas.map((m) =>
                      Array.from({ length: m.expCount }, (_, i) => (
                        <th key={`co${m.coNumber}_${i}`} style={cellTh}>{m.coNumber}</th>
                      ))
                    )}
                  </>
                )}

                {enabledCoMetas.map((m) => (
                  <th key={`coatt_hdr_${m.coNumber}`} style={cellTh} colSpan={2}>CO-{m.coNumber}</th>
                ))}
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
                    {enabledCoMetas.map((m) =>
                      Array.from({ length: m.expCount }, (_, i) => (
                        <th key={`max_${m.coNumber}_${i}`} style={cellTh}>{m.expMax}</th>
                      ))
                    )}
                  </>
                )}

                {enabledCoMetas.map((m) => (
                  <React.Fragment key={`comax_${m.coNumber}`}>
                    <th style={cellTh}>
                      {(m.expMax + (ciaExamEnabled && enabledCoMetas.length ? DEFAULT_CIA_EXAM_MAX / enabledCoMetas.length : 0)).toFixed(0)}
                    </th>
                    <th style={cellTh}>%</th>
                  </React.Fragment>
                ))}
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
                    {enabledCoMetas.map((m) =>
                      Array.from({ length: m.expCount }, (_, i) => (
                        <th key={`e_${m.coNumber}_${i}`} style={cellTh}>E{i + 1}</th>
                      ))
                    )}
                  </>
                )}
                <th style={cellTh} colSpan={coAttainmentCols + visibleBtlIndices.length * 2} />
              </tr>

              {/* BTL row per experiment */}
              <tr>
                {totalExpCols === 0 ? (
                  <th style={cellTh}>—</th>
                ) : (
                  <>
                    {enabledCoMetas.map((m) =>
                      Array.from({ length: m.expCount }, (_, i) => {
                        const v = m.btl[i] ?? 1;
                        const editable = !(publishedEditLocked || globalLocked);
                        return (
                          <th key={`btl_${m.coNumber}_${i}`} style={cellTh}>
                            {editable ? (
                              <select
                                aria-label={`BTL for CO${m.coNumber} E${i + 1}`}
                                value={v}
                                onChange={(e) => setCoBtl(m.coNumber, i, Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)}
                                style={{
                                  width: '100%',
                                  minWidth: 38,
                                  padding: '2px 2px',
                                  fontWeight: 800,
                                  fontSize: 11,
                                  textAlign: 'center',
                                  border: '1px solid #d1d5db',
                                  borderRadius: 4,
                                  background: '#fff',
                                  cursor: 'pointer',
                                }}
                              >
                                {[1, 2, 3, 4, 5, 6].map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ fontWeight: 800 }}>{v}</span>
                            )}
                          </th>
                        );
                      })
                    )}
                  </>
                )}
                <th style={cellTh} colSpan={coAttainmentCols + visibleBtlIndices.length * 2} />
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
                    const rawCia = (row as any)?.ciaExam;
                    const ciaRaw = rawCia === '' || rawCia == null ? 0 : Number(rawCia);
                    const ciaValue = rawCia === '' || rawCia == null ? '' : (Number.isFinite(ciaRaw) ? ciaRaw : '');
                    const ciaShare = ciaExamEnabled && enabledCoMetas.length ? (Number.isFinite(ciaRaw) ? ciaRaw : 0) / enabledCoMetas.length : 0;

                    // Per-CO marks and attainment using enabledCoMetas
                    const perCo: Array<{
                      coNumber: number;
                      marks: Array<number | ''>;
                      visibleMarks: Array<number | ''>;
                      btls: number[];
                      coMark: number | null;
                      coMax: number;
                    }> = enabledCoMetas.map((m) => {
                      const marks = getRowMarksForCo(row as any, m.coNumber, m.expCount, coA, coB);
                      const visibleMarks = marks.slice(0, m.expCount);
                      const btls = m.btl.slice(0, m.expCount);
                      const expAvg = avgMarks(visibleMarks);
                      const hasAny = (expAvg != null && expAvg > 0) || (ciaExamEnabled && ciaRaw > 0);
                      const coMark = hasAny ? (Number(expAvg ?? 0) + ciaShare) : null;
                      const coMax = m.expMax + (ciaExamEnabled && enabledCoMetas.length ? DEFAULT_CIA_EXAM_MAX / enabledCoMetas.length : 0);
                      return { coNumber: m.coNumber, marks, visibleMarks, btls, coMark, coMax };
                    });

                    const allVisibleMarks = perCo.flatMap((c) => c.visibleMarks);
                    const avgTotal = avgMarks(allVisibleMarks);

                    const btlAvgByIndex: Record<number, number | null> = {};
                    for (const n of visibleBtlIndices) {
                      const marks: number[] = [];
                      for (const c of perCo) {
                        for (let i = 0; i < c.visibleMarks.length; i++) {
                          if (c.btls[i] === n) {
                            const v = c.visibleMarks[i];
                            if (typeof v === 'number' && Number.isFinite(v)) marks.push(v);
                          }
                        }
                      }
                      btlAvgByIndex[n] = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
                    }

                    return (
                      <tr key={s.id}>
                        <td style={{ ...cellTd, width: '30px', minWidth: '30px', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={{ ...cellTd, width: '70px', minWidth: '70px', fontWeight: 600 }}>{String(s.reg_no || '').slice(-8)}</td>
                        <td style={{ ...cellTd, fontWeight: 600, whiteSpace: 'nowrap' }}>{String(s.name || '')}</td>

                        {perCo.map((c) =>
                          Array.from({ length: c.visibleMarks.length }, (_, i) => {
                            const meta = enabledCoMetas.find((m) => m.coNumber === c.coNumber)!;
                            return (
                              <td key={`m${s.id}_co${c.coNumber}_${i}`} style={{ ...cellTd, padding: '2px' }}>
                                <input
                                  type="number"
                                  value={c.marks[i]}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') {
                                      e.currentTarget.setCustomValidity('');
                                      return setMark(s.id, c.coNumber, i, '');
                                    }
                                    const next = Number(raw);
                                    if (!Number.isFinite(next)) return;
                                    if (next > meta.expMax) {
                                      e.currentTarget.setCustomValidity(`Max mark is ${meta.expMax}`);
                                      e.currentTarget.reportValidity();
                                      window.setTimeout(() => e.currentTarget.setCustomValidity(''), 0);
                                      return;
                                    }
                                    e.currentTarget.setCustomValidity('');
                                    setMark(s.id, c.coNumber, i, next);
                                  }}
                                  style={inputStyle}
                                  min={0}
                                  max={meta.expMax}
                                  disabled={!tableVisible || tableBlocked}
                                />
                              </td>
                            );
                          })
                        )}

                        <td style={{ ...cellTd, padding: ciaExamEnabled ? '2px' : undefined, fontWeight: ciaExamEnabled ? 600 : 700, fontSize: 'clamp(10px, 0.9vw, 11px)' }}>
                          {ciaExamEnabled ? (
                            <input
                              type="number"
                              value={ciaValue}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  e.currentTarget.setCustomValidity('');
                                  return setCiaExam(s.id, '');
                                }
                                const next = Number(raw);
                                if (!Number.isFinite(next)) return;
                                if (next > DEFAULT_CIA_EXAM_MAX) {
                                  e.currentTarget.setCustomValidity(`Max mark is ${DEFAULT_CIA_EXAM_MAX}`);
                                  e.currentTarget.reportValidity();
                                  window.setTimeout(() => e.currentTarget.setCustomValidity(''), 0);
                                  return;
                                }
                                e.currentTarget.setCustomValidity('');
                                setCiaExam(s.id, next);
                              }}
                              style={inputStyle}
                              min={0}
                              max={DEFAULT_CIA_EXAM_MAX}
                              disabled={!tableVisible || tableBlocked}
                            />
                          ) : (
                            avgTotal == null ? '' : avgTotal.toFixed(1)
                          )}
                        </td>
                        {perCo.map((c) => (
                          <React.Fragment key={`coatt_${s.id}_${c.coNumber}`}>
                            <td style={{ ...cellTd, width: '28px', fontSize: '10px', padding: '2px', fontWeight: 600, color: '#5f6368' }}>{c.coMark == null ? '' : c.coMark.toFixed(1)}</td>
                            <td style={{ ...cellTd, width: '25px', fontSize: '10px', padding: '2px', fontWeight: 600, color: '#5f6368' }}>{pct(c.coMark, c.coMax)}</td>
                          </React.Fragment>
                        ))}
                        {visibleBtlIndices.map((n) => {
                          const m = btlAvgByIndex[n] ?? null;
                          return (
                            <React.Fragment key={`btlcell_${s.id}_${n}`}>
                              <td style={{ ...cellTd, width: '28px', fontSize: '10px', padding: '2px', fontWeight: 600, color: '#5f6368' }}>{m == null ? '' : m.toFixed(1)}</td>
                              <td style={{ ...cellTd, width: '25px', fontSize: '10px', padding: '2px', fontWeight: 600, color: '#5f6368' }}>{pct(m, maxExpMax)}</td>
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
              {!markManagerLocked && !publishedEditLocked ? (
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
                      disabled={markEntryReqPending}
                      onClick={async () => {
                        if (markEntryReqPending) {
                          alert('Edit request is pending. Please wait for approval.');
                          return;
                        }
                        const mobileOk = await ensureMobileVerified();
                        if (!mobileOk) {
                          alert('Please verify your mobile number in Profile before requesting edits.');
                          window.location.href = '/profile';
                          return;
                        }
                        setPublishedEditModalOpen(true);
                      }}
                    >
                      {markEntryReqPending ? 'Request Pending' : 'Request Edit'}
                    </button>
                  </div>

                  <div
                    style={{
                      width: 64,
                      height: 64,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#065f46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="#d1fae5" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                </div>
              ) : null}
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
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              overflowY: 'auto',
              padding: 16,
              paddingTop: 40,
              paddingBottom: 40,
              zIndex: 60,
            }}
            onClick={() => {
              if (editRequestBusy) return;
              setPublishedEditModalOpen(false);
            }}
          >
            <div
              style={{
                width: 'min(560px, 96vw)',
                maxHeight: 'min(86vh, 740px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                background: '#fff',
                borderRadius: 14,
                border: '1px solid #e5e7eb',
                padding: 14,
              }}
              onClick={(e) => e.stopPropagation()}
            >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>Request Edit Access</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{String(assessmentKey).toUpperCase()} LAB</div>
            </div>

            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.35 }}>
              This will send a request to IQAC. Once approved, mark entry will open for editing until the approval expires.
              {markEntryReqPendingUntilMs ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Request window:</strong> 24 hours
                </div>
              ) : null}
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

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#111827', marginBottom: 6 }}>Reason</div>
              <textarea
                value={editRequestReason}
                onChange={(e) => setEditRequestReason(e.target.value)}
                placeholder="Explain why you need to edit (required)"
                rows={4}
                className="obe-input"
                style={{ resize: 'vertical' }}
              />
            </div>

            {editRequestError ? <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }}>{editRequestError}</div> : null}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="obe-btn" disabled={editRequestBusy} onClick={() => setPublishedEditModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="obe-btn obe-btn-primary"
                disabled={editRequestBusy || markEntryReqPending || !subjectId || !String(editRequestReason || '').trim()}
                onClick={async () => {
                  if (!subjectId) return;

                  const mobileOk = await ensureMobileVerified();
                  if (!mobileOk) {
                    alert('Please verify your mobile number in Profile before requesting edits.');
                    window.location.href = '/profile';
                    return;
                  }

                  if (markEntryReqPending) {
                    alert('Edit request is pending. Please wait.');
                    return;
                  }

                  const reason = String(editRequestReason || '').trim();
                  if (!reason) {
                    setEditRequestError('Reason is required.');
                    return;
                  }
                  setEditRequestBusy(true);
                  setEditRequestError(null);
                  try {
                    const created = await createEditRequest({
                      assessment: assessmentKey as any,
                      subject_code: String(subjectId),
                      scope: 'MARK_ENTRY',
                      reason,
                      teaching_assignment_id: teachingAssignmentId,
                    });
                    alert(formatEditRequestSentMessage(created));
                    setPublishedEditModalOpen(false);
                    setEditRequestReason('');
                    setMarkEntryReqPendingUntilMs(Date.now() + 24 * 60 * 60 * 1000);
                    try {
                      refreshMarkEntryReqPending({ silent: true });
                    } catch {
                      // ignore
                    }
                    refreshMarkLock({ silent: true });
                  } catch (e: any) {
                    const msg = formatApiErrorMessage(e, 'Request failed');
                    setEditRequestError(msg);
                    alert(`Edit request failed: ${msg}`);
                  } finally {
                    setEditRequestBusy(false);
                  }
                }}
              >
                {editRequestBusy ? 'Requesting…' : markEntryReqPending ? 'Request Pending' : 'Send Request'}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
      {markManagerModal ? (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              overflowY: 'auto',
              padding: 16,
              paddingTop: 40,
              paddingBottom: 40,
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
                <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚠️ Important</div>
                  <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
                    After confirming, Mark Manager will be <strong>locked</strong>. You'll need IQAC approval to change CO selection, experiment count, or max marks.
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, fontWeight: 600 }}>Review your settings:</div>
                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        <th style={{ textAlign: 'left', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb', fontWeight: 700 }}>Item</th>
                        <th style={{ textAlign: 'right', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb', fontWeight: 700 }}>Experiments</th>
                        <th style={{ textAlign: 'right', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb', fontWeight: 700 }}>Max marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enabledCoMetas.length > 0 ? (
                        enabledCoMetas.map((m) => (
                          <tr key={m.coNumber}>
                            <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 800 }}>CO-{m.coNumber}</td>
                            <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600 }}>{m.expCount}</td>
                            <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600 }}>{m.expMax}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} style={{ padding: 10, color: '#dc2626', fontWeight: 600 }}>
                            ⚠️ No COs selected
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 800 }}>CIA Exam</td>
                        <td colSpan={2} style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600 }}>
                          {ciaExamEnabled ? '✅ Enabled' : '❌ Disabled'}
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
                  setMarkManagerAnimating(true);
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

                    // Save draft first
                    await saveDraft(assessmentKey, String(subjectId), nextDraft);
                    setSavedAt(new Date().toLocaleString());

                    // Persist Mark Manager confirmation to server lock row
                    await confirmMarkManagerLock(assessmentKey as any, String(subjectId), teachingAssignmentId);

                    // CRITICAL: Refresh lock status IMMEDIATELY to update UI
                    await refreshMarkLock({ silent: false });
                    
                    // Update local draft state after successful confirmation
                    setDraft(nextDraft);
                    setMarkManagerModal(null);
                    
                    // Success feedback
                    alert('✅ Mark Manager saved and locked successfully! You can now proceed with mark entry.');
                    setTimeout(() => setMarkManagerAnimating(false), 1500);
                  } catch (e: any) {
                    setMarkManagerError(e?.message || 'Save failed');
                    setMarkManagerAnimating(false);
                    // Revert lock state on error
                    setDraft((p) => ({
                      ...p,
                      sheet: { ...p.sheet, markManagerLocked: false },
                    }));
                  } finally {
                    setMarkManagerBusy(false);
                  }
                }}
              >
                {markManagerBusy ? 'Saving...' : markManagerModal.mode === 'confirm' ? '🔒 Confirm & Lock' : '📧 Send Request'}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
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

              const viewCoConfigs = buildCoConfigs(viewSheet as any, selectableCosArr, coA, coB);
              const viewEnabledMetas: CoMeta[] = selectableCosArr
                .filter((n) => viewCoConfigs[String(n)]?.enabled)
                .map((n) => {
                  const c = viewCoConfigs[String(n)];
                  return { coNumber: n, expCount: c.expCount, expMax: c.expMax, btl: c.btl };
                });

              const viewTotalExp = viewEnabledMetas.reduce((s, m) => s + m.expCount, 0);

              const btlSet = new Set<number>();
              for (const m of viewEnabledMetas) {
                for (const v of m.btl.slice(0, m.expCount)) btlSet.add(v);
              }
              const viewBtls = [1, 2, 3, 4, 5, 6].filter((n) => btlSet.has(n));

              const viewMaxExp = viewEnabledMetas.reduce((mx, m) => Math.max(mx, m.expMax), DEFAULT_EXPERIMENT_MAX);
              const viewCoAttCols = viewEnabledMetas.length * 2;
              const viewHeaderCols = 3 + Math.max(viewTotalExp, 1) + 1 + viewCoAttCols + viewBtls.length * 2;
              const viewMinWidth = Math.max(920, 360 + (viewTotalExp + viewBtls.length * 2) * 80);

              return (
                <div
                  className="obe-table-wrapper"
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    overflowX: 'scroll',
                    overflowY: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehaviorX: 'contain',
                    scrollbarGutter: 'stable',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                  }}
                >
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
                        <th style={cellTh} rowSpan={5}>
                          <div>Total</div>
                          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 900 }}>{viewCiaEnabled ? 'CIA exam' : 'Avg'}</div>
                        </th>
                        <th style={cellTh} colSpan={viewCoAttCols}>CO ATTAINMENT</th>
                        {viewBtls.length ? <th style={cellTh} colSpan={viewBtls.length * 2}>BTL ATTAINMENT</th> : null}
                      </tr>
                      <tr>
                        {viewTotalExp === 0 ? (
                          <th style={cellTh}>—</th>
                        ) : (
                          <>
                            {viewEnabledMetas.map((m) =>
                              Array.from({ length: m.expCount }, (_, i) => (
                                <th key={`v_co${m.coNumber}_${i}`} style={cellTh}>{m.coNumber}</th>
                              ))
                            )}
                          </>
                        )}
                        {viewEnabledMetas.map((m) => (
                          <th key={`v_coatt_hdr_${m.coNumber}`} style={cellTh} colSpan={2}>CO-{m.coNumber}</th>
                        ))}
                        {viewBtls.map((n) => (
                          <th key={`v_btl_${n}`} style={cellTh} colSpan={2}>BTL-{n}</th>
                        ))}
                      </tr>
                      <tr>
                        {viewTotalExp === 0 ? (
                          <th style={cellTh}>—</th>
                        ) : (
                          <>
                            {viewEnabledMetas.map((m) =>
                              Array.from({ length: m.expCount }, (_, i) => (
                                <th key={`v_max_${m.coNumber}_${i}`} style={cellTh}>{m.expMax}</th>
                              ))
                            )}
                          </>
                        )}
                        {viewEnabledMetas.map((m) => (
                          <React.Fragment key={`v_comax_${m.coNumber}`}>
                            <th style={cellTh}>
                              {(m.expMax + (viewCiaEnabled && viewEnabledMetas.length ? DEFAULT_CIA_EXAM_MAX / viewEnabledMetas.length : 0)).toFixed(0)}
                            </th>
                            <th style={cellTh}>%</th>
                          </React.Fragment>
                        ))}
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
                            {viewEnabledMetas.map((m) =>
                              Array.from({ length: m.expCount }, (_, i) => (
                                <th key={`v_e_${m.coNumber}_${i}`} style={cellTh}>E{i + 1}</th>
                              ))
                            )}
                          </>
                        )}
                        <th style={cellTh} colSpan={viewCoAttCols + viewBtls.length * 2} />
                      </tr>
                      <tr>
                        {viewTotalExp === 0 ? (
                          <th style={cellTh}>BTL</th>
                        ) : (
                          <>
                            {viewEnabledMetas.map((m) =>
                              Array.from({ length: m.expCount }, (_, i) => (
                                <th key={`v_btl_${m.coNumber}_${i}`} style={cellTh}>{m.btl[i] ?? 1}</th>
                              ))
                            )}
                          </>
                        )}
                        <th style={cellTh} colSpan={viewCoAttCols + viewBtls.length * 2} />
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, idx) => {
                        const row = (viewSheet as any)?.rowsByStudentId?.[String(s.id)];
                        const rawCia = (row as any)?.ciaExam;
                        const ciaRaw = rawCia === '' || rawCia == null ? 0 : Number(rawCia);
                        const ciaShare = viewCiaEnabled && viewEnabledMetas.length ? (Number.isFinite(ciaRaw) ? ciaRaw : 0) / viewEnabledMetas.length : 0;

                        const perCo = viewEnabledMetas.map((m) => {
                          const marks = getRowMarksForCo(row as any, m.coNumber, m.expCount, coA, coB);
                          const visibleMarks = marks.slice(0, m.expCount);
                          const btls = m.btl.slice(0, m.expCount);
                          const expAvg = avgMarks(visibleMarks);
                          const hasAny = (expAvg != null && expAvg > 0) || (viewCiaEnabled && ciaRaw > 0);
                          const coMark = hasAny ? (Number(expAvg ?? 0) + ciaShare) : null;
                          const coMax = m.expMax + (viewCiaEnabled && viewEnabledMetas.length ? DEFAULT_CIA_EXAM_MAX / viewEnabledMetas.length : 0);
                          return { coNumber: m.coNumber, marks, visibleMarks, btls, coMark, coMax };
                        });

                        const allVisible = perCo.flatMap((c) => c.visibleMarks);
                        const avgTotal = avgMarks(allVisible);

                        const btlAvgByIndex: Record<number, number | null> = {};
                        for (const n of viewBtls) {
                          const marks: number[] = [];
                          for (const c of perCo) {
                            for (let i = 0; i < c.visibleMarks.length; i++) {
                              if (c.btls[i] === n) {
                                const v = c.visibleMarks[i];
                                if (typeof v === 'number' && Number.isFinite(v)) marks.push(v);
                              }
                            }
                          }
                          btlAvgByIndex[n] = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
                        }

                        return (
                          <tr key={`v_${s.id}`}>
                            <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42 }}>{idx + 1}</td>
                            <td style={cellTd}>{String(s.reg_no || '')}</td>
                            <td style={cellTd}>{String(s.name || '')}</td>

                            {viewTotalExp === 0 ? (
                              <td style={{ ...cellTd, textAlign: 'center', color: '#6b7280' }}>—</td>
                            ) : (
                              <>
                                {perCo.map((c) =>
                                  c.visibleMarks.map((v, i) => (
                                    <td key={`v_m_${s.id}_co${c.coNumber}_${i}`} style={{ ...cellTd, width: 78, minWidth: 78, background: '#fff7ed', textAlign: 'center', fontWeight: 800 }}>
                                      {v ?? ''}
                                    </td>
                                  ))
                                )}
                              </>
                            )}

                            <td style={{ ...cellTd, textAlign: viewCiaEnabled ? 'center' : 'right', fontWeight: 800, background: viewCiaEnabled ? '#fff7ed' : undefined }}>
                              {viewCiaEnabled ? (Number.isFinite(ciaRaw) ? ciaRaw : '') : (avgTotal == null ? '' : avgTotal.toFixed(1))}
                            </td>

                            {perCo.map((c) => (
                              <React.Fragment key={`v_coatt_${s.id}_${c.coNumber}`}>
                                <td style={{ ...cellTd, textAlign: 'right' }}>{c.coMark == null ? '' : c.coMark.toFixed(1)}</td>
                                <td style={{ ...cellTd, textAlign: 'right' }}>{pct(c.coMark, c.coMax)}</td>
                              </React.Fragment>
                            ))}

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
    </AssessmentContainer>
  );
}
