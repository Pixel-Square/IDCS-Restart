import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CoeFilterOptions, CoeStudentsMapResponse, fetchCoeFilterOptions, fetchCoeStudentsMap } from '../../services/coe';
import fetchWithAuth from '../../services/fetchAuth';
import { Users, Check, Building2, Search, Sparkles, FileSpreadsheet, FileText, ArrowLeft, Plus, Trash2, Calendar, BookOpen, Layers } from 'lucide-react';
import StudentGroupModal from './StudentGroupModal';
import { kvHydrate, kvLoad, kvRemove, kvSave } from '../../utils/coeKvStore';

type SeatingPattern = 'Straight' | 'Zigzag' | 'Alternate Zigzag' | 'U-Shape' | 'Circle' | 'Clustered' | 'Mixed';

type HallAllocationRow = {
  id: number;
  hallNumber: string;
  maxCapacity: number;
  rows: number;
  cols: number;
  pattern: SeatingPattern;
  notes: string;
};

type PlanEntry = {
  hallNumber: string;
  department: string;
  semester: string;
  session: 'FN' | 'AN';
  courseCode?: string;
  courseName?: string;
  conflictReason?: string;
};

type AllocationBlock = {
  department: string;
  semester: string;
  session: 'FN' | 'AN';
  courseCode?: string;
  courseName?: string;
  blockKey: string;
  classKey: string;
  isGeaOnly: boolean;
};

const DEFAULT_SESSION_OPTIONS: Array<'FN' | 'AN'> = ['FN', 'AN'];
const COMMON_CODE_PREFIX = 'GEA';
const HALL_ALLOCATION_DATA_KEY = 'coe-hall-allocation-data';
const HALL_ALLOCATION_PLAN_KEY = 'coe-hall-allocation-plan';
const HALL_ALLOCATION_FINALIZED_KEY = 'coe-hall-allocation-finalized';
const HALL_ALLOCATION_PLAN_STATE_KEY = 'coe-hall-allocation-plan-state';
const HALL_ALLOCATION_LOGS_KEY = 'coe-hall-allocation-plans-log';
const STUDENT_GROUPS_KEY = 'coe-student-groups-v1';

export type StudentGroup = {
  name: string;
  regNos: string[];
  dept?: string;
  sem?: string;
};

type SelectionStudentItem = {
  reg_no: string;
  name: string;
  course_code?: string;
  course_name?: string;
  section?: string;
  department?: string;
  is_arrear?: boolean;
};


export interface HallAllocationPlanLog {
  id: string;
  savedAt: string;
  examTitle: string;
  semesterText: string;
  examDate: string;
  session: 'FN' | 'AN';
  departments: string[];
  courses?: string[];
  totalHalls: number;
  totalStudents: number;
  isFirstYearMode?: boolean;
  rows: HallAllocationRow[];
  configuration: Array<{ department: string; semester: string; session: 'FN' | 'AN'; courseCode?: string; courseName?: string }>;
  studentSelectionMap: Record<string, string[]>;
  plan: PlanEntry[];
  optimizedHallsData?: any[] | null;
}

function readSavedPlanLogs(): HallAllocationPlanLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HALL_ALLOCATION_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

interface SavedPlanWorkingState {
  rows?: HallAllocationRow[];
  configuration?: Array<{ department: string; semester: string; session: 'FN' | 'AN'; courseCode?: string; courseName?: string }>;
  studentSelectionMap?: Record<string, string[]>;
  examTitle?: string;
  semesterText?: string;
  examDate?: string;
  plan?: PlanEntry[];
  optimizedHallsData?: any[];
  selectedDepartment?: string;
  selectedSemester?: string;
  selectedSession?: 'FN' | 'AN';
  selectedCourseCode?: string;
  isFirstYearMode?: boolean;
}

