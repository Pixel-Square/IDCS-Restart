import React, { useEffect, useMemo, useState } from 'react';

import {
  fetchClassTypeWeights,
  fetchDraft,
  fetchIqacQpPattern,
  fetchMyTeachingAssignments,
  fetchPublishedCiaSheet,
  fetchPublishedFormative,
  fetchPublishedLabSheet,
  fetchPublishedModelSheet,
  fetchPublishedReview1,
  fetchPublishedReview2,
  fetchPublishedSsa1,
  fetchPublishedSsa2,
  TeachingAssignmentItem,
} from '../services/obe';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import fetchWithAuth from '../services/fetchAuth';
import { fetchDeptRow, fetchDeptRows, fetchMasters } from '../services/curriculum';
import { lsGet, lsSet } from '../utils/localStorage';
import { normalizeClassType } from '../constants/classTypes';

type Props = { courseId: string; enabledAssessments?: string[] | null };

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type QuestionDef = { key: string; max: number; co: 1 | 2 | '1&2' };
type QuestionDef34 = { key: string; max: number; co: 3 | 4 | '3&4' };

type IqacPattern = { marks: number[]; cos?: Array<number | string> };

const DEFAULT_INTERNAL_MAPPING = {
  // CO1/CO2 are split like CO3/CO4: ssa/cia/fa columns.
  header: ['CO1', 'CO1', 'CO1', 'CO2', 'CO2', 'CO2', 'CO3', 'CO3', 'CO3', 'CO4', 'CO4', 'CO4', 'CO1', 'CO2', 'CO3', 'CO4', 'CO5'],
  weights: [1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0],
  cycles: ['ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ME', 'ME', 'ME', 'ME', 'ME'],
};

const DEFAULT_CIA1_QUESTIONS: QuestionDef[] = [
  { key: 'q1', max: 2, co: 1 },
  { key: 'q2', max: 2, co: 1 },
  { key: 'q3', max: 2, co: 1 },
  { key: 'q4', max: 2, co: 2 },
  { key: 'q5', max: 2, co: 2 },
  { key: 'q6', max: 2, co: 2 },
  { key: 'q7', max: 16, co: 1 },
  { key: 'q8', max: 16, co: 2 },
  { key: 'q9', max: 16, co: '1&2' },
];

const DEFAULT_CIA2_QUESTIONS: QuestionDef34[] = [
  { key: 'q1', max: 2, co: 3 },
  { key: 'q2', max: 2, co: 3 },
  { key: 'q3', max: 2, co: 3 },
  { key: 'q4', max: 2, co: 4 },
  { key: 'q5', max: 2, co: 4 },
  { key: 'q6', max: 2, co: 4 },
  { key: 'q7', max: 16, co: 3 },
  { key: 'q8', max: 16, co: 4 },
  { key: 'q9', max: 16, co: '3&4' },
];

// Same model (theory) sheet template mapping used in CO Attainment.
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toNumOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function effectiveCoWeights12(co: 1 | 2 | '1&2') {
  if (co === '1&2') return { co1: 0.5, co2: 0.5 };
  return co === 2 ? { co1: 0, co2: 1 } : { co1: 1, co2: 0 };
}

function effectiveCoWeights34(co: 3 | 4 | '3&4') {
  if (co === '3&4') return { co3: 0.5, co4: 0.5 };
  return co === 4 ? { co3: 0, co4: 1 } : { co3: 1, co4: 0 };
}

function parseCo12(raw: unknown): 1 | 2 | '1&2' {
  if (raw === 'both') return '1&2';
  if (raw === '1&2') return '1&2';
  if (Array.isArray(raw)) {
    const vals = raw.map((x) => String(x ?? '').trim().toUpperCase());
    if (vals.some((v) => v === 'BOTH')) return '1&2';
    const has1 = vals.some((v) => v === '1' || v === 'CO1');
    const has2 = vals.some((v) => v === '2' || v === 'CO2');
    if (has1 && has2) return '1&2';
    if (has2) return 2;
    return 1;
  }
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase();
    if (s === 'BOTH') return '1&2';
    if (s === '1&2' || s === '1,2' || s === '1/2' || s === '2/1' || s === 'CO1&CO2' || s === 'CO1,CO2') return '1&2';
    if (s === '2' || s === 'CO2') return 2;
    if (s === '1' || s === 'CO1') return 1;
  }
  const n = Number(raw);
  if (n === 2) return 2;
  if (n === 12) return '1&2';
  return 1;
}

function parseCo34(raw: unknown): 3 | 4 | '3&4' {
  if (raw === 'both') return '3&4';
  if (raw === '3&4') return '3&4';
  if (Array.isArray(raw)) {
    const vals = raw.map((x) => String(x ?? '').trim().toUpperCase());
    if (vals.some((v) => v === 'BOTH')) return '3&4';
    // Legacy configs sometimes tag CIA2 as 1/2.
    const hasLegacy1 = vals.some((v) => v === '1' || v === 'CO1');
    const hasLegacy2 = vals.some((v) => v === '2' || v === 'CO2');
    const has3 = vals.some((v) => v === '3' || v === 'CO3');
    const has4 = vals.some((v) => v === '4' || v === 'CO4');
    if (has3 && has4) return '3&4';
    if (hasLegacy1 && hasLegacy2) return '3&4';
    if (has4) return 4;
    if (hasLegacy2) return 4;
    return 3;
  }
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase();
    if (s === 'BOTH') return '3&4';
    // Treat CIA2 legacy 1/2 tagging as 3/4.
    if (s === '1&2' || s === '1,2' || s === '1/2' || s === '2/1' || s === 'CO1&CO2' || s === 'CO1,CO2') return '3&4';
    if (s === '3&4' || s === '3,4' || s === '3/4' || s === '4/3' || s === 'CO3&CO4' || s === 'CO3,CO4') return '3&4';
    if (s === '4' || s === 'CO4') return 4;
    if (s === '3' || s === 'CO3') return 3;
    if (s === '2' || s === 'CO2') return 4;
    if (s === '1' || s === 'CO1') return 3;
  }
  const n = Number(raw);
  if (n === 4) return 4;
  if (n === 34) return '3&4';
  if (n === 2) return 4;
  if (n === 1) return 3;
  if (n === 12) return '3&4';
  return 3;
}

function effectiveCoWeights12ForQuestion(questions: QuestionDef[], idx: number) {
  const q = questions[idx];
  if (!q) return { co1: 0, co2: 0 };
  if (q.co === '1&2') return { co1: 0.5, co2: 0.5 };
  const hasAnySplit = questions.some((x) => x.co === '1&2');
  const isLast = idx === questions.length - 1;
  const looksLikeQ9 = String(q.key || '').trim().toLowerCase() === 'q9';
  if (!hasAnySplit && isLast && looksLikeQ9) return { co1: 0.5, co2: 0.5 };
  return effectiveCoWeights12(q.co);
}

function effectiveCoWeights34ForQuestion(questions: QuestionDef34[], idx: number) {
  const q = questions[idx];
  if (!q) return { co3: 0, co4: 0 };
  if (q.co === '3&4') return { co3: 0.5, co4: 0.5 };
  const hasAnySplit = questions.some((x) => x.co === '3&4');
  const isLast = idx === questions.length - 1;
  const looksLikeQ9 = String(q.key || '').trim().toLowerCase() === 'q9';
  if (!hasAnySplit && isLast && looksLikeQ9) return { co3: 0.5, co4: 0.5 };
  return effectiveCoWeights34(q.co);
}

