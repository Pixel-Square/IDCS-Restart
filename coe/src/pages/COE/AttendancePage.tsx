import React, { useEffect, useMemo, useState } from 'react';

import { fetchCoeStudentsMap } from '../../services/coe';
import { getCourseKey, readCourseSelectionMap } from './courseSelectionStorage';
import { getAttendanceFilterKey, getAttendanceSessionKey, readAttendanceStatusMap, writeAttendanceStatus, readAttendanceLock, writeAttendanceLock } from './attendanceStore';
import { readTTScheduleMap } from './ttScheduleStore';
import { getCachedMe } from '../../services/auth';
import fetchWithAuth from '../../services/fetchAuth';

const DEPARTMENTS = ['ALL', 'AIDS', 'AIML', 'CSE', 'CIVIL', 'ECE', 'EEE', 'IT', 'MECH'] as const;
const SEMESTERS = ['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8'] as const;

type AttendanceRow = {
  reg_no: string;
  name: string;
  department: string;
};

type CourseMeta = {
  key: string;
  courseCode: string;
  courseName: string;
  department: string;
};

export default function AttendancePage() {
  const [department, setDepartment] = useState<(typeof DEPARTMENTS)[number]>('ALL');
  const [semester, setSemester] = useState<(typeof SEMESTERS)[number]>('SEM1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [activeCourse, setActiveCourse] = useState<CourseMeta | null>(null);
  const [attendanceDate, setAttendanceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [statusMap, setStatusMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [validatingPassword, setValidatingPassword] = useState(false);

  const filterKey = useMemo(() => getAttendanceFilterKey(department, semester), [department, semester]);
  const sessionKey = useMemo(() => {
    if (!activeCourse) return '';
    return getAttendanceSessionKey(filterKey, activeCourse.key, attendanceDate);
  }, [activeCourse, attendanceDate, filterKey]);

  useEffect(() => {
    if (!sessionKey) {
      setStatusMap({});
      setIsLocked(false);
      return;
    }
    setStatusMap(readAttendanceStatusMap(sessionKey));
    setIsLocked(readAttendanceLock(sessionKey));
  }, [sessionKey]);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchCoeStudentsMap({ department, semester });
        if (!active) return;

        const selectionMap = readCourseSelectionMap();
        const ttMap = readTTScheduleMap(filterKey);
        const activeCourseForDate = new Map<string, CourseMeta>();

        response.departments.forEach((deptBlock) => {
          deptBlock.courses
            .filter((course) => {
              const courseKey = getCourseKey({
                department: deptBlock.department,
                semester,
                courseCode: course.course_code || '',
                courseName: course.course_name || '',
              });
              const selection = selectionMap[courseKey];
              return selection ? selection.eseType === 'ESE' : true;
            })
            .forEach((course) => {
              const courseKey = getCourseKey({
                department: deptBlock.department,
                semester,
                courseCode: course.course_code || '',
                courseName: course.course_name || '',
              });
              const ttDate = ttMap[courseKey];
              if (!ttDate || ttDate !== attendanceDate) return;

              if (!activeCourseForDate.has(courseKey)) {
                activeCourseForDate.set(courseKey, {
                  key: courseKey,
                  courseCode: course.course_code || '',
                  courseName: course.course_name || 'Unnamed Course',
                  department: deptBlock.department,
                });
              }
            });
        });

        const targetCourse = Array.from(activeCourseForDate.values())[0] || null;
        setActiveCourse(targetCourse);

        if (!targetCourse) {
          setRows([]);
          return;
        }

        const deptBlock = response.departments.find((d) => d.department === targetCourse.department);
        const course = (deptBlock?.courses || []).find((c) =>
          getCourseKey({
            department: targetCourse.department,
            semester,
            courseCode: c.course_code || '',
            courseName: c.course_name || '',
          }) === targetCourse.key
        );

        const list = (course?.students || [])
          .map((student) => ({
            reg_no: String(student.reg_no || '').trim(),
            name: String(student.name || ''),
            department: targetCourse.department,
          }))
          .filter((student) => Boolean(student.reg_no))
          .sort((a, b) => a.reg_no.localeCompare(b.reg_no, undefined, { numeric: true, sensitivity: 'base' }));

        setRows(list);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to load attendance students.';
        setError(message);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [department, semester, attendanceDate, filterKey]);

  const presentCount = useMemo(() => rows.filter((row) => (statusMap[row.reg_no] || 'present') === 'present').length, [rows, statusMap]);
  const absentCount = useMemo(() => rows.filter((row) => statusMap[row.reg_no] === 'absent').length, [rows, statusMap]);

  const setStatus = (regNo: string, status: 'present' | 'absent') => {
    if (!sessionKey || isLocked) return;
    writeAttendanceStatus(sessionKey, regNo, status);
    setStatusMap((prev) => ({ ...prev, [regNo]: status }));
  };

  const handleSaveAttendance = () => {
    if (!sessionKey || isLocked) return;
    if (window.confirm('Are you sure you want to save the attendance? Once saved, absent students will not be in the dummy generation list.')) {
      writeAttendanceLock(sessionKey, true);
      setIsLocked(true);
    }
  };

  const openUnlockConfirm = () => {
    if (!sessionKey || !isLocked) return;
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

      writeAttendanceLock(sessionKey, false);
      setIsLocked(false);
      setShowPasswordModal(false);
      setPasswordInput('');
    } catch (err: any) {
      setPasswordError(err.message || 'Invalid password');
    } finally {
      setValidatingPassword(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {showPasswordModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-96">
            <h2 className="text-lg font-bold mb-2">Confirm Edit</h2>
            <p className="text-sm text-gray-600 mb-4">
              Please enter your login password to unlock editing.
            </p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
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
                {validatingPassword ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#deb9ac] bg-white p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#5b1a30]">COE Attendance</h1>
          <p className="mt-2 text-sm text-[#6a4a40]">
            Mark students as Present or Absent. Attendance opens only for courses with TT date matching the selected date.
          </p>
        </div>
        {activeCourse && rows.length > 0 ? (
          <div>
            {isLocked ? (
              <button
                onClick={openUnlockConfirm}
                className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-yellow-600 hover:bg-yellow-700 focus:outline-none"
              >
                Edit
              </button>
            ) : (
              <button
                onClick={handleSaveAttendance}
                className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-blue-600 hover:bg-blue-700"
              >
                Save
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="coe-attendance-department">
              Department
            </label>
            <select
              id="coe-attendance-department"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              value={department}
              onChange={(e) => setDepartment(e.target.value as (typeof DEPARTMENTS)[number])}
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="coe-attendance-semester">
              Semester
            </label>
            <select
              id="coe-attendance-semester"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              value={semester}
              onChange={(e) => setSemester(e.target.value as (typeof SEMESTERS)[number])}
            >
              {SEMESTERS.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="coe-attendance-date">
              Attendance Date
            </label>
            <input
              id="coe-attendance-date"
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </div>
        </div>

        <div className="mt-4 rounded-md border border-[#ead7d0] bg-[#faf4f0] px-3 py-2 text-sm text-[#6a4a40]">
          {activeCourse
            ? `Active Course: ${activeCourse.courseName} (${activeCourse.courseCode || 'NO_CODE'})`
            : 'No TT course found for this date. Please set TT date from Course List.'}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-emerald-700">Present: {presentCount}</span>
          <span className="rounded-md bg-red-50 px-3 py-1.5 text-red-700">Absent: {absentCount}</span>
          <span className="rounded-md bg-slate-50 px-3 py-1.5 text-slate-700">Total: {rows.length}</span>
        </div>
      </div>

      {loading ? <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">Loading students...</div> : null}
      {!loading && error ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
          {!activeCourse ? (
            <p className="text-sm text-gray-600">No TT-enabled course is open for attendance on {attendanceDate}.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-600">No students found for the selected course.</p>
          ) : (
            rows.map((row) => {
              const status = statusMap[row.reg_no] || 'present';
              return (
                <div key={`${row.reg_no}-${row.department}`} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-base font-semibold text-gray-900">{row.name || 'Unnamed Student'}</p>
                      <p className="text-xs font-medium text-gray-500">{row.reg_no} | {row.department} | {semester}</p>
                    </div>

                    <div className="inline-flex items-center gap-4 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name={`attendance-${row.reg_no}`}
                          checked={status === 'present'}
                          onChange={() => setStatus(row.reg_no, 'present')}
                          disabled={isLocked}
                        />
                        Present
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name={`attendance-${row.reg_no}`}
                          checked={status === 'absent'}
                          onChange={() => setStatus(row.reg_no, 'absent')}
                          disabled={isLocked}
                        />
                        Absent
                      </label>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
