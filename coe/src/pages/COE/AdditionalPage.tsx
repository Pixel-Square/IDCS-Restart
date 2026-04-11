import React, { useState, useEffect } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { CoeStudentsMapResponse, fetchCoeStudentsMap } from '../../services/coe';
import { getCourseKey } from './courseSelectionStorage';
import { kvSave } from '../../utils/coeKvStore';
import { readShuffledLists, writeShuffledLists } from './shuffledListStore';
import { getBundleFinalizeConfig } from '../../utils/coeBundleFinalizeStore';

const COURSE_BUNDLE_DUMMY_STORE_KEY = 'coe-course-bundle-dummies-v1';
const ADDITIONAL_STUDENTS_LOG_KEY = 'coe-additional-students-log-v1';

type CourseBundleDummyMap = Record<string, { courseDummies: string[]; bundles: Record<string, string[]> }>;
type CourseBundleDummyStore = Record<string, CourseBundleDummyMap>;

type AdditionalLogEntry = {
  regNo: string;
  studentName: string;
  dept: string;
  sem: string;
  courseCode: string;
  courseName?: string;
  courseKey?: string;
  dummy: string;
  bundle: string;
  timestamp: string;
};

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
  const keys = Object.keys(store || {});
  if (keys.length > 0) {
    kvSave(COURSE_BUNDLE_DUMMY_STORE_KEY, store);
  } else {
    kvSave(COURSE_BUNDLE_DUMMY_STORE_KEY, null);
  }
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

function clearAdditionalLogs() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ADDITIONAL_STUDENTS_LOG_KEY);
  // Also sync the deletion to backend KV store
  kvSave(ADDITIONAL_STUDENTS_LOG_KEY, null);
}

const normalizeCourseName = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const DEPARTMENT_DUMMY_DIGITS: Record<string, string> = {
  AIDS: '01', AIML: '02', CIVIL: '03', CE: '03', CSE: '04', ECE: '05', EEE: '06', IT: '07', MECH: '08', ME: '08',
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

// Generate a random unique dummy number that doesn't exist
function generateRandomUniqueDummy(
  dept: string,
  existingDummies: Set<string>,
  maxAttempts = 100
): string | null {
  const deptCode = DEPARTMENT_DUMMY_DIGITS[dept.toUpperCase()] || '00';
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate random 5-digit sequence (10000-99999)
    const randomSeq = Math.floor(Math.random() * 90000) + 10000;
    const dummy = `E256${deptCode}${String(randomSeq).padStart(5, '0')}`;
    
    if (!existingDummies.has(dummy)) {
      return dummy;
    }
  }
  
  // Fallback: find next sequential number if random fails
  let seq = 1;
  while (seq < 100000) {
    const dummy = `E256${deptCode}${String(seq).padStart(5, '0')}`;
    if (!existingDummies.has(dummy)) {
      return dummy;
    }
    seq++;
  }
  
  return null;
}

// Generate bundle name in format: {courseCode}{deptShort}{XXX}
// This considers both regular bundles (from student count / bundle size) and additional bundles
function generateBundleName(
  courseCode: string,
  dept: string,
  sem: string,
  existingBundles: Record<string, string[]>,
  regularStudentCount: number
): string {
  const deptShort = DEPARTMENT_SHORT[dept.toUpperCase()] || dept.slice(0, 2).toUpperCase();
  const prefix = `${courseCode}${deptShort}`;
  
  // Get the bundle size from finalize config to calculate regular bundle count
  const finalizeConfig = getBundleFinalizeConfig(dept, sem);
  const bundleSize = finalizeConfig?.bundleSize || 25; // default 25 if not set
  
  // Calculate how many regular bundles exist based on student count
  const regularBundleCount = regularStudentCount > 0 ? Math.ceil(regularStudentCount / bundleSize) : 0;
  
  // Find the max existing bundle number from additional bundles
  let maxAdditionalNum = 0;
  Object.keys(existingBundles).forEach((bundleName) => {
    // Remove "(Additional)" suffix if present for comparison
    const cleanName = bundleName.replace(/\s*\(Additional\)\s*$/i, '').trim();
    const upperName = cleanName.toUpperCase();
    if (upperName.startsWith(prefix.toUpperCase())) {
      const suffix = upperName.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxAdditionalNum) {
        maxAdditionalNum = num;
      }
    }
  });
  
  // Next bundle number is the max of regular bundle count and additional bundle max, plus 1
  const nextNum = Math.max(regularBundleCount, maxAdditionalNum) + 1;
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

