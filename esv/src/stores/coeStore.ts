/**
 * Reads the COE assigning store from localStorage (shared with COE app).
 * Shape: Record<storeKey, PersistedAssignment[]>
 * storeKey = "DEPT::SEM::YYYY-MM-DD"
 */

const ASSIGNING_STORE_KEY = 'coe-assigning-v1';
const SHUFFLED_LIST_KEY = 'coe-students-shuffled-list-v1';

export type PersistedValuator = {
  facultyCode: string;
  facultyName: string;
  scripts: number;
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
  scripts: number;
};

/**
 * Given a faculty code, find all their allocations across all store keys.
 */
export function findAllocationsForFaculty(facultyCode: string): FacultyAllocation[] {
  const store = readAssigningStore();
  const code = facultyCode.trim().toUpperCase();
  if (!code) return [];

  // Dummy code bypass for testing
  if (code === '123456' && Object.keys(store).length === 0) {
    return [{ storeKey: 'TEST::SEM1::2026-03-31', department: 'TEST', semester: 'SEM1', date: '2026-03-31', courseKey: 'TEST::SEM1::CS101::Demo Course', scripts: 5 }];
  }

  const results: FacultyAllocation[] = [];

  Object.entries(store).forEach(([storeKey, assignments]) => {
    // storeKey = "DEPT::SEM::DATE"
    const parts = storeKey.split('::');
    const department = parts[0] || '';
    const semester = parts[1] || '';
    const date = parts[2] || '';

    (assignments || []).forEach((assignment) => {
      (assignment.valuators || []).forEach((valuator) => {
        if (valuator.facultyCode.trim().toUpperCase() === code && valuator.scripts > 0) {
          results.push({
            storeKey,
            department,
            semester,
            date,
            courseKey: assignment.courseKey,
            scripts: valuator.scripts,
          });
        }
      });
    });
  });

  return results;
}

/**
 * Read the shuffled dummy list to get dummy numbers.
 * Shape: Record<filterKey, Record<dummy, { reg_no, name }>>
 * filterKey = "DEPT::SEM"
 */
export type PersistedShuffledStudent = { reg_no: string; name: string };
type ShuffledStore = Record<string, Record<string, PersistedShuffledStudent>>;

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
  localStorage.setItem(ESV_MARKS_KEY, JSON.stringify(store));
}

export function getMarksKey(facultyCode: string, courseKey: string): string {
  return `${facultyCode.trim()}::${courseKey}`;
}
