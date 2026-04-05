import React, { useState, useEffect, useMemo } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { CoeStudentsMapResponse, fetchCoeStudentsMap } from '../../services/coe';

const SHUFFLE_LOCK_KEY = 'coe-students-shuffle-lock-v1';
const SHUFFLED_LIST_KEY = 'coe-students-shuffled-list-v1';
const COURSE_BUNDLE_DUMMY_STORE_KEY = 'coe-course-bundle-dummies-v1';
const ADDITIONAL_STUDENTS_LOG_KEY = 'coe-additional-students-log-v1';

type PersistedShuffledStudent = { reg_no: string; name: string };
type PersistedShuffledByDummy = Record<string, PersistedShuffledStudent>;

type CourseBundleDummyMap = Record<string, { courseDummies: string[]; bundles: Record<string, string[]> }>;
type CourseBundleDummyStore = Record<string, CourseBundleDummyMap>;

type AdditionalLogEntry = {
  regNo: string;
  studentName: string;
  dept: string;
  sem: string;
  courseCode: string;
  dummy: string;
  bundle: string;
  timestamp: string;
};

function readShuffledLists(): Record<string, PersistedShuffledByDummy> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SHUFFLED_LIST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeShuffledLists(lists: Record<string, PersistedShuffledByDummy>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SHUFFLED_LIST_KEY, JSON.stringify(lists));
}

function readCourseBundleDummyStore(): CourseBundleDummyStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COURSE_BUNDLE_DUMMY_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCourseBundleDummyStore(store: CourseBundleDummyStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COURSE_BUNDLE_DUMMY_STORE_KEY, JSON.stringify(store));
}

function readAdditionalLogs(): AdditionalLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ADDITIONAL_STUDENTS_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAdditionalLog(entry: AdditionalLogEntry) {
  if (typeof window === 'undefined') return;
  const logs = readAdditionalLogs();
  logs.push(entry);
  window.localStorage.setItem(ADDITIONAL_STUDENTS_LOG_KEY, JSON.stringify(logs));
}

const DEPARTMENT_DUMMY_DIGITS: Record<string, string> = {
  AIDS: '1', AIML: '2', CIVIL: '3', CSE: '4', ECE: '5', EEE: '6', IT: '7', MECH: '8',
};

