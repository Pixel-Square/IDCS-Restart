import { kvHydrate, kvSave } from '../../utils/coeKvStore';

const ATTENDANCE_STORE_KEY = 'coe-attendance-status-v1';
const ATTENDANCE_LOCK_KEY = 'coe-attendance-lock-v1';

/** Call on mount to pull attendance data from DB into localStorage. */
export async function hydrateAttendanceStore(): Promise<void> {
  await Promise.all([
    kvHydrate(ATTENDANCE_STORE_KEY),
    kvHydrate(ATTENDANCE_LOCK_KEY),
  ]);
}

type AttendanceMap = Record<string, Record<string, 'present' | 'absent'>>;
type AttendanceLockMap = Record<string, boolean>;

function safeRead(): AttendanceMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ATTENDANCE_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AttendanceMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function safeWrite(value: AttendanceMap) {
  if (typeof window === 'undefined') return;
  const keys = Object.keys(value || {});
  if (keys.length === 0) {
    kvSave(ATTENDANCE_STORE_KEY, null);
    return;
  }
  kvSave(ATTENDANCE_STORE_KEY, value);
}

export function getAttendanceFilterKey(department: string, semester: string): string {
  return `${String(department || '').toUpperCase()}::${String(semester || '').toUpperCase()}`;
}

export function getAttendanceSessionKey(filterKey: string, courseKey: string, date: string): string {
  return `${filterKey}::${String(courseKey || '')}::${String(date || '')}`;
}

export function readAttendanceStatusMap(filterKey: string): Record<string, 'present' | 'absent'> {
  return safeRead()[filterKey] || {};
}

export function writeAttendanceStatus(filterKey: string, regNo: string, status: 'present' | 'absent') {
  const all = safeRead();
  const current = all[filterKey] || {};
  if (!regNo) return;
  all[filterKey] = {
    ...current,
    [regNo]: status,
  };
  safeWrite(all);
}

export function readAttendanceLock(sessionKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(ATTENDANCE_LOCK_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as AttendanceLockMap;
    return Boolean(parsed?.[sessionKey]);
  } catch {
    return false;
  }
}

export function writeAttendanceLock(sessionKey: string, isLocked: boolean) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(ATTENDANCE_LOCK_KEY);
    const parsed = raw ? (JSON.parse(raw) as AttendanceLockMap) : {};
    const map = parsed && typeof parsed === 'object' ? parsed : {};
    if (isLocked) {
      map[sessionKey] = true;
    } else {
      delete map[sessionKey];
    }
    
    if (Object.keys(map).length === 0) {
      kvSave(ATTENDANCE_LOCK_KEY, null);
    } else {
      kvSave(ATTENDANCE_LOCK_KEY, map);
    }
  } catch {
    // ignore
  }
}

export function readCourseAbsenteesMap(filterKey: string): Map<string, Set<string>> {
  const all = safeRead();
  const courseAbsentees = new Map<string, Set<string>>();

  let locks: AttendanceLockMap = {};
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(ATTENDANCE_LOCK_KEY);
      if (raw) locks = JSON.parse(raw);
    } catch {
      // ignore
    }
  }

  Object.entries(all).forEach(([key, regMap]) => {
    // Only process locked attendance for this department&semester
    if (!locks[key]) return;
    if (key.startsWith(`${filterKey}::`)) {
      // sessionKey format: filterKey::courseKey::date
      // To reliably extract courseKey, we strip the prefix and suffix.
      // Expected suffix: "::YYYY-MM-DD" (12 characters)
      if (key.length <= filterKey.length + 14) return;
      const courseKey = key.slice(filterKey.length + 2, -12);

      if (!courseAbsentees.has(courseKey)) {
        courseAbsentees.set(courseKey, new Set<string>());
      }
      
      const courseSet = courseAbsentees.get(courseKey)!;
      Object.entries(regMap || {}).forEach(([regNo, status]) => {
        if (status === 'absent') {
          courseSet.add(regNo);
        } else {
          // If a student is marked present in another session for the same course, 
          // we might remove them from absentees? No, there's only one attendance per course right now.
          courseSet.delete(regNo);
        }
      });
    }
  });

  return courseAbsentees;
}
