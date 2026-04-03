import { kvHydrate, kvSave } from './coeKvStore';

export type RetrivalAction = 'deleted' | 'reset';

export type RetrivalEntry = {
  id: string;
  action: RetrivalAction;
  source: string;
  page: string;
  createdAt: string;
  records: Array<Record<string, unknown>>;
};

export type RetrivalApplyTarget = 'coe_arrears' | 'coe_students';

export type RetrivalApplyPayload = {
  entry: RetrivalEntry;
  target: RetrivalApplyTarget;
  stagedAt: string;
};

const RETRIVAL_STORAGE_KEY = 'global-retrival-v1';
const RETRIVAL_UPDATED_EVENT = 'retrival:updated';
const RETRIVAL_APPLY_STORAGE_KEY = 'global-retrival-apply-v1';

/** Call on mount to pull retrival data from DB. */
export async function hydrateRetrivalStore(): Promise<void> {
  await Promise.all([
    kvHydrate(RETRIVAL_STORAGE_KEY),
    kvHydrate(RETRIVAL_APPLY_STORAGE_KEY),
  ]);
}

const safeParse = (value: string | null): RetrivalEntry[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as RetrivalEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

export const readRetrivalEntries = (): RetrivalEntry[] => {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(RETRIVAL_STORAGE_KEY));
};

const writeRetrivalEntries = (entries: RetrivalEntry[]) => {
  if (typeof window === 'undefined') return;
  if (!entries.length) {
    kvSave(RETRIVAL_STORAGE_KEY, null);
  } else {
    kvSave(RETRIVAL_STORAGE_KEY, entries);
  }
  window.dispatchEvent(new CustomEvent(RETRIVAL_UPDATED_EVENT));
};

export const appendRetrivalEntry = (entry: Omit<RetrivalEntry, 'id' | 'createdAt'>) => {
  if (typeof window === 'undefined') return;
  if (!entry.records.length) return;

  const nextEntry: RetrivalEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };

  const all = [nextEntry, ...readRetrivalEntries()].slice(0, 500);
  writeRetrivalEntries(all);
};

export const clearRetrivalEntries = () => {
  writeRetrivalEntries([]);
};

export const retrivalUpdateEventName = RETRIVAL_UPDATED_EVENT;

export const stageRetrivalApplyPayload = (payload: Omit<RetrivalApplyPayload, 'stagedAt'>) => {
  if (typeof window === 'undefined') return;
  const data: RetrivalApplyPayload = {
    ...payload,
    stagedAt: new Date().toISOString(),
  };
  kvSave(RETRIVAL_APPLY_STORAGE_KEY, data);
};

export const readRetrivalApplyPayload = (): RetrivalApplyPayload | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RETRIVAL_APPLY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RetrivalApplyPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearRetrivalApplyPayload = () => {
  if (typeof window === 'undefined') return;
  kvSave(RETRIVAL_APPLY_STORAGE_KEY, null);
};
