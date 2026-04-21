import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../../services/roster';
import { lsGet } from '../../utils/localStorage';
import { exportCqiPdf } from '../../utils/cqiExportPdf';
import { getCachedMe } from '../../services/auth';
import { fetchWithAuth } from '../../services/fetchAuth';
import { 
  createEditRequest,
  createPublishRequest,
  fetchPublishedSsa1, 
  fetchPublishedSsa2, 
  fetchPublishedFormative1, 
  fetchPublishedFormative,
  fetchPublishedCia1Sheet,
  fetchPublishedCiaSheet,
  fetchPublishedReview1,
  fetchPublishedReview2,
  fetchPublishedLabSheet,
  fetchPublishedModelSheet,
  fetchDraft,
  fetchIqacCqiConfig,
  fetchIqacQpPattern,
  fetchClassTypeWeights,
  formatApiErrorMessage,
  formatEditRequestSentMessage,
} from '../../services/obe';
import { fetchAssessmentMasterConfig } from '../../services/cdapDb';
import { normalizeClassType, normalizeObeClassType } from '../../constants/classTypes';
import { ensureMobileVerified } from '../../services/auth';
import { useCqiEditRequestsEnabled } from '../../utils/requestControl';
import { useEditRequestPending } from '../../hooks/useEditRequestPending';
import { useMarkTableLock } from '../../hooks/useMarkTableLock';
import { useEditWindow } from '../../hooks/useEditWindow';
import { formatRemaining, usePublishWindow } from '../../hooks/usePublishWindow';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { getInternalMarkWeightSlotsForCo } from '../../utils/internalMarkWeights';

interface CQIEntryProps {
  subjectId?: string;
  teachingAssignmentId?: number;
  classType?: string | null;
  questionPaperType?: string | null;
  enabledAssessments?: string[] | null;
  assessmentType?: 'cia1' | 'cia2' | 'model' | 'review1' | 'review2';
  cos?: string[];
  cqiDivider?: number;
  cqiMultiplier?: number;
}

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type CQIEntry = {
  [key: string]: number | null; // e.g., co1: 5, co2: null
};

// Same model (theory) sheet template mapping used in Internal Marks.
const MODEL_THEORY_QUESTIONS: Array<{ key: string; max: number }> = [
  { key: 'q1', max: 2 },
  { key: 'q2', max: 2 },
  { key: 'q3', max: 2 },
  { key: 'q4', max: 2 },
  { key: 'q5', max: 2 },
  { key: 'q6', max: 2 },
  { key: 'q7', max: 2 },
  { key: 'q8', max: 2 },
  { key: 'q9', max: 2 },
  { key: 'q10', max: 2 },
  { key: 'q11', max: 14 },
  { key: 'q12', max: 14 },
  { key: 'q13', max: 14 },
  { key: 'q14', max: 14 },
  { key: 'q15', max: 14 },
  { key: 'q16', max: 10 },
];

const MODEL_THEORY_CO_ROW = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5, 5] as const;
const TCPL_REVIEW_EXPERIMENT_WEIGHT: Record<number, number> = { 1: 9, 2: 9, 3: 4.5 };
const TCPL_REVIEW_CAA_WEIGHT: Record<number, number> = { 1: 3, 2: 3, 3: 1.5 };
const TCPL_REVIEW_CAA_RAW_MAX: Record<number, number> = { 1: 20, 2: 20, 3: 10 };
const TCPL_REVIEW_CO_MAX: Record<number, number> = { 1: 12, 2: 12, 3: 6 };
const LAB_EXPERIMENT_WEIGHT_BY_CO: Record<number, number> = { 1: 9, 2: 9, 3: 4.5, 4: 9, 5: 9 };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeEnabledAssessments(enabledAssessments: string[] | null | undefined): Set<string> {
  const arr = Array.isArray(enabledAssessments) ? enabledAssessments : [];
  return new Set(arr.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
}

function normalizeMarksArray(raw: unknown, length: number): Array<number | ''> {
  if (Array.isArray(raw)) {
    const out: Array<number | ''> = raw.slice(0, length).map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : ''));
    while (out.length < length) out.push('');
    return out;
  }
  return new Array(length).fill('');
}

