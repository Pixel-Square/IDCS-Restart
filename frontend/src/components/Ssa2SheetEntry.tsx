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
import AssessmentContainer from './AssessmentContainer';
import { ModalPortal } from './ModalPortal';
import { downloadTotalsWithPrompt } from '../utils/assessmentTotalsDownload';

type Props = { subjectId: string; teachingAssignmentId?: number; label?: string; assessmentKey?: 'ssa2' | 'review2' };

type Ssa2Row = {
  studentId: number;
  section: string;
  registerNo: string;
  name: string;
  total: number | '';
};

type Ssa2Sheet = {
  termLabel: string;
  batchLabel: string;
  rows: Ssa2Row[];
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

function storageKey(subjectId: string, assessmentKey: 'ssa2' | 'review2') {
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

export default function Ssa2SheetEntry({ subjectId, teachingAssignmentId, label, assessmentKey = 'ssa2' }: Props) {
  const displayLabel = String(label || 'SSA2');
  const isReview = assessmentKey === 'review2';
  const showTotalColumn = false;
  const key = useMemo(() => storageKey(subjectId, assessmentKey), [subjectId, assessmentKey]);
  const fetchPublished = assessmentKey === 'review2' ? fetchPublishedReview2 : fetchPublishedSsa2;
  const publishNow = assessmentKey === 'review2' ? publishReview2 : publishSsa2;
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [taMeta, setTaMeta] = useState<{ courseName?: string; courseCode?: string; className?: string } | null>(null);
  const [sheet, setSheet] = useState<Ssa2Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    rows: [],
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

  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

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

  const [selectedBtls, setSelectedBtls] = useState<number[]>(() => (isReview ? [3, 4] : []));

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

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

  const markManagerSaveActive = Boolean(subjectId && !markManagerBusy);

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

  const isPublished = Boolean(publishedAt) || Boolean(markLock?.exists && markLock?.is_published) || Boolean(publishedViewSnapshot);
  const displayPublishedLocked = !markManagerSaveActive && isPublished;
  const markManagerLocked = Boolean(sheet.markManagerLocked);

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

  // If we cannot verify lock/publish state (network/API error), default to read-only.
  const lockStatusUnknown = Boolean(subjectId) && (markLockLoading || Boolean(markLockError) || markLock == null);

  // Authoritative locking: if the server reports entry_open=false, do not allow editing
  // even if local UI state thinks Mark Manager is confirmed.
  const tableBlocked = Boolean(
    globalLocked ||
      lockStatusUnknown ||
      (markLock ? !Boolean(markLock.entry_open) : isPublished ? !entryOpen : !markManagerLocked),
  );

  const showNameList = Boolean(sheet.markManagerSnapshot != null);
  const marksEditDisabled = Boolean(globalLocked || publishedEditLocked || tableBlocked);

  // Show the published lock panel only after Mark Manager is confirmed/locked,
  // so it never overlaps with the Mark Manager 'Table Locked' UI.
  const showPublishedLockPanel = Boolean(isPublished && publishedEditLocked && markManagerLocked);

  const visibleBtlIndices = useMemo(() => {
    const set = new Set(selectedBtls);
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [selectedBtls]);

  const totalTableCols = useMemo(() => {
    // Layout matching the Excel header template, but BTL columns are dynamic.
    // S.No, RegNo, Name, SSA2 = 4 (and optional Total = +1)
    // CO Attainment (CO-3 Mark/% + CO-4 Mark/%) = 4
    // BTL Attainment = selected count * 2 (Mark/% per BTL)
    const base = showTotalColumn ? 9 : 8;
    return base + visibleBtlIndices.length * 2;
  }, [showTotalColumn, visibleBtlIndices.length]);

  useEffect(() => {
    if (!subjectId) return;
    try {
      const sk = `${assessmentKey}_selected_btls_${subjectId}`;
      lsSet(sk, selectedBtls);
    } catch {}

    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const payload: Ssa2DraftPayload = { sheet, selectedBtls };
        await saveDraft(assessmentKey, subjectId, payload);
        try {
          if (key) lsSet(key, { termLabel: sheet.termLabel, batchLabel: sheet.batchLabel, rows: sheet.rows });
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
  }, [selectedBtls, subjectId, sheet, key, assessmentKey]);

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<Ssa2Sheet>(key);
    if (stored && typeof stored === 'object' && Array.isArray((stored as any).rows)) {
      setSheet({
        termLabel: masterCfg?.termLabel ? String(masterCfg.termLabel) : String((stored as any).termLabel || 'KRCT AY25-26'),
        batchLabel: subjectId,
        rows: (stored as any).rows,
        markManagerSnapshot: (stored as any)?.markManagerSnapshot ?? null,
        markManagerApprovalUntil: (stored as any)?.markManagerApprovalUntil ?? null,
        markManagerLocked: typeof (stored as any)?.markManagerLocked === 'boolean' ? (stored as any).markManagerLocked : Boolean((stored as any)?.markManagerSnapshot),
      });
    } else {
      setSheet({
        termLabel: masterTermLabel || 'KRCT AY25-26',
        batchLabel: subjectId,
        rows: [],
        markManagerLocked: false,
        markManagerSnapshot: null,
        markManagerApprovalUntil: null,
      });
    }
  }, [key, subjectId, masterCfg, masterTermLabel]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<Ssa2DraftPayload>(assessmentKey, subjectId);
        if (!mounted) return;
        const d = res?.draft;
        const draftSheet = (d as any)?.sheet;
        const draftBtls = (d as any)?.selectedBtls;
        if (draftSheet && typeof draftSheet === 'object' && Array.isArray((draftSheet as any).rows)) {
          setSheet((prevSheet) => ({
            ...prevSheet,
            termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
            batchLabel: subjectId,
            rows: (draftSheet as any).rows,
            markManagerSnapshot: (draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot ?? null,
            markManagerApprovalUntil: (draftSheet as any)?.markManagerApprovalUntil ?? prevSheet.markManagerApprovalUntil ?? null,
            markManagerLocked:
              typeof (draftSheet as any)?.markManagerLocked === 'boolean'
                ? (draftSheet as any).markManagerLocked
                : Boolean((draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot),
          }));

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
              });
          } catch {
            // ignore
          }
        }
        if (Array.isArray(draftBtls)) {
          const next = draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n));
          setSelectedBtls(next);
          try {
            const sk = `${assessmentKey}_selected_btls_${subjectId}`;
            lsSet(sk, next);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId, masterTermLabel, key, assessmentKey]);

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
            total:
              typeof (prevRow as any)?.total === 'number'
                ? clamp(Number((prevRow as any).total), 0, MAX_ASMT2)
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
        console.log('[SSA2] My TAs:', myTAs?.length, 'for subject:', subjectId, 'teachingAssignmentId:', teachingAssignmentId);
        matchedTa = (myTAs || []).find((t: any) => {
          const codeMatch = String(t.subject_code || '').trim().toUpperCase() === String(subjectId || '').trim().toUpperCase();
          const idMatch = teachingAssignmentId ? t.id === teachingAssignmentId : false;
          return idMatch || codeMatch;
        });
        
        if (matchedTa) {
          console.log('[SSA2] Found TA match:', matchedTa.id, 'elective_subject_id:', matchedTa.elective_subject_id, 'section_id:', matchedTa.section_id);
        } else {
          console.log('[SSA2] No TA match found in user TAs');
        }
      } catch (err) {
        console.warn('[SSA2] My TAs fetch failed:', err);
      }

      // If we found a TA and it's an elective (has elective_subject_id, no section_id), fetch from elective-choices
      if (matchedTa && matchedTa.elective_subject_id && !matchedTa.section_id) {
        console.log('[SSA2] Detected elective, fetching elective-choices for elective_subject_id:', matchedTa.elective_subject_id);
        try {
          const esRes = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${encodeURIComponent(String(matchedTa.elective_subject_id))}`);
          if (esRes.ok) {
            const esData = await esRes.json();
            const items = Array.isArray(esData.results) ? esData.results : Array.isArray(esData) ? esData : (esData.items || []);
            console.log('[SSA2] Elective choices returned:', items?.length, 'students');
            roster = (items || []).map((s: any) => ({ 
              id: Number(s.student_id ?? s.id), 
              reg_no: String(s.reg_no ?? s.regno ?? ''),
              name: String(s.name ?? s.full_name ?? s.username ?? ''),
              section: s.section_name ?? s.section ?? null 
            }));
          } else {
            console.warn('[SSA2] Elective-choices API returned error:', esRes.status);
          }
        } catch (err) {
          console.warn('[SSA2] Elective-choices fetch failed:', err);
        }
      }

      // If not elective or elective fetch failed, use regular TA roster
      if (!roster.length && matchedTa && matchedTa.id) {
        console.log('[SSA2] Fetching regular TA roster for TA ID:', matchedTa.id);
        try {
          const taResp = await fetchTeachingAssignmentRoster(matchedTa.id);
          roster = taResp.students || [];
          setTaMeta({
            courseName: String((taResp as any)?.teaching_assignment?.subject_name || matchedTa?.subject_name || ''),
            courseCode: String((taResp as any)?.teaching_assignment?.subject_code || matchedTa?.subject_code || subjectId || ''),
            className: String((taResp as any)?.teaching_assignment?.section_name || matchedTa?.section_name || ''),
          });
          console.log('[SSA2] Regular roster returned:', roster.length, 'students');
        } catch (err) {
          console.warn('[SSA2] TA roster fetch failed:', err);
        }
      }

      console.log('[SSA2] Final roster count:', roster.length);
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

  const prevEntryOpenRef = useRef<boolean>(Boolean(entryOpen));
  useEffect(() => {
    // Reset the edge-trigger detector when switching SSA2 <-> Review2.
    prevEntryOpenRef.current = Boolean(entryOpen);
  }, [subjectId, assessmentKey, teachingAssignmentId, entryOpen]);
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

    const prev = prevEntryOpenRef.current;
    if (prev || !entryOpen) {
      prevEntryOpenRef.current = Boolean(entryOpen);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const res = await fetchDraft<Ssa2DraftPayload>(assessmentKey, String(subjectId));
        if (!mounted) return;
        const d = res?.draft;
        const draftSheet = (d as any)?.sheet;
        const draftBtls = (d as any)?.selectedBtls;
        if (draftSheet && typeof draftSheet === 'object' && Array.isArray((draftSheet as any).rows)) {
          setSheet((prevSheet) => ({
            ...prevSheet,
            termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
            batchLabel: subjectId,
            rows: (draftSheet as any).rows,
            markManagerSnapshot: (draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot ?? null,
            markManagerApprovalUntil: (draftSheet as any)?.markManagerApprovalUntil ?? prevSheet.markManagerApprovalUntil ?? null,
            markManagerLocked:
              typeof (draftSheet as any)?.markManagerLocked === 'boolean'
                ? (draftSheet as any).markManagerLocked
                : Boolean((draftSheet as any)?.markManagerSnapshot ?? prevSheet.markManagerSnapshot),
          }));
        }
        if (Array.isArray(draftBtls)) {
          setSelectedBtls(draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)));
        }
        return;
      } catch {
        // ignore
      }

      if (!mounted) return;
      refreshPublishedSnapshot(false);
    })();

    prevEntryOpenRef.current = Boolean(entryOpen);
    return () => {
      mounted = false;
    };
  }, [entryOpen, isPublished, subjectId, assessmentKey, masterTermLabel]);

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
      const payload: Ssa2DraftPayload = { sheet: sheetRef.current, selectedBtls: btlRef.current };
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

  const resetAllMarks = () => {
    if (!confirm(`Reset ${displayLabel} marks for all students in this section?`)) return;
    if (tableBlocked) return;
    setSheet((prev) => ({
      ...prev,
      rows: (prev.rows || []).map((r) => ({ ...r, total: '' })),
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

      await saveDraft(assessmentKey, String(subjectId), payload);
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
      const existing = copy[idx] || ({ studentId: 0, section: '', registerNo: '', name: '', total: '' } as Ssa2Row);
      copy[idx] = { ...existing, ...patch };
      return { ...prev, rows: copy };
    });
  };

  const exportSheetCsv = () => {
    const out = sheet.rows.map((r, i) => {
      const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT2) : null;
      const total = totalRaw == null ? '' : round1(totalRaw);

      const coSplitCount = 2;
      const coShare = totalRaw == null ? null : round1(totalRaw / coSplitCount);
      const co3 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co3);
      const co4 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co4);

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

      const q1Max = Number.isFinite(Number(CO_MAX.co3)) ? Number(CO_MAX.co3) : 0;
      const q2Max = Number.isFinite(Number(CO_MAX.co4)) ? Number(CO_MAX.co4) : 0;

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
          const finalTotal = isAbsent ? 0 : clamp(computedTotal, 0, MAX_ASMT2);

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
          <button onClick={resetAllMarks} className="obe-btn obe-btn-danger" disabled={!sheet.rows.length}>
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
            onClick={publish}
            className="obe-btn obe-btn-primary"
            disabled={publishButtonIsRequestEdit ? markEntryReqPending : publishing || !publishAllowed || tableBlocked}
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
                const confirmed = sheet.markManagerSnapshot != null;
                setMarkManagerModal({ mode: confirmed ? 'request' : 'confirm' });
              }}
              disabled={!subjectId || markManagerBusy}
            >
              {sheet.markManagerSnapshot ? 'Edit' : 'Save'}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          <div>
            Max {displayLabel}: <strong style={{ color: '#111' }}>{MAX_ASMT2}</strong>
          </div>
          <div>
            CO-3 max: <strong style={{ color: '#111' }}>{CO_MAX.co3}</strong> • CO-4 max: <strong style={{ color: '#111' }}>{CO_MAX.co4}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>Selected BTLs:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6].map((n) => {
                const active = selectedBtls.includes(n);
                const disabled = Boolean(markManagerLocked && sheet.markManagerSnapshot != null);
                return (
                  <div
                    key={`card_btl_${n}`}
                    onClick={() => {
                      if (globalLocked) return;
                      if (markManagerBusy) return;
                      const markManagerConfirmed = sheet.markManagerSnapshot != null;
                      if (markManagerLocked && markManagerConfirmed) return;
                      setSelectedBtls((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : prev.concat(n).sort((a, b) => a - b)));
                    }}
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
          <div style={{ position: 'relative' }}>
          <div className="obe-table-wrapper" style={{ overflowX: 'auto' }}>
              <PublishLockOverlay
                locked={Boolean(globalLocked || publishedEditLocked || (isPublished && lockStatusUnknown))}
                title={globalLocked ? 'Locked by IQAC' : displayPublishedLocked ? 'Published — Locked' : 'Table Locked'}
                subtitle={globalLocked ? 'Publishing is turned OFF globally for this assessment.' : displayPublishedLocked ? 'Marks are published. Request IQAC approval to edit.' : 'Confirm the Mark Manager'}
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
              {visibleBtlIndices.length ? <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th> : null}
            </tr>
            <tr>
              <th style={cellTh}>
                <div style={{ fontWeight: 800 }}>COs</div>
                <div style={{ fontSize: 12 }}>3,4</div>
              </th>
              {showTotalColumn ? <th style={cellTh} /> : null}

              <th style={cellTh} colSpan={2}>CO-3</th>
              <th style={cellTh} colSpan={2}>CO-4</th>

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
                const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT2) : null;

                const coShare = totalRaw == null ? null : round1(totalRaw / 2);
                const co3 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co3);
                const co4 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co4);

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
                          max={MAX_ASMT2}
                          onChange={(e) => {
                            if (marksEditDisabled) return;
                            const raw = e.target.value;
                            if (raw === '') return updateRow(idx, { total: '' });
                            const next = Number(raw);
                            if (!Number.isFinite(next)) return updateRow(idx, { total: '' });
                            if (next > MAX_ASMT2) {
                              e.currentTarget.setCustomValidity(`Max mark is ${MAX_ASMT2}`);
                              e.currentTarget.reportValidity();
                              window.setTimeout(() => e.currentTarget.setCustomValidity(''), 0);
                              return;
                            }
                            e.currentTarget.setCustomValidity('');
                            const n = clamp(next, 0, MAX_ASMT2);
                            updateRow(idx, { total: n });
                          }}
                        />
                      )}
                    </td>
                    {showTotalColumn ? <td style={{ ...cellTd, textAlign: 'center' }}>{totalRaw ?? ''}</td> : null}
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co3 ?? ''}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co3, CO_MAX.co3)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co4 ?? ''}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co4, CO_MAX.co4)}</td>

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
                  {displayPublishedLocked ? (
                    <>
                      <div style={{ fontWeight: 900, color: '#065f46' }}>Published</div>
                      <div style={{ fontSize: 13, color: '#065f46' }}>Marks are locked. Request IQAC approval to edit.</div>
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
                  <button className="obe-btn obe-btn-success" disabled={markEntryReqPending} onClick={openEditRequestModal}>
                    {markEntryReqPending ? 'Request Pending' : 'Request Edit'}
                  </button>
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
              <div style={{ fontWeight: 800, fontSize: 16, marginTop: 8 }}>{displayPublishedLocked && showNameList ? 'Published — Locked' : 'Table Locked'}</div>
              <div style={{ color: '#6b7280', marginTop: 6 }}>
                {displayPublishedLocked && showNameList
                  ? 'Marks published. Use View to inspect or Request Edit to ask IQAC for edit access.'
                  : 'Confirm the Mark Manager to unlock the student list.'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {displayPublishedLocked && showNameList ? (
                  <>
                    <button className="obe-btn" onClick={() => setViewMarksModalOpen(true)}>
                      View
                    </button>
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
                    {visibleBtlIndices.length ? <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th> : null}
                  </tr>
                  <tr>
                    <th style={cellTh}>
                      <div style={{ fontWeight: 800 }}>COs</div>
                      <div style={{ fontSize: 12 }}>3,4</div>
                    </th>
                    {showTotalColumn ? <th style={cellTh} /> : null}

                    <th style={cellTh} colSpan={2}>CO-3</th>
                    <th style={cellTh} colSpan={2}>CO-4</th>

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
                      <td colSpan={totalTableCols} style={{ padding: 14, color: '#6b7280', fontSize: 13 }}>
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
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-3 max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{CO_MAX.co3}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-4 max</td>
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
