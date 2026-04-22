import React, { useState, useEffect } from 'react';
import CLASS_TYPES from '../../constants/classTypes';
import { normalizeClassType } from '../../constants/classTypes';
import { lsGet, lsSet } from '../../utils/localStorage';
import {
  fetchClassTypeWeights,
  upsertClassTypeWeights,
  fetchSpecialExamConfig,
} from '../../services/obe';
import {
  isLabCycleWeights,
  getLabCycleWeightConfig,
  DEFAULT_LAB_CYCLE_WEIGHTS,
  labCycleTotalWeight,
  isProjectWeights,
  isProjectPrblWeights,
  getProjectWeightConfig,
  getProjectPrblWeightConfig,
  DEFAULT_PROJECT_WEIGHTS,
  DEFAULT_PROJECT_PRBL_WEIGHTS,
  isEnglishExamWeights,
  getEnglishExamWeightConfig,
  DEFAULT_ENGLISH_EXAM_WEIGHTS,
  type LabCycleWeights,
  type LabCycleCoWeight,
  type ProjectWeights,
  type ProjectPrblWeights,
  type EnglishExamWeights,
} from '../../utils/internalMarkWeights';

const DEFAULT_INTERNAL_MARK_WEIGHTS_17 = [1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0];

// TCPL has an extra column per CO: CIA Exam (split from LAB/Formative slot).
// Slot order (21):
// CO1: SSA, CIA, LAB, CIA Exam
// CO2: SSA, CIA, LAB, CIA Exam
// CO3: SSA, CIA, LAB, CIA Exam
// CO4: SSA, CIA, LAB, CIA Exam
// ME: CO1..CO5
const DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21 = [
  1.0, 3.25, 2.0, 1.5,
  1.0, 3.25, 2.0, 1.5,
  1.0, 3.25, 2.0, 1.5,
  1.0, 3.25, 2.0, 1.5,
  3.0, 3.0, 3.0, 3.0, 7.0,
];

const INTERNAL_MARK_TABLE_CLASS_TYPES = ['THEORY', 'TCPR', 'TCPL', 'AUDIT'] as const;
const STRUCTURED_WEIGHT_CLASS_TYPES = ['LAB', 'PRACTICAL', 'PROJECT'] as const;


type WeightsRow = {
  ssa1: number | string;
  cia1: number | string;
  formative1: number | string;
  internal_mark_weights: Array<number | string> | LabCycleWeights | ProjectWeights | ProjectPrblWeights;
};

const INTERNAL_CELL_PADDING = 6;
const INTERNAL_INPUT_WIDTH = 64;

function displayClassTypeName(ct: string): string {
  const s = normalizeClassType(ct);
  if (s === 'THEORY') return 'Theory';
  if (s === 'TCPL') return 'TCPL';
  if (s === 'TCPR') return 'TCPR';
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function internalWeightsExpectedLen(classType: string): number {
  const k = normalizeClassType(classType);
  return k === 'TCPL' ? 21 : 17;
}

function defaultInternalWeightsForClassType(classType: string): Array<number | string> {
  const k = normalizeClassType(classType);
  if (k === 'TCPL') return [...DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21];
  return [...DEFAULT_INTERNAL_MARK_WEIGHTS_17];
}

function ensureInternalWeightsLen(classType: string, arr: Array<number | string> | null | undefined): Array<number | string> {
  const expected = internalWeightsExpectedLen(classType);
  const base = defaultInternalWeightsForClassType(classType);
  const next = Array.isArray(arr) ? [...arr] : [...base];
  while (next.length < expected) next.push('');
  return next.slice(0, expected);
}

function splitCycleWeight(total: unknown, ssaW: unknown, ciaW: unknown, faW: unknown): [number, number, number] {
  const t = Number(total);
  const s = Number(ssaW);
  const c = Number(ciaW);
  const f = Number(faW);
  const sum = (Number.isFinite(s) ? s : 0) + (Number.isFinite(c) ? c : 0) + (Number.isFinite(f) ? f : 0);
  if (!Number.isFinite(t) || t <= 0 || !sum) return [0, 0, 0];
  const a = Math.round(((t * (s || 0)) / sum) * 100) / 100;
  const b = Math.round(((t * (c || 0)) / sum) * 100) / 100;
  const d = Math.round(((t * (f || 0)) / sum) * 100) / 100;
  return [a, b, d];
}

function splitLegacyTcplCombinedWeight(total: unknown): [number, number] {
  const labDefault = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21[2] ?? 2);
  const ciaExamDefault = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21[3] ?? 1.5);
  const totalDefault = labDefault + ciaExamDefault;
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return [labDefault, ciaExamDefault];
  const lab = Math.round(((n * labDefault) / totalDefault) * 100) / 100;
  const ciaExam = Math.round((n - lab) * 100) / 100;
  return [lab, ciaExam];
}