function avgMarks(arr: Array<number | ''>): number | null {
  const nums = (arr || []).filter((x) => typeof x === 'number' && Number.isFinite(x)) as number[];
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function sumMarks(arr: Array<number | ''>): number {
  return (arr || []).reduce<number>((sum, value) => {
    return typeof value === 'number' && Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function normalizedContribution(obtained: number, totalMax: number, weight: number): number {
  if (!Number.isFinite(obtained) || !Number.isFinite(totalMax) || !Number.isFinite(weight)) return 0;
  if (totalMax <= 0 || weight <= 0) return 0;
  const safeObtained = clamp(obtained, 0, totalMax);
  return (safeObtained / totalMax) * weight;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseCoNumber(value: unknown, fallback = 1) {
  const n = Number(value);
  if (Number.isFinite(n)) return clamp(Math.round(n), 1, 5);
  const s = String(value ?? '').toUpperCase();
  const m = s.match(/\d+/);
  return m ? clamp(Number(m[0]), 1, 5) : fallback;
}

function componentLabel(ct: string, key: string): string {
  const k = String(key || '').toLowerCase();
  if (k === 'ssa') return 'SSA';
  if (k === 'cia') return 'CIA';
  if (k === 'fa') return 'FA';
  if (k === 'review') return 'REVIEW';
  if (k === 'me') return 'ME';
  if (k === 'lab1') return ct === 'TCPL' ? 'LAB1' : 'LAB1';
  if (k === 'lab2') return ct === 'TCPL' ? 'LAB2' : 'LAB2';
  return String(key || '').toUpperCase();
}

function toNumOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function compareStudentName(a: { name?: string; reg_no?: string }, b: { name?: string; reg_no?: string }) {
  const aLast3 = parseInt(String(a?.reg_no || '').slice(-3), 10);
  const bLast3 = parseInt(String(b?.reg_no || '').slice(-3), 10);
  return (isNaN(aLast3) ? 9999 : aLast3) - (isNaN(bLast3) ? 9999 : bLast3);
}

function parseCo12(raw: unknown): 1 | 2 | '1&2' {
  if (raw === '1&2' || raw === 'both') return '1&2';
  if (typeof raw === 'string') {
    const s0 = raw.trim().toUpperCase();
    const s = s0.replace(/\s+/g, '');
    // Be forgiving: if the string contains both 1 and 2 anywhere, treat as split.
    // This covers formats like "CO1&CO2", "CO1-CO2", "CO1/CO2", etc.
    const has1 = s.includes('1');
    const has2 = s.includes('2');
    if (has1 && has2) return '1&2';
    if (
      s === '1&2' ||
      s === '1,2' ||
      s === '1/2' ||
      s === '2/1' ||
      s === 'CO1&CO2' ||
      s === 'CO1,CO2' ||
      s === 'CO1/CO2' ||
      s === 'CO2/CO1'
    )
      return '1&2';
    if (s === 'CO2' || s === '2') return 2;
    if (s === 'CO1' || s === '1') return 1;
  }
  if (Array.isArray(raw)) {
    const nums = raw
      .map((v) => {
        if (typeof v === 'string') {
          const m = v.match(/\d+/);
          return m ? Number(m[0]) : Number(v);
        }
        return Number(v);
      })
      .filter((n) => Number.isFinite(n));
    if (nums.includes(1) && nums.includes(2)) return '1&2';
    if (nums.includes(2)) return 2;
    if (nums.includes(1)) return 1;
  }
  const n = typeof raw === 'string' ? Number((raw.match(/\d+/) || [])[0]) : Number(raw);
  if (n === 2) return 2;
  if (n === 12) return '1&2';
  return 1;
}

function parseCo34(raw: unknown): 3 | 4 | '3&4' {
  if (raw === '3&4' || raw === 'both') return '3&4';
  if (typeof raw === 'string') {
    const s0 = raw.trim().toUpperCase();
    const s = s0.replace(/\s+/g, '');
    // Be forgiving: infer by presence of digits.
    // This covers formats like "CO4(A)", "CO3-CO4", "3 & 4", etc.
    // For QP1FINAL / legacy CIA2 configs, CO2 is treated as the "second" CIA2 slot
    // and CO1 as the "first" CIA2 slot, matching InternalMarkCoursePage logic.
    const has3 = s.includes('3');
    const has4 = s.includes('4');
    const has2 = s.includes('2');
    const has1 = s.includes('1');
    if (has3 && has4) return '3&4';
    if (has2 && has3) return '3&4';
    if (has1 && has2) return '3&4';
    if (has4) return 4;
    if (has2) return 4;
    if (has3) return 3;
    if (has1) return 3;
    if (
      s === '3&4' ||
      s === '3,4' ||
      s === '3/4' ||
      s === '4/3' ||
      s === '2&3' ||
      s === '2,3' ||
      s === '2/3' ||
      s === '3/2' ||
      s === '1&2' ||
      s === '1,2' ||
      s === '1/2' ||
      s === '2/1' ||
      s === 'CO3&CO4' ||
      s === 'CO3,CO4' ||
      s === 'CO3/CO4' ||
      s === 'CO4/CO3' ||
      s === 'CO2&CO3' ||
      s === 'CO2,CO3' ||
      s === 'CO2/CO3' ||
      s === 'CO3/CO2' ||
      s === 'CO1&CO2' ||
      s === 'CO1,CO2' ||
      s === 'CO1/CO2' ||
      s === 'CO2/CO1'
    )
      return '3&4';
    if (s === 'CO4' || s === '4') return 4;
    if (s === 'CO2' || s === '2') return 4;
    if (s === 'CO3' || s === '3') return 3;
    if (s === 'CO1' || s === '1') return 3;
  }
  if (Array.isArray(raw)) {
    const nums = raw
      .map((v) => {
        if (typeof v === 'string') {
          const m = v.match(/\d+/);
          return m ? Number(m[0]) : Number(v);
        }
        return Number(v);
      })
      .filter((n) => Number.isFinite(n));
    if (nums.includes(3) && nums.includes(4)) return '3&4';
    if (nums.includes(2) && nums.includes(3)) return '3&4';
    if (nums.includes(1) && nums.includes(2)) return '3&4';
    if (nums.includes(4)) return 4;
    if (nums.includes(2)) return 4;
    if (nums.includes(3)) return 3;
    if (nums.includes(1)) return 3;
  }
  const n = typeof raw === 'string' ? Number((raw.match(/\d+/) || [])[0]) : Number(raw);
  if (n === 4) return 4;
  if (n === 2) return 4;
  if (n === 1) return 3;
  if (n === 3) return 3;
  if (n === 34) return '3&4';
  if (n === 23) return '3&4';
  if (n === 12) return '3&4';
  return 3;
}

/**
 * Parse a question's CO label into an array of actual CO numbers.
 * "1" → [1], "CO2" → [2], "1&2" → [1,2], "CO2&CO3" → [2,3], 2 → [2], etc.
 * Used by QP1FINAL direct-number matching (avoids parseCo34 slot mapping).
 */
function parseQuestionCoNumbers(raw: unknown): number[] {
  if (raw == null) return [1];
  if (typeof raw === 'number' && Number.isFinite(raw)) return [raw];
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase().replace(/\s+/g, '');
    const parts = s.split(/[&,\/]+/);
    const nums: number[] = [];
    for (const p of parts) {
      const m = p.match(/\d+/);
      if (m) nums.push(Number(m[0]));
    }
    if (nums.length > 0) return [...new Set(nums)];
  }
  if (Array.isArray(raw)) {
    const nums: number[] = [];
    for (const v of raw) {
      const m = String(v ?? '').match(/\d+/);
      if (m) nums.push(Number(m[0]));
    }
    if (nums.length > 0) return [...new Set(nums)];
  }
  return [1];
}

function effectiveCia1Weights(questions: any[], idx: number): { co1: number; co2: number } {
  const q = questions[idx];
  if (!q) return { co1: 0, co2: 0 };
  const rawCo = (q as any)?.co;
  const parsed = parseCo12(rawCo);
  if (parsed === '1&2') return { co1: 0.5, co2: 0.5 };

  return parsed === 2 ? { co1: 0, co2: 1 } : { co1: 1, co2: 0 };
}

function effectiveCia2Weights(questions: any[], idx: number): { co3: number; co4: number } {
  const q = questions[idx];
  if (!q) return { co3: 0, co4: 0 };
  const rawCo = (q as any)?.co;
  const parsed = parseCo34(rawCo);
  if (parsed === '3&4') return { co3: 0.5, co4: 0.5 };

  return parsed === 4 ? { co3: 0, co4: 1 } : { co3: 1, co4: 0 };
}

export default function CQIEntry({ 
  subjectId, 
  teachingAssignmentId, 
  classType,
  questionPaperType,
  enabledAssessments,
  assessmentType,
  cos,
  cqiDivider,
  cqiMultiplier,
}: CQIEntryProps) {
    const [taMeta, setTaMeta] = useState<{ subjectCode: string; subjectName: string } | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [coTotals, setCoTotals] = useState<Record<number, Record<string, { value: number; max: number } | null>>>({});
  const [cqiEntries, setCqiEntries] = useState<Record<number, CQIEntry>>({});
  const [cqiErrors, setCqiErrors] = useState<Record<string, string>>({});
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [globalCfg, setGlobalCfg] = useState<{ divider: number; multiplier: number; options: any[] } | null>(null);

  // Track previously published CQI pages (other pages) so already-attained COs are read-only.
  // priorPublishedCos: set of CO numbers already published in OTHER CQI pages (not this page)
  // priorCqiEntries: merged entries from ALL published pages (student → {co1: val, co2: val, ...})
  const [priorPublishedCos, setPriorPublishedCos] = useState<Set<number>>(new Set());
  const [priorCqiEntries, setPriorCqiEntries] = useState<Record<number | string, Record<string, number | null>>>({});

  const classTypeKey = useMemo(() => {
    const v = String(normalizeClassType(classType) || '').trim().toUpperCase();
    if (!v) return '';
    if (v === 'THEORY') return 'THEORY';
    return v;
  }, [classType]);

  const qpTypeKey = useMemo(() => {
    const s = String(questionPaperType ?? '').trim().toUpperCase();
    return s; // pass through full string so 'QP1 FINAL YEAR' etc. are preserved
  }, [questionPaperType]);

  const THRESHOLD_PERCENT = 58;

  // Debug/testing UI flags (temporary)
  const [debugMode, setDebugMode] = useState(true);
  const [headerMaxVisible, setHeaderMaxVisible] = useState(true);
  const [draftLog, setDraftLog] = useState<{ updated_at?: string | null; updated_by?: any | null } | null>(null);
  const [publishedLog, setPublishedLog] = useState<{ published_at?: string | null } | null>(null);
  const [localPublished, setLocalPublished] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [resettingMarks, setResettingMarks] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [requestEditOpen, setRequestEditOpen] = useState(false);
  const [editRequestReason, setEditRequestReason] = useState('');
  const [editRequestBusy, setEditRequestBusy] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Parse COs from the cos array (e.g., ["CO1", "CO2"] => [1, 2])
  const rawCoNumbers = useMemo(() => {
    if (!cos || !Array.isArray(cos)) return [];
    return cos
      .map(co => {
        const match = co.match(/\d+/);
        return match ? parseInt(match[0]) : null;
      })
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
  }, [cos]);

  // IQAC QP pattern–based CO override: for QP1 FINAL YEAR (and similar),
  // the COs for each assessment may differ from the hardcoded parseCqiOption defaults.
  const [iqacCqiCos, setIqacCqiCos] = useState<number[] | null>(null);

  useEffect(() => {
    if (!classTypeKey || !qpTypeKey) return;
    const examMap: Record<string, string[]> = {
      cia1: ['CIA1'],
      cia2: ['CIA2'],
      model: ['CIA2', 'MODEL'],   // model CQI combines CIA2 + MODEL COs
      review1: ['SSA1'],
      review2: ['SSA2'],
    };
    const exams = examMap[String(assessmentType || '').toLowerCase()];
    if (!exams || !exams.length) return;

    let cancelled = false;
    const qpForApi = classTypeKey === 'THEORY' ? (qpTypeKey || null) : null;
    const extractCos = (res: any): number[] => {
      const cosArr = Array.isArray(res?.pattern?.cos) ? res.pattern.cos : [];
      return cosArr.flatMap((c: any) =>
        String(c).split('&').map(s => { const m = s.match(/\d+/); return m ? parseInt(m[0]) : NaN; })
      ).filter((n: number) => !isNaN(n));
    };

    (async () => {
      try {
        const results = await Promise.all(
          exams.map(exam =>
            fetchIqacQpPattern({ class_type: classTypeKey, question_paper_type: qpForApi, exam: exam as any })
              .catch(() => null)
          )
        );
        if (cancelled) return;
        const allCos = results.flatMap(r => extractCos(r));
        const unique = [...new Set(allCos)].sort((a, b) => a - b);
        if (unique.length) setIqacCqiCos(unique);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [classTypeKey, qpTypeKey, assessmentType]);

  // Use pattern-derived COs when available, fall back to prop-derived
  const coNumbers = useMemo(() => {
    return iqacCqiCos && iqacCqiCos.length > 0 ? iqacCqiCos : rawCoNumbers;
  }, [iqacCqiCos, rawCoNumbers]);

  const cqiPageKey = useMemo(() => {
    const assessment = String(assessmentType || 'generic').trim().toLowerCase();
    const coKey = coNumbers.length ? coNumbers.join(',') : 'none';
    return `${assessment}:${coKey}`;
  }, [assessmentType, coNumbers]);

  const cqiQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (teachingAssignmentId) params.set('teaching_assignment_id', String(teachingAssignmentId));
    if (cqiPageKey) params.set('page_key', cqiPageKey);
    if (assessmentType) params.set('assessment_type', String(assessmentType));
    if (coNumbers.length) params.set('co_numbers', coNumbers.join(','));
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [assessmentType, cqiPageKey, coNumbers, teachingAssignmentId]);

  const buildCqiPayload = (entries: Record<number, CQIEntry>) => ({
    pageKey: cqiPageKey,
    assessmentType: assessmentType || null,
    coNumbers,
    entries,
  });

  const cqiAssessmentKey = useMemo(() => {
    const assessment = String(assessmentType || 'model')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'model';
    const coSuffix = coNumbers.length ? `_${coNumbers.join('_')}` : '';
    return `cqi_${assessment}${coSuffix}` as const;
  }, [assessmentType, coNumbers]);

  const editRequestsEnabled = useCqiEditRequestsEnabled();
  const {
    data: publishWindow,
    publishAllowed,
    remainingSeconds,
    loading: publishWindowLoading,
    error: publishWindowError,
    refresh: refreshPublishWindow,
  } = usePublishWindow({ assessment: cqiAssessmentKey, subjectCode: String(subjectId || ''), teachingAssignmentId });
  const { data: markLock, refresh: refreshMarkLock } = useMarkTableLock({
    assessment: cqiAssessmentKey,
    subjectCode: String(subjectId || ''),
    teachingAssignmentId,
    options: { poll: true },
  });
  const { data: markEntryEditWindow, refresh: refreshMarkEntryEditWindow } = useEditWindow({
    assessment: cqiAssessmentKey,
    subjectCode: String(subjectId || ''),
    scope: 'MARK_ENTRY',
    teachingAssignmentId,
    options: { poll: true },
  });
  const isPublished = Boolean(localPublished || markLock?.is_published || publishedLog?.published_at);
  
  const entryOpen = !isPublished
    ? true
    : Boolean(markLock?.entry_open) || Boolean(markEntryEditWindow?.allowed_by_approval);

  const publishedEditLocked = Boolean(isPublished && !entryOpen);
  
  const publishButtonIsRequestEdit = Boolean(publishedEditLocked && editRequestsEnabled);
  const editRequestsBlocked = Boolean(publishedEditLocked && !editRequestsEnabled);
  const readOnly = publishedEditLocked;
  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);
  const tableBlocked = Boolean(globalLocked || publishedEditLocked);
  const {
    pending: markEntryReqPending,
    setPendingUntilMs: setMarkEntryReqPendingUntilMs,
    refresh: refreshMarkEntryReqPending,
  } = useEditRequestPending({
    enabled: Boolean(publishButtonIsRequestEdit) && Boolean(subjectId),
    assessment: cqiAssessmentKey,
    subjectCode: subjectId ? String(subjectId) : null,
    scope: 'MARK_ENTRY',
    teachingAssignmentId,
  });

  useLockBodyScroll(Boolean(requestEditOpen));

  // Load CQI data: try published first, then fall back to draft.
  // Both loads are combined into one sequential effect so the draft
  // can never race to overwrite published data.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId || !teachingAssignmentId) {
        if (mounted) setPublishedLog(null);
        return;
      }

      // --- Step 1: try published snapshot ---
      try {
        const res = await fetchWithAuth(`/api/obe/cqi-published/${encodeURIComponent(String(subjectId))}${cqiQuery}`).catch(() => null);
        if (!mounted) return;
        if (res && res.ok) {
          const j = await res.json().catch(() => null);
          const pub = j?.published;
          if (pub && typeof pub === 'object' && pub.entries && typeof pub.entries === 'object') {
            setCqiEntries(pub.entries || {});
            setDirty(false);
            setPublishedLog({ published_at: pub.publishedAt ?? null });
            if (pub.publishedAt) setLocalPublished(true);
            return; // published found — do NOT load draft on top of it
          }
        }
      } catch {
        // ignore
      }
      if (!mounted) return;
      setPublishedLog(null);

      // --- Step 2: no published data — load draft (skip if read-only) ---
      if (readOnly) return;
      try {
        const res = await fetchWithAuth(`/api/obe/cqi-draft/${encodeURIComponent(String(subjectId))}${cqiQuery}`, { method: 'GET' }).catch(() => null);
        if (!mounted) return;
        if (res && res.ok) {
          const j = await res.json().catch(() => null);
          if (j?.draft) {
            setCqiEntries(j.draft.entries || j.draft || {});
            setDraftLog({ updated_at: j.updated_at || null, updated_by: j.updated_by || null });
          } else {
            setCqiEntries({});
            setDraftLog(null);
          }
          setDirty(false);
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [subjectId, teachingAssignmentId, readOnly, cqiQuery]);

  // Load ALL published CQI pages (without page-specific params) to discover previously attained COs.
  // COs published in OTHER pages become read-only and cannot be re-entered.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId || !teachingAssignmentId) {
        if (mounted) { setPriorPublishedCos(new Set()); setPriorCqiEntries({}); }
        return;
      }
      try {
        const allQp = `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}&include_page_entries=1`;
        const res = await fetchWithAuth(`/api/obe/cqi-published/${encodeURIComponent(String(subjectId))}${allQp}`).catch(() => null);
        if (!mounted) return;
        if (res && res.ok) {
          const j = await res.json().catch(() => null);
          const pub = j?.published;
          if (pub && typeof pub === 'object') {
            const pages: Array<{
              key: string;
              assessmentType?: string | null;
              coNumbers?: number[];
              publishedAt?: string | null;
              entries?: Record<string, Record<string, number | null>>;
            }> = Array.isArray(pub.pages) ? pub.pages : [];

            // Identify COs published in OTHER pages (not this page's key)
            const thisPageKey = cqiPageKey;
            const otherCos = new Set<number>();
            const allEntries: Record<string, Record<string, number | null>> = {};

            for (const pg of pages) {
              if (!pg.publishedAt) continue;
              // This page is "other" if its key doesn't match the current page
              const isOtherPage = String(pg.key || '') !== String(thisPageKey || '');
              const pgCos = (pg.coNumbers || []).filter((n: number) => typeof n === 'number' && n >= 1 && n <= 20);
              if (isOtherPage) {
                for (const co of pgCos) otherCos.add(co);
              }
              // Merge entries from ALL published pages for display
              const pgEntries = pg.entries && typeof pg.entries === 'object' ? pg.entries : {};
              for (const [studentId, entry] of Object.entries(pgEntries)) {
                if (!entry || typeof entry !== 'object') continue;
                if (!allEntries[studentId]) allEntries[studentId] = {};
                Object.assign(allEntries[studentId], entry);
              }
            }

            setPriorPublishedCos(otherCos);
            setPriorCqiEntries(allEntries);
            return;
          }
        }
      } catch {
        // ignore
      }
      if (mounted) { setPriorPublishedCos(new Set()); setPriorCqiEntries({}); }
    })();
    return () => { mounted = false; };
  }, [subjectId, teachingAssignmentId, cqiPageKey]);

  // Load global IQAC CQI config (applies to all courses).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res: any = await fetchIqacCqiConfig();
        if (!mounted) return;
        const divider = Number(res?.divider);
        const multiplier = Number(res?.multiplier);
        setGlobalCfg({
          options: Array.isArray(res?.options) ? res.options : [],
          divider: Number.isFinite(divider) ? divider : 2,
          multiplier: Number.isFinite(multiplier) ? multiplier : 0.15,
        });
      } catch {
        if (mounted) setGlobalCfg(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Compute header maxes for each CO column from `coTotals` so we can show Max in the table header
  const headerMaxes = useMemo(() => {
    const out: Record<number, number | null> = {};
    coNumbers.forEach((coNum) => {
      const key = `co${coNum}`;
      let maxVal: number | null = null;
      Object.values(coTotals).forEach((perStudent) => {
        const cell = perStudent && perStudent[key];
        if (cell && typeof (cell as any).max === 'number') {
          const m = (cell as any).max;
          if (maxVal == null || m > maxVal) maxVal = m;
        }
      });
      out[coNum] = maxVal;
    });
    return out;
  }, [coTotals, coNumbers]);

  // Load master config
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [subjectId]);

  // Load roster
  useEffect(() => {
    if (!teachingAssignmentId) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const resp = await fetchTeachingAssignmentRoster(teachingAssignmentId);
                const ta = (resp as any)?.teaching_assignment;
                if (ta && (ta.subject_code || ta.subject_name)) {
                  setTaMeta({
                    subjectCode: String(ta.subject_code || '').trim(),
                    subjectName: String(ta.subject_name || '').trim(),
                  });
                } else {
                  setTaMeta(null);
                }
        if (!mounted) return;
        
        const roster = (resp.students || [])
          .map((s: TeachingAssignmentRosterStudent) => ({
            id: Number(s.id),
            reg_no: String(s.reg_no ?? ''),
            name: String(s.name ?? ''),
            section: s.section ?? null,
          }))
          .filter((s) => Number.isFinite(s.id))
          .sort(compareStudentName);
        
        setStudents(roster);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load roster');
        setTaMeta(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [teachingAssignmentId]);

  const exportRowsAll = useMemo(() => {
    if (!students.length || !coNumbers.length) return [] as Array<{ regNo?: string; name: string; section?: string | null; flaggedCos: string[]; total?: number | null }>;
    return students.map((s) => {
      const studentTotals: any = coTotals[s.id] || {};
      const flaggedCos = coNumbers
        .filter((coNum) => {
          const cell = studentTotals?.[`co${coNum}`];
          const max = Number(cell?.max || 0);
          const val = Number(cell?.value || 0);
          if (!max) return false;
          const pct = (val / max) * 100;
          return Number.isFinite(pct) && pct < THRESHOLD_PERCENT;
        })
        .map((coNum) => `CO${coNum}`);

      let totalValue = 0;
      let totalMax = 0;
      coNumbers.forEach((coNum) => {
        const cell = studentTotals?.[`co${coNum}`];
        if (!cell) return;
        const max = Number(cell?.max || 0);
        const val = Number(cell?.value || 0);
        if (!max) return;
        totalValue += Number.isFinite(val) ? val : 0;
        totalMax += Number.isFinite(max) ? max : 0;
      });
      const totalPct = totalMax ? (totalValue / totalMax) * 100 : null;

      return {
        regNo: s.reg_no,
        name: s.name,
        section: s.section ?? null,
        flaggedCos,
        total: totalPct,
      };
    });
  }, [students, coTotals, coNumbers]);

  // ── Export modal state ─────────────────────────────────────
  type ExportReportType = 'all' | 'flagged';
  const [exportStep, setExportStep] = useState<'closed' | 'type' | 'format'>('closed');
  const [exportReportType, setExportReportType] = useState<ExportReportType>('all');

  const exportRowsFiltered = useMemo(
    () =>
      exportReportType === 'flagged'
        ? exportRowsAll.filter((r) => r.flaggedCos.length > 0)
        : exportRowsAll,
    [exportRowsAll, exportReportType],
  );

  const openExportModal = () => setExportStep('type');
  const closeExportModal = () => setExportStep('closed');

  const handleExportPdf = () => {
    const subjectCode = String(taMeta?.subjectCode || '').trim() || (subjectId != null ? `SUBJECT_${subjectId}` : '—');
    const subjectName = String(taMeta?.subjectName || '').trim() || null;
    const title = `CQI Report — ${subjectCode}`;

    const me = getCachedMe() as any;
    const instructorName =
      String(`${me?.first_name || ''} ${me?.last_name || ''}`.replace(/\s+/g, ' ').trim()) ||
      String(me?.username || '').trim() ||
      String(me?.profile?.staff_id || '').trim() ||
      null;

    exportCqiPdf({
      subjectCode,
      subjectName,
      coNumbers,
      rows: exportRowsFiltered,
      title,
      filename: `CQI_${subjectCode}${teachingAssignmentId ? `_TA${teachingAssignmentId}` : ''}.pdf`,
      instructorName,
    });
    closeExportModal();
  };

  const handleExportExcel = () => {
    const subjectCode = String(taMeta?.subjectCode || '').trim() || (subjectId != null ? `SUBJECT_${subjectId}` : '—');
    const rows = exportRowsFiltered;
    const header = ['S.No', 'Reg No.', 'Student Name', 'Section', 'Flagged COs', 'Total (%)'];
    const data = rows.map((r, i) => [
      i + 1,
      r.regNo || '',
      r.name || '',
      r.section || '',
      r.flaggedCos.length > 0 ? r.flaggedCos.join(', ') : '—',
      r.total != null ? Math.round((r.total as number) * 10) / 10 : '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    // Column widths
    ws['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 32 }, { wch: 8 }, { wch: 22 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    const sheetLabel = exportReportType === 'flagged' ? 'CQI Students' : 'All Students';
    XLSX.utils.book_append_sheet(wb, ws, sheetLabel);
    XLSX.writeFile(wb, `CQI_${subjectCode}${teachingAssignmentId ? `_TA${teachingAssignmentId}` : ''}.xlsx`);
    closeExportModal();
  };



  // Calculate CO totals from internal marks
  useEffect(() => {
    if (!subjectId || !teachingAssignmentId || students.length === 0 || coNumbers.length === 0) return;

    let mounted = true;
    (async () => {
      try {
        setLoading(true);

        const ct = normalizeObeClassType(classType);
        const isPrbl = String(classType || '').trim().toUpperCase() === 'PRBL';
        const enabledSet = normalizeEnabledAssessments(enabledAssessments);
        const isSpecial = ct === 'SPECIAL' && enabledSet.size;
        const allow = (k: string) => (!isSpecial ? true : enabledSet.has(String(k).toLowerCase()));
        const isTcpr = ct === 'TCPR';
        const isProject = ct === 'PROJECT';
        const isTcpl = ct === 'TCPL';
        const isLabLike = ct === 'LAB' || ct === 'PRACTICAL';

        // IQAC QP patterns: used to derive CIA CO mapping + max per CO.
        // This prevents stale sheet/master config CO maps (e.g., CIA max 46) when IQAC updates to CO1=30.
        const qpForApi = classTypeKey === 'THEORY' ? (qpTypeKey ? qpTypeKey : null) : null;
        const loadIqacPattern = async (examForApi: 'CIA1' | 'CIA2') => {
          if (!classTypeKey) return null as any;
          let res: any = null;
          let marks: any[] = [];
          try {
            res = await fetchIqacQpPattern({ class_type: classTypeKey, question_paper_type: qpForApi, exam: examForApi as any });
            marks = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
          } catch {
            // ignore
          }
          if (!marks.length) {
            try {
              res = await fetchIqacQpPattern({ class_type: classTypeKey, question_paper_type: qpForApi, exam: 'CIA' as any });
              marks = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
            } catch {
              // ignore
            }
          }
          // Return pattern if it has marks OR cos (IQAC may define COs without marks)
          const hasCos = Array.isArray(res?.pattern?.cos) && res.pattern.cos.length > 0;
          if (!marks.length && !hasCos) return null;
          return res?.pattern || null;
        };

        const loadIqacModelPattern = async () => {
          if (!classTypeKey) return null as any;
          try {
            const res: any = await fetchIqacQpPattern({
              class_type: classTypeKey,
              question_paper_type: qpForApi,
              exam: 'MODEL',
            });
            const marks = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
            if (!marks.length) return null;
            return res?.pattern || null;
          } catch {
            return null;
          }
        };

        // Read MODEL (ME-COx) marks from the saved model sheet in localStorage.
        // SPECIAL courses can also include MODEL if it's in their enabled_assessments.
        const canUseLocalModel = !isLabLike && !isProject;
        const needsMe = canUseLocalModel && coNumbers.some((co) => co >= 1 && co <= 5);
        const modelSheet: any = (() => {
          if (!needsMe) return null;
          const taKey = String(teachingAssignmentId ?? 'none');

          const candidates: string[] = [];
          if (ct === 'THEORY') {
            candidates.push(`model_theory_sheet_${subjectId}_${taKey}`);
            candidates.push(`model_theory_sheet_${subjectId}_none`);
          } else if (ct === 'TCPL') {
            candidates.push(`model_tcpl_sheet_${subjectId}_${taKey}`);
            candidates.push(`model_tcpl_sheet_${subjectId}_none`);
          } else if (ct === 'TCPR') {
            candidates.push(`model_tcpr_sheet_${subjectId}_${taKey}`);
            candidates.push(`model_tcpr_sheet_${subjectId}_none`);
          } else if (ct === 'SPECIAL') {
            // SPECIAL model may be saved under theory or generic key
            candidates.push(`model_theory_sheet_${subjectId}_${taKey}`);
            candidates.push(`model_theory_sheet_${subjectId}_none`);
          }
          candidates.push(`model_sheet_${subjectId}`);

          for (const k of candidates) {
            const v = lsGet<any>(k);
            if (v && typeof v === 'object') return v;
          }
          return null;
        })();
        
        // QP1 FINAL YEAR detection: theory + QP1FINAL type.
        const isQp1FinalCqi = ct === 'THEORY' && /QP1\s*FINAL/i.test(qpTypeKey);

        // Fetch published marks based on class type and enabled assessments.
        const needs12 = coNumbers.some((co) => co === 1 || co === 2);
        // For QP1FINAL, CO2 needs cycle 2 data (SSA2/CIA2/FA2), so treat it like needs34.
        const needs34 = coNumbers.some((co) => co === 3 || co === 4) || (isQp1FinalCqi && coNumbers.includes(2));
        const needs5 = coNumbers.some((co) => co === 5);

        // For SPECIAL, CO mapping crosses cycle boundaries (SSA→CO3, CIA1/CIA2/MODEL→CO1/CO2)
        // so we always need all patterns and data regardless of which COs are shown.
        const sNeedsAll = !!isSpecial;

        const [iqacCia1Pattern, iqacCia2Pattern, iqacModelPattern] = await Promise.all([
          (needs12 || sNeedsAll) && allow('cia1') && !isLabLike ? loadIqacPattern('CIA1') : Promise.resolve(null),
          (needs34 || sNeedsAll) && allow('cia2') && !isLabLike ? loadIqacPattern('CIA2') : Promise.resolve(null),
          (needsMe || sNeedsAll) ? loadIqacModelPattern() : Promise.resolve(null),
        ]);

        // SPECIAL: also load SSA1/SSA2 QP patterns for CO mapping
        const [iqacSsa1Pattern, iqacSsa2Pattern] = sNeedsAll ? await Promise.all([
          (async () => { try {
            const res = await fetchIqacQpPattern({ class_type: classTypeKey, question_paper_type: null, exam: 'SSA1' as any });
            const marks = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
            const hasCos = Array.isArray(res?.pattern?.cos) && res.pattern.cos.length > 0;
            if (!marks.length && !hasCos) return null;
            return res?.pattern || null;
          } catch { return null; } })(),
          (async () => { try {
            const res = await fetchIqacQpPattern({ class_type: classTypeKey, question_paper_type: null, exam: 'SSA2' as any });
            const marks = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
            const hasCos = Array.isArray(res?.pattern?.cos) && res.pattern.cos.length > 0;
            if (!marks.length && !hasCos) return null;
            return res?.pattern || null;
          } catch { return null; } })(),
        ]) : [null, null];

        const modelIsTcplLike = isTcpl || isTcpr;
        const modelPatternMarks = Array.isArray((iqacModelPattern as any)?.marks) ? (iqacModelPattern as any).marks : null;

        const modelQuestions = (() => {
          if (Array.isArray(modelPatternMarks) && modelPatternMarks.length) {
            return modelPatternMarks.map((mx: any, idx: number) => ({ key: `q${idx + 1}`, max: Number(mx) || 0 }));
          }
          if (modelIsTcplLike) {
            const count = isTcpr ? 12 : 15;
            const twoMarkCount = isTcpr ? 8 : 10;
            return Array.from({ length: count }, (_, i) => {
              const idx = i + 1;
              return { key: `q${idx}`, max: idx <= twoMarkCount ? 2 : 16 };
            });
          }
          return MODEL_THEORY_QUESTIONS;
        })();

        const modelCosRow = (() => {
          const cos = Array.isArray((iqacModelPattern as any)?.cos) ? (iqacModelPattern as any).cos : null;
          if (Array.isArray(cos) && cos.length === modelQuestions.length) {
            return cos.map((v: any) => parseCoNumber(v));
          }
          if (isTcpr) {
            const base = [1, 1, 2, 2, 3, 3, 4, 4, 1, 2, 3, 4];
            if (modelQuestions.length === base.length) return base;
            return Array.from({ length: modelQuestions.length }, (_, i) => base[i % base.length]);
          }
          if (isTcpl) {
            const base = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5];
            if (modelQuestions.length === base.length) return base;
            return Array.from({ length: modelQuestions.length }, (_, i) => base[i % base.length]);
          }
          if (modelQuestions.length === MODEL_THEORY_CO_ROW.length) return [...MODEL_THEORY_CO_ROW];
          return Array.from({ length: modelQuestions.length }, (_, i) => MODEL_THEORY_CO_ROW[i % MODEL_THEORY_CO_ROW.length]);
        })();

        const modelQuestionMaxByCo = (() => {
          const out = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };
          for (let i = 0; i < modelQuestions.length; i++) {
            const def = modelQuestions[i];
            const co = modelCosRow[i] ?? 1;
            if (co === 1) out.co1 += def.max;
            else if (co === 2) out.co2 += def.max;
            else if (co === 3) out.co3 += def.max;
            else if (co === 4) out.co4 += def.max;
            else if (co === 5) out.co5 += def.max;
          }
          return out;
        })();

        const modelMaxes = (() => {
          const base = { ...modelQuestionMaxByCo };
          if (isTcpr) {
            return { ...base, co5: base.co5 + 30 };
          }
          if (isTcpl) {
            const share = 30 / 5;
            return {
              co1: base.co1 + share,
              co2: base.co2 + share,
              co3: base.co3 + share,
              co4: base.co4 + share,
              co5: base.co5 + share,
            };
          }
          return base;
        })();

        const getModelScaledByCo = (student: { id: number; reg_no: string }) => {
          if (!modelSheet) return null;
          const rowKeyById = `id:${String(student.id)}`;
          const rowKeyByReg = student.reg_no ? `reg:${String(student.reg_no).trim()}` : '';
          const row = modelSheet[rowKeyById] || (rowKeyByReg ? modelSheet[rowKeyByReg] : null) || null;
          if (!row || typeof row !== 'object') return null;

          const absent = Boolean((row as any).absent);
          const absentKind = String((row as any).absentKind || 'AL').toUpperCase();
          if (absent && absentKind === 'AL') return null;

          const qObj = (row as any).q && typeof (row as any).q === 'object' ? (row as any).q : row;
          const labRaw = toNumOrNull((row as any).lab);
          let hasAny = false;
          const sums = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };

          for (let i = 0; i < modelQuestions.length; i++) {
            const def = modelQuestions[i];
            const raw = toNumOrNull((qObj as any)[def.key]);
            if (raw == null) continue;
            hasAny = true;
            const mark = clamp(raw, 0, Number(def.max) || 0);
            const co = modelCosRow[i] ?? 1;
            if (co === 1) sums.co1 += mark;
            else if (co === 2) sums.co2 += mark;
            else if (co === 3) sums.co3 += mark;
            else if (co === 4) sums.co4 += mark;
            else if (co === 5) sums.co5 += mark;
          }

          if (modelIsTcplLike && labRaw != null) {
            hasAny = true;
            const lab = clamp(labRaw, 0, 30);
            if (isTcpr) {
              sums.co5 += lab;
            } else {
              const share = lab / 5;
              sums.co1 += share;
              sums.co2 += share;
              sums.co3 += share;
              sums.co4 += share;
              sums.co5 += share;
            }
          }

          if (!hasAny) return null;

          const scale = (raw: number, rawMax: number, outOf: number) => {
            if (!rawMax || !Number.isFinite(rawMax) || rawMax <= 0) return 0;
            return clamp((clamp(raw, 0, rawMax) / rawMax) * outOf, 0, outOf);
          };

          return {
            co1: sums.co1,
            co2: sums.co2,
            co3: sums.co3,
            co4: sums.co4,
            co5: sums.co5,
          };
        };

        const coOverrideByKey = (pattern: any | null): Record<string, any> => {
          const marks = Array.isArray(pattern?.marks) ? pattern.marks : [];
          const cosArr = Array.isArray(pattern?.cos) ? pattern.cos : [];
          const n = Math.min(marks.length, cosArr.length);
          if (!n) return {};
          const out: Record<string, any> = {};
          for (let i = 0; i < n; i++) {
            out[`q${i + 1}`] = cosArr[i];
          }
          return out;
        };

        const cia1CoByKey = coOverrideByKey(iqacCia1Pattern);
        const cia2CoByKey = coOverrideByKey(iqacCia2Pattern);

        // Also build mark (max) overrides from IQAC patterns so snapshot stale maxes are corrected.
        const markOverrideByKey = (pattern: any | null): Record<string, number> => {
          const marks = Array.isArray(pattern?.marks) ? pattern.marks : [];
          if (!marks.length) return {};
          const out: Record<string, number> = {};
          for (let i = 0; i < marks.length; i++) {
            const v = Number(marks[i]);
            if (v > 0) out[`q${i + 1}`] = v;
          }
          return out;
        };
        const cia1MaxByKey = markOverrideByKey(iqacCia1Pattern);
        const cia2MaxByKey = markOverrideByKey(iqacCia2Pattern);

        const needProjectReview1 = isProject && (String(assessmentType || '').toLowerCase() === 'review1' || String(assessmentType || '').toLowerCase() === 'model');
        const needProjectReview2 = isProject && (String(assessmentType || '').toLowerCase() === 'review2' || String(assessmentType || '').toLowerCase() === 'model');
        const needProjectModel = isProject && String(assessmentType || '').toLowerCase() === 'model';

        const [ssa1Res, ssa2Res, f1Res, f2Res, cia1Res, cia2Res, review1Res, review2Res, labF1Res, labF2Res, labCia1Res, labCia2Res, labModelRes, prblModelRes] =
          await Promise.all([
            (needs12 || sNeedsAll) && allow('ssa1') && !isLabLike ? (async () => { try { const p = await fetchPublishedSsa1(subjectId, teachingAssignmentId).catch(() => ({marks:{}})); try { const d = await fetchDraft<any>('ssa1', subjectId, teachingAssignmentId); if (d?.draft) return { ...p, draft: (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft }; } catch{} return p; } catch { return {marks:{}} } })() : { marks: {} },
            (needs34 || needProjectModel || sNeedsAll) && allow('ssa2') && !isLabLike ? (async () => { try { const p = await fetchPublishedSsa2(subjectId, teachingAssignmentId).catch(() => ({marks:{}})); try { const d = await fetchDraft<any>('ssa2', subjectId, teachingAssignmentId); if (d?.draft) return { ...p, draft: (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft }; } catch{} return p; } catch { return {marks:{}} } })() : { marks: {} },

            // THEORY/SPECIAL only: formative (skill+att)
            needs12 && allow('formative1') && !isLabLike && !isTcpr && !isTcpl && !isProject ? fetchPublishedFormative1(subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },
            needs34 && allow('formative2') && !isLabLike && !isTcpr && !isTcpl && !isProject ? fetchPublishedFormative('formative2', subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },

            (needs12 || sNeedsAll) && allow('cia1') && !isLabLike ? fetchPublishedCia1Sheet(subjectId, teachingAssignmentId).catch(() => ({ data: null })) : { data: null },
            (needs34 || sNeedsAll) && allow('cia2') && !isLabLike ? fetchPublishedCiaSheet('cia2', subjectId, teachingAssignmentId).catch(() => ({ data: null })) : { data: null },

            // TCPR / PROJECT: review replaces formative
            (allow('review1') && ((isTcpr && needs12) || needProjectReview1)) ? (async () => { try { const p = await fetchPublishedReview1(subjectId, teachingAssignmentId).catch(() => ({marks:{}})); try { const d = await fetchDraft<any>('review1', subjectId, teachingAssignmentId); if (d?.draft) return { ...p, draft: (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft }; } catch{} return p; } catch { return {marks:{}} } })() : { marks: {} },
            (allow('review2') && ((isTcpr && needs34) || needProjectReview2)) ? (async () => { try { const p = await fetchPublishedReview2(subjectId, teachingAssignmentId).catch(() => ({marks:{}})); try { const d = await fetchDraft<any>('review2', subjectId, teachingAssignmentId); if (d?.draft) return { ...p, draft: (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft }; } catch{} return p; } catch { return {marks:{}} } })() : { marks: {} },

            // TCPL: LAB1/LAB2 stored under formative1/formative2 (lab-style)
            needs12 && allow('formative1') && isTcpl
              ? (async () => {
                  try {
                    const d = await fetchDraft<any>('formative1' as any, subjectId, teachingAssignmentId);
                    if (d?.draft) return { data: (d.draft as any).data ?? d.draft };
                  } catch {}
                  return fetchPublishedLabSheet('formative1', subjectId, teachingAssignmentId).catch(() => ({ data: null }));
                })()
              : { data: null },
            needs34 && allow('formative2') && isTcpl
              ? (async () => {
                  try {
                    const d = await fetchDraft<any>('formative2' as any, subjectId, teachingAssignmentId);
                    if (d?.draft) return { data: (d.draft as any).data ?? d.draft };
                  } catch {}
                  return fetchPublishedLabSheet('formative2', subjectId, teachingAssignmentId).catch(() => ({ data: null }));
                })()
              : { data: null },

            // LAB/PRACTICAL: lab-style CIA1/CIA2/MODEL
            needs12 && allow('cia1') && isLabLike
              ? (async () => {
                  try {
                    const d = await fetchDraft<any>('cia1' as any, subjectId, teachingAssignmentId);
                    if (d?.draft) return { data: (d.draft as any).data ?? d.draft };
                  } catch {}
                  return fetchPublishedLabSheet('cia1', subjectId, teachingAssignmentId).catch(() => ({ data: null }));
                })()
              : { data: null },
            needs34 && allow('cia2') && isLabLike
              ? (async () => {
                  try {
                    const d = await fetchDraft<any>('cia2' as any, subjectId, teachingAssignmentId);
                    if (d?.draft) return { data: (d.draft as any).data ?? d.draft };
                  } catch {}
                  return fetchPublishedLabSheet('cia2', subjectId, teachingAssignmentId).catch(() => ({ data: null }));
                })()
              : { data: null },
            needs5 && allow('model') && isLabLike
              ? (async () => {
                  try {
                    const d = await fetchDraft<any>('model' as any, subjectId, teachingAssignmentId);
                    if (d?.draft) return { data: (d.draft as any).data ?? d.draft };
                  } catch {}
                  return fetchPublishedModelSheet(subjectId, teachingAssignmentId).catch(() => ({ data: null }));
                })()
              : { data: null },
            // PRBL: load model assessment data (published via LabEntry/lab-publish-sheet)
            needProjectModel
              ? (async () => {
                  try {
                    const p = await fetchPublishedLabSheet('model', subjectId, teachingAssignmentId).catch(() => ({ data: null }));
                    const pubSheet = (p as any)?.data?.sheet ?? (p as any)?.data ?? null;
                    try {
                      const d = await fetchDraft<any>('model' as any, subjectId, teachingAssignmentId);
                      if (d?.draft) {
                        const draftSheet = (d.draft as any)?.data ?? (d.draft as any)?.sheet ?? d.draft;
                        return { marks: {}, draft: { sheet: draftSheet?.sheet ?? draftSheet } };
                      }
                    } catch {}
                    // No draft — wrap published sheet so readReviewMarkByCo can find it
                    if (pubSheet && typeof pubSheet === 'object') {
                      return { marks: {}, draft: { sheet: pubSheet } };
                    }
                    return { marks: {} };
                  } catch { return { marks: {} }; }
                })()
              : { marks: {} },
          ]);

        if (!mounted) return;

        const remoteClassTypeWeights = await fetchClassTypeWeights().catch(() => null);
        const classTypeWeights = remoteClassTypeWeights && typeof remoteClassTypeWeights === 'object'
          ? remoteClassTypeWeights
          : (lsGet<any>('iqac_class_type_weights') || null);
        const currentClassTypeWeights = classTypeWeights && typeof classTypeWeights === 'object'
          ? (classTypeWeights as any)[ct] || null
          : null;
        const weightsForCo = (coNum: number) => {
          const slots = getInternalMarkWeightSlotsForCo(ct, currentClassTypeWeights, coNum);
          return {
            ssa: slots.ssa,
            cia: slots.cia,
            fa: slots.fa,
            ciaExam: slots.ciaExam,
            me: slots.me,
          };
        };

        // Get max values from master config
        const ssa1Cfg = masterCfg?.assessments?.ssa1 || {};
        const ssa2Cfg = masterCfg?.assessments?.ssa2 || {};
        const f1Cfg = masterCfg?.assessments?.formative1 || {};
        const f2Cfg = masterCfg?.assessments?.formative2 || {};
        const cia1Cfg = masterCfg?.assessments?.cia1 || {};
        const cia2Cfg = masterCfg?.assessments?.cia2 || {};
        const review1Cfg = masterCfg?.assessments?.review1 || {};
        const review2Cfg = masterCfg?.assessments?.review2 || {};

        const maxes = {
          ssa1: { co1: Number(ssa1Cfg?.coMax?.co1) || 10, co2: Number(ssa1Cfg?.coMax?.co2) || 10 },
          ssa2: { co3: Number(ssa2Cfg?.coMax?.co3 ?? ssa2Cfg?.coMax?.co1) || 10, co4:Number(ssa2Cfg?.coMax?.co4 ?? ssa2Cfg?.coMax?.co2) || 10 },
          cia1: { co1: Number(cia1Cfg?.coMax?.co1) || 30, co2: Number(cia1Cfg?.coMax?.co2) || 30 },
          cia2: { co3: Number(cia2Cfg?.coMax?.co3 ?? cia2Cfg?.coMax?.co1) || 30, co4: Number(cia2Cfg?.coMax?.co4 ?? cia2Cfg?.coMax?.co2) || 30 },
          f1: { co1: Number(f1Cfg?.maxCo) || 10, co2: Number(f1Cfg?.maxCo) || 10 },
          f2: { co3: Number(f2Cfg?.maxCo) || 10, co4: Number(f2Cfg?.maxCo) || 10 },
          review1: isProject ? { co1: 50, co2: 0 } : { co1: Number(review1Cfg?.coMax?.co1) || 15, co2: Number(review1Cfg?.coMax?.co2) || 15 },
          review2: isProject ? { co3: 50, co4: 0 } : { co3: Number(review2Cfg?.coMax?.co3 ?? review2Cfg?.coMax?.co1) || 15, co4: Number(review2Cfg?.coMax?.co4 ?? review2Cfg?.coMax?.co2) || 15 },
        };

        const readReviewMarkByCo = (reviewRes: any, studentId: number, coKey: 'co1' | 'co2' | 'co3' | 'co4'): number | null => {
          if (isProject) {
            const draftSheet = reviewRes?.draft?.sheet && typeof reviewRes.draft.sheet === 'object'
              ? reviewRes.draft.sheet
              : reviewRes?.draft && typeof reviewRes.draft === 'object' && reviewRes.draft?.rowsByStudentId
                ? reviewRes.draft
                : null;
            const draftRow = draftSheet?.rowsByStudentId?.[String(studentId)];
            if (draftRow && typeof draftRow === 'object') {
              const ciaExamTotal = toNumOrNull((draftRow as any)?.ciaExam);
              if (ciaExamTotal != null) return clamp(ciaExamTotal, 0, 50);
              const componentMarks = (draftRow as any)?.reviewComponentMarks && typeof (draftRow as any).reviewComponentMarks === 'object'
                ? Object.values((draftRow as any).reviewComponentMarks)
                : [];
              const sum = componentMarks.reduce<number>((acc, raw) => {
                const n = toNumOrNull(raw);
                return acc + (n == null ? 0 : n);
              }, 0);
              if (sum > 0) return clamp(sum, 0, 50);
            }
            const total = toNumOrNull(reviewRes?.marks?.[String(studentId)]);
            return total == null ? null : clamp(Number(total), 0, 50);
          }

          const draftRows: any[] = reviewRes?.draft?.rows || reviewRes?.draft?.sheet?.rows || [];
          const draftRow = draftRows.find((r) => String(r?.studentId) === String(studentId));
          if (draftRow) {
            const rawReviewCoMarks = (draftRow as any)?.reviewCoMarks?.[coKey];
            if (Array.isArray(rawReviewCoMarks)) {
              const total = rawReviewCoMarks.reduce<number>((sum, val) => {
                const n = toNumOrNull(val);
                return sum + (n == null ? 0 : n);
              }, 0);
              return total;
            }

            const directVal = toNumOrNull((draftRow as any)?.[coKey]);
            if (directVal != null) return directVal;
          }

          const total = toNumOrNull(reviewRes?.marks?.[String(studentId)]);
          return total == null ? null : Number(total) / 2;
        };

        const readLabAssessmentByCo = (
          snapshot: any | null,
          options?: { fallbackCiaEnabled?: boolean; profile?: 'strict-lab' | 'tcpl' | 'simple' },
        ) => {
          const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object'
            ? snapshot.sheet
            : snapshot && typeof snapshot === 'object'
              ? snapshot
              : {};
          const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object' ? sheet.rowsByStudentId : {};
          const snapshotCoConfigs = (() => {
            const rawSnapshot = sheet?.markManagerSnapshot;
            if (!rawSnapshot) return null;
            try {
              const parsed = JSON.parse(String(rawSnapshot));
              const enabled = Array.isArray(parsed?.enabled) ? parsed.enabled : [];
              const out: Record<string, { enabled: boolean; expCount: number; expMax: number }> = {};
              enabled.forEach((item: any) => {
                const coNumber = clampInt(Number(item?.co), 1, 5);
                out[String(coNumber)] = {
                  enabled: true,
                  expCount: clampInt(Number(item?.expCount ?? 0), 0, 12),
                  expMax: Number.isFinite(Number(item?.expMax)) ? Number(item.expMax) : 25,
                };
              });
              return out;
            } catch {
              return null;
            }
          })();
          const rawCoConfigs = sheet?.coConfigs && typeof sheet.coConfigs === 'object' ? sheet.coConfigs : {};
          const effectiveCoConfigs = snapshotCoConfigs && Object.keys(snapshotCoConfigs).length ? snapshotCoConfigs : rawCoConfigs;
          const legacyCoA = Number.isFinite(Number(sheet?.coANum)) ? clampInt(Number(sheet.coANum), 1, 5) : 1;
          const legacyCoB = Number.isFinite(Number(sheet?.coBNum)) ? clampInt(Number(sheet.coBNum), 1, 5) : null;
          const defaultCiaMax = Number.isFinite(Number(sheet?.ciaExamMax)) ? Number(sheet.ciaExamMax) : 30;
          const ciaEnabled = typeof sheet?.ciaExamEnabled === 'boolean'
            ? Boolean(sheet.ciaExamEnabled)
            : Boolean(options?.fallbackCiaEnabled);

          const enabledCoNumbers = (() => {
            const fromConfigs = Object.entries(effectiveCoConfigs)
              .filter(([, cfg]) => Boolean((cfg as any)?.enabled))
              .map(([co]) => Number(co))
              .filter((co) => Number.isFinite(co));
            if (fromConfigs.length) return fromConfigs;
            const legacy: number[] = [];
            if ((sheet?.coAEnabled ?? true) && Number.isFinite(legacyCoA)) legacy.push(legacyCoA);
            if ((sheet?.coBEnabled ?? false) && legacyCoB != null) legacy.push(legacyCoB);
            return legacy;
          })();

          const coShareCount = Math.max(1, enabledCoNumbers.length || (legacyCoB != null ? 2 : 1));

          const getCoConfig = (coNumber: number) => {
            const rawCfg = (effectiveCoConfigs as any)?.[String(coNumber)];
            if (rawCfg && typeof rawCfg === 'object') {
              return {
                expCount: clampInt(Number((rawCfg as any).expCount ?? 0), 0, 12),
                expMax: Number.isFinite(Number((rawCfg as any).expMax)) ? Number((rawCfg as any).expMax) : 25,
              };
            }
            if (coNumber === legacyCoA) {
              return {
                expCount: clampInt(Number(sheet?.expCountA ?? 0), 0, 12),
                expMax: Number.isFinite(Number(sheet?.expMaxA)) ? Number(sheet.expMaxA) : 25,
              };
            }
            if (legacyCoB != null && coNumber === legacyCoB) {
              return {
                expCount: clampInt(Number(sheet?.expCountB ?? 0), 0, 12),
                expMax: Number.isFinite(Number(sheet?.expMaxB)) ? Number(sheet.expMaxB) : 25,
              };
            }
            return { expCount: 0, expMax: 25 };
          };

          const get = (sid: number, coNumber: number): { value: number; max: number } | null => {
            const row = rowsByStudentId[String(sid)] || {};
            const cfg = getCoConfig(coNumber);
            const marksByCo = row?.marksByCo && typeof row.marksByCo === 'object' ? row.marksByCo : {};
            const fallbackMarks = coNumber === legacyCoA ? row?.marksA : coNumber === legacyCoB ? row?.marksB : undefined;
            const rawMarks = (marksByCo as any)?.[String(coNumber)] ?? fallbackMarks;
            const sourceLength = Array.isArray(rawMarks) ? rawMarks.length : 0;
            const expCount = clampInt(sourceLength > 0 ? sourceLength : cfg.expCount, 0, 12);
            const marks = normalizeMarksArray(rawMarks, expCount);
            const markTotal = sumMarks(marks);
            const avgMark = avgMarks(marks);
            const hasExperimentMarks = marks.some((value) => typeof value === 'number' && Number.isFinite(value));
            const expTotalMax = expCount * Math.max(0, cfg.expMax);

            const ciaByCo = row?.ciaExamByCo && typeof row.ciaExamByCo === 'object' ? row.ciaExamByCo : {};
            const perCoCia = toNumOrNull((ciaByCo as any)?.[String(coNumber)]);
            const sharedCia = ciaEnabled ? toNumOrNull(row?.ciaExam) : null;
            const ciaPortion = perCoCia != null ? perCoCia : sharedCia != null ? sharedCia / coShareCount : null;
            const profile = options?.profile ?? 'simple';

            if (profile === 'tcpl') {
              const expWeight = Number(TCPL_REVIEW_EXPERIMENT_WEIGHT[coNumber] || 0);
              const caaWeight = Number(TCPL_REVIEW_CAA_WEIGHT[coNumber] || 0);
              const caaRawMax = Number(TCPL_REVIEW_CAA_RAW_MAX[coNumber] || 0);
              const coMax = Number(TCPL_REVIEW_CO_MAX[coNumber] || 0);
              const caaByCo = row?.caaExamByCo && typeof row.caaExamByCo === 'object' ? row.caaExamByCo : {};
              const rawCaa = toNumOrNull((caaByCo as any)?.[String(coNumber)]);
              const caaValue = rawCaa ?? 0;
              const value = normalizedContribution(markTotal, expTotalMax, expWeight) + normalizedContribution(caaValue, caaRawMax, caaWeight);
              const hasAny = hasExperimentMarks || rawCaa != null;
              if (!hasAny || coMax <= 0) return null;
              return {
                value: clamp(value, 0, coMax),
                max: coMax,
              };
            }

            if (profile === 'strict-lab') {
              const ciaMaxPerCo = ciaEnabled ? defaultCiaMax / coShareCount : 0;
              const expWeight = Number(LAB_EXPERIMENT_WEIGHT_BY_CO[coNumber] || 0);
              const expContribution = normalizedContribution(markTotal, expTotalMax, expWeight);
              const ciaContribution = ciaEnabled ? normalizedContribution(ciaPortion ?? 0, ciaMaxPerCo, ciaMaxPerCo) : 0;
              const coMax = expWeight + ciaMaxPerCo;
              const hasAny = hasExperimentMarks || (ciaPortion != null && Number.isFinite(ciaPortion));
              if (!hasAny || coMax <= 0) return null;
              return {
                value: clamp(expContribution + ciaContribution, 0, coMax),
                max: coMax,
              };
            }

            if (isTcpl) {
              const tcplWeights = weightsForCo(coNumber);
              const labWeight = Math.max(0, Number(tcplWeights.fa || 0));
              const ciaExamWeight = Math.max(0, Number(tcplWeights.ciaExam || 0));
              const ciaMaxPerCo = ciaEnabled ? defaultCiaMax / coShareCount : 0;
              const expContribution = avgMark != null ? normalizedContribution(avgMark, Math.max(0, cfg.expMax), labWeight) : 0;
              const ciaContribution = ciaEnabled ? normalizedContribution(ciaPortion ?? 0, ciaMaxPerCo, ciaExamWeight) : 0;
              const coMax = labWeight + ciaExamWeight;
              const hasAny = hasExperimentMarks || ciaPortion != null;
              if (!hasAny || coMax <= 0) return null;

              return {
                value: clamp(expContribution + ciaContribution, 0, coMax),
                max: coMax,
              };
            }

            const ciaMax = ciaEnabled ? defaultCiaMax / coShareCount : 0;
            const coMax = Math.max(0, cfg.expMax) + ciaMax;
            const hasAny = hasExperimentMarks || ciaPortion != null;
            if (!hasAny) return null;

            return {
              value: clamp((avgMark ?? 0) + (ciaPortion ?? 0), 0, coMax),
              max: coMax,
            };
          };

          return { get };
        };

        const tcplLab1 = isTcpl ? readLabAssessmentByCo((labF1Res as any)?.data ?? null, { fallbackCiaEnabled: true, profile: 'simple' }) : null;
        const tcplLab2 = isTcpl ? readLabAssessmentByCo((labF2Res as any)?.data ?? null, { fallbackCiaEnabled: true, profile: 'simple' }) : null;

        const labCia1 = isLabLike ? readLabAssessmentByCo((labCia1Res as any)?.data ?? null, { fallbackCiaEnabled: true, profile: 'strict-lab' }) : null;
        const labCia2 = isLabLike ? readLabAssessmentByCo((labCia2Res as any)?.data ?? null, { fallbackCiaEnabled: true, profile: 'strict-lab' }) : null;
        const labModel = isLabLike ? readLabAssessmentByCo((labModelRes as any)?.data ?? null, { fallbackCiaEnabled: true, profile: 'strict-lab' }) : null;

        const cia1Data = (cia1Res as any).data;
        const cia1QuestionsRaw = Array.isArray(cia1Data?.questions) ? cia1Data.questions : [];
        // When IQAC pattern is available, ALWAYS use it as the authoritative question structure
        // (it defines the correct number of questions, maxes, and COs regardless of published sheet).
        const cia1PatternMarks = Array.isArray(iqacCia1Pattern?.marks) ? iqacCia1Pattern.marks : [];
        const cia1QuestionsBase = cia1PatternMarks.length > 0
          ? cia1PatternMarks.map((mx: any, idx: number) => ({
              key: `q${idx + 1}`,
              max: Number(mx) || 0,
              co: Array.isArray(iqacCia1Pattern?.cos) && iqacCia1Pattern.cos[idx] != null
                ? iqacCia1Pattern.cos[idx]
                : (cia1QuestionsRaw[idx]?.co ?? 1),
            }))
          : cia1QuestionsRaw;
        const cia1Questions = Array.isArray(cia1QuestionsBase)
          ? cia1QuestionsBase.map((q: any) => {
              const k = String(q?.key || '').trim();
              const key = k.toLowerCase();
              const coOverride = key ? (cia1CoByKey[key] ?? cia1CoByKey[k] ?? null) : null;
              const maxOverride = key ? (cia1MaxByKey[key] ?? cia1MaxByKey[k] ?? undefined) : undefined;
              let result = q;
              if (coOverride != null) result = { ...result, co: coOverride };
              if (maxOverride != null && maxOverride > 0) result = { ...result, max: maxOverride };
              return result;
            })
          : [];
        const cia1HeaderMax = cia1Questions.reduce(
          (acc: { co1: number; co2: number }, q: any, idxQ: number) => {
            const qMax = Number(q?.max || 0);
            const w = effectiveCia1Weights(cia1Questions, idxQ);
            if (qMax > 0) {
              acc.co1 += qMax * w.co1;
              acc.co2 += qMax * w.co2;
            }
            return acc;
          },
          { co1: 0, co2: 0 },
        );

        const cia2Data = (cia2Res as any).data;
        const cia2QuestionsRaw = Array.isArray(cia2Data?.questions) ? cia2Data.questions : [];
        // When IQAC pattern is available, ALWAYS use it as the authoritative question structure.
        const cia2PatternMarks = Array.isArray(iqacCia2Pattern?.marks) ? iqacCia2Pattern.marks : [];
        const cia2QuestionsBase = cia2PatternMarks.length > 0
          ? cia2PatternMarks.map((mx: any, idx: number) => ({
              key: `q${idx + 1}`,
              max: Number(mx) || 0,
              co: Array.isArray(iqacCia2Pattern?.cos) && iqacCia2Pattern.cos[idx] != null
                ? iqacCia2Pattern.cos[idx]
                : (cia2QuestionsRaw[idx]?.co ?? 3),
            }))
          : cia2QuestionsRaw;
        const cia2Questions = Array.isArray(cia2QuestionsBase)
          ? cia2QuestionsBase.map((q: any) => {
              const k = String(q?.key || '').trim();
              const key = k.toLowerCase();
              const coOverride = key ? (cia2CoByKey[key] ?? cia2CoByKey[k] ?? null) : null;
              const maxOverride = key ? (cia2MaxByKey[key] ?? cia2MaxByKey[k] ?? undefined) : undefined;
              let result = q;
              if (coOverride != null) result = { ...result, co: coOverride };
              if (maxOverride != null && maxOverride > 0) result = { ...result, max: maxOverride };
              return result;
            })
          : [];
        const cia2HeaderMax = cia2Questions.reduce(
          (acc: { co3: number; co4: number }, q: any, idxQ: number) => {
            const qMax = Number(q?.max || 0);
            const w = effectiveCia2Weights(cia2Questions, idxQ);
            if (qMax > 0) {
              acc.co3 += qMax * w.co3;
              acc.co4 += qMax * w.co4;
            }
            return acc;
          },
          { co3: 0, co4: 0 },
        );

        const totals: Record<number, Record<string, { value: number; max: number } | null>> = {};

        students.forEach(student => {
          totals[student.id] = {};

          const modelScaled = needsMe ? getModelScaledByCo(student) : null;

          coNumbers.forEach(coNum => {
            let ssaMark: number | null = null;
            let ssaMax = 0;
            let ciaMark: number | null = null;
            let ciaMax = 0;
            let reviewMark: number | null = null;
            let reviewMax = 0;
            let faMark: number | null = null;
            let faMax = 0;
            let meMark: number | null = null;
            let meMax = 0;

            if (modelScaled) {
              const k = `co${coNum}` as keyof typeof modelScaled;
              if (k in modelScaled) {
                meMark = Number((modelScaled as any)[k]);
                meMax = (modelMaxes as any)[k] || 0;
              }
            }

            // ── SPECIAL courses: compute using QP patterns + exam weights ──
            if (isSpecial && ct === 'SPECIAL') {
              // Get SPECIAL exam weights from ClassTypeWeights
              const specialWeightsRaw = currentClassTypeWeights?.weights || currentClassTypeWeights || {};
              const examDefs = [
                { key: 'SSA1', pattern: iqacSsa1Pattern, weight: Number((specialWeightsRaw as any)?.SSA1 || 10) },
                { key: 'SSA2', pattern: iqacSsa2Pattern, weight: Number((specialWeightsRaw as any)?.SSA2 || 10) },
                { key: 'CIA1', pattern: iqacCia1Pattern, weight: Number((specialWeightsRaw as any)?.CIA1 || 5) },
                { key: 'CIA2', pattern: iqacCia2Pattern, weight: Number((specialWeightsRaw as any)?.CIA2 || 5) },
                { key: 'MODEL', pattern: iqacModelPattern, weight: Number((specialWeightsRaw as any)?.MODEL || 10) },
              ];

              // Compute per-CO weight for an exam: exam_weight / number_of_unique_COs_in_pattern
              const getExamPerCoWeight = (exam: typeof examDefs[0], co: number): number => {
                const cos = Array.isArray(exam.pattern?.cos) ? exam.pattern.cos.map(Number) : [];
                const uniqueCos = [...new Set(cos)];
                if (!uniqueCos.includes(co)) return 0;
                return exam.weight / uniqueCos.length;
              };

              // Get CO-specific raw mark and max for an exam from the OBE sheets.
              // For SSA: all questions map to one CO — full total is used (perCoWeight already
              //   returns 0 if this CO is not in the exam).
              // For CIA1/CIA2: filter questions by pattern cos[i] === coNum.
              // For MODEL: read per-CO value directly from modelScaled (already split by CO).
              const getExamCoData = (
                examKey: string,
                co: number,
                studentId: number,
                examPattern: any,
              ): { raw: number; max: number } | null => {
                const patCos = Array.isArray(examPattern?.cos) ? examPattern.cos.map(Number) : [];
                const patMarks = Array.isArray(examPattern?.marks) ? examPattern.marks.map(Number) : [];

                switch (examKey) {
                  case 'SSA1': {
                    const raw = toNumOrNull((ssa1Res as any)?.marks?.[String(studentId)]);
                    const max = patMarks.length > 0
                      ? patMarks.reduce((s: number, m: number) => s + m, 0)
                      : 10;
                    return raw != null ? { raw, max } : null;
                  }
                  case 'SSA2': {
                    const raw = toNumOrNull((ssa2Res as any)?.marks?.[String(studentId)]);
                    const max = patMarks.length > 0
                      ? patMarks.reduce((s: number, m: number) => s + m, 0)
                      : 10;
                    return raw != null ? { raw, max } : null;
                  }
                  case 'CIA1':
                  case 'CIA2': {
                    const ciaData_ = examKey === 'CIA1' ? cia1Data : cia2Data;
                    const ciaQs = examKey === 'CIA1' ? cia1Questions : cia2Questions;
                    if (!ciaData_) return null;
                    const row = (ciaData_.rowsByStudentId || {})[String(studentId)] || {};
                    if (Boolean((row as any)?.absent)) return null;
                    const q = (row as any)?.q && typeof (row as any).q === 'object'
                      ? (row as any).q : row;
                    let coRaw = 0; let coMax = 0; let hasAny = false; let hasThisCo = false;
                    ciaQs.forEach((qDef: any, idx: number) => {
                      // Use pattern cos if available, else fall back to question's own co field
                      const patCo = patCos[idx] != null ? patCos[idx] : Number(qDef.co ?? 0);
                      const qMax = patMarks[idx] != null ? patMarks[idx] : Number(qDef.max || 0);
                      if (patCo !== co) return;
                      hasThisCo = true;
                      coMax += qMax;
                      const v = toNumOrNull(q?.[qDef.key]);
                      if (v != null) { coRaw += clamp(v, 0, qMax); hasAny = true; }
                    });
                    if (!hasThisCo) return null;
                    return hasAny ? { raw: coRaw, max: coMax } : null;
                  }
                  case 'MODEL': {
                    // modelScaled already has per-CO values split from the model sheet
                    if (!modelScaled) return null;
                    const coKey = `co${co}` as const;
                    const raw = toNumOrNull((modelScaled as any)[coKey]);
                    const max = (modelMaxes as any)[coKey] ?? 0;
                    return raw != null && max > 0 ? { raw, max } : null;
                  }
                  default:
                    return null;
                }
              };

              const specialComponents: Array<{ key: string; mark: number; max: number; w: number }> = [];
              for (const exam of examDefs) {
                const perCoW = getExamPerCoWeight(exam, coNum);
                if (perCoW <= 0) continue;
                const coData = getExamCoData(exam.key, coNum, student.id, exam.pattern);
                if (!coData || coData.max <= 0) continue;
                specialComponents.push({
                  key: exam.key.toLowerCase(),
                  mark: round2(clamp(coData.raw, 0, coData.max)),
                  max: round2(coData.max),
                  w: perCoW,
                });
              }

              if (specialComponents.length > 0) {
                const sumW = specialComponents.reduce((s, it) => s + it.w, 0);
                const totalValue = specialComponents.reduce((s, it) => {
                  const frac = it.mark / it.max;
                  return s + (frac * it.w);
                }, 0);
                const breakdown = specialComponents.map(it => ({ ...it, contrib: round2((it.mark / it.max) * it.w) }));
                totals[student.id][`co${coNum}`] = {
                  value: round2(totalValue),
                  max: round2(sumW),
                  // @ts-ignore
                  breakdown,
                } as any;
              } else {
                totals[student.id][`co${coNum}`] = null;
              }
              return; // skip generic Theory path
            }

            // ── QP1 FINAL YEAR: direct computation with fixed weights ──
            if (isQp1FinalCqi && (coNum === 1 || coNum === 2 || coNum === 3)) {
              // Fixed weights for QP1FINAL:
              // CO1: SSA1→2, CIA1→4, FA1→3, Model→4 = 13
              // CO2: SSA1→1, CIA1→2, FA1→2 (cycle1) + SSA2→1, CIA2→2, FA2→2 (cycle2) + Model→4 = 14
              // CO3: SSA2→2, CIA2→4, FA2→3, Model→4 = 13

              // Helpers to read SSA/CIA/FA marks from published data.
              const readSsaCo = (ssaRes: any, studentId: number, coKey: string): number | null => {
                // Primary: use co_splits from published SSA response (server-side computed from draft)
                const coSplits = (ssaRes as any)?.co_splits;
                if (coSplits && typeof coSplits === 'object') {
                  const splitForStudent = (coSplits as any)[String(studentId)];
                  if (splitForStudent && typeof splitForStudent === 'object') {
                    const v = toNumOrNull((splitForStudent as any)[coKey]);
                    if (v != null) return v;
                  }
                }
                // Fallback: check draft rows
                const total = toNumOrNull((ssaRes as any)?.marks?.[String(studentId)]);
                const draftRows: any[] = (ssaRes as any)?.draft?.rows || (ssaRes as any)?.draft?.sheet?.rows || [];
                const dRow = draftRows.find((r: any) => String(r.studentId) === String(studentId));
                if (dRow) {
                  const v = toNumOrNull(dRow[coKey]);
                  if (v != null) return v;
                }
                // Last resort: half of total (only if no CO splits available)
                if (total != null) return Number(total) / 2;
                return null;
              };

              const readFaCo = (fRes: any, studentId: number, skillKey: string, attKey: string): number | null => {
                const row = ((fRes as any)?.marks || {})[String(studentId)] || {};
                const skill = toNumOrNull((row as any)[skillKey]);
                const att = toNumOrNull((row as any)[attKey]);
                if (skill != null && att != null) return skill + att;
                return null;
              };

              // QP1FINAL CIA reader: uses DIRECT CO number matching.
              // No parseCo34/co3/co4 slot mapping — QP1FINAL only has CO1, CO2, CO3.
              // For CIA2 with legacy labels (CO=1,2 instead of 2,3), auto-detects and offsets.
              const readCiaCo = (
                ciaData: any,
                questions: any[],
                studentId: number,
                targetCoNum: number, // 1, 2, or 3
                isCia2: boolean,
              ): { mark: number; max: number } | null => {
                if (!ciaData) return null;
                const rows = ciaData.rowsByStudentId || {};
                const row = rows[String(studentId)] || {};
                if ((row as any)?.absent) return null;
                const qObj = (row as any)?.q && typeof (row as any).q === 'object' ? (row as any).q : (row as any);

                // Detect legacy CIA2 labeling: all COs ≤ 2 means legacy (CO1=first, CO2=second)
                // QP1FINAL CIA2 actually covers CO2 & CO3, so legacy CO=1→real CO2, CO=2→real CO3
                let offset = 0;
                if (isCia2) {
                  const maxCoSeen = Math.max(0, ...questions.map((q: any) =>
                    Math.max(0, ...parseQuestionCoNumbers(q?.co)),
                  ));
                  if (maxCoSeen > 0 && maxCoSeen <= 2) offset = 1;
                }

                let acc = 0;
                let maxAcc = 0;
                let hasAny = false;

                questions.forEach((q: any) => {
                  const qMax = Number(q?.max || 0);
                  const coNums = parseQuestionCoNumbers(q?.co).map((n: number) => n + offset);
                  let weight = 0;
                  if (coNums.length === 1 && coNums[0] === targetCoNum) {
                    weight = 1;
                  } else if (coNums.length > 1 && coNums.includes(targetCoNum)) {
                    weight = 1 / coNums.length;
                  }
                  if (weight <= 0) return;
                  maxAcc += qMax * weight;
                  const raw = toNumOrNull(qObj?.[q.key]);
                  if (raw == null) return;
                  hasAny = true;
                  acc += clamp(raw, 0, qMax) * weight;
                });

                return hasAny ? { mark: acc, max: maxAcc } : null;
              };

              const components: Array<{ key: string; mark: number; max: number; w: number }> = [];

              if (coNum === 1) {
                // CO1: SSA1(co1)→2, CIA1(CO1)→4, FA1(co1)→3, Model(co1)→4
                const s = readSsaCo(ssa1Res, student.id, 'co1');
                if (s != null) components.push({ key: 'ssa', mark: round2((s / (maxes.ssa1.co1 || 1)) * 2), max: 2, w: 2 });
                const c = readCiaCo(cia1Data, cia1Questions, student.id, 1, false);
                if (c) components.push({ key: 'cia', mark: round2((c.mark / (c.max || 1)) * 4), max: 4, w: 4 });
                const f = readFaCo(f1Res, student.id, 'skill1', 'att1');
                if (f != null) components.push({ key: 'fa', mark: round2((f / (maxes.f1.co1 || 1)) * 3), max: 3, w: 3 });
                if (meMark != null && meMax > 0) components.push({ key: 'me', mark: round2((meMark / (meMax || 1)) * 4), max: 4, w: 4 });
              } else if (coNum === 2) {
                // CO2: Cycle1(SSA1_co2→1, CIA1_CO2→2, FA1_co2→2) + Cycle2(SSA2_first→1, CIA2_CO2→2, FA2_first→2) + Model(co2→4)
                
                // SSA
                let ssaConv = 0; const ssaMax = 2; // w = 1 + 1
                const s1 = readSsaCo(ssa1Res, student.id, 'co2');
                if (s1 != null) { ssaConv += (s1 / (maxes.ssa1.co2 || 1)) * 1; }
                const s2 = readSsaCo(ssa2Res, student.id, 'co3');
                if (s2 != null) { ssaConv += (s2 / (maxes.ssa2.co3 || 1)) * 1; }
                if (s1 != null || s2 != null) components.push({ key: 'ssa', mark: round2(ssaConv), max: ssaMax, w: ssaMax });

                // CIA: CIA1 questions tagged CO=2 + CIA2 questions tagged CO=2
                let ciaConv = 0; const ciaMax = 4; // w = 2 + 2
                const c1 = readCiaCo(cia1Data, cia1Questions, student.id, 2, false);
                if (c1) { ciaConv += (c1.mark / (c1.max || 1)) * 2; }
                const c2 = readCiaCo(cia2Data, cia2Questions, student.id, 2, true);
                if (c2) { ciaConv += (c2.mark / (c2.max || 1)) * 2; }
                if (c1 || c2) components.push({ key: 'cia', mark: round2(ciaConv), max: ciaMax, w: ciaMax });

                // FA
                let faConv = 0; const faMax = 4; // w = 2 + 2
                const f1 = readFaCo(f1Res, student.id, 'skill2', 'att2');
                if (f1 != null) { faConv += (f1 / (maxes.f1.co2 || 1)) * 2; }
                const f2 = readFaCo(f2Res, student.id, 'skill1', 'att1');
                if (f2 != null) { faConv += (f2 / (maxes.f2.co3 || 1)) * 2; }
                if (f1 != null || f2 != null) components.push({ key: 'fa', mark: round2(faConv), max: faMax, w: faMax });
                
                // ME
                if (meMark != null && meMax > 0) components.push({ key: 'me', mark: round2((meMark / (meMax || 1)) * 4), max: 4, w: 4 });
              } else if (coNum === 3) {
                // CO3: SSA2(second_co)→2, CIA2(CO3)→4, FA2(second_co)→3, Model(co3)→4
                const s = readSsaCo(ssa2Res, student.id, 'co4');
                if (s != null) components.push({ key: 'ssa', mark: round2((s / (maxes.ssa2.co4 || 1)) * 2), max: 2, w: 2 });
                const c = readCiaCo(cia2Data, cia2Questions, student.id, 3, true);
                if (c) components.push({ key: 'cia', mark: round2((c.mark / (c.max || 1)) * 4), max: 4, w: 4 });
                const f = readFaCo(f2Res, student.id, 'skill2', 'att2');
                if (f != null) components.push({ key: 'fa', mark: round2((f / (maxes.f2.co4 || 1)) * 3), max: 3, w: 3 });
                if (meMark != null && meMax > 0) components.push({ key: 'me', mark: round2((meMark / (meMax || 1)) * 4), max: 4, w: 4 });
              }

              if (components.length > 0) {
                const sumW = components.reduce((s, it) => s + it.w, 0);
                const totalValue = components.reduce((s, it) => {
                  const frac = it.mark / it.max;
                  return s + (frac * it.w);
                }, 0);
                const breakdown = components.map(it => ({ ...it, contrib: round2((it.mark / it.max) * it.w) }));
                totals[student.id][`co${coNum}`] = {
                  value: round2(totalValue),
                  max: round2(sumW),
                  // @ts-ignore
                  breakdown,
                } as any;
              } else {
                totals[student.id][`co${coNum}`] = null;
              }
              return; // skip generic path
            }

            if (isProject) {
              const reviewAssessment = String(assessmentType || '').toLowerCase();
              const isPrblCombined = isPrbl && reviewAssessment === 'model';

              if (isPrblCombined) {
                // PRBL internal marks formula:
                // Cycle 1: (review1/50)*12 + (ssa1/20)*3 = 15
                // Cycle 2: (review2/50)*12 + (ssa2/20)*3 = 15
                // Cycle 3: (model/50)*30             = 30
                // Total                              = 60
                const review1Raw = readReviewMarkByCo(review1Res as any, student.id, 'co1');
                const review2Raw = readReviewMarkByCo(review2Res as any, student.id, 'co3');
                const modelRaw = readReviewMarkByCo(prblModelRes as any, student.id, 'co1');

                // SSA1 total mark (out of 20)
                const ssa1Total = toNumOrNull((ssa1Res as any)?.marks?.[String(student.id)]);
                let ssa1Val: number | null = null;
                const ssa1DraftRows: any[] = (ssa1Res as any)?.draft?.rows || (ssa1Res as any)?.draft?.sheet?.rows || [];
                const ssa1DraftRow = ssa1DraftRows.find((r: any) => String(r.studentId) === String(student.id));
                if (ssa1DraftRow) {
                  // For SSA sheets, co1+co2 = total; for PRBL we take the full total
                  const co1v = toNumOrNull(ssa1DraftRow.co1);
                  const co2v = toNumOrNull(ssa1DraftRow.co2);
                  if (co1v != null && co2v != null) ssa1Val = co1v + co2v;
                  else if (co1v != null) ssa1Val = co1v;
                }
                if (ssa1Val == null && ssa1Total != null) ssa1Val = ssa1Total;

                // SSA2 total mark (out of 20)
                const ssa2Total = toNumOrNull((ssa2Res as any)?.marks?.[String(student.id)]);
                let ssa2Val: number | null = null;
                const ssa2DraftRows: any[] = (ssa2Res as any)?.draft?.rows || (ssa2Res as any)?.draft?.sheet?.rows || [];
                const ssa2DraftRow = ssa2DraftRows.find((r: any) => String(r.studentId) === String(student.id));
                if (ssa2DraftRow) {
                  const co3v = toNumOrNull(ssa2DraftRow.co3);
                  const co4v = toNumOrNull(ssa2DraftRow.co4);
                  if (co3v != null && co4v != null) ssa2Val = co3v + co4v;
                  else if (co3v != null) ssa2Val = co3v;
                }
                if (ssa2Val == null && ssa2Total != null) ssa2Val = ssa2Total;

                const hasSome = review1Raw != null || review2Raw != null || modelRaw != null || ssa1Val != null || ssa2Val != null;
                if (hasSome) {
                  const cycle1 = round2(((review1Raw ?? 0) / 50) * 12 + ((ssa1Val ?? 0) / 20) * 3);
                  const cycle2 = round2(((review2Raw ?? 0) / 50) * 12 + ((ssa2Val ?? 0) / 20) * 3);
                  const cycle3 = round2(((modelRaw ?? 0) / 50) * 30);
                  reviewMark = round2(cycle1 + cycle2 + cycle3);
                  reviewMax = 60;
                }
              } else {
                if (coNum === 1 && reviewAssessment === 'review1') {
                  const review1Mark = readReviewMarkByCo(review1Res as any, student.id, 'co1');
                  if (review1Mark != null) {
                    reviewMark = review1Mark;
                    reviewMax = 50;
                  }
                }
                if (coNum === 1 && reviewAssessment === 'review2') {
                  const review2Mark = readReviewMarkByCo(review2Res as any, student.id, 'co3');
                  if (review2Mark != null) {
                    reviewMark = review2Mark;
                    reviewMax = 50;
                  }
                }
              }
            }

            if (!isProject && (coNum === 1 || coNum === 2)) {
              // THEORY/TCPL/TCPR: SSA1 and CIA1. LAB/PRACTICAL: CIA comes from lab sheet.
              if (!isLabLike) {
                const ssa1Total = toNumOrNull((ssa1Res as any).marks[String(student.id)]);
                let ssaMarkVal: number | null = null;
                const ssaDraftRows: any[] = (ssa1Res as any).draft?.rows || (ssa1Res as any).draft?.sheet?.rows || [];
                const draftRow = ssaDraftRows.find((r) => String(r.studentId) === String(student.id));
                if (draftRow) {
                  const splitVal = coNum === 1 ? draftRow.co1 : draftRow.co2;
                  if (splitVal !== "" && splitVal != null && !isNaN(Number(splitVal))) {
                    ssaMarkVal = Number(splitVal);
                  }
                }
                if (ssaMarkVal === null && ssa1Total != null) {
                  ssaMarkVal = Number(ssa1Total) / 2;
                }
                ssaMark = ssaMarkVal;
                ssaMax = coNum === 1 ? maxes.ssa1.co1 : maxes.ssa1.co2;

                if (cia1Data) {
                  const cia1ById = cia1Data.rowsByStudentId || {};
                  const cia1Row = cia1ById[String(student.id)] || {};
                  const qObj = (cia1Row as any)?.q && typeof (cia1Row as any).q === 'object' ? (cia1Row as any).q : (cia1Row as any);

                  let anyCiaForCo = false;
                  let ciaAcc = 0;

                  cia1Questions.forEach((q: any, idxQ: number) => {
                    const qMax = Number(q?.max || 0);
                    const w = effectiveCia1Weights(cia1Questions, idxQ);
                    const wCo = coNum === 2 ? w.co2 : w.co1;

                    const raw = toNumOrNull(qObj?.[q.key]);
                    if (raw == null) return;
                    if (wCo <= 0) return;
                    anyCiaForCo = true;
                    const mark = qMax > 0 ? clamp(raw, 0, qMax) : raw;
                    ciaAcc += mark * wCo;
                  });

                  if (anyCiaForCo) {
                    ciaMark = ciaAcc;
                    const headerMax = coNum === 1 ? cia1HeaderMax.co1 : cia1HeaderMax.co2;
                    ciaMax = headerMax > 0 ? headerMax : coNum === 1 ? maxes.cia1.co1 : maxes.cia1.co2;
                  }
                }

                // TCPR: Review1 replaces Formative1
                if (isTcpr) {
                  const review1Mark = readReviewMarkByCo(review1Res as any, student.id, coNum === 1 ? 'co1' : 'co2');
                  if (review1Mark != null) {
                    reviewMark = review1Mark;
                    reviewMax = coNum === 1 ? maxes.review1.co1 : maxes.review1.co2;
                  }
                }

                // TCPL: LAB1 replaces Formative1
                if (isTcpl && tcplLab1) {
                  const coData = tcplLab1.get(student.id, coNum);
                  if (coData) {
                    faMark = coData.value;
                    faMax = coData.max;
                  }
                }

                // THEORY/SPECIAL: Formative1
                if (!isTcpr && !isTcpl) {
                  const f1Row = ((f1Res as any).marks || {})[String(student.id)] || {};
                  const skillKey = coNum === 1 ? 'skill1' : 'skill2';
                  const attKey = coNum === 1 ? 'att1' : 'att2';
                  const skill = toNumOrNull(f1Row[skillKey]);
                  const att = toNumOrNull(f1Row[attKey]);
                  if (skill !== null && att !== null) {
                    faMark = skill + att;
                    faMax = coNum === 1 ? maxes.f1.co1 : maxes.f1.co2;
                  }
                }
              } else {
                // LAB/PRACTICAL: CIA1 lab-style provides CO1/CO2 values.
                if (labCia1) {
                  const coData = labCia1.get(student.id, coNum);
                  if (coData) {
                    ciaMark = coData.value;
                    ciaMax = coData.max;
                  }
                }
              }
            } else if (!isProject && (coNum === 3 || coNum === 4)) {
              if (!isLabLike) {
                const ssa2Total = toNumOrNull((ssa2Res as any).marks[String(student.id)]);
                let ssaMarkVal: number | null = null;
                const ssaDraftRows: any[] = (ssa2Res as any).draft?.rows || (ssa2Res as any).draft?.sheet?.rows || [];
                const draftRow = ssaDraftRows.find((r) => String(r.studentId) === String(student.id));
                if (draftRow) {
                  const splitVal = coNum === 3 ? draftRow.co3 : draftRow.co4;
                  if (splitVal !== "" && splitVal != null && !isNaN(Number(splitVal))) {
                    ssaMarkVal = Number(splitVal);
                  }
                }
                if (ssaMarkVal === null && ssa2Total != null) {
                  ssaMarkVal = Number(ssa2Total) / 2;
                }
                ssaMark = ssaMarkVal;
                ssaMax = coNum === 3 ? maxes.ssa2.co3 : maxes.ssa2.co4;

                if (cia2Data) {
                  const cia2ById = cia2Data.rowsByStudentId || {};
                  const cia2Row = cia2ById[String(student.id)] || {};
                  const qObj = (cia2Row as any)?.q && typeof (cia2Row as any).q === 'object' ? (cia2Row as any).q : (cia2Row as any);

                  let anyCiaForCo = false;
                  let ciaAcc = 0;

                  cia2Questions.forEach((q: any, idxQ: number) => {
                    const qMax = Number(q?.max || 0);
                    const w = effectiveCia2Weights(cia2Questions, idxQ);
                    const wCo = coNum === 4 ? w.co4 : w.co3;

                    const raw = toNumOrNull(qObj?.[q.key]);
                    if (raw == null) return;
                    if (wCo <= 0) return;
                    anyCiaForCo = true;
                    const mark = qMax > 0 ? clamp(raw, 0, qMax) : raw;
                    ciaAcc += mark * wCo;
                  });

                  if (anyCiaForCo) {
                    ciaMark = ciaAcc;
                    const headerMax = coNum === 3 ? cia2HeaderMax.co3 : cia2HeaderMax.co4;
                    ciaMax = headerMax > 0 ? headerMax : coNum === 3 ? maxes.cia2.co3 : maxes.cia2.co4;
                  }
                }

                // TCPR: Review2 replaces Formative2
                if (isTcpr) {
                  const review2Mark = readReviewMarkByCo(review2Res as any, student.id, coNum === 3 ? 'co3' : 'co4');
                  if (review2Mark != null) {
                    reviewMark = review2Mark;
                    reviewMax = coNum === 3 ? maxes.review2.co3 : maxes.review2.co4;
                  }
                }

                // TCPL: LAB2 replaces Formative2
                if (isTcpl && tcplLab2) {
                  const coData = tcplLab2.get(student.id, coNum);
                  if (coData) {
                    faMark = coData.value;
                    faMax = coData.max;
                  }
                }

                // THEORY/SPECIAL: Formative2
                if (!isTcpr && !isTcpl) {
                  const f2Row = ((f2Res as any).marks || {})[String(student.id)] || {};
                  const skillKey = coNum === 3 ? 'skill1' : 'skill2';
                  const attKey = coNum === 3 ? 'att1' : 'att2';
                  const skill = toNumOrNull(f2Row[skillKey]);
                  const att = toNumOrNull(f2Row[attKey]);
                  if (skill !== null && att !== null) {
                    faMark = skill + att;
                    faMax = coNum === 3 ? maxes.f2.co3 : maxes.f2.co4;
                  }
                }
              } else {
                // LAB/PRACTICAL: CIA2 lab-style provides CO3/CO4 values.
                if (labCia2) {
                  const coData = labCia2.get(student.id, coNum);
                  if (coData) {
                    ciaMark = coData.value;
                    ciaMax = coData.max;
                  }
                }
              }
            }

            // LAB/PRACTICAL: MODEL is read from lab sheet (not localStorage)
            if (isLabLike && coNum === 5 && labModel) {
              const coData = labModel.get(student.id, coNum);
              if (coData) {
                meMark = coData.value;
                meMax = coData.max;
              }
            }

            // Build component list and breakdown (only include components present)
            const weights = weightsForCo(coNum);
            const components: Array<{ key: string; mark: number; max: number; w: number; }> = [];
            if (ssaMark !== null && ssaMax > 0) components.push({ key: 'ssa', mark: ssaMark, max: ssaMax, w: weights.ssa });
            if (ciaMark !== null && ciaMax > 0) components.push({ key: 'cia', mark: ciaMark, max: ciaMax, w: weights.cia });

            if (reviewMark !== null && reviewMax > 0) {
              // TCPR review replaces formative weight
              components.push({ key: 'review', mark: reviewMark, max: reviewMax, w: isProject ? reviewMax : weights.fa });
            }

            if (faMark !== null && faMax > 0) {
              const key = isTcpl ? (coNum === 1 || coNum === 2 ? 'lab1' : coNum === 3 || coNum === 4 ? 'lab2' : 'fa') : 'fa';
              const tcplFaWeight = isTcpl ? Math.max(0, Number(weights.fa || 0) + Number(weights.ciaExam || 0)) : weights.fa;
              components.push({ key, mark: faMark, max: faMax, w: tcplFaWeight });
            }

            if (meMark !== null && meMax > 0) {
              // For local model sheets: meMax is already 2/4 and mark is scaled to that; set w=meMax so contrib==mark.
              // For lab-like: meMax is the CO_MAX; treat it like a regular component with weight equal to meMax.
              const meWeight = weights.me > 0 ? weights.me : ((!isLabLike && modelScaled) ? (coNum === 5 ? 4 : 2) : meMax);
              components.push({ key: 'me', mark: meMark, max: meMax, w: meWeight });
            }

            if (components.length > 0) {
              const sumW = components.reduce((s, it) => s + it.w, 0);
              const totalMax = sumW; // sum of weights

              // weighted total value (in weight units)
              const totalValue = components.reduce((s, it) => {
                const frac = it.mark / it.max;
                return s + (frac * it.w);
              }, 0);

              // store breakdown too
              const breakdown = components.map(it => ({ ...it, contrib: round2((it.mark / it.max) * it.w) }));

              totals[student.id][`co${coNum}`] = {
                value: round2(totalValue),
                max: round2(totalMax),
                // @ts-ignore - attach breakdown for rendering
                breakdown,
              } as any;
            } else {
              totals[student.id][`co${coNum}`] = null;
            }
          });
        });

        setCoTotals(totals);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to calculate CO totals');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [subjectId, teachingAssignmentId, classType, questionPaperType, enabledAssessments, students, coNumbers, masterCfg]);

  const handleCQIChange = (studentId: number, coKey: string, value: string) => {
    if (tableBlocked) return;

    // Prevent editing COs that were already published in prior CQI pages
    const coNumMatch = coKey.match(/\d+/);
    if (coNumMatch) {
      const coNum = Number(coNumMatch[0]);
      if (priorPublishedCos.has(coNum)) return;
    }
    // allow empty to clear
    if (value === '') {
      setCqiErrors(prev => {
        const copy = { ...prev };
        delete copy[`${studentId}_${coKey}`];
        return copy;
      });
      setCqiEntries(prev => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [coKey]: null,
        },
      }));
      return;
    }

    // only integers allowed
    const parsed = Number(value);
    const isInt = Number.isFinite(parsed) && Math.floor(parsed) === parsed;
    if (!isInt) {
      setCqiErrors(prev => ({ ...prev, [`${studentId}_${coKey}`]: 'Enter an integer between 0 and 10' }));
      setCqiEntries(prev => ({ ...prev, [studentId]: { ...prev[studentId], [coKey]: null } }));
      return;
    }

    const numValue = parsed as number;
    if (numValue < 0 || numValue > 10) {
      window.alert('Entered value should be less than or equal to 10.');
      setCqiErrors(prev => ({ ...prev, [`${studentId}_${coKey}`]: 'Value must be between 0 and 10' }));
      setCqiEntries(prev => ({ ...prev, [studentId]: { ...prev[studentId], [coKey]: null } }));
      return;
    }

    // valid — clear error, update and autosave this entry
    setCqiErrors(prev => {
      const copy = { ...prev };
      delete copy[`${studentId}_${coKey}`];
      return copy;
    });

    setCqiEntries(prev => {
      const next = { ...prev, [studentId]: { ...prev[studentId], [coKey]: numValue } };
      setDirty(true);
      return next;
    });
  };

  const handleRequestEdit = async () => {
    if (!subjectId || !teachingAssignmentId) return;
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

    const mobileOk = await ensureMobileVerified();
    if (!mobileOk) {
      setActionError('Please verify your mobile number in Profile before requesting edits.');
      window.location.href = '/profile';
      return;
    }

    setEditRequestBusy(true);
    setActionError(null);
    try {
      const created = await createEditRequest({
        assessment: cqiAssessmentKey,
        subject_code: String(subjectId),
        scope: 'MARK_ENTRY',
        reason,
        teaching_assignment_id: teachingAssignmentId,
      });
      alert(formatEditRequestSentMessage(created));
      setRequestEditOpen(false);
      setEditRequestReason('');
      setMarkEntryReqPendingUntilMs(Date.now() + 24 * 60 * 60 * 1000);
      refreshMarkEntryReqPending({ silent: true });
      refreshMarkLock({ silent: true });
      refreshMarkEntryEditWindow({ silent: true });
    } catch (e: any) {
      const msg = formatApiErrorMessage(e, 'Failed to request edit');
      setActionError(msg);
      alert(`Edit request failed: ${msg}`);
    } finally {
      setEditRequestBusy(false);
    }
  };

  const requestApproval = async () => {
    if (!subjectId) return;
    const reason = String(requestReason || '').trim();
    if (!reason) {
      setRequestMessage('Reason is required.');
      return;
    }

    setRequesting(true);
    setRequestMessage(null);
    try {
      const created = await createPublishRequest({
        assessment: cqiAssessmentKey,
        subject_code: String(subjectId),
        reason,
        teaching_assignment_id: teachingAssignmentId,
      });
      const routed = String((created as any)?.routed_to || '').trim().toUpperCase();
      const warn = String((created as any)?.routing_warning || '').trim();
      const baseMsg = routed === 'HOD' ? 'Request sent to HOD successfully.' : 'Request sent to IQAC successfully.';
      setRequestMessage(warn ? `${baseMsg} ${warn}` : baseMsg);
      setRequestReason('');
      refreshPublishWindow();
    } catch (e: any) {
      setRequestMessage(e?.message || 'Failed to send request.');
    } finally {
      setRequesting(false);
    }
  };

  const handleSave = () => {
    if (!subjectId || !teachingAssignmentId) return;
    if (tableBlocked) return;
    // validate no errors
    if (Object.keys(cqiErrors).length) {
      alert('Fix CQI input errors before saving');
      return;
    }

    (async () => {
      try {
        const res = await fetchWithAuth(`/api/obe/cqi-save/${encodeURIComponent(String(subjectId))}${cqiQuery}`, { method: 'PUT', body: JSON.stringify(buildCqiPayload(cqiEntries)) }).catch(() => null);
        if (res && res.ok) {
          alert('CQI entries saved to server');
          setDirty(false);
          // attempt to read draft log info
          try { const j = await res.json().catch(() => null); if (j) setDraftLog(j); } catch(_){}
          return;
        }
        const txt = res ? await res.text().catch(() => '') : '';
        alert(txt || 'Failed to save CQI entries');
      } catch (e: any) {
        alert('Failed to save CQI entries: ' + String(e?.message || e));
      }
    })();
  };

  if (!subjectId || !teachingAssignmentId) {
    return (
      <div style={{ padding: 24, color: '#b91c1c' }}>
        Missing subject ID or teaching assignment ID
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
        Loading CQI data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: '#b91c1c' }}>
        Error: {error}
      </div>
    );
  }

  if (coNumbers.length === 0) {
    return (
      <div style={{ padding: 24, color: '#b91c1c' }}>
        No course outcomes selected for CQI entry
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 16,
        padding: 16,
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        borderRadius: 12,
        border: '1px solid #bae6fd',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
            CQI Entry - {cos?.join(', ')}
          </h2>
          <div style={{ marginTop: 4, fontSize: 14, color: '#64748b' }}>
            Students below {THRESHOLD_PERCENT}% threshold require CQI intervention
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={openExportModal}
                      className="obe-btn"
                      style={{ minWidth: 110 }}
                    >
                      Export
                    </button>
          <button
            type="button"
            onClick={() => setDebugMode((s) => !s)}
            className="obe-btn"
            style={{ minWidth: 90, background: debugMode ? '#fef3c7' : undefined }}
          >
            {debugMode ? 'DEBUG ON' : 'DEBUG'}
          </button>
          

          

          {!publishedEditLocked ? (
            <button
              type="button"
              onClick={async () => {
                if (!subjectId || !teachingAssignmentId) return alert('Missing subject/teaching assignment');
                if (tableBlocked) return;
                const ok = confirm('Reset CQI marks for all students? This clears the saved draft.');
                if (!ok) return;
                setResettingMarks(true);
                try {
                  // Clear UI state immediately.
                  setCqiEntries({});
                  setCqiErrors({});
                  setDirty(false);

                  // Save empty draft to server.
                  const res = await fetchWithAuth(`/api/obe/cqi-draft/${encodeURIComponent(String(subjectId))}${cqiQuery}`, {
                    method: 'PUT',
                    body: JSON.stringify(buildCqiPayload({})),
                  }).catch(() => null);

                  if (res && res.ok) {
                    const j = await res.json().catch(() => null);
                    setDraftLog(j || { updated_at: new Date().toISOString(), updated_by: null });
                    alert('CQI draft reset');
                  } else {
                    const txt = res ? await res.text().catch(() => '') : '';
                    alert(txt || 'Failed to reset draft');
                  }
                } catch (e: any) {
                  alert('Failed to reset draft: ' + String(e?.message || e));
                } finally {
                  setResettingMarks(false);
                }
              }}
              className="obe-btn obe-btn-danger"
              style={{ minWidth: 120 }}
              disabled={resettingMarks || tableBlocked || !publishAllowed || globalLocked}
              title="Clears the saved draft marks"
            >
              {resettingMarks ? 'Resetting…' : 'Reset Marks'}
            </button>
          ) : null}

          <button
            type="button"
            onClick={async () => {
              if (globalLocked) {
                alert('Publishing is locked by IQAC.');
                return;
              }
              if (!publishAllowed) {
                alert('Publish window is closed. Please request IQAC approval.');
                return;
              }
              if (publishButtonIsRequestEdit) {
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
                setRequestEditOpen(true);
                setActionError(null);
                return;
              }
              if (!subjectId) return alert('Missing subject');
              if (tableBlocked) return;
              if (!confirm('Publish CQI to DB? This action cannot be undone.')) return;
              setPublishing(true);
              try {
                const res = await fetchWithAuth(`/api/obe/cqi-publish/${encodeURIComponent(String(subjectId))}${cqiQuery}`, {
                  method: 'POST',
                  body: JSON.stringify(buildCqiPayload(cqiEntries)),
                }).catch(() => null);
                if (res && res.ok) {
                  const j = await res.json().catch(() => null);
                  setDirty(false);
                  setLocalPublished(true);
                  setPublishedLog({ published_at: j?.published_at ?? new Date().toISOString() });
                  refreshPublishWindow();
                  refreshMarkLock({ silent: true });
                  refreshMarkEntryEditWindow({ silent: true });
                  try {
                    window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId } }));
                  } catch (_) {}
                  alert('CQI published');
                } else {
                  const txt = res ? await res.text().catch(() => '') : '';
                  alert(txt || 'Publish failed');
                }
              } catch (e: any) {
                alert('Publish failed: ' + String(e?.message || e));
              } finally {
                setPublishing(false);
              }
            }}
            className="obe-btn obe-btn-primary"
            style={{ minWidth: 110 }}
            disabled={editRequestsBlocked || (publishButtonIsRequestEdit ? markEntryReqPending : tableBlocked || publishing || !publishAllowed)}
          >
            {publishButtonIsRequestEdit ? (markEntryReqPending ? 'Request Pending' : 'Request Edit') : editRequestsBlocked ? 'Published & Locked' : publishing ? 'Publishing…' : 'Publish'}
          </button>
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
            {publishWindow.allowed_by_approval && publishWindow.approval_until ? (
              <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>Approved until {new Date(publishWindow.approval_until).toLocaleString()}</div>
            ) : null}
          </div>
        ) : (
          'Due time not set by IQAC.'
        )}
      </div>

      {globalLocked ? (
        <div style={{ marginBottom: 10, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Publishing disabled by IQAC</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Global publishing is turned OFF for this CQI page. You can view the page, but editing and publishing are locked.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="obe-btn" onClick={() => refreshPublishWindow()} disabled={publishWindowLoading}>Refresh</button>
          </div>
        </div>
      ) : !publishAllowed ? (
        <div style={{ marginBottom: 10, border: '1px solid #fecaca', background: '#fff7ed', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Publish time is over</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Send a request for approval. The request follows the same HOD/IQAC flow as other OBE mark entry pages.</div>
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

      {actionError ? (
        <div style={{ marginBottom: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 10, padding: '10px 12px', fontWeight: 600 }}>
          {actionError}
        </div>
      ) : null}

      {publishedEditLocked ? (
        <div style={{ marginBottom: 12, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, color: '#92400e' }}>Published & locked</div>
              <div style={{ marginTop: 4, fontSize: 13, color: '#6b7280' }}>
                CQI is read-only after publish. Use Request Edit to ask IQAC for edit access.
                {markEntryReqPending ? ' Edit request is pending.' : ''}
              </div>
            </div>
            <button
              type="button"
              className="obe-btn obe-btn-primary"
              disabled={editRequestsBlocked || markEntryReqPending}
              onClick={async () => {
                if (editRequestsBlocked) return;
                if (markEntryReqPending) return;
                const mobileOk = await ensureMobileVerified();
                if (!mobileOk) {
                  alert('Please verify your mobile number in Profile before requesting edits.');
                  window.location.href = '/profile';
                  return;
                }
                setRequestEditOpen(true);
                setActionError(null);
              }}
            >
              {editRequestsBlocked ? 'Published & Locked' : markEntryReqPending ? 'Request Pending' : 'Request Edit'}
            </button>
          </div>
        </div>
      ) : null}

      {requestEditOpen ? (
        <div style={{ marginBottom: 12, border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: '#111827' }}>Request Edit Access</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
            This request goes through the same IQAC approval flow as mark entry pages. After approval, this CQI page becomes editable again until the approval window ends.
          </div>
          <textarea
            value={editRequestReason}
            onChange={(e) => setEditRequestReason(e.target.value)}
            placeholder="Explain why you need to edit this published CQI page"
            rows={3}
            className="obe-input"
            style={{ marginTop: 10, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button className="obe-btn" disabled={editRequestBusy} onClick={() => setRequestEditOpen(false)}>
              Cancel
            </button>
            <button className="obe-btn obe-btn-success" disabled={editRequestBusy || markEntryReqPending || !String(editRequestReason || '').trim()} onClick={handleRequestEdit}>
              {editRequestBusy ? 'Sending…' : markEntryReqPending ? 'Request Pending' : 'Send Request'}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e6eef8' }}>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Draft: {draftLog?.updated_at ? new Date(String(draftLog.updated_at)).toLocaleString() : 'never'} {draftLog?.updated_by ? `by ${draftLog.updated_by?.name || draftLog.updated_by?.username || draftLog.updated_by}` : ''}
            {dirty ? ' · unsaved changes' : ''}
            {publishedLog?.published_at ? ` · Published: ${new Date(String(publishedLog.published_at)).toLocaleString()}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#475569' }}><input type="checkbox" checked={autoSaveEnabled} onChange={() => setAutoSaveEnabled((s) => !s)} disabled={tableBlocked} /> Auto-save</label>
            <button className="obe-btn" onClick={() => {
              // manual sync draft to server
              (async () => {
                if (!subjectId || !teachingAssignmentId) return alert('Missing subject/TA');
                if (tableBlocked) return;
                try {
                  const res = await fetchWithAuth(`/api/obe/cqi-draft/${encodeURIComponent(String(subjectId))}${cqiQuery}`, { method: 'PUT', body: JSON.stringify(buildCqiPayload(cqiEntries)) }).catch(() => null);
                  if (res && res.ok) { const j = await res.json().catch(() => null); setDraftLog(j || null); setDirty(false); alert('Draft synced to server'); }
                  else { alert('Server save failed'); }
                } catch (e:any) { alert('Server save failed: ' + String(e?.message || e)); }
              })();
            }} disabled={tableBlocked}>Sync Draft</button>
          </div>
        </div>

        {/* Banner: Previously attained COs from other CQI pages */}
        {priorPublishedCos.size > 0 && (
          <div style={{
            padding: '12px 16px',
            background: '#eff6ff',
            border: '1px solid #93c5fd',
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 13,
            color: '#1e40af',
          }}>
            <strong>Previously Attained COs:</strong>{' '}
            {[...priorPublishedCos].sort((a, b) => a - b).map((co) => `CO${co}`).join(', ')}{' '}
            — These COs were published in prior CQI sessions and are shown as <strong>read-only</strong>. Only unattained COs on this page can receive new CQI marks.
          </div>
        )}

        <table className="cqi-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 700, color: '#475569', minWidth: 60 }}>
                S.No
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 700, color: '#475569', minWidth: 120 }}>
                Reg No
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 700, color: '#475569', minWidth: 200 }}>
                Name
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, color: '#475569', minWidth: 100 }}>
                BEFORE CQI
                <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginTop: 2 }}>
                  
                </div>
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, color: '#475569', minWidth: 100 }}>
                AFTER CQI
                <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginTop: 2 }}>
                
                </div>
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, color: '#475569', minWidth: 120 }}>
                TOTAL
                <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginTop: 2 }}>
              
                </div>
              </th>
                  {coNumbers.map(coNum => (
                <th 
                  key={coNum} 
                  style={{ 
                    padding: '12px 8px', 
                    textAlign: 'center', 
                    fontWeight: 700, 
                    color: priorPublishedCos.has(coNum) ? '#1d4ed8' : '#475569',
                    minWidth: 150,
                    backgroundColor: priorPublishedCos.has(coNum) ? '#eff6ff' : undefined,
                  }}
                >
                  CO{coNum}
                      {priorPublishedCos.has(coNum) && (
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#1d4ed8', marginTop: 2 }}>
                          (PRIOR CQI)
                        </div>
                      )}
                      <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginTop: 2 }}>
                        
                      </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student, idx) => {
              const studentTotals = coTotals[student.id] || {};
              
              // Calculate BEFORE CQI (sum of all CO values)
              let beforeCqiValue = 0;
              let beforeCqiMax = 0;
              coNumbers.forEach(coNum => {
                const coData = studentTotals[`co${coNum}`];
                if (coData) {
                  beforeCqiValue += coData.value;
                  beforeCqiMax += coData.max;
                }
              });

              // TOTAL is simply the sum of the selected COs shown on this page.
              const totalValue = beforeCqiValue;
              const totalMax = beforeCqiMax;
              const totalPct = totalMax ? (totalValue / totalMax) * 100 : 0;
              
              const beforePercentage = beforeCqiMax ? (beforeCqiValue / beforeCqiMax) * 100 : 0;

              // Calculate AFTER CQI using per-CO rules:
              // - CO% < 58 and Overall < 58%: CQI (0–10) converted to a 60% scale (i.e. * 0.6) and capped at 58% of CO max
              // - CO% < 58 and Overall >= 58%: CQI (0–10) converted to 15% scale and added directly without cap
              // - CO% >= 58: No CQI field, no mark added
              // For already-attained COs (prior pages), use their published values.
              const afterCqiMax = beforeCqiMax; // max stays the same
              let afterCqiValue = beforeCqiValue;
              let delta = 0;

              const isOverallBelowThreshold = totalMax > 0 && totalPct < THRESHOLD_PERCENT;

              coNumbers.forEach((coNum) => {
                const coKey = `co${coNum}`;
                const coData: any = studentTotals[coKey];
                if (!coData) return;

                // For already-attained COs, use the prior published value
                const isAlreadyAttained = priorPublishedCos.has(coNum);
                const priorEntry = priorCqiEntries[student.id] ?? priorCqiEntries[String(student.id)] ?? {};
                const input = isAlreadyAttained
                  ? (priorEntry[coKey] ?? null)
                  : (cqiEntries[student.id]?.[coKey] ?? null);
                if (input == null) return;

                const coVal = Number(coData.value);
                const coMax = Number(coData.max);
                const coPct = coMax ? (coVal / coMax) * 100 : 0;
                const isCoBelow = coPct < THRESHOLD_PERCENT;

                let add: number;
                if (isCoBelow) {
                  if (isOverallBelowThreshold) {
                    // Convert CQI mark (out of 10) to 60 percentage scale
                    const rawAdd = (Number(input) / 10) * ((60 / 10) * 1); // equivalent to * 0.6
                    const allowance = Math.max(0, (THRESHOLD_PERCENT / 100) * coMax - coVal);
                    add = Math.min(rawAdd, allowance);
                  } else {
                    // Convert CQI mark (out of 10) to 15 percentage and add directly without cap
                    add = Number(input) * (15 / 100);
                  }
                } else {
                  // CO is attained, no CQI input
                  add = 0;
                }

                if (Number.isFinite(add) && add > 0) {
                  delta += add;
                  afterCqiValue += add;
                }
              });

              // Keep AFTER within [0..MAX]
              afterCqiValue = Number.isFinite(afterCqiValue) ? clamp(afterCqiValue, 0, afterCqiMax || afterCqiValue) : beforeCqiValue;
              // Cap total at 58% if original total was below 58%.
              // This ensures no student below threshold ends up above threshold after CQI.
              if (beforePercentage < THRESHOLD_PERCENT && afterCqiMax > 0) {
                const totalCap = (THRESHOLD_PERCENT / 100) * afterCqiMax;
                afterCqiValue = Math.min(afterCqiValue, totalCap);
              }
              const afterPercentage = afterCqiMax ? (afterCqiValue / afterCqiMax) * 100 : 0;
              
              return (
                <tr 
                  key={student.id}
                  style={{ 
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb',
                  }}
                >
                  <td style={{ padding: '10px 8px', color: '#64748b' }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: '#0f172a' }}>
                    {student.reg_no}
                  </td>
                  <td style={{ padding: '10px 8px', color: '#0f172a' }}>
                    {student.name}
                  </td>
                  <td style={{ 
                    padding: '10px 8px', 
                    textAlign: 'center',
                    fontWeight: 600,
                  }}>
                    {beforeCqiMax > 0 ? (
                      <div>
                        <div style={{ color: '#0f172a', fontSize: 14 }}>
                          {round2(beforeCqiValue)}{!debugMode && beforeCqiMax > 0 ? <> / {round2(beforeCqiMax)}</> : null}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          ({round2(beforePercentage)}%)
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ 
                    padding: '10px 8px', 
                    textAlign: 'center',
                    fontWeight: 600,
                    backgroundColor: afterCqiValue > beforeCqiValue ? '#f0fdf4' : 'transparent',
                  }}>
                    {afterCqiMax > 0 ? (
                      <div>
                        <div style={{ color: '#0f172a', fontSize: 14 }}>
                          {round2(afterCqiValue)}{!debugMode && afterCqiMax > 0 ? <> / {round2(afterCqiMax)}</> : null}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          ({round2(afterPercentage)}%)
                        </div>
                        {delta > 0 && (
                          <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                            +{round2(delta)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>

                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700 }}>
                    {totalMax > 0 ? (
                      <div style={{ backgroundColor: totalPct < THRESHOLD_PERCENT ? '#fff1f2' : 'transparent', padding: 6, borderRadius: 6 }}>
                        <div style={{ color: totalPct < THRESHOLD_PERCENT ? '#ef4444' : '#0f172a', fontSize: 14, fontWeight: 800 }}>
                          {round2(totalPct)}%
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                          {round2(totalValue)}{!debugMode && totalMax > 0 ? <> / {round2(totalMax)}</> : null}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  {coNumbers.map(coNum => {
                    const coKey = `co${coNum}`;
                    const coData = studentTotals[coKey];
                    
                    if (!coData) {
                      return (
                        <td 
                          key={coNum}
                          style={{ 
                            padding: '10px 8px', 
                            textAlign: 'center',
                            color: '#94a3b8',
                          }}
                        >
                          —
                        </td>
                      );
                    }

                    const percentage = coData.max ? (coData.value / coData.max) * 100 : 0;
                    const isBelowThreshold = percentage < THRESHOLD_PERCENT;
                    const cqiValue = cqiEntries[student.id]?.[coKey];

                    // Check if this CO was already published in a prior CQI page
                    const isAlreadyAttained = priorPublishedCos.has(coNum);
                    const priorEntry = priorCqiEntries[student.id] ?? priorCqiEntries[String(student.id)] ?? {};
                    const priorValue = isAlreadyAttained ? (priorEntry[coKey] ?? null) : null;

                    return (
                      <td 
                        key={coNum}
                        style={{ 
                          padding: '10px 8px', 
                          textAlign: 'center',
                          backgroundColor: isAlreadyAttained ? '#eff6ff' : (isBelowThreshold ? (isOverallBelowThreshold ? '#fef2f2' : '#f0f9ff') : '#f0fdf4'),
                        }}
                      >
                        <div style={{ 
                          fontSize: 13, 
                          color: '#64748b',
                          marginBottom: 6,
                        }}>
                          <div>{round2(coData.value)} ({round2(percentage)}%)</div>
                          {/* show component breakdown if available */}
                          {debugMode ? null : (
                            Array.isArray((coData as any).breakdown) && (
                              <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                                {((coData as any).breakdown as any[]).map((c: any) => (
                                  <div key={c.key} style={{ display: 'inline-block', marginRight: 8 }}>
                                    {componentLabel(normalizeClassType(classType), String(c.key || ''))}: {round2(c.mark)} / {round2(c.max)} =&nbsp;{round2(c.contrib)}
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                        </div>
                        {isAlreadyAttained ? (
                          // CO was already published in a prior CQI page — show as read-only final
                          <div>
                            <div style={{
                              fontSize: 11,
                              color: '#1d4ed8',
                              fontWeight: 700,
                              marginBottom: 4,
                            }}>
                              CQI ALREADY ATTAINED
                            </div>
                            {priorValue != null && Number.isFinite(Number(priorValue)) ? (
                              <div style={{
                                display: 'inline-block',
                                padding: '4px 14px',
                                background: '#dbeafe',
                                borderRadius: 6,
                                fontWeight: 800,
                                fontSize: 14,
                                color: '#1e40af',
                                border: '1px solid #93c5fd',
                              }}>
                                {round2(Number(priorValue))} / 10
                              </div>
                            ) : (
                              <div style={{
                                fontSize: 12,
                                color: '#6b7280',
                              }}>
                                (no mark entered)
                              </div>
                            )}
                            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
                              Published — read-only
                            </div>
                          </div>
                        ) : isBelowThreshold ? (
                          <div>
                            <div style={{ 
                              fontSize: 11, 
                              color: isOverallBelowThreshold ? '#dc2626' : '#0369a1', 
                              fontWeight: 600,
                              marginBottom: 4,
                            }}>
                              {isOverallBelowThreshold ? 'CO Not Attained (Converted to 60%)' : 'CO Not Attained (Special Improvement - 15% Add)'}
                            </div>
                            <input
                              type="number"
                              value={cqiValue ?? ''}
                              onChange={(e) => handleCQIChange(student.id, coKey, e.target.value)}
                              disabled={tableBlocked}
                              placeholder="Enter CQI"
                              className="obe-input"
                              style={{
                                width: 90,
                                padding: '4px 8px',
                                fontSize: 13,
                                textAlign: 'center',
                              }}
                            />
                            {cqiErrors[`${student.id}_${coKey}`] && (
                              <div style={{ color: '#dc2626', fontSize: 11, marginTop: 6 }}>
                                {cqiErrors[`${student.id}_${coKey}`]}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ 
                            fontSize: 12, 
                            color: '#16a34a',
                            fontWeight: 600,
                          }}>
                            ✓ ATTAINED
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {students.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: 32,
          color: '#94a3b8',
        }}>
          No students found in this section
        </div>
      )}

      {/* ── Export Modal ── */}
      {exportStep !== 'closed' && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={closeExportModal}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, padding: 32, width: 400,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {exportStep === 'type' && (
              <>
                <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                  Select Report Type
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
                  Choose which students to include in the export.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {([
                    { value: 'all',     label: 'All Students Report',            desc: 'Export data for every student in the class.' },
                    { value: 'flagged', label: 'CQI Containing Students Report', desc: 'Export only students with at least one CO below threshold.' },
                  ] as const).map(({ value, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setExportReportType(value); setExportStep('format'); }}
                      style={{
                        textAlign: 'left', padding: '14px 16px', borderRadius: 10,
                        border: '2px solid #e2e8f0', background: '#f8fafc',
                        cursor: 'pointer', transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    >
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{label}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{desc}</div>
                    </button>
                  ))}
                </div>
                <button
                  type="button" onClick={closeExportModal}
                  style={{ marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 8,
                    border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer',
                    color: '#64748b', fontWeight: 600, fontSize: 14 }}
                >
                  Cancel
                </button>
              </>
            )}

            {exportStep === 'format' && (
              <>
                <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                  Select Format
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
                  {exportReportType === 'flagged'
                    ? `Exporting ${exportRowsFiltered.length} CQI student(s).`
                    : `Exporting all ${exportRowsFiltered.length} student(s).`}
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  {([
                    { fmt: 'pdf',   icon: '📄', label: 'PDF',   color: '#dc2626' },
                    { fmt: 'excel', icon: '📊', label: 'Excel', color: '#16a34a' },
                  ] as const).map(({ fmt, icon, label, color }) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={fmt === 'pdf' ? handleExportPdf : handleExportExcel}
                      style={{
                        flex: 1, padding: '18px 8px', borderRadius: 12,
                        border: `2px solid ${color}20`, background: `${color}08`,
                        cursor: 'pointer', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 8, transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = `${color}15`)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = `${color}08`)}
                    >
                      <span style={{ fontSize: 28 }}>{icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 14, color }}>{label}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    type="button" onClick={() => setExportStep('type')}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                      border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer',
                      color: '#64748b', fontWeight: 600, fontSize: 14 }}
                  >
                    ← Back
                  </button>
                  <button
                    type="button" onClick={closeExportModal}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                      border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer',
                      color: '#64748b', fontWeight: 600, fontSize: 14 }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