export default function AdditionalPage() {
  const [departments, setDepartments] = useState<string[]>(['ALL']);
  const [semesters, setSemesters] = useState<string[]>(['SEM1']);
  const [dept, setDept] = useState('ALL');
  const [sem, setSem] = useState('SEM1');
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [studentName, setStudentName] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [availableCourses, setAvailableCourses] = useState<{ code: string; name: string }[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<AdditionalLogEntry[]>([]);

  // Fetch departments on mount
  useEffect(() => {
    let active = true;
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
        }
      } catch (err) {
        console.warn('Error fetching departments:', err);
      }
    })();
    return () => { active = false; };
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
        }
      } catch (err) {
        console.warn('Error fetching semesters:', err);
      }
    })();
    return () => { active = false; };
  }, []);

  // Fetch courses when dept/sem changes
  useEffect(() => {
    if (dept === 'ALL') {
      setAvailableCourses([]);
      return;
    }
    let active = true;
    (async () => {
      setLoadingCourses(true);
      try {
        const data: CoeStudentsMapResponse = await fetchCoeStudentsMap({ department: dept, semester: sem });
        if (!active) return;
        const courses: { code: string; name: string }[] = [];
        data.departments.forEach(d => {
          d.courses.forEach(c => {
            courses.push({ code: c.course_code, name: c.course_name });
          });
        });
        setAvailableCourses(courses);
        if (courses.length > 0) {
          setCourseCode(courses[0].code);
          setCourseName(courses[0].name);
        } else {
          setCourseCode('');
          setCourseName('');
        }
      } catch (err) {
        console.warn('Error fetching courses:', err);
      } finally {
        if (active) setLoadingCourses(false);
      }
    })();
    return () => { active = false; };
  }, [dept, sem]);

  const handleCourseChange = (code: string) => {
    setCourseCode(code);
    const course = availableCourses.find(c => c.code === code);
    if (course) setCourseName(course.name);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dept || dept === 'ALL' || !sem || !courseCode || !regNo || !studentName) {
      setMessage({ type: 'error', text: 'All fields are required. Please select a specific department.' });
      return;
    }

    const filterKey = `${dept}::${sem}`;
    const shuffledLists = readShuffledLists();
    const bundleStore = readCourseBundleDummyStore();
    
    const courseBundleMap = bundleStore[filterKey] || {};
    const courseData = courseBundleMap[courseCode] || { courseDummies: [], bundles: {} };

    // 1. Determine the last dummy number
    let lastDummy = 0;
    
    // Check in existing shuffled list for this filter
    const currentShuffled = shuffledLists[filterKey] || {};
    Object.keys(currentShuffled).forEach(d => {
      const num = parseInt(d, 10);
      if (!isNaN(num) && num > lastDummy) lastDummy = num;
    });

    // Check in all courses for this filter to find the absolute max dummy
    Object.values(courseBundleMap).forEach((c: any) => {
      c.courseDummies.forEach((d: string) => {
        const num = parseInt(d, 10);
        if (!isNaN(num) && num > lastDummy) lastDummy = num;
      });
    });

    // If still 0 or doesn't match dept/sem pattern, generate a fresh start
    const deptDigit = DEPARTMENT_DUMMY_DIGITS[dept] || '9';
    const semDigit = sem.replace('SEM', '') || '0';
    const basePrefix = parseInt(`${deptDigit}${semDigit}`, 10);
    
    if (lastDummy === 0 || Math.floor(lastDummy / 1000) !== basePrefix) {
      lastDummy = basePrefix * 1000;
    }

    const newDummy = String(lastDummy + 1);

    // 2. Add to shuffled list
    currentShuffled[newDummy] = { reg_no: regNo, name: studentName };
    shuffledLists[filterKey] = currentShuffled;
    writeShuffledLists(shuffledLists);

    // 3. Create a separate bundle for this student
    const bundleIndex = Object.keys(courseData.bundles).length + 1;
    const bundleName = `B${bundleIndex}-ADD`; // Special suffix
    
    courseData.courseDummies.push(newDummy);
    courseData.bundles[bundleName] = [newDummy];
    
    courseBundleMap[courseCode] = courseData;
    bundleStore[filterKey] = courseBundleMap;
    writeCourseBundleDummyStore(bundleStore);

    // 4. Log the entry
    writeAdditionalLog({
      regNo,
      studentName,
      dept,
      sem,
      courseCode,
      dummy: newDummy,
      bundle: bundleName,
      timestamp: new Date().toLocaleString(),
    });

    setMessage({ type: 'success', text: `Student added successfully with Dummy No: ${newDummy} in Bundle: ${bundleName}` });
    
    // Clear student-specific inputs
    setRegNo('');
    setStudentName('');
  };

  const handleReset = () => {
    setRegNo('');
    setStudentName('');
    setDept('ALL');
    setSem('SEM1');
    setCourseCode('');
    setCourseName('');
    setAvailableCourses([]);
    setMessage(null);
  };

  const handleOpenLogs = () => {
    setLogs(readAdditionalLogs());
    setShowLogs(true);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      {/* UI mimic of the Arrear List header */}
      <div className="flex items-center gap-2 rounded-lg bg-white p-3 shadow-sm border border-gray-100">
        <span className="text-sm font-semibold text-gray-700 mr-2">COE Additional Entry</span>
        <button
          type="button"
          onClick={() => setMessage(null)}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
        >
          Add student
        </button>
        <button 
          onClick={handleOpenLogs}
          className="rounded bg-gray-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-gray-800"
        >
          Logs
        </button>
        <button 
          onClick={handleReset}
          className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
        >
          Reset
        </button>
      </div>

      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h2 className="text-xl font-bold text-[#5b1a30]">Additional Entry Logs</h2>
              <button onClick={() => setShowLogs(false)} className="text-gray-500 hover:text-black text-2xl">×</button>
            </div>
            <div className="overflow-y-auto flex-1 border rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-100 border-b font-bold text-[#6f1d34]">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Student</th>
                    <th className="p-3">Reg No</th>
                    <th className="p-3">Course</th>
                    <th className="p-3">Dummy</th>
                    <th className="p-3">Bundle</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-gray-400">No saved logs found.</td></tr>
                  ) : (
                    [...logs].reverse().map((log, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{log.timestamp}</td>
                        <td className="p-3 font-medium">{log.studentName}</td>
                        <td className="p-3">{log.regNo}</td>
                        <td className="p-3">{log.courseCode}</td>
                        <td className="p-3 font-bold">{log.dummy}</td>
                        <td className="p-3 text-blue-700 font-bold">{log.bundle}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button 
                onClick={() => setShowLogs(false)}
                className="rounded-lg bg-gray-200 px-6 py-2 text-sm font-bold text-gray-700 hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#deb9ac] bg-white p-8 shadow-md">
        <h1 className="text-2xl font-bold text-[#5b1a30]">Missed Student Detail</h1>
        <p className="mt-1 text-sm text-gray-500">
          This student will be added to the course with a new dummy number and a separate bundle.
        </p>

        {message && (
          <div className={`mt-4 rounded-lg p-3 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#6f1d34] uppercase tracking-wider">Department</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 focus:border-[#6f1d34] focus:bg-white focus:outline-none transition-all"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
            >
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#6f1d34] uppercase tracking-wider">Semester</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 focus:border-[#6f1d34] focus:bg-white focus:outline-none transition-all"
              value={sem}
              onChange={(e) => setSem(e.target.value)}
            >
              {semesters.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#6f1d34] uppercase tracking-wider">Course Code</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 focus:border-[#6f1d34] focus:bg-white focus:outline-none transition-all disabled:opacity-50"
              value={courseCode}
              onChange={(e) => handleCourseChange(e.target.value)}
              disabled={loadingCourses || availableCourses.length === 0}
            >
              {availableCourses.length === 0 && <option value="">No courses found</option>}
              {availableCourses.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#6f1d34] uppercase tracking-wider">Course Name</label>
            <input
              type="text"
              readOnly
              className="w-full rounded-lg border border-gray-200 bg-gray-100 px-4 py-2.5 text-gray-600 focus:outline-none cursor-not-allowed"
              value={courseName}
            />
          </div>

          <div className="sm:col-span-2 border-t pt-6 mt-2">
            <h3 className="text-sm font-bold text-[#5b1a30] uppercase mb-4">Student Information</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#6f1d34] uppercase tracking-wider">Register Number</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-[#6f1d34] focus:outline-none transition-all placeholder:text-gray-400"
                  placeholder="e.g. 711121104001"
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#6f1d34] uppercase tracking-wider">Student Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-[#6f1d34] focus:outline-none transition-all placeholder:text-gray-400"
                  placeholder="Full Name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="pt-8 sm:col-span-2">
            <button
              type="submit"
              disabled={loadingCourses || !courseCode}
              className="w-full rounded-xl bg-gradient-to-r from-[#6f1d34] to-[#5b1a30] py-4 font-bold text-white shadow-xl transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-sm"
            >
              Add Student & Generate Separate Bundle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

