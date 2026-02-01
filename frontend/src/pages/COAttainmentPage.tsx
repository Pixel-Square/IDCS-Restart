import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchMyTeachingAssignments,
  fetchPublishedCia1Sheet,
  fetchPublishedFormative1,
  fetchPublishedSsa1,
  TeachingAssignmentItem,
} from '../services/obe';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { lsGet, lsSet } from '../utils/localStorage';

type Props = { courseId: string };

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

export default function COAttainmentPage({ courseId }: Props): JSX.Element {
  const [masterCfg, setMasterCfg] = useState<any>(null);

  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [taError, setTaError] = useState<string | null>(null);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);

  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  const [loadingPublished, setLoadingPublished] = useState(false);
  const [publishedError, setPublishedError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ ssa: Record<string, string | null>; f1: Record<string, any>; cia: any | null }>({
    ssa: {},
    f1: {},
    cia: null,
  });

  const configKey = useMemo(() => `co_attainment_cfg_${courseId}`, [courseId]);
  const [weights, setWeights] = useState(() => {
    const stored = lsGet<any>(configKey);
    const w = stored?.weights;
    return {
      ssa1: Number.isFinite(Number(w?.ssa1)) ? Number(w.ssa1) : DEFAULT_WEIGHTS.ssa1,
      cia1: Number.isFinite(Number(w?.cia1)) ? Number(w.cia1) : DEFAULT_WEIGHTS.cia1,
      formative1: Number.isFinite(Number(w?.formative1)) ? Number(w.formative1) : DEFAULT_WEIGHTS.formative1,
    };
  });

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
    lsSet(configKey, { weights });
  }, [configKey, weights]);

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
    } catch (e: any) {
      setPublished({ ssa: {}, f1: {}, cia: null });
      setPublishedError(e?.message || 'Failed to load published marks');
    } finally {
      setLoadingPublished(false);
    }
  };

  useEffect(() => {
    if (!courseId) return;
    loadPublished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

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
    const out = new Map<number, {
      ssaCo1: number | null;
      ssaCo2: number | null;
      ciaCo1: number | null;
      ciaCo2: number | null;
      f1Co1: number | null;
      f1Co2: number | null;
    }>();

    const ssaById = new Map<number, number | null>();
    for (const [sidStr, markStr] of Object.entries(published.ssa || {})) {
      const sid = Number(sidStr);
      if (!Number.isFinite(sid)) continue;
      ssaById.set(sid, toNumOrNull(markStr));
    }

    const f1ById: Record<string, any> = published.f1 && typeof published.f1 === 'object' ? published.f1 : {};

    // CIA published sheet snapshot (preferred for split question CO mapping)
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
    const ciaById: Record<string, any> = ciaSnapshot?.rowsByStudentId && typeof ciaSnapshot.rowsByStudentId === 'object' ? ciaSnapshot.rowsByStudentId : {};

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
  }, [published, students, maxes, questions]);

  const computedRows = useMemo(() => {
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

      const co1Pct = co1 == null || !co1MaxTotal ? null : round1((co1 / co1MaxTotal) * 100);
      const co2Pct = co2 == null || !co2MaxTotal ? null : round1((co2 / co2MaxTotal) * 100);

      const co1_3pt = co1 == null || !co1MaxTotal ? null : round2((co1 / co1MaxTotal) * 3);
      const co2_3pt = co2 == null || !co2MaxTotal ? null : round2((co2 / co2MaxTotal) * 3);

      const total = co1 != null && co2 != null ? round1(co1 + co2) : null;

      return {
        sno: idx + 1,
        ...s,
        co1,
        co1Pct,
        co1_3pt,
        co2,
        co2Pct,
        co2_3pt,
        total,
      };
    });
  }, [students, byStudentId, maxes, weights]);

  const summary = useMemo(() => {
    const co1Vals = computedRows.map((r) => r.co1_3pt).filter((n) => typeof n === 'number') as number[];
    const co2Vals = computedRows.map((r) => r.co2_3pt).filter((n) => typeof n === 'number') as number[];
    const avg = (arr: number[]) => (arr.length ? round2(arr.reduce((s, n) => s + n, 0) / arr.length) : null);
    return {
      strength: students.length,
      co1Avg3pt: avg(co1Vals),
      co2Avg3pt: avg(co2Vals),
    };
  }, [computedRows, students.length]);

  const co1MaxTotal = maxes.ssa.co1 + maxes.cia.co1 + maxes.f1.co1;
  const co2MaxTotal = maxes.ssa.co2 + maxes.cia.co2 + maxes.f1.co2;

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
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0b4a6f' }}>CO Attainment (Summative + Formative)</div>
            <div style={{ marginTop: 6, color: '#264653', fontSize: 13 }}>
              Uses weighted blending per CO: SSA1 + CIA1 + Formative1 (based on your Excel formula).
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

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginTop: 12 }}>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e9f0f7', padding: 12 }}>
            <div style={{ fontWeight: 800, color: '#0b3b57', marginBottom: 8 }}>Max marks per CO (P4:P6)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 120px 120px 120px', gap: 8, alignItems: 'center' }}>
              <div></div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>SSA1</div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>CIA1</div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>Formative1</div>

              <div style={{ fontSize: 12, fontWeight: 700 }}>CO1</div>
              <div>{maxes.ssa.co1}</div>
              <div>{maxes.cia.co1}</div>
              <div>{maxes.f1.co1}</div>

              <div style={{ fontSize: 12, fontWeight: 700 }}>CO2</div>
              <div>{maxes.ssa.co2}</div>
              <div>{maxes.cia.co2}</div>
              <div>{maxes.f1.co2}</div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              CO1 total max: <b>{co1MaxTotal}</b> &nbsp;|&nbsp; CO2 total max: <b>{co2MaxTotal}</b>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e9f0f7', padding: 12 }}>
            <div style={{ fontWeight: 800, color: '#0b3b57', marginBottom: 8 }}>Weights (R4:R6)</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                SSA1
                <input
                  type="number"
                  step="0.1"
                  value={weights.ssa1}
                  onChange={(e) => setWeights((p) => ({ ...p, ssa1: Number(e.target.value) }))}
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
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={thSticky}>S.No</th>
                <th rowSpan={2} style={thSticky}>Section</th>
                <th rowSpan={2} style={thSticky}>Register No</th>
                <th rowSpan={2} style={thSticky}>Name</th>
                <th colSpan={3} style={thGroup}>CO1</th>
                <th colSpan={3} style={thGroup}>CO2</th>
                <th rowSpan={2} style={thSticky}>Total / {co1MaxTotal + co2MaxTotal}</th>
              </tr>
              <tr>
                <th style={thSticky}>{co1MaxTotal}</th>
                <th style={thSticky}>%</th>
                <th style={thSticky}>3pt</th>
                <th style={thSticky}>{co2MaxTotal}</th>
                <th style={thSticky}>%</th>
                <th style={thSticky}>3pt</th>
              </tr>
            </thead>
            <tbody>
              {computedRows.map((r) => (
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
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{r.total == null ? '' : r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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
