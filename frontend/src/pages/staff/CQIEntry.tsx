import React, { useEffect, useMemo, useState } from 'react';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../../services/roster';
import { lsGet, lsSet } from '../../utils/localStorage';
import { fetchWithAuth } from '../../services/fetchAuth';
import { 
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
} from '../../services/obe';
import { fetchAssessmentMasterConfig } from '../../services/cdapDb';
import { normalizeClassType } from '../../constants/classTypes';

interface CQIEntryProps {
  subjectId?: string;
  teachingAssignmentId?: number;
  classType?: string | null;
  enabledAssessments?: string[] | null;
  assessmentType?: 'cia1' | 'cia2' | 'model';
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

function round2(n: number) {
  return Math.round(n * 100) / 100;
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
    const has3 = s.includes('3');
    const has4 = s.includes('4');
    if (has3 && has4) return '3&4';
    if (has4) return 4;
    if (has3) return 3;
    if (
      s === '3&4' ||
      s === '3,4' ||
      s === '3/4' ||
      s === '4/3' ||
      s === 'CO3&CO4' ||
      s === 'CO3,CO4' ||
      s === 'CO3/CO4' ||
      s === 'CO4/CO3'
    )
      return '3&4';
    if (s === 'CO4' || s === '4') return 4;
    if (s === 'CO3' || s === '3') return 3;
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
    if (nums.includes(4)) return 4;
    if (nums.includes(3)) return 3;
  }
  const n = typeof raw === 'string' ? Number((raw.match(/\d+/) || [])[0]) : Number(raw);
  if (n === 4) return 4;
  if (n === 3) return 3;
  if (n === 34) return '3&4';
  return 3;
}

function effectiveCia1Weights(questions: any[], idx: number): { co1: number; co2: number } {
  const q = questions[idx];
  if (!q) return { co1: 0, co2: 0 };
  const parsed = parseCo12(q.co);
  if (parsed === '1&2') return { co1: 0.5, co2: 0.5 };

  const hasAnySplit = questions.some((x) => parseCo12(x?.co) === '1&2');
  const isLast = idx === questions.length - 1;
  const key = String(q?.key || '').toLowerCase();
  const label = String(q?.label || '').toLowerCase();
  const looksLikeQ9 = key === 'q9' || label.includes('q9');
  if (!hasAnySplit && isLast && looksLikeQ9) return { co1: 0.5, co2: 0.5 };

  return parsed === 2 ? { co1: 0, co2: 1 } : { co1: 1, co2: 0 };
}

function effectiveCia2Weights(questions: any[], idx: number): { co3: number; co4: number } {
  const q = questions[idx];
  if (!q) return { co3: 0, co4: 0 };
  const parsed = parseCo34(q.co);
  if (parsed === '3&4') return { co3: 0.5, co4: 0.5 };

  const hasAnySplit = questions.some((x) => parseCo34(x?.co) === '3&4');
  const isLast = idx === questions.length - 1;
  const key = String(q?.key || '').toLowerCase();
  const label = String(q?.label || '').toLowerCase();
  const looksLikeQ9 = key === 'q9' || label.includes('q9');
  if (!hasAnySplit && isLast && looksLikeQ9) return { co3: 0.5, co4: 0.5 };

  return parsed === 4 ? { co3: 0, co4: 1 } : { co3: 1, co4: 0 };
}

