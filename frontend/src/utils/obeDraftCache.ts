import { lsRemove } from './localStorage';

export function clearLocalDraftCache(subjectId: string, assessment: string) {
  const a = String(assessment || '').trim().toLowerCase();
  const sid = String(subjectId || '').trim();
  if (!sid || !a) return;

  // Generic fallback (used by simpler entry tables)
  lsRemove(`marks_${sid}_${a}`);

  // Sheet-style caches
  if (a === 'ssa1') lsRemove(`ssa1_sheet_${sid}`);
  if (a === 'review1') lsRemove(`review1_sheet_${sid}`);
  if (a === 'ssa2') lsRemove(`ssa2_sheet_${sid}`);
  if (a === 'review2') lsRemove(`review2_sheet_${sid}`);
  if (a === 'formative1') lsRemove(`formative1_sheet_${sid}`);
  if (a === 'formative2') lsRemove(`formative2_sheet_${sid}`);
  if (a === 'cia1') lsRemove(`cia1_sheet_${sid}`);
  if (a === 'cia2') lsRemove(`cia2_sheet_${sid}`);
  if (a === 'model') lsRemove(`model_sheet_${sid}`);
}
