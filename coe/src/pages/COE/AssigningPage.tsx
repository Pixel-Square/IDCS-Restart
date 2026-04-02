import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchCoeStudentsMap } from '../../services/coe';
import { getCourseKey, fetchCourseSelectionMapFromApi } from './courseSelectionStorage';
import { readTTScheduleMap } from './ttScheduleStore';
import { kvHydrate, kvSave } from '../../utils/coeKvStore';
import fetchWithAuth from '../../services/fetchAuth';
import { getCachedMe } from '../../services/auth';
import { getBundleFinalizeConfig } from '../../utils/coeBundleFinalizeStore';
import { getAttendanceFilterKey, readCourseAbsenteesMap } from './attendanceStore';

const ASSIGNING_STORE_KEY = 'coe-assigning-v1';
const ASSIGNING_UPDATED_EVENT = 'coe:assigning-updated';

const DEPARTMENT_SHORT: Record<string, string> = {
  CIVIL: 'CE',
  IT: 'IT',
  CSE: 'CS',
  MECH: 'ME',
  ECE: 'EC',
  EEE: 'EE',
  AIDS: 'AD',
  AIML: 'AM',
};

type StaffInfo = { staff_id: string; name: string };

type ValuatorRow = {
  id: string;
  facultyCode: string;
  facultyName: string;
  scripts: number;
  lookupLoading: boolean;
  lookupError: string;
  bundles: { id: string; name: string; scripts: number }[];
  showBundleForm: boolean;
  bundleFormName: string;
  bundleFormScripts: number;
};

type CourseAssignment = {
  courseKey: string;
  courseCode: string;
  courseName: string;
  department: string;
  totalStudents: number;
  valuators: ValuatorRow[];
  availableBundles: { name: string; scripts: number }[];
};

/* ---- localStorage persistence ---- */
type PersistedAssignment = {
  courseKey: string;
  valuators: { facultyCode: string; facultyName: string; scripts: number; bundles: { id: string; name: string; scripts: number }[] }[];
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
  kvSave(ASSIGNING_STORE_KEY, store);
  window.dispatchEvent(new CustomEvent(ASSIGNING_UPDATED_EVENT));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('coe-assigning-updates-v1');
    channel.postMessage('updated');
    channel.close();
  }
}

