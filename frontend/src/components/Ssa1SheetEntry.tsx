import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import fetchWithAuth from '../services/fetchAuth';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import {
  confirmMarkManagerLock,
  createEditRequest,
  createPublishRequest,
  fetchDraft,
  fetchMyTeachingAssignments,
  fetchPublishedReview1,
  fetchPublishedSsa1,
  formatApiErrorMessage,
  formatEditRequestSentMessage,
  publishReview1,
  publishSsa1,
  PublishedSsa1Response,
  saveDraft,
} from '../services/obe';
import { ensureMobileVerified } from '../services/auth';
import { formatRemaining, usePublishWindow } from '../hooks/usePublishWindow';
import { useEditWindow } from '../hooks/useEditWindow';
import { useMarkTableLock } from '../hooks/useMarkTableLock';
import { useEditRequestPending } from '../hooks/useEditRequestPending';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import PublishLockOverlay from './PublishLockOverlay';
import AssessmentContainer from './containers/AssessmentContainer';
import { ModalPortal } from './ModalPortal';
import { downloadTotalsWithPrompt } from '../utils/assessmentTotalsDownload';

type Props = { subjectId: string; teachingAssignmentId?: number; label?: string; assessmentKey?: 'ssa1' | 'review1' };

type Ssa1Row = {
  studentId: number;
  section: string;
  registerNo: string;
  name: string;
  total: number | '';
};

type Ssa1Sheet = {
  termLabel: string;
  batchLabel: string;
  rows: Ssa1Row[];

  // Review (TCPR) CO max split config
  // Example: { co1: [5, 10], co2: [15] }
  coSplitMax?: { co1?: Array<number | ''>; co2?: Array<number | ''> };

  // Mark Manager lock state
  markManagerLocked?: boolean;
  markManagerSnapshot?: string | null;
  markManagerApprovalUntil?: string | null;
};

type Ssa1DraftPayload = {
  sheet: Ssa1Sheet;
  selectedBtls: number[];
};

const DEFAULT_MAX_ASMT1 = 20;
const DEFAULT_CO_MAX = { co1: 10, co2: 10 };
const DEFAULT_BTL_MAX = { btl1: 0, btl2: 0, btl3: 10, btl4: 10, btl5: 0, btl6: 0 };
const DEFAULT_BTL_MAX_WHEN_VISIBLE = 10;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function pct(mark: number | null, max: number) {
  if (mark == null) return '';
  if (!Number.isFinite(max) || max <= 0) return '0';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
}

function readFiniteNumber(value: any): number | null {
  if (value === '' || value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getBtlMaxFromCfg(cfg: any, n: 1 | 2 | 3 | 4 | 5 | 6, fallback: number): number {
  const btlMax = cfg?.btlMax;
  const raw = btlMax?.[String(n)] ?? btlMax?.[`btl${n}`] ?? btlMax?.[n];
  const parsed = readFiniteNumber(raw);
  return parsed == null ? fallback : parsed;
}

function displayBtlMax(raw: any): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BTL_MAX_WHEN_VISIBLE;
}

function storageKey(subjectId: string, assessmentKey: 'ssa1' | 'review1') {
  return `${assessmentKey}_sheet_${subjectId}`;
}

function safeFilePart(raw: string) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 48);
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

function compareStudentName(a: { name?: string; reg_no?: string }, b: { name?: string; reg_no?: string }) {
  const an = String(a?.name || '').trim().toLowerCase();
  const bn = String(b?.name || '').trim().toLowerCase();
  if (an && bn) {
    const byName = an.localeCompare(bn);
    if (byName) return byName;
  } else if (an || bn) {
    // Put students with a name first
    return an ? -1 : 1;
  }

  const ar = String(a?.reg_no || '').trim();
  const br = String(b?.reg_no || '').trim();
  const byReg = ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
  if (byReg) return byReg;
  return 0;
}

function shortenRegisterNo(registerNo: string): string {
  return registerNo.slice(-8);
}

