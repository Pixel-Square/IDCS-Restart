import React, { useEffect, useMemo, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { DeptRow, fetchDeptRows, fetchElectives } from '../../services/curriculum';

type TeachingAssignmentLite = {
  id: number;
  subject_code?: string | null;
  subject_name?: string | null;
  section_name?: string | null;
  academic_year?: string | null;
  department?: { id?: number; code?: string | null; name?: string | null; short_name?: string | null } | null;
};

type InternalMarkRow = {
  teaching_assignment_id: number | null;
  section_id: number | null;
  course_code: string;
  course_name: string;
  regulation: string;
  semester: string;
  batch: string;
  academic_year: string;
  department: string;
  department_id: number | null;
  section: string;
  class_type: string;
  qp_type: string;
  source: 'teaching-assignment' | 'curriculum' | 'elective';
};

type CourseTeachingMapItem = {
  teaching_assignment_id?: number | null;
  section_id?: number | null;
  section_name?: string | null;
  class_type?: string | null;
  course_code?: string | null;
};

type InternalMarksFilters = {
  regulation: string;
  semester: string;
  batch: string;
  year: string;
  department: string;
  section: string;
};

const DEFAULT_FILTERS: InternalMarksFilters = {
  regulation: 'all',
  semester: 'all',
  batch: 'all',
  year: 'all',
  department: 'all',
  section: 'all',
};

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function splitSubjectLabel(value: unknown): { code: string; name: string } {
  const label = normalizeText(value);
  if (!label) return { code: '', name: '' };
  const parts = label.split(' - ');
  if (parts.length <= 1) return { code: label, name: label };
  const code = normalizeText(parts.shift());
  const name = normalizeText(parts.join(' - '));
  return { code, name };
}

function extractCourseCode(ta: any): string {
  const fromElectiveParent = normalizeText(ta?.elective_subject_details?.parent_course_code);
  if (fromElectiveParent) return fromElectiveParent.toUpperCase();

  const fromSubjectCode = normalizeText(ta?.subject_code);
  if (fromSubjectCode) return fromSubjectCode.toUpperCase();

  const fromCurriculum = normalizeText(ta?.curriculum_row_details?.course_code);
  if (fromCurriculum) return fromCurriculum.toUpperCase();

  const fromElective = normalizeText(ta?.elective_subject_details?.course_code);
  if (fromElective) return fromElective.toUpperCase();

  const parsed = splitSubjectLabel(ta?.subject);
  if (parsed.code) return parsed.code.toUpperCase();

  return '';
}

function extractCourseName(ta: any): string {
  const fromElectiveParent = normalizeText(ta?.elective_subject_details?.parent_course_name);
  if (fromElectiveParent) return fromElectiveParent;

  const fromSubjectName = normalizeText(ta?.subject_name);
  if (fromSubjectName) return fromSubjectName;

  const fromCurriculum = normalizeText(ta?.curriculum_row_details?.course_name);
  if (fromCurriculum) return fromCurriculum;

  const fromElective = normalizeText(ta?.elective_subject_details?.course_name);
  if (fromElective) return fromElective;

  const parsed = splitSubjectLabel(ta?.subject);
  if (parsed.name) return parsed.name;

  return '';
}

function extractDepartment(ta: any, pick: any, electivePick?: any): string {
  const fromTa =
    normalizeText(ta?.department?.short_name) ||
    normalizeText(ta?.department?.code) ||
    normalizeText(ta?.department?.name);
  if (fromTa) return fromTa;

  const fromSection =
    normalizeText(ta?.section_details?.department?.short_name) ||
    normalizeText(ta?.section_details?.department?.code) ||
    normalizeText(ta?.section_details?.department?.name);
  if (fromSection) return fromSection;

  const fromCurriculum =
    normalizeText(pick?.department?.short_name) ||
    normalizeText(pick?.department?.code) ||
    normalizeText(pick?.department?.name);
  if (fromCurriculum) return fromCurriculum;

  const fromElectivePick =
    normalizeText(electivePick?.department?.short_name) ||
    normalizeText(electivePick?.department?.code) ||
    normalizeText(electivePick?.department?.name);
  if (fromElectivePick) return fromElectivePick;

  return 'N/A';
}

function extractAcademicYear(ta: any): string {
  const ay = normalizeText(ta?.academic_year);
  if (ay) return ay;
  return 'N/A';
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normUpper(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function normNumText(value: unknown): string {
  const n = Number(value);
  if (Number.isFinite(n)) return String(n);
  return normalizeText(value);
}

function canonReg(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function canonText(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function canonSemester(value: unknown): string {
  const raw = normalizeText(value);
  const m = raw.match(/\d+/);
  if (m) return String(Number(m[0]));
  return canonText(raw);
}

function studyYearFromSemester(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.ceil(n / 2));
}

function splitIntoChunks<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

export default function AcademicControllerInternalMarksPage(): JSX.Element {
  const [rows, setRows] = useState<InternalMarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingTaId, setDownloadingTaId] = useState<number | null>(null);

  const [regulationFilter, setRegulationFilter] = useState(DEFAULT_FILTERS.regulation);
  const [semesterFilter, setSemesterFilter] = useState(DEFAULT_FILTERS.semester);
  const [batchFilter, setBatchFilter] = useState(DEFAULT_FILTERS.batch);
  const [yearFilter, setYearFilter] = useState(DEFAULT_FILTERS.year);
  const [departmentFilter, setDepartmentFilter] = useState(DEFAULT_FILTERS.department);
  const [sectionFilter, setSectionFilter] = useState(DEFAULT_FILTERS.section);
  const [appliedFilters, setAppliedFilters] = useState<InternalMarksFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    let mounted = true;

    async function hydrateMissingAllSectionAssignments(items: InternalMarkRow[]): Promise<InternalMarkRow[]> {
      const needsLookup = items.filter(
        (r) => !r.teaching_assignment_id && canonText(r.section) === canonText('All Sections') && !!r.course_code
      );
      if (!needsLookup.length) return items;

      const uniqueCodes = Array.from(new Set(needsLookup.map((r) => normUpper(r.course_code)).filter(Boolean)));
      const byCode = new Map<string, CourseTeachingMapItem[]>();

      await Promise.all(
        uniqueCodes.map(async (code) => {
          try {
            const res = await fetchWithAuth(`/api/academics/iqac/course-teaching/${encodeURIComponent(code)}/`);
            if (!res.ok) return;
            const data = await res.json();
            const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
            byCode.set(code, results as CourseTeachingMapItem[]);
          } catch {
            // Keep existing row as Not Assigned if fallback lookup fails.
          }
        })
      );

      return items.map((row) => {
        if (row.teaching_assignment_id || canonText(row.section) !== canonText('All Sections')) return row;
        const options = byCode.get(normUpper(row.course_code)) || [];
        if (!options.length) return row;

        // Prefer sectionless TAs; fall back to any TA (e.g. project courses that always have sections)
        const sectionless = options.filter((o) => !o?.section_id);
        const candidates = sectionless.length ? sectionless : options;

        const wantedClass = canonText(row.class_type);
        const picked =
          candidates.find((o) => wantedClass && canonText(o?.class_type) === wantedClass) ||
          candidates[0];
        const taId = Number((picked as any)?.teaching_assignment_id || 0);
        if (!Number.isFinite(taId) || taId <= 0) return row;

        return {
          ...row,
          teaching_assignment_id: taId,
          section_id: Number((picked as any)?.section_id) || null,
          section: normalizeText((picked as any)?.section_name) || row.section || 'All Sections',
          source: 'teaching-assignment',
        };
      });
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [taRes, deptRows] = await Promise.all([
          fetchWithAuth('/api/academics/teaching-assignments/?page_size=0'),
          fetchDeptRows(),
        ]);
        const electives = await fetchElectives();

        if (!taRes.ok) throw new Error('Failed to load teaching assignments');
        const taJson = await taRes.json();
        const taList: TeachingAssignmentLite[] = Array.isArray(taJson)
          ? taJson
          : Array.isArray((taJson as any)?.results)
          ? (taJson as any).results
          : [];

        const byCourse = new Map<string, DeptRow[]>();
        for (const row of Array.isArray(deptRows) ? deptRows : []) {
          const code = normalizeText((row as any)?.course_code).toUpperCase();
          if (!code) continue;
          const curr = byCourse.get(code) || [];
          curr.push(row);
          byCourse.set(code, curr);
        }

        const electiveByCode = new Map<string, any[]>();
        for (const e of Array.isArray(electives) ? electives : []) {
          const code = normalizeText((e as any)?.course_code).toUpperCase();
          if (!code) continue;
          const curr = electiveByCode.get(code) || [];
          curr.push(e);
          electiveByCode.set(code, curr);
        }

        const pickBestCourseRow = (ta: any, rowsForCode: DeptRow[]): DeptRow | undefined => {
          if (!rowsForCode.length) return undefined;

          const taSem = normNumText((ta as any)?.section_details?.semester);
          const taBatch = normUpper((ta as any)?.section_details?.batch);
          const taDeptId = Number((ta as any)?.section_details?.department?.id || 0);

          const scored = rowsForCode.map((r) => {
            let score = 0;
            const sem = normNumText((r as any)?.semester);
            const batch = normUpper((r as any)?.batch?.name || (r as any)?.batch);
            const deptId = Number((r as any)?.department?.id || 0);
            if (taSem && sem && taSem === sem) score += 5;
            if (taBatch && batch && taBatch === batch) score += 3;
            if (taDeptId && deptId && taDeptId === deptId) score += 4;
            return { r, score };
          });

          scored.sort((a, b) => b.score - a.score);
          return scored[0]?.r || rowsForCode[0];
        };

        const next: InternalMarkRow[] = [];
        for (const ta of taList) {
          const courseCode = extractCourseCode(ta as any);
          if (!courseCode) continue;

          const courseRows = byCourse.get(courseCode) || [];
          const pick = pickBestCourseRow(ta as any, courseRows);
          const electiveOptions = electiveByCode.get(courseCode) || [];
          const electivePick = electiveOptions[0];

          const sectionDetails = (ta as any)?.section_details;
          const electiveDetails = (ta as any)?.elective_subject_details;
          const pickBatch = normalizeText((pick as any)?.batch?.name || (pick as any)?.batch);
          const electiveBatch = normalizeText((electivePick as any)?.batch?.name || (electivePick as any)?.batch);
          const electiveSemester = normalizeText((electivePick as any)?.semester?.number || (electivePick as any)?.semester);

          const regulation = normalizeText((pick as any)?.regulation) || normalizeText((electivePick as any)?.regulation) || 'N/A';
          const semester = normalizeText(sectionDetails?.semester) || normalizeText((pick as any)?.semester) || electiveSemester || 'N/A';
          const batch = normalizeText(sectionDetails?.batch) || pickBatch || electiveBatch || 'N/A';
          const yearFromSem = studyYearFromSemester(semester);
          const year = yearFromSem || extractAcademicYear(ta as any);

          const deptFromSection = sectionDetails?.department;
          const deptFromPick = (pick as any)?.department;
          const departmentIdRaw =
            (deptFromSection as any)?.id ||
            (electiveDetails as any)?.department_id ||
            (electivePick as any)?.department?.id ||
            (deptFromPick as any)?.id ||
            null;
          const departmentId = Number(departmentIdRaw);
          const department = extractDepartment(ta as any, pick as any, electivePick as any);
          const section = normalizeText((ta as any)?.section_name) || normalizeText(sectionDetails?.name) || 'All Sections';
          const courseName = extractCourseName(ta as any) || 'Untitled Course';
          const classType = normalizeText((pick as any)?.class_type) || normalizeText((electivePick as any)?.class_type) || 'N/A';
          const qpType =
            normalizeText((pick as any)?.question_paper_type) ||
            normalizeText((pick as any)?.qp_type) ||
            normalizeText((electivePick as any)?.question_paper_type) ||
            normalizeText((electivePick as any)?.qp_type) ||
            // Fallback: check the teaching assignment API response itself
            normalizeText((ta as any)?.question_paper_type) ||
            normalizeText((ta as any)?.elective_subject_details?.question_paper_type) ||
            normalizeText((ta as any)?.curriculum_row_details?.question_paper_type) ||
            // Default to QP1 (matching OBE page behavior) instead of N/A
            'QP1';

          next.push({
            teaching_assignment_id: Number((ta as any)?.id),
            section_id: Number((ta as any)?.section_details?.id) || null,
            course_code: courseCode,
            course_name: courseName,
            regulation,
            semester,
            batch,
            academic_year: year,
            department,
            department_id: Number.isFinite(departmentId) ? departmentId : null,
            section,
            class_type: classType,
            qp_type: qpType,
            source: 'teaching-assignment',
          });
        }

        const existingKey = new Set(
          next.map((r) => `${normUpper(r.course_code)}|${normUpper(r.regulation)}|${normNumText(r.semester)}|${normUpper(r.batch)}|${r.department_id || 0}`)
        );
        // Batch/regulation-agnostic set: any TA already covering code+sem+dept
        // prevents curriculum/elective fallback rows from creating duplicates
        const existingCourseSemDept = new Set(
          next.map((r) => `${normUpper(r.course_code)}|${normNumText(r.semester)}|${r.department_id || 0}`)
        );

        for (const row of Array.isArray(deptRows) ? deptRows : []) {
          const courseCode = normalizeText((row as any)?.course_code).toUpperCase();
          if (!courseCode) continue;
          const regulation = normalizeText((row as any)?.regulation) || 'N/A';
          const semester = normalizeText((row as any)?.semester) || 'N/A';
          const batch = normalizeText((row as any)?.batch?.name || (row as any)?.batch) || 'N/A';
          const department =
            normalizeText((row as any)?.department?.short_name) ||
            normalizeText((row as any)?.department?.code) ||
            normalizeText((row as any)?.department?.name) ||
            'N/A';
          const departmentId = Number((row as any)?.department?.id || 0);
          const courseKey = `${normUpper(courseCode)}|${normNumText(semester)}|${departmentId || 0}`;
          if (existingCourseSemDept.has(courseKey)) continue;

          const classType = normalizeText((row as any)?.class_type) || 'N/A';
          const qpType = normalizeText((row as any)?.question_paper_type) || normalizeText((row as any)?.qp_type) || 'QP1';

          next.push({
            teaching_assignment_id: null,
            section_id: null,
            course_code: courseCode,
            course_name: normalizeText((row as any)?.course_name) || 'Untitled Course',
            regulation,
            semester,
            batch,
            academic_year: studyYearFromSemester(semester) || 'N/A',
            department,
            department_id: departmentId || null,
            section: 'All Sections',
            class_type: classType,
            qp_type: qpType,
            source: 'curriculum',
          });
          existingCourseSemDept.add(courseKey);
        }

        for (const e of Array.isArray(electives) ? electives : []) {
          const courseCode = normalizeText((e as any)?.course_code).toUpperCase();
          if (!courseCode) continue;
          const regulation = normalizeText((e as any)?.regulation) || 'N/A';
          const semester = normalizeText((e as any)?.semester?.number || (e as any)?.semester) || 'N/A';
          const batch = normalizeText((e as any)?.batch?.name || (e as any)?.batch) || 'N/A';
          const department =
            normalizeText((e as any)?.department?.short_name) ||
            normalizeText((e as any)?.department?.code) ||
            normalizeText((e as any)?.department?.name) ||
            'N/A';
          const departmentId = Number((e as any)?.department?.id || 0);
          const courseKey = `${normUpper(courseCode)}|${normNumText(semester)}|${departmentId || 0}`;
          if (existingCourseSemDept.has(courseKey)) continue;

          next.push({
            teaching_assignment_id: null,
            section_id: null,
            course_code: courseCode,
            course_name: normalizeText((e as any)?.course_name) || 'Untitled Course',
            regulation,
            semester,
            batch,
            academic_year: studyYearFromSemester(semester) || 'N/A',
            department,
            department_id: departmentId || null,
            section: 'All Sections',
            class_type: normalizeText((e as any)?.class_type) || 'N/A',
            qp_type: normalizeText((e as any)?.question_paper_type) || normalizeText((e as any)?.qp_type) || 'QP1',
            source: 'elective',
          });
          existingCourseSemDept.add(courseKey);
        }

        const finalRows = await hydrateMissingAllSectionAssignments(next);

        finalRows.sort((a, b) => {
          const byCode = a.course_code.localeCompare(b.course_code);
          if (byCode !== 0) return byCode;
          const byYear = a.academic_year.localeCompare(b.academic_year);
          if (byYear !== 0) return byYear;
          return a.section.localeCompare(b.section);
        });

        if (!mounted) return;
        setRows(finalRows);
      } catch (e: any) {
        if (!mounted) return;
        setRows([]);
        setError(e?.message || 'Failed to load internal marks data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const regulations = useMemo(() => uniqueSorted(rows.map((r) => r.regulation)), [rows]);
  const semesters = useMemo(
    () => uniqueSorted(rows.filter((r) => regulationFilter === 'all' || canonReg(r.regulation) === canonReg(regulationFilter)).map((r) => r.semester)),
    [rows, regulationFilter]
  );
  const batches = useMemo(
    () =>
      uniqueSorted(
        rows
          .filter((r) => (regulationFilter === 'all' || canonReg(r.regulation) === canonReg(regulationFilter)) && (semesterFilter === 'all' || canonSemester(r.semester) === canonSemester(semesterFilter)))
          .map((r) => r.batch)
      ),
    [rows, regulationFilter, semesterFilter]
  );
  const years = useMemo(
    () =>
      uniqueSorted(
        rows
          .filter(
            (r) =>
              (regulationFilter === 'all' || canonReg(r.regulation) === canonReg(regulationFilter)) &&
              (semesterFilter === 'all' || canonSemester(r.semester) === canonSemester(semesterFilter)) &&
              (batchFilter === 'all' || canonText(r.batch) === canonText(batchFilter))
          )
          .map((r) => r.academic_year)
      ),
    [rows, regulationFilter, semesterFilter, batchFilter]
  );
  const departments = useMemo(
    () =>
      uniqueSorted(
        rows
          .filter(
            (r) =>
              (regulationFilter === 'all' || canonReg(r.regulation) === canonReg(regulationFilter)) &&
              (semesterFilter === 'all' || canonSemester(r.semester) === canonSemester(semesterFilter)) &&
              (batchFilter === 'all' || canonText(r.batch) === canonText(batchFilter)) &&
              (yearFilter === 'all' || canonSemester(r.academic_year) === canonSemester(yearFilter))
          )
          .map((r) => r.department)
      ),
    [rows, regulationFilter, semesterFilter, batchFilter, yearFilter]
  );
  const sections = useMemo(
    () =>
      uniqueSorted(
        rows
          .filter(
            (r) =>
              (regulationFilter === 'all' || canonReg(r.regulation) === canonReg(regulationFilter)) &&
              (semesterFilter === 'all' || canonSemester(r.semester) === canonSemester(semesterFilter)) &&
              (batchFilter === 'all' || canonText(r.batch) === canonText(batchFilter)) &&
              (yearFilter === 'all' || canonSemester(r.academic_year) === canonSemester(yearFilter)) &&
              (departmentFilter === 'all' || canonText(r.department) === canonText(departmentFilter))
          )
          .map((r) => r.section)
      ),
    [rows, regulationFilter, semesterFilter, batchFilter, yearFilter, departmentFilter]
  );

  const filteredRows = useMemo(() => {
    const fReg = canonReg(appliedFilters.regulation);
    const fSem = canonSemester(appliedFilters.semester);
    const fBatch = canonText(appliedFilters.batch);
    const fYear = canonSemester(appliedFilters.year);
    const fDept = canonText(appliedFilters.department);
    const fSection = canonText(appliedFilters.section);

    return rows.filter((r) => {
      if (appliedFilters.regulation !== 'all' && canonReg(r.regulation) !== fReg) return false;
      if (appliedFilters.semester !== 'all' && canonSemester(r.semester) !== fSem) return false;
      if (appliedFilters.batch !== 'all' && canonText(r.batch) !== fBatch) return false;
      if (appliedFilters.year !== 'all' && canonSemester(r.academic_year) !== fYear) return false;
      if (appliedFilters.department !== 'all' && canonText(r.department) !== fDept) return false;
      if (appliedFilters.section !== 'all' && canonText(r.section) !== fSection) return false;
      return true;
    });
  }, [rows, appliedFilters]);

  const exportableRows = useMemo(
    () =>
      filteredRows.filter((r) => {
        const taId = Number(r.teaching_assignment_id);
        return Number.isFinite(taId) && taId > 0;
      }),
    [filteredRows]
  );

  useEffect(() => {
    setSemesterFilter((prev) => (prev === 'all' || semesters.some((s) => canonSemester(s) === canonSemester(prev)) ? prev : 'all'));
  }, [semesters]);

  useEffect(() => {
    setBatchFilter((prev) => (prev === 'all' || batches.some((b) => canonText(b) === canonText(prev)) ? prev : 'all'));
  }, [batches]);

  useEffect(() => {
    setYearFilter((prev) => (prev === 'all' || years.some((y) => canonSemester(y) === canonSemester(prev)) ? prev : 'all'));
  }, [years]);

  useEffect(() => {
    setDepartmentFilter((prev) => (prev === 'all' || departments.some((d) => canonText(d) === canonText(prev)) ? prev : 'all'));
  }, [departments]);

  useEffect(() => {
    setSectionFilter((prev) => (prev === 'all' || sections.some((s) => canonText(s) === canonText(prev)) ? prev : 'all'));
  }, [sections]);

  const hasPendingFilterChanges = useMemo(
    () =>
      regulationFilter !== appliedFilters.regulation ||
      semesterFilter !== appliedFilters.semester ||
      batchFilter !== appliedFilters.batch ||
      yearFilter !== appliedFilters.year ||
      departmentFilter !== appliedFilters.department ||
      sectionFilter !== appliedFilters.section,
    [regulationFilter, semesterFilter, batchFilter, yearFilter, departmentFilter, sectionFilter, appliedFilters]
  );

  function handleApplyFilters() {
    setAppliedFilters({
      regulation: regulationFilter,
      semester: semesterFilter,
      batch: batchFilter,
      year: yearFilter,
      department: departmentFilter,
      section: sectionFilter,
    });
  }

  function handleShowAll() {
    setRegulationFilter(DEFAULT_FILTERS.regulation);
    setSemesterFilter(DEFAULT_FILTERS.semester);
    setBatchFilter(DEFAULT_FILTERS.batch);
    setYearFilter(DEFAULT_FILTERS.year);
    setDepartmentFilter(DEFAULT_FILTERS.department);
    setSectionFilter(DEFAULT_FILTERS.section);
    setAppliedFilters(DEFAULT_FILTERS);
    setError(null);
  }

  async function handleDownloadFilteredZip() {
    try {
      setDownloading(true);
      setError(null);

      const baseParams = new URLSearchParams();
      if (appliedFilters.regulation !== 'all') baseParams.set('regulation', appliedFilters.regulation);
      if (appliedFilters.semester !== 'all') baseParams.set('semester', appliedFilters.semester);
      if (appliedFilters.batch !== 'all') baseParams.set('batch', appliedFilters.batch);
      if (appliedFilters.year !== 'all') baseParams.set('academic_year', appliedFilters.year);
      if (appliedFilters.department !== 'all') {
        const pick = exportableRows.find((r) => canonText(r.department) === canonText(appliedFilters.department) && r.department_id != null);
        if (pick?.department_id != null) baseParams.set('department_id', String(pick.department_id));
      }
      if (appliedFilters.section !== 'all') {
        const pick = exportableRows.find((r) => canonText(r.section) === canonText(appliedFilters.section) && r.section_id != null);
        if (pick?.section_id != null) baseParams.set('section_id', String(pick.section_id));
      }

      const taIds = exportableRows
        .map((r) => Number(r.teaching_assignment_id))
        .filter((id) => Number.isFinite(id) && id > 0);

      const uniqueTaIds = Array.from(new Set(taIds));

      const triggerDownload = (blob: Blob, fileName: string) => {
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
      };

      const fetchExport = async (ids: number[]) => {
        const params = new URLSearchParams(baseParams);
        if (ids.length) {
          params.set('ta_ids', ids.join(','));
        }
        const url = `/api/academics/iqac/internal-marks/export/${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetchWithAuth(url);
        if (!res.ok) {
          let text = '';
          try {
            text = await res.text();
            if (text.includes('<html') || text.includes('<!doctype') || text.includes('<!DOCTYPE')) {
              const match = text.match(/<title>(.*?)<\/title>/i);
              text = match ? match[1] : `Server Error (${res.status})`;
            }
          } catch {
            text = `Server Error (${res.status})`;
          }
          throw new Error(text || 'Failed to download ZIP export');
        }
        return res.blob();
      };

      const blob = await fetchExport(uniqueTaIds);
      triggerDownload(blob, `internal_marks_${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e: any) {
      setError(e?.message || 'Failed to download ZIP export');
    } finally {
      setDownloading(false);
    }
  }

  function safeFilenamePart(value: string): string {
    const cleaned = String(value || '').trim().replace(/[\\/:*?"<>|]/g, '_');
    return cleaned || 'internal_marks';
  }

  async function handleDownloadCourseExcel(row: InternalMarkRow) {
    const taId = Number(row.teaching_assignment_id);
    if (!Number.isFinite(taId) || taId <= 0) return;

    try {
      setDownloadingTaId(taId);
      setError(null);

      const res = await fetchWithAuth(`/api/academics/iqac/internal-marks/course-export/?ta_id=${encodeURIComponent(String(taId))}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to download course internal marks');
      }

      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${safeFilenamePart(row.course_code)} ${safeFilenamePart(row.course_name)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e: any) {
      setError(e?.message || 'Failed to download course internal marks');
    } finally {
      setDownloadingTaId(null);
    }
  }

  if (loading) return <div style={{ color: '#6b7280' }}>Loading internal marks data...</div>;
  if (error) return <div style={{ color: '#b91c1c' }}>{error}</div>;

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Internal marks</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Filter like Department Curriculum and download all selected course internal marks as ZIP.</div>
        </div>
        <button className="obe-btn obe-btn-primary" onClick={handleDownloadFilteredZip} disabled={downloading || exportableRows.length === 0}>
          {downloading ? 'Preparing ZIP...' : `Download Detailed Internal Marks ZIP (${exportableRows.length})`}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Regulation</div>
          <select
            value={regulationFilter}
            onChange={(e) => {
              setRegulationFilter(e.target.value);
              setSemesterFilter('all');
              setBatchFilter('all');
              setYearFilter('all');
              setDepartmentFilter('all');
              setSectionFilter('all');
            }}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
          >
            <option value="all">All Regulations</option>
            {regulations.map((reg) => (
              <option key={reg} value={reg}>{reg}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Semester</div>
          <select
            value={semesterFilter}
            onChange={(e) => {
              setSemesterFilter(e.target.value);
              setBatchFilter('all');
              setYearFilter('all');
              setDepartmentFilter('all');
              setSectionFilter('all');
            }}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
          >
            <option value="all">All Semesters</option>
            {semesters.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Batch</div>
          <select
            value={batchFilter}
            onChange={(e) => {
              setBatchFilter(e.target.value);
              setYearFilter('all');
              setDepartmentFilter('all');
              setSectionFilter('all');
            }}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
          >
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Year</div>
          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setDepartmentFilter('all');
              setSectionFilter('all');
            }}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
          >
            <option value="all">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Department</div>
          <select
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setSectionFilter('all');
            }}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Section</div>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}
          >
            <option value="all">All Sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="obe-btn obe-btn-primary" onClick={handleApplyFilters} disabled={!hasPendingFilterChanges}>
          Filter
        </button>
        <button className="obe-btn" onClick={handleShowAll}>
          Show all
        </button>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Showing {filteredRows.length} of {rows.length} courses
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No records found for selected filters.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>Course</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>Regulation</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>Semester</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>Batch</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>Year</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>Department</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>Class Type</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>QP Type</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>Section</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={`${r.teaching_assignment_id}-${r.course_code}-${r.regulation}-${r.semester}-${r.department_id || 0}-${r.section}`}>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ fontWeight: 800, color: '#111827' }}>{r.course_code}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{r.course_name}</div>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.regulation}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.semester}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.batch}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.academic_year}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.department}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.class_type}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.qp_type}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.section}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                    {r.teaching_assignment_id ? (
                      <button
                        className="obe-btn obe-btn-primary"
                        onClick={() => handleDownloadCourseExcel(r)}
                        disabled={downloadingTaId === r.teaching_assignment_id}
                      >
                        {downloadingTaId === r.teaching_assignment_id ? 'Preparing...' : 'Download'}
                      </button>
                    ) : (
                      <button className="obe-btn" disabled title="No teaching assignment/section yet for this course">
                        Not Assigned
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
