import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { fetchCoeStudentsMap, fetchCoeFilterOptions } from '../../services/coe';

export type ExamTimetableEntry = {
  id: string;
  exam_title: string;
  exam_date: string;
  session: 'FN' | 'AN';
  department: string;
  semester: string;
  course_code: string;
  course_name: string;
  created_at: string;
};

const TIMETABLE_STORE_KEY = 'COE_EXAM_TIMETABLE_V1';

async function kvLoad<T>(key: string, fallback: T): Promise<T> {
  try {
    const res = await fetchWithAuth(`/api/coe/kv-store/?key=${encodeURIComponent(key)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.data !== null && data.data !== undefined) return data.data as T;
    }
  } catch {}
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

async function kvSave<T>(key: string, value: T): Promise<boolean> {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  try {
    const res = await fetchWithAuth('/api/coe/kv-store/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, data: value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function ExamTimetablePage() {
  const navigate = useNavigate();
  const [timetable, setTimetable] = useState<ExamTimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Dynamic filter options from backend
  const [departments, setDepartments] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);

  // Form states
  const [examTitle, setExamTitle] = useState('CIA-1');
  const [examDate, setExamDate] = useState('');
  const [selectedSession, setSelectedSession] = useState<'FN' | 'AN'>('FN');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSem, setSelectedSem] = useState('SEM1');
  const [selectedCourseCode, setSelectedCourseCode] = useState('');
  const [selectedCourseName, setSelectedCourseName] = useState('');
  const [selectedCourseKey, setSelectedCourseKey] = useState('');

  const [availableCourses, setAvailableCourses] = useState<Array<{ key: string; course_code: string; course_name: string; count: number }>>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const loaded = await kvLoad<ExamTimetableEntry[]>(TIMETABLE_STORE_KEY, []);
        setTimetable(Array.isArray(loaded) ? loaded : []);

        const options = await fetchCoeFilterOptions();
        const validDepts = (options.departments || []).filter((d) => d && d.trim().toUpperCase() !== 'ALL');
        setDepartments(validDepts);
        setSemesters(options.semesters || ['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8']);
        if (validDepts.length > 0) {
          setSelectedDept(validDepts[0]);
        }
        if (options.semesters && options.semesters.length > 0) {
          setSelectedSem(options.semesters[0]);
        }
      } catch (err) {
        console.warn('Error initializing timetable page options', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedDept || !selectedSem) return;
    (async () => {
      setLoadingCourses(true);
      try {
        const res = await fetchCoeStudentsMap({ department: selectedDept, semester: selectedSem });
        const coursesMap: Record<string, { key: string; code: string; name: string; count: number }> = {};
        const targetSemNum = parseInt(selectedSem.replace('SEM', ''), 10);
        const normDept = (d: string) => {
          const u = String(d || '').trim().toUpperCase();
          if (u === 'CIVIL' || u === 'CE') return 'CE';
          if (u === 'MECH' || u === 'ME') return 'ME';
          if (u === 'AIDS' || u === 'AI&DS') return 'AIDS';
          if (u === 'AIML' || u === 'AI&ML') return 'AIML';
          return u;
        };
        const targetDeptNorm = normDept(selectedDept);
        for (const dBlock of res.departments || []) {
          if (selectedDept !== 'ALL' && normDept(dBlock.department) !== targetDeptNorm) {
            continue;
          }
          for (const c of dBlock.courses || []) {
            if ((c as any).semester) {
              const cSemNum = parseInt(String((c as any).semester).replace('SEM', ''), 10);
              if (!isNaN(cSemNum) && !isNaN(targetSemNum) && cSemNum !== targetSemNum) {
                continue;
              }
            }
            const code = String(c.course_code || '').trim();
            const name = String(c.course_name || '').trim();
            const key = code ? `${code}::${name}` : name;
            if (key) {
              if (!coursesMap[key]) {
                coursesMap[key] = { key, code: code || name, name: name || code, count: 0 };
              }
              coursesMap[key].count += (c.students || []).length;
            }
          }
        }
        const list = Object.values(coursesMap).map((item) => ({
          key: item.key,
          course_code: item.code,
          course_name: item.name,
          count: item.count,
        }));
        setAvailableCourses(list);
        if (list.length > 0) {
          setSelectedCourseKey(list[0].key);
          setSelectedCourseCode(list[0].course_code);
          setSelectedCourseName(list[0].course_name);
        } else {
          setSelectedCourseKey('');
          setSelectedCourseCode('');
          setSelectedCourseName('');
        }
      } catch (err) {
        console.warn('Error fetching courses for timetable', err);
      } finally {
        setLoadingCourses(false);
      }
    })();
  }, [selectedDept, selectedSem]);

  const handleCourseSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    setSelectedCourseKey(key);
    const found = availableCourses.find((c) => c.key === key);
    if (found) {
      setSelectedCourseCode(found.course_code);
      setSelectedCourseName(found.course_name);
    }
  };

  const handleAddEntry = async () => {
    if (!examDate.trim()) {
      setError('Please provide an Exam Date (e.g., 20.11.2026).');
      return;
    }
    if (!selectedCourseCode) {
      setError('Please select a Course / Subject.');
      return;
    }
    setError(null);

    const exists = timetable.some(
      (t) =>
        t.exam_date === examDate.trim() &&
        t.session === selectedSession &&
        t.department === selectedDept &&
        t.course_code === selectedCourseCode
    );
    if (exists) {
      setError(`Course ${selectedCourseCode} for ${selectedDept} on ${examDate} (${selectedSession}) is already added.`);
      return;
    }

    const newEntry: ExamTimetableEntry = {
      id: `tt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      exam_title: examTitle.trim() || 'CIA-1',
      exam_date: examDate.trim(),
      session: selectedSession,
      department: selectedDept,
      semester: selectedSem,
      course_code: selectedCourseCode,
      course_name: selectedCourseName,
      created_at: new Date().toISOString(),
    };

    const updated = [newEntry, ...timetable];
    setTimetable(updated);
    await kvSave(TIMETABLE_STORE_KEY, updated);
    setMessage(`✓ Added ${selectedCourseCode} (${selectedDept} ${selectedSem}) for ${examDate} (${selectedSession}).`);
  };

  const handleDeleteEntry = async (id: string) => {
    const updated = timetable.filter((t) => t.id !== id);
    setTimetable(updated);
    await kvSave(TIMETABLE_STORE_KEY, updated);
    setMessage('Timetable entry removed.');
  };

  const handleGoToHallPlan = (dateStr: string, sess: 'FN' | 'AN') => {
    navigate(`/coe/hall-allocation/plan?date=${encodeURIComponent(dateStr)}&session=${sess}`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-2">
      <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_30px_45px_-30px_rgba(111,29,52,0.55)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#5b1a30]">📅 Exam Timetable Management</h1>
            <p className="mt-1 text-sm text-[#6a4a40]">
              Schedule course exams by Date, Session, Department, and Course. Finalized timetables automatically load student seating pools into Hall Allocation Plans!
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/coe/hall-allocation/plan')}
            className="rounded-lg bg-[#6f1d34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#591729] shadow-sm"
          >
            Go to Hall Allocation Plan →
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-[#f5c2c7] bg-[#fff1f3] px-3 py-2 text-sm text-[#9f2e3f]">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="mt-4 rounded-lg border border-[#dcedd9] bg-[#f3f9f1] px-3 py-2 text-sm text-[#2f5236]">
            {message}
          </div>
        ) : null}
      </div>

      {/* Input Form */}
      <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-[#5b1a30]">Schedule New Exam Course</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold text-[#5b1a30]">Exam Title</label>
            <input
              type="text"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2 text-sm"
              placeholder="e.g., CIA-1 August 2026"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b1a30]">Exam Date</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b1a30]">Session</label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value as 'FN' | 'AN')}
              className="mt-1 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2 text-sm"
            >
              <option value="FN">FN (Forenoon)</option>
              <option value="AN">AN (Afternoon)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b1a30]">Department</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2 text-sm"
            >
              {departments.length === 0 ? (
                <option value="">Loading departments...</option>
              ) : (
                departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b1a30]">Semester</label>
            <select
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2 text-sm"
            >
              {semesters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-[#5b1a30]">Course / Subject</label>
            <select
              value={selectedCourseKey}
              onChange={handleCourseSelectChange}
              disabled={loadingCourses || availableCourses.length === 0}
              className="mt-1 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2 text-sm disabled:opacity-60"
            >
              {loadingCourses ? (
                <option value="">Loading courses...</option>
              ) : availableCourses.length === 0 ? (
                <option value="">No courses found for {selectedDept} {selectedSem}</option>
              ) : (
                availableCourses.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.course_code && c.course_code !== c.course_name ? `${c.course_code} - ${c.course_name}` : c.course_name} ({c.count} students)
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAddEntry}
              className="w-full rounded-lg bg-[#b2472e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#913925] shadow-sm"
            >
              + Add to Timetable
            </button>
          </div>
        </div>
      </div>

      {/* Timetable Table */}
      <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-[#5b1a30]">Master Exam Timetable ({timetable.length} Scheduled Entries)</h2>

        {loading ? (
          <p className="text-sm text-gray-500">Loading timetable...</p>
        ) : timetable.length === 0 ? (
          <p className="text-sm text-[#6a4a40]">No exams scheduled in timetable yet. Add entries above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#e1c6b8] text-left text-xs font-semibold text-[#7a2038]">
                  <th className="px-3 py-2">Exam Date</th>
                  <th className="px-3 py-2">Session</th>
                  <th className="px-3 py-2">Exam Title</th>
                  <th className="px-3 py-2">Dept</th>
                  <th className="px-3 py-2">Sem</th>
                  <th className="px-3 py-2">Course Code & Name</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {timetable.map((row) => (
                  <tr key={row.id} className="border-t border-[#f0e4dc] hover:bg-[#fcf7f4]">
                    <td className="px-3 py-2 font-bold text-[#5b1a30]">{row.exam_date}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                          row.session === 'FN' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {row.session}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[#6a4a40]">{row.exam_title}</td>
                    <td className="px-3 py-2 font-semibold text-[#6f1d34]">{row.department}</td>
                    <td className="px-3 py-2">{row.semester}</td>
                    <td className="px-3 py-2 font-medium text-[#1f493d]">
                      {row.course_code} {row.course_name ? `- ${row.course_name}` : ''}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleGoToHallPlan(row.exam_date, row.session)}
                          className="rounded border border-[#3c6a5a] bg-[#edf7f2] px-2 py-1 text-xs font-semibold text-[#1f493d] hover:bg-[#d4f0e7]"
                        >
                          Generate Hall Plan
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(row.id)}
                          className="rounded border border-[#d8a791] px-2 py-1 text-xs font-semibold text-[#7a2038] hover:bg-[#f7e3db]"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
