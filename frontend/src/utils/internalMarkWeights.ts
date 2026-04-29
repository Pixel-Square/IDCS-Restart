import { normalizeClassType } from '../constants/classTypes';

const DEFAULT_INTERNAL_MARK_WEIGHTS_17 = [1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0];
const DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21 = [
  1.0, 3.25, 2.0, 1.5,
  1.0, 3.25, 2.0, 1.5,
  1.0, 3.25, 2.0, 1.5,
  1.0, 3.25, 2.0, 1.5,
  3.0, 3.0, 3.0, 3.0, 7.0,
];

export type InternalMarkWeightSlots = {
  ssa: number;
  cia: number;
  fa: number;
  ciaExam: number;
  me: number;
};

function splitLegacyTcplCombinedWeight(total: unknown): { lab: number; ciaExam: number } {
  const fallbackLab = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21[2] ?? 2);
  const fallbackCiaExam = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21[3] ?? 1.5);
  const fallbackTotal = fallbackLab + fallbackCiaExam;
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) {
    return { lab: fallbackLab, ciaExam: fallbackCiaExam };
  }
  const lab = Math.round(((n * fallbackLab) / fallbackTotal) * 100) / 100;
  const ciaExam = Math.round((n - lab) * 100) / 100;
  return { lab, ciaExam };
}

function internalWeightsExpectedLen(classType: string | null | undefined): number {
  return normalizeClassType(classType || '') === 'TCPL' ? 21 : 17;
}

export function defaultInternalWeightsForClassType(classType: string | null | undefined): number[] {
  return normalizeClassType(classType || '') === 'TCPL'
    ? [...DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21]
    : [...DEFAULT_INTERNAL_MARK_WEIGHTS_17];
}

export function getNormalizedInternalMarkWeights(
  classType: string | null | undefined,
  weightItem?: { internal_mark_weights?: Array<number | string> | Record<string, any> | null } | null,
): number[] {
  const expected = internalWeightsExpectedLen(classType);
  const base = defaultInternalWeightsForClassType(classType);
  const ct = normalizeClassType(classType || '');
  const rawWeights = weightItem?.internal_mark_weights;

  if (ct === 'ENGLISH' || ct === 'FOREIGN_LANG') {
    const cfg = ct === 'ENGLISH' ? getEnglishExamWeightConfig(rawWeights) : getForeignLangExamWeightConfig(rawWeights);
    const perCo = (entry: EnglishCycleEntry, fallbackCos: number[]) => {
      const cos = Array.isArray(entry?.cos) && entry.cos.length ? entry.cos : fallbackCos;
      const n = Math.max(1, cos.length);
      return Number(entry?.weight || 0) / n;
    };

    const ssa1Per = perCo(cfg.ssa1, [1, 2]);
    const fa1Per = perCo(cfg.fa1, [1, 2]);
    const ssa2Per = perCo(cfg.ssa2, [3, 4]);
    const fa2Per = perCo(cfg.fa2, [3, 4]);
    const cia1Per = Number(cfg.cia1?.weight || 0) / 5;
    const cia2Per = Number(cfg.cia2?.weight || 0) / 5;
    const meCo = Array.isArray(cfg.model?.co_weights) && cfg.model.co_weights.length === 5
      ? cfg.model.co_weights
      : [2.4, 2.4, 2.4, 2.4, 2.4];

    const englishLike17 = [
      ssa1Per, cia1Per, fa1Per,
      ssa1Per, cia1Per, fa1Per,
      ssa2Per, cia2Per, fa2Per,
      ssa2Per, cia2Per, fa2Per,
      Number(meCo[0] || 0), Number(meCo[1] || 0), Number(meCo[2] || 0), Number(meCo[3] || 0), Number(meCo[4] || 0),
    ];

    while (englishLike17.length < expected) englishLike17.push(base[englishLike17.length] ?? 0);
    return englishLike17.slice(0, expected).map((n, idx) => {
      const v = Number(n);
      return Number.isFinite(v) ? v : (base[idx] ?? 0);
    });
  }

  let raw = Array.isArray(rawWeights) ? rawWeights : [];

  if (ct === 'TCPL' && raw.length === 17) {
    const upgraded: Array<number | string> = [];
    for (let co = 0; co < 4; co++) {
      const baseIdx = co * 3;
      const split = splitLegacyTcplCombinedWeight(raw[baseIdx + 2]);
      upgraded.push(raw[baseIdx] ?? '', raw[baseIdx + 1] ?? '', split.lab, split.ciaExam);
    }
    upgraded.push(...raw.slice(12, 17));
    raw = upgraded;
  }

  const out = raw.map((value, idx) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : (base[idx] ?? 0);
  });

  while (out.length < expected) out.push(base[out.length] ?? 0);
  return out.slice(0, expected);
}

