export const CLASS_TYPES = ['Theory', 'Lab', 'Tcpl', 'Tcpr', 'Practical', 'Audit', 'Special'] as const;

export type ClassType = (typeof CLASS_TYPES)[number] | string;

export function normalizeClassType(raw?: string | null): string {
  return String(raw ?? '').trim().toUpperCase();
}

export function isLabClassType(raw?: string | null): boolean {
  const s = normalizeClassType(raw);
  if (!s) return false;
  if (s === 'LAB' || s === 'L') return true;
  if (s.startsWith('LAB') || s.includes('LAB')) return true;
  if (s.includes('PRACTICAL') || s.includes('PRACT')) return true;
  return false;
}

export function isSpecialClassType(raw?: string | null): boolean {
  return normalizeClassType(raw) === 'SPECIAL';
}

export default CLASS_TYPES;
