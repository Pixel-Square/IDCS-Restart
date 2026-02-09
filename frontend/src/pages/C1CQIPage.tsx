import React, { useEffect, useMemo, useState } from 'react';

import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import {
  fetchMyTeachingAssignments,
  fetchPublishedCia1Sheet,
  fetchPublishedFormative1,
  fetchPublishedLabSheet,
  fetchPublishedSsa1,
  TeachingAssignmentItem,
  fetchClassTypeWeights,
} from '../services/obe';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import { fetchDeptRow } from '../services/curriculum';
import { lsGet, lsSet } from '../utils/localStorage';
import { isLabClassType, normalizeClassType } from '../constants/classTypes';

type Props = {
  courseId: string;
};

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

const DEFAULT_WEIGHTS = { ssa1: 1.5, cia1: 3, formative1: 2.5 };
const THRESHOLD_3PT = 1.74;

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

  if (ssaMark == null || ciaMark == null || f1Mark == null) return null;
  if (!ssaMax || !ciaMax || !f1Max) return null;

  const sumW = ssaW + ciaW + f1W;
  const sumP = ssaMax + ciaMax + f1Max;
  if (!sumW || !sumP) return null;

  const frac = ((ssaMark / ssaMax) * ssaW + (ciaMark / ciaMax) * ciaW + (f1Mark / f1Max) * f1W) / sumW;
  const out = frac * sumP;
  return Number.isFinite(out) ? clamp(out, 0, sumP) : null;
}

