/**
 * Shuffled-list store — extracted from StudentsList so that
 * StudentsList, BundleBarcodeView & OnePageReport can share
 * the same read/write helpers backed by the COE KV API.
 */

import { kvHydrate, kvSave } from '../../utils/coeKvStore';

export const SHUFFLED_LIST_KEY = 'coe-students-shuffled-list-v1';
export const SHUFFLE_LOCK_KEY = 'coe-students-shuffle-lock-v1';

export type PersistedShuffledStudent = { reg_no: string; name: string };
export type PersistedShuffledByDummy = Record<string, PersistedShuffledStudent>;

/* ---- hydrate ---- */

export async function hydrateShuffledListStore(): Promise<void> {
  await Promise.all([
    kvHydrate(SHUFFLED_LIST_KEY),
    kvHydrate(SHUFFLE_LOCK_KEY),
  ]);
}

/* ---- shuffle locks ---- */

export function readShuffleLocks(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(SHUFFLE_LOCK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeShuffleLocks(locks: Record<string, boolean>): void {
  const keys = Object.keys(locks || {}).filter((k) => Boolean(locks[k]));
  if (keys.length > 0) {
    kvSave(SHUFFLE_LOCK_KEY, locks);
  } else {
    kvSave(SHUFFLE_LOCK_KEY, null);
  }
}

export function markFilterAsShuffled(filterKey: string): void {
  const locks = readShuffleLocks();
  locks[filterKey] = true;
  writeShuffleLocks(locks);
}

export function unmarkFilterAsShuffled(filterKey: string): void {
  const locks = readShuffleLocks();
  if (locks[filterKey]) {
    delete locks[filterKey];
    writeShuffleLocks(locks);
  }
}

export function isFilterShuffled(filterKey: string): boolean {
  return Boolean(readShuffleLocks()[filterKey]);
}

/* ---- shuffled lists ---- */

export function readShuffledLists(): Record<string, PersistedShuffledByDummy> {
  try {
    const raw = window.localStorage.getItem(SHUFFLED_LIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PersistedShuffledByDummy>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeShuffledLists(lists: Record<string, PersistedShuffledByDummy>): void {
  const keys = Object.keys(lists || {});
  if (keys.length > 0) {
    kvSave(SHUFFLED_LIST_KEY, lists);
  } else {
    kvSave(SHUFFLED_LIST_KEY, null);
  }
}

export function getPersistedShuffledForFilter(filterKey: string): PersistedShuffledByDummy {
  return readShuffledLists()[filterKey] || {};
}

export function setPersistedShuffledForFilter(
  filterKey: string,
  shuffledByDummy: PersistedShuffledByDummy,
): void {
  const lists = readShuffledLists();
  lists[filterKey] = shuffledByDummy;
  writeShuffledLists(lists);
}

export function clearPersistedShuffledForFilter(filterKey: string): void {
  const lists = readShuffledLists();
  if (lists[filterKey]) {
    delete lists[filterKey];
    writeShuffledLists(lists);
  }
}
