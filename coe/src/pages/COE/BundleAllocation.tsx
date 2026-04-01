import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CoeCourseStudent, fetchCoeStudentsMap } from '../../services/coe';
import { getCourseKey, readCourseSelectionMap } from './courseSelectionStorage';
import fetchWithAuth from '../../services/fetchAuth';
import { getCachedMe } from '../../services/auth';
import {
  clearBundleFinalizeConfig,
  getBundleFinalizeConfig,
  setBundleFinalizeConfig,
} from '../../utils/coeBundleFinalizeStore';
import { getAttendanceFilterKey, readCourseAbsenteesMap } from './attendanceStore';
import { getSemesterStartSequence, generateDummyNumber } from './dummySequence';

const DEPARTMENT_DUMMY_DIGITS: Record<string, string> = {
  AIDS: '1',
  AIML: '2',
  CIVIL: '3',
  CSE: '4',
  ECE: '5',
  EEE: '6',
  IT: '7',
  MECH: '8',
};

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
type BundleStudent = {
  reg_no: string;
  name: string;
  dummy: string;
  isShuffled: boolean;
};

type BundleCourse = {
  department: string;
  course_code: string;
  course_name: string;
  students: BundleStudent[];
};

type BundleWithCourse = {
  bundleName: string;
  students: BundleStudent[];
  department: string;
  course_code: string;
  course_name: string;
};

function getSemesterDigit(value: string): string {
  const numberPart = value.replace('SEM', '');
  const parsed = Number.parseInt(numberPart, 10);

  if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 8) {
    return String(parsed);
  }

  return '0';
}

function getCurrentFilterKey(department: string, semester: string): string {
  return `${department}::${semester}`;
}

function chunkStudents(students: BundleStudent[], chunkSize: number): BundleStudent[][] {
  const chunks: BundleStudent[][] = [];
  for (let i = 0; i < students.length; i += chunkSize) {
    chunks.push(students.slice(i, i + chunkSize));
  }
  return chunks;
}

