import React, { useEffect, useMemo, useState } from 'react';

import {
  fetchClassTypeWeights,
  fetchDraft,
  fetchMyTeachingAssignments,
  fetchPublishedCiaSheet,
  fetchPublishedFormative,
  fetchPublishedLabSheet,
  fetchPublishedSsa1,
  fetchPublishedSsa2,
  TeachingAssignmentItem,
} from '../services/obe';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
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

const DEFAULT_INTERNAL_MAPPING = {
  header: ['CO1', 'CO2', 'CO3', 'CO3', 'CO3', 'CO4', 'CO4', 'CO4', 'CO1', 'CO2', 'CO3', 'CO4', 'CO5'],
  weights: [7.0, 7.0, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0],
  cycles: ['cycle 1', 'cycle 1', 'ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ME', 'ME', 'ME', 'ME', 'ME'],
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

export default function InternalMarkCoursePage({ courseId, enabledAssessments }: Props): JSX.Element {
  const enabledSet = useMemo(() => new Set((enabledAssessments || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)), [enabledAssessments]);

  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);
  const [taError, setTaError] = useState<string | null>(null);

  const [classType, setClassType] = useState<string | null>(null);

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

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await fetchMyTeachingAssignments();
        if (!mounted) return;
        const filtered = (all || []).filter((a) => String(a.subject_code) === String(courseId));
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
        const remote = await fetchClassTypeWeights();
        if (!mounted) return;
        const ct = normalizeClassType(classType);
        const w = (remote && (remote as any)[ct]) || null;
        if (w) {
          setWeights({
            ssa1: Number.isFinite(Number(w.ssa1)) ? Number(w.ssa1) : 1.5,
            cia1: Number.isFinite(Number(w.cia1)) ? Number(w.cia1) : 3,
            formative1: Number.isFinite(Number(w.formative1)) ? Number(w.formative1) : 2.5,
          });

          const im = (w as any).internal_mark_weights;
          if (Array.isArray(im) && im.length) {
            const arr = im.map((x: any, i: number) => {
              const n = Number(x);
              return Number.isFinite(n) ? n : (DEFAULT_INTERNAL_MAPPING.weights[i] ?? 0);
            });
            while (arr.length < DEFAULT_INTERNAL_MAPPING.weights.length) arr.push(DEFAULT_INTERNAL_MAPPING.weights[arr.length] ?? 0);
            setInternalMarkWeights(arr.slice(0, DEFAULT_INTERNAL_MAPPING.weights.length));
          } else {
            setInternalMarkWeights([...DEFAULT_INTERNAL_MAPPING.weights]);
          }
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
  }, [selectedTaId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingData(true);
      setDataError(null);
      try {
        const isTcpl = normalizeClassType(classType) === 'TCPL';

        let ssa1Res: any = null;
        let ssa2Res: any = null;
        let f1Res: any = null;
        let f2Res: any = null;
        let cia1Res: any = null;
        let cia2Res: any = null;

        try { ssa1Res = await fetchPublishedSsa1(courseId); } catch { ssa1Res = null; }
        try { ssa2Res = await fetchPublishedSsa2(courseId); } catch { ssa2Res = null; }

        if (!ssa1Res?.marks) {
          try {
            const d = await fetchDraft('ssa1', courseId);
            if (d?.draft && (d.draft as any).marks) ssa1Res = { marks: (d.draft as any).marks };
          } catch {}
        }
        if (!ssa2Res?.marks) {
          try {
            const d = await fetchDraft('ssa2', courseId);
            if (d?.draft && (d.draft as any).marks) ssa2Res = { marks: (d.draft as any).marks };
          } catch {}
        }

        if (isTcpl) {
          try { f1Res = await fetchPublishedLabSheet('formative1', courseId); } catch { f1Res = null; }
          try { f2Res = await fetchPublishedLabSheet('formative2', courseId); } catch { f2Res = null; }
          if (!f1Res?.data) {
            try { const d = await fetchDraft('formative1', courseId); if (d?.draft) f1Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          }
          if (!f2Res?.data) {
            try { const d = await fetchDraft('formative2', courseId); if (d?.draft) f2Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          }
        } else {
          try { f1Res = await fetchPublishedFormative('formative1', courseId); } catch { f1Res = null; }
          try { f2Res = await fetchPublishedFormative('formative2', courseId); } catch { f2Res = null; }
          if (!f1Res?.marks) {
            try { const d = await fetchDraft('formative1', courseId); if (d?.draft && (d.draft as any).marks) f1Res = { marks: (d.draft as any).marks }; } catch {}
          }
          if (!f2Res?.marks) {
            try { const d = await fetchDraft('formative2', courseId); if (d?.draft && (d.draft as any).marks) f2Res = { marks: (d.draft as any).marks }; } catch {}
          }
        }

        try { cia1Res = await fetchPublishedCiaSheet('cia1', courseId); } catch { cia1Res = null; }
        try { cia2Res = await fetchPublishedCiaSheet('cia2', courseId); } catch { cia2Res = null; }
        if (!cia1Res?.data) {
          try { const d = await fetchDraft('cia1', courseId); if (d?.draft) cia1Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
        }
        if (!cia2Res?.data) {
          try { const d = await fetchDraft('cia2', courseId); if (d?.draft) cia2Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
        }

        if (!mounted) return;
        setPublished({
          ssa1: ssa1Res?.marks || {},
          ssa2: ssa2Res?.marks || {},
          f1: (isTcpl ? (f1Res?.data?.sheet?.rowsByStudentId || {}) : (f1Res?.marks || {})) || {},
          f2: (isTcpl ? (f2Res?.data?.sheet?.rowsByStudentId || {}) : (f2Res?.marks || {})) || {},
          cia1: cia1Res?.data || null,
          cia2: cia2Res?.data || null,
        });
      } catch (e: any) {
        if (!mounted) return;
        setDataError(e?.message || 'Failed to load marks');
      } finally {
        if (mounted) setLoadingData(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [courseId, classType, enabledSet]);

  const effMapping = useMemo(() => {
    const header = DEFAULT_INTERNAL_MAPPING.header;
    const weightsArr = Array.isArray(internalMarkWeights) && internalMarkWeights.length ? internalMarkWeights : DEFAULT_INTERNAL_MAPPING.weights;
    const weights = weightsArr.slice(0, DEFAULT_INTERNAL_MAPPING.weights.length);
    while (weights.length < DEFAULT_INTERNAL_MAPPING.weights.length) weights.push(DEFAULT_INTERNAL_MAPPING.weights[weights.length] ?? 0);
    const cycles = DEFAULT_INTERNAL_MAPPING.cycles;
    return { header, weights, cycles };
  }, [internalMarkWeights]);

  const maxTotal = useMemo(() => {
    const w = effMapping.weights.map((x: any) => Number(x) || 0);
    return w.reduce((s, n) => s + n, 0);
  }, [effMapping]);

  const modelMaxes = useMemo(() => {
    const out = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };
    for (let i = 0; i < MODEL_THEORY_QUESTIONS.length; i++) {
      const def = MODEL_THEORY_QUESTIONS[i];
      const co = MODEL_THEORY_CO_ROW[i];
      if (co === 1) out.co1 += def.max;
      else if (co === 2) out.co2 += def.max;
      else if (co === 3) out.co3 += def.max;
      else if (co === 4) out.co4 += def.max;
      else if (co === 5) out.co5 += def.max;
    }
    return out;
  }, []);

  const computedRows = useMemo(() => {
    const w = effMapping.weights.map((x: any) => Number(x) || 0);
    const wCo1Cycle = w[0] || 0;
    const wCo2Cycle = w[1] || 0;
    const wCo3Ssa = w[2] || 0;
    const wCo3Cia = w[3] || 0;
    const wCo3Fa = w[4] || 0;
    const wCo4Ssa = w[5] || 0;
    const wCo4Cia = w[6] || 0;
    const wCo4Fa = w[7] || 0;
    const wMeCo1 = w[8] || 0;
    const wMeCo2 = w[9] || 0;
    const wMeCo3 = w[10] || 0;
    const wMeCo4 = w[11] || 0;
    const wMeCo5 = w[12] || 0;

    const cia1Snap = published.cia1 && typeof published.cia1 === 'object' ? published.cia1 : null;
    const cia2Snap = published.cia2 && typeof published.cia2 === 'object' ? published.cia2 : null;
    const cia1Questions: QuestionDef[] = Array.isArray(cia1Snap?.questions)
      ? cia1Snap.questions.map((q: any) => ({ key: String(q?.key || ''), max: Number(q?.max || 0), co: (q?.co === '1&2' ? '1&2' : (Number(q?.co) === 2 ? 2 : 1)) as any })).filter((q: any) => q.key)
      : DEFAULT_CIA1_QUESTIONS;
    const cia2Questions: QuestionDef34[] = Array.isArray(cia2Snap?.questions)
      ? cia2Snap.questions.map((q: any) => ({ key: String(q?.key || ''), max: Number(q?.max || 0), co: (q?.co === '3&4' ? '3&4' : (Number(q?.co) === 4 ? 4 : 3)) as any })).filter((q: any) => q.key)
      : DEFAULT_CIA2_QUESTIONS;

    const cia1ById: Record<string, any> = cia1Snap?.rowsByStudentId && typeof cia1Snap.rowsByStudentId === 'object' ? cia1Snap.rowsByStudentId : {};
    const cia2ById: Record<string, any> = cia2Snap?.rowsByStudentId && typeof cia2Snap.rowsByStudentId === 'object' ? cia2Snap.rowsByStudentId : {};

    const ssa1MaxCo = 10;
    const ssa2MaxCo = 10;
    const cia1MaxCo = cia1Questions.reduce((s, q) => s + (q.co === 1 || q.co === '1&2' ? q.max * (q.co === '1&2' ? 0.5 : 1) : 0), 0);
    const cia1MaxCo2 = cia1Questions.reduce((s, q) => s + (q.co === 2 || q.co === '1&2' ? q.max * (q.co === '1&2' ? 0.5 : 1) : 0), 0);
    const cia2MaxCo3 = cia2Questions.reduce((s, q) => s + (q.co === 3 || q.co === '3&4' ? q.max * (q.co === '3&4' ? 0.5 : 1) : 0), 0);
    const cia2MaxCo4 = cia2Questions.reduce((s, q) => s + (q.co === 4 || q.co === '3&4' ? q.max * (q.co === '3&4' ? 0.5 : 1) : 0), 0);

    const formativeMax = { co1: 10, co2: 10, co3: 10, co4: 10 };

    const taKey = String(selectedTaId ?? 'none');
    const modelSheet = (() => {
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

      let hasAny = false;
      const sums = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };
      for (let i = 0; i < MODEL_THEORY_QUESTIONS.length; i++) {
        const def = MODEL_THEORY_QUESTIONS[i];
        const raw = (q as any)[def.key];
        const n = toNumOrNull(raw);
        if (n == null) continue;
        hasAny = true;
        const mark = clamp(n, 0, def.max);
        const co = MODEL_THEORY_CO_ROW[i];
        if (co === 1) sums.co1 += mark;
        else if (co === 2) sums.co2 += mark;
        else if (co === 3) sums.co3 += mark;
        else if (co === 4) sums.co4 += mark;
        else if (co === 5) sums.co5 += mark;
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
      return round2(clamp((mark / max) * outOf, 0, outOf));
    };

    return students.map((s, idx) => {
      const ssa1Total = toNumOrNull(published.ssa1[String(s.id)]);
      const ssa2Total = toNumOrNull(published.ssa2[String(s.id)]);
      const ssa1Half = ssa1Total == null ? null : clamp(ssa1Total / 2, 0, ssa1MaxCo);
      const ssa2Half = ssa2Total == null ? null : clamp(ssa2Total / 2, 0, ssa2MaxCo);

      const f1Row = (published.f1 || {})[String(s.id)] || {};
      const f2Row = (published.f2 || {})[String(s.id)] || {};

      const f1Co1 = toNumOrNull((f1Row as any)?.skill1) != null && toNumOrNull((f1Row as any)?.att1) != null ? clamp(Number((f1Row as any).skill1) + Number((f1Row as any).att1), 0, formativeMax.co1) : null;
      const f1Co2 = toNumOrNull((f1Row as any)?.skill2) != null && toNumOrNull((f1Row as any)?.att2) != null ? clamp(Number((f1Row as any).skill2) + Number((f1Row as any).att2), 0, formativeMax.co2) : null;
      const f2Co3 = toNumOrNull((f2Row as any)?.skill1) != null && toNumOrNull((f2Row as any)?.att1) != null ? clamp(Number((f2Row as any).skill1) + Number((f2Row as any).att1), 0, formativeMax.co3) : null;
      const f2Co4 = toNumOrNull((f2Row as any)?.skill2) != null && toNumOrNull((f2Row as any)?.att2) != null ? clamp(Number((f2Row as any).skill2) + Number((f2Row as any).att2), 0, formativeMax.co4) : null;

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
        for (const qq of cia1Questions) {
          const n = toNumOrNull(q?.[qq.key]);
          if (n == null) continue;
          hasAny = true;
          const mark = clamp(n, 0, qq.max || n);
          const w12 = effectiveCoWeights12(qq.co);
          c1 += mark * w12.co1;
          c2 += mark * w12.co2;
        }
        if (hasAny) {
          ciaCo1 = clamp(c1, 0, cia1MaxCo);
          ciaCo2 = clamp(c2, 0, cia1MaxCo2);
        }
      }

      let ciaCo3: number | null = null;
      let ciaCo4: number | null = null;
      if (!cia2Absent) {
        const q = (cia2Row as any)?.q && typeof (cia2Row as any).q === 'object' ? (cia2Row as any).q : {};
        let hasAny = false;
        let c3 = 0;
        let c4 = 0;
        for (const qq of cia2Questions) {
          const n = toNumOrNull(q?.[qq.key]);
          if (n == null) continue;
          hasAny = true;
          const mark = clamp(n, 0, qq.max || n);
          const w34 = effectiveCoWeights34(qq.co);
          c3 += mark * w34.co3;
          c4 += mark * w34.co4;
        }
        if (hasAny) {
          ciaCo3 = clamp(c3, 0, cia2MaxCo3);
          ciaCo4 = clamp(c4, 0, cia2MaxCo4);
        }
      }

      // Cycle 1 combined (CO1/CO2) out of 7 using IQAC class-type weights.
      const cycleCo1 = weightedOutOf({
        ssaMark: ssa1Half,
        ciaMark: ciaCo1,
        faMark: f1Co1,
        ssaMax: ssa1MaxCo,
        ciaMax: cia1MaxCo,
        faMax: formativeMax.co1,
        ssaW: weights.ssa1,
        ciaW: weights.cia1,
        faW: weights.formative1,
        outOf: wCo1Cycle,
      });
      const cycleCo2 = weightedOutOf({
        ssaMark: ssa1Half,
        ciaMark: ciaCo2,
        faMark: f1Co2,
        ssaMax: ssa1MaxCo,
        ciaMax: cia1MaxCo2,
        faMax: formativeMax.co2,
        ssaW: weights.ssa1,
        ciaW: weights.cia1,
        faW: weights.formative1,
        outOf: wCo2Cycle,
      });

      const co3Ssa = scale(ssa2Half, ssa2MaxCo, wCo3Ssa);
      const co3Cia = scale(ciaCo3, cia2MaxCo3, wCo3Cia);
      const co3Fa = scale(f2Co3, formativeMax.co3, wCo3Fa);
      const co4Ssa = scale(ssa2Half, ssa2MaxCo, wCo4Ssa);
      const co4Cia = scale(ciaCo4, cia2MaxCo4, wCo4Cia);
      const co4Fa = scale(f2Co4, formativeMax.co4, wCo4Fa);

      const model = getModelCoMarks(s);
      const meCo1 = scale(model.co1, model.max.co1, wMeCo1);
      const meCo2 = scale(model.co2, model.max.co2, wMeCo2);
      const meCo3 = scale(model.co3, model.max.co3, wMeCo3);
      const meCo4 = scale(model.co4, model.max.co4, wMeCo4);
      const meCo5 = scale(model.co5, model.max.co5, wMeCo5);

      const parts = [cycleCo1, cycleCo2, co3Ssa, co3Cia, co3Fa, co4Ssa, co4Cia, co4Fa, meCo1, meCo2, meCo3, meCo4, meCo5];
      const any = parts.some((p) => typeof p === 'number' && Number.isFinite(p));
      const total = any ? round2(parts.reduce((s0, p) => s0 + (typeof p === 'number' && Number.isFinite(p) ? p : 0), 0)) : null;
      const pct = total == null || !maxTotal ? null : round2((total / maxTotal) * 100);

      return {
        sno: idx + 1,
        ...s,
        cycleCo1,
        cycleCo2,
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
        total,
        pct,
      };
    });
  }, [effMapping, published, students, weights, maxTotal, courseId, selectedTaId, modelMaxes]);

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
              {tas.map((t) => (
                <option key={t.id} value={t.id}>{t.section_name || `TA ${t.id}`}</option>
              ))}
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
                {[r.cycleCo1, r.cycleCo2, r.co3Ssa, r.co3Cia, r.co3Fa, r.co4Ssa, r.co4Cia, r.co4Fa, r.meCo1, r.meCo2, r.meCo3, r.meCo4, r.meCo5].map((v: any, i: number) => (
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
