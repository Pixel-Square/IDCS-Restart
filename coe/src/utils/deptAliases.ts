/**
 * Department alias handling.
 *
 * The backend normalizes department labels (e.g. ME → MECH, CE → CIVIL),
 * but the frontend dropdown uses DB short_name (ME, CE).
 * This module provides a helper to treat known aliases as the same department.
 */

const DEPT_ALIAS_GROUPS: string[][] = [
  ['MECH', 'ME'],
  ['CIVIL', 'CE'],
];

/** Check if two department labels refer to the same department. */
export function isSameDept(a: string, b: string): boolean {
  if (a === b) return true;
  const au = a.toUpperCase();
  const bu = b.toUpperCase();
  if (au === bu) return true;
  for (const group of DEPT_ALIAS_GROUPS) {
    if (group.includes(au) && group.includes(bu)) return true;
  }
  return false;
}
