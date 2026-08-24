import React, { useEffect, useState } from 'react';

import { fetchCoeStudentsMap, fetchCoeFilterOptions } from '../../services/coe';

type FinalResultRow = {
  registerNumber: string;
  studentName: string;
  degreeCode: string;
  programCode: string;
  deptSchoolCategoryCode: string;
  semesterClassCode: string;
  courseCode: string;
  subExamCode: string;
  assessmentType: string;
  examinationCode: string;
  externalMark: string;
  courseName: string;
};

const EXPORT_HEADERS = [
  'Register Number*',
  'Student Name',
  'Degree Code*',
  'Program Code*',
  'Dept/school category Code*',
  'Semester/Class Code*',
  'Course Code*',
  'Sub Exam Code*',
  'Assessment Type',
  'Examination Code*',
  'External Mark*',
] as const;

const REQUIRED_FIELDS: Array<keyof FinalResultRow> = [
  'registerNumber',
  'degreeCode',
  'programCode',
  'deptSchoolCategoryCode',
  'semesterClassCode',
  'courseCode',
  'subExamCode',
  'examinationCode',
  'externalMark',
];

const PROGRAM_CODE_MAP: Record<string, string> = {
  CSE: 'B.E-CSE',
  MECH: 'B.E-MECH',
  ECE: 'B.E-ECE',
  EEE: 'B.E-EEE',
  CIVIL: 'B.E-CIVIL',
  FIRST: 'B.E-FIRST',
  AIDS: 'B.Tech-AIDS',
  AIML: 'B.Tech-AIML',
  IT: 'B.TECH-IT',
};

const DEPT_SCHOOL_CATEGORY_MAP: Record<string, string> = {
  CSE: 'CSE',
  MECH: 'Mech',
  ECE: 'ECE',
  EEE: 'EEE',
  CIVIL: 'CIVIL',
  AIDS: 'AI&DS',
  AIML: 'AI&ML',
  IT: 'IT',
};

const SEMESTER_CLASS_CODE_MAP: Record<string, Record<number, string>> = {
  CSE: { 1: 'BCSE-1', 2: 'BCSE-2', 3: 'BCSE-3', 4: 'BCSE-4', 5: 'BCSE-5', 6: 'BCSE-6', 7: 'BCSE-7', 8: 'BCSE-8' },
  MECH: { 1: 'BMEC-1', 2: 'BMEC-2', 3: 'BMEC-3', 4: 'BMEC-4', 5: 'BMEC-5', 6: 'BMEC-6', 7: 'BMEC-7', 8: 'BMEC-8' },
  ECE: { 1: 'BECE-1', 2: 'BECE-2', 3: 'BECE-3', 4: 'BECE-4', 5: 'BECE-5', 6: 'BECE-6', 7: 'BECE-7', 8: 'BECE-8' },
  EEE: { 1: 'BEEE-1', 2: 'BEEE-2', 3: 'BEEE-3', 4: 'BEEE-4', 5: 'BEEE-5', 6: 'BEEE-6', 7: 'BEEE-7', 8: 'BEEE-8' },
  CIVIL: { 1: 'BCE-1', 2: 'BCE-2', 3: 'BCE-3', 5: 'BCE-5', 6: 'BCE-6', 7: 'BCE-7', 8: 'BCE-8' },
  AIML: { 1: 'BAIML', 2: 'BAIML-2', 3: 'BAIML-3', 4: 'BAIML-4', 5: 'BAIML-5', 6: 'BAIML-6', 7: 'BAIML-7', 8: 'BAIML-8' },
  AIDS: { 1: 'BAIDS-1', 2: 'BAIDS-2', 3: 'BAIDS-3', 4: 'BAIDS-4', 5: 'BAIDS-5', 6: 'BAIDS-6', 7: 'BAIDS-7', 8: 'BAIDS-8' },
};

