import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  confirmMarkManagerLock,
  createEditRequest,
  createPublishRequest,
  fetchCiaMarks,
  fetchDraft,
  fetchPublishedCia1Sheet,
  fetchPublishedCiaSheet,
  formatApiErrorMessage,
  formatEditRequestSentMessage,
  publishCiaSheet,
  saveDraft,
  fetchIqacQpPattern,
} from '../services/obe';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import fetchWithAuth from '../services/fetchAuth';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchMyTeachingAssignments } from '../services/obe';
import { formatRemaining, usePublishWindow } from '../hooks/usePublishWindow';
import { useEditWindow } from '../hooks/useEditWindow';
import { useMarkTableLock } from '../hooks/useMarkTableLock';
import { ensureMobileVerified } from '../services/auth';
import { useEditRequestPending } from '../hooks/useEditRequestPending';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import PublishLockOverlay from './PublishLockOverlay';
import AssessmentContainer from './containers/AssessmentContainer';
import { ModalPortal } from './ModalPortal';
import { normalizeClassType } from '../constants/classTypes';
import * as XLSX from 'xlsx';
import { downloadTotalsWithPrompt } from '../utils/assessmentTotalsDownload';

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type AssessmentKey = 'cia1' | 'cia2';

type AbsenceKind = 'AL' | 'ML' | 'SKL';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  assessmentKey?: AssessmentKey;
  classType?: string | null;
  questionPaperType?: string | null;
};

type CoValue = 1 | 2 | 3 | 4 | 5 | '1&2' | '3&4' | 'both';

type QuestionDef = {
  key: string;
  label: string;
  max: number;
  // 1&2 means split 50/50 into both COs (matches Excel pattern: +O/2 for CO-1 and CO-2)
  co: CoValue;
  btl: 1 | 2 | 3 | 4 | 5 | 6;
};

// Defaults (overridden by OBE Master -> Assessment Headers)
const DEFAULT_QUESTIONS: QuestionDef[] = [
  { key: 'q1', label: 'Q1', max: 2, co: 1, btl: 1 },
  { key: 'q2', label: 'Q2', max: 2, co: 1, btl: 3 },
  { key: 'q3', label: 'Q3', max: 2, co: 1, btl: 4 },
  { key: 'q4', label: 'Q4', max: 2, co: 2, btl: 1 },
  { key: 'q5', label: 'Q5', max: 2, co: 2, btl: 1 },
  { key: 'q6', label: 'Q6', max: 2, co: 2, btl: 2 },
  { key: 'q7', label: 'Q7', max: 16, co: 1, btl: 2 },
  { key: 'q8', label: 'Q8', max: 16, co: 2, btl: 3 },
  // Common CIA1 template uses last question split equally between CO-1 and CO-2.
  { key: 'q9', label: 'Q9', max: 16, co: '1&2', btl: 5 },
];

function parseCo(raw: unknown): CoValue {
  if (raw === 'both') return 'both';
  if (raw === '1&2' || raw === '3&4') return raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s === '1&2' || s === '1,2' || s === '1/2' || s === '2/1') return '1&2';
    if (s === '3&4' || s === '3,4' || s === '3/4' || s === '4/3') return '3&4';
    if (s === '5') return 5;
    if (s === '4') return 4;
    if (s === '3') return 3;
    if (s === '2') return 2;
    if (s === '1') return 1;
  }
  if (Array.isArray(raw)) {
    const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    if (nums.includes(3) && nums.includes(4)) return '3&4';
    if (nums.includes(1) && nums.includes(2)) return '1&2';
    if (nums.includes(4)) return 4;
    if (nums.includes(3)) return 3;
    if (nums.includes(2)) return 2;
    if (nums.includes(1)) return 1;
  }
  const n = Number(raw);
  if (n === 5) return 5;
  if (n === 4) return 4;
  if (n === 3) return 3;
  if (n === 2) return 2;
  if (n === 34) return '3&4';
  if (n === 12) return '1&2';
  return 1;
}

type CoPair = { a: 1 | 3; b: 2 | 4 };

function coPairForAssessment(assessmentKey: AssessmentKey): CoPair {
  return assessmentKey === 'cia2' ? { a: 3, b: 4 } : { a: 1, b: 2 };
}

function isSplitCo(co: CoValue): boolean {
  return co === 'both' || co === '1&2' || co === '3&4';
}

function coWeights(co: CoValue, pair: CoPair): { a: number; b: number } {
  if (isSplitCo(co)) return { a: 0.5, b: 0.5 };

  // For CIA2, allow legacy configs that still use 1/2 tagging.
  const isLegacyCia2 = pair.a === 3;
  const mapsToA = co === pair.a || (isLegacyCia2 && co === 1);
  const mapsToB = co === pair.b || (isLegacyCia2 && co === 2);
  if (mapsToA) return { a: 1, b: 0 };
  if (mapsToB) return { a: 0, b: 1 };

  // Any other CO (e.g., CO-5) is not represented in CIA's 2-CO attainment panel.
  // Treat as "no contribution" rather than mis-attributing it.
  return { a: 0, b: 0 };
}

function effectiveCoWeightsForQuestion(questions: QuestionDef[], idx: number, pair: CoPair): { a: number; b: number } {
  const q = questions[idx];
  if (!q) return { a: 0, b: 0 };
  // Primary: explicit split configured.
  if (isSplitCo(q.co)) return { a: 0.5, b: 0.5 };

  // Fallback for legacy configs: if no split question exists, treat the last question
  // (typically the "O" column in the Excel template, often Q9) as split 50/50.
  const hasAnySplit = questions.some((x) => isSplitCo(x.co));
  const isLast = idx === questions.length - 1;
  const looksLikeQ9 = String(q.key || '').toLowerCase() === 'q9' || String(q.label || '').toLowerCase().includes('q9');
  if (!hasAnySplit && isLast && looksLikeQ9) return { a: 0.5, b: 0.5 };

  return coWeights(q.co, pair);
}

type Cia1RowState = {
  studentId: number;
  absent: boolean;
  absentKind?: AbsenceKind;
  reg_no: string;
  // question key -> mark
  q: Record<string, number | ''>;
};

type Cia1Sheet = {
  termLabel: string;
  batchLabel: string;
  // question key -> selected BTL (1..6) or '' (unset)
  questionBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>;
  rowsByStudentId: Record<string, Cia1RowState>;
  // Mark Manager lock state
  markManagerLocked?: boolean;
  markManagerSnapshot?: string | null;
  markManagerApprovalUntil?: string | null;
};

type Cia1DraftPayload = {
  termLabel: string;
  batchLabel: string;
  questionBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>;
  rowsByStudentId: Record<string, Cia1RowState>;
  markManagerLocked?: boolean;
  markManagerSnapshot?: string | null;
  markManagerApprovalUntil?: string | null;
};

