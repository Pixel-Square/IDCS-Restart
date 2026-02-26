export const CLASS_TYPES = [
  { value: 'THEORY', label: 'Theory' },
  { value: 'THEORY_PMBL', label: 'Theory (PMBL)' },
  { value: 'LAB', label: 'Lab' },
  { value: 'TCPL', label: 'Tcpl' },
  { value: 'TCPR', label: 'Tcpr' },
  { value: 'PRACTICAL', label: 'Practical' },
  { value: 'PRBL', label: 'PRBL' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'AUDIT', label: 'Audit' },
  { value: 'SPECIAL', label: 'Special' }
] as const;

export const QP_TYPES = [
  { value: 'QP1', label: 'QP1' },
  { value: 'QP2', label: 'QP2' },
  { value: 'ASPR', label: 'ASPR' }
] as const;

export type ClassType = (typeof CLASS_TYPES)[number]['value'] | string;
export type QPType = (typeof QP_TYPES)[number]['value'] | string;

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
