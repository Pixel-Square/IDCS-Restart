export type QpType = 'QP1' | 'QP2' | 'TCPR';
export type EseType = 'ESE' | 'NON_ESE';

export type CourseSelection = {
  selected: boolean;
  qpType: QpType;
  eseType: EseType;
};

const STORAGE_KEY = 'coe-course-selection-v1';

export function getCourseKey(params: {
  department: string;
  semester: string;
  courseCode: string;
  courseName: string;
}): string {
  return [
    params.department || '',
    params.semester || '',
    params.courseCode || '',
    params.courseName || '',
  ].join('::');
}

export function readCourseSelectionMap(): Record<string, CourseSelection> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CourseSelection>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export function writeCourseSelectionMap(map: Record<string, CourseSelection>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getOrCreateCourseSelection(
  map: Record<string, CourseSelection>,
  key: string,
): CourseSelection {
  const current = map[key];
  if (current) return current;

  const created: CourseSelection = {
    selected: true,
    qpType: 'QP1',
    eseType: 'NON_ESE',
  };
  map[key] = created;
  return created;
}

export function makeBarcodePayload(dummy: string, selection: CourseSelection): string {
  return [dummy, selection.qpType, selection.eseType].join('::');
}