export default function FinalResultPage() {
  const [departments, setDepartments] = useState<string[]>(['ALL']);
  const [semesters, setSemesters] = useState<string[]>(['SEM1']);
  const [department, setDepartment] = useState('ALL');
  const [semester, setSemester] = useState('SEM1');
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [rows, setRows] = useState<FinalResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [optionsNote, setOptionsNote] = useState<string | null>(null);

  function getSemesterCandidates(input: string): string[] {
    const raw = String(input || '').trim();
    if (!raw) return ['1', 'SEM1'];

    const candidates = new Set<string>([raw]);
    const semMatch = raw.match(/^SEM\s*([0-9]+)$/i);
    if (semMatch?.[1]) candidates.add(semMatch[1]);
    if (/^[0-9]+$/.test(raw)) candidates.add(`SEM${raw}`);

    return Array.from(candidates);
  }

  function toSemesterClassCodeFallback(input: string): string {
    const raw = String(input || '').trim().toUpperCase();
    if (!raw) return '';
    if (raw.startsWith('SEM')) return raw;
    if (/^[0-9]+$/.test(raw)) return `SEM${raw}`;
    return raw;
  }

  function normalizeDepartmentCode(input: string): string {
    const value = String(input || '').trim().toUpperCase();
    if (!value) return '';

    if (value === 'AI&DS' || value === 'AI AND DS' || value === 'AIDS') return 'AIDS';
    if (value === 'AI&ML' || value === 'AI AND ML' || value === 'AIML') return 'AIML';
    if (value === 'MECHANICAL' || value === 'MECH') return 'MECH';
    if (value === 'COMPUTER SCIENCE' || value === 'CSE') return 'CSE';
    if (value === 'ELECTRONICS AND COMMUNICATION' || value === 'ECE') return 'ECE';
    if (value === 'ELECTRICAL AND ELECTRONICS' || value === 'EEE') return 'EEE';
    if (value === 'INFORMATION TECHNOLOGY' || value === 'IT') return 'IT';
    if (value === 'CIVIL') return 'CIVIL';
    if (value === 'FIRST YEAR' || value === 'FIRST') return 'FIRST';
    return value;
  }

  function parseSemesterNumber(input: string): number | null {
    const raw = String(input || '').trim().toUpperCase();
    if (!raw) return null;
    const semMatch = raw.match(/^SEM\s*-?\s*(\d+)$/i);
    if (semMatch?.[1]) return Number.parseInt(semMatch[1], 10);
    if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
    return null;
  }

  function buildMappedFields(departmentCodeRaw: string, semesterRaw: string) {
    const deptCode = normalizeDepartmentCode(departmentCodeRaw);
    const semesterNumber = parseSemesterNumber(semesterRaw);

    const degreeCode = 'UG';
    const programCode = PROGRAM_CODE_MAP[deptCode] || '';
    const deptSchoolCategoryCode = DEPT_SCHOOL_CATEGORY_MAP[deptCode] || departmentCodeRaw || '';
    const semesterClassCode =
      semesterNumber != null
        ? (SEMESTER_CLASS_CODE_MAP[deptCode]?.[semesterNumber] || '')
        : '';

    return {
      degreeCode,
      programCode,
      deptSchoolCategoryCode,
      semesterClassCode: semesterClassCode || toSemesterClassCodeFallback(semesterRaw),
    };
  }

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);

    (async () => {
      try {
        const options = await fetchCoeFilterOptions();
        if (!active) return;
        setDepartments(options.departments);
        setDepartment(options.departments[0] || 'ALL');
        setSemesters(options.semesters);
        setSemester(options.semesters[0] || 'SEM1');

        if (options.source === 'academics') {
          setOptionsNote(null);
        } else if (options.source === 'coe-map' || options.source === 'mixed') {
          setOptionsNote('Loaded filter options from COE course map.');
        } else {
          setOptionsNote('Using default filters because department/semester master APIs are unavailable.');
        }
      } catch {
        if (!active) return;
        setDepartments(['ALL']);
        setSemesters(['1', 'SEM1']);
        setDepartment('ALL');
        setSemester('1');
        setOptionsNote('Using default filters because backend master APIs are unavailable.');
      } finally {
        if (active) setLoadingOptions(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingCourses(true);
    setError(null);

    (async () => {
      try {
        const candidates = getSemesterCandidates(semester);
        let loaded = false;
        let loadedRows: FinalResultRow[] = [];

        for (const semCandidate of candidates) {
          const res = await fetchCoeStudentsMap({ department, semester: semCandidate });
          const semesterLabel = String(res.semester_filter || semCandidate || semester);

          const nextRows: FinalResultRow[] = [];
          for (const deptBlock of res.departments || []) {
            const mapped = buildMappedFields(String(deptBlock.department || department), semesterLabel);

            for (const course of deptBlock.courses || []) {
              const students = Array.isArray(course.students) ? course.students : [];

              if (students.length === 0) {
                nextRows.push({
                  registerNumber: '',
                  studentName: '',
                  degreeCode: mapped.degreeCode,
                  programCode: mapped.programCode,
                  deptSchoolCategoryCode: mapped.deptSchoolCategoryCode,
                  semesterClassCode: mapped.semesterClassCode,
                  courseCode: course.course_code || '',
                  subExamCode: '',
                  assessmentType: '',
                  examinationCode: '',
                  externalMark: '',
                  courseName: course.course_name || '',
                });
                continue;
              }

              for (const student of students) {
                nextRows.push({
                  registerNumber: String(student?.reg_no || '').trim(),
                  studentName: String(student?.name || '').trim(),
                  degreeCode: mapped.degreeCode,
                  programCode: mapped.programCode,
                  deptSchoolCategoryCode: mapped.deptSchoolCategoryCode,
                  semesterClassCode: mapped.semesterClassCode,
                  courseCode: course.course_code || '',
                  subExamCode: '',
                  assessmentType: '',
                  examinationCode: '',
                  externalMark: '',
                  courseName: course.course_name || '',
                });
              }
            }
          }

          if (nextRows.length > 0) {
            loadedRows = nextRows;
            loaded = true;
            break;
          }

          if (!loaded) {
            loadedRows = nextRows;
          }
        }

        if (!active) return;
        setRows(loadedRows);
        if (!loaded && candidates.length > 1) {
          setOptionsNote('No courses for selected semester label. Tried alternate semester format automatically.');
        }
      } catch (err) {
        if (!active) return;
        const errorMsg = err instanceof Error ? err.message : 'Unable to load courses for the selected filters right now. Please try again.';
        setError(errorMsg);
        setRows([]);
      } finally {
        if (active) setLoadingCourses(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [department, semester]);

  function updateRow(index: number, key: keyof FinalResultRow, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  async function handleDownload() {
    if (rows.length === 0) {
      alert('No course rows available to download.');
      return;
    }

    const missing: string[] = [];
    rows.forEach((row, i) => {
      for (const key of REQUIRED_FIELDS) {
        if (!String(row[key] || '').trim()) {
          missing.push(`Row ${i + 1}: ${key}`);
          break;
        }
      }
    });

    if (missing.length > 0) {
      alert(`Please fill all required (*) fields before download.\n${missing.slice(0, 5).join('\n')}${missing.length > 5 ? '\n...' : ''}`);
      return;
    }

    try {
      setDownloading(true);
      const XLSX = await import('xlsx');

      const aoa = [
        [...EXPORT_HEADERS],
        ...rows.map((row) => [
          row.registerNumber,
          row.studentName,
          row.degreeCode,
          row.programCode,
          row.deptSchoolCategoryCode,
          row.semesterClassCode,
          row.courseCode,
          row.subExamCode,
          row.assessmentType,
          row.examinationCode,
          row.externalMark,
        ]),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Final Result');

      const safeDept = department.replace(/[^a-zA-Z0-9_-]+/g, '_');
      const safeSem = semester.replace(/[^a-zA-Z0-9_-]+/g, '_');
      XLSX.writeFile(workbook, `final_result_${safeDept}_${safeSem}.xlsx`);
    } catch {
      alert('Unable to generate the Excel file right now. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-[#d9b7ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)]">
      <div>
        <h1 className="text-2xl font-bold text-[#5a192f]">Final Result</h1>
        <p className="mt-1 text-sm text-[#6f4a3f]">
          Choose department and semester, enter all required data and external marks, then download Excel.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-[#6f4a3f]">
          Department
          <select
            className="mt-1 w-full rounded-lg border border-[#d9b7ac] bg-white px-3 py-2 text-sm text-[#3f2a22] outline-none focus:border-[#a3462d]"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={loadingOptions}
          >
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-[#6f4a3f]">
          Semester
          <select
            className="mt-1 w-full rounded-lg border border-[#d9b7ac] bg-white px-3 py-2 text-sm text-[#3f2a22] outline-none focus:border-[#a3462d]"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            disabled={loadingOptions}
          >
            {semesters.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={handleDownload}
            disabled={loadingCourses || downloading || rows.length === 0}
            className="inline-flex items-center rounded-lg bg-[#6f1d34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#591729] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? 'Preparing Excel...' : 'Download Excel'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {optionsNote ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{optionsNote}</div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#e7cfc7]">
        <table className="min-w-[1350px] divide-y divide-[#ecd9d2]">
          <thead className="bg-[#fff7f4]">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#7f5143]">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Course Code*</th>
              <th className="px-3 py-2">Course Name</th>
              <th className="px-3 py-2">Register Number*</th>
              <th className="px-3 py-2">Student Name</th>
              <th className="px-3 py-2">Degree Code*</th>
              <th className="px-3 py-2">Program Code*</th>
              <th className="px-3 py-2">Dept/school category Code*</th>
              <th className="px-3 py-2">Semester/Class Code*</th>
              <th className="px-3 py-2">Sub Exam Code*</th>
              <th className="px-3 py-2">Assessment Type</th>
              <th className="px-3 py-2">Examination Code*</th>
              <th className="px-3 py-2">External Mark*</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1e3de] bg-white text-sm text-[#3f2a22]">
            {loadingCourses ? (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-[#7f5143]">Loading courses...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-[#7f5143]">No courses found for selected filters.</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.courseCode}-${index}`}>
                  <td className="px-3 py-2">{index + 1}</td>
                  <td className="px-2 py-1">
                    <input
                      value={row.courseCode}
                      onChange={(e) => updateRow(index, 'courseCode', e.target.value)}
                      className="w-32 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-3 py-2 min-w-[180px]">{row.courseName || '-'}</td>
                  <td className="px-2 py-1">
                    <input
                      value={row.registerNumber}
                      readOnly
                      title="Fetched from DB"
                      className="w-36 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={row.studentName}
                      readOnly
                      title="Fetched from DB"
                      className="w-40 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={row.degreeCode}
                      onChange={(e) => updateRow(index, 'degreeCode', e.target.value)}
                      className="w-28 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={row.programCode}
                      onChange={(e) => updateRow(index, 'programCode', e.target.value)}
                      className="w-28 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={row.deptSchoolCategoryCode}
                      onChange={(e) => updateRow(index, 'deptSchoolCategoryCode', e.target.value)}
                      className="w-36 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={row.semesterClassCode}
                      onChange={(e) => updateRow(index, 'semesterClassCode', e.target.value)}
                      className="w-32 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={row.subExamCode}
                      onChange={(e) => updateRow(index, 'subExamCode', e.target.value)}
                      className="w-28 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={row.assessmentType}
                      onChange={(e) => updateRow(index, 'assessmentType', e.target.value)}
                      className="w-32 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={row.examinationCode}
                      onChange={(e) => updateRow(index, 'examinationCode', e.target.value)}
                      className="w-36 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={row.externalMark}
                      onChange={(e) => updateRow(index, 'externalMark', e.target.value)}
                      className="w-28 rounded border border-[#e3c7bd] px-2 py-1 outline-none focus:border-[#a3462d]"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
