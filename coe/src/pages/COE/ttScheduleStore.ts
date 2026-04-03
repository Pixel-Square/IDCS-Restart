import { kvHydrate, kvSave } from '../../utils/coeKvStore';

const TT_SCHEDULE_KEY = 'coe-tt-schedule-v1';

/** Call on mount to pull TT schedule from DB into localStorage. */
export async function hydrateTtScheduleStore(): Promise<void> {
  await kvHydrate(TT_SCHEDULE_KEY);
}

type TTScheduleMap = Record<string, Record<string, string>>;

function safeRead(): TTScheduleMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TT_SCHEDULE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TTScheduleMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function safeWrite(value: TTScheduleMap) {
  if (typeof window === 'undefined') return;
  const keys = Object.keys(value || {});
  if (keys.length === 0) {
    kvSave(TT_SCHEDULE_KEY, null);
    return;
  }
  kvSave(TT_SCHEDULE_KEY, value);
}

export function readTTScheduleMap(filterKey: string): Record<string, string> {
  const all = safeRead();
  return all[filterKey] || {};
}

export function setTTDateForCourse(filterKey: string, courseKey: string, date: string) {
  const all = safeRead();
  const current = all[filterKey] || {};

  if (!courseKey) return;

  if (!date) {
    if (current[courseKey]) {
      delete current[courseKey];
    }
  } else {
    current[courseKey] = date;
  }

  if (Object.keys(current).length === 0) {
    delete all[filterKey];
  } else {
    all[filterKey] = current;
  }

  safeWrite(all);
}