export default function C1CQIPage({ courseId }: Props): JSX.Element {
  const [masterCfg, setMasterCfg] = useState<any>(null);

  const [classType, setClassType] = useState<string | null>(null);
  const normalizedClassType = useMemo(() => normalizeClassType(classType), [classType]);
  const isLabCourse = useMemo(() => isLabClassType(classType), [classType]);

  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [taError, setTaError] = useState<string | null>(null);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);

  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  const [loadingPublished, setLoadingPublished] = useState(false);
  const [publishedError, setPublishedError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ ssa: Record<string, string | null>; f1: Record<string, any>; cia: any | null }>(
    { ssa: {}, f1: {}, cia: null },
  );

  const [publishedLab, setPublishedLab] = useState<{ cia1: any | null }>({ cia1: null });

  const [search, setSearch] = useState('');

  const configKey = useMemo(() => `co_attainment_cfg_${courseId}`, [courseId]);
  const [weights, setWeights] = useState(() => {
    const stored = lsGet<any>(`co_attainment_cfg_${courseId}`);
    const w = stored?.weights;
    return {
      ssa1: Number.isFinite(Number(w?.ssa1)) ? Number(w.ssa1) : DEFAULT_WEIGHTS.ssa1,
      cia1: Number.isFinite(Number(w?.cia1)) ? Number(w.cia1) : DEFAULT_WEIGHTS.cia1,
      formative1: Number.isFinite(Number(w?.formative1)) ? Number(w.formative1) : DEFAULT_WEIGHTS.formative1,
    };
  });
  const [weightsSource, setWeightsSource] = useState<'default' | 'local' | 'server'>('default');
  const [lastWeightsDebug, setLastWeightsDebug] = useState<string | null>(null);

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
    return () => {
      mounted = false;
    };
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

        // Keep selection aligned with CO Attainment page
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
    return () => {
      mounted = false;
    };
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
          if (mounted) setClassType(null);
          return;
        }
        const row = await fetchDeptRow(Number(curriculumRowId));
        if (!mounted) return;
        const ct = String((row as any)?.class_type || '').trim();
        setClassType(ct || null);
      } catch {
        if (mounted) setClassType(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedTaId, tas]);

  // When classType changes, attempt to load IQAC weights from server, else local
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!classType) return;
      setLastWeightsDebug('Loading IQAC weights…');
      try {
        const remote = await fetchClassTypeWeights();
        if (!mounted) return;
        if (remote && typeof remote === 'object') {
          const k = normalizeClassType(classType);
          const gw = remote[k];
          if (gw && typeof gw === 'object') {
            const newW = {
              ssa1: Number.isFinite(Number(gw.ssa1)) ? Number(gw.ssa1) : DEFAULT_WEIGHTS.ssa1,
              cia1: Number.isFinite(Number(gw.cia1)) ? Number(gw.cia1) : DEFAULT_WEIGHTS.cia1,
              formative1: Number.isFinite(Number(gw.formative1)) ? Number(gw.formative1) : DEFAULT_WEIGHTS.formative1,
            };
            setWeights(newW);
            setWeightsSource('server');
            setLastWeightsDebug(`Applied server weights for ${k}`);
            try { lsSet(configKey, { weights: newW }); } catch {}
            return;
          }
          setLastWeightsDebug(`Server weights loaded but no entry for ${normalizeClassType(classType)}`);
        }
      } catch (e: any) {
        setLastWeightsDebug(`Server fetch failed: ${String(e?.message || e)}`);
      }

      // fallback local
      try {
        const global = lsGet<any>('iqac_class_type_weights');
        if (global && typeof global === 'object') {
          const k = normalizeClassType(classType);
          const gw = global[k];
          if (gw && typeof gw === 'object') {
            const newW = {
              ssa1: Number.isFinite(Number(gw.ssa1)) ? Number(gw.ssa1) : DEFAULT_WEIGHTS.ssa1,
              cia1: Number.isFinite(Number(gw.cia1)) ? Number(gw.cia1) : DEFAULT_WEIGHTS.cia1,
              formative1: Number.isFinite(Number(gw.formative1)) ? Number(gw.formative1) : DEFAULT_WEIGHTS.formative1,
            };
            setWeights(newW);
            setWeightsSource('local');
            setLastWeightsDebug(`Applied local weights for ${k}`);
            try { lsSet(configKey, { weights: newW }); } catch {}
            return;
          }
        }
      } catch (e: any) {
        setLastWeightsDebug(`Local read failed: ${String(e?.message || e)}`);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [classType, configKey]);

  const questions = useMemo<QuestionDef[]>(() => {
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

  const questionCoMax = useMemo(() => {
    let co1 = 0;
    let co2 = 0;
    questions.forEach((q, idx) => {
      const w = effectiveCoWeightsForQuestion(questions, idx);
      co1 += (Number(q.max) || 0) * w.co1;
      co2 += (Number(q.max) || 0) * w.co2;
    });
    return { co1, co2 };
  }, [questions]);

  const maxes = useMemo(() => {
    const ssaCfg = masterCfg?.assessments?.ssa1 || {};
    const f1Cfg = masterCfg?.assessments?.formative1 || {};
    const ciaCfg = masterCfg?.assessments?.cia1 || {};

    const ssaCo1 = Number(ssaCfg?.coMax?.co1);
    const ssaCo2 = Number(ssaCfg?.coMax?.co2);

    const ciaCo1 = Number(ciaCfg?.coMax?.co1);
    const ciaCo2 = Number(ciaCfg?.coMax?.co2);

    const f1Co = Number(f1Cfg?.maxCo);

    return {
      ssa: {
        co1: Number.isFinite(ssaCo1) ? Math.max(0, ssaCo1) : 10,
        co2: Number.isFinite(ssaCo2) ? Math.max(0, ssaCo2) : 10,
      },
      cia: {
        co1: Number.isFinite(ciaCo1) ? Math.max(0, ciaCo1) : questionCoMax.co1,
        co2: Number.isFinite(ciaCo2) ? Math.max(0, ciaCo2) : questionCoMax.co2,
      },
      f1: {
        co1: Number.isFinite(f1Co) ? Math.max(0, f1Co) : 10,
        co2: Number.isFinite(f1Co) ? Math.max(0, f1Co) : 10,
      },
    };
  }, [masterCfg, questionCoMax]);

  const loadPublished = async () => {
    setLoadingPublished(true);
    setPublishedError(null);
    try {
      if (isLabCourse) {
        const cia1Res = await fetchPublishedLabSheet('cia1', courseId);
        setPublished({ ssa: {}, f1: {}, cia: null });
        setPublishedLab({ cia1: (cia1Res as any)?.data ?? null });
      } else {
        const [ssaRes, f1Res, ciaRes] = await Promise.all([
          fetchPublishedSsa1(courseId),
          fetchPublishedFormative1(courseId),
          fetchPublishedCia1Sheet(courseId),
        ]);
        setPublished({
          ssa: (ssaRes as any)?.marks && typeof (ssaRes as any).marks === 'object' ? (ssaRes as any).marks : {},
          f1: (f1Res as any)?.marks && typeof (f1Res as any).marks === 'object' ? (f1Res as any).marks : {},
          cia: (ciaRes as any)?.data ?? null,
        });
        setPublishedLab({ cia1: null });
      }
    } catch (e: any) {
      setPublished({ ssa: {}, f1: {}, cia: null });
      setPublishedLab({ cia1: null });
      setPublishedError(e?.message || 'Failed to load published marks');
    } finally {
      setLoadingPublished(false);
    }
  };

  useEffect(() => {
    if (!courseId) return;
    loadPublished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, isLabCourse]);

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
    return () => {
      mounted = false;
    };
  }, [selectedTaId]);

  const byStudentId = useMemo(() => {
    const out = new Map<
      number,
      {
        ssaCo1: number | null;
        ssaCo2: number | null;
        ciaCo1: number | null;
        ciaCo2: number | null;
        f1Co1: number | null;
        f1Co2: number | null;
      }
    >();

    if (isLabCourse) {
      // For LAB courses, CQI should reflect the lab CIA1 published sheet.
      // We compute CO1/CO2 from (avg experiment marks) + (CIAExam/2), consistent with CO Attainment.
      const CO_MAX = 25 + 30 / 2; // avg experiment (25) + CIAExam/2 (15)

      const snapshot = publishedLab.cia1;
      const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object' ? snapshot.sheet : {};
      const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object' ? sheet.rowsByStudentId : {};
      const expCountA = clamp(Number(sheet?.expCountA ?? 0), 0, 12);
      const expCountB = clamp(Number(sheet?.expCountB ?? 0), 0, 12);
      const coAEnabled = Boolean(sheet?.coAEnabled);
      const coBEnabled = Boolean(sheet?.coBEnabled);

      const normalizeMarksArrayLocal = (raw: unknown, length: number): Array<number | ''> => {
        const arr = Array.isArray(raw) ? raw : [];
        const out2: Array<number | ''> = [];
        for (let i = 0; i < length; i++) {
          const v = arr[i];
          if (v === '' || v == null) {
            out2.push('');
            continue;
          }
          const n = typeof v === 'number' ? v : Number(v);
          out2.push(Number.isFinite(n) ? n : '');
        }
        return out2;
      };

      const avgMarksLocal = (arr: Array<number | ''>): number | null => {
        const nums = arr.filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
        if (!nums.length) return null;
        return nums.reduce((a, b) => a + b, 0) / nums.length;
      };

      for (const s of students) {
        const row = rowsByStudentId[String(s.id)] || {};
        const marksA = normalizeMarksArrayLocal((row as any).marksA, expCountA).slice(0, coAEnabled ? expCountA : 0);
        const marksB = normalizeMarksArrayLocal((row as any).marksB, expCountB).slice(0, coBEnabled ? expCountB : 0);
        const avgA = avgMarksLocal(marksA);
        const avgB = avgMarksLocal(marksB);

        const ciaExamRaw = (row as any)?.ciaExam;
        const ciaExamNum = typeof ciaExamRaw === 'number' && Number.isFinite(ciaExamRaw) ? ciaExamRaw : null;
        const hasAny = avgA != null || avgB != null || ciaExamNum != null;

        const a = !hasAny ? null : (avgA ?? 0) + (ciaExamNum ?? 0) / 2;
        const b = !hasAny ? null : (avgB ?? 0) + (ciaExamNum ?? 0) / 2;

        // We store in the same shape expected by the CQI theory path, but reuse fields.
        out.set(s.id, {
          ssaCo1: null,
          ssaCo2: null,
          ciaCo1: a == null ? null : clamp(a, 0, CO_MAX),
          ciaCo2: b == null ? null : clamp(b, 0, CO_MAX),
          f1Co1: null,
          f1Co2: null,
          // @ts-expect-error - attach a private helper
          __labCoMax: CO_MAX,
        } as any);
      }

      return out;
    }

    const ssaById = new Map<number, number | null>();
    for (const [sidStr, markStr] of Object.entries(published.ssa || {})) {
      const sid = Number(sidStr);
      if (!Number.isFinite(sid)) continue;
      ssaById.set(sid, toNumOrNull(markStr));
    }

    const f1ById: Record<string, any> = published.f1 && typeof published.f1 === 'object' ? published.f1 : {};

    const ciaSnapshot = published.cia && typeof published.cia === 'object' ? published.cia : null;
    const ciaQuestions: QuestionDef[] = Array.isArray(ciaSnapshot?.questions)
      ? ciaSnapshot.questions
          .map((q: any) => ({
            key: String(q?.key || ''),
            label: String(q?.label || q?.key || ''),
            max: Number(q?.max || 0),
            co: parseCo(q?.co),
            btl: Math.min(6, Math.max(1, Number(q?.btl || 1))) as 1 | 2 | 3 | 4 | 5 | 6,
          }))
          .filter((q: any) => q.key)
      : questions;
    const ciaById: Record<string, any> =
      ciaSnapshot?.rowsByStudentId && typeof ciaSnapshot.rowsByStudentId === 'object' ? ciaSnapshot.rowsByStudentId : {};

    for (const s of students) {
      const total = ssaById.get(s.id) ?? null;
      const ssaHalf = total == null ? null : total / 2;
      const ssaCo1 = ssaHalf == null ? null : clamp(ssaHalf, 0, maxes.ssa.co1);
      const ssaCo2 = ssaHalf == null ? null : clamp(ssaHalf, 0, maxes.ssa.co2);

      const frow = f1ById[String(s.id)] || {};
      const skill1 = toNumOrNull(frow?.skill1);
      const skill2 = toNumOrNull(frow?.skill2);
      const att1 = toNumOrNull(frow?.att1);
      const att2 = toNumOrNull(frow?.att2);
      const f1Co1 = skill1 != null && att1 != null ? clamp(skill1 + att1, 0, maxes.f1.co1) : null;
      const f1Co2 = skill2 != null && att2 != null ? clamp(skill2 + att2, 0, maxes.f1.co2) : null;

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
          ciaCo1 = clamp(c1, 0, maxes.cia.co1);
          ciaCo2 = clamp(c2, 0, maxes.cia.co2);
        }
      }

      out.set(s.id, { ssaCo1, ssaCo2, ciaCo1, ciaCo2, f1Co1, f1Co2 });
    }

    return out;
  }, [published, publishedLab, students, maxes, questions, isLabCourse]);

  const computedRows = useMemo(() => {
    if (isLabCourse) {
      const first = students[0]?.id != null ? (byStudentId.get(students[0].id) as any) : null;
      const coMax = Number(first?.__labCoMax);
      const denom = Number.isFinite(coMax) && coMax > 0 ? coMax : 40;

      const pt3 = (v: number | null) => (v == null || !denom ? null : round2((v / denom) * 3));
      const total100 = (a: number | null, b: number | null) => {
        if (a == null || b == null || !denom) return null;
        const t = ((a + b) / (2 * denom)) * 100;
        return Number.isFinite(t) ? Math.round(clamp(t, 0, 100)) : null;
      };

      return students.map((s, idx) => {
        const m: any = byStudentId.get(s.id) || {};
        const co1Raw = typeof m.ciaCo1 === 'number' ? (m.ciaCo1 as number) : null;
        const co2Raw = typeof m.ciaCo2 === 'number' ? (m.ciaCo2 as number) : null;
        const co1_3pt = pt3(co1Raw);
        const co2_3pt = pt3(co2Raw);
        const total = total100(co1Raw, co2Raw);

        const flagCo1 = typeof co1_3pt === 'number' && co1_3pt < THRESHOLD_3PT;
        const flagCo2 = typeof co2_3pt === 'number' && co2_3pt < THRESHOLD_3PT;
        const cos = [flagCo1 ? 'CO1' : null, flagCo2 ? 'CO2' : null].filter(Boolean).join('+');

        return {
          sno: idx + 1,
          ...s,
          co1_3pt,
          co2_3pt,
          total,
          flagCo1,
          flagCo2,
          cos,
        };
      });
    }

    const ssaW = weights.ssa1;
    const ciaW = weights.cia1;
    const f1W = weights.formative1;

    const co1MaxTotal = maxes.ssa.co1 + maxes.cia.co1 + maxes.f1.co1;
    const co2MaxTotal = maxes.ssa.co2 + maxes.cia.co2 + maxes.f1.co2;

    return students.map((s, idx) => {
      const m = byStudentId.get(s.id);

      const co1 = weightedBlendMark({
        ssaMark: m?.ssaCo1 ?? null,
        ciaMark: m?.ciaCo1 ?? null,
        f1Mark: m?.f1Co1 ?? null,
        ssaMax: maxes.ssa.co1,
        ciaMax: maxes.cia.co1,
        f1Max: maxes.f1.co1,
        ssaW,
        ciaW,
        f1W,
      });

      const co2 = weightedBlendMark({
        ssaMark: m?.ssaCo2 ?? null,
        ciaMark: m?.ciaCo2 ?? null,
        f1Mark: m?.f1Co2 ?? null,
        ssaMax: maxes.ssa.co2,
        ciaMax: maxes.cia.co2,
        f1Max: maxes.f1.co2,
        ssaW,
        ciaW,
        f1W,
      });

      const co1_3pt = co1 == null || !co1MaxTotal ? null : round2((co1 / co1MaxTotal) * 3);
      const co2_3pt = co2 == null || !co2MaxTotal ? null : round2((co2 / co2MaxTotal) * 3);
      const total = co1 != null && co2 != null ? Math.round((co1 + co2) || 0) : null;

      const flagCo1 = typeof co1_3pt === 'number' && co1_3pt < THRESHOLD_3PT;
      const flagCo2 = typeof co2_3pt === 'number' && co2_3pt < THRESHOLD_3PT;

      const cos = [flagCo1 ? 'CO1' : null, flagCo2 ? 'CO2' : null].filter(Boolean).join('+');

      return {
        sno: idx + 1,
        ...s,
        co1_3pt,
        co2_3pt,
        total,
        flagCo1,
        flagCo2,
        cos,
      };
    });
  }, [students, byStudentId, maxes, weights, isLabCourse]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return computedRows;
    return computedRows.filter((r) => {
      const reg = String(r.reg_no || '').toLowerCase();
      const name = String(r.name || '').toLowerCase();
      const sec = String(r.section || '').toLowerCase();
      return reg.includes(q) || name.includes(q) || sec.includes(q);
    });
  }, [computedRows, search]);

  const summary = useMemo(() => {
    const flagged = computedRows.filter((r) => r.cos).length;
    const co1 = computedRows.filter((r) => r.flagCo1).length;
    const co2 = computedRows.filter((r) => r.flagCo2).length;
    return {
      strength: computedRows.length,
      flagged,
      co1,
      co2,
    };
  }, [computedRows]);

  const th: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: 12,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    color: '#0f172a',
    background: 'linear-gradient(180deg,#eaf6ff,#ffffff)',
    borderBottom: '1px solid rgba(148, 163, 184, 0.5)',
    whiteSpace: 'nowrap',
  };

  const td: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid rgba(226, 232, 240, 0.9)',
    fontSize: 13,
    color: '#0f172a',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  };

  const pill = (label: string, tone: 'danger' | 'neutral') => {
    const styles =
      tone === 'danger'
        ? { background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#991b1b' }
        : { background: 'rgba(2, 132, 199, 0.08)', border: '1px solid rgba(2, 132, 199, 0.25)', color: '#0b4a6f' };
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 24,
          padding: '0 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 800,
          ...styles,
        }}
      >
        {label}
      </span>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          padding: 16,
          borderRadius: 14,
          background: 'linear-gradient(135deg,#ffffff,#f0f9ff)',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          boxShadow: '0 10px 28px rgba(2, 6, 23, 0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: '#0b4a6f' }}>C1-CQI</div>
            <div style={{ marginTop: 6, fontSize: 13, color: '#334155' }}>
              Flags CO1 / CO2 when 3pt attainment is below <b>{THRESHOLD_3PT}</b>.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 700 }}>Teaching Assignment / Section</div>
              <select
                value={selectedTaId ?? ''}
                onChange={(e) => setSelectedTaId(e.target.value ? Number(e.target.value) : null)}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e2e8f0', minWidth: 320, background: '#fff' }}
              >
                <option value="">Select…</option>
                {tas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.section_name} ({t.academic_year})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 700 }}>Search</div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reg no / name / section"
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e2e8f0', width: 260 }}
              />
            </div>
          </div>
        </div>

        {(loadingPublished || publishedError || loadingRoster || rosterError || taError) && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {(loadingPublished || publishedError) && (
              <div style={{ fontSize: 12, color: publishedError ? '#b91c1c' : '#64748b' }}>
                {loadingPublished ? 'Loading published marks…' : publishedError}
              </div>
            )}
            {(loadingRoster || rosterError) && (
              <div style={{ fontSize: 12, color: rosterError ? '#b91c1c' : '#64748b' }}>{loadingRoster ? 'Loading roster…' : rosterError}</div>
            )}
            {taError && (
              <div
                style={{
                  marginTop: 4,
                  background: '#fef2f2',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#991b1b',
                  padding: 10,
                  borderRadius: 12,
                }}
              >
                {taError}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {pill(`Strength: ${summary.strength}`, 'neutral')}
          {pill(`Flagged: ${summary.flagged}`, summary.flagged ? 'danger' : 'neutral')}
          {pill(`CO1 below: ${summary.co1}`, summary.co1 ? 'danger' : 'neutral')}
          {pill(`CO2 below: ${summary.co2}`, summary.co2 ? 'danger' : 'neutral')}
        </div>
      </div>

      <div
        style={{
          borderRadius: 14,
          border: '1px solid rgba(226, 232, 240, 0.9)',
          overflow: 'hidden',
          background: '#fff',
          boxShadow: '0 10px 28px rgba(2, 6, 23, 0.06)',
        }}
      >
        <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 70 }}>slno</th>
                <th style={{ ...th, width: 70 }}>SEC</th>
                <th style={{ ...th, width: 160 }}>Reg number</th>
                <th style={{ ...th, minWidth: 260 }}>NAME</th>
                <th style={{ ...th, width: 140 }}>CO's</th>
                <th style={{ ...th, width: 90, textAlign: 'center' }}>100</th>
                <th style={{ ...th, width: 90, textAlign: 'center' }}>CO1 (3pt)</th>
                <th style={{ ...th, width: 90, textAlign: 'center' }}>CO2 (3pt)</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, i) => {
                const isFlagged = Boolean(r.cos);
                const zebra = i % 2 === 0;
                const rowBg = isFlagged ? 'rgba(239, 68, 68, 0.10)' : zebra ? '#ffffff' : '#f8fafc';

                const cell3ptStyle = (isBad: boolean) => ({
                  ...td,
                  textAlign: 'center' as const,
                  fontWeight: 900,
                  color: isBad ? '#991b1b' : '#065f46',
                  background: isBad ? 'rgba(239, 68, 68, 0.10)' : 'rgba(34, 197, 94, 0.10)',
                  borderBottom: '1px solid rgba(226, 232, 240, 0.9)',
                });

                const totalBad = r.total != null && r.total <= 58; // red background when <= 58

                return (
                  <tr key={r.id} style={{ background: rowBg }}>
                    <td style={{ ...td, width: 70, borderLeft: isFlagged ? '4px solid rgba(239, 68, 68, 0.55)' : '4px solid transparent' }}>{r.sno}</td>
                    <td style={{ ...td, width: 70 }}>{r.section ?? ''}</td>
                    <td style={{ ...td, width: 160, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                      {r.reg_no}
                    </td>
                    <td style={{ ...td, minWidth: 260, fontWeight: 800 }}>{r.name}</td>
                    <td style={{ ...td, width: 140 }}>
                      {r.flagCo1 && r.flagCo2 ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {pill('CO1', 'danger')}
                          {pill('CO2', 'danger')}
                        </div>
                      ) : r.flagCo1 ? (
                        pill('CO1', 'danger')
                      ) : r.flagCo2 ? (
                        pill('CO2', 'danger')
                      ) : (
                        ''
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        width: 90,
                        textAlign: 'center',
                        fontWeight: 900,
                        color: totalBad ? '#991b1b' : '#0f172a',
                        background: totalBad ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                      }}
                    >
                      {r.total == null ? '' : Number.isFinite(Number(r.total)) ? String(Math.round(Number(r.total))) : r.total}
                    </td>
                    <td style={cell3ptStyle(Boolean(r.flagCo1))}>{r.co1_3pt == null ? '' : r.co1_3pt}</td>
                    <td style={cell3ptStyle(Boolean(r.flagCo2))}>{r.co2_3pt == null ? '' : r.co2_3pt}</td>
                  </tr>
                );
              })}

              {!visibleRows.length && (
                <tr>
                  <td colSpan={8} style={{ padding: 18, textAlign: 'center', color: '#64748b' }}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