function weightedOutOf(args: {
  ssaMark: number | null;
  ciaMark: number | null;
  faMark: number | null;
  ssaMax: number;
  ciaMax: number;
  faMax: number;
  ssaW: number;
  ciaW: number;
  faW: number;
  outOf: number;
}): number | null {
  const { ssaMark, ciaMark, faMark, ssaMax, ciaMax, faMax, ssaW, ciaW, faW, outOf } = args;
  const items: Array<{ mark: number | null; max: number; w: number }> = [
    { mark: ssaMark, max: ssaMax, w: ssaW },
    { mark: ciaMark, max: ciaMax, w: ciaW },
    { mark: faMark, max: faMax, w: faW },
  ].filter((x) => Number(x.w || 0) > 0);

  if (!items.length) return null;
  if (!outOf || !Number.isFinite(outOf)) return null;
  if (items.some((it) => it.mark == null)) return null;
  if (items.some((it) => !it.max || !Number.isFinite(it.max))) return null;
  const sumW = items.reduce((s, it) => s + it.w, 0);
  if (!sumW) return null;
  const frac = items.reduce((s, it) => s + ((it.mark as number) / it.max) * it.w, 0) / sumW;
  const out = frac * outOf;
  return Number.isFinite(out) ? clamp(out, 0, outOf) : null;
}

function splitCycleWeight(total: number, ssaW: number, ciaW: number, faW: number): [number, number, number] {
  const t = Number(total);
  const s = Number(ssaW);
  const c = Number(ciaW);
  const f = Number(faW);
  const sum = (Number.isFinite(s) ? s : 0) + (Number.isFinite(c) ? c : 0) + (Number.isFinite(f) ? f : 0);
  if (!Number.isFinite(t) || t <= 0 || !sum) return [0, 0, 0];
  const a = round2((t * (s || 0)) / sum);
  const b = round2((t * (c || 0)) / sum);
  const d = round2((t * (f || 0)) / sum);
  return [a, b, d];
}

type InternalSchema = {
  visible: number[];
  header: string[];
  cycles: string[];
  labels: string[];
};

function buildInternalSchema(classType: string | null, enabledSet: Set<string>): InternalSchema {
  const ct = normalizeClassType(classType);
  const allHeader = DEFAULT_INTERNAL_MAPPING.header;
  const allCycles = DEFAULT_INTERNAL_MAPPING.cycles;
  const allLabels = [
    'CO1-SSA',
    'CO1-CIA',
    'CO1-FA',
    'CO2-SSA',
    'CO2-CIA',
    'CO2-FA',
    'CO3-SSA',
    'CO3-CIA',
    'CO3-FA',
    'CO4-SSA',
    'CO4-CIA',
    'CO4-FA',
    'ME-CO1',
    'ME-CO2',
    'ME-CO3',
    'ME-CO4',
    'ME-CO5',
  ];

  // Default: show all 17 columns (theory-like schema)
  let visible = Array.from({ length: 17 }, (_, i) => i);
  let cycles = [...allCycles];
  let labels = [...allLabels];

  if (ct === 'TCPR') {
    // TCPR uses Review1/Review2 instead of Formatives.
    cycles = cycles.map((c, idx) => {
      if (idx === 2 || idx === 5 || idx === 8 || idx === 11) return 'review';
      return c;
    });
    labels = labels.map((l, idx) => {
      if (idx === 2 || idx === 5 || idx === 8 || idx === 11) return l.replace('-FA', '-Review');
      return l;
    });
  }

  if (ct === 'TCPL') {
    // TCPL uses LAB1/LAB2 stored under formative1/formative2.
    cycles = cycles.map((c, idx) => {
      if (idx === 2 || idx === 5 || idx === 8 || idx === 11) return 'lab';
      return c;
    });
    labels = labels.map((l, idx) => {
      if (idx === 2 || idx === 5) return l.replace('-FA', '-LAB1');
      if (idx === 8 || idx === 11) return l.replace('-FA', '-LAB2');
      return l;
    });
  }

  if (ct === 'LAB' || ct === 'PRACTICAL') {
    // Only CIA (lab-style) + MODEL(CO5) are used.
    visible = [1, 4, 7, 10, 16];
    const header = ['CO1', 'CO2', 'CO3', 'CO4', 'ME'];
    const cyc = ['CIA 1', 'CIA 1', 'CIA 2', 'CIA 2', 'MODEL'];
    const lab = ['CO1-CIA1', 'CO2-CIA1', 'CO3-CIA2', 'CO4-CIA2', 'ME-CO5'];
    return { visible, header, cycles: cyc, labels: lab };
  }

  if (ct === 'SPECIAL' && enabledSet.size) {
    // SPECIAL has only the enabled subset of SSA/CIA/Formative and no MODEL.
    const allowed: number[] = [];
    const pushIf = (cond: boolean, idxs: number[]) => {
      if (cond) for (const i of idxs) allowed.push(i);
    };
    pushIf(enabledSet.has('ssa1'), [0, 3]);
    pushIf(enabledSet.has('cia1'), [1, 4]);
    pushIf(enabledSet.has('formative1'), [2, 5]);
    pushIf(enabledSet.has('ssa2'), [6, 9]);
    pushIf(enabledSet.has('cia2'), [7, 10]);
    pushIf(enabledSet.has('formative2'), [8, 11]);
    visible = allowed;
  }

  const header = visible.map((i) => allHeader[i]);
  const cyc = visible.map((i) => cycles[i]);
  const lab = visible.map((i) => labels[i]);
  return { visible, header, cycles: cyc, labels: lab };
}