export default function CQIEntry({ 
  subjectId, 
  teachingAssignmentId, 
  classType,
  enabledAssessments,
  assessmentType,
  cos,
  cqiDivider,
  cqiMultiplier,
}: CQIEntryProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [coTotals, setCoTotals] = useState<Record<number, Record<string, { value: number; max: number } | null>>>({});
  const [cqiEntries, setCqiEntries] = useState<Record<number, CQIEntry>>({});
  const [cqiErrors, setCqiErrors] = useState<Record<string, string>>({});
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [globalCfg, setGlobalCfg] = useState<{ divider: number; multiplier: number; options: any[] } | null>(null);

  const THRESHOLD_PERCENT = 58;
  const effectiveDivider = useMemo(() => {
    const dProp = Number(cqiDivider);
    if (Number.isFinite(dProp) && dProp > 0) return dProp;
    const dGlobal = Number(globalCfg?.divider);
    return Number.isFinite(dGlobal) && dGlobal > 0 ? dGlobal : 2;
  }, [cqiDivider, globalCfg]);
  const effectiveMultiplier = useMemo(() => {
    const mProp = Number(cqiMultiplier);
    if (Number.isFinite(mProp) && mProp >= 0) return mProp;
    const mGlobal = Number(globalCfg?.multiplier);
    return Number.isFinite(mGlobal) && mGlobal >= 0 ? mGlobal : 0.15;
  }, [cqiMultiplier, globalCfg]);

  // Debug/testing UI flags (temporary)
  const [debugMode, setDebugMode] = useState(true);
  const [headerMaxVisible, setHeaderMaxVisible] = useState(true);
  const [draftLog, setDraftLog] = useState<{ updated_at?: string | null; updated_by?: any | null } | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);

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

  // Parse COs from the cos array (e.g., ["CO1", "CO2"] => [1, 2])
  const coNumbers = useMemo(() => {
    if (!cos || !Array.isArray(cos)) return [];
    return cos
      .map(co => {
        const match = co.match(/\d+/);
        return match ? parseInt(match[0]) : null;
      })
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
  }, [cos]);

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
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [teachingAssignmentId]);

  // Load CQI entries from localStorage
  useEffect(() => {
    if (!subjectId || !teachingAssignmentId) return;
    const key = `cqi_entries_${subjectId}_${teachingAssignmentId}`;
    const stored = lsGet<Record<number, CQIEntry>>(key);
    if (stored && typeof stored === 'object') {
      setCqiEntries(stored);
      setDirty(false);
    }

    // Try to fetch draft from server if available
    (async () => {
      try {
        const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
        const res = await fetchWithAuth(`/api/obe/cqi-draft/${encodeURIComponent(String(subjectId))}${qp}`, { method: 'GET' }).catch(() => null);
        if (res && res.ok) {
          const j = await res.json().catch(() => null);
          if (j?.draft) {
            setCqiEntries(j.draft.entries || j.draft || {});
            setDraftLog({ updated_at: j.updated_at || null, updated_by: j.updated_by || null });
            setDirty(false);
          }
        }
      } catch (e) {
        // ignore if server endpoint doesn't exist
      }
    })();
  }, [subjectId, teachingAssignmentId]);

  // Calculate CO totals from internal marks
  useEffect(() => {
    if (!subjectId || !teachingAssignmentId || students.length === 0 || coNumbers.length === 0) return;

    let mounted = true;
    (async () => {
      try {
        setLoading(true);

        const ct = normalizeClassType(classType);
        const enabledSet = normalizeEnabledAssessments(enabledAssessments);
        const isSpecial = ct === 'SPECIAL' && enabledSet.size;
        const allow = (k: string) => (!isSpecial ? true : enabledSet.has(String(k).toLowerCase()));
        const isTcpr = ct === 'TCPR';
        const isTcpl = ct === 'TCPL';
        const isLabLike = ct === 'LAB' || ct === 'PRACTICAL';

        // Read MODEL (ME-COx) marks from the saved model sheet in localStorage (theory/tcpl/tcpr only).
        // SPECIAL courses do not include MODEL in Internal Marks.
        const canUseLocalModel = !isLabLike && ct !== 'SPECIAL';
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
          }
          candidates.push(`model_sheet_${subjectId}`);

          for (const k of candidates) {
            const v = lsGet<any>(k);
            if (v && typeof v === 'object') return v;
          }
          return null;
        })();

        const modelMaxes = (() => {
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
          let hasAny = false;
          const sums = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };

          for (let i = 0; i < MODEL_THEORY_QUESTIONS.length; i++) {
            const def = MODEL_THEORY_QUESTIONS[i];
            const mark = toNumOrNull((qObj as any)[def.key]);
            if (mark == null) continue;
            hasAny = true;
            const co = MODEL_THEORY_CO_ROW[i];
            if (co === 1) sums.co1 += mark;
            else if (co === 2) sums.co2 += mark;
            else if (co === 3) sums.co3 += mark;
            else if (co === 4) sums.co4 += mark;
            else if (co === 5) sums.co5 += mark;
          }

          if (!hasAny) return null;

          const scale = (raw: number, rawMax: number, outOf: number) => {
            if (!rawMax || !Number.isFinite(rawMax) || rawMax <= 0) return 0;
            return clamp((clamp(raw, 0, rawMax) / rawMax) * outOf, 0, outOf);
          };

          return {
            co1: scale(sums.co1, modelMaxes.co1, 2),
            co2: scale(sums.co2, modelMaxes.co2, 2),
            co3: scale(sums.co3, modelMaxes.co3, 2),
            co4: scale(sums.co4, modelMaxes.co4, 2),
            co5: scale(sums.co5, modelMaxes.co5, 4),
          };
        };
        
        // Fetch published marks based on class type and enabled assessments.
        const needs12 = coNumbers.some((co) => co === 1 || co === 2);
        const needs34 = coNumbers.some((co) => co === 3 || co === 4);
        const needs5 = coNumbers.some((co) => co === 5);

        const [ssa1Res, ssa2Res, f1Res, f2Res, cia1Res, cia2Res, review1Res, review2Res, labF1Res, labF2Res, labCia1Res, labCia2Res, labModelRes] =
          await Promise.all([
            needs12 && allow('ssa1') && !isLabLike ? fetchPublishedSsa1(subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },
            needs34 && allow('ssa2') && !isLabLike ? fetchPublishedSsa2(subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },

            // THEORY/SPECIAL only: formative (skill+att)
            needs12 && allow('formative1') && !isLabLike && !isTcpr && !isTcpl ? fetchPublishedFormative1(subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },
            needs34 && allow('formative2') && !isLabLike && !isTcpr && !isTcpl ? fetchPublishedFormative('formative2', subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },

            needs12 && allow('cia1') && !isLabLike ? fetchPublishedCia1Sheet(subjectId, teachingAssignmentId).catch(() => ({ data: null })) : { data: null },
            needs34 && allow('cia2') && !isLabLike ? fetchPublishedCiaSheet('cia2', subjectId, teachingAssignmentId).catch(() => ({ data: null })) : { data: null },

            // TCPR: review replaces formative
            needs12 && allow('review1') && isTcpr ? fetchPublishedReview1(subjectId).catch(() => ({ marks: {} })) : { marks: {} },
            needs34 && allow('review2') && isTcpr ? fetchPublishedReview2(subjectId).catch(() => ({ marks: {} })) : { marks: {} },

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
          ]);

        if (!mounted) return;

        // Get weights from config or use defaults (weight units match Internal Marks style)
        const DEFAULT_WEIGHTS = { ssa: 1.5, cia: 3.0, fa: 2.5 };
        const weights = {
          ssa: DEFAULT_WEIGHTS.ssa,
          cia: DEFAULT_WEIGHTS.cia,
          fa: DEFAULT_WEIGHTS.fa,
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
          review1: { co1: Number(review1Cfg?.coMax?.co1) || 15, co2: Number(review1Cfg?.coMax?.co2) || 15 },
          review2: { co3: Number(review2Cfg?.coMax?.co3 ?? review2Cfg?.coMax?.co1) || 15, co4: Number(review2Cfg?.coMax?.co4 ?? review2Cfg?.coMax?.co2) || 15 },
        };

        const readTcplLabPair = (snapshot: any | null) => {
          const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object' ? snapshot.sheet : {};
          const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object' ? sheet.rowsByStudentId : {};
          const expCountA = clamp(Number(sheet?.expCountA ?? 0), 0, 12);
          const expCountB = clamp(Number(sheet?.expCountB ?? 0), 0, 12);
          const expMaxA = Number.isFinite(Number(sheet?.expMaxA)) ? Number(sheet.expMaxA) : 25;
          const expMaxB = Number.isFinite(Number(sheet?.expMaxB)) ? Number(sheet.expMaxB) : 25;
          const ciaEnabled = (sheet as any)?.ciaExamEnabled !== false;
          const HALF = 30 / 2;
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

        const tcplLab1 = isTcpl ? readTcplLabPair((labF1Res as any)?.data ?? null) : null;
        const tcplLab2 = isTcpl ? readTcplLabPair((labF2Res as any)?.data ?? null) : null;

        const labCia1 = isLabLike ? readTcplLabPair((labCia1Res as any)?.data ?? null) : null;
        const labCia2 = isLabLike ? readTcplLabPair((labCia2Res as any)?.data ?? null) : null;
        const labModel = isLabLike ? readTcplLabPair((labModelRes as any)?.data ?? null) : null;

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
                meMax = coNum === 5 ? 4 : 2;
              }
            }

            if (coNum === 1 || coNum === 2) {
              // THEORY/TCPL/TCPR: SSA1 and CIA1. LAB/PRACTICAL: CIA comes from lab sheet.
              if (!isLabLike) {
                const ssa1Total = toNumOrNull((ssa1Res as any).marks[String(student.id)]);
                const ssa1Half = ssa1Total == null ? null : Number(ssa1Total) / 2;
                ssaMark = ssa1Half;
                ssaMax = coNum === 1 ? maxes.ssa1.co1 : maxes.ssa1.co2;

                const cia1Data = (cia1Res as any).data;
                if (cia1Data) {
                  const cia1ById = cia1Data.rowsByStudentId || {};
                  const cia1Row = cia1ById[String(student.id)] || {};
                  const questions = cia1Data.questions || [];
                  const qObj = (cia1Row as any)?.q && typeof (cia1Row as any).q === 'object' ? (cia1Row as any).q : (cia1Row as any);

                  let anyCiaForCo = false;
                  let ciaAcc = 0;
                  let ciaMaxComputed = 0;

                  questions.forEach((q: any, idxQ: number) => {
                    const qMax = Number(q?.max || 0);
                    const w = effectiveCia1Weights(questions, idxQ);
                    const wCo = coNum === 2 ? w.co2 : w.co1;
                    if (wCo > 0 && qMax > 0) ciaMaxComputed += qMax * wCo;

                    const raw = toNumOrNull(qObj?.[q.key]);
                    if (raw == null) return;
                    if (wCo <= 0) return;
                    anyCiaForCo = true;
                    const mark = qMax > 0 ? clamp(raw, 0, qMax) : raw;
                    ciaAcc += mark * wCo;
                  });

                  if (anyCiaForCo) {
                    ciaMark = ciaAcc;
                    ciaMax = ciaMaxComputed > 0 ? ciaMaxComputed : coNum === 1 ? maxes.cia1.co1 : maxes.cia1.co2;
                  }
                }

                // TCPR: Review1 replaces Formative1
                if (isTcpr) {
                  const review1Total = toNumOrNull((review1Res as any).marks[String(student.id)]);
                  const review1Half = review1Total == null ? null : Number(review1Total) / 2;
                  if (review1Half != null) {
                    reviewMark = review1Half;
                    reviewMax = coNum === 1 ? maxes.review1.co1 : maxes.review1.co2;
                  }
                }

                // TCPL: LAB1 replaces Formative1
                if (isTcpl && tcplLab1) {
                  const r = tcplLab1.get(student.id);
                  const v = coNum === 1 ? r.a : r.b;
                  if (v != null) {
                    faMark = v;
                    faMax = coNum === 1 ? tcplLab1.CO_MAX_A : tcplLab1.CO_MAX_B;
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
                  const r = labCia1.get(student.id);
                  const v = coNum === 1 ? r.a : r.b;
                  if (v != null) {
                    ciaMark = v;
                    ciaMax = coNum === 1 ? labCia1.CO_MAX_A : labCia1.CO_MAX_B;
                  }
                }
              }
            } else if (coNum === 3 || coNum === 4) {
              if (!isLabLike) {
                const ssa2Total = toNumOrNull((ssa2Res as any).marks[String(student.id)]);
                const ssa2Half = ssa2Total == null ? null : Number(ssa2Total) / 2;
                ssaMark = ssa2Half;
                ssaMax = coNum === 3 ? maxes.ssa2.co3 : maxes.ssa2.co4;

                const cia2Data = (cia2Res as any).data;
                if (cia2Data) {
                  const cia2ById = cia2Data.rowsByStudentId || {};
                  const cia2Row = cia2ById[String(student.id)] || {};
                  const questions = cia2Data.questions || [];
                  const qObj = (cia2Row as any)?.q && typeof (cia2Row as any).q === 'object' ? (cia2Row as any).q : (cia2Row as any);

                  let anyCiaForCo = false;
                  let ciaAcc = 0;
                  let ciaMaxComputed = 0;

                  questions.forEach((q: any, idxQ: number) => {
                    const qMax = Number(q?.max || 0);
                    const w = effectiveCia2Weights(questions, idxQ);
                    const wCo = coNum === 4 ? w.co4 : w.co3;
                    if (wCo > 0 && qMax > 0) ciaMaxComputed += qMax * wCo;

                    const raw = toNumOrNull(qObj?.[q.key]);
                    if (raw == null) return;
                    if (wCo <= 0) return;
                    anyCiaForCo = true;
                    const mark = qMax > 0 ? clamp(raw, 0, qMax) : raw;
                    ciaAcc += mark * wCo;
                  });

                  if (anyCiaForCo) {
                    ciaMark = ciaAcc;
                    ciaMax = ciaMaxComputed > 0 ? ciaMaxComputed : coNum === 3 ? maxes.cia2.co3 : maxes.cia2.co4;
                  }
                }

                // TCPR: Review2 replaces Formative2
                if (isTcpr) {
                  const review2Total = toNumOrNull((review2Res as any).marks[String(student.id)]);
                  const review2Half = review2Total == null ? null : Number(review2Total) / 2;
                  if (review2Half != null) {
                    reviewMark = review2Half;
                    reviewMax = coNum === 3 ? maxes.review2.co3 : maxes.review2.co4;
                  }
                }

                // TCPL: LAB2 replaces Formative2
                if (isTcpl && tcplLab2) {
                  const r = tcplLab2.get(student.id);
                  const v = coNum === 3 ? r.a : r.b;
                  if (v != null) {
                    faMark = v;
                    faMax = coNum === 3 ? tcplLab2.CO_MAX_A : tcplLab2.CO_MAX_B;
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
                  const r = labCia2.get(student.id);
                  const v = coNum === 3 ? r.a : r.b;
                  if (v != null) {
                    ciaMark = v;
                    ciaMax = coNum === 3 ? labCia2.CO_MAX_A : labCia2.CO_MAX_B;
                  }
                }
              }
            }

            // LAB/PRACTICAL: MODEL is read from lab sheet (not localStorage)
            if (isLabLike && coNum === 5 && labModel) {
              const r = labModel.get(student.id);
              if (r.a != null) {
                meMark = r.a;
                meMax = labModel.CO_MAX_A;
              }
            }

            // Build component list and breakdown (only include components present)
            const components: Array<{ key: string; mark: number; max: number; w: number; }> = [];
            if (ssaMark !== null && ssaMax > 0) components.push({ key: 'ssa', mark: ssaMark, max: ssaMax, w: weights.ssa });
            if (ciaMark !== null && ciaMax > 0) components.push({ key: 'cia', mark: ciaMark, max: ciaMax, w: weights.cia });

            if (reviewMark !== null && reviewMax > 0) {
              // TCPR review replaces formative weight
              components.push({ key: 'review', mark: reviewMark, max: reviewMax, w: weights.fa });
            }

            if (faMark !== null && faMax > 0) {
              const key = isTcpl ? (coNum === 1 || coNum === 2 ? 'lab1' : coNum === 3 || coNum === 4 ? 'lab2' : 'fa') : 'fa';
              components.push({ key, mark: faMark, max: faMax, w: weights.fa });
            }

            if (meMark !== null && meMax > 0) {
              // For local model sheets: meMax is already 2/4 and mark is scaled to that; set w=meMax so contrib==mark.
              // For lab-like: meMax is the CO_MAX; treat it like a regular component with weight equal to meMax.
              components.push({ key: 'me', mark: meMark, max: meMax, w: meMax });
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
  }, [subjectId, teachingAssignmentId, classType, enabledAssessments, students, coNumbers, masterCfg]);

  const handleCQIChange = (studentId: number, coKey: string, value: string) => {
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
      setCqiErrors(prev => ({ ...prev, [`${studentId}_${coKey}`]: 'Value must be between 0 and 10' }));
      setCqiEntries(prev => ({ ...prev, [studentId]: { ...prev[studentId], [coKey]: numValue } }));
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
      // persist just this change so it survives reloads
      if (subjectId && teachingAssignmentId) {
        const key = `cqi_entries_${subjectId}_${teachingAssignmentId}`;
        try {
          lsSet(key, next);
        } catch {
          // ignore
        }
      }
      setDirty(true);
      return next;
    });
  };

  const handleSave = () => {
    if (!subjectId || !teachingAssignmentId) return;
    // validate no errors
    if (Object.keys(cqiErrors).length) {
      alert('Fix CQI input errors before saving');
      return;
    }

    // Try to save to server first. If server endpoint unavailable, fallback to localStorage.
    (async () => {
      const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
      try {
        const res = await fetchWithAuth(`/api/obe/cqi-save/${encodeURIComponent(String(subjectId))}${qp}`, { method: 'PUT', body: JSON.stringify({ entries: cqiEntries }) }).catch(() => null);
        if (res && res.ok) {
          alert('CQI entries saved to server');
          setDirty(false);
          // attempt to read draft log info
          try { const j = await res.json().catch(() => null); if (j) setDraftLog(j); } catch(_){}
          return;
        }
      } catch {
        // ignore and fallback
      }

      const key = `cqi_entries_${subjectId}_${teachingAssignmentId}`;
      try {
        lsSet(key, cqiEntries);
        setDirty(false);
        alert('CQI entries saved locally');
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
        <button 
          onClick={handleSave}
          className="obe-btn obe-btn-primary"
          style={{ minWidth: 100 }}
        >
          Save CQI
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setDebugMode((s) => !s)}
            className="obe-btn"
            style={{ minWidth: 90, background: debugMode ? '#fef3c7' : undefined }}
          >
            {debugMode ? 'DEBUG ON' : 'DEBUG'}
          </button>
          <button
            type="button"
            onClick={() => setHeaderMaxVisible((s) => !s)}
            className="obe-btn"
            style={{ minWidth: 120 }}
          >
            {headerMaxVisible ? 'Hide Header Max' : 'Show Header Max'}
          </button>

          <button
            type="button"
            onClick={async () => {
              // Save draft to server (falls back to localStorage on error)
              if (!subjectId || !teachingAssignmentId) return alert('Missing subject/teaching assignment');
              try {
                const payload = { entries: cqiEntries };
                const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
                const res = await fetchWithAuth(`/api/obe/cqi-draft/${encodeURIComponent(String(subjectId))}${qp}`, {
                  method: 'PUT',
                  body: JSON.stringify(payload),
                }).catch(() => null);
                if (res && res.ok) {
                  const j = await res.json().catch(() => null);
                  setDraftLog(j || { updated_at: new Date().toISOString(), updated_by: null });
                  setDirty(false);
                  alert('Draft saved to server');
                } else {
                  // fallback to localStorage
                  const key = `cqi_entries_${subjectId}_${teachingAssignmentId}`;
                  try { lsSet(key, cqiEntries); setDirty(false); alert('Draft saved locally'); } catch (e) { alert('Failed to save draft'); }
                }
              } catch (e: any) {
                alert('Failed to save draft: ' + String(e?.message || e));
              }
            }}
            className="obe-btn"
            style={{ minWidth: 110 }}
          >
            Save Draft
          </button>

          <button
            type="button"
            onClick={async () => {
              if (!subjectId) return alert('Missing subject');
              if (!confirm('Publish CQI to DB? This action cannot be undone.')) return;
              try {
                const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
                const res = await fetchWithAuth(`/api/obe/cqi-publish/${encodeURIComponent(String(subjectId))}${qp}`, { method: 'POST' }).catch(() => null);
                if (res && res.ok) { alert('CQI published'); } else { alert('Publish failed (server may not support CQI publish)'); }
              } catch (e: any) { alert('Publish failed: ' + String(e?.message || e)); }
            }}
            className="obe-btn obe-btn-primary"
            style={{ minWidth: 110 }}
          >
            Publish
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e6eef8' }}>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Draft: {draftLog?.updated_at ? new Date(String(draftLog.updated_at)).toLocaleString() : 'never'} {draftLog?.updated_by ? `by ${draftLog.updated_by?.name || draftLog.updated_by?.username || draftLog.updated_by}` : ''}
            {dirty ? ' · unsaved changes' : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#475569' }}><input type="checkbox" checked={autoSaveEnabled} onChange={() => setAutoSaveEnabled((s) => !s)} /> Auto-save</label>
            <button className="obe-btn" onClick={() => {
              // manual sync draft to server
              (async () => {
                if (!subjectId || !teachingAssignmentId) return alert('Missing subject/TA');
                try {
                  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
                  const res = await fetchWithAuth(`/api/obe/cqi-draft/${encodeURIComponent(String(subjectId))}${qp}`, { method: 'PUT', body: JSON.stringify({ entries: cqiEntries }) }).catch(() => null);
                  if (res && res.ok) { const j = await res.json().catch(() => null); setDraftLog(j || null); setDirty(false); alert('Draft synced to server'); }
                  else { alert('Server save failed'); }
                } catch (e:any) { alert('Server save failed: ' + String(e?.message || e)); }
              })();
            }}>Sync Draft</button>
          </div>
        </div>
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
                  Total / Max
                </div>
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, color: '#475569', minWidth: 100 }}>
                AFTER CQI
                <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginTop: 2 }}>
                  Total / Max
                </div>
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, color: '#475569', minWidth: 120 }}>
                TOTAL
                <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginTop: 2 }}>
                  Sum of selected COs
                </div>
              </th>
                  {coNumbers.map(coNum => (
                <th 
                  key={coNum} 
                  style={{ 
                    padding: '12px 8px', 
                    textAlign: 'center', 
                    fontWeight: 700, 
                    color: '#475569',
                    minWidth: 150,
                  }}
                >
                  CO{coNum}
                      <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginTop: 2 }}>
                        {headerMaxVisible ? (
                          <>Max: {headerMaxes[coNum] != null ? round2(headerMaxes[coNum] as number) : '—'}</>
                        ) : (
                          <>&nbsp;</>
                        )}
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

              const totalPctForRule = totalMax ? totalPct : beforePercentage;

              // Calculate AFTER CQI using the two rules.
              // - If TOTAL% < 58: for red COs only, add (input/10 * CO_MAX) / divider
              // - If TOTAL% >= 58: for red COs only, add (input/10 * CO_MAX) * multiplier
              const afterCqiMax = beforeCqiMax; // max stays the same
              let afterCqiValue = beforeCqiValue;
              let delta = 0;

              coNumbers.forEach((coNum) => {
                const coKey = `co${coNum}`;
                const coData: any = studentTotals[coKey];
                const input = cqiEntries[student.id]?.[coKey];
                if (!coData || input == null) return;

                const coPct = coData.max ? (Number(coData.value) / Number(coData.max)) * 100 : 0;
                const isCoBelow = coPct < THRESHOLD_PERCENT;
                if (!isCoBelow) return;

                // Convert input (0..10) to this CO's max scale (e.g. 7) and apply rule.
                const base = (Number(input) / 10) * Number(coData.max);
                const add = totalPctForRule < THRESHOLD_PERCENT
                  ? base / effectiveDivider
                  : base * effectiveMultiplier;

                if (Number.isFinite(add) && add > 0) {
                  delta += add;
                  afterCqiValue += add;
                }
              });

              // Keep AFTER within [0..MAX]
              afterCqiValue = Number.isFinite(afterCqiValue) ? clamp(afterCqiValue, 0, afterCqiMax || afterCqiValue) : beforeCqiValue;
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

                    return (
                      <td 
                        key={coNum}
                        style={{ 
                          padding: '10px 8px', 
                          textAlign: 'center',
                          backgroundColor: isBelowThreshold ? '#fef2f2' : '#f0fdf4',
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
                        {isBelowThreshold ? (
                          <div>
                            <div style={{ 
                              fontSize: 11, 
                              color: '#dc2626', 
                              fontWeight: 600,
                              marginBottom: 4,
                            }}>
                              CQI ATTAINED
                            </div>
                            <input
                              type="number"
                              value={cqiValue ?? ''}
                              onChange={(e) => handleCQIChange(student.id, coKey, e.target.value)}
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
                            ✓ NO CQI
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
    </div>
  );
}