export default function BundleAllocation() {
  const [departments, setDepartments] = useState<string[]>(['ALL']);
  const [semesters, setSemesters] = useState<string[]>(['SEM1']);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [department, setDepartment] = useState('ALL');
  const [semester, setSemester] = useState('SEM1');
  const [bundleSizeInput, setBundleSizeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<BundleCourse[]>([]);
  const [isFinalized, setIsFinalized] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordMode, setPasswordMode] = useState<'finalize' | 'edit'>('finalize');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [validatingPassword, setValidatingPassword] = useState(false);
  const navigate = useNavigate();

  // Fetch departments on mount
  useEffect(() => {
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

  const absentCourseMap = useMemo(
    () => readCourseAbsenteesMap(getAttendanceFilterKey(department, semester)),
    [department, semester]
  );

  useEffect(() => {
    const cfg = getBundleFinalizeConfig(department, semester);
    setIsFinalized(Boolean(cfg?.finalized));
    if (cfg?.bundleSize && Number(cfg.bundleSize) > 0) {
      setBundleSizeInput(String(cfg.bundleSize));
    }
  }, [department, semester]);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [response, startSequence] = await Promise.all([
          fetchCoeStudentsMap({ department, semester }),
          getSemesterStartSequence(department, semester)
        ]);
        if (!active) return;

        const semesterDigit = getSemesterDigit(semester);
        const savedByDummy = new Map(
          (response.saved_dummies || [])
            .filter((row) => row.semester === semester)
            .map((row) => [row.dummy, row])
        );
        const selectionMap = readCourseSelectionMap();

          let globalSequence = startSequence;          const shuffledCourses: BundleCourse[] = [];        response.departments.forEach((deptBlock) => {
          const deptCode = DEPARTMENT_DUMMY_DIGITS[deptBlock.department] || '9';

          deptBlock.courses
            .filter((course) => {
              const courseKey = getCourseKey({
                department: deptBlock.department,
                semester,
                courseCode: course.course_code || '',
                courseName: course.course_name || '',
              });
              const selection = selectionMap[courseKey];
              return selection?.eseType === 'ESE';
            })
            .forEach((course) => {
              const courseKey = getCourseKey({
                department: deptBlock.department,
                semester,
                courseCode: course.course_code || '',
                courseName: course.course_name || '',
              });
              const courseAbsentees = absentCourseMap.get(courseKey);

              const originalStudents = (course.students || []).filter((student: CoeCourseStudent) => {
                const regNo = String(student.reg_no || '').trim();
                return regNo ? !(courseAbsentees?.has(regNo)) : true;
              });

              const students: BundleStudent[] = originalStudents.map((student: CoeCourseStudent) => {
                globalSequence += 1;
                const dummy = generateDummyNumber(department, globalSequence);
                const saved = savedByDummy.get(dummy);

                const resolvedRegNo = saved?.reg_no || student.reg_no;
                const resolvedName = saved?.name || student.name;

                return {
                  reg_no: resolvedRegNo,
                  name: resolvedName,
                  dummy,
                  // Bundle allocation is allowed only for DB-saved shuffled mappings.
                  isShuffled: Boolean(saved) && (resolvedRegNo !== student.reg_no || resolvedName !== student.name),
                };
              });

              const mappedInDbCount = students.filter((student) => {
                const saved = savedByDummy.get(student.dummy);
                return Boolean(saved);
              }).length;

              const isCourseFullyMappedInDb = originalStudents.length > 0 && mappedInDbCount === originalStudents.length;
              const isCourseShuffledInDb = students.some((student) => student.isShuffled);
              // if (!isCourseFullyMappedInDb || !isCourseShuffledInDb) return;

              shuffledCourses.push({
                department: deptBlock.department,
                course_code: course.course_code,
                course_name: course.course_name,
                students,
              });
            });
        });

        setCourses(shuffledCourses);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to load shuffled list.';
        setError(message);
        setCourses([]);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [department, semester, absentCourseMap]);

  const bundleSize = useMemo(() => {
    const parsed = Number.parseInt(bundleSizeInput, 10);
    if (Number.isNaN(parsed)) return 0;
    return Math.max(parsed, 0);
  }, [bundleSizeInput]);

  const bundleData = useMemo(() => {
    if (bundleSize <= 0) return [];

    return courses.map((course) => {
      const bundles = chunkStudents(course.students, bundleSize).map((students, index) => {
        const deptShort = DEPARTMENT_SHORT[course.department] || String(course.department || '').slice(0, 2).toUpperCase();
        const seq = String(index + 1).padStart(3, '0');
        return {
          name: `${course.course_code || 'COURSE'}${deptShort}${seq}`,
          students,
        };
      });

      return {
        ...course,
        bundles,
      };
    });
  }, [courses, bundleSize]);

  const copyBundle = async (students: BundleStudent[]) => {
    try {
      const lines = students.map((s, i) => `${i + 1}. ${s.name} (${s.reg_no}) [${s.dummy}]`);
      await navigator.clipboard.writeText(lines.join('\n'));
      alert('Bundle copied to clipboard');
    } catch {
      alert('Copy failed — your browser may block clipboard access.');
    }
  };

  const openFinalizeConfirm = () => {
    if (bundleSize <= 0) {
      alert('Enter a valid bundle size greater than 0 before finalizing.');
      return;
    }
    setPasswordMode('finalize');
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const openEditConfirm = () => {
    setPasswordMode('edit');
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const handlePasswordConfirm = async () => {
    if (!passwordInput) {
      setPasswordError('Password is required');
      return;
    }

    setValidatingPassword(true);
    setPasswordError('');
    try {
      const me = getCachedMe();
      const identifier = me?.email || me?.username || me?.staff_profile?.staff_id;
      if (!identifier) {
        throw new Error('User identifier not found. Please log in again.');
      }

      const res = await fetchWithAuth('/api/accounts/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password: passwordInput }),
      });

      if (!res.ok) {
        throw new Error('Invalid password');
      }

      if (passwordMode === 'finalize') {
        setBundleFinalizeConfig(department, semester, {
          finalized: true,
          bundleSize,
          finalizedAt: new Date().toISOString(),
        });
        setIsFinalized(true);
      } else {
        clearBundleFinalizeConfig(department, semester);
        setIsFinalized(false);
      }

      setShowPasswordModal(false);
      setPasswordInput('');
    } catch (err: any) {
      setPasswordError(err.message || 'Invalid password');
    } finally {
      setValidatingPassword(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {showPasswordModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-96">
            <h2 className="text-lg font-bold mb-2">{passwordMode === 'finalize' ? 'Confirm Finalize' : 'Confirm Edit'}</h2>
            <p className="text-sm text-gray-600 mb-4">
              Please enter your login password to {passwordMode === 'finalize' ? 'finalize bundle allocation' : 'unlock editing'}.
            </p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handlePasswordConfirm();
                }
              }}
              className="w-full border border-gray-300 p-2 rounded mb-2 focus:outline-none focus:border-blue-500"
              placeholder="Password"
            />
            {passwordError ? <p className="text-red-600 text-xs mb-4">{passwordError}</p> : null}
            <div className="flex justify-end space-x-3 mt-2">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError('');
                  setPasswordInput('');
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordConfirm}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={validatingPassword}
              >
                {validatingPassword ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Bundle Allocation</h1>
        <p className="text-sm text-gray-600">Shows only course-wise shuffled lists and separates them into bundles by the number you enter.</p>
      </div>

      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="bundle-department">Department</label>
            <select
              id="bundle-department"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:opacity-50"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={loadingDeps}
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="bundle-semester">Semester</label>
            <select
              id="bundle-semester"
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            >
              {semesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="bundle-size">Students Per Bundle</label>
            <input
              id="bundle-size"
              type="number"
              min={1}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              value={bundleSizeInput}
              disabled={isFinalized}
              onChange={(e) => setBundleSizeInput(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {isFinalized ? (
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-100"
              onClick={openEditConfirm}
            >
              Edit
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={openFinalizeConfirm}
              disabled={loading || Boolean(error) || courses.length === 0 || bundleSize <= 0}
            >
              Finalize
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2 text-sm font-medium hover:bg-blue-100"
            onClick={() => navigate(`/coe/bundle-barcodes?department=${encodeURIComponent(String(department))}&semester=${encodeURIComponent(String(semester))}&bundle_size=${encodeURIComponent(String(bundleSize))}`)}
          >
            View Bundle Barcodes
          </button>
        </div>
      </section>

      {isFinalized ? (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-4 text-sm">
          Bundle allocation is finalized for {department} - {semester} with bundle size {bundleSize || bundleSizeInput}.
        </div>
      ) : null}

      {loading ? <div className="text-gray-600">Loading shuffled list...</div> : null}
      {error ? <div className="text-red-600">{error}</div> : null}
      {!loading && !error && courses.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4">
          No shuffled list found for the selected department and semester.
        </div>
      ) : null}
      {!loading && !error && courses.length > 0 && bundleSize <= 0 ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">Enter a valid bundle size greater than 0.</div>
      ) : null}

      {/* The barcode view has moved to a dedicated route. Click the button above to open it. */}

      {!loading && !error && bundleSize > 0
        ? bundleData.map((course) => (
            <section key={`${course.department}::${course.course_code}::${course.course_name}`} className="bg-white shadow-sm rounded-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">{course.course_name || 'Unnamed Course'}</h2>
                  <p className="text-sm text-gray-500">{course.course_code || 'NO_CODE'} • {course.department}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-600">Students: <span className="font-medium text-gray-800">{course.students.length}</span></div>
                  <div className="text-sm text-gray-600">Bundles: <span className="font-medium text-gray-800">{course.bundles.length}</span></div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {course.bundles.map((bundle) => (
                  <article key={bundle.name} className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm hover:shadow-md transition">
                    <div className="flex items-start justify-between">
                      <h3 className="text-indigo-600 font-medium text-sm">{bundle.name}</h3>
                    </div>

                    <ol className="mt-3 space-y-2 text-sm text-gray-800">
                      {bundle.students.map((student, index) => (
                        <li key={`${bundle.name}-${student.dummy}-${student.reg_no}-${index}`} className="flex items-baseline justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{index + 1}. {student.name}</div>
                            <div className="text-xs text-gray-500 truncate">{student.reg_no}</div>
                          </div>
                          <div className="ml-3">
                            <span className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{student.dummy}</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
            </section>
          ))
        : null}
    </div>
  );
}