export default function InternalMarkCoursePage({ courseId, enabledAssessments }: Props): JSX.Element {
  const enabledSet = useMemo(() => new Set((enabledAssessments || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)), [enabledAssessments]);

  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);
  const [taError, setTaError] = useState<string | null>(null);

  const [classType, setClassType] = useState<string | null>(null);

  const [masterCfg, setMasterCfg] = useState<any>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [weights, setWeights] = useState<{ ssa1: number; cia1: number; formative1: number }>({ ssa1: 1.5, cia1: 3, formative1: 2.5 });
  const [internalMarkWeights, setInternalMarkWeights] = useState<number[]>([...DEFAULT_INTERNAL_MAPPING.weights]);

  const [published, setPublished] = useState<{ ssa1: Record<string, any>; ssa2: Record<string, any>; f1: Record<string, any>; f2: Record<string, any>; cia1: any | null; cia2: any | null }>({
    ssa1: {},
    ssa2: {},
    f1: {},
    f2: {},
    cia1: null,
    cia2: null,
  });

  const [publishedReview, setPublishedReview] = useState<{ r1: Record<string, any>; r2: Record<string, any> }>({ r1: {}, r2: {} });
  const [publishedLab, setPublishedLab] = useState<{ cia1: any | null; cia2: any | null; model: any | null }>({
    cia1: null,
    cia2: null,
    model: null,
  });
  const [publishedTcplLab, setPublishedTcplLab] = useState<{ lab1: any | null; lab2: any | null }>({ lab1: null, lab2: null });
  const [publishedModel, setPublishedModel] = useState<any | null>(null);

  const [iqacCiaPattern, setIqacCiaPattern] = useState<{ cia1: IqacPattern | null; cia2: IqacPattern | null }>({ cia1: null, cia2: null });
  const [iqacModelPattern, setIqacModelPattern] = useState<IqacPattern | null>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

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
        let filtered = (all || []).filter((a) => String(a.subject_code) === String(courseId));
        
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
        const stored = lsGet<number>(`internalMark_selectedTa_${courseId}`);
        const initial = (typeof stored === 'number' && filtered.some((f) => f.id === stored) ? stored : filtered[0]?.id) ?? null;
        setSelectedTaId(initial);
        setTaError(null);
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
    lsSet(`internalMark_selectedTa_${courseId}`, selectedTaId);
  }, [courseId, selectedTaId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ta = (tas || []).find((t) => t.id === selectedTaId) || null;
        const curriculumRowId = (ta as any)?.curriculum_row_id;
        if (!curriculumRowId) {
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
        }
        const row = await fetchDeptRow(Number(curriculumRowId));
        if (!mounted) return;
        setClassType((row as any)?.class_type ?? null);
      } catch {
        if (mounted) setClassType(null);
      }
    })();
    return () => { mounted = false; };
  }, [tas, selectedTaId, courseId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ct = normalizeClassType(classType);
        const applyWeights = (w: any) => {
          if (!w || typeof w !== 'object') return false;
          const ssa1W = Number.isFinite(Number(w.ssa1)) ? Number(w.ssa1) : 1.5;
          const cia1W = Number.isFinite(Number(w.cia1)) ? Number(w.cia1) : 3;
          const fa1W = Number.isFinite(Number(w.formative1)) ? Number(w.formative1) : 2.5;
          setWeights({ ssa1: ssa1W, cia1: cia1W, formative1: fa1W });

          const im = (w as any).internal_mark_weights;
          if (Array.isArray(im) && im.length) {
            let arr = im.map((x: any) => {
              const n = Number(x);
              return Number.isFinite(n) ? n : 0;
            });

            // Backward compatibility: old format had 13 weights with CO1/CO2 as a single "cycle 1" column.
            // New format has 17 weights with CO1/CO2 split into ssa/cia/fa.
            if (arr.length === 13 && DEFAULT_INTERNAL_MAPPING.weights.length === 17) {
              const [co1Ssa, co1Cia, co1Fa] = splitCycleWeight(arr[0] || 0, ssa1W, cia1W, fa1W);
              const [co2Ssa, co2Cia, co2Fa] = splitCycleWeight(arr[1] || 0, ssa1W, cia1W, fa1W);
              arr = [co1Ssa, co1Cia, co1Fa, co2Ssa, co2Cia, co2Fa, ...arr.slice(2)];
            }

            while (arr.length < DEFAULT_INTERNAL_MAPPING.weights.length) arr.push(DEFAULT_INTERNAL_MAPPING.weights[arr.length] ?? 0);
            setInternalMarkWeights(arr.slice(0, DEFAULT_INTERNAL_MAPPING.weights.length));
          } else {
            setInternalMarkWeights([...DEFAULT_INTERNAL_MAPPING.weights]);
          }
          return true;
        };

        // Prefer server; fallback to localStorage (used when server save isn't available)
        try {
          const remote = await fetchClassTypeWeights();
          if (!mounted) return;
          const wRemote = (remote && (remote as any)[ct]) || null;
          if (applyWeights(wRemote)) return;
        } catch {
          // ignore
        }

        try {
          const local = lsGet<any>('iqac_class_type_weights');
          const wLocal = (local && (local as any)[ct]) || null;
          if (applyWeights(wLocal)) return;
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [classType]);

  useEffect(() => {
    let mounted = true;
    const loadRoster = async () => {
      if (!selectedTaId) return;
      setLoadingRoster(true);
      setRosterError(null);
      try {
        const ta = (tas || []).find((t) => t.id === selectedTaId) || null;
        if (ta && (ta as any).elective_subject_id && !(ta as any).section_id) {
          const electiveId = (ta as any).elective_subject_id;
          const res = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${encodeURIComponent(String(electiveId))}`);
          if (!res.ok) throw new Error(`Elective-choices fetch failed: ${res.status}`);
          const data = await res.json();
          if (!mounted) return;
          const items = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : (data.items || []);
          const mapped = (items || []).map((s: any) => ({
            id: Number(s.student_id ?? s.id),
            reg_no: String(s.reg_no ?? s.registration_no ?? s.regno ?? ''),
            name: String(s.name ?? s.full_name ?? s.username ?? ''),
            section: s.section_name ?? s.section ?? null,
          }));
          if (!mounted) return;
          setStudents(mapped.filter((s) => Number.isFinite(s.id)).sort(compareStudentName));
        } else {
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
  }, [selectedTaId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingData(true);
      setDataError(null);
      try {
        const ct = normalizeClassType(classType);
        const taId = selectedTaId ?? undefined;
        const isTcpl = ct === 'TCPL';
        const isTcpr = ct === 'TCPR';
        const isLabLike = ct === 'LAB' || ct === 'PRACTICAL';
        const isSpecial = ct === 'SPECIAL' && enabledSet.size;
        const allow = (k: string) => (!isSpecial ? true : enabledSet.has(String(k).toLowerCase()));

        // reset optional snapshots to avoid stale render between class type switches
        setPublishedReview({ r1: {}, r2: {} });
        setPublishedLab({ cia1: null, cia2: null, model: null });
        setPublishedTcplLab({ lab1: null, lab2: null });
        setPublishedModel(null);
        setIqacCiaPattern({ cia1: null, cia2: null });
        setIqacModelPattern(null);

        // Preload IQAC QP patterns (CIA entry uses these to override question maxima/count).
        // Internal Marks must match the same question definitions, especially when drafts exist
        // (draft snapshots don't store `questions`).
        const fetchPattern = async (exam: 'CIA1' | 'CIA2'): Promise<IqacPattern | null> => {
          if (!ct) return null;
          try {
            const r: any = await fetchIqacQpPattern({ class_type: String(ct).toUpperCase(), question_paper_type: null, exam });
            const p = r && (r as any).pattern;
            if (p && Array.isArray(p.marks) && p.marks.length) return p as IqacPattern;
          } catch {
            // ignore and fallback
          }
          try {
            const r: any = await fetchIqacQpPattern({ class_type: String(ct).toUpperCase(), question_paper_type: null, exam: 'CIA' as any });
            const p = r && (r as any).pattern;
            if (p && Array.isArray(p.marks) && p.marks.length) return p as IqacPattern;
          } catch {
            // ignore
          }
          return null;
        };

        try {
          const [p1, p2] = await Promise.all([fetchPattern('CIA1'), fetchPattern('CIA2')]);
          if (mounted) setIqacCiaPattern({ cia1: p1, cia2: p2 });
        } catch {
          if (mounted) setIqacCiaPattern({ cia1: null, cia2: null });
        }

        let ssa1Res: any = null;
        let ssa2Res: any = null;
        let f1Res: any = null;
        let f2Res: any = null;
        let cia1Res: any = null;
        let cia2Res: any = null;

        let review1Res: any = null;
        let review2Res: any = null;

        let labCia1Res: any = null;
        let labCia2Res: any = null;
        let labModelRes: any = null;

        let tcplLab1Res: any = null;
        let tcplLab2Res: any = null;
        let modelRes: any = null;

        if (isLabLike) {
          // LAB / PRACTICAL uses lab-style sheets for CIA1/CIA2/MODEL
          try { const d = await fetchDraft('cia1', courseId, taId); if (d?.draft) labCia1Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          try { const d = await fetchDraft('cia2', courseId, taId); if (d?.draft) labCia2Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          try { const d = await fetchDraft('model', courseId, taId); if (d?.draft) labModelRes = { data: (d.draft as any).data ?? d.draft }; } catch {}
          if (!labCia1Res?.data) {
            try { labCia1Res = await fetchPublishedLabSheet('cia1', courseId, taId); } catch { labCia1Res = null; }
          }
          if (!labCia2Res?.data) {
            try { labCia2Res = await fetchPublishedLabSheet('cia2', courseId, taId); } catch { labCia2Res = null; }
          }
          if (!labModelRes?.data) {
            try { labModelRes = await fetchPublishedModelSheet(courseId, taId); } catch { labModelRes = null; }
          }

          if (!mounted) return;
          setPublishedLab({
            cia1: (labCia1Res as any)?.data ?? null,
            cia2: (labCia2Res as any)?.data ?? null,
            model: (labModelRes as any)?.data ?? null,
          });

          // No SSA/Formative/CIA sheet snapshots needed for lab-like.
          setPublished({ ssa1: {}, ssa2: {}, f1: {}, f2: {}, cia1: null, cia2: null });
          return;
        }

        // Prefer entered/draft marks (staff view), fallback to published.
        if (allow('ssa1')) {
          try {
            const d = await fetchDraft('ssa1', courseId, taId);
            if (d?.draft && (d.draft as any).marks) ssa1Res = { marks: (d.draft as any).marks };
          } catch {}
        }
        if (allow('ssa2')) {
          try {
            const d = await fetchDraft('ssa2', courseId, taId);
            if (d?.draft && (d.draft as any).marks) ssa2Res = { marks: (d.draft as any).marks };
          } catch {}
        }

        if (allow('ssa1') && !ssa1Res?.marks) {
          try { ssa1Res = await fetchPublishedSsa1(courseId, taId); } catch { ssa1Res = null; }
        }
        if (allow('ssa2') && !ssa2Res?.marks) {
          try { ssa2Res = await fetchPublishedSsa2(courseId, taId); } catch { ssa2Res = null; }
        }

        if (isTcpr) {
          try { const d = await fetchDraft('review1', courseId, taId); if (d?.draft && (d.draft as any).marks) review1Res = { marks: (d.draft as any).marks }; } catch {}
          try { const d = await fetchDraft('review2', courseId, taId); if (d?.draft && (d.draft as any).marks) review2Res = { marks: (d.draft as any).marks }; } catch {}
          if (!review1Res?.marks) {
            try { review1Res = await fetchPublishedReview1(courseId); } catch { review1Res = null; }
          }
          if (!review2Res?.marks) {
            try { review2Res = await fetchPublishedReview2(courseId); } catch { review2Res = null; }
          }
          if (!mounted) return;
          setPublishedReview({ r1: review1Res?.marks || {}, r2: review2Res?.marks || {} });
        }

        if (isTcpl) {
          try { const d = await fetchDraft('formative1', courseId, taId); if (d?.draft) tcplLab1Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          try { const d = await fetchDraft('formative2', courseId, taId); if (d?.draft) tcplLab2Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          if (!tcplLab1Res?.data) {
            try { tcplLab1Res = await fetchPublishedLabSheet('formative1', courseId, taId); } catch { tcplLab1Res = null; }
          }
          if (!tcplLab2Res?.data) {
            try { tcplLab2Res = await fetchPublishedLabSheet('formative2', courseId, taId); } catch { tcplLab2Res = null; }
          }

          if (!mounted) return;
          setPublishedTcplLab({ lab1: (tcplLab1Res as any)?.data ?? null, lab2: (tcplLab2Res as any)?.data ?? null });
        } else {
          if (!isTcpr && allow('formative1')) {
            try { const d = await fetchDraft('formative1', courseId, taId); if (d?.draft && (d.draft as any).marks) f1Res = { marks: (d.draft as any).marks }; } catch {}
            if (!f1Res?.marks) {
              try { f1Res = await fetchPublishedFormative('formative1', courseId, taId); } catch { f1Res = null; }
            }
          }
          if (!isTcpr && allow('formative2')) {
            try { const d = await fetchDraft('formative2', courseId, taId); if (d?.draft && (d.draft as any).marks) f2Res = { marks: (d.draft as any).marks }; } catch {}
            if (!f2Res?.marks) {
              try { f2Res = await fetchPublishedFormative('formative2', courseId, taId); } catch { f2Res = null; }
            }
          }
        }

        if (allow('cia1')) {
          try { const d = await fetchDraft('cia1', courseId, taId); if (d?.draft) cia1Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          if (!cia1Res?.data) {
            try { cia1Res = await fetchPublishedCiaSheet('cia1', courseId, taId); } catch { cia1Res = null; }
          }
        }
        if (allow('cia2')) {
          try { const d = await fetchDraft('cia2', courseId, taId); if (d?.draft) cia2Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          if (!cia2Res?.data) {
            try { cia2Res = await fetchPublishedCiaSheet('cia2', courseId, taId); } catch { cia2Res = null; }
          }
        }

        try { const d = await fetchDraft('model', courseId, taId); if (d?.draft) modelRes = { data: (d.draft as any).data ?? d.draft }; } catch {}
        if (!modelRes?.data) {
          try { modelRes = await fetchPublishedModelSheet(courseId, taId); } catch { modelRes = null; }
        }

        try {
          const modelPayload = (modelRes as any)?.data;
          const modelQpTypeRaw = String((modelPayload as any)?.qpType || '').trim().toUpperCase();
          const modelQpType = modelQpTypeRaw === 'QP2' ? 'QP2' : modelQpTypeRaw === 'QP1' ? 'QP1' : null;
          const modelClass = String((ct || '')).toUpperCase();
          const modelPatternRes: any = await fetchIqacQpPattern({
            class_type: modelClass,
            question_paper_type: modelClass === 'THEORY' ? modelQpType : null,
            exam: 'MODEL',
          });
          const pattern = modelPatternRes?.pattern;
          if (pattern && Array.isArray(pattern.marks) && pattern.marks.length) {
            if (mounted) setIqacModelPattern(pattern as IqacPattern);
          }
        } catch {
          // ignore and fallback to defaults
        }

        if (!mounted) return;
        setPublished({
          ssa1: ssa1Res?.marks || {},
          ssa2: ssa2Res?.marks || {},
          f1: (f1Res?.marks || {}) || {},
          f2: (f2Res?.marks || {}) || {},
          cia1: cia1Res?.data || null,
          cia2: cia2Res?.data || null,
        });
        setPublishedModel(modelRes?.data || null);
      } catch (e: any) {
        if (!mounted) return;
        setDataError(e?.message || 'Failed to load marks');
      } finally {
        if (mounted) setLoadingData(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [courseId, classType, enabledSet, selectedTaId]);

  const schema = useMemo(() => buildInternalSchema(classType, enabledSet), [classType, enabledSet]);

  const effMapping = useMemo(() => {
    const weightsArr = Array.isArray(internalMarkWeights) && internalMarkWeights.length ? internalMarkWeights : DEFAULT_INTERNAL_MAPPING.weights;
    const weightsAll = weightsArr.slice(0, DEFAULT_INTERNAL_MAPPING.weights.length);
    while (weightsAll.length < DEFAULT_INTERNAL_MAPPING.weights.length) weightsAll.push(DEFAULT_INTERNAL_MAPPING.weights[weightsAll.length] ?? 0);
    const weights = schema.visible.map((i) => weightsAll[i] ?? 0);
    return { header: schema.header, weights, cycles: schema.cycles, visible: schema.visible, labels: schema.labels };
  }, [internalMarkWeights, schema]);

  const maxTotal = useMemo(() => {
    const w = effMapping.weights.map((x: any) => Number(x) || 0);
    return w.reduce((s, n) => s + n, 0);
  }, [effMapping]);

  const computedRows = useMemo(() => {
    const ct = normalizeClassType(classType);

    // Map the visible weights back into their 0..16 slot positions.
    const wFull = new Array(17).fill(0);
    for (let i = 0; i < effMapping.visible.length; i++) {
      const idx = effMapping.visible[i];
      wFull[idx] = Number(effMapping.weights[i]) || 0;
    }
    const wCo1Ssa = wFull[0] || 0;
    const wCo1Cia = wFull[1] || 0;
    const wCo1Fa = wFull[2] || 0;
    const wCo2Ssa = wFull[3] || 0;
    const wCo2Cia = wFull[4] || 0;
    const wCo2Fa = wFull[5] || 0;
    const wCo3Ssa = wFull[6] || 0;
    const wCo3Cia = wFull[7] || 0;
    const wCo3Fa = wFull[8] || 0;
    const wCo4Ssa = wFull[9] || 0;
    const wCo4Cia = wFull[10] || 0;
    const wCo4Fa = wFull[11] || 0;
    const wMeCo1 = wFull[12] || 0;
    const wMeCo2 = wFull[13] || 0;
    const wMeCo3 = wFull[14] || 0;
    const wMeCo4 = wFull[15] || 0;
    const wMeCo5 = wFull[16] || 0;

    const cia1Snap = published.cia1 && typeof published.cia1 === 'object' ? published.cia1 : null;
    const cia2Snap = published.cia2 && typeof published.cia2 === 'object' ? published.cia2 : null;

    const iqacCia1 = iqacCiaPattern?.cia1;
    const iqacCia2 = iqacCiaPattern?.cia2;
    const masterCia1Questions: QuestionDef[] = Array.isArray(masterCfg?.assessments?.cia1?.questions)
      ? (masterCfg.assessments.cia1.questions as any[])
          .map((q: any) => ({ key: String(q?.key || ''), max: Number(q?.max ?? q?.maxMarks ?? 0), co: parseCo12(q?.co) as any }))
          .filter((q: any) => q.key)
      : [];
    const masterCia2Questions: QuestionDef34[] = Array.isArray(masterCfg?.assessments?.cia2?.questions)
      ? (masterCfg.assessments.cia2.questions as any[])
          .map((q: any) => ({ key: String(q?.key || ''), max: Number(q?.max ?? q?.maxMarks ?? 0), co: parseCo34(q?.co) as any }))
          .filter((q: any) => q.key)
      : [];

    const fromIqacCia1: QuestionDef[] = (iqacCia1 && Array.isArray(iqacCia1.marks) && iqacCia1.marks.length)
      ? iqacCia1.marks
          .map((mx, idx) => {
            const fallback = masterCia1Questions[idx];
            const coRaw = Array.isArray(iqacCia1.cos) ? iqacCia1.cos[idx] : undefined;
            return {
              key: `q${idx + 1}`,
              max: Number(mx) || 0,
              co: (coRaw != null ? parseCo12(coRaw) : (fallback?.co ?? 1)) as any,
            };
          })
          .filter((q) => Boolean(q.key))
      : [];

    const fromIqacCia2: QuestionDef34[] = (iqacCia2 && Array.isArray(iqacCia2.marks) && iqacCia2.marks.length)
      ? iqacCia2.marks
          .map((mx, idx) => {
            const fallback = masterCia2Questions[idx];
            const coRaw = Array.isArray(iqacCia2.cos) ? iqacCia2.cos[idx] : undefined;
            return {
              key: `q${idx + 1}`,
              max: Number(mx) || 0,
              co: (coRaw != null ? parseCo34(coRaw) : (fallback?.co ?? 3)) as any,
            };
          })
          .filter((q) => Boolean(q.key))
      : [];

    const cia1Questions: QuestionDef[] = Array.isArray(cia1Snap?.questions)
      ? cia1Snap.questions.map((q: any) => ({ key: String(q?.key || ''), max: Number(q?.max ?? q?.maxMarks ?? 0), co: parseCo12(q?.co) as any })).filter((q: any) => q.key)
      : (fromIqacCia1.length ? fromIqacCia1 : (masterCia1Questions.length ? masterCia1Questions : DEFAULT_CIA1_QUESTIONS));
    const cia2Questions: QuestionDef34[] = Array.isArray(cia2Snap?.questions)
      ? cia2Snap.questions.map((q: any) => ({ key: String(q?.key || ''), max: Number(q?.max ?? q?.maxMarks ?? 0), co: parseCo34(q?.co) as any })).filter((q: any) => q.key)
      : (fromIqacCia2.length ? fromIqacCia2 : (masterCia2Questions.length ? masterCia2Questions : DEFAULT_CIA2_QUESTIONS));

    const cia1ById: Record<string, any> = cia1Snap?.rowsByStudentId && typeof cia1Snap.rowsByStudentId === 'object' ? cia1Snap.rowsByStudentId : {};
    const cia2ById: Record<string, any> = cia2Snap?.rowsByStudentId && typeof cia2Snap.rowsByStudentId === 'object' ? cia2Snap.rowsByStudentId : {};

    const cia1MaxCo = cia1Questions.reduce((s, q, idx) => {
      const w = effectiveCoWeights12ForQuestion(cia1Questions, idx);
      return s + q.max * w.co1;
    }, 0);
    const cia1MaxCo2 = cia1Questions.reduce((s, q, idx) => {
      const w = effectiveCoWeights12ForQuestion(cia1Questions, idx);
      return s + q.max * w.co2;
    }, 0);
    const cia2MaxCo3 = cia2Questions.reduce((s, q, idx) => {
      const w = effectiveCoWeights34ForQuestion(cia2Questions, idx);
      return s + q.max * w.co3;
    }, 0);
    const cia2MaxCo4 = cia2Questions.reduce((s, q, idx) => {
      const w = effectiveCoWeights34ForQuestion(cia2Questions, idx);
      return s + q.max * w.co4;
    }, 0);

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

    const isTcplCourse = ct === 'TCPL';

    const maxes = {
      ssa1: {
        co1: Number.isFinite(ssa1Co1) ? Math.max(0, ssa1Co1) : 10,
        co2: Number.isFinite(ssa1Co2) ? Math.max(0, ssa1Co2) : 10,
      },
      ssa2: {
        co3: Number.isFinite(ssa2Co3) ? Math.max(0, ssa2Co3) : 10,
        co4: Number.isFinite(ssa2Co4) ? Math.max(0, ssa2Co4) : 10,
      },
      cia1: {
        co1: isTcplCourse
          ? (cia1MaxCo > 0 ? cia1MaxCo : (Number.isFinite(cia1Co1) ? Math.max(0, cia1Co1) : 30))
          : (Number.isFinite(cia1Co1) ? Math.max(0, cia1Co1) : cia1MaxCo),
        co2: isTcplCourse
          ? (cia1MaxCo2 > 0 ? cia1MaxCo2 : (Number.isFinite(cia1Co2) ? Math.max(0, cia1Co2) : 30))
          : (Number.isFinite(cia1Co2) ? Math.max(0, cia1Co2) : cia1MaxCo2),
      },
      cia2: {
        co3: isTcplCourse
          ? (cia2MaxCo3 > 0 ? cia2MaxCo3 : (Number.isFinite(cia2Co3) ? Math.max(0, cia2Co3) : 30))
          : (Number.isFinite(cia2Co3) ? Math.max(0, cia2Co3) : cia2MaxCo3),
        co4: isTcplCourse
          ? (cia2MaxCo4 > 0 ? cia2MaxCo4 : (Number.isFinite(cia2Co4) ? Math.max(0, cia2Co4) : 30))
          : (Number.isFinite(cia2Co4) ? Math.max(0, cia2Co4) : cia2MaxCo4),
      },
      f1: {
        co1: Number.isFinite(f1Co) ? Math.max(0, f1Co) : 10,
        co2: Number.isFinite(f1Co) ? Math.max(0, f1Co) : 10,
      },
      f2: {
        co3: Number.isFinite(f2Co) ? Math.max(0, f2Co) : 10,
        co4: Number.isFinite(f2Co) ? Math.max(0, f2Co) : 10,
      },
      review1: { co1: 15, co2: 15 },
      review2: { co3: 15, co4: 15 },
    };

    const modelIsTcpl = ct === 'TCPL';
    const modelIsTcpr = ct === 'TCPR';
    const modelIsTcplLike = modelIsTcpl || modelIsTcpr;
    const modelPatternMarks = Array.isArray(iqacModelPattern?.marks) ? iqacModelPattern!.marks : null;

    const modelQuestions = (() => {
      if (Array.isArray(modelPatternMarks) && modelPatternMarks.length) {
        return modelPatternMarks.map((mx, idx) => ({ key: `q${idx + 1}`, max: Number(mx) || 0 }));
      }
      if (modelIsTcplLike) {
        const count = modelIsTcpr ? 12 : 15;
        const twoMarkCount = modelIsTcpr ? 8 : 10;
        return Array.from({ length: count }, (_, i) => {
          const idx = i + 1;
          return { key: `q${idx}`, max: idx <= twoMarkCount ? 2 : 16 };
        });
      }
      return MODEL_THEORY_QUESTIONS;
    })();

    const modelCosRow = (() => {
      const cos = Array.isArray(iqacModelPattern?.cos) ? iqacModelPattern!.cos : null;
      if (Array.isArray(cos) && cos.length === modelQuestions.length) {
        return cos.map((v: any) => {
          const n = Number(v);
          if (Number.isFinite(n)) return clamp(Math.round(n), 1, 5);
          const s = String(v ?? '').toUpperCase();
          const m = s.match(/\d+/);
          return m ? clamp(Number(m[0]), 1, 5) : 1;
        });
      }
      if (modelIsTcpr) {
        const base = [1, 1, 2, 2, 3, 3, 4, 4, 1, 2, 3, 4];
        if (modelQuestions.length === base.length) return base;
        return Array.from({ length: modelQuestions.length }, (_, i) => base[i % base.length]);
      }
      if (modelIsTcpl) {
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
      if (modelIsTcpr) {
        return { ...base, co5: base.co5 + 30 };
      }
      if (modelIsTcpl) {
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

    const taKey = String(selectedTaId ?? 'none');
    const modelPayload = publishedModel && typeof publishedModel === 'object' ? publishedModel : null;
    const modelSheet = (() => {
      if (modelPayload) {
        const payloadClassType = normalizeClassType((modelPayload as any)?.classType);
        const payloadTcplLike = payloadClassType === 'TCPL' || payloadClassType === 'TCPR';
        const fromPayload = payloadTcplLike ? (modelPayload as any)?.tcplSheet : (modelPayload as any)?.theorySheet;
        if (fromPayload && typeof fromPayload === 'object') return fromPayload;
      }

      const k1 = `model_theory_sheet_${courseId}_${taKey}`;
      const k2 = `model_theory_sheet_${courseId}_none`;
      const kt1 = `model_tcpl_sheet_${courseId}_${taKey}`;
      const kt2 = `model_tcpl_sheet_${courseId}_none`;
      const kr1 = `model_tcpr_sheet_${courseId}_${taKey}`;
      const kr2 = `model_tcpr_sheet_${courseId}_none`;
      const kLegacy = `model_sheet_${courseId}`;
      const v1 = lsGet<any>(k1);
      if (v1 && typeof v1 === 'object') return v1;
      const v2 = lsGet<any>(k2);
      if (v2 && typeof v2 === 'object') return v2;
      const vt1 = lsGet<any>(kt1);
      if (vt1 && typeof vt1 === 'object') return vt1;
      const vt2 = lsGet<any>(kt2);
      if (vt2 && typeof vt2 === 'object') return vt2;
      const vr1 = lsGet<any>(kr1);
      if (vr1 && typeof vr1 === 'object') return vr1;
      const vr2 = lsGet<any>(kr2);
      if (vr2 && typeof vr2 === 'object') return vr2;
      const v3 = lsGet<any>(kLegacy);
      if (v3 && typeof v3 === 'object') return v3;
      return null;
    })();

    const getModelCoMarks = (s: Student) => {
      const max = modelMaxes;
      if (!modelSheet) return { co1: null, co2: null, co3: null, co4: null, co5: null, max };
      const rowKeyById = `id:${String(s.id)}`;
      const rowKeyByReg = s.reg_no ? `reg:${String(s.reg_no).trim()}` : '';
      const row = (modelSheet as any)[rowKeyById] || (rowKeyByReg ? (modelSheet as any)[rowKeyByReg] : null) || null;
      if (!row || typeof row !== 'object') return { co1: null, co2: null, co3: null, co4: null, co5: null, max };

      const absent = Boolean((row as any).absent);
      const absentKind = String((row as any).absentKind || 'AL').toUpperCase();
      const q = (row as any).q && typeof (row as any).q === 'object' ? (row as any).q : {};
      const labRaw = toNumOrNull((row as any).lab);

      let hasAny = false;
      const sums = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };
      for (let i = 0; i < modelQuestions.length; i++) {
        const def = modelQuestions[i];
        const raw = (q as any)[def.key];
        const n = toNumOrNull(raw);
        if (n == null) continue;
        hasAny = true;
        const mark = clamp(n, 0, def.max);
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
        if (modelIsTcpr) {
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

      if (!hasAny) {
        if (absent && absentKind === 'AL') return { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0, max };
        return { co1: null, co2: null, co3: null, co4: null, co5: null, max };
      }
      if (absent && absentKind === 'AL') return { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0, max };
      return {
        co1: clamp(sums.co1, 0, max.co1),
        co2: clamp(sums.co2, 0, max.co2),
        co3: clamp(sums.co3, 0, max.co3),
        co4: clamp(sums.co4, 0, max.co4),
        co5: clamp(sums.co5, 0, max.co5),
        max,
      };
    };

    const scale = (mark: number | null, max: number, outOf: number) => {
      if (mark == null) return null;
      if (!max || !Number.isFinite(max)) return null;
      return clamp((mark / max) * outOf, 0, outOf);
    };

    // LAB/PRACTICAL: compute from lab-style sheets only
    if (ct === 'LAB' || ct === 'PRACTICAL') {
      const HALF = 30 / 2;
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

        const normalizeMarksArray = (raw: any, expCount: number) => {
          if (Array.isArray(raw)) return raw.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null));
          if (raw == null) return [];
          return [];
        };
        const avgMarks = (arr: Array<number | null>) => {
          const nums = (arr || []).filter((x) => typeof x === 'number' && Number.isFinite(x)) as number[];
          if (!nums.length) return null;
          return nums.reduce((s, n) => s + n, 0) / nums.length;
        };

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

        return { get, CO_MAX_A, CO_MAX_B };
      };

      const c1 = readCoPair(publishedLab.cia1, 1, 2);
      const c2 = readCoPair(publishedLab.cia2, 3, 4);
      const m5 = readCoPair(publishedLab.model, 5, null);

      const scale = (mark: number | null, max: number, outOf: number) => {
        if (mark == null) return null;
        if (!max || !Number.isFinite(max)) return null;
        return clamp((mark / max) * outOf, 0, outOf);
      };

      return students.map((s, idx) => {
        const r1 = c1.get(s.id);
        const r2 = c2.get(s.id);
        const r5 = m5.get(s.id);

        const co1Ssa = null;
        const co1Cia = scale(r1.a, c1.CO_MAX_A, wCo1Cia);
        const co1Fa = null;
        const co2Ssa = null;
        const co2Cia = scale(r1.b, c1.CO_MAX_B, wCo2Cia);
        const co2Fa = null;
        const co3Ssa = null;
        const co3Cia = scale(r2.a, c2.CO_MAX_A, wCo3Cia);
        const co3Fa = null;
        const co4Ssa = null;
        const co4Cia = scale(r2.b, c2.CO_MAX_B, wCo4Cia);
        const co4Fa = null;
        const meCo1 = null;
        const meCo2 = null;
        const meCo3 = null;
        const meCo4 = null;
        const meCo5 = scale(r5.a, m5.CO_MAX_A, wMeCo5);

        const partsFull = [
          co1Ssa,
          co1Cia,
          co1Fa,
          co2Ssa,
          co2Cia,
          co2Fa,
          co3Ssa,
          co3Cia,
          co3Fa,
          co4Ssa,
          co4Cia,
          co4Fa,
          meCo1,
          meCo2,
          meCo3,
          meCo4,
          meCo5,
        ];

        const parts = effMapping.visible.map((i) => partsFull[i]);
        const any = parts.some((p) => typeof p === 'number' && Number.isFinite(p));
        const total = any ? round2(parts.reduce((s0, p) => s0 + (typeof p === 'number' && Number.isFinite(p) ? p : 0), 0)) : null;
        const pct = total == null || !maxTotal ? null : round2((total / maxTotal) * 100);

        return {
          sno: idx + 1,
          ...s,
          cells: parts,
          total,
          pct,
        };
      });
    }

    return students.map((s, idx) => {
      const ssa1Total = toNumOrNull(published.ssa1[String(s.id)]);
      const ssa2Total = toNumOrNull(published.ssa2[String(s.id)]);
      const ssa1Half = ssa1Total == null ? null : Number(ssa1Total) / 2;
      const ssa2Half = ssa2Total == null ? null : Number(ssa2Total) / 2;
      const ssa1Co1Mark = ssa1Half == null ? null : clamp(ssa1Half, 0, maxes.ssa1.co1);
      const ssa1Co2Mark = ssa1Half == null ? null : clamp(ssa1Half, 0, maxes.ssa1.co2);
      const ssa2Co3Mark = ssa2Half == null ? null : clamp(ssa2Half, 0, maxes.ssa2.co3);
      const ssa2Co4Mark = ssa2Half == null ? null : clamp(ssa2Half, 0, maxes.ssa2.co4);

      // FA columns depend on class type:
      // - TCPR: Review1/Review2
      // - TCPL: LAB1/LAB2 (lab-style sheets)
      // - THEORY/SPECIAL: Formatives

      const f1Row = (published.f1 || {})[String(s.id)] || {};
      const f2Row = (published.f2 || {})[String(s.id)] || {};

      const f1Co1 = toNumOrNull((f1Row as any)?.skill1) != null && toNumOrNull((f1Row as any)?.att1) != null ? clamp(Number((f1Row as any).skill1) + Number((f1Row as any).att1), 0, maxes.f1.co1) : null;
      const f1Co2 = toNumOrNull((f1Row as any)?.skill2) != null && toNumOrNull((f1Row as any)?.att2) != null ? clamp(Number((f1Row as any).skill2) + Number((f1Row as any).att2), 0, maxes.f1.co2) : null;
      const f2Co3 = toNumOrNull((f2Row as any)?.skill1) != null && toNumOrNull((f2Row as any)?.att1) != null ? clamp(Number((f2Row as any).skill1) + Number((f2Row as any).att1), 0, maxes.f2.co3) : null;
      const f2Co4 = toNumOrNull((f2Row as any)?.skill2) != null && toNumOrNull((f2Row as any)?.att2) != null ? clamp(Number((f2Row as any).skill2) + Number((f2Row as any).att2), 0, maxes.f2.co4) : null;

      const review1Total = toNumOrNull(publishedReview.r1[String(s.id)]);
      const review2Total = toNumOrNull(publishedReview.r2[String(s.id)]);
      const review1Half = review1Total == null ? null : Number(review1Total) / 2;
      const review2Half = review2Total == null ? null : Number(review2Total) / 2;
      const review1Co1 = review1Half == null ? null : clamp(review1Half, 0, maxes.review1.co1);
      const review1Co2 = review1Half == null ? null : clamp(review1Half, 0, maxes.review1.co2);
      const review2Co3 = review2Half == null ? null : clamp(review2Half, 0, maxes.review2.co3);
      const review2Co4 = review2Half == null ? null : clamp(review2Half, 0, maxes.review2.co4);

      const readTcplLabPair = (snapshot: any | null, coA: number, coB: number | null) => {
        const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object' ? snapshot.sheet : {};
        const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object' ? sheet.rowsByStudentId : {};
        const HALF = 30 / 2;

        // Support both legacy flat format and newer coConfigs-keyed format.
        const cfgs = sheet?.coConfigs && typeof sheet.coConfigs === 'object' ? (sheet.coConfigs as any) : null;
        const cfgA = cfgs ? cfgs[String(coA)] : null;
        const cfgB = coB != null && cfgs ? cfgs[String(coB)] : null;

        const legacyExpCountA = clamp(Number(sheet?.expCountA ?? 0), 0, 12);
        const legacyExpCountB = clamp(Number(sheet?.expCountB ?? 0), 0, 12);
        const legacyCoAEnabled = Boolean(sheet?.coAEnabled !== false);
        const legacyCoBEnabled = coB != null ? Boolean(sheet?.coBEnabled !== false) : false;

        const coAEnabled = cfgA ? Boolean(cfgA.enabled) : legacyCoAEnabled;
        const coBEnabled = coB != null ? (cfgB ? Boolean(cfgB.enabled) : legacyCoBEnabled) : false;

        const expCountA = cfgA ? clamp(Number(cfgA.expCount ?? 0), 0, 12) : legacyExpCountA;
        const expCountB = coB != null ? (cfgB ? clamp(Number(cfgB.expCount ?? 0), 0, 12) : legacyExpCountB) : 0;

        const expMaxA = cfgA && Number.isFinite(Number(cfgA.expMax)) ? Number(cfgA.expMax)
          : Number.isFinite(Number(sheet?.expMaxA)) ? Number(sheet.expMaxA) : 25;
        const expMaxB = coB != null
          ? (cfgB && Number.isFinite(Number(cfgB.expMax)) ? Number(cfgB.expMax)
            : Number.isFinite(Number(sheet?.expMaxB)) ? Number(sheet.expMaxB) : 25)
          : 0;

        const ciaEnabled = Boolean((sheet as any)?.ciaExamEnabled !== false);
        const CO_MAX_A = expMaxA + (ciaEnabled ? HALF : 0);
        const CO_MAX_B = coB != null ? expMaxB + (ciaEnabled ? HALF : 0) : 0;

        const normalizeMarksArray = (raw: any) => {
          if (Array.isArray(raw)) return raw.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null));
          return [];
        };
        const avgMarks = (arr: Array<number | null>) => {
          const nums = (arr || []).filter((x) => typeof x === 'number' && Number.isFinite(x)) as number[];
          if (!nums.length) return null;
          return nums.reduce((s0, n) => s0 + n, 0) / nums.length;
        };

        const get = (sid: number) => {
          const row = rowsByStudentId[String(sid)] || {};
          // Prefer per-CO keyed format (marksByCo), fallback to legacy marksA/marksB.
          const marksByCo = (row as any)?.marksByCo && typeof (row as any).marksByCo === 'object' ? (row as any).marksByCo : {};
          const rawA = marksByCo?.[String(coA)] ?? (row as any)?.marksA;
          const rawB = coB != null ? (marksByCo?.[String(coB)] ?? (row as any)?.marksB) : [];

          const marksA = normalizeMarksArray(rawA).slice(0, coAEnabled ? expCountA : 0);
          const marksB = normalizeMarksArray(rawB).slice(0, coBEnabled ? expCountB : 0);
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

      const tcplLab1 = ct === 'TCPL' ? readTcplLabPair(publishedTcplLab.lab1, 1, 2) : null;
      const tcplLab2 = ct === 'TCPL' ? readTcplLabPair(publishedTcplLab.lab2, 3, 4) : null;
      const tcpl1 = tcplLab1 ? tcplLab1.get(s.id) : null;
      const tcpl2 = tcplLab2 ? tcplLab2.get(s.id) : null;
      const tcplLab1Co1 = tcpl1?.a ?? null;
      const tcplLab1Co2 = tcpl1?.b ?? null;
      const tcplLab2Co3 = tcpl2?.a ?? null;
      const tcplLab2Co4 = tcpl2?.b ?? null;

      const cia1Row = cia1ById[String(s.id)] || {};
      const cia2Row = cia2ById[String(s.id)] || {};

      const cia1Absent = Boolean((cia1Row as any)?.absent);
      const cia2Absent = Boolean((cia2Row as any)?.absent);

      let ciaCo1: number | null = null;
      let ciaCo2: number | null = null;
      if (!cia1Absent) {
        const q = (cia1Row as any)?.q && typeof (cia1Row as any).q === 'object' ? (cia1Row as any).q : {};
        let hasAny = false;
        let c1 = 0;
        let c2 = 0;
        for (let i = 0; i < cia1Questions.length; i++) {
          const qq = cia1Questions[i];
          const n = toNumOrNull(q?.[qq.key]);
          if (n == null) continue;
          hasAny = true;
          const mark = clamp(n, 0, qq.max || n);
          const w12 = effectiveCoWeights12ForQuestion(cia1Questions, i);
          c1 += mark * w12.co1;
          c2 += mark * w12.co2;
        }
        if (hasAny) {
          ciaCo1 = clamp(c1, 0, maxes.cia1.co1);
          ciaCo2 = clamp(c2, 0, maxes.cia1.co2);
        }
      }

      let ciaCo3: number | null = null;
      let ciaCo4: number | null = null;
      if (!cia2Absent) {
        const q = (cia2Row as any)?.q && typeof (cia2Row as any).q === 'object' ? (cia2Row as any).q : {};
        let hasAny = false;
        let c3 = 0;
        let c4 = 0;
        for (let i = 0; i < cia2Questions.length; i++) {
          const qq = cia2Questions[i];
          const n = toNumOrNull(q?.[qq.key]);
          if (n == null) continue;
          hasAny = true;
          const mark = clamp(n, 0, qq.max || n);
          const w34 = effectiveCoWeights34ForQuestion(cia2Questions, i);
          c3 += mark * w34.co3;
          c4 += mark * w34.co4;
        }
        if (hasAny) {
          ciaCo3 = clamp(c3, 0, maxes.cia2.co3);
          ciaCo4 = clamp(c4, 0, maxes.cia2.co4);
        }
      }

      // CO1/CO2 split into SSA/CIA/FA columns.
      const co1Ssa = scale(ssa1Co1Mark, maxes.ssa1.co1, wCo1Ssa);
      const co1Cia = scale(ciaCo1, maxes.cia1.co1, wCo1Cia);
      const co1Fa = ct === 'TCPR'
        ? scale(review1Co1, maxes.review1.co1, wCo1Fa)
        : ct === 'TCPL'
          ? scale(tcplLab1Co1, tcplLab1?.CO_MAX_A ?? maxes.f1.co1, wCo1Fa)
          : scale(f1Co1, maxes.f1.co1, wCo1Fa);
      const co2Ssa = scale(ssa1Co2Mark, maxes.ssa1.co2, wCo2Ssa);
      const co2Cia = scale(ciaCo2, maxes.cia1.co2, wCo2Cia);
      const co2Fa = ct === 'TCPR'
        ? scale(review1Co2, maxes.review1.co2, wCo2Fa)
        : ct === 'TCPL'
          ? scale(tcplLab1Co2, tcplLab1?.CO_MAX_B ?? maxes.f1.co2, wCo2Fa)
          : scale(f1Co2, maxes.f1.co2, wCo2Fa);

      const co3Ssa = scale(ssa2Co3Mark, maxes.ssa2.co3, wCo3Ssa);
      const co3Cia = scale(ciaCo3, maxes.cia2.co3, wCo3Cia);
      const co3Fa = ct === 'TCPR'
        ? scale(review2Co3, maxes.review2.co3, wCo3Fa)
        : ct === 'TCPL'
          ? scale(tcplLab2Co3, tcplLab2?.CO_MAX_A ?? maxes.f2.co3, wCo3Fa)
          : scale(f2Co3, maxes.f2.co3, wCo3Fa);
      const co4Ssa = scale(ssa2Co4Mark, maxes.ssa2.co4, wCo4Ssa);
      const co4Cia = scale(ciaCo4, maxes.cia2.co4, wCo4Cia);
      const co4Fa = ct === 'TCPR'
        ? scale(review2Co4, maxes.review2.co4, wCo4Fa)
        : ct === 'TCPL'
          ? scale(tcplLab2Co4, tcplLab2?.CO_MAX_B ?? maxes.f2.co4, wCo4Fa)
          : scale(f2Co4, maxes.f2.co4, wCo4Fa);

      const model = getModelCoMarks(s);
      const meCo1 = scale(model.co1, model.max.co1, wMeCo1);
      const meCo2 = scale(model.co2, model.max.co2, wMeCo2);
      const meCo3 = scale(model.co3, model.max.co3, wMeCo3);
      const meCo4 = scale(model.co4, model.max.co4, wMeCo4);
      const meCo5 = scale(model.co5, model.max.co5, wMeCo5);

      const partsFull = [
        co1Ssa,
        co1Cia,
        co1Fa,
        co2Ssa,
        co2Cia,
        co2Fa,
        co3Ssa,
        co3Cia,
        co3Fa,
        co4Ssa,
        co4Cia,
        co4Fa,
        meCo1,
        meCo2,
        meCo3,
        meCo4,
        meCo5,
      ];
      const parts = effMapping.visible.map((i: number) => partsFull[i]);
      const any = parts.some((p) => typeof p === 'number' && Number.isFinite(p));
      const total = any ? round2(parts.reduce((s0, p) => s0 + (typeof p === 'number' && Number.isFinite(p) ? p : 0), 0)) : null;
      const pct = total == null || !maxTotal ? null : round2((total / maxTotal) * 100);

      return {
        sno: idx + 1,
        ...s,
        cells: parts,
        total,
        pct,
      };
    });
  }, [effMapping, published, publishedReview, publishedLab, publishedTcplLab, publishedModel, students, weights, maxTotal, courseId, selectedTaId, masterCfg, classType, iqacCiaPattern, iqacModelPattern]);

  const header = effMapping.header;
  const cycles = effMapping.cycles;
  const weightsRow = effMapping.weights;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>INTERNAL MARK</h3>
          <div style={{ color: '#6b7280', marginTop: 4 }}>Summative + Formative (based on IQAC mapping)</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#374151', fontWeight: 700 }}>Section</span>
            <select value={selectedTaId ?? ''} onChange={(e) => setSelectedTaId(e.target.value ? Number(e.target.value) : null)} style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              <option value="" disabled>—</option>
              {tas.map((t) => {
                const dept = (t as any).department;
                const deptLabel = dept?.short_name || dept?.code || dept?.name || (t as any).department_name || '';
                const sem = (t as any).semester;
                const label = `${t.section_name || `TA ${t.id}`} ${sem ? `· Sem ${sem}` : ''} ${deptLabel ? `· ${deptLabel}` : ''}`;
                return (
                  <option key={t.id} value={t.id}>{label}</option>
                );
              })}
            </select>
          </label>
        </div>
      </div>

      {taError ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{taError}</div> : null}
      {rosterError ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{rosterError}</div> : null}
      {dataError ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{dataError}</div> : null}
      {loadingRoster || loadingData ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading…</div> : null}

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>S.No</th>
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>Register No.</th>
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>Name</th>
              {header.map((h: any, i: number) => (
                <th key={i} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f3f4f6' }}>{String(h)}</th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>{round2(maxTotal)}</th>
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>100</th>
            </tr>
            <tr>
              <th colSpan={3} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff', textAlign: 'left', fontWeight: 800 }}>internal weightage</th>
              {weightsRow.map((w0: any, i: number) => (
                <th key={`w-${i}`} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f3f4f6' }}>{Number(w0).toFixed(1)}</th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff' }} />
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff' }} />
            </tr>
            <tr>
              <th colSpan={3} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff', textAlign: 'left', fontWeight: 800 }}>cycle</th>
              {cycles.map((c: any, i: number) => (
                <th key={`c-${i}`} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff' }}>{String(c)}</th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff' }} />
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff' }} />
            </tr>
          </thead>
          <tbody>
            {computedRows.map((r: any) => (
              <tr key={r.id}>
                <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{r.sno}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{r.reg_no}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{r.name}</td>
                {(Array.isArray(r.cells) ? r.cells : []).map((v: any, i: number) => (
                  <td key={i} style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center' }}>{v == null ? '' : Number(v).toFixed(2)}</td>
                ))}
                <td style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center', fontWeight: 800 }}>{r.total == null ? '' : Number(r.total).toFixed(2)}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center' }}>{r.pct == null ? '' : Number(r.pct).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