export function getInternalMarkWeightSlotsForCo(
  classType: string | null | undefined,
  weightItem: { internal_mark_weights?: Array<number | string> | Record<string, any> | null } | null | undefined,
  coNum: number,
): InternalMarkWeightSlots {
  const ct = normalizeClassType(classType || '');
  const weights = getNormalizedInternalMarkWeights(ct, weightItem);

  if (ct === 'TCPL') {
    if (coNum >= 1 && coNum <= 4) {
      const base = (coNum - 1) * 4;
      return {
        ssa: Number(weights[base] ?? 0),
        cia: Number(weights[base + 1] ?? 0),
        fa: Number(weights[base + 2] ?? 0),
        ciaExam: Number(weights[base + 3] ?? 0),
        me: Number(weights[16 + (coNum - 1)] ?? 0),
      };
    }
    if (coNum === 5) {
      return { ssa: 0, cia: 0, fa: 0, ciaExam: 0, me: Number(weights[20] ?? 0) };
    }
  }

  if (ct === 'LAB' || ct === 'PRACTICAL') {
    const ciaIndexByCo: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 };
    if (coNum >= 1 && coNum <= 4) {
      return {
        ssa: 0,
        cia: Number(weights[ciaIndexByCo[coNum]] ?? 0),
        fa: 0,
        ciaExam: 0,
        me: Number(weights[12 + (coNum - 1)] ?? 0),
      };
    }
    if (coNum === 5) {
      return { ssa: 0, cia: 0, fa: 0, ciaExam: 0, me: Number(weights[16] ?? 0) };
    }
  }

  // ENGLISH / FOREIGN_LANG: both CIA1 and CIA2 contribute to ALL 5 COs
  if (ct === 'ENGLISH' || ct === 'FOREIGN_LANG') {
    const rawWeights = weightItem?.internal_mark_weights;
    const cfg = ct === 'ENGLISH'
      ? getEnglishExamWeightConfig(rawWeights)
      : getForeignLangExamWeightConfig(rawWeights);
    const cia1Per = Number(cfg.cia1?.weight || 0) / 5;
    const cia2Per = Number(cfg.cia2?.weight || 0) / 5;
    const bothCia = cia1Per + cia2Per;
    const meCoWeights = Array.isArray(cfg.model?.co_weights) && cfg.model.co_weights.length === 5
      ? cfg.model.co_weights
      : [2.4, 2.4, 2.4, 2.4, 2.4];
    const getEntryPerCo = (entry: EnglishCycleEntry, coNum_: number, fallbackCos: number[]) => {
      const cos = Array.isArray(entry?.cos) && entry.cos.length ? entry.cos : fallbackCos;
      return cos.includes(coNum_) ? Number(entry?.weight || 0) / Math.max(1, cos.length) : 0;
    };
    if (coNum >= 1 && coNum <= 2) {
      return {
        ssa: getEntryPerCo(cfg.ssa1, coNum, [1, 2]),
        cia: bothCia,
        fa: getEntryPerCo(cfg.fa1, coNum, [1, 2]),
        ciaExam: 0,
        me: Number(meCoWeights[coNum - 1] || 0),
      };
    }
    if (coNum >= 3 && coNum <= 4) {
      return {
        ssa: getEntryPerCo(cfg.ssa2, coNum, [3, 4]),
        cia: bothCia,
        fa: getEntryPerCo(cfg.fa2, coNum, [3, 4]),
        ciaExam: 0,
        me: Number(meCoWeights[coNum - 1] || 0),
      };
    }
    if (coNum === 5) {
      return { ssa: 0, cia: bothCia, fa: 0, ciaExam: 0, me: Number(meCoWeights[4] || 0) };
    }
    return { ssa: 0, cia: 0, fa: 0, ciaExam: 0, me: 0 };
  }

  if (coNum >= 1 && coNum <= 4) {
    const base = (coNum - 1) * 3;
    return {
      ssa: Number(weights[base] ?? 0),
      cia: Number(weights[base + 1] ?? 0),
      fa: Number(weights[base + 2] ?? 0),
      ciaExam: 0,
      me: Number(weights[12 + (coNum - 1)] ?? 0),
    };
  }

  if (coNum === 5) {
    return { ssa: 0, cia: 0, fa: 0, ciaExam: 0, me: Number(weights[16] ?? 0) };
  }

  return { ssa: 0, cia: 0, fa: 0, ciaExam: 0, me: 0 };
}

