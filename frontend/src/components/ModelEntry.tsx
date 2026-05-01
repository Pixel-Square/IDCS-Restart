import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { lsGet, lsSet } from '../utils/localStorage';
import { normalizeObeClassType, isEnglishOrForeignLangClassType } from '../constants/classTypes';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import * as OBE from '../services/obe';
import { ensureMobileVerified } from '../services/auth';
import { formatRemaining, usePublishWindow } from '../hooks/usePublishWindow';
import { useMarkTableLock } from '../hooks/useMarkTableLock';
import { useEditWindow } from '../hooks/useEditWindow';
import { useEditRequestPending } from '../hooks/useEditRequestPending';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { ModalPortal } from './ModalPortal';
import AssessmentContainer from './containers/AssessmentContainer';
import { useMarkEntryEditRequestsEnabled } from '../utils/requestControl';
import { normalizeRegisterNo, registerNoKeys } from '../utils/excelImport';
import { clearLocalDraftCache } from '../utils/obeDraftCache';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  classType?: string | null;
  questionPaperType?: string | null;
  customQuestions?: Array<{ key: string; label: string; max: number }> | null;
};

type BtlValue = '' | 1 | 2 | 3 | 4 | 5 | 6;

type CellNumber = '' | number;

type AbsenceKind = 'AL' | 'ML' | 'SKL';

type TcplRowEntry = {
  absent?: boolean;
  absentKind?: AbsenceKind;
  lab?: CellNumber;
  q?: Record<string, CellNumber>;
  recordMarksCo5?: (number | '')[];
};

type TcplSheetState = Record<string, TcplRowEntry>;

type QuestionDef = {
  key: string;
  label: string;
  max: number;
};

// Keep the same default question layout as CIA for a familiar sheet template.
const DEFAULT_MODEL_QUESTIONS: QuestionDef[] = [
  { key: 'q1', label: 'Q1', max: 2 },
  { key: 'q2', label: 'Q2', max: 2 },
  { key: 'q3', label: 'Q3', max: 2 },
  { key: 'q4', label: 'Q4', max: 2 },
  { key: 'q5', label: 'Q5', max: 2 },
  { key: 'q6', label: 'Q6', max: 2 },
  { key: 'q7', label: 'Q7', max: 16 },
  { key: 'q8', label: 'Q8', max: 16 },
  { key: 'q9', label: 'Q9', max: 16 },
];

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

function normalizeHeaderCell(v: any): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export default function ModelEntry({ subjectId, classType, teachingAssignmentId, questionPaperType, customQuestions: customQuestionsProp }: Props) {
  

  const normalizeAbsenceKind = (value: unknown): AbsenceKind => {
    const s = String(value ?? 'AL')
      .trim()
      .toUpperCase();
    if (s === 'ML' || s === 'MALPRACTICE') return 'ML';
    if (s === 'SKL' || s === 'SICK' || s === 'SICKLEAVE' || s === 'SL') return 'SKL';
    return 'AL';
  };

  const showMarkLimitPopup = (input: HTMLInputElement, message: string, student?: { name?: string; reg_no?: string }) => {
    const who = student ? `${student.name || 'Student'} (${student.reg_no || ''}) — ` : '';
    setLimitDialog({ title: 'Mark Limit Exceeded', message: `${who}${message}` });
    input.setCustomValidity('');
  };

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

  const SNO_COL_WIDTH = 32;

  const normalizeRegDigits = (value: string): string => String(value || '').replace(/\D/g, '');
  const compareByRegLast3 = (aRaw: unknown, bRaw: unknown) => {
    const aLast3 = parseInt(String(aRaw || '').slice(-3), 10);
    const bLast3 = parseInt(String(bRaw || '').slice(-3), 10);
    return (isNaN(aLast3) ? 9999 : aLast3) - (isNaN(bLast3) ? 9999 : bLast3);
  };

  const [students, setStudents] = useState<TeachingAssignmentRosterStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resettingMarks, setResettingMarks] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  // Avoid leaking published state across subject/assignment switches.
  useEffect(() => {
    setPublishedAt(null);
  }, [subjectId, teachingAssignmentId]);
  const [publishedViewSnapshot, setPublishedViewSnapshot] = useState<any | null>(null);
  const [publishedViewLoading, setPublishedViewLoading] = useState(false);
  const [publishedViewError, setPublishedViewError] = useState<string | null>(null);
  const publishedAutoFetchOnceRef = useRef(false);
  const [autosaveReady, setAutosaveReady] = useState(false);
  const suppressAutosaveRef = useRef(false);
  const [showAbsenteesOnly, setShowAbsenteesOnly] = useState(false);
  const [absenteesSnapshotKeys, setAbsenteesSnapshotKeys] = useState<string[] | null>(null);
  const [alphaOrderEnabled, setAlphaOrderEnabled] = useState(false);
  const [digitFilterEnabled, setDigitFilterEnabled] = useState(false);
  const [digitFilterLength, setDigitFilterLength] = useState<3 | 8>(3);
  const [digitFilterValue, setDigitFilterValue] = useState('');
  const [limitDialog, setLimitDialog] = useState<{ title: string; message: string } | null>(null);
  const [tcplSheet, setTcplSheet] = useState<TcplSheetState>({});
  const [theorySheet, setTheorySheet] = useState<TcplSheetState>({});
  const [tcplModelRecordEnabled, setTcplModelRecordEnabled] = useState(false);
  const [tcplModelRecordExpCount, setTcplModelRecordExpCount] = useState(3);
  const [tcplModelRecordMaxPerExp, setTcplModelRecordMaxPerExp] = useState(10);
  const [iqacPattern, setIqacPattern] = useState<{ marks: number[]; cos?: Array<number | string> } | null>(null);
  const [iqacPatternLoading, setIqacPatternLoading] = useState(false);
  const [iqacPatternError, setIqacPatternError] = useState<string | null>(null);

  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  const [publishedEditModalOpen, setPublishedEditModalOpen] = useState(false);
  const [editRequestReason, setEditRequestReason] = useState('');
  const [editRequestBusy, setEditRequestBusy] = useState(false);

  const [lockedViewOpen, setLockedViewOpen] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  const normalizedClassType = useMemo(() => normalizeObeClassType(classType), [classType]);
  const isTheory = normalizedClassType === 'THEORY';
  const isSpecial = normalizedClassType === 'SPECIAL';
  const isEnglishLike = isEnglishOrForeignLangClassType(normalizedClassType);

  const {
    data: publishWindow,
    loading: publishWindowLoading,
    error: publishWindowError,
    remainingSeconds,
    publishAllowed,
    editAllowed,
    refresh: refreshPublishWindow,
  } = usePublishWindow({
    assessment: 'model',
    subjectCode: subjectId,
    teachingAssignmentId,
  });

  const { data: markLock, refresh: refreshMarkLock } = useMarkTableLock({
    assessment: 'model',
    subjectCode: String(subjectId || ''),
    teachingAssignmentId,
    options: { poll: false },
  });

  const { data: markEntryEditWindow, refresh: refreshMarkEntryEditWindow } = useEditWindow({
    assessment: 'model',
    subjectCode: String(subjectId || ''),
    scope: 'MARK_ENTRY',
    teachingAssignmentId,
    options: { poll: false },
  });

  // Published must be derived from the authoritative lock state.
  // The `*-published` endpoint returns a JSON shape even when empty, so
  // `publishedViewSnapshot` is NOT a reliable signal for publish status.
  const isPublished = Boolean(publishedAt) || Boolean(markLock?.exists && markLock?.is_published);

  // Restore publishedAt from backend when markLock indicates the sheet was published.
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
  const editRequestsEnabled = useMarkEntryEditRequestsEnabled();
  const approvalOpen = Boolean(markEntryEditWindow?.allowed_by_approval);
  const entryOpen = !isPublished ? Boolean(editAllowed) : !editRequestsEnabled || Boolean(markLock?.entry_open) || approvalOpen;
  const publishedEditLocked = Boolean(isPublished && editRequestsEnabled && !entryOpen);
  const editRequestsBlocked = Boolean(isPublished && publishedEditLocked && !editRequestsEnabled);

  const publishButtonIsRequestEdit = Boolean(isPublished && publishedEditLocked && editRequestsEnabled);

  const {
    pending: markEntryReqPending,
    pendingUntilMs: markEntryReqPendingUntilMs,
    setPendingUntilMs: setMarkEntryReqPendingUntilMs,
    refresh: refreshMarkEntryReqPending,
  } = useEditRequestPending({
    enabled: Boolean(publishButtonIsRequestEdit) && Boolean(subjectId),
    assessment: 'model' as any,
    subjectCode: subjectId ? String(subjectId) : null,
    scope: 'MARK_ENTRY',
    teachingAssignmentId,
  });

  useLockBodyScroll(Boolean(publishedEditModalOpen));

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

  // Table blocked semantics: mirror other sheets
  // - If globally locked, table blocked
  // - If published, table blocked when entry is not open
  // - If not published, table is not blocked (no mark-manager on model)
  const tableBlocked = Boolean(globalLocked || (isPublished ? (editRequestsEnabled && !entryOpen) : false));

  useEffect(() => {
    // Reset the locked-view toggle when switching subjects or when editing becomes open.
    setLockedViewOpen(false);
  }, [subjectId, teachingAssignmentId, publishedEditLocked]);

  const qpTypeStorageKey = useMemo(
    () => `model_qp_type_${subjectId}_${String(teachingAssignmentId ?? 'none')}`,
    [subjectId, teachingAssignmentId],
  );
  const [qpType, setQpType] = useState<string>('');
  const normalizedQpType = useMemo(() => String(qpType ?? '').trim().toUpperCase(), [qpType]);
  const isTcprByQp = normalizedQpType === 'TCPR';
  const isTcplLike = normalizedClassType === 'TCPL' || normalizedClassType === 'TCPR' || isTcprByQp;
  const tcplLikeKind = normalizedClassType === 'TCPR' || isTcprByQp ? 'TCPR' : 'TCPL';

  useEffect(() => {
    const norm = (v: any) => {
      const s = String(v ?? '').trim().toUpperCase();
      // TCPR is a class_type used as a legacy QP type marker — keep the guard.
      if (s === 'TCPR') return 'TCPR';
      // Pass through any non-empty code so DB-managed types work correctly.
      return s || '';
    };

    // Prefer the course/header-provided QP (so changes in the header reflect here).
    const incoming = norm(questionPaperType);
    if (incoming) {
      setQpType(incoming);
      try {
        lsSet(qpTypeStorageKey, incoming);
      } catch {
        // ignore
      }
      return;
    }

    // Fallback to last local selection for this sheet.
    const stored = lsGet<string>(qpTypeStorageKey);
    const fromStorage = norm(stored);
    setQpType(fromStorage || 'QP1');
  }, [qpTypeStorageKey, questionPaperType]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      let classKey = String(normalizedClassType || '').trim().toUpperCase();
      if (classKey.startsWith('THEORY')) classKey = 'THEORY';
      if (!classKey) {
        setIqacPattern(null);
        setIqacPatternLoading(false);
        setIqacPatternError(null);
        return;
      }

      // Pass through any non-empty QP code so DB-managed types work.
      // Use empty string only for null/non-THEORY contexts (qpForApi null-coalesces it).
      const qpKey = String(normalizedQpType || '').trim();
      const qpForApi = classKey === 'THEORY' ? (qpKey ? qpKey : null) : null;

      setIqacPatternLoading(true);
      setIqacPatternError(null);
      try {
        const res = await OBE.fetchIqacQpPattern({
          class_type: classKey,
          question_paper_type: qpForApi,
          exam: 'MODEL',
        });
        const p = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
        if (!alive) return;
        setIqacPattern(p.length ? (res.pattern as any) : null);
        setIqacPatternError(null);
      } catch (e: any) {
        if (!alive) return;
        setIqacPattern(null);
        setIqacPatternError(String(e?.message || e || 'Failed to load QP pattern'));
      } finally {
        if (alive) setIqacPatternLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [normalizedClassType, normalizedQpType]);

  const questions = useMemo<QuestionDef[]>(() => {
    // SPECIAL courses: use custom questions from popup if provided
    if (Array.isArray(customQuestionsProp) && customQuestionsProp.length) {
      return customQuestionsProp.map((q, i) => ({
        key: q.key || `q${i + 1}`,
        label: q.label || `Q${i + 1}`,
        max: Number(q.max) || 0,
      }));
    }

    const marks = Array.isArray((iqacPattern as any)?.marks) ? (iqacPattern as any).marks : null;
    if (Array.isArray(marks) && marks.length) {
      return marks.map((max, idx) => ({
        key: `q${idx + 1}`,
        label: `Q${idx + 1}`,
        max: Number(max) || 0,
      }));
    }
    return DEFAULT_MODEL_QUESTIONS;
  }, [iqacPattern, customQuestionsProp]);

  /** Unique CO numbers derived from iqacPattern.cos for the blank template (ENGLISH etc.) */
  const blankTemplateCos = useMemo((): number[] => {
    const cos = Array.isArray((iqacPattern as any)?.cos) ? (iqacPattern as any).cos : null;
    if (!cos || !cos.length) return [1, 2];
    const unique: number[] = [];
    for (const c of cos) {
      const n = Number(c);
      if (n >= 1 && n <= 6 && !unique.includes(n)) unique.push(n);
    }
    unique.sort((a, b) => a - b);
    return unique.length ? unique : [1, 2];
  }, [iqacPattern]);

  /** Per-CO max marks for blank template (ENGLISH etc.) */

  const blankTemplateQuestionBtlStorageKey = useMemo(() => `model_blank_questionBtl_${subjectId}_${String(teachingAssignmentId ?? 'none')}`, [subjectId, teachingAssignmentId]);
  const defaultBlankTemplateQuestionBtl = useMemo(() => {
    return Object.fromEntries(
      questions.map((q) => [q.key, '' as BtlValue])
    ) as Record<string, BtlValue>;
  }, [questions]);

  const [blankTemplateQuestionBtl, setBlankTemplateQuestionBtl] = useState<Record<string, BtlValue>>(defaultBlankTemplateQuestionBtl);

  useEffect(() => {
    if (!isSpecial && !isEnglishLike) return; // blank template (SPECIAL / ENGLISH / FOREIGN_LANG)
    const stored = lsGet<Record<string, BtlValue>>(blankTemplateQuestionBtlStorageKey);
    if (stored && typeof stored === 'object') {
      setBlankTemplateQuestionBtl({
        ...defaultBlankTemplateQuestionBtl,
        ...stored,
      });
    } else {
      setBlankTemplateQuestionBtl(defaultBlankTemplateQuestionBtl);
    }
  }, [isSpecial, isEnglishLike, blankTemplateQuestionBtlStorageKey, defaultBlankTemplateQuestionBtl]);

  const setBlankTemplateBtl = (qKey: string, value: BtlValue) => {
    setBlankTemplateQuestionBtl((prev) => {
      const next = { ...(prev || {}), [qKey]: value };
      lsSet(blankTemplateQuestionBtlStorageKey, next);
      return next;
    });
  };

  const blankTemplateBtlRow = useMemo(() => {
    return questions.map((q) => {
      const v = (blankTemplateQuestionBtl || ({} as any))[q.key];
      if (v === '' || v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) return v;
      return '' as BtlValue;
    });
  }, [questions, blankTemplateQuestionBtl]);

  const blankTemplateBtlMaxRow = useMemo(() => {
    const btlMax: number[] = [0, 0, 0, 0, 0, 0];
    questions.forEach((q, i) => {
      const b = blankTemplateBtlRow[i];
      if (typeof b === 'number' && b >= 1 && b <= 6) btlMax[b - 1] += q.max;
    });
    return btlMax;
  }, [questions, blankTemplateBtlRow]);

  const visibleBtls = useMemo(() => {
    const set = new Set<number>();
    questions.forEach((q) => {
      const b = (blankTemplateQuestionBtl || ({} as any))[q.key] ?? '';
      if (b === 1 || b === 2 || b === 3 || b === 4 || b === 5 || b === 6) set.add(b);
    });
    if (set.size === 0) return [1, 2, 3, 4, 5, 6] as const;
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n)) as Array<1 | 2 | 3 | 4 | 5 | 6>;
  }, [questions, blankTemplateQuestionBtl]);


