import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchMyTeachingAssignments,
  fetchClassTypeWeights,
  fetchPublishedCia1Sheet,
  fetchPublishedCiaSheet,
  fetchPublishedFormative,
  fetchPublishedFormative1,
  fetchPublishedLabSheet,
  fetchPublishedModelSheet,
  fetchPublishedSsa1,
  fetchPublishedSsa2,
  fetchDraft,
  fetchMarkTableLockStatus,
  TeachingAssignmentItem,
} from '../services/obe';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import fetchWithAuth from '../services/fetchAuth';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchDeptRow, fetchDeptRows, fetchMasters } from '../services/curriculum';
import { lsGet, lsSet } from '../utils/localStorage';
import { isLabClassType, isSpecialClassType, normalizeClassType } from '../constants/classTypes';
import { getCycleOneWeightsFromInternal } from '../utils/internalMarkWeights';

type Props = { courseId: string; enabledAssessments?: string[] | null; classType?: string | null };

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type QuestionDef = {
  key: string;
  label: string;
  max: number;
  co: 1 | 2 | '1&2';
  btl: 1 | 2 | 3 | 4 | 5 | 6;
};

type QuestionDef34 = {
  key: string;
  label: string;
  max: number;
  co: 3 | 4 | '3&4';
  btl: 1 | 2 | 3 | 4 | 5 | 6;
};

const DEFAULT_CIA1_QUESTIONS: QuestionDef[] = [
  { key: 'q1', label: 'Q1', max: 2, co: 1, btl: 1 },
  { key: 'q2', label: 'Q2', max: 2, co: 1, btl: 3 },
  { key: 'q3', label: 'Q3', max: 2, co: 1, btl: 4 },
  { key: 'q4', label: 'Q4', max: 2, co: 2, btl: 1 },
  { key: 'q5', label: 'Q5', max: 2, co: 2, btl: 1 },
  { key: 'q6', label: 'Q6', max: 2, co: 2, btl: 2 },
  { key: 'q7', label: 'Q7', max: 16, co: 1, btl: 2 },
  { key: 'q8', label: 'Q8', max: 16, co: 2, btl: 3 },
  { key: 'q9', label: 'Q9', max: 16, co: '1&2', btl: 5 },
];

const DEFAULT_CIA2_QUESTIONS: QuestionDef34[] = [
  { key: 'q1', label: 'Q1', max: 2, co: 3, btl: 1 },
  { key: 'q2', label: 'Q2', max: 2, co: 3, btl: 3 },
  { key: 'q3', label: 'Q3', max: 2, co: 3, btl: 4 },
  { key: 'q4', label: 'Q4', max: 2, co: 4, btl: 1 },
  { key: 'q5', label: 'Q5', max: 2, co: 4, btl: 1 },
  { key: 'q6', label: 'Q6', max: 2, co: 4, btl: 2 },
  { key: 'q7', label: 'Q7', max: 16, co: 3, btl: 2 },
  { key: 'q8', label: 'Q8', max: 16, co: 4, btl: 3 },
  { key: 'q9', label: 'Q9', max: 16, co: '3&4', btl: 5 },
];

const DEFAULT_LAB_CIA_EXAM_MAX = 30;
const LAB_CO_MAX_OVERRIDE = { co1: 42, co2: 42, co3: 58, co4: 42, co5: 42 };

// THEORY-only: CO5 comes from the MODEL (theory) sheet template.
// We reuse the same question layout + CO mapping used in ModelEntry.tsx.
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

const MODEL_THEORY_CO5_MAX = MODEL_THEORY_QUESTIONS.reduce((sum, q, i) => sum + (MODEL_THEORY_CO_ROW[i] === 5 ? q.max : 0), 0);

const DEFAULT_THEORY_CO5_WEIGHTAGE = 10;

// Helper function to determine maximum CO number for a given class type.
// CO5 is present for:
// - LAB (from MODEL lab sheet)
// - THEORY (from MODEL theory sheet)
// - TCPL/TCPR (from MODEL tcpl/tcpr sheet)
function getMaxCONumber(classType: string | null, isLabCourse: boolean, enabledAssessments: string[]): number {
  if (isLabCourse) return 5;
  const ct = normalizeClassType(classType);
  const modelEnabled = enabledAssessments.includes('model');
  if (modelEnabled && (ct === 'THEORY' || ct === 'TCPL' || ct === 'TCPR')) return 5;
  return 4;
}

// Helper to get active CO numbers as array
function getActiveCONumbers(maxCONumber: number): number[] {
  return Array.from({ length: maxCONumber }, (_, i) => i + 1);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toNumOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function avgMarks(arr: Array<number | ''>): number | null {
  const nums = arr.filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function btlLevel(raw: unknown): 1 | 2 | 3 | 4 | 5 | 6 | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  return t >= 1 && t <= 6 ? (t as 1 | 2 | 3 | 4 | 5 | 6) : null;
}

function parseCo(raw: unknown): 1 | 2 | '1&2' {
  if (raw === '1&2' || raw === 'both') return '1&2';
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s === '1&2' || s === '1,2' || s === '1/2' || s === '2/1') return '1&2';
    if (s === '2') return 2;
    if (s === '1') return 1;
  }
  if (Array.isArray(raw)) {
    const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    if (nums.includes(1) && nums.includes(2)) return '1&2';
    if (nums.includes(2)) return 2;
    if (nums.includes(1)) return 1;
  }
  const n = Number(raw);
  if (n === 2) return 2;
  if (n === 12) return '1&2';
  return 1;
}

function parseCo34(raw: unknown): 3 | 4 | '3&4' {
  if (raw === '3&4' || raw === 'both') return '3&4';
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s === '3&4' || s === '3,4' || s === '3/4' || s === '4/3') return '3&4';
    if (s === '4') return 4;
    if (s === '3') return 3;
  }
  if (Array.isArray(raw)) {
    const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    if (nums.includes(3) && nums.includes(4)) return '3&4';
    if (nums.includes(4)) return 4;
    if (nums.includes(3)) return 3;
  }
  const n = Number(raw);
  if (n === 4) return 4;
  if (n === 3) return 3;
  if (n === 34) return '3&4';
  return 3;
}

function coWeights(co: 1 | 2 | '1&2'): { co1: number; co2: number } {
  if (co === '1&2') return { co1: 0.5, co2: 0.5 };
  return co === 2 ? { co1: 0, co2: 1 } : { co1: 1, co2: 0 };
}

function effectiveCoWeightsForQuestion(questions: QuestionDef[], idx: number): { co1: number; co2: number } {
  const q = questions[idx];
  if (!q) return { co1: 0, co2: 0 };
  if (q.co === '1&2') return { co1: 0.5, co2: 0.5 };

  return coWeights(q.co);
}

function coWeights34(co: 3 | 4 | '3&4'): { co3: number; co4: number } {
  if (co === '3&4') return { co3: 0.5, co4: 0.5 };
  return co === 4 ? { co3: 0, co4: 1 } : { co3: 1, co4: 0 };
}

function effectiveCoWeightsForQuestion34(questions: QuestionDef34[], idx: number): { co3: number; co4: number } {
  const q = questions[idx];
  if (!q) return { co3: 0, co4: 0 };
  if (q.co === '3&4') return { co3: 0.5, co4: 0.5 };

  return coWeights34(q.co);
}

function compareStudentName(a: { name?: string; reg_no?: string }, b: { name?: string; reg_no?: string }) {
  const aLast3 = parseInt(String(a?.reg_no || '').slice(-3), 10);
  const bLast3 = parseInt(String(b?.reg_no || '').slice(-3), 10);
  return (isNaN(aLast3) ? 9999 : aLast3) - (isNaN(bLast3) ? 9999 : bLast3);
}

function weightedBlendMark(args: {
  ssaMark: number | null;
  ciaMark: number | null;
  f1Mark: number | null;
  ssaMax: number;
  ciaMax: number;
  f1Max: number;
  ssaW: number;
  ciaW: number;
  f1W: number;
}): number | null {
  const { ssaMark, ciaMark, f1Mark, ssaMax, ciaMax, f1Max, ssaW, ciaW, f1W } = args;

  const items: Array<{ mark: number | null; max: number; w: number }> = [
    { mark: ssaMark, max: ssaMax, w: ssaW },
    { mark: ciaMark, max: ciaMax, w: ciaW },
    { mark: f1Mark, max: f1Max, w: f1W },
  ].filter((it) => Number(it.w || 0) > 0);

  if (!items.length) return null;
  if (items.some((it) => it.mark == null)) return null;
  if (items.some((it) => !it.max || !Number.isFinite(Number(it.max)))) return null;

  const sumW = items.reduce((s, it) => s + it.w, 0);
  const sumP = items.reduce((s, it) => s + it.max, 0);
  if (!sumW || !sumP) return null;

  const frac = items.reduce((s, it) => s + ((it.mark as number) / it.max) * it.w, 0) / sumW;
  const out = frac * sumP;
  return Number.isFinite(out) ? clamp(out, 0, sumP) : null;
}

function weightedCoMarkFromComponents(args: {
  ssaMark: number | null;
  ciaMark: number | null;
  f1Mark: number | null;
  ssaMax: number;
  ciaMax: number;
  f1Max: number;
  ssaW: number;
  ciaW: number;
  f1W: number;
  outOf: number;
}): number | null {
  const { ssaMark, ciaMark, f1Mark, ssaMax, ciaMax, f1Max, ssaW, ciaW, f1W, outOf } = args;

  const items: Array<{ mark: number | null; max: number; w: number }> = [
    { mark: ssaMark, max: ssaMax, w: ssaW },
    { mark: ciaMark, max: ciaMax, w: ciaW },
    { mark: f1Mark, max: f1Max, w: f1W },
  ].filter((it) => Number(it.w || 0) > 0);

  if (!items.length) return null;
  if (!outOf || !Number.isFinite(Number(outOf))) return null;
  if (items.some((it) => it.mark == null)) return null;
  if (items.some((it) => !it.max || !Number.isFinite(Number(it.max)))) return null;

  const sumW = items.reduce((s, it) => s + it.w, 0);
  if (!sumW) return null;

  // Excel-style: contrib = (mark/max) * weight; then normalize by total weights and scale to outOf.
  const weightedFrac =
    items.reduce((s, it) => s + ((it.mark as number) / it.max) * it.w, 0) /
    sumW;

  const out = weightedFrac * outOf;
  return Number.isFinite(out) ? clamp(out, 0, outOf) : null;
}

