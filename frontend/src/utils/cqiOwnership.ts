/**
 * CQI placement ownership resolver.
 *
 * Multi-page CQI configs (Theory QP1/QP2) have multiple CQI tabs whose CO sets
 * may overlap — e.g. CIA1(CO1,CO2) and MODEL(CO1..CO5). Faculty expect the
 * smaller-set page to "own" its COs permanently; the larger set page shows
 * overlapping COs as read-only cells regardless of publish order.
 *
 * Ownership is a function of the STATIC placement config (from MarkEntryTabs),
 * not of publish history. Publish state only feeds the displayed values into
 * borrowed cells.
 */

export type CqiPlacementLite = {
  assessmentType: string;
  cos: string[];
};

export type CqiOwnership = Map<number, { placementIndex: number; assessmentType: string }>;

/**
 * Parse a CO label ("CO1", "co3", "1") to its numeric index, or null.
 */
function coLabelToNumber(label: unknown): number | null {
  const digits = String(label ?? '').match(/\d+/);
  if (!digits) return null;
  const n = Number(digits[0]);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null;
}

/**
 * Map each CO number to its owning placement.
 * Owner = placement with the SMALLEST `cos` list containing that CO.
 * Tie-break: lower placement index wins.
 */
export function resolveCqiOwnership(placements: CqiPlacementLite[]): CqiOwnership {
  const parsed = (placements || []).map((p, i) => {
    const cos = (Array.isArray(p?.cos) ? p.cos : [])
      .map(coLabelToNumber)
      .filter((n): n is number => n !== null);
    return {
      index: i,
      assessmentType: String(p?.assessmentType || ''),
      cos,
      size: cos.length,
    };
  });

  // Smallest set wins; tie by lower original index.
  parsed.sort((a, b) => a.size - b.size || a.index - b.index);

  const owner: CqiOwnership = new Map();
  for (const p of parsed) {
    for (const co of p.cos) {
      if (!owner.has(co)) {
        owner.set(co, { placementIndex: p.index, assessmentType: p.assessmentType });
      }
    }
  }
  return owner;
}

/**
 * Partition `myCos` into owned (this page owns the CO) vs borrowed (another
 * placement owns it; render as permanently read-only on this page).
 */
export function getOwnedAndBorrowed(
  ownership: CqiOwnership,
  myIndex: number,
  myCos: number[],
): { owned: Set<number>; borrowed: Set<number> } {
  const owned = new Set<number>();
  const borrowed = new Set<number>();
  for (const co of myCos || []) {
    const o = ownership.get(co);
    if (o && o.placementIndex === myIndex) owned.add(co);
    else borrowed.add(co);
  }
  return { owned, borrowed };
}

/**
 * Find the index of the active placement in the full placement list by
 * matching `assessmentType` first, then by exact CO-set match if multiple
 * placements share an assessmentType. Returns -1 if no match (caller should
 * treat as "all COs owned" — safe fallback for legacy single-placement
 * scenarios where the parent didn't pass `allCqiPlacements`).
 */
export function findPlacementIndex(
  placements: CqiPlacementLite[],
  activeAssessmentType: string | null,
  activeCos: string[],
): number {
  if (!Array.isArray(placements) || !placements.length) return -1;
  const at = String(activeAssessmentType || '').toLowerCase();
  if (!at) return -1;
  const sameType = placements
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => String(p.assessmentType || '').toLowerCase() === at);
  if (sameType.length === 0) return -1;
  if (sameType.length === 1) return sameType[0].i;
  // Multiple placements share an assessmentType — disambiguate by CO set.
  const target = (activeCos || []).map((c) => String(c).toUpperCase()).sort();
  for (const { p, i } of sameType) {
    const cs = (p.cos || []).map((c) => String(c).toUpperCase()).sort();
    if (cs.length === target.length && cs.every((v, idx) => v === target[idx])) {
      return i;
    }
  }
  return sameType[0].i;
}
