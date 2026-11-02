/**
 * Centralised marks store — uses row-based API for marks storage.
 * Each dummy number is stored as an individual row in the database.
 */

import fetchWithAuth from '../../services/fetchAuth';

const LOCAL_CACHE_KEY = 'coe-marks-store-v2';

type MarksEntry = {
  marks: Record<string, any>;
  qp_type: string;
};

type MarksMap = Record<string, MarksEntry>;

function readLocalCache(): MarksMap {
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

function writeLocalCache(map: MarksMap): void {
  window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(map));
}

/** Call once on page mount to pull marks from the DB into the local cache. */
export async function hydrateMarksStore(): Promise<void> {
  try {
    const res = await fetchWithAuth('/api/coe/student-marks/');
    if (!res.ok) return;
    const json = await res.json();
    
    // Convert array of entries to map
    const map: MarksMap = {};
    for (const entry of json.entries || []) {
      map[entry.dummy_number] = {
        marks: entry.marks || {},
        qp_type: entry.qp_type || 'QP1',
      };
    }
    writeLocalCache(map);
  } catch {
    // Ignore errors, use local cache
  }
}

/** Read marks + qp_type for a given dummy. */
export function getMarksForDummy(dummy: string): MarksEntry | null {
  const map = readLocalCache();
  if (map[dummy]) return map[dummy];

  // Legacy fallback: check old KV store format
  try {
    const oldKey = 'coe-marks-store-v1';
    const oldRaw = window.localStorage.getItem(oldKey);
    if (oldRaw) {
      const oldMap = JSON.parse(oldRaw) || {};
      if (oldMap[dummy]) {
        return oldMap[dummy];
      }
    }
  } catch {
    /* ignore */
  }

  // Older legacy fallback: individual localStorage keys
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

/** Save marks + qp_type for a dummy into the row-based store. */
export function saveMarksForDummy(
  dummy: string,
  marks: Record<string, any>,
  qp_type: string,
): void {
  // Update local cache
  const map = readLocalCache();
  map[dummy] = { marks, qp_type };
  writeLocalCache(map);

  // Save to DB (fire-and-forget)
  fetchWithAuth('/api/coe/student-marks/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dummy_number: dummy, marks, qp_type }),
  }).catch(() => {});
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
