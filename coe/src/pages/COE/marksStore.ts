/**
 * Centralised marks store — replaces per-dummy localStorage keys
 * (`marks_${dummy}`, `marks_type_${dummy}`) with a single consolidated
 * blob backed by the COE Key-Value API.
 */

import { kvHydrate, kvSave } from '../../utils/coeKvStore';

const MARKS_STORE_KEY = 'coe-marks-store-v1';

type MarksEntry = {
  marks: Record<string, any>;
  qp_type: string;
};

type MarksMap = Record<string, MarksEntry>;

function readMap(): MarksMap {
  try {
    const raw = window.localStorage.getItem(MARKS_STORE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

/** Call once on page mount to pull marks from the DB into localStorage. */
export async function hydrateMarksStore(): Promise<void> {
  await kvHydrate(MARKS_STORE_KEY);
}

/** Read marks + qp_type for a given dummy (falls back to legacy individual keys). */
export function getMarksForDummy(dummy: string): MarksEntry | null {
  const map = readMap();
  if (map[dummy]) return map[dummy];

  // Legacy fallback: individual localStorage keys (pre-migration data)
  try {
    const rawMarks = window.localStorage.getItem(`marks_${dummy}`);
    const rawQp = window.localStorage.getItem(`marks_type_${dummy}`);
    if (rawMarks) {
      return { marks: JSON.parse(rawMarks), qp_type: rawQp || 'QP1' };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Read only the QP type for a given dummy. */
export function getMarksQpType(dummy: string): string | null {
  const entry = getMarksForDummy(dummy);
  return entry?.qp_type ?? null;
}

/** Save marks + qp_type for a dummy into the consolidated store. */
export function saveMarksForDummy(
  dummy: string,
  marks: Record<string, any>,
  qp_type: string,
): void {
  const map = readMap();
  map[dummy] = { marks, qp_type };
  kvSave(MARKS_STORE_KEY, map);
}

/** Read total marks for a dummy (used by OnePageReport). */
export function readStudentTotalMarks(dummy: string): { hasSavedMarks: boolean; totalMarks: number } {
  const entry = getMarksForDummy(dummy);
  if (!entry) return { hasSavedMarks: false, totalMarks: 0 };

  const totalMarks = Object.values(entry.marks).reduce<number>((acc, value) => {
    const num = Number(value);
    return Number.isFinite(num) ? acc + num : acc;
  }, 0);

  return { hasSavedMarks: true, totalMarks };
}
