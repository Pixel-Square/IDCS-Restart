// SPECIAL (CSD) CO-wise weight matrix helpers.
//
// Storage shape (extends the existing `special_exam_weights` schema with
// optional `cos`, `components`, `co_weights`). The flat `weights` map is
// kept in sync as the per-component column total so legacy consumers that
// read `weights[<COMPONENT>]` keep working.
//
//   {
//     type: 'special_exam_weights',
//     weights: { CIA1: 5, SSA1: 4, FORMATIVE1: 6, CIA2: 5, SSA2: 4, FORMATIVE2: 6, MODEL: 10 },
//     cos: ['CO1', 'CO2', 'CO3'],
//     components: ['CIA1','SSA1','FORMATIVE1','CIA2','SSA2','FORMATIVE2','MODEL'],
//     co_weights: {
//       CO1: { CIA1: 2.5, SSA1: 2, FORMATIVE1: 0, CIA2: 2.5, SSA2: 2, FORMATIVE2: 0, MODEL: 5 },
//       CO2: { CIA1: 2.5, SSA1: 2, FORMATIVE1: 0, CIA2: 2.5, SSA2: 2, FORMATIVE2: 0, MODEL: 5 },
//       CO3: { CIA1: 0,   SSA1: 0, FORMATIVE1: 6, CIA2: 0,   SSA2: 0, FORMATIVE2: 6, MODEL: 0 },
//     },
//   }
//
// The matrix is the source of truth; column totals (`weights`) are derived.

export type SpecialCoMatrix = Record<string, Record<string, number>>;

export type SpecialCoWiseConfig = {
  type: 'special_exam_weights';
  weights: Record<string, number>;
  cos: string[];
  components: string[];
  co_weights: SpecialCoMatrix;
};

/** Internal component identifiers (must match backend `_ALL_SPECIAL_EXAM_KEYS`). */
export const SPECIAL_COMPONENT_KEYS = ['CIA1', 'SSA1', 'FORMATIVE1', 'CIA2', 'SSA2', 'FORMATIVE2', 'MODEL'] as const;

/** Display labels (FA = formerly AL/Formative). */
export const SPECIAL_COMPONENT_LABELS: Record<string, string> = {
  CIA1: 'CIA1', SSA1: 'SSA1', FORMATIVE1: 'FA1',
  CIA2: 'CIA2', SSA2: 'SSA2', FORMATIVE2: 'FA2',
  MODEL: 'Model',
};

export const DEFAULT_SPECIAL_CO_MATRIX: SpecialCoMatrix = {
  CO1: { CIA1: 2.5, SSA1: 2, FORMATIVE1: 0, CIA2: 2.5, SSA2: 2, FORMATIVE2: 0, MODEL: 5 },
  CO2: { CIA1: 2.5, SSA1: 2, FORMATIVE1: 0, CIA2: 2.5, SSA2: 2, FORMATIVE2: 0, MODEL: 5 },
  CO3: { CIA1: 0,   SSA1: 0, FORMATIVE1: 6, CIA2: 0,   SSA2: 0, FORMATIVE2: 6, MODEL: 0 },
};

export function deriveSpecialColumnTotals(matrix: SpecialCoMatrix): Record<string, number> {
  const out: Record<string, number> = {};
  for (const comp of SPECIAL_COMPONENT_KEYS) {
    let s = 0;
    for (const co of Object.keys(matrix)) {
      const v = Number(matrix[co]?.[comp]);
      s += Number.isFinite(v) ? v : 0;
    }
    out[comp] = Math.round(s * 100) / 100;
  }
  return out;
}

export const DEFAULT_SPECIAL_CO_WISE_CONFIG: SpecialCoWiseConfig = {
  type: 'special_exam_weights',
  weights: deriveSpecialColumnTotals(DEFAULT_SPECIAL_CO_MATRIX),
  cos: ['CO1', 'CO2', 'CO3'],
  components: [...SPECIAL_COMPONENT_KEYS],
  co_weights: JSON.parse(JSON.stringify(DEFAULT_SPECIAL_CO_MATRIX)),
};

/** Normalize raw storage into a complete matrix config. Accepts:
 *  - legacy `{type:'special_exam_weights', weights:{...}}` (column totals only)
 *  - new matrix form with `co_weights`
 *  - null/garbage → defaults
 */
export function getSpecialCoWiseConfig(raw: any): SpecialCoWiseConfig {
  if (!raw || typeof raw !== 'object' || raw.type !== 'special_exam_weights') {
    return JSON.parse(JSON.stringify(DEFAULT_SPECIAL_CO_WISE_CONFIG));
  }
  const cos: string[] = Array.isArray(raw.cos) && raw.cos.length ? raw.cos.map(String) : ['CO1', 'CO2', 'CO3'];
  const components: string[] = Array.isArray(raw.components) && raw.components.length
    ? raw.components.map(String)
    : [...SPECIAL_COMPONENT_KEYS];

  const matrix: SpecialCoMatrix = {};
  if (raw.co_weights && typeof raw.co_weights === 'object') {
    for (const co of cos) {
      matrix[co] = {};
      for (const comp of components) {
        const v = Number(raw.co_weights?.[co]?.[comp]);
        matrix[co][comp] = Number.isFinite(v) ? v : 0;
      }
    }
  } else {
    // Legacy flat data: split each component's column total evenly across the listed COs.
    const flat = raw.weights && typeof raw.weights === 'object' ? raw.weights : {};
    for (const co of cos) {
      matrix[co] = {};
      for (const comp of components) {
        const total = Number(flat?.[comp]);
        matrix[co][comp] = Number.isFinite(total) && cos.length > 0
          ? Math.round((total / cos.length) * 100) / 100
          : 0;
      }
    }
  }

  return {
    type: 'special_exam_weights',
    weights: deriveSpecialColumnTotals(matrix),
    cos,
    components,
    co_weights: matrix,
  };
}

export function isSpecialCoWiseConfig(w: any): w is SpecialCoWiseConfig {
  return w != null
    && typeof w === 'object'
    && !Array.isArray(w)
    && w.type === 'special_exam_weights';
}

/** Column totals (sum across CO rows for one component). */
export function specialColumnTotal(cfg: SpecialCoWiseConfig, comp: string): number {
  let s = 0;
  for (const co of cfg.cos) s += Number(cfg.co_weights?.[co]?.[comp]) || 0;
  return Math.round(s * 100) / 100;
}

/** Row totals (sum across components for one CO). */
export function specialRowTotal(cfg: SpecialCoWiseConfig, co: string, components?: string[]): number {
  const comps = components || cfg.components;
  let s = 0;
  for (const comp of comps) s += Number(cfg.co_weights?.[co]?.[comp]) || 0;
  return Math.round(s * 100) / 100;
}
