import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchCoeStudentsMap } from '../../services/coe';
import { getCourseKey, readCourseSelectionMap } from './courseSelectionStorage';
import { readTTScheduleMap } from './ttScheduleStore';
import fetchWithAuth from '../../services/fetchAuth';

const DEPARTMENTS = ['ALL', 'AIDS', 'AIML', 'CSE', 'CIVIL', 'ECE', 'EEE', 'IT', 'MECH'] as const;
const SEMESTERS = ['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8'] as const;

const ASSIGNING_STORE_KEY = 'coe-assigning-v1';

type StaffInfo = { staff_id: string; name: string };

type ValuatorRow = {
  id: string;
  facultyCode: string;
  facultyName: string;
  scripts: number;
  lookupLoading: boolean;
  lookupError: string;
};

type CourseAssignment = {
  courseKey: string;
  courseCode: string;
  courseName: string;
  department: string;
  totalStudents: number;
  valuators: ValuatorRow[];
};

/* ---- localStorage persistence ---- */
type PersistedAssignment = {
  courseKey: string;
  valuators: { facultyCode: string; facultyName: string; scripts: number }[];
};
type PersistedStore = Record<string, PersistedAssignment[]>; // keyed by filterKey::date

function readPersistedStore(): PersistedStore {
  try {
    const raw = localStorage.getItem(ASSIGNING_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writePersistedStore(store: PersistedStore) {
  localStorage.setItem(ASSIGNING_STORE_KEY, JSON.stringify(store));
}

function makeStoreKey(dept: string, sem: string, date: string) {
  return `${dept}::${sem}::${date}`;
}

function makeRowId() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---- Lock persistence ---- */
const LOCK_STORE_KEY = 'coe-assigning-lock-v1';

function readLockStore(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LOCK_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLockStore(store: Record<string, boolean>) {
  localStorage.setItem(LOCK_STORE_KEY, JSON.stringify(store));
}

/* ---- Faculty cache (session-level) ---- */
const facultyCache = new Map<string, StaffInfo | null>([
  ['123456', { staff_id: '123456', name: 'Dummy Faculty' }],
]);

async function lookupFaculty(code: string): Promise<StaffInfo | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  if (facultyCache.has(trimmed)) return facultyCache.get(trimmed)!;

  try {
    const res = await fetchWithAuth('/api/academics/all-staff/');
    if (!res.ok) throw new Error('Failed to fetch staff list');
    const data = await res.json();
    const results: any[] = data.results || data || [];

    // Cache all results
    results.forEach((s: any) => {
      const sid = String(s.staff_id || '').trim();
      if (!sid) return;
      const firstName = s.user?.first_name || '';
      const lastName = s.user?.last_name || '';
      const name = `${firstName} ${lastName}`.trim() || s.name || s.user?.username || sid;
      facultyCache.set(sid, { staff_id: sid, name });
    });

    return facultyCache.get(trimmed) || null;
  } catch {
    return null;
  }
}

export default function AssigningPage() {
  const [department, setDepartment] = useState<(typeof DEPARTMENTS)[number]>('ALL');
  const [semester, setSemester] = useState<(typeof SEMESTERS)[number]>('SEM1');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const filterKey = useMemo(() => `${department}::${semester}`, [department, semester]);

  const ttScheduleMap = useMemo(
    () => readTTScheduleMap(filterKey),
    [filterKey],
  );

  // Derive available dates from schedule
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    Object.values(ttScheduleMap).forEach((d) => { if (d) dates.add(d); });
    return Array.from(dates).sort();
  }, [ttScheduleMap]);

  // Load lock state when filters change
  useEffect(() => {
    const sk = makeStoreKey(department, semester, selectedDate);
    setIsLocked(!!readLockStore()[sk]);
  }, [department, semester, selectedDate]);

  // Course keys for the selected date
  const dateCourseKeys = useMemo(() => {
    const keys = new Set<string>();
    Object.entries(ttScheduleMap).forEach(([ck, d]) => { if (d === selectedDate) keys.add(ck); });
    return keys;
  }, [ttScheduleMap, selectedDate]);

  /* ---- Load courses for selected filters ---- */
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchCoeStudentsMap({ department, semester });
        if (!active) return;

        const selectionMap = readCourseSelectionMap();
        const storeKey = makeStoreKey(department, semester, selectedDate);
        const persisted = readPersistedStore()[storeKey] || [];
        const persistedByCourseKey = new Map(persisted.map((p) => [p.courseKey, p]));

        const newAssignments: CourseAssignment[] = [];

        response.departments.forEach((deptBlock) => {
          deptBlock.courses.forEach((course) => {
            const courseKey = getCourseKey({
              department: deptBlock.department,
              semester,
              courseCode: course.course_code || '',
              courseName: course.course_name || '',
            });

            // Only ESE courses
            const sel = selectionMap[courseKey];
            if (sel && sel.eseType !== 'ESE') return;

            // Only courses for selected date
            if (!dateCourseKeys.has(courseKey)) return;

            const totalStudents = (course.students || []).length;
            const saved = persistedByCourseKey.get(courseKey);

            const valuators: ValuatorRow[] = saved && saved.valuators.length > 0
              ? saved.valuators.map((v) => ({
                  id: makeRowId(),
                  facultyCode: v.facultyCode,
                  facultyName: v.facultyName,
                  scripts: v.scripts,
                  lookupLoading: false,
                  lookupError: '',
                }))
              : [{
                  id: makeRowId(),
                  facultyCode: '',
                  facultyName: '',
                  scripts: 0,
                  lookupLoading: false,
                  lookupError: '',
                }];

            newAssignments.push({
              courseKey,
              courseCode: course.course_code || '',
              courseName: course.course_name || 'Unnamed Course',
              department: deptBlock.department,
              totalStudents,
              valuators,
            });
          });
        });

        setAssignments(newAssignments);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load courses.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [department, semester, selectedDate, dateCourseKeys]);

  /* ---- Helpers ---- */
  const getAllocated = (valuators: ValuatorRow[]) =>
    valuators.reduce((sum, v) => sum + v.scripts, 0);

  const updateAssignment = useCallback(
    (courseKey: string, updater: (a: CourseAssignment) => CourseAssignment) => {
      setAssignments((prev) =>
        prev.map((a) => (a.courseKey === courseKey ? updater(a) : a)),
      );
    },
    [],
  );

  /* ---- Faculty code blur handler ---- */
  const handleFacultyBlur = useCallback(
    async (courseKey: string, rowId: string, code: string) => {
      if (!code.trim()) {
        updateAssignment(courseKey, (a) => ({
          ...a,
          valuators: a.valuators.map((v) =>
            v.id === rowId ? { ...v, facultyName: '', lookupError: '', lookupLoading: false } : v,
          ),
        }));
        return;
      }

      updateAssignment(courseKey, (a) => ({
        ...a,
        valuators: a.valuators.map((v) =>
          v.id === rowId ? { ...v, lookupLoading: true, lookupError: '' } : v,
        ),
      }));

      const result = await lookupFaculty(code.trim());

      updateAssignment(courseKey, (a) => ({
        ...a,
        valuators: a.valuators.map((v) =>
          v.id === rowId
            ? {
                ...v,
                lookupLoading: false,
                facultyName: result?.name || '',
                lookupError: result ? '' : 'Faculty not found',
              }
            : v,
        ),
      }));
    },
    [updateAssignment],
  );

  /* ---- Scripts change ---- */
  const handleScriptsChange = useCallback(
    (courseKey: string, rowId: string, value: number) => {
      updateAssignment(courseKey, (a) => {
        const allocated = a.valuators.reduce(
          (s, v) => s + (v.id === rowId ? 0 : v.scripts),
          0,
        );
        const remaining = a.totalStudents - allocated;
        if (value > remaining) {
          alert(`Maximum scripts reached! Only ${remaining} script(s) remaining for this course.`);
          return a;
        }
        return {
          ...a,
          valuators: a.valuators.map((v) =>
            v.id === rowId ? { ...v, scripts: Math.max(0, value) } : v,
          ),
        };
      });
    },
    [updateAssignment],
  );

  /* ---- Add sub-row ---- */
  const handleAddValuator = useCallback(
    (courseKey: string) => {
      updateAssignment(courseKey, (a) => {
        const allocated = getAllocated(a.valuators);
        if (allocated >= a.totalStudents) {
          alert(`Maximum scripts reached! All ${a.totalStudents} scripts are already allocated.`);
          return a;
        }
        return {
          ...a,
          valuators: [
            ...a.valuators,
            {
              id: makeRowId(),
              facultyCode: '',
              facultyName: '',
              scripts: 0,
              lookupLoading: false,
              lookupError: '',
            },
          ],
        };
      });
    },
    [updateAssignment],
  );

  /* ---- Remove sub-row ---- */
  const handleRemoveValuator = useCallback(
    (courseKey: string, rowId: string) => {
      updateAssignment(courseKey, (a) => {
        if (a.valuators.length <= 1) return a;
        return {
          ...a,
          valuators: a.valuators.filter((v) => v.id !== rowId),
        };
      });
    },
    [updateAssignment],
  );

  /* ---- Faculty code change (auto-resolves cached codes like 123456) ---- */
  const handleFacultyCodeChange = useCallback(
    (courseKey: string, rowId: string, value: string) => {
      const trimmed = value.trim();
      const cached = trimmed ? facultyCache.get(trimmed) : null;
      updateAssignment(courseKey, (a) => ({
        ...a,
        valuators: a.valuators.map((v) =>
          v.id === rowId
            ? {
                ...v,
                facultyCode: value,
                facultyName: cached?.name || '',
                lookupError: '',
                lookupLoading: false,
              }
            : v,
        ),
      }));
    },
    [updateAssignment],
  );

  /* ---- Save & Lock ---- */
  const handleSave = useCallback(() => {
    const storeKey = makeStoreKey(department, semester, selectedDate);
    const store = readPersistedStore();
    store[storeKey] = assignments.map((a) => ({
      courseKey: a.courseKey,
      valuators: a.valuators
        .filter((v) => v.facultyCode.trim())
        .map((v) => ({
          facultyCode: v.facultyCode.trim(),
          facultyName: v.facultyName,
          scripts: v.scripts,
        })),
    }));
    writePersistedStore(store);

    // Lock after saving
    const lockStore = readLockStore();
    lockStore[storeKey] = true;
    writeLockStore(lockStore);
    setIsLocked(true);

    setSaving(true);
    setTimeout(() => setSaving(false), 1200);
  }, [assignments, department, semester, selectedDate]);

  /* ---- Edit (unlock with password) ---- */
  const handleEdit = useCallback(() => {
    const password = window.prompt('Enter password to edit:');
    if (password === 'coe@123') {
      const storeKey = makeStoreKey(department, semester, selectedDate);
      const lockStore = readLockStore();
      lockStore[storeKey] = false;
      writeLockStore(lockStore);
      setIsLocked(false);
    } else if (password !== null) {
      alert('Incorrect password.');
    }
  }, [department, semester, selectedDate]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assigning</h1>
          <p className="mt-1 text-sm text-gray-600">Assign valuators to courses scheduled for a specific date.</p>
        </div>
        {isLocked ? (
          <button
            onClick={handleEdit}
            className="px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium shadow-sm text-sm"
          >
            Edit
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={loading || saving || assignments.length === 0}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm text-sm"
          >
            {saving ? 'Saved!' : 'Save'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="assign-department">Department</label>
            <select
              id="assign-department"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              value={department}
              onChange={(e) => setDepartment(e.target.value as (typeof DEPARTMENTS)[number])}
            >
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="assign-semester">Semester</label>
            <select
              id="assign-semester"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              value={semester}
              onChange={(e) => setSemester(e.target.value as (typeof SEMESTERS)[number])}
            >
              {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="assign-date">Exam Date</label>
            <select
              id="assign-date"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              {availableDates.length === 0 ? (
                <option value="">No dates set</option>
              ) : (
                availableDates.map((d) => (
                  <option key={d} value={d}>
                    {new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-md bg-gray-50 border border-gray-100 px-3 py-2 text-sm text-gray-700">
          {dateCourseKeys.size > 0
            ? `${dateCourseKeys.size} course(s) scheduled for ${selectedDate}`
            : 'No courses assigned to this date. Set TT dates in Course List first.'}
        </div>
      </div>

      {/* Loading / Error */}
      {loading ? <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">Loading courses...</div> : null}
      {!loading && error ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : null}

      {/* Course Cards */}
      {!loading && !error && assignments.length === 0 && dateCourseKeys.size > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">No ESE courses found for the selected filters and date.</p>
        </div>
      ) : null}

      {!loading && !error && assignments.map((assignment) => {
        const allocated = getAllocated(assignment.valuators);
        const remaining = assignment.totalStudents - allocated;
        const allAllocated = remaining <= 0;

        return (
          <div key={assignment.courseKey} className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            {/* Course header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{assignment.courseName}</h3>
                <p className="text-xs font-medium text-gray-500">{assignment.courseCode} | {assignment.department}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="rounded-md bg-slate-50 border border-slate-200 px-3 py-1 text-slate-700">
                  Total: {assignment.totalStudents}
                </span>
                <span className={`rounded-md px-3 py-1 ${allAllocated ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                  Allocated: {allocated}
                </span>
                {!allAllocated && (
                  <span className="rounded-md bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1">
                    Remaining: {remaining}
                  </span>
                )}
              </div>
            </div>

            {/* Valuator rows */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 w-10">#</th>
                    <th className="px-3 py-2">Faculty Code</th>
                    <th className="px-3 py-2">Faculty Name</th>
                    <th className="px-3 py-2 w-36">Scripts</th>
                    <th className="px-3 py-2 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignment.valuators.map((row, idx) => {
                    const isScriptsLocked = allAllocated && row.scripts > 0;
                    return (
                      <tr key={row.id} className="border-b border-gray-100 align-middle">
                        <td className="px-3 py-2 text-gray-400 font-medium">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.facultyCode}
                            onChange={(e) => handleFacultyCodeChange(assignment.courseKey, row.id, e.target.value)}
                            onBlur={(e) => handleFacultyBlur(assignment.courseKey, row.id, e.target.value)}
                            placeholder="Enter code"
                            disabled={isLocked}
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                          />
                          {row.lookupError && (
                            <p className="mt-0.5 text-xs text-red-500">{row.lookupError}</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.lookupLoading ? (
                            <span className="text-xs text-gray-400">Looking up...</span>
                          ) : row.facultyName ? (
                            <span className="font-medium text-gray-900">{row.facultyName}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleScriptsChange(assignment.courseKey, row.id, row.scripts - 1)}
                              disabled={isLocked || row.scripts <= 0}
                              className="rounded-md bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={row.scripts}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) handleScriptsChange(assignment.courseKey, row.id, val);
                              }}
                              disabled={isLocked || isScriptsLocked}
                              className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                            />
                            <button
                              onClick={() => {
                                if (allAllocated) {
                                  alert(`Maximum scripts reached! All ${assignment.totalStudents} scripts are already allocated.`);
                                  return;
                                }
                                handleScriptsChange(assignment.courseKey, row.id, row.scripts + 1);
                              }}
                              disabled={isLocked || allAllocated}
                              className="rounded-md bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {!isLocked && assignment.valuators.length > 1 ? (
                            <button
                              onClick={() => handleRemoveValuator(assignment.courseKey, row.id)}
                              className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                            >
                              Remove
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add valuator button */}
            {!isLocked && (
              <button
                onClick={() => handleAddValuator(assignment.courseKey)}
                disabled={allAllocated}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="text-lg leading-none">+</span> Add Valuator
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