function defaultQuestionBtl(questions: QuestionDef[]): Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''> {
  return Object.fromEntries((questions || []).map((q) => [q.key, q.btl])) as Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(mark: number, max: number) {
  if (!max) return '-';
  const p = (mark / max) * 100;
  if (!Number.isFinite(p)) return '-';
  const s = p.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

function sheetKey(assessmentKey: AssessmentKey, subjectId: string) {
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

export default function Cia1Entry({ subjectId, teachingAssignmentId, assessmentKey: assessmentKeyProp, classType, questionPaperType }: Props) {
  const assessmentKey: AssessmentKey = assessmentKeyProp || 'cia1';
  const assessmentLabel = assessmentKey === 'cia2' ? 'CIA 2' : 'CIA 1';
  const coPair = useMemo(() => coPairForAssessment(assessmentKey), [assessmentKey]);
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [masterCfgWarning, setMasterCfgWarning] = useState<string | null>(null);
  const [iqacPattern, setIqacPattern] = useState<{ marks: number[]; cos?: Array<number | string> } | null>(null);
  const [subjectPayload, setSubjectPayload] = useState<any>(null);

  const classTypeKey = useMemo(() => {
    const v = String(normalizeClassType(classType) || '').trim().toUpperCase();
    if (!v) return '';
    // IQAC QP patterns are keyed by coarse class_type: THEORY/TCPR/TCPL/LAB.
    if (v === 'THEORY') return 'THEORY';
    return v;
  }, [classType]);

  const qpTypeKey = useMemo(() => {
    const s = String(questionPaperType ?? '')
      .trim()
      .toUpperCase();
    if (s === 'QP2') return 'QP2';
    if (s === 'QP1') return 'QP1';
    return '';
  }, [questionPaperType]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!classTypeKey) {
        setIqacPattern(null);
        return;
      }

      // Only THEORY uses QP1/QP2. For TCPR/TCPL/LAB, IQAC saves patterns with question_paper_type = null.
      const qpForApi = classTypeKey === 'THEORY' ? (qpTypeKey ? qpTypeKey : null) : null;

      const examForApi = assessmentKey === 'cia2' ? 'CIA2' : 'CIA1';
      let res: any = null;
      let p: any[] = [];

      // Prefer CIA1/CIA2-specific config.
      try {
        res = await fetchIqacQpPattern({
          class_type: classTypeKey,
          question_paper_type: qpForApi,
          exam: examForApi as any,
        });
        p = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
      } catch {
        // ignore and try legacy CIA next
      }

      // Fallback to legacy shared CIA config if specific isn't configured or not supported by backend.
      if (!p.length) {
        try {
          res = await fetchIqacQpPattern({
            class_type: classTypeKey,
            question_paper_type: qpForApi,
            exam: 'CIA' as any,
          });
          p = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
        } catch {
          // ignore
        }
      }

      if (!alive) return;
      setIqacPattern(p.length ? (res.pattern as any) : null);
    };
    run();
    return () => {
      alive = false;
    };
  }, [classTypeKey, qpTypeKey, assessmentKey]);

  const questions = useMemo<QuestionDef[]>(() => {
    const qs = (masterCfg as any)?.assessments?.[assessmentKey]?.questions ?? (masterCfg as any)?.assessments?.cia1?.questions;
    const baseFromMaster: QuestionDef[] = Array.isArray(qs) && qs.length
      ? qs
          .map((q: any) => ({
            key: String(q?.key || ''),
            label: String(q?.label || q?.key || ''),
            max: Number(q?.max || 0),
            co: parseCo(q?.co),
            btl: Math.min(6, Math.max(1, Number(q?.btl || 1))) as 1 | 2 | 3 | 4 | 5 | 6,
          }))
          .filter((q: any) => q.key)
      : DEFAULT_QUESTIONS;

    const marks = Array.isArray((iqacPattern as any)?.marks) ? (iqacPattern as any).marks : null;
    const cos = Array.isArray((iqacPattern as any)?.cos) ? (iqacPattern as any).cos : null;
    if (Array.isArray(marks) && marks.length) {
      return marks
        .map((max, idx) => {
          const fallback = baseFromMaster[idx];
          const coRaw = cos ? cos[idx] : undefined;
          return {
            key: `q${idx + 1}`,
            label: `Q${idx + 1}`,
            max: Number(max) || 0,
            co: (coRaw != null ? parseCo(coRaw) : (fallback?.co ?? (coPair.a as any))) as CoValue,
            btl: (fallback?.btl ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
          };
        })
        .filter((q) => Boolean(q.key));
    }

    return baseFromMaster;
  }, [masterCfg, assessmentKey, iqacPattern, coPair.a]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [serverTotals, setServerTotals] = useState<Record<number, number | null>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const draftLoadedRef = useRef(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [viewMarksModalOpen, setViewMarksModalOpen] = useState(false);
  const [publishedViewLoading, setPublishedViewLoading] = useState(false);
  const [publishedViewError, setPublishedViewError] = useState<string | null>(null);
  const [publishedViewSheet, setPublishedViewSheet] = useState<any | null>(null);
  const publishedViewTableRef = useRef<HTMLDivElement | null>(null);

  const [publishedEditModalOpen, setPublishedEditModalOpen] = useState(false);
  const [editRequestReason, setEditRequestReason] = useState('');
  const [editRequestBusy, setEditRequestBusy] = useState(false);
  const [editRequestMessage, setEditRequestMessage] = useState<string | null>(null);
  const [showAbsenteesOnly, setShowAbsenteesOnly] = useState(false);
  const [absenteesSnapshot, setAbsenteesSnapshot] = useState<number[] | null>(null);
  const [limitDialog, setLimitDialog] = useState<{ title: string; message: string } | null>(null);

  const {
    data: publishWindow,
    loading: publishWindowLoading,
    error: publishWindowError,
    remainingSeconds,
    publishAllowed,
    refresh: refreshPublishWindow,
  } = usePublishWindow({ assessment: assessmentKey, subjectCode: subjectId, teachingAssignmentId });

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

  const { data: markLock, refresh: refreshMarkLock } = useMarkTableLock({ assessment: assessmentKey as any, subjectCode: String(subjectId || ''), teachingAssignmentId, options: { poll: false } });
  const { data: markManagerEditWindow } = useEditWindow({ assessment: assessmentKey as any, subjectCode: String(subjectId || ''), scope: 'MARK_MANAGER', teachingAssignmentId, options: { poll: false } });
  const { data: markEntryEditWindow } = useEditWindow({ assessment: assessmentKey as any, subjectCode: String(subjectId || ''), scope: 'MARK_ENTRY', teachingAssignmentId, options: { poll: false } });

  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Cia1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    questionBtl: defaultQuestionBtl(DEFAULT_QUESTIONS),
    rowsByStudentId: {},
    markManagerLocked: false,
    markManagerSnapshot: null,
    markManagerApprovalUntil: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [markManagerModal, setMarkManagerModal] = useState<null | { mode: 'confirm' | 'request' }>(null);
  const [markManagerBusy, setMarkManagerBusy] = useState(false);
  const [markManagerError, setMarkManagerError] = useState<string | null>(null);
  const [mmSelectedQuestions, setMmSelectedQuestions] = useState<number[]>([]);
  const [mmSelectedMarks, setMmSelectedMarks] = useState<number[]>([]);
  const [mmSelectedBtls, setMmSelectedBtls] = useState<number[]>([]);
  const [publishConsumedApprovals, setPublishConsumedApprovals] = useState<null | {
    markEntryApprovalUntil: string | null;
    markManagerApprovalUntil: string | null;
  }>(null);

  useEffect(() => {
    setPublishConsumedApprovals(null);
    setEditRequestMessage(null);
  }, [subjectId]);

  const isPublished = Boolean(publishedAt) || Boolean(markLock?.exists && markLock?.is_published);
  const markManagerLocked = Boolean(sheet.markManagerLocked);
  const showNameList = Boolean(sheet.markManagerSnapshot != null);

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

  const entryOpen = !isPublished ? true : Boolean(markLock?.entry_open) || markEntryApprovedFresh || markManagerApprovedFresh;
  const publishedEditLocked = Boolean(isPublished && !entryOpen);
  const tableBlocked = Boolean(globalLocked || (isPublished ? !entryOpen : !markManagerLocked));

  const publishButtonIsRequestEdit = Boolean(isPublished && publishedEditLocked);

  const {
    pending: markEntryReqPending,
    pendingUntilMs: markEntryReqPendingUntilMs,
    setPendingUntilMs: setMarkEntryReqPendingUntilMs,
    refresh: refreshMarkEntryReqPending,
  } = useEditRequestPending({
    enabled: Boolean(publishButtonIsRequestEdit) && Boolean(subjectId),
    assessment: assessmentKey as any,
    subjectCode: subjectId ? String(subjectId) : null,
    scope: 'MARK_ENTRY',
    teachingAssignmentId,
  });

  useLockBodyScroll(Boolean(publishedEditModalOpen) || Boolean(viewMarksModalOpen) || Boolean(markManagerModal));

  function markManagerSnapshotOf(
    nextQuestionBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>,
    selections?: { questions?: number[]; marks?: number[]; btls?: number[] },
  ) {
    return JSON.stringify({
      assessmentKey,
      totalsMax,
      questions: (questions || []).map((q) => ({ key: q.key, label: q.label, max: q.max })),
      questionBtl: nextQuestionBtl,
      mark_manager: {
        questions: selections?.questions ?? [],
        marks: selections?.marks ?? [],
        btls: selections?.btls ?? [],
      },
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
        reason: `Edit request: Mark Manager changes for ${assessmentLabel} ${subjectId}`,
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

  async function requestMarkEntryEdit() {
    if (!subjectId) return;

    const mobileOk = await ensureMobileVerified();
    if (!mobileOk) {
      alert('Please verify your mobile number in Profile before requesting edits.');
      window.location.href = '/profile';
      return;
    }

    if (markEntryReqPending) {
      setEditRequestMessage('Edit request is pending. Please wait for approval.');
      return;
    }

    const reason = String(editRequestReason || '').trim();
    if (!reason) {
      setEditRequestMessage('Reason is required.');
      return;
    }

    setEditRequestBusy(true);
    try {
      const created = await createEditRequest({
        assessment: assessmentKey,
        subject_code: String(subjectId),
        scope: 'MARK_ENTRY',
        reason,
        teaching_assignment_id: teachingAssignmentId,
      });
      setEditRequestMessage(formatEditRequestSentMessage(created).replace(/\n/g, ' • '));
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
      alert(`Edit request failed: ${msg}`);
    } finally {
      setEditRequestBusy(false);
    }
  }

  async function openEditRequestModal() {
    if (editRequestBusy) return;

    if (markEntryReqPending) {
      setEditRequestMessage('Edit request is pending. Please wait for approval.');
      return;
    }

    const mobileOk = await ensureMobileVerified();
    if (!mobileOk) {
      alert('Please verify your mobile number in Profile before requesting edits.');
      window.location.href = '/profile';
      return;
    }

    setError(null);
    setEditRequestMessage(null);
    setEditRequestReason('');
    setPublishedEditModalOpen(true);
  }

  // While locked after publish, periodically check if IQAC updated the lock row.
  useEffect(() => {
    if (!subjectId) return;
    if (!isPublished) return;
    if (entryOpen) return;
    const tid = window.setInterval(() => {
      refreshMarkLock({ silent: true });
    }, 30000);
    return () => window.clearInterval(tid);
  }, [entryOpen, isPublished, subjectId, refreshMarkLock]);

  const prevEntryOpenRef = useRef<boolean | null>(null);
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
        const res = await fetchDraft<Cia1DraftPayload>(assessmentKey, subjectId);
        if (!mounted) return;
        const d = res?.draft as any;
        if (d && typeof d === 'object') {
          const rows = d.rowsByStudentId;
          const hasMarks = rows && typeof rows === 'object' && Object.values(rows).some((row: any) => {
            if (!row || typeof row !== 'object') return false;
            const marks = row.marks || row.questionMarks;
            if (Array.isArray(marks)) return marks.some((v: any) => v !== '' && v != null);
            // Check all question keys
            return Object.keys(row).some(k => k.startsWith('q') && row[k] !== '' && row[k] != null);
          });
          if (hasMarks) {
            setSheet((prevSheet) => ({
              ...prevSheet,
              termLabel: String(d.termLabel || prevSheet.termLabel),
              batchLabel: subjectId,
              questionBtl: d.questionBtl && typeof d.questionBtl === 'object' ? d.questionBtl : prevSheet.questionBtl,
              rowsByStudentId: d.rowsByStudentId,
              markManagerLocked: d.markManagerLocked ?? prevSheet.markManagerLocked,
              markManagerSnapshot: d.markManagerSnapshot ?? prevSheet.markManagerSnapshot,
              markManagerApprovalUntil: d.markManagerApprovalUntil ?? prevSheet.markManagerApprovalUntil,
            }));
            draftLoadedRef.current = true;
            return;
          }
        }
        // Fallback: refresh published sheet for view purposes.
        refreshPublishedSheet(true);
      } catch {
        // ignore and fall back
        try {
          refreshPublishedSheet(true);
        } catch {
          // ignore
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [entryOpen, isPublished, subjectId, assessmentKey]);

  const refreshPublishedSheet = async (silent?: boolean) => {
    if (!subjectId) return;
    if (!silent) {
      setPublishedViewError(null);
      setPublishedViewLoading(true);
    }
    try {
      const res = await fetchPublishedCiaSheet(assessmentKey, subjectId, teachingAssignmentId);
      const data = res && (res as any).data != null ? (res as any).data : null;
      setPublishedViewSheet(data);
    } catch (e: any) {
      if (!silent) setPublishedViewError(e?.message || 'Failed to load published sheet');
    } finally {
      if (!silent) setPublishedViewLoading(false);
    }
  };

  useEffect(() => {
    if (!viewMarksModalOpen) return;
    setPublishedViewSheet(null);
    refreshPublishedSheet(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMarksModalOpen, subjectId, assessmentKey]);

  async function confirmMarkManager() {
    if (!subjectId) return;
    setMarkManagerBusy(true);
    setMarkManagerError(null);
    try {
      const snapshot = markManagerSnapshotOf(sheet.questionBtl, {
        questions: mmSelectedQuestions,
        marks: mmSelectedMarks,
        btls: mmSelectedBtls,
      });
      const approvalUntil = markManagerEditWindow?.approval_until ? String(markManagerEditWindow.approval_until) : sheet.markManagerApprovalUntil || null;
      const nextSheet: Cia1Sheet = { ...sheet, markManagerLocked: true, markManagerSnapshot: snapshot, markManagerApprovalUntil: approvalUntil };
      const draft: Cia1DraftPayload = {
        termLabel: nextSheet.termLabel,
        batchLabel: subjectId,
        questionBtl: nextSheet.questionBtl,
        rowsByStudentId: nextSheet.rowsByStudentId,
        markManagerLocked: nextSheet.markManagerLocked,
        markManagerSnapshot: nextSheet.markManagerSnapshot,
        markManagerApprovalUntil: nextSheet.markManagerApprovalUntil,
      };

      setSheet(nextSheet);
      setMarkManagerModal(null);
      await saveDraft(assessmentKey, subjectId, draft);
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

  function toggleMmQuestion(n: number) {
    setMmSelectedQuestions((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  }
  function toggleMmMark(n: number) {
    setMmSelectedMarks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  }
  function toggleMmBtl(n: number) {
    setMmSelectedBtls((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  }

  useEffect(() => {
    // When opening the Mark Manager confirm modal, initialise selections from any existing snapshot
    if (!markManagerModal || markManagerModal.mode !== 'confirm') return;
    try {
      if (sheet.markManagerSnapshot) {
        const p = JSON.parse(String(sheet.markManagerSnapshot));
        const mm = (p && (p as any).mark_manager) || {};
        setMmSelectedQuestions(Array.isArray(mm.questions) ? mm.questions.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : []);
        setMmSelectedMarks(Array.isArray(mm.marks) ? mm.marks.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : []);
        setMmSelectedBtls(Array.isArray(mm.btls) ? mm.btls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : []);
      } else {
        // defaults: none selected
        setMmSelectedQuestions([]);
        setMmSelectedMarks([]);
        setMmSelectedBtls([]);
      }
    } catch (e) {
      setMmSelectedQuestions([]);
      setMmSelectedMarks([]);
      setMmSelectedBtls([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markManagerModal]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
        setMasterCfgWarning(null);
        setSheet((p) => ({
          ...p,
          termLabel: String((cfg as any)?.termLabel || p.termLabel || 'KRCT AY25-26'),
          batchLabel: subjectId,
        }));
      } catch (e: any) {
        if (!mounted) return;
        setMasterCfg(null);
        setMasterCfgWarning(e?.message || 'Failed to load OBE Master config; using derived maxima from questions.');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!subjectId) return;
      setLoading(true);
      setError(null);
      try {
        let data: any = null;
        
        // First, get the user's teaching assignments for this subject to check if it's elective
        let matchedTa: any = null;
        try {
          const myTAs = await fetchMyTeachingAssignments();
          matchedTa = (myTAs || []).find((t: any) => {
            const codeMatch = String(t.subject_code || '').trim().toUpperCase() === String(subjectId || '').trim().toUpperCase();
            const idMatch = teachingAssignmentId ? t.id === teachingAssignmentId : false;
            return idMatch || codeMatch;
          });
        } catch {
          // ignore if can't fetch TAs
        }

        // If we found a TA and it's an elective (has elective_subject_id, no section_id), fetch from elective-choices
        if (matchedTa && matchedTa.elective_subject_id && !matchedTa.section_id) {
          try {
            const esRes = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${encodeURIComponent(String(matchedTa.elective_subject_id))}`);
            if (esRes.ok) {
              const esData = await esRes.json();
              const items = Array.isArray(esData.results) ? esData.results : Array.isArray(esData) ? esData : (esData.items || []);
              data = { 
                students: (items || []).map((s: any) => ({ 
                  id: Number(s.student_id ?? s.id), 
                  reg_no: String(s.reg_no ?? s.regno ?? ''),
                  name: String(s.name ?? s.full_name ?? s.username ?? ''),
                  section: s.section_name ?? s.section ?? null 
                })), 
                marks: {} 
              };
            }
          } catch (err) {
            console.warn('Elective-choices fetch failed, falling back:', err);
          }
        }

        // If not elective or elective fetch failed, try normal CIA marks API
        if (!data) {
          try {
            data = await fetchCiaMarks(assessmentKey, subjectId, teachingAssignmentId);
          } catch (err) {
            console.warn('CIA marks fetch failed:', err);
            // Try TA roster as final fallback
            if (matchedTa && matchedTa.id) {
              try {
                const taResp = await fetchTeachingAssignmentRoster(matchedTa.id);
                data = { students: taResp.students || [], marks: {} };
              } catch {
                console.warn('TA roster fallback failed');
              }
            }
            // If still no data, rethrow original error
            if (!data) throw err;
          }
        }
        if (!mounted) return;
        const roster = (data.students || []).slice().sort((a, b) => {
          const an = String(a?.name || '').trim().toLowerCase();
          const bn = String(b?.name || '').trim().toLowerCase();
          if (an && bn) {
            const byName = an.localeCompare(bn);
            if (byName) return byName;
          } else if (an || bn) {
            return an ? -1 : 1;
          }
          return String(a?.reg_no || '').localeCompare(String(b?.reg_no || ''), undefined, { numeric: true, sensitivity: 'base' });
        });

        setStudents(roster);
        setSubjectPayload((data as any)?.subject || null);
        const apiMarks = data.marks || {};
        const totals: Record<number, number | null> = {};
        for (const [k, v] of Object.entries(apiMarks)) {
          const sid = Number(k);
          if (!Number.isFinite(sid)) continue;
          if (v === null || v === undefined || v === '') {
            totals[sid] = null;
            continue;
          }
          const n = Number(v);
          totals[sid] = Number.isFinite(n) ? n : null;
        }
        setServerTotals(totals);

        // Try to load published CIA sheet (preferred over draft/local)
        try {
          let pub: any = null;
          if (assessmentKey === 'cia1') {
            pub = await fetchPublishedCia1Sheet(subjectId);
          } else {
            pub = await fetchPublishedCiaSheet('cia2', subjectId);
          }
          if (pub && pub.data && typeof pub.data === 'object') {
            const pd = pub.data as any;
            const pubRows = pd.rowsByStudentId || pd.rows || (pd.sheet && pd.sheet.rowsByStudentId) || {};
            const rowsByStudentId: Record<string, Cia1RowState> = {};
            for (const [k, v] of Object.entries(pubRows || {})) {
              const sid = String(k);
              const rowObj = v as any;
              const qMap: Record<string, number | ''> = {};
              const qSource = rowObj.q || rowObj.answers || rowObj.questions || rowObj;
              if (qSource && typeof qSource === 'object') {
                for (const [qk, qv] of Object.entries(qSource)) {
                  const n = Number(qv);
                  qMap[qk] = Number.isFinite(n) ? n : '';
                }
              }
              rowsByStudentId[sid] = {
                studentId: Number(sid) || 0,
                absent: Boolean(rowObj.absent),
                absentKind: rowObj.absentKind || undefined,
                reg_no: String(rowObj.reg_no || rowObj.reg_no_text || ''),
                q: qMap,
              };
            }

            const questionBtlRaw = Array.isArray(pd.questions)
              ? Object.fromEntries((pd.questions as any[]).map((qq: any) => [String(qq.key || qq.label || ''), Number(qq.btl || qq.btl_level || 1)]))
              : defaultQuestionBtl(questions as any);
            const questionBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''> = Object.fromEntries(
              Object.entries(questionBtlRaw).map(([k, v]) => {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 1 && n <= 6) return [k, n as 1 | 2 | 3 | 4 | 5 | 6];
                return [k, ''];
              }),
            );

            setSheet({ termLabel: String(pd.termLabel || masterCfg?.termLabel || 'KRCT AY25-26'), batchLabel: subjectId, questionBtl, rowsByStudentId });
            setPublishedAt(new Date().toLocaleString());
            try {
              lsSet(sheetKey(assessmentKey, subjectId), { termLabel: String(pd.termLabel || masterCfg?.termLabel || 'KRCT AY25-26'), batchLabel: subjectId, questionBtl, rowsByStudentId });
            } catch {}
            // we've applied published sheet; continue to merge draft/local in subsequent effect if needed
          }
        } catch {
          // ignore published fetch errors; will merge draft/local below
        }

        // Load local sheet and merge with roster.
        const stored = lsGet<Cia1Sheet>(sheetKey(assessmentKey, subjectId));
        const base: Cia1Sheet =
          stored && typeof stored === 'object'
            ? {
                termLabel: masterCfg?.termLabel ? String(masterCfg.termLabel) : String((stored as any).termLabel || 'KRCT AY25-26'),
                batchLabel: subjectId,
                questionBtl:
                  (stored as any).questionBtl && typeof (stored as any).questionBtl === 'object'
                    ? (stored as any).questionBtl
                    : defaultQuestionBtl(questions),
                rowsByStudentId: (stored as any).rowsByStudentId && typeof (stored as any).rowsByStudentId === 'object' ? (stored as any).rowsByStudentId : {},
              }
            : { termLabel: String(masterCfg?.termLabel || 'KRCT AY25-26'), batchLabel: subjectId, questionBtl: defaultQuestionBtl(questions), rowsByStudentId: {} };

        // Backfill missing questionBtl keys.
        const nextQuestionBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''> = { ...defaultQuestionBtl(questions), ...(base.questionBtl || {}) };
        for (const q of questions) {
          const v = (nextQuestionBtl as any)[q.key];
          if (!(v === '' || v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6)) nextQuestionBtl[q.key] = '';
        }

        // Ensure every roster student has an entry.
        const merged: Record<string, Cia1RowState> = { ...base.rowsByStudentId };
        for (const s of data.students || []) {
          const key = String(s.id);
          if (merged[key]) {
            const isAbsent = Boolean((merged[key] as any).absent);
            const rawKind = String((merged[key] as any).absentKind || '').toUpperCase();
            const kind: AbsenceKind | undefined = isAbsent
              ? rawKind === 'ML' || rawKind === 'SKL' || rawKind === 'AL'
                ? (rawKind as AbsenceKind)
                : 'AL'
              : undefined;
            merged[key] = {
              studentId: s.id,
              absent: isAbsent,
              absentKind: kind,
              reg_no: s.reg_no || '', // Ensure reg_no is added
              q: { ...(merged[key] as any).q },
            };
          } else {
            merged[key] = {
              studentId: s.id,
              absent: false,
              absentKind: undefined,
              reg_no: s.reg_no || '', // Ensure reg_no is added
              q: Object.fromEntries(questions.map((q) => [q.key, ''])),
            };
          }

          // Backfill missing question keys.
          for (const q of questions) {
            if (!(q.key in (merged[key].q || {}))) merged[key].q[q.key] = '';
          }
        }

        setSheet({ ...base, questionBtl: nextQuestionBtl, termLabel: base.termLabel || String(masterCfg?.termLabel || 'KRCT AY25-26'), batchLabel: subjectId, rowsByStudentId: merged });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || `Failed to load ${assessmentLabel} roster`);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [subjectId, teachingAssignmentId, masterCfg, questions, assessmentKey, assessmentLabel]);

  // Load draft from DB (preferred) and merge into local sheet.
  useEffect(() => {
    let mounted = true;
    draftLoadedRef.current = false;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<Cia1DraftPayload>(assessmentKey, subjectId);
        if (!mounted) return;
        const d = res?.draft;
        if (d && typeof d === 'object') {
          setSheet((prev) => ({
            ...prev,
            termLabel: String((d as any).termLabel || prev.termLabel),
            batchLabel: subjectId,
            questionBtl:
              (d as any).questionBtl && typeof (d as any).questionBtl === 'object'
                ? (d as any).questionBtl
                : prev.questionBtl,
            rowsByStudentId:
              (d as any).rowsByStudentId && typeof (d as any).rowsByStudentId === 'object'
                ? (d as any).rowsByStudentId
                : prev.rowsByStudentId,
          }));
          try {
            const sk = sheetKey(assessmentKey, subjectId);
            lsSet(sk, {
              termLabel: String((d as any).termLabel || 'KRCT AY25-26'),
              batchLabel: String(subjectId),
              questionBtl: (d as any).questionBtl && typeof (d as any).questionBtl === 'object' ? (d as any).questionBtl : defaultQuestionBtl(questions),
              rowsByStudentId: (d as any).rowsByStudentId && typeof (d as any).rowsByStudentId === 'object' ? (d as any).rowsByStudentId : {},
            });
          } catch {
            // ignore localStorage errors
          }
        }
      } catch (e: any) {
        // If draft fetch fails (permissions/network), keep working locally.
        if (!mounted) return;
      }
      if (mounted) draftLoadedRef.current = true;
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId, assessmentKey, questions]);

  const totalsMax = useMemo(() => questions.reduce((sum, q) => sum + q.max, 0), [questions]);
  const questionCoMax = useMemo(() => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const w = effectiveCoWeightsForQuestion(questions, i, coPair);
      a += q.max * w.a;
      b += q.max * w.b;
    }
    return { a, b };
  }, [questions, coPair]);

  const effectiveCoMax = useMemo(() => {
    const cfg = ((masterCfg as any)?.assessments?.[assessmentKey]?.coMax ?? (masterCfg as any)?.assessments?.cia1?.coMax) as any;
    const rawA = Number(cfg?.[`co${coPair.a}`] ?? cfg?.co1);
    const rawB = Number(cfg?.[`co${coPair.b}`] ?? cfg?.co2);
    return {
      a: Number.isFinite(rawA) ? Math.max(0, rawA) : questionCoMax.a,
      b: Number.isFinite(rawB) ? Math.max(0, rawB) : questionCoMax.b,
    };
  }, [masterCfg, questionCoMax, assessmentKey, coPair]);

  const visibleBtls = useMemo(() => {
    const set = new Set<number>();
    for (const q of questions) {
      const v = (sheet.questionBtl || ({} as any))[q.key];
      if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) set.add(v);
    }
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [sheet.questionBtl, questions]);

  const questionBtlMax = useMemo(() => {
    const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const q of questions) {
      const v = (sheet.questionBtl || ({} as any))[q.key];
      if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) out[v] += q.max;
    }
    return out as Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  }, [sheet.questionBtl, questions]);

  const effectiveBtlMax = useMemo(() => {
    const cfg = (((masterCfg as any)?.assessments?.[assessmentKey]?.btlMax ?? (masterCfg as any)?.assessments?.cia1?.btlMax) as
      | Partial<Record<'1' | '2' | '3' | '4' | '5' | '6', unknown>>
      | undefined);
    const get = (k: '1' | '2' | '3' | '4' | '5' | '6', fallback: number) => {
      const raw = Number((cfg as any)?.[k]);
      return Number.isFinite(raw) ? Math.max(0, raw) : fallback;
    };
    return {
      1: get('1', questionBtlMax[1]),
      2: get('2', questionBtlMax[2]),
      3: get('3', questionBtlMax[3]),
      4: get('4', questionBtlMax[4]),
      5: get('5', questionBtlMax[5]),
      6: get('6', questionBtlMax[6]),
    } as Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  }, [masterCfg, questionBtlMax, assessmentKey]);

  const setAbsent = (studentId: number, absent: boolean) => {
    if (publishing || tableBlocked) return;
    setSheet((prev) => {
      const key = String(studentId);
      const existing = prev.rowsByStudentId[key] || {
        studentId,
        absent: false,
        absentKind: undefined,
        reg_no: '',
        q: Object.fromEntries(questions.map((q) => [q.key, ''])),
      };

      const next: Cia1RowState = absent
        ? { ...existing, absent: true, absentKind: (existing as any).absentKind || 'AL', q: Object.fromEntries(questions.map((q) => [q.key, ''])) }
        : { ...existing, absent: false, absentKind: undefined };

      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [key]: next,
        },
      };
    });
  };

  const setAbsentKind = (studentId: number, absentKind: AbsenceKind) => {
    if (publishing || tableBlocked) return;
    setSheet((prev) => {
      const key = String(studentId);
      const existing = prev.rowsByStudentId[key] || {
        studentId,
        absent: true,
        absentKind: 'AL' as AbsenceKind,
        reg_no: '',
        q: Object.fromEntries(questions.map((q) => [q.key, ''])),
      };
      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [key]: {
            ...existing,
            absent: true,
            absentKind,
          },
        },
      };
    });
  };

  const setQuestionBtl = (qKey: string, value: 1 | 2 | 3 | 4 | 5 | 6 | '') => {
    if (publishing || globalLocked) return;
    const confirmed = sheet.markManagerSnapshot != null;
    if (markManagerLocked && confirmed) return;
    if (publishedEditLocked) return;
    setSheet((prev) => ({
      ...prev,
      questionBtl: {
        ...(prev.questionBtl || defaultQuestionBtl(questions)),
        [qKey]: value,
      },
    }));
  };

  // Autosave question BTL changes (debounced) and persist to localStorage
  useEffect(() => {
    if (!subjectId) return;
    if (!draftLoadedRef.current) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const draft: Cia1DraftPayload = {
          termLabel: sheet.termLabel,
          batchLabel: subjectId,
          questionBtl: sheet.questionBtl,
          rowsByStudentId: sheet.rowsByStudentId,
        };
        await saveDraft(assessmentKey, subjectId, draft);
        try {
          const sk = sheetKey(assessmentKey, subjectId);
          lsSet(sk, {
            termLabel: sheet.termLabel,
            batchLabel: subjectId,
            questionBtl: sheet.questionBtl,
            rowsByStudentId: sheet.rowsByStudentId,
          });
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
  }, [sheet.questionBtl, subjectId, sheet.rowsByStudentId, assessmentKey]);

  const setQuestionMark = (studentId: number, qKey: string, value: number | '') => {
    if (publishing || tableBlocked) return;
    setSheet((prev) => {
      const key = String(studentId);
      const existing = prev.rowsByStudentId[key] || {
        studentId,
        absent: false,
        absentKind: undefined,
        reg_no: '',
        q: Object.fromEntries(questions.map((q) => [q.key, ''])),
      };

      // Allow mark edits for absentees only when user explicitly opened the absentees list
      // (absentees are handled during publish/export: if marks are entered, the row is treated as present).
      const isAbsent = Boolean((existing as any).absent);
      const absenceKind = isAbsent ? String((existing as any).absentKind || 'AL').toUpperCase() : '';
      const canEditAbsent = Boolean(showAbsenteesOnly && isAbsent);
      if (isAbsent && !canEditAbsent) return prev;
      const def = questions.find((q) => q.key === qKey);
      const max = def?.max ?? totalsMax;

      const nextValue = value === '' ? '' : clamp(Number(value || 0), 0, max);

      const kind: AbsenceKind | null = existing.absent ? ((existing as any).absentKind || 'AL') : null;
      const cap = kind === 'ML' ? 60 : kind === 'SKL' ? 75 : null;
      if (cap != null) {
        const nextTotal = questions.reduce((sum, q) => {
          const v = q.key === qKey ? nextValue : (existing.q || {})[q.key];
          return sum + clamp(Number(v || 0), 0, q.max);
        }, 0);

        if (nextTotal > cap) {
          setLimitDialog({
            title: 'Mark limit exceeded',
            message: absenceKind === 'ML' ? 'For malpractice the total mark assigned is 60' : 'For Sick leave the Total mark assigned is 75',
          });
          return prev;
        }
      }

      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [key]: {
            ...existing,
            q: {
              ...(existing.q || {}),
              [qKey]: nextValue,
            },
          },
        },
      };
    });
  };

  const hasAnyEnteredMarks = (row: Cia1RowState | null | undefined): boolean => {
    if (!row || !row.q) return false;
    return questions.some((q) => {
      const v = (row.q as any)[q.key];
      return v !== '' && v !== null && v !== undefined;
    });
  };

  const payload = useMemo(() => {
    const out: Record<number, number | null> = {};
    for (const s of students) {
      const row = sheet.rowsByStudentId[String(s.id)];
      if (!row) {
        out[s.id] = null;
        continue;
      }
      if (row.absent) {
        const kind = String((row as any).absentKind || 'AL').toUpperCase();
        // AL: always 0. ML/SKL: allow entering marks (capped in UI).
        if (kind === 'AL') {
          out[s.id] = 0;
          continue;
        }
      }
      const total = questions.reduce((sum, q) => sum + clamp(Number(row.q?.[q.key] || 0), 0, q.max), 0);
      out[s.id] = total;
    }
    return out;
  }, [students, sheet.rowsByStudentId, questions]);

  // Auto-save draft when switching tabs
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  useEffect(() => {
    const handler = () => {
      if (!subjectId || students.length === 0 || tableBlocked || globalLocked) return;
      const s = sheetRef.current;
      const draft: Cia1DraftPayload = {
        termLabel: s.termLabel,
        batchLabel: subjectId,
        questionBtl: s.questionBtl,
        rowsByStudentId: s.rowsByStudentId,
      };
      saveDraft(assessmentKey, subjectId, draft).catch(() => {});
    };
    window.addEventListener('obe:before-tab-switch', handler);
    return () => window.removeEventListener('obe:before-tab-switch', handler);
  }, [subjectId, assessmentKey, students.length, tableBlocked, globalLocked]);

  const saveDraftToDb = async () => {
    setSaving(true);
    setError(null);
    try {
      const draft: Cia1DraftPayload = {
        termLabel: sheet.termLabel,
        batchLabel: subjectId,
        questionBtl: sheet.questionBtl,
        rowsByStudentId: sheet.rowsByStudentId,
      };
      await saveDraft(assessmentKey, subjectId, draft);
      setSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setError(e?.message || `Failed to save ${assessmentLabel} draft`);
    } finally {
      setSaving(false);
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

    // If already published and locked, use Publish action as the entry-point to request edits.
    if (isPublished && publishedEditLocked) {
      if (markEntryReqPending) {
        setError('Edit request is pending. Please wait for approval.');
        return;
      }

      await openEditRequestModal();
      return;
    }

    setPublishing(true);
    setError(null);
    setEditRequestMessage(null);
    try {
      // Persist a snapshot of the sheet + question headers used for CO calculations.
      // If an absentee has marks entered, treat them as present for publishing (so totals merge into overall mark list).
      const mergedRowsByStudentId: Record<string, any> = {};
      for (const [sid, row] of Object.entries(sheet.rowsByStudentId || {})) {
        const r: any = row || {};
        const entered = hasAnyEnteredMarks(r as any);
        if (r.absent && entered) {
          mergedRowsByStudentId[sid] = { ...r, absent: false, absentKind: undefined };
        } else {
          mergedRowsByStudentId[sid] = r;
        }
      }

      const data = {
        ...sheet,
        batchLabel: subjectId,
        questions,
        rowsByStudentId: mergedRowsByStudentId,
      };
      await publishCiaSheet(assessmentKey, subjectId, data, teachingAssignmentId);
      setPublishedAt(new Date().toLocaleString());
      // Consume any existing approvals so the table becomes locked immediately after Publish.
      setPublishConsumedApprovals({
        markEntryApprovalUntil,
        markManagerApprovalUntil,
      });
      // Ensure Mark Manager is re-locked locally after publish.
      setSheet((p) => ({ ...p, markManagerLocked: true }));
      refreshPublishWindow();
      refreshMarkLock({ silent: true });
      refreshPublishedSheet(true);
        try {
          console.debug('obe:published dispatch', { assessment: assessmentKey, subjectId });
          window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId, assessment: assessmentKey } }));
        } catch {
          // ignore
        }
        // If view modal is open, scroll its table to bottom so user sees latest rows
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
    } catch (e: any) {
      const status = (e as any)?.status;
      const detail = String((e as any)?.body?.detail || e?.message || '');

      // If the sheet is already published, backend returns 423 (Locked) and instructs to request IQAC approval.
      // UX expectation: do not show this as a publish failure; switch UI into the Published—Locked state.
      if (status === 423) {
        setPublishedAt((prev) => prev || new Date().toLocaleString());
        refreshPublishWindow();
        refreshMarkLock({ silent: true });
        setError(null);
        await openEditRequestModal();
        return;
      }

      setError(e?.message || `Failed to publish ${assessmentLabel}`);
    } finally {
      setPublishing(false);
    }
  };

  const requestApproval = async () => {
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
    const out = students.map((s, i) => {
      const row = sheet.rowsByStudentId[String(s.id)] || {
        studentId: s.id,
        absent: false,
        absentKind: undefined,
        q: Object.fromEntries(questions.map((q) => [q.key, ''])),
      };

      // Export rule:
      // - If a student is marked absent and NO marks are entered, mark them as ABSENT in the full list.
      // - If marks are entered for an absentee, treat them as present in the exported list.
      const entered = hasAnyEnteredMarks(row as any);
      const effectiveAbsent = Boolean(row.absent && !entered);
      const effectiveAbsentKind = effectiveAbsent ? String((row as any).absentKind || 'AL') : '';

      if (effectiveAbsent) {
        const emptyQ = Object.fromEntries(questions.map((q) => [q.key, ''] as const));
        return {
          sno: i + 1,
          registerNo: s.reg_no,
          name: s.name,
          absent: 1,
          absentKind: effectiveAbsentKind,
          ...emptyQ,
          total: 'ABSENT',
          [`co${coPair.a}_mark`]: '',
          [`co${coPair.a}_pct`]: '',
          [`co${coPair.b}_mark`]: '',
          [`co${coPair.b}_pct`]: '',
          ...Object.fromEntries(
            visibleBtls.flatMap((n) => [
              [`btl${n}_mark`, ''],
              [`btl${n}_pct`, ''],
            ]),
          ),
        };
      }

      // If an absentee has marks entered, export them as present.
      const exportAbsent = 0;
      const exportAbsentKind = '';

      const qMarks = Object.fromEntries(
        questions.map((q) => [q.key, clamp(Number(row.q?.[q.key] || 0), 0, q.max)]),
      );
      const total = questions.reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0);

      let co1 = 0;
      let co2 = 0;
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const w = effectiveCoWeightsForQuestion(questions, qi, coPair);
        const m = Number(qMarks[q.key] || 0);
        co1 += m * w.a;
        co2 += m * w.b;
      }

      const btl: Record<1 | 2 | 3 | 4 | 5 | 6, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      for (const q of questions) {
        const v = (sheet.questionBtl || ({} as any))[q.key];
        if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) btl[v] += Number(qMarks[q.key] || 0);
      }

      return {
        sno: i + 1,
        registerNo: s.reg_no,
        name: s.name,
        absent: exportAbsent,
        absentKind: exportAbsentKind,
        ...qMarks,
        total,
        [`co${coPair.a}_mark`]: co1,
        [`co${coPair.a}_pct`]: pct(co1, effectiveCoMax.a),
        [`co${coPair.b}_mark`]: co2,
        [`co${coPair.b}_pct`]: pct(co2, effectiveCoMax.b),
        ...Object.fromEntries(
          visibleBtls.flatMap((n) => [
            [`btl${n}_mark`, btl[n as 1 | 2 | 3 | 4 | 5 | 6]],
            [`btl${n}_pct`, pct(btl[n as 1 | 2 | 3 | 4 | 5 | 6], effectiveBtlMax[n as 1 | 2 | 3 | 4 | 5 | 6])],
          ]),
        ),
      };
    });

    downloadCsv(`${subjectId}_${assessmentKey.toUpperCase()}_sheet.csv`, out);
  };

  const exportSheetExcel = async () => {
    try {
      const qs = new URLSearchParams();
      if (teachingAssignmentId) qs.set('teaching_assignment_id', String(teachingAssignmentId));
      // Ensure backend can generate QP-specific template even when curriculum lookup is missing.
      if (qpTypeKey) qs.set('question_paper_type', String(qpTypeKey));
      const DEFAULT_API_BASE = 'https://db.krgi.co.in';
      const runtimeApiBase = (import.meta as any).env?.VITE_API_BASE || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8000' : DEFAULT_API_BASE);
      const url = `${runtimeApiBase}/api/obe/cia-export-template/${encodeURIComponent(assessmentKey)}/${encodeURIComponent(subjectId)}${qs.toString() ? `?${qs.toString()}` : ''}`;
      const res = await fetchWithAuth(url, { method: 'GET' });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${subjectId}_${assessmentKey.toUpperCase()}_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(href);
      document.body.removeChild(a);
    } catch (e: any) {
      alert(e?.message || 'Failed to export Excel');
    }
  };

  const downloadTotals = async () => {
    const rows = students.map((s, i) => {
      const row = sheet.rowsByStudentId[String(s.id)] || {
        studentId: s.id,
        absent: false,
        absentKind: undefined,
        q: Object.fromEntries(questions.map((q) => [q.key, ''])),
      };

      const entered = hasAnyEnteredMarks(row as any);
      const effectiveAbsent = Boolean((row as any).absent && !entered);
      if (effectiveAbsent) {
        return { sno: i + 1, regNo: String(s.reg_no || ''), name: String(s.name || ''), total: 'ABSENT' };
      }

      const qMarks = Object.fromEntries(questions.map((q) => [q.key, clamp(Number((row as any).q?.[q.key] || 0), 0, q.max)]));
      const total = questions.reduce((sum, q) => sum + Number((qMarks as any)[q.key] || 0), 0);
      return { sno: i + 1, regNo: String(s.reg_no || ''), name: String(s.name || ''), total };
    });

    const courseName = String((subjectPayload as any)?.name || '').trim();
    const courseCode = String((subjectPayload as any)?.code || subjectId || '').trim();

    await downloadTotalsWithPrompt({
      filenameBase: `${subjectId}_${assessmentLabel}`,
      meta: {
        courseName,
        courseCode,
        className: String((subjectPayload as any)?.className || ''),
      },
      rows,
    });
  };

  const importFromExcel = async (file: File) => {
    if (publishing || tableBlocked || importing) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      if (rows.length < 2) {
        throw new Error('Excel file is empty or has no data rows');
      }

      // Parse header row to find column indices
      const headerRow = rows[0] as string[];
      const regNoIdx = headerRow.findIndex((h) => String(h || '').toLowerCase().includes('register'));
      const statusIdx = headerRow.findIndex((h) => String(h || '').toLowerCase().includes('status'));

      if (regNoIdx === -1) {
        throw new Error('Could not find "Register No" column in Excel file');
      }

      // Question columns are between student name and status
      const qStartIdx = 2; // After Register No and Student Name
      const qEndIdx = statusIdx !== -1 ? statusIdx : headerRow.length;

      // Map question headers to question keys
      // For QP2 Excel-only split: Q10 should be merged back into q9.
      const qColumnMap: Array<{ colIdx: number; qKey: string; mode: 'set' | 'sum' }> = [];
      for (let i = qStartIdx; i < qEndIdx; i++) {
        const header = String(headerRow[i] || '').trim();
        if (!header) continue;

        // Extract question label from header like "Q1 (2.00)" -> "Q1"
        const match = header.match(/^([QqOo]\d+|[A-Za-z]\d*)/);
        if (!match) continue;

        const label = match[1].toUpperCase();

        // QP2: template has Q9 (8) and Q10 (8) but UI has only Q9 (16).
        if (qpTypeKey === 'QP2' && label === 'Q10') {
          qColumnMap.push({ colIdx: i, qKey: 'q9', mode: 'sum' });
          continue;
        }
        if (qpTypeKey === 'QP2' && label === 'Q9') {
          qColumnMap.push({ colIdx: i, qKey: 'q9', mode: 'set' });
          continue;
        }

        // Find matching question by label
        const question = questions.find((q) => q.label.toUpperCase() === label || q.key.toUpperCase() === label.toUpperCase());
        if (question) {
          qColumnMap.push({ colIdx: i, qKey: question.key, mode: 'set' });
        }
      }

      if (qColumnMap.length === 0) {
        throw new Error('No matching question columns found in Excel file');
      }

      // Build a map from reg_no to student
      const studentsByRegNo = new Map<string, Student>();
      students.forEach((s) => {
        const normalizedReg = String(s.reg_no || '').trim().toUpperCase();
        if (normalizedReg) {
          studentsByRegNo.set(normalizedReg, s);
        }
      });

      // Process data rows
      let importedCount = 0;
      let skippedCount = 0;
      const updatedRows: Record<string, Cia1RowState> = { ...sheet.rowsByStudentId };

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const regNo = String(row[regNoIdx] || '').trim().toUpperCase();
        if (!regNo) continue;

        const student = studentsByRegNo.get(regNo);
        if (!student) {
          skippedCount++;
          continue;
        }

        const key = String(student.id);
        const existing = updatedRows[key] || {
          studentId: student.id,
          absent: false,
          absentKind: undefined,
          reg_no: student.reg_no,
          q: Object.fromEntries(questions.map((q) => [q.key, ''])),
        };

        // Read marks for each question
        const newQ = { ...existing.q };
        let hasAnyMark = false;

        // For merge cases (QP2 Q9+Q10), accumulate before writing.
        const sumBuffer: Record<string, number> = {};

        for (const { colIdx, qKey, mode } of qColumnMap) {
          const cellValue = row[colIdx];
          if (cellValue === null || cellValue === undefined || cellValue === '') {
            if (mode === 'set') newQ[qKey] = '';
            continue;
          }

          const numValue = Number(cellValue);
          if (!Number.isFinite(numValue)) {
            if (mode === 'set') newQ[qKey] = '';
            continue;
          }

          if (mode === 'sum') {
            sumBuffer[qKey] = (sumBuffer[qKey] ?? 0) + numValue;
            continue;
          }

          const question = questions.find((q) => q.key === qKey);
          const max = question?.max ?? totalsMax;
          newQ[qKey] = clamp(numValue, 0, max);
          hasAnyMark = true;
        }

        // Apply sums (QP2: add Q10 into q9)
        for (const [qKey, addValue] of Object.entries(sumBuffer)) {
          const base = Number(newQ[qKey] === '' ? 0 : newQ[qKey] || 0);
          const question = questions.find((q) => q.key === qKey);
          const max = question?.max ?? totalsMax;
          const merged = clamp(base + addValue, 0, max);
          newQ[qKey] = merged;
          hasAnyMark = true;
        }

        // Read status
        let absent = existing.absent;
        if (statusIdx !== -1) {
          const statusValue = String(row[statusIdx] || '').trim().toLowerCase();
          absent = statusValue === 'absent';
        }

        updatedRows[key] = {
          ...existing,
          q: newQ,
          absent,
        };

        if (hasAnyMark || absent !== existing.absent) {
          importedCount++;
        }
      }

      // Update sheet
      setSheet((prev) => ({
        ...prev,
        rowsByStudentId: updatedRows,
      }));

      alert(`Import successful!\nImported: ${importedCount} students\nSkipped: ${skippedCount} rows (no matching register number)`);
    } catch (e: any) {
      alert(`Failed to import Excel: ${e?.message || 'Unknown error'}`);
      console.error('Import error:', e);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importFromExcel(file);
    }
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  if (loading) return <div style={{ color: '#6b7280' }}>Loading {assessmentLabel} roster…</div>;

  const hasAbsentees = students.some((s) => Boolean(sheet.rowsByStudentId[String(s.id)]?.absent));
  const visibleStudents = showAbsenteesOnly
    ? students.filter((s) => {
        // When the user opens the absentees list, keep the list stable while they edit.
        if (absenteesSnapshot && absenteesSnapshot.length) return absenteesSnapshot.includes(s.id);
        return Boolean(sheet.rowsByStudentId[String(s.id)]?.absent);
      })
    : students;

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
  };

  const SNO_COL_WIDTH = 32;

  // Add a CSS class for vertical text
  const verticalTextStyle = {
    writingMode: 'vertical-rl',
    transform: 'rotate(180deg)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };

  return (
    <AssessmentContainer>
      {limitDialog ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => setLimitDialog(null)}
        >
          <div
            style={{
              width: 'min(520px, 100%)',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid rgba(15,23,42,0.10)',
              boxShadow: '0 20px 60px rgba(2,6,23,0.25)',
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>{limitDialog.title}</div>
            <div style={{ fontSize: 13, color: '#334155', marginBottom: 12 }}>{limitDialog.message}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="obe-btn" onClick={() => setLimitDialog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      {masterCfgWarning && (
        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b55', color: '#92400e', padding: 10, borderRadius: 10, marginBottom: 10 }}>
          {masterCfgWarning}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="obe-btn obe-btn-secondary"
            disabled={!hasAbsentees}
            onClick={() => {
              if (showAbsenteesOnly) return;
              const snap = students
                .filter((s) => Boolean(sheet.rowsByStudentId[String(s.id)]?.absent))
                .map((s) => s.id);
              setAbsenteesSnapshot(snap);
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
          <button onClick={exportSheetCsv} className="obe-btn obe-btn-secondary" disabled={students.length === 0}>
            Export CSV
          </button>
          <button onClick={exportSheetExcel} className="obe-btn obe-btn-secondary" disabled={students.length === 0}>
            Export Excel
          </button>
          <button onClick={triggerFileUpload} className="obe-btn obe-btn-secondary" disabled={importing || students.length === 0 || tableBlocked || globalLocked}>
            {importing ? 'Importing…' : 'Import Excel'}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={downloadTotals} className="obe-btn obe-btn-secondary" disabled={students.length === 0}>
            Download
          </button>
          <button onClick={saveDraftToDb} className="obe-btn obe-btn-success" disabled={saving || students.length === 0 || tableBlocked || globalLocked}>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={publish}
            disabled={publishButtonIsRequestEdit ? markEntryReqPending : publishing || students.length === 0 || !publishAllowed || tableBlocked || globalLocked}
            className="obe-btn obe-btn-primary"
          >
            {publishButtonIsRequestEdit ? (markEntryReqPending ? 'Request Pending' : 'Request Edit') : publishing ? 'Publishing…' : 'Publish'}
          </button>
          {savedAt && <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>Saved: {savedAt}</div>}
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
          <label style={{ fontSize: 12, color: '#374151' }}>
            Term
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.termLabel}</div>
          </label>
          <label style={{ fontSize: 12, color: '#374151' }}>
            Sheet Label
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.batchLabel}</div>
          </label>
          <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
            Total max: {totalsMax} | Questions: {questions.length} | COs: {coPair.a}–{coPair.b} | BTLs: 1–6
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>No students found for this subject.</div>
      ) : (
        <div style={{ position: 'relative' }}>
          <PublishLockOverlay locked={globalLocked}>
            <div style={{ marginBottom: 10, width: '100%', maxWidth: 1200, marginLeft: 'auto', marginRight: 'auto' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Mark Manager</div>
              <div
                style={{
                  border: '1px solid #fcd34d',
                  background: markManagerLocked ? '#f3f4f6' : '#fff7ed',
                  padding: 12,
                  borderRadius: 12,
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
                  <div style={{ fontWeight: 950, color: '#111827' }}>BTL configuration</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Set BTL per question in the BTL row, then confirm.</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="obe-btn obe-btn-success"
                    disabled={!subjectId || markManagerBusy}
                    onClick={() => setMarkManagerModal({ mode: markManagerLocked ? 'request' : 'confirm' })}
                  >
                    {markManagerLocked ? 'Edit' : 'Save'}
                  </button>
                </div>
              </div>
              {markManagerError ? <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{markManagerError}</div> : null}
            </div>

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
              <table className="obe-table" style={{ width: 'max-content', minWidth: '100%', tableLayout: 'auto', borderCollapse: 'collapse' }}>
                <thead>
              <tr>
                <th style={cellTh} colSpan={4 + questions.length + 1 + 4 + visibleBtls.length * 2}>
                  {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {assessmentLabel}
                </th>
              </tr>
              <tr>
                <th style={{ ...cellTh, width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH }} rowSpan={3}>
                  S.No
                </th>
                <th style={{ ...cellTh, minWidth: 70, overflow: 'visible', textOverflow: 'clip' }} rowSpan={3}>
                  R.No
                </th>
                <th style={{ ...cellTh, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }} rowSpan={3}>
                  Name of the Students
                </th>
                <th style={{ ...cellTh, minWidth: 88 }} rowSpan={3}>
                  AB
                </th>

                <th style={cellTh} colSpan={questions.length}>
                  QUESTIONS
                </th>
                <th style={cellTh} rowSpan={3}>
                  Total
                </th>
                <th style={cellTh} colSpan={4}>
                  CO ATTAINMENT
                </th>
                {visibleBtls.length ? (
                  <th style={cellTh} colSpan={visibleBtls.length * 2}>
                    BTL ATTAINMENT
                  </th>
                ) : null}
              </tr>
              <tr>
                {questions.map((q) => (
                  <th key={q.key} style={{ ...cellTh, width: 46, minWidth: 46 }}>
                    {q.label}
                  </th>
                ))}
                <th style={cellTh} colSpan={2}>
                  CO-{coPair.a}
                </th>
                <th style={cellTh} colSpan={2}>
                  CO-{coPair.b}
                </th>
                {visibleBtls.map((n) => (
                  <th key={`btl-head-${n}`} style={cellTh} colSpan={2}>
                    BTL-{n}
                  </th>
                ))}
              </tr>
              <tr>
                {questions.map((q) => (
                  <th key={q.key} style={{ ...cellTh, width: 46, minWidth: 46 }}>
                    {q.max}
                  </th>
                ))}
                {Array.from({ length: 2 + visibleBtls.length }).flatMap((_, i) => (
                  <React.Fragment key={i}>
                    <th style={cellTh}>
                      <div style={{ whiteSpace: 'pre-line', lineHeight: '0.9', fontSize: '0.7em' }}>{'M\nA\nR\nK'}</div>
                    </th>
                    <th style={cellTh}>%</th>
                  </React.Fragment>
                ))}
              </tr>
              </thead>

              <tbody>
              <tr>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} colSpan={3} />
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>BTL</td>
                {questions.map((q) => (
                  <td key={`btl-select-${q.key}`} style={{ ...cellTd, textAlign: 'center' }}>
                    {(() => {
                      const v = (sheet.questionBtl || ({} as any))[q.key] ?? '';
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
                            aria-label={`BTL for ${q.label}`}
                            value={v}
                            onChange={(e) =>
                              setQuestionBtl(q.key, e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6))
                            }
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
                {visibleBtls.map((n) => (
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
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>-</td>

                {questions.map((q) => (
                  <td key={q.key} style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>
                    {q.max}
                  </td>
                ))}
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{totalsMax}</td>

                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{effectiveCoMax.a}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{effectiveCoMax.b}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                {visibleBtls.map((n) => (
                  <React.Fragment key={`btl-max-${n}`}>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{effectiveBtlMax[n as 1 | 2 | 3 | 4 | 5 | 6]}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                  </React.Fragment>
                ))}
              </tr>

              {visibleStudents.map((s, i) => {
                const row = sheet.rowsByStudentId[String(s.id)] || {
                  studentId: s.id,
                  reg_no: (s as any).reg_no ?? '',
                  absent: false,
                  absentKind: undefined,
                  q: Object.fromEntries(questions.map((q) => [q.key, ''])),
                };

                const qMarks = Object.fromEntries(questions.map((q) => [q.key, clamp(Number(row.q?.[q.key] || 0), 0, q.max)])) as Record<
                  string,
                  number
                >;
                const total = questions.reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0);

                let co1 = 0;
                let co2 = 0;
                for (let qi = 0; qi < questions.length; qi++) {
                  const q = questions[qi];
                  const w = effectiveCoWeightsForQuestion(questions, qi, coPair);
                  const m = Number(qMarks[q.key] || 0);
                  co1 += m * w.a;
                  co2 += m * w.b;
                }

                const btl: Record<1 | 2 | 3 | 4 | 5 | 6, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
                for (const q of questions) {
                  const v = (sheet.questionBtl || ({} as any))[q.key];
                  if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) btl[v] += Number(qMarks[q.key] || 0);
                }

                const rowStyle: React.CSSProperties | undefined = row.absent ? { background: '#f1f5f9' } : undefined;

                const kind = row.absent ? String((row as any).absentKind || 'AL').toUpperCase() : '';
                const canEditAbsent = Boolean(showAbsenteesOnly && row.absent);

                const lockedInputs = Boolean(publishing || tableBlocked || globalLocked || publishedEditLocked);

                const serverTotal = serverTotals[s.id];

                return (
                  <tr key={s.id} style={rowStyle}>
                    <td style={{ ...cellTd, textAlign: 'center', width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH, paddingLeft: 2, paddingRight: 2 }}>{i + 1}</td>
                    <td style={{ ...cellTd, minWidth: 70, overflow: 'visible', textOverflow: 'clip' }}>{shortenRegisterNo(row.reg_no)}</td>
                    <td style={{ ...cellTd, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }}>{s.name}</td>
                    <td style={{ ...cellTd, textAlign: 'center', minWidth: 88 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={row.absent} disabled={lockedInputs} onChange={(e) => setAbsent(s.id, e.target.checked)} />
                        {row.absent ? (
                          <div className="obe-ios-select" title="Absent type">
                            <span className="obe-ios-select-value">{String((row as any).absentKind || 'AL')}</span>
                            <select
                              aria-label="Absent type"
                              value={((row as any).absentKind || 'AL') as any}
                              disabled={lockedInputs}
                              onChange={(e) => setAbsentKind(s.id, e.target.value as AbsenceKind)}
                            >
                              <option value="AL">AL</option>
                              <option value="ML">ML</option>
                              <option value="SKL">SKL</option>
                            </select>
                          </div>
                        ) : null}
                      </div>
                    </td>

                    {questions.map((q) => (
                      <td key={q.key} style={{ ...cellTd, textAlign: 'center', width: 46, minWidth: 46 }}>
                        <input
                          style={{ ...inputStyle, textAlign: 'center' }}
                          type="number"
                          min={0}
                          max={q.max}
                          disabled={lockedInputs || (row.absent && !canEditAbsent)}
                          value={row.q?.[q.key] === '' || row.q?.[q.key] == null ? '' : Number(row.q?.[q.key] || 0)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              e.currentTarget.setCustomValidity('');
                              return setQuestionMark(s.id, q.key, '');
                            }

                            const next = Number(raw);
                            if (!Number.isFinite(next)) return;

                            if (next > q.max) {
                              e.currentTarget.setCustomValidity(`Max mark is ${q.max}`);
                              e.currentTarget.reportValidity();
                              window.setTimeout(() => e.currentTarget.setCustomValidity(''), 0);
                              return;
                            }

                            e.currentTarget.setCustomValidity('');
                            setQuestionMark(s.id, q.key, next);
                          }}
                        />
                      </td>
                    ))}

                    <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }} title={serverTotal != null ? `Server total: ${serverTotal}` : undefined}>
                      {total}
                    </td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <span className="obe-pct-badge">{pct(co1, effectiveCoMax.a)}</span>
                    </td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <span className="obe-pct-badge">{pct(co2, effectiveCoMax.b)}</span>
                    </td>

                    {visibleBtls.map((n) => (
                      <React.Fragment key={`btl-row-${s.id}-${n}`}>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{btl[n as 1 | 2 | 3 | 4 | 5 | 6]}</td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>
                          <span className="obe-pct-badge">{pct(btl[n as 1 | 2 | 3 | 4 | 5 | 6], effectiveBtlMax[n as 1 | 2 | 3 | 4 | 5 | 6])}</span>
                        </td>
                      </React.Fragment>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </PublishLockOverlay>

          {tableBlocked && !globalLocked ? (
            <>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: isPublished ? 'rgba(240,253,244,0.55)' : 'rgba(239,246,255,0.65)',
                  border: `1px solid ${isPublished ? 'rgba(22,163,74,0.25)' : 'rgba(59,130,246,0.25)'}`,
                  borderRadius: 12,
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
                  width: 320,
                  background: '#fff',
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
                    {isPublished ? 'Marks are published. Use View to inspect or Request Edit to ask IQAC for access.' : 'Confirm the Mark Manager to unlock student entry.'}
                  </div>
                  {isPublished && editRequestMessage ? <div style={{ marginTop: 8, fontSize: 12, color: '#065f46' }}>{editRequestMessage}</div> : null}
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
                      <button className="obe-btn" onClick={() => setViewMarksModalOpen(true)}>
                        View
                      </button>
                      <button
                        className="obe-btn obe-btn-success"
                        onClick={async () => {
                          await openEditRequestModal();
                        }}
                        disabled={editRequestBusy || markEntryReqPending}
                      >
                        {markEntryReqPending ? 'Request Pending' : 'Request Edit'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

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
            <div style={{ width: 'min(760px,96vw)', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 14 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>{markManagerModal.mode === 'confirm' ? `Confirmation - ${assessmentLabel}` : `Request Edit - ${assessmentLabel}`}</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{String(subjectId || '')}</div>
            </div>

            {markManagerModal.mode === 'confirm' ? (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Confirm the selected BTL settings. After confirming, Mark Manager will be locked and the table will be editable.</div>

                {/* Questions / Marks / BTL selectors removed as requested */}

                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        <th style={{ textAlign: 'left', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>Question</th>
                        <th style={{ textAlign: 'right', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>Max</th>
                        <th style={{ textAlign: 'right', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>BTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q) => (
                        <tr key={q.key}>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>{q.label}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{q.max}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                            <select
                              value={((sheet.questionBtl || ({} as any))[q.key] === '' ? '' : String((sheet.questionBtl || ({} as any))[q.key])) as any}
                              onChange={(e) => {
                                const v = e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6);
                                setQuestionBtl(q.key, v as any);
                              }}
                              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff' }}
                              disabled={markManagerBusy || globalLocked}
                            >
                              <option value="">-</option>
                              {[1, 2, 3, 4, 5, 6].map((n) => (
                                <option key={n} value={String(n)}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </td>
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
        </ModalPortal>
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
              zIndex: 60,
            }}
            onClick={() => setViewMarksModalOpen(false)}
          >
            <div style={{ width: 'min(1100px, 96vw)', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 0, display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
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
              {publishedViewLoading ? <div style={{ color: '#6b7280' }}>Loading published sheet…</div> : null}
              {publishedViewError ? <div style={{ color: '#991b1b', fontSize: 12, marginBottom: 8 }}>{publishedViewError}</div> : null}
            </div>

            {publishedViewSheet && (publishedViewSheet.rowsByStudentId || publishedViewSheet.rows_by_student_id) ? (
              <div ref={publishedViewTableRef} style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, maxHeight: '60vh' }}>
                <table className="obe-table" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={cellTh} colSpan={6 + visibleBtls.length * 2}>
                        {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {assessmentLabel} (PUBLISHED)
                      </th>
                    </tr>
                    <tr>
                      <th style={{ ...cellTh, width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH }}>S.No</th>
                      <th style={{ ...cellTh, minWidth: 70, overflow: 'visible', textOverflow: 'clip' }}>R.No</th>
                      <th style={{ ...cellTh, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }}>Name of the Students</th>
                      <th style={cellTh}>Total</th>
                      <th style={cellTh} colSpan={2}>CO-{coPair.a}</th>
                      <th style={cellTh} colSpan={2}>CO-{coPair.b}</th>
                      {visibleBtls.map((n) => (
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
                      {Array.from({ length: 2 + visibleBtls.length }).flatMap((_, i) => (
                        <React.Fragment key={`pv_hdr_${i}`}>
                          <th style={cellTh}>Mark</th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => {
                      const publishedRows = (publishedViewSheet.rowsByStudentId || publishedViewSheet.rows_by_student_id || {}) as any;
                      const row = publishedRows[String(s.id)] || publishedRows[s.id] || {};
                      const qObj = row.q || {};
                      const qMarks = Object.fromEntries(questions.map((q) => [q.key, clamp(Number(qObj?.[q.key] || 0), 0, q.max)])) as Record<string, number>;
                      const total = questions.reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0);

                      let coA = 0;
                      let coB = 0;
                      for (let qi = 0; qi < questions.length; qi++) {
                        const q = questions[qi];
                        const w = effectiveCoWeightsForQuestion(questions, qi, coPair);
                        const m = Number(qMarks[q.key] || 0);
                        coA += m * w.a;
                        coB += m * w.b;
                      }

                      const btl: Record<1 | 2 | 3 | 4 | 5 | 6, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
                      for (const q of questions) {
                        const v = (publishedViewSheet.questionBtl || publishedViewSheet.question_btl || sheet.questionBtl || ({} as any))[q.key];
                        if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) {
                          const vi = v as 1 | 2 | 3 | 4 | 5 | 6;
                          btl[vi] += Number(qMarks[q.key] || 0);
                        }
                      }

                      return (
                        <tr key={`pv_${s.id}`}>
                          <td style={{ ...cellTd, textAlign: 'center', width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH, paddingLeft: 2, paddingRight: 2 }}>{i + 1}</td>
                          <td style={{ ...cellTd, minWidth: 70, overflow: 'visible', textOverflow: 'clip' }}>{shortenRegisterNo(row.reg_no || sheet.rowsByStudentId[String(s.id)]?.reg_no || '')}</td>
                          <td style={{ ...cellTd, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }}>{s.name}</td>
                          <td style={{ ...cellTd, textAlign: 'center', fontWeight: 900 }}>{total}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{Math.round(coA)}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}><span className="obe-pct-badge">{pct(coA, effectiveCoMax.a)}</span></td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{Math.round(coB)}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}><span className="obe-pct-badge">{pct(coB, effectiveCoMax.b)}</span></td>
                          {visibleBtls.map((n) => (
                            <React.Fragment key={`pv_btl_${s.id}_${n}`}>
                              <td style={{ ...cellTd, textAlign: 'center' }}>{Math.round(btl[n as 1 | 2 | 3 | 4 | 5 | 6])}</td>
                              <td style={{ ...cellTd, textAlign: 'center' }}><span className="obe-pct-badge">{pct(btl[n as 1 | 2 | 3 | 4 | 5 | 6], effectiveBtlMax[n as 1 | 2 | 3 | 4 | 5 | 6])}</span></td>
                            </React.Fragment>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : publishedViewLoading ? null : (
              <div style={{ color: '#6b7280' }}>No published sheet found.</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="obe-btn" onClick={() => setViewMarksModalOpen(false)}>
                Close
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
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{assessmentLabel} • {String(subjectId || '')}</div>
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
    </AssessmentContainer>
  );
}

function shortenRegisterNo(registerNo: string): string {
  return registerNo.slice(-8);
}
