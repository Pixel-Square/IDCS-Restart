export type ClipboardMatrix = string[][];

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function parseClipboardMatrix(text: string): ClipboardMatrix {
  const raw = String(text ?? '');
  if (!raw.trim()) return [];

  const normalized = normalizeNewlines(raw);
  let lines = normalized.split('\n');

  // Common when copying from Excel/Sheets: trailing newline.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines = lines.slice(0, -1);
  }

  const matrix: ClipboardMatrix = [];
  for (const line of lines) {
    // Prefer tab-delimited (Excel/Google Sheets). Fallback to comma.
    const delimiter = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : null);
    const cells = delimiter ? line.split(delimiter) : [line];
    matrix.push(cells);
  }

  // If the clipboard contains a single empty cell, treat it as empty.
  const hasAnyNonEmpty = matrix.some((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  return hasAnyNonEmpty ? matrix : [];
}

export function matrixToClipboardText(matrix: Array<Array<string | number | null | undefined>>): string {
  return (matrix || [])
    .map((row) => (row || []).map((cell) => (cell == null ? '' : String(cell))).join('\t'))
    .join('\n');
}