function readSavedWorkingState(): SavedPlanWorkingState | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawWorking = window.localStorage.getItem(HALL_ALLOCATION_PLAN_STATE_KEY);
    if (rawWorking) {
      const parsed = JSON.parse(rawWorking);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  try {
    const rawPlan = window.localStorage.getItem(HALL_ALLOCATION_PLAN_KEY);
    if (rawPlan) {
      const parsed = JSON.parse(rawPlan);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return null;
}

function readSavedHallRows(): HallAllocationRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const working = readSavedWorkingState();
    if (working?.rows && Array.isArray(working.rows) && working.rows.length > 0) {
      return working.rows;
    }
    const rawHallData = window.localStorage.getItem(HALL_ALLOCATION_DATA_KEY);
    if (rawHallData) {
      const parsed = JSON.parse(rawHallData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return [];
}

function normalizeCourseCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function normDept(d: string): string {
  const u = String(d || '').trim().toUpperCase();
  if (u === 'CIVIL' || u === 'CE' || u.includes('CIVIL')) return 'CE';
  if (u === 'MECH' || u === 'ME' || u.includes('MECHANICAL')) return 'ME';
  if (u === 'AIDS' || u === 'AI&DS' || u === 'AI & DS' || u === 'AI AND DS' || u.includes('DATA SCIENCE')) return 'AIDS';
  if (u === 'AIML' || u === 'AI&ML' || u === 'AI & ML' || u === 'AI AND ML' || u.includes('MACHINE LEARNING')) return 'AIML';
  if (u === 'CSE' || u.includes('COMPUTER SCIENCE')) return 'CSE';
  if (u === 'ECE' || (u.includes('ELECTRONICS') && u.includes('COMMUNICATION'))) return 'ECE';
  if (u === 'EEE' || (u.includes('ELECTRICAL') && u.includes('ELECTRONICS'))) return 'EEE';
  if (u === 'IT' || u.includes('INFORMATION TECHNOLOGY')) return 'IT';
  return u;
}

function getClassKey(department: string, semester: string, courseCode?: string): string {
  const dept = String(department || '').trim().toUpperCase();
  const sem = String(semester || '').trim().toUpperCase();
  const code = String(courseCode || '').trim().toUpperCase();
  return code ? `${dept}::${sem}::${code}` : `${dept}::${sem}`;
}

function getBlockKey(department: string, semester: string, session: 'FN' | 'AN', courseCode?: string): string {
  const dept = String(department || '').trim().toUpperCase();
  const sem = String(semester || '').trim().toUpperCase();
  const sess = String(session || '').trim().toUpperCase();
  const code = String(courseCode || '').trim().toUpperCase();
  return code
    ? `${dept}::${sem}::${code}::${sess}`
    : `${dept}::${sem}::${sess}`;
}

function isBlockGaeaOnly(response: CoeStudentsMapResponse | null): boolean {
  if (!response) return false;
  const allCourseCodes = response.departments.flatMap((dept) => dept.courses.map((course) => normalizeCourseCode(course.course_code)));
  if (allCourseCodes.length === 0) return false;
  return allCourseCodes.every((code) => code.startsWith(COMMON_CODE_PREFIX));
}

function buildHallPlan(rows: HallAllocationRow[], blocks: AllocationBlock[]): PlanEntry[] {
  const sortedRows = [...rows].sort((a, b) => b.maxCapacity - a.maxCapacity || a.hallNumber.localeCompare(b.hallNumber));
  const plan: PlanEntry[] = [];

  let previousClassKey: string | null = null;

  sortedRows.forEach((row, rowIndex) => {
    const availableBlocks = blocks.filter((block) => block.classKey !== previousClassKey);
    const chosenBlock = availableBlocks.length > 0
      ? availableBlocks[rowIndex % availableBlocks.length]
      : blocks[rowIndex % blocks.length];

    const conflictReason = chosenBlock.classKey === previousClassKey && !chosenBlock.isGeaOnly
      ? 'Same subject/dept repeated adjacently' : undefined;

    plan.push({
      hallNumber: row.hallNumber,
      department: chosenBlock.department,
      semester: chosenBlock.semester,
      session: chosenBlock.session,
      courseCode: chosenBlock.courseCode,
      courseName: chosenBlock.courseName,
      conflictReason,
    });

    previousClassKey = chosenBlock.classKey;
  });

  return plan;
}

export default function HallAllocationPlanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRows = (location.state as { rows?: HallAllocationRow[] } | undefined)?.rows;

  const [rows, setRows] = useState<HallAllocationRow[]>(() => {
    if (locationRows && locationRows.length > 0) return locationRows;
    return readSavedHallRows();
  });

  const savedWorking = useMemo(() => readSavedWorkingState(), []);

  const [departments, setDepartments] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>(['SEM1']);
  const [selectedDepartment, setSelectedDepartment] = useState(() => (savedWorking?.selectedDepartment && savedWorking.selectedDepartment !== 'ALL' ? savedWorking.selectedDepartment : ''));
  const [selectedSemester, setSelectedSemester] = useState(() => savedWorking?.selectedSemester || 'SEM1');
  const [selectedSession, setSelectedSession] = useState<'FN' | 'AN'>(() => savedWorking?.selectedSession || 'FN');
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<Array<{ department: string; semester: string; session: 'FN' | 'AN'; courseCode?: string; courseName?: string }>>(() => {
    return savedWorking?.configuration && Array.isArray(savedWorking.configuration) ? savedWorking.configuration : [];
  });
  const [courseOptions, setCourseOptions] = useState<Array<{ course_code: string; course_name: string; count: number; is_elective?: boolean }>>([]);
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>(() => savedWorking?.selectedCourseCode || 'ALL');
  const [plan, setPlan] = useState<PlanEntry[]>(() => {
    return savedWorking?.plan && Array.isArray(savedWorking.plan) ? savedWorking.plan : [];
  });
  const [studentSelectionMap, setStudentSelectionMap] = useState<Record<string, string[]>>(() => {
    return savedWorking?.studentSelectionMap && typeof savedWorking.studentSelectionMap === 'object' ? savedWorking.studentSelectionMap : {};
  });
  const [excelPreviewRows, setExcelPreviewRows] = useState<Array<Array<string | number>>>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectionBlockKey, setSelectionBlockKey] = useState<string | null>(null);
  const [selectionSearch, setSelectionSearch] = useState('');
  const [selectionStudents, setSelectionStudents] = useState<SelectionStudentItem[]>([]);
  const [savedStudentGroups, setSavedStudentGroups] = useState<StudentGroup[]>([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState<string>('1');
  const [rangeEnd, setRangeEnd] = useState<string>('30');
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [examTitle, setExamTitle] = useState(() => savedWorking?.examTitle || '');
  const [semesterText, setSemesterText] = useState(() => savedWorking?.semesterText || '');
  const [examDate, setExamDate] = useState(() => savedWorking?.examDate || '');
  const [planLogs, setPlanLogs] = useState<HallAllocationPlanLog[]>(() => readSavedPlanLogs());
  const [optimizedHallsData, setOptimizedHallsData] = useState<OptimizedHallData[] | null>(() => {
    if (savedWorking?.optimizedHallsData && Array.isArray(savedWorking.optimizedHallsData)) {
      return savedWorking.optimizedHallsData.map((h: any) => ({
        ...h,
        donorIndices: new Set(h.donorIndices || []),
        shiftedIndices: new Set(h.shiftedIndices || []),
      }));
    }
    return null;
  });

  const [generatedHallsData, setGeneratedHallsData] = useState<ExportHallData[] | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isFirstYearMode, setIsFirstYearMode] = useState<boolean>(() => savedWorking?.isFirstYearMode ?? false);

  // Load available courses for the selected department and semester
  useEffect(() => {
    if (!selectedDepartment || !selectedSemester) return;
    let active = true;
    (async () => {
      try {
        const response = await fetchCoeStudentsMap({ department: selectedDepartment, semester: selectedSemester });
        const courseBuckets = new Map<string, { course_code: string; course_name: string; regs: Set<string>; is_elective?: boolean }>();
        const targetSemNum = parseInt(selectedSemester.replace('SEM', ''), 10);
        const targetDeptNorm = normDept(selectedDepartment);
        for (const deptBlock of response.departments || []) {
          if (selectedDepartment !== 'ALL' && normDept(deptBlock.department) !== targetDeptNorm) {
            continue;
          }
          for (const course of deptBlock.courses || []) {
            if ((course as any).semester) {
              const cSemNum = parseInt(String((course as any).semester).replace('SEM', ''), 10);
              if (!isNaN(cSemNum) && !isNaN(targetSemNum) && cSemNum !== targetSemNum) {
                continue;
              }
            }
            const code = String(course.course_code || '').trim();
            const name = String(course.course_name || '').trim();
            const key = (code || name || '').trim().toUpperCase();
            if (!key) continue;

            if (!courseBuckets.has(key)) {
              courseBuckets.set(key, {
                course_code: code || name,
                course_name: name || code,
                regs: new Set<string>(),
                is_elective: Boolean((course as any).is_elective),
              });
            }

            const bucket = courseBuckets.get(key)!;
            if (!bucket.course_name && name) bucket.course_name = name;
            if (!bucket.course_code && code) bucket.course_code = code;
            if ((course as any).is_elective) bucket.is_elective = true;

            for (const student of (course.students || [])) {
              const reg = String((student as any)?.reg_no || '').trim().toUpperCase();
              if (reg) bucket.regs.add(reg);
            }
          }
        }

        const opts = Array.from(courseBuckets.values())
          .map((bucket) => ({
            course_code: bucket.course_code,
            course_name: bucket.course_name,
            count: bucket.regs.size,
            is_elective: bucket.is_elective,
          }))
          .sort((a, b) => `${a.course_code} ${a.course_name}`.localeCompare(`${b.course_code} ${b.course_name}`));

        if (!active) return;
        setCourseOptions(opts);
        if (selectedCourseCode !== 'ALL' && !opts.some((o) => o.course_code === selectedCourseCode || o.course_name === selectedCourseCode)) {
          setSelectedCourseCode('ALL');
        }
      } catch (err) {
        console.warn('Failed to load course options', err);
      }
    })();
    return () => { active = false; };
  }, [selectedDepartment, selectedSemester]);

  useEffect(() => {
    let effectiveRows = rows;
    if (!effectiveRows.length) {
      const fallbackRows = readSavedHallRows();
      if (fallbackRows.length > 0) {
        effectiveRows = fallbackRows;
        setRows(fallbackRows);
      } else {
        navigate('/coe/hall-allocation', { replace: true });
        return;
      }
    }

    let active = true;
    (async () => {
      try {
        const options: CoeFilterOptions = await fetchCoeFilterOptions();
        if (!active) return;
        const validDepts = (options.departments || []).filter((d) => d && d.trim().toUpperCase() !== 'ALL');
        setDepartments(validDepts);
        setSemesters(options.semesters);
        if (!savedWorking?.selectedDepartment || savedWorking.selectedDepartment === 'ALL') {
          setSelectedDepartment(validDepts[0] || '');
        }
        if (!savedWorking?.selectedSemester) {
          setSelectedSemester(options.semesters[0] || 'SEM1');
        }

        // Hydrate logs from backend KV store
        const remoteLogs = await kvHydrate(HALL_ALLOCATION_LOGS_KEY);
        if (active && remoteLogs && Array.isArray(remoteLogs)) {
          setPlanLogs(remoteLogs);
        }

        // Hydrate student groups from backend KV store
        const remoteGroups = await kvHydrate(STUDENT_GROUPS_KEY);
        if (active && remoteGroups && Array.isArray(remoteGroups.groups)) {
          setSavedStudentGroups(remoteGroups.groups);
        } else {
          try {
            const rawG = window.localStorage.getItem(STUDENT_GROUPS_KEY);
            if (rawG) {
              const parsedG = JSON.parse(rawG);
              if (parsedG && Array.isArray(parsedG.groups)) {
                setSavedStudentGroups(parsedG.groups);
              }
            }
          } catch {}
        }

        // Hydrate working state from backend KV store if available
        const hydrated = await kvHydrate(HALL_ALLOCATION_PLAN_STATE_KEY);
        if (active && hydrated && typeof hydrated === 'object') {
          if (Array.isArray(hydrated.rows) && hydrated.rows.length > 0) {
            setRows(hydrated.rows);
          }
          if (Array.isArray(hydrated.configuration) && hydrated.configuration.length > 0) {
            setConfiguration(hydrated.configuration);
          }
          if (hydrated.studentSelectionMap && Object.keys(hydrated.studentSelectionMap).length > 0) {
            setStudentSelectionMap(hydrated.studentSelectionMap);
          }
          if (hydrated.examTitle) setExamTitle(hydrated.examTitle);
          if (hydrated.semesterText) setSemesterText(hydrated.semesterText);
          if (hydrated.examDate) setExamDate(hydrated.examDate);
          if (Array.isArray(hydrated.plan) && hydrated.plan.length > 0) {
            setPlan(hydrated.plan);
          }
          if (Array.isArray(hydrated.optimizedHallsData) && hydrated.optimizedHallsData.length > 0) {
            setOptimizedHallsData(
              hydrated.optimizedHallsData.map((h: any) => ({
                ...h,
                donorIndices: new Set<number>(h.donorIndices || []),
                shiftedIndices: new Set<number>(h.shiftedIndices || []),
              }))
            );
          }
          if (typeof hydrated.isFirstYearMode === 'boolean') {
            setIsFirstYearMode(hydrated.isFirstYearMode);
          }
          if (hydrated.selectedDepartment) setSelectedDepartment(hydrated.selectedDepartment);
          if (hydrated.selectedSemester) setSelectedSemester(hydrated.selectedSemester);
          if (hydrated.selectedSession) setSelectedSession(hydrated.selectedSession);
          if (hydrated.selectedCourseCode) setSelectedCourseCode(hydrated.selectedCourseCode);
        }
      } catch (err) {
        console.warn('Failed to load filter options', err);
      }
    })();
    return () => { active = false; };
  }, [navigate, rows.length]);

  // Auto-load timetable if URL search params specify date and session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qDate = params.get('date');
    const qSess = params.get('session') as 'FN' | 'AN' | null;
    if (qDate) {
      setExamDate(qDate);
      if (qSess) setSelectedSession(qSess);
      handleLoadFromTimetable(qDate, qSess || 'FN');
    }
  }, []);

  // Auto-save working state whenever state changes
  useEffect(() => {
    if (rows.length === 0 && configuration.length === 0 && !examTitle && !semesterText && !examDate) {
      return;
    }
    const stateToSave = {
      rows,
      configuration,
      studentSelectionMap,
      examTitle,
      semesterText,
      examDate,
      plan,
      optimizedHallsData: optimizedHallsData?.map((h) => ({
        ...h,
        donorIndices: Array.from(h.donorIndices || []),
        shiftedIndices: Array.from(h.shiftedIndices || []),
      })) || null,
      selectedDepartment,
      selectedSemester,
      selectedSession,
      selectedCourseCode,
      isFirstYearMode,
      savedAt: new Date().toISOString(),
    };
    kvSave(HALL_ALLOCATION_PLAN_STATE_KEY, stateToSave);
  }, [
    rows,
    configuration,
    studentSelectionMap,
    examTitle,
    semesterText,
    examDate,
    plan,
    optimizedHallsData,
    selectedDepartment,
    selectedSemester,
    selectedSession,
    selectedCourseCode,
    isFirstYearMode,
  ]);

  // Proactively fetch student list for any configured blocks missing from studentSelectionMap
  useEffect(() => {
    if (configuration.length === 0) return;
    configuration.forEach((item) => {
      const blockKey = getBlockKey(item.department, item.semester, item.session, item.courseCode);
      if (!studentSelectionMap[blockKey] || studentSelectionMap[blockKey].length === 0) {
        loadStudentSelectionForBlock(item.department, item.semester, item.session, item.courseCode, item.courseName);
      }
    });
  }, [configuration]);

  const hasRows = rows.length > 0;

  const handleAddConfiguration = () => {
    if (!selectedDepartment || !selectedSemester) return;

    if (selectedCourseCode === 'ALL') {
      if (courseOptions.length > 0) {
        courseOptions.forEach((opt) => {
          const blockKey = getBlockKey(selectedDepartment, selectedSemester, selectedSession, opt.course_code);
          setConfiguration((current) => {
            if (current.some((item) => getBlockKey(item.department, item.semester, item.session, item.courseCode) === blockKey)) {
              return current;
            }
            return [
              ...current,
              {
                department: selectedDepartment,
                semester: selectedSemester,
                session: selectedSession,
                courseCode: opt.course_code,
                courseName: opt.course_name,
              },
            ];
          });
          loadStudentSelectionForBlock(selectedDepartment, selectedSemester, selectedSession, opt.course_code, opt.course_name);
        });
      } else {
        const blockKey = getBlockKey(selectedDepartment, selectedSemester, selectedSession);
        setConfiguration((current) => {
          if (current.some((item) => getBlockKey(item.department, item.semester, item.session, item.courseCode) === blockKey)) {
            return current;
          }
          return [...current, { department: selectedDepartment, semester: selectedSemester, session: selectedSession }];
        });
        loadStudentSelectionForBlock(selectedDepartment, selectedSemester, selectedSession);
      }
    } else {
      const opt = courseOptions.find((o) => o.course_code === selectedCourseCode);
      const cCode = opt ? opt.course_code : selectedCourseCode;
      const cName = opt ? opt.course_name : '';
      const blockKey = getBlockKey(selectedDepartment, selectedSemester, selectedSession, cCode);

      setConfiguration((current) => {
        if (current.some((item) => getBlockKey(item.department, item.semester, item.session, item.courseCode) === blockKey)) {
          return current;
        }
        return [
          ...current,
          {
            department: selectedDepartment,
            semester: selectedSemester,
            session: selectedSession,
            courseCode: cCode,
            courseName: cName,
          },
        ];
      });
      loadStudentSelectionForBlock(selectedDepartment, selectedSemester, selectedSession, cCode, cName);
    }
  };

  const handleRemoveConfiguration = (index: number) => {
    setConfiguration((current) => current.filter((_, idx) => idx !== index));
  };

  const handleClearAllBlocks = () => {
    if (configuration.length === 0) return;
    if (window.confirm('Are you sure you want to clear all department blocks?')) {
      setConfiguration([]);
      setPlan([]);
      setOptimizedHallsData(null);
      setMessage('Cleared all blocks.');
    }
  };

  const handleLoadFromTimetable = async (targetDate?: string, targetSession?: 'FN' | 'AN') => {
    const d = (targetDate || examDate).trim();
    const s = targetSession || selectedSession || 'FN';
    if (!d) {
      setError('Please enter an Exam Date first to load scheduled courses from timetable.');
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const timetable = await kvLoad<Array<{ exam_title: string; exam_date: string; session: 'FN' | 'AN'; department: string; semester: string; course_code: string; course_name: string }>>('COE_EXAM_TIMETABLE_V1', []);
      const matched = (timetable || []).filter(
        (t) => t.exam_date.trim() === d && t.session === s
      );

      if (matched.length === 0) {
        setError(`No exam timetable entries scheduled for date ${d} (${s}). Go to Exam Timetable to schedule courses.`);
        return;
      }

      const newConfigs: Array<{ department: string; semester: string; session: 'FN' | 'AN'; courseCode?: string; courseName?: string }> = [];
      const seenBlockKeys = new Set<string>();
      for (const entry of matched) {
        const normalizedDept = String(entry.department || '').trim().toUpperCase();
        const normalizedSem = String(entry.semester || '').trim().toUpperCase();
        const normalizedSession = (String(entry.session || 'FN').trim().toUpperCase() as 'FN' | 'AN');
        const normalizedCode = String(entry.course_code || '').trim().toUpperCase();
        const blockKey = getBlockKey(normalizedDept, normalizedSem, normalizedSession, normalizedCode);
        if (!seenBlockKeys.has(blockKey)) {
          seenBlockKeys.add(blockKey);
          newConfigs.push({
            department: normalizedDept,
            semester: normalizedSem,
            session: normalizedSession,
            courseCode: normalizedCode,
            courseName: String(entry.course_name || '').trim(),
          });
        }
        if (entry.exam_title && !examTitle) {
          setExamTitle(entry.exam_title);
        }
      }

      setConfiguration(newConfigs);

      for (const block of newConfigs) {
        await loadStudentSelectionForBlock(
          block.department,
          block.semester,
          block.session,
          block.courseCode,
          block.courseName
        );
      }

      setMessage(`✓ Successfully loaded ${matched.length} course block(s) from Exam Timetable scheduled on ${d} (${s}).`);
    } catch (err: any) {
      console.error('Timetable load error', err);
      setError(err?.message || 'Failed to load scheduled courses from timetable.');
    }
  };

  const loadStudentSelectionForBlock = async (
    department: string,
    semester: string,
    session: 'FN' | 'AN',
    courseCode?: string,
    courseName?: string
  ) => {
    const blockKey = getBlockKey(department, semester, session, courseCode);
    try {
      const response = await fetchCoeStudentsMap({ department, semester });
      const nextStudents: SelectionStudentItem[] = [];
      const seen = new Set<string>();
      const targetDeptNorm = normDept(department);
      const normalizedCourseCode = normalizeCourseCode(courseCode);
      const targetSemNum = parseInt(semester.replace('SEM', ''), 10);

      for (const deptBlock of response.departments || []) {
        if (department && department.trim().toUpperCase() !== 'ALL') {
          if (normDept(deptBlock.department) !== targetDeptNorm) {
            continue;
          }
        }
        for (const course of deptBlock.courses || []) {
          if ((course as any).semester) {
            const cSemNum = parseInt(String((course as any).semester).replace('SEM', ''), 10);
            if (!isNaN(cSemNum) && !isNaN(targetSemNum) && cSemNum !== targetSemNum) {
              continue;
            }
          }
          const cCode = String(course.course_code || '').trim();
          const cName = String(course.course_name || '').trim();
          if (
            normalizedCourseCode &&
            normalizeCourseCode(cCode) !== normalizedCourseCode &&
            normalizeCourseCode(cName) !== normalizedCourseCode
          ) {
            continue;
          }
          for (const student of course.students || []) {
            const regNo = String(student?.reg_no || '').trim();
            const rawName = String((student as any)?.full_name || (student as any)?.username || student?.name || '').trim();
            const name = rawName || regNo;
            if (!regNo || seen.has(regNo)) continue;
            seen.add(regNo);
            nextStudents.push({
              reg_no: regNo,
              name: name,
              course_code: cCode,
              course_name: cName,
              section: (student as any).section || '',
              department: (student as any).department || deptBlock.department,
              is_arrear: Boolean((student as any).is_arrear),
            });
          }
        }
      }
      // Sort by last 3 digits of reg_no to maintain consecutive seating order
      nextStudents.sort((a, b) => {
        const numA = parseInt(a.reg_no.slice(-3), 10);
        const numB = parseInt(b.reg_no.slice(-3), 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return a.reg_no.localeCompare(b.reg_no);
      });

      const selected = nextStudents.map((student) => student.reg_no);
      setStudentSelectionMap((current) => {
        const prev = current[blockKey];
        const updatedSelected = (prev && prev.length > 0) ? prev : selected;
        return {
          ...current,
          [blockKey]: updatedSelected,
        };
      });

      return nextStudents;
    } catch (err) {
      console.warn('Failed to load student list for block', { department, semester, session, courseCode, err });
      return [] as SelectionStudentItem[];
    }
  };

  const openStudentSelection = async (department: string, semester: string, session: 'FN' | 'AN', courseCode?: string, courseName?: string) => {
    const blockKey = getBlockKey(department, semester, session, courseCode);
    setSelectionBlockKey(blockKey);
    setSelectionSearch('');
    setSelectionLoading(true);
    try {
      const students = await loadStudentSelectionForBlock(department, semester, session, courseCode, courseName);
      setSelectionStudents(students);
    } finally {
      setSelectionLoading(false);
    }
  };

  const toggleStudentSelection = (regNo: string) => {
    if (!selectionBlockKey) return;
    setStudentSelectionMap((current) => {
      const selected = current[selectionBlockKey] || [];
      const next = selected.includes(regNo)
        ? selected.filter((value) => value !== regNo)
        : [...selected, regNo];
      return { ...current, [selectionBlockKey]: next };
    });
  };

  const toggleAllVisibleSelection = (shouldSelect: boolean) => {
    if (!selectionBlockKey) return;
    const visibleRegNos = selectionStudents
      .filter((student) => {
        const query = selectionSearch.trim().toLowerCase();
        if (!query) return true;
        return student.name.toLowerCase().includes(query) || student.reg_no.toLowerCase().includes(query);
      })
      .map((student) => student.reg_no);

    setStudentSelectionMap((current) => {
      const previous = current[selectionBlockKey] || [];
      const nextSet = new Set(previous);
      if (shouldSelect) {
        visibleRegNos.forEach((regNo) => nextSet.add(regNo));
      } else {
        visibleRegNos.forEach((regNo) => nextSet.delete(regNo));
      }
      // Re-sort the result by last 3 digits to preserve consecutive seating order
      const sorted = Array.from(nextSet).sort((a, b) => {
        const numA = parseInt(a.slice(-3), 10);
        const numB = parseInt(b.slice(-3), 10);
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });
      return { ...current, [selectionBlockKey]: sorted };
    });
  };

  const availableSectionsInBlock = useMemo(() => {
    const secSet = new Set<string>();
    selectionStudents.forEach((s) => {
      const sec = (s.section || '').trim().toUpperCase();
      if (sec) secSet.add(sec);
    });
    return Array.from(secSet).sort();
  }, [selectionStudents]);

  const blockRegNosSet = useMemo(() => {
    return new Set(selectionStudents.map((s) => s.reg_no));
  }, [selectionStudents]);

  const activeBlockGroups = useMemo(() => {
    return savedStudentGroups.filter((g) =>
      (g.regNos || []).some((r) => blockRegNosSet.has(r))
    );
  }, [savedStudentGroups, blockRegNosSet]);

  const toggleGroupSelection = (groupName: string, shouldSelect: boolean) => {
    if (!selectionBlockKey) return;
    const group = savedStudentGroups.find((g) => g.name === groupName);
    if (!group) return;
    const groupRegSet = new Set(group.regNos || []);
    const targetRegNos = selectionStudents
      .filter((s) => groupRegSet.has(s.reg_no))
      .map((s) => s.reg_no);

    setStudentSelectionMap((current) => {
      const prev = current[selectionBlockKey] || [];
      const nextSet = new Set(prev);
      if (shouldSelect) {
        targetRegNos.forEach((r) => nextSet.add(r));
      } else {
        targetRegNos.forEach((r) => nextSet.delete(r));
      }
      const sorted = Array.from(nextSet).sort((a, b) => {
        const numA = parseInt(a.slice(-3), 10);
        const numB = parseInt(b.slice(-3), 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });
      return { ...current, [selectionBlockKey]: sorted };
    });
  };

  const toggleSectionSelection = (sectionName: string, shouldSelect: boolean) => {
    if (!selectionBlockKey) return;
    const targetRegNos = selectionStudents
      .filter((s) => (s.section || '').trim().toUpperCase() === sectionName.trim().toUpperCase())
      .map((s) => s.reg_no);

    setStudentSelectionMap((current) => {
      const prev = current[selectionBlockKey] || [];
      const nextSet = new Set(prev);
      if (shouldSelect) {
        targetRegNos.forEach((r) => nextSet.add(r));
      } else {
        targetRegNos.forEach((r) => nextSet.delete(r));
      }
      const sorted = Array.from(nextSet).sort((a, b) => {
        const numA = parseInt(a.slice(-3), 10);
        const numB = parseInt(b.slice(-3), 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });
      return { ...current, [selectionBlockKey]: sorted };
    });
  };

  const handleSaveStudentGroup = (name: string, regNos: string[], dept?: string, sem?: string) => {
    const newGroup: StudentGroup = {
      name,
      regNos,
      dept: dept || selectedDepartment,
      sem: sem || selectedSemester,
    };
    setSavedStudentGroups((prev) => {
      const idx = prev.findIndex((g) => g.name.toLowerCase() === name.toLowerCase());
      let next: StudentGroup[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = newGroup;
      } else {
        next = [...prev, newGroup];
      }
      kvSave(STUDENT_GROUPS_KEY, { groups: next });
      try {
        window.localStorage.setItem(STUDENT_GROUPS_KEY, JSON.stringify({ groups: next }));
      } catch {}
      return next;
    });
    setIsGroupModalOpen(false);
    setMessage(`Student group "${name}" saved (${regNos.length} students).`);
  };

  const handleDeleteStudentGroup = (groupNameToDelete: string) => {
    setSavedStudentGroups((prev) => {
      const next = prev.filter((g) => g.name !== groupNameToDelete);
      kvSave(STUDENT_GROUPS_KEY, { groups: next });
      try {
        window.localStorage.setItem(STUDENT_GROUPS_KEY, JSON.stringify({ groups: next }));
      } catch {}
      return next;
    });
  };

  const selectFirstNStudents = (n: number) => {
    if (!selectionBlockKey) return;
    const targetRegNos = selectionStudents.slice(0, n).map((s) => s.reg_no);
    setStudentSelectionMap((current) => {
      const sorted = [...targetRegNos].sort((a, b) => {
        const numA = parseInt(a.slice(-3), 10);
        const numB = parseInt(b.slice(-3), 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });
      return { ...current, [selectionBlockKey]: sorted };
    });
  };

  const selectRangeStudents = (startIdx: number, endIdx: number, shouldSelect: boolean) => {
    if (!selectionBlockKey || selectionStudents.length === 0) return;
    const start = Math.max(1, Math.min(startIdx, endIdx));
    const end = Math.min(selectionStudents.length, Math.max(startIdx, endIdx));
    const slice = selectionStudents.slice(start - 1, end).map((s) => s.reg_no);

    setStudentSelectionMap((current) => {
      const prev = current[selectionBlockKey] || [];
      const nextSet = new Set(prev);
      if (shouldSelect) {
        slice.forEach((r) => nextSet.add(r));
      } else {
        slice.forEach((r) => nextSet.delete(r));
      }
      const sorted = Array.from(nextSet).sort((a, b) => {
        const numA = parseInt(a.slice(-3), 10);
        const numB = parseInt(b.slice(-3), 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });
      return { ...current, [selectionBlockKey]: sorted };
    });
  };

  const visibleSelectionStudents = selectionStudents.filter((student) => {
    const query = selectionSearch.trim().toLowerCase();
    if (!query) return true;
    return student.name.toLowerCase().includes(query) || student.reg_no.toLowerCase().includes(query);
  });

  const canPlaceDeptAtSeat = (
    deptGrid: string[][],
    r: number,
    c: number,
    rows: number,
    cols: number,
    dept: string
  ): boolean => {
    if (!dept) return true;
    const neighbors = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    for (const [nr, nc] of neighbors) {
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        if (deptGrid[nr][nc] && deptGrid[nr][nc] === dept) {
          return false;
        }
      }
    }
    return true;
  };

  const buildPatternSeatOrder = (
    pattern: SeatingPattern | undefined,
    poolBuckets: Record<string, string[]>,
    totalSlots: number,
    rows: number,
    cols: number,
    orderedPools?: string[],
    studentSubjectMap?: Record<string, string>,
    studentCourseMap?: Record<string, string>,
    studentDeptMap?: Record<string, string>,
    deptsInParity0?: string[],
    deptsInParity1?: string[],
    poolDeptMap?: Record<string, string>
  ): { students: string[]; subjects: string[]; depts: string[]; courses: string[] } => {
    const activePools = (orderedPools || Object.keys(poolBuckets)).filter(
      (k) => poolBuckets[k] && poolBuckets[k].length > 0
    );
    if (activePools.length === 0) return { students: [], subjects: [], depts: [], courses: [] };

    const studentIdx: Record<string, number> = {};
    for (const key of activePools) studentIdx[key] = 0;

    const positions = getPatternPositions(rows, cols, pattern);
    const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));
    const subjectGrid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));
    const deptGrid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));
    const courseGrid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));

    // Separate active pools into Parity 0 and Parity 1 based on distinct department sets
    const p0DeptsSet = new Set(deptsInParity0 || []);
    const p1DeptsSet = new Set(deptsInParity1 || []);

    let p0Pools: string[] = [];
    let p1Pools: string[] = [];

    if (p0DeptsSet.size > 0 || p1DeptsSet.size > 0) {
      p0Pools = activePools.filter((p) => {
        const d = (poolDeptMap && poolDeptMap[p]) || (studentDeptMap && poolBuckets[p]?.[0] ? studentDeptMap[poolBuckets[p][0]] : p);
        return p0DeptsSet.has(d);
      });
      p1Pools = activePools.filter((p) => {
        const d = (poolDeptMap && poolDeptMap[p]) || (studentDeptMap && poolBuckets[p]?.[0] ? studentDeptMap[poolBuckets[p][0]] : p);
        return p1DeptsSet.has(d);
      });
      for (const p of activePools) {
        if (!p0Pools.includes(p) && !p1Pools.includes(p)) {
          if (p0Pools.length <= p1Pools.length) p0Pools.push(p);
          else p1Pools.push(p);
        }
      }
    } else {
      p0Pools = activePools.filter((_, idx) => idx % 2 === 0);
      p1Pools = activePools.filter((_, idx) => idx % 2 === 1);
    }

    const parityPoolQueues: Record<number, string[]> = {
      0: [...p0Pools],
      1: [...p1Pools],
    };

    const currentParityPool: Record<number, string | null> = {
      0: parityPoolQueues[0].shift() || null,
      1: parityPoolQueues[1].shift() || null,
    };

    for (let i = 0; i < positions.length; i += 1) {
      const [r, c] = positions[i];
      const cellParity = (r + c) % 2;

      let targetPool = currentParityPool[cellParity];

      // If current pool target is exhausted, pull next pool assigned to this parity
      while (targetPool && studentIdx[targetPool] >= (poolBuckets[targetPool]?.length || 0)) {
        if (parityPoolQueues[cellParity].length > 0) {
          targetPool = parityPoolQueues[cellParity].shift()!;
          currentParityPool[cellParity] = targetPool;
        } else {
          currentParityPool[cellParity] = null;
          targetPool = null;
          break;
        }
      }

      if (targetPool && studentIdx[targetPool] < (poolBuckets[targetPool]?.length || 0)) {
        const regNo = poolBuckets[targetPool][studentIdx[targetPool]];
        const d = (studentDeptMap && studentDeptMap[regNo]) || (poolDeptMap && poolDeptMap[targetPool]) || targetPool;
        grid[r][c] = regNo;
        subjectGrid[r][c] = (studentSubjectMap && studentSubjectMap[regNo]) || targetPool;
        deptGrid[r][c] = d;
        courseGrid[r][c] = (studentCourseMap && studentCourseMap[regNo]) || targetPool;
        studentIdx[targetPool] += 1;
      }
    }

    // Second pass: fill any empty seats with students who were not placed by the parity loop,
    // strictly avoiding placing the same department on the 4 orthogonal sides (front, back, left, right).
    const unplacedStudents: Array<{ pool: string; reg: string; dept: string }> = [];
    for (const pool of activePools) {
      const remaining = (poolBuckets[pool] || []).slice(studentIdx[pool]);
      for (const reg of remaining) {
        const d = (studentDeptMap && studentDeptMap[reg]) || (poolDeptMap && poolDeptMap[pool]) || pool;
        unplacedStudents.push({ pool, reg, dept: d });
      }
    }

    if (unplacedStudents.length > 0) {
      for (let sIdx = 0; sIdx < unplacedStudents.length; sIdx++) {
        const { pool, reg, dept } = unplacedStudents[sIdx];
        let placed = false;
        for (let i = 0; i < positions.length; i += 1) {
          const [r, c] = positions[i];
          if (!grid[r][c] && canPlaceDeptAtSeat(deptGrid, r, c, rows, cols, dept)) {
            grid[r][c] = reg;
            subjectGrid[r][c] = (studentSubjectMap && studentSubjectMap[reg]) || pool;
            deptGrid[r][c] = dept;
            courseGrid[r][c] = (studentCourseMap && studentCourseMap[reg]) || pool;
            placed = true;
            break;
          }
        }
        if (!placed) {
          for (let i = 0; i < positions.length; i += 1) {
            const [r, c] = positions[i];
            if (!grid[r][c]) {
              grid[r][c] = reg;
              subjectGrid[r][c] = (studentSubjectMap && studentSubjectMap[reg]) || pool;
              deptGrid[r][c] = dept;
              courseGrid[r][c] = (studentCourseMap && studentCourseMap[reg]) || pool;
              break;
            }
          }
        }
      }
    }

    // Convert 2D grid to flat arrays matching pattern position order
    const students: string[] = [];
    const subjects: string[] = [];
    const depts: string[] = [];
    const courses: string[] = [];
    for (let i = 0; i < positions.length; i += 1) {
      const [r, c] = positions[i];
      students.push(grid[r][c] || '');
      subjects.push(subjectGrid[r][c] || '');
      depts.push(deptGrid[r][c] || '');
      courses.push(courseGrid[r][c] || '');
    }

    return { students, subjects, depts, courses };
  };

  const getPatternPositions = (rows: number, cols: number, pattern?: SeatingPattern): Array<[number, number]> => {
    const positions: Array<[number, number]> = [];
    const seen = new Set<string>();

    const addPos = (r: number, c: number) => {
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        const key = `${r},${c}`;
        if (!seen.has(key)) {
          seen.add(key);
          positions.push([r, c]);
        }
      }
    };

    if (pattern === 'Straight') {
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) addPos(r, c);
      }
    } else if (!pattern || pattern === 'Zigzag') {
      for (let c = 0; c < cols; c += 1) {
        const rowOrder = c % 2 === 0 ? Array.from({ length: rows }, (_, r) => r) : Array.from({ length: rows }, (_, r) => rows - 1 - r);
        for (const r of rowOrder) addPos(r, c);
      }
    } else if (pattern === 'Alternate Zigzag') {
      for (let pairStart = 0; pairStart < cols; pairStart += 2) {
        const c1 = pairStart;
        const c2 = pairStart + 1;
        if (c2 < cols) {
          for (let r = 0; r < rows; r += 1) {
            if (r % 2 === 0) {
              addPos(r, c1);
              addPos(r, c2);
            } else {
              addPos(r, c2);
              addPos(r, c1);
            }
          }
        } else {
          for (let r = 0; r < rows; r += 1) addPos(r, c1);
        }
      }
    } else if (pattern === 'U-Shape') {
      let top = 0;
      let bottom = rows - 1;
      let left = 0;
      let right = cols - 1;
      while (top <= bottom && left <= right) {
        for (let r = top; r <= bottom; r += 1) addPos(r, left);
        for (let c = left + 1; c <= right; c += 1) addPos(bottom, c);
        if (left < right) {
          for (let r = bottom - 1; r >= top; r -= 1) addPos(r, right);
        }
        if (top < bottom) {
          for (let c = right - 1; c > left; c -= 1) addPos(top, c);
        }
        top += 1;
        bottom -= 1;
        left += 1;
        right -= 1;
      }
    } else if (pattern === 'Circle') {
      const centerR = (rows - 1) / 2.0;
      const centerC = (cols - 1) / 2.0;
      const cells: Array<{ dist: number; r: number; c: number }> = [];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const dist = Math.pow(r - centerR, 2) + Math.pow(c - centerC, 2);
          cells.push({ dist, r, c });
        }
      }
      cells.sort((a, b) => a.dist - b.dist || a.r - b.r || a.c - b.c);
      for (const cell of cells) addPos(cell.r, cell.c);
    } else if (pattern === 'Clustered') {
      for (let blockR = 0; blockR < rows; blockR += 2) {
        for (let blockC = 0; blockC < cols; blockC += 2) {
          for (let r = blockR; r < Math.min(blockR + 2, rows); r += 1) {
            for (let c = blockC; c < Math.min(blockC + 2, cols); c += 1) {
              addPos(r, c);
            }
          }
        }
      }
    } else if (pattern === 'Mixed') {
      for (let c = 0; c < cols; c += 1) {
        if (c % 4 === 0) {
          for (let r = 0; r < rows; r += 1) addPos(r, c);
        } else if (c % 4 === 1) {
          for (let r = 0; r < rows; r += 2) addPos(r, c);
          for (let r = 1; r < rows; r += 2) addPos(r, c);
        } else if (c % 4 === 2) {
          for (let r = rows - 1; r >= 0; r -= 1) addPos(r, c);
        } else {
          for (let r = 1; r < rows; r += 2) addPos(r, c);
          for (let r = 0; r < rows; r += 2) addPos(r, c);
        }
      }
    }

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) addPos(r, c);
    }

    return positions;
  };

  const buildSeatGridForPattern = (hall: { rows: number; cols: number; pattern?: SeatingPattern; students: string[] }): string[][] => {
    const grid: string[][] = Array.from({ length: hall.rows }, () => Array(hall.cols).fill(''));
    const positions = getPatternPositions(hall.rows, hall.cols, hall.pattern);

    for (let index = 0; index < hall.students.length && index < positions.length; index += 1) {
      const [rowIndex, colIndex] = positions[index];
      grid[rowIndex][colIndex] = hall.students[index];
    }

    return grid;
  };

  const fetchDepartmentStudents = async (department: string, semester: string): Promise<string[]> => {
    try {
      const response = await fetchWithAuth(`/api/coe/students-map/?department=${encodeURIComponent(department)}&semester=${encodeURIComponent(semester)}`);
      if (!response.ok) throw new Error('Failed to fetch students');
      const data = await response.json();
      const students: string[] = [];
      const seen = new Set<string>();
      const targetDeptNorm = normDept(department);
      for (const deptBlock of data.departments || []) {
        if (department && department.trim().toUpperCase() !== 'ALL') {
          if (normDept(deptBlock.department) !== targetDeptNorm) {
            continue;
          }
        }
        for (const course of deptBlock.courses || []) {
          for (const student of course.students || []) {
            const regNo = String(student?.reg_no || '').trim();
            if (!regNo || seen.has(regNo)) continue;
            seen.add(regNo);
            students.push(regNo);
          }
        }
      }
      return students.sort((a, b) => {
        const numA = parseInt(a.slice(-3), 10);
        const numB = parseInt(b.slice(-3), 10);
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });
    } catch {
      return [];
    }
  };

  interface ExportHallData {
    hall_name: string;
    department: string;
    departments?: string[];
    subjects?: string[];
    dept_counts?: Record<string, number>;
    subject_counts?: Record<string, number>;
    rows: number;
    cols: number;
    pattern?: SeatingPattern;
    students: string[];
    studentDepts?: string[];
    student_subjects?: string[];
    student_courses?: string[];
    student_sections?: string[];
  }

  interface OptimizedHallData extends ExportHallData {
    studentDepts: string[];
    student_subjects: string[];
    student_courses?: string[];
    student_sections?: string[];
    donorIndices: Set<number>;
    shiftedIndices: Set<number>;
  }

  const fisherYatesShuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const buildHallExportData = async (): Promise<ExportHallData[]> => {
    const hallsData: ExportHallData[] = [];

    // Step 1: Collect unallocated student pools by Department (or Section in 1st Year mode) + Subject/Course code
    const poolKeys: string[] = [];
    const poolStudents: Record<string, string[]> = {};
    const poolDeptMap: Record<string, string> = {};
    const poolSubjectMap: Record<string, string> = {};
    const studentSubjectMap: Record<string, string> = {};
    const studentCourseMap: Record<string, string> = {};
    const studentDeptMap: Record<string, string> = {};
    const studentSectionMap: Record<string, string> = {};

    for (const item of configuration) {
      const blockKey = getBlockKey(item.department, item.semester, item.session, item.courseCode);
      let studentObjs = await loadStudentSelectionForBlock(
        item.department,
        item.semester,
        item.session,
        item.courseCode,
        item.courseName
      );
      let selectedRegs = studentSelectionMap[blockKey];

      let activeRegs = selectedRegs && selectedRegs.length > 0
        ? selectedRegs
        : studentObjs.map((s) => s.reg_no);

      const studentObjMap = new Map<string, SelectionStudentItem>();
      studentObjs.forEach((s) => studentObjMap.set(s.reg_no, s));

      if (isFirstYearMode) {
        // In First Year mode, cluster students by Section (e.g. Sec A, Sec B)
        activeRegs.forEach((reg) => {
          const st = studentObjMap.get(reg);
          const sec = (st?.section || '').trim().toUpperCase() || 'A';
          const secLabel = `Sec ${sec}`;
          const poolKey = `${secLabel}__${item.courseCode || 'GEN'}`;

          if (!poolKeys.includes(poolKey)) {
            poolKeys.push(poolKey);
          }
          if (!poolStudents[poolKey]) {
            poolStudents[poolKey] = [];
          }

          poolDeptMap[poolKey] = secLabel;
          poolSubjectMap[poolKey] = item.courseCode || secLabel;

          poolStudents[poolKey].push(reg);
          studentSubjectMap[reg] = item.courseCode || item.department;
          studentCourseMap[reg] = item.courseName || item.courseCode || item.department;
          studentDeptMap[reg] = secLabel;
          studentSectionMap[reg] = sec;
        });
      } else {
        // Regular mode: cluster by department
        const poolKey = `${item.department}__${item.courseCode || 'GEN'}`;

        if (!poolKeys.includes(poolKey)) {
          poolKeys.push(poolKey);
        }
        if (!poolStudents[poolKey]) {
          poolStudents[poolKey] = [];
        }

        poolDeptMap[poolKey] = item.department;
        poolSubjectMap[poolKey] = item.courseCode || item.department;

        activeRegs.forEach((reg) => {
          const st = studentObjMap.get(reg);
          poolStudents[poolKey].push(reg);
          studentSubjectMap[reg] = item.courseCode || item.department;
          studentCourseMap[reg] = item.courseName || item.courseCode || item.department;
          studentDeptMap[reg] = item.department;
          if (st?.section) studentSectionMap[reg] = st.section;
        });
      }
    }

    const allPools = poolKeys.filter((p) => poolStudents[p] && poolStudents[p].length > 0);
    if (allPools.length === 0) return hallsData;

    const availablePools = [...allPools];

    const sortedHalls = [...rows].sort((a, b) => (b.rows * b.cols) - (a.rows * a.cols) || a.hallNumber.localeCompare(b.hallNumber));
    let activePair: string[] = [];

    // Capture total students and total capacity BEFORE pools are drained by the allocation loop.
    // Extra overflow halls should only be added when students outnumber total hall capacity.
    const totalHallCapacity = sortedHalls.reduce((sum, h) => sum + Math.max(0, h.rows * h.cols), 0);
    const totalStudentCount = allPools.reduce((sum, p) => sum + (poolStudents[p]?.length || 0), 0);
    const needsOverflowHall = totalStudentCount > totalHallCapacity;

    const getNextAvailablePool = (excludeDepts: string[] = [], excludePools: string[] = []) => {
      const remaining = availablePools.filter(
        (p) =>
          !excludePools.includes(p) &&
          !excludeDepts.includes(poolDeptMap[p]) &&
          poolStudents[p] &&
          poolStudents[p].length > 0
      );
      if (remaining.length === 0) return undefined;

      // Deterministically pick pool with largest remaining student count
      remaining.sort((a, b) => (poolStudents[b]?.length || 0) - (poolStudents[a]?.length || 0));
      return remaining[0];
    };

    const allocateHallBuckets = (capacity: number) => {
      const hallPoolBuckets: Record<string, string[]> = {};
      const poolsInHall: string[] = [];
      const deptsInParity0: string[] = [];
      const deptsInParity1: string[] = [];

      activePair = activePair.filter((p) => poolStudents[p] && poolStudents[p].length > 0);

      while (activePair.length < 2) {
        const usedDepts = activePair.map((p) => poolDeptMap[p]);
        const nextP = getNextAvailablePool(usedDepts, activePair);
        if (!nextP) break;
        activePair.push(nextP);
      }

      if (activePair.length === 0) {
        const fallback = availablePools.find((p) => poolStudents[p] && poolStudents[p].length > 0);
        if (fallback) activePair.push(fallback);
      }

      if (activePair.length === 0) return { hallPoolBuckets, poolsInHall, deptsInParity0, deptsInParity1 };

      const p0Cap = Math.ceil(capacity / 2);
      const p1Cap = Math.floor(capacity / 2);

      const p0 = activePair[0] || null;
      const p1 = activePair[1] || null;

      let takenP0 = 0;
      let takenP1 = 0;

      if (p0 && poolStudents[p0] && poolStudents[p0].length > 0) {
        const take0 = Math.min(p0Cap, poolStudents[p0].length);
        hallPoolBuckets[p0] = poolStudents[p0].splice(0, take0);
        poolsInHall.push(p0);
        const d0 = poolDeptMap[p0];
        if (!deptsInParity0.includes(d0)) deptsInParity0.push(d0);
        takenP0 = take0;
      }

      if (p1 && poolStudents[p1] && poolStudents[p1].length > 0) {
        const take1 = Math.min(p1Cap, poolStudents[p1].length);
        hallPoolBuckets[p1] = poolStudents[p1].splice(0, take1);
        if (!poolsInHall.includes(p1)) poolsInHall.push(p1);
        const d1 = poolDeptMap[p1];
        if (!deptsInParity1.includes(d1)) deptsInParity1.push(d1);
        takenP1 = take1;
      }

      let remP0 = p0Cap - takenP0;
      while (remP0 > 0) {
        // Find next pool that does NOT share department with Parity 1
        let nextP = getNextAvailablePool(deptsInParity1, poolsInHall);
        if (!nextP) {
          nextP = availablePools.find((p) => !deptsInParity1.includes(poolDeptMap[p]) && poolStudents[p] && poolStudents[p].length > 0);
        }
        // Final fallback: when capacity >= total students, seat remaining students even if same dept
        if (!nextP && !needsOverflowHall) {
          nextP = availablePools.find((p) => poolStudents[p] && poolStudents[p].length > 0);
        }
        if (!nextP) break;
        const take = Math.min(remP0, poolStudents[nextP].length);
        if (take > 0) {
          if (!hallPoolBuckets[nextP]) {
            hallPoolBuckets[nextP] = [];
            poolsInHall.push(nextP);
          }
          hallPoolBuckets[nextP].push(...poolStudents[nextP].splice(0, take));
          const d = poolDeptMap[nextP];
          if (!deptsInParity0.includes(d)) deptsInParity0.push(d);
          remP0 -= take;
        } else {
          break;
        }
      }

      let remP1 = p1Cap - takenP1;
      while (remP1 > 0) {
        // Find next pool that does NOT share department with Parity 0
        let nextP = getNextAvailablePool(deptsInParity0, poolsInHall);
        if (!nextP) {
          nextP = availablePools.find((p) => !deptsInParity0.includes(poolDeptMap[p]) && poolStudents[p] && poolStudents[p].length > 0);
        }
        // Final fallback: when capacity >= total students, seat remaining students even if same dept
        if (!nextP && !needsOverflowHall) {
          nextP = availablePools.find((p) => poolStudents[p] && poolStudents[p].length > 0);
        }
        if (!nextP) break;
        const take = Math.min(remP1, poolStudents[nextP].length);
        if (take > 0) {
          if (!hallPoolBuckets[nextP]) {
            hallPoolBuckets[nextP] = [];
            poolsInHall.push(nextP);
          }
          hallPoolBuckets[nextP].push(...poolStudents[nextP].splice(0, take));
          const d = poolDeptMap[nextP];
          if (!deptsInParity1.includes(d)) deptsInParity1.push(d);
          remP1 -= take;
        } else {
          break;
        }
      }

      return { hallPoolBuckets, poolsInHall, deptsInParity0, deptsInParity1 };
    };

    for (let hallIdx = 0; hallIdx < sortedHalls.length; hallIdx += 1) {
      if (!availablePools.some((p) => poolStudents[p] && poolStudents[p].length > 0)) break;

      const hallRow = sortedHalls[hallIdx];
      const capacity = Math.max(0, hallRow.rows * hallRow.cols);
      if (capacity <= 0) continue;

      const { hallPoolBuckets, poolsInHall, deptsInParity0, deptsInParity1 } = allocateHallBuckets(capacity);

      const totalStudentsInHall = Object.values(hallPoolBuckets).reduce((sum, list) => sum + list.length, 0);
      if (totalStudentsInHall === 0) continue;

      const { students: interleavedStudents, subjects: interleavedSubjects, depts: interleavedDepts, courses: interleavedCourses } = buildPatternSeatOrder(
        hallRow.pattern,
        hallPoolBuckets,
        totalStudentsInHall,
        hallRow.rows,
        hallRow.cols,
        poolsInHall,
        studentSubjectMap,
        studentCourseMap,
        studentDeptMap,
        deptsInParity0,
        deptsInParity1,
        poolDeptMap
      );

      const deptsInHall = Array.from(new Set(interleavedDepts.filter(Boolean)));
      const deptCounts: Record<string, number> = {};
      for (const d of interleavedDepts) {
        if (d) deptCounts[d] = (deptCounts[d] || 0) + 1;
      }
      const subsInHall = Array.from(new Set(interleavedSubjects.filter(Boolean)));
      const subCounts: Record<string, number> = {};
      for (const s of interleavedSubjects) {
        if (s) subCounts[s] = (subCounts[s] || 0) + 1;
      }
      const combinedDeptLabel = deptsInHall.join(' / ');
      const combinedSubLabel = subsInHall.join(' / ');
      const studentSectionsInHall = interleavedStudents.map((reg) => (reg ? studentSectionMap[reg] || '' : ''));

      hallsData.push({
        hall_name: hallRow.hallNumber,
        department: combinedDeptLabel || combinedSubLabel,
        departments: deptsInHall,
        subjects: subsInHall,
        dept_counts: deptCounts,
        subject_counts: subCounts,
        rows: hallRow.rows,
        cols: hallRow.cols,
        pattern: hallRow.pattern,
        students: interleavedStudents,
        studentDepts: interleavedDepts,
        student_subjects: interleavedSubjects,
        student_courses: interleavedCourses,
        student_sections: studentSectionsInHall,
      });
    }

    let overflowHallNum = 1;
    const defaultTemplate = sortedHalls[sortedHalls.length - 1] || { rows: 7, cols: 6, pattern: 'Alternate Zigzag' };

    while (needsOverflowHall && availablePools.some((p) => poolStudents[p] && poolStudents[p].length > 0)) {
      const capacity = Math.max(0, defaultTemplate.rows * defaultTemplate.cols);
      const { hallPoolBuckets, poolsInHall, deptsInParity0, deptsInParity1 } = allocateHallBuckets(capacity);

      const totalStudentsInHall = Object.values(hallPoolBuckets).reduce((sum, list) => sum + list.length, 0);
      if (totalStudentsInHall === 0) break;

      const autoHallName = `Hall ${sortedHalls.length + overflowHallNum}`;
      overflowHallNum += 1;

      const { students: interleavedStudents, subjects: interleavedSubjects, depts: interleavedDepts, courses: interleavedCourses } = buildPatternSeatOrder(
        defaultTemplate.pattern,
        hallPoolBuckets,
        totalStudentsInHall,
        defaultTemplate.rows,
        defaultTemplate.cols,
        poolsInHall,
        studentSubjectMap,
        studentCourseMap,
        studentDeptMap,
        deptsInParity0,
        deptsInParity1,
        poolDeptMap
      );
      const deptsInHall = Array.from(new Set(interleavedDepts.filter(Boolean)));
      const deptCounts: Record<string, number> = {};
      for (const d of interleavedDepts) {
        if (d) deptCounts[d] = (deptCounts[d] || 0) + 1;
      }
      const subsInHall = Array.from(new Set(interleavedSubjects.filter(Boolean)));
      const subCounts: Record<string, number> = {};
      for (const s of interleavedSubjects) {
        if (s) subCounts[s] = (subCounts[s] || 0) + 1;
      }
      const combinedDeptLabel = deptsInHall.join(' / ');
      const combinedSubLabel = subsInHall.join(' / ');
      const studentSectionsInHall = interleavedStudents.map((reg) => (reg ? studentSectionMap[reg] || '' : ''));

      hallsData.push({
        hall_name: autoHallName,
        department: combinedDeptLabel || combinedSubLabel,
        departments: deptsInHall,
        subjects: subsInHall,
        dept_counts: deptCounts,
        subject_counts: subCounts,
        rows: defaultTemplate.rows,
        cols: defaultTemplate.cols,
        pattern: defaultTemplate.pattern,
        students: interleavedStudents,
        studentDepts: interleavedDepts,
        student_subjects: interleavedSubjects,
        student_courses: interleavedCourses,
        student_sections: studentSectionsInHall,
      });
    }

    return hallsData;
  };

  const optimizeHallSpaces = (
    rawHalls: ExportHallData[]
  ): OptimizedHallData[] => {
    const halls: OptimizedHallData[] = rawHalls.map((h) => ({
      ...h,
      students: [...h.students],
      studentDepts: [...(h.studentDepts || h.students.map(() => h.department))],
      student_subjects: [...(h.student_subjects || h.studentDepts || h.students.map(() => h.department))],
      student_courses: [...(h.student_courses || [])],
      student_sections: [...(h.student_sections || h.students.map(() => ''))],
      donorIndices: new Set<number>(),
      shiftedIndices: new Set<number>(),
    }));

    const getCapacity = (h: OptimizedHallData) => h.rows * h.cols;
    const getFilled = (h: OptimizedHallData) => h.students.filter((s) => s !== '').length;
    const getEmpty = (h: OptimizedHallData) => getCapacity(h) - getFilled(h);

    const totalEmpty = halls.reduce((sum, h) => sum + getEmpty(h), 0);
    if (totalEmpty === 0) return halls;

    const getSlotParity = (h: OptimizedHallData, slotIdx: number): number => {
      const positions = getPatternPositions(h.rows, h.cols, h.pattern);
      if (slotIdx >= 0 && slotIdx < positions.length) {
        const [r, c] = positions[slotIdx];
        return (r + c) % 2;
      }
      return 0;
    };

    const getHallParityDepts = (h: OptimizedHallData): { 0: Set<string>; 1: Set<string> } => {
      const parityMap: { 0: Set<string>; 1: Set<string> } = { 0: new Set(), 1: new Set() };
      for (let i = 0; i < h.students.length; i++) {
        const dept = h.studentDepts[i];
        if (h.students[i] && dept) {
          const p = getSlotParity(h, i);
          parityMap[p as 0 | 1].add(dept);
        }
      }
      return parityMap;
    };

    const canPlaceAtSlot = (h: OptimizedHallData, slotIdx: number, dept: string, subCode: string): boolean => {
      const slotParity = getSlotParity(h, slotIdx);
      const oppositeParity = (1 - slotParity) as 0 | 1;
      const parityDepts = getHallParityDepts(h);
      if (dept && parityDepts[oppositeParity].has(dept)) {
        return false;
      }
      const positions = getPatternPositions(h.rows, h.cols, h.pattern);
      if (slotIdx >= 0 && slotIdx < positions.length) {
        const [r, c] = positions[slotIdx];
        const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < h.rows && nc >= 0 && nc < h.cols) {
            const nIdx = positions.findIndex(([pr, pc]) => pr === nr && pc === nc);
            if (nIdx >= 0 && h.students[nIdx] && h.studentDepts[nIdx] === dept) {
              return false;
            }
          }
        }
      }
      return true;
    };

    const overflowHalls = halls
      .filter((h) => {
        const filled = getFilled(h);
        if (filled === 0) return false;
        const emptyInOthers = halls
          .filter((oh) => oh.hall_name !== h.hall_name)
          .reduce((sum, oh) => sum + getEmpty(oh), 0);
        return filled <= emptyInOthers;
      })
      .sort((a, b) => getFilled(a) - getFilled(b));

    for (const donorHall of overflowHalls) {
      const targetHalls = halls.filter((h) => h.hall_name !== donorHall.hall_name && getEmpty(h) > 0);
      if (targetHalls.length === 0) continue;

      const donorStudentsWithMeta: Array<{ regNo: string; dept: string; sub: string; course: string; donorIdx: number }> = [];
      for (let i = 0; i < donorHall.students.length; i++) {
        if (donorHall.students[i] !== '') {
          donorStudentsWithMeta.push({
            regNo: donorHall.students[i],
            dept: donorHall.studentDepts[i] || donorHall.department,
            sub: donorHall.student_subjects[i] || donorHall.department,
            course: donorHall.student_courses?.[i] || '',
            donorIdx: i,
          });
        }
      }

      const relocations: Array<{
        donorIdx: number;
        regNo: string;
        dept: string;
        sub: string;
        course: string;
        targetHall: OptimizedHallData;
        emptySlotIdx: number;
      }> = [];

      let allRelocated = true;
      for (const st of donorStudentsWithMeta) {
        let placed = false;
        for (const targetHall of targetHalls) {
          const cap = getCapacity(targetHall);
          for (let slot = 0; slot < cap; slot++) {
            const isAlreadyTargeted = relocations.some(
              (r) => r.targetHall.hall_name === targetHall.hall_name && r.emptySlotIdx === slot
            );
            if (targetHall.students[slot] === '' && !isAlreadyTargeted) {
              if (canPlaceAtSlot(targetHall, slot, st.dept, st.sub)) {
                relocations.push({
                  donorIdx: st.donorIdx,
                  regNo: st.regNo,
                  dept: st.dept,
                  sub: st.sub,
                  course: st.course,
                  targetHall,
                  emptySlotIdx: slot,
                });
                placed = true;
                break;
              }
            }
          }
          if (placed) break;
        }
        if (!placed) {
          allRelocated = false;
          break;
        }
      }

      if (allRelocated) {
        for (const rel of relocations) {
          rel.targetHall.students[rel.emptySlotIdx] = rel.regNo;
          rel.targetHall.studentDepts[rel.emptySlotIdx] = rel.dept;
          rel.targetHall.student_subjects[rel.emptySlotIdx] = rel.sub;
          if (rel.targetHall.student_courses) rel.targetHall.student_courses[rel.emptySlotIdx] = rel.course;
          rel.targetHall.shiftedIndices.add(rel.emptySlotIdx);

          if (!rel.targetHall.subjects?.includes(rel.sub)) {
            rel.targetHall.subjects = [...(rel.targetHall.subjects || []), rel.sub];
          }
          if (rel.targetHall.subject_counts) {
            rel.targetHall.subject_counts[rel.sub] = (rel.targetHall.subject_counts[rel.sub] || 0) + 1;
          }
          if (!rel.targetHall.departments?.includes(rel.dept)) {
            rel.targetHall.departments = [...(rel.targetHall.departments || []), rel.dept];
          }
          if (rel.targetHall.dept_counts) {
            rel.targetHall.dept_counts[rel.dept] = (rel.targetHall.dept_counts[rel.dept] || 0) + 1;
          }
        }

        for (const st of donorStudentsWithMeta) {
          donorHall.students[st.donorIdx] = '';
          donorHall.studentDepts[st.donorIdx] = '';
          donorHall.student_subjects[st.donorIdx] = '';
          donorHall.donorIndices.add(st.donorIdx);
        }
      }
    }

    const remainingHalls = halls.filter((h) => getFilled(h) > 0);
    for (const h of remainingHalls) {
      const activeDepts = h.studentDepts.filter((d, i) => h.students[i] && d);
      const deptsSet = Array.from(new Set(activeDepts));
      h.departments = deptsSet;
      h.department = deptsSet.join(' / ') || h.department;
      const dCounts: Record<string, number> = {};
      for (const d of activeDepts) {
        dCounts[d] = (dCounts[d] || 0) + 1;
      }
      h.dept_counts = dCounts;
      const activeSubs = (h.student_subjects || []).filter((s, i) => h.students[i] && s);
      const subsSet = Array.from(new Set(activeSubs));
      h.subjects = subsSet;
      const sCounts: Record<string, number> = {};
      for (const s of activeSubs) {
        sCounts[s] = (sCounts[s] || 0) + 1;
      }
      h.subject_counts = sCounts;
    }
    return remainingHalls;
  };


  // ─────────────────────────────────────────────────────────────────────────

  const buildExcelPreviewRows = (hallsData: ExportHallData[]) => {
    const previewRows: Array<Array<string | number>> = [];

    // Master Summary Table Preview (Subject/Course Code breakdown)
    previewRows.push([`${examDate} ${selectedSession} | ${examTitle} Hall Allocation | ${semesterText}`]);

    const subMap: Record<string, { counts: number[]; halls: string[] }> = {};
    for (const hall of hallsData) {
      if (hall.subject_counts && Object.keys(hall.subject_counts).length > 0) {
        for (const [sub, count] of Object.entries(hall.subject_counts)) {
          if (count > 0) {
            if (!subMap[sub]) subMap[sub] = { counts: [], halls: [] };
            subMap[sub].counts.push(count);
            subMap[sub].halls.push(hall.hall_name);
          }
        }
      } else if (hall.dept_counts && Object.keys(hall.dept_counts).length > 0) {
        for (const [dept, count] of Object.entries(hall.dept_counts)) {
          if (count > 0) {
            if (!subMap[dept]) subMap[dept] = { counts: [], halls: [] };
            subMap[dept].counts.push(count);
            subMap[dept].halls.push(hall.hall_name);
          }
        }
      } else {
        const subs = hall.subjects && hall.subjects.length > 0
          ? hall.subjects
          : (hall.departments || ['General']);
        const countEach = Math.floor(hall.students.length / subs.length);
        for (const s of subs) {
          if (!subMap[s]) subMap[s] = { counts: [], halls: [] };
          subMap[s].counts.push(countEach);
          subMap[s].halls.push(hall.hall_name);
        }
      }
    }

    const maxHalls = Math.max(3, ...Object.values(subMap).map((info) => info.halls.length));
    const hallHeaders = Array.from({ length: maxHalls }, (_, i) => `Hall ${i + 1}`);
    previewRows.push(['Subject / Course Code', 'Count Breakdown', ...hallHeaders]);

    for (const [sub, info] of Object.entries(subMap).sort(([a], [b]) => a.localeCompare(b))) {
      const breakdown = info.counts.join(' + ') + (info.counts.length > 1 ? ` = ${info.counts.reduce((a, b) => a + b, 0)}` : '');
      const hallCols = Array.from({ length: maxHalls }, (_, i) => info.halls[i] || '');
      previewRows.push([sub, breakdown, ...hallCols]);
    }

    previewRows.push([]);
    previewRows.push(['--- INDIVIDUAL HALL SEATING PLANS ---']);
    previewRows.push([]);

    for (const hall of hallsData) {
      previewRows.push([
        'Hall',
        hall.hall_name,
        'Dept',
        hall.department,
        'Pattern',
        hall.pattern || 'Zigzag',
        'Rows',
        hall.rows,
        'Cols',
        hall.cols,
        'Students',
        hall.students.length,
      ]);
      const seatGrid = buildSeatGridForPattern({ rows: hall.rows, cols: hall.cols, pattern: hall.pattern, students: hall.students });
      for (let rowIndex = 0; rowIndex < hall.rows; rowIndex += 1) {
        const rowCells: Array<string | number> = [];
        for (let colIndex = 0; colIndex < hall.cols; colIndex += 1) {
          rowCells.push(seatGrid[rowIndex][colIndex] || '');
        }
        previewRows.push(rowCells);
      }
      previewRows.push([]);
    }
    return previewRows;
  };

  const getEffectiveExportHallsData = async (): Promise<ExportHallData[]> => {
    if (optimizedHallsData && optimizedHallsData.length > 0) {
      return optimizedHallsData;
    }
    if (generatedHallsData && generatedHallsData.length > 0) {
      return generatedHallsData;
    }
    const fresh = await buildHallExportData();
    setGeneratedHallsData(fresh);
    return fresh;
  };

  const handlePreviewExcel = async () => {
    if (plan.length === 0) {
      setError('Generate a hall plan before previewing Excel.');
      return;
    }
    if (!examTitle.trim() || !semesterText.trim() || !examDate.trim()) {
      setError('Please fill in exam title, semester, and date.');
      return;
    }
    setError(null);
    setMessage(null);
    setIsExportingExcel(true);
    try {
      const hallsData = await getEffectiveExportHallsData();
      if (hallsData.length === 0) {
        setError('No hall has students to export. Please check the plan and student data.');
        return;
      }
      setExcelPreviewRows(buildExcelPreviewRows(hallsData));
      setIsPreviewOpen(true);
      setMessage(optimizedHallsData && optimizedHallsData.length > 0 ? 'Excel preview is ready (Optimized).' : 'Excel preview is ready.');
    } catch (err) {
      console.error('Preview error:', err);
      setError(err instanceof Error ? err.message : 'Unable to preview Excel.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleOptimizeSpaces = async () => {
    if (plan.length === 0) {
      setError('Generate a hall plan before optimizing spaces.');
      return;
    }
    if (!examTitle.trim() || !semesterText.trim() || !examDate.trim()) {
      setError('Please fill in exam title, semester, and date before optimizing.');
      return;
    }
    setError(null);
    setMessage(null);
    setIsOptimizing(true);
    try {
      const hallsData = await buildHallExportData();
      if (hallsData.length === 0) {
        setError('No hall data available to optimize.');
        return;
      }
      const hasGaps = hallsData.some((h) => h.students.some((s) => s === ''));
      if (!hasGaps) {
        setMessage('All halls are fully packed — no empty seats to optimize.');
        return;
      }
      const hallsWithDepts = hallsData.map((h) => ({
        ...h,
        studentDepts: h.studentDepts || [],
      }));
      const originalCount = hallsData.length;
      const optimized = optimizeHallSpaces(hallsWithDepts);
      const freedCount = originalCount - optimized.length;
      setOptimizedHallsData(optimized);
      const donorTotal = optimized.reduce((sum, h) => sum + h.donorIndices.size, 0);
      const shiftedTotal = optimized.reduce((sum, h) => sum + h.shiftedIndices.size, 0);
      setMessage(
        `Optimization complete! ${optimized.length} halls remain.` +
        (freedCount > 0 ? ` ${freedCount} hall(s) freed up.` : '') +
        (donorTotal > 0 ? ` ${donorTotal} seats filled by random dept (amber).` : '') +
        (shiftedTotal > 0 ? ` ${shiftedTotal} overflow students shifted (teal).` : '')
      );
    } catch (err) {
      console.error('Optimization error:', err);
      setError(err instanceof Error ? err.message : 'Unable to optimize hall spaces.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const canGeneratePlan = hasRows && configuration.length > 0;

  const buildAllocationBlocks = async (): Promise<AllocationBlock[]> => {
    const blocks = await Promise.all(
      configuration.map(async (item) => {
        let response: CoeStudentsMapResponse | null = null;
        try {
          response = await fetchCoeStudentsMap({ department: item.department, semester: item.semester });
        } catch {
          response = null;
        }

        return {
          department: item.department,
          semester: item.semester,
          session: item.session,
          blockKey: getBlockKey(item.department, item.semester, item.session),
          classKey: getClassKey(item.department, item.semester),
          isGeaOnly: isBlockGaeaOnly(response),
        };
      })
    );

    return blocks;
  };

  const generatePlan = async () => {
    setError(null);
    if (!canGeneratePlan) {
      setError('Add at least one department/semester configuration and ensure halls are available.');
      return;
    }

    setIsLoading(true);
    try {
      const blocks = await buildAllocationBlocks();
      if (blocks.length === 0) {
        throw new Error('No valid allocation blocks were loaded.');
      }
      const nextPlan = buildHallPlan(rows, blocks);
      setPlan(nextPlan);
      setOptimizedHallsData(null);
      const freshHalls = await buildHallExportData();
      setGeneratedHallsData(freshHalls);

      // Simultaneously generate & open the Attendance Sheet PDF preview
      try {
        await generatePdfForHalls(freshHalls);
      } catch (pdfErr) {
        console.warn('Simultaneous PDF preview generation note:', pdfErr);
      }

      setMessage('✓ Hall plan generated! Excel export and Attendance Sheet PDF preview are ready.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate hall plan. Please review the selections.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderedPlan = useMemo(() => {
    if (plan.length === 0) return null;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Generated Hall Plan</h2>
          <p className="mt-1 text-sm text-slate-500">Review the suggested department and session allocation for each hall.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-4 py-3">Hall</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Semester</th>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Conflict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.map((row) => (
                <tr key={`${row.hallNumber}-${row.department}-${row.semester}-${row.session}`} className="transition hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.hallNumber}</td>
                  <td className="px-4 py-3 text-slate-700">{row.department}</td>
                  <td className="px-4 py-3 text-slate-700">{row.semester}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700">
                      {row.session}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{row.conflictReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }, [plan]);

  const handleSavePlan = () => {
    if (plan.length === 0) {
      setError('Generate a hall plan before saving it.');
      return;
    }

    let totalSeated = 0;
    if (optimizedHallsData && optimizedHallsData.length > 0) {
      totalSeated = optimizedHallsData.reduce((acc, h) => acc + h.students.filter((s: string) => s !== '').length, 0);
    } else {
      for (const blockKey of Object.keys(studentSelectionMap)) {
        totalSeated += (studentSelectionMap[blockKey] || []).length;
      }
    }

    const newLog: HallAllocationPlanLog = {
      id: `plan_${Date.now()}`,
      savedAt: new Date().toISOString(),
      examTitle: examTitle.trim() || 'Exam Plan',
      semesterText: semesterText.trim() || 'Semester',
      examDate: examDate.trim() || new Date().toLocaleDateString(),
      session: selectedSession,
      departments: Array.from(new Set(configuration.map((c) => c.department))),
      isFirstYearMode,
      totalHalls: rows.length,
      totalStudents: totalSeated,
      rows: JSON.parse(JSON.stringify(rows)),
      configuration: JSON.parse(JSON.stringify(configuration)),
      studentSelectionMap: JSON.parse(JSON.stringify(studentSelectionMap)),
      plan: JSON.parse(JSON.stringify(plan)),
      optimizedHallsData: (optimizedHallsData || generatedHallsData)
        ? (optimizedHallsData || generatedHallsData)!.map((h) => ({
            ...h,
            donorIndices: Array.from((h as any).donorIndices || []),
            shiftedIndices: Array.from((h as any).shiftedIndices || []),
          }))
        : null,
    };

    const updatedLogs = [newLog, ...planLogs];
    setPlanLogs(updatedLogs);
    kvSave(HALL_ALLOCATION_LOGS_KEY, updatedLogs);
    kvSave(HALL_ALLOCATION_PLAN_KEY, newLog);
    kvSave(HALL_ALLOCATION_FINALIZED_KEY, true);
    window.localStorage.setItem(HALL_ALLOCATION_FINALIZED_KEY, 'true');

    // Remove active draft state so the form opens clean for another plan
    kvRemove(HALL_ALLOCATION_PLAN_STATE_KEY);
    window.localStorage.removeItem(HALL_ALLOCATION_PLAN_STATE_KEY);

    // Reset current working form for a new plan
    setPlan([]);
    setConfiguration([]);
    setStudentSelectionMap({});
    setOptimizedHallsData(null);
    setExamTitle('');
    setSemesterText('');
    setExamDate('');
    setError(null);
    setMessage(`Plan "${newLog.examTitle}" saved to logs successfully! A fresh form is now opened to enter another plan.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoadLog = (log: HallAllocationPlanLog) => {
    setError(null);
    if (log.rows && Array.isArray(log.rows) && log.rows.length > 0) {
      setRows(log.rows);
    }
    if (log.configuration && Array.isArray(log.configuration)) {
      setConfiguration(log.configuration);
    }
    if (log.studentSelectionMap) {
      setStudentSelectionMap(log.studentSelectionMap);
    }
    if (log.examTitle !== undefined) setExamTitle(log.examTitle);
    if (log.semesterText !== undefined) setSemesterText(log.semesterText);
    if (log.examDate !== undefined) setExamDate(log.examDate);
    if (log.session) setSelectedSession(log.session);
    if (log.plan && Array.isArray(log.plan)) {
      setPlan(log.plan);
    }
    if (log.optimizedHallsData && Array.isArray(log.optimizedHallsData)) {
      setOptimizedHallsData(
        log.optimizedHallsData.map((h) => ({
          ...h,
          donorIndices: new Set<number>(h.donorIndices || []),
          shiftedIndices: new Set<number>(h.shiftedIndices || []),
        }))
      );
    } else {
      setOptimizedHallsData(null);
    }

    setMessage(`Opened saved plan: ${log.examTitle} (${log.examDate} ${log.session})`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteLog = (logId: string) => {
    const updated = planLogs.filter((l) => l.id !== logId);
    setPlanLogs(updated);
    kvSave(HALL_ALLOCATION_LOGS_KEY, updated);
    setMessage('Plan log removed from history.');
  };

  const handleStartNewPlan = () => {
    setPlan([]);
    setConfiguration([]);
    setStudentSelectionMap({});
    setOptimizedHallsData(null);
    setExamTitle('');
    setSemesterText('');
    setExamDate('');
    kvRemove(HALL_ALLOCATION_PLAN_STATE_KEY);
    window.localStorage.removeItem(HALL_ALLOCATION_PLAN_STATE_KEY);
    setError(null);
    setMessage('Started a fresh plan form. Enter your new details below.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDownloadExcel = async () => {
    if (plan.length === 0) {
      setError('Generate a hall plan before exporting Excel.');
      return;
    }
    if (!examTitle.trim() || !semesterText.trim() || !examDate.trim()) {
      setError('Please fill in exam title, semester, and date.');
      return;
    }
    setError(null);
    setMessage(null);
    setIsExportingExcel(true);
    try {
      const hallsData = await getEffectiveExportHallsData();
      if (hallsData.length === 0) {
        setError('No hall has students to export. Please check the plan and student data.');
        return;
      }

      const payload = JSON.stringify({
        exam_title: examTitle,
        semester_text: semesterText,
        date_str: examDate,
        session: plan[0]?.session || 'FN',
        plan_mode: isFirstYearMode ? 'first_year' : 'regular',
        is_first_year: isFirstYearMode,
        halls: hallsData.map((hall) => ({
          hall_name: hall.hall_name,
          department: hall.department,
          departments: hall.departments,
          dept_counts: hall.dept_counts,
          subjects: hall.subjects,
          subject_counts: hall.subject_counts,
          rows: hall.rows,
          cols: hall.cols,
          pattern: hall.pattern,
          students: hall.students,
          student_depts: hall.studentDepts,
          student_subjects: hall.student_subjects,
          student_courses: hall.student_courses,
          student_sections: hall.student_sections || [],
          donor_indices: Array.from((hall as any).donorIndices || []),
          shifted_indices: Array.from((hall as any).shiftedIndices || []),
        })),
      });

      const response = await fetchWithAuth('/api/coe/seating-arrangement-excel/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const err = await response.json();
          errorMsg = err.error || errorMsg;
        } catch {
          // Keep default error message
        }
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `seating_arrangement_${examDate.replace(/\//g, '-')}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);
      setMessage('Excel file downloaded successfully.');
    } catch (err) {
      console.error('Export error:', err);
      setError(err instanceof Error ? err.message : 'Unable to export Excel.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const [isPublishing, setIsPublishing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState('attendance_sheet.pdf');

  const openPdfPreview = (blobUrl: string, filename: string) => {
    // Revoke any previous preview URL
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(blobUrl);
    setPdfPreviewFilename(filename);
  };

  const closePdfPreview = () => {
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(null);
    setPdfPreviewFilename('attendance_sheet.pdf');
  };

  const downloadPdfFromPreview = () => {
    if (!pdfPreviewUrl) return;
    const anchor = document.createElement('a');
    anchor.href = pdfPreviewUrl;
    anchor.download = pdfPreviewFilename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setMessage('✓ Attendance Sheet PDF downloaded successfully.');
  };

  const generatePdfForHalls = async (
    hallsToExport: ExportHallData[],
    overrideTitle?: string,
    overrideSem?: string,
    overrideDate?: string,
    overrideSession?: string
  ) => {
    const title = overrideTitle || examTitle.trim() || 'Semester Examinations';
    const sem = overrideSem || semesterText.trim() || 'Seating Plan';
    const date = overrideDate || examDate.trim() || new Date().toISOString().slice(0, 10);
    const sess = overrideSession || selectedSession || plan[0]?.session || 'FN';

    const studentNamesMap: Record<string, string> = {};
    for (const item of configuration) {
      const bKey = getBlockKey(item.department, item.semester, item.session, item.courseCode);
      const regs = studentSelectionMap[bKey] || [];
      selectionStudents.forEach((st) => {
        if (st.reg_no && st.name) studentNamesMap[st.reg_no] = st.name;
      });
      for (const reg of regs) {
        if (!studentNamesMap[reg]) {
          studentNamesMap[reg] = '';
        }
      }
    }

    const payload = JSON.stringify({
      exam_title: title,
      semester_text: sem,
      date_str: date,
      session: sess,
      plan_mode: isFirstYearMode ? 'first_year' : 'regular',
      is_first_year: isFirstYearMode,
      halls: hallsToExport.map((hall) => ({
        hall_name: hall.hall_name,
        department: hall.department,
        departments: hall.departments,
        dept_counts: hall.dept_counts,
        rows: hall.rows,
        cols: hall.cols,
        pattern: hall.pattern,
        students: hall.students,
        student_depts: hall.studentDepts,
        student_subjects: (hall as any).student_subjects || [],
        student_courses: (hall as any).student_courses || [],
        student_sections: (hall as any).student_sections || [],
      })),
      student_names_map: studentNamesMap,
    });

    const response = await fetchWithAuth('/api/coe/hall-attendance-pdf/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const err = await response.json();
        errorMsg = err.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error('Generated PDF is empty.');
    }

    const url = window.URL.createObjectURL(blob);
    const filename = `attendance_sheet_${date.replace(/\//g, '-')}_${sess}.pdf`;
    openPdfPreview(url, filename);
  };

  const handleDownloadAttendancePdf = async () => {
    if (plan.length === 0) {
      setError('Generate a hall plan before exporting Attendance PDF.');
      return;
    }
    setError(null);
    setMessage(null);
    setIsExportingPdf(true);
    try {
      const hallsData = await getEffectiveExportHallsData();
      if (hallsData.length === 0) {
        setError('No hall has students to export. Please check the plan and student data.');
        return;
      }
      await generatePdfForHalls(hallsData);
    } catch (err) {
      console.error('PDF export error:', err);
      setError(err instanceof Error ? err.message : 'Unable to export Attendance PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadAttendancePdfForLog = async (log: HallAllocationPlanLog) => {
    setError(null);
    setMessage(null);
    setIsExportingPdf(true);
    try {
      const rawHalls: (ExportHallData & { studentDepts: string[] })[] = [];
      const planHalls = Array.from(new Set(log.plan.map((p) => p.hallNumber)));

      // Build a complete student-names map from all reg_nos saved in this log
      const logStudentNamesMap: Record<string, string> = {};
      for (const regs of Object.values(log.studentSelectionMap || {})) {
        for (const reg of (regs || [])) {
          if (reg) logStudentNamesMap[reg] = ''; // backend will fill names from DB
        }
      }

      for (const hallNumber of planHalls) {
        const row = log.rows.find((r) => r.hallNumber === hallNumber);
        if (!row) continue;
        const hallPlanEntries = log.plan.filter((p) => p.hallNumber === hallNumber);
        const depts = Array.from(new Set(hallPlanEntries.map((p) => p.department))).join(' / ');
        const hallStudents: string[] = [];
        const studentDepts: string[] = [];

        for (const entry of hallPlanEntries) {
          // ✅ FIX: Always include courseCode so the key matches what was stored during plan creation
          const blockKeyWithCourse = entry.courseCode
            ? getBlockKey(entry.department, entry.semester, entry.session, entry.courseCode)
            : null;
          const blockKeyWithout = getBlockKey(entry.department, entry.semester, entry.session);

          // Prefer the course-code-specific key; fall back to the bare key
          const regs =
            (blockKeyWithCourse && (log.studentSelectionMap[blockKeyWithCourse] || []).length > 0
              ? log.studentSelectionMap[blockKeyWithCourse]
              : log.studentSelectionMap[blockKeyWithout]) || [];

          regs.forEach((reg) => {
            hallStudents.push(reg);
            studentDepts.push(entry.department);
          });
        }

        const maxSeats = row.rows * row.cols;
        while (hallStudents.length < maxSeats) {
          hallStudents.push('');
          studentDepts.push('');
        }

        const counts: Record<string, number> = {};
        for (let i = 0; i < maxSeats; i++) {
          const s = hallStudents[i];
          const d = studentDepts[i];
          if (s && d) counts[d] = (counts[d] || 0) + 1;
        }

        rawHalls.push({
          hall_name: row.hallNumber,
          department: depts,
          departments: Object.keys(counts),
          dept_counts: counts,
          rows: row.rows,
          cols: row.cols,
          pattern: row.pattern,
          students: hallStudents.slice(0, maxSeats),
          studentDepts: studentDepts.slice(0, maxSeats),
        });
      }

      // Prefer optimizedHallsData (has correct interleaved seat assignments);
      // fall back to rawHalls built from plan + studentSelectionMap
      const hallsToExport = log.optimizedHallsData && log.optimizedHallsData.length > 0
        ? log.optimizedHallsData
        : rawHalls;

      const payload = JSON.stringify({
        exam_title: log.examTitle,
        semester_text: log.semesterText,
        date_str: log.examDate,
        session: log.session || 'FN',
        plan_mode: log.isFirstYearMode ? 'first_year' : 'regular',
        is_first_year: log.isFirstYearMode ?? false,
        halls: hallsToExport.map((hall) => ({
          hall_name: hall.hall_name,
          department: hall.department,
          departments: hall.departments,
          dept_counts: hall.dept_counts,
          rows: hall.rows,
          cols: hall.cols,
          pattern: hall.pattern,
          students: hall.students,
          student_depts: hall.studentDepts,
          student_subjects: (hall as any).student_subjects || [],
          student_courses: (hall as any).student_courses || [],
          student_sections: (hall as any).student_sections || [],
        })),
        student_names_map: logStudentNamesMap,
      });

      const response = await fetchWithAuth('/api/coe/hall-attendance-pdf/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (!response.ok) throw new Error('Failed to generate attendance PDF for log.');

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Generated PDF is empty.');
      }

      const url = window.URL.createObjectURL(blob);
      const filename = `attendance_sheet_${log.examTitle.replace(/\s+/g, '_')}_${(log.examDate || '').replace(/\//g, '-')}.pdf`;
      openPdfPreview(url, filename);
    } catch (err: any) {
      setError(err?.message || 'Unable to generate attendance PDF for log.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePublishPlan = async () => {
    if (plan.length === 0) {
      setError('Generate a hall plan before publishing.');
      return;
    }
    if (!examTitle.trim() || !semesterText.trim() || !examDate.trim()) {
      setError('Please fill in exam title, semester, and exam date before publishing.');
      return;
    }
    setError(null);
    setMessage(null);
    setIsPublishing(true);
    try {
      const hallsData = await getEffectiveExportHallsData();
      if (hallsData.length === 0) {
        setError('No hall has students to publish.');
        return;
      }

      const payload = JSON.stringify({
        exam_title: examTitle,
        semester_text: semesterText,
        date_str: examDate,
        session: selectedSession || plan[0]?.session || 'FN',
        halls: hallsData.map((hall) => ({
          hall_name: hall.hall_name,
          department: hall.department,
          departments: hall.departments,
          dept_counts: hall.dept_counts,
          rows: hall.rows,
          cols: hall.cols,
          pattern: hall.pattern,
          students: hall.students,
          student_depts: hall.studentDepts,
        })),
      });

      const res = await fetchWithAuth('/api/coe/publish-hall-plan/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
        try {
          const err = await res.json();
          errorMsg = err.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const resData = await res.json();
      setMessage(
        `✓ Hall Plan Published! ${resData.published_count || ''} students can now view their assigned hall and seat position in their IDCS student portal under "Hall Plan".`
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Publish error:', err);
      setError(err instanceof Error ? err.message : 'Unable to publish hall plan.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishLog = async (log: HallAllocationPlanLog) => {
    setError(null);
    setMessage(null);
    try {
      const rawHalls: (ExportHallData & { studentDepts: string[] })[] = [];
      const planHalls = Array.from(new Set(log.plan.map((p) => p.hallNumber)));

      for (const hallNumber of planHalls) {
        const row = log.rows.find((r) => r.hallNumber === hallNumber);
        if (!row) continue;
        const hallPlanEntries = log.plan.filter((p) => p.hallNumber === hallNumber);
        const depts = Array.from(new Set(hallPlanEntries.map((p) => p.department))).join(' / ');
        const hallStudents: string[] = [];
        const studentDepts: string[] = [];

        for (const entry of hallPlanEntries) {
          // ✅ FIX: include courseCode so key matches what was stored during plan creation
          const blockKeyWithCourse = entry.courseCode
            ? getBlockKey(entry.department, entry.semester, entry.session, entry.courseCode)
            : null;
          const blockKeyWithout = getBlockKey(entry.department, entry.semester, entry.session);
          const regs =
            (blockKeyWithCourse && (log.studentSelectionMap[blockKeyWithCourse] || []).length > 0
              ? log.studentSelectionMap[blockKeyWithCourse]
              : log.studentSelectionMap[blockKeyWithout]) || [];
          regs.forEach((reg) => {
            hallStudents.push(reg);
            studentDepts.push(entry.department);
          });
        }

        const maxSeats = row.rows * row.cols;
        while (hallStudents.length < maxSeats) {
          hallStudents.push('');
          studentDepts.push('');
        }

        const counts: Record<string, number> = {};
        for (let i = 0; i < maxSeats; i++) {
          const s = hallStudents[i];
          const d = studentDepts[i];
          if (s && d) {
            counts[d] = (counts[d] || 0) + 1;
          }
        }

        rawHalls.push({
          hall_name: row.hallNumber,
          department: depts,
          departments: Object.keys(counts),
          dept_counts: counts,
          rows: row.rows,
          cols: row.cols,
          pattern: row.pattern,
          students: hallStudents.slice(0, maxSeats),
          studentDepts: studentDepts.slice(0, maxSeats),
        });
      }

      const hallsToPublish = log.optimizedHallsData && log.optimizedHallsData.length > 0
        ? log.optimizedHallsData
        : rawHalls;

      const payload = JSON.stringify({
        exam_title: log.examTitle,
        semester_text: log.semesterText,
        date_str: log.examDate,
        session: log.session || 'FN',
        halls: hallsToPublish.map((hall) => ({
          hall_name: hall.hall_name,
          department: hall.department,
          departments: hall.departments,
          dept_counts: hall.dept_counts,
          rows: hall.rows,
          cols: hall.cols,
          pattern: hall.pattern,
          students: hall.students,
          student_depts: hall.studentDepts,
        })),
      });

      const res = await fetchWithAuth('/api/coe/publish-hall-plan/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (!res.ok) throw new Error('Failed to publish log plan.');
      const resData = await res.json();
      setMessage(`✓ Published saved plan "${log.examTitle}" (${resData.published_count || ''} students can view their hall & seat in IDCS).`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err?.message || 'Unable to publish saved plan.');
    }
  };

  const handleDownloadExcelFromLog = async (log: HallAllocationPlanLog) => {
    setError(null);
    setMessage(null);
    setIsExportingExcel(true);
    try {
      const rawHalls: (ExportHallData & { studentDepts: string[] })[] = [];
      const planHalls = Array.from(new Set(log.plan.map((p) => p.hallNumber)));

      for (const hallNumber of planHalls) {
        const row = log.rows.find((r) => r.hallNumber === hallNumber);
        if (!row) continue;
        const hallPlanEntries = log.plan.filter((p) => p.hallNumber === hallNumber);
        const depts = Array.from(new Set(hallPlanEntries.map((p) => p.department))).join(' / ');
        const hallStudents: string[] = [];
        const studentDepts: string[] = [];

        for (const entry of hallPlanEntries) {
          const blockKeyWithCourse = entry.courseCode
            ? getBlockKey(entry.department, entry.semester, entry.session, entry.courseCode)
            : null;
          const blockKeyWithout = getBlockKey(entry.department, entry.semester, entry.session);
          const regs =
            (blockKeyWithCourse && (log.studentSelectionMap[blockKeyWithCourse] || []).length > 0
              ? log.studentSelectionMap[blockKeyWithCourse]
              : log.studentSelectionMap[blockKeyWithout]) || [];
          regs.forEach((reg) => {
            hallStudents.push(reg);
            studentDepts.push(entry.department);
          });
        }

        const maxSeats = row.rows * row.cols;
        while (hallStudents.length < maxSeats) {
          hallStudents.push('');
          studentDepts.push('');
        }

        const counts: Record<string, number> = {};
        for (let i = 0; i < maxSeats; i++) {
          const s = hallStudents[i];
          const d = studentDepts[i];
          if (s && d) counts[d] = (counts[d] || 0) + 1;
        }

        rawHalls.push({
          hall_name: row.hallNumber,
          department: depts,
          departments: Object.keys(counts),
          dept_counts: counts,
          rows: row.rows,
          cols: row.cols,
          pattern: row.pattern,
          students: hallStudents.slice(0, maxSeats),
          studentDepts: studentDepts.slice(0, maxSeats),
        });
      }

      const hallsToExport = log.optimizedHallsData && log.optimizedHallsData.length > 0
        ? log.optimizedHallsData
        : rawHalls;

      if (hallsToExport.length === 0) {
        setError('No hall data found in this saved plan.');
        return;
      }

      const payload = JSON.stringify({
        exam_title: log.examTitle,
        semester_text: log.semesterText,
        date_str: log.examDate,
        session: log.session || 'FN',
        plan_mode: log.isFirstYearMode ? 'first_year' : 'regular',
        is_first_year: log.isFirstYearMode ?? false,
        halls: hallsToExport.map((hall) => ({
          hall_name: hall.hall_name,
          department: hall.department,
          departments: hall.departments,
          dept_counts: hall.dept_counts,
          rows: hall.rows,
          cols: hall.cols,
          pattern: hall.pattern,
          students: hall.students,
          student_depts: hall.studentDepts,
          student_subjects: (hall as any).student_subjects || [],
          student_courses: (hall as any).student_courses || [],
          student_sections: (hall as any).student_sections || [],
          donor_indices: Array.from((hall as any).donorIndices || []),
          shifted_indices: Array.from((hall as any).shiftedIndices || []),
        })),
      });

      const response = await fetchWithAuth('/api/coe/seating-arrangement-excel/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const err = await response.json();
          errorMsg = err.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      if (blob.size === 0) throw new Error('Downloaded file is empty');

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `seating_${log.examTitle.replace(/\s+/g, '_')}_${(log.examDate || '').replace(/\//g, '-')}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
      setMessage(`✓ Excel downloaded for saved plan "${log.examTitle}".`);
    } catch (err: any) {
      setError(err?.message || 'Unable to download Excel for saved plan.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleBack = () => navigate('/coe/hall-allocation');

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-4">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">Hall Allocation & Seating Plan</h1>
                <p className="text-xs font-medium text-slate-500">
                  Automated conflict-free desk allocation, section-wise distribution & multi-department optimization
                </p>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Plan Mode:</span>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFirstYearMode(false)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    !isFirstYearMode
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Regular (Dept-wise)
                </button>
                <button
                  type="button"
                  onClick={() => setIsFirstYearMode(true)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    isFirstYearMode
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  First Year (Section-wise)
                </button>
              </div>
              {isFirstYearMode ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
                  Alternating Sections across desks
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  Alternating Departments across desks
                </span>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={handleStartNewPlan}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
              title="Reset form and start entering a new plan"
            >
              <Plus className="h-3.5 w-3.5" /> New Plan
            </button>
            <button
              type="button"
              onClick={generatePlan}
              disabled={!canGeneratePlan || isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isLoading ? 'Generating...' : 'Generate Plan'}
            </button>
            <button
              type="button"
              onClick={handleOptimizeSpaces}
              disabled={plan.length === 0 || isOptimizing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              {isOptimizing ? 'Optimizing...' : 'Optimize Spaces'}
            </button>
            <button
              type="button"
              onClick={handlePreviewExcel}
              disabled={plan.length === 0 || isExportingExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              Preview Excel
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={plan.length === 0 || isExportingExcel}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {isExportingExcel ? 'Downloading...' : 'Excel'}
            </button>
            <button
              type="button"
              onClick={handleDownloadAttendancePdf}
              disabled={plan.length === 0 || isExportingPdf}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              title="Download official hall attendance sheet PDF"
            >
              <FileText className="h-3.5 w-3.5" />
              {isExportingPdf ? 'PDF...' : 'Attendance PDF'}
            </button>
            <button
              type="button"
              onClick={handleSavePlan}
              disabled={plan.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              title="Save plan as a log and open a new blank form"
            >
              Save Plan
            </button>
            <button
              type="button"
              onClick={handlePublishPlan}
              disabled={plan.length === 0 || isPublishing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              title="Publish plan to student IDCS portal"
            >
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
            {message}
          </div>
        ) : null}
      </div>

      {/* Exam Details Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">Exam Details (for Export & Seating Plans)</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Exam Title</label>
            <input
              type="text"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none transition-all"
              placeholder="e.g., CIA-1 / Model Exam"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Semester</label>
            <select
              value={semesterText}
              onChange={(e) => setSemesterText(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none transition-all"
            >
              {semesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Exam Date</label>
            <div className="mt-1.5 flex gap-2">
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => handleLoadFromTimetable()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 whitespace-nowrap shadow-2xs transition-all"
                title="Load scheduled courses for this date & session from Exam Timetable"
              >
                <Calendar className="h-3.5 w-3.5 text-indigo-600" /> Load Timetable
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Department</label>
              <select
                value={selectedDepartment}
                onChange={(event) => setSelectedDepartment(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 shadow-xs transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {departments
                  .filter((department) => department && department.trim().toUpperCase() !== 'ALL')
                  .map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Semester</label>
              <select
                value={selectedSemester}
                onChange={(event) => setSelectedSemester(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 shadow-xs transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {semesters.map((semester) => (
                  <option key={semester} value={semester}>
                    {semester}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Course / Subject</label>
              <select
                value={selectedCourseCode}
                onChange={(event) => setSelectedCourseCode(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 shadow-xs transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="ALL">All Subjects / Courses</option>
                {courseOptions.map((opt) => (
                  <option key={opt.course_code} value={opt.course_code}>
                    {opt.course_code} - {opt.course_name} ({opt.count} students)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Session</label>
              <select
                value={selectedSession}
                onChange={(event) => setSelectedSession(event.target.value as 'FN' | 'AN')}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 shadow-xs transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {DEFAULT_SESSION_OPTIONS.map((session) => (
                  <option key={session} value={session}>{session}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleAddConfiguration}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 active:scale-[0.99]"
              >
                <Plus className="h-4 w-4" /> Add Block
              </button>
              {configuration.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllBlocks}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-100 whitespace-nowrap"
                  title="Clear all department blocks"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Semester</th>
                <th className="px-4 py-3">Subject / Course Code</th>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {configuration.map((item, index) => {
                const blockKey = getBlockKey(item.department, item.semester, item.session, item.courseCode);
                const selectedArr = studentSelectionMap[blockKey];
                const countBadge = selectedArr !== undefined ? ` (${selectedArr.length} Selected)` : '';

                return (
                  <tr key={`${item.department}-${item.semester}-${item.courseCode || 'all'}-${item.session}-${index}`} className="transition hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.department}</td>
                    <td className="px-4 py-3 text-slate-700">{item.semester}</td>
                    <td className="px-4 py-3 font-medium text-indigo-700">
                      {item.courseCode ? `${item.courseCode}${item.courseName ? ` (${item.courseName})` : ''}` : 'All Subjects'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700">
                        {item.session}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openStudentSelection(item.department, item.semester, item.session, item.courseCode, item.courseName)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                        >
                          <Users className="h-3.5 w-3.5" /> Select Students{countBadge}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveConfiguration(index)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 hover:border-rose-200"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!configuration.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    Add department, semester, and course/subject blocks to configure student allocations.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {renderedPlan}

      {optimizedHallsData && optimizedHallsData.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Optimized Hall Seating</h2>
              <p className="mt-1 text-sm text-slate-500">
                Empty gaps filled — overflow students redistributed without same-dept conflicts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOptimizedHallsData(null)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
            >
              Clear
            </button>
          </div>

          {/* Legend */}
          <div className="mb-5 flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-400" />
              Random Dept (Filled Gap)
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-teal-400" />
              Shifted Students (Overflow)
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-slate-300" />
              Regular Students
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-400">
              <span className="inline-block h-2.5 w-2.5 rounded-xs border border-slate-200" />
              Empty Seat
            </span>
          </div>

          <div className="space-y-6">
            {optimizedHallsData.map((hall) => {
              const seatGrid = buildSeatGridForPattern({
                rows: hall.rows,
                cols: hall.cols,
                pattern: hall.pattern,
                students: hall.students,
              });
              // Build role grid: map each (row,col) position to donor/shifted/normal/empty
              const roleGrid: string[][] = Array.from({ length: hall.rows }, () =>
                Array(hall.cols).fill('empty')
              );
              const patternPositions = getPatternPositions(hall.rows, hall.cols, hall.pattern);
              for (let idx = 0; idx < patternPositions.length; idx++) {
                const [r, c] = patternPositions[idx];
                if (hall.students[idx]) {
                  if (hall.donorIndices.has(idx)) {
                    roleGrid[r][c] = 'donor';
                  } else if (hall.shiftedIndices.has(idx)) {
                    roleGrid[r][c] = 'shifted';
                  } else {
                    roleGrid[r][c] = 'normal';
                  }
                }
              }
              const filled = hall.students.filter((s) => s !== '').length;
              const donorCount = hall.donorIndices.size;
              const shiftedCount = hall.shiftedIndices.size;
              return (
                <div key={hall.hall_name} className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-xs">
                  <div className="mb-3 flex flex-wrap items-center gap-2.5">
                    <h3 className="text-base font-bold text-slate-800">{hall.hall_name}</h3>
                    <span className="text-sm font-medium text-slate-500">{hall.department}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {filled} / {hall.rows * hall.cols} seated
                    </span>
                    {donorCount > 0 && (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                        +{donorCount} random dept filled
                      </span>
                    )}
                    {shiftedCount > 0 && (
                      <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                        +{shiftedCount} overflow shifted in
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="border-separate" style={{ borderSpacing: '3px' }}>
                      <tbody>
                        {Array.from({ length: hall.rows }, (_, rowIdx) => (
                          <tr key={rowIdx}>
                            {Array.from({ length: hall.cols }, (_, colIdx) => {
                              const role = roleGrid[rowIdx][colIdx];
                              const student = seatGrid[rowIdx][colIdx];
                              const cellClass =
                                role === 'donor'
                                  ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold ring-1 ring-amber-200'
                                  : role === 'shifted'
                                  ? 'bg-teal-50 border-teal-400 text-teal-900 font-semibold ring-1 ring-teal-200'
                                  : role === 'normal'
                                  ? 'bg-slate-50 border-slate-200 text-slate-800 font-medium'
                                  : 'bg-slate-50/30 border-dashed border-slate-200 text-slate-400';
                              return (
                                <td key={colIdx} title={student || 'Empty seat'}>
                                  <div
                                    className={`rounded-lg border px-3 py-1.5 text-center font-mono text-xs transition-all whitespace-nowrap shadow-2xs ${cellClass}`}
                                    style={{ minWidth: '140px' }}
                                  >
                                    {student || '\u2014'}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Saved Plan Logs (History) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              Saved Plan Logs
              <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                {planLogs.length} Saved
              </span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Whenever you save a plan, it is stored here as a log. Click on any log to immediately load and edit it.
            </p>
          </div>
        </div>

        {planLogs.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            No saved plan logs yet. Once you generate and click <strong className="font-semibold text-slate-700">Save Plan</strong>, the plan will be logged here and a fresh form will be opened to enter your next plan.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {planLogs.map((log) => (
              <div
                key={log.id}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4.5 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-800 transition group-hover:text-indigo-600">
                      {log.examTitle}
                    </h3>
                    <span className="rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700">
                      {log.session}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Date: <strong className="text-slate-800">{log.examDate}</strong> | {log.semesterText}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {log.departments.map((dept) => (
                      <span
                        key={dept}
                        className="rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700"
                      >
                        {dept}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    <span>🏛 {log.totalHalls} Halls</span>
                    <span>👥 {log.totalStudents} Students</span>
                    {log.optimizedHallsData && (
                      <span className="font-semibold text-teal-700">✦ Optimized</span>
                    )}
                    {log.isFirstYearMode && (
                      <span className="rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">1st Yr</span>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    Saved: {new Date(log.savedAt).toLocaleString()}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-1.5 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => handleLoadLog(log)}
                    className="flex-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-center text-xs font-bold text-white shadow-2xs transition hover:bg-indigo-700"
                  >
                    Open Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadExcelFromLog(log)}
                    disabled={isExportingExcel}
                    className="rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Download seating arrangement Excel for this plan"
                  >
                    📊 Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadAttendancePdfForLog(log)}
                    className="rounded-lg bg-indigo-700 px-2 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-indigo-800"
                    title="Download attendance sheet PDF for this plan"
                  >
                    📄 PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePublishLog(log)}
                    className="rounded-lg bg-slate-800 px-2 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-slate-900"
                    title="Publish this saved plan to student IDCS portal"
                  >
                    📢 Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLog(log.id)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-rose-600 shadow-2xs transition hover:bg-rose-50 hover:border-rose-200"
                    title="Delete this saved log"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectionBlockKey ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Student Selection — <span className="text-emerald-700 font-extrabold">{(studentSelectionMap[selectionBlockKey] || []).length} / {selectionStudents.length} Selected</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{selectionBlockKey.replace(/::/g, ' • ')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectionBlockKey(null);
                  setSelectionSearch('');
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Done
              </button>
            </div>

            <div className="border-b border-slate-200 bg-white px-6 py-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={selectionSearch}
                    onChange={(event) => setSelectionSearch(event.target.value)}
                    placeholder="Search by student name, register number, or section..."
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/60 pl-9 pr-3 py-2 text-xs font-medium focus:border-indigo-500 focus:bg-white focus:outline-none transition-all"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="whitespace-nowrap rounded-lg bg-emerald-50 border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800">
                    Selected: {(studentSelectionMap[selectionBlockKey] || []).length} / {selectionStudents.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleAllVisibleSelection(true)}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAllVisibleSelection(false)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Unselect All
                  </button>
                </div>
              </div>

              {/* Student Groups bulk selection chips */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mr-1">
                    <Users className="w-3.5 h-3.5 text-indigo-600" /> Groups:
                  </span>
                  {activeBlockGroups.map((grp) => {
                    const grpRegs = new Set(grp.regNos || []);
                    const blockInGrp = selectionStudents.filter((s) => grpRegs.has(s.reg_no));
                    const selectedCount = blockInGrp.filter((s) => (studentSelectionMap[selectionBlockKey] || []).includes(s.reg_no)).length;
                    const isAll = blockInGrp.length > 0 && selectedCount === blockInGrp.length;
                    return (
                      <button
                        key={grp.name}
                        type="button"
                        onClick={() => toggleGroupSelection(grp.name, !isAll)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                          isAll
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : selectedCount > 0
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                        title={`${isAll ? 'Unselect' : 'Select'} group ${grp.name} (${selectedCount}/${blockInGrp.length} selected)`}
                      >
                        {isAll && <Check className="w-3 h-3" />}
                        <span>{grp.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isAll ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                          {selectedCount}/{blockInGrp.length}
                        </span>
                      </button>
                    );
                  })}
                  {activeBlockGroups.length === 0 && (
                    <span className="text-xs text-slate-500 italic">No groups defined for this student set</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Manage Groups
                </button>
              </div>

              {/* Section bulk selection chips */}
              {availableSectionsInBlock.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-blue-600" /> Sections:
                  </span>
                  {availableSectionsInBlock.map((sec) => {
                    const secStudents = selectionStudents.filter((s) => (s.section || '').trim().toUpperCase() === sec);
                    const selectedCount = secStudents.filter((s) => (studentSelectionMap[selectionBlockKey] || []).includes(s.reg_no)).length;
                    const isAll = secStudents.length > 0 && selectedCount === secStudents.length;
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => toggleSectionSelection(sec, !isAll)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                          isAll
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : selectedCount > 0
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                        title={`${isAll ? 'Unselect' : 'Select'} Section ${sec} (${selectedCount}/${secStudents.length} selected)`}
                      >
                        {isAll && <Check className="w-3 h-3" />}
                        <span>Sec {sec}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isAll ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                          {selectedCount}/{secStudents.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Range & Quick Count toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold uppercase tracking-wider text-slate-600 mr-1">Quick Count:</span>
                  {[15, 25, 30, 40, 50].map((count) => {
                    if (count > selectionStudents.length) return null;
                    return (
                      <button
                        key={count}
                        type="button"
                        onClick={() => selectFirstNStudents(count)}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                      >
                        First {count}
                      </button>
                    );
                  })}
                </div>

                {/* Range Selection tool */}
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-600 uppercase tracking-wider">Range:</span>
                  <input
                    type="number"
                    min="1"
                    max={selectionStudents.length || 1}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="w-14 rounded-md border border-slate-300 px-2 py-0.5 text-center text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
                    placeholder="From"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="number"
                    min="1"
                    max={selectionStudents.length || 1}
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="w-14 rounded-md border border-slate-300 px-2 py-0.5 text-center text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
                    placeholder="To"
                  />
                  <button
                    type="button"
                    onClick={() => selectRangeStudents(parseInt(rangeStart, 10) || 1, parseInt(rangeEnd, 10) || selectionStudents.length, true)}
                    className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    Select Range
                  </button>
                  <button
                    type="button"
                    onClick={() => selectRangeStudents(parseInt(rangeStart, 10) || 1, parseInt(rangeEnd, 10) || selectionStudents.length, false)}
                    className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                  >
                    Unselect Range
                  </button>
                </div>
              </div>
            </div>

            <div className="max-h-[52vh] overflow-y-auto px-5 py-4">
              {selectionLoading ? (
                <div className="text-center py-8 text-sm text-slate-500">Loading students...</div>
              ) : visibleSelectionStudents.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500">No students match this search.</div>
              ) : (
                <div className="space-y-2">
                  {visibleSelectionStudents.map((student) => {
                    const selected = (studentSelectionMap[selectionBlockKey] || []).includes(student.reg_no);
                    const studentGroups = savedStudentGroups.filter((g) => (g.regNos || []).includes(student.reg_no));
                    return (
                        <button
                          key={student.reg_no}
                          type="button"
                          onClick={() => toggleStudentSelection(student.reg_no)}
                          className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all ${selected ? 'border-emerald-300 bg-emerald-50/70 shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50/80 hover:border-slate-300'}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`text-sm font-bold font-mono shrink-0 ${selected ? 'text-emerald-700' : 'text-slate-600'}`}>
                              {student.reg_no}
                            </span>
                            <span className={`text-sm font-bold truncate ${selected ? 'text-emerald-900' : 'text-slate-900'}`}>
                              {student.name}
                            </span>
                            {student.section && (
                              <span className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-bold text-blue-700 uppercase shrink-0">
                                Sec {student.section}
                              </span>
                            )}
                            {studentGroups.map((g) => (
                              <span key={g.name} className="rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 shrink-0">
                                {g.name}
                              </span>
                            ))}
                            {student.is_arrear && (
                              <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-800 uppercase shrink-0">
                                Arrear
                              </span>
                            )}
                          </div>
                          <span className={`text-center w-[95px] shrink-0 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${selected ? 'border-emerald-500 text-emerald-800 bg-emerald-100' : 'border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100'}`}>
                            {selected ? '✓ Selected' : 'Select'}
                          </span>
                        </button>
                      );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isPreviewOpen && excelPreviewRows.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Excel Worksheet Preview</h2>
                <p className="text-xs text-slate-500">Live preview of the generated seating arrangements workbook.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                      {excelPreviewRows[0].map((header, index) => (
                        <th key={`${header}-${index}`} className="border-r border-slate-200 px-3.5 py-2.5 last:border-r-0">
                          {String(header)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelPreviewRows.slice(1).map((row, rowIndex) => (
                      <tr key={`${row.join('-')}-${rowIndex}`} className="hover:bg-slate-50/60 transition">
                        {row.map((cell, cellIndex) => (
                          <td key={`${cell}-${cellIndex}`} className="border-r border-slate-100 px-3.5 py-2 text-slate-700 font-mono text-xs last:border-r-0">
                            {String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-6 py-3.5">
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={isExportingExcel}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {isExportingExcel ? 'Downloading...' : 'Download Excel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pdfPreviewUrl ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#1e1e2e]/95 backdrop-blur-sm">
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-[#3d3d5c] bg-[#2b1a1f]/90 px-5 py-3 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-lg">📄</span>
              <div>
                <h3 className="text-base font-bold text-white">Attendance Sheet Preview</h3>
                <p className="text-xs text-[#a0a0b8]">{pdfPreviewFilename}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadPdfFromPreview}
                className="flex items-center gap-1.5 rounded-lg bg-[#4338ca] px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-[#3730a3] hover:shadow-lg"
              >
                ⬇ Download PDF
              </button>
              <button
                type="button"
                onClick={closePdfPreview}
                className="rounded-lg border border-[#4d4d6d] bg-[#2d2d44] px-3 py-2 text-sm font-semibold text-[#e0e0f0] transition hover:bg-[#3d3d55] hover:text-white"
              >
                ✕ Close
              </button>
            </div>
          </div>
          {/* PDF Viewer */}
          <div className="flex-1 overflow-hidden p-3">
            <iframe
              src={pdfPreviewUrl}
              title="Attendance Sheet PDF Preview"
              className="h-full w-full rounded-lg border border-[#3d3d5c] bg-white shadow-inner"
              style={{ minHeight: '500px' }}
            />
          </div>
        </div>
      ) : null}

      <StudentGroupModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        departments={departments}
        semesters={semesters}
        initialDepartment={selectedDepartment}
        initialSemester={selectedSemester}
        onSave={handleSaveStudentGroup}
      />
    </div>
  );
}