export default function AdditionalPage() {
  const [departments, setDepartments] = useState<string[]>(['ALL']);
  const [semesters, setSemesters] = useState<string[]>(['SEM1']);
  const [dept, setDept] = useState('ALL');
  const [sem, setSem] = useState('SEM1');
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [selectedCourseKey, setSelectedCourseKey] = useState('');
  const [regNo, setRegNo] = useState('');
  const [studentName, setStudentName] = useState('');
  const [manualDummy, setManualDummy] = useState('');
  const [manualBundle, setManualBundle] = useState('');
  const [bundleMode, setBundleMode] = useState<'new' | 'existing'>('new');
  const [existingBundleList, setExistingBundleList] = useState<string[]>([]);
  const [selectedExistingBundle, setSelectedExistingBundle] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [availableCourses, setAvailableCourses] = useState<{ key: string; code: string; name: string; studentCount: number }[]>([]);
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
      setSelectedCourseKey('');
      return;
    }
    let active = true;
    (async () => {
      setLoadingCourses(true);
      try {
        const data: CoeStudentsMapResponse = await fetchCoeStudentsMap({ department: dept, semester: sem });
        if (!active) return;
        const courses: { key: string; code: string; name: string; studentCount: number }[] = [];
        data.departments.forEach((d) => {
          // Safety: only include the currently selected department.
          if (String(d.department || '').trim().toUpperCase() !== String(dept || '').trim().toUpperCase()) return;
          d.courses.forEach((c) => {
            const code = String(c.course_code || '').trim();
            const name = String(c.course_name || '').trim();
            const studentCount = Array.isArray(c.students) ? c.students.length : 0;
            const key = getCourseKey({
              department: dept,
              semester: sem,
              courseCode: code,
              courseName: name,
            });
            courses.push({ key, code, name, studentCount });
          });
        });
        courses.sort((a, b) => {
          const byCode = a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
          if (byCode !== 0) return byCode;
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });
        setAvailableCourses(courses);
        if (courses.length > 0) {
          setSelectedCourseKey(courses[0].key);
          setCourseCode(courses[0].code);
          setCourseName(courses[0].name);
        } else {
          setCourseCode('');
          setCourseName('');
          setSelectedCourseKey('');
        }
      } catch (err) {
        console.warn('Error fetching courses:', err);
      } finally {
        if (active) setLoadingCourses(false);
      }
    })();
    return () => { active = false; };
  }, [dept, sem]);

  // Load existing bundles whenever course selection or dept/sem changes
  useEffect(() => {
    if (!selectedCourseKey || !dept || dept === 'ALL' || !sem || !courseCode) {
      setExistingBundleList([]);
      setSelectedExistingBundle('');
      return;
    }

    const deptShort = DEPARTMENT_SHORT[dept.toUpperCase()] || dept.slice(0, 2).toUpperCase();
    const prefix = `${courseCode}${deptShort}`;

    // 1. Compute regular bundles from student count / finalize bundle size
    const finalizeConfig = getBundleFinalizeConfig(dept, sem);
    const bundleSize = finalizeConfig?.bundleSize || 0;
    const selectedCourse = availableCourses.find((c) => c.key === selectedCourseKey);
    const studentCount = selectedCourse?.studentCount || 0;
    const regularBundleCount = bundleSize > 0 && studentCount > 0 ? Math.ceil(studentCount / bundleSize) : 0;

    const bundles: string[] = [];
    for (let i = 1; i <= regularBundleCount; i++) {
      bundles.push(`${prefix}${String(i).padStart(3, '0')}`);
    }

    // 2. Add additional bundles from the store
    const filterKey = `${dept}::${sem}`;
    const bundleStore = readCourseBundleDummyStore();
    const courseBundleMap = bundleStore[filterKey] || {};
    const ckPrefix = `${dept}::${sem}::${courseCode}::`;
    Object.entries(courseBundleMap).forEach(([ck, cd]) => {
      if (ck.startsWith(ckPrefix) || ck === selectedCourseKey) {
        Object.keys(cd.bundles || {}).forEach((b) => {
          if (!bundles.includes(b)) bundles.push(b);
        });
      }
    });

    // Sort: regular bundles already sorted by index; additional ones appended and sorted overall
    bundles.sort((a, b) => {
      const numA = parseInt(a.replace(prefix.toUpperCase(), ''), 10) || 0;
      const numB = parseInt(b.replace(prefix.toUpperCase(), ''), 10) || 0;
      return numA - numB;
    });

    setExistingBundleList(bundles);
    setSelectedExistingBundle(bundles[0] || '');
  }, [selectedCourseKey, dept, sem, courseCode, availableCourses]);

  const handleCourseChange = (key: string) => {
    setSelectedCourseKey(key);
    const course = availableCourses.find((c) => c.key === key);
    if (course) {
      setCourseCode(course.code);
      setCourseName(course.name);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedRegNo = regNo.trim();
    const normalizedStudentName = studentName.trim();
    const enteredDummy = manualDummy.trim();
    const enteredBundle = manualBundle.trim().toUpperCase();

    if (!dept || dept === 'ALL' || !sem || !courseCode || !selectedCourseKey || !normalizedRegNo || !normalizedStudentName) {
      setMessage({ type: 'error', text: 'All fields are required. Please select a specific department.' });
      return;
    }

    if (enteredDummy && !/^[A-Z0-9-_]+$/i.test(enteredDummy)) {
      setMessage({ type: 'error', text: 'Manual dummy number can use only letters, numbers, hyphen, and underscore.' });
      return;
    }

    if (enteredBundle && !/^[A-Z0-9-_]+$/.test(enteredBundle)) {
      setMessage({ type: 'error', text: 'Bundle number can use only letters, numbers, hyphen, and underscore.' });
      return;
    }

    const filterKey = `${dept}::${sem}`;
    const requestedCourseKey = selectedCourseKey;
    const shuffledLists = readShuffledLists();
    const bundleStore = readCourseBundleDummyStore();
    
    const courseBundleMap = bundleStore[filterKey] || {};

    // Use the exact stored courseKey if it already exists for this course code.
    // This avoids mismatches when courseName formatting differs across screens.
    let courseKey = requestedCourseKey;
    if (!courseBundleMap[courseKey]) {
      const prefix = `${dept}::${sem}::${courseCode || ''}::`;
      const candidates = Object.keys(courseBundleMap).filter((k) => k.startsWith(prefix));
      if (candidates.length === 1) {
        courseKey = candidates[0];
      } else if (candidates.length > 1) {
        const normalizedRequestedName = String(courseName || '').trim().toLowerCase();
        const exactByName = candidates.find((k) => {
          const parts = k.split('::');
          const storedName = String(parts[3] || '').trim().toLowerCase();
          return storedName && normalizedRequestedName && storedName === normalizedRequestedName;
        });
        courseKey = exactByName || candidates[0];
      }
    }

    const courseData = courseBundleMap[courseKey] || { courseDummies: [], bundles: {} };

    // Collect ALL existing dummy numbers across shuffled lists and all courses
    const allExistingDummies = new Set<string>();
    
    // Add from shuffled lists
    Object.values(shuffledLists).forEach((shuffled) => {
      Object.keys(shuffled).forEach((d) => allExistingDummies.add(d));
    });
    
    // Add from all courses in all filters
    Object.values(bundleStore).forEach((courseMap) => {
      Object.values(courseMap).forEach((cData: any) => {
        (cData?.courseDummies || []).forEach((d: string) => allExistingDummies.add(d));
      });
    });

    // Generate random unique dummy if not manually entered
    let newDummy = enteredDummy;
    if (!newDummy) {
      const generatedDummy = generateRandomUniqueDummy(dept, allExistingDummies);
      if (!generatedDummy) {
        setMessage({
          type: 'error',
          text: 'Unable to generate a unique dummy number. Please enter the Dummy Number manually.',
        });
        return;
      }
      newDummy = generatedDummy;
    }

    // Validate dummy doesn't exist
    if (allExistingDummies.has(newDummy)) {
      setMessage({ type: 'error', text: `Dummy number ${newDummy} already exists. Please use a different one.` });
      return;
    }

    // Get the student count for this course to calculate regular bundle count
    const selectedCourse = availableCourses.find((c) => c.key === selectedCourseKey);
    const regularStudentCount = selectedCourse?.studentCount || 0;

    // Determine bundle name based on mode
    let bundleName: string;
    if (bundleMode === 'existing') {
      const chosen = selectedExistingBundle.trim();
      if (!chosen) {
        setMessage({ type: 'error', text: 'Please select an existing bundle.' });
        return;
      }
      bundleName = chosen;
    } else {
      // new bundle
      bundleName = enteredBundle;
      if (!bundleName) {
        bundleName = generateBundleName(courseCode, dept, sem, courseData.bundles, regularStudentCount);
      }
      if (courseData.bundles[bundleName]) {
        setMessage({ type: 'error', text: `Bundle ${bundleName} already exists. Please use a different name or select it as an existing bundle.` });
        return;
      }
    }

    // Add to shuffled list
    const currentShuffled = shuffledLists[filterKey] || {};
    currentShuffled[newDummy] = { reg_no: normalizedRegNo, name: normalizedStudentName };
    shuffledLists[filterKey] = currentShuffled;
    writeShuffledLists(shuffledLists);

    // Add student dummy to course and bundle
    courseData.courseDummies.push(newDummy);
    if (bundleMode === 'existing' && courseData.bundles[bundleName]) {
      // Append to existing bundle
      courseData.bundles[bundleName] = [...courseData.bundles[bundleName], newDummy];
    } else {
      // Create new bundle
      courseData.bundles[bundleName] = [newDummy];
    }
    
    courseBundleMap[courseKey] = courseData;
    bundleStore[filterKey] = courseBundleMap;
    writeCourseBundleDummyStore(bundleStore);

    // Notify StudentsList (and any other listener in this tab) that additional data changed
    window.dispatchEvent(new CustomEvent('coe:additional-updated'));

    // Log the entry
    writeAdditionalLog({
      regNo: normalizedRegNo,
      studentName: normalizedStudentName,
      dept,
      sem,
      courseCode,
      courseName,
      courseKey,
      dummy: newDummy,
      bundle: bundleName,
      timestamp: new Date().toLocaleString(),
    });

    setMessage({ type: 'success', text: `Student added successfully with Dummy No: ${newDummy} in Bundle: ${bundleName}` });
    
    // Refresh existing bundle list so newly created bundle appears in dropdown
    const updatedBundles = Object.keys(courseData.bundles || {}).sort();
    setExistingBundleList(updatedBundles);
    if (bundleMode === 'new') {
      // Switch to existing mode and pre-select the just-created bundle
      setSelectedExistingBundle(bundleName);
    }

    // Clear student-specific inputs
    setRegNo('');
    setStudentName('');
    setManualDummy('');
    setManualBundle('');
    setBundleMode('new');
    setExistingBundleList([]);
    setSelectedExistingBundle('');
  };

  const handleReset = () => {
    // 1) Remove any entries created via Additional Entry (based on stored logs)
    const existingLogs = readAdditionalLogs();
    if (existingLogs.length > 0) {
      const shuffledLists = readShuffledLists();
      const bundleStore = readCourseBundleDummyStore();

      existingLogs.forEach((entry) => {
        const entryDept = String(entry.dept || '').trim().toUpperCase();
        const entrySem = String(entry.sem || '').trim().toUpperCase();
        const entryCourseCode = String(entry.courseCode || '').trim();
        const entryCourseName = String(entry.courseName || '').trim();
        const entryCourseKey = String(entry.courseKey || '').trim();
        const dummy = String(entry.dummy || '').trim();
        if (!entryDept || !entrySem || !entryCourseCode || !dummy) return;

        const filterKey = `${entryDept}::${entrySem}`;

        // Remove from shuffled list mapping
        if (shuffledLists[filterKey] && shuffledLists[filterKey][dummy]) {
          delete shuffledLists[filterKey][dummy];
          if (Object.keys(shuffledLists[filterKey]).length === 0) {
            delete shuffledLists[filterKey];
          }
        }

        // Remove from course bundle dummy store
        const courseBundleMap = bundleStore[filterKey];
        if (!courseBundleMap) return;

        // Prefer exact courseKey if we have it.
        if (entryCourseKey && courseBundleMap[entryCourseKey]) {
          const cd = courseBundleMap[entryCourseKey];
          cd.courseDummies = (cd.courseDummies || []).filter((d) => String(d || '').trim() !== dummy);
          Object.entries(cd.bundles || {}).forEach(([bundleName, dummies]) => {
            const next = (dummies || []).filter((d) => String(d || '').trim() !== dummy);
            if (next.length === 0) {
              delete cd.bundles[bundleName];
            } else {
              cd.bundles[bundleName] = next;
            }
          });

          if ((cd.courseDummies || []).length === 0 && Object.keys(cd.bundles || {}).length === 0) {
            delete courseBundleMap[entryCourseKey];
          } else {
            courseBundleMap[entryCourseKey] = cd;
          }

          if (Object.keys(courseBundleMap).length === 0) {
            delete bundleStore[filterKey];
          } else {
            bundleStore[filterKey] = courseBundleMap;
          }
          return;
        }

        const prefix = `${entryDept}::${entrySem}::${entryCourseCode}::`;
        const candidates = Object.keys(courseBundleMap).filter((k) => k.startsWith(prefix));

        const pickCandidate = (): string | null => {
          if (candidates.length === 0) return null;
          if (candidates.length === 1) return candidates[0];

          const normalizedName = normalizeCourseName(entryCourseName || '');
          if (normalizedName) {
            const exactByName = candidates.find((k) => {
              const parts = k.split('::');
              const storedName = normalizeCourseName(String(parts[3] || ''));
              return storedName && storedName === normalizedName;
            });
            if (exactByName) return exactByName;
          }

          const containingDummy = candidates.find((k) => {
            const cd = courseBundleMap[k];
            if (!cd) return false;
            if (Array.isArray(cd.courseDummies) && cd.courseDummies.includes(dummy)) return true;
            return Object.values(cd.bundles || {}).some((arr) => Array.isArray(arr) && arr.includes(dummy));
          });
          return containingDummy || candidates[0];
        };

        const courseKey = pickCandidate();
        if (!courseKey) return;

        const courseData = courseBundleMap[courseKey];
        if (!courseData) return;

        courseData.courseDummies = (courseData.courseDummies || []).filter((d) => String(d || '').trim() !== dummy);
        Object.entries(courseData.bundles || {}).forEach(([bundleName, dummies]) => {
          const next = (dummies || []).filter((d) => String(d || '').trim() !== dummy);
          if (next.length === 0) {
            delete courseData.bundles[bundleName];
          } else {
            courseData.bundles[bundleName] = next;
          }
        });

        if ((courseData.courseDummies || []).length === 0 && Object.keys(courseData.bundles || {}).length === 0) {
          delete courseBundleMap[courseKey];
        } else {
          courseBundleMap[courseKey] = courseData;
        }

        if (Object.keys(courseBundleMap).length === 0) {
          delete bundleStore[filterKey];
        } else {
          bundleStore[filterKey] = courseBundleMap;
        }
      });

      writeShuffledLists(shuffledLists);
      writeCourseBundleDummyStore(bundleStore);
    }

    // 2) Clear saved logs
    clearAdditionalLogs();

    // 3) Reset UI state
    setRegNo('');
    setStudentName('');
    setDept('ALL');
    setSem('SEM1');
    setCourseCode('');
    setCourseName('');
    setSelectedCourseKey('');
    setAvailableCourses([]);
    setManualDummy('');
    setManualBundle('');
    setBundleMode('new');
    setExistingBundleList([]);
    setSelectedExistingBundle('');
    setLogs([]);
    setShowLogs(false);
    
    // Show confirmation
    setMessage({ type: 'success', text: 'All additional entries and logs have been reset successfully.' });
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
              value={selectedCourseKey}
              onChange={(e) => handleCourseChange(e.target.value)}
              disabled={loadingCourses || availableCourses.length === 0}
            >
              {availableCourses.length === 0 && <option value="">No courses found</option>}
              {availableCourses.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.code}{c.name ? ` - ${c.name}` : ''}
                </option>
              ))}
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
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#6f1d34] uppercase tracking-wider">Dummy Number (Optional Manual)</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-[#6f1d34] focus:outline-none transition-all placeholder:text-gray-400"
                  placeholder="Auto-generated if left empty"
                  value={manualDummy}
                  onChange={(e) => setManualDummy(e.target.value.replace(/\s+/g, ''))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#6f1d34] uppercase tracking-wider">Bundle</label>
                {/* Mode toggle */}
                <div className="flex gap-3 mb-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm font-medium">
                    <input
                      type="radio"
                      name="bundleMode"
                      value="new"
                      checked={bundleMode === 'new'}
                      onChange={() => setBundleMode('new')}
                      className="accent-[#6f1d34]"
                    />
                    Create New Bundle
                  </label>
                  <label className={`flex items-center gap-1.5 cursor-pointer text-sm font-medium ${existingBundleList.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input
                      type="radio"
                      name="bundleMode"
                      value="existing"
                      checked={bundleMode === 'existing'}
                      onChange={() => setBundleMode('existing')}
                      disabled={existingBundleList.length === 0}
                      className="accent-[#6f1d34]"
                    />
                    Add to Existing Bundle
                  </label>
                </div>
                {bundleMode === 'existing' ? (
                  existingBundleList.length === 0 ? (
                    <p className="text-xs text-amber-600 italic">No existing additional bundles for this course yet.</p>
                  ) : (
                    <select
                      className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 focus:border-[#6f1d34] focus:outline-none transition-all"
                      value={selectedExistingBundle}
                      onChange={(e) => setSelectedExistingBundle(e.target.value)}
                    >
                      {existingBundleList.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  )
                ) : (
                  <input
                    type="text"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-[#6f1d34] focus:outline-none transition-all placeholder:text-gray-400"
                    placeholder="Auto-generated (e.g. 20EC8904EC005)"
                    value={manualBundle}
                    onChange={(e) => setManualBundle(e.target.value.toUpperCase())}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="pt-8 sm:col-span-2">
            <button
              type="submit"
              disabled={loadingCourses || !courseCode || !selectedCourseKey}
              className="w-full rounded-xl bg-gradient-to-r from-[#6f1d34] to-[#5b1a30] py-4 font-bold text-white shadow-xl transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-sm"
            >
              {bundleMode === 'existing' ? 'Add Student to Selected Bundle' : 'Add Student & Create New Bundle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