export function getCycleOneWeightsFromInternal(
  classType: string | null | undefined,
  weightItem?: { internal_mark_weights?: Array<number | string> | Record<string, any> | null } | null,
): { ssa1: number; cia1: number; formative1: number } {
  const slots = getInternalMarkWeightSlotsForCo(classType, weightItem, 1);
  return {
    ssa1: slots.ssa,
    cia1: slots.cia,
    formative1: slots.fa + slots.ciaExam,
  };
}

// ─── LAB Cycle Weights (structured format) ────────────────────────────────

export type LabCycleCoWeight = { exp: number; cia: number };

export type LabCycleWeights = {
  type: 'lab_cycles';
  cycle1: Record<string, LabCycleCoWeight>;
  cycle2: Record<string, LabCycleCoWeight>;
};

export const DEFAULT_LAB_CYCLE_WEIGHTS: LabCycleWeights = {
  type: 'lab_cycles',
  cycle1: {
    '1': { exp: 9, cia: 3 },
    '2': { exp: 9, cia: 3 },
    '3': { exp: 4.5, cia: 1.5 },
  },
  cycle2: {
    '3': { exp: 4.5, cia: 1.5 },
    '4': { exp: 9, cia: 3 },
    '5': { exp: 9, cia: 3 },
  },
};

export function isLabCycleWeights(w: any): w is LabCycleWeights {
  return w != null && typeof w === 'object' && !Array.isArray(w) && w.type === 'lab_cycles';
}

export function getLabCycleWeightConfig(raw: any): LabCycleWeights {
  if (isLabCycleWeights(raw)) {
    return {
      type: 'lab_cycles',
      cycle1: { ...raw.cycle1 },
      cycle2: { ...raw.cycle2 },
    };
  }
  return JSON.parse(JSON.stringify(DEFAULT_LAB_CYCLE_WEIGHTS));
}

/** Total weight across both cycles (default: 60). */
export function labCycleTotalWeight(cfg: LabCycleWeights): number {
  let total = 0;
  for (const w of Object.values(cfg.cycle1 || {})) total += (w.exp || 0) + (w.cia || 0);
  for (const w of Object.values(cfg.cycle2 || {})) total += (w.exp || 0) + (w.cia || 0);
  return Math.round(total * 100) / 100;
}

/** Per-CO total weight across both cycles. */
export function labCoTotalWeight(cfg: LabCycleWeights, coNum: number): number {
  const k = String(coNum);
  let total = 0;
  const c1 = cfg.cycle1?.[k];
  if (c1) total += (c1.exp || 0) + (c1.cia || 0);
  const c2 = cfg.cycle2?.[k];
  if (c2) total += (c2.exp || 0) + (c2.cia || 0);
  return Math.round(total * 100) / 100;
}

