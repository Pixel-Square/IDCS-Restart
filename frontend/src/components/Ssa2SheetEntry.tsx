import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import {
  confirmMarkManagerLock,
  createEditRequest,
  createPublishRequest,
  fetchDraft,
  fetchIqacQpPattern,
  fetchMyTeachingAssignments,
  fetchPublishedReview2,
  fetchPublishedSsa2,
  formatApiErrorMessage,
  formatEditRequestSentMessage,
  publishReview2,
  publishSsa2,
  PublishedSsa2Response,
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
import { clearLocalDraftCache } from '../utils/obeDraftCache';
import { useMarkEntryEditRequestsEnabled, useMarkManagerEditRequestsEnabled } from '../utils/requestControl';
import { normalizeRegisterNo } from '../utils/excelImport';
import { normalizeObeClassType } from '../constants/classTypes';

type Props = { subjectId: string; teachingAssignmentId?: number; label?: string; assessmentKey?: 'ssa2' | 'review2'; classType?: string | null; questionPaperType?: string | null };

type Ssa2Row = {
  studentId: number;
  section: string;
  registerNo: string;
  name: string;
  co3: number | '';
  co4: number | '';
  total: number | '';
  reviewCoMarks?: {
    co3?: Array<number | ''>;
    co4?: Array<number | ''>;
  };
};

type Ssa2Sheet = {
  termLabel: string;
  batchLabel: string;
  rows: Ssa2Row[];

  // Review (TCPR) CO max split config
  // Example: { co3: [7.5, 7.5], co4: [15] }
  coSplitMax?: { co3?: Array<number | ''>; co4?: Array<number | ''> };

  // Mark Manager lock state
  markManagerLocked?: boolean;
  markManagerSnapshot?: string | null;
  markManagerApprovalUntil?: string | null;
};

type Ssa2DraftPayload = {
  sheet: Ssa2Sheet;
  selectedBtls: number[];
};

const DEFAULT_MAX_ASMT2 = 20;
const DEFAULT_CO_MAX = { co3: 10, co4: 10 };
const DEFAULT_BTL_MAX = { btl1: 0, btl2: 0, btl3: 10, btl4: 10, btl5: 0, btl6: 0 };
const DEFAULT_BTL_MAX_WHEN_VISIBLE = 10;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseMarkInput(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function pct(mark: number | null, max: number) {
  if (mark == null) return '';
  if (!Number.isFinite(max) || max <= 0) return '0';
  const ratio = (mark / max) * 100;
  return `${Number.isFinite(ratio) ? ratio.toFixed(0) : 0}`;
}

function readFiniteNumber(value: any): number | null {
  if (value === '' || value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (!s) return null;

  // Fast path for clean numeric strings.
  const direct = Number(s);
  if (Number.isFinite(direct)) return direct;

  // Be tolerant of common Excel/text formats: '18/20', '90%', '18 (out of 20)', '1,234'.
  const cleaned = s.replace(/,/g, '');
  const match = cleaned.match(/[-+]?\d*\.?\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function getBtlMaxFromCfg(cfg: any, n: 1 | 2 | 3 | 4 | 5 | 6, fallback: number): number {
  const btlMax = cfg?.btlMax;
  const raw = btlMax?.[String(n)] ?? btlMax?.[`btl${n}`] ?? btlMax?.[n];
  const parsed = readFiniteNumber(raw);
  return parsed == null ? fallback : parsed;
}

function storageKey(subjectId: string, assessmentKey: 'ssa2' | 'review2', teachingAssignmentId?: number) {
  return `${assessmentKey}_sheet_${subjectId}_ta_${String(teachingAssignmentId ?? 'none')}`;
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
  const aLast3 = parseInt(String(a?.reg_no || '').slice(-3), 10);
  const bLast3 = parseInt(String(b?.reg_no || '').slice(-3), 10);
  return (isNaN(aLast3) ? 9999 : aLast3) - (isNaN(bLast3) ? 9999 : bLast3);
}

function shortenRegisterNo(registerNo: string): string {
  return String(registerNo || '').trim();
}

export default function Ssa2SheetEntry({ subjectId, teachingAssignmentId, label, assessmentKey = 'ssa2', classType, questionPaperType }: Props) {
  const displayLabel = String(label || 'SSA2');
  const isReview = assessmentKey === 'review2';
  const showTotalColumn = false;
  const key = useMemo(() => storageKey(subjectId, assessmentKey, teachingAssignmentId), [subjectId, assessmentKey, teachingAssignmentId]);
  const fetchPublished = assessmentKey === 'review2'
    ? (sid: string) => fetchPublishedReview2(sid, teachingAssignmentId)
    : (sid: string) => fetchPublishedSsa2(sid, teachingAssignmentId);
  const publishNow = assessmentKey === 'review2' ? publishReview2 : publishSsa2;
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [taMeta, setTaMeta] = useState<{ courseName?: string; courseCode?: string; className?: string } | null>(null);

  // ── IQAC QP Pattern: derive effective CO numbers for display ──
  const [iqacPattern, setIqacPattern] = useState<{ marks?: number[]; cos?: Array<number | string> } | null>(null);

  const classTypeKey = useMemo(() => {
    const v = String(normalizeObeClassType(classType) || '').trim().toUpperCase();
    return v || '';
  }, [classType]);

  const qpTypeKey = useMemo(() => {
    return String(questionPaperType ?? '').trim().toUpperCase();
  }, [questionPaperType]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!classTypeKey) { setIqacPattern(null); return; }
      const qpForApi = classTypeKey === 'THEORY' ? (qpTypeKey || null) : null;
      const examForApi = assessmentKey === 'review2' ? 'SSA2' : 'SSA2';
      try {
        const res: any = await fetchIqacQpPattern({ class_type: classTypeKey, question_paper_type: qpForApi, exam: examForApi as any });
        if (!alive) return;
        const p = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
        setIqacPattern(p.length ? (res.pattern as any) : null);
      } catch {
        if (alive) setIqacPattern(null);
      }
    })();
    return () => { alive = false; };
  }, [classTypeKey, qpTypeKey, assessmentKey]);

  // Derive effective CO numbers from IQAC pattern (default: 3, 4 for SSA2)
  const effectiveCoA = useMemo(() => {
    const cos = Array.isArray(iqacPattern?.cos) ? iqacPattern!.cos : null;
    if (cos && cos.length) {
      const nums = cos
        .flatMap((c) => {
          const s = String(c ?? '');
          if (s.includes('&')) return s.split('&').map(Number);
          const m = s.match(/\d+/);
          return m ? [Number(m[0])] : [];
        })
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
      const unique = [...new Set(nums)].sort((a, b) => a - b);
      if (unique.length >= 1) return unique[0];
    }
    return 3;
  }, [iqacPattern]);

  const effectiveCoB = useMemo(() => {
    const cos = Array.isArray(iqacPattern?.cos) ? iqacPattern!.cos : null;
    if (cos && cos.length) {
      const nums = cos
        .flatMap((c) => {
          const s = String(c ?? '');
          if (s.includes('&')) return s.split('&').map(Number);
          const m = s.match(/\d+/);
          return m ? [Number(m[0])] : [];
        })
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
      const unique = [...new Set(nums)].sort((a, b) => a - b);
      if (unique.length >= 2) return unique[1];
      if (unique.length === 1) return unique[0];
    }
    return 4;
  }, [iqacPattern]);

  const [sheet, setSheet] = useState<Ssa2Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    rows: [],
    coSplitMax: isReview ? { co3: [], co4: [] } : undefined,
    // Default: locked until Mark Manager is confirmed (saved)
    markManagerLocked: false,
    markManagerSnapshot: null,
    markManagerApprovalUntil: null,
  });

  const masterTermLabel = String(masterCfg?.termLabel || 'KRCT AY25-26');
  const ssa2Cfg = masterCfg?.assessments?.ssa2 || {};
  const MAX_ASMT2_BASE = Number.isFinite(Number(ssa2Cfg?.maxTotal)) ? Number(ssa2Cfg.maxTotal) : DEFAULT_MAX_ASMT2;
  const MAX_ASMT2 = isReview ? 30 : MAX_ASMT2_BASE;
  const CO_MAX_BASE = {
    // Prefer explicit CO3/CO4 config; fall back to legacy CO1/CO2 keys.
    co3: Number.isFinite(Number(ssa2Cfg?.coMax?.co3))
      ? Number(ssa2Cfg.coMax.co3)
      : Number.isFinite(Number(ssa2Cfg?.coMax?.co1))
        ? Number(ssa2Cfg.coMax.co1)
        : DEFAULT_CO_MAX.co3,
    co4: Number.isFinite(Number(ssa2Cfg?.coMax?.co4))
      ? Number(ssa2Cfg.coMax.co4)
      : Number.isFinite(Number(ssa2Cfg?.coMax?.co2))
        ? Number(ssa2Cfg.coMax.co2)
        : DEFAULT_CO_MAX.co4,
  };
  const CO_MAX = isReview ? { co3: 15, co4: 15 } : CO_MAX_BASE;
  const BTL_MAX = {
    btl1: getBtlMaxFromCfg(ssa2Cfg, 1, DEFAULT_BTL_MAX.btl1),
    btl2: getBtlMaxFromCfg(ssa2Cfg, 2, DEFAULT_BTL_MAX.btl2),
    btl3: getBtlMaxFromCfg(ssa2Cfg, 3, DEFAULT_BTL_MAX.btl3),
    btl4: getBtlMaxFromCfg(ssa2Cfg, 4, DEFAULT_BTL_MAX.btl4),
    btl5: getBtlMaxFromCfg(ssa2Cfg, 5, DEFAULT_BTL_MAX.btl5),
    btl6: getBtlMaxFromCfg(ssa2Cfg, 6, DEFAULT_BTL_MAX.btl6),
  };

  const BTL_MAX_WHEN_VISIBLE = isReview ? 30 : DEFAULT_BTL_MAX_WHEN_VISIBLE;
  const reviewCfg = isReview ? ((((masterCfg as any)?.review_config || {}).TCPR || {})[assessmentKey] || {}) : null;
  const reviewSplitEnabled = Boolean(isReview && (reviewCfg as any)?.split_enabled);

  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelImportHelpOpen, setExcelImportHelpOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
        setSheet((p) => ({
          ...p,
          termLabel: String((cfg as any)?.termLabel || p.termLabel || 'KRCT AY25-26'),
          batchLabel: subjectId,
        }));
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const defaultSelectedBtls = isReview ? [3, 4] : [];
  const [selectedBtls, setSelectedBtls] = useState<number[]>(() => defaultSelectedBtls);

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const draftLoadedRef = useRef(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  // Avoid leaking published state across subject/assignment switches.
  useEffect(() => {
    setPublishedAt(null);
  }, [subjectId, teachingAssignmentId]);

  const [publishedEditModalOpen, setPublishedEditModalOpen] = useState(false);
  const [editRequestReason, setEditRequestReason] = useState('');
  const [editRequestBusy, setEditRequestBusy] = useState(false);
  const [editRequestError, setEditRequestError] = useState<string | null>(null);
  const [viewMarksModalOpen, setViewMarksModalOpen] = useState(false);
  const [publishedViewSnapshot, setPublishedViewSnapshot] = useState<PublishedSsa2Response | null>(null);
  const [publishedViewLoading, setPublishedViewLoading] = useState(false);
  const [publishedViewError, setPublishedViewError] = useState<string | null>(null);
  const [showNameListLockedNotice, setShowNameListLockedNotice] = useState(false);

  const {
    data: publishWindow,
    loading: publishWindowLoading,
    error: publishWindowError,
    remainingSeconds,
    publishAllowed,
    editAllowed,
    refresh: refreshPublishWindow,
  } = usePublishWindow({ assessment: assessmentKey, subjectCode: subjectId, teachingAssignmentId });

  const {
    data: markLock,
    loading: markLockLoading,
    error: markLockError,
    refresh: refreshMarkLock,
  } = useMarkTableLock({ assessment: assessmentKey as any, subjectCode: String(subjectId || ''), teachingAssignmentId, options: { poll: false } });
  const { data: markManagerEditWindow, refresh: refreshMarkManagerEditWindow } = useEditWindow({ assessment: assessmentKey as any, subjectCode: String(subjectId || ''), scope: 'MARK_MANAGER', teachingAssignmentId, options: { poll: true } });
  const { data: markEntryEditWindow, refresh: refreshMarkEntryEditWindow } = useEditWindow({ assessment: assessmentKey as any, subjectCode: String(subjectId || ''), scope: 'MARK_ENTRY', teachingAssignmentId, options: { poll: true } });

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  const [markManagerModal, setMarkManagerModal] = useState<null | { mode: 'confirm' | 'request' }>(null);
  const [markManagerBusy, setMarkManagerBusy] = useState(false);
  const [markManagerError, setMarkManagerError] = useState<string | null>(null);

  const [publishConsumedApprovals, setPublishConsumedApprovals] = useState<null | {
    markEntryApprovalUntil: string | null;
    markManagerApprovalUntil: string | null;
  }>(null);

  useEffect(() => {
    setPublishConsumedApprovals(null);
    // Clear published UI state when switching assessments (SSA2 <-> Review2)
    // so SSA publish doesn't make Review look published (and vice versa).
    setPublishedAt(null);
    setPublishedViewSnapshot(null);
    setPublishedViewError(null);
  }, [subjectId, assessmentKey, teachingAssignmentId]);

  // Published must be derived from the authoritative lock state.
  // The `*-published` endpoints always return a JSON shape (even when empty),
  // so `publishedViewSnapshot` is NOT a reliable signal for publish status.
  const isPublished = Boolean(publishedAt) || Boolean(markLock?.exists && markLock?.is_published);
  const markManagerLocked = Boolean(sheet.markManagerLocked);
  const markManagerConfirmed = Boolean(sheet.markManagerSnapshot != null) || Boolean(markLock?.exists && markLock?.mark_manager_locked);

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

  const editRequestsEnabled = useMarkEntryEditRequestsEnabled();
  const markManagerEditRequestsEnabled = useMarkManagerEditRequestsEnabled();
  const entryOpen = !isPublished ? Boolean(editAllowed) : !editRequestsEnabled || Boolean(markLock?.entry_open) || markEntryApprovedFresh || markManagerApprovedFresh;
  const publishedEditLocked = Boolean(isPublished && editRequestsEnabled && !entryOpen);

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

  useLockBodyScroll(Boolean(publishedEditModalOpen) || Boolean(markManagerModal) || Boolean(viewMarksModalOpen) || Boolean(excelImportHelpOpen));

  const editRequestsBlocked = Boolean(isPublished && publishedEditLocked && !editRequestsEnabled);
  const publishButtonIsRequestEdit = Boolean(isPublished && publishedEditLocked && editRequestsEnabled);

  const openEditRequestModal = async () => {
    if (!editRequestsEnabled) {
      alert('Edit requests are disabled by IQAC.');
      return;
    }
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

  // If we cannot verify lock/publish state (network/API error), default to read-only.
  const lockStatusUnknown = Boolean(subjectId) && (markLockLoading || Boolean(markLockError) || markLock == null);

  // Authoritative locking: if the server reports entry_open=false, do not allow editing
  // even if local UI state thinks Mark Manager is confirmed.
  // Auto-unlock if marks have already been entered (snapshot exists or rows have data).
  const autoUnlockMarkManager = Boolean(sheet.markManagerSnapshot != null) || sheet.rows.length > 0;
  const tableBlocked = Boolean(
    globalLocked ||
      lockStatusUnknown ||
      (!isPublished && !markManagerLocked && !autoUnlockMarkManager) ||
      (isPublished ? (editRequestsEnabled && !entryOpen) : false) ||
      (!isPublished && markLock ? !markLock.entry_open : false),
  );

  const showNameList = Boolean(sheet.markManagerSnapshot != null);
  const marksEditDisabled = Boolean(globalLocked || publishedEditLocked || tableBlocked);

  // Show the published lock panel only after Mark Manager is confirmed/locked,
  // so it never overlaps with the Mark Manager 'Table Locked' UI.
  const showPublishedLockPanel = Boolean(isPublished && publishedEditLocked && markManagerLocked);

  // Read-only UI state: when published and not approved for edits (or when lock state is unknown),
  // Mark Manager controls like selecting BTLs must not be editable.
  const uiReadOnly = Boolean(globalLocked || publishedEditLocked || lockStatusUnknown);

  const visibleBtlIndices = useMemo(() => {
    const set = new Set(selectedBtls);
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [selectedBtls]);

  const publishedTableCols = useMemo(() => {
    // Layout matching the Excel header template, but BTL columns are dynamic.
    // S.No, RegNo, Name, SSA2 = 4 (and optional Total = +1)
    // CO Attainment (CO-3 Mark/% + CO-4 Mark/%) = 4
    // BTL Attainment = selected count * 2 (Mark/% per BTL)
    const base = showTotalColumn ? 9 : 8;
    return base + visibleBtlIndices.length * 2;
  }, [showTotalColumn, visibleBtlIndices.length]);

  const totalTableCols = useMemo(() => {
    if (!isReview || !reviewSplitEnabled) return publishedTableCols;
    const raw = ((sheet as any)?.coSplitMax || {}) as { co3?: Array<number | ''>; co4?: Array<number | ''> };
    const co3Cols = Math.max(1, Array.isArray(raw.co3) ? Math.min(raw.co3.length, 15) : 0);
    const co4Cols = Math.max(1, Array.isArray(raw.co4) ? Math.min(raw.co4.length, 15) : 0);
    const fixed = showTotalColumn ? 5 : 4;
    return fixed + (co3Cols + co4Cols) * 2 + visibleBtlIndices.length * 2;
  }, [isReview, publishedTableCols, reviewSplitEnabled, sheet, showTotalColumn, visibleBtlIndices.length]);

  useEffect(() => {
    if (!subjectId) return;
    try {
      const taSuffix = teachingAssignmentId == null ? '' : `_ta_${teachingAssignmentId}`;
      const sk = `${assessmentKey}_selected_btls_${subjectId}${taSuffix}`;
      lsSet(sk, selectedBtls);
    } catch {}

    if (!draftLoadedRef.current) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const payload: Ssa2DraftPayload = { sheet, selectedBtls };
        await saveDraft(assessmentKey, subjectId, payload, teachingAssignmentId);
        try {
          if (key) lsSet(key, { termLabel: sheet.termLabel, batchLabel: sheet.batchLabel, rows: sheet.rows, coSplitMax: (sheet as any).coSplitMax });
        } catch {}
        if (!cancelled) setSavedAt(new Date().toLocaleString());
      } catch {
        // ignore
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [selectedBtls, subjectId, sheet, key, assessmentKey, teachingAssignmentId]);

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<Ssa2Sheet>(key);
    if (stored && typeof stored === 'object' && Array.isArray((stored as any).rows)) {
      setSheet({
        termLabel: masterCfg?.termLabel ? String(masterCfg.termLabel) : String((stored as any).termLabel || 'KRCT AY25-26'),
        batchLabel: subjectId,
        rows: (stored as any).rows,
        coSplitMax: (stored as any).coSplitMax ?? (isReview ? { co3: [], co4: [] } : undefined),
        markManagerSnapshot: (stored as any)?.markManagerSnapshot ?? null,
        markManagerApprovalUntil: (stored as any)?.markManagerApprovalUntil ?? null,
        markManagerLocked: typeof (stored as any)?.markManagerLocked === 'boolean' ? (stored as any).markManagerLocked : Boolean((stored as any)?.markManagerSnapshot),
      });
    } else {
      setSheet({
        termLabel: masterTermLabel || 'KRCT AY25-26',
        batchLabel: subjectId,
        rows: [],
        coSplitMax: isReview ? { co3: [], co4: [] } : undefined,
        markManagerLocked: false,
        markManagerSnapshot: null,
        markManagerApprovalUntil: null,
      });
    }
  }, [key, subjectId, masterCfg, masterTermLabel]);

  useEffect(() => {
    let mounted = true;
    draftLoadedRef.current = false;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<Ssa2DraftPayload>(assessmentKey, subjectId, teachingAssignmentId);
        if (!mounted) return;
        const d = res?.draft;
        const draftSheet = (d as any)?.sheet;
        const draftBtls = (d as any)?.selectedBtls;
        if (draftSheet && typeof draftSheet === 'object' && Array.isArray((draftSheet as any).rows)) {
          const draftRows = (draftSheet as any).rows as any[];
          const clearWorkflowState = markLock?.exists === false;
          setSheet((prevSheet) => ({
            ...prevSheet,
            termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
            batchLabel: subjectId,
            // IMPORTANT: don't overwrite an already-loaded roster with an empty draft.
            rows: Array.isArray(draftRows) && draftRows.length ? (draftRows as any) : prevSheet.rows,
            coSplitMax: (draftSheet as any)?.coSplitMax ?? prevSheet.coSplitMax ?? (isReview ? { co3: [], co4: [] } : undefined),
            markManagerSnapshot: clearWorkflowState ? null : (draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot ?? null,
            markManagerApprovalUntil: clearWorkflowState ? null : (draftSheet as any)?.markManagerApprovalUntil ?? prevSheet.markManagerApprovalUntil ?? null,
            markManagerLocked:
              clearWorkflowState
                ? false
                : typeof (draftSheet as any)?.markManagerLocked === 'boolean'
                  ? (draftSheet as any).markManagerLocked
                  : Boolean((draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot),
          }));

          // Ensure roster is merged AFTER draft load so the student list is visible immediately.
          try {
            setTimeout(() => {
              try {
                loadRoster();
              } catch {
                // ignore
              }
            }, 0);
          } catch {
            // ignore
          }

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
          try {
            if (key)
              lsSet(key, {
                termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
                batchLabel: subjectId,
                rows: (draftSheet as any).rows,
                coSplitMax: (draftSheet as any)?.coSplitMax ?? (isReview ? { co3: [], co4: [] } : undefined),
              });
          } catch {
            // ignore
          }
        }
        if (Array.isArray(draftBtls)) {
          const next = draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n));
          setSelectedBtls(next);
          try {
            const taSuffix = teachingAssignmentId == null ? '' : `_ta_${teachingAssignmentId}`;
            const sk = `${assessmentKey}_selected_btls_${subjectId}${taSuffix}`;
            lsSet(sk, next);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      if (mounted) draftLoadedRef.current = true;
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId, masterTermLabel, key, assessmentKey, isReview, markLock?.exists, teachingAssignmentId]);

  // Mark Manager workflow sync: keep local sheet lock state in sync with server lock/approval
  useEffect(() => {
    if (!subjectId) return;

    const published = Boolean(markLock?.exists && markLock?.is_published) || Boolean(publishedAt);
    if (published && markLock?.exists) {
      const nextLocked = Boolean(markLock?.mark_manager_locked);
      if (Boolean(sheet.markManagerLocked) !== nextLocked) {
        setSheet((p) => ({ ...p, markManagerLocked: nextLocked }));
      }
      return;
    }

    const allowedByApproval = Boolean(markManagerEditWindow?.allowed_by_approval);
    const approvalUntil = markManagerEditWindow?.approval_until ? String(markManagerEditWindow.approval_until) : null;
    if (allowedByApproval && approvalUntil) {
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
    markLock?.is_published,
    markLock?.mark_manager_locked,
    markManagerEditWindow?.allowed_by_approval,
    markManagerEditWindow?.approval_until,
    sheet.markManagerLocked,
    sheet.markManagerApprovalUntil,
    publishedAt,
    publishConsumedApprovals?.markManagerApprovalUntil,
  ]);

  // When IQAC resets the course, the lock row disappears. Clear all publish /
  // mark-manager workflow state so the assessment behaves like a fresh course.
  useEffect(() => {
    if (markLock == null) return; // still loading
    if (!markLock.exists) {
      const hasWorkflowState = Boolean(
        publishedAt ||
          sheet.markManagerSnapshot != null ||
          sheet.markManagerLocked ||
          sheet.markManagerApprovalUntil ||
          publishConsumedApprovals?.markEntryApprovalUntil ||
          publishConsumedApprovals?.markManagerApprovalUntil,
      );
      if (!hasWorkflowState) return;

      try {
        clearLocalDraftCache(String(subjectId || ''), String(assessmentKey || ''), teachingAssignmentId ?? null);
      } catch {
        // ignore local reset cache errors
      }

      setSheet((p) => {
        if (p.markManagerSnapshot == null && !p.markManagerLocked && p.markManagerApprovalUntil == null) return p;
        return { ...p, markManagerSnapshot: null, markManagerLocked: false, markManagerApprovalUntil: null };
      });
      setSelectedBtls(defaultSelectedBtls);
      setPublishedAt(null);
      setPublishedViewSnapshot(null);
      setPublishedViewError(null);
      setViewMarksModalOpen(false);
      setPublishedEditModalOpen(false);
      setEditRequestReason('');
      setEditRequestError(null);
      setRequestReason('');
      setRequestMessage(null);
      setSaveError(null);
      setMarkManagerModal(null);
      setMarkManagerError(null);
      setShowNameListLockedNotice(false);
      setPublishConsumedApprovals(null);
      setMarkEntryReqPendingUntilMs(0);
    }
  }, [
    assessmentKey,
    defaultSelectedBtls,
    markLock,
    publishConsumedApprovals?.markEntryApprovalUntil,
    publishConsumedApprovals?.markManagerApprovalUntil,
    publishedAt,
    setMarkEntryReqPendingUntilMs,
    sheet.markManagerApprovalUntil,
    sheet.markManagerLocked,
    sheet.markManagerSnapshot,
    subjectId,
    teachingAssignmentId,
  ]);

  const mergeRosterIntoRows = (students: TeachingAssignmentRosterStudent[]) => {
    setSheet((prev) => {
      const existingById = new Map<number, Ssa2Row>();
      const existingByReg = new Map<string, Ssa2Row>();
      for (const r of prev.rows || []) {
        if (typeof (r as any).studentId === 'number') existingById.set((r as any).studentId, r as any);
        if (r.registerNo) existingByReg.set(String(r.registerNo), r);
      }

      const nextRows: Ssa2Row[] = (students || [])
        .slice()
        .sort(compareStudentName)
        .map((s) => {
          const prevRow = existingById.get(s.id) || existingByReg.get(String(s.reg_no || ''));
          return {
            studentId: s.id,
            section: String(s.section || ''),
            registerNo: String(s.reg_no || ''),
            name: String(s.name || ''),
            co3:
              typeof (prevRow as any)?.co3 === 'number'
                ? clamp(Number((prevRow as any).co3), 0, CO_MAX.co3)
                : '',
            co4:
              typeof (prevRow as any)?.co4 === 'number'
                ? clamp(Number((prevRow as any).co4), 0, CO_MAX.co4)
                : '',
            total:
              typeof (prevRow as any)?.total === 'number'
                ? clamp(Number((prevRow as any).total), 0, MAX_ASMT2)
                : (prevRow as any)?.total === ''
                  ? ''
                  : '',
            reviewCoMarks: (prevRow as any)?.reviewCoMarks,
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

      // If a specific teaching assignment ID is provided (e.g. IQAC viewing another faculty's course),
      // skip fetchMyTeachingAssignments (which only returns the current user's own TAs) and
      // directly fetch the roster for that TA. The backend already permits IQAC role access.
      if (teachingAssignmentId) {
        try {
          const taResp = await fetchTeachingAssignmentRoster(teachingAssignmentId);
          roster = taResp.students || [];
          setTaMeta({
            courseName: String((taResp as any)?.teaching_assignment?.subject_name || subjectId || ''),
            courseCode: String((taResp as any)?.teaching_assignment?.subject_code || subjectId || ''),
            className: String((taResp as any)?.teaching_assignment?.section_name || ''),
          });
          // direct TA roster returned
        } catch (err) {
          console.warn('[SSA2] Direct TA roster fetch failed:', err);
        }
        if (roster.length) {
          mergeRosterIntoRows(roster);
          return;
        }
      }

      // Fallback: look up TA from user's own teaching assignments (faculty flow)
      let matchedTa: any = null;
      try {
        const myTAs = await fetchMyTeachingAssignments();
        // myTAs fetched
        const desiredId = typeof teachingAssignmentId === 'number' ? teachingAssignmentId : null;
        const desiredCode = String(subjectId || '').trim().toUpperCase();

        // If a TA id is provided, prefer an exact id match (pinned flows).
        if (desiredId != null) {
          matchedTa = (myTAs || []).find((t: any) => Number(t?.id) === Number(desiredId)) || null;
        }

        // Otherwise (or if not found), fall back to subject-code match.
        if (!matchedTa) {
          matchedTa = (myTAs || []).find((t: any) => {
            const codeMatch = String(t?.subject_code || '').trim().toUpperCase() === desiredCode;
            return codeMatch;
          });
        }

        // matchedTa determined
      } catch (err) {
        console.warn('[SSA2] My TAs fetch failed:', err);
      }

      // Always use TA roster (backend handles batch filtering for electives)
      if (matchedTa && matchedTa.id) {
        // fetching regular TA roster
        try {
          const taResp = await fetchTeachingAssignmentRoster(matchedTa.id);
          roster = taResp.students || [];
          setTaMeta({
            courseName: String((taResp as any)?.teaching_assignment?.subject_name || matchedTa?.subject_name || ''),
            courseCode: String((taResp as any)?.teaching_assignment?.subject_code || matchedTa?.subject_code || subjectId || ''),
            className: String((taResp as any)?.teaching_assignment?.section_name || matchedTa?.section_name || ''),
          });
          // regular roster returned
        } catch (err) {
          console.warn('[SSA2] TA roster fetch failed:', err);
        }
      }

      // final roster count ready
      mergeRosterIntoRows(roster);
    } catch (e: any) {
      setRosterError(e?.message || 'Failed to load roster');
    } finally {
      setRosterLoading(false);
    }
  };

  useEffect(() => {
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
    // Reset the edge-trigger detector when switching SSA2 <-> Review2.
    prevEntryOpenRef.current = null;
  }, [subjectId, assessmentKey, teachingAssignmentId]);
  const publishedViewTableRef = useRef<HTMLDivElement | null>(null);

  async function refreshAll(showLoading = true) {
    try {
      refreshPublishWindow();
      refreshMarkLock({ silent: false });
      await refreshPublishedSnapshot(showLoading);
      if (teachingAssignmentId) {
        // reload roster to ensure name list sync
        try {
          await loadRoster();
        } catch {}
      }
    } catch {
      // ignore
    }
  }
  useEffect(() => {
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
        const res = await fetchDraft<Ssa2DraftPayload>(assessmentKey, String(subjectId), teachingAssignmentId);
        if (!mounted) return;
        const d = res?.draft;
        const draftSheet = (d as any)?.sheet;
        const draftBtls = (d as any)?.selectedBtls;
        if (draftSheet && typeof draftSheet === 'object' && Array.isArray((draftSheet as any).rows)) {
          const hasMarks = (draftSheet as any).rows.some((r: any) => r?.total !== '' && r?.total != null);
          if (hasMarks) {
            const clearWorkflowState = markLock?.exists === false;
            setSheet((prevSheet) => ({
              ...prevSheet,
              termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
              batchLabel: subjectId,
              rows: (draftSheet as any).rows,
              markManagerSnapshot: clearWorkflowState ? null : (draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot ?? null,
              markManagerApprovalUntil: clearWorkflowState ? null : (draftSheet as any)?.markManagerApprovalUntil ?? prevSheet.markManagerApprovalUntil ?? null,
              markManagerLocked:
                clearWorkflowState
                  ? false
                  : typeof (draftSheet as any)?.markManagerLocked === 'boolean'
                    ? (draftSheet as any).markManagerLocked
                    : Boolean((draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot),
            }));
            if (Array.isArray(draftBtls)) {
              setSelectedBtls(draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)));
            }
            draftLoadedRef.current = true;
            return;
          }
        }
      } catch {
        // ignore
      }

      if (!mounted) return;
      refreshPublishedSnapshot(false);
    })();

    return () => {
      mounted = false;
    };
  }, [entryOpen, isPublished, subjectId, assessmentKey, masterTermLabel, markLock?.exists]);

  useEffect(() => {
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
      const payload: Ssa2DraftPayload = { sheet, selectedBtls };
      await saveDraft(assessmentKey, subjectId, payload, teachingAssignmentId);
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
      const payload: Ssa2DraftPayload = { sheet: sheetRef.current, selectedBtls: btlRef.current };
      saveDraft(assessmentKey, subjectId, payload, teachingAssignmentId).catch(() => {});
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

    if (isPublished && publishedEditLocked) {
      if (markEntryReqPending) {
        setSaveError('Edit request is pending. Please wait for approval.');
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

    if (isReview) {
      const a = safeSplitArr((sheet as any)?.coSplitMax?.co3, CO_MAX.co3);
      const b = safeSplitArr((sheet as any)?.coSplitMax?.co4, CO_MAX.co4);
      const ok1 = sumSplit(a) <= CO_MAX.co3 + 1e-6;
      const ok2 = sumSplit(b) <= CO_MAX.co4 + 1e-6;
      if (!ok1 || !ok2) {
        alert(`CO split totals must not exceed 15 for CO-${effectiveCoA} and CO-${effectiveCoB}.`);
        return;
      }
    }

    setPublishing(true);
    setSaveError(null);
    try {
      await publishNow(subjectId, sheet, teachingAssignmentId);
      setPublishedAt(new Date().toLocaleString());
      setPublishConsumedApprovals({
        markEntryApprovalUntil,
        markManagerApprovalUntil,
      });
      setSheet((p) => ({ ...p, markManagerLocked: true }));
      refreshPublishWindow();
      refreshMarkLock({ silent: true });
      refreshPublishedSnapshot(false);
        // If the view-only modal is open, scroll that table to bottom so user sees latest rows
        setTimeout(() => {
          try {
            if (viewMarksModalOpen && publishedViewTableRef.current) {
              const el = publishedViewTableRef.current;
              el.scrollTop = el.scrollHeight;
            }
          } catch (e) {
            // ignore
          }
        }, 50);
        try {
          console.debug('obe:published dispatch', { assessment: assessmentKey, subjectId });
          window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId, assessment: assessmentKey } }));
        } catch {
          // ignore
        }
        // After publish, refresh the page state after 2 seconds and show locked notice
        setTimeout(() => {
          refreshAll(true);
          setShowNameListLockedNotice(true);
          setTimeout(() => setShowNameListLockedNotice(false), 5000);
        }, 2000);
    } catch (e: any) {
      setSaveError(e?.message || `Failed to publish ${displayLabel}`);
    } finally {
      setPublishing(false);
    }
  };

  const requestApproval = async () => {
    const reason = String(requestReason || '').trim();
    if (!reason) {
      setSaveError('Reason is required.');
      return;
    }
    setRequesting(true);
    setRequestMessage(null);
    setSaveError(null);
    try {
      const created = await createPublishRequest({ assessment: assessmentKey, subject_code: subjectId, reason, teaching_assignment_id: teachingAssignmentId });
      const routed = String((created as any)?.routed_to || '').trim().toUpperCase();
      const warn = String((created as any)?.routing_warning || '').trim();
      const baseMsg = routed === 'HOD' ? 'Request sent to HOD for approval.' : 'Request sent to IQAC for approval.';
      setRequestMessage(warn ? `${baseMsg} ${warn}` : baseMsg);
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to request approval');
    } finally {
      setRequesting(false);
      refreshPublishWindow();
    }
  };

  const resetAllMarks = () => {
    if (!confirm(`Reset ${displayLabel} marks for all students in this section?`)) return;
    if (tableBlocked) return;
    setSheet((prev) => ({
      ...prev,
      rows: (prev.rows || []).map((r) => ({ ...r, co3: '', co4: '', total: '' })),
    }));
  };

  function markManagerSnapshotOf(s: Ssa2Sheet): string {
    return JSON.stringify({
      maxTotal: MAX_ASMT2,
      coMax: CO_MAX,
      selectedBtls: selectedBtls.slice(),
      btlMax: BTL_MAX,
    });
  }

  async function requestMarkManagerEdit() {
    if (!subjectId) return;
    if (!markManagerEditRequestsEnabled) {
      alert('Edit requests are disabled by IQAC.');
      return;
    }
    setMarkManagerBusy(true);
    setMarkManagerError(null);
    try {
      const created = await createEditRequest({
        assessment: assessmentKey,
        subject_code: String(subjectId),
        scope: 'MARK_MANAGER',
        reason: `Edit request: Mark Manager changes for ${displayLabel} ${subjectId}`,
        teaching_assignment_id: teachingAssignmentId,
      });
      alert(formatEditRequestSentMessage(created));
      try {
        await (refreshMarkManagerEditWindow ? refreshMarkManagerEditWindow({ silent: true }) : Promise.resolve());
      } catch {}
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
    if (!editRequestsEnabled) {
      alert('Edit requests are disabled by IQAC.');
      return;
    }

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
      try {
        await (refreshMarkEntryEditWindow ? refreshMarkEntryEditWindow({ silent: true }) : Promise.resolve());
      } catch {}
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
      const nextSheet: Ssa2Sheet = { ...sheet, markManagerLocked: true, markManagerSnapshot: snapshot, markManagerApprovalUntil: approvalUntil };
      const payload: Ssa2DraftPayload = { sheet: nextSheet, selectedBtls };
      setSheet(nextSheet);
      setMarkManagerModal(null);

      await saveDraft(assessmentKey, String(subjectId), payload, teachingAssignmentId);
      setSavedAt(new Date().toLocaleString());

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
    }
  }

  const updateRow = (idx: number, patch: Partial<Ssa2Row>) => {
    setSheet((prev) => {
      const copy = prev.rows.slice();
      const existing = copy[idx] || ({ studentId: 0, section: '', registerNo: '', name: '', co3: '', co4: '', total: '' } as Ssa2Row);
      const updated = { ...existing, ...patch };
      // Auto-compute total from co3 + co4
      if ('co3' in patch || 'co4' in patch) {
        const c3 = typeof updated.co3 === 'number' ? updated.co3 : 0;
        const c4 = typeof updated.co4 === 'number' ? updated.co4 : 0;
        updated.total = (updated.co3 === '' && updated.co4 === '') ? '' : round1(c3 + c4);
      }
      copy[idx] = updated;
      return { ...prev, rows: copy };
    });
  };

  const exportSheetCsv = () => {
    const out = sheet.rows.map((r, i) => {
      const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT2) : null;
      const total = totalRaw == null ? '' : round1(totalRaw);

      const co3 = typeof r.co3 === 'number' ? clamp(r.co3, 0, CO_MAX.co3) : (totalRaw != null ? clamp(round1(totalRaw / 2), 0, CO_MAX.co3) : null);
      const co4 = typeof r.co4 === 'number' ? clamp(r.co4, 0, CO_MAX.co4) : (totalRaw != null ? clamp(round1(totalRaw / 2), 0, CO_MAX.co4) : null);

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
        registerNo: shortenRegisterNo(r.registerNo),
        name: r.name,
        co3_mark: co3 ?? '',
        co3_pct: pct(co3, CO_MAX.co3),
        co4_mark: co4 ?? '',
        co4_pct: pct(co4, CO_MAX.co4),
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

      row[displayLabel] = total;
      if (showTotalColumn) row.total = total;
      return row;
    });

    downloadCsv(`${subjectId}_${safeFilePart(displayLabel) || 'SSA2'}_sheet.csv`, out);
  };

  const exportSheetExcel = () => {
    if (!sheet.rows.length) return;

    const q1Max = Number.isFinite(Number(CO_MAX.co3)) ? Number(CO_MAX.co3) : 0;
    const q2Max = Number.isFinite(Number(CO_MAX.co4)) ? Number(CO_MAX.co4) : 0;

    const header = ['Register No', 'Student Name', `Q1 (${q1Max.toFixed(2)})`, `Q2 (${q2Max.toFixed(2)})`, 'Status'];
    const data = sheet.rows.map((r) => [r.registerNo, r.name, '', '', 'present']);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, displayLabel || 'SSA2');

    const filename = `${subjectId}_${safeFilePart(displayLabel) || 'SSA2'}_template.xlsx`;
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
      .replace(/[^0-9a-z]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeNameKey(v: any): string {
    return String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  const triggerExcelImport = () => {
    if (tableBlocked) return;
    setExcelImportHelpOpen(true);
  };

  const chooseExcelImportFile = () => {
    if (tableBlocked) return;
    excelFileInputRef.current?.click();
  };

  const importFromExcel = async (file: File) => {
    if (!file) return;
    setExcelBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellText: true });
      const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
      if (!sheetNames.length) throw new Error('No sheet found in the Excel file.');

      const parseSheetRows = (ws: any): any[][] => {
        const cellAddrRe = /^[A-Z]+\d+$/;
        let minR = Number.POSITIVE_INFINITY;
        let minC = Number.POSITIVE_INFINITY;
        let maxR = -1;
        let maxC = -1;

        for (const k of Object.keys(ws || {})) {
          if (!cellAddrRe.test(k)) continue;
          const { r, c } = (XLSX as any).utils.decode_cell(k);
          if (r < minR) minR = r;
          if (c < minC) minC = c;
          if (r > maxR) maxR = r;
          if (c > maxC) maxC = c;
        }

        let range: { s: { r: number; c: number }; e: { r: number; c: number } } | undefined;
        if (Number.isFinite(minR) && maxR >= 0 && maxC >= 0) {
          range = {
            s: { r: minR, c: minC },
            e: { r: Math.min(maxR, minR + 5000), c: Math.min(maxC, minC + 200) },
          };
        } else if (typeof (ws as any)?.['!ref'] === 'string' && (ws as any)['!ref']) {
          try {
            const decoded = (XLSX as any).utils.decode_range((ws as any)['!ref']);
            range = {
              s: decoded.s,
              e: { r: Math.min(decoded.e.r, decoded.s.r + 5000), c: Math.min(decoded.e.c, decoded.s.c + 200) },
            };
          } catch {
            range = undefined;
          }
        }

        return XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: '',
          blankrows: false,
          raw: true,
          ...(range ? { range } : null),
        }) as any;
      };

      const compact = (h: string) => String(h || '').replace(/\s+/g, '');

      const scanHeaderRow = (rows: any[][]) => {
        const maxScan = Math.min(rows.length - 1, 25);
        for (let r = 0; r <= maxScan; r++) {
          const rowNorm: string[] = (rows[r] || []).map(normalizeHeaderCell);
          const findColLocal = (pred: (h: string) => boolean) => rowNorm.findIndex((h) => pred(h));
          const reg = findColLocal((h) => {
            const ch = compact(h);
            return ch === 'regno' || ch === 'registernumber' || h === 'register no' || h === 'reg no' || h.includes('register');
          });
          if (reg < 0) continue;
          const hasMarks =
            findColLocal((h) => {
              const ch = compact(h);
              return (
                ch.startsWith('q1') ||
                ch.startsWith('q2') ||
                ch.startsWith('co3') ||
                ch.startsWith('co4') ||
                ch.startsWith('co1') ||
                ch.startsWith('co2') ||
                ch.includes('total')
              );
            }) >= 0;
          if (!hasMarks && r !== 0) continue;
          return { headerRowIndex: r, header: rowNorm };
        }
        return { headerRowIndex: 0, header: (rows[0] || []).map(normalizeHeaderCell) };
      };

      const pickBestSheet = () => {
        let best: { name: string; ws: any; rows: any[][]; headerRowIndex: number; header: string[]; regCol: number } | null = null;
        let bestRegCount = -1;

        for (const name of sheetNames) {
          const ws = (workbook.Sheets as any)?.[name];
          if (!ws) continue;
          const rows: any[][] = parseSheetRows(ws);
          if (!Array.isArray(rows) || rows.length === 0) continue;

          const { headerRowIndex, header } = scanHeaderRow(rows);
          const findCol = (pred: (h: string) => boolean) => header.findIndex((h) => pred(h));
          const regColRel = findCol((h) => {
            const ch = compact(h);
            return ch === 'regno' || ch === 'registernumber' || h === 'register no' || h === 'reg no' || h.includes('register');
          });
          if (regColRel < 0) continue;

          let regCount = 0;
          for (let r = headerRowIndex + 1; r < rows.length; r++) {
            const line = rows[r] || [];
            let found = false;
            for (let c = 0; c < Math.min(line.length, 200); c++) {
              const norm = normalizeRegisterNo(line[c]);
              if (norm.length >= 6) {
                found = true;
                break;
              }
            }
            if (found) regCount += 1;
          }

          if (regCount > bestRegCount) {
            bestRegCount = regCount;
            best = { name, ws, rows, headerRowIndex, header, regCol: regColRel };
          }
        }

        if (!best) {
          const name = sheetNames[0];
          const ws = (workbook.Sheets as any)?.[name];
          const rows: any[][] = parseSheetRows(ws);
          const { headerRowIndex, header } = scanHeaderRow(rows);
          const findCol = (pred: (h: string) => boolean) => header.findIndex((h) => pred(h));
          const regColRel = findCol((h) => {
            const ch = compact(h);
            return ch === 'regno' || ch === 'registernumber' || h === 'register no' || h === 'reg no' || h.includes('register');
          });
          best = { name, ws, rows, headerRowIndex, header, regCol: regColRel };
        }
        return { best, bestRegCount };
      };

      const picked = pickBestSheet();
      const rows: any[][] = picked.best?.rows || [];
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('Excel sheet is empty.');

      const { headerRowIndex, header } = picked.best ? { headerRowIndex: picked.best.headerRowIndex, header: picked.best.header } : scanHeaderRow(rows);
      const findCol = (pred: (h: string) => boolean) => header.findIndex((h) => pred(h));

      const regColRel = picked.best?.regCol ?? findCol((h) => {
        const ch = compact(h);
        return ch === 'regno' || ch === 'registernumber' || h === 'register no' || h === 'reg no' || h.includes('register');
      });
      const nameColRel = findCol((h) => {
        const ch = compact(h);
        return ch === 'studentname' || ch === 'name' || h === 'student name' || h === 'name' || h.includes('student');
      });
      const q1ColRel = findCol((h) => {
        const ch = compact(h);
        // SSA2 stores CO3/CO4 but Excel templates often use Q1/Q2.
        return ch.startsWith('q1') || ch.startsWith('co3') || ch.startsWith('co1');
      });
      const q2ColRel = findCol((h) => {
        const ch = compact(h);
        return ch.startsWith('q2') || ch.startsWith('co4') || ch.startsWith('co2');
      });
      const totalColRel = findCol((h) => {
        const ch = compact(h);
        return ch === 'total' || ch.includes('total');
      });
      const statusColRel = findCol((h) => {
        const ch = compact(h);
        return ch === 'status' || ch.includes('status');
      });

      if (regColRel < 0) throw new Error('Could not find “Register No” column.');

      const regCol = regColRel;
      const nameCol = nameColRel >= 0 ? nameColRel : -1;
      const q1Col = q1ColRel >= 0 ? q1ColRel : -1;
      const q2Col = q2ColRel >= 0 ? q2ColRel : -1;
      const totalCol = totalColRel >= 0 ? totalColRel : -1;
      const statusCol = statusColRel >= 0 ? statusColRel : -1;

      const q1Max = Number.isFinite(Number(CO_MAX.co3)) ? Number(CO_MAX.co3) : 0;
      const q2Max = Number.isFinite(Number(CO_MAX.co4)) ? Number(CO_MAX.co4) : 0;

      const applyImport = (existingRows: any[]) => {
        const fullToIdx = new Map<string, number | null>();
        const last10ToIdx = new Map<string, number | null>();
        const last8ToIdx = new Map<string, number | null>();

        const addUnique = (m: Map<string, number | null>, k: string, idx: number) => {
          if (!k) return;
          if (!m.has(k)) m.set(k, idx);
          else m.set(k, null);
        };

        existingRows.forEach((row, idx) => {
          const norm = normalizeRegisterNo(row?.registerNo);
          if (!norm) return;
          addUnique(fullToIdx, norm, idx);
          if (norm.length > 10) addUnique(last10ToIdx, norm.slice(-10), idx);
          if (norm.length > 8) addUnique(last8ToIdx, norm.slice(-8), idx);
        });

        const resolveRosterIdx = (norm: string): number | undefined => {
          if (!norm) return undefined;
          const fullHit = fullToIdx.get(norm);
          if (typeof fullHit === 'number') return fullHit;

          if (norm.length === 10) {
            const hit10 = last10ToIdx.get(norm);
            if (typeof hit10 === 'number') return hit10;
          }
          if (norm.length === 8) {
            const hit8 = last8ToIdx.get(norm);
            if (typeof hit8 === 'number') return hit8;
          }
          if (norm.length > 10) {
            const hit10 = last10ToIdx.get(norm.slice(-10));
            if (typeof hit10 === 'number') return hit10;
          }
          if (norm.length > 8) {
            const hit8 = last8ToIdx.get(norm.slice(-8));
            if (typeof hit8 === 'number') return hit8;
          }
          return undefined;
        };

        const stats = {
          excelRegRows: 0,
          matchedRows: 0,
          unmatchedRows: 0,
          unmatchedSamples: [] as string[],
        };

        const nextRows = existingRows.slice();

        for (let r = headerRowIndex + 1; r < rows.length; r++) {
          const line = rows[r] || [];
          let normReg = normalizeRegisterNo(line[regCol]);
          if (normReg.length < 6) {
            normReg = '';
            for (let c = 0; c < Math.min(line.length, 200); c++) {
              const n = normalizeRegisterNo(line[c]);
              if (n.length >= 6) {
                normReg = n;
                break;
              }
            }
          }

          if (!normReg) continue;
          stats.excelRegRows += 1;
          const idx = resolveRosterIdx(normReg);
          if (idx == null) {
            stats.unmatchedRows += 1;
            if (stats.unmatchedSamples.length < 10) stats.unmatchedSamples.push(normReg);
            continue;
          }
          stats.matchedRows += 1;

          const statusRaw = statusCol >= 0 ? String(line[statusCol] ?? '') : '';
          const status = statusRaw.trim().toLowerCase();
          const isAbsent = status === 'absent' || status === 'ab' || status === 'a';

          const q1 = q1Col >= 0 ? readFiniteNumber(line[q1Col]) : null;
          const q2 = q2Col >= 0 ? readFiniteNumber(line[q2Col]) : null;
          const totalX = totalCol >= 0 ? readFiniteNumber(line[totalCol]) : null;

          const prevRow = nextRows[idx] || {};
          const patch: any = {};

          const toReviewSplits = (rawMark: number | null, coKey: 'co3' | 'co4') => {
            if (rawMark == null) return null;
            const coMax = coKey === 'co3' ? CO_MAX.co3 : CO_MAX.co4;
            const n0 = clamp(Math.trunc(rawMark), 0, coMax);
            const splitCfgRaw = reviewSplitEnabled ? (((sheet as any)?.coSplitMax || {}) as { co3?: Array<number | ''>; co4?: Array<number | ''> }) : {};
            const capsRaw = (coKey === 'co3' ? splitCfgRaw.co3 : splitCfgRaw.co4) || [];
            const count = Math.max(1, Array.isArray(capsRaw) ? capsRaw.length : 0);
            const caps = Array.from({ length: count }).map((_, i) => {
              const v = (Array.isArray(capsRaw) ? capsRaw[i] : undefined) as any;
              const cap = typeof v === 'number' && Number.isFinite(v) ? clamp(Math.trunc(v), 0, coMax) : coMax;
              return cap;
            });

            let remaining = n0;
            const out: Array<number | ''> = [];
            for (let i = 0; i < count; i++) {
              const cap = caps[i] ?? coMax;
              const v = clamp(Math.min(remaining, cap), 0, coMax);
              out.push(v);
              remaining = clamp(remaining - v, 0, coMax);
            }
            return out;
          };

          if (isAbsent) {
            if (isReview) {
              patch.reviewCoMarks = { co3: [0], co4: [0] };
              patch.total = 0;
            } else {
              patch.co3 = 0;
              patch.co4 = 0;
              patch.total = 0;
            }
          } else {
            if (isReview) {
              const prevReview = { ...((prevRow as any)?.reviewCoMarks || {}) } as { co3?: Array<number | ''>; co4?: Array<number | ''> };
              const nextCo3 = toReviewSplits(q1, 'co3') ?? prevReview.co3;
              const nextCo4 = toReviewSplits(q2, 'co4') ?? prevReview.co4;

              const sumArr = (arr: any) =>
                (Array.isArray(arr) ? arr : []).reduce<number>((acc, v) => acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0);

              patch.reviewCoMarks = {
                ...prevReview,
                ...(nextCo3 != null ? { co3: nextCo3 } : {}),
                ...(nextCo4 != null ? { co4: nextCo4 } : {}),
              };
              patch.total = round1(clamp(sumArr(nextCo3) + sumArr(nextCo4), 0, MAX_ASMT2));
            } else {
              if (q1 != null) patch.co3 = round1(clamp(q1, 0, q1Max));
              if (q2 != null) patch.co4 = round1(clamp(q2, 0, q2Max));

              if (totalX != null) {
                patch.total = round1(clamp(totalX, 0, MAX_ASMT2));
              } else if (q1 != null && q2 != null) {
                patch.total = round1(clamp((patch.co3 as number) + (patch.co4 as number), 0, MAX_ASMT2));
              }
            }
          }

          nextRows[idx] = { ...prevRow, ...patch };
        }

        return { nextRows, stats };
      };

      const existingRows = Array.isArray((sheet as any)?.rows) ? (sheet as any).rows : [];
      const applied = applyImport(existingRows);
      const nextRows = applied.nextRows;
      const importStats = applied.stats;

      const isNum = (v: any) => typeof v === 'number' && Number.isFinite(v);
      let filledCells = 0;
      for (let i = 0; i < nextRows.length; i++) {
        const before = existingRows[i] || {};
        const after = nextRows[i] || {};
        if (isReview) {
          const b3 = (before as any)?.reviewCoMarks?.co3;
          const a3 = (after as any)?.reviewCoMarks?.co3;
          const b4 = (before as any)?.reviewCoMarks?.co4;
          const a4 = (after as any)?.reviewCoMarks?.co4;
          const countNewNums = (b: any, a: any) => {
            const bb = Array.isArray(b) ? b : [];
            const aa = Array.isArray(a) ? a : [];
            const len = Math.max(bb.length, aa.length);
            let c = 0;
            for (let j = 0; j < len; j++) {
              if (!isNum(bb[j]) && isNum(aa[j])) c += 1;
            }
            return c;
          };
          filledCells += countNewNums(b3, a3) + countNewNums(b4, a4);
        } else {
          if (!isNum(before.co3) && isNum(after.co3)) filledCells += 1;
          if (!isNum(before.co4) && isNum(after.co4)) filledCells += 1;
        }
      }

      setSheet((prev) => ({ ...prev, rows: nextRows }));

      if (importStats.unmatchedRows > 0) {
        console.warn('[SSA2] Excel rows not matched by register no:', {
          excelRegRows: importStats.excelRegRows,
          matchedRows: importStats.matchedRows,
          unmatchedRows: importStats.unmatchedRows,
          samples: importStats.unmatchedSamples,
        });
      }

      alert(
        `Import complete. Matched: ${importStats.matchedRows} row(s). Unmatched: ${importStats.unmatchedRows} row(s). Filled: ${filledCells} cell(s).${
          importStats.unmatchedRows > 0 ? ' (Open console for unmatched register samples.)' : ''
        }`,
      );
    } finally {
      setExcelBusy(false);
    }
  };

  const handleExcelFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setExcelImportHelpOpen(false);
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

  const coSplitMax = (sheet as any).coSplitMax as { co3?: Array<number | ''>; co4?: Array<number | ''> } | undefined;
  const safeSplitArr = (raw: any, fallbackMax: number): Array<number | ''> => {
    if (!Array.isArray(raw) || raw.length === 0) return [];
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
  const sumSplit = (arr: Array<number | ''>) =>
    arr.reduce<number>((a, b) => a + (typeof b === 'number' && Number.isFinite(b) ? b : 0), 0);
  const padTo = <T,>(arr: T[], len: number, fill: T) => (arr.length >= len ? arr.slice(0, len) : arr.concat(Array.from({ length: len - arr.length }, () => fill)));

  // Review-only CO split rows
  // Split config is a header-level setting; keep it editable even if the
  // student mark table is blocked by Mark Manager gating.
  const splitEditDisabled = Boolean(globalLocked || publishedEditLocked);
  const co3Splits = isReview && reviewSplitEnabled ? safeSplitArr((coSplitMax as any)?.co3, CO_MAX.co3) : ([] as Array<number | ''>);
  const co4Splits = isReview && reviewSplitEnabled ? safeSplitArr((coSplitMax as any)?.co4, CO_MAX.co4) : ([] as Array<number | ''>);
  const co3SplitRowCount = isReview ? co3Splits.length : 0;
  const co4SplitRowCount = isReview ? co4Splits.length : 0;
  const reviewCo3ColumnCount = isReview ? Math.max(1, co3SplitRowCount) : 1;
  const reviewCo4ColumnCount = isReview ? Math.max(1, co4SplitRowCount) : 1;
  const reviewCoAttainmentCols = isReview ? (reviewCo3ColumnCount + reviewCo4ColumnCount) * 2 : 4;
  const co3TotalSplit = isReview ? sumSplit(co3Splits) : 0;
  const co4TotalSplit = isReview ? sumSplit(co4Splits) : 0;
  const reviewSplitsOk = !isReview || (co3TotalSplit <= CO_MAX.co3 + 1e-6 && co4TotalSplit <= CO_MAX.co4 + 1e-6);

  const normalizeReviewMarks = (raw: any, count: number, coMax: number): Array<number | ''> => {
    if (!reviewSplitEnabled) {
      const total = (Array.isArray(raw) ? raw : []).reduce<number>((acc, v) => {
        const n = Number(v);
        return Number.isFinite(n) ? acc + Math.trunc(n) : acc;
      }, 0);
      return [clamp(total, 0, coMax)];
    }

    const arr = padTo(
      (Array.isArray(raw) ? raw.slice(0, count) : []).map((v) => {
        if (v === '') return '';
        const n = Number(v);
        return Number.isFinite(n) ? Math.trunc(n) : '';
      }),
      count,
      '' as const,
    );

    let used = 0;
    return arr.map((v) => {
      if (v === '') return '';
      const n = Number(v);
      if (!Number.isFinite(n)) return '';
      const clamped = clamp(Math.trunc(n), 0, Math.max(0, coMax - used));
      used += clamped;
      return clamped;
    });
  };

  const addCoSplitRow = (coKey: 'co3' | 'co4') => {
    if (!isReview || splitEditDisabled) return;
    setSheet((prev) => {
      const raw = (prev as any).coSplitMax || {};
      const a0 = safeSplitArr(raw.co3, CO_MAX.co3);
      const b0 = safeSplitArr(raw.co4, CO_MAX.co4);
      const target = coKey === 'co3' ? a0 : b0;
      if (target.length >= 15) return prev;
      const nextA = coKey === 'co3' ? a0.concat(['']) : a0;
      const nextB = coKey === 'co4' ? b0.concat(['']) : b0;
      return { ...prev, coSplitMax: { ...(prev as any).coSplitMax, co3: nextA, co4: nextB } };
    });
  };

  const removeCoSplitRow = (coKey: 'co3' | 'co4') => {
    if (!isReview || splitEditDisabled) return;
    setSheet((prev) => {
      const raw = (prev as any).coSplitMax || {};
      const a0 = safeSplitArr(raw.co3, CO_MAX.co3);
      const b0 = safeSplitArr(raw.co4, CO_MAX.co4);
      const target = coKey === 'co3' ? a0 : b0;
      if (target.length <= 0) return prev;
      const nextA = coKey === 'co3' ? a0.slice(0, -1) : a0;
      const nextB = coKey === 'co4' ? b0.slice(0, -1) : b0;
      return { ...prev, coSplitMax: { ...(prev as any).coSplitMax, co3: nextA, co4: nextB } };
    });
  };

  const updateReviewCoMark = (rowIdx: number, coKey: 'co3' | 'co4', splitIdx: number, rawVal: string) => {
    if (!isReview || marksEditDisabled) return;
    setSheet((prev) => {
      const nextRows = prev.rows.slice();
      const existing = (nextRows[rowIdx] || { studentId: 0, section: '', registerNo: '', name: '', total: '' }) as Ssa2Row;
      const row: Ssa2Row = { ...existing };

      const review = { ...((row as any).reviewCoMarks || {}) } as { co3?: Array<number | ''>; co4?: Array<number | ''> };
      const count = coKey === 'co3' ? reviewCo3ColumnCount : reviewCo4ColumnCount;
      const coMax = coKey === 'co3' ? CO_MAX.co3 : CO_MAX.co4;
      const base = normalizeReviewMarks(review[coKey], count, coMax);
      const arr = padTo(base, count, '' as const).slice(0, count);
      const splitCfgRaw = ((prev as any)?.coSplitMax || {}) as { co3?: Array<number | ''>; co4?: Array<number | ''> };
      const splitCfg = coKey === 'co3' ? safeSplitArr(splitCfgRaw.co3, CO_MAX.co3) : safeSplitArr(splitCfgRaw.co4, CO_MAX.co4);

      if (rawVal === '') {
        arr[splitIdx] = '';
      } else {
        const parsed = Number(rawVal);
        const nextN = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
        const others = arr.reduce<number>((acc, v, i) => {
          if (i === splitIdx) return acc;
          return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        }, 0);
        const remaining = clamp(coMax - others, 0, coMax);
        const splitCapRaw = splitCfg[splitIdx];
        const splitCap = typeof splitCapRaw === 'number' && Number.isFinite(splitCapRaw) ? clamp(splitCapRaw, 0, coMax) : coMax;
        if (!Number.isFinite(nextN)) {
          arr[splitIdx] = '';
        } else {
          const nextVal = Math.max(0, nextN);
          const allowedMax = Math.min(remaining, splitCap);
          if (nextVal > allowedMax) return prev;
          arr[splitIdx] = nextVal;
        }
      }

      const nextCo3 = normalizeReviewMarks(coKey === 'co3' ? arr : review.co3, reviewCo3ColumnCount, CO_MAX.co3);
      const nextCo4 = normalizeReviewMarks(coKey === 'co4' ? arr : review.co4, reviewCo4ColumnCount, CO_MAX.co4);

      row.reviewCoMarks = { co3: nextCo3, co4: nextCo4 };
      row.total = clamp(round1(sumSplit(nextCo3) + sumSplit(nextCo4)), 0, MAX_ASMT2);
      nextRows[rowIdx] = row;
      return { ...prev, rows: nextRows };
    });
  };

  const updateCoSplitAt = (coKey: 'co3' | 'co4', idx: number, rawVal: string) => {
    if (!isReview) return;
    setSheet((prev) => {
      const raw = (prev as any).coSplitMax || {};
      const a0 = safeSplitArr(raw.co3, CO_MAX.co3);
      const b0 = safeSplitArr(raw.co4, CO_MAX.co4);
      const target0 = coKey === 'co3' ? a0 : b0;
      const target = padTo<number | ''>(target0, Math.max(target0.length, idx + 1), '');

      if (rawVal === '') {
        target[idx] = '';
        return {
          ...prev,
          coSplitMax: {
            ...(prev as any).coSplitMax,
            co3: coKey === 'co3' ? target : a0,
            co4: coKey === 'co4' ? target : b0,
          },
        };
      }

      const parsed = Number(rawVal);
      const n = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
      const otherSum = target.reduce<number>((acc: number, v, j) => {
        if (j === idx) return acc;
        return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      }, 0);
      const coMax = coKey === 'co3' ? CO_MAX.co3 : CO_MAX.co4;
      const remaining = clamp(coMax - otherSum, 0, coMax);
      const nextVal = Number.isFinite(n)
        ? (() => {
            const candidate = Math.max(0, n);
            if (candidate > remaining) return null;
            return candidate;
          })()
        : '';
      if (nextVal === null) return prev;
      target[idx] = nextVal as any;
      return {
        ...prev,
        coSplitMax: {
          ...(prev as any).coSplitMax,
          co3: coKey === 'co3' ? target : a0,
          co4: coKey === 'co4' ? target : b0,
        },
      };
    });
  };

  const renderCoSplitHeaderCell = (coKey: 'co3' | 'co4', coMax: number, total: number) => {
    if (!reviewSplitEnabled) {
      return <div style={{ fontWeight: 900, fontSize: 12 }}>{coMax}</div>;
    }

    const arr = coKey === 'co3' ? co3Splits : co4Splits;
    const rowCount = coKey === 'co3' ? reviewCo3ColumnCount : reviewCo4ColumnCount;
    const last = arr.length ? arr[arr.length - 1] : '';
    const lastFilled = typeof last === 'number' && Number.isFinite(last) && last > 0;
    const canAdd = Boolean(!splitEditDisabled && rowCount < 15 && (rowCount === 1 || lastFilled || arr.length === 0 || total < coMax - 1e-6));
    const canRemove = Boolean(!splitEditDisabled && rowCount > 1);
    const remaining = round1(coMax - total);
    const ok = Math.abs(remaining) < 1e-6;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 12 }}>{coMax}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => addCoSplitRow(coKey)}
            style={{ ...splitButtonStyle, opacity: canAdd ? 1 : 0.6, cursor: canAdd ? 'pointer' : 'not-allowed' }}
            aria-label={`Add split row for ${coKey}`}
          >
            +
          </button>
          <button
            type="button"
            disabled={!canRemove}
            onClick={() => removeCoSplitRow(coKey)}
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


  const sheetCardStyle: React.CSSProperties = {
    border: '1px solid rgba(15, 23, 42, 0.08)',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.88)',
    boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
    padding: 16,
    backdropFilter: 'blur(10px)',
  };

  return (
    <>
      <AssessmentContainer>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={loadRoster} className="obe-btn obe-btn-secondary" disabled={rosterLoading}>
            {rosterLoading ? 'Loading roster…' : 'Load/Refresh Roster'}
          </button>
          <button
            onClick={resetAllMarks}
            className="obe-btn obe-btn-danger"
            disabled={!sheet.rows.length || tableBlocked}
            title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
          >
            Reset Marks
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
          {excelImportHelpOpen ? (
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
                onClick={() => setExcelImportHelpOpen(false)}
              >
                <div
                  style={{
                    width: 'min(720px, 96vw)',
                    background: '#fff',
                    borderRadius: 14,
                    border: '1px solid #e5e7eb',
                    padding: 14,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>Import Excel format</div>
                    <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{displayLabel}</div>
                    <button
                      onClick={() => setExcelImportHelpOpen(false)}
                      aria-label="Close"
                      style={{ marginLeft: 8, border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Required headers (first row)</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li><b>Register No</b></li>
                      <li><b>Student Name</b></li>
                      <li><b>Q1</b> (CO-{effectiveCoA} total)</li>
                      <li><b>Q2</b> (CO-{effectiveCoB} total)</li>
                      <li><b>Status</b> (present/absent)</li>
                    </ul>
                    {isReview ? (
                      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                        {reviewSplitEnabled
                          ? 'For TCPR Review sheets, Q1/Q2 are imported into the Review CO columns (split rows are auto-filled from left to right).'
                          : 'For TCPR Review sheets, Q1/Q2 are imported directly into the Review CO columns.'}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                      Tip: You can download the template from “Export Excel”, fill marks, then import it back.
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                    <button className="obe-btn" onClick={() => setExcelImportHelpOpen(false)} disabled={excelBusy}>Cancel</button>
                    <button
                      className="obe-btn obe-btn-primary"
                      onClick={() => {
                        chooseExcelImportFile();
                      }}
                      disabled={excelBusy || tableBlocked}
                    >
                      Choose file
                    </button>
                  </div>
                </div>
              </div>
            </ModalPortal>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={downloadTotals} className="obe-btn obe-btn-secondary" disabled={!sheet.rows.length}>
            Download
          </button>
          {!publishedEditLocked ? (
            <button
              onClick={saveDraftToDb}
              className="obe-btn obe-btn-success"
              disabled={savingDraft || tableBlocked}
              title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
            >
              {savingDraft ? 'Saving…' : 'Save Draft'}
            </button>
          ) : null}
          <button
            onClick={publish}
            className="obe-btn obe-btn-primary"
            disabled={editRequestsBlocked || (publishButtonIsRequestEdit ? markEntryReqPending : publishing || !publishAllowed || tableBlocked || !reviewSplitsOk)}
            title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
          >
            {publishButtonIsRequestEdit ? (markEntryReqPending ? 'Request Pending' : 'Request Edit') : publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {showNameListLockedNotice ? (
        <div style={{ marginTop: 8, padding: 8, background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 8, color: '#065f46', fontWeight: 700 }}>
          Name list locked
        </div>
      ) : null}

      <div style={{ marginTop: 10, fontSize: 12, color: publishAllowed ? '#065f46' : '#b91c1c' }}>
        {publishWindowLoading ? (
          'Checking publish due time…'
        ) : publishWindowError ? (
          publishWindowError
        ) : publishWindow?.due_at ? (
          <div
            style={{
              display: 'inline-block',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: '8px 10px',
              background: '#fff',
              maxWidth: '100%',
            }}
          >
            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 900, letterSpacing: 0.4 }}>REMAINING</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: publishAllowed ? '#065f46' : '#b91c1c' }}>{formatRemaining(remainingSeconds)}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>Due: {new Date(publishWindow.due_at).toLocaleString()}</div>
            {publishWindow.allowed_by_approval && publishWindow.approval_until ? (
              <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>Approved until {new Date(publishWindow.approval_until).toLocaleString()}</div>
            ) : null}
          </div>
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
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Send a request for approval (routes to HOD, then IQAC).</div>
          <textarea
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            placeholder="Reason (required)"
            rows={3}
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="obe-btn" onClick={() => refreshPublishWindow()} disabled={requesting || publishWindowLoading}>Refresh</button>
            <button className="obe-btn obe-btn-primary" onClick={requestApproval} disabled={requesting || !String(requestReason || '').trim()}>{requesting ? 'Requesting…' : 'Request Approval'}</button>
          </div>
          {requestMessage ? <div style={{ marginTop: 8, fontSize: 12, color: '#065f46' }}>{requestMessage}</div> : null}
        </div>
      ) : null}

      {(rosterError || saveError) && (
        <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>
          {rosterError || saveError}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
          {savedBy ? (
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              by <span style={{ color: '#0369a1', fontWeight: 700 }}>{savedBy}</span>
            </div>
          ) : null}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Published</div>
          <div style={{ fontWeight: 700 }}>{publishedAt || '—'}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, ...cardStyle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800 }}>Mark Manager</div>
          <div>
            <button
              className="obe-btn obe-btn-success"
              onClick={() => {
                if (uiReadOnly) return;
                if (markManagerConfirmed && !markManagerEditRequestsEnabled) return;
                setMarkManagerModal({ mode: markManagerConfirmed ? 'request' : 'confirm' });
              }}
              disabled={!subjectId || markManagerBusy || uiReadOnly || (markManagerConfirmed && !markManagerEditRequestsEnabled)}
            >
              {markManagerConfirmed ? 'Edit' : 'Save'}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          <div>
            Max {displayLabel}: <strong style={{ color: '#111' }}>{MAX_ASMT2}</strong>
          </div>
          <div>
            CO-{effectiveCoA} max: <strong style={{ color: '#111' }}>{CO_MAX.co3}</strong> • CO-{effectiveCoB} max: <strong style={{ color: '#111' }}>{CO_MAX.co4}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>Selected BTLs:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6].map((n) => {
                const active = selectedBtls.includes(n);
                const disabled = Boolean(uiReadOnly || markManagerBusy || (markManagerLocked && sheet.markManagerSnapshot != null));
                return (
                  <div
                    key={`card_btl_${n}`}
                    onClick={() => {
                      if (disabled) return;
                      const markManagerConfirmed = sheet.markManagerSnapshot != null;
                      if (markManagerLocked && markManagerConfirmed) return;
                      setSelectedBtls((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : prev.concat(n).sort((a, b) => a - b)));
                    }}
                    style={{
                      ...btlBoxStyle,
                      borderColor: active ? '#16a34a' : '#cbd5e1',
                      background: active ? '#ecfdf5' : '#fff',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.6 : 1,
                      padding: '6px 8px',
                    }}
                    aria-disabled={disabled}
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
          <div style={{ position: 'relative' }}>
          <div className="obe-table-wrapper" style={{ overflowX: 'auto' }}>
              <PublishLockOverlay
                locked={Boolean(globalLocked || publishedEditLocked || (isPublished && lockStatusUnknown))}
                title={globalLocked ? 'Locked by IQAC' : publishedEditLocked ? 'Published — Locked' : 'Table Locked'}
                subtitle={globalLocked ? 'Publishing is turned OFF globally for this assessment.' : publishedEditLocked ? (editRequestsEnabled ? 'Marks are published. Request IQAC approval to edit.' : 'Marks are published. Edit requests are disabled by IQAC.') : 'Confirm the Mark Manager'}
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

              <th style={cellTh} colSpan={isReview ? reviewCoAttainmentCols : 4}>CO ATTAINMENT</th>
              {visibleBtlIndices.length ? <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th> : null}
            </tr>
            <tr>
              <th style={cellTh}>
                <div style={{ fontWeight: 800 }}>COs</div>
                <div style={{ fontSize: 12 }}>{effectiveCoA},{effectiveCoB}</div>
              </th>
              {showTotalColumn ? <th style={cellTh} /> : null}

              <th style={cellTh} colSpan={isReview ? reviewCo3ColumnCount * 2 : 2}>
                {isReview ? renderCoSplitHeaderCell('co3', CO_MAX.co3, co3TotalSplit) : `CO-${effectiveCoA}`}
              </th>
              <th style={cellTh} colSpan={isReview ? reviewCo4ColumnCount * 2 : 2}>
                {isReview ? renderCoSplitHeaderCell('co4', CO_MAX.co4, co4TotalSplit) : `CO-${effectiveCoB}`}
              </th>

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

              {Array.from({ length: (isReview ? reviewCo3ColumnCount + reviewCo4ColumnCount : 2) + visibleBtlIndices.length }).flatMap((_, i) => (
                <React.Fragment key={i}>
                  <th style={cellTh}>Mark</th>
                  <th style={cellTh}>%</th>
                </React.Fragment>
              ))}
            </tr>
            <tr>
              <th style={cellTh}>Name / Max Marks</th>
              <th style={cellTh}>{MAX_ASMT2}</th>
              {showTotalColumn ? <th style={cellTh}>{MAX_ASMT2}</th> : null}
              {isReview && reviewSplitEnabled
                ? Array.from({ length: reviewCo3ColumnCount }).flatMap((_, i) => {
                    const v = i < co3Splits.length ? co3Splits[i] : CO_MAX.co3;
                    return [
                      <th key={`co3-max-${i}`} style={cellTh}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={CO_MAX.co3}
                          step={1}
                          disabled={splitEditDisabled}
                          value={v === '' ? '' : String(v)}
                          onChange={(e) => updateCoSplitAt('co3', i, e.target.value)}
                          style={splitInputStyle}
                        />
                      </th>,
                      <th key={`co3-pct-${i}`} style={cellTh}>%</th>,
                    ];
                  })
                : [
                    <th key="co3-max" style={cellTh}>{CO_MAX.co3}</th>,
                    <th key="co3-pct" style={cellTh}>%</th>,
                  ]}
              {isReview && reviewSplitEnabled
                ? Array.from({ length: reviewCo4ColumnCount }).flatMap((_, i) => {
                    const v = i < co4Splits.length ? co4Splits[i] : CO_MAX.co4;
                    return [
                      <th key={`co4-max-${i}`} style={cellTh}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={CO_MAX.co4}
                          step={1}
                          disabled={splitEditDisabled}
                          value={v === '' ? '' : String(v)}
                          onChange={(e) => updateCoSplitAt('co4', i, e.target.value)}
                          style={splitInputStyle}
                        />
                      </th>,
                      <th key={`co4-pct-${i}`} style={cellTh}>%</th>,
                    ];
                  })
                : [
                    <th key="co4-max" style={cellTh}>{CO_MAX.co4}</th>,
                    <th key="co4-pct" style={cellTh}>%</th>,
                  ]}
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
            ) : tableBlocked && !publishedEditLocked ? (
              <tr>
                <td colSpan={totalTableCols} style={{ padding: 20, textAlign: 'center', color: '#065f46', fontWeight: 900 }}>
                  Table locked — confirm the Mark Manager to enable student marks
                </td>
              </tr>
            ) : (
              sheet.rows.map((r, idx) => {
                const reviewCo3MaxByCol = isReview
                  ? Array.from({ length: reviewCo3ColumnCount }).map((_, splitIdx) => {
                      const v = splitIdx < co3Splits.length ? co3Splits[splitIdx] : CO_MAX.co3;
                      return typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, CO_MAX.co3) : CO_MAX.co3;
                    })
                  : [];
                const reviewCo4MaxByCol = isReview
                  ? Array.from({ length: reviewCo4ColumnCount }).map((_, splitIdx) => {
                      const v = splitIdx < co4Splits.length ? co4Splits[splitIdx] : CO_MAX.co4;
                      return typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, CO_MAX.co4) : CO_MAX.co4;
                    })
                  : [];

                const reviewCo3Marks = isReview ? normalizeReviewMarks((r as any)?.reviewCoMarks?.co3, reviewCo3ColumnCount, CO_MAX.co3) : [];
                const reviewCo4Marks = isReview ? normalizeReviewMarks((r as any)?.reviewCoMarks?.co4, reviewCo4ColumnCount, CO_MAX.co4) : [];
                const reviewCo3Total = isReview ? sumSplit(reviewCo3Marks) : 0;
                const reviewCo4Total = isReview ? sumSplit(reviewCo4Marks) : 0;
                const reviewTotal = isReview ? clamp(round1(reviewCo3Total + reviewCo4Total), 0, MAX_ASMT2) : null;

                // CO3/CO4 values must come from the row fields so inputs can be cleared.
                const co3 = isReview ? null : typeof r.co3 === 'number' ? clamp(r.co3, 0, CO_MAX.co3) : null;
                const co4 = isReview ? null : typeof r.co4 === 'number' ? clamp(r.co4, 0, CO_MAX.co4) : null;

                // Total: for SSA2, show sum of CO-3 and CO-4 (out of 20).
                // If both COs are empty, fall back to stored total (legacy drafts).
                const derivedTotal = !isReview && (co3 != null || co4 != null)
                  ? clamp(round1((co3 ?? 0) + (co4 ?? 0)), 0, MAX_ASMT2)
                  : null;
                const totalRaw = isReview
                  ? reviewTotal
                  : (derivedTotal != null
                    ? derivedTotal
                    : typeof r.total === 'number'
                      ? clamp(Number(r.total), 0, MAX_ASMT2)
                      : null);

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
                      <input
                        style={{ ...inputStyle, background: 'rgba(255,255,255,0.6)' }}
                        readOnly
                        tabIndex={-1}
                        value={totalRaw == null ? '' : String(round1(totalRaw))}
                      />
                    </td>
                    {showTotalColumn ? <td style={{ ...cellTd, textAlign: 'center' }}>{totalRaw ?? ''}</td> : null}
                    {isReview
                      ? reviewCo3Marks.flatMap((mark, splitIdx) => [
                          <td key={`co3-mark-${idx}-${splitIdx}`} style={{ ...cellTd, textAlign: 'center', minWidth: 86 }}>
                            {marksEditDisabled ? (
                              mark === '' ? '' : mark
                            ) : (
                              <input
                                style={inputStyle}
                                type="number"
                                min={0}
                                max={CO_MAX.co3}
                                step={1}
                                value={mark}
                                onChange={(e) => updateReviewCoMark(idx, 'co3', splitIdx, e.target.value)}
                              />
                            )}
                          </td>,
                          <td key={`co3-pct-${idx}-${splitIdx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(mark === '' ? null : Number(mark), reviewCo3MaxByCol[splitIdx] || CO_MAX.co3)}</td>,
                        ])
                      : [
                          <td key={`co3-single-${idx}`} style={{ ...cellTd, textAlign: 'center', minWidth: 86 }}>
                            {marksEditDisabled ? (
                              <span>{co3 ?? ''}</span>
                            ) : (
                              <input
                                style={inputStyle}
                                type="text"
                                inputMode="decimal"
                                value={typeof r.co3 === 'number' ? String(r.co3) : ''}
                                onChange={(e) => {
                                  if (marksEditDisabled) return;
                                  const parsed = parseMarkInput(e.target.value);
                                  if (parsed == null) return updateRow(idx, { co3: '' });
                                  updateRow(idx, { co3: clamp(parsed, 0, CO_MAX.co3) });
                                }}
                                onBlur={(e) => {
                                  const parsed = parseMarkInput(e.target.value);
                                  if (parsed == null) return;
                                  updateRow(idx, { co3: round1(clamp(parsed, 0, CO_MAX.co3)) });
                                }}
                              />
                            )}
                          </td>,
                          <td key={`co3-single-pct-${idx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(co3, CO_MAX.co3)}</td>,
                        ]}
                    {isReview
                      ? reviewCo4Marks.flatMap((mark, splitIdx) => [
                          <td key={`co4-mark-${idx}-${splitIdx}`} style={{ ...cellTd, textAlign: 'center', minWidth: 86 }}>
                            {marksEditDisabled ? (
                              mark === '' ? '' : mark
                            ) : (
                              <input
                                style={inputStyle}
                                type="number"
                                min={0}
                                max={CO_MAX.co4}
                                step={1}
                                value={mark}
                                onChange={(e) => updateReviewCoMark(idx, 'co4', splitIdx, e.target.value)}
                              />
                            )}
                          </td>,
                          <td key={`co4-pct-${idx}-${splitIdx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(mark === '' ? null : Number(mark), reviewCo4MaxByCol[splitIdx] || CO_MAX.co4)}</td>,
                        ])
                      : [
                          <td key={`co4-single-${idx}`} style={{ ...cellTd, textAlign: 'center', minWidth: 86 }}>
                            {marksEditDisabled ? (
                              <span>{co4 ?? ''}</span>
                            ) : (
                              <input
                                style={inputStyle}
                                type="text"
                                inputMode="decimal"
                                value={typeof r.co4 === 'number' ? String(r.co4) : ''}
                                onChange={(e) => {
                                  if (marksEditDisabled) return;
                                  const parsed = parseMarkInput(e.target.value);
                                  if (parsed == null) return updateRow(idx, { co4: '' });
                                  updateRow(idx, { co4: clamp(parsed, 0, CO_MAX.co4) });
                                }}
                                onBlur={(e) => {
                                  const parsed = parseMarkInput(e.target.value);
                                  if (parsed == null) return;
                                  updateRow(idx, { co4: round1(clamp(parsed, 0, CO_MAX.co4)) });
                                }}
                              />
                            )}
                          </td>,
                          <td key={`co4-single-pct-${idx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(co4, CO_MAX.co4)}</td>,
                        ]}

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

            {showPublishedLockPanel && showNameList ? (
              <div
                style={{
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
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  {publishedEditLocked ? (
                    <>
                      <div style={{ fontWeight: 900, color: '#065f46' }}>Published</div>
                      <div style={{ fontSize: 13, color: '#065f46' }}>{editRequestsEnabled ? 'Marks are locked. Request IQAC approval to edit.' : 'Marks are locked. Edit requests are disabled by IQAC.'}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 900, color: '#065f46' }}>Table Locked</div>
                      <div style={{ fontSize: 13, color: '#065f46' }}>Confirm the Mark Manager</div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="obe-btn" onClick={() => setViewMarksModalOpen(true)}>
                    View
                  </button>
                  {editRequestsEnabled ? (
                    <button className="obe-btn obe-btn-success" disabled={markEntryReqPending} onClick={openEditRequestModal}>
                      {markEntryReqPending ? 'Request Pending' : 'Request Edit'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
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
              <div style={{ fontWeight: 800, fontSize: 16, marginTop: 8 }}>{publishedEditLocked ? 'Published — Locked' : 'Table Locked'}</div>
              <div style={{ color: '#6b7280', marginTop: 6 }}>
                {publishedEditLocked
                  ? editRequestsEnabled
                    ? 'Marks published. Use View to inspect or Request Edit to ask IQAC for edit access.'
                    : 'Marks published. Edit requests are disabled by IQAC.'
                  : 'Confirm the Mark Manager to unlock the student list.'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {publishedEditLocked ? (
                  <>
                    <button className="obe-btn" onClick={() => setViewMarksModalOpen(true)}>
                      View
                    </button>
                    {editRequestsEnabled ? (
                      <button className="obe-btn obe-btn-success" disabled={markEntryReqPending} onClick={openEditRequestModal}>
                        {markEntryReqPending ? 'Request Pending' : 'Request Edit'}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button className="obe-btn obe-btn-success" onClick={() => setMarkManagerModal({ mode: 'confirm' })} disabled={!subjectId || markManagerBusy}>
                      Save Mark Manager
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

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
            <div
              style={{ width: 'min(1100px, 96vw)', maxHeight: 'min(80vh, 900px)', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 0, display: 'flex', flexDirection: 'column' }}
              onClick={(e) => e.stopPropagation()}
            >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #eef2f7' }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>View Only</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMarksModalOpen(false);
                }}
                aria-label="Close"
                style={{ marginLeft: 'auto', border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 14 }}>
              {publishedViewLoading ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading published marks…</div> : null}
              {publishedViewError ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{publishedViewError}</div> : null}
            </div>

            <div ref={publishedViewTableRef} style={{ overflow: 'auto', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', borderRadius: 0, maxHeight: '60vh', background: '#fff' }}>
              <table className="ssa-modern-table" style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 920 }}>
                <thead>
                  <tr>
                    <th style={cellTh} colSpan={publishedTableCols}>
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
                    {visibleBtlIndices.length ? <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th> : null}
                  </tr>
                  <tr>
                    <th style={cellTh}>
                      <div style={{ fontWeight: 800 }}>COs</div>
                      <div style={{ fontSize: 12 }}>{effectiveCoA},{effectiveCoB}</div>
                    </th>
                    {showTotalColumn ? <th style={cellTh} /> : null}

                    <th style={cellTh} colSpan={2}>CO-{effectiveCoA}</th>
                    <th style={cellTh} colSpan={2}>CO-{effectiveCoB}</th>

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
                    <th style={cellTh}>{MAX_ASMT2}</th>
                    {showTotalColumn ? <th style={cellTh}>{MAX_ASMT2}</th> : null}
                    <th style={cellTh}>{CO_MAX.co3}</th>
                    <th style={cellTh}>%</th>
                    <th style={cellTh}>{CO_MAX.co4}</th>
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
                      <td colSpan={publishedTableCols} style={{ padding: 14, color: '#6b7280', fontSize: 13 }}>
                        No students loaded yet. Choose a Teaching Assignment above, then click “Load/Refresh Roster”.
                      </td>
                    </tr>
                  ) : (
                    sheet.rows.map((r, idx) => {
                      const raw = publishedViewSnapshot?.marks?.[String(r.studentId)] ?? null;
                      const numericTotal = raw == null || raw === '' ? null : clamp(Number(raw), 0, MAX_ASMT2);

                      const coSplitCount = 2;
                      const coShare = numericTotal == null ? null : round1(numericTotal / coSplitCount);
                      const co3 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co3);
                      const co4 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co4);

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
                          <td style={{ ...cellTd, textAlign: 'center' }}>{co3 ?? ''}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co3 as any, CO_MAX.co3)}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{co4 ?? ''}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co4 as any, CO_MAX.co4)}</td>
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
              <button className="obe-btn" onClick={() => setViewMarksModalOpen(false)}>
                Close
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
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{MAX_ASMT2}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-{effectiveCoA} max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{CO_MAX.co3}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-{effectiveCoB} max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{CO_MAX.co4}</td>
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
                                  onClick={() => {
                                    if (markManagerBusy) return;
                                    setSelectedBtls((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
                                  }}
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
                  await confirmMarkManager();
                }}
              >
                {markManagerModal.mode === 'confirm' ? 'Confirm' : 'Send Request'}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

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
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{displayLabel}</div>
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
                <strong>Subject:</strong> {String(subjectId || '—')}
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
                  await requestMarkEntryEdit();
                }}
              >
                {editRequestBusy ? 'Requesting…' : markEntryReqPending ? 'Request Pending' : 'Send Request'}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      <style>{`
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

      {/* Sheet container */}
      <div style={{ marginTop: 14 }}>
        {showNameList ? (
          <div className="obe-table-wrapper" style={{ overflowX: 'auto' }}>
            {/* ...table and overlay code... (rest of SSA2 sheet) */}
          </div>
        ) : null}
      </div>
      </AssessmentContainer>
    </>
  );
}