function normalizeInternalWeights(
  classType: string,
  arr: Array<number | string> | null | undefined,
  row?: { ssa1?: any; cia1?: any; formative1?: any },
): Array<number | string> {
  const k = normalizeClassType(classType);
  const defaults = defaultInternalWeightsForClassType(k);
  let next = Array.isArray(arr) ? [...arr] : [...defaults];

  const sanitizeLabPractical = (input: Array<number | string>) => {
    const out = ensureInternalWeightsLen(k, input);
    const labCiaFallback = Number((defaults as any)?.[1] ?? DEFAULT_INTERNAL_MARK_WEIGHTS_17[1] ?? 3);
    const modelFallback = Number((defaults as any)?.[16] ?? DEFAULT_INTERNAL_MARK_WEIGHTS_17[16] ?? 4);
    const pickLabCia = (legacy: unknown) => {
      if (legacy === '' || legacy == null) return '';
      const n = Number(legacy);
      if (Number.isFinite(n)) return n;
      return labCiaFallback;
    };
    out[1] = pickLabCia(out[1]);
    out[4] = pickLabCia(out[4]);
    out[7] = pickLabCia(out[7]);
    out[10] = pickLabCia(out[10]);
    if (out[16] === '' || out[16] == null) {
      out[16] = '';
    } else {
      const meCo5Raw = Number(out[16]);
      out[16] = Number.isFinite(meCo5Raw) ? meCo5Raw : modelFallback;
    }
    return out;
  };
  // Backward compatibility: old format had 13 weights with CO1/CO2 as single cycle columns.
  if (next.length === 13) {
    if (k === 'LAB' || k === 'PRACTICAL') {
      const labCiaFallback = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_17[1] ?? 3);
      const modelFallback = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_17[16] ?? 4);
      const pickLabCia = (legacy: unknown) => {
        if (legacy === '' || legacy == null) return '';
        const n = Number(legacy);
        if (Number.isFinite(n)) return n;
        return labCiaFallback;
      };
      const co1Cia = pickLabCia(next[0]);
      const co2Cia = pickLabCia(next[1]);
      const co3Cia = pickLabCia(next[3]);
      const co4Cia = pickLabCia(next[6]);
      const meCo5 = next[12] === '' || next[12] == null ? '' : (Number.isFinite(Number(next[12])) ? Number(next[12]) : modelFallback);
      next = [0, co1Cia, 0, 0, co2Cia, 0, 0, co3Cia, 0, 0, co4Cia, 0, 0, 0, 0, 0, meCo5];
    } else {
      const [co1Ssa, co1Cia, co1Fa] = splitCycleWeight(next[0] ?? 0, row?.ssa1 ?? 1.5, row?.cia1 ?? 3, row?.formative1 ?? 2.5);
      const [co2Ssa, co2Cia, co2Fa] = splitCycleWeight(next[1] ?? 0, row?.ssa1 ?? 1.5, row?.cia1 ?? 3, row?.formative1 ?? 2.5);
      next = [co1Ssa, co1Cia, co1Fa, co2Ssa, co2Cia, co2Fa, ...next.slice(2)];
    }
  }
  // TCPL upgrade: old 17-slot schema -> new 21-slot schema by inserting CIA Exam weights.
  if (k === 'TCPL' && next.length === 17) {
    const out: Array<number | string> = [];
    for (let co = 0; co < 4; co++) {
      const baseIdx = co * 3;
      const [labWeight, ciaExamWeight] = splitLegacyTcplCombinedWeight(next[baseIdx + 2]);
      out.push(next[baseIdx] ?? '', next[baseIdx + 1] ?? '', labWeight, ciaExamWeight);
    }
    out.push(...next.slice(12, 17));
    next = out;
  }

  next = ensureInternalWeightsLen(k, next);
  if (k === 'LAB' || k === 'PRACTICAL') {
    next = sanitizeLabPractical(next);
  }
  return next;
}

type InternalWeightsCol = { label: string; index: number };
type InternalWeightsGroup = { header: string; cols: InternalWeightsCol[] };

