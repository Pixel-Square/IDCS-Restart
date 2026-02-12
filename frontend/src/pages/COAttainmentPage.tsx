import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchMyTeachingAssignments,
  fetchClassTypeWeights,
  fetchPublishedCia1Sheet,
  fetchPublishedCiaSheet,
  fetchPublishedFormative,
  fetchPublishedFormative1,
  fetchPublishedLabSheet,
  fetchPublishedSsa1,
  fetchPublishedSsa2,
  fetchDraft,
  TeachingAssignmentItem,
} from '../services/obe';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import fetchWithAuth from '../services/fetchAuth';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchDeptRow, fetchDeptRows, fetchMasters } from '../services/curriculum';
import { lsGet, lsSet } from '../utils/localStorage';
import { isLabClassType, isSpecialClassType, normalizeClassType } from '../constants/classTypes';

type Props = { courseId: string; enabledAssessments?: string[] | null };

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

const DEFAULT_WEIGHTS = { ssa1: 1.5, cia1: 3, formative1: 2.5 };

// Class-type specific default weights (matches AcademicControllerWeightsPage.tsx)
const CLASS_TYPE_DEFAULT_WEIGHTS: Record<string, { ssa1: number; cia1: number; formative1: number }> = {
  THEORY: { ssa1: 1.5, cia1: 3, formative1: 2.5 },
  TCPR: { ssa1: 2, cia1: 2.5, formative1: 2 },
  TCPL: { ssa1: 1, cia1: 2, formative1: 3 },
  LAB: { ssa1: 1, cia1: 1, formative1: 1 },
  PRACTICAL: { ssa1: 1, cia1: 1, formative1: 1 },
  SPECIAL: { ssa1: 1.5, cia1: 3, formative1: 2.5 },
  AUDIT: { ssa1: 1.5, cia1: 3, formative1: 2.5 },
};