export default function Ssa1SheetEntry({ subjectId, teachingAssignmentId, label, assessmentKey = 'ssa1' }: Props) {
  const displayLabel = String(label || 'SSA1');
  const isReview = assessmentKey === 'review1';
  const showTotalColumn = false;
  const key = useMemo(() => storageKey(subjectId, assessmentKey), [subjectId, assessmentKey]);
  const fetchPublished = assessmentKey === 'review1' ? fetchPublishedReview1 : fetchPublishedSsa1;
  const publishNow = assessmentKey === 'review1' ? publishReview1 : publishSsa1;
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [taMeta, setTaMeta] = useState<{ courseName?: string; courseCode?: string; className?: string } | null>(null);
  const [sheet, setSheet] = useState<Ssa1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    rows: [],
    coSplitMax: isReview ? { co1: [''], co2: [''] } : undefined,
    // Default: locked until Mark Manager is confirmed (saved)
    markManagerLocked: false,
    markManagerSnapshot: null,
    markManagerApprovalUntil: null,
  });

  const masterTermLabel = String(masterCfg?.termLabel || 'KRCT AY25-26');
  const ssa1Cfg = masterCfg?.assessments?.ssa1 || {};
  const MAX_ASMT1_BASE = Number.isFinite(Number(ssa1Cfg?.maxTotal)) ? Number(ssa1Cfg.maxTotal) : DEFAULT_MAX_ASMT1;
  const MAX_ASMT1 = isReview ? 30 : MAX_ASMT1_BASE;
  const CO_MAX_BASE = {
    co1: Number.isFinite(Number(ssa1Cfg?.coMax?.co1)) ? Number(ssa1Cfg.coMax.co1) : DEFAULT_CO_MAX.co1,
    co2: Number.isFinite(Number(ssa1Cfg?.coMax?.co2)) ? Number(ssa1Cfg.coMax.co2) : DEFAULT_CO_MAX.co2,
  };
  const CO_MAX = isReview ? { co1: 15, co2: 15 } : CO_MAX_BASE;
  const BTL_MAX = {
    btl1: getBtlMaxFromCfg(ssa1Cfg, 1, DEFAULT_BTL_MAX.btl1),
    btl2: getBtlMaxFromCfg(ssa1Cfg, 2, DEFAULT_BTL_MAX.btl2),
    btl3: getBtlMaxFromCfg(ssa1Cfg, 3, DEFAULT_BTL_MAX.btl3),
    btl4: getBtlMaxFromCfg(ssa1Cfg, 4, DEFAULT_BTL_MAX.btl4),
    btl5: getBtlMaxFromCfg(ssa1Cfg, 5, DEFAULT_BTL_MAX.btl5),
    btl6: getBtlMaxFromCfg(ssa1Cfg, 6, DEFAULT_BTL_MAX.btl6),
  };

  const BTL_MAX_WHEN_VISIBLE = isReview ? 30 : DEFAULT_BTL_MAX_WHEN_VISIBLE;

  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
        // Keep local rows, but adopt master term + subject for sheet label.
        setSheet((p) => ({ ...p, termLabel: String((cfg as any)?.termLabel || p.termLabel || 'KRCT AY25-26'), batchLabel: subjectId }));
      } catch {
        // If master config fails, continue with local defaults.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [selectedBtls, setSelectedBtls] = useState<number[]>(() => (isReview ? [3, 4] : []));

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const draftLoadedRef = useRef(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [viewMarksModalOpen, setViewMarksModalOpen] = useState(false);
  const [publishedEditModalOpen, setPublishedEditModalOpen] = useState(false);
  const [editRequestReason, setEditRequestReason] = useState('');
  const [editRequestBusy, setEditRequestBusy] = useState(false);
  const [editRequestError, setEditRequestError] = useState<string | null>(null);
  const [publishedViewSnapshot, setPublishedViewSnapshot] = useState<PublishedSsa1Response | null>(null);
  const [publishedViewLoading, setPublishedViewLoading] = useState(false);
  const [publishedViewError, setPublishedViewError] = useState<string | null>(null);
  const [showAbsenteesOnly, setShowAbsenteesOnly] = useState(false);
  const [absenteesSnapshot, setAbsenteesSnapshot] = useState<number[] | null>(null);

  const {
    data: publishWindow,
    loading: publishWindowLoading,
    error: publishWindowError,
    remainingSeconds,
    publishAllowed,
    refresh: refreshPublishWindow,
  } = usePublishWindow({ assessment: assessmentKey, subjectCode: subjectId, teachingAssignmentId });

  const {
    data: markLock,
    loading: markLockLoading,
    error: markLockError,
    refresh: refreshMarkLock,
  } = useMarkTableLock({ assessment: assessmentKey, subjectCode: String(subjectId || ''), teachingAssignmentId, options: { poll: false } });
  const { data: markManagerEditWindow } = useEditWindow({ assessment: assessmentKey, subjectCode: String(subjectId || ''), scope: 'MARK_MANAGER', teachingAssignmentId, options: { poll: false } });
  const { data: markEntryEditWindow } = useEditWindow({ assessment: assessmentKey, subjectCode: String(subjectId || ''), scope: 'MARK_ENTRY', teachingAssignmentId, options: { poll: false } });

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  const [markManagerModal, setMarkManagerModal] = useState<null | { mode: 'confirm' | 'request' }>(null);
  const [markManagerBusy, setMarkManagerBusy] = useState(false);
  const [markManagerError, setMarkManagerError] = useState<string | null>(null);
  const [markManagerAnimating, setMarkManagerAnimating] = useState(false);

  // Published must be derived from the authoritative lock state.
  // The `*-published` endpoints always return a JSON shape (even when empty),
  // so `publishedViewSnapshot` is NOT a reliable signal for publish status.
  const isPublished = Boolean(publishedAt) || Boolean(markLock?.exists && markLock?.is_published);

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

  const [publishConsumedApprovals, setPublishConsumedApprovals] = useState<null | {
    markEntryApprovalUntil: string | null;
    markManagerApprovalUntil: string | null;
  }>(null);

  useEffect(() => {
    // Changing subjects should reset any "consumed approval" snapshot.
    setPublishConsumedApprovals(null);
    // Also clear published UI state when switching assessments (SSA1 <-> Review1)
    // to avoid reusing the previous tab's snapshot.
    setPublishedAt(null);
    setPublishedViewSnapshot(null);
    setPublishedViewError(null);
    setPublishedEditModalOpen(false);
    setEditRequestReason('');
    setEditRequestError(null);
  }, [subjectId, assessmentKey, teachingAssignmentId]);

  const markManagerLocked = Boolean(sheet.markManagerLocked);
  const markManagerConfirmed = Boolean(sheet.markManagerSnapshot != null) || Boolean(markLock?.exists && markLock?.mark_manager_locked);

  const markEntryApprovalUntil = markEntryEditWindow?.approval_until ? String(markEntryEditWindow.approval_until) : null;
  const markManagerApprovalUntil = markManagerEditWindow?.approval_until ? String(markManagerEditWindow.approval_until) : null;
  const markEntryApprovedFresh =
    Boolean(markEntryEditWindow?.allowed_by_approval) &&
    Boolean(markEntryApprovalUntil) &&
    markEntryApprovalUntil !== (publishConsumedApprovals?.markEntryApprovalUntil ?? null);
  const markManagerApprovedFresh =
    Boolean(markManagerEditWindow?.allowed_by_approval) &&
    Boolean(markManagerApprovalUntil) &&
    markManagerApprovalUntil !== (publishConsumedApprovals?.markManagerApprovalUntil ?? null);

  // When published, the list must be locked unless IQAC explicitly opens editing.
  // Any approval that existed at the moment of publishing is treated as consumed.
  const entryOpen = !isPublished ? true : Boolean(markLock?.entry_open) || markEntryApprovedFresh || markManagerApprovedFresh;
  const publishedEditLocked = Boolean(isPublished && !entryOpen);

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

  // If we cannot verify lock/publish state (network/API error), default to read-only.
  const lockStatusUnknown = Boolean(subjectId) && (markLockLoading || Boolean(markLockError) || markLock == null);

  // Authoritative locking: if the server reports entry_open=false, do not allow editing
  // even if local UI state thinks Mark Manager is confirmed.
  const tableBlocked = Boolean(
    globalLocked ||
      lockStatusUnknown ||
      (markLock ? !markLock.entry_open : isPublished ? !entryOpen : !markManagerLocked),
  );

  const marksEditDisabled = Boolean(globalLocked || publishedEditLocked || tableBlocked);

  // Show the table only after Mark Manager has been confirmed (snapshot saved).
  // When published and locked, the table remains visible but strictly read-only.
  const showNameList = Boolean(sheet.markManagerSnapshot != null);

  const visibleBtlIndices = useMemo(() => {
    const set = new Set(selectedBtls);
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [selectedBtls]);

  const totalTableCols = useMemo(() => {
    // Layout matching the Excel header template, but BTL columns are dynamic.
    // S.No, RegNo, Name, SSA1 = 4 (and optional Total = +1)
    // CO Attainment (CO-1 Mark/% + CO-2 Mark/%) = 4
    // BTL Attainment = selected count * 2 (Mark/% per BTL)
    const base = showTotalColumn ? 9 : 8;
    return base + visibleBtlIndices.length * 2;
  }, [visibleBtlIndices.length, showTotalColumn]);

  const hasAbsentees = useMemo(() => {
    try {
      return sheet.rows.some((r) => Boolean((r as any).absent) || Object.values(r).some((v) => typeof v === 'string' && String(v).toLowerCase().includes('absent')));
    } catch {
      return false;
    }
  }, [sheet.rows]);

  const rowsToRender = useMemo(() => {
    if (!showAbsenteesOnly) return sheet.rows;
    if (absenteesSnapshot && absenteesSnapshot.length) return sheet.rows.filter((r) => absenteesSnapshot.includes(Number((r as any).studentId)));
    return sheet.rows.filter((r) => Boolean((r as any).absent) || Object.values(r).some((v) => typeof v === 'string' && String(v).toLowerCase().includes('absent')));
  }, [sheet.rows, showAbsenteesOnly, absenteesSnapshot]);

  // Persist selected BTLs to localStorage and autosave to server (debounced)
  useEffect(() => {
    if (!subjectId) return;
    if (!draftLoadedRef.current) return;
    try {
      const sk = `${assessmentKey}_selected_btls_${subjectId}`;
      lsSet(sk, selectedBtls);
    } catch {}

    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const payload: Ssa1DraftPayload = { sheet, selectedBtls };
          await saveDraft(assessmentKey, subjectId, payload);
        try {
          if (key) lsSet(key, { termLabel: sheet.termLabel, batchLabel: sheet.batchLabel, rows: sheet.rows, coSplitMax: (sheet as any).coSplitMax });
        } catch {}
        if (!cancelled) setSavedAt(new Date().toLocaleString());
      } catch {
        // ignore autosave errors
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [selectedBtls, subjectId, sheet, assessmentKey, key]);

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<Ssa1Sheet>(key);
    if (stored && typeof stored === 'object' && Array.isArray((stored as any).rows)) {
      setSheet({
        termLabel: masterCfg?.termLabel ? String(masterCfg.termLabel) : String((stored as any).termLabel || 'KRCT AY25-26'),
        batchLabel: subjectId,
        rows: (stored as any).rows,
        coSplitMax: (stored as any).coSplitMax ?? (isReview ? { co1: [''], co2: [''] } : undefined),
      });
    } else {
      setSheet({ termLabel: masterTermLabel || 'KRCT AY25-26', batchLabel: subjectId, rows: [], coSplitMax: isReview ? { co1: [''], co2: [''] } : undefined });
    }
  }, [key, subjectId, masterCfg, masterTermLabel]);

  // Load draft from DB (preferred) and merge into local state.
  useEffect(() => {
    let mounted = true;
    draftLoadedRef.current = false;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<Ssa1DraftPayload>(assessmentKey, subjectId);
        if (!mounted) return;
        const d = res?.draft;
        const draftSheet = (d as any)?.sheet;
        const draftBtls = (d as any)?.selectedBtls;
        if (draftSheet && typeof draftSheet === 'object' && Array.isArray((draftSheet as any).rows)) {
          setSheet((prev) => ({
            ...prev,
            termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
            batchLabel: subjectId,
            rows: (draftSheet as any).rows,
            coSplitMax: (draftSheet as any)?.coSplitMax ?? prev.coSplitMax ?? (isReview ? { co1: [''], co2: [''] } : undefined),
            // mark manager metadata from server draft (if present)
            markManagerSnapshot: (draftSheet as any)?.markManagerSnapshot ?? prev.markManagerSnapshot ?? null,
            markManagerApprovalUntil: (draftSheet as any)?.markManagerApprovalUntil ?? prev.markManagerApprovalUntil ?? null,
            markManagerLocked: typeof (draftSheet as any)?.markManagerLocked === 'boolean' ? (draftSheet as any).markManagerLocked : Boolean((draftSheet as any)?.markManagerSnapshot ?? prev.markManagerSnapshot),
          }));
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
          // Persist server draft into localStorage so roster merge will pick it up
          try {
            if (key)
              lsSet(key, {
                termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
                batchLabel: subjectId,
                rows: (draftSheet as any).rows,
                coSplitMax: (draftSheet as any)?.coSplitMax ?? (isReview ? { co1: [''], co2: [''] } : undefined),
              });
          } catch {
            // ignore localStorage errors
          }
        }
        if (Array.isArray(draftBtls)) {
          setSelectedBtls(draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)));
          try {
            const sk = `${assessmentKey}_selected_btls_${subjectId}`;
            lsSet(sk, draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)));
          } catch {
            // ignore
          }
        }
      } catch {
        // If draft fetch fails, keep local fallback.
      }
      if (mounted) draftLoadedRef.current = true;
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId, masterTermLabel, assessmentKey, key]);

  // Mark Manager workflow sync: keep local sheet lock state in sync with server lock/approval
  useEffect(() => {
    if (!subjectId) return;

    const isPublished = Boolean(markLock?.exists && markLock?.is_published) || Boolean(publishedAt);
    if (isPublished && markLock?.exists) {
      const nextLocked = Boolean(markLock?.mark_manager_locked);
      if (Boolean(sheet.markManagerLocked) !== nextLocked) {
        setSheet((p) => ({ ...p, markManagerLocked: nextLocked }));
      }
      return;
    }

    const allowedByApproval = Boolean(markManagerEditWindow?.allowed_by_approval);
    const approvalUntil = markManagerEditWindow?.approval_until ? String(markManagerEditWindow.approval_until) : null;

    if (allowedByApproval && approvalUntil) {
      // If this approval existed during the last publish, treat it as consumed.
      if (approvalUntil === (publishConsumedApprovals?.markManagerApprovalUntil ?? null)) return;
      const lastApprovalUntil = sheet.markManagerApprovalUntil ? String(sheet.markManagerApprovalUntil) : null;
      if (Boolean(sheet.markManagerLocked) && lastApprovalUntil !== approvalUntil) {
        setSheet((p) => ({ ...p, markManagerLocked: false, markManagerApprovalUntil: approvalUntil }));
      }
      return;
    }

  }, [
    subjectId,
    markLock?.exists,
    markLock?.mark_manager_locked,
    markManagerEditWindow?.allowed_by_approval,
    markManagerEditWindow?.approval_until,
    sheet.markManagerLocked,
    publishedAt,
    publishConsumedApprovals?.markManagerApprovalUntil,
    sheet.markManagerApprovalUntil,
  ]);


  const mergeRosterIntoRows = (students: TeachingAssignmentRosterStudent[]) => {
    setSheet((prev) => {
      const existingById = new Map<number, Ssa1Row>();
      const existingByReg = new Map<string, Ssa1Row>();
      for (const r of prev.rows || []) {
        if (typeof (r as any).studentId === 'number') existingById.set((r as any).studentId, r as any);
        if (r.registerNo) existingByReg.set(String(r.registerNo), r);
      }

      const nextRows: Ssa1Row[] = (students || [])
        .slice()
        .sort(compareStudentName)
        .map((s) => {
          const prevRow = existingById.get(s.id) || existingByReg.get(String(s.reg_no || ''));
          return {
            studentId: s.id,
            section: String(s.section || ''),
            registerNo: String(s.reg_no || ''),
            name: String(s.name || ''),
            total:
              typeof (prevRow as any)?.total === 'number'
                ? clamp(Number((prevRow as any).total), 0, MAX_ASMT1)
                : (prevRow as any)?.total === ''
                  ? ''
                  : '',
          };
        });

      return { ...prev, rows: nextRows };
    });
  };

  const loadRoster = async () => {
    if (!subjectId) {
      setRosterError('Subject ID is required.');
      return;
    }
    setRosterLoading(true);
    setRosterError(null);
    try {
      let roster: TeachingAssignmentRosterStudent[] = [];
      
      // ALWAYS check user's TAs first (matching CIA logic) - handles electives correctly
      let matchedTa: any = null;
      try {
        const myTAs = await fetchMyTeachingAssignments();
        console.log('[SSA1] My TAs:', myTAs?.length, 'for subject:', subjectId, 'teachingAssignmentId:', teachingAssignmentId);
        matchedTa = (myTAs || []).find((t: any) => {
          const codeMatch = String(t.subject_code || '').trim().toUpperCase() === String(subjectId || '').trim().toUpperCase();
          const idMatch = teachingAssignmentId ? t.id === teachingAssignmentId : false;
          return idMatch || codeMatch;
        });
        
        if (matchedTa) {
          console.log('[SSA1] Found TA match:', matchedTa.id, 'elective_subject_id:', matchedTa.elective_subject_id, 'section_id:', matchedTa.section_id);
        } else {
          console.log('[SSA1] No TA match found in user TAs');
        }
      } catch (err) {
        console.warn('[SSA1] My TAs fetch failed:', err);
      }

      // If we found a TA and it's an elective (has elective_subject_id, no section_id), fetch from elective-choices
      if (matchedTa && matchedTa.elective_subject_id && !matchedTa.section_id) {
        console.log('[SSA1] Detected elective, fetching elective-choices for elective_subject_id:', matchedTa.elective_subject_id);
        try {
          const esRes = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${encodeURIComponent(String(matchedTa.elective_subject_id))}`);
          if (esRes.ok) {
            const esData = await esRes.json();
            const items = Array.isArray(esData.results) ? esData.results : Array.isArray(esData) ? esData : (esData.items || []);
            console.log('[SSA1] Elective choices returned:', items?.length, 'students');
            roster = (items || []).map((s: any) => ({ 
              id: Number(s.student_id ?? s.id), 
              reg_no: String(s.reg_no ?? s.regno ?? ''),
              name: String(s.name ?? s.full_name ?? s.username ?? ''),
              section: s.section_name ?? s.section ?? null 
            }));
          } else {
            console.warn('[SSA1] Elective-choices API returned error:', esRes.status);
          }
        } catch (err) {
          console.warn('[SSA1] Elective-choices fetch failed:', err);
        }
      }

      // If not elective or elective fetch failed, use regular TA roster
      if (!roster.length && matchedTa && matchedTa.id) {
        console.log('[SSA1] Fetching regular TA roster for TA ID:', matchedTa.id);
        try {
          const taResp = await fetchTeachingAssignmentRoster(matchedTa.id);
          roster = taResp.students || [];
          setTaMeta({
            courseName: String((taResp as any)?.teaching_assignment?.subject_name || matchedTa?.subject_name || ''),
            courseCode: String((taResp as any)?.teaching_assignment?.subject_code || matchedTa?.subject_code || subjectId || ''),
            className: String((taResp as any)?.teaching_assignment?.section_name || matchedTa?.section_name || ''),
          });
          console.log('[SSA1] Regular roster returned:', roster.length, 'students');
        } catch (err) {
          console.warn('[SSA1] TA roster fetch failed:', err);
        }
      }

      console.log('[SSA1] Final roster count:', roster.length);
      mergeRosterIntoRows(roster);
    } catch (e: any) {
      setRosterError(e?.message || 'Failed to load roster');
    } finally {
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    // When section or subject changes, refresh roster but preserve existing marks.
    if (!subjectId) return;
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachingAssignmentId, subjectId]);

  async function refreshPublishedSnapshot(showLoading: boolean) {
    if (!subjectId) return;
    if (showLoading) setPublishedViewLoading(true);
    setPublishedViewError(null);
    try {
      const resp = await fetchPublished(String(subjectId));
      setPublishedViewSnapshot(resp || null);
    } catch (e: any) {
      if (showLoading) setPublishedViewError(e?.message || `Failed to load published ${displayLabel} marks`);
    } finally {
      if (showLoading) setPublishedViewLoading(false);
    }
  }

  useEffect(() => {
    if (!subjectId) return;
    refreshPublishedSnapshot(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, assessmentKey, teachingAssignmentId]);

  const prevEntryOpenRef = useRef<boolean | null>(null);
  useEffect(() => {
    // Switching between SSA1 and Review1 reuses the same component; reset
    // the edge-trigger detector so it doesn't incorrectly skip reload.
    prevEntryOpenRef.current = null;
  }, [subjectId, assessmentKey, teachingAssignmentId]);
  useEffect(() => {
    // When IQAC opens MARK_ENTRY edits post-publish, reload the editable draft.
    if (!subjectId) return;
    if (!isPublished) return;
    if (!entryOpen) {
      prevEntryOpenRef.current = false;
      return;
    }

    const prev = prevEntryOpenRef.current;
    prevEntryOpenRef.current = true;
    if (prev === true) return;

    let mounted = true;
    (async () => {
      try {
        const res = await fetchDraft<Ssa1DraftPayload>(assessmentKey, String(subjectId));
        if (!mounted) return;
        const d = res?.draft;
        const draftSheet = (d as any)?.sheet;
        const draftBtls = (d as any)?.selectedBtls;
        if (draftSheet && typeof draftSheet === 'object' && Array.isArray((draftSheet as any).rows)) {
          const hasMarks = (draftSheet as any).rows.some((r: any) => r?.total !== '' && r?.total != null);
          if (hasMarks) {
            setSheet((prevSheet) => ({
              ...prevSheet,
              termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
              batchLabel: subjectId,
              rows: (draftSheet as any).rows,
              markManagerSnapshot: (draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot ?? null,
              markManagerApprovalUntil: (draftSheet as any)?.markManagerApprovalUntil ?? prevSheet.markManagerApprovalUntil ?? null,
              markManagerLocked: typeof (draftSheet as any)?.markManagerLocked === 'boolean' ? (draftSheet as any).markManagerLocked : Boolean((draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot),
            }));
            if (Array.isArray(draftBtls)) {
              setSelectedBtls(draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)));
            }
            draftLoadedRef.current = true;
            return;
          }
        }
      } catch {
        // ignore and fall back
      }

      if (!mounted) return;
      // Fallback: re-fetch published snapshot for view purposes.
      refreshPublishedSnapshot(false);
    })();

    return () => {
      mounted = false;
    };
  }, [entryOpen, isPublished, subjectId, assessmentKey, masterTermLabel]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMarksModalOpen, subjectId]);

  const saveDraftToDb = async () => {
    setSavingDraft(true);
    setSaveError(null);
    try {
      const payload: Ssa1DraftPayload = { sheet, selectedBtls };
      await saveDraft(assessmentKey, subjectId, payload);
      setSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setSaveError(e?.message || `Failed to save ${displayLabel} draft`);
    } finally {
      setSavingDraft(false);
    }
  };

  // Auto-save draft when switching tabs
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const btlRef = useRef(selectedBtls);
  btlRef.current = selectedBtls;
  useEffect(() => {
    const handler = () => {
      if (!subjectId || tableBlocked) return;
      const payload: Ssa1DraftPayload = { sheet: sheetRef.current, selectedBtls: btlRef.current };
      saveDraft(assessmentKey, subjectId, payload).catch(() => {});
    };
    window.addEventListener('obe:before-tab-switch', handler);
    return () => window.removeEventListener('obe:before-tab-switch', handler);
  }, [subjectId, assessmentKey, tableBlocked]);

  const publish = async () => {
    if (!subjectId) return;
    if (globalLocked) {
      setSaveError('Publishing is locked by IQAC.');
      return;
    }
    if (!publishAllowed) {
      setSaveError('Publish window is closed. Please request IQAC approval.');
      return;
    }

    if (isReview) {
      const a = safeSplitArr((sheet as any)?.coSplitMax?.co1, CO_MAX.co1);
      const b = safeSplitArr((sheet as any)?.coSplitMax?.co2, CO_MAX.co2);
      const ok1 = Math.abs(sumSplit(a) - CO_MAX.co1) < 1e-6;
      const ok2 = Math.abs(sumSplit(b) - CO_MAX.co2) < 1e-6;
      if (!ok1 || !ok2) {
        alert('CO split totals must equal 15 for both CO-1 and CO-2 before publishing.');
        return;
      }
    }

    setPublishing(true);
    setSaveError(null);
    try {
      await publishNow(subjectId, sheet, teachingAssignmentId);
      setPublishedAt(new Date().toLocaleString());
      // Consume any existing approvals so the table becomes locked immediately after Publish.
      setPublishConsumedApprovals({
        markEntryApprovalUntil,
        markManagerApprovalUntil,
      });
      // After publishing, ensure Mark Manager is re-locked locally so the UI
      // shows the published-locked state (View / Request Edit). Server-side
      // lock state will be refreshed via refreshMarkLock, but set local
      // lock to avoid transient editable state.
      setSheet((p) => ({ ...p, markManagerLocked: true }));
      refreshPublishWindow();
      refreshMarkLock({ silent: true });
      refreshPublishedSnapshot(false);
      try {
        console.debug('obe:published dispatch', { assessment: assessmentKey, subjectId });
        window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId, assessment: assessmentKey } }));
      } catch {
        // ignore
      }
    } catch (e: any) {
      setSaveError(e?.message || `Failed to publish ${displayLabel}`);
    } finally {
      setPublishing(false);
    }
  };

  const requestApproval = async () => {
    setRequesting(true);
    setRequestMessage(null);
    setSaveError(null);
    try {
      await createPublishRequest({ assessment: assessmentKey, subject_code: subjectId, reason: requestReason, teaching_assignment_id: teachingAssignmentId });
      setRequestMessage('Request sent to IQAC for approval.');
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to request approval');
    } finally {
      setRequesting(false);
      refreshPublishWindow();
    }
  };

  function markManagerSnapshotOf(s: Ssa1Sheet): string {
    return JSON.stringify({
      maxTotal: MAX_ASMT1,
      coMax: CO_MAX,
      selectedBtls: selectedBtls.slice(),
      btlMax: BTL_MAX,
    });
  }

  async function requestMarkManagerEdit() {
    if (!subjectId) return;
    setMarkManagerBusy(true);
    setMarkManagerError(null);
    try {
      const created = await createEditRequest({ assessment: assessmentKey, subject_code: String(subjectId), scope: 'MARK_MANAGER', reason: `Edit request: Mark Manager changes for ${displayLabel} ${subjectId}`, teaching_assignment_id: teachingAssignmentId });
      alert(formatEditRequestSentMessage(created));
    } catch (e: any) {
      const msg = formatApiErrorMessage(e, 'Request failed');
      setMarkManagerError(msg);
      alert(`Edit request failed: ${msg}`);
    } finally {
      setMarkManagerBusy(false);
    }
  }

  async function requestMarkEntryEdit() {
    if (!subjectId) return;

    const mobileOk = await ensureMobileVerified();
    if (!mobileOk) {
      alert('Please verify your mobile number in Profile before requesting edits.');
      window.location.href = '/profile';
      return;
    }

    if (markEntryReqPending) {
      alert('Edit request is pending. Please wait for approval.');
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
        assessment: assessmentKey,
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
      refreshPublishWindow();
    } catch (e: any) {
      const msg = formatApiErrorMessage(e, 'Request failed');
      setEditRequestError(msg);
      alert(`Edit request failed: ${msg}`);
    } finally {
      setEditRequestBusy(false);
    }
  }

  async function confirmMarkManager() {
    if (!subjectId) return;
    setMarkManagerBusy(true);
    setMarkManagerError(null);
    try {
      const snapshot = markManagerSnapshotOf(sheet);
      const approvalUntil = markManagerEditWindow?.approval_until ? String(markManagerEditWindow.approval_until) : sheet.markManagerApprovalUntil || null;
      const nextSheet: Ssa1Sheet = { ...sheet, markManagerLocked: true, markManagerSnapshot: snapshot, markManagerApprovalUntil: approvalUntil };
      const payload: Ssa1DraftPayload = { sheet: nextSheet, selectedBtls };
      setSheet(nextSheet);
      setMarkManagerModal(null);
      setMarkManagerAnimating(true);

      await saveDraft(assessmentKey, String(subjectId), payload);
      setSavedAt(new Date().toLocaleString());

      try {
        await confirmMarkManagerLock(assessmentKey, String(subjectId), teachingAssignmentId);
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
  }

  const resetAllMarks = () => {
    if (!confirm(`Reset ${displayLabel} marks for all students in this section?`)) return;
    if (tableBlocked) return;
    setSheet((prev) => ({
      ...prev,
      rows: (prev.rows || []).map((r) => ({ ...r, total: '' })),
    }));
  };

  const updateRow = (idx: number, patch: Partial<Ssa1Row>) => {
    setSheet((prev) => {
      const copy = prev.rows.slice();
      const existing = copy[idx] || ({ studentId: 0, section: '', registerNo: '', name: '', total: '' } as Ssa1Row);
      copy[idx] = { ...existing, ...patch };
      return { ...prev, rows: copy };
    });
  };

  const exportSheetCsv = () => {
    const out = sheet.rows.map((r, i) => {
      const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT1) : null;
      const total = totalRaw == null ? '' : round1(totalRaw);

      const coSplitCount = 2;
      const coShare = totalRaw == null ? null : round1(totalRaw / coSplitCount);
      const co1 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co1);
      const co2 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co2);

      const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
      const rawBtlMaxByIndex = [BTL_MAX.btl1, BTL_MAX.btl2, BTL_MAX.btl3, BTL_MAX.btl4, BTL_MAX.btl5, BTL_MAX.btl6];
      const btlMaxByIndex = rawBtlMaxByIndex.map((rawMax, idx) => {
        if (!visibleIndicesZeroBased.includes(idx)) return rawMax;
        return isReview ? BTL_MAX_WHEN_VISIBLE : rawMax > 0 ? rawMax : DEFAULT_BTL_MAX_WHEN_VISIBLE;
      });
      const btlShare = totalRaw == null ? null : visibleIndicesZeroBased.length ? round1(totalRaw / visibleIndicesZeroBased.length) : 0;
      const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
        if (totalRaw == null) return null;
        if (!visibleIndicesZeroBased.includes(idx)) return null;
        if (max > 0) return clamp(btlShare as number, 0, max);
        return round1(btlShare as number);
      });

      const row: Record<string, string | number> = {
        sno: i + 1,
        registerNo: r.registerNo,
        name: r.name,
        co1_mark: co1 ?? '',
        co1_pct: pct(co1, CO_MAX.co1),
        co2_mark: co2 ?? '',
        co2_pct: pct(co2, CO_MAX.co2),
        btl1_mark: btlMarksByIndex[0] ?? '',
        btl1_pct: pct(btlMarksByIndex[0], btlMaxByIndex[0]),
        btl2_mark: btlMarksByIndex[1] ?? '',
        btl2_pct: pct(btlMarksByIndex[1], btlMaxByIndex[1]),
        btl3_mark: btlMarksByIndex[2] ?? '',
        btl3_pct: pct(btlMarksByIndex[2], btlMaxByIndex[2]),
        btl4_mark: btlMarksByIndex[3] ?? '',
        btl4_pct: pct(btlMarksByIndex[3], btlMaxByIndex[3]),
        btl5_mark: btlMarksByIndex[4] ?? '',
        btl5_pct: pct(btlMarksByIndex[4], btlMaxByIndex[4]),
        btl6_mark: btlMarksByIndex[5] ?? '',
        btl6_pct: pct(btlMarksByIndex[5], btlMaxByIndex[5]),
      };

      // Match the sheet header: Review 1 should not include a separate Total column.
      row[displayLabel] = total;
      if (showTotalColumn) row.total = total;
      return row;
    });

    downloadCsv(`${subjectId}_${safeFilePart(displayLabel) || 'SSA1'}_sheet.csv`, out);
  };

  const exportSheetExcel = () => {
    if (!sheet.rows.length) return;

    const q1Max = Number.isFinite(Number(CO_MAX.co1)) ? Number(CO_MAX.co1) : 0;
    const q2Max = Number.isFinite(Number(CO_MAX.co2)) ? Number(CO_MAX.co2) : 0;

    const header = ['Register No', 'Student Name', `Q1 (${q1Max.toFixed(2)})`, `Q2 (${q2Max.toFixed(2)})`, 'Status'];
    const data = sheet.rows.map((r) => [r.registerNo, r.name, '', '', 'present']);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, displayLabel || 'SSA1');

    const filename = `${subjectId}_${safeFilePart(displayLabel) || 'SSA1'}_template.xlsx`;
    (XLSX as any).writeFile(wb, filename);
  };

  const downloadTotals = async () => {
    const rows = sheet.rows.map((r, idx) => ({
      sno: idx + 1,
      regNo: String(r.registerNo || ''),
      name: String(r.name || ''),
      total: r.total === '' ? '' : Number(r.total),
    }));

    await downloadTotalsWithPrompt({
      filenameBase: `${subjectId}_${displayLabel}`,
      meta: {
        courseName: taMeta?.courseName || '',
        courseCode: taMeta?.courseCode || subjectId,
        className: taMeta?.className || '',
      },
      rows,
    });
  };

  function normalizeHeaderCell(v: any): string {
    return String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  const triggerExcelImport = () => {
    if (tableBlocked) return;
    excelFileInputRef.current?.click();
  };

  const importFromExcel = async (file: File) => {
    if (!file) return;
    setExcelBusy(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstName = workbook.SheetNames?.[0];
      if (!firstName) throw new Error('No sheet found in the Excel file.');
      const sheet0 = workbook.Sheets[firstName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet0, { header: 1 });
      if (!rows.length) throw new Error('Excel sheet is empty.');

      const headerRow = (rows[0] || []).map(normalizeHeaderCell);

      const findCol = (pred: (h: string) => boolean) => headerRow.findIndex((h) => pred(h));

      const regCol = findCol((h) => h === 'register no' || h === 'reg no' || h.includes('register'));
      const q1Col = findCol((h) => h.startsWith('q1'));
      const q2Col = findCol((h) => h.startsWith('q2'));
      const totalCol = findCol((h) => h === 'total' || h.includes('total'));
      const statusCol = findCol((h) => h === 'status' || h.includes('status'));

      if (regCol < 0) throw new Error('Could not find “Register No” column.');

      const q1Max = Number.isFinite(Number(CO_MAX.co1)) ? Number(CO_MAX.co1) : 0;
      const q2Max = Number.isFinite(Number(CO_MAX.co2)) ? Number(CO_MAX.co2) : 0;

      const regToIdx = new Map<string, number>();
      sheet.rows.forEach((r, idx) => {
        const full = String(r.registerNo || '').trim();
        if (full) regToIdx.set(full, idx);
        const short = shortenRegisterNo(full);
        if (short) regToIdx.set(short, idx);
      });

      setSheet((prev) => {
        const nextRows = prev.rows.slice();
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] || [];
          const reg = String(row[regCol] ?? '').trim();
          if (!reg) continue;
          const idx = regToIdx.get(reg);
          if (idx == null) continue;

          const statusRaw = statusCol >= 0 ? String(row[statusCol] ?? '') : '';
          const status = statusRaw.trim().toLowerCase();
          const isAbsent = status === 'absent' || status === 'ab' || status === 'a';

          const q1 = q1Col >= 0 ? readFiniteNumber(row[q1Col]) : null;
          const q2 = q2Col >= 0 ? readFiniteNumber(row[q2Col]) : null;
          const totalX = totalCol >= 0 ? readFiniteNumber(row[totalCol]) : null;

          const q1Clamped = q1 == null ? 0 : clamp(q1, 0, q1Max);
          const q2Clamped = q2 == null ? 0 : clamp(q2, 0, q2Max);

          const computedTotal = totalX != null ? totalX : q1Clamped + q2Clamped;
          const finalTotal = isAbsent ? 0 : clamp(computedTotal, 0, MAX_ASMT1);

          nextRows[idx] = {
            ...nextRows[idx],
            total: round1(finalTotal),
          };
        }
        return { ...prev, rows: nextRows };
      });
    } finally {
      setExcelBusy(false);
    }
  };

  const handleExcelFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importFromExcel(file);
    } catch (err: any) {
      alert(err?.message || 'Failed to import Excel');
    }
  };

  const cellTh: React.CSSProperties = {
    padding: '10px 12px',
    background: 'linear-gradient(180deg, rgba(11,74,111,0.06), rgba(240,249,255,0.06))',
    color: '#0b4a6f',
    textAlign: 'center',
    fontWeight: 800,
    fontSize: 12,
    borderBottom: '1px solid rgba(148,163,184,0.5)',
    borderRight: '1px solid rgba(226,232,240,0.8)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const cellTd: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 12,
    borderBottom: '1px solid rgba(226,232,240,0.9)',
    borderRight: '1px solid rgba(226,232,240,0.8)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(226,232,240,0.9)',
    outline: 'none',
    background: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    textAlign: 'center',
  };

  const splitInputStyle: React.CSSProperties = {
    width: 54,
    padding: '6px 8px',
    borderRadius: 10,
    border: '1px solid rgba(226,232,240,0.9)',
    outline: 'none',
    background: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    textAlign: 'center',
  };

  const splitButtonStyle: React.CSSProperties = {
    border: '1px solid rgba(226,232,240,0.9)',
    background: '#fff',
    borderRadius: 10,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    lineHeight: 1,
  };

  const coSplitMax = (sheet as any).coSplitMax as { co1?: Array<number | ''>; co2?: Array<number | ''> } | undefined;
  const safeSplitArr = (raw: any, fallbackMax: number): Array<number | ''> => {
    if (!Array.isArray(raw) || raw.length === 0) return [''];
    const mapped = raw
      .map((v) => {
        if (v === '') return '';
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? clamp(n, 0, fallbackMax) : '';
      })
      .slice(0, 15);

    // Enforce total <= fallbackMax by clamping each split to the remaining.
    let remaining = fallbackMax;
    return mapped.map((v) => {
      if (v === '') return '';
      const next = clamp(v, 0, remaining);
      remaining = clamp(remaining - next, 0, fallbackMax);
      return next;
    });
  };
  const sumSplit = (arr: Array<number | ''>) => arr.reduce((a, b) => a + (typeof b === 'number' && Number.isFinite(b) ? b : 0), 0);
  const padTo = <T,>(arr: T[], len: number, fill: T) => (arr.length >= len ? arr.slice(0, len) : arr.concat(Array.from({ length: len - arr.length }, () => fill)));

  // Review-only CO split rows (shared row count across CO-1 and CO-2)
  // Split config is a header-level setting; keep it editable even if the
  // student mark table is blocked by Mark Manager gating.
  const splitEditDisabled = Boolean(globalLocked || publishedEditLocked || (markManagerLocked && sheet.markManagerSnapshot != null));
  const co1SplitsRaw = isReview ? safeSplitArr((coSplitMax as any)?.co1, CO_MAX.co1) : [''];
  const co2SplitsRaw = isReview ? safeSplitArr((coSplitMax as any)?.co2, CO_MAX.co2) : [''];
  const coSplitRowCount = isReview ? Math.max(1, co1SplitsRaw.length, co2SplitsRaw.length) : 0;
  const co1Splits = isReview ? padTo(co1SplitsRaw, coSplitRowCount, '' as const) : ([] as Array<number | ''>);
  const co2Splits = isReview ? padTo(co2SplitsRaw, coSplitRowCount, '' as const) : ([] as Array<number | ''>);
  const co1TotalSplit = isReview ? sumSplit(co1Splits) : 0;
  const co2TotalSplit = isReview ? sumSplit(co2Splits) : 0;
  const reviewSplitsOk =
    !isReview || (Math.abs(co1TotalSplit - CO_MAX.co1) < 1e-6 && Math.abs(co2TotalSplit - CO_MAX.co2) < 1e-6);

  const addCoSplitRow = () => {
    if (!isReview || splitEditDisabled) return;
    setSheet((prev) => {
      const raw = (prev as any).coSplitMax || {};
      const a0 = safeSplitArr(raw.co1, CO_MAX.co1);
      const b0 = safeSplitArr(raw.co2, CO_MAX.co2);
      const len = Math.max(1, a0.length, b0.length);
      if (len >= 15) return prev;
      const nextA = padTo(a0, len, '' as const).concat(['']);
      const nextB = padTo(b0, len, '' as const).concat(['']);
      return { ...prev, coSplitMax: { ...(prev as any).coSplitMax, co1: nextA, co2: nextB } };
    });
  };

  const removeCoSplitRow = () => {
    if (!isReview || splitEditDisabled) return;
    setSheet((prev) => {
      const raw = (prev as any).coSplitMax || {};
      const a0 = safeSplitArr(raw.co1, CO_MAX.co1);
      const b0 = safeSplitArr(raw.co2, CO_MAX.co2);
      const len = Math.max(1, a0.length, b0.length);
      if (len <= 1) return prev;
      const nextA = padTo(a0, len, '' as const).slice(0, -1);
      const nextB = padTo(b0, len, '' as const).slice(0, -1);
      return { ...prev, coSplitMax: { ...(prev as any).coSplitMax, co1: nextA, co2: nextB } };
    });
  };

  const updateCoSplitAt = (coKey: 'co1' | 'co2', idx: number, rawVal: string) => {
    if (!isReview) return;
    setSheet((prev) => {
      const raw = (prev as any).coSplitMax || {};
      const a0 = safeSplitArr(raw.co1, CO_MAX.co1);
      const b0 = safeSplitArr(raw.co2, CO_MAX.co2);
      const len = Math.max(1, a0.length, b0.length, idx + 1);
      const a = padTo(a0, len, '' as const);
      const b = padTo(b0, len, '' as const);

      const target = coKey === 'co1' ? a : b;
      if (rawVal === '') {
        target[idx] = '';
        return { ...prev, coSplitMax: { ...(prev as any).coSplitMax, co1: a, co2: b } };
      }

      const n = Number(rawVal);
      const otherSum = target.reduce((acc, v, j) => {
        if (j === idx) return acc;
        return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      }, 0);
      const coMax = coKey === 'co1' ? CO_MAX.co1 : CO_MAX.co2;
      const remaining = clamp(coMax - otherSum, 0, coMax);
      const nextVal = Number.isFinite(n) ? clamp(n, 0, remaining) : '';
      target[idx] = nextVal as any;
      return { ...prev, coSplitMax: { ...(prev as any).coSplitMax, co1: a, co2: b } };
    });
  };

  const renderCoSplitHeaderCell = (coKey: 'co1' | 'co2', coMax: number, total: number) => {
    const arr = coKey === 'co1' ? co1Splits : co2Splits;
    const last = arr.length ? arr[arr.length - 1] : '';
    const lastFilled = typeof last === 'number' && Number.isFinite(last) && last > 0;
    const canAdd = Boolean(!splitEditDisabled && coSplitRowCount > 0 && coSplitRowCount < 15 && lastFilled && total < coMax - 1e-6);
    const canRemove = Boolean(!splitEditDisabled && coSplitRowCount > 1);
    const remaining = round1(coMax - total);
    const ok = Math.abs(remaining) < 1e-6;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 12 }}>{coMax}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            disabled={!canAdd}
            onClick={addCoSplitRow}
            style={{ ...splitButtonStyle, opacity: canAdd ? 1 : 0.6, cursor: canAdd ? 'pointer' : 'not-allowed' }}
            aria-label={`Add split row for ${coKey}`}
          >
            +
          </button>
          <button
            type="button"
            disabled={!canRemove}
            onClick={removeCoSplitRow}
            style={{ ...splitButtonStyle, opacity: canRemove ? 1 : 0.6, cursor: canRemove ? 'pointer' : 'not-allowed' }}
            aria-label={`Remove split row for ${coKey}`}
          >
            -
          </button>
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, color: ok ? '#065f46' : '#b91c1c' }}>{ok ? 'OK' : `Remaining ${remaining}`}</div>
      </div>
    );
  };

  const btlBoxStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: 999,
    background: '#fff',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 11,
  };

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 12,
    background: '#fff',
  };


  const toggleBtl = (n: number) => {
    if (globalLocked) return;
    if (markManagerBusy) return;
    // Allow editing BTLs inside the Mark Manager confirmation modal even if
    // the sheet is currently locked (unsaved). If the Mark Manager has been
    // previously confirmed (snapshot exists) and is locked, prevent changes.
    const markManagerConfirmed = sheet.markManagerSnapshot != null;
    if (markManagerLocked && markManagerConfirmed) return;
    setSelectedBtls((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : prev.concat(n).sort((a, b) => a - b)));
  };

  const selectAllBtl = () => {
    if (globalLocked || markManagerBusy || markManagerLocked) return;
    setSelectedBtls([1, 2, 3, 4, 5, 6]);
  };
  const clearAllBtl = () => {
    if (globalLocked || markManagerBusy || markManagerLocked) return;
    setSelectedBtls([]);
  };

  const publishButtonIsRequestEdit = Boolean(isPublished && publishedEditLocked);
  const openEditRequestModal = async () => {
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
    setEditRequestError(null);
    setPublishedEditModalOpen(true);
  };
  const publishButtonOnClick = publishButtonIsRequestEdit ? openEditRequestModal : publish;
  const publishButtonDisabled = publishButtonIsRequestEdit ? markEntryReqPending : Boolean(publishing || !publishAllowed || tableBlocked || !reviewSplitsOk);

  return (
    <>
      {/* Standardized assessment container */}
      <AssessmentContainer>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={loadRoster} className="obe-btn obe-btn-secondary" disabled={rosterLoading}>
              {rosterLoading ? 'Loading roster…' : 'Load/Refresh Roster'}
            </button>
            <button onClick={resetAllMarks} className="obe-btn obe-btn-danger" disabled={!sheet.rows.length}>
              Reset Marks
            </button>
            <button
              className="obe-btn obe-btn-secondary"
              disabled={!hasAbsentees}
              onClick={() => {
                if (showAbsenteesOnly) return;
                const snap = sheet.rows
                  .filter((s) => Boolean((s as any).absent) || Object.values(s).some((v) => typeof v === 'string' && String(v).toLowerCase().includes('absent')))
                  .map((s) => Number((s as any).studentId))
                  .filter((n) => Number.isFinite(n));
                setAbsenteesSnapshot(snap.length ? snap : null);
                setShowAbsenteesOnly(true);
              }}
              title={hasAbsentees ? 'Filter the table to show only absentees' : 'No absentees marked yet'}
              style={showAbsenteesOnly ? { background: 'linear-gradient(180deg, #111827, #334155)', color: '#fff', borderColor: 'rgba(2,6,23,0.12)' } : undefined}
            >
              Show absentees list
              {showAbsenteesOnly ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAbsenteesOnly(false);
                    setAbsenteesSnapshot(null);
                  }}
                  role="button"
                  aria-label="Close absentees list"
                  title="Close absentees list"
                  style={{
                    marginLeft: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    fontWeight: 900,
                    lineHeight: 1,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  ×
                </span>
              ) : null}
            </button>
            <button onClick={exportSheetCsv} className="obe-btn obe-btn-secondary" disabled={!sheet.rows.length}>
              Export CSV
            </button>
            <button onClick={exportSheetExcel} className="obe-btn obe-btn-secondary" disabled={!sheet.rows.length}>
              Export Excel
            </button>
            <button onClick={triggerExcelImport} className="obe-btn obe-btn-secondary" disabled={!sheet.rows.length || tableBlocked || excelBusy}>
              {excelBusy ? 'Importing…' : 'Import Excel'}
            </button>
            <input
              ref={excelFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleExcelFileSelect}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={downloadTotals} className="obe-btn obe-btn-secondary" disabled={!sheet.rows.length}>
              Download
            </button>
            <button
              onClick={saveDraftToDb}
              className="obe-btn obe-btn-success"
              disabled={savingDraft || tableBlocked}
              title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
            >
              {savingDraft ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              onClick={publishButtonOnClick}
              className="obe-btn obe-btn-primary"
              disabled={publishButtonDisabled}
              title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
            >
              {publishButtonIsRequestEdit ? (markEntryReqPending ? 'Request Pending' : 'Request Edit') : publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Term</div>
            <div style={{ fontWeight: 700 }}>{sheet.termLabel || '—'}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Batch</div>
            <div style={{ fontWeight: 700 }}>{sheet.batchLabel || '—'}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Saved</div>
            <div style={{ fontWeight: 700 }}>{savedAt || '—'}</div>
            {savedBy ? <div style={{ fontSize: 12, color: '#6b7280' }}>by <span style={{ color: '#0369a1', fontWeight: 700 }}>{savedBy}</span></div> : null}
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Published</div>
            <div style={{ fontWeight: 700 }}>{publishedAt || '—'}</div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: publishAllowed ? '#065f46' : '#b91c1c' }}>
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
          <div style={{ marginTop: 10, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Publishing disabled by IQAC</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              Global publishing is turned OFF for this assessment. You can view the sheet, but editing and publishing are locked.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="obe-btn" onClick={() => refreshPublishWindow()} disabled={publishWindowLoading}>Refresh</button>
            </div>
          </div>
        ) : !publishAllowed ? (
          <div style={{ marginTop: 10, border: '1px solid #fecaca', background: '#fff7ed', borderRadius: 12, padding: 12 }}>
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
      {viewMarksModalOpen ? (
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
              zIndex: 70,
            }}
            onClick={() => setViewMarksModalOpen(false)}
          >
            <div style={{ width: 'min(1100px, 96vw)', maxHeight: 'min(80vh, 900px)', overflowY: 'auto', overflowX: 'hidden', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 14 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>View Published {displayLabel}</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{displayLabel}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMarksModalOpen(false);
                }}
                aria-label="Close"
                style={{ marginLeft: 8, border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {publishedViewLoading ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading published marks…</div> : null}
            {publishedViewError ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{publishedViewError}</div> : null}

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
              <table className="ssa-modern-table" style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 920 }}>
                <thead>
                  <tr>
                    <th style={cellTh} colSpan={totalTableCols}>
                      {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {displayLabel}
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...cellTh, width: 42, minWidth: 42 }} rowSpan={isReview ? 4 + coSplitRowCount : 4}>S.No</th>
                    <th style={cellTh} rowSpan={isReview ? 4 + coSplitRowCount : 4}>Register No.</th>
                    <th style={cellTh} rowSpan={3}>Name of the Students</th>

                    <th style={cellTh}>{displayLabel}</th>
                    {showTotalColumn ? <th style={cellTh}>Total</th> : null}

                    <th style={cellTh} colSpan={4}>CO ATTAINMENT</th>
                    {visibleBtlIndices.length ? <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th> : null}
                  </tr>
                  <tr>
                    <th style={cellTh}>
                      <div style={{ fontWeight: 800 }}>COs</div>
                      <div style={{ fontSize: 12 }}>1,2</div>
                    </th>
                    {showTotalColumn ? <th style={cellTh} /> : null}

                    <th style={cellTh} colSpan={2}>CO-1</th>
                    <th style={cellTh} colSpan={2}>CO-2</th>

                    {visibleBtlIndices.map((n) => (
                      <th key={`btl-head-${n}`} style={cellTh} colSpan={2}>
                        BTL-{n}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th style={cellTh}>
                      <div style={{ fontWeight: 800 }}>BTL</div>
                      <div style={{ fontSize: 12 }}>{visibleBtlIndices.length ? visibleBtlIndices.join(',') : '-'}</div>
                    </th>
                    {showTotalColumn ? <th style={cellTh} /> : null}

                    {Array.from({ length: 2 + visibleBtlIndices.length }).flatMap((_, i) => (
                      <React.Fragment key={i}>
                        <th style={cellTh}>Mark</th>
                        <th style={cellTh}>%</th>
                      </React.Fragment>
                    ))}
                  </tr>
                  <tr>
                    <th style={cellTh}>Name / Max Marks</th>
                    <th style={cellTh}>{MAX_ASMT1}</th>
                    {showTotalColumn ? <th style={cellTh}>{MAX_ASMT1}</th> : null}
                    <th style={cellTh}>{CO_MAX.co1}</th>
                    <th style={cellTh}>%</th>
                    <th style={cellTh}>{CO_MAX.co2}</th>
                    <th style={cellTh}>%</th>
                    {visibleBtlIndices.flatMap((n) => [
                      <th key={`btl-max-${n}`} style={cellTh}>
                        {isReview
                          ? String(BTL_MAX_WHEN_VISIBLE)
                          : String(Math.max(Number((BTL_MAX as any)[`btl${n}`] ?? 0) || 0, DEFAULT_BTL_MAX_WHEN_VISIBLE))}
                      </th>,
                      <th key={`btl-pct-${n}`} style={cellTh}>%</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.length === 0 ? (
                    <tr>
                      <td colSpan={totalTableCols} style={{ padding: 14, color: '#6b7280', fontSize: 13 }}>
                        No students loaded yet. Choose a Teaching Assignment above, then click “Load/Refresh Roster”.
                      </td>
                    </tr>
                  ) : (
                    rowsToRender.map((r, idx) => {
                      const raw = publishedViewSnapshot?.marks?.[String(r.studentId)] ?? null;
                      const numericTotal = raw == null || raw === '' ? null : clamp(Number(raw), 0, MAX_ASMT1);

                      const coSplitCount = 2;
                      const coShare = numericTotal == null ? null : round1(numericTotal / coSplitCount);
                      const co1 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co1);
                      const co2 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co2);

                      const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                      const rawBtlMaxByIndex = [BTL_MAX.btl1, BTL_MAX.btl2, BTL_MAX.btl3, BTL_MAX.btl4, BTL_MAX.btl5, BTL_MAX.btl6];
                      const btlMaxByIndex = rawBtlMaxByIndex.map((rawMax, idx) => {
                        if (!visibleIndicesZeroBased.includes(idx)) return rawMax;
                        return isReview ? BTL_MAX_WHEN_VISIBLE : rawMax > 0 ? rawMax : DEFAULT_BTL_MAX_WHEN_VISIBLE;
                      });
                      const btlShare = numericTotal == null ? null : visibleIndicesZeroBased.length ? round1(numericTotal / visibleIndicesZeroBased.length) : 0;
                      const btlMarksByIndex = btlMaxByIndex.map((max, i) => {
                        if (numericTotal == null) return null;
                        if (!visibleIndicesZeroBased.includes(i)) return null;
                        if (max > 0) return clamp(btlShare as number, 0, max);
                        return round1(btlShare as number);
                      });

                      return (
                        <tr key={String(r.studentId || idx)} style={{ background: idx % 2 === 1 ? '#f8fafc' : '#fff' }}>
                          <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42, paddingLeft: 2, paddingRight: 2 }}>{idx + 1}</td>
                          <td style={cellTd}>{shortenRegisterNo(r.registerNo)}</td>
                          <td style={cellTd}>{r.name}</td>
                          <td style={{ ...cellTd, width: 90, background: '#fff7ed', textAlign: 'center' }}>{numericTotal == null ? '' : round1(numericTotal)}</td>
                          {showTotalColumn ? <td style={{ ...cellTd, textAlign: 'center' }}>{numericTotal == null ? '' : round1(numericTotal)}</td> : null}
                          <td style={{ ...cellTd, textAlign: 'center' }}>{co1 ?? ''}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co1 as any, CO_MAX.co1)}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{co2 ?? ''}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co2 as any, CO_MAX.co2)}</td>
                          {visibleBtlIndices.map((btl) => {
                            const idx0 = btl - 1;
                            const mark = btlMarksByIndex[idx0];
                            const max = btlMaxByIndex[idx0];
                            return (
                              <React.Fragment key={btl}>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{mark ?? ''}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{pct(mark as any, max)}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="obe-btn" onClick={() => setViewMarksModalOpen(false)}>Close</button>
            </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {(rosterError || saveError) && (
          <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>
            {rosterError || saveError}
          </div>
      )}


      <div style={{ marginTop: 12, ...cardStyle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800 }}>Mark Manager</div>
            <div>
              <button
                className="obe-btn obe-btn-success"
                onClick={() => {
                  // If Mark Manager has not been confirmed (no snapshot), open confirm modal
                  // to allow selecting BTLs and saving. If already confirmed, open request mode.
                  setMarkManagerModal({ mode: markManagerConfirmed ? 'request' : 'confirm' });
                }}
                disabled={!subjectId || markManagerBusy}
              >
                {markManagerConfirmed ? 'Edit' : 'Save'}
              </button>
            </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          <div>Max {displayLabel}: <strong style={{ color: '#111' }}>{MAX_ASMT1}</strong></div>
          <div>CO-1 max: <strong style={{ color: '#111' }}>{CO_MAX.co1}</strong> • CO-2 max: <strong style={{ color: '#111' }}>{CO_MAX.co2}</strong></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>Selected BTLs:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6].map((n) => {
                const active = selectedBtls.includes(n);
                const disabled = Boolean(markManagerLocked && sheet.markManagerSnapshot != null);
                return (
                  <div
                    key={`card_btl_${n}`}
                    onClick={() => toggleBtl(n)}
                    style={{
                      ...btlBoxStyle,
                      borderColor: active ? '#16a34a' : '#cbd5e1',
                      background: active ? '#ecfdf5' : '#fff',
                      cursor: disabled || markManagerBusy ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.6 : 1,
                      padding: '6px 8px',
                    }}
                    aria-disabled={disabled || markManagerBusy}
                  >
                    <input type="checkbox" checked={active} readOnly style={{ marginRight: 6 }} />
                    <span style={{ fontWeight: 800 }}>BTL{n}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {markManagerError ? <div style={{ marginTop: 8, color: '#991b1b' }}>{markManagerError}</div> : null}
      </div>

      <div style={{ marginTop: 14 }}>
        {showNameList ? (
          <div className="obe-table-wrapper" style={{ overflowX: 'auto' }}>
            <PublishLockOverlay
              locked={Boolean(globalLocked || publishedEditLocked || (isPublished && lockStatusUnknown))}
              title={globalLocked ? 'Locked by IQAC' : publishedEditLocked ? 'Published — Locked' : 'Table Locked'}
              subtitle={globalLocked ? 'Publishing is turned OFF globally for this assessment.' : publishedEditLocked ? 'Marks are published. Request IQAC approval to edit.' : 'Confirm the Mark Manager'}
            >
              <table className="ssa-modern-table" style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 920 }}>
                <thead>
                  <tr>
                    <th style={cellTh} colSpan={totalTableCols}>
                      {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {displayLabel}
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...cellTh, width: 42, minWidth: 42 }} rowSpan={4}>S.No</th>
                    <th style={cellTh} rowSpan={4}>Register No.</th>
                    <th style={cellTh} rowSpan={3}>Name of the Students</th>

                    <th style={cellTh}>{displayLabel}</th>
                    {showTotalColumn ? <th style={cellTh}>Total</th> : null}

                    <th style={cellTh} colSpan={4}>CO ATTAINMENT</th>
                    {visibleBtlIndices.length ? (
                      <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th>
                    ) : null}
                  </tr>
                  <tr>
                    <th style={cellTh}>
                      <div style={{ fontWeight: 800 }}>COs</div>
                      <div style={{ fontSize: 12 }}>1,2</div>
                    </th>
                    {showTotalColumn ? <th style={cellTh} /> : null}

                    <th style={cellTh} colSpan={2}>CO-1</th>
                    <th style={cellTh} colSpan={2}>CO-2</th>

                    {visibleBtlIndices.map((n) => (
                      <th key={`btl-head-${n}`} style={cellTh} colSpan={2}>
                        BTL-{n}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th style={cellTh}>
                      <div style={{ fontWeight: 800 }}>BTL</div>
                      <div style={{ fontSize: 12 }}>{visibleBtlIndices.length ? visibleBtlIndices.join(',') : '-'}</div>
                    </th>
                    {showTotalColumn ? <th style={cellTh} /> : null}

                    {Array.from({ length: 2 + visibleBtlIndices.length }).flatMap((_, i) => (
                      <React.Fragment key={i}>
                        <th style={cellTh}>Mark</th>
                        <th style={cellTh}>%</th>
                      </React.Fragment>
                    ))}
                  </tr>
                  <tr>
                    <th style={cellTh}>Name / Max Marks</th>
                    <th style={cellTh}>{MAX_ASMT1}</th>
                    {showTotalColumn ? <th style={cellTh}>{MAX_ASMT1}</th> : null}
                    <th style={cellTh}>{isReview ? renderCoSplitHeaderCell('co1', CO_MAX.co1, co1TotalSplit) : CO_MAX.co1}</th>
                    <th style={cellTh}>%</th>
                    <th style={cellTh}>{isReview ? renderCoSplitHeaderCell('co2', CO_MAX.co2, co2TotalSplit) : CO_MAX.co2}</th>
                    <th style={cellTh}>%</th>
                    {visibleBtlIndices.flatMap((n) => [
                      <th key={`btl-max-${n}`} style={cellTh}>
                        {isReview ? String(BTL_MAX_WHEN_VISIBLE) : String(displayBtlMax((BTL_MAX as any)[`btl${n}`]))}
                      </th>,
                      <th key={`btl-pct-${n}`} style={cellTh}>%</th>,
                    ])}
                  </tr>

                  {isReview
                    ? Array.from({ length: coSplitRowCount }).map((_, splitIdx) => (
                        <tr key={`co-split-row-${splitIdx}`}>
                          <th style={cellTh}>{`Split ${splitIdx + 1}`}</th>
                          <th style={cellTh} />
                          {showTotalColumn ? <th style={cellTh} /> : null}
                          <th style={cellTh}>
                            <input
                              key={`co1_split_input_${splitIdx}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={CO_MAX.co1}
                              step="0.5"
                              disabled={splitEditDisabled}
                              value={co1Splits[splitIdx] === '' ? '' : String(co1Splits[splitIdx])}
                              onChange={(e) => updateCoSplitAt('co1', splitIdx, e.target.value)}
                              style={splitInputStyle}
                            />
                          </th>
                          <th style={cellTh} />
                          <th style={cellTh}>
                            <input
                              key={`co2_split_input_${splitIdx}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={CO_MAX.co2}
                              step="0.5"
                              disabled={splitEditDisabled}
                              value={co2Splits[splitIdx] === '' ? '' : String(co2Splits[splitIdx])}
                              onChange={(e) => updateCoSplitAt('co2', splitIdx, e.target.value)}
                              style={splitInputStyle}
                            />
                          </th>
                          <th style={cellTh} />
                          {visibleBtlIndices.flatMap((n) => [
                            <th key={`btl-split-mark-${splitIdx}-${n}`} style={cellTh} />,
                            <th key={`btl-split-pct-${splitIdx}-${n}`} style={cellTh} />,
                          ])}
                        </tr>
                      ))
                    : null}
                </thead>
                <tbody>
                  {sheet.rows.length === 0 ? (
                    <tr>
                      <td colSpan={totalTableCols} style={{ padding: 14, color: '#6b7280', fontSize: 13 }}>
                        No students loaded yet. Choose a Teaching Assignment above, then click “Load/Refresh Roster”.
                      </td>
                    </tr>
                  ) : tableBlocked && !publishedEditLocked ? (
                    <tr>
                      <td colSpan={totalTableCols} style={{ padding: 20, textAlign: 'center', color: '#065f46', fontWeight: 900 }}>
                        Table locked — confirm the Mark Manager to enable student marks
                      </td>
                    </tr>
                  ) : (
                    rowsToRender.map((r, idx) => {
                      const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT1) : null;

                      const coShare = totalRaw == null ? null : round1(totalRaw / 2);
                      const co1 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co1);
                      const co2 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co2);

                      const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                      const rawBtlMaxByIndex = [BTL_MAX.btl1, BTL_MAX.btl2, BTL_MAX.btl3, BTL_MAX.btl4, BTL_MAX.btl5, BTL_MAX.btl6];
                      const btlMaxByIndex = rawBtlMaxByIndex.map((rawMax, idx) => {
                        if (!visibleIndicesZeroBased.includes(idx)) return rawMax;
                        return isReview ? BTL_MAX_WHEN_VISIBLE : rawMax > 0 ? rawMax : DEFAULT_BTL_MAX_WHEN_VISIBLE;
                      });
                      const btlShare = totalRaw == null ? null : visibleIndicesZeroBased.length ? round1(totalRaw / visibleIndicesZeroBased.length) : 0;
                      const btlMarksByIndex = btlMaxByIndex.map((max, i) => {
                        if (totalRaw == null) return null;
                        if (!visibleIndicesZeroBased.includes(i)) return null;
                        if (max > 0) return clamp(btlShare as number, 0, max);
                        return round1(btlShare as number);
                      });

                      return (
                        <tr key={String(r.studentId || idx)} style={{ background: idx % 2 === 1 ? '#f8fafc' : '#fff' }}>
                          <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42, paddingLeft: 2, paddingRight: 2 }}>{idx + 1}</td>
                          <td style={cellTd}>{shortenRegisterNo(r.registerNo)}</td>
                          <td style={cellTd}>{r.name}</td>
                          <td style={{ ...cellTd, width: 90, background: '#fff7ed' }}>
                            {marksEditDisabled ? (
                              <div style={inputStyle}>{typeof r.total === 'number' ? round1(r.total) : ''}</div>
                            ) : (
                              <input
                                style={inputStyle}
                                type="number"
                                value={r.total}
                                min={0}
                                max={MAX_ASMT1}
                                onChange={(e) => {
                                  if (marksEditDisabled) return;
                                  const raw = e.target.value;
                                  if (raw === '') return updateRow(idx, { total: '' });
                                  const next = Number(raw);
                                  if (!Number.isFinite(next)) return updateRow(idx, { total: '' });
                                  if (next > MAX_ASMT1) {
                                    e.currentTarget.setCustomValidity(`Max mark is ${MAX_ASMT1}`);
                                    e.currentTarget.reportValidity();
                                    window.setTimeout(() => e.currentTarget.setCustomValidity(''), 0);
                                    return;
                                  }
                                  e.currentTarget.setCustomValidity('');
                                  const n = clamp(next, 0, MAX_ASMT1);
                                  updateRow(idx, { total: n });
                                }}
                              />
                            )}
                          </td>
                          {showTotalColumn ? <td style={{ ...cellTd, textAlign: 'center' }}>{totalRaw ?? ''}</td> : null}
                          <td style={{ ...cellTd, textAlign: 'center' }}>{co1 ?? ''}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co1, CO_MAX.co1)}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{co2 ?? ''}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co2, CO_MAX.co2)}</td>

                          {visibleBtlIndices.map((btl) => {
                            const idx0 = btl - 1;
                            const mark = btlMarksByIndex[idx0];
                            const max = btlMaxByIndex[idx0];
                            return (
                              <React.Fragment key={btl}>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{mark ?? ''}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{pct(mark, max)}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </PublishLockOverlay>
          </div>
        ) : (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 20,
              background: '#fff',
            }}
          >
            <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
              <div style={{ fontSize: 40 }}>🔒</div>
              <div style={{ fontWeight: 800, fontSize: 16, marginTop: 8 }}>{publishedEditLocked ? 'Published — Locked' : 'Table Locked'}</div>
              <div style={{ color: '#6b7280', marginTop: 6 }}>{publishedEditLocked ? 'Marks published. Use View to inspect or Request Edit to ask IQAC for edit access.' : 'Confirm the Mark Manager to unlock the student list.'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {publishedEditLocked ? (
                  <>
                    <button className="obe-btn" onClick={() => setViewMarksModalOpen(true)}>View</button>
                    <button className="obe-btn obe-btn-success" disabled={markEntryReqPending} onClick={openEditRequestModal}>
                      {markEntryReqPending ? 'Request Pending' : 'Request Edit'}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="obe-btn obe-btn-success" onClick={() => setMarkManagerModal({ mode: 'confirm' })} disabled={!subjectId || markManagerBusy}>
                      Save Mark Manager
                    </button>
                    <button className="obe-btn" onClick={() => requestMarkManagerEdit()} disabled={markManagerBusy}>
                      Request Access
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
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
              zIndex: 80,
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
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{displayLabel} • {String(subjectId || '')}</div>
            </div>

            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.35 }}>
              This will send a request to IQAC. Once approved, mark entry will open for editing until the approval expires.
              {markEntryReqPendingUntilMs ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Request window:</strong> 24 hours
                </div>
              ) : null}
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

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="obe-btn" disabled={editRequestBusy} onClick={() => setPublishedEditModalOpen(false)}>
                Cancel
              </button>
              <button className="obe-btn obe-btn-success" disabled={editRequestBusy || markEntryReqPending || !subjectId || !String(editRequestReason || '').trim()} onClick={requestMarkEntryEdit}>
                {editRequestBusy ? 'Requesting…' : markEntryReqPending ? 'Request Pending' : 'Send Request'}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

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

        /* SSA table modern look (UI-only) */
        .ssa-modern-table th:last-child,
        .ssa-modern-table td:last-child {
          border-right: none;
        }
        .ssa-modern-table tbody tr:nth-child(even) td {
          background: #fbfdff;
        }
        .ssa-modern-table tbody tr:hover td {
          background: rgba(2, 132, 199, 0.03);
        }
      `}</style>

      {/* Overlays & floating panels similar to LabEntry */}
      <div style={{ position: 'relative' }}>
        {/* Blue overlay when blocked by Mark Manager (not confirmed) */}
        {!markManagerLocked ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 30,
              pointerEvents: 'none',
              background: 'rgba(107, 114, 128, 0.15)',
            }}
          />
        ) : null}

        {/* Floating panel when blocked by Mark Manager */}
        {!markManagerLocked && !publishedEditLocked ? (
          <div style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', zIndex: 40, width: 160, background: '#fff', border: '1px solid #e5e7eb', padding: 10, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', boxShadow: '0 6px 18px rgba(17,24,39,0.06)' }}>
            <div style={{ width: 100, height: 72, display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 8 }}>
              <img src={'https://media.lordicon.com/icons/wired/flat/94-lock-unlock.gif'} alt="locked" style={{ maxWidth: 72, maxHeight: 72, display: 'block' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, color: '#111827' }}>Table Locked</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Confirm the Mark Manager</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Mark Manager modal */}
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
            <div style={{ width: 'min(640px,96vw)', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 14 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>{markManagerModal.mode === 'confirm' ? `Confirmation - ${displayLabel}` : `Request Edit - ${displayLabel}`}</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{displayLabel}</div>
            </div>

            {markManagerModal.mode === 'confirm' ? (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Confirm the selected settings. After confirming, Mark Manager will be applied and table will be editable.</div>
                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        <th style={{ textAlign: 'left', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>Item</th>
                        <th style={{ textAlign: 'right', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>Max {displayLabel}</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{MAX_ASMT1}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-1 max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{CO_MAX.co1}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-2 max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{CO_MAX.co2}</td>
                      </tr>
                      <tr>
                                <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>Selected BTLs</td>
                                <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                    {[1, 2, 3, 4, 5, 6].map((n) => {
                                      const active = selectedBtls.includes(n);
                                      return (
                                        <div
                                          key={`modal_btl_${n}`}
                                          onClick={() => setSelectedBtls((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)))}
                                          style={{
                                            ...btlBoxStyle,
                                            borderColor: active ? '#16a34a' : '#cbd5e1',
                                            background: active ? '#ecfdf5' : '#fff',
                                            cursor: markManagerBusy ? 'not-allowed' : 'pointer',
                                            padding: '6px 8px',
                                          }}
                                        >
                                          <input type="checkbox" checked={active} readOnly style={{ marginRight: 6 }} />
                                          <span style={{ fontWeight: 800 }}>BTL{n}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>This will send an edit request to IQAC. Mark Manager will remain locked until IQAC approves.</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="obe-btn" disabled={markManagerBusy} onClick={() => setMarkManagerModal(null)}>Cancel</button>
              <button className="obe-btn obe-btn-success" disabled={markManagerBusy || !subjectId} onClick={async () => {
                if (!subjectId) return;
                if (markManagerModal.mode === 'request') {
                  setMarkManagerModal(null);
                  await requestMarkManagerEdit();
                  return;
                }
                await confirmMarkManager();
              }}>{markManagerModal.mode === 'confirm' ? 'Confirm' : 'Send Request'}</button>
            </div>
            </div>
          </div>
        </ModalPortal>
        ) : null}
      </AssessmentContainer>
    </>
  );
}
