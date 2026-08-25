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
  weightItem?: { internal_mark_weights?: Array<number | string> | null } | null,
): number[] {
  const expected = internalWeightsExpectedLen(classType);
  const base = defaultInternalWeightsForClassType(classType);
  const ct = normalizeClassType(classType || '');
  let raw = Array.isArray(weightItem?.internal_mark_weights) ? weightItem!.internal_mark_weights! : [];

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
  weightItem: { internal_mark_weights?: Array<number | string> | null } | null | undefined,
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
  weightItem?: { internal_mark_weights?: Array<number | string> | null } | null,
): { ssa1: number; cia1: number; formative1: number } {
  const slots = getInternalMarkWeightSlotsForCo(classType, weightItem, 1);
  return {
    ssa1: slots.ssa,
    cia1: slots.cia,
    formative1: slots.fa + slots.ciaExam,
  };
}
