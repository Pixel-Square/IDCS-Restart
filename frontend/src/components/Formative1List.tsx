import React, { useEffect, useMemo, useRef, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import fetchWithAuth from '../services/fetchAuth';
import { fetchMyTeachingAssignments } from '../services/obe';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchMasters } from '../services/curriculum';
import { createPublishRequest, fetchDraft, publishFormative, saveDraft, fetchPublishedFormative, createEditRequest, confirmMarkManagerLock, fetchEditWindow } from '../services/obe';
import { useEditWindow } from '../hooks/useEditWindow';
import { useMarkTableLock } from '../hooks/useMarkTableLock';
import { formatRemaining, usePublishWindow } from '../hooks/usePublishWindow';
import PublishLockOverlay from './PublishLockOverlay';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type F1RowState = {
  studentId: number;
  skill1: number | '';
  skill2: number | '';
  att1: number | '';
  att2: number | '';
};

type F1Sheet = {
  termLabel: string;
  batchLabel: string;
  rowsByStudentId: Record<string, F1RowState>;
  markManagerLocked?: boolean;
  markManagerSnapshot?: string | null;
  markManagerApprovalUntil?: string | null;
};

type F1DraftPayload = {
  sheet: F1Sheet;
  partBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>;
  markManagerLocked?: boolean;
  markManagerSnapshot?: string | null;
  markManagerApprovalUntil?: string | null;
};

// Component Props
interface Formative1ListProps {
  subjectId?: string | null;
  subject?: any | null;
  teachingAssignmentId?: number;
  assessmentKey?: 'formative1' | 'formative2';
  skipMarkManager?: boolean;
}

const DEFAULT_MAX_PART = 5;
const DEFAULT_MAX_TOTAL = 20;
const DEFAULT_MAX_CO = 10;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function toNumOrEmpty(v: any): number | '' {
  if (v === '' || v == null) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function pct(mark: number, max: number) {
  if (!max) return '-';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
}

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

  const ar = String(a?.reg_no || '').trim();
  const br = String(b?.reg_no || '').trim();
  const byReg = ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
  if (byReg) return byReg;
  return 0;
}

type FormativeKey = 'formative1' | 'formative2';