function getClassTypeDefaultWeights(classType?: string | null): { ssa1: number; cia1: number; formative1: number } {
  if (!classType) return DEFAULT_WEIGHTS;
  const normalized = normalizeClassType(classType);
  return CLASS_TYPE_DEFAULT_WEIGHTS[normalized] || DEFAULT_WEIGHTS;
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

  const hasAnySplit = questions.some((x) => x.co === '1&2');
  const isLast = idx === questions.length - 1;
  const looksLikeQ9 = String(q.key || '').toLowerCase() === 'q9' || String(q.label || '').toLowerCase().includes('q9');
  if (!hasAnySplit && isLast && looksLikeQ9) return { co1: 0.5, co2: 0.5 };

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

  const hasAnySplit = questions.some((x) => x.co === '3&4');
  const isLast = idx === questions.length - 1;
  const looksLikeQ9 = String(q.key || '').toLowerCase() === 'q9' || String(q.label || '').toLowerCase().includes('q9');
  if (!hasAnySplit && isLast && looksLikeQ9) return { co3: 0.5, co4: 0.5 };

  return coWeights34(q.co);
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
  return ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
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

export function COAttainmentPage({ courseId, enabledAssessments }: Props): JSX.Element {
  const [masterCfg, setMasterCfg] = useState<any>(null);

  const [classType, setClassType] = useState<string | null>(null);
  const isSpecialFromEnabledAssessments = useMemo(() => Array.isArray(enabledAssessments), [enabledAssessments]);
  const enabledSet = useMemo(() => {
    const arr = Array.isArray(enabledAssessments) ? enabledAssessments : [];
    return new Set(arr.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
  }, [enabledAssessments]);
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
  const showTheoryCo5 = useMemo(() => normalizeClassType(classType) === 'THEORY', [classType]);

  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [taError, setTaError] = useState<string | null>(null);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);

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

  const configKey = useMemo(() => `co_attainment_cfg_${courseId}`, [courseId]);
  const [isIqac, setIsIqac] = useState<boolean>(false);
  const [weights, setWeights] = useState(() => ({
    ssa1: DEFAULT_WEIGHTS.ssa1,
    cia1: DEFAULT_WEIGHTS.cia1,
    formative1: DEFAULT_WEIGHTS.formative1,
  }));

  const [theoryCo5Weightage, setTheoryCo5Weightage] = useState<number>(DEFAULT_THEORY_CO5_WEIGHTAGE);

  // When class type changes, reset CO5 weightage to the default for THEORY.
  useEffect(() => {
    if (!showTheoryCo5) return;
    setTheoryCo5Weightage(DEFAULT_THEORY_CO5_WEIGHTAGE);
  }, [showTheoryCo5]);
  const [weightsSource, setWeightsSource] = useState<'default' | 'local' | 'server'>('default');
  const globalWeightsRef = React.useRef<Record<string, any> | null>(null);
  const fetchWeightsRef = React.useRef<((classType?: string | null) => Promise<void>) | null>(null);
  const [lastWeightsDebug, setLastWeightsDebug] = useState<string | null>(null);
  const [lastWeightsFetchError, setLastWeightsFetchError] = useState<string | null>(null);
  const [remoteWeightsCount, setRemoteWeightsCount] = useState<number | null>(null);
  const [showRawMapping, setShowRawMapping] = useState(false);

  // determine if current user is IQAC by reading persisted roles (set by getMe)
  useEffect(() => {
    try {
      const rawRoles = localStorage.getItem('roles');
      const rawPerms = localStorage.getItem('permissions');
      const rolesArr = rawRoles ? JSON.parse(rawRoles) : [];
      const permsArr = rawPerms ? JSON.parse(rawPerms) : [];
      const upperRoles = Array.isArray(rolesArr) ? rolesArr.map((r: any) => String(r || '').toUpperCase()) : [];
      const lowerPerms = Array.isArray(permsArr) ? permsArr.map((p: any) => String(p || '').toLowerCase()) : [];
      const hasRole = upperRoles.includes('IQAC');
      const hasPerm = lowerPerms.includes('obe.master.manage');
      setIsIqac(hasRole || hasPerm);
    } catch (e) {
      setIsIqac(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchAndApplyWeights = async (applyForClass?: string | null) => {
      if (mounted) setLastWeightsDebug('Loading IQAC weights…');

      // try server
      try {
        const remote = await fetchClassTypeWeights();
        if (!mounted) return;
        if (remote && typeof remote === 'object') {
          const mapping: any = { ...(remote as any) };
          try { Object.defineProperty(mapping, '__source', { value: 'server', enumerable: false }); } catch {}
          globalWeightsRef.current = mapping;
          setRemoteWeightsCount(Object.keys(mapping || {}).length || 0);
          setLastWeightsFetchError(null);
          setLastWeightsDebug(`Server weights loaded (${Object.keys(mapping || {}).length} class-types)`);
          const ct = applyForClass ?? classType;
          if (ct) {
            const k = normalizeClassType(ct);
            const gw = mapping[k];
            if (gw && typeof gw === 'object') {
              const classDefaults = getClassTypeDefaultWeights(ct);
              setWeights({
                ssa1: Number.isFinite(Number(gw.ssa1)) ? Number(gw.ssa1) : classDefaults.ssa1,
                cia1: Number.isFinite(Number(gw.cia1)) ? Number(gw.cia1) : classDefaults.cia1,
                formative1: Number.isFinite(Number(gw.formative1)) ? Number(gw.formative1) : classDefaults.formative1,
              });
              setWeightsSource('server');
              setLastWeightsDebug(`Applied server weights for ${k}`);
              return;
            } else {
              setLastWeightsDebug(`Server weights loaded (${Object.keys(mapping || {}).length} keys) but no entry for ${k}`);
            }
          }
        }
      } catch (e: any) {
        const msg = String(e?.message || e || 'Unknown error');
        setLastWeightsFetchError(msg);
        setLastWeightsDebug(`Server fetch failed: ${msg}`);
      }

      // fallback to localStorage mapping
      try {
        const global = lsGet<any>('iqac_class_type_weights');
        if (global && typeof global === 'object') {
          const mapping: any = { ...(global as any) };
          try { Object.defineProperty(mapping, '__source', { value: 'local', enumerable: false }); } catch {}
          globalWeightsRef.current = mapping;
          setRemoteWeightsCount(Object.keys(mapping || {}).length || 0);
          const ct = applyForClass ?? classType;
          if (ct) {
            const k = normalizeClassType(ct);
            const gw = mapping[k];
            if (gw && typeof gw === 'object') {
              const classDefaults = getClassTypeDefaultWeights(ct);
              setWeights({
                ssa1: Number.isFinite(Number(gw.ssa1)) ? Number(gw.ssa1) : classDefaults.ssa1,
                cia1: Number.isFinite(Number(gw.cia1)) ? Number(gw.cia1) : classDefaults.cia1,
                formative1: Number.isFinite(Number(gw.formative1)) ? Number(gw.formative1) : classDefaults.formative1,
              });
              setWeightsSource('local');
              setLastWeightsDebug(`Applied local weights for ${k}`);
              return;
            } else {
              setLastWeightsDebug(`Local weights loaded (${Object.keys(mapping || {}).length} keys) but no entry for ${k}`);
            }
          }
        }
      } catch (e: any) {
        const msg = String(e?.message || e || 'Unknown error');
        setLastWeightsFetchError(msg);
        setLastWeightsDebug(`Local weights read failed: ${msg}`);
      }

      // Final fallback: use class-type specific defaults
      const ct = applyForClass ?? classType;
      if (ct) {
        const classDefaults = getClassTypeDefaultWeights(ct);
        setWeights(classDefaults);
        setWeightsSource('default');
        setLastWeightsDebug(`Applied class-type defaults for ${normalizeClassType(ct)}`);
      } else {
        setWeights(DEFAULT_WEIGHTS);
        setWeightsSource('default');
        setLastWeightsDebug('Applied general defaults (no class type detected)');
      }
    };

    // initial attempt
    fetchAndApplyWeights();

    // expose for other effects by storing on ref (not necessary but keep closure semantics)
    fetchWeightsRef.current = fetchAndApplyWeights;

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classType]);

  // Hard-refresh weights when teaching assignment selection changes
  useEffect(() => {
    try {
      const fn = fetchWeightsRef.current;
      if (typeof fn === 'function') fn();
    } catch {
      // ignore
    }
  }, [selectedTaId]);

  // If classType changes and we already fetched a global mapping, apply it now
  useEffect(() => {
    try {
      const global = globalWeightsRef.current;
      if (classType && global && typeof global === 'object') {
        const k = normalizeClassType(classType);
        const gw = global[k];
        if (gw && typeof gw === 'object') {
          const classDefaults = getClassTypeDefaultWeights(classType);
          setWeights({
            ssa1: Number.isFinite(Number(gw.ssa1)) ? Number(gw.ssa1) : classDefaults.ssa1,
            cia1: Number.isFinite(Number(gw.cia1)) ? Number(gw.cia1) : classDefaults.cia1,
            formative1: Number.isFinite(Number(gw.formative1)) ? Number(gw.formative1) : classDefaults.formative1,
          });
          // prefer server marker if global came from server, else local
          setWeightsSource((global as any)['__source'] === 'server' ? 'server' : 'local');
          setLastWeightsDebug(`Applied cached mapping for ${k}`);
          setLastWeightsFetchError(null);
        }
      }
    } catch {
      // ignore
    }
  }, [classType]);

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
        const filtered = (all || []).filter((a) => a.subject_code === courseId);
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
    let mounted = true;
    (async () => {
      try {
        const ta = (tas || []).find((t) => t.id === selectedTaId) || null;
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
  }, [tas, selectedTaId]);

  useEffect(() => {
    lsSet(configKey, { weights });
  }, [configKey, weights]);

  useEffect(() => {
    let mounted = true;
    const loadRoster = async () => {
      if (!selectedTaId) return;
      setLoadingRoster(true);
      setRosterError(null);
      try {
        // Find the TA object to decide how to fetch students (section vs elective)
        const ta = (tas || []).find((t) => t.id === selectedTaId) || null;
        const studsRaw: any[] = [];

        if (ta && (ta as any).elective_subject_id && !(ta as any).section_id) {
          // Elective assignment — fetch students using elective-choices endpoint
          const electiveId = (ta as any).elective_subject_id;
          const res = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${encodeURIComponent(String(electiveId))}`);
          if (!res.ok) throw new Error(`Elective-choices fetch failed: ${res.status}`);
          const data = await res.json();
          if (!mounted) return;
          // API may return paginated results in `results` or a plain array
          const items = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : (data.items || []);
          const mapped = (items || []).map((s: any) => ({
            id: Number(s.student_id ?? s.id),
            reg_no: String(s.reg_no ?? s.registration_no ?? s.regno ?? ''),
            name: String(s.name ?? s.full_name ?? s.username ?? s.student_name ?? ''),
            section: s.section_name ?? s.section ?? null,
            section_id: s.section_id ?? null,
          }));
          if (!mounted) return;
          setStudents(
            mapped
              .filter((s) => Number.isFinite(s.id))
              .sort(compareStudentName),
          );
        } else {
          // Default: teaching-assignment roster endpoint
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
        }
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
          modelRes = await fetchPublishedLabSheet('model', courseId, taId);
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
        const subjectId = (ev as any)?.detail?.subjectId;
        if (subjectId && String(subjectId) === String(courseId)) loadPublished();
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
      const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object' ? snapshot.sheet : {};
      const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object' ? sheet.rowsByStudentId : {};
      const expCountA = clamp(Number(sheet?.expCountA ?? 0), 0, 12);
      const expCountB = clamp(Number(sheet?.expCountB ?? 0), 0, 12);
      const expMaxA = Number.isFinite(Number(sheet?.expMaxA)) ? Number(sheet.expMaxA) : 25;
      const expMaxB = Number.isFinite(Number(sheet?.expMaxB)) ? Number(sheet.expMaxB) : 25;
      const ciaEnabled = (sheet as any)?.ciaExamEnabled !== false;
      const HALF = DEFAULT_LAB_CIA_EXAM_MAX / 2;
      const CO_MAX_A = expMaxA + (ciaEnabled ? HALF : 0);
      const CO_MAX_B = expMaxB + (ciaEnabled ? HALF : 0);

      const get = (sid: number) => {
        const row = rowsByStudentId[String(sid)] || {};
        const marksA = normalizeMarksArray((row as any)?.marksA, expCountA);
        const marksB = normalizeMarksArray((row as any)?.marksB, expCountB);
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

      return { get, CO_MAX_A, CO_MAX_B };
    };

    const tcplLab1 = isTcpl ? readTcplLabPair(publishedTcplLab.lab1) : null;
    const tcplLab2 = isTcpl ? readTcplLabPair(publishedTcplLab.lab2) : null;

    // MODEL (THEORY) sheet is stored locally by ModelEntry.tsx.
    // We only use it to derive CO5 for THEORY.
    const modelTheorySheet = (() => {
      if (!showTheoryCo5) return null;
      const taKey = String(selectedTaId ?? 'none');
      const k1 = `model_theory_sheet_${courseId}_${taKey}`;
      const k2 = `model_theory_sheet_${courseId}_none`;
      const kLegacy = `model_sheet_${courseId}`;
      const v1 = lsGet<any>(k1);
      if (v1 && typeof v1 === 'object') return v1;
      const v2 = lsGet<any>(k2);
      if (v2 && typeof v2 === 'object') return v2;
      const v3 = lsGet<any>(kLegacy);
      if (v3 && typeof v3 === 'object') return v3;
      return null;
    })();

    const getModelTheoryCo5 = (s: Student): { mark: number | null; max: number } => {
      const max = MODEL_THEORY_CO5_MAX;
      if (!showTheoryCo5) return { mark: null, max };
      const sheetState = modelTheorySheet && typeof modelTheorySheet === 'object' ? modelTheorySheet : null;
      if (!sheetState) return { mark: null, max };

      const rowKeyById = `id:${String(s.id)}`;
      const rowKeyByReg = s.reg_no ? `reg:${String(s.reg_no).trim()}` : '';
      const row = (sheetState as any)[rowKeyById] || (rowKeyByReg ? (sheetState as any)[rowKeyByReg] : null) || null;
      if (!row || typeof row !== 'object') return { mark: null, max };

      const absent = Boolean((row as any).absent);
      const absentKind = String((row as any).absentKind || 'AL').toUpperCase();
      const q = (row as any).q && typeof (row as any).q === 'object' ? (row as any).q : {};

      let hasAny = false;
      let co5 = 0;
      for (let i = 0; i < MODEL_THEORY_QUESTIONS.length; i++) {
        const def = MODEL_THEORY_QUESTIONS[i];
        const raw = (q as any)[def.key];
        const n = toNumOrNull(raw);
        if (n == null) continue;
        hasAny = true;
        const mark = clamp(n, 0, def.max);
        if (MODEL_THEORY_CO_ROW[i] === 5) co5 += mark;
      }

      if (!hasAny) {
        // Align with MODEL entry UX: Absent(AL) behaves like 0.
        if (absent && absentKind === 'AL') return { mark: 0, max };
        return { mark: null, max };
      }

      if (absent && absentKind === 'AL') return { mark: 0, max };
      return { mark: clamp(co5, 0, max), max };
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
      if (!absent) {
        let c1 = 0;
        let c2 = 0;
        let hasAny = false;
        ciaQuestions.forEach((qq, idx) => {
          const raw = q?.[qq.key];
          const mark0 = toNumOrNull(raw);
          if (mark0 == null) return;
          hasAny = true;
          const mark = clamp(mark0, 0, Number(qq.max) || mark0);
          const w = effectiveCoWeightsForQuestion(ciaQuestions, idx);
          c1 += mark * w.co1;
          c2 += mark * w.co2;
        });
        if (hasAny) {
          ciaCo1 = clamp(c1, 0, maxes.cia1.co1);
          ciaCo2 = clamp(c2, 0, maxes.cia1.co2);
        }
      }

      const c2row = cia2ById[String(s.id)] || {};
      const absent2 = Boolean(c2row?.absent);
      const q2 = c2row?.q && typeof c2row.q === 'object' ? c2row.q : {};
      let ciaCo3: number | null = null;
      let ciaCo4: number | null = null;
      if (!absent2) {
        let c3 = 0;
        let c4 = 0;
        let hasAny2 = false;
        cia2QuestionsEff.forEach((qq, idx) => {
          const raw = q2?.[qq.key];
          const mark0 = toNumOrNull(raw);
          if (mark0 == null) return;
          hasAny2 = true;
          const mark = clamp(mark0, 0, Number(qq.max) || mark0);
          const w = effectiveCoWeightsForQuestion34(cia2QuestionsEff, idx);
          c3 += mark * w.co3;
          c4 += mark * w.co4;
        });
        if (hasAny2) {
          ciaCo3 = clamp(c3, 0, maxes.cia2.co3);
          ciaCo4 = clamp(c4, 0, maxes.cia2.co4);
        }
      }

      const model = showTheoryCo5 && theoryEnabled.model ? getModelTheoryCo5(s) : { mark: null, max: MODEL_THEORY_CO5_MAX };

      out.set(s.id, {
        ssaCo1,
        ssaCo2,
        ssaCo3,
        ssaCo4,
        ciaCo1,
        ciaCo2,
        ciaCo3,
        ciaCo4,
        f1Co1,
        f1Co2,
        f2Co3,
        f2Co4,
        modelCo5: model.mark,
        modelCo5Max: model.max,
      });
    }

    return out;
  }, [published, publishedLab, publishedTcplLab, students, maxes, cia1Questions, isLabCourse, classType, courseId, selectedTaId, showTheoryCo5, theoryEnabled.model]);

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
    const f1MaxCo1 = isTcplCourse ? (tcplLabMaxes?.lab1?.a ?? maxes.f1.co1) : maxes.f1.co1;
    const f1MaxCo2 = isTcplCourse ? (tcplLabMaxes?.lab1?.b ?? maxes.f1.co2) : maxes.f1.co2;
    const f2MaxCo3 = isTcplCourse ? (tcplLabMaxes?.lab2?.a ?? maxes.f2.co3) : maxes.f2.co3;
    const f2MaxCo4 = isTcplCourse ? (tcplLabMaxes?.lab2?.b ?? maxes.f2.co4) : maxes.f2.co4;

    const co1 = (theoryEnabled.ssa1 ? maxes.ssa1.co1 : 0) + (theoryEnabled.cia1 ? maxes.cia1.co1 : 0) + (theoryEnabled.formative1 ? f1MaxCo1 : 0);
    const co2 = (theoryEnabled.ssa1 ? maxes.ssa1.co2 : 0) + (theoryEnabled.cia1 ? maxes.cia1.co2 : 0) + (theoryEnabled.formative1 ? f1MaxCo2 : 0);
    const co3 = (theoryEnabled.ssa2 ? maxes.ssa2.co3 : 0) + (theoryEnabled.cia2 ? maxes.cia2.co3 : 0) + (theoryEnabled.formative2 ? f2MaxCo3 : 0);
    const co4 = (theoryEnabled.ssa2 ? maxes.ssa2.co4 : 0) + (theoryEnabled.cia2 ? maxes.cia2.co4 : 0) + (theoryEnabled.formative2 ? f2MaxCo4 : 0);
    const co5 = showTheoryCo5 && theoryEnabled.model ? theoryCo5Weightage : 0;
    const total = co1 + co2 + co3 + co4 + co5;

    return { f1MaxCo1, f1MaxCo2, f2MaxCo3, f2MaxCo4, co1, co2, co3, co4, co5, total };
  }, [isTcplCourse, tcplLabMaxes, maxes, theoryEnabled, showTheoryCo5, theoryEnabled.model, theoryCo5Weightage]);

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
        !showTheoryCo5 || !theoryEnabled.model || modelCo5Raw == null || !modelCo5Max || !co5MaxTotal
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
        ...(showTheoryCo5 && theoryEnabled.model ? [{ enabled: co5MaxTotal > 0, v: co5 }] : []),
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
  }, [students, byStudentId, maxes, weights, theoryEnabled, showTheoryCo5, theoryCo5Weightage, theoryCoMaxTotals, isLabCourse, labCoMaxes, publishedLab]);

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
      ...(showTheoryCo5 && theoryEnabled.model ? { co5Avg3pt: avg(co5Vals) } : {}),
    };
  }, [computedRows, students.length, isLabCourse, showTheoryCo5, theoryEnabled.model]);

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

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    width: 90,
  };

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
                {tas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.section_name} ({t.academic_year})
                  </option>
                ))}
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
                    &nbsp;CO1: <b>{labCoMaxes.co1}</b> | CO2: <b>{labCoMaxes.co2}</b> | CO3: <b>{labCoMaxes.co3}</b> | CO4: <b>{labCoMaxes.co4}</b> | CO5: <b>{labCoMaxes.co5}</b>
                  </>
                ) : (
                  <> Each CO max is <b>{labCoMax}</b>.</>
                )}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                Batch strength: <b>{summary.strength}</b>
                &nbsp;|&nbsp; CO1 avg (3pt): <b>{(summary as any).co1Avg3pt ?? '-'}</b>
                &nbsp;|&nbsp; CO2 avg (3pt): <b>{(summary as any).co2Avg3pt ?? '-'}</b>
                &nbsp;|&nbsp; CO3 avg (3pt): <b>{(summary as any).co3Avg3pt ?? '-'}</b>
                &nbsp;|&nbsp; CO4 avg (3pt): <b>{(summary as any).co4Avg3pt ?? '-'}</b>
                &nbsp;|&nbsp; CO5 avg (3pt): <b>{(summary as any).co5Avg3pt ?? '-'}</b>
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
                CO1 total max: <b>{theoryCoMaxTotals.co1}</b> &nbsp;|&nbsp; CO2 total max: <b>{theoryCoMaxTotals.co2}</b>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e9f0f7', padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ fontWeight: 800, color: '#0b3b57', marginBottom: 8 }}>Weights (R4:R6)</div>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  Source: <b>{weightsSource === 'server' ? 'IQAC (server)' : weightsSource === 'local' ? 'IQAC (local)' : 'Defaults'}</b>
                </div>
              </div>
              {lastWeightsDebug && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>{lastWeightsDebug}</div>
              )}
              {lastWeightsFetchError && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>Weights load error: {lastWeightsFetchError}</div>
              )}
              {remoteWeightsCount != null && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>Known class-types on server/local: {remoteWeightsCount}</div>
              )}
              <div style={{ marginTop: 6 }}>
                <button
                  onClick={() => setShowRawMapping((s) => !s)}
                  style={{ background: 'transparent', border: 'none', color: '#0b66a3', cursor: 'pointer', padding: 0, fontSize: 12 }}
                >
                  {showRawMapping ? 'Hide' : 'Show'} raw IQAC mapping
                </button>
              </div>
              {showRawMapping && (
                <pre style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', background: '#0f1724', color: '#e6eef8', padding: 10, borderRadius: 8 }}>
                  {JSON.stringify(globalWeightsRef.current || {}, null, 2).slice(0, 3200)}
                </pre>
              )}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                  SSA1
                  <input
                    type="number"
                    step="0.1"
                    value={weights.ssa1}
                    onChange={(e) => setWeights((p) => ({ ...p, ssa1: Number(e.target.value) }))}
                    disabled={!isIqac}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                  CIA1
                  <input
                    type="number"
                    step="0.1"
                    value={weights.cia1}
                    onChange={(e) => setWeights((p) => ({ ...p, cia1: Number(e.target.value) }))}
                    disabled={!isIqac}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                  Formative1
                  <input
                    type="number"
                    step="0.1"
                    value={weights.formative1}
                    onChange={(e) => setWeights((p) => ({ ...p, formative1: Number(e.target.value) }))}
                    disabled={!isIqac}
                    style={inputStyle}
                  />
                </label>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                Batch strength: <b>{summary.strength}</b> &nbsp;|&nbsp; CO1 avg (3pt): <b>{summary.co1Avg3pt ?? '-'}</b> &nbsp;|&nbsp; CO2 avg (3pt): <b>{summary.co2Avg3pt ?? '-'}</b>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                Note: CIA1 CO marks are computed from the locally saved CIA1 question-wise sheet.
              </div>
            </div>
          </div>
        )}

        {/* Weights Configuration - Show for all course types */}
        <div style={{ marginTop: 12 }}>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e9f0f7', padding: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 800, color: '#0b3b57', marginBottom: 8 }}>Assessment Weights</div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                Class Type: <b>{classType || 'Unknown'}</b> |
                Source: <b>{weightsSource === 'server' ? 'IQAC (server)' : weightsSource === 'local' ? 'IQAC (local)' : 'Defaults'}</b>
              </div>
            </div>
            {lastWeightsDebug && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>{lastWeightsDebug}</div>
            )}
            {lastWeightsFetchError && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>Weights load error: {lastWeightsFetchError}</div>
            )}
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => setShowRawMapping((s) => !s)}
                style={{ background: 'transparent', border: 'none', color: '#0b66a3', cursor: 'pointer', padding: 0, fontSize: 12 }}
              >
                {showRawMapping ? 'Hide' : 'Show'} raw IQAC mapping
              </button>
            </div>
            {showRawMapping && (
              <pre style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', background: '#0f1724', color: '#e6eef8', padding: 10, borderRadius: 8 }}>
                {JSON.stringify(globalWeightsRef.current || {}, null, 2).slice(0, 3200)}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                SSA1 Weight
                <input
                  type="number"
                  step="0.1"
                  value={weights.ssa1}
                  onChange={(e) => setWeights((p) => ({ ...p, ssa1: Number(e.target.value) }))}
                  disabled={!isIqac}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                CIA1 Weight
                <input
                  type="number"
                  step="0.1"
                  value={weights.cia1}
                  onChange={(e) => setWeights((p) => ({ ...p, cia1: Number(e.target.value) }))}
                  disabled={!isIqac}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                Formative1 Weight
                <input
                  type="number"
                  step="0.1"
                  value={weights.formative1}
                  onChange={(e) => setWeights((p) => ({ ...p, formative1: Number(e.target.value) }))}
                  disabled={!isIqac}
                  style={inputStyle}
                />
              </label>
              {showTheoryCo5 && theoryEnabled.model && (
                <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                  CO5 Weightage (MODEL)
                  <input
                    type="number"
                    step="1"
                    value={theoryCo5Weightage}
                    onChange={(e) => setTheoryCo5Weightage(Number(e.target.value))}
                    disabled={!isIqac}
                    style={inputStyle}
                  />
                </label>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              These weights determine how SSA1, CIA1, and Formative1 assessments contribute to CO attainment calculations.
              {!isIqac && <span style={{ color: '#059669', fontWeight: 600 }}> Values shown are appropriate defaults for {classType || 'this'} class type.</span>}
            </div>
          </div>
        </div>
      </div>

      {rosterError && (
        <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10 }}>
          {rosterError}
        </div>
      )}

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
                  <th colSpan={3} style={thGroup}>CO1</th>
                  <th colSpan={3} style={thGroup}>CO2</th>
                  <th colSpan={3} style={thGroup}>CO3</th>
                  <th colSpan={3} style={thGroup}>CO4</th>
                  <th colSpan={3} style={thGroup}>CO5</th>
                  <th colSpan={2} style={thGroup}>BTL-1</th>
                  <th colSpan={2} style={thGroup}>BTL-2</th>
                  <th colSpan={2} style={thGroup}>BTL-3</th>
                  <th colSpan={2} style={thGroup}>BTL-4</th>
                  <th colSpan={2} style={thGroup}>BTL-5</th>
                  <th colSpan={2} style={thGroup}>BTL-6</th>
                  <th rowSpan={2} style={thSticky}>Total / {round1(labCoMaxes?.total ?? labCoMax * 5)}</th>
                </tr>
                <tr>
                  <th style={thSticky}>{labCoMaxes?.co1 ?? labCoMax}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>3pt</th>
                  <th style={thSticky}>{labCoMaxes?.co2 ?? labCoMax}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>3pt</th>
                  <th style={thSticky}>{labCoMaxes?.co3 ?? labCoMax}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>3pt</th>
                  <th style={thSticky}>{labCoMaxes?.co4 ?? labCoMax}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>3pt</th>
                  <th style={thSticky}>{labCoMaxes?.co5 ?? labCoMax}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>3pt</th>

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

                    <td style={{ ...td, textAlign: 'center' }}>{r.co1 == null ? '' : round1(r.co1)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co1Pct == null ? '' : r.co1Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co1_3pt == null ? '' : r.co1_3pt}</td>

                    <td style={{ ...td, textAlign: 'center' }}>{r.co2 == null ? '' : round1(r.co2)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co2Pct == null ? '' : r.co2Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co2_3pt == null ? '' : r.co2_3pt}</td>

                    <td style={{ ...td, textAlign: 'center' }}>{r.co3 == null ? '' : round1(r.co3)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co3Pct == null ? '' : r.co3Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co3_3pt == null ? '' : r.co3_3pt}</td>

                    <td style={{ ...td, textAlign: 'center' }}>{r.co4 == null ? '' : round1(r.co4)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co4Pct == null ? '' : r.co4Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co4_3pt == null ? '' : r.co4_3pt}</td>

                    <td style={{ ...td, textAlign: 'center' }}>{r.co5 == null ? '' : round1(r.co5)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co5Pct == null ? '' : r.co5Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co5_3pt == null ? '' : r.co5_3pt}</td>

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
                  <th colSpan={3} style={thGroup}>CO1</th>
                  <th colSpan={3} style={thGroup}>CO2</th>
                  <th colSpan={3} style={thGroup}>CO3</th>
                  <th colSpan={3} style={thGroup}>CO4</th>
                  {showTheoryCo5 && theoryEnabled.model && (
                    <th colSpan={3} style={thGroup}>CO5</th>
                  )}
                  <th
                    rowSpan={2}
                    style={thSticky}
                  >
                    Total / {theoryCoMaxTotals.total}
                  </th>
                </tr>
                <tr>
                  <th style={thSticky}>{theoryCoMaxTotals.co1}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>3pt</th>
                  <th style={thSticky}>{theoryCoMaxTotals.co2}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>3pt</th>
                  <th style={thSticky}>{theoryCoMaxTotals.co3}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>3pt</th>
                  <th style={thSticky}>{theoryCoMaxTotals.co4}</th>
                  <th style={thSticky}>%</th>
                  <th style={thSticky}>3pt</th>
                  {showTheoryCo5 && theoryEnabled.model && (
                    <>
                      <th style={thSticky}>{theoryCo5Weightage}</th>
                      <th style={thSticky}>%</th>
                      <th style={thSticky}>3pt</th>
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
                    <td style={{ ...td, textAlign: 'center' }}>{r.co1 == null ? '' : round1(r.co1)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co1Pct == null ? '' : r.co1Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co1_3pt == null ? '' : r.co1_3pt}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co2 == null ? '' : round1(r.co2)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co2Pct == null ? '' : r.co2Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co2_3pt == null ? '' : r.co2_3pt}</td>

                    <td style={{ ...td, textAlign: 'center' }}>{r.co3 == null ? '' : round1(r.co3)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co3Pct == null ? '' : r.co3Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co3_3pt == null ? '' : r.co3_3pt}</td>

                    <td style={{ ...td, textAlign: 'center' }}>{r.co4 == null ? '' : round1(r.co4)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co4Pct == null ? '' : r.co4Pct}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.co4_3pt == null ? '' : r.co4_3pt}</td>

                    {showTheoryCo5 && theoryEnabled.model && (
                      <>
                        <td style={{ ...td, textAlign: 'center' }}>{r.co5 == null ? '' : round1(r.co5)}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{r.co5Pct == null ? '' : r.co5Pct}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{r.co5_3pt == null ? '' : r.co5_3pt}</td>
                      </>
                    )}

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
