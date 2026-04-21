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
  fetchPublishedReview1,
  fetchPublishedSsa1,
  formatApiErrorMessage,
  formatEditRequestSentMessage,
  publishReview1,
  publishSsa1,
  PublishedSsa1Response,
  resetAssessmentMarks,
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

type Props = { subjectId: string; teachingAssignmentId?: number; label?: string; assessmentKey?: 'ssa1' | 'review1'; classType?: string | null; questionPaperType?: string | null };

type Ssa1Row = {
  studentId: number;
  section: string;
  registerNo: string;
  name: string;
  co1: number | '';
  co2: number | '';
  total: number | '';
  qMarks?: Array<number | ''>;  // per-question marks for SPECIAL/QP-pattern entry
  reviewCoMarks?: {
    co1?: Array<number | ''>;
    co2?: Array<number | ''>;
  };
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

function parseMarkInput(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  // Allow decimals like 4.5
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

function displayBtlMax(raw: any): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BTL_MAX_WHEN_VISIBLE;
}

function storageKey(subjectId: string, assessmentKey: 'ssa1' | 'review1', teachingAssignmentId?: number) {
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

function normalizeRegDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}
function shortenRegisterNo(registerNo: string): string {
  return String(registerNo || '').trim();
}

export default function Ssa1SheetEntry({ subjectId, teachingAssignmentId, label, assessmentKey = 'ssa1', classType, questionPaperType }: Props) {
  const displayLabel = String(label || 'SSA1');
  const isReview = assessmentKey === 'review1';
  const showTotalColumn = false;
  const key = useMemo(() => storageKey(subjectId, assessmentKey, teachingAssignmentId), [subjectId, assessmentKey, teachingAssignmentId]);
  const fetchPublished = assessmentKey === 'review1'
    ? (sid: string) => fetchPublishedReview1(sid, teachingAssignmentId)
    : (sid: string) => fetchPublishedSsa1(sid, teachingAssignmentId);
  const publishNow = assessmentKey === 'review1' ? publishReview1 : publishSsa1;
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [taMeta, setTaMeta] = useState<{ courseName?: string; courseCode?: string; className?: string } | null>(null);

  // ── IQAC QP Pattern: derive effective CO numbers and max marks for SPECIAL courses ──
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
      const qpForApi = (classTypeKey === 'THEORY' || classTypeKey === 'SPECIAL') ? (qpTypeKey || null) : null;
      try {
        const res: any = await fetchIqacQpPattern({ class_type: classTypeKey, question_paper_type: qpForApi, exam: 'SSA1' as any });
        if (!alive) return;
        const p = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
        setIqacPattern(p.length ? (res.pattern as any) : null);
      } catch {
        if (alive) setIqacPattern(null);
      }
    })();
    return () => { alive = false; };
  }, [classTypeKey, qpTypeKey, assessmentKey]);

  // Derive effective CO numbers from IQAC pattern (default: 1, 2 for SSA1)
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
    return 1;
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
    return 2;
  }, [iqacPattern]);

  // For SPECIAL courses: derive max marks from QP pattern
  const qpDerivedMax = useMemo(() => {
    if (classTypeKey !== 'SPECIAL' || !iqacPattern?.marks?.length) return null;
    const marks = iqacPattern.marks;
    const cos = Array.isArray(iqacPattern.cos) ? iqacPattern.cos : [];
    const total = marks.reduce((s, m) => s + (Number.isFinite(m) ? m : 0), 0);
    // Group marks by effective CO
    const uniqueCos = [...new Set(
      cos.flatMap((c) => {
        const s = String(c ?? '');
        if (s.includes('&')) return s.split('&').map(Number);
        const m = s.match(/\d+/);
        return m ? [Number(m[0])] : [];
      }).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5)
    )].sort((a, b) => a - b);
    if (uniqueCos.length === 0) return null;
    let coAMax = 0;
    let coBMax = 0;
    for (let i = 0; i < marks.length; i++) {
      const m = Number.isFinite(marks[i]) ? marks[i] : 0;
      const coNum = (() => {
        const s = String(cos[i] ?? '');
        const match = s.match(/\d+/);
        return match ? Number(match[0]) : null;
      })();
      if (coNum === uniqueCos[0]) coAMax += m;
      else coBMax += m;
    }
    return { total, co1: coAMax, co2: coBMax };
  }, [classTypeKey, iqacPattern]);

  const [sheet, setSheet] = useState<Ssa1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    rows: [],
    coSplitMax: isReview ? { co1: [], co2: [] } : undefined,
    // Default: locked until Mark Manager is confirmed (saved)
    markManagerLocked: false,
    markManagerSnapshot: null,
    markManagerApprovalUntil: null,
  });

  const masterTermLabel = String(masterCfg?.termLabel || 'KRCT AY25-26');
  const ssa1Cfg = masterCfg?.assessments?.ssa1 || {};
  const MAX_ASMT1_BASE = qpDerivedMax ? qpDerivedMax.total : (Number.isFinite(Number(ssa1Cfg?.maxTotal)) ? Number(ssa1Cfg.maxTotal) : DEFAULT_MAX_ASMT1);
  const MAX_ASMT1 = isReview ? 30 : MAX_ASMT1_BASE;
  const CO_MAX_BASE = qpDerivedMax
    ? { co1: qpDerivedMax.co1, co2: qpDerivedMax.co2 }
    : {
        co1: Number.isFinite(Number(ssa1Cfg?.coMax?.co1)) ? Number(ssa1Cfg.coMax.co1) : DEFAULT_CO_MAX.co1,
        co2: Number.isFinite(Number(ssa1Cfg?.coMax?.co2)) ? Number(ssa1Cfg.coMax.co2) : DEFAULT_CO_MAX.co2,
      };
  const CO_MAX = isReview ? { co1: 15, co2: 15 } : CO_MAX_BASE;
  // For SPECIAL single-CO: hide second column when co2 max is 0
  const hideSecondCo = !isReview && CO_MAX.co2 === 0;

  // Per-question structure derived from QP pattern for SPECIAL courses
  const qpQuestions = useMemo(() => {
    if (classTypeKey !== 'SPECIAL' || !iqacPattern) return [] as Array<{max: number; coKey: 'co1' | 'co2'}>;
    const marks = Array.isArray((iqacPattern as any).marks) ? (iqacPattern as any).marks as number[] : [];
    const cos = Array.isArray((iqacPattern as any).cos) ? (iqacPattern as any).cos as (number | string)[] : [];
    return marks.map((m, i) => {
      const coRaw = i < cos.length ? cos[i] : null;
      const s = String(coRaw ?? '');
      const coNum = Number(s.match(/\d+/)?.[0]);
      const coKey: 'co1' | 'co2' = coNum === effectiveCoA ? 'co1' : 'co2';
      return { max: Number.isFinite(Number(m)) ? Number(m) : 0, coKey };
    });
  }, [iqacPattern, classTypeKey, effectiveCoA]);

  // Use per-question entry mode for SPECIAL courses with QP pattern
  const useQpQEntry = !isReview && classTypeKey === 'SPECIAL' && qpQuestions.length > 0;

  const reviewCfg = isReview ? ((((masterCfg as any)?.review_config || {}).TCPR || {})[assessmentKey] || {}) : null;
  const reviewSplitEnabled = Boolean(isReview && (reviewCfg as any)?.split_enabled);
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
  const [excelImportHelpOpen, setExcelImportHelpOpen] = useState(false);


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
  const [alphaOrderEnabled, setAlphaOrderEnabled] = useState(false);
  const [digitFilterEnabled, setDigitFilterEnabled] = useState(false);
  const [digitFilterLength, setDigitFilterLength] = useState<2 | 3 | 4 | 5 | 6 | 7 | 8>(3);

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
  } = useMarkTableLock({ assessment: assessmentKey, subjectCode: String(subjectId || ''), teachingAssignmentId, options: { poll: false } });
  const { data: markManagerEditWindow } = useEditWindow({ assessment: assessmentKey, subjectCode: String(subjectId || ''), scope: 'MARK_MANAGER', teachingAssignmentId, options: { poll: false } });
  const { data: markEntryEditWindow } = useEditWindow({ assessment: assessmentKey, subjectCode: String(subjectId || ''), scope: 'MARK_ENTRY', teachingAssignmentId, options: { poll: false } });

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [resettingMarks, setResettingMarks] = useState(false);

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

  const editRequestsEnabled = useMarkEntryEditRequestsEnabled();
  const markManagerEditRequestsEnabled = useMarkManagerEditRequestsEnabled();

  // When published, the list normally locks unless IQAC explicitly opens editing.
  // If IQAC disables edit requests entirely, bypass that published lock state.
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

  const marksEditDisabled = Boolean(globalLocked || publishedEditLocked || tableBlocked);

  // Show the table only after Mark Manager has been confirmed (snapshot saved).
  // When published and locked, the table remains visible but strictly read-only.
  const showNameList = Boolean(sheet.markManagerSnapshot != null);

  const visibleBtlIndices = useMemo(() => {
    const set = new Set(selectedBtls);
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [selectedBtls]);

  const publishedTableCols = useMemo(() => {
    // Layout matching the Excel header template, but BTL columns are dynamic.
    // S.No, RegNo, Name, SSA1 = 4 (and optional Total = +1)
    // CO Attainment: 4 normally, 2 hideSecondCo, or Q+pct cols for qpQEntry mode
    // BTL Attainment = selected count * 2 (Mark/% per BTL)
    const numActiveCOs = hideSecondCo ? 1 : 2;
    const coCols = useQpQEntry ? (qpQuestions.length + numActiveCOs) : (hideSecondCo ? 2 : 4);
    const base = 4 + coCols + (showTotalColumn ? 1 : 0);
    return base + visibleBtlIndices.length * 2;
  }, [visibleBtlIndices.length, showTotalColumn, hideSecondCo, useQpQEntry, qpQuestions.length]);

  const totalTableCols = useMemo(() => {
    if (!isReview || !reviewSplitEnabled) return publishedTableCols;
    const raw = ((sheet as any)?.coSplitMax || {}) as { co1?: Array<number | ''>; co2?: Array<number | ''> };
    const co1Cols = Math.max(1, Array.isArray(raw.co1) ? Math.min(raw.co1.length, 15) : 0);
    const co2Cols = Math.max(1, Array.isArray(raw.co2) ? Math.min(raw.co2.length, 15) : 0);
    const fixed = showTotalColumn ? 5 : 4; // SNo, RegNo, Name, SSA(+optional Total)
    return fixed + (co1Cols + co2Cols) * 2 + visibleBtlIndices.length * 2;
  }, [isReview, publishedTableCols, reviewSplitEnabled, sheet, showTotalColumn, visibleBtlIndices.length]);

  const hasAbsentees = useMemo(() => {
    try {
      return sheet.rows.some((r) => Boolean((r as any).absent) || Object.values(r).some((v) => typeof v === 'string' && String(v).toLowerCase().includes('absent')));
    } catch {
      return false;
    }
  }, [sheet.rows]);

  const rowsToRender = useMemo(() => {
    let rows = [...sheet.rows];

    if (showAbsenteesOnly) {
      if (absenteesSnapshot && absenteesSnapshot.length) {
        rows = rows.filter((r) => absenteesSnapshot.includes(Number((r as any).studentId)));
      } else {
        rows = rows.filter((r) => Boolean((r as any).absent) || Object.values(r).some((v) => typeof v === 'string' && String(v).toLowerCase().includes('absent')));
      }
    }

    if (alphaOrderEnabled) {
      rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    } else if (digitFilterEnabled) {
      rows.sort((a, b) => {
        const aDigits = normalizeRegDigits(String(a.registerNo || ''));
        const bDigits = normalizeRegDigits(String(b.registerNo || ''));
        const aSuffix = aDigits.slice(-digitFilterLength);
        const bSuffix = bDigits.slice(-digitFilterLength);
        const aValue = aSuffix ? Number(aSuffix) : Number.MAX_SAFE_INTEGER;
        const bValue = bSuffix ? Number(bSuffix) : Number.MAX_SAFE_INTEGER;
        if (aValue !== bValue) return aValue - bValue;
        return compareStudentName({ reg_no: a.registerNo }, { reg_no: b.registerNo });
      });
    } else {
      rows.sort((a, b) => compareStudentName({ reg_no: a.registerNo }, { reg_no: b.registerNo }));
    }

    return rows;
  }, [sheet.rows, showAbsenteesOnly, absenteesSnapshot, alphaOrderEnabled, digitFilterEnabled, digitFilterLength]);

  const rowIndexByStudentId = useMemo(() => {
    const idxMap = new Map<number, number>();
    sheet.rows.forEach((row, idx) => {
      const studentId = Number((row as any)?.studentId);
      if (Number.isFinite(studentId) && studentId > 0 && !idxMap.has(studentId)) {
        idxMap.set(studentId, idx);
      }
    });
    return idxMap;
  }, [sheet.rows]);

  const rowIndexByRegisterNo = useMemo(() => {
    const idxMap = new Map<string, number | null>();
    sheet.rows.forEach((row, idx) => {
      const reg = normalizeRegisterNo((row as any)?.registerNo);
      if (!reg) return;
      if (!idxMap.has(reg)) {
        idxMap.set(reg, idx);
      } else {
        idxMap.set(reg, null);
      }
    });
    return idxMap;
  }, [sheet.rows]);

  const resolveBaseRowIndex = (row: Ssa1Row, displayIdx: number): number => {
    const studentId = Number((row as any)?.studentId);
    if (Number.isFinite(studentId) && studentId > 0) {
      const idHit = rowIndexByStudentId.get(studentId);
      if (typeof idHit === 'number') return idHit;
    }

    const reg = normalizeRegisterNo((row as any)?.registerNo);
    if (reg) {
      const regHit = rowIndexByRegisterNo.get(reg);
      if (typeof regHit === 'number') return regHit;
    }

    const sameRefIdx = sheet.rows.indexOf(row);
    if (sameRefIdx >= 0) return sameRefIdx;

    return displayIdx;
  };

  // Persist selected BTLs to localStorage and autosave to server (debounced)
  useEffect(() => {
    if (!subjectId) return;
    if (!draftLoadedRef.current) return;
    try {
      const taSuffix = teachingAssignmentId == null ? '' : `_ta_${teachingAssignmentId}`;
      const sk = `${assessmentKey}_selected_btls_${subjectId}${taSuffix}`;
      lsSet(sk, selectedBtls);
    } catch {}

    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const payload: Ssa1DraftPayload = { sheet, selectedBtls };
          await saveDraft(assessmentKey, subjectId, payload, teachingAssignmentId);
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
  }, [selectedBtls, subjectId, sheet, assessmentKey, key, teachingAssignmentId]);

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<Ssa1Sheet>(key);
    if (stored && typeof stored === 'object' && Array.isArray((stored as any).rows)) {
      setSheet({
        termLabel: masterCfg?.termLabel ? String(masterCfg.termLabel) : String((stored as any).termLabel || 'KRCT AY25-26'),
        batchLabel: subjectId,
        rows: (stored as any).rows,
        coSplitMax: (stored as any).coSplitMax ?? (isReview ? { co1: [], co2: [] } : undefined),
      });
    } else {
      setSheet({ termLabel: masterTermLabel || 'KRCT AY25-26', batchLabel: subjectId, rows: [], coSplitMax: isReview ? { co1: [], co2: [] } : undefined });
    }
  }, [key, subjectId, masterCfg, masterTermLabel]);

  // Load draft from DB (preferred) and merge into local state.
  useEffect(() => {
    let mounted = true;
    draftLoadedRef.current = false;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<Ssa1DraftPayload>(assessmentKey, subjectId, teachingAssignmentId);
        if (!mounted) return;
        const d = res?.draft;
        const draftSheet = (d as any)?.sheet;
        const draftBtls = (d as any)?.selectedBtls;
        if (draftSheet && typeof draftSheet === 'object' && Array.isArray((draftSheet as any).rows)) {
          const draftRows = (draftSheet as any).rows as any[];
          const clearWorkflowState = markLock?.exists === false;
          setSheet((prev) => ({
            ...prev,
            termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
            batchLabel: subjectId,
            // IMPORTANT: don't overwrite an already-loaded roster with an empty draft.
            rows: Array.isArray(draftRows) && draftRows.length ? (draftRows as any) : prev.rows,
            coSplitMax: (draftSheet as any)?.coSplitMax ?? prev.coSplitMax ?? (isReview ? { co1: [], co2: [] } : undefined),
            // mark manager metadata from server draft (if present)
            markManagerSnapshot: clearWorkflowState ? null : (draftSheet as any)?.markManagerSnapshot ?? prev.markManagerSnapshot ?? null,
            markManagerApprovalUntil: clearWorkflowState ? null : (draftSheet as any)?.markManagerApprovalUntil ?? prev.markManagerApprovalUntil ?? null,
            markManagerLocked: clearWorkflowState
              ? false
              : typeof (draftSheet as any)?.markManagerLocked === 'boolean'
                ? (draftSheet as any).markManagerLocked
                : Boolean((draftSheet as any)?.markManagerSnapshot ?? prev.markManagerSnapshot),
          }));

          // Ensure roster is merged AFTER draft load, so the name list is populated on first open.
          // This preserves any draft marks while filling in missing students.
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
                coSplitMax: (draftSheet as any)?.coSplitMax ?? (isReview ? { co1: [], co2: [] } : undefined),
              });
          } catch {
            // ignore localStorage errors
          }

          // Re-merge current roster after applying server draft so newly-appearing
          // students (e.g. fixed roster) are not dropped by an older draft snapshot.
          loadRoster().catch(() => {});
        }
        if (Array.isArray(draftBtls)) {
          setSelectedBtls(draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)));
          try {
            const taSuffix = teachingAssignmentId == null ? '' : `_ta_${teachingAssignmentId}`;
            const sk = `${assessmentKey}_selected_btls_${subjectId}${taSuffix}`;
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
  }, [subjectId, masterTermLabel, assessmentKey, key, isReview, markLock?.exists, teachingAssignmentId]);

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


  const mergeRosterIntoRows = (students: TeachingAssignmentRosterStudent[], publishedSnapshot?: PublishedSsa1Response | null) => {
    setSheet((prev) => {
      const existingById = new Map<number, Ssa1Row>();
      const existingByReg = new Map<string, Ssa1Row>();
      const publishedMarks = (publishedSnapshot as any)?.marks && typeof (publishedSnapshot as any).marks === 'object'
        ? (publishedSnapshot as any).marks
        : {};
      const publishedSplits = (publishedSnapshot as any)?.co_splits && typeof (publishedSnapshot as any).co_splits === 'object'
        ? (publishedSnapshot as any).co_splits
        : {};
      for (const r of prev.rows || []) {
        if (typeof (r as any).studentId === 'number') existingById.set((r as any).studentId, r as any);
        if (r.registerNo) existingByReg.set(String(r.registerNo), r);
      }

      const nextRows: Ssa1Row[] = (students || [])
        .slice()
        .sort(compareStudentName)
        .map((s) => {
          const prevRow = existingById.get(s.id) || existingByReg.get(String(s.reg_no || ''));
          const prevCo1 = readFiniteNumber((prevRow as any)?.co1);
          const prevCo2 = readFiniteNumber((prevRow as any)?.co2);
          const prevTotal = readFiniteNumber((prevRow as any)?.total);
          const hasLocalMarks = prevCo1 != null || prevCo2 != null || prevTotal != null;

          const sid = String(s.id);
          const publishedTotalRaw = (publishedMarks as any)?.[sid];
          const publishedTotal = readFiniteNumber(publishedTotalRaw);
          const split = (publishedSplits as any)?.[sid] && typeof (publishedSplits as any)?.[sid] === 'object'
            ? (publishedSplits as any)[sid]
            : null;
          let publishedCo1 = split ? readFiniteNumber((split as any).co1) : null;
          let publishedCo2 = split ? readFiniteNumber((split as any).co2) : null;

          if (publishedTotal != null) {
            if (publishedCo1 == null) publishedCo1 = Number(publishedTotal) / 2;
            if (publishedCo2 == null) publishedCo2 = Number(publishedTotal) / 2;
          }

          const resolvedCo1 = hasLocalMarks
            ? (typeof (prevRow as any)?.co1 === 'number'
                ? clamp(Number((prevRow as any).co1), 0, CO_MAX.co1)
                : '')
            : (publishedCo1 != null ? clamp(Number(publishedCo1), 0, CO_MAX.co1) : '');

          const resolvedCo2 = hasLocalMarks
            ? (typeof (prevRow as any)?.co2 === 'number'
                ? clamp(Number((prevRow as any).co2), 0, CO_MAX.co2)
                : '')
            : (publishedCo2 != null ? clamp(Number(publishedCo2), 0, CO_MAX.co2) : '');

          let resolvedReviewCoMarks = (prevRow as any)?.reviewCoMarks;
          if (isReview && !resolvedReviewCoMarks) {
            if (resolvedCo1 !== '' || resolvedCo2 !== '') {
              resolvedReviewCoMarks = {
                co1: resolvedCo1 !== '' ? [resolvedCo1] : [],
                co2: resolvedCo2 !== '' ? [resolvedCo2] : [],
              };
            }
          }

          return {
            studentId: s.id,
            section: String(s.section || ''),
            registerNo: String(s.reg_no || ''),
            name: String(s.name || ''),
            co1: resolvedCo1,
            co2: resolvedCo2,
            total:
              hasLocalMarks
                ? (typeof (prevRow as any)?.total === 'number'
                    ? clamp(Number((prevRow as any).total), 0, MAX_ASMT1)
                    : (prevRow as any)?.total === ''
                      ? ''
                      : '')
                : (publishedTotal != null ? clamp(Number(publishedTotal), 0, MAX_ASMT1) : ''),
            reviewCoMarks: resolvedReviewCoMarks,
            // Preserve per-question marks (used by SPECIAL/QP-pattern entry mode)
            ...(Array.isArray((prevRow as any)?.qMarks) ? { qMarks: (prevRow as any).qMarks } : {}),
            // Preserve absent flag
            ...(typeof (prevRow as any)?.absent !== 'undefined' ? { absent: (prevRow as any).absent } : {}),
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
          console.log('[SSA1] Direct TA roster returned:', roster.length, 'students');
        } catch (err) {
          console.warn('[SSA1] Direct TA roster fetch failed:', err);
        }
      }

      // Fallback: look up TA from user's own teaching assignments (faculty flow)
      let matchedTa: any = null;
      try {
        const myTAs = await fetchMyTeachingAssignments();
        console.log('[SSA1] My TAs:', myTAs?.length, 'for subject:', subjectId, 'teachingAssignmentId:', teachingAssignmentId);
        const desiredId = typeof teachingAssignmentId === 'number' ? teachingAssignmentId : null;
        const desiredCode = String(subjectId || '').trim().toUpperCase();

        // If a TA id is provided (IQAC viewer / pinned flows), prefer an exact id match.
        if (desiredId != null) {
          matchedTa = (myTAs || []).find((t: any) => Number(t?.id) === Number(desiredId)) || null;
        }

        // Otherwise (or if not found), fall back to subject-code match (faculty flow).
        if (!matchedTa) {
          matchedTa = (myTAs || []).find((t: any) => {
            const codeMatch = String(t?.subject_code || '').trim().toUpperCase() === desiredCode;
            return codeMatch;
          });
        }

        if (matchedTa) {
          console.log('[SSA1] Found TA match:', matchedTa.id, 'elective_subject_id:', matchedTa.elective_subject_id, 'section_id:', matchedTa.section_id);
        } else {
          console.log('[SSA1] No TA match found in user TAs');
        }
      } catch (err) {
        console.warn('[SSA1] My TAs fetch failed:', err);
      }

      // Always use TA roster (backend handles batch filtering for electives)
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

      let publishedSnapshot: PublishedSsa1Response | null = null;
      try {
        publishedSnapshot = await fetchPublished(String(subjectId));
      } catch {
        publishedSnapshot = null;
      }

      console.log('[SSA1] Final roster count:', roster.length);
      mergeRosterIntoRows(roster, publishedSnapshot);
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
        const res = await fetchDraft<Ssa1DraftPayload>(assessmentKey, String(subjectId), teachingAssignmentId);
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
              markManagerLocked: clearWorkflowState
                ? false
                : typeof (draftSheet as any)?.markManagerLocked === 'boolean'
                  ? (draftSheet as any).markManagerLocked
                  : Boolean((draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot),
            }));
            if (Array.isArray(draftBtls)) {
              setSelectedBtls(draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)));
            }
            draftLoadedRef.current = true;

            // Ensure roster merge runs after applying draft rows.
            loadRoster().catch(() => {});
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
  }, [entryOpen, isPublished, subjectId, assessmentKey, masterTermLabel, markLock?.exists]);

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
      const payload: Ssa1DraftPayload = { sheet: sheetRef.current, selectedBtls: btlRef.current };
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

    if (isReview) {
      const a = safeSplitArr((sheet as any)?.coSplitMax?.co1, CO_MAX.co1);
      const b = safeSplitArr((sheet as any)?.coSplitMax?.co2, CO_MAX.co2);
      const ok1 = sumSplit(a) <= CO_MAX.co1 + 1e-6;
      const ok2 = sumSplit(b) <= CO_MAX.co2 + 1e-6;
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
    if (!markManagerEditRequestsEnabled) {
      alert('Edit requests are disabled by IQAC.');
      return;
    }
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

      await saveDraft(assessmentKey, String(subjectId), payload, teachingAssignmentId);
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

  const resetAllMarks = async () => {
    if (!confirm(`Reset ${displayLabel} marks for all students in this section?`)) return;
    if (tableBlocked || resettingMarks) return;
    if (typeof teachingAssignmentId !== 'number') {
      alert('Please select a teaching assignment before resetting marks.');
      return;
    }

    setResettingMarks(true);
    try {
      await resetAssessmentMarks(assessmentKey, String(subjectId), teachingAssignmentId);

      try {
        clearLocalDraftCache(String(subjectId || ''), String(assessmentKey || ''), teachingAssignmentId ?? null);
      } catch {
        // ignore local cache clear errors
      }

      setSheet((prev) => ({
        ...prev,
        rows: (prev.rows || []).map((r) => ({ ...r, co1: '', co2: '', total: '' })),
        markManagerLocked: false,
        markManagerSnapshot: null,
        markManagerApprovalUntil: null,
      }));
      setSelectedBtls(defaultSelectedBtls);
      setPublishedAt(null);
      setPublishedViewSnapshot(null);
      setSaveError(null);

      refreshMarkLock({ silent: true });
      refreshPublishWindow();
      refreshPublishedSnapshot(false);
    } catch (e: any) {
      alert(e?.message || 'Failed to reset marks');
    } finally {
      setResettingMarks(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<Ssa1Row>) => {
    setSheet((prev) => {
      const copy = prev.rows.slice();
      const existing = copy[idx] || ({ studentId: 0, section: '', registerNo: '', name: '', co1: '', co2: '', total: '' } as Ssa1Row);
      const updated = { ...existing, ...patch };
      // Auto-compute total from co1 + co2
      if ('co1' in patch || 'co2' in patch) {
        const c1 = typeof updated.co1 === 'number' ? updated.co1 : 0;
        const c2 = typeof updated.co2 === 'number' ? updated.co2 : 0;
        updated.total = (updated.co1 === '' && updated.co2 === '') ? '' : round1(c1 + c2);
      }
      copy[idx] = updated;
      return { ...prev, rows: copy };
    });
  };

  // Updates a single question mark (for SPECIAL/QP-pattern entry) and re-derives co1/co2/total
  const updateQMark = (rowIdx: number, qIdx: number, value: string | number) => {
    setSheet((prev) => {
      const copy = prev.rows.slice();
      const existing = copy[rowIdx];
      if (!existing) return prev;
      const qm: Array<number | ''> = Array.isArray((existing as any).qMarks) ? [...(existing as any).qMarks] : [];
      while (qm.length <= qIdx) qm.push('');
      const parsed = typeof value === 'number' ? value : parseMarkInput(String(value));
      qm[qIdx] = parsed !== null && parsed !== undefined ? parsed : '';
      // Derive co1/co2 from all question marks
      let c1 = 0; let c2 = 0;
      qpQuestions.forEach((q, i) => {
        const v = typeof qm[i] === 'number' ? (qm[i] as number) : 0;
        if (q.coKey === 'co1') c1 += v;
        else c2 += v;
      });
      const hasAny = qm.some((v) => v !== '');
      const newCo1: number | '' = hasAny ? round1(clamp(c1, 0, CO_MAX.co1)) : '';
      const newCo2: number | '' = hasAny ? round1(clamp(c2, 0, CO_MAX.co2)) : '';
      const newTotal: number | '' = hasAny ? round1(clamp(c1 + c2, 0, MAX_ASMT1)) : '';
      copy[rowIdx] = { ...existing, qMarks: qm, co1: newCo1, co2: newCo2, total: newTotal } as Ssa1Row;
      return { ...prev, rows: copy };
    });
  };

  const exportSheetCsv = () => {
    const out = rowsToRender.map((r, i) => {
      const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT1) : null;
      const total = totalRaw == null ? '' : round1(totalRaw);

      const co1 = typeof r.co1 === 'number' ? clamp(r.co1, 0, CO_MAX.co1) : (totalRaw != null ? clamp(round1(totalRaw / 2), 0, CO_MAX.co1) : null);
      const co2 = typeof r.co2 === 'number' ? clamp(r.co2, 0, CO_MAX.co2) : (totalRaw != null ? clamp(round1(totalRaw / 2), 0, CO_MAX.co2) : null);

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
    if (!rowsToRender.length) return;

    const q1Max = Number.isFinite(Number(CO_MAX.co1)) ? Number(CO_MAX.co1) : 0;
    const q2Max = Number.isFinite(Number(CO_MAX.co2)) ? Number(CO_MAX.co2) : 0;

    const sumSplit = (arr: Array<number | ''> | undefined): number | null => {
      if (!Array.isArray(arr) || !arr.length) return null;
      const total = arr.reduce<number>((acc, v) => acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0);
      return total;
    };

    const co1ForExport = (row: Ssa1Row): number | '' => {
      if (!isReview) {
        return typeof row.co1 === 'number' ? round1(clamp(row.co1, 0, q1Max)) : '';
      }
      const split = sumSplit(row.reviewCoMarks?.co1);
      if (split != null) return round1(clamp(split, 0, q1Max));
      return typeof row.co1 === 'number' ? round1(clamp(row.co1, 0, q1Max)) : '';
    };

    const co2ForExport = (row: Ssa1Row): number | '' => {
      if (!isReview) {
        return typeof row.co2 === 'number' ? round1(clamp(row.co2, 0, q2Max)) : '';
      }
      const split = sumSplit(row.reviewCoMarks?.co2);
      if (split != null) return round1(clamp(split, 0, q2Max));
      return typeof row.co2 === 'number' ? round1(clamp(row.co2, 0, q2Max)) : '';
    };

    const header = ['Register No', 'Student Name', `Q1 (${q1Max.toFixed(2)})`, `Q2 (${q2Max.toFixed(2)})`, 'Status'];
    const data = rowsToRender.map((r) => [r.registerNo, r.name, co1ForExport(r), co2ForExport(r), 'present']);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, displayLabel || 'SSA1');

    const filename = `${subjectId}_${safeFilePart(displayLabel) || 'SSA1'}_template.xlsx`;
    (XLSX as any).writeFile(wb, filename);
  };

  const downloadTotals = async () => {
    const rows = rowsToRender.map((r, idx) => ({
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
              return ch.startsWith('q1') || ch.startsWith('co1') || ch.startsWith('q2') || ch.startsWith('co2') || ch.includes('total');
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

          // Count rows that appear to have a register value.
          let regCount = 0;
          for (let r = headerRowIndex + 1; r < rows.length; r++) {
            const line = rows[r] || [];
            // Scan the whole row for a plausible register value (length >= 6).
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

        // Fallback: first sheet if nothing matched.
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
        return ch.startsWith('q1') || ch.startsWith('co1');
      });
      const q2ColRel = findCol((h) => {
        const ch = compact(h);
        return ch.startsWith('q2') || ch.startsWith('co2');
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

      const q1Max = Number.isFinite(Number(CO_MAX.co1)) ? Number(CO_MAX.co1) : 0;
      const q2Max = Number.isFinite(Number(CO_MAX.co2)) ? Number(CO_MAX.co2) : 0;

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

          // Fallback for shortened register numbers in Excel (only if unique).
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
          overMaxWarnings: [] as Array<{ reg: string; name: string; col: string; value: number; max: number }>,
        };

        const nextRows = existingRows.slice();

        for (let r = headerRowIndex + 1; r < rows.length; r++) {
          const line = rows[r] || [];

          // Prefer the declared Register No column; fallback to scanning row.
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

          const excelName = nameCol >= 0 ? String(line[nameCol] ?? '').trim() : '';
          const statusRaw = statusCol >= 0 ? String(line[statusCol] ?? '') : '';
          const status = statusRaw.trim().toLowerCase();
          const isAbsent = status === 'absent' || status === 'ab' || status === 'a';

          const q1 = q1Col >= 0 ? readFiniteNumber(line[q1Col]) : null;
          const q2 = q2Col >= 0 ? readFiniteNumber(line[q2Col]) : null;
          const totalX = totalCol >= 0 ? readFiniteNumber(line[totalCol]) : null;

          const prevRow = nextRows[idx] || {};
          const patch: any = {};

          const toReviewSplits = (rawMark: number | null, coKey: 'co1' | 'co2') => {
            if (rawMark == null) return null;
            const coMax = coKey === 'co1' ? CO_MAX.co1 : CO_MAX.co2;
            const n0 = clamp(Math.trunc(rawMark), 0, coMax);
            const splitCfgRaw = reviewSplitEnabled ? (((sheet as any)?.coSplitMax || {}) as { co1?: Array<number | ''>; co2?: Array<number | ''> }) : {};
            const capsRaw = (coKey === 'co1' ? splitCfgRaw.co1 : splitCfgRaw.co2) || [];
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
              patch.reviewCoMarks = { co1: [0], co2: [0] };
              patch.total = 0;
            } else {
              patch.co1 = 0;
              patch.co2 = 0;
              patch.total = 0;
            }
          } else {
            if (isReview) {
              const prevReview = { ...((prevRow as any)?.reviewCoMarks || {}) } as { co1?: Array<number | ''>; co2?: Array<number | ''> };
              const nextCo1 = toReviewSplits(q1, 'co1') ?? prevReview.co1;
              const nextCo2 = toReviewSplits(q2, 'co2') ?? prevReview.co2;

              const sumArr = (arr: any) =>
                (Array.isArray(arr) ? arr : []).reduce<number>((acc, v) => acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0);

              patch.reviewCoMarks = {
                ...prevReview,
                ...(nextCo1 != null ? { co1: nextCo1 } : {}),
                ...(nextCo2 != null ? { co2: nextCo2 } : {}),
              };
              patch.total = round1(clamp(sumArr(nextCo1) + sumArr(nextCo2), 0, MAX_ASMT1));
            } else {
              if (q1 != null) {
                if (q1 > q1Max) {
                  stats.overMaxWarnings.push({ reg: normReg, name: excelName, col: 'CO1', value: q1, max: q1Max });
                } else {
                  patch.co1 = round1(clamp(q1, 0, q1Max));
                }
              }
              if (q2 != null) {
                if (q2 > q2Max) {
                  stats.overMaxWarnings.push({ reg: normReg, name: excelName, col: 'CO2', value: q2, max: q2Max });
                } else {
                  patch.co2 = round1(clamp(q2, 0, q2Max));
                }
              }

              if (totalX != null) {
                patch.total = round1(clamp(totalX, 0, MAX_ASMT1));
              } else if (patch.co1 != null && patch.co2 != null) {
                patch.total = round1(clamp((patch.co1 as number) + (patch.co2 as number), 0, MAX_ASMT1));
              }
            }
          }

          // Do not overwrite existing values with blanks.
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
          const b1 = (before as any)?.reviewCoMarks?.co1;
          const a1 = (after as any)?.reviewCoMarks?.co1;
          const b2 = (before as any)?.reviewCoMarks?.co2;
          const a2 = (after as any)?.reviewCoMarks?.co2;
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
          filledCells += countNewNums(b1, a1) + countNewNums(b2, a2);
        } else {
          if (!isNum(before.co1) && isNum(after.co1)) filledCells += 1;
          if (!isNum(before.co2) && isNum(after.co2)) filledCells += 1;
        }
      }

      setSheet((prev) => ({ ...prev, rows: nextRows }));

      if (importStats.unmatchedRows > 0) {
        console.warn('[SSA1] Excel rows not matched by register no:', {
          excelRegRows: importStats.excelRegRows,
          matchedRows: importStats.matchedRows,
          unmatchedRows: importStats.unmatchedRows,
          samples: importStats.unmatchedSamples,
        });
      }

      {
        let alertMsg = `Import complete. Matched: ${importStats.matchedRows} row(s). Unmatched: ${importStats.unmatchedRows} row(s). Filled: ${filledCells} cell(s).`;
        if (importStats.unmatchedRows > 0) alertMsg += '\n\nNote: Some register numbers could not be matched to the roster.';
        if (importStats.overMaxWarnings.length > 0) {
          alertMsg += `\n\n⚠️ MARKS EXCEEDING MAXIMUM (${importStats.overMaxWarnings.length} issue(s)) — cells left blank, please re-enter correct values:\n`;
          alertMsg += importStats.overMaxWarnings
            .slice(0, 30)
            .map((w) => `  • Roll No: ${w.reg}${w.name ? ` (${w.name})` : ''} — ${w.col}: entered ${w.value}, max allowed is ${w.max}`)
            .join('\n');
          if (importStats.overMaxWarnings.length > 30) alertMsg += `\n  … and ${importStats.overMaxWarnings.length - 30} more.`;
        }
        alert(alertMsg);
      }
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

  const coSplitMax = (sheet as any).coSplitMax as { co1?: Array<number | ''>; co2?: Array<number | ''> } | undefined;
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
  const sumSplit = (arr: Array<number | ''>) => arr.reduce<number>((a, b) => a + (typeof b === 'number' && Number.isFinite(b) ? b : 0), 0);
  const padTo = <T,>(arr: T[], len: number, fill: T) => (arr.length >= len ? arr.slice(0, len) : arr.concat(Array.from({ length: len - arr.length }, () => fill)));

  // Review-only CO split rows (shared row count across CO-1 and CO-2)
  // Split config is a header-level setting; keep it editable even if the
  // student mark table is blocked by Mark Manager gating.
  const splitEditDisabled = Boolean(globalLocked || publishedEditLocked);
  const co1Splits = isReview && reviewSplitEnabled ? safeSplitArr((coSplitMax as any)?.co1, CO_MAX.co1) : ([] as Array<number | ''>);
  const co2Splits = isReview && reviewSplitEnabled ? safeSplitArr((coSplitMax as any)?.co2, CO_MAX.co2) : ([] as Array<number | ''>);
  const co1SplitRowCount = isReview ? co1Splits.length : 0;
  const co2SplitRowCount = isReview ? co2Splits.length : 0;
  const reviewCo1ColumnCount = isReview ? Math.max(1, co1SplitRowCount) : 1;
  const reviewCo2ColumnCount = isReview ? Math.max(1, co2SplitRowCount) : 1;
  const reviewCoAttainmentCols = isReview ? (reviewCo1ColumnCount + reviewCo2ColumnCount) * 2 : 4;
  const co1TotalSplit = isReview ? sumSplit(co1Splits) : 0;
  const co2TotalSplit = isReview ? sumSplit(co2Splits) : 0;
  const reviewSplitsOk = !isReview || (co1TotalSplit <= CO_MAX.co1 + 1e-6 && co2TotalSplit <= CO_MAX.co2 + 1e-6);

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

  const addCoSplitRow = (coKey: 'co1' | 'co2') => {
    if (!isReview || splitEditDisabled) return;
    setSheet((prev) => {
      const raw = (prev as any).coSplitMax || {};
      const a0 = safeSplitArr(raw.co1, CO_MAX.co1);
      const b0 = safeSplitArr(raw.co2, CO_MAX.co2);
      const target = coKey === 'co1' ? a0 : b0;
      if (target.length >= 15) return prev;
      const nextA = coKey === 'co1' ? a0.concat(['']) : a0;
      const nextB = coKey === 'co2' ? b0.concat(['']) : b0;
      return { ...prev, coSplitMax: { ...(prev as any).coSplitMax, co1: nextA, co2: nextB } };
    });
  };

  const removeCoSplitRow = (coKey: 'co1' | 'co2') => {
    if (!isReview || splitEditDisabled) return;
    setSheet((prev) => {
      const raw = (prev as any).coSplitMax || {};
      const a0 = safeSplitArr(raw.co1, CO_MAX.co1);
      const b0 = safeSplitArr(raw.co2, CO_MAX.co2);
      const target = coKey === 'co1' ? a0 : b0;
      if (target.length <= 0) return prev;
      const nextA = coKey === 'co1' ? a0.slice(0, -1) : a0;
      const nextB = coKey === 'co2' ? b0.slice(0, -1) : b0;
      return { ...prev, coSplitMax: { ...(prev as any).coSplitMax, co1: nextA, co2: nextB } };
    });
  };

  const updateReviewCoMark = (rowIdx: number, coKey: 'co1' | 'co2', splitIdx: number, rawVal: string) => {
    if (!isReview || marksEditDisabled) return;
    setSheet((prev) => {
      const nextRows = prev.rows.slice();
      const existing = (nextRows[rowIdx] || { studentId: 0, section: '', registerNo: '', name: '', total: '' }) as Ssa1Row;
      const row: Ssa1Row = { ...existing };

      const review = { ...((row as any).reviewCoMarks || {}) } as { co1?: Array<number | ''>; co2?: Array<number | ''> };
      const count = coKey === 'co1' ? reviewCo1ColumnCount : reviewCo2ColumnCount;
      const coMax = coKey === 'co1' ? CO_MAX.co1 : CO_MAX.co2;
      const base = normalizeReviewMarks(review[coKey], count, coMax);
      const arr = padTo(base, count, '' as const).slice(0, count);
      const splitCfgRaw = ((prev as any)?.coSplitMax || {}) as { co1?: Array<number | ''>; co2?: Array<number | ''> };
      const splitCfg = coKey === 'co1' ? safeSplitArr(splitCfgRaw.co1, CO_MAX.co1) : safeSplitArr(splitCfgRaw.co2, CO_MAX.co2);

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

      const nextCo1 = normalizeReviewMarks(coKey === 'co1' ? arr : review.co1, reviewCo1ColumnCount, CO_MAX.co1);
      const nextCo2 = normalizeReviewMarks(coKey === 'co2' ? arr : review.co2, reviewCo2ColumnCount, CO_MAX.co2);

      row.reviewCoMarks = { co1: nextCo1, co2: nextCo2 };
      row.total = clamp(round1(sumSplit(nextCo1) + sumSplit(nextCo2)), 0, MAX_ASMT1);
      nextRows[rowIdx] = row;
      return { ...prev, rows: nextRows };
    });
  };

  const updateCoSplitAt = (coKey: 'co1' | 'co2', idx: number, rawVal: string) => {
    if (!isReview) return;
    setSheet((prev) => {
      const raw = (prev as any).coSplitMax || {};
      const a0 = safeSplitArr(raw.co1, CO_MAX.co1);
      const b0 = safeSplitArr(raw.co2, CO_MAX.co2);
      const target0 = coKey === 'co1' ? a0 : b0;
      const target = padTo(target0, Math.max(target0.length, idx + 1), '' as const);

      if (rawVal === '') {
        target[idx] = '';
        return {
          ...prev,
          coSplitMax: {
            ...(prev as any).coSplitMax,
            co1: coKey === 'co1' ? target : a0,
            co2: coKey === 'co2' ? target : b0,
          },
        };
      }

      const parsed = Number(rawVal);
      const n = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
      const otherSum = target.reduce<number>((acc, v, j) => {
        if (j === idx) return acc;
        return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      }, 0);
      const coMax = coKey === 'co1' ? CO_MAX.co1 : CO_MAX.co2;
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
          co1: coKey === 'co1' ? target : a0,
          co2: coKey === 'co2' ? target : b0,
        },
      };
    });
  };

  const renderCoSplitHeaderCell = (coKey: 'co1' | 'co2', coMax: number, total: number) => {
    if (!reviewSplitEnabled) {
      return <div style={{ fontWeight: 900, fontSize: 12 }}>{coMax}</div>;
    }

    const arr = coKey === 'co1' ? co1Splits : co2Splits;
    const rowCount = coKey === 'co1' ? reviewCo1ColumnCount : reviewCo2ColumnCount;
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
  const publishButtonOnClick = publishButtonIsRequestEdit ? openEditRequestModal : publish;
  const publishButtonDisabled = editRequestsBlocked ? true : publishButtonIsRequestEdit ? markEntryReqPending : Boolean(publishing || !publishAllowed || tableBlocked || !reviewSplitsOk);

  return (
    <>
      {/* Standardized assessment container */}
      <AssessmentContainer>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={loadRoster} className="obe-btn obe-btn-secondary" disabled={rosterLoading}>
              {rosterLoading ? 'Loading roster…' : 'Load/Refresh Roster'}
            </button>
            <button
              onClick={resetAllMarks}
              className="obe-btn obe-btn-danger"
              disabled={!sheet.rows.length || tableBlocked || resettingMarks}
              title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
            >
              {resettingMarks ? 'Resetting…' : 'Reset Marks'}
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
              onClick={publishButtonOnClick}
              className="obe-btn obe-btn-primary"
              disabled={publishButtonDisabled}
              title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
            >
              {publishButtonIsRequestEdit ? (markEntryReqPending ? 'Request Pending' : 'Request Edit') : publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              padding: '6px 10px',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              background: '#f8fafc',
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={alphaOrderEnabled} onChange={(e) => setAlphaOrderEnabled(e.target.checked)} style={{ accentColor: '#2563eb' }} />
              Alphabetical order
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={digitFilterEnabled} onChange={(e) => setDigitFilterEnabled(e.target.checked)} style={{ accentColor: '#2563eb' }} />
              Digits order
            </label>
            <select
              value={digitFilterLength}
              disabled={!digitFilterEnabled}
              onChange={(e) => {
                const len = Number(e.target.value);
                if (len >= 2 && len <= 8) setDigitFilterLength(len as 2 | 3 | 4 | 5 | 6 | 7 | 8);
              }}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 12, background: '#fff' }}
              title="Order by last N digits of register number"
            >
              <option value={2}>Last 2</option>
              <option value={3}>Last 3</option>
              <option value={4}>Last 4</option>
              <option value={5}>Last 5</option>
              <option value={6}>Last 6</option>
              <option value={7}>Last 7</option>
              <option value={8}>Last 8</option>
            </select>
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

                    <th style={cellTh} colSpan={hideSecondCo ? 2 : 4}>CO ATTAINMENT</th>
                    {visibleBtlIndices.length ? <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th> : null}
                  </tr>
                  <tr>
                    <th style={cellTh}>
                      <div style={{ fontWeight: 800 }}>COs</div>
                      <div style={{ fontSize: 12 }}>{hideSecondCo ? effectiveCoA : `${effectiveCoA},${effectiveCoB}`}</div>
                    </th>
                    {showTotalColumn ? <th style={cellTh} /> : null}

                    <th style={cellTh} colSpan={2}>CO-{effectiveCoA}</th>
                    {!hideSecondCo && <th style={cellTh} colSpan={2}>CO-{effectiveCoB}</th>}

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

                    {Array.from({ length: (hideSecondCo ? 1 : 2) + visibleBtlIndices.length }).flatMap((_, i) => (
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
                    {!hideSecondCo && <th style={cellTh}>{CO_MAX.co2}</th>}
                    {!hideSecondCo && <th style={cellTh}>%</th>}
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
                    rowsToRender.map((r, idx) => {
                      const raw = publishedViewSnapshot?.marks?.[String(r.studentId)] ?? null;
                      const numericTotal = raw == null || raw === '' ? null : clamp(Number(raw), 0, MAX_ASMT1);

                      const coSplitCount = hideSecondCo ? 1 : 2;
                      const coShare = numericTotal == null ? null : round1(numericTotal / coSplitCount);
                      const co1 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co1);
                      const co2 = hideSecondCo ? null : (coShare == null ? null : clamp(coShare, 0, CO_MAX.co2));

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
                          {!hideSecondCo && <td style={{ ...cellTd, textAlign: 'center' }}>{co2 ?? ''}</td>}
                          {!hideSecondCo && <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co2 as any, CO_MAX.co2)}</td>}
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
                  // to allow selecting BTLs and saving. If already confirmed, open request mode
                  // only when edit requests are enabled; otherwise allow direct confirm edit.
                  setMarkManagerModal({ mode: markManagerConfirmed && markManagerEditRequestsEnabled ? 'request' : 'confirm' });
                }}
                disabled={!subjectId || markManagerBusy}
              >
                {markManagerConfirmed ? 'Edit' : 'Save'}
              </button>
            </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          <div>Max {displayLabel}: <strong style={{ color: '#111' }}>{MAX_ASMT1}</strong></div>
          <div>CO-{effectiveCoA} max: <strong style={{ color: '#111' }}>{CO_MAX.co1}</strong>{!hideSecondCo && <> • CO-{effectiveCoB} max: <strong style={{ color: '#111' }}>{CO_MAX.co2}</strong></>}</div>
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

                    <th style={cellTh} colSpan={isReview ? reviewCoAttainmentCols : useQpQEntry ? (qpQuestions.length + (hideSecondCo ? 1 : 2)) : (hideSecondCo ? 2 : 4)}>CO ATTAINMENT</th>
                    {visibleBtlIndices.length ? (
                      <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th>
                    ) : null}
                  </tr>
                  <tr>
                    <th style={cellTh}>
                      <div style={{ fontWeight: 800 }}>COs</div>
                      <div style={{ fontSize: 12 }}>{hideSecondCo ? String(effectiveCoA) : `${effectiveCoA},${effectiveCoB}`}</div>
                    </th>
                    {showTotalColumn ? <th style={cellTh} /> : null}

                    {useQpQEntry ? (
                      <>
                        {qpQuestions.map((q, i) => (
                          <th key={`qh-${i}`} style={cellTh}>Q-{i + 1}</th>
                        ))}
                        <th style={cellTh}>CO-{effectiveCoA}</th>
                        {!hideSecondCo && <th style={cellTh}>CO-{effectiveCoB}</th>}
                      </>
                    ) : (
                      <>
                        <th style={cellTh} colSpan={isReview ? reviewCo1ColumnCount * 2 : 2}>
                          {isReview ? renderCoSplitHeaderCell('co1', CO_MAX.co1, co1TotalSplit) : `CO-${effectiveCoA}`}
                        </th>
                        {!hideSecondCo && (
                          <th style={cellTh} colSpan={isReview ? reviewCo2ColumnCount * 2 : 2}>
                            {isReview ? renderCoSplitHeaderCell('co2', CO_MAX.co2, co2TotalSplit) : `CO-${effectiveCoB}`}
                          </th>
                        )}
                      </>
                    )}

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

                    {useQpQEntry ? (
                      <>
                        {qpQuestions.map((_, i) => <th key={`q3m-${i}`} style={cellTh}>Mark</th>)}
                        {Array.from({ length: hideSecondCo ? 1 : 2 }).map((_, i) => <th key={`q3p-${i}`} style={cellTh}>%</th>)}
                        {visibleBtlIndices.flatMap((n) => [
                          <th key={`q3btlm-${n}`} style={cellTh}>Mark</th>,
                          <th key={`q3btlp-${n}`} style={cellTh}>%</th>,
                        ])}
                      </>
                    ) : (
                      Array.from({ length: (isReview ? reviewCo1ColumnCount + reviewCo2ColumnCount : (hideSecondCo ? 1 : 2)) + visibleBtlIndices.length }).flatMap((_, i) => (
                        <React.Fragment key={i}>
                          <th style={cellTh}>Mark</th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      ))
                    )}
                  </tr>
                  <tr>
                    <th style={cellTh}>Name / Max Marks</th>
                    <th style={cellTh}>{MAX_ASMT1}</th>
                    {showTotalColumn ? <th style={cellTh}>{MAX_ASMT1}</th> : null}
                    {useQpQEntry ? (
                      <>
                        {qpQuestions.map((q, i) => <th key={`q4m-${i}`} style={cellTh}>{q.max}</th>)}
                        <th style={cellTh}>%</th>
                        {!hideSecondCo && <th style={cellTh}>%</th>}
                      </>
                    ) : (<>
                    {isReview && reviewSplitEnabled
                      ? Array.from({ length: reviewCo1ColumnCount }).flatMap((_, i) => {
                          const v = i < co1Splits.length ? co1Splits[i] : CO_MAX.co1;
                          return [
                            <th key={`co1-max-${i}`} style={cellTh}>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={CO_MAX.co1}
                                step={1}
                                disabled={splitEditDisabled}
                                value={v === '' ? '' : String(v)}
                                onChange={(e) => updateCoSplitAt('co1', i, e.target.value)}
                                style={splitInputStyle}
                              />
                            </th>,
                            <th key={`co1-pct-${i}`} style={cellTh}>%</th>,
                          ];
                        })
                      : [
                          <th key="co1-max" style={cellTh}>{CO_MAX.co1}</th>,
                          <th key="co1-pct" style={cellTh}>%</th>,
                        ]}
                    {!hideSecondCo && (isReview && reviewSplitEnabled
                      ? Array.from({ length: reviewCo2ColumnCount }).flatMap((_, i) => {
                          const v = i < co2Splits.length ? co2Splits[i] : CO_MAX.co2;
                          return [
                            <th key={`co2-max-${i}`} style={cellTh}>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={CO_MAX.co2}
                                step={1}
                                disabled={splitEditDisabled}
                                value={v === '' ? '' : String(v)}
                                onChange={(e) => updateCoSplitAt('co2', i, e.target.value)}
                                style={splitInputStyle}
                              />
                            </th>,
                            <th key={`co2-pct-${i}`} style={cellTh}>%</th>,
                          ];
                        })
                      : [
                          <th key="co2-max" style={cellTh}>{CO_MAX.co2}</th>,
                          <th key="co2-pct" style={cellTh}>%</th>,
                        ])}
                    </>)}
                    {visibleBtlIndices.flatMap((n) => [
                      <th key={`btl-max-${n}`} style={cellTh}>
                        {isReview ? String(BTL_MAX_WHEN_VISIBLE) : String(displayBtlMax((BTL_MAX as any)[`btl${n}`]))}
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
                    rowsToRender.map((r, idx) => {
                      const baseRowIdx = resolveBaseRowIndex(r, idx);
                      const reviewCo1MaxByCol = isReview
                        ? Array.from({ length: reviewCo1ColumnCount }).map((_, splitIdx) => {
                            const v = splitIdx < co1Splits.length ? co1Splits[splitIdx] : CO_MAX.co1;
                            return typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, CO_MAX.co1) : CO_MAX.co1;
                          })
                        : [];
                      const reviewCo2MaxByCol = isReview
                        ? Array.from({ length: reviewCo2ColumnCount }).map((_, splitIdx) => {
                            const v = splitIdx < co2Splits.length ? co2Splits[splitIdx] : CO_MAX.co2;
                            return typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, CO_MAX.co2) : CO_MAX.co2;
                          })
                        : [];

                      const reviewCo1Marks = isReview ? normalizeReviewMarks((r as any)?.reviewCoMarks?.co1, reviewCo1ColumnCount, CO_MAX.co1) : [];
                      const reviewCo2Marks = isReview ? normalizeReviewMarks((r as any)?.reviewCoMarks?.co2, reviewCo2ColumnCount, CO_MAX.co2) : [];
                      const reviewCo1Total = isReview ? sumSplit(reviewCo1Marks) : 0;
                      const reviewCo2Total = isReview ? sumSplit(reviewCo2Marks) : 0;
                      const reviewTotal = isReview ? clamp(round1(reviewCo1Total + reviewCo2Total), 0, MAX_ASMT1) : null;

                      // CO1/CO2 values must come from the row fields so inputs can be cleared.
                      // (Falling back to total/2 breaks backspace + makes the fields feel "locked".)
                      const co1 = isReview ? null : typeof r.co1 === 'number' ? clamp(r.co1, 0, CO_MAX.co1) : null;
                      const co2 = isReview ? null : hideSecondCo ? null : typeof r.co2 === 'number' ? clamp(r.co2, 0, CO_MAX.co2) : null;

                      // Total: for SSA1, show sum of CO-1 and CO-2 (out of 20).
                      // If both COs are empty, fall back to stored total (for legacy drafts).
                      const derivedTotal = !isReview && (co1 != null || co2 != null)
                        ? clamp(round1((co1 ?? 0) + (co2 ?? 0)), 0, MAX_ASMT1)
                        : null;
                      const totalRaw = isReview
                        ? reviewTotal
                        : (derivedTotal != null
                          ? derivedTotal
                          : typeof r.total === 'number'
                            ? clamp(Number(r.total), 0, MAX_ASMT1)
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
                            ? reviewCo1Marks.flatMap((mark, splitIdx) => [
                                <td key={`co1-mark-${idx}-${splitIdx}`} style={{ ...cellTd, textAlign: 'center', minWidth: 86 }}>
                                  {marksEditDisabled ? (
                                    mark === '' ? '' : mark
                                  ) : (
                                    <input
                                      style={inputStyle}
                                      type="number"
                                      min={0}
                                      max={CO_MAX.co1}
                                      step={1}
                                      value={mark}
                                      onChange={(e) => updateReviewCoMark(baseRowIdx, 'co1', splitIdx, e.target.value)}
                                    />
                                  )}
                                </td>,
                                <td key={`co1-pct-${idx}-${splitIdx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(mark === '' ? null : Number(mark), reviewCo1MaxByCol[splitIdx] || CO_MAX.co1)}</td>,
                              ])
                            : useQpQEntry
                              ? (qpQuestions.map((q, i) => {
                                  const qMarkVal = Array.isArray((r as any).qMarks) ? (r as any).qMarks[i] : undefined;
                                  return (
                                    <td key={`qi-${idx}-${i}`} style={{ ...cellTd, textAlign: 'center', minWidth: 72 }}>
                                      {marksEditDisabled ? (
                                        <span>{typeof qMarkVal === 'number' ? qMarkVal : ''}</span>
                                      ) : (
                                        <input
                                          style={{ ...inputStyle, borderColor: typeof qMarkVal === 'number' && qMarkVal > q.max ? '#ef4444' : undefined }}
                                          type="text"
                                          inputMode="decimal"
                                          value={typeof qMarkVal === 'number' ? String(qMarkVal) : ''}
                                          onChange={(e) => {
                                            if (marksEditDisabled) return;
                                            const raw = e.target.value;
                                            const parsed = parseMarkInput(raw);
                                            if (parsed == null) { e.currentTarget.setCustomValidity(''); updateQMark(baseRowIdx, i, ''); return; }
                                            if (parsed > q.max) {
                                              e.currentTarget.setCustomValidity(`Max is ${q.max}`);
                                              e.currentTarget.reportValidity();
                                              window.setTimeout(() => e.currentTarget.setCustomValidity(''), 0);
                                              return;
                                            }
                                            e.currentTarget.setCustomValidity('');
                                            updateQMark(baseRowIdx, i, raw);
                                          }}
                                          onBlur={(e) => {
                                            const parsed = parseMarkInput(e.target.value);
                                            if (parsed == null) return;
                                            updateQMark(baseRowIdx, i, String(round1(clamp(parsed, 0, q.max))));
                                          }}
                                        />
                                      )}
                                    </td>
                                  );
                                }).concat([
                                  <td key={`coa-pct-${idx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(co1, CO_MAX.co1)}</td>,
                                  ...(!hideSecondCo ? [<td key={`cob-pct-${idx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(co2, CO_MAX.co2)}</td>] : []),
                                ]))
                              : [
                                  <td key={`co1-single-${idx}`} style={{ ...cellTd, textAlign: 'center', minWidth: 86 }}>
                                    {marksEditDisabled ? (
                                      <span>{co1 ?? ''}</span>
                                    ) : (
                                      <input
                                        style={{ ...inputStyle, borderColor: typeof r.co1 === 'number' && r.co1 > CO_MAX.co1 ? '#ef4444' : undefined }}
                                        type="text"
                                        inputMode="decimal"
                                        value={typeof r.co1 === 'number' ? String(r.co1) : ''}
                                        onChange={(e) => {
                                          if (marksEditDisabled) return;
                                          const raw = e.target.value;
                                          const parsed = parseMarkInput(raw);
                                          if (parsed == null) { e.currentTarget.setCustomValidity(''); return updateRow(baseRowIdx, { co1: '' }); }
                                          if (parsed > CO_MAX.co1) {
                                            e.currentTarget.setCustomValidity(`Max mark is ${CO_MAX.co1}`);
                                            e.currentTarget.reportValidity();
                                            window.setTimeout(() => e.currentTarget.setCustomValidity(''), 0);
                                            return;
                                          }
                                          e.currentTarget.setCustomValidity('');
                                          updateRow(baseRowIdx, { co1: parsed });
                                        }}
                                        onBlur={(e) => {
                                          const parsed = parseMarkInput(e.target.value);
                                          if (parsed == null) return;
                                          if (parsed > CO_MAX.co1) { updateRow(baseRowIdx, { co1: '' }); return; }
                                          updateRow(baseRowIdx, { co1: round1(clamp(parsed, 0, CO_MAX.co1)) });
                                        }}
                                      />
                                    )}
                                  </td>,
                                  <td key={`co1-single-pct-${idx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(co1, CO_MAX.co1)}</td>,
                                ]}
                          {isReview
                            ? reviewCo2Marks.flatMap((mark, splitIdx) => [
                                <td key={`co2-mark-${idx}-${splitIdx}`} style={{ ...cellTd, textAlign: 'center', minWidth: 86 }}>
                                  {marksEditDisabled ? (
                                    mark === '' ? '' : mark
                                  ) : (
                                    <input
                                      style={inputStyle}
                                      type="number"
                                      min={0}
                                      max={CO_MAX.co2}
                                      step={1}
                                      value={mark}
                                      onChange={(e) => updateReviewCoMark(baseRowIdx, 'co2', splitIdx, e.target.value)}
                                    />
                                  )}
                                </td>,
                                <td key={`co2-pct-${idx}-${splitIdx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(mark === '' ? null : Number(mark), reviewCo2MaxByCol[splitIdx] || CO_MAX.co2)}</td>,
                              ])
                            : (!hideSecondCo && !useQpQEntry) ? [
                                <td key={`co2-single-${idx}`} style={{ ...cellTd, textAlign: 'center', minWidth: 86 }}>
                                  {marksEditDisabled ? (
                                    <span>{co2 ?? ''}</span>
                                  ) : (
                                    <input
                                      style={{ ...inputStyle, borderColor: typeof r.co2 === 'number' && r.co2 > CO_MAX.co2 ? '#ef4444' : undefined }}
                                      type="text"
                                      inputMode="decimal"
                                      value={typeof r.co2 === 'number' ? String(r.co2) : ''}
                                      onChange={(e) => {
                                        if (marksEditDisabled) return;
                                        const raw = e.target.value;
                                        const parsed = parseMarkInput(raw);
                                        if (parsed == null) { e.currentTarget.setCustomValidity(''); return updateRow(baseRowIdx, { co2: '' }); }
                                        if (parsed > CO_MAX.co2) {
                                          e.currentTarget.setCustomValidity(`Max mark is ${CO_MAX.co2}`);
                                          e.currentTarget.reportValidity();
                                          window.setTimeout(() => e.currentTarget.setCustomValidity(''), 0);
                                          return;
                                        }
                                        e.currentTarget.setCustomValidity('');
                                        updateRow(baseRowIdx, { co2: parsed });
                                      }}
                                      onBlur={(e) => {
                                        const parsed = parseMarkInput(e.target.value);
                                        if (parsed == null) return;
                                        if (parsed > CO_MAX.co2) { updateRow(baseRowIdx, { co2: '' }); return; }
                                        updateRow(baseRowIdx, { co2: round1(clamp(parsed, 0, CO_MAX.co2)) });
                                      }}
                                    />
                                  )}
                                </td>,
                                <td key={`co2-single-pct-${idx}`} style={{ ...cellTd, textAlign: 'center' }}>{pct(co2, CO_MAX.co2)}</td>,
                              ] : null}

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
              <div style={{ color: '#6b7280', marginTop: 6 }}>{publishedEditLocked ? (editRequestsEnabled ? 'Marks published. Use View to inspect or Request Edit to ask IQAC for edit access.' : 'Marks published. Edit requests are disabled by IQAC.') : 'Confirm the Mark Manager to unlock the student list.'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {publishedEditLocked ? (
                  <>
                    <button className="obe-btn" onClick={() => setViewMarksModalOpen(true)}>View</button>
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
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-{effectiveCoA} max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{CO_MAX.co1}</td>
                      </tr>
                      {!hideSecondCo && (
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-{effectiveCoB} max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{CO_MAX.co2}</td>
                      </tr>
                      )}
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