export const assigningUpdateEventName = ASSIGNING_UPDATED_EVENT;

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
  kvSave(LOCK_STORE_KEY, store);
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
  const [departments, setDepartments] = useState<string[]>(['ALL']);
  const [semesters, setSemesters] = useState<string[]>(['SEM1']);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [department, setDepartment] = useState('ALL');
  const [semester, setSemester] = useState('SEM1');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [selectedBundleByCourse, setSelectedBundleByCourse] = useState<Record<string, string>>({});
  const [createBundleFormByCourse, setCreateBundleFormByCourse] = useState<Record<string, { show: boolean; valuatorId: string; name: string; scripts: number }>>({});

  // Fetch departments on mount
  useEffect(() => {
    // Hydrate KV stores from DB
    Promise.all([
      kvHydrate(ASSIGNING_STORE_KEY),
      kvHydrate(LOCK_STORE_KEY),
    ]).catch(() => {});

    let active = true;
    setLoadingDeps(true);

    (async () => {
      try {
        const res = await fetchWithAuth('/api/academics/departments/');
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          const depts = data.results || data || [];
          const deptNames = depts
            .map((d: any) => {
              const label = d?.short_name || d?.code || d?.name || d;
              return label ? String(label).trim().toUpperCase() : null;
            })
            .filter(Boolean);
          setDepartments(['ALL', ...(deptNames as string[])]);
          setDepartment('ALL');
        } else {
          console.warn('Failed to fetch departments, using defaults');
          setDepartments(['ALL']);
        }
      } catch (err) {
        if (active) console.warn('Error fetching departments:', err);
      } finally {
        if (active) setLoadingDeps(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const syncExistingAssignments = async () => {
      const store = readPersistedStore();
      if (Object.keys(store).length === 0) return;

      try {
        await fetchWithAuth('/api/coe/assignments/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stores: store }),
        });
      } catch (error) {
        console.warn('Failed to sync existing COE assignments to backend', error);
      }
    };

    void syncExistingAssignments();
  }, []);

  // Fetch semesters on mount
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetchWithAuth('/api/academics/semesters/');
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          const sems = data.results || data || [];
          const semNames = sems.map((s: any) => s.name || s.code || s).filter(Boolean);
          setSemesters(semNames.length > 0 ? semNames : ['SEM1']);
          setSemester(semNames[0] || 'SEM1');
        } else {
          console.warn('Failed to fetch semesters, using defaults');
          setSemesters(['SEM1']);
        }
      } catch (err) {
        if (active) console.warn('Error fetching semesters:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

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

        const selectionMap = await fetchCourseSelectionMapFromApi(department, semester);
        const storeKey = makeStoreKey(department, semester, selectedDate);
        const persisted = readPersistedStore()[storeKey] || [];
        const persistedByCourseKey = new Map(persisted.map((p) => [p.courseKey, p]));

        const bundleConfig = getBundleFinalizeConfig(department, semester);
        const absentCourseMap = readCourseAbsenteesMap(getAttendanceFilterKey(department, semester));

        const newAssignments: CourseAssignment[] = [];

        // Universal store to handle "ALL" department filter
        const allPersisted = readPersistedStore();

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

            // Important: Use a course-specific store key to ensure data is found
            // even if the user changes the main "Department" filter to "ALL"
            const courseStoreKey = makeStoreKey(deptBlock.department, semester, selectedDate);
            const coursePersisted = allPersisted[courseStoreKey] || [];
            const persistedByCourseKey = new Map(coursePersisted.map((p) => [p.courseKey, p]));

            // Calculate available bundles from allocation logic
            const availableBundles: { name: string; scripts: number }[] = [];
            if (bundleConfig?.finalized && bundleConfig.bundleSize > 0) {
              const courseAbsentees = absentCourseMap.get(courseKey);
              const originalStudents = (course.students || []).filter((s: any) => {
                const regNo = String(s.reg_no || '').trim();
                return regNo ? !courseAbsentees?.has(regNo) : true;
              });

              const totalValid = originalStudents.length;
              const bundleCount = Math.ceil(totalValid / bundleConfig.bundleSize);
              const deptShort = DEPARTMENT_SHORT[deptBlock.department] || String(deptBlock.department || '').slice(0, 2).toUpperCase();

              for (let i = 0; i < bundleCount; i++) {
                const start = i * bundleConfig.bundleSize;
                const end = Math.min(start + bundleConfig.bundleSize, totalValid);
                const scripts = end - start;
                const seq = String(i + 1).padStart(3, '0');
                availableBundles.push({
                  name: `${course.course_code || 'COURSE'}${deptShort}${seq}`,
                  scripts,
                });
              }
            }

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
                  bundles: v.bundles || [],
                  showBundleForm: false,
                  bundleFormName: '',
                  bundleFormScripts: 0,
                }))
              : [{
                  id: makeRowId(),
                  facultyCode: '',
                  facultyName: '',
                  scripts: 0,
                  lookupLoading: false,
                  lookupError: '',
                  bundles: [],
                  showBundleForm: false,
                  bundleFormName: '',
                  bundleFormScripts: 0,
                }];

            newAssignments.push({
              courseKey,
              courseCode: course.course_code || '',
              courseName: course.course_name || 'Unnamed Course',
              department: deptBlock.department,
              totalStudents,
              valuators,
              availableBundles,
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
              bundles: [],
              showBundleForm: false,
              bundleFormName: '',
              bundleFormScripts: 0,
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

  /* ---- Bundle handlers ---- */
  const getBundleTotal = (bundles: ValuatorRow['bundles']) =>
    bundles.reduce((sum, b) => sum + b.scripts, 0);

  const getCourseBundles = (assignment: CourseAssignment) => {
    const allBundles = new Map<string, { id: string; name: string; scripts: number; facultyName: string }>();
    assignment.valuators.forEach((v) => {
      v.bundles.forEach((b) => {
        allBundles.set(b.id, { ...b, facultyName: v.facultyName || v.facultyCode });
      });
    });
    return Array.from(allBundles.values());
  };

  const handleToggleBundleForm = useCallback(
    (courseKey: string, rowId: string) => {
      updateAssignment(courseKey, (a) => ({
        ...a,
        valuators: a.valuators.map((v) =>
          v.id === rowId
            ? {
                ...v,
                showBundleForm: !v.showBundleForm,
                bundleFormName: '',
                bundleFormScripts: 0,
              }
            : v,
        ),
      }));
    },
    [updateAssignment],
  );

  const handleCreateBundle = useCallback(
    (courseKey: string, rowId: string) => {
      updateAssignment(courseKey, (a) => {
        const row = a.valuators.find((v) => v.id === rowId);
        if (!row) return a;

        const name = row.bundleFormName.trim();
        const scripts = row.bundleFormScripts;

        if (!name) {
          alert('Bundle name is required.');
          return a;
        }
        if (scripts <= 0) {
          alert('Bundle scripts must be greater than 0.');
          return a;
        }

        const bundleTotal = getBundleTotal(row.bundles);
        if (bundleTotal + scripts > row.scripts) {
          alert(`Cannot assign ${scripts} scripts. Only ${row.scripts - bundleTotal} scripts available.`);
          return a;
        }

        return {
          ...a,
          valuators: a.valuators.map((v) =>
            v.id === rowId
              ? {
                  ...v,
                  bundles: [
                    ...v.bundles,
                    { id: makeRowId(), name, scripts },
                  ],
                  showBundleForm: false,
                  bundleFormName: '',
                  bundleFormScripts: 0,
                }
              : v,
          ),
        };
      });
    },
    [updateAssignment],
  );

  const handleRemoveBundle = useCallback(
    (courseKey: string, rowId: string, bundleId: string) => {
      updateAssignment(courseKey, (a) => ({
        ...a,
        valuators: a.valuators.map((v) =>
          v.id === rowId
            ? {
                ...v,
                bundles: v.bundles.filter((b) => b.id !== bundleId),
              }
            : v,
        ),
      }));
    },
    [updateAssignment],
  );

  const handleCreateBundleFromDropdown = useCallback(
    (courseKey: string) => {
      const form = createBundleFormByCourse[courseKey];
      if (!form || !form.valuatorId) return;

      const name = form.name.trim();
      const scripts = form.scripts;

      if (!name) {
        alert('Bundle name is required.');
        return;
      }
      if (scripts <= 0) {
        alert('Bundle scripts must be greater than 0.');
        return;
      }

      updateAssignment(courseKey, (a) => {
        const valuator = a.valuators.find((v) => v.id === form.valuatorId);
        if (!valuator) {
          alert('Valuator not found.');
          return a;
        }

        const bundleTotal = getBundleTotal(valuator.bundles);
        if (bundleTotal + scripts > valuator.scripts) {
          alert(`Cannot assign ${scripts} scripts to ${valuator.facultyName || valuator.facultyCode}. Only ${valuator.scripts - bundleTotal} scripts available.`);
          return a;
        }

        return {
          ...a,
          valuators: a.valuators.map((v) =>
            v.id === form.valuatorId
              ? {
                  ...v,
                  bundles: [
                    ...v.bundles,
                    { id: makeRowId(), name, scripts },
                  ],
                }
              : v,
          ),
        };
      });

      // Clear form
      setCreateBundleFormByCourse({
        ...createBundleFormByCourse,
        [courseKey]: { show: false, valuatorId: '', name: '', scripts: 0 },
      });
    },
    [createBundleFormByCourse, updateAssignment],
  );

  /* ---- Save & Lock ---- */
  const handleSave = useCallback(() => {
    const store = readPersistedStore();

    // Group current assignments by their real department to allow "ALL" filter saving
    const byDept: Record<string, CourseAssignment[]> = {};
    assignments.forEach((a) => {
      if (!byDept[a.department]) byDept[a.department] = [];
      byDept[a.department].push(a);
    });

    Object.entries(byDept).forEach(([deptName, deptAssignments]) => {
      const storeKey = makeStoreKey(deptName, semester, selectedDate);
      store[storeKey] = deptAssignments.map((a) => ({
        courseKey: a.courseKey,
        valuators: a.valuators
          .filter((v) => v.facultyCode.trim())
          .map((v) => ({
            facultyCode: v.facultyCode.trim(),
            facultyName: v.facultyName,
            scripts: v.scripts,
            bundles: v.bundles,
          })),
      }));

      // Lock each department's state
      const lockStore = readLockStore();
      lockStore[storeKey] = true;
      writeLockStore(lockStore);
    });

    const persist = async () => {
      setSaving(true);
      writePersistedStore(store);

      const response = await fetchWithAuth('/api/coe/assignments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stores: store }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed to save assignments (${response.status})`);
      }

      if (department !== 'ALL') {
        setIsLocked(true);
      } else {
        setIsLocked(true);
      }

      setTimeout(() => setSaving(false), 1200);
    };

    persist().catch((error) => {
      console.error('Failed to save assignments:', error);
      alert('Assignments were saved locally, but the backend sync failed. ESV may not reflect the changes until this is fixed.');
      setSaving(false);
    });
  }, [assignments, department, semester, selectedDate]);

  /* ---- Edit (unlock with password) ---- */
  const handleEdit = useCallback(async () => {
    const password = window.prompt('Enter password to edit:');
    if (!password) return;

    try {
      const me = getCachedMe();
      const identifier = me?.email || me?.username || me?.staff_profile?.staff_id;
      if (!identifier) {
        alert('User identifier not found. Please log in again.');
        return;
      }

      const res = await fetchWithAuth('/api/accounts/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      if (res.ok) {
        const storeKey = makeStoreKey(department, semester, selectedDate);
        const lockStore = readLockStore();
        lockStore[storeKey] = false;
        writeLockStore(lockStore);
        setIsLocked(false);
      } else {
        alert('Incorrect password.');
      }
    } catch (err) {
      alert('Error validating password.');
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
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={loadingDeps}
            >
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="assign-semester">Semester</label>
            <select
              id="assign-semester"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            >
              {semesters.map((s) => <option key={s} value={s}>{s}</option>)}
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

            {/* Bundle dropdown */}
            <div className="rounded-md bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 px-4 py-3">
              <label className="block text-xs font-semibold text-indigo-700 mb-2">Select Bundle</label>
              <select
                value={selectedBundleByCourse[assignment.courseKey] || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedBundleByCourse({ ...selectedBundleByCourse, [assignment.courseKey]: val });
                }}
                className="w-full rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">-- Select a bundle --</option>
                {assignment.availableBundles.map((b, idx) => {
                  // Check if this bundle is already assigned to a valuator for THIS course
                  const isAssigned = assignment.valuators.some(v => v.bundles.some(vb => vb.name === b.name));
                  return (
                    <option key={b.name} value={b.name} disabled={isAssigned}>
                      Bundle {idx + 1}: {b.name} ({b.scripts} scripts) {isAssigned ? '— (Assigned)' : ''}
                    </option>
                  );
                })}
              </select>

              {/* Selected bundle details */}
              {selectedBundleByCourse[assignment.courseKey] && (() => {
                const selectedBundle = assignment.availableBundles.find((b) => b.name === selectedBundleByCourse[assignment.courseKey]);
                if (!selectedBundle) return null;

                const assignedValuator = assignment.valuators.find((v) =>
                  v.bundles.some((b) => b.name === selectedBundle.name),
                );

                return (
                  <div className="rounded-md bg-white border border-indigo-300 px-3 py-2 mt-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold text-gray-900">{selectedBundle.name}</span>
                        <br />
                        Scripts: <span className="font-semibold text-indigo-600">{selectedBundle.scripts}</span>
                        {assignedValuator && (
                          <>
                            <br />
                            Assigned to: <span className="font-semibold text-gray-900">{assignedValuator.facultyName || assignedValuator.facultyCode}</span>
                          </>
                        )}
                      </p>
                      
                      {!assignedValuator && !isLocked && (
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Assign To</label>
                          <div className="flex gap-2">
                            <select
                              id={`assign-bundle-to-${assignment.courseKey}`}
                              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                              defaultValue=""
                            >
                              <option value="">-- Valuator --</option>
                              {assignment.valuators.map(v => {
                                const avail = v.scripts - getBundleTotal(v.bundles);
                                const canFit = avail >= selectedBundle.scripts;
                                return (
                                  <option key={v.id} value={v.id} disabled={!canFit}>
                                    {v.facultyName || v.facultyCode} ({avail} avail)
                                  </option>
                                );
                              })}
                            </select>
                            <button
                              onClick={() => {
                                const sel = document.getElementById(`assign-bundle-to-${assignment.courseKey}`) as HTMLSelectElement;
                                const vId = sel?.value;
                                if (!vId) {
                                  alert('Please select a valuator first');
                                  return;
                                }
                                updateAssignment(assignment.courseKey, (a) => ({
                                  ...a,
                                  valuators: a.valuators.map(v => v.id === vId ? {
                                    ...v,
                                    bundles: [...v.bundles, { id: makeRowId(), name: selectedBundle.name, scripts: selectedBundle.scripts }]
                                  } : v)
                                }));
                                setSelectedBundleByCourse({ ...selectedBundleByCourse, [assignment.courseKey]: '' });
                              }}
                              className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-indigo-700"
                            >
                              Assign
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
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
                    <th className="px-3 py-2">Bundles</th>
                    <th className="px-3 py-2 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignment.valuators.map((row, idx) => {
                    const isScriptsLocked = allAllocated && row.scripts > 0;
                    const bundleTotal = getBundleTotal(row.bundles);
                    const bundleRemaining = row.scripts - bundleTotal;
                    return (
                      <React.Fragment key={row.id}>
                        <tr className="border-b border-gray-100 align-middle">
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
                            <div className="text-xs">
                              {row.bundles.length === 0 ? (
                                <span className="text-gray-400">No bundles</span>
                              ) : (
                                <div className="space-y-1">
                                  {row.bundles.map((b) => (
                                    <div
                                      key={b.id}
                                      className="inline-block rounded-md bg-blue-50 border border-blue-200 px-2 py-1 text-blue-700 mr-1"
                                    >
                                      {b.name} ({b.scripts})
                                      {!isLocked && (
                                        <button
                                          onClick={() => handleRemoveBundle(assignment.courseKey, row.id, b.id)}
                                          className="ml-2 text-red-500 hover:text-red-700 focus:outline-none"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <div className="text-gray-500 mt-1">
                                    Allocated: {bundleTotal}/{row.scripts}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 space-y-1">
                            {!isLocked && assignment.valuators.length > 1 && (
                              <button
                                onClick={() => handleRemoveValuator(assignment.courseKey, row.id)}
                                className="block rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Bundle removal options row (remove this redundant block) */}
                      </React.Fragment>
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
