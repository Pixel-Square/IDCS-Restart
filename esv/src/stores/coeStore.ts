/**
 * Reads the COE assigning store from localStorage (shared with COE app).
 * Shape: Record<storeKey, PersistedAssignment[]>
 * storeKey = "DEPT::SEM::YYYY-MM-DD"
 */

const ASSIGNING_STORE_KEY = 'coe-assigning-v1';
const ASSIGNING_UPDATED_EVENT = 'coe:assigning-updated';
const SHUFFLED_LIST_KEY = 'coe-students-shuffled-list-v1';
const COURSE_BUNDLE_DUMMY_STORE_KEY = 'coe-course-bundle-dummies-v1';

export type PersistedBundle = {
  id: string;
  name: string;
  scripts: number;
};

export type PersistedValuator = {
  facultyCode: string;
  facultyName: string;
  scripts: number;
  bundles: PersistedBundle[];
};

export type PersistedAssignment = {
  courseKey: string;
  valuators: PersistedValuator[];
};

type PersistedStore = Record<string, PersistedAssignment[]>;

export function readAssigningStore(): PersistedStore {
  try {
    const raw = localStorage.getItem(ASSIGNING_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export type FacultyAllocation = {
  storeKey: string;
  department: string;
  semester: string;
  date: string;
  courseKey: string;
  facultyName?: string;
  scripts: number;
  bundles: PersistedBundle[];
};

/**
 * Given a faculty code, find all their allocations across all store keys.
 */
export function findAllocationsForFaculty(facultyCode: string): FacultyAllocation[] {
  // Clear any potential stale state if we want to be absolutely sure,
  // though readAssigningStore already reads fresh from localStorage.
  const store = readAssigningStore();
  const code = facultyCode.trim().toUpperCase();
  if (!code) return [];

  const results: FacultyAllocation[] = [];

  Object.entries(store).forEach(([storeKey, assignments]) => {
    // storeKey = "DEPT::SEM::DATE" (from coe app)
    const parts = storeKey.split('::');
    if (parts.length < 3) return; // Skip invalid keys

    const department = parts[0] || '';
    const semester = parts[1] || '';
    const date = parts[2] || '';

    (assignments || []).forEach((assignment) => {
      (assignment.valuators || []).forEach((valuator) => {
        const vCode = String(valuator.facultyCode || '').trim().toUpperCase();
        if (vCode === code) {
          const hasScripts = Number(valuator.scripts) > 0;
          const hasBundles = Array.isArray(valuator.bundles) && valuator.bundles.length > 0;
          
          if (hasScripts || hasBundles) {
            results.push({
              storeKey,
              department,
              semester,
              date,
              courseKey: assignment.courseKey,
              scripts: Number(valuator.scripts) || 0,
              bundles: Array.isArray(valuator.bundles) ? valuator.bundles : [],
            });
          }
        }
      });
    });
  });

  // Sort by date descending
  return results.sort((a, b) => b.date.localeCompare(a.date));
}

export const assigningUpdateEventName = ASSIGNING_UPDATED_EVENT;

/**
 * Read the shuffled dummy list to get dummy numbers.
 * Shape: Record<filterKey, Record<dummy, { reg_no, name }>>
 * filterKey = "DEPT::SEM"
 */
export type PersistedShuffledStudent = { reg_no: string; name: string };
type ShuffledStore = Record<string, Record<string, PersistedShuffledStudent>>;
type CourseBundleDummyMap = Record<string, { courseDummies: string[]; bundles: Record<string, string[]> }>;
type CourseBundleDummyStore = Record<string, CourseBundleDummyMap>;

export function readShuffledStore(): ShuffledStore {
  try {
    const raw = localStorage.getItem(SHUFFLED_LIST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Get all saved dummies for a given department::semester filter.
 */
export function getDummiesForFilter(department: string, semester: string): Record<string, PersistedShuffledStudent> {
  const store = readShuffledStore();
  const filterKey = `${department}::${semester}`;
  return store[filterKey] || {};
}

function readCourseBundleDummyStore(): CourseBundleDummyStore {
  try {
    const raw = localStorage.getItem(COURSE_BUNDLE_DUMMY_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCourseDummiesForAllocation(department: string, semester: string, courseKey: string): string[] {
  const store = readCourseBundleDummyStore();
  const filterKey = `${department}::${semester}`;
  const courseEntry = store[filterKey]?.[courseKey];
  return Array.isArray(courseEntry?.courseDummies) ? [...courseEntry.courseDummies] : [];
}

export function getBundleDummiesForAllocation(department: string, semester: string, courseKey: string, bundleName: string): string[] {
  const store = readCourseBundleDummyStore();
  const filterKey = `${department}::${semester}`;
  const courseEntry = store[filterKey]?.[courseKey];
  if (!courseEntry || !courseEntry.bundles) return [];
  const rows = courseEntry.bundles[bundleName];
  return Array.isArray(rows) ? [...rows] : [];
}

/**
 * Extract course code and course name from a courseKey.
 * courseKey = "DEPT::SEM::COURSE_CODE::COURSE_NAME"
 */
export function parseCourseKey(courseKey: string): { department: string; semester: string; courseCode: string; courseName: string } {
  const parts = courseKey.split('::');
  return {
    department: parts[0] || '',
    semester: parts[1] || '',
    courseCode: parts[2] || '',
    courseName: parts[3] || '',
  };
}

const ESV_MARKS_KEY = 'esv-marks-v1';
const ESV_MARKS_UPDATED_EVENT = 'esv:marks-updated';

export type MarkEntry = {
  dummy: string;
  marks: (number | null)[];
};

type MarksStore = Record<string, MarkEntry[]>; // keyed by "facultyCode::courseKey"

export function readMarksStore(): MarksStore {
  try {
    const raw = localStorage.getItem(ESV_MARKS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeMarksStore(store: MarksStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ESV_MARKS_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(ESV_MARKS_UPDATED_EVENT));
}

export function getMarksKey(facultyCode: string, courseKey: string): string {
  return `${facultyCode.trim()}::${courseKey}`;
}

export const marksUpdateEventName = ESV_MARKS_UPDATED_EVENT;