/** Ordered CO keys for a single cycle. */
export function labCycleCoKeys(cycle: Record<string, LabCycleCoWeight> | undefined): string[] {
  if (!cycle || typeof cycle !== 'object') return [];
  return Object.keys(cycle).sort((a, b) => Number(a) - Number(b));
}

/**
 * Build flat weights array matching the schema column order for display.
 * Order: [cycle1 COs sorted...] [cycle2 COs sorted...]
 */
export function labCycleSchemaWeights(cfg: LabCycleWeights): number[] {
  const c1Keys = labCycleCoKeys(cfg.cycle1);
  const c2Keys = labCycleCoKeys(cfg.cycle2);
  return [
    ...c1Keys.map((k) => {
      const w = cfg.cycle1[k];
      return Math.round(((w?.exp || 0) + (w?.cia || 0)) * 100) / 100;
    }),
    ...c2Keys.map((k) => {
      const w = cfg.cycle2[k];
      return Math.round(((w?.exp || 0) + (w?.cia || 0)) * 100) / 100;
    }),
  ];
}

// ─── PROJECT Weights (structured format) ──────────────────────────────────

export type ProjectWeights = {
  type: 'project_reviews';
  review1: { weight: number; max: number };
  review2: { weight: number; max: number };
};

export type ProjectPrblWeights = {
  type: 'project_prbl';
  ssa1: { weight: number; max: number };
  review1: { weight: number; max: number };
  ssa2: { weight: number; max: number };
  review2: { weight: number; max: number };
  model: { weight: number; max: number };
};

export const DEFAULT_PROJECT_WEIGHTS: ProjectWeights = {
  type: 'project_reviews',
  review1: { weight: 50, max: 50 },
  review2: { weight: 50, max: 50 },
};

export const DEFAULT_PROJECT_PRBL_WEIGHTS: ProjectPrblWeights = {
  type: 'project_prbl',
  ssa1: { weight: 3, max: 20 },
  review1: { weight: 12, max: 50 },
  ssa2: { weight: 3, max: 20 },
  review2: { weight: 12, max: 50 },
  model: { weight: 30, max: 100 },
};

export function isProjectWeights(w: any): w is ProjectWeights {
  return w != null && typeof w === 'object' && !Array.isArray(w) && w.type === 'project_reviews';
}

export function isProjectPrblWeights(w: any): w is ProjectPrblWeights {
  return w != null && typeof w === 'object' && !Array.isArray(w) && w.type === 'project_prbl';
}

export function getProjectWeightConfig(raw: any): ProjectWeights {
  if (isProjectWeights(raw)) return raw;
  return JSON.parse(JSON.stringify(DEFAULT_PROJECT_WEIGHTS));
}

export function getProjectPrblWeightConfig(raw: any): ProjectPrblWeights {
  if (isProjectPrblWeights(raw)) return raw;
  return JSON.parse(JSON.stringify(DEFAULT_PROJECT_PRBL_WEIGHTS));
}

// ─── SPECIAL Exam Weights (structured format) ────────────────────────────

export type SpecialExamWeights = {
  type: 'special_exam_weights';
  weights: Record<string, number>;
};

export const DEFAULT_SPECIAL_EXAM_WEIGHTS: SpecialExamWeights = {
  type: 'special_exam_weights',
  weights: { SSA1: 10, SSA2: 10, CIA1: 5, CIA2: 5, MODEL: 10 },
};

export function isSpecialExamWeights(w: any): w is SpecialExamWeights {
  return w != null && typeof w === 'object' && !Array.isArray(w) && w.type === 'special_exam_weights';
}

export function getSpecialExamWeightConfig(raw: any): SpecialExamWeights {
  if (isSpecialExamWeights(raw)) return raw;
  return JSON.parse(JSON.stringify(DEFAULT_SPECIAL_EXAM_WEIGHTS));
}