function buildInternalWeightsGroups(classType: string): InternalWeightsGroup[] {
  const k = normalizeClassType(classType);

  // Lab-like classes use CIA1/CIA2 + MODEL only.
  if (k === 'LAB' || k === 'PRACTICAL') {
    return [
      { header: 'CO1', cols: [{ label: 'CIA 1', index: 1 }] },
      { header: 'CO2', cols: [{ label: 'CIA 1', index: 4 }] },
      { header: 'CO3', cols: [{ label: 'CIA 2', index: 7 }] },
      { header: 'CO4', cols: [{ label: 'CIA 2', index: 10 }] },
      { header: 'ME', cols: [{ label: 'MODEL', index: 16 }] },
    ];
  }

  const thirdLabelForCo = (coNum: 1 | 2 | 3 | 4) => {
    if (k === 'TCPR') return (coNum === 1 || coNum === 2) ? 'Review 1' : 'Review 2';
    if (k === 'TCPL') return (coNum === 1 || coNum === 2) ? 'LAB 1' : 'LAB 2';
    return (coNum === 1 || coNum === 2) ? 'Formative 1' : 'Formative 2';
  };

  const ciaLabelForCo = (coNum: 1 | 2 | 3 | 4) => (coNum === 1 || coNum === 2 ? 'CIA 1' : 'CIA 2');
  const ssaLabelForCo = (coNum: 1 | 2 | 3 | 4) => (coNum === 1 || coNum === 2 ? 'SSA 1' : 'SSA 2');

  if (k === 'TCPL') {
    const coGroupTcpl = (coNum: 1 | 2 | 3 | 4, baseIndex: number): InternalWeightsGroup => ({
      header: `CO${coNum}`,
      cols: [
        { label: ssaLabelForCo(coNum), index: baseIndex },
        { label: ciaLabelForCo(coNum), index: baseIndex + 1 },
        { label: thirdLabelForCo(coNum), index: baseIndex + 2 },
        { label: 'CIA Exam', index: baseIndex + 3 },
      ],
    });

    return [
      coGroupTcpl(1, 0),
      coGroupTcpl(2, 4),
      coGroupTcpl(3, 8),
      coGroupTcpl(4, 12),
      {
        header: 'ME',
        cols: [
          { label: 'CO1', index: 16 },
          { label: 'CO2', index: 17 },
          { label: 'CO3', index: 18 },
          { label: 'CO4', index: 19 },
          { label: 'CO5', index: 20 },
        ],
      },
    ];
  }

  const coGroup = (coNum: 1 | 2 | 3 | 4, baseIndex: number): InternalWeightsGroup => ({
    header: `CO${coNum}`,
    cols: [
      { label: ssaLabelForCo(coNum), index: baseIndex },
      { label: ciaLabelForCo(coNum), index: baseIndex + 1 },
      { label: thirdLabelForCo(coNum), index: baseIndex + 2 },
    ],
  });

  return [
    coGroup(1, 0),
    coGroup(2, 3),
    coGroup(3, 6),
    coGroup(4, 9),
    {
      header: 'ME',
      cols: [
        { label: 'CO1', index: 12 },
        { label: 'CO2', index: 13 },
        { label: 'CO3', index: 14 },
        { label: 'CO4', index: 15 },
        { label: 'CO5', index: 16 },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Module-level helpers (not inside useEffect) so they can be used by both
// the load effect AND handleSave.
// ---------------------------------------------------------------------------

function buildDefaults(): Record<string, WeightsRow> {
  const out: Record<string, WeightsRow> = {};
  for (const ct of CLASS_TYPES) {
    const k = normalizeClassType(typeof ct === "string" ? ct : (ct as any).value);
    // defaults for TCPR/TCPL as requested; others keep previous defaults
    let ssaDef: number | string = 1.5;
    let ciaDef: number | string = 3;
    let formDef: number | string = 2.5;
          if (k === 'TCPL') {
            ssaDef = 1;
            ciaDef = 3.25;
            formDef = 3.5; // Lab
          } else if (k === 'TCPR') {
            ssaDef = 1;
            ciaDef = 3.25;
            formDef = 4.0; // Review
          } else if (k === 'LAB') {
            ssaDef = 1;
            ciaDef = 1;
            formDef = 1;
          }

          // build internal weights: structured for LAB/PRACTICAL/PROJECT, array for others
          let internalWeights: Array<number | string> | LabCycleWeights | ProjectWeights | ProjectPrblWeights = [...DEFAULT_INTERNAL_MARK_WEIGHTS_17];
          if (k === 'LAB' || k === 'PRACTICAL') {
            internalWeights = JSON.parse(JSON.stringify(DEFAULT_LAB_CYCLE_WEIGHTS));
          } else if (k === 'PRBL') {
            internalWeights = JSON.parse(JSON.stringify(DEFAULT_PROJECT_PRBL_WEIGHTS));
          } else if (k === 'ENGLISH') {
            internalWeights = JSON.parse(JSON.stringify(DEFAULT_ENGLISH_EXAM_WEIGHTS));
          } else if (k === 'PROJECT') {
            internalWeights = JSON.parse(JSON.stringify(DEFAULT_PROJECT_WEIGHTS));
          } else if (k === 'THEORY') {
            internalWeights = [...DEFAULT_INTERNAL_MARK_WEIGHTS_17];
          } else if (k === 'TCPL') {
            // CO1..CO4 => SSA/CIA/LAB/CIAExam repeated, ME COs => 3,3,3,3,7
            internalWeights = [];
            for (let i = 0; i < 4; i++) internalWeights.push(ssaDef, ciaDef, formDef, 0);
            internalWeights.push(3.0, 3.0, 3.0, 3.0, 7.0);
          } else if (k === 'TCPR') {
            // CO1..CO4 => SSA/CIA/FA repeated, ME COs => 3,3,3,3,10
            internalWeights = [];
            for (let i = 0; i < 4; i++) internalWeights.push(ssaDef, ciaDef, formDef);
            internalWeights.push(3.0, 3.0, 3.0, 3.0, 10.0);
          }

          out[k] = {
            ssa1: ssaDef,
            cia1: ciaDef,
            formative1: formDef,
            internal_mark_weights: internalWeights,
          };
        }

  // Ensure single THEORY key exists (server or CLASS_TYPES may provide it)
  if (!out['THEORY']) {
    out['THEORY'] = {
      ssa1: 1.5,
      cia1: 3,
      formative1: 2.5,
      internal_mark_weights: [...DEFAULT_INTERNAL_MARK_WEIGHTS_17],
    };
  }

  return out;
}

function applyAny(src: any): Record<string, WeightsRow> {
  const defaults = buildDefaults();
  if (!src || typeof src !== 'object') return defaults;
  const out: Record<string, WeightsRow> = { ...defaults };
  const all = Array.from(new Set<string>([...CLASS_TYPES.map((ct) => normalizeClassType(typeof ct === "string" ? ct : (ct as any).value)), 'THEORY', ...INTERNAL_MARK_TABLE_CLASS_TYPES.map(ct => normalizeClassType(String(ct))), ...STRUCTURED_WEIGHT_CLASS_TYPES.map(ct => normalizeClassType(String(ct)))]));

  // Normalise a THEORY alias so any casing variant from the server is accepted.
  const theorySeed = src['THEORY'] ?? src['Theory'] ?? src['theory'] ?? null;
  if (theorySeed && typeof theorySeed === 'object') {
    src = { ...src, THEORY: theorySeed };
  }

  for (const k of all) {
    const w = src[k] ?? src[String(k)] ?? src[String(k).toUpperCase()] ?? null;
    if (!w || typeof w !== 'object') continue;
    const rawIm = (w as any).internal_mark_weights;
    const seedRow = {
      ssa1: (w as any).ssa1 ?? out[k].ssa1,
      cia1: (w as any).cia1 ?? out[k].cia1,
      formative1: (w as any).formative1 ?? out[k].formative1,
    };

    // Structured weights for LAB/PRACTICAL/PROJECT: use as-is if valid
    if ((k === 'LAB' || k === 'PRACTICAL') && isLabCycleWeights(rawIm)) {
      out[k] = { ssa1: seedRow.ssa1, cia1: seedRow.cia1, formative1: seedRow.formative1, internal_mark_weights: rawIm };
      continue;
    }
    if (k === 'PROJECT' || k === 'PRBL') {
      if (isProjectWeights(rawIm) || isProjectPrblWeights(rawIm)) {
        out[k] = { ssa1: seedRow.ssa1, cia1: seedRow.cia1, formative1: seedRow.formative1, internal_mark_weights: rawIm };
        continue;
      }
    }

    // SPECIAL: structured exam weights from QP config – pass through as-is
    if (k === 'SPECIAL' && rawIm && typeof rawIm === 'object' && (rawIm as any).type === 'special_exam_weights') {
      out[k] = { ssa1: seedRow.ssa1, cia1: seedRow.cia1, formative1: seedRow.formative1, internal_mark_weights: rawIm };
      continue;
    }

    // ENGLISH: structured 3-cycle weights – pass through as-is
    if (k === 'ENGLISH' && isEnglishExamWeights(rawIm)) {
      out[k] = { ssa1: seedRow.ssa1, cia1: seedRow.cia1, formative1: seedRow.formative1, internal_mark_weights: rawIm };
      continue;
    }

    const im = Array.isArray(rawIm) ? rawIm : null;
    out[k] = {
      ssa1: seedRow.ssa1,
      cia1: seedRow.cia1,
      formative1: seedRow.formative1,
      internal_mark_weights: normalizeInternalWeights(k, (im && im.length ? im : (Array.isArray(out[k].internal_mark_weights) ? out[k].internal_mark_weights : null)) as any, seedRow),
    };
  }
  return out;
}

export default function AcademicControllerWeightsPage() {
  const [weights, setWeights] = useState<Record<string, WeightsRow>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── SPECIAL (CSD) exam list ──
  // Loaded dynamically from QP Config so adding/removing exams from QP Config
  // is automatically reflected here without code changes.
  const [specialExams, setSpecialExams] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      // Prefer server; fallback localStorage; else defaults.
      // After our save pipeline, server is always the source of truth.
      try {
        const svc = await import('../../services/obe');
        const [remote, exams] = await Promise.all([
          svc.fetchClassTypeWeights(),
          fetchSpecialExamConfig().catch(() => [] as string[]),
        ]);
        const applied = applyAny(remote);
        setWeights(applied);
        setSpecialExams(exams);
        // Keep localStorage in sync with what the server returns so that
        // if the server is temporarily unreachable the last-good state is used.
        try { lsSet('iqac_class_type_weights', applied); } catch {}
        return;
      } catch {
        // Server unreachable — fall through to localStorage / defaults.
      }

      // Fetch exam list even if weights fell through
      fetchSpecialExamConfig().then(setSpecialExams).catch(() => {});

      try {
        const saved = lsGet<any>('iqac_class_type_weights');
        const applied = applyAny(saved);
        setWeights(applied);
      } catch {
        setWeights(buildDefaults());
      } finally {
        setLoading(false);
      }
    })().finally(() => setLoading(false));
  }, []);

  // ── handler: update a single SPECIAL exam weight in state ──
  const handleSpecialWeightChange = (exam: string, value: string) => {
    setWeights((prev) => {
      const prevRow = prev['SPECIAL'] || { ssa1: 0, cia1: 0, formative1: 0 };
      const im = (prevRow as any).internal_mark_weights;
      const prevWeights: Record<string, number> =
        im && typeof im === 'object' && im.type === 'special_exam_weights' && typeof im.weights === 'object'
          ? { ...im.weights }
          : { SSA1: 10, SSA2: 10, CIA1: 5, CIA2: 5, MODEL: 10 };
      const n = Number(value);
      prevWeights[exam] = Number.isFinite(n) ? n : 0;
      return {
        ...prev,
        SPECIAL: {
          ...prevRow,
          internal_mark_weights: { type: 'special_exam_weights', weights: prevWeights },
        } as unknown as WeightsRow,
      };
    });
  };

  const handleInternalWeightChange = (classType: string, index: number, value: string) => {
    setWeights((prev) => {
      const row = prev[classType] || ({ ssa1: '', cia1: '', formative1: '', internal_mark_weights: defaultInternalWeightsForClassType(classType) } as WeightsRow);
      const next = Array.isArray(row.internal_mark_weights) ? [...row.internal_mark_weights] : defaultInternalWeightsForClassType(classType);
      const expected = internalWeightsExpectedLen(classType);
      while (next.length < expected) next.push('');
      next[index] = value;
      return {
        ...prev,
        [classType]: {
          ...row,
          internal_mark_weights: next,
        },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // normalize keys to use the canonical form (uppercase)
      const normalized: Record<string, any> = {};
      const keysToSave = Array.from(new Set<string>([...CLASS_TYPES.map((ct) => normalizeClassType(typeof ct === "string" ? ct : (ct as any).value)), 'THEORY', ...INTERNAL_MARK_TABLE_CLASS_TYPES.map(ct => normalizeClassType(String(ct))), ...STRUCTURED_WEIGHT_CLASS_TYPES.map(ct => normalizeClassType(String(ct)))]));

      for (const k of keysToSave) {
        const w = (weights[k] ?? weights[k.toLowerCase()] ?? weights[k.toUpperCase()] ?? {}) as any;

        // Structured weights for LAB/PRACTICAL/PROJECT: send as-is
        if ((k === 'LAB' || k === 'PRACTICAL') && isLabCycleWeights(w?.internal_mark_weights)) {
          normalized[k] = {
            ssa1: Number(w?.ssa1) || 0,
            cia1: Number(w?.cia1) || 0,
            formative1: Number(w?.formative1) || 0,
            internal_mark_weights: w.internal_mark_weights,
          };
          continue;
        }
        if ((k === 'PROJECT' || k === 'PRBL') && (isProjectWeights(w?.internal_mark_weights) || isProjectPrblWeights(w?.internal_mark_weights))) {
          normalized[k] = {
            ssa1: Number(w?.ssa1) || 0,
            cia1: Number(w?.cia1) || 0,
            formative1: Number(w?.formative1) || 0,
            internal_mark_weights: w.internal_mark_weights,
          };
          continue;
        }

        // SPECIAL: structured exam weights – pass through as-is
        if (k === 'SPECIAL' && w?.internal_mark_weights && typeof w.internal_mark_weights === 'object' && w.internal_mark_weights.type === 'special_exam_weights') {
          normalized[k] = {
            ssa1: Number(w?.ssa1) || 0,
            cia1: Number(w?.cia1) || 0,
            formative1: Number(w?.formative1) || 0,
            internal_mark_weights: w.internal_mark_weights,
          };
          continue;
        }

        // ENGLISH: structured 3-cycle weights – pass through as-is
        if (k === 'ENGLISH' && isEnglishExamWeights(w?.internal_mark_weights)) {
          normalized[k] = {
            ssa1: Number(w?.ssa1) || 0,
            cia1: Number(w?.cia1) || 0,
            formative1: Number(w?.formative1) || 0,
            internal_mark_weights: w.internal_mark_weights,
          };
          continue;
        }

        const normalizedIm = normalizeInternalWeights(
          k,
          Array.isArray(w?.internal_mark_weights) ? w.internal_mark_weights : defaultInternalWeightsForClassType(k),
          { ssa1: w?.ssa1, cia1: w?.cia1, formative1: w?.formative1 },
        );
        const expected = internalWeightsExpectedLen(k);
        const defaults = defaultInternalWeightsForClassType(k) as number[];
        normalized[k] = {
          ssa1: Number(w?.ssa1) || 0,
          cia1: Number(w?.cia1) || 0,
          formative1: Number(w?.formative1) || 0,
          internal_mark_weights: ensureInternalWeightsLen(k, normalizedIm).map((x: any, i: number) => {
            const v = Number(x);
            return Number.isFinite(v) ? v : (defaults[i] ?? 0);
          }),
        };

        // Safety: ensure exact length persisted.
        if (Array.isArray(normalized[k].internal_mark_weights)) {
          normalized[k].internal_mark_weights = normalized[k].internal_mark_weights.slice(0, expected);
        }
      }

      // Ensure single THEORY key exists
      if (!normalized.THEORY) {
        normalized.THEORY = normalized.THEORY || null;
      }

      // ------------------------------------------------------------------ //
      // STEP 1: POST the normalised weights to the server.
      // ------------------------------------------------------------------ //
      const svc = await import('../../services/obe');
      try {
        await svc.upsertClassTypeWeights(normalized);
      } catch (e: any) {
        // POST itself failed (network / auth / server error).
        // Keep the user's edits alive in localStorage so they can retry.
        try { lsSet('iqac_class_type_weights', normalized); } catch {}
        setWeights(applyAny(normalized));
        setError(
          `Server save failed: ${(e as any)?.message || 'Network or permission error'}. ` +
          'Your changes are saved in this browser only and will be lost on refresh. ' +
          'Please contact an administrator if the problem persists.'
        );
        return;
      }

      // ------------------------------------------------------------------ //
      // STEP 2: Re-fetch from server to verify what was actually stored.
      // This guarantees the UI always reflects real DB state after a save.
      // ------------------------------------------------------------------ //
      try {
        const remote = await svc.fetchClassTypeWeights();
        const verified = applyAny(remote);
        lsSet('iqac_class_type_weights', verified);
        setWeights(verified);
        setSuccess('Weights saved and verified from server successfully.');
      } catch {
        // Save succeeded but re-fetch failed (e.g. temporary network blip).
        // Use the payload we just sent as the best available state.
        const optimistic = applyAny(normalized);
        lsSet('iqac_class_type_weights', optimistic);
        setWeights(optimistic);
        setSuccess('Weights saved to server (could not re-verify — will confirm on next refresh).');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save weights');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h2 style={{ margin: '0 0 4px 0' }}>Class Type Weights</h2>
      <p style={{ margin: '0 0 18px 0', color: '#6b7280', fontSize: 14 }}>
        Set the weights for each class type. These weights are IQAC-controlled and are not editable by staff.
      </p>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ padding: 24 }}>
          <>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Internal Mark Weightage</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>Inputs are mapped exactly to class-type exam assignments used in Internal Mark calculation.</div>
          </div>
          <div style={{ marginBottom: 24 }}>
            {INTERNAL_MARK_TABLE_CLASS_TYPES.map((ct) => {
              const key = normalizeClassType(String(ct));
              const row = weights[key];
              const arr = normalizeInternalWeights(key, Array.isArray(row?.internal_mark_weights) ? row.internal_mark_weights : defaultInternalWeightsForClassType(key), row);
              const groups = buildInternalWeightsGroups(key);
              const cols = groups.flatMap((g) => g.cols);
              return (
                <div key={key} style={{ marginBottom: 18, overflowX: 'auto' }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{displayClassTypeName(key)}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {groups.map((g) => (
                          <th
                            key={g.header}
                            colSpan={g.cols.length}
                            style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 13 }}
                          >
                            {g.header}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {cols.map((c) => (
                          <th key={`${c.label}_${c.index}`} style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {cols.map((c) => (
                          <td key={c.index} style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, textAlign: 'center' }}>
                            <input
                              type="number"
                              step="0.1"
                              value={(arr as any)[c.index] ?? ''}
                              onChange={(e) => handleInternalWeightChange(key, c.index, e.target.value)}
                              required
                              style={{ width: INTERNAL_INPUT_WIDTH }}
                            />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* ─── LAB / PRACTICAL Cycle-Based Weight Editor ─── */}
          {(['LAB', 'PRACTICAL'] as const).map((ctKey) => {
            const row = weights[ctKey];
            const cfg = isLabCycleWeights(row?.internal_mark_weights) ? row.internal_mark_weights : getLabCycleWeightConfig(null);
            const total = labCycleTotalWeight(cfg);
            const updateLabWeight = (cycle: 'cycle1' | 'cycle2', coKey: string, field: 'exp' | 'cia', value: string) => {
              setWeights((prev) => {
                const prevRow = prev[ctKey] || { ssa1: 0, cia1: 0, formative1: 0, internal_mark_weights: JSON.parse(JSON.stringify(DEFAULT_LAB_CYCLE_WEIGHTS)) };
                const prevCfg = isLabCycleWeights(prevRow.internal_mark_weights) ? prevRow.internal_mark_weights : getLabCycleWeightConfig(null);
                const newCfg: LabCycleWeights = { ...prevCfg, [cycle]: { ...prevCfg[cycle] } };
                const prevCoW = newCfg[cycle][coKey] || { exp: 0, cia: 0 };
                const n = Number(value);
                newCfg[cycle][coKey] = { ...prevCoW, [field]: Number.isFinite(n) ? n : 0 };
                return { ...prev, [ctKey]: { ...prevRow, internal_mark_weights: newCfg } };
              });
            };
            const addCo = (cycle: 'cycle1' | 'cycle2') => {
              setWeights((prev) => {
                const prevRow = prev[ctKey] || { ssa1: 0, cia1: 0, formative1: 0, internal_mark_weights: JSON.parse(JSON.stringify(DEFAULT_LAB_CYCLE_WEIGHTS)) };
                const prevCfg = isLabCycleWeights(prevRow.internal_mark_weights) ? prevRow.internal_mark_weights : getLabCycleWeightConfig(null);
                const existing = Object.keys(prevCfg[cycle]).map(Number).filter(Number.isFinite);
                const next = Math.max(0, ...existing) + 1;
                if (next > 5) return prev;
                const newCfg: LabCycleWeights = { ...prevCfg, [cycle]: { ...prevCfg[cycle], [String(next)]: { exp: 0, cia: 0 } } };
                return { ...prev, [ctKey]: { ...prevRow, internal_mark_weights: newCfg } };
              });
            };
            const removeCo = (cycle: 'cycle1' | 'cycle2', coKey: string) => {
              setWeights((prev) => {
                const prevRow = prev[ctKey] || { ssa1: 0, cia1: 0, formative1: 0, internal_mark_weights: JSON.parse(JSON.stringify(DEFAULT_LAB_CYCLE_WEIGHTS)) };
                const prevCfg = isLabCycleWeights(prevRow.internal_mark_weights) ? prevRow.internal_mark_weights : getLabCycleWeightConfig(null);
                const newCycle = { ...prevCfg[cycle] };
                delete newCycle[coKey];
                const newCfg: LabCycleWeights = { ...prevCfg, [cycle]: newCycle };
                return { ...prev, [ctKey]: { ...prevRow, internal_mark_weights: newCfg } };
              });
            };
            const renderCycle = (cycle: 'cycle1' | 'cycle2', label: string) => {
              const cos = Object.entries(cfg[cycle] || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
              const cycleExpTotal = cos.reduce((s, [, w]) => s + (w.exp || 0), 0);
              const cycleCiaTotal = cos.reduce((s, [, w]) => s + (w.cia || 0), 0);
              const cycleTotal = Math.round((cycleExpTotal + cycleCiaTotal) * 100) / 100;
              return (
                <div key={cycle} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#374151' }}>{label} <span style={{ fontWeight: 400, color: '#6b7280' }}>— Total: {cycleTotal}</span></div>
                  <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ border: '1px solid #d1d5db', padding: '4px 10px', textAlign: 'center', minWidth: 60 }}>CO</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '4px 10px', textAlign: 'center', minWidth: 80 }}>Exp Weight</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '4px 10px', textAlign: 'center', minWidth: 80 }}>CIA Weight</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '4px 10px', textAlign: 'center', minWidth: 60 }}>Total</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'center', width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cos.map(([coKey, w]) => (
                        <tr key={coKey}>
                          <td style={{ border: '1px solid #d1d5db', padding: '4px 10px', textAlign: 'center', fontWeight: 700 }}>CO{coKey}</td>
                          <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'center' }}>
                            <input type="number" step="0.5" min="0" value={w.exp} onChange={(e) => updateLabWeight(cycle, coKey, 'exp', e.target.value)} style={{ width: 64, textAlign: 'center' }} />
                          </td>
                          <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'center' }}>
                            <input type="number" step="0.5" min="0" value={w.cia} onChange={(e) => updateLabWeight(cycle, coKey, 'cia', e.target.value)} style={{ width: 64, textAlign: 'center' }} />
                          </td>
                          <td style={{ border: '1px solid #d1d5db', padding: '4px 10px', textAlign: 'center', fontWeight: 600, color: '#059669' }}>{Math.round(((w.exp || 0) + (w.cia || 0)) * 100) / 100}</td>
                          <td style={{ border: '1px solid #d1d5db', padding: '2px 4px', textAlign: 'center' }}>
                            <button type="button" onClick={() => removeCo(cycle, coKey)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 15 }} title="Remove CO">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" onClick={() => addCo(cycle)} style={{ marginTop: 4, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add CO</button>
                </div>
              );
            };
            return (
              <div key={ctKey} style={{ marginBottom: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafbfc' }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{displayClassTypeName(ctKey)}</div>
                <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
                  Configure per-CO experiment and CIA exam weights for each cycle. Grand total: <b style={{ color: '#059669' }}>{total}</b> (scaled to 100 in Internal Mark page).
                </div>
                {renderCycle('cycle1', 'Cycle 1 (CIA 1)')}
                {renderCycle('cycle2', 'Cycle 2 (CIA 2)')}
              </div>
            );
          })}

          {/* ─── PROJECT Weight Editor ─── */}
          {(() => {
            const ctKey = 'PROJECT';
            const row = weights[ctKey];
            const rawIm = row?.internal_mark_weights;
            const projCfg = isProjectWeights(rawIm) ? rawIm : getProjectWeightConfig(null);
            const total = projCfg.review1.weight + projCfg.review2.weight;

            const updateProjectField = (field: string, subField: 'weight' | 'max', value: string) => {
              setWeights((prev) => {
                const prevRow = prev[ctKey] || { ssa1: 0, cia1: 0, formative1: 0, internal_mark_weights: getProjectWeightConfig(null) };
                const n = Number(value);
                const v = Number.isFinite(n) ? n : 0;
                const cfg = isProjectWeights(prevRow.internal_mark_weights) ? { ...prevRow.internal_mark_weights } : getProjectWeightConfig(null);
                (cfg as any)[field] = { ...(cfg as any)[field], [subField]: v };
                return { ...prev, [ctKey]: { ...prevRow, internal_mark_weights: cfg } };
              });
            };

            const inputCell = (field: string, subField: 'weight' | 'max', val: number) => (
              <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'center' }}>
                <input type="number" step="1" min="0" value={val} onChange={(e) => updateProjectField(field, subField, e.target.value)} style={{ width: 64, textAlign: 'center' }} />
              </td>
            );

            return (
              <div style={{ marginBottom: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafbfc' }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Project</div>
                <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
                  Total: <b style={{ color: '#059669' }}>{total}</b>
                </div>
                <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>Component</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>Max Marks</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontWeight: 600 }}>Review 1</td>{inputCell('review1', 'max', projCfg.review1.max)}{inputCell('review1', 'weight', projCfg.review1.weight)}</tr>
                    <tr><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontWeight: 600 }}>Review 2</td>{inputCell('review2', 'max', projCfg.review2.max)}{inputCell('review2', 'weight', projCfg.review2.weight)}</tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* ─── PRBL Weight Editor ─── */}
          {(() => {
            const ctKey = 'PRBL';
            const row = weights[ctKey];
            const rawIm = row?.internal_mark_weights;
            const prblCfg = isProjectPrblWeights(rawIm) ? rawIm : getProjectPrblWeightConfig(null);
            const total = prblCfg.ssa1.weight + prblCfg.review1.weight + prblCfg.ssa2.weight + prblCfg.review2.weight + prblCfg.model.weight;
            const totalOk = total === 60;

            const updatePrblField = (field: string, subField: 'weight' | 'max', value: string) => {
              setWeights((prev) => {
                const prevRow = prev[ctKey] || { ssa1: 0, cia1: 0, formative1: 0, internal_mark_weights: getProjectPrblWeightConfig(null) };
                const n = Number(value);
                const v = Number.isFinite(n) ? n : 0;
                const cfg = isProjectPrblWeights(prevRow.internal_mark_weights) ? { ...prevRow.internal_mark_weights } : getProjectPrblWeightConfig(null);
                (cfg as any)[field] = { ...(cfg as any)[field], [subField]: v };
                return { ...prev, [ctKey]: { ...prevRow, internal_mark_weights: cfg } };
              });
            };

            const inputCell = (field: string, subField: 'weight' | 'max', val: number) => (
              <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'center' }}>
                <input type="number" step="1" min="0" value={val} onChange={(e) => updatePrblField(field, subField, e.target.value)} style={{ width: 64, textAlign: 'center' }} />
              </td>
            );

            const cycleHeader = (label: string) => (
              <tr style={{ background: '#eff6ff' }}>
                <td colSpan={3} style={{ border: '1px solid #bfdbfe', padding: '4px 10px', fontWeight: 700, color: '#1d4ed8', fontSize: 12 }}>{label}</td>
              </tr>
            );

            return (
              <div style={{ marginBottom: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafbfc' }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>PRBL</div>
                <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
                  Configure per-exam weights for PRBL class-type. Grand total:{' '}
                  <b style={{ color: totalOk ? '#059669' : '#d97706' }}>{total}</b>
                  {!totalOk && <span style={{ color: '#d97706', marginLeft: 8 }}>⚠ should equal 60</span>}
                </div>
                <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>Component</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>Max Marks</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycleHeader('Cycle 1')}
                    <tr><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontWeight: 600 }}>SSA 1</td>{inputCell('ssa1', 'max', prblCfg.ssa1.max)}{inputCell('ssa1', 'weight', prblCfg.ssa1.weight)}</tr>
                    <tr><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontWeight: 600 }}>Review 1</td>{inputCell('review1', 'max', prblCfg.review1.max)}{inputCell('review1', 'weight', prblCfg.review1.weight)}</tr>
                    {cycleHeader('Cycle 2')}
                    <tr><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontWeight: 600 }}>SSA 2</td>{inputCell('ssa2', 'max', prblCfg.ssa2.max)}{inputCell('ssa2', 'weight', prblCfg.ssa2.weight)}</tr>
                    <tr><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontWeight: 600 }}>Review 2</td>{inputCell('review2', 'max', prblCfg.review2.max)}{inputCell('review2', 'weight', prblCfg.review2.weight)}</tr>
                    {cycleHeader('Cycle 3')}
                    <tr><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontWeight: 600 }}>Review 3</td>{inputCell('model', 'max', prblCfg.model.max)}{inputCell('model', 'weight', prblCfg.model.weight)}</tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* ─── SPECIAL (CSD) Exam Weights Editor ─── */}
          {(() => {
            const spRow = weights['SPECIAL'];
            const spIm = (spRow as any)?.internal_mark_weights;
            const spStoredWeights: Record<string, number> =
              spIm && typeof spIm === 'object' && spIm.type === 'special_exam_weights' && typeof spIm.weights === 'object'
                ? spIm.weights
                : { SSA1: 10, SSA2: 10, CIA1: 5, CIA2: 5, MODEL: 10 };
            const examsToShow = specialExams.length > 0 ? specialExams : Object.keys(spStoredWeights);
            const spTotal = examsToShow.reduce((s, ex) => {
              const v = Number(spStoredWeights[ex]);
              return s + (Number.isFinite(v) ? v : 0);
            }, 0);
            return (
              <div style={{ marginBottom: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafbfc' }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Special (CSD)</div>
                <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
                  Per-exam weights for SPECIAL class-type (CSD QP). Exams are derived from the QP Config.
                  Total: <b style={{ color: spTotal === 40 ? '#059669' : '#b45309' }}>{Math.round(spTotal * 100) / 100}</b>
                  {spTotal !== 40 && <span style={{ color: '#b45309', marginLeft: 6, fontSize: 11 }}>(expected 40)</span>}
                </div>
                {examsToShow.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: 12 }}>
                    No exams configured. Go to <b>QP Config → SPECIAL</b> to set up exam patterns first.
                  </div>
                ) : (
                  <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        {examsToShow.map((ex) => (
                          <th key={ex} style={{ border: '1px solid #d1d5db', padding: '6px 14px', textAlign: 'center', minWidth: 80, fontWeight: 700 }}>{ex}</th>
                        ))}
                        <th style={{ border: '1px solid #d1d5db', padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {examsToShow.map((ex) => (
                          <td key={ex} style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'center' }}>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={spStoredWeights[ex] ?? ''}
                              onChange={(e) => handleSpecialWeightChange(ex, e.target.value)}
                              style={{ width: 72, textAlign: 'center' }}
                            />
                          </td>
                        ))}
                        <td style={{ border: '1px solid #d1d5db', padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: spTotal === 40 ? '#059669' : '#b45309' }}>
                          {Math.round(spTotal * 100) / 100}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}

          {/* ─── ENGLISH (3-Cycle) Exam Weights Editor ─── */}
          {(() => {
            const ctKey = 'ENGLISH';
            const row = weights[ctKey];
            const rawIm = row?.internal_mark_weights;
            const cfg: EnglishExamWeights = isEnglishExamWeights(rawIm) ? rawIm : getEnglishExamWeightConfig(null);

            // Grand total = sum of all component weights
            const nonModelTotal =
              cfg.ssa1.weight + cfg.fa1.weight + cfg.cia1.weight +
              cfg.ssa2.weight + cfg.fa2.weight + cfg.cia2.weight;
            const modelTotal = cfg.model.co_weights.reduce((a, b) => a + b, 0);
            const grandTotal = nonModelTotal + modelTotal;
            const totalOk = Math.abs(grandTotal - 60) < 0.01;

            const updateField = (
              key: keyof EnglishExamWeights,
              subField: string,
              value: string,
            ) => {
              setWeights((prev) => {
                const prevRow = prev[ctKey] || { ssa1: 0, cia1: 0, formative1: 0, internal_mark_weights: getEnglishExamWeightConfig(null) };
                const current: EnglishExamWeights = isEnglishExamWeights(prevRow.internal_mark_weights)
                  ? { ...prevRow.internal_mark_weights as EnglishExamWeights }
                  : getEnglishExamWeightConfig(null);
                const n = Number(value);
                const v = Number.isFinite(n) ? n : 0;
                (current as any)[key] = { ...(current as any)[key], [subField]: v };
                return { ...prev, [ctKey]: { ...prevRow, internal_mark_weights: current } };
              });
            };

            const updateCoWeight = (coIdx: number, value: string) => {
              setWeights((prev) => {
                const prevRow = prev[ctKey] || { ssa1: 0, cia1: 0, formative1: 0, internal_mark_weights: getEnglishExamWeightConfig(null) };
                const current: EnglishExamWeights = isEnglishExamWeights(prevRow.internal_mark_weights)
                  ? { ...(prevRow.internal_mark_weights as EnglishExamWeights) }
                  : getEnglishExamWeightConfig(null);
                const arr = [...current.model.co_weights];
                const n = Number(value);
                arr[coIdx] = Number.isFinite(n) ? n : 0;
                current.model = { ...current.model, co_weights: arr };
                return { ...prev, [ctKey]: { ...prevRow, internal_mark_weights: current } };
              });
            };

            const cellStyle: React.CSSProperties = { border: '1px solid #d1d5db', padding: '4px 10px', fontWeight: 600 };
            const inputCell = (key: keyof EnglishExamWeights, sub: string, val: number) => (
              <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'center' }}>
                <input type="number" step="0.5" min="0" value={val}
                  onChange={(e) => updateField(key, sub, e.target.value)}
                  style={{ width: 64, textAlign: 'center' }} />
              </td>
            );
            const cycleHdr = (label: string) => (
              <tr style={{ background: '#eff6ff' }}>
                <td colSpan={4} style={{ border: '1px solid #bfdbfe', padding: '4px 10px', fontWeight: 700, color: '#1d4ed8', fontSize: 12 }}>{label}</td>
              </tr>
            );

            return (
              <div style={{ marginBottom: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafbfc' }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>English (3-Cycle)</div>
                <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
                  Per-exam weights for ENGLISH class-type. Grand total:{' '}
                  <b style={{ color: totalOk ? '#059669' : '#d97706' }}>{Math.round(grandTotal * 100) / 100}</b>
                  {!totalOk && <span style={{ color: '#d97706', marginLeft: 8 }}>⚠ should equal 60</span>}
                  <span style={{ marginLeft: 16, color: '#6b7280' }}>Each CO max = 12 (when all data entered)</span>
                </div>
                <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>Component</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>COs</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>Max Marks</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px 10px' }}>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycleHdr('Cycle 1  (CO1 + CO2)')}
                    <tr><td style={cellStyle}>SSA 1</td><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontSize: 11 }}>CO1, CO2</td>{inputCell('ssa1', 'max', cfg.ssa1.max)}{inputCell('ssa1', 'weight', cfg.ssa1.weight)}</tr>
                    <tr><td style={cellStyle}>FA 1</td><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontSize: 11 }}>CO1, CO2</td>{inputCell('fa1', 'max', cfg.fa1.max)}{inputCell('fa1', 'weight', cfg.fa1.weight)}</tr>
                    <tr><td style={cellStyle}>CIA 1</td><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontSize: 11 }}>CO1–CO5 (equal)</td>{inputCell('cia1', 'max', cfg.cia1.max)}{inputCell('cia1', 'weight', cfg.cia1.weight)}</tr>
                    {cycleHdr('Cycle 2  (CO3 + CO4)')}
                    <tr><td style={cellStyle}>SSA 2</td><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontSize: 11 }}>CO3, CO4</td>{inputCell('ssa2', 'max', cfg.ssa2.max)}{inputCell('ssa2', 'weight', cfg.ssa2.weight)}</tr>
                    <tr><td style={cellStyle}>FA 2</td><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontSize: 11 }}>CO3, CO4</td>{inputCell('fa2', 'max', cfg.fa2.max)}{inputCell('fa2', 'weight', cfg.fa2.weight)}</tr>
                    <tr><td style={cellStyle}>CIA 2</td><td style={{ border: '1px solid #d1d5db', padding: '4px 10px', fontSize: 11 }}>CO1–CO5 (equal)</td>{inputCell('cia2', 'max', cfg.cia2.max)}{inputCell('cia2', 'weight', cfg.cia2.weight)}</tr>
                    {cycleHdr('Cycle 3 — Model Exam  (100 marks, per-CO entry)')}
                    <tr>
                      <td style={cellStyle}>Model</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', fontSize: 11 }}>CO1–CO5</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '4px 10px', textAlign: 'center' }}>
                        <input type="number" step="1" min="0" value={cfg.model.max_per_co}
                          onChange={(e) => updateField('model', 'max_per_co', e.target.value)}
                          style={{ width: 64, textAlign: 'center' }} />
                        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>/ CO</span>
                      </td>
                      <td style={{ border: '1px solid #d1d5db', padding: '4px 6px' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
                          {['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].map((co, i) => (
                            <label key={co} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ color: '#6b7280' }}>{co}</span>
                              <input type="number" step="0.1" min="0" value={cfg.model.co_weights[i] ?? 0}
                                onChange={(e) => updateCoWeight(i, e.target.value)}
                                style={{ width: 52, textAlign: 'center' }} />
                            </label>
                          ))}
                          <span style={{ marginLeft: 4, fontWeight: 700, color: Math.abs(modelTotal - 32) < 0.01 ? '#059669' : '#d97706' }}>
                            = {Math.round(modelTotal * 100) / 100}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
                  Tip: defaults give CO1–CO4 model weight 5.6 and CO5 weight 9.6 (model total = 32),
                  ensuring each CO's cumulative max = 12.
                </div>
              </div>
            );
          })()}

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '8px 18px',
              fontWeight: 700,
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
          {success && <div style={{ color: 'green', marginTop: 12 }}>{success}</div>}
        </form>
      )}
          </>
        </div>
      </div>
    </div>
  );
}

