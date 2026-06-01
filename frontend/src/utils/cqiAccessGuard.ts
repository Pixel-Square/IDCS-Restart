import { normalizeObeClassType } from '../constants/classTypes';

export type CqiCycle = 1 | 2 | 3;

export type CqiComponentSpec = {
  key: string;
  label: string;
  tabKey: string;
};

const THEORY_LIKE_COURSE_TYPE = 'THEORY';

const COMPONENT_MATRIX: Record<string, Record<CqiCycle, CqiComponentSpec[]>> = {
  THEORY: {
    1: [
      { key: 'ssa1', label: 'SSA1', tabKey: 'ssa1' },
      { key: 'formative1', label: 'Formative 1', tabKey: 'formative1' },
      { key: 'cia1', label: 'CIA 1', tabKey: 'cia1' },
    ],
    2: [
      { key: 'ssa2', label: 'SSA2', tabKey: 'ssa2' },
      { key: 'formative2', label: 'Formative 2', tabKey: 'formative2' },
      { key: 'cia2', label: 'CIA 2', tabKey: 'cia2' },
    ],
    3: [{ key: 'model', label: 'MODEL', tabKey: 'model' }],
  },
  LAB: {
    1: [
      { key: 'cia1', label: 'Cycle 1 LAB', tabKey: 'cia1' },
      { key: 'cia2', label: 'Cycle 2 LAB', tabKey: 'cia2' },
    ],
    2: [
      { key: 'cia1', label: 'Cycle 1 LAB', tabKey: 'cia1' },
      { key: 'cia2', label: 'Cycle 2 LAB', tabKey: 'cia2' },
    ],
    3: [
      { key: 'cia1', label: 'Cycle 1 LAB', tabKey: 'cia1' },
      { key: 'cia2', label: 'Cycle 2 LAB', tabKey: 'cia2' },
    ],
  },
  TCPL: {
    1: [
      { key: 'ssa1', label: 'SSA1', tabKey: 'ssa1' },
      { key: 'formative1', label: 'LAB 1', tabKey: 'formative1' },
      { key: 'cia1', label: 'CIA 1', tabKey: 'cia1' },
    ],
    2: [
      { key: 'ssa2', label: 'SSA2', tabKey: 'ssa2' },
      { key: 'formative2', label: 'LAB 2', tabKey: 'formative2' },
      { key: 'cia2', label: 'CIA 2', tabKey: 'cia2' },
    ],
    3: [{ key: 'model', label: 'MODEL', tabKey: 'model' }],
  },
  TCPR: {
    1: [
      { key: 'ssa1', label: 'SSA1', tabKey: 'ssa1' },
      { key: 'review1', label: 'Review 1', tabKey: 'review1' },
      { key: 'cia1', label: 'CIA 1', tabKey: 'cia1' },
    ],
    2: [
      { key: 'ssa2', label: 'SSA2', tabKey: 'ssa2' },
      { key: 'review2', label: 'Review 2', tabKey: 'review2' },
      { key: 'cia2', label: 'CIA 2', tabKey: 'cia2' },
    ],
    3: [{ key: 'model', label: 'MODEL', tabKey: 'model' }],
  },
  PRBL: {
    1: [
      { key: 'review1', label: 'Review 1', tabKey: 'review1' },
      { key: 'review2', label: 'Review 2', tabKey: 'review2' },
      { key: 'model', label: 'MODEL', tabKey: 'model' },
    ],
    2: [
      { key: 'review1', label: 'Review 1', tabKey: 'review1' },
      { key: 'review2', label: 'Review 2', tabKey: 'review2' },
      { key: 'model', label: 'MODEL', tabKey: 'model' },
    ],
    3: [
      { key: 'review1', label: 'Review 1', tabKey: 'review1' },
      { key: 'review2', label: 'Review 2', tabKey: 'review2' },
      { key: 'model', label: 'MODEL', tabKey: 'model' },
    ],
  },
};

// Maps broader OBE class types onto CQI guard buckets.
// Unknown/unmapped types fall back to THEORY prerequisites.
export function resolveGuardedCourseType(rawClassType: string | null | undefined): string {
  const compactRaw = String(rawClassType ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compactRaw === 'PRBL' || compactRaw.includes('PRBL')) return 'PRBL';

  const normalized = normalizeObeClassType(rawClassType);
  if (normalized === 'TCPR') return 'TCPR';
  if (normalized === 'TCPL') return 'TCPL';
  if (normalized === 'LAB' || normalized === 'PURE_LAB') return 'LAB';
  return THEORY_LIKE_COURSE_TYPE;
}

// Cycle 1 = CO1/CO2, Cycle 2 = CO3/CO4, Cycle 3 = CO5 or any combination that
// includes CO5 (MODEL placements span CO1..CO5 or CO3..CO5). Returns null when
// the CO list is empty or unparseable so callers can skip the guard.
export function detectCycleFromCos(cos: ReadonlyArray<string | number> | null | undefined): CqiCycle | null {
  if (!cos || cos.length === 0) return null;

  const nums = new Set<number>();
  for (const entry of cos) {
    const raw = String(entry ?? '').trim().toUpperCase();
    if (!raw) continue;
    const match = raw.match(/(\d+)/g);
    if (!match) continue;
    for (const m of match) {
      const n = Number(m);
      if (Number.isFinite(n) && n >= 1 && n <= 5) nums.add(n);
    }
  }

  if (nums.size === 0) return null;
  if (nums.has(5)) return 3;
  if (nums.has(3) || nums.has(4)) return 2;
  return 1;
}

export function getRequiredComponentsForCycle(classType: string | null | undefined, cycle: CqiCycle): CqiComponentSpec[] {
  const courseType = resolveGuardedCourseType(classType);
  const matrix = COMPONENT_MATRIX[courseType] || COMPONENT_MATRIX[THEORY_LIKE_COURSE_TYPE];
  return matrix[cycle] || [];
}