// ─── ENGLISH Exam Weights (3-cycle structured format) ─────────────────────

export type EnglishCycleEntry = { max: number; weight: number; cos?: number[] };
export type EnglishModelEntry = { max_per_co: number; co_weights: number[] };

export type EnglishExamWeights = {
  type: 'english_exam_weights';
  ssa1:  EnglishCycleEntry;
  fa1:   EnglishCycleEntry;
  cia1:  EnglishCycleEntry;
  ssa2:  EnglishCycleEntry;
  fa2:   EnglishCycleEntry;
  cia2:  EnglishCycleEntry;
  model: EnglishModelEntry;
};

/** Default weights that produce each CO max = 8 (?), grand total = 40.
 *
 *  Breakdown:
 *   Cycle 1 – CO1+CO2:  SSA1(3) + FA1(5) + CIA1(6) = 14
 *   Cycle 2 – CO3+CO4:  SSA2(3) + FA2(5) + CIA2(6) = 14
 *   Cycle 3 – all COs:  Model(2.4×5) = 12
 *   Total = 40
 */
export const DEFAULT_ENGLISH_EXAM_WEIGHTS: EnglishExamWeights = {
  type: 'english_exam_weights',
  ssa1:  { max: 20, weight: 3.0,  cos: [1, 2] },
  fa1:   { max: 20, weight: 5.0,  cos: [1, 2] },
  cia1:  { max: 60, weight: 6.0 },
  ssa2:  { max: 20, weight: 3.0,  cos: [3, 4] },
  fa2:   { max: 20, weight: 5.0,  cos: [3, 4] },
  cia2:  { max: 60, weight: 6.0 },
  model: { max_per_co: 20, co_weights: [2.4, 2.4, 2.4, 2.4, 2.4] },
};

export function isEnglishExamWeights(w: any): w is EnglishExamWeights {
  return w != null && typeof w === 'object' && !Array.isArray(w) && w.type === 'english_exam_weights';
}

export function getEnglishExamWeightConfig(raw: any): EnglishExamWeights {
  if (isEnglishExamWeights(raw)) return raw;
  return JSON.parse(JSON.stringify(DEFAULT_ENGLISH_EXAM_WEIGHTS));
}

// ─── FOREIGN LANGUAGE Exam Weights (same 3-cycle structure as ENGLISH) ────────

export type ForeignLangExamWeights = {
  type: 'foreign_lang_exam_weights';
  ssa1:  EnglishCycleEntry;
  fa1:   EnglishCycleEntry;
  cia1:  EnglishCycleEntry;
  ssa2:  EnglishCycleEntry;
  fa2:   EnglishCycleEntry;
  cia2:  EnglishCycleEntry;
  model: EnglishModelEntry;
};

export const DEFAULT_FOREIGN_LANG_EXAM_WEIGHTS: ForeignLangExamWeights = {
  type: 'foreign_lang_exam_weights',
  ssa1:  { max: 20, weight: 3.0,  cos: [1, 2] },
  fa1:   { max: 20, weight: 5.0,  cos: [1, 2] },
  cia1:  { max: 60, weight: 6.0 },
  ssa2:  { max: 20, weight: 3.0,  cos: [3, 4] },
  fa2:   { max: 20, weight: 5.0,  cos: [3, 4] },
  cia2:  { max: 60, weight: 6.0 },
  model: { max_per_co: 20, co_weights: [2.4, 2.4, 2.4, 2.4, 2.4] },
};

export function isForeignLangExamWeights(w: any): w is ForeignLangExamWeights {
  return w != null && typeof w === 'object' && !Array.isArray(w) && w.type === 'foreign_lang_exam_weights';
}

export function getForeignLangExamWeightConfig(raw: any): ForeignLangExamWeights {
  if (isForeignLangExamWeights(raw)) return raw;
  return JSON.parse(JSON.stringify(DEFAULT_FOREIGN_LANG_EXAM_WEIGHTS));
}