const blankTemplateCoMax = useMemo((): Record<number, number> => {
    const cos = Array.isArray((iqacPattern as any)?.cos) ? (iqacPattern as any).cos : null;
    const marks = Array.isArray((iqacPattern as any)?.marks) ? (iqacPattern as any).marks : null;
    const sums: Record<number, number> = {};
    for (const c of blankTemplateCos) sums[c] = 0;
    if (!cos || !marks) return sums;
    for (let i = 0; i < Math.min(cos.length, marks.length, questions.length); i++) {
      const c = Number(cos[i]);
      if (c >= 1 && c <= 6 && sums[c] != null) sums[c] += Number(marks[i] || 0);
    }
    return sums;
  }, [iqacPattern, blankTemplateCos, questions.length]);

  const colSpan = 4 + questions.length + 1 + blankTemplateCos.length * 2 + visibleBtls.length * 2;

  const activeSheet: TcplSheetState = isTcplLike ? (tcplSheet || {}) : (theorySheet || {});

  const excelInputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: 0,
    margin: 0,
    fontSize: 11,
    textAlign: 'center',
  };

  const loadRoster = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!teachingAssignmentId) {
      setStudents([]);
      if (!silent) setError(null);
      return;
    }
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      // Always use TA roster (backend handles batch filtering for electives)
      const res = await fetchTeachingAssignmentRoster(teachingAssignmentId);
      const roster = (res?.students || []) as TeachingAssignmentRosterStudent[];
      const sorted = [...roster].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      setStudents(sorted);
    } catch (e: any) {
      setStudents([]);
      if (!silent) setError(e?.message || 'Failed to load roster');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachingAssignmentId]);

  type ModelDraftPayload = {
    version: 1;
    qpType: string;
    classType: string;
    tcplLikeKind: 'TCPR' | 'TCPL';
    theoryQuestionBtl: Record<string, BtlValue>;
    blankTemplateQuestionBtl?: Record<string, BtlValue>;
    tcplQuestionBtl: Record<string, BtlValue>;
    theorySheet: TcplSheetState;
    tcplSheet: TcplSheetState;
    recordMarksForCo5?: { enabled: boolean; expCount: number; maxPerExp: number } | null;
  };

  const buildPayload = (): ModelDraftPayload => {
    return {
      version: 1,
      qpType: String(qpType ?? ''),
      classType: String(normalizedClassType ?? ''),
      tcplLikeKind,
      theoryQuestionBtl: (theoryQuestionBtl || {}) as Record<string, BtlValue>,
      blankTemplateQuestionBtl: (blankTemplateQuestionBtl || {}) as Record<string, BtlValue>,
      tcplQuestionBtl: (tcplQuestionBtl || {}) as Record<string, BtlValue>,
      theorySheet: (theorySheet || {}) as TcplSheetState,
      tcplSheet: (tcplSheet || {}) as TcplSheetState,
      recordMarksForCo5: isTcplLike && !tcplReviewIsCo5
        ? { enabled: tcplModelRecordEnabled, expCount: tcplModelRecordExpCount, maxPerExp: tcplModelRecordMaxPerExp }
        : null,
    };
  };

  // Keep a ref that always points to the latest buildPayload closure so the
  // obe:before-tab-switch handler (which has stable deps) always sends fresh data.
  const buildPayloadRef = useRef<() => ModelDraftPayload>(buildPayload);
  useEffect(() => {
    buildPayloadRef.current = buildPayload;
  }); // no deps → runs every render

  const applyPayload = (raw: any) => {
    if (!raw || typeof raw !== 'object') return;
    // Avoid auto-saving immediately when hydrating from server.
    suppressAutosaveRef.current = true;

    const nextQpType = typeof raw.qpType === 'string' ? raw.qpType : null;
    // IMPORTANT:
    // The course/header-provided QP type (from DB) must be the source of truth.
    // Previously, loading an old draft could override the header QP (e.g. header shows QP1FINAL
    // but draft had qpType=QP1), causing the wrong IQAC pattern/questions to be used.
    // Only hydrate qpType from the draft when the course did NOT provide any QP type.
    const courseQpRaw = String(questionPaperType ?? '').trim().toUpperCase();
    const courseQp = courseQpRaw === 'TCPR' ? 'TCPR' : courseQpRaw;
    const canHydrateQpFromDraft = !courseQp;
    if (canHydrateQpFromDraft && nextQpType != null) {
      // Accept any code from draft payload; do not clamp to QP1/QP2 only.
      const v = String(nextQpType || '').trim().toUpperCase();
      const next = v || 'QP1';
      setQpType(next);
      try {
        lsSet(qpTypeStorageKey, next);
      } catch {
        // ignore
      }
    }

    if (raw.blankTemplateQuestionBtl && typeof raw.blankTemplateQuestionBtl === 'object') {
      setBlankTemplateQuestionBtl({
        ...defaultBlankTemplateQuestionBtl,
        ...(raw.blankTemplateQuestionBtl as Record<string, BtlValue>),
      });
      try {
        lsSet(blankTemplateQuestionBtlStorageKey, {
          ...defaultBlankTemplateQuestionBtl,
          ...(raw.blankTemplateQuestionBtl as Record<string, BtlValue>),
        });
      } catch {}
    }

    if (raw.theoryQuestionBtl && typeof raw.theoryQuestionBtl === 'object') {
      setTheoryQuestionBtl({
        ...defaultTheoryQuestionBtl,
        ...(raw.theoryQuestionBtl as Record<string, BtlValue>),
      });
      try {
        lsSet(theoryQuestionBtlStorageKey, {
          ...defaultTheoryQuestionBtl,
          ...(raw.theoryQuestionBtl as Record<string, BtlValue>),
        });
      } catch {
        // ignore
      }
    }

    if (raw.tcplQuestionBtl && typeof raw.tcplQuestionBtl === 'object') {
      setTcplQuestionBtl({
        ...defaultTcplQuestionBtl,
        ...(raw.tcplQuestionBtl as Record<string, BtlValue>),
      });
      try {
        lsSet(tcplQuestionBtlStorageKey, {
          ...defaultTcplQuestionBtl,
          ...(raw.tcplQuestionBtl as Record<string, BtlValue>),
        });
      } catch {
        // ignore
      }
    }

    if (raw.tcplSheet && typeof raw.tcplSheet === 'object') {
      setTcplSheet(raw.tcplSheet as TcplSheetState);
      try {
        lsSet(tcplSheetStorageKey, raw.tcplSheet);
      } catch {
        // ignore
      }
    }

    if (raw.recordMarksForCo5 && typeof raw.recordMarksForCo5 === 'object') {
      setTcplModelRecordEnabled(Boolean((raw.recordMarksForCo5 as any).enabled));
      const ec = Number((raw.recordMarksForCo5 as any).expCount);
      setTcplModelRecordExpCount(Number.isFinite(ec) && ec >= 1 ? Math.floor(ec) : 3);
      const mpe = Number((raw.recordMarksForCo5 as any).maxPerExp);
      setTcplModelRecordMaxPerExp(Number.isFinite(mpe) && mpe > 0 ? mpe : 10);
    }

    if (raw.theorySheet && typeof raw.theorySheet === 'object') {
      setTheorySheet(raw.theorySheet as TcplSheetState);
      try {
        lsSet(theorySheetStorageKey, raw.theorySheet);
      } catch {
        // ignore
      }
    }

    // Re-enable autosave on the next tick after state updates settle.
    window.setTimeout(() => {
      suppressAutosaveRef.current = false;
    }, 0);
  };

  const loadDraftFromDb = async (opts?: { silent?: boolean }) => {
    if (!subjectId) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setRefreshing(true);
    if (!silent) setActionError(null);
    try {
      const resp = await OBE.fetchDraft<any>('model', subjectId, teachingAssignmentId);
      if (resp?.draft) applyPayload(resp.draft);
      setSavedAt(resp?.updated_at ? new Date(resp.updated_at).toLocaleString() : null);
      const by = resp?.updated_by;
      setSavedBy(typeof by?.name === 'string' ? by.name : typeof by?.username === 'string' ? by.username : null);
    } catch (e: any) {
      if (!silent) setActionError(e?.message || 'Failed to refresh draft');
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  useEffect(() => {
    // Load server draft on entry so previously saved MODEL drafts appear.
    setAutosaveReady(false);
    let mounted = true;
    (async () => {
      try {
        await loadDraftFromDb({ silent: true });
      } finally {
        if (mounted) setAutosaveReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, teachingAssignmentId]);

  const refreshAll = async () => {
    setRefreshing(true);
    setActionError(null);
    try {
      await Promise.all([
        loadRoster({ silent: true }),
        loadDraftFromDb({ silent: true }),
        refreshPublishWindow({ silent: true }),
        refreshMarkLock({ silent: true }),
      ]);
      // Best-effort: if published already, refresh the published snapshot for viewing.
      try {
        await refreshPublishedSnapshot(false);
      } catch {
        // ignore
      }
    } catch (e: any) {
      setActionError(e?.message || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const saveLocal = () => {
    try {
      lsSet(qpTypeStorageKey, String(qpType ?? ''));
      lsSet(blankTemplateQuestionBtlStorageKey, blankTemplateQuestionBtl);
      lsSet(theoryQuestionBtlStorageKey, theoryQuestionBtl);
      lsSet(tcplQuestionBtlStorageKey, tcplQuestionBtl);
      lsSet(tcplSheetStorageKey, tcplSheet);
      lsSet(theorySheetStorageKey, theorySheet);
      alert('Saved locally.');
    } catch (e: any) {
      alert(e?.message || 'Local save failed');
    }
  };

  const saveDraftToDb = async () => {
    if (!subjectId) return;
    setSavingDraft(true);
    setActionError(null);
    try {
      await OBE.saveDraft('model', subjectId, buildPayload(), teachingAssignmentId);
      setSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setActionError(e?.message || 'Draft save failed');
    } finally {
      setSavingDraft(false);
    }
  };

  const resetAllMarks = async () => {
    if (!subjectId) return;
    // Only show this action while publish window is open (per requirement).
    if (!publishAllowed || globalLocked) return;
    if (tableBlocked || publishedEditLocked) return;
    const ok = window.confirm('Reset Model marks for all students? This clears the saved draft.');
    if (!ok) return;

    setResettingMarks(true);
    setActionError(null);
    try {
      // Clear local caches first so we don't rehydrate old values.
      clearLocalDraftCache(String(subjectId), 'model', teachingAssignmentId ?? null);

      const clearedTheory: TcplSheetState = {};
      const clearedTcpl: TcplSheetState = {};
      const emptyTheoryQ = Object.fromEntries(theoryQuestions.map((q) => [q.key, '' as CellNumber]));
      const emptyTcplQ = Object.fromEntries(tcplQuestions.map((q) => [q.key, '' as CellNumber]));

      for (const s of students) {
        const sid = String(s.id);
        clearedTheory[sid] = { absent: false, absentKind: undefined, q: { ...emptyTheoryQ } };
        clearedTcpl[sid] = { absent: false, absentKind: undefined, lab: '', q: { ...emptyTcplQ }, recordMarksCo5: [] };
      }

      setTheorySheet(clearedTheory);
      setTcplSheet(clearedTcpl);

      try {
        await OBE.resetAssessmentMarks('model', String(subjectId), teachingAssignmentId ?? undefined);
      } catch (e: any) {
        const status = Number((e as any)?.status || 0);
        const msg = String(e?.message || '');
        const routeMissing = status === 404 || /\b404\b|not\s*found/i.test(msg);
        if (!routeMissing) throw e;
        console.warn('Backend rejected native model assessment reset, gracefully falling back to draft reset:', msg);
      }

      await OBE.saveDraft(
        'model',
        String(subjectId),
        {
          ...buildPayload(),
          theorySheet: clearedTheory,
          tcplSheet: clearedTcpl,
        } as any,
        teachingAssignmentId,
      );
      setSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setActionError(e?.message || 'Failed to reset marks');
    } finally {
      setResettingMarks(false);
    }
  };

  // Auto-save draft when switching tabs — uses ref so handler always has latest state
  useEffect(() => {
    const handler = () => {
      if (!subjectId || publishedEditLocked) return;
      OBE.saveDraft('model', subjectId, buildPayloadRef.current(), teachingAssignmentId).catch(() => {});
    };
    window.addEventListener('obe:before-tab-switch', handler);
    return () => window.removeEventListener('obe:before-tab-switch', handler);
  }, [subjectId, publishedEditLocked, teachingAssignmentId]);

  const publish = async () => {
    if (!subjectId) return;

    if (globalLocked) {
      setActionError('Publishing is locked by IQAC.');
      return;
    }
    if (!publishAllowed) {
      setActionError('Publish window is closed. Please request IQAC approval.');
      return;
    }

    // If already published and locked, use Publish action as the entry-point to request edits.
    if (isPublished && publishedEditLocked) {
      if (markEntryReqPending) {
        setActionError('Edit request is pending. Please wait for approval.');
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
    setActionError(null);
    try {
      const coMarksTarget = students.map((s, idx) => {
        const rowKey = getRowKey(s as any, idx);
        const row = (activeSheet || ({} as any))[rowKey] || ({} as TcplRowEntry);
        
        const absent = Boolean(row.absent);
        const kind = absent ? normalizeAbsenceKind((row as any).absentKind) : null;
        const assignedTotal = absent && kind === 'AL' ? 0 : null;

        const qMarks: Record<string, number> = {};
        const defs = getQuestionDefsForSheet();
        defs.forEach((q) => {
          const v = ((row.q || {}) as Record<string, CellNumber>)[q.key] ?? '';
          const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
          qMarks[q.key] = Math.max(0, Math.min(q.max, n));
        });
        const qTotal = Object.values(qMarks).reduce((sum, n) => sum + n, 0);

        let labNum = 0;
        let coCount = theoryCoCount;
        let cosRow = theoryCosRow;
        let coMaxRow = theoryCoMaxRow;

        if (isTcplLike) {
          const lv = (row as any).lab ?? '';
          labNum = typeof lv === 'number' && Number.isFinite(lv) ? Math.max(0, Math.min(tcplLabMax, lv)) : 0;
          coCount = tcplCoCount;
          cosRow = tcplCosRow;
          coMaxRow = tcplCoMaxRow;
        }

        const totalVal = assignedTotal != null ? assignedTotal : qTotal + labNum;

        const coMark: number[] = Array.from({ length: coCount }, () => 0);
        
        if (!isTcplLike) {
          theoryQuestions.forEach((q, i) => {
            const cs = theoryCosRow[i] ?? [1];
            const validCos = Array.isArray(cs) ? cs.filter(c => c >= 1 && c <= coCount) : (typeof cs === 'number' && cs >= 1 && cs <= coCount ? [cs] : []);
            if (validCos.length > 0) {
              const splitVal = (qMarks[q.key] || 0) / validCos.length;
              validCos.forEach(c => coMark[c - 1] += splitVal);
            }
          });
        } else {
          tcplQuestions.forEach((q, i) => {
            const co = tcplCosRow[i] ?? 1;
            if (co >= 1 && co <= coCount) coMark[co - 1] += qMarks[q.key] || 0;
          });
          if (tcplReviewIsCo5) {
            coMark[4] += labNum;
          } else if (tcplModelRecordEnabled) {
            // Record mode: CO1-CO4 equal LAB share; CO5 = CIA(lab×4/30) + (avg/maxPerExp)×2
            for (let i = 0; i < 4; i++) coMark[i] += labNum / tcplCoCount;
            coMark[4] += (labNum / tcplLabMax) * 4.0;
            const _recRaw = ((row.recordMarksCo5 ?? []) as (number | '')[]);
            const _recValid = _recRaw.slice(0, tcplModelRecordExpCount).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
            const _recAvg = _recValid.length > 0 ? _recValid.reduce((a, b) => a + b, 0) / _recValid.length : 0;
            coMark[4] += (_recAvg / tcplModelRecordMaxPerExp) * 2.0;
          } else {
            for (let i = 0; i < coCount; i++) coMark[i] += labNum / coCount;
          }
        }

        const coBreakdown: Record<string, any> = {};
        coMark.forEach((m, i) => {
          const denom = coMaxRow[i] || 0;
          const pct = denom ? (m / denom) * 100 : 0;
          coBreakdown[`co${i + 1}`] = { mark: m, percentage: pct };
        });

        return {
          studentId: (s as any).id,
          total: absent && kind === 'AL' ? 0 : totalVal,
          coBreakdown
        };
      });

      await OBE.publishModelSheet(subjectId, { ...buildPayload(), coMarks: coMarksTarget }, teachingAssignmentId);
      setPublishedAt(new Date().toLocaleString());
      await refreshPublishedSnapshot(false);
      refreshPublishWindow({ silent: true });
      refreshMarkLock({ silent: true });
      try {
        console.debug('obe:published dispatch', { assessment: 'model', subjectId });
        window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId, assessment: 'model' } }));
      } catch {
        // ignore
      }
    } catch (e: any) {
      const status = (e as any)?.status;
      const detail = String((e as any)?.body?.detail || e?.message || '');

      // If the sheet is already published, backend returns 423 (Locked) and instructs to request IQAC approval.
      // UX expectation: do not show this as a publish failure; switch UI into the Published—Locked state.
      if (status === 423) {
        setPublishedAt((prev) => prev || new Date().toLocaleString());
        refreshPublishWindow({ silent: true });
        refreshMarkLock({ silent: true });
        setActionError(null);

        const mobileOk = await ensureMobileVerified();
        if (mobileOk) {
          setPublishedEditModalOpen(true);
        }
        return;
      }

      setActionError(e?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const requestApproval = async () => {
    if (!subjectId) return;
    const reason = String(requestReason || '').trim();
    if (!reason) {
      setActionError('Reason is required.');
      return;
    }
    setRequesting(true);
    setRequestMessage(null);
    setActionError(null);
    try {
      const created = await OBE.createPublishRequest({
        assessment: 'model',
        subject_code: subjectId,
        reason,
        teaching_assignment_id: teachingAssignmentId,
      });
      const routed = String((created as any)?.routed_to || '').trim().toUpperCase();
      const warn = String((created as any)?.routing_warning || '').trim();
      const baseMsg = routed === 'HOD' ? 'Request sent to HOD for approval.' : 'Request sent to IQAC for approval.';
      setRequestMessage(warn ? `${baseMsg} ${warn}` : baseMsg);
    } catch (e: any) {
      setActionError(e?.message || 'Failed to request approval');
    } finally {
      setRequesting(false);
      refreshPublishWindow({ silent: true });
    }
  };

  const requestEdit = async () => {
    if (!subjectId) return;

    const mobileOk = await ensureMobileVerified();
    if (!mobileOk) {
      alert('Please verify your mobile number in Profile before requesting edits.');
      window.location.href = '/profile';
      return;
    }

    if (!editRequestsEnabled) {
      setActionError('Edit requests are disabled by IQAC.');
      return;
    }

    if (markEntryReqPending) {
      setActionError('Edit request is pending. Please wait for approval.');
      return;
    }

    const reason = String(editRequestReason || '').trim();
    if (!reason) {
      setActionError('Reason is required.');
      return;
    }

    setEditRequestBusy(true);
    setActionError(null);
    try {
      const created = await OBE.createEditRequest({
        assessment: 'model',
        subject_code: String(subjectId),
        scope: 'MARK_ENTRY',
        reason,
        teaching_assignment_id: teachingAssignmentId,
      });
      alert(OBE.formatEditRequestSentMessage(created));
      setPublishedEditModalOpen(false);
      setEditRequestReason('');
      setMarkEntryReqPendingUntilMs(Date.now() + 24 * 60 * 60 * 1000);
      try {
        refreshMarkEntryReqPending({ silent: true });
      } catch {
        // ignore
      }
      refreshMarkLock({ silent: true });
      refreshMarkEntryEditWindow({ silent: true });
    } catch (e: any) {
      const msg = OBE.formatApiErrorMessage(e, 'Failed to request edit');
      setActionError(msg);
      alert(`Edit request failed: ${msg}`);
    } finally {
      setEditRequestBusy(false);
    }
  };

  async function refreshPublishedSnapshot(showLoading: boolean, opts?: { applyToMain?: boolean }) {
    if (!subjectId) return;
    if (showLoading) setPublishedViewLoading(true);
    setPublishedViewError(null);
    try {
      const resp = await OBE.fetchPublishedModelSheet(String(subjectId), teachingAssignmentId);
      const data = (resp as any)?.data ?? null;
      const looksLikeModelPayload = Boolean(
        data &&
          typeof data === 'object' &&
          Number((data as any).version) === 1 &&
          (typeof (data as any).classType === 'string' || typeof (data as any).qpType === 'string') &&
          ('theorySheet' in (data as any) || 'tcplSheet' in (data as any)),
      );

      if (looksLikeModelPayload) {
        setPublishedViewSnapshot(data);
        // When published+locked, the main grid should reflect the published snapshot.
        if (opts?.applyToMain || publishedEditLocked) {
          applyPayload(data);
        }
      } else {
        setPublishedViewSnapshot(null);
        if (showLoading || opts?.applyToMain) setPublishedViewError('No published snapshot found.');
      }
    } catch (e: any) {
      if (showLoading || opts?.applyToMain) setPublishedViewError(e?.message || 'Failed to load published sheet');
    } finally {
      if (showLoading) setPublishedViewLoading(false);
    }
  }

  useEffect(() => {
    if (!subjectId) return;
    refreshPublishedSnapshot(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, teachingAssignmentId]);

  useEffect(() => {
    if (!subjectId) return;
    // When the sheet becomes published+locked, load the published snapshot into the table.
    if (!publishedEditLocked) {
      publishedAutoFetchOnceRef.current = false;
      return;
    }

    if (publishedAutoFetchOnceRef.current) return;
    publishedAutoFetchOnceRef.current = true;

    if (publishedViewSnapshot && typeof publishedViewSnapshot === 'object') {
      applyPayload(publishedViewSnapshot);
      return;
    }

    // Show loading/error so users can tell the view is updating.
    refreshPublishedSnapshot(true, { applyToMain: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishedEditLocked, subjectId, teachingAssignmentId]);

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

  const rowsToRender = useMemo(() => {
    let rows: TeachingAssignmentRosterStudent[] = students.length
      ? [...students]
      : (Array.from({ length: 5 }, (_, i) => ({ id: -(i + 1), reg_no: '', name: '', section: null })) as any);

    const digitQuery = normalizeRegDigits(digitFilterValue).slice(0, digitFilterLength);
    if (digitFilterEnabled && digitQuery) {
      rows = rows.filter((s: any) => {
        const regDigits = normalizeRegDigits(String((s as any)?.reg_no || ''));
        const suffix = regDigits.slice(-digitFilterLength);
        return suffix.endsWith(digitQuery);
      }) as any;
    }

    if (alphaOrderEnabled) {
      rows = [...rows].sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || ''))) as any;
    } else {
      rows = [...rows].sort((a: any, b: any) => compareByRegLast3(a?.reg_no, b?.reg_no)) as any;
    }

    return rows;
  }, [students, alphaOrderEnabled, digitFilterEnabled, digitFilterLength, digitFilterValue]);

  const hasAbsentees = useMemo(() => {
    const sheet = activeSheet || {};
    return Object.values(sheet).some((r) => Boolean((r as any)?.absent));
  }, [activeSheet]);

  const tcplQuestions = useMemo(() => {
    // Prefer IQAC-configured QP pattern if present.
    const marks = Array.isArray((iqacPattern as any)?.marks) ? (iqacPattern as any).marks : null;
    if (Array.isArray(marks) && marks.length && isTcplLike) {
      return marks.map((max, i) => ({
        key: `q${i + 1}`,
        label: `Q${i + 1}`,
        max: Number(max) || 0,
      }));
    }

    // TCPL: 15 questions (10x2 marks + 5x16 marks)
    // TCPR: 12 questions (8x2 marks + 4x16 marks)
    const count = tcplLikeKind === 'TCPR' ? 12 : 15;
    const twoMarkCount = tcplLikeKind === 'TCPR' ? 8 : 10;
    return Array.from({ length: count }, (_, i) => {
      const idx = i + 1;
      return {
        key: `q${idx}`,
        label: `Q${idx}`,
        max: idx <= twoMarkCount ? 2 : 16,
      };
    });
  }, [tcplLikeKind, iqacPattern, isTcplLike]);

  const tcplTotalMax = useMemo(() => tcplQuestions.reduce((sum, q) => sum + q.max, 0), [tcplQuestions]);

  const tcplLabMax = 30;
  // TCPR: REVIEW is treated as CO5 (no splitting across COs).
  // TCPL: LAB is split equally across all COs (existing Excel-style logic).
  const tcplReviewIsCo5 = tcplLikeKind === 'TCPR';
  const tcplCoCount = 5;
  const tcplLabShareMax = tcplReviewIsCo5 ? 0 : tcplLabMax / tcplCoCount;
  const tcplLabLabel = tcplLikeKind === 'TCPR' ? 'REVIEW' : 'LAB';

  // THEORY header template (matches provided screenshot)
  const theoryQuestions = useMemo<QuestionDef[]>(() => {
    // Prefer IQAC-configured QP pattern if present.
    const marks = Array.isArray((iqacPattern as any)?.marks) ? (iqacPattern as any).marks : null;
    if (Array.isArray(marks) && marks.length && (isTheory || isSpecial)) {
      return marks.map((max, i) => ({
        key: `q${i + 1}`,
        label: `Q${i + 1}`,
        max: Number(max) || 0,
      }));
    }

    return [
      { key: 'q1', label: 'Q1', max: 2 },
      { key: 'q2', label: 'Q2', max: 2 },
      { key: 'q3', label: 'Q3', max: 2 },
      { key: 'q4', label: 'Q4', max: 2 },
      { key: 'q5', label: 'Q5', max: 2 },
      { key: 'q6', label: 'Q6', max: 2 },
      { key: 'q7', label: 'Q7', max: 2 },
      { key: 'q8', label: 'Q8', max: 2 },
      { key: 'q9', label: 'Q9', max: 2 },
      { key: 'q10', label: 'Q10', max: 2 },
      { key: 'q11', label: 'Q11', max: 14 },
      { key: 'q12', label: 'Q12', max: 14 },
      { key: 'q13', label: 'Q13', max: 14 },
      { key: 'q14', label: 'Q14', max: 14 },
      { key: 'q15', label: 'Q15', max: 14 },
      { key: 'q16', label: 'Q16', max: 10 },
    ];
  }, [iqacPattern, isTheory, isSpecial]);

  const theoryTotalMax = useMemo(() => theoryQuestions.reduce((sum, q) => sum + q.max, 0), [theoryQuestions]);

  // CO mapping row under Q1..Q16.
  const extractModelCos = (raw: any): number[] => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return [Math.trunc(raw)];
    const s = String(raw || '').trim().replace(/CO/ig, '');
    if (s.includes('&') || s.includes(',') || s.includes('/')) {
      return s.split(/[&,/]+/).map((p) => parseInt(p, 10)).filter(Number.isFinite);
    }
    const n = Number(raw);
    if (Number.isFinite(n)) return [Math.trunc(n)];
    return [1];
  };

  const theoryCosRow = useMemo(() => {
    const defaultRow = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5, 5];
    const cos = Array.isArray((iqacPattern as any)?.cos) ? (iqacPattern as any).cos : null;
    if ((isTheory || isSpecial) && Array.isArray(cos) && cos.length === theoryQuestions.length) {
      return cos.map((v: any) => extractModelCos(v));
    }
    if (theoryQuestions.length === defaultRow.length) return defaultRow.map(v => [v]);
    return Array.from({ length: theoryQuestions.length }, (_, i) => [defaultRow[i % defaultRow.length]]);
  }, [iqacPattern, isTheory, isSpecial, theoryQuestions.length]);

  // Derived from actual COs used so unused CO columns are hidden automatically.
  const theoryCoCount = useMemo(() => {
    if (!theoryCosRow.length) return 1;
    let maxCo = 1;
    theoryCosRow.forEach(row => {
      if (Array.isArray(row)) {
        row.forEach(co => maxCo = Math.max(maxCo, co));
      } else if (typeof row === 'number') {
        maxCo = Math.max(maxCo, row as number);
      }
    });
    return Math.max(1, maxCo);
  }, [theoryCosRow]);

  // BTL mapping row under Q1..Q16.
  // Default derived from screenshot: BTL2=8, BTL3=54, BTL4=28, BTL5=10.
  const defaultTheoryBtlRow = useMemo(() => {
    const defaultRow = [2, 2, 3, 3, 3, 2, 2, 3, 3, 3, 4, 4, 3, 3, 3, 5];
    if (theoryQuestions.length === defaultRow.length) return defaultRow;
    return Array.from({ length: theoryQuestions.length }, (_, i) => defaultRow[i % defaultRow.length]);
  }, [theoryQuestions.length]);

  const theoryCoTheoryMaxRow = useMemo(() => {
    const coMax: number[] = Array.from({ length: theoryCoCount }, () => 0);
    theoryQuestions.forEach((q, i) => {
      const coMap = theoryCosRow[i] ?? [1];
      const validCos = coMap.filter((co: number) => co >= 1 && co <= theoryCoCount);
      if (validCos.length > 0) {
        const splitMax = q.max / validCos.length;
        validCos.forEach((co: number) => {
          coMax[co - 1] += splitMax;
        });
      }
    });
    return coMax;
  }, [theoryQuestions, theoryCosRow, theoryCoCount]);

  const theoryCoMaxRow = useMemo(() => {
    // THEORY: CO max is based on question max only (no LAB/REVIEW column).
    return theoryCoTheoryMaxRow;
  }, [theoryCoTheoryMaxRow]);

  const theoryQuestionBtlStorageKey = useMemo(() => `model_theory_questionBtl_${subjectId}_${String(teachingAssignmentId ?? 'none')}`, [subjectId, teachingAssignmentId]);
  const defaultTheoryQuestionBtl = useMemo(() => {
    return Object.fromEntries(
      theoryQuestions.map((q, i) => {
        const v = defaultTheoryBtlRow[i];
        return [q.key, (typeof v === 'number' ? (v as 1 | 2 | 3 | 4 | 5 | 6) : '') as BtlValue];
      }),
    ) as Record<string, BtlValue>;
  }, [theoryQuestions, defaultTheoryBtlRow]);

  const [theoryQuestionBtl, setTheoryQuestionBtl] = useState<Record<string, BtlValue>>(defaultTheoryQuestionBtl);

  useEffect(() => {
    if (!isTheory && !isSpecial) return;
    const stored = lsGet<Record<string, BtlValue>>(theoryQuestionBtlStorageKey);
    if (stored && typeof stored === 'object') {
      setTheoryQuestionBtl({
        ...defaultTheoryQuestionBtl,
        ...stored,
      });
    } else {
      setTheoryQuestionBtl(defaultTheoryQuestionBtl);
    }
  }, [isTheory, isSpecial, theoryQuestionBtlStorageKey, defaultTheoryQuestionBtl]);

  const setTheoryBtl = (qKey: string, value: BtlValue) => {
    setTheoryQuestionBtl((prev) => {
      const next = { ...(prev || {}), [qKey]: value };
      lsSet(theoryQuestionBtlStorageKey, next);
      return next;
    });
  };

  const theoryBtlRow = useMemo(() => {
    return theoryQuestions.map((q, i) => {
      const v = (theoryQuestionBtl || ({} as any))[q.key];
      if (v === '' || v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) return v;
      const fallback = defaultTheoryBtlRow[i];
      return (typeof fallback === 'number' ? (fallback as 1 | 2 | 3 | 4 | 5 | 6) : '') as BtlValue;
    });
  }, [theoryQuestions, theoryQuestionBtl, defaultTheoryBtlRow]);

  const theoryBtlMaxRow = useMemo(() => {
    const btlMax: number[] = [0, 0, 0, 0, 0, 0];
    theoryQuestions.forEach((q, i) => {
      const b = theoryBtlRow[i];
      if (typeof b === 'number' && b >= 1 && b <= 6) btlMax[b - 1] += q.max;
    });
    return btlMax;
  }, [theoryQuestions, theoryBtlRow]);

  // CO mapping under Q1..Qn.
  // - TCPL mapping is from the provided header screenshot.
  // - TCPR uses CO1..CO4 only, following the same repeating pattern.
  const tcplCosRow = useMemo(() => {
    const base = tcplLikeKind === 'TCPR'
      ? [1, 1, 2, 2, 3, 3, 4, 4, 1, 2, 3, 4]
      : [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5];
    const cos = Array.isArray((iqacPattern as any)?.cos) ? (iqacPattern as any).cos : null;
    if (isTcplLike && Array.isArray(cos) && cos.length === tcplQuestions.length) {
      return cos.map((v: any) => {
        const n = Number(v);
        if (Number.isFinite(n)) return Math.max(1, Math.min(5, Math.trunc(n)));
        return 1;
      });
    }
    if (tcplQuestions.length === base.length) return base;
    return Array.from({ length: tcplQuestions.length }, (_, i) => base[i % base.length]);
  }, [iqacPattern, isTcplLike, tcplLikeKind, tcplQuestions.length]);

  const tcplStoragePrefix = tcplLikeKind === 'TCPR' ? 'tcpr' : 'tcpl';
  const tcplQuestionBtlStorageKey = useMemo(() => `model_${tcplStoragePrefix}_questionBtl_${subjectId}_${String(teachingAssignmentId ?? 'none')}`, [subjectId, tcplStoragePrefix, teachingAssignmentId]);
  const defaultTcplQuestionBtl = useMemo(() => {
    return Object.fromEntries(tcplQuestions.map((q) => [q.key, '' as BtlValue]));
  }, [tcplQuestions]);

  const [tcplQuestionBtl, setTcplQuestionBtl] = useState<Record<string, BtlValue>>(defaultTcplQuestionBtl);

  useEffect(() => {
    if (!isTcplLike) return;
    const stored = lsGet<Record<string, BtlValue>>(tcplQuestionBtlStorageKey);
    if (stored && typeof stored === 'object') {
      setTcplQuestionBtl({
        ...defaultTcplQuestionBtl,
        ...stored,
      });
    } else {
      setTcplQuestionBtl(defaultTcplQuestionBtl);
    }
  }, [isTcplLike, tcplQuestionBtlStorageKey, defaultTcplQuestionBtl]);

  const setTcplBtl = (qKey: string, value: BtlValue) => {
    setTcplQuestionBtl((prev) => {
      const next = { ...(prev || {}), [qKey]: value };
      lsSet(tcplQuestionBtlStorageKey, next);
      return next;
    });
  };

  const tcplSheetStorageKey = useMemo(
    () => `model_${tcplStoragePrefix}_sheet_${subjectId}_${String(teachingAssignmentId ?? 'none')}`,
    [subjectId, teachingAssignmentId, tcplStoragePrefix],
  );

  useEffect(() => {
    if (!isTcplLike) return;
    const stored = lsGet<TcplSheetState>(tcplSheetStorageKey);
    if (stored && typeof stored === 'object') setTcplSheet(stored);
    else setTcplSheet({});
  }, [isTcplLike, tcplSheetStorageKey]);

  const theorySheetStorageKey = useMemo(
    () => `model_theory_sheet_${subjectId}_${String(teachingAssignmentId ?? 'none')}`,
    [subjectId, teachingAssignmentId],
  );

  useEffect(() => {
    if (isTcplLike) return;
    const stored = lsGet<TcplSheetState>(theorySheetStorageKey);
    if (stored && typeof stored === 'object') setTheorySheet(stored);
    else setTheorySheet({});
  }, [isTcplLike, theorySheetStorageKey]);

  const setTcplCell = (rowKey: string, next: TcplRowEntry) => {
    setTcplSheet((prev) => {
      const updated = { ...(prev || {}), [rowKey]: next };
      lsSet(tcplSheetStorageKey, updated);
      return updated;
    });
  };

  const setTheoryCell = (rowKey: string, next: TcplRowEntry) => {
    setTheorySheet((prev) => {
      const updated = { ...(prev || {}), [rowKey]: next };
      lsSet(theorySheetStorageKey, updated);
      return updated;
    });
  };

  const setActiveSheetWhole = (next: TcplSheetState) => {
    if (isTcplLike) {
      setTcplSheet(next);
      lsSet(tcplSheetStorageKey, next);
      return;
    }
    setTheorySheet(next);
    lsSet(theorySheetStorageKey, next);
  };

  // Auto-save to backend (debounced) when there is typing/activity.
  // No background timer runs when the sheet is idle.
  useEffect(() => {
    if (!autosaveReady) return;
    if (!subjectId) return;
    if (publishedEditLocked) return;
    if (suppressAutosaveRef.current) return;

    let cancelled = false;
    const tid = window.setTimeout(async () => {
      try {
        await OBE.saveDraft('model', subjectId, buildPayload(), teachingAssignmentId);
        if (!cancelled) setSavedAt(new Date().toLocaleString());
      } catch {
        // Ignore autosave errors (manual Save Draft shows errors).
      }
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [
    autosaveReady,
    subjectId,
    teachingAssignmentId,
    publishedEditLocked,
    qpType,
    normalizedClassType,
    theoryQuestionBtl,
    tcplQuestionBtl,
    theorySheet,
    tcplSheet,
  ]);

  const clampCell = (value: string, max: number): CellNumber => {
    const raw = String(value ?? '');
    if (raw.trim() === '') return '';
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    return Math.max(0, n);
  };

  const fmt1 = (n: number) => {
    const v = Math.round((n + Number.EPSILON) * 10) / 10;
    const s = v.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };

  const getQuestionDefsForSheet = () => (isTcplLike ? tcplQuestions : theoryQuestions);

  const exportSheetCsv = () => {
    const defs = getQuestionDefsForSheet();
    const rows = (students || []).map((s, idx) => {
      const rowKey = getRowKey(s as any, idx);
      const row = (activeSheet || {})[rowKey] || {};
      const qObj = (row as any).q && typeof (row as any).q === 'object' ? (row as any).q : {};
      const out: Record<string, string | number> = {
        sno: idx + 1,
        registerNo: String((s as any).reg_no || ''),
        name: String((s as any).name || ''),
        absent: (row as any).absent ? 'YES' : '',
        absentKind: (row as any).absent ? normalizeAbsenceKind((row as any).absentKind) : '',
      };
      defs.forEach((q) => {
        const raw = (qObj as any)[q.key];
        const n = Number(raw);
        out[q.label] = Number.isFinite(n) ? Math.max(0, Math.min(q.max, n)) : '';
      });
      if (isTcplLike) {
        const lv = Number((row as any).lab);
        out[tcplLabLabel] = Number.isFinite(lv) ? Math.max(0, Math.min(tcplLabMax, lv)) : '';
      }
      return out;
    });

    const suffix = isTcplLike ? String(normalizedClassType || 'TCPL') : 'THEORY';
    downloadCsv(`${safeFilePart(subjectId)}_MODEL_${safeFilePart(suffix)}.csv`, rows);
  };

  const exportSheetExcel = () => {
    const defs = getQuestionDefsForSheet();
    if (!students.length) return;

    const header = ['Register No', 'Student Name', ...defs.map((q) => `${q.label} (${q.max})`)];
    if (isTcplLike) header.push(`${tcplLabLabel} (${tcplLabMax})`);
    header.push('Status', 'Absence Kind');

    const data = students.map((s, idx) => {
      const rowKey = getRowKey(s as any, idx);
      const row = (activeSheet || ({} as any))[rowKey] || ({} as TcplRowEntry);
      const qObj = (row.q || {}) as Record<string, CellNumber>;
      const absent = Boolean(row.absent);
      const statusStr = absent ? 'absent' : 'present';
      const kindStr = absent ? normalizeAbsenceKind((row as any).absentKind) : 'AL';

      const base = [String((s as any).reg_no || ''), String((s as any).name || '')];
      const marks = defs.map((q) => {
        const raw = qObj[q.key];
        const n = Number(raw);
        return Number.isFinite(n) ? Math.max(0, Math.min(q.max, n)) : '';
      });

      if (isTcplLike) {
        const lv = Number(row.lab);
        const labMark = Number.isFinite(lv) ? Math.max(0, Math.min(tcplLabMax, lv)) : '';
        return [...base, ...marks, labMark, statusStr, kindStr];
      }
      return [...base, ...marks, statusStr, kindStr];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MODEL');

    const suffix = isTcplLike ? String(normalizedClassType || 'TCPL') : 'THEORY';
    const filename = `${safeFilePart(subjectId)}_MODEL_${safeFilePart(suffix)}.xlsx`;
    (XLSX as any).writeFile(wb, filename);
  };

  const triggerExcelImport = () => {
    if (publishedEditLocked) return;
    excelFileInputRef.current?.click();
  };

  const importFromExcel = async (file: File) => {
    if (!file) return;
    setExcelBusy(true);
    try {
      const defs = getQuestionDefsForSheet();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstName = workbook.SheetNames?.[0];
      if (!firstName) throw new Error('No sheet found in the Excel file.');
      const sheet0 = workbook.Sheets[firstName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet0, { header: 1, defval: '', blankrows: false, raw: true });
      if (!rows.length) throw new Error('Excel sheet is empty.');

      const headerRow = (rows[0] || []).map(normalizeHeaderCell);
      const findCol = (pred: (h: string) => boolean) => headerRow.findIndex((h) => pred(h));

      const extractQLabel = (h: string): string | null => {
        const s = String(h || '').trim();
        if (!s) return null;
        const m = s.match(/^(q|o)\s*0*(\d{1,2})\b/i);
        if (!m) return null;
        const prefix = String(m[1] || 'q').toUpperCase();
        const n = Number(m[2] || 0);
        if (!Number.isFinite(n) || n <= 0) return null;
        return `${prefix}${n}`;
      };

      const regCol = findCol((h) => h === 'register no' || h === 'reg no' || h === 'regno' || h.includes('register'));
      const statusCol = findCol((h) => h === 'status' || h.includes('status'));
      const kindCol = findCol((h) => h === 'absence kind' || h === 'absent kind' || h === 'kind');
      if (regCol < 0) throw new Error('Could not find Register No column.');

      const qCols = defs.map((q) => {
        const label = String(q.label || '').trim().toUpperCase();
        const idx = headerRow.findIndex((h) => extractQLabel(h) === label);
        return { q, col: idx };
      });

      const q10Col = normalizedQpType === 'QP2' ? headerRow.findIndex((h) => extractQLabel(h) === 'Q10') : -1;
      const hasSeparateQ10Def = defs.some((d) => {
        const key = String(d.key || '').trim().toLowerCase();
        const label = String(d.label || '').trim().toUpperCase();
        return key === 'q10' || label === 'Q10';
      });

      const labCol = isTcplLike
        ? findCol((h) => h === String(tcplLabLabel || '').toLowerCase() || h.startsWith(String(tcplLabLabel || '').toLowerCase()))
        : -1;

      const regToKey = new Map<string, string>();
      students.forEach((s, idx) => {
        const reg = String((s as any).reg_no || '').trim();
        if (!reg) return;
        const rowKey = getRowKey(s as any, idx);
        for (const k of registerNoKeys(reg)) regToKey.set(k, rowKey);
      });

      const nextSheet: TcplSheetState = { ...(activeSheet || {}) };

      for (let i = 1; i < rows.length; i++) {
        const rowArr = rows[i] || [];
        const regKeys = registerNoKeys(rowArr[regCol]);
        if (!regKeys.length) continue;
        let rowKey: string | undefined;
        for (const k of regKeys) {
          const key = regToKey.get(k);
          if (key) {
            rowKey = key;
            break;
          }
        }
        if (!rowKey) continue;

        const prev = (nextSheet[rowKey] || {}) as TcplRowEntry;
        const qObj: Record<string, CellNumber> = { ...((prev as any).q || {}) };

        qCols.forEach(({ q, col }) => {
          if (col < 0) return;
          const raw = rowArr[col];
          const n = Number(raw);
          qObj[q.key] = Number.isFinite(n) ? Math.max(0, Math.min(q.max, n)) : '';
        });

        // Legacy QP2 templates can split Q9/Q10 in Excel while UI has only collapsed Q9.
        // Merge only when this sheet does not already define a separate Q10 field.
        if (normalizedQpType === 'QP2' && q10Col >= 0 && !hasSeparateQ10Def) {
          const q9 = defs.find((d) => String(d.key || '').toLowerCase() === 'q9' || String(d.label || '').trim().toUpperCase() === 'Q9');
          if (q9) {
            const add = Number(rowArr[q10Col]);
            if (Number.isFinite(add)) {
              const base = Number(qObj[q9.key] === '' ? 0 : (qObj[q9.key] as any) || 0);
              const merged = Math.max(0, Math.min(q9.max, base + add));
              qObj[q9.key] = merged;
            }
          }
        }

        const status = statusCol >= 0 ? String(rowArr[statusCol] ?? '').trim().toLowerCase() : '';
        const absent = status === 'absent' || status === 'ab' || status === 'a';

        const kindRaw = kindCol >= 0 ? rowArr[kindCol] : 'AL';
        const absentKind = normalizeAbsenceKind(kindRaw);

        const updated: TcplRowEntry = {
          ...prev,
          q: qObj,
          absent,
          absentKind,
        };

        if (isTcplLike && labCol >= 0) {
          const lv = Number(rowArr[labCol]);
          updated.lab = Number.isFinite(lv) ? Math.max(0, Math.min(tcplLabMax, lv)) : '';
        }

        nextSheet[rowKey] = updated;
      }

      setActiveSheetWhole(nextSheet);
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

  const tcplCoTheoryMaxRow = useMemo(() => {
    const coMax: number[] = Array.from({ length: tcplCoCount }, () => 0);
    tcplQuestions.forEach((q, i) => {
      const co = tcplCosRow[i] ?? 1;
      if (co >= 1 && co <= tcplCoCount) coMax[co - 1] += q.max;
    });
    return coMax;
  }, [tcplQuestions, tcplCosRow, tcplCoCount]);

  const tcplCoMaxRow = useMemo(() => {
    if (tcplReviewIsCo5) {
      // TCPR: CO1..CO4 max are from questions only; CO5 max is REVIEW max.
      return tcplCoTheoryMaxRow.map((m, i) => (i === 4 ? tcplLabMax : m));
    }

    // TCPL: Excel logic inferred from screenshot:
    // CO max = (sum of question max for that CO) + (LAB max / CO-count)
    return tcplCoTheoryMaxRow.map((m) => m + tcplLabShareMax);
  }, [tcplCoTheoryMaxRow, tcplLabShareMax, tcplReviewIsCo5, tcplLabMax]);

  const tcplBtlMaxRow = useMemo(() => {
    const btlMax: number[] = [0, 0, 0, 0, 0, 0];
    tcplQuestions.forEach((q) => {
      const b = (tcplQuestionBtl || ({} as any))[q.key] ?? '';
      if (typeof b === 'number' && b >= 1 && b <= 6) btlMax[b - 1] += q.max;
    });
    return btlMax;
  }, [tcplQuestions, tcplQuestionBtl]);

  const tcplVisibleBtls = useMemo(() => {
    const set = new Set<number>();
    tcplQuestions.forEach((q) => {
      const b = (tcplQuestionBtl || ({} as any))[q.key] ?? '';
      if (b === 1 || b === 2 || b === 3 || b === 4 || b === 5 || b === 6) set.add(b);
    });
    // Keep the header stable until at least one BTL is chosen.
    if (set.size === 0) return [1, 2, 3, 4, 5, 6] as const;
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n)) as Array<1 | 2 | 3 | 4 | 5 | 6>;
  }, [tcplQuestions, tcplQuestionBtl]);

  const getRowKey = (s: TeachingAssignmentRosterStudent, idx: number) => {
    const sid = (s as any)?.id;
    if (typeof sid === 'number' && sid > 0) return `id:${sid}`;
    const reg = String((s as any)?.reg_no || '').trim();
    if (reg) return `reg:${reg}`;
    return `idx:${idx}`;
  };

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const registerRef = (key: string) => (el: HTMLInputElement | null) => {
    inputRefs.current[key] = el;
  };
  const focusRef = (key: string) => {
    const el = inputRefs.current[key];
    if (el) {
      el.focus();
      // Excel-like UX: select the whole cell value when moving.
      try {
        el.select();
      } catch {
        // ignore
      }
    }
  };

  // BTL attainment columns are dynamic (only enabled/used BTLs are shown, like CIA sheets).
  const tcplRecordExtraCols = (isTcplLike && !tcplReviewIsCo5 && tcplModelRecordEnabled) ? tcplModelRecordExpCount : 0;
  // +1 for 'Total Average' display column when record mode is active
  const tcplRecordAvgCol = tcplRecordExtraCols > 0 ? 1 : 0;
  const tcplColSpan = 4 + tcplQuestions.length + 1 + 1 + tcplRecordExtraCols + tcplRecordAvgCol + tcplCoCount * 2 + tcplVisibleBtls.length * 2;
  const theoryVisibleBtls = useMemo(() => {
    const set = new Set<number>();
    theoryQuestions.forEach((q) => {
      const b = (theoryQuestionBtl || ({} as any))[q.key] ?? '';
      if (b === 1 || b === 2 || b === 3 || b === 4 || b === 5 || b === 6) set.add(b);
    });
    if (set.size === 0) return [1, 2, 3, 4, 5, 6] as const;
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n)) as Array<1 | 2 | 3 | 4 | 5 | 6>;
  }, [theoryQuestions, theoryQuestionBtl]);
  const theoryColSpan = 4 + theoryQuestions.length + 1 + theoryCoCount * 2 + theoryVisibleBtls.length * 2;

  const renderRows = useMemo(() => {
    if (!showAbsenteesOnly) return rowsToRender;
    return rowsToRender.filter((s, idx) => {
      const rowKey = getRowKey(s as any, idx);
      // Keep list stable while editing (toggling absent off shouldn't remove the row immediately).
      if (absenteesSnapshotKeys && absenteesSnapshotKeys.length) return absenteesSnapshotKeys.includes(rowKey);
      return Boolean((activeSheet || ({} as any))[rowKey]?.absent);
    });
  }, [rowsToRender, showAbsenteesOnly, activeSheet, absenteesSnapshotKeys]);

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

      <div style={{ marginBottom: 12, padding: '8px 14px', background: 'linear-gradient(180deg,#f8fafc,#ffffff)', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>Subject</span>
          <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
          <span style={{ color: '#1e293b', fontWeight: 700 }}>{subjectId}</span>
          <span style={{ margin: '0 8px', color: '#e2e8f0' }}>|</span>
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>Assessment</span>
          <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
          <span style={{ color: '#1e293b' }}>MODEL</span>
          {normalizedClassType ? (
            <>
              <span style={{ margin: '0 8px', color: '#e2e8f0' }}>|</span>
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>Class</span>
              <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
              <span style={{ color: '#1e293b' }}>{normalizedClassType}</span>
            </>
          ) : null}
          <span style={{ margin: '0 8px', color: '#e2e8f0' }}>|</span>
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>QP</span>
          <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
          <span style={{ color: '#1e293b', fontWeight: 700 }}>{normalizedQpType || 'QP1'}</span>
        </span>
        {iqacPatternLoading ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#0b74b8', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 999, padding: '2px 10px' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#0b74b8', animation: 'obe-pulse-dot 1.2s ease-in-out infinite' }} />
            Loading QP pattern…
          </span>
        ) : null}
        {iqacPatternError ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 999, padding: '2px 10px' }}>
            ⚠ Pattern load failed
          </span>
        ) : null}
        {!iqacPatternLoading && !iqacPatternError && iqacPattern ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#047857', background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '2px 10px' }}>
            ✓ {questions.length} questions loaded
          </span>
        ) : null}
      </div>

      {loading ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading roster…</div> : null}
      {error ? (
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
      ) : null}

      {actionError ? (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            color: '#9a3412',
            padding: 10,
            borderRadius: 10,
            marginBottom: 10,
            maxWidth: '100%',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {actionError}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={exportSheetCsv} className="obe-btn obe-btn-secondary" disabled={!students.length}>
            Export CSV
          </button>
          <button onClick={exportSheetExcel} className="obe-btn obe-btn-secondary" disabled={!students.length}>
            Export Excel
          </button>
          <button onClick={triggerExcelImport} className="obe-btn obe-btn-secondary" disabled={!students.length || publishedEditLocked || excelBusy}>
            {excelBusy ? 'Importing…' : 'Import Excel'}
          </button>

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
              Digits filter
            </label>
            <select
              value={digitFilterLength}
              disabled={!digitFilterEnabled}
              onChange={(e) => setDigitFilterLength(Number(e.target.value) === 8 ? 8 : 3)}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 12, background: '#fff' }}
            >
              <option value={3}>Last 3</option>
              <option value={8}>Last 8</option>
            </select>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={digitFilterLength === 8 ? 'Enter up to 8 digits' : 'Enter up to 3 digits'}
              disabled={!digitFilterEnabled}
              value={digitFilterValue}
              onChange={(e) => setDigitFilterValue(normalizeRegDigits(e.target.value).slice(0, digitFilterLength))}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 12, width: 170, background: '#fff' }}
            />
          </div>
          <input
            ref={excelFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleExcelFileSelect}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!publishedEditLocked ? (
            <button
              onClick={saveDraftToDb}
              className="obe-btn obe-btn-success"
              disabled={savingDraft || !subjectId || publishedEditLocked}
              title={publishedEditLocked ? 'Published sheets are locked (IQAC must open editing).' : undefined}
            >
              {savingDraft ? 'Saving…' : 'Save Draft'}
            </button>
          ) : null}
          <button
            onClick={resetAllMarks}
            className="obe-btn obe-btn-danger"
            disabled={
              resettingMarks ||
              students.length === 0 ||
              tableBlocked ||
              publishedEditLocked ||
              globalLocked ||
              !publishAllowed ||
              !subjectId ||
              typeof teachingAssignmentId !== 'number'
            }
            title={
              globalLocked
                ? 'Reset is blocked: publishing is locked by IQAC'
                : !publishAllowed
                  ? 'Reset is blocked: publish window is closed'
                  : publishedEditLocked
                    ? 'Reset is blocked: published table is locked; request edit first'
                    : typeof teachingAssignmentId !== 'number'
                      ? 'Reset is unavailable: teaching assignment is not selected'
                      : 'Clears marks from draft and database for this teaching assignment'
            }
          >
            {resettingMarks ? 'Resetting…' : 'Reset Marks'}
          </button>
          <button
            onClick={publish}
            className="obe-btn obe-btn-primary"
            disabled={editRequestsBlocked || (publishButtonIsRequestEdit ? markEntryReqPending : publishing || students.length === 0 || !publishAllowed || tableBlocked || globalLocked)}
            title={
              students.length === 0
                ? 'No students in roster'
                : !publishAllowed
                ? 'Publish window is closed.'
                : globalLocked
                ? 'Publishing locked by IQAC'
                : undefined
            }
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
          </div>
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
            <button className="obe-btn obe-btn-primary" onClick={requestApproval} disabled={requesting || !subjectId || !String(requestReason || '').trim()}>
              {requesting ? 'Requesting…' : 'Request Approval'}
            </button>
          </div>
          {requestMessage ? <div style={{ marginTop: 8, fontSize: 12, color: '#065f46' }}>{requestMessage}</div> : null}
        </div>
      ) : null}

      <div style={{ marginBottom: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Saved</div>
          <div style={{ fontWeight: 700 }}>{savedAt || '—'}</div>
          {savedBy ? (
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              by <span style={{ color: '#0369a1', fontWeight: 700 }}>{savedBy}</span>
            </div>
          ) : null}
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Published</div>
          <div style={{ fontWeight: 700 }}>{publishedAt || '—'}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="obe-btn"
              disabled={!isPublished || !subjectId}
              onClick={() => refreshPublishedSnapshot(true, { applyToMain: true })}
              title={!isPublished ? 'Publish first to view the published snapshot.' : undefined}
            >
              {publishedViewLoading ? 'Loading…' : 'View Published'}
            </button>
            <button className="obe-btn" onClick={() => refreshMarkLock()} disabled={!subjectId}>
              Refresh Lock
            </button>
          </div>
          {publishedViewError ? <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }}>{publishedViewError}</div> : null}
        </div>
      </div>

      {publishedEditLocked ? (
        <div style={{ marginBottom: 10, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Published & locked</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Editing and auto-save are disabled until IQAC opens the edit window.
          </div>
        </div>
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
              zIndex: 80,
            }}
            onClick={() => setPublishedEditModalOpen(false)}
          >
            <div
              style={{
                width: 'min(520px, 96vw)',
                maxHeight: 'min(86vh, 740px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                background: '#fff',
                borderRadius: 16,
                border: '1px solid #e5e7eb',
                padding: 14,
                boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
            <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>Request Edit Access</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.35 }}>
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
                rows={3}
                className="obe-input"
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="obe-btn" disabled={editRequestBusy} onClick={() => setPublishedEditModalOpen(false)}>
                Cancel
              </button>
              <button className="obe-btn obe-btn-success" disabled={editRequestBusy || markEntryReqPending || !subjectId || !String(editRequestReason || '').trim()} onClick={requestEdit}>
                {editRequestBusy ? 'Sending…' : markEntryReqPending ? 'Request Pending' : 'Send Request'}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}


      {
        /* Show for all MODEL types. Disabled until at least one AB is marked. */
      }
      <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button
            className="obe-btn"
            disabled={!hasAbsentees}
            onClick={() => {
              if (showAbsenteesOnly) return;
              const snap = (rowsToRender || [])
                .map((s, idx) => ({ key: getRowKey(s as any, idx), isAbsent: Boolean((activeSheet || ({} as any))[getRowKey(s as any, idx)]?.absent) }))
                .filter((x) => x.isAbsent)
                .map((x) => x.key);
              setAbsenteesSnapshotKeys(snap);
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
                  setAbsenteesSnapshotKeys(null);
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
        </div>
      </>

      {/* Table overlays similar to SSA/Lab */}
      <div style={{ position: 'relative', minHeight: publishedEditLocked && !lockedViewOpen ? 220 : undefined }}>
        {isPublished && publishedEditLocked ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 30,
              pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(34,197,94,0.18) 0%, rgba(16,185,129,0.24) 100%)',
            }}
          />
        ) : null}

        {isPublished && publishedEditLocked ? (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 40,
              background: '#fff',
              border: '1px solid #e5e7eb',
              padding: '10px 14px',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
              pointerEvents: 'auto',
              maxWidth: 'min(720px, 96vw)',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                background: '#fef3c7',
                border: '1px solid #f59e0b33',
                color: '#92400e',
              }}
              aria-hidden="true"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M7 11V8a5 5 0 0 1 10 0v3"
                  stroke="#92400e"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 11h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
                  stroke="#92400e"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: '#111827', lineHeight: 1.1 }}>Published — Locked</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                {publishedViewLoading
                  ? 'Loading published marks…'
                  : publishedViewError
                    ? publishedViewError
                    : 'Marks are published. IQAC approval is required to edit.'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="obe-btn"
                disabled={!isPublished || !subjectId}
                onClick={async () => {
                  // Toggle visibility of the read-only table while locked.
                  setLockedViewOpen((p) => !p);
                  try {
                    await refreshPublishedSnapshot(true, { applyToMain: true });
                  } catch {
                    // ignore
                  }
                }}
                title={!isPublished ? 'Publish first to view the published snapshot.' : undefined}
              >
                {publishedViewLoading ? 'Loading…' : 'View'}
              </button>
              <button
                className="obe-btn obe-btn-success"
                disabled={!subjectId || markEntryReqPending}
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
                title="Ask IQAC to open editing for published marks"
              >
                {markEntryReqPending ? 'Request Pending' : 'Request Edit'}
              </button>
            </div>
          </div>
        ) : null}

        {isTcplLike && !tcplReviewIsCo5 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', background: '#fef3c7', border: '1px solid #d97706', borderRadius: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: '300px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={tcplModelRecordEnabled}
                  onChange={(e) => setTcplModelRecordEnabled(e.target.checked)}
                />
                Enable Record Marks for CO5 (Model Lab)
              </label>
              {tcplModelRecordEnabled && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  No. of Experiments:
                  <select
                    value={tcplModelRecordExpCount}
                    onChange={(e) => setTcplModelRecordExpCount(Number(e.target.value))}
                    style={{ fontSize: 13, padding: '2px 6px', borderRadius: 4, border: '1px solid #d97706' }}
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              {tcplModelRecordEnabled && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  Max mark / experiment:
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={tcplModelRecordMaxPerExp}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 1) setTcplModelRecordMaxPerExp(v);
                    }}
                    style={{ width: 70, fontSize: 13, padding: '2px 6px', borderRadius: 4, border: '1px solid #d97706' }}
                  />
                </label>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {tcplModelRecordEnabled && (
                <span style={{ fontSize: 12, color: '#92400e', fontWeight: 500 }}>
                  CO1–CO4: LAB/5 each (≤6) | CO5: CIA {`(LAB×4/30)`} + (avg/{tcplModelRecordMaxPerExp})×2
                </span>
              )}
            </div>
          </div>
        )}

        <div className="obe-table-wrapper" style={{ overflowX: 'auto' }}>
          <table
            className="obe-table"
            style={{
              width: 'max-content',
              minWidth: '100%',
              tableLayout: 'auto',
              pointerEvents: publishedEditLocked ? 'none' : undefined,
              opacity: publishedEditLocked ? 0.78 : 1,
              display: publishedEditLocked && !lockedViewOpen ? 'none' : undefined,
            }}
          >
          {!isTcplLike ? (
            <>
              {isTheory || isSpecial ? (
                <>
                  <thead>
                    <tr>
                      <th style={cellTh} colSpan={theoryColSpan}>
                        MODEL ({isSpecial ? 'SPECIAL' : 'THEORY'} Header Template)
                      </th>
                    </tr>

                    <tr>
                      <th style={{ ...cellTh, width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH }} rowSpan={5}>
                        S.No
                      </th>
                      <th style={{ ...cellTh, minWidth: 110, overflow: 'visible', textOverflow: 'clip' }} rowSpan={5}>
                        Register No.
                      </th>
                      <th style={{ ...cellTh, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }} rowSpan={5}>
                        Name of the Students
                      </th>
                      <th style={{ ...cellTh, minWidth: 92 }} rowSpan={5}>
                        ABSENT
                      </th>

                      {theoryQuestions.map((q) => (
                        <th key={q.key} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                          {q.label}
                        </th>
                      ))}

                      <th style={{ ...cellTh, minWidth: 56 }} rowSpan={3}>
                        Total
                      </th>

                      <th style={cellTh} colSpan={theoryCoCount * 2}>
                        CO ATTAINMENT
                      </th>
                      <th style={cellTh} colSpan={theoryVisibleBtls.length * 2}>
                        BTL ATTAINMENT
                      </th>
                    </tr>

                    <tr>
                      <th style={{ ...cellTh, fontWeight: 800 }} colSpan={theoryQuestions.length}>
                        COs
                      </th>
                      <th style={cellTh} colSpan={theoryCoCount * 2}>
                        &nbsp;
                      </th>
                      <th style={cellTh} colSpan={theoryVisibleBtls.length * 2}>
                        &nbsp;
                      </th>
                    </tr>

                    <tr>
                      {theoryCosRow.map((v, i) => (
                        <th key={`theory-co-map-${i}`} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                          {Array.isArray(v) ? v.join('&') : String(v)}
                        </th>
                      ))}

                      {Array.from({ length: theoryCoCount }).map((_, i) => (
                        <th key={`theory-co-head-${i}`} style={cellTh} colSpan={2}>
                          CO-{i + 1}
                        </th>
                      ))}

                      {theoryVisibleBtls.map((n) => (
                        <th key={`theory-btl-head-${n}`} style={cellTh} colSpan={2}>
                          BTL-{n}
                        </th>
                      ))}
                    </tr>

                    <tr>
                      <th style={{ ...cellTh, fontWeight: 800 }} colSpan={theoryQuestions.length}>
                        BTL
                      </th>
                      <th style={cellTh}>&nbsp;</th>

                      {Array.from({ length: theoryCoCount + theoryVisibleBtls.length }).flatMap((_, i) => (
                        <React.Fragment key={`theory-mkpct-${i}`}>
                          <th style={{ ...cellTh, minWidth: 52 }}>
                            <div style={{ whiteSpace: 'pre-line', lineHeight: '0.9', fontSize: '0.7em' }}>{'M\nA\nR\nK'}</div>
                          </th>
                          <th style={{ ...cellTh, minWidth: 34 }}>%</th>
                        </React.Fragment>
                      ))}
                    </tr>

                    <tr>
                      {theoryQuestions.map((q, i) => {
                        const v = (theoryQuestionBtl || ({} as any))[q.key] ?? '';
                        const display = v === '' ? '-' : String(v);
                        return (
                          <th key={`theory-btl-map-${q.key}`} style={{ ...cellTh, width: 40, minWidth: 40, padding: 0 }}>
                            <div style={{ position: 'relative', minWidth: 40 }}>
                              <div
                                style={{
                                  width: '100%',
                                  fontSize: 11,
                                  padding: '4px 4px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: 8,
                                  background: '#fff',
                                  textAlign: 'center',
                                  userSelect: 'none',
                                  margin: 2,
                                }}
                                title={`BTL: ${display}`}
                              >
                                {display}
                              </div>
                              <select
                                aria-label={`BTL for ${q.label}`}
                                value={v}
                                onChange={(e) =>
                                  setTheoryBtl(
                                    q.key,
                                    (e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)) as BtlValue,
                                  )
                                }
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  width: '100%',
                                  height: '100%',
                                  opacity: 0,
                                  cursor: 'pointer',
                                  appearance: 'none',
                                }}
                              >
                                <option value="">-</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                                <option value="4">4</option>
                                <option value="5">5</option>
                                <option value="6">6</option>
                              </select>
                            </div>
                          </th>
                        );
                      })}
                      <th style={cellTh}>&nbsp;</th>

                      {Array.from({ length: theoryCoCount * 2 + theoryVisibleBtls.length * 2 }).map((_, i) => (
                        <th key={`theory-tailblank-${i}`} style={cellTh}>
                          &nbsp;
                        </th>
                      ))}
                    </tr>

                    <tr>
                      <th style={cellTh}>S.No</th>
                      <th style={cellTh}>Register No.</th>
                      <th style={cellTh}>Name / Max Marks</th>
                      <th style={cellTh}>&nbsp;</th>

                      {theoryQuestions.map((q) => (
                        <th key={`theory-qmax-${q.key}`} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                          {q.max}
                        </th>
                      ))}

                      <th style={cellTh}>{theoryTotalMax}</th>

                      {theoryCoMaxRow.flatMap((max, i) => (
                        <React.Fragment key={`theory-co-max-mm-${i}`}>
                          <th style={cellTh}>{fmt1(max)}</th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      ))}

                      {theoryVisibleBtls.flatMap((n) => (
                        <React.Fragment key={`theory-btl-max-mm-${n}`}>
                          <th style={cellTh}>{fmt1(theoryBtlMaxRow[n - 1] || 0)}</th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {renderRows.map((s, idx) => (
                      <tr key={String((s as any).id ?? idx)}>
                        {(() => {
                          const rowKey = getRowKey(s as any, idx);
                          const row = (activeSheet || ({} as any))[rowKey] || ({} as TcplRowEntry);
                          const absent = Boolean(row.absent);

                          const kind: AbsenceKind | null = absent ? normalizeAbsenceKind((row as any).absentKind) : null;
                          const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));

                          const assignedTotal = absent && kind === 'AL' ? 0 : null;
                          const cap = absent && kind === 'ML' ? 60 : absent && kind === 'SKL' ? 75 : null;

                          const qMarks: Record<string, number> = {};
                          theoryQuestions.forEach((q) => {
                            const v = (row.q || ({} as any))[q.key] ?? '';
                            const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                            qMarks[q.key] = Math.max(0, Math.min(q.max, n));
                          });
                          const total = Object.values(qMarks).reduce((sum, n) => sum + n, 0);

                          const coMark: number[] = Array.from({ length: theoryCoCount }, () => 0);
                          theoryQuestions.forEach((q, i) => {
                              const cs = theoryCosRow[i] ?? [1];
                              const validCos = Array.isArray(cs) ? cs.filter(co => co >= 1 && co <= theoryCoCount) : (typeof cs === 'number' && cs >= 1 && cs <= theoryCoCount ? [cs] : []);
                              if (validCos.length > 0) {
                                const splitVal = (qMarks[q.key] || 0) / validCos.length;
                                validCos.forEach(co => {
                                  coMark[co - 1] += splitVal;
                                });
                              }
                          });

                          const coPct = coMark.map((m, i) => {
                            const denom = theoryCoMaxRow[i] || 0;
                            if (!denom) return 0;
                            return (m / denom) * 100;
                          });

                          const btlMark: number[] = [0, 0, 0, 0, 0, 0];
                          theoryQuestions.forEach((q, i) => {
                            const b = theoryBtlRow[i];
                            if (typeof b === 'number' && b >= 1 && b <= 6) btlMark[b - 1] += qMarks[q.key] || 0;
                          });
                          const btlPct = btlMark.map((m, i) => {
                            const denom = theoryBtlMaxRow[i] || 0;
                            if (!denom) return 0;
                            return (m / denom) * 100;
                          });

                          const setAbsent = (v: boolean) => {
                            if (v) {
                              setTheoryCell(rowKey, {
                                ...row,
                                absent: true,
                                absentKind: normalizeAbsenceKind((row as any).absentKind),
                                q: Object.fromEntries(theoryQuestions.map((q) => [q.key, ''])),
                              });
                              return;
                            }
                            setTheoryCell(rowKey, {
                              ...row,
                              absent: false,
                              absentKind: undefined,
                            });
                          };

                          const setAbsentKind = (v: AbsenceKind) => {
                            setTheoryCell(rowKey, {
                              ...row,
                              absent: true,
                              absentKind: normalizeAbsenceKind(v),
                            });
                          };

                          const setQ = (qKey: string, raw: string, max: number) => {
                            if (absent && !canEditAbsent) return;
                            const nextValue = clampCell(raw, max);
                            const nextQ = {
                              ...(row.q || {}),
                              [qKey]: nextValue,
                            };

                            if (cap != null) {
                              const nextTotal = theoryQuestions.reduce((sum, q) => {
                                const v = (nextQ as any)[q.key] ?? '';
                                const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                                return sum + Math.max(0, Math.min(q.max, n));
                              }, 0);
                              if (nextTotal > cap) {
                                setLimitDialog({
                                  title: 'Mark limit exceeded',
                                  message: kind === 'ML' ? 'For malpractice the total mark assigned is 60' : 'For Sick leave the Total mark assigned is 75',
                                });
                                return;
                              }
                            }

                            setTheoryCell(rowKey, {
                              ...row,
                              q: nextQ,
                            });
                          };

                          return (
                            <>
                              <td style={{ ...cellTd, textAlign: 'center' }}>{idx + 1}</td>
                              <td style={cellTd}>{(s as any).reg_no || '\u00A0'}</td>
                              <td style={cellTd}>{(s as any).name || '\u00A0'}</td>
                              <td style={{ ...cellTd, textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                  <input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />
                                  {absent ? (
                                    <div className="obe-ios-select" title="Absent type">
                                      <span className="obe-ios-select-value">{kind || 'AL'}</span>
                                      <select
                                        aria-label="Absent type"
                                        value={(kind || 'AL') as any}
                                        onChange={(e) => setAbsentKind(normalizeAbsenceKind(e.target.value))}
                                      >
                                        <option value="AL">AL</option>
                                        <option value="ML">ML</option>
                                        <option value="SKL">SKL</option>
                                      </select>
                                    </div>
                                  ) : null}
                                </div>
                              </td>

                              {theoryQuestions.map((q) => {
                                const v = (row.q || ({} as any))[q.key] ?? '';
                                const inputKey = `${rowKey}|${q.key}`;

                                const colOrder = theoryQuestions.map((qq) => qq.key) as string[];
                                const moveFocus = (colKey: string, dir: 'left' | 'right' | 'up' | 'down') => {
                                  const colIndex = Math.max(0, colOrder.indexOf(colKey));
                                  const nextColIndex =
                                    dir === 'left'
                                      ? Math.max(0, colIndex - 1)
                                      : dir === 'right'
                                        ? Math.min(colOrder.length - 1, colIndex + 1)
                                        : colIndex;
                                  const nextRowIndex =
                                    dir === 'up'
                                      ? Math.max(0, idx - 1)
                                      : dir === 'down'
                                        ? Math.min(renderRows.length - 1, idx + 1)
                                        : idx;
                                  const nextRowKey = getRowKey(renderRows[nextRowIndex] as any, nextRowIndex);
                                  focusRef(`${nextRowKey}|${colOrder[nextColIndex]}`);
                                };

                                const onCellKeyDown = (colKey: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
                                  if (e.key === 'Tab') {
                                    e.preventDefault();
                                    const colIndex = colOrder.indexOf(colKey);
                                    if (!e.shiftKey) {
                                      if (colIndex === colOrder.length - 1) {
                                        const nextRowIndex = Math.min(renderRows.length - 1, idx + 1);
                                        focusRef(`${getRowKey(renderRows[nextRowIndex] as any, nextRowIndex)}|${colOrder[0]}`);
                                      } else {
                                        moveFocus(colKey, 'right');
                                      }
                                    } else {
                                      if (colIndex === 0) {
                                        const prevRowIndex = Math.max(0, idx - 1);
                                        focusRef(`${getRowKey(renderRows[prevRowIndex] as any, prevRowIndex)}|${colOrder[colOrder.length - 1]}`);
                                      } else {
                                        moveFocus(colKey, 'left');
                                      }
                                    }
                                  } else if (e.key === 'ArrowLeft') {
                                    e.preventDefault();
                                    moveFocus(colKey, 'left');
                                  } else if (e.key === 'ArrowRight') {
                                    e.preventDefault();
                                    moveFocus(colKey, 'right');
                                  } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
                                    e.preventDefault();
                                    moveFocus(colKey, 'up');
                                  } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                                    e.preventDefault();
                                    moveFocus(colKey, 'down');
                                  }
                                };
                                const atMax = v !== '' && Number(v) >= q.max;
                                return (
                                  <td key={`${idx}-${q.key}`} style={{ ...cellTd, textAlign: 'center', background: atMax ? 'rgba(251,191,36,0.12)' : undefined }}>
                                    <input
                                      ref={registerRef(inputKey)}
                                      type="text"
                                      inputMode="decimal"
                                      disabled={absent && !canEditAbsent}
                                      value={v === '' ? '' : String(v)}
                                      title={`Max mark: ${q.max}`}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw === '') {
                                          e.currentTarget.setCustomValidity('');
                                          setQ(q.key, '', q.max);
                                          return;
                                        }
                                        const next = Number(raw);
                                        if (!Number.isFinite(next)) return;
                                        if (next > q.max) {
                                          showMarkLimitPopup(e.currentTarget, `Mark cannot be higher than ${q.max}`, s as any);
                                          setQ(q.key, '', q.max);
                                          return;
                                        }
                                        e.currentTarget.setCustomValidity('');
                                        setQ(q.key, raw, q.max);
                                      }}
                                      onBlur={(e) => {
                                        const raw = e.target.value;
                                        if (raw === '') return;
                                        const next = Number(raw);
                                        if (!Number.isFinite(next) || next < 0 || next > q.max) {
                                          showMarkLimitPopup(e.currentTarget, `Mark cannot be higher than ${q.max}`, s as any);
                                          setQ(q.key, '', q.max);
                                        }
                                      }}
                                      onFocus={(e) => e.currentTarget.select()}
                                      onKeyDown={onCellKeyDown(q.key)}
                                      style={{ ...excelInputStyle, color: atMax ? '#92400e' : undefined }}
                                    />
                                  </td>
                                );
                              })}

                              <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{fmt1(assignedTotal != null ? assignedTotal : total)}</td>

                              {coMark.flatMap((m, i) => (
                                <React.Fragment key={`theory-co-${idx}-${i}`}>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(m)}</td>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(coPct[i])}</td>
                                </React.Fragment>
                              ))}

                              {theoryVisibleBtls.flatMap((n) => (
                                <React.Fragment key={`theory-btl-${idx}-${n}`}>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(btlMark[n - 1] || 0)}</td>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(btlPct[n - 1] || 0)}</td>
                                </React.Fragment>
                              ))}
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr>
                      <th style={cellTh} colSpan={colSpan}>
                        MODEL (Blank Template)
                      </th>
                    </tr>
                    <tr>
                      <th style={{ ...cellTh, width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH }} rowSpan={4}>
                        S.No
                      </th>
                      <th style={{ ...cellTh, minWidth: 70, overflow: 'visible', textOverflow: 'clip' }} rowSpan={4}>
                        R.No
                      </th>
                      <th style={{ ...cellTh, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }} rowSpan={4}>
                        Name of the Students
                      </th>
                      <th style={{ ...cellTh, minWidth: 32 }} rowSpan={4}>
                        AB
                      </th>

                      <th style={cellTh} colSpan={questions.length}>
                        QUESTIONS
                      </th>
                      <th style={cellTh} rowSpan={4}>
                        Total
                      </th>
                      <th style={cellTh} colSpan={blankTemplateCos.length * 2}>
                        CO ATTAINMENT
                      </th>
                      <th style={cellTh} colSpan={visibleBtls.length * 2}>
                        BTL ATTAINMENT
                      </th>
                    </tr>
                    <tr>
                      {questions.map((q) => (
                        <th key={q.key} style={{ ...cellTh, width: 46, minWidth: 46 }}>
                          {q.label}
                        </th>
                      ))}
                      {blankTemplateCos.map((c) => (
                        <th key={`co-head-${c}`} style={cellTh} colSpan={2}>CO-{c}</th>
                      ))}
                      {visibleBtls.map((n) => (
                        <th key={`btl-head-${n}`} style={cellTh} colSpan={2}>
                          BTL-{n}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {questions.map((q) => {
                        const v = (blankTemplateQuestionBtl || ({} as any))[q.key] ?? '';
                        const display = v === '' ? '-' : String(v);
                        return (
                          <th key={`blank-btl-sel-${q.key}`} style={{ ...cellTh, width: 46, minWidth: 46, padding: 0 }}>
                            <div style={{ position: 'relative', minWidth: 40 }}>
                              <div
                                style={{
                                  width: '100%',
                                  fontSize: 11,
                                  padding: '4px 4px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: 8,
                                  background: '#fff',
                                  textAlign: 'center',
                                  userSelect: 'none',
                                  margin: 2,
                                }}
                                title={`BTL: ${display}`}
                              >
                                {display}
                              </div>
                              <select
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  width: '100%',
                                  height: '100%',
                                  opacity: 0,
                                  cursor: 'pointer',
                                }}
                                value={v}
                                onChange={(e) => {
                                  if (publishedEditLocked) return;
                                  const val = e.target.value;
                                  if (val === '') setBlankTemplateBtl(q.key, '');
                                  else setBlankTemplateBtl(q.key, Number(val) as BtlValue);
                                }}
                                disabled={publishedEditLocked}
                              >
                                <option value="">-</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                                <option value="4">4</option>
                                <option value="5">5</option>
                                <option value="6">6</option>
                              </select>
                            </div>
                          </th>
                        );
                      })}
                      {Array.from({ length: blankTemplateCos.length + visibleBtls.length }).flatMap((_, i) => (
                        <React.Fragment key={`btlsel-spacer-${i}`}>
                          <th style={cellTh}></th>
                          <th style={cellTh}></th>
                        </React.Fragment>
                      ))}
                    </tr>
                    <tr>
                      {questions.map((q) => (
                        <th key={q.key} style={{ ...cellTh, width: 46, minWidth: 46 }}>
                          {q.max}
                        </th>
                      ))}
                      {Array.from({ length: blankTemplateCos.length + visibleBtls.length }).flatMap((_, i) => (
                        <React.Fragment key={i}>
                          <th style={{ ...cellTh, minWidth: 52 }}>
                            <div style={{ whiteSpace: 'pre-line', lineHeight: '0.9', fontSize: '0.7em' }}>{'M\nA\nR\nK'}</div>
                          </th>
                          <th style={{ ...cellTh, minWidth: 34 }}>%</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {renderRows.map((s, idx) => (
                      <tr key={String((s as any).id ?? idx)}>
                    {(() => {
                      const rowKey = getRowKey(s as any, idx);
                      const row = (activeSheet || ({} as any))[rowKey] || ({} as TcplRowEntry);
                      const absent = Boolean(row.absent);

                      const kind: AbsenceKind | null = absent ? normalizeAbsenceKind((row as any).absentKind) : null;
                      const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));

                      const assignedTotal = absent && kind === 'AL' ? 0 : null;
                      const cap = absent && kind === 'ML' ? 60 : absent && kind === 'SKL' ? 75 : null;

                      const qMarks: Record<string, number> = {};
                      questions.forEach((q) => {
                        const v = (row.q || ({} as any))[q.key] ?? '';
                        const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                        qMarks[q.key] = Math.max(0, Math.min(q.max, n));
                      });
                      const total = Object.values(qMarks).reduce((sum, n) => sum + n, 0);

                      const setAbsent = (v: boolean) => {
                        if (v) {
                          setTheoryCell(rowKey, {
                            ...row,
                            absent: true,
                            absentKind: normalizeAbsenceKind((row as any).absentKind),
                            q: Object.fromEntries(questions.map((q) => [q.key, ''])),
                          });
                          return;
                        }
                        setTheoryCell(rowKey, {
                          ...row,
                          absent: false,
                          absentKind: undefined,
                        });
                      };

                      const setAbsentKind = (v: AbsenceKind) => {
                        setTheoryCell(rowKey, {
                          ...row,
                          absent: true,
                          absentKind: normalizeAbsenceKind(v),
                        });
                      };

                      const setQ = (qKey: string, raw: string, max: number) => {
                        if (absent && !canEditAbsent) return;
                        const nextValue = clampCell(raw, max);
                        const nextQ = {
                          ...(row.q || {}),
                          [qKey]: nextValue,
                        };

                        if (cap != null) {
                          const nextTotal = questions.reduce((sum, q) => {
                            const v = (nextQ as any)[q.key] ?? '';
                            const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                            return sum + Math.max(0, Math.min(q.max, n));
                          }, 0);
                          if (nextTotal > cap) {
                            setLimitDialog({
                              title: 'Mark limit exceeded',
                              message: kind === 'ML' ? 'For malpractice the total mark assigned is 60' : 'For Sick leave the Total mark assigned is 75',
                            });
                            return;
                          }
                        }

                        setTheoryCell(rowKey, {
                          ...row,
                          q: nextQ,
                        });
                      };

                      return (
                        <>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{idx + 1}</td>
                          <td style={cellTd}>{s.reg_no || '\u00A0'}</td>
                          <td style={cellTd}>{s.name || '\u00A0'}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />
                              {absent ? (
                                <div className="obe-ios-select" title="Absent type">
                                  <span className="obe-ios-select-value">{kind || 'AL'}</span>
                                  <select
                                    aria-label="Absent type"
                                    value={(kind || 'AL') as any}
                                    onChange={(e) => setAbsentKind(normalizeAbsenceKind(e.target.value))}
                                  >
                                    <option value="AL">AL</option>
                                    <option value="ML">ML</option>
                                    <option value="SKL">SKL</option>
                                  </select>
                                </div>
                              ) : null}
                            </div>
                          </td>

                          {questions.map((q) => {
                            const v = (row.q || ({} as any))[q.key] ?? '';
                            const inputKey = `${rowKey}|${q.key}`;

                            const colOrder = questions.map((qq) => qq.key) as string[];
                            const moveFocus = (colKey: string, dir: 'left' | 'right' | 'up' | 'down') => {
                              const colIndex = Math.max(0, colOrder.indexOf(colKey));
                              const nextColIndex =
                                dir === 'left'
                                  ? Math.max(0, colIndex - 1)
                                  : dir === 'right'
                                    ? Math.min(colOrder.length - 1, colIndex + 1)
                                    : colIndex;
                              const nextRowIndex =
                                dir === 'up'
                                  ? Math.max(0, idx - 1)
                                  : dir === 'down'
                                    ? Math.min(renderRows.length - 1, idx + 1)
                                    : idx;
                              const nextRowKey = getRowKey(renderRows[nextRowIndex] as any, nextRowIndex);
                              focusRef(`${nextRowKey}|${colOrder[nextColIndex]}`);
                            };

                            const onCellKeyDown = (colKey: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
                              if (e.key === 'Tab') {
                                e.preventDefault();
                                const colIndex = colOrder.indexOf(colKey);
                                if (!e.shiftKey) {
                                  if (colIndex === colOrder.length - 1) {
                                    const nextRowIndex = Math.min(renderRows.length - 1, idx + 1);
                                    focusRef(`${getRowKey(renderRows[nextRowIndex] as any, nextRowIndex)}|${colOrder[0]}`);
                                  } else {
                                    moveFocus(colKey, 'right');
                                  }
                                } else {
                                  if (colIndex === 0) {
                                    const prevRowIndex = Math.max(0, idx - 1);
                                    focusRef(`${getRowKey(renderRows[prevRowIndex] as any, prevRowIndex)}|${colOrder[colOrder.length - 1]}`);
                                  } else {
                                    moveFocus(colKey, 'left');
                                  }
                                }
                              } else if (e.key === 'ArrowLeft') {
                                e.preventDefault();
                                moveFocus(colKey, 'left');
                              } else if (e.key === 'ArrowRight') {
                                e.preventDefault();
                                moveFocus(colKey, 'right');
                              } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
                                e.preventDefault();
                                moveFocus(colKey, 'up');
                              } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                                e.preventDefault();
                                moveFocus(colKey, 'down');
                              }
                            };
                            const atMax = v !== '' && Number(v) >= q.max;
                            return (
                              <td key={`${idx}-${q.key}`} style={{ ...cellTd, textAlign: 'center', background: atMax ? 'rgba(251,191,36,0.12)' : undefined }}>
                                <input
                                  ref={registerRef(inputKey)}
                                  type="text"
                                  inputMode="decimal"
                                  disabled={absent && !canEditAbsent}
                                  value={v === '' ? '' : String(v)}
                                  title={`Max mark: ${q.max}`}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') {
                                      e.currentTarget.setCustomValidity('');
                                      setQ(q.key, '', q.max);
                                      return;
                                    }
                                    const next = Number(raw);
                                    if (!Number.isFinite(next)) return;
                                    if (next > q.max) {
                                      showMarkLimitPopup(e.currentTarget, `Mark cannot be higher than ${q.max}`, s as any);
                                      setQ(q.key, '', q.max);
                                      return;
                                    }
                                    e.currentTarget.setCustomValidity('');
                                    setQ(q.key, raw, q.max);
                                  }}
                                  onBlur={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') return;
                                    const next = Number(raw);
                                    if (!Number.isFinite(next) || next < 0 || next > q.max) {
                                      showMarkLimitPopup(e.currentTarget, `Mark cannot be higher than ${q.max}`, s as any);
                                      setQ(q.key, '', q.max);
                                    }
                                  }}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onKeyDown={onCellKeyDown(q.key)}
                                  style={{ ...excelInputStyle, color: atMax ? '#92400e' : undefined }}
                                />
                              </td>
                            );
                          })}

                          <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{fmt1(assignedTotal != null ? assignedTotal : total)}</td>
                          {blankTemplateCos.map((c) => {
                            const patternCos = Array.isArray((iqacPattern as any)?.cos) ? (iqacPattern as any).cos : null;
                            let coMark = 0;
                            if (patternCos) {
                              for (let qi = 0; qi < questions.length; qi++) {
                                if (Number(patternCos[qi]) === c) coMark += qMarks[questions[qi].key] || 0;
                              }
                            }
                            const coMaxVal = blankTemplateCoMax[c] || 0;
                            return (
                              <React.Fragment key={`co-cell-${idx}-${c}`}>
                                <td style={{ ...cellTd, textAlign: 'center' }}>{coMark}</td>
                                <td style={{ ...cellTd, textAlign: 'center' }}><span className="obe-pct-badge">{coMaxVal > 0 ? `${Math.round((coMark / coMaxVal) * 100)}%` : '\u2014'}</span></td>
                              </React.Fragment>
                            );
                          })}

                          {visibleBtls.flatMap((n) => {
                            let btlMark = 0;
                            for (let qi = 0; qi < questions.length; qi++) {
                              const assignedBtl = blankTemplateBtlRow[qi];
                              if (assignedBtl === n) btlMark += qMarks[questions[qi].key] || 0;
                            }
                            const maxForBtl = blankTemplateBtlMaxRow[n - 1] || 0;
                            let btlPct = 0;
                            if (!absent && maxForBtl > 0) btlPct = (btlMark / maxForBtl) * 100;
                            let cTd = cellTd;
                            if (!absent && maxForBtl > 0) {
                              if (btlPct >= 60) cTd = { ...cellTd, backgroundColor: '#d4edda', color: '#155724' };
                              else cTd = { ...cellTd, backgroundColor: '#f8d7da', color: '#721c24' };
                            }
                            return (
                              <React.Fragment key={`${idx}-btl-${n}`}>
                                <td style={{ ...cTd, textAlign: 'center' }}>{absent || maxForBtl === 0 ? '-' : fmt1(btlMark)}</td>
                                <td style={{ ...cTd, textAlign: 'center' }}>{absent || maxForBtl === 0 ? '-' : `${Math.round(btlPct)}%`}</td>
                              </React.Fragment>
                            );
                          })}
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
                </>
              )}
            </>
          ) : (
            <>
              <thead>
                <tr>
                  <th style={cellTh} colSpan={tcplColSpan}>
                    MODEL ({normalizedClassType || 'TCPL'} Header Template)
                  </th>
                </tr>
                <tr>
                  <th style={{ ...cellTh, width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH }} rowSpan={5}>
                    S.No
                  </th>
                  <th style={{ ...cellTh, minWidth: 110, overflow: 'visible', textOverflow: 'clip' }} rowSpan={5}>
                    Register No.
                  </th>
                  <th style={{ ...cellTh, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }} rowSpan={5}>
                    Name of the Students
                  </th>
                  <th style={{ ...cellTh, minWidth: 92 }} rowSpan={5}>
                    AB
                  </th>

                  {tcplQuestions.map((q) => (
                    <th key={q.key} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                      {q.label}
                    </th>
                  ))}

                  <th style={{ ...cellTh, minWidth: 56 }} rowSpan={3}>
                    Total
                  </th>
                  <th style={{ ...cellTh, minWidth: 56 }} rowSpan={3}>
                    {tcplLabLabel}
                  </th>

                  {tcplRecordExtraCols > 0 && Array.from({ length: tcplRecordExtraCols }).map((_, i) => (
                    <th key={`rec-head1-${i}`} style={{ ...cellTh, minWidth: 52, background: '#fef3c7', color: '#92400e' }} rowSpan={3}>
                      RE{i + 1}<br /><span style={{ fontSize: 10 }}>/{tcplModelRecordMaxPerExp}</span>
                    </th>
                  ))}
                  {tcplRecordAvgCol > 0 && (
                    <th style={{ ...cellTh, minWidth: 60, background: '#fde68a', color: '#78350f' }} rowSpan={3}>
                      Total<br />Avg<br /><span style={{ fontSize: 10 }}>/2</span>
                    </th>
                  )}

                  <th style={cellTh} colSpan={tcplCoCount * 2}>
                    CO ATTAINMENT
                  </th>
                  <th style={cellTh} colSpan={tcplVisibleBtls.length * 2}>
                    BTL ATTAINMENT
                  </th>
                </tr>

                <tr>
                  <th style={{ ...cellTh, fontWeight: 800 }} colSpan={tcplQuestions.length}>
                    COS
                  </th>
                  <th style={cellTh} colSpan={tcplCoCount * 2}>
                    &nbsp;
                  </th>
                  <th style={cellTh} colSpan={tcplVisibleBtls.length * 2}>
                    &nbsp;
                  </th>
                </tr>

                <tr>
                  {tcplCosRow.map((v, i) => (
                    <th key={`co-map-${i}`} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                      {v}
                    </th>
                  ))}

                  {Array.from({ length: tcplCoCount }).map((_, i) => (
                    <th key={`co-head-${i}`} style={cellTh} colSpan={2}>
                      CO-{i + 1}
                    </th>
                  ))}

                  {tcplVisibleBtls.map((n) => (
                    <th key={`btl-head-${n}`} style={cellTh} colSpan={2}>
                      BTL-{n}
                    </th>
                  ))}
                </tr>

                <tr>
                  <th style={{ ...cellTh, fontWeight: 800 }} colSpan={tcplQuestions.length}>
                    BTL
                  </th>
                  <th style={cellTh}>&nbsp;</th>
                  <th style={cellTh}>&nbsp;</th>

                  {tcplRecordExtraCols > 0 && Array.from({ length: tcplRecordExtraCols }).map((_, i) => (
                    <th key={`rec-btl4-${i}`} style={{ ...cellTh, background: '#fef9e7' }}>&nbsp;</th>
                  ))}
                  {tcplRecordAvgCol > 0 && <th style={{ ...cellTh, background: '#fef9e7' }}>&nbsp;</th>}

                  {/* CO mark/% + BTL mark/% labels */}
                  {Array.from({ length: tcplCoCount + tcplVisibleBtls.length }).flatMap((_, i) => (
                    <React.Fragment key={`mkpct-${i}`}>
                      <th style={{ ...cellTh, minWidth: 52 }}>
                        <div style={{ whiteSpace: 'pre-line', lineHeight: '0.9', fontSize: '0.7em' }}>{'M\nA\nR\nK'}</div>
                      </th>
                      <th style={{ ...cellTh, minWidth: 34 }}>%</th>
                    </React.Fragment>
                  ))}
                </tr>

                <tr>
                  {tcplQuestions.map((q) => {
                    const v = (tcplQuestionBtl || ({} as any))[q.key] ?? '';
                    const display = v === '' ? '-' : String(v);
                    return (
                      <th key={`btl-map-${q.key}`} style={{ ...cellTh, width: 40, minWidth: 40, padding: 0 }}>
                        <div style={{ position: 'relative', minWidth: 40 }}>
                          <div
                            style={{
                              width: '100%',
                              fontSize: 11,
                              padding: '4px 4px',
                              border: '1px solid #d1d5db',
                              borderRadius: 8,
                              background: '#fff',
                              textAlign: 'center',
                              userSelect: 'none',
                              margin: 2,
                            }}
                            title={`BTL: ${display}`}
                          >
                            {display}
                          </div>
                          <select
                            aria-label={`BTL for ${q.label}`}
                            value={v}
                            onChange={(e) =>
                              setTcplBtl(
                                q.key,
                                (e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)) as BtlValue,
                              )
                            }
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              opacity: 0,
                              cursor: 'pointer',
                              appearance: 'none',
                            }}
                          >
                            <option value="">-</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6</option>
                          </select>
                        </div>
                      </th>
                    );
                  })}
                  <th style={cellTh}>&nbsp;</th>
                  <th style={cellTh}>&nbsp;</th>

                  {tcplRecordExtraCols > 0 && Array.from({ length: tcplRecordExtraCols }).map((_, i) => (
                    <th key={`rec-btl5-${i}`} style={{ ...cellTh, background: '#fef9e7' }}>&nbsp;</th>
                  ))}
                  {tcplRecordAvgCol > 0 && <th style={{ ...cellTh, background: '#fef9e7' }}>&nbsp;</th>}

                  {/* Max marks are shown in the 'Name / Max Marks' row (Excel-style). */}
                  {Array.from({ length: tcplCoCount * 2 + tcplVisibleBtls.length * 2 }).map((_, i) => (
                    <th key={`tailblank-${i}`} style={cellTh}>
                      &nbsp;
                    </th>
                  ))}
                </tr>

                {/* Excel-style 'Name / Max Marks' row */}
                <tr>
                  <th style={cellTh}>S.No</th>
                  <th style={cellTh}>Register No.</th>
                  <th style={cellTh}>Name / Max Marks</th>
                  <th style={cellTh}>&nbsp;</th>

                  {tcplQuestions.map((q) => (
                    <th key={`qmax-${q.key}`} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                      {q.max}
                    </th>
                  ))}

                  <th style={cellTh}>{tcplTotalMax}</th>
                  <th style={cellTh}>30</th>

                  {tcplRecordExtraCols > 0 && Array.from({ length: tcplRecordExtraCols }).map((_, i) => (
                    <th key={`rec-maxrow-${i}`} style={{ ...cellTh, background: '#fef3c7', color: '#92400e' }}>{tcplModelRecordMaxPerExp}</th>
                  ))}
                  {tcplRecordAvgCol > 0 && (
                    <th style={{ ...cellTh, background: '#fde68a', color: '#78350f' }}>2</th>
                  )}

                  {/* CO max marks + % */}
                  {tcplCoMaxRow.flatMap((max, i) => (
                    <React.Fragment key={`co-max-mm-${i}`}>
                      <th style={cellTh}>{fmt1(max)}</th>
                      <th style={cellTh}>%</th>
                    </React.Fragment>
                  ))}

                  {/* BTL max marks + % (in max-marks row as requested) */}
                  {tcplVisibleBtls.flatMap((n) => (
                    <React.Fragment key={`btl-max-mm-${n}`}>
                      <th style={cellTh}>{fmt1(tcplBtlMaxRow[n - 1] || 0)}</th>
                      <th style={cellTh}>%</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {renderRows.map((s, idx) => (
                  <tr key={String((s as any).id ?? idx)}>
                    {(() => {
                      const rowKey = getRowKey(s as any, idx);
                      const row = (tcplSheet || ({} as any))[rowKey] || ({} as TcplRowEntry);
                      const absent = Boolean(row.absent);
                      const lab = (row.lab ?? '') as CellNumber;

                      const kind: AbsenceKind | null = absent ? normalizeAbsenceKind((row as any).absentKind) : null;
                      const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));
                      const assignedTotal = absent && kind === 'AL' ? 0 : null;
                      const cap = absent && kind === 'ML' ? 60 : absent && kind === 'SKL' ? 75 : null;

                      const qMarks: Record<string, number> = {};
                      tcplQuestions.forEach((q) => {
                        const v = (row.q || ({} as any))[q.key] ?? '';
                        const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                        qMarks[q.key] = Math.max(0, Math.min(q.max, n));
                      });

                      const labNum = typeof lab === 'number' && Number.isFinite(lab) ? Math.max(0, Math.min(tcplLabMax, lab)) : 0;
                      const total = Object.values(qMarks).reduce((sum, n) => sum + n, 0);

                      const coMark: number[] = Array.from({ length: tcplCoCount }, () => 0);
                      tcplQuestions.forEach((q, i) => {
                        const co = tcplCosRow[i] ?? 1;
                        if (co >= 1 && co <= tcplCoCount) coMark[co - 1] += qMarks[q.key] || 0;
                      });
                      if (tcplReviewIsCo5) {
                        // TCPR: add REVIEW only to CO5.
                        coMark[4] += labNum;
                      } else if (tcplModelRecordEnabled) {
                        // Record mode: CO1-CO4 equal LAB share; CO5 = CIA(lab×4/30) + (avg/maxPerExp)×2
                        for (let i = 0; i < 4; i++) coMark[i] += labNum / tcplCoCount;
                        coMark[4] += (labNum / tcplLabMax) * 4.0;
                        const _recRawRow = ((row.recordMarksCo5 ?? []) as (number | '')[]);
                        const _recValidRow = _recRawRow.slice(0, tcplModelRecordExpCount).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
                        const _recAvgRow = _recValidRow.length > 0 ? _recValidRow.reduce((a, b) => a + b, 0) / _recValidRow.length : 0;
                        coMark[4] += (_recAvgRow / tcplModelRecordMaxPerExp) * 2.0;
                      } else {
                        // TCPL: add equal LAB share to each CO.
                        for (let i = 0; i < tcplCoCount; i++) coMark[i] += labNum / tcplCoCount;
                      }

                      const coPct = coMark.map((m, i) => {
                        const denom = tcplCoMaxRow[i] || 0;
                        if (!denom) return 0;
                        return (m / denom) * 100;
                      });

                      const btlMark: number[] = [0, 0, 0, 0, 0, 0];
                      tcplQuestions.forEach((q) => {
                        const b = (tcplQuestionBtl || ({} as any))[q.key] ?? '';
                        if (typeof b === 'number' && b >= 1 && b <= 6) btlMark[b - 1] += qMarks[q.key] || 0;
                      });
                      const btlPct = btlMark.map((m, i) => {
                        const denom = tcplBtlMaxRow[i] || 0;
                        if (!denom) return 0;
                        return (m / denom) * 100;
                      });

                      const setAbsent = (v: boolean) => {
                        if (v) {
                          setTcplCell(rowKey, {
                            ...row,
                            absent: true,
                            absentKind: normalizeAbsenceKind((row as any).absentKind),
                            q: Object.fromEntries(tcplQuestions.map((q) => [q.key, ''])),
                            lab: '',
                          });
                          return;
                        }

                        setTcplCell(rowKey, {
                          ...row,
                          absent: false,
                          absentKind: undefined,
                        });
                      };

                      const setAbsentKind = (v: AbsenceKind) => {
                        setTcplCell(rowKey, {
                          ...row,
                          absent: true,
                          absentKind: normalizeAbsenceKind(v),
                        });
                      };

                      const setLab = (raw: string) => {
                        if (absent && !canEditAbsent) return;
                        setTcplCell(rowKey, {
                          ...row,
                          lab: clampCell(raw, tcplLabMax),
                        });
                      };

                      const setRecordMark = (expIdx: number, raw: string) => {
                        if (absent && !canEditAbsent) return;
                        const next = Number(raw);
                        const nextVal: number | '' = raw === '' ? '' : (Number.isFinite(next) ? Math.max(0, Math.min(tcplModelRecordMaxPerExp, next)) : '');
                        const currentRecs: (number | '')[] = Array.from({ length: tcplModelRecordExpCount }, (_, i) => {
                          const v = (row.recordMarksCo5 ?? [])[i];
                          return typeof v === 'number' ? v : '';
                        });
                        currentRecs[expIdx] = nextVal;
                        setTcplCell(rowKey, { ...row, recordMarksCo5: currentRecs });
                      };

                      const setQ = (qKey: string, raw: string, max: number) => {
                        if (absent && !canEditAbsent) return;
                        const nextValue = clampCell(raw, max);
                        const nextQ = {
                          ...(row.q || {}),
                          [qKey]: nextValue,
                        };

                        if (cap != null) {
                          const nextTotal = tcplQuestions.reduce((sum, q) => {
                            const v = (nextQ as any)[q.key] ?? '';
                            const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                            return sum + Math.max(0, Math.min(q.max, n));
                          }, 0);
                          if (nextTotal > cap) {
                            setLimitDialog({
                              title: 'Mark limit exceeded',
                              message: kind === 'ML' ? 'For malpractice the total mark assigned is 60' : 'For Sick leave the Total mark assigned is 75',
                            });
                            return;
                          }
                        }

                        setTcplCell(rowKey, {
                          ...row,
                          q: nextQ,
                        });
                      };

                      const colOrder = [...tcplQuestions.map((q) => q.key), 'lab'] as const;

                      const moveFocus = (colKey: string, dir: 'left' | 'right' | 'up' | 'down') => {
                        const colIndex = colOrder.indexOf(colKey as any);
                        const nextColIndex =
                          dir === 'left'
                            ? Math.max(0, colIndex - 1)
                            : dir === 'right'
                              ? Math.min(colOrder.length - 1, colIndex + 1)
                              : colIndex;
                        const nextRowIndex =
                          dir === 'up'
                            ? Math.max(0, idx - 1)
                            : dir === 'down'
                              ? Math.min(renderRows.length - 1, idx + 1)
                              : idx;
                        const nextRowKey = getRowKey(renderRows[nextRowIndex] as any, nextRowIndex);
                        const target = `${nextRowKey}|${colOrder[nextColIndex]}`;
                        focusRef(target);
                      };

                      const onCellKeyDown = (colKey: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          const colIndex = colOrder.indexOf(colKey);
                          if (!e.shiftKey) {
                            if (colIndex === colOrder.length - 1) {
                              const nextRowIndex = Math.min(renderRows.length - 1, idx + 1);
                              focusRef(`${getRowKey(renderRows[nextRowIndex] as any, nextRowIndex)}|${colOrder[0]}`);
                            } else {
                              moveFocus(colKey, 'right');
                            }
                          } else {
                            if (colIndex === 0) {
                              const prevRowIndex = Math.max(0, idx - 1);
                              focusRef(`${getRowKey(renderRows[prevRowIndex] as any, prevRowIndex)}|${colOrder[colOrder.length - 1]}`);
                            } else {
                              moveFocus(colKey, 'left');
                            }
                          }
                        } else if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          moveFocus(colKey, 'left');
                        } else if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          moveFocus(colKey, 'right');
                        } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
                          e.preventDefault();
                          moveFocus(colKey, 'up');
                        } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                          e.preventDefault();
                          moveFocus(colKey, 'down');
                        }
                      };

                      return (
                        <>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={cellTd}>{s.reg_no || '\u00A0'}</td>
                    <td style={cellTd}>{s.name || '\u00A0'}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />
                        {absent ? (
                          <div className="obe-ios-select" title="Absent type">
                            <span className="obe-ios-select-value">{kind || 'AL'}</span>
                            <select
                              aria-label="Absent type"
                              value={(kind || 'AL') as any}
                              onChange={(e) => setAbsentKind(normalizeAbsenceKind(e.target.value))}
                            >
                              <option value="AL">AL</option>
                              <option value="ML">ML</option>
                              <option value="SKL">SKL</option>
                            </select>
                          </div>
                        ) : null}
                      </div>
                    </td>

                    {tcplQuestions.map((q) => {
                      const v = (row.q || ({} as any))[q.key] ?? '';
                      const inputKey = `${rowKey}|${q.key}`;
                      const atMax = v !== '' && Number(v) >= q.max;
                      return (
                        <td key={`${idx}-${q.key}`} style={{ ...cellTd, textAlign: 'center', background: atMax ? 'rgba(251,191,36,0.12)' : undefined }}>
                          <input
                            ref={registerRef(inputKey)}
                            type="text"
                            inputMode="decimal"
                            disabled={absent && !canEditAbsent}
                            value={v === '' ? '' : String(v)}
                            title={`Max mark: ${q.max}`}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                e.currentTarget.setCustomValidity('');
                                setQ(q.key, '', q.max);
                                return;
                              }
                              const next = Number(raw);
                              if (!Number.isFinite(next)) return;
                              if (next > q.max) {
                                showMarkLimitPopup(e.currentTarget, `Mark cannot be higher than ${q.max}`, s as any);
                                setQ(q.key, '', q.max);
                                return;
                              }
                              e.currentTarget.setCustomValidity('');
                              setQ(q.key, raw, q.max);
                            }}
                            onBlur={(e) => {
                              const raw = e.target.value;
                              if (raw === '') return;
                              const next = Number(raw);
                              if (!Number.isFinite(next) || next < 0 || next > q.max) {
                                showMarkLimitPopup(e.currentTarget, `Mark cannot be higher than ${q.max}`, s as any);
                                setQ(q.key, '', q.max);
                              }
                            }}
                            onFocus={(e) => e.currentTarget.select()}
                            onKeyDown={onCellKeyDown(q.key)}
                            style={{ ...excelInputStyle, color: atMax ? '#92400e' : undefined }}
                          />
                        </td>
                      );
                    })}

                    <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{fmt1(assignedTotal != null ? assignedTotal : total)}</td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <input
                        ref={registerRef(`${rowKey}|lab`)}
                        type="text"
                        inputMode="decimal"
                        disabled={absent && !canEditAbsent}
                        value={lab === '' ? '' : String(lab)}
                        title={`Max mark: ${tcplLabMax}`}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            e.currentTarget.setCustomValidity('');
                            setLab('');
                            return;
                          }
                          const next = Number(raw);
                          if (!Number.isFinite(next)) return;
                          if (next > tcplLabMax) {
                            showMarkLimitPopup(e.currentTarget, `LAB mark cannot be higher than ${tcplLabMax}`, s as any);
                            setLab('');
                            return;
                          }
                          e.currentTarget.setCustomValidity('');
                          setLab(raw);
                        }}
                        onBlur={(e) => {
                          const raw = e.target.value;
                          if (raw === '') return;
                          const next = Number(raw);
                          if (!Number.isFinite(next) || next < 0 || next > tcplLabMax) {
                            showMarkLimitPopup(e.currentTarget, `LAB mark cannot be higher than ${tcplLabMax}`, s as any);
                            setLab('');
                          }
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={onCellKeyDown('lab')}
                        style={excelInputStyle}
                      />
                    </td>

                    {/* Record experiment marks for CO5 (when enabled) */}
                    {tcplRecordExtraCols > 0 && (() => {
                      const recRaw = (row.recordMarksCo5 ?? []) as (number | '')[];
                      const recNums = Array.from({ length: tcplModelRecordExpCount }, (_, i) => {
                        const v = recRaw[i];
                        return typeof v === 'number' && Number.isFinite(v) ? v : null;
                      });
                      const recValid = recNums.filter((x): x is number => x !== null);
                      const recAvg = recValid.length > 0 ? recValid.reduce((a, b) => a + b, 0) / recValid.length : null;
                      const recScaled = recAvg !== null ? (recAvg / tcplModelRecordMaxPerExp) * 2.0 : null;
                      return (
                        <>
                          {Array.from({ length: tcplRecordExtraCols }).map((_, expIdx) => {
                            const recVal = recRaw[expIdx];
                            const displayVal = typeof recVal === 'number' ? String(recVal) : '';
                            return (
                              <td key={`rec-${idx}-${expIdx}`} style={{ ...cellTd, textAlign: 'center', background: '#fef9e7' }}>
                                <input
                                  ref={registerRef(`${rowKey}|rec${expIdx}`)}
                                  type="text"
                                  inputMode="decimal"
                                  disabled={absent && !canEditAbsent}
                                  value={displayVal}
                                  title={`Record Exp ${expIdx + 1} (Max: ${tcplModelRecordMaxPerExp})`}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') { setRecordMark(expIdx, ''); return; }
                                    const next = Number(raw);
                                    if (!Number.isFinite(next)) return;
                                    if (next > tcplModelRecordMaxPerExp) {
                                      showMarkLimitPopup(e.currentTarget, `Record mark cannot exceed ${tcplModelRecordMaxPerExp}`, s as any);
                                      setRecordMark(expIdx, '');
                                      return;
                                    }
                                    setRecordMark(expIdx, raw);
                                  }}
                                  onBlur={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') return;
                                    const next = Number(raw);
                                    if (!Number.isFinite(next) || next < 0 || next > tcplModelRecordMaxPerExp) {
                                      showMarkLimitPopup(e.currentTarget, `Record mark cannot exceed ${tcplModelRecordMaxPerExp}`, s as any);
                                      setRecordMark(expIdx, '');
                                    }
                                  }}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onKeyDown={onCellKeyDown(`rec${expIdx}`)}
                                  style={{ ...excelInputStyle, background: 'transparent' }}
                                />
                              </td>
                            );
                          })}
                          {/* Total Average column: avg scaled to /2 */}
                          <td style={{ ...cellTd, textAlign: 'center', background: '#fde68a', color: '#78350f', fontWeight: 700 }}>
                            {recScaled !== null ? fmt1(recScaled) : ''}
                          </td>
                        </>
                      );
                    })()}

                    {/* CO attainment: MARK + % */}
                    {coMark.flatMap((m, i) => (
                      <React.Fragment key={`co-${idx}-${i}`}>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(m)}</td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(coPct[i])}</td>
                      </React.Fragment>
                    ))}

                    {/* BTL attainment: MARK + % */}
                    {tcplVisibleBtls.flatMap((n) => (
                      <React.Fragment key={`btl-${idx}-${n}`}>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(btlMark[n - 1] || 0)}</td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(btlPct[n - 1] || 0)}</td>
                      </React.Fragment>
                    ))}
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </>
          )}
          </table>
        </div>
      </div>
    </AssessmentContainer>
  );
}