export function COAttainmentPage({ courseId, enabledAssessments, classType: initialClassType }: Props): JSX.Element {
  const [masterCfg, setMasterCfg] = useState<any>(null);

  const [classType, setClassType] = useState<string | null>(initialClassType ?? null);
  const isSpecialFromEnabledAssessments = useMemo(() => Array.isArray(enabledAssessments), [enabledAssessments]);
  const enabledSet = useMemo(() => {
    const arr = Array.isArray(enabledAssessments) ? enabledAssessments : [];
    return new Set(arr.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
  }, [enabledAssessments]);

  const modelEnabled = useMemo(() => enabledSet.has('model'), [enabledSet]);
  const [modelLock, setModelLock] = useState<any>(null);
  const [modelLockError, setModelLockError] = useState<string | null>(null);
  const isSpecialCourse = useMemo(
    () => isSpecialFromEnabledAssessments || isSpecialClassType(classType),
    [isSpecialFromEnabledAssessments, classType],
  );
  const theoryEnabled = useMemo(
    () => ({
      ssa1: !isSpecialCourse || enabledSet.has('ssa1'),
      ssa2: !isSpecialCourse || enabledSet.has('ssa2'),
      formative1: !isSpecialCourse || enabledSet.has('formative1'),
      formative2: !isSpecialCourse || enabledSet.has('formative2'),
      cia1: !isSpecialCourse || enabledSet.has('cia1'),
      cia2: !isSpecialCourse || enabledSet.has('cia2'),
      model: !isSpecialCourse || enabledSet.has('model'),
    }),
    [isSpecialCourse, enabledSet],
  );
  // SPECIAL courses use the enabled-assessments selection flow; never call lab-only endpoints for them.
  const isLabCourse = useMemo(
    () => isLabClassType(classType) && !isSpecialFromEnabledAssessments,
    [classType, isSpecialFromEnabledAssessments],
  );
  const isTcplCourse = useMemo(() => normalizeClassType(classType) === 'TCPL', [classType]);

  const showModelCo5 = useMemo(() => {
    const ct = normalizeClassType(classType);
    return (ct === 'THEORY' || ct === 'TCPL' || ct === 'TCPR') && Boolean(theoryEnabled.model);
  }, [classType, theoryEnabled.model]);
  
  // Determine maximum CO number and active COs based on class type
  const maxCONumber = useMemo(() => {
    const enabled = Object.entries(theoryEnabled)
      .filter(([_, v]) => v)
      .map(([k]) => k);
    return getMaxCONumber(classType, isLabCourse, enabled);
  }, [classType, isLabCourse, theoryEnabled]);
  
  const activeCONumbers = useMemo(() => getActiveCONumbers(maxCONumber), [maxCONumber]);

  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [taError, setTaError] = useState<string | null>(null);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);

  useEffect(() => {
    if (!courseId || selectedTaId == null || !modelEnabled) {
      setModelLock(null);
      setModelLockError(null);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const lock = await fetchMarkTableLockStatus('model', String(courseId), Number(selectedTaId));
        if (!mounted) return;
        setModelLock(lock);
        setModelLockError(null);
      } catch (e: any) {
        if (!mounted) return;
        setModelLock(null);
        setModelLockError(e?.message || 'Failed to fetch MODEL publish status');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [courseId, selectedTaId, modelEnabled]);

  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  const [loadingPublished, setLoadingPublished] = useState(false);
  const [publishedError, setPublishedError] = useState<string | null>(null);
  const [published, setPublished] = useState<{
    ssa1: Record<string, string | null>;
    ssa2: Record<string, string | null>;
    f1: Record<string, any>;
    f2: Record<string, any>;
    cia1: any | null;
    cia2: any | null;
  }>({
    ssa1: {},
    ssa2: {},
    f1: {},
    f2: {},
    cia1: null,
    cia2: null,
  });
  const [publishedFetchErrors, setPublishedFetchErrors] = useState<Record<string, string | null>>({});

  const [publishedLab, setPublishedLab] = useState<{ cia1: any | null; cia2: any | null; model: any | null }>({
    cia1: null,
    cia2: null,
    model: null,
  });

  // TCPL: LAB1/LAB2 are stored as lab-style sheets under formative1/formative2.
  const [publishedTcplLab, setPublishedTcplLab] = useState<{ lab1: any | null; lab2: any | null }>({
    lab1: null,
    lab2: null,
  });

  const [weights, setWeights] = useState(() => getCycleOneWeightsFromInternal(initialClassType ?? null, null));
  const [weightsSource, setWeightsSource] = useState<'default' | 'local' | 'server'>('default');
  const [lastWeightsDebug, setLastWeightsDebug] = useState<string | null>(null);

  const [theoryCo5Weightage, setTheoryCo5Weightage] = useState<number>(DEFAULT_THEORY_CO5_WEIGHTAGE);

  const modelPublished = Boolean(modelEnabled && modelLock && (modelLock as any).is_published);

  // When class type changes, reset CO5 weightage to the default for THEORY.
  useEffect(() => {
    if (!showModelCo5) return;
    // Once MODEL is published, CO5 max becomes fixed at 30.
    setTheoryCo5Weightage(modelPublished ? 30 : DEFAULT_THEORY_CO5_WEIGHTAGE);
  }, [showModelCo5, modelPublished]);
  const [hideCOColumns, setHideCOColumns] = useState(false);
  const [cqiEntries, setCqiEntries] = useState<Record<number, string>>({});
  useEffect(() => {
    let mounted = true;
    (async () => {
      const ct = classType;
      if (!ct) {
        const fallback = getCycleOneWeightsFromInternal(null, null);
        if (!mounted) return;
        setWeights(fallback);
        setWeightsSource('default');
        setLastWeightsDebug('Applied defaults (class type not detected).');
        return;
      }

      setLastWeightsDebug('Loading Internal Mark Weightage mapping…');

      try {
        const remote = await fetchClassTypeWeights();
        if (!mounted) return;
        const key = normalizeClassType(ct);
        const item = remote?.[key];
        if (item && typeof item === 'object') {
          setWeights(getCycleOneWeightsFromInternal(ct, item as any));
          setWeightsSource('server');
          setLastWeightsDebug(`Derived from Internal Mark Weightage (server) for ${key}.`);
          return;
        }
      } catch {
        // continue to local fallback
      }

      try {
        const local = lsGet<any>('iqac_class_type_weights');
        if (!mounted) return;
        const key = normalizeClassType(ct);
        const item = local?.[key];
        if (item && typeof item === 'object') {
          setWeights(getCycleOneWeightsFromInternal(ct, item as any));
          setWeightsSource('local');
          setLastWeightsDebug(`Derived from Internal Mark Weightage (local) for ${key}.`);
          return;
        }
      } catch {
        // continue to default fallback
      }

      if (!mounted) return;
      setWeights(getCycleOneWeightsFromInternal(ct, null));
      setWeightsSource('default');
      setLastWeightsDebug(`Applied default internal-mark mapping for ${normalizeClassType(ct)}.`);
    })();
    return () => { mounted = false; };
  }, [classType, selectedTaId]);

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
  }, [courseId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await fetchMyTeachingAssignments();
        if (!mounted) return;
        let filtered = (all || []).filter((a) => a.subject_code === courseId);
        
        // If user doesn't have a TA for this subject, try to fetch from server
        if (filtered.length === 0) {
          try {
            const taListRes = await fetchWithAuth(`/api/academics/teaching-assignments/?subject_code=${encodeURIComponent(String(courseId || ''))}`);
            if (taListRes.ok) {
              const taListJson = await taListRes.json();
              const items = Array.isArray(taListJson.results) ? taListJson.results : Array.isArray(taListJson) ? taListJson : (taListJson.items || []);
              filtered = items || [];
            }
          } catch (err) {
            console.warn('Server TA list fetch failed:', err);
          }
        }
        
        setTas(filtered);
        setTaError(null);

        const stored = lsGet<number>(`coAttainment_selectedTa_${courseId}`);
        const initial =
          (typeof stored === 'number' && filtered.some((f) => f.id === stored) && stored) ||
          (filtered[0]?.id ?? null);
        setSelectedTaId(initial);
      } catch (e: any) {
        if (!mounted) return;
        setTas([]);
        setSelectedTaId(null);
        setTaError(e?.message || 'Failed to load teaching assignments');
      }
    })();
    return () => { mounted = false; };
  }, [courseId]);

  useEffect(() => {
    if (!courseId || selectedTaId == null) return;
    lsSet(`coAttainment_selectedTa_${courseId}`, selectedTaId);
  }, [courseId, selectedTaId]);

  useEffect(() => {
    // If parent provided a classType, use that and skip fetching
    if (initialClassType) {
      setClassType(initialClassType);
      return;
    }
    
    let mounted = true;
    (async () => {
      try {
        const ta = (tas || []).find((t) => t.id === selectedTaId) || null;

        // Prefer class_type directly from teaching assignment payload (works even when
        // the user cannot access curriculum department rows for another department).
        const taClassType = (ta as any)?.class_type ?? null;
        if (taClassType) {
          if (!mounted) return;
          setClassType(taClassType);
          return;
        }
        
        // Check if this is an elective TA first
        const electiveSubjectId = (ta as any)?.elective_subject_id;
        if (electiveSubjectId && !(ta as any)?.section_id) {
          console.log('[COAttainment] Detected elective TA, fetching elective subject details for:', electiveSubjectId);
          try {
            const electiveRes = await fetchWithAuth(`/api/curriculum/elective-subjects/${electiveSubjectId}/`);
            if (electiveRes.ok) {
              const electiveData = await electiveRes.json();
              const electiveClassType = electiveData?.class_type;
              console.log('[COAttainment] Elective subject class_type:', electiveClassType);
              
              if (electiveClassType) {
                if (!mounted) return;
                setClassType(electiveClassType);
                return;
              }
            } else {
              console.warn('[COAttainment] Elective subject API returned error:', electiveRes.status);
            }
          } catch (err) {
            console.warn('[COAttainment] Failed to fetch elective subject:', err);
          }
        }
        
        const curriculumRowId = (ta as any)?.curriculum_row_id;
        if (!curriculumRowId) {
          // fallback: search dept rows / masters for this course code and pick its class_type
          try {
            const courseCodeNorm = String(courseId).trim().toUpperCase();

            const rows = await fetchDeptRows();
            if (!mounted) return;
            const matchDept = (rows || []).find((r: any) => String(r.course_code || '').trim().toUpperCase() === courseCodeNorm);
            const deptClassType = (matchDept as any)?.class_type ?? null;
            if (deptClassType) {
              setClassType(deptClassType);
              return;
            }

            const masters = await fetchMasters();
            if (!mounted) return;
            const matchMaster = (masters || []).find((m: any) => String(m.course_code || '').trim().toUpperCase() === courseCodeNorm);
            setClassType((matchMaster as any)?.class_type ?? null);
            return;
          } catch {
            if (mounted) setClassType(null);
            return;
          }
        }
        const row = await fetchDeptRow(Number(curriculumRowId));
        if (!mounted) return;
        const deptClassType = (row as any)?.class_type ?? null;
        if (deptClassType) {
          setClassType(deptClassType);
          return;
        }

        try {
          const courseCodeNorm = String(courseId).trim().toUpperCase();
          const masters = await fetchMasters();
          if (!mounted) return;
          const matchMaster = (masters || []).find((m: any) => String(m.course_code || '').trim().toUpperCase() === courseCodeNorm);
          setClassType((matchMaster as any)?.class_type ?? null);
        } catch {
          setClassType(null);
        }
      } catch {
        if (mounted) setClassType(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tas, selectedTaId, initialClassType]);

  useEffect(() => {
    let mounted = true;
    const loadRoster = async () => {
      if (!selectedTaId) return;
      setLoadingRoster(true);
      setRosterError(null);
      try {
        // Always use TA roster (backend handles batch filtering for electives)
        const resp = await fetchTeachingAssignmentRoster(selectedTaId);
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
        setStudents([]);
        setRosterError(e?.message || 'Failed to load roster');
      } finally {
        if (mounted) setLoadingRoster(false);
      }
    };

    loadRoster();
    return () => { mounted = false; };
  }, [selectedTaId, tas]);

  const cia1Questions = useMemo<QuestionDef[]>(() => {
    const qs = masterCfg?.assessments?.cia1?.questions;
    if (Array.isArray(qs) && qs.length) {
      return qs
        .map((q: any) => ({
          key: String(q?.key || ''),
          label: String(q?.label || q?.key || ''),
          max: Number(q?.max || 0),
          co: parseCo(q?.co),
          btl: Math.min(6, Math.max(1, Number(q?.btl || 1))) as 1 | 2 | 3 | 4 | 5 | 6,
        }))
        .filter((q: any) => q.key);
    }
    return DEFAULT_CIA1_QUESTIONS;
  }, [masterCfg]);

  const cia2Questions = useMemo<QuestionDef34[]>(() => {
    const qs = masterCfg?.assessments?.cia2?.questions;
    if (Array.isArray(qs) && qs.length) {
      return qs
        .map((q: any) => ({
          key: String(q?.key || ''),
          label: String(q?.label || q?.key || ''),
          max: Number(q?.max || 0),
          co: parseCo34(q?.co),
          btl: Math.min(6, Math.max(1, Number(q?.btl || 1))) as 1 | 2 | 3 | 4 | 5 | 6,
        }))
        .filter((q: any) => q.key);
    }
    return DEFAULT_CIA2_QUESTIONS;
  }, [masterCfg]);

  const cia1CoMax = useMemo(() => {
    let co1 = 0;
    let co2 = 0;
    const qs = cia1Questions || [];
    qs.forEach((q, idx) => {
      const w = effectiveCoWeightsForQuestion(qs as any, idx);
      co1 += (Number(q.max) || 0) * w.co1;
      co2 += (Number(q.max) || 0) * w.co2;
    });
    return { co1, co2 };
  }, [cia1Questions]);

  const cia2CoMax = useMemo(() => {
    let co3 = 0;
    let co4 = 0;
    const qs = cia2Questions || [];
    qs.forEach((q, idx) => {
      const w = effectiveCoWeightsForQuestion34(qs as any, idx);
      co3 += (Number(q.max) || 0) * w.co3;
      co4 += (Number(q.max) || 0) * w.co4;
    });
    return { co3, co4 };
  }, [cia2Questions]);

  const maxes = useMemo(() => {
    const ssa1Cfg = masterCfg?.assessments?.ssa1 || {};
    const ssa2Cfg = masterCfg?.assessments?.ssa2 || {};
    const f1Cfg = masterCfg?.assessments?.formative1 || {};
    const f2Cfg = masterCfg?.assessments?.formative2 || {};
    const cia1Cfg = masterCfg?.assessments?.cia1 || {};
    const cia2Cfg = masterCfg?.assessments?.cia2 || {};

    const ssa1Co1 = Number(ssa1Cfg?.coMax?.co1);
    const ssa1Co2 = Number(ssa1Cfg?.coMax?.co2);
    const ssa2Co3 = Number(ssa2Cfg?.coMax?.co3 ?? ssa2Cfg?.coMax?.co1);
    const ssa2Co4 = Number(ssa2Cfg?.coMax?.co4 ?? ssa2Cfg?.coMax?.co2);

    const cia1Co1 = Number(cia1Cfg?.coMax?.co1);
    const cia1Co2 = Number(cia1Cfg?.coMax?.co2);
    const cia2Co3 = Number(cia2Cfg?.coMax?.co3 ?? cia2Cfg?.coMax?.co1);
    const cia2Co4 = Number(cia2Cfg?.coMax?.co4 ?? cia2Cfg?.coMax?.co2);

    const f1Co = Number(f1Cfg?.maxCo);
    const f2Co = Number(f2Cfg?.maxCo);

    return {
      ssa1: {
        co1: Number.isFinite(ssa1Co1) ? Math.max(0, ssa1Co1) : 10,
        co2: Number.isFinite(ssa1Co2) ? Math.max(0, ssa1Co2) : 10,
      },
      ssa2: {
        co3: Number.isFinite(ssa2Co3) ? Math.max(0, ssa2Co3) : 10,
        co4: Number.isFinite(ssa2Co4) ? Math.max(0, ssa2Co4) : 10,
      },
      cia1: {
        co1: Number.isFinite(cia1Co1) ? Math.max(0, cia1Co1) : cia1CoMax.co1,
        co2: Number.isFinite(cia1Co2) ? Math.max(0, cia1Co2) : cia1CoMax.co2,
      },
      cia2: {
        co3: Number.isFinite(cia2Co3) ? Math.max(0, cia2Co3) : cia2CoMax.co3,
        co4: Number.isFinite(cia2Co4) ? Math.max(0, cia2Co4) : cia2CoMax.co4,
      },
      f1: {
        co1: Number.isFinite(f1Co) ? Math.max(0, f1Co) : 10,
        co2: Number.isFinite(f1Co) ? Math.max(0, f1Co) : 10,
      },
      f2: {
        co3: Number.isFinite(f2Co) ? Math.max(0, f2Co) : 10,
        co4: Number.isFinite(f2Co) ? Math.max(0, f2Co) : 10,
      },
    };
  }, [masterCfg, cia1CoMax, cia2CoMax]);

  const labCoMaxes = useMemo(() => {
    if (!isLabCourse) return null;

    const co1 = LAB_CO_MAX_OVERRIDE.co1;
    const co2 = LAB_CO_MAX_OVERRIDE.co2;
    const co3 = LAB_CO_MAX_OVERRIDE.co3;
    const co4 = LAB_CO_MAX_OVERRIDE.co4;
    const co5 = LAB_CO_MAX_OVERRIDE.co5;
    return {
      co1,
      co2,
      co3,
      co4,
      co5,
      total: round1(co1 + co2 + co3 + co4 + co5),
    };
  }, [isLabCourse]);

  const loadPublished = async () => {
    setLoadingPublished(true);
    setPublishedError(null);
    const taId = typeof selectedTaId === 'number' ? selectedTaId : undefined;
    try {
      // reset per-assessment errors
      setPublishedFetchErrors({});

      // Default-reset TCPL lab snapshots each load.
      setPublishedTcplLab({ lab1: null, lab2: null });

      // LAB sheets (fetch individually to capture errors) — only for lab courses.
      if (isLabCourse) {
        let cia1Res: any = null;
        let cia2Res: any = null;
        let modelRes: any = null;
        try {
          cia1Res = await fetchPublishedLabSheet('cia1', courseId, taId);
        } catch (e: any) {
          setPublishedFetchErrors((p) => ({ ...p, lab_cia1: String(e?.message || e) }));
        }
        try {
          cia2Res = await fetchPublishedLabSheet('cia2', courseId, taId);
        } catch (e: any) {
          setPublishedFetchErrors((p) => ({ ...p, lab_cia2: String(e?.message || e) }));
        }
        try {
          modelRes = await fetchPublishedModelSheet(courseId, taId);
        } catch (e: any) {
          setPublishedFetchErrors((p) => ({ ...p, lab_model: String(e?.message || e) }));
        }

        setPublishedLab({
          cia1: (cia1Res as any)?.data ?? null,
          cia2: (cia2Res as any)?.data ?? null,
          model: (modelRes as any)?.data ?? null,
        });

        // fallback to draft for lab sheets if published data missing
        try {
          if (!((cia1Res as any)?.data)) {
            try {
              const d = await fetchDraft('cia1', courseId, taId);
              if (d && d.draft) setPublishedLab((p) => ({ ...p, cia1: (d.draft as any).data ?? d.draft }));
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, lab_cia1_draft: String(e?.message || e) }));
            }
          }
          if (!((cia2Res as any)?.data)) {
            try {
              const d = await fetchDraft('cia2', courseId, taId);
              if (d && d.draft) setPublishedLab((p) => ({ ...p, cia2: (d.draft as any).data ?? d.draft }));
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, lab_cia2_draft: String(e?.message || e) }));
            }
          }
          if (!((modelRes as any)?.data)) {
            try {
              const d = await fetchDraft('model', courseId, taId);
              if (d && d.draft) setPublishedLab((p) => ({ ...p, model: (d.draft as any).data ?? d.draft }));
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, lab_model_draft: String(e?.message || e) }));
            }
          }
        } catch {
          // ignore
        }
      }

      if (!isLabCourse) {
        const isTcpl = normalizeClassType(classType) === 'TCPL';

        // theory sheets: fetch individually to capture per-assessment errors
        let ssa1Res: any = null;
        let ssa2Res: any = null;
        let f1Res: any = null;
        let f2Res: any = null;
        let tcplLab1Res: any = null;
        let tcplLab2Res: any = null;
        let cia1Res: any = null;
        let cia2Res: any = null;

        if (theoryEnabled.ssa1) {
          try {
            ssa1Res = await fetchPublishedSsa1(courseId, taId);
          } catch (e: any) {
            setPublishedFetchErrors((p) => ({ ...p, ssa1: String(e?.message || e) }));
          }
        }
        if (theoryEnabled.ssa2) {
          try {
            ssa2Res = await fetchPublishedSsa2(courseId, taId);
          } catch (e: any) {
            setPublishedFetchErrors((p) => ({ ...p, ssa2: String(e?.message || e) }));
          }
        }
        if (theoryEnabled.formative1) {
          if (isTcpl) {
            try {
              tcplLab1Res = await fetchPublishedLabSheet('formative1', courseId, taId);
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, tcpl_lab1: String(e?.message || e) }));
            }
          } else {
            try {
              f1Res = await fetchPublishedFormative1(courseId, taId);
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, formative1: String(e?.message || e) }));
            }
          }
        }
        if (theoryEnabled.formative2) {
          if (isTcpl) {
            try {
              tcplLab2Res = await fetchPublishedLabSheet('formative2', courseId, taId);
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, tcpl_lab2: String(e?.message || e) }));
            }
          } else {
            try {
              f2Res = await fetchPublishedFormative('formative2', courseId, taId);
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, formative2: String(e?.message || e) }));
            }
          }
        }
        if (theoryEnabled.cia1) {
          try {
            cia1Res = await fetchPublishedCia1Sheet(courseId, taId);
          } catch (e: any) {
            setPublishedFetchErrors((p) => ({ ...p, cia1: String(e?.message || e) }));
          }
        }
        if (theoryEnabled.cia2) {
          try {
            cia2Res = await fetchPublishedCiaSheet('cia2', courseId, taId);
          } catch (e: any) {
            setPublishedFetchErrors((p) => ({ ...p, cia2: String(e?.message || e) }));
          }
        }

        // If published records are missing, try to fall back to saved drafts so that
        // marks entered but not published still appear in CO attainment view.
        try {
          if (theoryEnabled.ssa1 && (!(ssa1Res as any) || !((ssa1Res as any).marks && Object.keys((ssa1Res as any).marks || {}).length))) {
            try {
              const d = await fetchDraft('ssa1', courseId, taId);
              if (d && d.draft && (d.draft as any).marks) ssa1Res = { marks: (d.draft as any).marks };
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, ssa1_draft: String(e?.message || e) }));
            }
          }

          if (theoryEnabled.ssa2 && (!(ssa2Res as any) || !((ssa2Res as any).marks && Object.keys((ssa2Res as any).marks || {}).length))) {
            try {
              const d = await fetchDraft('ssa2', courseId, taId);
              if (d && d.draft && (d.draft as any).marks) ssa2Res = { marks: (d.draft as any).marks };
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, ssa2_draft: String(e?.message || e) }));
            }
          }

          if (theoryEnabled.formative1) {
            if (isTcpl) {
              if (!((tcplLab1Res as any)?.data)) {
                try {
                  const d = await fetchDraft('formative1', courseId, taId);
                  if (d && d.draft) tcplLab1Res = { data: (d.draft as any).data ?? (d.draft as any) };
                } catch (e: any) {
                  setPublishedFetchErrors((p) => ({ ...p, tcpl_lab1_draft: String(e?.message || e) }));
                }
              }
            } else {
              if (!(f1Res as any) || !((f1Res as any).marks && Object.keys((f1Res as any).marks || {}).length)) {
                try {
                  const d = await fetchDraft('formative1', courseId, taId);
                  if (d && d.draft && (d.draft as any).marks) f1Res = { marks: (d.draft as any).marks };
                } catch (e: any) {
                  setPublishedFetchErrors((p) => ({ ...p, formative1_draft: String(e?.message || e) }));
                }
              }
            }
          }

          if (theoryEnabled.formative2) {
            if (isTcpl) {
              if (!((tcplLab2Res as any)?.data)) {
                try {
                  const d = await fetchDraft('formative2', courseId, taId);
                  if (d && d.draft) tcplLab2Res = { data: (d.draft as any).data ?? (d.draft as any) };
                } catch (e: any) {
                  setPublishedFetchErrors((p) => ({ ...p, tcpl_lab2_draft: String(e?.message || e) }));
                }
              }
            } else {
              if (!(f2Res as any) || !((f2Res as any).marks && Object.keys((f2Res as any).marks || {}).length)) {
                try {
                  const d = await fetchDraft('formative2', courseId, taId);
                  if (d && d.draft && (d.draft as any).marks) f2Res = { marks: (d.draft as any).marks };
                } catch (e: any) {
                  setPublishedFetchErrors((p) => ({ ...p, formative2_draft: String(e?.message || e) }));
                }
              }
            }
          }

          if (theoryEnabled.cia1 && (!(cia1Res as any) || !((cia1Res as any).data))) {
            try {
              const d = await fetchDraft('cia1', courseId, taId);
              if (d && d.draft) cia1Res = { data: (d.draft as any).data ?? (d.draft as any) };
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, cia1_draft: String(e?.message || e) }));
            }
          }

          if (theoryEnabled.cia2 && (!(cia2Res as any) || !((cia2Res as any).data))) {
            try {
              const d = await fetchDraft('cia2', courseId, taId);
              if (d && d.draft) cia2Res = { data: (d.draft as any).data ?? (d.draft as any) };
            } catch (e: any) {
              setPublishedFetchErrors((p) => ({ ...p, cia2_draft: String(e?.message || e) }));
            }
          }
        } catch {
          // ignore
        }

        if (isTcpl) {
          setPublishedTcplLab({
            lab1: (tcplLab1Res as any)?.data ?? null,
            lab2: (tcplLab2Res as any)?.data ?? null,
          });
        }

        setPublished({
          ssa1: (ssa1Res as any)?.marks && typeof (ssa1Res as any).marks === 'object' ? (ssa1Res as any).marks : {},
          ssa2: (ssa2Res as any)?.marks && typeof (ssa2Res as any).marks === 'object' ? (ssa2Res as any).marks : {},
          // TCPL uses lab-style formative sheets, not the skill/att formative API.
          f1: !isTcpl && (f1Res as any)?.marks && typeof (f1Res as any).marks === 'object' ? (f1Res as any).marks : {},
          f2: !isTcpl && (f2Res as any)?.marks && typeof (f2Res as any).marks === 'object' ? (f2Res as any).marks : {},
          cia1: (cia1Res as any)?.data ?? null,
          cia2: (cia2Res as any)?.data ?? null,
        });
      } else {
        setPublished({ ssa1: {}, ssa2: {}, f1: {}, f2: {}, cia1: null, cia2: null });
      }
    } catch (e: any) {
      setPublished({ ssa1: {}, ssa2: {}, f1: {}, f2: {}, cia1: null, cia2: null });
      setPublishedLab({ cia1: null, cia2: null, model: null });
      setPublishedTcplLab({ lab1: null, lab2: null });
      setPublishedError(e?.message || 'Failed to load published marks');
    } finally {
      setLoadingPublished(false);
    }
  };

  useEffect(() => {
    if (!courseId) return;
    loadPublished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, selectedTaId, isLabCourse, theoryEnabled, classType]);

  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as any)?.detail || {};
        const subjectId = detail.subjectId;
        const assessment = detail.assessment;
        if (!subjectId || String(subjectId) !== String(courseId)) return;
        // Only reload when the published assessment is relevant to this page
        // (SSA1, Formative1, CIA1). If assessment is absent, fall back to reload.
        if (assessment && !['ssa1', 'formative1', 'cia1'].includes(String(assessment))) return;
        loadPublished();
      } catch {
        // ignore
      }
    };
    window.addEventListener('obe:published', handler as any);
    return () => window.removeEventListener('obe:published', handler as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const byStudentId = useMemo(() => {
    const out = new Map<number, any>();

    if (isLabCourse) {
      const HALF = DEFAULT_LAB_CIA_EXAM_MAX / 2;

      const readCoPair = (snapshot: any | null, coA: number, coB: number | null) => {
        const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object' ? snapshot.sheet : {};
        const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object' ? sheet.rowsByStudentId : {};
        const legacyExpCountA = clamp(Number(sheet?.expCountA ?? 0), 0, 12);
        const legacyExpCountB = clamp(Number(sheet?.expCountB ?? 0), 0, 12);
        const legacyCoAEnabled = Boolean(sheet?.coAEnabled);
        const legacyCoBEnabled = Boolean(sheet?.coBEnabled);
        const ciaEnabled = Boolean((sheet as any)?.ciaExamEnabled);

        const cfgs = sheet?.coConfigs && typeof sheet.coConfigs === 'object' ? (sheet.coConfigs as any) : null;
        const cfgA = cfgs ? cfgs[String(coA)] : null;
        const cfgB = coB != null && cfgs ? cfgs[String(coB)] : null;

        const coAEnabled = cfgA ? Boolean(cfgA.enabled) : legacyCoAEnabled;
        const coBEnabled = coB != null ? (cfgB ? Boolean(cfgB.enabled) : legacyCoBEnabled) : false;

        const expCountA = cfgA ? clamp(Number(cfgA.expCount ?? 0), 0, 12) : legacyExpCountA;
        const expCountB = coB != null ? (cfgB ? clamp(Number(cfgB.expCount ?? 0), 0, 12) : legacyExpCountB) : 0;

        const expMaxA = cfgA && Number.isFinite(Number(cfgA.expMax)) ? Number(cfgA.expMax) : Number.isFinite(Number((sheet as any)?.expMaxA)) ? Number((sheet as any).expMaxA) : 25;
        const expMaxB = coB != null ? (cfgB && Number.isFinite(Number(cfgB.expMax)) ? Number(cfgB.expMax) : Number.isFinite(Number((sheet as any)?.expMaxB)) ? Number((sheet as any).expMaxB) : 25) : 0;

        const CO_MAX_A = expMaxA + (ciaEnabled ? HALF : 0);
        const CO_MAX_B = coB != null ? expMaxB + (ciaEnabled ? HALF : 0) : 0;

        const get = (sid: number) => {
          const row = rowsByStudentId[String(sid)] || {};
          const marksByCo = (row as any)?.marksByCo && typeof (row as any).marksByCo === 'object' ? (row as any).marksByCo : {};

          const rawA = marksByCo?.[String(coA)] ?? (row as any).marksA;
          const rawB = coB != null ? (marksByCo?.[String(coB)] ?? (row as any).marksB) : [];

          const marksA = normalizeMarksArray(rawA, expCountA).slice(0, coAEnabled ? expCountA : 0);
          const marksB = normalizeMarksArray(rawB, expCountB).slice(0, coBEnabled ? expCountB : 0);
          const avgA = avgMarks(marksA);
          const avgB = avgMarks(marksB);

          const ciaExamRaw = (row as any)?.ciaExam;
          const ciaExamNum = typeof ciaExamRaw === 'number' && Number.isFinite(ciaExamRaw) ? ciaExamRaw : null;
          const hasAny = avgA != null || avgB != null || ciaExamNum != null;

          const a = !hasAny ? null : (avgA ?? 0) + (ciaEnabled ? (ciaExamNum ?? 0) / 2 : 0);
          const b = !hasAny ? null : (avgB ?? 0) + (ciaEnabled ? (ciaExamNum ?? 0) / 2 : 0);

          return {
            a: a == null ? null : clamp(a, 0, CO_MAX_A),
            b: b == null ? null : clamp(b, 0, CO_MAX_B),
          };
        };

        return { get, coA, coB, CO_MAX_A, CO_MAX_B, expMaxA, expMaxB, expCountA, expCountB };
      };

      const c1 = readCoPair(publishedLab.cia1, 1, 2);
      const c2 = readCoPair(publishedLab.cia2, 3, 4);
      const m5 = readCoPair(publishedLab.model, 5, null);

      for (const s of students) {
        const r1 = c1.get(s.id);
        const r2 = c2.get(s.id);
        const r5 = m5.get(s.id);
        out.set(s.id, {
          co1: r1.a,
          co2: r1.b,
          co3: r2.a,
          co4: r2.b,
          co5: r5.a,
          coMax1: c1.CO_MAX_A,
          coMax2: c1.CO_MAX_B,
          coMax3: c2.CO_MAX_A,
          coMax4: c2.CO_MAX_B,
          coMax5: m5.CO_MAX_A,
        });
      }

      return out;
    }

    // THEORY/TCPR path
    // SSA1/SSA2 marks are read directly from `published.ssa1` and `published.ssa2` objects below

    const isTcpl = normalizeClassType(classType) === 'TCPL';

    const readTcplLabPair = (snapshot: any | null) => {
      const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object'
        ? snapshot.sheet
        : (snapshot && typeof snapshot === 'object' ? snapshot : {});
      const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object'
        ? sheet.rowsByStudentId
        : {};
      const cfgs = sheet?.coConfigs && typeof sheet.coConfigs === 'object' ? (sheet.coConfigs as any) : null;
      const cfg1 = cfgs ? cfgs['1'] : null;
      const cfg2 = cfgs ? cfgs['2'] : null;

      const legacyExpCountA = clamp(Number(sheet?.expCountA ?? 0), 0, 12);
      const legacyExpCountB = clamp(Number(sheet?.expCountB ?? 0), 0, 12);
      const expCountA = cfg1 ? clamp(Number(cfg1.expCount ?? 0), 0, 12) : legacyExpCountA;
      const expCountB = cfg2 ? clamp(Number(cfg2.expCount ?? 0), 0, 12) : legacyExpCountB;

      const expMaxA = cfg1 && Number.isFinite(Number(cfg1.expMax)) ? Number(cfg1.expMax)
        : Number.isFinite(Number(sheet?.expMaxA)) ? Number(sheet.expMaxA) : 25;
      const expMaxB = cfg2 && Number.isFinite(Number(cfg2.expMax)) ? Number(cfg2.expMax)
        : Number.isFinite(Number(sheet?.expMaxB)) ? Number(sheet.expMaxB) : 25;
      const ciaEnabled = (sheet as any)?.ciaExamEnabled !== false;
      const HALF = DEFAULT_LAB_CIA_EXAM_MAX / 2;
      const CO_MAX_A = expMaxA + (ciaEnabled ? HALF : 0);
      const CO_MAX_B = expMaxB + (ciaEnabled ? HALF : 0);

      const get = (sid: number) => {
        const row = rowsByStudentId[String(sid)] || {};
        const marksByCo = (row as any)?.marksByCo && typeof (row as any)?.marksByCo === 'object'
          ? (row as any).marksByCo
          : {};
        const rawA = marksByCo?.['1'] ?? (row as any)?.marksA;
        const rawB = marksByCo?.['2'] ?? (row as any)?.marksB;
        const marksA = normalizeMarksArray(rawA, expCountA);
        const marksB = normalizeMarksArray(rawB, expCountB);
        const avgA = avgMarks(marksA);
        const avgB = avgMarks(marksB);
        const ciaExamRaw = (row as any)?.ciaExam;
        const ciaExamNum = toNumOrNull(ciaExamRaw);
        const hasAny = avgA != null || avgB != null || ciaExamNum != null;

        const a = !hasAny ? null : (avgA ?? 0) + (ciaEnabled ? (ciaExamNum ?? 0) / 2 : 0);
        const b = !hasAny ? null : (avgB ?? 0) + (ciaEnabled ? (ciaExamNum ?? 0) / 2 : 0);

        return {
          a: a == null ? null : clamp(a, 0, CO_MAX_A),
          b: b == null ? null : clamp(b, 0, CO_MAX_B),
        };
      };

      return { get, CO_MAX_A, CO_MAX_B };
    };

    const tcplLab1 = isTcpl ? readTcplLabPair(publishedTcplLab.lab1) : null;
    const tcplLab2 = isTcpl ? readTcplLabPair(publishedTcplLab.lab2) : null;

    // MODEL sheets are stored locally by ModelEntry.tsx.
    // - THEORY: model_theory_sheet_{courseId}_{taKey}
    // - TCPL:  model_tcpl_sheet_{courseId}_{taKey}
    // - TCPR:  model_tcpr_sheet_{courseId}_{taKey}
    // Legacy:  model_sheet_{courseId}
    const modelSheet = (() => {
      if (!showModelCo5 && !isSpecialCourse) return null;
      const taKey = String(selectedTaId ?? 'none');
      const ct = normalizeClassType(classType);

      const candidates: string[] = [];
      if (ct === 'THEORY') {
        candidates.push(`model_theory_sheet_${courseId}_${taKey}`);
        candidates.push(`model_theory_sheet_${courseId}_none`);
      } else if (ct === 'TCPL') {
        candidates.push(`model_tcpl_sheet_${courseId}_${taKey}`);
        candidates.push(`model_tcpl_sheet_${courseId}_none`);
      } else if (ct === 'TCPR') {
        candidates.push(`model_tcpr_sheet_${courseId}_${taKey}`);
        candidates.push(`model_tcpr_sheet_${courseId}_none`);
      } else if (ct === 'SPECIAL') {
        candidates.push(`model_theory_sheet_${courseId}_${taKey}`);
        candidates.push(`model_theory_sheet_${courseId}_none`);
      }

      candidates.push(`model_sheet_${courseId}`);

      for (const k of candidates) {
        const v = lsGet<any>(k);
        if (v && typeof v === 'object') return v;
      }
      return null;
    })();

    const getModelCo5 = (s: Student): { mark: number | null; max: number } => {
      const ct = normalizeClassType(classType);
      const sheetState = modelSheet && typeof modelSheet === 'object' ? modelSheet : null;

      // Default max values if we can't load the sheet.
      const defaultTheoryMax = MODEL_THEORY_CO5_MAX;
      const defaultTcplMax = 0;
      const maxFallback = ct === 'THEORY' ? defaultTheoryMax : defaultTcplMax;
      if (!showModelCo5) return { mark: null, max: maxFallback };
      if (!sheetState) return { mark: null, max: maxFallback };

      let max = maxFallback;

      const rowKeyById = `id:${String(s.id)}`;
      const rowKeyByReg = s.reg_no ? `reg:${String(s.reg_no).trim()}` : '';
      const row = (sheetState as any)[rowKeyById] || (rowKeyByReg ? (sheetState as any)[rowKeyByReg] : null) || null;
      if (!row || typeof row !== 'object') return { mark: null, max };

      const absent = Boolean((row as any).absent);
      const absentKind = String((row as any).absentKind || 'AL').toUpperCase();
      const q = (row as any).q && typeof (row as any).q === 'object' ? (row as any).q : {};

      let hasAny = false;
      let co5 = 0;
      max = 0;

      if (ct === 'THEORY') {
        max = MODEL_THEORY_CO5_MAX;
        for (let i = 0; i < MODEL_THEORY_QUESTIONS.length; i++) {
          const def = MODEL_THEORY_QUESTIONS[i];
          const raw = (q as any)[def.key];
          const n = toNumOrNull(raw);
          if (n == null) continue;
          hasAny = true;
          const mark = clamp(n, 0, def.max);
          if (MODEL_THEORY_CO_ROW[i] === 5) co5 += mark;
        }
      } else if (ct === 'TCPL' || ct === 'TCPR') {
        // Mirror ModelEntry.tsx defaults so CO5 exists for TCPL/TCPR.
        const isTcpr = ct === 'TCPR';
        const count = isTcpr ? 12 : 15;
        const twoMarkCount = isTcpr ? 8 : 10;
        const baseCos = isTcpr
          ? [1, 1, 2, 2, 3, 3, 4, 4, 1, 2, 3, 4]
          : [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5];

        for (let i = 0; i < count; i++) {
          const idx = i + 1;
          const key = `q${idx}`;
          const qMax = idx <= twoMarkCount ? 2 : 16;
          const coNum = baseCos[i] ?? 1;
          if (coNum === 5) max += qMax;

          const raw = (q as any)[key];
          const n = toNumOrNull(raw);
          if (n == null) continue;
          hasAny = true;
          const mark = clamp(n, 0, qMax);
          if (coNum === 5) co5 += mark;
        }

        const labRaw = toNumOrNull((row as any).lab);
        if (labRaw != null) hasAny = true;
        const labMark = labRaw == null ? null : clamp(labRaw, 0, 30);
        if (isTcpr) {
          // TCPR: REVIEW contributes only to CO5.
          max += 30;
          if (labMark != null) co5 += labMark;
        } else {
          // TCPL: LAB is split equally across all 5 COs.
          max += 30 / 5;
          if (labMark != null) co5 += labMark / 5;
        }
      }

      if (!hasAny) {
        // Align with MODEL entry UX: Absent(AL) behaves like 0.
        if (absent && absentKind === 'AL') return { mark: 0, max };
        return { mark: null, max };
      }

      if (absent && absentKind === 'AL') return { mark: 0, max };
      return { mark: clamp(co5, 0, max), max };
    };

    const getSpecialModelTotal = (s: Student): { mark: number | null; max: number } => {
      const sheetState = modelSheet && typeof modelSheet === 'object' ? modelSheet : null;
      const max = 60;
      if (!sheetState) return { mark: null, max };

      const rowKeyById = `id:${String(s.id)}`;
      const rowKeyByReg = s.reg_no ? `reg:${String(s.reg_no).trim()}` : '';
      const row = (sheetState as any)[rowKeyById] || (rowKeyByReg ? (sheetState as any)[rowKeyByReg] : null) || null;
      if (!row || typeof row !== 'object') return { mark: null, max };

      const absent = Boolean((row as any).absent);
      const absentKind = String((row as any).absentKind || 'AL').toUpperCase();
      if (absent && absentKind === 'AL') return { mark: 0, max };

      const q = (row as any).q && typeof (row as any).q === 'object' ? (row as any).q : row;
      let sum = 0;
      let hasAny = false;
      for (const v of Object.values(q as Record<string, unknown>)) {
        const n = toNumOrNull(v);
        if (n == null) continue;
        hasAny = true;
        sum += n;
      }
      if (!hasAny) return { mark: null, max };
      return { mark: clamp(sum, 0, max), max };
    };

    const f1ById: Record<string, any> = published.f1 && typeof published.f1 === 'object' ? published.f1 : {};
    const f2ById: Record<string, any> = published.f2 && typeof published.f2 === 'object' ? published.f2 : {};

    // CIA published sheet snapshots
    const cia1Snapshot = published.cia1 && typeof published.cia1 === 'object' ? published.cia1 : null;
    const ciaQuestions: QuestionDef[] = Array.isArray(cia1Snapshot?.questions)
      ? cia1Snapshot.questions
          .map((q: any) => ({
            key: String(q?.key || ''),
            label: String(q?.label || q?.key || ''),
            max: Number(q?.max || 0),
            co: parseCo(q?.co),
            btl: Math.min(6, Math.max(1, Number(q?.btl || 1))) as 1 | 2 | 3 | 4 | 5 | 6,
          }))
          .filter((q: any) => q.key)
      : cia1Questions;
    const ciaById: Record<string, any> = cia1Snapshot?.rowsByStudentId && typeof cia1Snapshot.rowsByStudentId === 'object' ? cia1Snapshot.rowsByStudentId : {};

    const cia2Snapshot = published.cia2 && typeof published.cia2 === 'object' ? published.cia2 : null;
    const cia2QuestionsEff: QuestionDef34[] = Array.isArray(cia2Snapshot?.questions)
      ? cia2Snapshot.questions
          .map((q: any) => ({
            key: String(q?.key || ''),
            label: String(q?.label || q?.key || ''),
            max: Number(q?.max || 0),
            co: parseCo34(q?.co),
            btl: Math.min(6, Math.max(1, Number(q?.btl || 1))) as 1 | 2 | 3 | 4 | 5 | 6,
          }))
          .filter((q: any) => q.key)
      : cia2Questions;
    const cia2ById: Record<string, any> = cia2Snapshot?.rowsByStudentId && typeof cia2Snapshot.rowsByStudentId === 'object' ? cia2Snapshot.rowsByStudentId : {};
    const cia1TotalMax = ciaQuestions.reduce((s0, q0) => s0 + (Number(q0?.max || 0) || 0), 0) || 60;
    const cia2TotalMax = cia2QuestionsEff.reduce((s0, q0) => s0 + (Number(q0?.max || 0) || 0), 0) || 60;

    for (const s of students) {
      const total1 = (published.ssa1 && typeof published.ssa1 === 'object' ? published.ssa1[String(s.id)] : null) ?? null;
      const ssaHalf = total1 == null ? null : Number(total1) / 2;
      const ssaCo1 = ssaHalf == null ? null : clamp(ssaHalf, 0, maxes.ssa1.co1);
      const ssaCo2 = ssaHalf == null ? null : clamp(ssaHalf, 0, maxes.ssa1.co2);

      const total2 = (published.ssa2 && typeof published.ssa2 === 'object' ? published.ssa2[String(s.id)] : null) ?? null;
      const ssa2Half = total2 == null ? null : Number(total2) / 2;
      const ssaCo3 = ssa2Half == null ? null : clamp(ssa2Half, 0, maxes.ssa2.co3);
      const ssaCo4 = ssa2Half == null ? null : clamp(ssa2Half, 0, maxes.ssa2.co4);

      const tcpl1 = isTcpl && tcplLab1 ? tcplLab1.get(s.id) : null;
      const tcpl2 = isTcpl && tcplLab2 ? tcplLab2.get(s.id) : null;

      const frow = f1ById[String(s.id)] || {};
      const skill1 = toNumOrNull(frow?.skill1);
      const skill2 = toNumOrNull(frow?.skill2);
      const att1 = toNumOrNull(frow?.att1);
      const att2 = toNumOrNull(frow?.att2);
      const f1Co1 = isTcpl ? (tcpl1?.a ?? null) : skill1 != null && att1 != null ? clamp(skill1 + att1, 0, maxes.f1.co1) : null;
      const f1Co2 = isTcpl ? (tcpl1?.b ?? null) : skill2 != null && att2 != null ? clamp(skill2 + att2, 0, maxes.f1.co2) : null;

      const f2row = f2ById[String(s.id)] || {};
      const skill3 = toNumOrNull(f2row?.skill1);
      const skill4 = toNumOrNull(f2row?.skill2);
      const att3 = toNumOrNull(f2row?.att1);
      const att4 = toNumOrNull(f2row?.att2);
      const f2Co3 = isTcpl ? (tcpl2?.a ?? null) : skill3 != null && att3 != null ? clamp(skill3 + att3, 0, maxes.f2.co3) : null;
      const f2Co4 = isTcpl ? (tcpl2?.b ?? null) : skill4 != null && att4 != null ? clamp(skill4 + att4, 0, maxes.f2.co4) : null;

      const crow = ciaById[String(s.id)] || {};
      const absent = Boolean(crow?.absent);
      const q = crow?.q && typeof crow.q === 'object' ? crow.q : {};
      let ciaCo1: number | null = null;
      let ciaCo2: number | null = null;
      let cia1Total: number | null = null;
      if (!absent) {
        let c1 = 0;
        let c2 = 0;
        let t1 = 0;
        let hasAny = false;
        ciaQuestions.forEach((qq, idx) => {
          const raw = q?.[qq.key];
          const mark0 = toNumOrNull(raw);
          if (mark0 == null) return;
          hasAny = true;
          const mark = clamp(mark0, 0, Number(qq.max) || mark0);
          t1 += mark;
          const w = effectiveCoWeightsForQuestion(ciaQuestions, idx);
          c1 += mark * w.co1;
          c2 += mark * w.co2;
        });
        if (hasAny) {
          ciaCo1 = clamp(c1, 0, maxes.cia1.co1);
          ciaCo2 = clamp(c2, 0, maxes.cia1.co2);
          cia1Total = clamp(t1, 0, cia1TotalMax);
        }
      }

      const c2row = cia2ById[String(s.id)] || {};
      const absent2 = Boolean(c2row?.absent);
      const q2 = c2row?.q && typeof c2row.q === 'object' ? c2row.q : {};
      let ciaCo3: number | null = null;
      let ciaCo4: number | null = null;
      let cia2Total: number | null = null;
      if (!absent2) {
        let c3 = 0;
        let c4 = 0;
        let t2 = 0;
        let hasAny2 = false;
        cia2QuestionsEff.forEach((qq, idx) => {
          const raw = q2?.[qq.key];
          const mark0 = toNumOrNull(raw);
          if (mark0 == null) return;
          hasAny2 = true;
          const mark = clamp(mark0, 0, Number(qq.max) || mark0);
          t2 += mark;
          const w = effectiveCoWeightsForQuestion34(cia2QuestionsEff, idx);
          c3 += mark * w.co3;
          c4 += mark * w.co4;
        });
        if (hasAny2) {
          ciaCo3 = clamp(c3, 0, maxes.cia2.co3);
          ciaCo4 = clamp(c4, 0, maxes.cia2.co4);
          cia2Total = clamp(t2, 0, cia2TotalMax);
        }
      }

      const model = showModelCo5 ? getModelCo5(s) : { mark: null, max: 0 };
      const specialModel = isSpecialCourse && theoryEnabled.model ? getSpecialModelTotal(s) : { mark: null, max: 60 };

      out.set(s.id, {
        ssaCo1,
        ssaCo2,
        ssaCo3,
        ssaCo4,
        ssaTotal1: toNumOrNull(total1),
        ssaTotal2: toNumOrNull(total2),
        ciaCo1,
        ciaCo2,
        ciaCo3,
        ciaCo4,
        cia1Total,
        cia2Total,
        cia1TotalMax,
        cia2TotalMax,
        f1Co1,
        f1Co2,
        f2Co3,
        f2Co4,
        modelCo5: model.mark,
        modelCo5Max: model.max,
        specialModelTotal: specialModel.mark,
        specialModelTotalMax: specialModel.max,
      });
    }

    return out;
  }, [published, publishedLab, publishedTcplLab, students, maxes, cia1Questions, isLabCourse, classType, courseId, selectedTaId, showModelCo5, isSpecialCourse, theoryEnabled.model]);

  const tcplLabMaxes = useMemo(() => {
    if (!isTcplCourse) return null;

    const readMax = (snapshot: any | null) => {
      const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object' ? snapshot.sheet : {};
      const expMaxA = Number.isFinite(Number(sheet?.expMaxA)) ? Number(sheet.expMaxA) : 25;
      const expMaxB = Number.isFinite(Number(sheet?.expMaxB)) ? Number(sheet.expMaxB) : 25;
      const ciaEnabled = (sheet as any)?.ciaExamEnabled !== false;
      const HALF = DEFAULT_LAB_CIA_EXAM_MAX / 2;
      return {
        a: expMaxA + (ciaEnabled ? HALF : 0),
        b: expMaxB + (ciaEnabled ? HALF : 0),
      };
    };

    return {
      lab1: readMax(publishedTcplLab.lab1),
      lab2: readMax(publishedTcplLab.lab2),
    };
  }, [isTcplCourse, publishedTcplLab]);

  const theoryCoMaxTotals = useMemo(() => {
    if (isSpecialCourse) {
      const co1 = theoryEnabled.cia1 || theoryEnabled.cia2 || theoryEnabled.model ? 10 : 0;
      const co2 = theoryEnabled.cia1 || theoryEnabled.cia2 || theoryEnabled.model ? 10 : 0;
      const co3 = theoryEnabled.ssa1 || theoryEnabled.ssa2 ? 20 : 0;
      const co4 = 0;
      const co5 = 0;
      const total = co1 + co2 + co3;
      return { f1MaxCo1: 0, f1MaxCo2: 0, f2MaxCo3: 0, f2MaxCo4: 0, co1, co2, co3, co4, co5, total };
    }

    const f1MaxCo1 = isTcplCourse ? (tcplLabMaxes?.lab1?.a ?? maxes.f1.co1) : maxes.f1.co1;
    const f1MaxCo2 = isTcplCourse ? (tcplLabMaxes?.lab1?.b ?? maxes.f1.co2) : maxes.f1.co2;
    const f2MaxCo3 = isTcplCourse ? (tcplLabMaxes?.lab2?.a ?? maxes.f2.co3) : maxes.f2.co3;
    const f2MaxCo4 = isTcplCourse ? (tcplLabMaxes?.lab2?.b ?? maxes.f2.co4) : maxes.f2.co4;

    const co1 = (theoryEnabled.ssa1 ? maxes.ssa1.co1 : 0) + (theoryEnabled.cia1 ? maxes.cia1.co1 : 0) + (theoryEnabled.formative1 ? f1MaxCo1 : 0);
    const co2 = (theoryEnabled.ssa1 ? maxes.ssa1.co2 : 0) + (theoryEnabled.cia1 ? maxes.cia1.co2 : 0) + (theoryEnabled.formative1 ? f1MaxCo2 : 0);
    const co3 = (theoryEnabled.ssa2 ? maxes.ssa2.co3 : 0) + (theoryEnabled.cia2 ? maxes.cia2.co3 : 0) + (theoryEnabled.formative2 ? f2MaxCo3 : 0);
    const co4 = (theoryEnabled.ssa2 ? maxes.ssa2.co4 : 0) + (theoryEnabled.cia2 ? maxes.cia2.co4 : 0) + (theoryEnabled.formative2 ? f2MaxCo4 : 0);
    const co5 = showModelCo5 ? theoryCo5Weightage : 0;
    const total = co1 + co2 + co3 + co4 + co5;

    return { f1MaxCo1, f1MaxCo2, f2MaxCo3, f2MaxCo4, co1, co2, co3, co4, co5, total };
  }, [isSpecialCourse, isTcplCourse, tcplLabMaxes, maxes, theoryEnabled, showModelCo5, theoryCo5Weightage]);

  const computedRows = useMemo(() => {
    if (isLabCourse) {
      const mx = labCoMaxes || { co1: 55, co2: 55, co3: 55, co4: 55, co5: 55, total: 275 };
      const pct = (v: number | null, max: number) => (v == null || !max ? null : round1((v / max) * 100));
      const pt3 = (v: number | null, max: number) => (v == null || !max ? null : round2((v / max) * 3));

      const labSheets: any[] = [publishedLab.cia1, publishedLab.cia2, publishedLab.model].filter(Boolean);

      const computeBtlForStudent = (sid: number) => {
        const sums = [0, 0, 0, 0, 0, 0, 0];
        const cnts = [0, 0, 0, 0, 0, 0, 0];

        for (const snap of labSheets) {
          const sheet = snap?.sheet && typeof snap.sheet === 'object' ? snap.sheet : {};
          const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object' ? sheet.rowsByStudentId : {};
          const row = rowsByStudentId[String(sid)] || {};

          const cfgs = sheet?.coConfigs && typeof sheet.coConfigs === 'object' ? (sheet.coConfigs as any) : null;
          const marksByCo = (row as any)?.marksByCo && typeof (row as any).marksByCo === 'object' ? (row as any).marksByCo : {};

          const legacyAEnabled = Boolean((sheet as any)?.coAEnabled);
          const legacyBEnabled = Boolean((sheet as any)?.coBEnabled);
          const legacyExpCountA = clamp(Number((sheet as any)?.expCountA ?? 0), 0, 12);
          const legacyExpCountB = clamp(Number((sheet as any)?.expCountB ?? 0), 0, 12);
          const legacyExpMaxA = Number.isFinite(Number((sheet as any)?.expMaxA)) ? Number((sheet as any).expMaxA) : 25;
          const legacyExpMaxB = Number.isFinite(Number((sheet as any)?.expMaxB)) ? Number((sheet as any).expMaxB) : 25;
          const legacyBtlA = Array.isArray((sheet as any)?.btlA) ? (sheet as any).btlA : [];
          const legacyBtlB = Array.isArray((sheet as any)?.btlB) ? (sheet as any).btlB : [];

          const iterCo = (coNumber: number, enabled: boolean, expCount: number, expMax: number, btlArr: any[], rawMarks: any) => {
            if (!enabled || expCount <= 0 || !expMax) return;
            const marks = normalizeMarksArray(rawMarks, expCount);
            for (let i = 0; i < expCount; i++) {
              const lvl = btlLevel(btlArr[i]);
              const mark = typeof marks[i] === 'number' && Number.isFinite(marks[i]) ? (marks[i] as number) : null;
              if (!lvl || mark == null) continue;
              const scaled = clamp(mark, 0, expMax) * (10 / expMax);
              sums[lvl] += scaled;
              cnts[lvl] += 1;
            }
          };

          if (cfgs) {
            for (const [k, cfg] of Object.entries(cfgs)) {
              const coNum = Number(k);
              if (!Number.isFinite(coNum)) continue;
              if (!cfg || typeof cfg !== 'object') continue;
              const enabled = Boolean((cfg as any).enabled);
              const expCount = clamp(Number((cfg as any).expCount ?? 0), 0, 12);
              const expMax = Number.isFinite(Number((cfg as any).expMax)) ? Number((cfg as any).expMax) : 25;
              const btlArr = Array.isArray((cfg as any).btl) ? (cfg as any).btl : [];
              const raw = marksByCo?.[String(coNum)] ?? [];
              iterCo(coNum, enabled, expCount, expMax, btlArr, raw);
            }
          } else {
            // legacy A/B only
            iterCo(0, legacyAEnabled, legacyExpCountA, legacyExpMaxA, legacyBtlA, (row as any).marksA);
            iterCo(0, legacyBEnabled, legacyExpCountB, legacyExpMaxB, legacyBtlB, (row as any).marksB);
          }
        }

        const out: Record<string, number | null> = {};
        for (let lvl = 1; lvl <= 6; lvl++) {
          out[`btl${lvl}`] = cnts[lvl] ? round1(sums[lvl] / cnts[lvl]) : null;
          out[`btl${lvl}Pct`] = cnts[lvl] ? round1(((sums[lvl] / cnts[lvl]) / 10) * 100) : null;
        }
        return out;
      };

      return students.map((s, idx) => {
        const m = byStudentId.get(s.id) || {};
        const co1 = typeof m.co1 === 'number' ? m.co1 : null;
        const co2 = typeof m.co2 === 'number' ? m.co2 : null;
        const co3 = typeof m.co3 === 'number' ? m.co3 : null;
        const co4 = typeof m.co4 === 'number' ? m.co4 : null;
        const co5 = typeof m.co5 === 'number' ? m.co5 : null;

        const btl = computeBtlForStudent(s.id);

        const total = [co1, co2, co3, co4, co5].every((x) => typeof x === 'number')
          ? round1((co1 as number) + (co2 as number) + (co3 as number) + (co4 as number) + (co5 as number))
          : null;

        return {
          sno: idx + 1,
          ...s,
          co1,
          co1Pct: pct(co1, mx.co1),
          co1_3pt: pt3(co1, mx.co1),
          co2,
          co2Pct: pct(co2, mx.co2),
          co2_3pt: pt3(co2, mx.co2),
          co3,
          co3Pct: pct(co3, mx.co3),
          co3_3pt: pt3(co3, mx.co3),
          co4,
          co4Pct: pct(co4, mx.co4),
          co4_3pt: pt3(co4, mx.co4),
          co5,
          co5Pct: pct(co5, mx.co5),
          co5_3pt: pt3(co5, mx.co5),
          ...btl,
          total,
        };
      });
    }

    if (isSpecialCourse) {
      const co1MaxTotal = 10;
      const co2MaxTotal = 10;
      const co3MaxTotal = 20;
      const co4MaxTotal = 0;
      const co5MaxTotal = 0;

      return students.map((s, idx) => {
        const m = byStudentId.get(s.id);

        const ssa1Raw = toNumOrNull(m?.ssaTotal1);
        const ssa2Raw = toNumOrNull(m?.ssaTotal2);
        const cia1Raw = toNumOrNull(m?.cia1Total);
        const cia2Raw = toNumOrNull(m?.cia2Total);
        const modelRaw = toNumOrNull(m?.specialModelTotal);

        const ssa1Max = 10;
        const ssa2Max = 10;
        const cia1Max = Number(m?.cia1TotalMax || 60);
        const cia2Max = Number(m?.cia2TotalMax || 60);
        const modelMax = Number(m?.specialModelTotalMax || 60);

        const co1Components: Array<{ mark: number | null; max: number; w: number }> = [];
        const co2Components: Array<{ mark: number | null; max: number; w: number }> = [];
        const co3Components: Array<{ mark: number | null; max: number; w: number }> = [];

        if (theoryEnabled.cia1) {
          co1Components.push({ mark: cia1Raw, max: cia1Max, w: 2.5 });
          co2Components.push({ mark: cia1Raw, max: cia1Max, w: 2.5 });
        }
        if (theoryEnabled.cia2) {
          co1Components.push({ mark: cia2Raw, max: cia2Max, w: 2.5 });
          co2Components.push({ mark: cia2Raw, max: cia2Max, w: 2.5 });
        }
        if (theoryEnabled.model) {
          co1Components.push({ mark: modelRaw, max: modelMax, w: 5 });
          co2Components.push({ mark: modelRaw, max: modelMax, w: 5 });
        }
        if (theoryEnabled.ssa1) co3Components.push({ mark: ssa1Raw, max: ssa1Max, w: 10 });
        if (theoryEnabled.ssa2) co3Components.push({ mark: ssa2Raw, max: ssa2Max, w: 10 });

        const specialWeighted = (items: Array<{ mark: number | null; max: number; w: number }>, outOf: number): number | null => {
          const active = items.filter((it) => Number(it.w) > 0);
          if (!active.length || !outOf) return null;
          const valid = active.filter((it) => it.mark != null && it.max > 0);
          if (!valid.length) return null;
          const totalW = valid.reduce((sum, it) => sum + it.w, 0);
          if (!totalW) return null;
          const earned = valid.reduce((sum, it) => sum + ((Number(it.mark) / it.max) * it.w), 0);
          return clamp(earned, 0, outOf);
        };

        const co1 = specialWeighted(co1Components, co1MaxTotal);
        const co2 = specialWeighted(co2Components, co2MaxTotal);
        const co3 = specialWeighted(co3Components, co3MaxTotal);
        const co4 = null;
        const co5 = null;

        const co1Pct = co1 == null || !co1MaxTotal ? null : round1((co1 / co1MaxTotal) * 100);
        const co2Pct = co2 == null || !co2MaxTotal ? null : round1((co2 / co2MaxTotal) * 100);
        const co3Pct = co3 == null || !co3MaxTotal ? null : round1((co3 / co3MaxTotal) * 100);
        const co4Pct = null;
        const co5Pct = null;

        const co1_3pt = co1 == null || !co1MaxTotal ? null : round2((co1 / co1MaxTotal) * 3);
        const co2_3pt = co2 == null || !co2MaxTotal ? null : round2((co2 / co2MaxTotal) * 3);
        const co3_3pt = co3 == null || !co3MaxTotal ? null : round2((co3 / co3MaxTotal) * 3);
        const co4_3pt = null;
        const co5_3pt = null;

        const totalCandidates: Array<{ enabled: boolean; v: number | null }> = [
          { enabled: true, v: co1 },
          { enabled: true, v: co2 },
          { enabled: true, v: co3 },
        ];
        const enabledVals = totalCandidates.filter((it) => it.enabled).map((it) => it.v);
        const total = enabledVals.length === 0 || enabledVals.some((v) => v == null)
          ? null
          : round2(enabledVals.reduce((sum, v) => sum + Number(v || 0), 0));

        const btl = { btl1: null, btl2: null, btl3: null, btl4: null, btl5: null, btl6: null };

        return {
          sno: idx + 1,
          ...s,
          co1,
          co2,
          co3,
          co4,
          co5,
          co1_pct: co1Pct,
          co2_pct: co2Pct,
          co3_pct: co3Pct,
          co4_pct: co4Pct,
          co5_pct: co5Pct,
          co1_3pt,
          co2_3pt,
          co3_3pt,
          co4_3pt,
          co5_3pt,
          ...btl,
          total,
        };
      });
    }

    // Apply weights per-term (term1 affects CO1/CO2; term2 affects CO3/CO4).
    // This avoids a disabled term forcing the other term's COs to become null.
    const ssaW1 = theoryEnabled.ssa1 ? weights.ssa1 : 0;
    const ciaW1 = theoryEnabled.cia1 ? weights.cia1 : 0;
    const fW1 = theoryEnabled.formative1 ? weights.formative1 : 0;
    const ssaW2 = theoryEnabled.ssa2 ? weights.ssa1 : 0;
    const ciaW2 = theoryEnabled.cia2 ? weights.cia1 : 0;
    const fW2 = theoryEnabled.formative2 ? weights.formative1 : 0;

    const { f1MaxCo1, f1MaxCo2, f2MaxCo3, f2MaxCo4 } = theoryCoMaxTotals;
    const co1MaxTotal = theoryCoMaxTotals.co1;
    const co2MaxTotal = theoryCoMaxTotals.co2;
    const co3MaxTotal = theoryCoMaxTotals.co3;
    const co4MaxTotal = theoryCoMaxTotals.co4;
    const co5MaxTotal = theoryCoMaxTotals.co5;

    return students.map((s, idx) => {
      const m = byStudentId.get(s.id);

      const co1 = weightedCoMarkFromComponents({
        ssaMark: m?.ssaCo1 ?? null,
        ciaMark: m?.ciaCo1 ?? null,
        f1Mark: m?.f1Co1 ?? null,
        ssaMax: maxes.ssa1.co1,
        ciaMax: maxes.cia1.co1,
        f1Max: f1MaxCo1,
        ssaW: ssaW1,
        ciaW: ciaW1,
        f1W: fW1,
        outOf: co1MaxTotal,
      });

      const co2 = weightedCoMarkFromComponents({
        ssaMark: m?.ssaCo2 ?? null,
        ciaMark: m?.ciaCo2 ?? null,
        f1Mark: m?.f1Co2 ?? null,
        ssaMax: maxes.ssa1.co2,
        ciaMax: maxes.cia1.co2,
        f1Max: f1MaxCo2,
        ssaW: ssaW1,
        ciaW: ciaW1,
        f1W: fW1,
        outOf: co2MaxTotal,
      });

      const co3 = weightedCoMarkFromComponents({
        ssaMark: m?.ssaCo3 ?? null,
        ciaMark: m?.ciaCo3 ?? null,
        f1Mark: m?.f2Co3 ?? null,
        ssaMax: maxes.ssa2.co3,
        ciaMax: maxes.cia2.co3,
        f1Max: f2MaxCo3,
        ssaW: ssaW2,
        ciaW: ciaW2,
        f1W: fW2,
        outOf: co3MaxTotal,
      });

      const co4 = weightedCoMarkFromComponents({
        ssaMark: m?.ssaCo4 ?? null,
        ciaMark: m?.ciaCo4 ?? null,
        f1Mark: m?.f2Co4 ?? null,
        ssaMax: maxes.ssa2.co4,
        ciaMax: maxes.cia2.co4,
        f1Max: f2MaxCo4,
        ssaW: ssaW2,
        ciaW: ciaW2,
        f1W: fW2,
        outOf: co4MaxTotal,
      });

      const co1Pct = co1 == null || !co1MaxTotal ? null : round1((co1 / co1MaxTotal) * 100);
      const co2Pct = co2 == null || !co2MaxTotal ? null : round1((co2 / co2MaxTotal) * 100);
      const co3Pct = co3 == null || !co3MaxTotal ? null : round1((co3 / co3MaxTotal) * 100);
      const co4Pct = co4 == null || !co4MaxTotal ? null : round1((co4 / co4MaxTotal) * 100);

      const modelCo5Raw = typeof m?.modelCo5 === 'number' && Number.isFinite(m.modelCo5) ? (m.modelCo5 as number) : null;
      const modelCo5Max = typeof m?.modelCo5Max === 'number' && Number.isFinite(m.modelCo5Max) ? Math.max(0, m.modelCo5Max as number) : MODEL_THEORY_CO5_MAX;
      const co5 =
        !showModelCo5 || modelCo5Raw == null || !modelCo5Max || !co5MaxTotal
          ? null
          : clamp((modelCo5Raw / modelCo5Max) * co5MaxTotal, 0, co5MaxTotal);

      const co5Pct = co5 == null || !co5MaxTotal ? null : round1((co5 / co5MaxTotal) * 100);

      const co1_3pt = co1 == null || !co1MaxTotal ? null : round2((co1 / co1MaxTotal) * 3);
      const co2_3pt = co2 == null || !co2MaxTotal ? null : round2((co2 / co2MaxTotal) * 3);
      const co3_3pt = co3 == null || !co3MaxTotal ? null : round2((co3 / co3MaxTotal) * 3);
      const co4_3pt = co4 == null || !co4MaxTotal ? null : round2((co4 / co4MaxTotal) * 3);
      const co5_3pt = co5 == null || !co5MaxTotal ? null : round2((co5 / co5MaxTotal) * 3);

      const totalCandidates: Array<{ enabled: boolean; v: number | null }> = [
        { enabled: co1MaxTotal > 0, v: co1 },
        { enabled: co2MaxTotal > 0, v: co2 },
        { enabled: co3MaxTotal > 0, v: co3 },
        { enabled: co4MaxTotal > 0, v: co4 },
        ...(showModelCo5 ? [{ enabled: co5MaxTotal > 0, v: co5 }] : []),
      ];

      let anyEnabled = false;
      let missingEnabled = false;
      let totalSum = 0;
      for (const it of totalCandidates) {
        if (!it.enabled) continue;
        anyEnabled = true;
        if (typeof it.v !== 'number' || !Number.isFinite(it.v)) {
          missingEnabled = true;
          break;
        }
        totalSum += it.v;
      }
      const total = !anyEnabled || missingEnabled ? null : round1(totalSum);

      return {
        sno: idx + 1,
        ...s,
        co1,
        co1Pct,
        co1_3pt,
        co2,
        co2Pct,
        co2_3pt,
        co3,
        co3Pct,
        co3_3pt,
        co4,
        co4Pct,
        co4_3pt,
        co5,
        co5Pct,
        co5_3pt,
        total,
      };
    });
  }, [students, byStudentId, maxes, weights, theoryEnabled, showModelCo5, theoryCo5Weightage, theoryCoMaxTotals, isLabCourse, labCoMaxes, publishedLab, isSpecialCourse]);

  const summary = useMemo(() => {
    if (isLabCourse) {
      const pickAvg = (key: string) => {
        const vals = computedRows.map((r: any) => r?.[key]).filter((n: any) => typeof n === 'number') as number[];
        return vals.length ? round2(vals.reduce((s: number, n: number) => s + n, 0) / vals.length) : null;
      };

      return {
        strength: students.length,
        co1Avg3pt: pickAvg('co1_3pt'),
        co2Avg3pt: pickAvg('co2_3pt'),
        co3Avg3pt: pickAvg('co3_3pt'),
        co4Avg3pt: pickAvg('co4_3pt'),
        co5Avg3pt: pickAvg('co5_3pt'),
      };
    }

    const co1Vals = computedRows.map((r) => r.co1_3pt).filter((n) => typeof n === 'number') as number[];
    const co2Vals = computedRows.map((r) => r.co2_3pt).filter((n) => typeof n === 'number') as number[];
    const co3Vals = computedRows.map((r) => r.co3_3pt).filter((n) => typeof n === 'number') as number[];
    const co4Vals = computedRows.map((r) => r.co4_3pt).filter((n) => typeof n === 'number') as number[];
    const co5Vals = computedRows.map((r: any) => r.co5_3pt).filter((n: any) => typeof n === 'number') as number[];
    const avg = (arr: number[]) => (arr.length ? round2(arr.reduce((s, n) => s + n, 0) / arr.length) : null);
    return {
      strength: students.length,
      co1Avg3pt: avg(co1Vals),
      co2Avg3pt: avg(co2Vals),
      co3Avg3pt: avg(co3Vals),
      co4Avg3pt: avg(co4Vals),
      ...(showModelCo5 ? { co5Avg3pt: avg(co5Vals) } : {}),
    };
  }, [computedRows, students.length, isLabCourse, showModelCo5]);

  const labCoMax = useMemo(() => {
    // backward-compatible single value (used only if some UI still expects it)
    const v = Number((labCoMaxes as any)?.co1);
    return Number.isFinite(v) && v > 0 ? v : 55;
  }, [labCoMaxes]);

  const labBtlMaxes = useMemo(() => {
    if (!isLabCourse) return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as Record<1 | 2 | 3 | 4 | 5 | 6, number>;

    const present = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false } as Record<1 | 2 | 3 | 4 | 5 | 6, boolean>;
    const snaps: any[] = [publishedLab.cia1, publishedLab.cia2, publishedLab.model].filter(Boolean);
    for (const snap of snaps) {
      const sheet = snap?.sheet && typeof snap.sheet === 'object' ? snap.sheet : {};
      const expCountA = clamp(Number(sheet?.expCountA ?? 0), 0, 12);
      const expCountB = clamp(Number(sheet?.expCountB ?? 0), 0, 12);
      const coAEnabled = Boolean(sheet?.coAEnabled);
      const coBEnabled = Boolean(sheet?.coBEnabled);
      const btlA = Array.isArray(sheet?.btlA) ? sheet.btlA : [];
      const btlB = Array.isArray(sheet?.btlB) ? sheet.btlB : [];

      if (coAEnabled) {
        for (let i = 0; i < expCountA; i++) {
          const lvl = btlLevel(btlA[i]);
          if (lvl) present[lvl] = true;
        }
      }
      if (coBEnabled) {
        for (let i = 0; i < expCountB; i++) {
          const lvl = btlLevel(btlB[i]);
          if (lvl) present[lvl] = true;
        }
      }
    }

    return {
      1: present[1] ? 10 : 0,
      2: present[2] ? 10 : 0,
      3: present[3] ? 10 : 0,
      4: present[4] ? 10 : 0,
      5: present[5] ? 10 : 0,
      6: present[6] ? 10 : 0,
    } as Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  }, [isLabCourse, publishedLab]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {(loadingPublished || publishedError) && (
        <div style={{ fontSize: 12, color: publishedError ? '#b91c1c' : '#6b7280' }}>
          {loadingPublished ? 'Loading published marks…' : publishedError}
        </div>
      )}
      {publishedFetchErrors && Object.keys(publishedFetchErrors).length > 0 && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          {Object.entries(publishedFetchErrors).map(([k, v]) =>
            v ? (
              <div key={k} style={{ color: '#b91c1c' }}>
                {k}: {String(v)}
              </div>
            ) : null,
          )}
        </div>
      )}
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: 'linear-gradient(180deg,#ffffff, #f6fbff)',
          border: '1px solid #e6eef8',
          boxShadow: '0 6px 20px rgba(13, 60, 100, 0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0b4a6f' }}>
              {isLabCourse ? 'CO Attainment (LAB)' : 'CO Attainment (Summative + Formative)'}
            </div>
            <div style={{ marginTop: 6, color: '#264653', fontSize: 13 }}>
              {isLabCourse
                ? 'Uses published LAB sheets: CIA1 LAB (CO1/CO2) + CIA2 LAB (CO3/CO4) + MODEL LAB (CO5).'
                : 'Uses weighted blending per CO: SSA1 + CIA1 + Formative1 (based on your Excel formula).'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Teaching Assignment / Section</div>
              <select
                value={selectedTaId ?? ''}
                onChange={(e) => setSelectedTaId(e.target.value ? Number(e.target.value) : null)}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', minWidth: 320 }}
              >
                <option value="">Select…</option>
                {tas.map((t) => {
                  const dept = (t as any).department;
                  const deptLabel = dept?.short_name || dept?.code || dept?.name || (t as any).department_name || '';
                  const sem = (t as any).semester;
                  return (
                    <option key={t.id} value={t.id}>
                      {t.section_name} {sem ? `· Sem ${sem}` : ''} {t.academic_year ? `· ${t.academic_year}` : ''} {deptLabel ? `· ${deptLabel}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {taError && (
          <div style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10 }}>
            {taError}
          </div>
        )}

        {isLabCourse ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12 }}>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e9f0f7', padding: 12 }}>
              <div style={{ fontWeight: 800, color: '#0b3b57', marginBottom: 8 }}>LAB CO max</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                CO max values are pulled from published LAB sheets only.
                {labCoMaxes ? (
                  <>
                    {activeCONumbers.map((coNum, idx) => {
                      const coKey = `co${coNum}` as keyof typeof labCoMaxes;
                      return (
                        <React.Fragment key={coNum}>
                          {idx > 0 && ' | '}
                          CO{coNum}: <b>{labCoMaxes[coKey]}</b>
                        </React.Fragment>
                      );
                    })}
                  </>
                ) : (
                  <> Each CO max is <b>{labCoMax}</b>.</>
                )}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                Batch strength: <b>{summary.strength}</b>
                {activeCONumbers.map(coNum => {
                  const avgKey = `co${coNum}Avg3pt` as keyof typeof summary;
                  return (
                    <React.Fragment key={coNum}>
                      &nbsp;|&nbsp; CO{coNum} avg (3pt): <b>{(summary as any)[avgKey] ?? '-'}</b>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginTop: 12 }}>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e9f0f7', padding: 12 }}>
              <div style={{ fontWeight: 800, color: '#0b3b57', marginBottom: 8 }}>Max marks per CO (P4:P6)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 120px 120px 120px', gap: 8, alignItems: 'center' }}>
                <div></div>
                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>SSA1</div>
                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>CIA1</div>
                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>Formative1</div>

                <div style={{ fontSize: 12, fontWeight: 700 }}>CO1</div>
                <div>{maxes.ssa1.co1}</div>
                <div>{maxes.cia1.co1}</div>
                <div>{maxes.f1.co1}</div>

                <div style={{ fontSize: 12, fontWeight: 700 }}>CO2</div>
                <div>{maxes.ssa1.co2}</div>
                <div>{maxes.cia1.co2}</div>
                <div>{maxes.f1.co2}</div>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                {activeCONumbers
                  .filter((coNum) => coNum <= 4 || showModelCo5)
                  .map((coNum, idx) => {
                    const coKey = `co${coNum}` as keyof typeof theoryCoMaxTotals;
                    const maxVal = coNum === 5 ? theoryCo5Weightage : theoryCoMaxTotals[coKey];
                    return (
                      <React.Fragment key={coNum}>
                        {idx > 0 && <>&nbsp;|&nbsp;</>}
                        CO{coNum} total max: <b>{maxVal}</b>
                      </React.Fragment>
                    );
                  })}
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e9f0f7', padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ fontWeight: 800, color: '#0b3b57', marginBottom: 8 }}>Derived Weights (Internal Mark Weightage)</div>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  Source: <b>{weightsSource === 'server' ? 'IQAC (server)' : weightsSource === 'local' ? 'IQAC (local)' : 'Defaults'}</b>
                </div>
              </div>
              {lastWeightsDebug && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>{lastWeightsDebug}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 8, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>SSA1</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>CIA1</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Formative1</div>
                <div style={{ fontWeight: 700 }}>{weights.ssa1}</div>
                <div style={{ fontWeight: 700 }}>{weights.cia1}</div>
                <div style={{ fontWeight: 700 }}>{weights.formative1}</div>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                Batch strength: <b>{summary.strength}</b> &nbsp;|&nbsp; CO1 avg (3pt): <b>{summary.co1Avg3pt ?? '-'}</b> &nbsp;|&nbsp; CO2 avg (3pt): <b>{summary.co2Avg3pt ?? '-'}</b>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                Note: These values are derived from Internal Mark Weightage in Academic Controller.
              </div>
            </div>
          </div>
        )}
      </div>

      {rosterError && (
        <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10 }}>
          {rosterError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          onClick={() => setHideCOColumns(!hideCOColumns)}
          style={{
            padding: '8px 16px',
            backgroundColor: hideCOColumns ? '#059669' : '#0ea5e9',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {hideCOColumns ? 'Show CO Columns' : 'Hide CO Columns'}
        </button>
      </div>

      {loadingRoster ? (
        <div style={{ color: '#6b7280' }}>Loading roster…</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'auto', background: '#fff' }}>
          {isLabCourse ? (
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 2100 }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={thSticky}>S.No</th>
                  <th rowSpan={2} style={thSticky}>Section</th>
                  <th rowSpan={2} style={thSticky}>Register No</th>
                  <th rowSpan={2} style={thSticky}>Name</th>
                  {!hideCOColumns && (
                    <>
                      {activeCONumbers.map(coNum => (
                        <th key={`co${coNum}`} colSpan={3} style={thGroup}>CO{coNum}</th>
                      ))}
                    </>
                  )}
                  <th rowSpan={2} style={thSticky}>CQI Entry</th>
                  <th colSpan={2} style={thGroup}>BTL-1</th>
                  <th colSpan={2} style={thGroup}>BTL-2</th>
                  <th colSpan={2} style={thGroup}>BTL-3</th>
                  <th colSpan={2} style={thGroup}>BTL-4</th>
                  <th colSpan={2} style={thGroup}>BTL-5</th>
                  <th colSpan={2} style={thGroup}>BTL-6</th>
                  <th rowSpan={2} style={thSticky}>Total / {round1(labCoMaxes?.total ?? labCoMax * 5)}</th>
                </tr>
                <tr>
                  {!hideCOColumns && (
                    <>
                      {activeCONumbers.map(coNum => {
                        const coKey = `co${coNum}` as keyof typeof labCoMaxes;
                        const maxVal = labCoMaxes?.[coKey] ?? labCoMax;
                        return (
                          <React.Fragment key={`co${coNum}-cells`}>
                            <th style={thSticky}>{maxVal}</th>
                            <th style={thSticky}>%</th>
                            <th style={thSticky}>3pt</th>
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}

                  <th style={thSticky}>{labBtlMaxes[1]}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>{labBtlMaxes[2]}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>{labBtlMaxes[3]}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>{labBtlMaxes[4]}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>{labBtlMaxes[5]}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>{labBtlMaxes[6]}</th>
                  <th style={thSticky}>%</th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((r: any) => (
                  <tr key={r.id}>
                    <td style={td}>{r.sno}</td>
                    <td style={td}>{r.section ?? ''}</td>
                    <td style={td}>{r.reg_no}</td>
                    <td style={td}>{r.name}</td>

                    {!hideCOColumns && (
                      <>
                        {activeCONumbers.map(coNum => {
                          const coKey = `co${coNum}`;
                          const coPctKey = `co${coNum}Pct`;
                          const co3ptKey = `co${coNum}_3pt`;
                          return (
                            <React.Fragment key={`co${coNum}-row`}>
                              <td style={{ ...td, textAlign: 'center' }}>{r[coKey] == null ? '' : round1(r[coKey])}</td>
                              <td style={{ ...td, textAlign: 'center' }}>{r[coPctKey] == null ? '' : r[coPctKey]}</td>
                              <td style={{ ...td, textAlign: 'center' }}>{r[co3ptKey] == null ? '' : r[co3ptKey]}</td>
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}

                    <td style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="text"
                        value={cqiEntries[r.id] || ''}
                        onChange={(e) => setCqiEntries({ ...cqiEntries, [r.id]: e.target.value })}
                        style={{
                          width: '100%',
                          minWidth: 100,
                          padding: '4px 6px',
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                        placeholder="Enter CQI"
                      />
                    </td>

                    <td style={{ ...td, textAlign: 'center' }}>{r.btl1 == null ? '' : round1(r.btl1)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl1Pct == null ? '' : r.btl1Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl2 == null ? '' : round1(r.btl2)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl2Pct == null ? '' : r.btl2Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl3 == null ? '' : round1(r.btl3)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl3Pct == null ? '' : r.btl3Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl4 == null ? '' : round1(r.btl4)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl4Pct == null ? '' : r.btl4Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl5 == null ? '' : round1(r.btl5)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl5Pct == null ? '' : r.btl5Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl6 == null ? '' : round1(r.btl6)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.btl6Pct == null ? '' : r.btl6Pct}</td>

                    <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{r.total == null ? '' : r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980 }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={thSticky}>S.No</th>
                  <th rowSpan={2} style={thSticky}>Section</th>
                  <th rowSpan={2} style={thSticky}>Register No</th>
                  <th rowSpan={2} style={thSticky}>Name</th>
                  {!hideCOColumns && (
                    <>
                      {activeCONumbers.map(coNum => {
                        // For non-lab courses, CO5 is conditional on MODEL being enabled for this class type.
                        if (coNum === 5 && !showModelCo5) return null;
                        return <th key={`co${coNum}`} colSpan={3} style={thGroup}>CO{coNum}</th>;
                      })}
                    </>
                  )}
                  <th rowSpan={2} style={thSticky}>CQI Entry</th>
                  <th
                    rowSpan={2}
                    style={thSticky}
                  >
                    Total / {theoryCoMaxTotals.total}
                  </th>
                </tr>
                <tr>
                  {!hideCOColumns && (
                    <>
                      {activeCONumbers.map(coNum => {
                        if (coNum === 5 && !showModelCo5) return null;
                        const coKey = `co${coNum}` as keyof typeof theoryCoMaxTotals;
                        const maxVal = coNum === 5 ? theoryCo5Weightage : theoryCoMaxTotals[coKey];
                        return (
                          <React.Fragment key={`co${coNum}-cells`}>
                            <th style={thSticky}>{maxVal}</th>
                            <th style={thSticky}>%</th>
                            <th style={thSticky}>3pt</th>
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {computedRows.map((r: any) => (
                  <tr key={r.id}>
                    <td style={td}>{r.sno}</td>
                    <td style={td}>{r.section ?? ''}</td>
                    <td style={td}>{r.reg_no}</td>
                    <td style={td}>{r.name}</td>
                    {!hideCOColumns && (
                      <>
                        {activeCONumbers.map(coNum => {
                          if (coNum === 5 && !showModelCo5) return null;
                          const coKey = `co${coNum}`;
                          const coPctKey = `co${coNum}Pct`;
                          const co3ptKey = `co${coNum}_3pt`;
                          return (
                            <React.Fragment key={`co${coNum}-row`}>
                              <td style={{ ...td, textAlign: 'center' }}>{r[coKey] == null ? '' : round1(r[coKey])}</td>
                              <td style={{ ...td, textAlign: 'center' }}>{r[coPctKey] == null ? '' : r[coPctKey]}</td>
                              <td style={{ ...td, textAlign: 'center' }}>{r[co3ptKey] == null ? '' : r[co3ptKey]}</td>
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}

                    <td style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="text"
                        value={cqiEntries[r.id] || ''}
                        onChange={(e) => setCqiEntries({ ...cqiEntries, [r.id]: e.target.value })}
                        style={{
                          width: '100%',
                          minWidth: 100,
                          padding: '4px 6px',
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                        placeholder="Enter CQI"
                      />
                    </td>

                    <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{r.total == null ? '' : r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default COAttainmentPage;

const thSticky: React.CSSProperties = {
  border: '1px solid #111827',
  padding: '8px 8px',
  background: '#f3f4f6',
  textAlign: 'center',
  fontWeight: 800,
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const thGroup: React.CSSProperties = {
  ...thSticky,
  background: '#eaf2ff',
  color: '#0b4a6f',
};

const td: React.CSSProperties = {
  border: '1px solid #111827',
  padding: '7px 8px',
  fontSize: 12,
  whiteSpace: 'nowrap',
};
