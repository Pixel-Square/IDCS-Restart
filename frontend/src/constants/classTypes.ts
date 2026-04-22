export const CLASS_TYPES = [
  { value: 'THEORY', label: 'Theory' },
  { value: 'THEORY_PMBL', label: 'Theory (PMBL)' },
  { value: 'LAB', label: 'Lab' },
  { value: 'PURE_LAB', label: 'Pure Lab' },
  { value: 'TCPL', label: 'Tcpl' },
  { value: 'TCPR', label: 'Tcpr' },
  { value: 'PRACTICAL', label: 'Practical' },
  { value: 'PRBL', label: 'PRBL' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'AUDIT', label: 'Audit' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'ENGLISH', label: 'English' },
] as const;

export const QP_TYPES = [
  { value: 'QP1', label: 'QP1' },
  { value: 'QP2', label: 'QP2' },
  { value: 'ASPR', label: 'ASPR' },
  { value: 'ELECTIVE1', label: 'Elective 1' },
] as const;

export type ClassType = (typeof CLASS_TYPES)[number]['value'] | string;
export type QPType = (typeof QP_TYPES)[number]['value'] | string;

export function normalizeClassType(raw?: string | null): string {
  return String(raw ?? '').trim().toUpperCase();
}

export function normalizeObeClassType(raw?: string | null): string {
  const normalized = normalizeClassType(raw);
  const compact = normalized.replace(/[^A-Z0-9]/g, '');

  if (!compact) return '';
  if (compact.includes('TCPR')) return 'TCPR';
  if (compact.includes('TCPL')) return 'TCPL';
  if (compact === 'THEORYPMBL' || compact === 'THEORY' || compact.startsWith('THEORY')) return 'THEORY';
  if (compact === 'PRBL' || compact === 'PROJECT' || compact.includes('PROJECT')) return 'PROJECT';
  if (compact === 'PURELAB') return 'PURE_LAB';
  if (compact === 'LAB' || compact === 'L' || compact.startsWith('LAB')) return 'LAB';
  if (compact === 'PRACTICAL' || compact.startsWith('PRACT')) return 'PRACTICAL';
  if (compact === 'AUDIT') return 'AUDIT';
  if (compact === 'SPECIAL') return 'SPECIAL';
  if (compact === 'ENGLISH') return 'ENGLISH';

  return normalized;
}

export function isLabClassType(raw?: string | null): boolean {
  const s = normalizeObeClassType(raw);
  if (!s) return false;
  if (s === 'LAB' || s === 'L') return true;
  if (s === 'PURE_LAB') return true;
  if (s.startsWith('LAB') || s.includes('LAB')) return true;
  if (s.includes('PRACTICAL') || s.includes('PRACT')) return true;
  return false;
}

export function isSpecialClassType(raw?: string | null): boolean {
  return normalizeObeClassType(raw) === 'SPECIAL';
}

export function isEnglishClassType(raw?: string | null): boolean {
  return normalizeObeClassType(raw) === 'ENGLISH';
}

export default CLASS_TYPES;
