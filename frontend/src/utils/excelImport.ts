export function normalizeRegisterNo(value: unknown): string {
  if (value == null) return '';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(Math.trunc(value));
  }

  let s = String(value).trim();
  if (!s) return '';

  // Excel sometimes preserves a leading apostrophe for "text" cells.
  if (s.startsWith("'")) s = s.slice(1).trim();

  // Remove thousands separators.
  s = s.replace(/,/g, '');

  // Handle scientific notation strings (happens when Excel auto-formats long numbers).
  // Important: do NOT use Number() here because it can lose digits for large integers.
  // Example: '1.14221104001E+11' must become '114221104001' exactly.
  const sciMatch = s.match(/^([+-])?(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (sciMatch) {
    const sign = sciMatch[1] === '-' ? '-' : '';
    const intPart = sciMatch[2] || '';
    const fracPart = sciMatch[3] || '';
    const exp = Number.parseInt(sciMatch[4] || '0', 10);

    if (Number.isFinite(exp) && exp >= 0) {
      const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '');
      const shift = exp - fracPart.length;
      // Only accept if the result is an integer (decimal point moved right past all fractional digits).
      if (digits && shift >= 0) {
        s = `${sign}${digits}${'0'.repeat(shift)}`;
      }
    }
  }

  // If Excel exports numeric-looking text with trailing .0
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');

  // If the cell contains a long digit run (common register format), prefer it.
  // This prevents mismatches when Excel cells include annotations like "(L)".
  const digitRuns = s.match(/\d+/g);
  if (digitRuns && digitRuns.length) {
    let longest = '';
    for (const run of digitRuns) {
      if (run.length > longest.length) longest = run;
    }
    if (longest.length >= 8) return longest;
  }

  // Normalize: keep only alphanumerics so "1142 1002" / "1142-1002" / etc match.
  s = s.replace(/[^0-9A-Za-z]/g, '');

  return s.toUpperCase();
}

export function registerNoKeys(value: unknown): string[] {
  const norm = normalizeRegisterNo(value);
  if (!norm) return [];

  const keys = [norm];

  // Common UI pattern: show only last N digits.
  if (norm.length > 8) keys.push(norm.slice(-8));
  if (norm.length > 10) keys.push(norm.slice(-10));

  const digitsOnly = norm.replace(/\D+/g, '');
  if (digitsOnly && digitsOnly !== norm) keys.push(digitsOnly);
  if (digitsOnly.length > 8) keys.push(digitsOnly.slice(-8));
  if (digitsOnly.length > 7) keys.push(digitsOnly.slice(-7));

  // Extra tolerance: many sheets/rosters use shortened register suffixes.
  // Add a range of suffix keys so full-vs-short register numbers still match.
  const suffixMin = 6;
  const suffixMax = 12;
  for (let len = suffixMin; len <= suffixMax; len++) {
    if (norm.length > len) keys.push(norm.slice(-len));
    if (digitsOnly.length > len) keys.push(digitsOnly.slice(-len));
  }

  return Array.from(new Set(keys));
}