function storageKey(assessmentKey: FormativeKey, subjectId: string) {
  return `${assessmentKey}_sheet_${subjectId}`;
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

function shortenRegisterNo(registerNo: string): string {
  return registerNo.slice(-8);
}

export default function Formative1List({ subjectId, teachingAssignmentId, assessmentKey: assessmentKeyProp, skipMarkManager = false }: Formative1ListProps) {
  const assessmentKey: FormativeKey = (assessmentKeyProp as FormativeKey) || 'formative1';
  const assessmentLabel = assessmentKey === 'formative2' ? 'Formative 2' : 'Formative 1';
  const CO_A = assessmentKey === 'formative2' ? 3 : 1;
  const CO_B = assessmentKey === 'formative2' ? 4 : 2;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjectData, setSubjectData] = useState<any>(null);
  const [partBtl, setPartBtl] = useState<Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>>({
    skill1: 3,
    skill2: 4,
    att1: 3,
    att2: 4,
  });

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [inlineViewOnly, setInlineViewOnly] = useState(false);

  const {
    data: publishWindow,
    loading: publishWindowLoading,
    error: publishWindowError,
    remainingSeconds,
    publishAllowed,
    refresh: refreshPublishWindow,
  } = usePublishWindow({ assessment: assessmentKey, subjectCode: String(subjectId || ''), teachingAssignmentId });

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  const [masterCfg, setMasterCfg] = useState<any>(null);

  const [sheet, setSheet] = useState<F1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId || '',
    rowsByStudentId: {},
    markManagerLocked: false,
    markManagerSnapshot: null,
    markManagerApprovalUntil: null,
  });

  const { data: markLock, refresh: refreshMarkLock } = useMarkTableLock({ assessment: assessmentKey as any, subjectCode: String(subjectId || ''), teachingAssignmentId, options: { poll: false } });
  const { data: markManagerEditWindow, refresh: refreshMarkManagerEditWindow } = useEditWindow({ assessment: assessmentKey as any, subjectCode: String(subjectId || ''), scope: 'MARK_MANAGER', teachingAssignmentId, options: { poll: false } });
  const { data: markEntryEditWindow, refresh: refreshMarkEntryEditWindow } = useEditWindow({ assessment: assessmentKey as any, subjectCode: String(subjectId || ''), scope: 'MARK_ENTRY', teachingAssignmentId, options: { poll: false } });

  const [publishConsumedApprovals, setPublishConsumedApprovals] = useState<null | {
    markEntryApprovalUntil: string | null;
    markManagerApprovalUntil: string | null;
  }>(null);

  const isPublished = Boolean(publishedAt) || Boolean(markLock?.exists && markLock?.is_published);
  const markManagerLocked = skipMarkManager ? true : Boolean(sheet.markManagerLocked);
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
  const tableBlocked = skipMarkManager
    ? Boolean(globalLocked || (isPublished ? true : false))
    : Boolean(globalLocked || (isPublished ? !entryOpen : !markManagerLocked));
  const showNameList = Boolean(sheet.markManagerSnapshot != null) || Boolean(isPublished);

  const [markManagerModal, setMarkManagerModal] = useState<null | { mode: 'confirm' | 'request' }>(null);
  const [markManagerBusy, setMarkManagerBusy] = useState(false);

  const [viewMarksModalOpen, setViewMarksModalOpen] = useState(false);
  const [publishedViewSnapshot, setPublishedViewSnapshot] = useState<Record<string, any> | null>(null);
  const [publishedViewLoading, setPublishedViewLoading] = useState(false);
  const [publishedViewError, setPublishedViewError] = useState<string | null>(null);

  const [publishedEditModalOpen, setPublishedEditModalOpen] = useState(false);
  const [editRequestReason, setEditRequestReason] = useState('');
  const [editRequestBusy, setEditRequestBusy] = useState(false);

  const masterTermLabel = String(masterCfg?.termLabel || 'KRCT AY25-26');
  const f1Cfg = (masterCfg as any)?.assessments?.[assessmentKey] ?? (masterCfg as any)?.assessments?.formative1 ?? {};
  const MAX_PART = Number.isFinite(Number(f1Cfg?.maxPart)) ? Number(f1Cfg.maxPart) : DEFAULT_MAX_PART;
  const MAX_TOTAL = Number.isFinite(Number(f1Cfg?.maxTotal)) ? Number(f1Cfg.maxTotal) : DEFAULT_MAX_TOTAL;
  const MAX_CO = Number.isFinite(Number(f1Cfg?.maxCo)) ? Number(f1Cfg.maxCo) : DEFAULT_MAX_CO;

  const snapshotPartBtl = useMemo(() => {
    const raw = sheet.markManagerSnapshot;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(String(raw));
      const pb = (parsed as any)?.partBtl;
      if (!pb || typeof pb !== 'object') return null;
      const next: any = {};
      for (const k of ['skill1', 'skill2', 'att1', 'att2']) {
        const v = (pb as any)[k];
        next[k] = v === '' || v == null ? '' : Number(v);
        if (!(next[k] === '' || (Number.isFinite(next[k]) && next[k] >= 1 && next[k] <= 6))) next[k] = '';
      }
      return next as Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>;
    } catch {
      return null;
    }
  }, [sheet.markManagerSnapshot]);

  useEffect(() => {
    setPublishConsumedApprovals(null);
  }, [subjectId]);

  const viewPartBtl = snapshotPartBtl || partBtl;

  const refreshPublishedSnapshot = async (silent?: boolean) => {
    if (!subjectId) return;
    if (!silent) {
      setPublishedViewError(null);
      setPublishedViewLoading(true);
    }
    try {
      const pub = await fetchPublishedFormative(assessmentKey, subjectId as string);
      const marks = pub && (pub as any).marks && typeof (pub as any).marks === 'object' ? ((pub as any).marks as Record<string, any>) : null;
      if (marks && Object.keys(marks).length) {
        setPublishedViewSnapshot(marks);
      } else {
        setPublishedViewSnapshot(null);
      }
    } catch (e: any) {
      if (!silent) setPublishedViewError(e?.message || 'Failed to load published marks');
    } finally {
      if (!silent) setPublishedViewLoading(false);
    }
  };

  useEffect(() => {
    if (!viewMarksModalOpen) return;
    setPublishedViewSnapshot(null);
    refreshPublishedSnapshot(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMarksModalOpen, subjectId, assessmentKey]);

  const prevEntryOpenRef = useRef<boolean>(Boolean(entryOpen));
  useEffect(() => {
    // When IQAC opens MARK_ENTRY edits post-publish, reload the editable draft.
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
        const res = await fetchDraft<F1DraftPayload>(assessmentKey, String(subjectId));
        if (!mounted) return;
        const d = res?.draft as any;
        const draftSheet = d?.sheet;
        const draftPartBtl = d?.partBtl;

        if (draftSheet && typeof draftSheet === 'object' && typeof draftSheet.rowsByStudentId === 'object') {
          setSheet((prevSheet) => ({
            ...prevSheet,
            termLabel: String(draftSheet.termLabel || masterTermLabel || 'KRCT AY25-26'),
            batchLabel: String(subjectId),
            rowsByStudentId: draftSheet.rowsByStudentId || {},
            markManagerLocked:
              typeof draftSheet.markManagerLocked === 'boolean'
                ? draftSheet.markManagerLocked
                : Boolean(draftSheet.markManagerSnapshot ?? prevSheet.markManagerSnapshot),
            markManagerSnapshot: draftSheet.markManagerSnapshot ?? prevSheet.markManagerSnapshot ?? null,
            markManagerApprovalUntil: draftSheet.markManagerApprovalUntil ?? prevSheet.markManagerApprovalUntil ?? null,
          }));
        }

        if (draftPartBtl && typeof draftPartBtl === 'object') {
          const next: any = {};
          for (const k of ['skill1', 'skill2', 'att1', 'att2']) {
            const v = (draftPartBtl as any)[k];
            next[k] = v === '' || v == null ? '' : Number(v);
            if (!(next[k] === '' || (Number.isFinite(next[k]) && next[k] >= 1 && next[k] <= 6))) next[k] = '';
          }
          setPartBtl(next);
        }
      } catch {
        // ignore
      }
    })();

    prevEntryOpenRef.current = Boolean(entryOpen);
    return () => {
      mounted = false;
    };
  }, [entryOpen, isPublished, subjectId, assessmentKey, masterTermLabel]);

  useEffect(() => {
    // While locked after publish, periodically check if IQAC updated the lock/edit-window rows.
    if (!subjectId) return;
    if (!isPublished) return;
    if (entryOpen) return;
    const tid = window.setInterval(() => {
      refreshMarkLock({ silent: true });
      try {
        refreshMarkEntryEditWindow?.({ silent: true });
        refreshMarkManagerEditWindow?.({ silent: true });
      } catch {
        // ignore
      }
    }, 30000);
    return () => window.clearInterval(tid);
  }, [entryOpen, isPublished, subjectId, refreshMarkLock, refreshMarkEntryEditWindow, refreshMarkManagerEditWindow]);

  async function requestMarkEntryEdit() {
    if (!subjectId) return;
    setEditRequestBusy(true);
    try {
      await createEditRequest({
        assessment: assessmentKey,
        subject_code: String(subjectId),
        scope: 'MARK_ENTRY',
        reason: editRequestReason || `Edit request: ${assessmentLabel} marks for ${subjectId}`,
        teaching_assignment_id: teachingAssignmentId,
      });
      alert('Edit request sent to IQAC. Waiting for approval...');
      setPublishedEditModalOpen(false);
      // poll for approval
      (async () => {
        if (!subjectId) return;
        const maxAttempts = 36; // ~3 minutes
        const delay = 5000;
        for (let i = 0; i < maxAttempts; i++) {
          try {
            const resp = await fetchEditWindow(assessmentKey, String(subjectId), 'MARK_ENTRY', teachingAssignmentId);
            if (resp && resp.allowed_by_approval) {
              try {
                refreshMarkEntryEditWindow?.({ silent: true });
                refreshMarkLock({ silent: true });
              } catch {}
              alert('IQAC approved the edit request. You can now edit marks.');
              return;
            }
          } catch (e) {
            // ignore transient errors
          }
          await new Promise((r) => setTimeout(r, delay));
        }
        alert('Edit request still pending. Please try again later.');
      })();
    } catch (e: any) {
      alert(e?.message || 'Request failed');
    } finally {
      setEditRequestBusy(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
        setSheet((p) => ({ ...p, termLabel: String((cfg as any)?.termLabel || p.termLabel || 'KRCT AY25-26'), batchLabel: subjectId || p.batchLabel }));
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  const key = useMemo(() => (subjectId ? storageKey(assessmentKey, subjectId) : ''), [assessmentKey, subjectId]);

  const parts = useMemo(
    () => [
      { key: 'skill1', label: 'Skill 1', max: MAX_PART },
      { key: 'skill2', label: 'Skill 2', max: MAX_PART },
      { key: 'att1', label: 'Attitude 1', max: MAX_PART },
      { key: 'att2', label: 'Attitude 2', max: MAX_PART },
    ],
    [MAX_PART],
  );

  const lastPartKey = parts[parts.length - 1]?.key as string | undefined;

  const visibleBtlIndices = useMemo(() => {
    const set = new Set<number>();
    for (const k of Object.keys(partBtl)) {
      const v = (partBtl as any)[k];
      if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) set.add(v);
    }
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [partBtl]);

  const totalTableCols = useMemo(() => {
    // Base columns: S.No, RegNo, Name, Skill1, Skill2, Att1, Att2, Total = 8
    // CO columns (two CO mark/% pairs) = 4
    // BTL columns = selected count * 2
    return 12 + visibleBtlIndices.length * 2;
  }, [visibleBtlIndices.length]);

  useEffect(() => {
    // load persisted per-part BTL mapping per subject
    if (subjectId) {
      const sk = `${assessmentKey}_part_btl_${subjectId}`;
      const stored = lsGet<any>(sk);
      if (stored && typeof stored === 'object') {
        try {
          const next: any = {};
          for (const k of Object.keys(partBtl)) {
            const v = stored[k];
            next[k] = v === '' || v == null ? '' : Number(v);
            if (!(next[k] === '' || (Number.isFinite(next[k]) && next[k] >= 1 && next[k] <= 6))) next[k] = '';
          }
          setPartBtl(next);
        } catch {
          // ignore
        }
      }
    }
  }, [subjectId, assessmentKey]);

  useEffect(() => {
    if (!subjectId) return;
    const sk = `${assessmentKey}_part_btl_${subjectId}`;
    try {
      lsSet(sk, partBtl);
    } catch {}
  }, [partBtl, subjectId, assessmentKey]);

  const markManagerSnapshotOf = (nextPartBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>) =>
    JSON.stringify({ assessmentKey, partBtl: nextPartBtl, maxPart: MAX_PART, maxTotal: MAX_TOTAL });

  async function confirmMarkManager() {
    if (!subjectId) return;
    setMarkManagerBusy(true);
    try {
      const snapshot = markManagerSnapshotOf(partBtl);
      const approvalUntil = markManagerEditWindow?.approval_until ? String(markManagerEditWindow.approval_until) : sheet.markManagerApprovalUntil || null;
      const nextSheet: F1Sheet = { ...sheet, markManagerLocked: true, markManagerSnapshot: snapshot, markManagerApprovalUntil: approvalUntil };
      const draft: F1DraftPayload = { sheet: nextSheet, partBtl, markManagerLocked: nextSheet.markManagerLocked, markManagerSnapshot: nextSheet.markManagerSnapshot, markManagerApprovalUntil: nextSheet.markManagerApprovalUntil } as any;
      setSheet(nextSheet);
      setMarkManagerModal(null);
      await saveDraft(assessmentKey, String(subjectId), draft);
      setSavedAt(new Date().toLocaleString());
      try {
        await confirmMarkManagerLock(assessmentKey as any, String(subjectId), teachingAssignmentId);
        refreshMarkLock({ silent: true });
      } catch {
        // ignore
      }
    } catch (e) {
      // ignore
    } finally {
      setMarkManagerBusy(false);
    }
  }

  async function requestMarkManagerEdit() {
    if (!subjectId) return;
    setMarkManagerBusy(true);
    try {
      await createEditRequest({ assessment: assessmentKey, subject_code: String(subjectId), scope: 'MARK_MANAGER', reason: `Request mark-manager edit for ${subjectId}`, teaching_assignment_id: teachingAssignmentId });
      alert('Edit request sent to IQAC. Waiting for approval...');
      // poll for approval and refresh the edit window state when granted
      (async () => {
        if (!subjectId) return;
        const maxAttempts = 36; // ~3 minutes
        const delay = 5000;
        for (let i = 0; i < maxAttempts; i++) {
          try {
            const resp = await fetchEditWindow(assessmentKey, String(subjectId), 'MARK_MANAGER', teachingAssignmentId);
            if (resp && resp.allowed_by_approval) {
              try {
                refreshMarkManagerEditWindow?.({ silent: true });
                refreshMarkLock({ silent: true });
              } catch {}
              alert('IQAC approved the mark-manager edit request. You can now edit mark-manager settings.');
              return;
            }
          } catch (e) {
            // ignore transient errors
          }
          await new Promise((r) => setTimeout(r, delay));
        }
        alert('Edit request still pending. Please try again later.');
      })();
    } catch (e: any) {
      alert(e?.message || 'Request failed');
    } finally {
      setMarkManagerBusy(false);
    }
  }

  // Auto-save selected BTLs to server (debounced)
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const payload: F1DraftPayload = { sheet, partBtl } as any;
        await saveDraft(assessmentKey, subjectId, payload);
        try {
          if (key) lsSet(key, { termLabel: sheet.termLabel, batchLabel: sheet.batchLabel, rowsByStudentId: sheet.rowsByStudentId });
        } catch {}
        if (!cancelled) setSavedAt(new Date().toLocaleString());
      } catch {
        // ignore save errors for autosave
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [partBtl, subjectId, assessmentKey, sheet, key]);

  // Load draft from DB (preferred)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<F1DraftPayload>(assessmentKey, subjectId);
        if (!mounted) return;
        const d = res?.draft as any;
        const draftSheet = d?.sheet;
        const draftPartBtl = d?.partBtl;
        const draftBtls = d?.selectedBtls;
        if (draftSheet && typeof draftSheet === 'object' && typeof draftSheet.rowsByStudentId === 'object') {
          setSheet({
            termLabel: String(draftSheet.termLabel || masterTermLabel || 'KRCT AY25-26'),
            batchLabel: String(subjectId),
              rowsByStudentId: draftSheet.rowsByStudentId || {},
              markManagerLocked: typeof draftSheet.markManagerLocked === 'boolean' ? draftSheet.markManagerLocked : Boolean(draftSheet.markManagerSnapshot),
              markManagerSnapshot: draftSheet.markManagerSnapshot ?? null,
              markManagerApprovalUntil: draftSheet.markManagerApprovalUntil ?? null,
          });
          // Persist server draft into localStorage so later roster merges use it
          try {
            if (key) lsSet(key, { termLabel: String(draftSheet.termLabel || masterTermLabel || 'KRCT AY25-26'), batchLabel: String(subjectId), rowsByStudentId: draftSheet.rowsByStudentId || {} });
          } catch {
            // ignore localStorage errors
          }
        }
        if (draftPartBtl && typeof draftPartBtl === 'object') {
          const next: any = {};
          for (const k of Object.keys(partBtl)) {
            const v = (draftPartBtl as any)[k];
            next[k] = v === '' || v == null ? '' : Number(v);
            if (!(next[k] === '' || (Number.isFinite(next[k]) && next[k] >= 1 && next[k] <= 6))) next[k] = '';
          }
          setPartBtl(next);
          try {
            const sk = `${assessmentKey}_part_btl_${subjectId}`;
            lsSet(sk, next);
          } catch {}
        } else if (Array.isArray(draftBtls)) {
          const isBtl = (n: number): n is 1 | 2 | 3 | 4 | 5 | 6 => Number.isFinite(n) && n >= 1 && n <= 6;
          const arr = draftBtls.map((n: any) => Number(n)).filter(isBtl);
          if (arr.length === 1) {
            const next = { skill1: arr[0], skill2: arr[0], att1: arr[0], att2: arr[0] };
            setPartBtl(next);
            try {
              const sk = `${assessmentKey}_part_btl_${subjectId}`;
              lsSet(sk, next);
            } catch {}
          } else if (arr.length >= 2) {
            const next = { skill1: arr[0], skill2: arr[1], att1: arr[0], att2: arr[1] };
            setPartBtl(next);
            try {
              const sk = `${assessmentKey}_part_btl_${subjectId}`;
              lsSet(sk, next);
            } catch {}
          }
        }
      } catch {
        // keep local fallback
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId, masterTermLabel, assessmentKey, key]);

  useEffect(() => {
    let mounted = true;

    const loadRoster = async () => {
      if (!subjectId) return;
      setLoading(true);
      setError(null);

      try {
        // If a teaching assignment is specified, fetch roster by TA (preferred)
        let roster: Student[] = [];
        if (typeof teachingAssignmentId === 'number') {
          // Attempt elective-aware fetch: inspect TA details and use elective-choices when applicable
          try {
            const taRes = await fetchWithAuth(`/api/academics/teaching-assignments/${teachingAssignmentId}/`);
            if (taRes.ok) {
              const taObj = await taRes.json();
              if (taObj && taObj.elective_subject_id && !taObj.section_id) {
                const esRes = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${encodeURIComponent(String(taObj.elective_subject_id))}`);
                if (!esRes.ok) throw new Error(`Elective-choices fetch failed: ${esRes.status}`);
                const data = await esRes.json();
                if (!mounted) return;
                setSubjectData({ subject_name: taObj.subject_name || '', section: taObj.section_name || '' });
                const items = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : (data.items || []);
                roster = (items || []).map((s: any) => ({ id: Number(s.student_id ?? s.id), reg_no: String(s.reg_no ?? s.regno ?? ''), name: String(s.name ?? s.full_name ?? s.username ?? ''), section: s.section_name ?? s.section ?? null })).filter((s) => Number.isFinite(s.id));
                roster.sort(compareStudentName);
                setStudents(roster);
                return;
              }
            }
          } catch (err) {
            // fall back to roster endpoint
          }
          const resp = await fetchTeachingAssignmentRoster(teachingAssignmentId);
          const ta = resp.teaching_assignment;
          if (!mounted) return;
          setSubjectData({ subject_name: resp.teaching_assignment.subject_name, section: resp.teaching_assignment.section_name });
          roster = (resp.students || []).map((s: TeachingAssignmentRosterStudent) => ({
            id: Number(s.id),
            reg_no: String(s.reg_no ?? ''),
            name: String(s.name ?? ''),
            section: s.section ?? null,
          })).filter((s) => Number.isFinite(s.id));
          roster.sort(compareStudentName);
          setStudents(roster);
        } else {
          // Find subject using curriculum master records (fallback when TA not provided)
          const masters = await fetchMasters();
          const subjectList = Array.isArray(masters)
            ? masters.filter((m: any) => String(m.course_code || '').trim().toUpperCase() === String(subjectId || '').trim().toUpperCase())
            : [];

          if (!subjectList.length) throw new Error(`Subject with code ${subjectId} not found`);
          const subj = subjectList[0];
          if (!mounted) return;
          setSubjectData({ course_code: subj.course_code, course_name: subj.course_name, department: subj.departments ? subj.departments[0] : undefined, year: subj.semester, section: null });

          // Attempt to fetch students by department/year/section if available
          const params = new URLSearchParams({
            department: String(subj.departments ? subj.departments[0] : ''),
            year: String(subj.semester ?? ''),
            section: String(''),
          });

          const studentsRes = await fetch(`${API_BASE}/api/academics/students/?${params.toString()}`, {
            headers: authHeaders(),
          });

          if (!studentsRes.ok) {
            const text = await studentsRes.text();
            throw new Error(`Failed to fetch students: ${studentsRes.status} ${text}`);
          }

          const studentsData = await studentsRes.json();
          roster = (Array.isArray(studentsData) ? studentsData : [])
            .map((s: any) => ({
              id: Number(s.id),
              reg_no: String(s.reg_no ?? ''),
              name: String(s.name ?? ''),
              section: s.section ?? null,
            }))
            .filter((s) => Number.isFinite(s.id));

          // If no students found, try to locate a teaching assignment for this subject
          // and use its roster as a fallback.
          if (!roster.length) {
            try {
              const myTAs = await fetchMyTeachingAssignments();
              const match = (myTAs || []).find((t: any) => String(t.subject_code || '').trim().toUpperCase() === String(subjectId || '').trim().toUpperCase());
              if (match && match.id) {
                const taResp = await fetchTeachingAssignmentRoster(match.id);
                roster = (taResp.students || []).map((s: TeachingAssignmentRosterStudent) => ({ id: Number(s.id), reg_no: String(s.reg_no ?? ''), name: String(s.name ?? ''), section: s.section ?? null })).filter((s) => Number.isFinite(s.id));
                if (mounted) setSubjectData({ subject_name: match.subject_name, section: match.section_name });
              }
            } catch {
              // ignore fallback errors
            }
          }

          // Requested: SSA1/CIA1/Formative1 student list in ascending name order
          roster.sort(compareStudentName);

          if (!mounted) return;
          setStudents(roster);
        }

        // Try published formative first (published should take precedence over draft/local)
        let publishedMarks: Record<string, any> | null = null;
        try {
          const pub = await fetchPublishedFormative(assessmentKey, subjectId as string);
          if (pub && pub.marks && typeof pub.marks === 'object' && Object.keys(pub.marks || {}).length) {
            publishedMarks = pub.marks as Record<string, any>;
            setPublishedAt(new Date().toLocaleString());
          }
        } catch (e: any) {
          // ignore published fetch errors — we'll fall back to draft/local
        }

        // Load local sheet and merge with roster (or use published marks if present)
        const stored = key ? lsGet<F1Sheet>(key) : null;
        const base: F1Sheet = publishedMarks
          ? {
              termLabel: masterCfg?.termLabel ? String(masterCfg.termLabel) : masterTermLabel || 'KRCT AY25-26',
              batchLabel: String(subjectId || ''),
              rowsByStudentId: Object.fromEntries(
                Object.entries(publishedMarks).map(([k, v]) => [k, { studentId: Number(k), skill1: toNumOrEmpty((v as any)?.skill1), skill2: toNumOrEmpty((v as any)?.skill2), att1: toNumOrEmpty((v as any)?.att1), att2: toNumOrEmpty((v as any)?.att2) }]),
              ) as any,
            }
          : stored && typeof stored === 'object'
          ? {
              termLabel: masterCfg?.termLabel ? String(masterCfg.termLabel) : String((stored as any).termLabel || 'KRCT AY25-26'),
              batchLabel: String(subjectId || (stored as any).batchLabel || ''),
              rowsByStudentId:
                (stored as any).rowsByStudentId && typeof (stored as any).rowsByStudentId === 'object'
                  ? (stored as any).rowsByStudentId
                  : {},
            }
          : { termLabel: masterTermLabel || 'KRCT AY25-26', batchLabel: String(subjectId || ''), rowsByStudentId: {} };

        const merged: Record<string, F1RowState> = { ...base.rowsByStudentId };
        for (const s of roster) {
          const sid = String(s.id);
          const existing = merged[sid];
          merged[sid] = {
            studentId: s.id,
            skill1: typeof existing?.skill1 === 'number' ? clamp(Number(existing?.skill1), 1, MAX_PART) : '',
            skill2: typeof existing?.skill2 === 'number' ? clamp(Number(existing?.skill2), 1, MAX_PART) : '',
            att1: typeof existing?.att1 === 'number' ? clamp(Number(existing?.att1), 1, MAX_PART) : '',
            att2: typeof existing?.att2 === 'number' ? clamp(Number(existing?.att2), 1, MAX_PART) : '',
          };
        }

        setSheet({ ...base, termLabel: base.termLabel || masterTermLabel, batchLabel: String(subjectId || base.batchLabel || ''), rowsByStudentId: merged });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || `Failed to load ${assessmentLabel} roster`);
        setStudents([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadRoster();
    return () => {
      mounted = false;
    };
  }, [subjectId, key, masterCfg, masterTermLabel, MAX_PART, assessmentLabel]);

  const updateMark = (studentId: number, patch: Partial<F1RowState>) => {
    if (tableBlocked) return;
    if (publishedEditLocked) return;
    setSheet((prev) => {
      const sid = String(studentId);
      const existing = prev.rowsByStudentId[sid] || ({ studentId, skill1: '', skill2: '', att1: '', att2: '' } as F1RowState);

      const merged: F1RowState = { ...existing, ...patch, studentId } as F1RowState;

      const normalize = (v: number | '' | undefined) => {
        if (v === '' || v == null) return '';
        const n = clamp(Number(v), 1, MAX_PART);
        return Number.isFinite(n) ? n : '';
      };

      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [sid]: {
            ...merged,
            skill1: normalize(merged.skill1),
            skill2: normalize(merged.skill2),
            att1: normalize(merged.att1),
            att2: normalize(merged.att2),
          },
        },
      };
    });
  };

  const saveDraftToDb = async () => {
    if (!subjectId) return;
    setSavingDraft(true);
    setError(null);
    try {
      const payload: F1DraftPayload = { sheet, partBtl } as any;
      await saveDraft(assessmentKey, subjectId, payload);
      setSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setError(e?.message || `Failed to save ${assessmentLabel} draft`);
    } finally {
      setSavingDraft(false);
    }
  };

  const publish = async () => {
    if (!subjectId) return;

    if (globalLocked) {
      setError('Publishing is locked by IQAC.');
      return;
    }
    if (!publishAllowed) {
      setError('Publish window is closed. Please request IQAC approval.');
      return;
    }

    // If already published and locked, use Publish button as the entry-point to request edits.
    if (isPublished && publishedEditLocked) {
      setPublishedEditModalOpen(true);
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      await publishFormative(assessmentKey, subjectId, sheet, teachingAssignmentId);
      setPublishedAt(new Date().toLocaleString());
      setPublishConsumedApprovals(null);
      // Ensure Mark Manager is re-locked locally to avoid a transient editable state.
      setSheet((p) => ({ ...p, markManagerLocked: true }));
      refreshPublishWindow();
      refreshMarkLock({ silent: true });
      refreshPublishedSnapshot(true);
      try {
        console.debug('obe:published dispatch', { assessment: assessmentKey, subjectId });
        window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId, assessment: assessmentKey } }));
      } catch {
        // ignore
      }
    } catch (e: any) {
      setError(e?.message || `Failed to publish ${assessmentLabel}`);
    } finally {
      setPublishing(false);
    }
  };

  const requestApproval = async () => {
    if (!subjectId) return;
    setRequesting(true);
    setRequestMessage(null);
    setError(null);
    try {
      await createPublishRequest({ assessment: assessmentKey, subject_code: subjectId, reason: requestReason, teaching_assignment_id: teachingAssignmentId });
      setRequestMessage('Request sent to IQAC for approval.');
    } catch (e: any) {
      setError(e?.message || 'Failed to request approval');
    } finally {
      setRequesting(false);
      refreshPublishWindow();
    }
  };

  const exportSheetCsv = () => {
    if (!subjectId) return;

    const out = students.map((s, i) => {
      const row = sheet.rowsByStudentId[String(s.id)] || {
        studentId: s.id,
        skill1: '',
        skill2: '',
        att1: '',
        att2: '',
      } as F1RowState;

      const skill1 = typeof row.skill1 === 'number' ? clamp(Number(row.skill1), 1, MAX_PART) : null;
      const skill2 = typeof row.skill2 === 'number' ? clamp(Number(row.skill2), 1, MAX_PART) : null;
      const att1 = typeof row.att1 === 'number' ? clamp(Number(row.att1), 1, MAX_PART) : null;
      const att2 = typeof row.att2 === 'number' ? clamp(Number(row.att2), 1, MAX_PART) : null;

      const total = skill1 != null && skill2 != null && att1 != null && att2 != null ? clamp(skill1 + skill2 + att1 + att2, 0, MAX_TOTAL) : '';
      const co1 = skill1 != null && att1 != null ? clamp(skill1 + att1, 0, MAX_CO) : '';
      const co2 = skill2 != null && att2 != null ? clamp(skill2 + att2, 0, MAX_CO) : '';

      const btlMaxByIndex = [0, 0, 0, 0, 0, 0];
      for (const p of parts) {
        const v = (partBtl as any)[p.key];
        if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) {
          btlMaxByIndex[v - 1] += p.max;
        }
      }
      const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
      const btlShare = typeof total === 'number' && visibleIndicesZeroBased.length ? round1((total as number) / visibleIndicesZeroBased.length) : '';
      const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
        if (btlShare === '') return '';
        if (!visibleIndicesZeroBased.includes(idx)) return '';
        if (max > 0) return clamp(btlShare as number, 0, max);
        return round1(btlShare as number);
      });

      return {
        sno: i + 1,
        registerNo: s.reg_no,
        name: s.name,
        skill1: skill1 ?? '',
        skill2: skill2 ?? '',
        att1: att1 ?? '',
        att2: att2 ?? '',
        total: total === '' ? '' : total,
        [`co${CO_A}_mark`]: co1 === '' ? '' : co1,
        [`co${CO_A}_pct`]: co1 === '' ? '' : pct(co1 as number, MAX_CO),
        [`co${CO_B}_mark`]: co2 === '' ? '' : co2,
        [`co${CO_B}_pct`]: co2 === '' ? '' : pct(co2 as number, MAX_CO),
        btl1_mark: btlMarksByIndex[0] ?? '',
        btl1_pct: btlMarksByIndex[0] === '' ? '' : pct(Number(btlMarksByIndex[0]), btlMaxByIndex[0]),
        btl2_mark: btlMarksByIndex[1] ?? '',
        btl2_pct: btlMarksByIndex[1] === '' ? '' : pct(Number(btlMarksByIndex[1]), btlMaxByIndex[1]),
        btl3_mark: btlMarksByIndex[2] ?? '',
        btl3_pct: btlMarksByIndex[2] === '' ? '' : pct(Number(btlMarksByIndex[2]), btlMaxByIndex[2]),
        btl4_mark: btlMarksByIndex[3] ?? '',
        btl4_pct: btlMarksByIndex[3] === '' ? '' : pct(Number(btlMarksByIndex[3]), btlMaxByIndex[3]),
        btl5_mark: btlMarksByIndex[4] ?? '',
        btl5_pct: btlMarksByIndex[4] === '' ? '' : pct(Number(btlMarksByIndex[4]), btlMaxByIndex[4]),
        btl6_mark: btlMarksByIndex[5] ?? '',
        btl6_pct: btlMarksByIndex[5] === '' ? '' : pct(Number(btlMarksByIndex[5]), btlMaxByIndex[5]),
      };
    });

    downloadCsv(`${subjectId}_${assessmentKey.toUpperCase()}_sheet.csv`, out);
  };

  if (!subjectId) {
    return <div style={{ color: '#6b7280' }}>Select a course to start {assessmentLabel} entry.</div>;
  }

  if (loading) return <div style={{ color: '#6b7280' }}>Loading {assessmentLabel} roster…</div>;

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
    textAlign: 'center',
  };


  return (
    <div>
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #ef444433',
            color: '#991b1b',
            padding: 10,
            borderRadius: 10,
            marginBottom: 10,
          }}
        >
          {error}
        </div>
      )}

      <div className="obe-card"
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
          <div style={{ fontWeight: 800, fontSize: 16 }}>{assessmentLabel} Sheet</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            Excel-like layout (Skill + Attitude → Total + CO). Subject: <b>{subjectId}</b>
          </div>
          {subjectData && (
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
              {String(subjectData.department || '')} • Year {String(subjectData.year || '')} • Section {String(subjectData.section || '')}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={saveDraftToDb} className="obe-btn" disabled={savingDraft || students.length === 0}>
            {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={publish}
            disabled={publishing || students.length === 0 || !publishAllowed}
            className="obe-btn obe-btn-primary"
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
          <button onClick={exportSheetCsv} style={{ padding: '6px 10px' }} disabled={students.length === 0}>
            Export CSV
          </button>
          {savedAt && <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>Draft: {savedAt}</div>}
          {publishedAt && <div style={{ fontSize: 12, color: '#16a34a', alignSelf: 'center' }}>Published: {publishedAt}</div>}
        </div>
      </div>

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
      ) : null}

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
          <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center' }}>
            Term
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.termLabel}</div>
          </label>
          <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center' }}>
            Sheet Label
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.batchLabel}</div>
          </label>
          <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
            Skill/Attitude max: {MAX_PART} each | Total: {MAX_TOTAL} | CO-{CO_A}: {MAX_CO} | CO-{CO_B}: {MAX_CO}
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>No students found for this subject.</div>
      ) : (
        <PublishLockOverlay locked={globalLocked}>
          {showNameList ? (
            inlineViewOnly && isPublished ? (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, position: 'relative' }}>
                  <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>View Only</div>
                  <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', marginRight: 36 }}>{assessmentLabel} • {String(subjectId || '')}</div>
                  <button className="obe-btn" onClick={() => setInlineViewOnly(false)} style={{ position: 'absolute', right: 0, top: 0 }}>
                    Close
                  </button>
                </div>

                {publishedViewLoading ? <div style={{ color: '#6b7280' }}>Loading published marks…</div> : null}
                {publishedViewError ? <div style={{ color: '#991b1b', fontSize: 12, marginBottom: 8 }}>{publishedViewError}</div> : null}

                {(publishedViewSnapshot && Object.keys(publishedViewSnapshot).length) || students.length ? (
                  <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                    <table className="obe-table" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={cellTh} colSpan={totalTableCols}>
                            {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {assessmentLabel.toUpperCase()} (PUBLISHED)
                          </th>
                        </tr>
                        <tr>
                          <th style={{ ...cellTh, width: 42, minWidth: 42 }}>S.No</th>
                          <th style={cellTh}>Register No.</th>
                          <th style={cellTh}>Name of the Students</th>
                          <th style={cellTh}>Skill 1</th>
                          <th style={cellTh}>Skill 2</th>
                          <th style={cellTh}>Att 1</th>
                          <th style={cellTh}>Att 2</th>
                          <th style={cellTh}>Total</th>
                          <th style={cellTh} colSpan={2}>CO-{CO_A}</th>
                          <th style={cellTh} colSpan={2}>CO-{CO_B}</th>
                          {visibleBtlIndices.map((n) => (
                            <th key={`pv_btl_${n}`} style={cellTh} colSpan={2}>
                              BTL-{n}
                            </th>
                          ))}
                        </tr>
                        <tr>
                          <th style={cellTh} />
                          <th style={cellTh} />
                          <th style={cellTh} />
                          <th style={cellTh} />
                          <th style={cellTh} />
                          <th style={cellTh} />
                          <th style={cellTh} />
                          <th style={cellTh} />
                          <th style={cellTh}>Mark</th>
                          <th style={cellTh}>%</th>
                          <th style={cellTh}>Mark</th>
                          <th style={cellTh}>%</th>
                          {visibleBtlIndices.map((n) => (
                            <React.Fragment key={`pv_btl_sub_${n}`}>
                              <th style={cellTh}>Mark</th>
                              <th style={cellTh}>%</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {students.length ? (
                          students.map((s, i) => {
                            const v = (publishedViewSnapshot && (publishedViewSnapshot as any)[String(s.id)]) || {};
                            const skill1 = typeof v.skill1 === 'number' ? clamp(Number(v.skill1), 1, MAX_PART) : toNumOrEmpty(v.skill1);
                            const skill2 = typeof v.skill2 === 'number' ? clamp(Number(v.skill2), 1, MAX_PART) : toNumOrEmpty(v.skill2);
                            const att1 = typeof v.att1 === 'number' ? clamp(Number(v.att1), 1, MAX_PART) : toNumOrEmpty(v.att1);
                            const att2 = typeof v.att2 === 'number' ? clamp(Number(v.att2), 1, MAX_PART) : toNumOrEmpty(v.att2);

                            const total = skill1 !== '' && skill2 !== '' && att1 !== '' && att2 !== '' ? clamp((skill1 as number) + (skill2 as number) + (att1 as number) + (att2 as number), 0, MAX_TOTAL) : '';
                            const co1 = skill1 !== '' && att1 !== '' ? clamp((skill1 as number) + (att1 as number), 0, MAX_CO) : '';
                            const co2 = skill2 !== '' && att2 !== '' ? clamp((skill2 as number) + (att2 as number), 0, MAX_CO) : '';

                            const btlMaxByIndex = [0, 0, 0, 0, 0, 0];
                            for (const p of parts) {
                              const bv = (viewPartBtl as any)[p.key];
                              if (bv === 1 || bv === 2 || bv === 3 || bv === 4 || bv === 5 || bv === 6) {
                                btlMaxByIndex[bv - 1] += p.max;
                              }
                            }
                            const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                            const btlShare = typeof total === 'number' && visibleIndicesZeroBased.length ? round1((total as number) / visibleIndicesZeroBased.length) : '';
                            const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
                              if (btlShare === '') return '';
                              if (!visibleIndicesZeroBased.includes(idx)) return '';
                              if (max > 0) return clamp(btlShare as number, 0, max);
                              return round1(btlShare as number);
                            });

                            return (
                              <tr key={`pv_${s.id}`}>
                                <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42, paddingLeft: 2, paddingRight: 2 }}>{i + 1}</td>
                                <td style={cellTd}>{shortenRegisterNo(s.reg_no)}</td>
                                <td style={cellTd}>{s.name || '—'}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{skill1}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{skill2}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{att1}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{att2}</td>
                                <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{total}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{co1 === '' ? '' : <span className="obe-pct-badge">{pct(co1 as number, MAX_CO)}</span>}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{co2 === '' ? '' : <span className="obe-pct-badge">{pct(co2 as number, MAX_CO)}</span>}</td>
                                {visibleBtlIndices.map((n) => {
                                  const idx = n - 1;
                                  const mark = btlMarksByIndex[idx];
                                  const max = btlMaxByIndex[idx] ?? 0;
                                  return (
                                    <React.Fragment key={`pv_btl_cells_${s.id}_${n}`}>
                                      <td style={{ ...cellTd, textAlign: 'center' }}>{mark}</td>
                                      <td style={{ ...cellTd, textAlign: 'center' }}>{mark === '' ? '' : <span className="obe-pct-badge">{pct(Number(mark), max)}</span>}</td>
                                    </React.Fragment>
                                  );
                                })}
                              </tr>
                            );
                          })
                        ) : (
                          Object.keys((publishedViewSnapshot as any) || {}).map((k, i) => {
                            const v = (publishedViewSnapshot as any)[k] || {};
                            const skill1 = typeof v.skill1 === 'number' ? clamp(Number(v.skill1), 1, MAX_PART) : toNumOrEmpty(v.skill1);
                            const skill2 = typeof v.skill2 === 'number' ? clamp(Number(v.skill2), 1, MAX_PART) : toNumOrEmpty(v.skill2);
                            const att1 = typeof v.att1 === 'number' ? clamp(Number(v.att1), 1, MAX_PART) : toNumOrEmpty(v.att1);
                            const att2 = typeof v.att2 === 'number' ? clamp(Number(v.att2), 1, MAX_PART) : toNumOrEmpty(v.att2);

                            const total = skill1 !== '' && skill2 !== '' && att1 !== '' && att2 !== '' ? clamp((skill1 as number) + (skill2 as number) + (att1 as number) + (att2 as number), 0, MAX_TOTAL) : '';
                            const co1 = skill1 !== '' && att1 !== '' ? clamp((skill1 as number) + (att1 as number), 0, MAX_CO) : '';
                            const co2 = skill2 !== '' && att2 !== '' ? clamp((skill2 as number) + (att2 as number), 0, MAX_CO) : '';

                            const btlMaxByIndex = [0, 0, 0, 0, 0, 0];
                            for (const p of parts) {
                              const bv = (viewPartBtl as any)[p.key];
                              if (bv === 1 || bv === 2 || bv === 3 || bv === 4 || bv === 5 || bv === 6) {
                                btlMaxByIndex[bv - 1] += p.max;
                              }
                            }
                            const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                            const btlShare = typeof total === 'number' && visibleIndicesZeroBased.length ? round1((total as number) / visibleIndicesZeroBased.length) : '';
                            const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
                              if (btlShare === '') return '';
                              if (!visibleIndicesZeroBased.includes(idx)) return '';
                              if (max > 0) return clamp(btlShare as number, 0, max);
                              return round1(btlShare as number);
                            });

                            return (
                              <tr key={`pv_${k}`}>
                                <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42, paddingLeft: 2, paddingRight: 2 }}>{i + 1}</td>
                                <td style={cellTd}>{shortenRegisterNo(String(v.reg_no ?? k))}</td>
                                <td style={cellTd}>{v.name || '—'}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{skill1}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{skill2}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{att1}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{att2}</td>
                                <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{total}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{co1 === '' ? '' : <span className="obe-pct-badge">{pct(co1 as number, MAX_CO)}</span>}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{co2 === '' ? '' : <span className="obe-pct-badge">{pct(co2 as number, MAX_CO)}</span>}</td>
                                {visibleBtlIndices.map((n) => {
                                  const idx = n - 1;
                                  const mark = btlMarksByIndex[idx];
                                  const max = btlMaxByIndex[idx] ?? 0;
                                  return (
                                    <React.Fragment key={`pv_btl_cells_${k}_${n}`}>
                                      <td style={{ ...cellTd, textAlign: 'center' }}>{mark}</td>
                                      <td style={{ ...cellTd, textAlign: 'center' }}>{mark === '' ? '' : <span className="obe-pct-badge">{pct(Number(mark), max)}</span>}</td>
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
                ) : publishedViewLoading ? null : (
                  <div style={{ color: '#6b7280' }}>No published marks found.</div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="obe-btn" onClick={() => setInlineViewOnly(false)}>
                    Close
                  </button>
                </div>
              </div>
            ) : 
              <div className="obe-table-wrapper" style={{ position: 'relative' }}>
              <table className="obe-table" style={{ minWidth: 1200 }}>
                <thead>
                  <tr>
                    <th style={cellTh} colSpan={totalTableCols}>
                      {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {assessmentLabel.toUpperCase()}
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...cellTh, width: 42, minWidth: 42 }} rowSpan={3}>
                      S.No
                    </th>
                    <th style={cellTh} rowSpan={3}>
                      Register No.
                    </th>
                    <th style={cellTh} rowSpan={3}>
                      Name of the Students
                    </th>
                    <th style={cellTh} colSpan={2}>
                      Skill
                    </th>
                    <th style={cellTh} colSpan={2}>
                      Attitude
                    </th>
                    <th style={cellTh} rowSpan={3}>
                      Total
                    </th>
                    <th style={cellTh} colSpan={4}>
                      CIA 1
                    </th>
                    {visibleBtlIndices.length ? (
                      <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>
                        BTL
                      </th>
                    ) : null}
                  </tr>
                  <tr>
                    <th style={cellTh}>1</th>
                    <th style={cellTh}>2</th>
                    <th style={cellTh}>1</th>
                    <th style={cellTh}>2</th>
                    <th style={cellTh} colSpan={2}>
                      CO-{CO_A}
                    </th>
                    <th style={cellTh} colSpan={2}>
                      CO-{CO_B}
                    </th>
                    {visibleBtlIndices.map((n) => (
                      <th key={`btlhead-${n}`} style={cellTh} colSpan={2}>
                        BTL-{n}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th style={cellTh} />
                    <th style={cellTh} />
                    <th style={cellTh} />
                    <th style={cellTh} />
                    <th style={cellTh}>Mark</th>
                    <th style={cellTh}>%</th>
                    <th style={cellTh}>Mark</th>
                    <th style={cellTh}>%</th>
                    {visibleBtlIndices.map((n) => (
                      <React.Fragment key={`btl-sub-${n}`}>
                        <th style={cellTh}>Mark</th>
                        <th style={cellTh}>%</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>
                      {/* previously rendered lastPartKey value here which caused misalignment; keep this cell empty */}
                    </td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} />
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>BTL</td>
                    {parts.map((p) => (
                      <td key={`btl-select-${p.key}`} style={{ ...cellTd, textAlign: 'center' }}>
                        {(() => {
                          const v = (partBtl as any)[p.key] ?? '';
                          const display = v === '' ? '-' : String(v);
                          return (
                            <div style={{ position: 'relative', minWidth: 44 }}>
                              <div
                                style={{
                                  width: '100%',
                                  fontSize: 12,
                                  padding: '2px 4px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: 8,
                                  background: '#fff',
                                  textAlign: 'center',
                                  userSelect: 'none',
                                }}
                                title={`BTL: ${display}`}
                              >
                                {display}
                              </div>
                              <select
                                aria-label={`BTL for ${p.label}`}
                                value={v}
                                onChange={(e) => {
                                  if (globalLocked) return;
                                  const confirmed = sheet.markManagerSnapshot != null;
                                  if (markManagerLocked && confirmed) return;
                                  if (publishedEditLocked) return;
                                  setPartBtl((prev) => ({
                                    ...(prev || {}),
                                    [p.key]: e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6),
                                  }));
                                }}
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
                                <option value="">-</option>
                                {[1, 2, 3, 4, 5, 6].map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })()}
                      </td>
                    ))}
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} />
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} colSpan={4} />
                    {visibleBtlIndices.map((n) => (
                      <React.Fragment key={`btl-pad-${n}`}>
                        <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} />
                        <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} />
                      </React.Fragment>
                    ))}
                  </tr>

                  <tr>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} colSpan={3}>
                      Name / Max Marks
                    </td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_PART}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_PART}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_PART}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_PART}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_TOTAL}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_CO}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_CO}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                  </tr>

                  {students.map((s, i) => {
                    const row = sheet.rowsByStudentId[String(s.id)] || ({ studentId: s.id, skill1: '', skill2: '', att1: '', att2: '' } as F1RowState);

                    const skill1 = typeof row.skill1 === 'number' ? clamp(Number(row.skill1), 1, MAX_PART) : '';
                    const skill2 = typeof row.skill2 === 'number' ? clamp(Number(row.skill2), 1, MAX_PART) : '';
                    const att1 = typeof row.att1 === 'number' ? clamp(Number(row.att1), 1, MAX_PART) : '';
                    const att2 = typeof row.att2 === 'number' ? clamp(Number(row.att2), 1, MAX_PART) : '';

                    const total = skill1 !== '' && skill2 !== '' && att1 !== '' && att2 !== '' ? clamp((skill1 as number) + (skill2 as number) + (att1 as number) + (att2 as number), 0, MAX_TOTAL) : '';
                    const co1 = skill1 !== '' && att1 !== '' ? clamp((skill1 as number) + (att1 as number), 0, MAX_CO) : '';
                    const co2 = skill2 !== '' && att2 !== '' ? clamp((skill2 as number) + (att2 as number), 0, MAX_CO) : '';

                    const btlMaxByIndex = [0, 0, 0, 0, 0, 0];
                    for (const p of parts) {
                      const v = (partBtl as any)[p.key];
                      if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) {
                        btlMaxByIndex[v - 1] += p.max;
                      }
                    }
                    const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                    const btlShare = typeof total === 'number' && visibleIndicesZeroBased.length ? round1((total as number) / visibleIndicesZeroBased.length) : '';
                    const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
                      if (btlShare === '') return '';
                      if (!visibleIndicesZeroBased.includes(idx)) return '';
                      if (max > 0) return clamp(btlShare as number, 0, max);
                      return round1(btlShare as number);
                    });

                    const disabledInputs = visibleBtlIndices.length === 0;
                    const lockedInputs = disabledInputs || tableBlocked || publishedEditLocked || globalLocked;

                    return (
                      <tr key={s.id}>
                        <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42, paddingLeft: 2, paddingRight: 2 }}>{i + 1}</td>
                        <td style={cellTd}>{shortenRegisterNo(s.reg_no)}</td>
                        <td style={cellTd}>{s.name || '—'}</td>

                        <td style={cellTd}>
                          <input
                            style={inputStyle}
                            type="number"
                            min={1}
                            max={MAX_PART}
                            value={row.skill1 === '' ? '' : row.skill1}
                            disabled={lockedInputs}
                            onChange={(e) => updateMark(s.id, { skill1: e.target.value === '' ? '' : Number(e.target.value) })}
                          />
                        </td>
                        <td style={cellTd}>
                          <input
                            style={inputStyle}
                            type="number"
                            min={1}
                            max={MAX_PART}
                            value={row.skill2 === '' ? '' : row.skill2}
                            disabled={lockedInputs}
                            onChange={(e) => updateMark(s.id, { skill2: e.target.value === '' ? '' : Number(e.target.value) })}
                          />
                        </td>
                        <td style={cellTd}>
                          <input
                            style={inputStyle}
                            type="number"
                            min={1}
                            max={MAX_PART}
                            value={row.att1 === '' ? '' : row.att1}
                            disabled={lockedInputs}
                            onChange={(e) => updateMark(s.id, { att1: e.target.value === '' ? '' : Number(e.target.value) })}
                          />
                        </td>
                        <td style={cellTd}>
                          <input
                            style={inputStyle}
                            type="number"
                            min={1}
                            max={MAX_PART}
                            value={row.att2 === '' ? '' : row.att2}
                            disabled={lockedInputs}
                            onChange={(e) => updateMark(s.id, { att2: e.target.value === '' ? '' : Number(e.target.value) })}
                          />
                        </td>

                        <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{total}</td>

                        <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>
                          {co1 === '' ? '' : <span className="obe-pct-badge">{pct(co1 as number, MAX_CO)}</span>}
                        </td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>
                          {co2 === '' ? '' : <span className="obe-pct-badge">{pct(co2 as number, MAX_CO)}</span>}
                        </td>
                        {visibleBtlIndices.map((n) => {
                          const idx = n - 1;
                          const mark = btlMarksByIndex[idx];
                          const max = btlMaxByIndex[idx] ?? 0;
                          return (
                            <React.Fragment key={`btl-cells-${n}`}>
                              <td style={{ ...cellTd, textAlign: 'center' }}>{mark}</td>
                              <td style={{ ...cellTd, textAlign: 'center' }}>{mark === '' ? '' : <span className="obe-pct-badge">{pct(Number(mark), max)}</span>}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {visibleBtlIndices.length === 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255,255,255,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 10,
                    padding: 20,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 700 }}>BTL values not selected</div>
                  <div style={{ color: '#6b7280' }}>Assign BTL values in the BTL row below Skill/Attitude to enable entry.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => {
                        if (globalLocked) return;
                        const confirmed = sheet.markManagerSnapshot != null;
                        if (markManagerLocked && confirmed) return;
                        if (publishedEditLocked) return;
                        setPartBtl({ skill1: 3, skill2: 4, att1: 3, att2: 4 });
                      }}
                      style={{ padding: '6px 10px' }}
                    >
                      Quick: BTL-3/4
                    </button>
                  </div>
                </div>
              )}

              {tableBlocked && !globalLocked ? (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: isPublished ? 'rgba(240,253,244,0.55)' : 'rgba(239,246,255,0.65)',
                      border: `1px solid ${isPublished ? 'rgba(22,163,74,0.25)' : 'rgba(59,130,246,0.25)'}`,
                      borderRadius: 6,
                      pointerEvents: 'none',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: 16,
                      transform: 'translateX(-50%)',
                      zIndex: 40,
                      width: 280,
                      background: 'rgba(255,255,255,0.98)',
                      border: '1px solid #e5e7eb',
                      padding: 12,
                      borderRadius: 12,
                      boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      alignItems: 'stretch',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 950, color: '#111827' }}>{isPublished ? 'Published — Locked' : 'Table Locked'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        {isPublished ? 'Marks are published. Use View or Request Edit to ask IQAC for access.' : 'Confirm the Mark Manager to unlock the student list.'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {!isPublished ? (
                        <>
                          <button className="obe-btn obe-btn-success" onClick={() => setMarkManagerModal({ mode: 'confirm' })} disabled={!subjectId || markManagerBusy}>
                            Save Mark Manager
                          </button>
                          <button className="obe-btn" onClick={() => requestMarkManagerEdit()} disabled={markManagerBusy}>
                            Request Access
                          </button>
                        </>
                          ) : (
                        <>
                          <button
                            className="obe-btn"
                            onClick={() => {
                              setInlineViewOnly(true);
                              setPublishedViewSnapshot(null);
                              try {
                                refreshPublishedSnapshot(false);
                              } catch {
                                /* ignore */
                              }
                            }}
                          >
                            View
                          </button>
                          <button className="obe-btn obe-btn-success" onClick={() => requestMarkEntryEdit()}>
                            Request Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, background: '#fff' }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{isPublished ? 'Published — Locked' : 'Table Locked'}</div>
              <div style={{ color: '#6b7280', marginTop: 8 }}>{isPublished ? 'Marks published. Use View or Request Edit to ask IQAC for access.' : 'Confirm the Mark Manager to unlock the student list.'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                {!isPublished ? (
                  <>
                    <button className="obe-btn obe-btn-success" onClick={() => setMarkManagerModal({ mode: 'confirm' })} disabled={!subjectId || markManagerBusy}>
                      Save Mark Manager
                    </button>
                    <button className="obe-btn" onClick={() => requestMarkManagerEdit()} disabled={markManagerBusy}>
                      Request Access
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="obe-btn"
                      onClick={() => {
                        setInlineViewOnly(true);
                        setPublishedViewSnapshot(null);
                        try {
                          refreshPublishedSnapshot(false);
                        } catch {}
                      }}
                    >
                      View
                    </button>
                    <button className="obe-btn obe-btn-success" onClick={() => requestMarkEntryEdit()}>
                      Request Edit
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </PublishLockOverlay>
      )}

      {markManagerModal && !skipMarkManager ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 9999 }}
          onClick={() => {
            if (markManagerBusy) return;
            setMarkManagerModal(null);
          }}
        >
          <div style={{ width: 'min(640px,96vw)', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 14 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>{markManagerModal.mode === 'confirm' ? `Confirmation - ${assessmentLabel}` : `Request Edit - ${assessmentLabel}`}</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{String(subjectId || '')}</div>
            </div>

            {markManagerModal.mode === 'confirm' ? (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Confirm the selected BTL settings. After confirming, Mark Manager will be locked and the table will be editable.</div>
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
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>Skill/Attitude max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{MAX_PART}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>Total max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{MAX_TOTAL}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-{CO_A} max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{MAX_CO}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-{CO_B} max</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{MAX_CO}</td>
                      </tr>
                      {parts.map((p) => (
                        <tr key={`mm_${p.key}`}>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>{p.label} BTL</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{(partBtl as any)[p.key] === '' ? '-' : String((partBtl as any)[p.key])}</td>
                        </tr>
                      ))}
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
      ) : null}

      {viewMarksModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60, overflowY: 'auto' }}
          onClick={() => setViewMarksModalOpen(false)}
        >
          <div style={{ width: 'min(1100px, 96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 14 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, position: 'relative' }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>View Only</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', marginRight: 36 }}>{assessmentLabel} • {String(subjectId || '')}</div>
              <button className="obe-btn" onClick={() => setViewMarksModalOpen(false)} style={{ position: 'absolute', right: 0, top: 0 }}>
                Close
              </button>
            </div>

            {publishedViewLoading ? <div style={{ color: '#6b7280' }}>Loading published marks…</div> : null}
            {publishedViewError ? <div style={{ color: '#991b1b', fontSize: 12, marginBottom: 8 }}>{publishedViewError}</div> : null}

            {(publishedViewSnapshot && Object.keys(publishedViewSnapshot).length) || students.length ? (
              <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                <table className="obe-table" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={cellTh} colSpan={totalTableCols}>
                        {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {assessmentLabel.toUpperCase()} (PUBLISHED)
                      </th>
                    </tr>
                    <tr>
                      <th style={{ ...cellTh, width: 42, minWidth: 42 }}>S.No</th>
                      <th style={cellTh}>Register No.</th>
                      <th style={cellTh}>Name of the Students</th>
                      <th style={cellTh}>Skill 1</th>
                      <th style={cellTh}>Skill 2</th>
                      <th style={cellTh}>Att 1</th>
                      <th style={cellTh}>Att 2</th>
                      <th style={cellTh}>Total</th>
                      <th style={cellTh} colSpan={2}>CO-{CO_A}</th>
                      <th style={cellTh} colSpan={2}>CO-{CO_B}</th>
                      {visibleBtlIndices.map((n) => (
                        <th key={`pv_btl_${n}`} style={cellTh} colSpan={2}>
                          BTL-{n}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th style={cellTh} />
                      <th style={cellTh} />
                      <th style={cellTh} />
                      <th style={cellTh} />
                      <th style={cellTh} />
                      <th style={cellTh} />
                      <th style={cellTh} />
                      <th style={cellTh} />
                      <th style={cellTh}>Mark</th>
                      <th style={cellTh}>%</th>
                      <th style={cellTh}>Mark</th>
                      <th style={cellTh}>%</th>
                      {visibleBtlIndices.map((n) => (
                        <React.Fragment key={`pv_btl_sub_${n}`}>
                          <th style={cellTh}>Mark</th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.length ? (
                      students.map((s, i) => {
                        const v = (publishedViewSnapshot && (publishedViewSnapshot as any)[String(s.id)]) || {};
                        const skill1 = typeof v.skill1 === 'number' ? clamp(Number(v.skill1), 1, MAX_PART) : toNumOrEmpty(v.skill1);
                        const skill2 = typeof v.skill2 === 'number' ? clamp(Number(v.skill2), 1, MAX_PART) : toNumOrEmpty(v.skill2);
                        const att1 = typeof v.att1 === 'number' ? clamp(Number(v.att1), 1, MAX_PART) : toNumOrEmpty(v.att1);
                        const att2 = typeof v.att2 === 'number' ? clamp(Number(v.att2), 1, MAX_PART) : toNumOrEmpty(v.att2);

                        const total = skill1 !== '' && skill2 !== '' && att1 !== '' && att2 !== '' ? clamp((skill1 as number) + (skill2 as number) + (att1 as number) + (att2 as number), 0, MAX_TOTAL) : '';
                        const co1 = skill1 !== '' && att1 !== '' ? clamp((skill1 as number) + (att1 as number), 0, MAX_CO) : '';
                        const co2 = skill2 !== '' && att2 !== '' ? clamp((skill2 as number) + (att2 as number), 0, MAX_CO) : '';

                        const btlMaxByIndex = [0, 0, 0, 0, 0, 0];
                        for (const p of parts) {
                          const bv = (viewPartBtl as any)[p.key];
                          if (bv === 1 || bv === 2 || bv === 3 || bv === 4 || bv === 5 || bv === 6) {
                            btlMaxByIndex[bv - 1] += p.max;
                          }
                        }
                        const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                        const btlShare = typeof total === 'number' && visibleIndicesZeroBased.length ? round1((total as number) / visibleIndicesZeroBased.length) : '';
                        const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
                          if (btlShare === '') return '';
                          if (!visibleIndicesZeroBased.includes(idx)) return '';
                          if (max > 0) return clamp(btlShare as number, 0, max);
                          return round1(btlShare as number);
                        });

                        return (
                          <tr key={`pv_${s.id}`}>
                            <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42, paddingLeft: 2, paddingRight: 2 }}>{i + 1}</td>
                            <td style={cellTd}>{shortenRegisterNo(s.reg_no)}</td>
                            <td style={cellTd}>{s.name || '—'}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{skill1}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{skill2}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{att1}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{att2}</td>
                            <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{total}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{co1 === '' ? '' : <span className="obe-pct-badge">{pct(co1 as number, MAX_CO)}</span>}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{co2 === '' ? '' : <span className="obe-pct-badge">{pct(co2 as number, MAX_CO)}</span>}</td>
                            {visibleBtlIndices.map((n) => {
                              const idx = n - 1;
                              const mark = btlMarksByIndex[idx];
                              const max = btlMaxByIndex[idx] ?? 0;
                              return (
                                <React.Fragment key={`pv_btl_cells_${s.id}_${n}`}>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{mark}</td>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{mark === '' ? '' : <span className="obe-pct-badge">{pct(Number(mark), max)}</span>}</td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })
                    ) : (
                      Object.keys((publishedViewSnapshot as any) || {}).map((k, i) => {
                        const v = (publishedViewSnapshot as any)[k] || {};
                        const skill1 = typeof v.skill1 === 'number' ? clamp(Number(v.skill1), 1, MAX_PART) : toNumOrEmpty(v.skill1);
                        const skill2 = typeof v.skill2 === 'number' ? clamp(Number(v.skill2), 1, MAX_PART) : toNumOrEmpty(v.skill2);
                        const att1 = typeof v.att1 === 'number' ? clamp(Number(v.att1), 1, MAX_PART) : toNumOrEmpty(v.att1);
                        const att2 = typeof v.att2 === 'number' ? clamp(Number(v.att2), 1, MAX_PART) : toNumOrEmpty(v.att2);

                        const total = skill1 !== '' && skill2 !== '' && att1 !== '' && att2 !== '' ? clamp((skill1 as number) + (skill2 as number) + (att1 as number) + (att2 as number), 0, MAX_TOTAL) : '';
                        const co1 = skill1 !== '' && att1 !== '' ? clamp((skill1 as number) + (att1 as number), 0, MAX_CO) : '';
                        const co2 = skill2 !== '' && att2 !== '' ? clamp((skill2 as number) + (att2 as number), 0, MAX_CO) : '';

                        const btlMaxByIndex = [0, 0, 0, 0, 0, 0];
                        for (const p of parts) {
                          const bv = (viewPartBtl as any)[p.key];
                          if (bv === 1 || bv === 2 || bv === 3 || bv === 4 || bv === 5 || bv === 6) {
                            btlMaxByIndex[bv - 1] += p.max;
                          }
                        }
                        const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                        const btlShare = typeof total === 'number' && visibleIndicesZeroBased.length ? round1((total as number) / visibleIndicesZeroBased.length) : '';
                        const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
                          if (btlShare === '') return '';
                          if (!visibleIndicesZeroBased.includes(idx)) return '';
                          if (max > 0) return clamp(btlShare as number, 0, max);
                          return round1(btlShare as number);
                        });

                        return (
                          <tr key={`pv_${k}`}>
                            <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42, paddingLeft: 2, paddingRight: 2 }}>{i + 1}</td>
                            <td style={cellTd}>{shortenRegisterNo(String(v.reg_no ?? k))}</td>
                            <td style={cellTd}>{v.name || '—'}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{skill1}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{skill2}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{att1}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{att2}</td>
                            <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{total}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{co1 === '' ? '' : <span className="obe-pct-badge">{pct(co1 as number, MAX_CO)}</span>}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                            <td style={{ ...cellTd, textAlign: 'center' }}>{co2 === '' ? '' : <span className="obe-pct-badge">{pct(co2 as number, MAX_CO)}</span>}</td>
                            {visibleBtlIndices.map((n) => {
                              const idx = n - 1;
                              const mark = btlMarksByIndex[idx];
                              const max = btlMaxByIndex[idx] ?? 0;
                              return (
                                <React.Fragment key={`pv_btl_cells_${k}_${n}`}>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{mark}</td>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{mark === '' ? '' : <span className="obe-pct-badge">{pct(Number(mark), max)}</span>}</td>
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
            ) : publishedViewLoading ? null : (
              <div style={{ color: '#6b7280' }}>No published marks found.</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="obe-btn" onClick={() => setViewMarksModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {publishedEditModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}
          onClick={() => {
            if (editRequestBusy) return;
            setPublishedEditModalOpen(false);
          }}
        >
          <div style={{ width: 'min(560px, 96vw)', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 14 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>Edit Request</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{assessmentLabel} • {String(subjectId || '')}</div>
            </div>

            <div style={{ fontSize: 13, color: '#374151', marginBottom: 10, lineHeight: 1.35 }}>
              This will send an edit request to IQAC for published marks. Once approved, the entry will open for editing until the approval expires.
            </div>

            <textarea
              value={editRequestReason}
              onChange={(e) => setEditRequestReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={4}
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="obe-btn" disabled={editRequestBusy} onClick={() => setPublishedEditModalOpen(false)}>
                Cancel
              </button>
              <button className="obe-btn obe-btn-success" disabled={editRequestBusy || !subjectId} onClick={requestMarkEntryEdit}>
                {editRequestBusy ? 'Requesting…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {key && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
          Saved key: <span style={{ fontFamily: 'monospace' }}>{key}</span>
        </div>
      )}
    </div>
  );
}
