import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CoeFilterOptions, CoeStudentsMapResponse, fetchCoeFilterOptions, fetchCoeStudentsMap } from '../../services/coe';
import fetchWithAuth from '../../services/fetchAuth';
import { kvHydrate, kvRemove, kvSave } from '../../utils/coeKvStore';

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
  conflictReason?: string;
};

type AllocationBlock = {
  department: string;
  semester: string;
  session: 'FN' | 'AN';
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

export interface HallAllocationPlanLog {
  id: string;
  savedAt: string;
  examTitle: string;
  semesterText: string;
  examDate: string;
  session: 'FN' | 'AN';
  departments: string[];
  totalHalls: number;
  totalStudents: number;
  rows: HallAllocationRow[];
  configuration: Array<{ department: string; semester: string; session: 'FN' | 'AN' }>;
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
  configuration?: Array<{ department: string; semester: string; session: 'FN' | 'AN' }>;
  studentSelectionMap?: Record<string, string[]>;
  examTitle?: string;
  semesterText?: string;
  examDate?: string;
  plan?: PlanEntry[];
  optimizedHallsData?: any[];
  selectedDepartment?: string;
  selectedSemester?: string;
  selectedSession?: 'FN' | 'AN';
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

function getClassKey(department: string, semester: string): string {
  return `${department}::${semester}`;
}

function getBlockKey(department: string, semester: string, session: 'FN' | 'AN'): string {
  return `${department}::${semester}::${session}`;
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
      ? 'Same dept/semester repeated adjacently' : undefined;

    plan.push({
      hallNumber: row.hallNumber,
      department: chosenBlock.department,
      semester: chosenBlock.semester,
      session: chosenBlock.session,
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
  const [configuration, setConfiguration] = useState<Array<{ department: string; semester: string; session: 'FN' | 'AN' }>>(() => {
    return savedWorking?.configuration && Array.isArray(savedWorking.configuration) ? savedWorking.configuration : [];
  });
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
  const [selectionStudents, setSelectionStudents] = useState<Array<{ reg_no: string; name: string }>>([]);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [examTitle, setExamTitle] = useState(() => savedWorking?.examTitle || '');
  const [semesterText, setSemesterText] = useState(() => savedWorking?.semesterText || '');
  const [examDate, setExamDate] = useState(() => savedWorking?.examDate || '');
  const [planLogs, setPlanLogs] = useState<HallAllocationPlanLog[]>(() => readSavedPlanLogs());
  const [optimizedHallsData, setOptimizedHallsData] = useState<OptimizedHallData[] | null>(() => {
    if (savedWorking?.optimizedHallsData && Array.isArray(savedWorking.optimizedHallsData)) {
      return savedWorking.optimizedHallsData.map((h: any) => ({
        ...h,
        donorIndices: new Set<number>(h.donorIndices || []),
        shiftedIndices: new Set<number>(h.shiftedIndices || []),
      }));
    }
    return null;
  });
  const [isOptimizing, setIsOptimizing] = useState(false);

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

        // Hydrate working state from backend KV store if available
        const hydrated = await kvHydrate(HALL_ALLOCATION_PLAN_STATE_KEY);
        if (active && hydrated && typeof hydrated === 'object') {
          if (Array.isArray(hydrated.rows) && hydrated.rows.length > 0 && rows.length === 0) {
            setRows(hydrated.rows);
          }
          if (Array.isArray(hydrated.configuration) && hydrated.configuration.length > 0 && configuration.length === 0) {
            setConfiguration(hydrated.configuration);
          }
          if (hydrated.studentSelectionMap && Object.keys(hydrated.studentSelectionMap).length > 0 && Object.keys(studentSelectionMap).length === 0) {
            setStudentSelectionMap(hydrated.studentSelectionMap);
          }
          if (hydrated.examTitle && !examTitle) setExamTitle(hydrated.examTitle);
          if (hydrated.semesterText && !semesterText) setSemesterText(hydrated.semesterText);
          if (hydrated.examDate && !examDate) setExamDate(hydrated.examDate);
          if (Array.isArray(hydrated.plan) && hydrated.plan.length > 0 && plan.length === 0) {
            setPlan(hydrated.plan);
          }
          if (Array.isArray(hydrated.optimizedHallsData) && hydrated.optimizedHallsData.length > 0 && !optimizedHallsData) {
            setOptimizedHallsData(
              hydrated.optimizedHallsData.map((h: any) => ({
                ...h,
                donorIndices: new Set<number>(h.donorIndices || []),
                shiftedIndices: new Set<number>(h.shiftedIndices || []),
              }))
            );
          }
        }
      } catch (err) {
        console.warn('Failed to load filter options', err);
      }
    })();
    return () => { active = false; };
  }, [navigate, rows.length]);

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
  ]);

  // Proactively fetch student list for any configured blocks missing from studentSelectionMap
  useEffect(() => {
    if (configuration.length === 0) return;
    configuration.forEach((item) => {
      const blockKey = getBlockKey(item.department, item.semester, item.session);
      if (!studentSelectionMap[blockKey]) {
        loadStudentSelectionForBlock(item.department, item.semester, item.session);
      }
    });
  }, [configuration]);

  const hasRows = rows.length > 0;

  const handleAddConfiguration = () => {
    if (!selectedDepartment || !selectedSemester) return;
    const blockKey = getBlockKey(selectedDepartment, selectedSemester, selectedSession);
    if (configuration.some((item) => getBlockKey(item.department, item.semester, item.session) === blockKey)) {
      return;
    }
    setConfiguration((current) => [...current, { department: selectedDepartment, semester: selectedSemester, session: selectedSession }]);
    if (!studentSelectionMap[blockKey]) {
      loadStudentSelectionForBlock(selectedDepartment, selectedSemester, selectedSession);
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

  const loadStudentSelectionForBlock = async (department: string, semester: string, session: 'FN' | 'AN') => {
    const blockKey = getBlockKey(department, semester, session);
    try {
      const response = await fetchCoeStudentsMap({ department, semester });
      const nextStudents: Array<{ reg_no: string; name: string }> = [];
      const seen = new Set<string>();
      for (const deptBlock of response.departments || []) {
        for (const course of deptBlock.courses || []) {
          for (const student of course.students || []) {
            const regNo = String(student?.reg_no || '').trim();
            const name = String(student?.name || '').trim();
            if (!regNo || seen.has(regNo)) continue;
            seen.add(regNo);
            nextStudents.push({ reg_no: regNo, name: name || regNo });
          }
        }
      }
      // Sort by last 3 digits of reg_no to maintain consecutive seating order
      nextStudents.sort((a, b) => {
        const numA = parseInt(a.reg_no.slice(-3), 10);
        const numB = parseInt(b.reg_no.slice(-3), 10);
        if (numA !== numB) return numA - numB;
        return a.reg_no.localeCompare(b.reg_no);
      });

      const selected = nextStudents.map((student) => student.reg_no);
      setStudentSelectionMap((current) => ({
        ...current,
        [blockKey]: current[blockKey] && current[blockKey].length > 0 ? current[blockKey] : selected,
      }));

      return nextStudents;
    } catch (err) {
      console.warn('Failed to load student list for block', { department, semester, session, err });
      return [] as Array<{ reg_no: string; name: string }>;
    }
  };

  const openStudentSelection = async (department: string, semester: string, session: 'FN' | 'AN') => {
    const blockKey = getBlockKey(department, semester, session);
    setSelectionBlockKey(blockKey);
    setSelectionSearch('');
    setSelectionLoading(true);
    try {
      const students = await loadStudentSelectionForBlock(department, semester, session);
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

  const visibleSelectionStudents = selectionStudents.filter((student) => {
    const query = selectionSearch.trim().toLowerCase();
    if (!query) return true;
    return student.name.toLowerCase().includes(query) || student.reg_no.toLowerCase().includes(query);
  });

  const buildPatternSeatOrder = (
    pattern: SeatingPattern | undefined,
    deptBuckets: Record<string, string[]>,
    totalSlots: number,
    rows: number,
    cols: number,
    orderedDepts?: string[]
  ): { students: string[]; depts: string[] } => {
    // Preserve specified allocation department order; do NOT sort alphabetically!
    const activeDepts = (orderedDepts || Object.keys(deptBuckets)).filter(
      (k) => deptBuckets[k] && deptBuckets[k].length > 0
    );
    if (activeDepts.length === 0) return { students: [], depts: [] };

    const studentIdx: Record<string, number> = {};
    for (const key of activeDepts) studentIdx[key] = 0;

    const positions = getPatternPositions(rows, cols, pattern);
    const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));
    const deptGrid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));

    // Parity 0 -> activeDepts[0], Parity 1 -> activeDepts[1]
    const parityDeptMap: Record<number, string | null> = {
      0: activeDepts[0] || null,
      1: activeDepts[1] || null,
    };
    const remainingDeptQueue = activeDepts.slice(2);

    for (let i = 0; i < positions.length; i += 1) {
      const [r, c] = positions[i];
      const cellParity = (r + c) % 2;

      let targetDept = parityDeptMap[cellParity];

      // If current parity target is exhausted, pull 3rd department if available
      if (targetDept && studentIdx[targetDept] >= (deptBuckets[targetDept]?.length || 0)) {
        if (remainingDeptQueue.length > 0) {
          const nextDept = remainingDeptQueue.shift()!;
          parityDeptMap[cellParity] = nextDept;
          targetDept = nextDept;
        } else {
          // No department available for this parity! Leave empty space ("") to guarantee 4-way non-adjacency!
          parityDeptMap[cellParity] = null;
          targetDept = null;
        }
      }

      if (targetDept && studentIdx[targetDept] < (deptBuckets[targetDept]?.length || 0)) {
        grid[r][c] = deptBuckets[targetDept][studentIdx[targetDept]];
        deptGrid[r][c] = targetDept;
        studentIdx[targetDept] += 1;
      }
    }

    // Convert 2D grid to flat arrays matching pattern position order
    const students: string[] = [];
    const depts: string[] = [];
    for (let i = 0; i < positions.length; i += 1) {
      const [r, c] = positions[i];
      students.push(grid[r][c] || '');
      depts.push(deptGrid[r][c] || '');
    }

    return { students, depts };
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
      for (const deptBlock of data.departments || []) {
        for (const course of deptBlock.courses || []) {
          for (const student of course.students || []) {
            const regNo = String(student?.reg_no || '').trim();
            if (!regNo || seen.has(regNo)) continue;
            seen.add(regNo);
            students.push(regNo);
          }
        }
      }
      // Sort by last 3 digits of register number to maintain consecutive seating order
      return students.sort((a, b) => {
        const numA = parseInt(a.slice(-3), 10);
        const numB = parseInt(b.slice(-3), 10);
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b); // tiebreak on full reg number
      });
    } catch {
      return [];
    }
  };

  interface ExportHallData {
    hall_name: string;
    department: string;
    departments?: string[];
    dept_counts?: Record<string, number>;
    rows: number;
    cols: number;
    pattern?: SeatingPattern;
    students: string[];
    studentDepts?: string[];
  }

  interface OptimizedHallData extends ExportHallData {
    studentDepts: string[];
    donorIndices: Set<number>;
    shiftedIndices: Set<number>;
  }

  const buildHallExportData = async (): Promise<ExportHallData[]> => {
    const hallsData: ExportHallData[] = [];

    // Step 1: Collect unallocated student pools in exact selection order per configured block
    const deptNames: string[] = [];
    const deptPools: Record<string, string[]> = {};

    for (const item of configuration) {
      const blockKey = getBlockKey(item.department, item.semester, item.session);
      let students = studentSelectionMap[blockKey];
      if (!students || students.length === 0) {
        students = await fetchDepartmentStudents(item.department, item.semester);
        setStudentSelectionMap((current) => ({ ...current, [blockKey]: students }));
      }
      if (!deptNames.includes(item.department)) {
        deptNames.push(item.department);
      }
      deptPools[item.department] = [...(deptPools[item.department] || []), ...students];
    }

    const availableDepts = deptNames.filter((d) => deptPools[d] && deptPools[d].length > 0);
    if (availableDepts.length === 0) return hallsData;

    // Step 2: Pack halls sequentially to achieve MINIMAL halls (100% packing in non-final halls, 0 gaps)
    const sortedHalls = [...rows].sort((a, b) => (b.rows * b.cols) - (a.rows * a.cols) || a.hallNumber.localeCompare(b.hallNumber));
    let activePair: string[] = [];

    const getNextAvailableDept = (exclude: string[] = []) => {
      // Prioritize departments with largest remaining pools first to maintain balanced pairing
      const remainingDepts = availableDepts.filter((d) => !exclude.includes(d) && deptPools[d] && deptPools[d].length > 0);
      remainingDepts.sort((a, b) => (deptPools[b]?.length || 0) - (deptPools[a]?.length || 0));
      return remainingDepts[0];
    };

    const allocateHallBuckets = (capacity: number) => {
      const hallDeptBuckets: Record<string, string[]> = {};
      const deptsInHall: string[] = [];

      // Maintain active pair: keep departments that still have unallocated students
      activePair = activePair.filter((d) => deptPools[d] && deptPools[d].length > 0);

      // Top up active pair to 2 departments if possible
      while (activePair.length < 2) {
        const nextD = getNextAvailableDept(activePair);
        if (!nextD) break;
        activePair.push(nextD);
      }

      if (activePair.length === 0) return { hallDeptBuckets, deptsInHall };

      const p0Cap = Math.ceil(capacity / 2);
      const p1Cap = Math.floor(capacity / 2);

      const d0 = activePair[0] || null;
      const d1 = activePair[1] || null;

      let takenP0 = 0;
      let takenP1 = 0;

      // 1. Allocate to D0 (Parity 0) up to p0Cap
      if (d0 && deptPools[d0] && deptPools[d0].length > 0) {
        const take0 = Math.min(p0Cap, deptPools[d0].length);
        hallDeptBuckets[d0] = deptPools[d0].splice(0, take0);
        deptsInHall.push(d0);
        takenP0 = take0;
      }

      // 2. Allocate to D1 (Parity 1) up to p1Cap
      if (d1 && deptPools[d1] && deptPools[d1].length > 0) {
        const take1 = Math.min(p1Cap, deptPools[d1].length);
        hallDeptBuckets[d1] = deptPools[d1].splice(0, take1);
        deptsInHall.push(d1);
        takenP1 = take1;
      }

      // 3. If Parity 0 has empty seat gaps remaining (takenP0 < p0Cap), fill them with 3rd/4th departments!
      let remP0 = p0Cap - takenP0;
      while (remP0 > 0) {
        const d3 = getNextAvailableDept(deptsInHall);
        if (!d3) break;
        const take3 = Math.min(remP0, deptPools[d3].length);
        if (take3 > 0) {
          if (!hallDeptBuckets[d3]) {
            hallDeptBuckets[d3] = [];
            deptsInHall.push(d3);
          }
          hallDeptBuckets[d3].push(...deptPools[d3].splice(0, take3));
          remP0 -= take3;
        } else {
          break;
        }
      }

      // 4. If Parity 1 has empty seat gaps remaining (takenP1 < p1Cap), fill them with 3rd/4th departments!
      let remP1 = p1Cap - takenP1;
      while (remP1 > 0) {
        const d3 = getNextAvailableDept(deptsInHall);
        if (!d3) break;
        const take3 = Math.min(remP1, deptPools[d3].length);
        if (take3 > 0) {
          if (!hallDeptBuckets[d3]) {
            hallDeptBuckets[d3] = [];
            deptsInHall.push(d3);
          }
          hallDeptBuckets[d3].push(...deptPools[d3].splice(0, take3));
          remP1 -= take3;
        } else {
          break;
        }
      }

      return { hallDeptBuckets, deptsInHall };
    };

    for (let hallIdx = 0; hallIdx < sortedHalls.length; hallIdx += 1) {
      if (!availableDepts.some((d) => deptPools[d] && deptPools[d].length > 0)) break;

      const hallRow = sortedHalls[hallIdx];
      const capacity = Math.max(0, hallRow.rows * hallRow.cols);
      if (capacity <= 0) continue;

      const { hallDeptBuckets, deptsInHall } = allocateHallBuckets(capacity);

      const totalStudentsInHall = Object.values(hallDeptBuckets).reduce((sum, list) => sum + list.length, 0);
      if (totalStudentsInHall === 0) continue;

      // Interleave students in pattern order, preserving exact hall allocation department order
      const { students: interleavedStudents, depts: interleavedDepts } = buildPatternSeatOrder(
        hallRow.pattern,
        hallDeptBuckets,
        totalStudentsInHall,
        hallRow.rows,
        hallRow.cols,
        deptsInHall
      );
      const combinedDeptLabel = deptsInHall.join(' / ');
      const deptCounts: Record<string, number> = {};
      for (const [dept, list] of Object.entries(hallDeptBuckets)) {
        if (list.length > 0) deptCounts[dept] = list.length;
      }

      hallsData.push({
        hall_name: hallRow.hallNumber,
        department: combinedDeptLabel,
        departments: deptsInHall,
        dept_counts: deptCounts,
        rows: hallRow.rows,
        cols: hallRow.cols,
        pattern: hallRow.pattern,
        students: interleavedStudents,
        studentDepts: interleavedDepts,
      });
    }

    // Step 3: If unallocated students still remain after configured halls are filled,
    // dynamically generate overflow halls so 100% of selected students are accommodated!
    let overflowHallNum = 1;
    const defaultTemplate = sortedHalls[sortedHalls.length - 1] || { rows: 7, cols: 6, pattern: 'Alternate Zigzag' };

    while (availableDepts.some((d) => deptPools[d] && deptPools[d].length > 0)) {
      const capacity = Math.max(0, defaultTemplate.rows * defaultTemplate.cols);
      const { hallDeptBuckets, deptsInHall } = allocateHallBuckets(capacity);

      const totalStudentsInHall = Object.values(hallDeptBuckets).reduce((sum, list) => sum + list.length, 0);
      if (totalStudentsInHall === 0) break;

      const autoHallName = `Hall ${sortedHalls.length + overflowHallNum}`;
      overflowHallNum += 1;

      const { students: interleavedStudents, depts: interleavedDepts } = buildPatternSeatOrder(
        defaultTemplate.pattern,
        hallDeptBuckets,
        totalStudentsInHall,
        defaultTemplate.rows,
        defaultTemplate.cols,
        deptsInHall
      );
      const combinedDeptLabel = deptsInHall.join(' / ');
      const deptCounts: Record<string, number> = {};
      for (const [dept, list] of Object.entries(hallDeptBuckets)) {
        if (list.length > 0) deptCounts[dept] = list.length;
      }

      hallsData.push({
        hall_name: autoHallName,
        department: combinedDeptLabel,
        departments: deptsInHall,
        dept_counts: deptCounts,
        rows: defaultTemplate.rows,
        cols: defaultTemplate.cols,
        pattern: defaultTemplate.pattern,
        students: interleavedStudents,
        studentDepts: interleavedDepts,
      });
    }

    return hallsData;
  };

  // ─── Space Optimization ───────────────────────────────────────────────────
  // Strictly enforces that no student of department D is placed 4-way adjacent
  // (Up/Down/Left/Right) to another student of department D. Same-dept students
  // are only placed diagonally (same checkerboard parity).
  const optimizeHallSpaces = (
    rawHalls: (ExportHallData & { studentDepts: string[] })[]
  ): OptimizedHallData[] => {
    // Deep clone with optimization metadata
    const halls: OptimizedHallData[] = rawHalls.map((h) => ({
      ...h,
      students: [...h.students],
      studentDepts: [...h.studentDepts],
      donorIndices: new Set<number>(),
      shiftedIndices: new Set<number>(),
    }));

    const getCapacity = (h: OptimizedHallData) => h.rows * h.cols;
    const getFilled = (h: OptimizedHallData) => h.students.filter((s) => s !== '').length;
    const getEmpty = (h: OptimizedHallData) => getCapacity(h) - getFilled(h);

    // Total empty seats across ALL halls
    const totalEmpty = halls.reduce((sum, h) => sum + getEmpty(h), 0);
    if (totalEmpty === 0) return halls;

    // Helper: get parity of a slot index in a hall based on its seating pattern
    const getSlotParity = (h: OptimizedHallData, slotIdx: number): number => {
      const positions = getPatternPositions(h.rows, h.cols, h.pattern);
      if (slotIdx >= 0 && slotIdx < positions.length) {
        const [r, c] = positions[slotIdx];
        return (r + c) % 2;
      }
      return 0;
    };

    // Helper: check which departments are already on each parity in a hall
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

    // Helper: can a department sit in a specific slot of a hall without 4-way adjacency?
    // Rule: dept D can ONLY be placed at parity P if parity (1-P) does NOT contain dept D.
    const canPlaceDeptAtSlot = (h: OptimizedHallData, slotIdx: number, dept: string): boolean => {
      const slotParity = getSlotParity(h, slotIdx);
      const oppositeParity = (1 - slotParity) as 0 | 1;
      const parityDepts = getHallParityDepts(h);
      return !parityDepts[oppositeParity].has(dept);
    };

    // Identify overflow / small halls whose students can fit into available empty seats across other halls
    const overflowHalls = halls
      .filter((h) => {
        const filled = getFilled(h);
        if (filled === 0) return false;
        const emptyInOthers = halls
          .filter((oh) => oh.hall_name !== h.hall_name)
          .reduce((sum, oh) => sum + getEmpty(oh), 0);
        return filled <= emptyInOthers && getEmpty(h) > 0;
      })
      .sort((a, b) => getFilled(a) - getFilled(b)); // smallest hall first

    if (overflowHalls.length === 0) return halls;

    for (const overflowHall of overflowHalls) {
      let overflowStudentIndices = overflowHall.students
        .map((s, i) => (s !== '' ? i : -1))
        .filter((i) => i >= 0);

      if (overflowStudentIndices.length === 0) continue;

      // While this overflow hall still has students to shift
      while (overflowStudentIndices.length > 0) {
        const currentOverflowStudentIdx = overflowStudentIndices[0];
        const overflowDept = overflowHall.studentDepts[currentOverflowStudentIdx] || overflowHall.department;

        // 1. Check if overflow students can be directly placed into another hall's empty seats
        // without violating the parity rule (e.g. sitting on the opposite parity of a DIFFERENT dept)
        let directPlaced = false;
        for (const targetHall of halls) {
          if (targetHall.hall_name === overflowHall.hall_name || getEmpty(targetHall) === 0) continue;

          // Find empty slots in targetHall where overflowDept CAN legally sit
          const validEmptySlots = targetHall.students
            .map((s, i) => (s === '' ? i : -1))
            .filter((i) => i >= 0 && canPlaceDeptAtSlot(targetHall, i, overflowDept));

          if (validEmptySlots.length > 0) {
            const countToPlace = Math.min(validEmptySlots.length, overflowStudentIndices.length);
            for (let k = 0; k < countToPlace; k++) {
              const fromIdx = overflowStudentIndices[k];
              const toIdx = validEmptySlots[k];
              targetHall.students[toIdx] = overflowHall.students[fromIdx];
              targetHall.studentDepts[toIdx] = overflowDept;
              targetHall.shiftedIndices.add(toIdx);
              overflowHall.students[fromIdx] = '';
              overflowHall.studentDepts[fromIdx] = '';
            }
            overflowStudentIndices = overflowHall.students
              .map((s, i) => (s !== '' ? i : -1))
              .filter((i) => i >= 0);
            directPlaced = true;
            break;
          }
        }

        if (directPlaced) continue;

        // 2. If direct placement isn't valid, perform a 3-way swap:
        // Find a gap hall targetGapHall with empty slots
        const gapHalls = halls
          .filter((h) => h.hall_name !== overflowHall.hall_name && getEmpty(h) > 0)
          .sort((a, b) => getEmpty(b) - getEmpty(a));

        if (gapHalls.length === 0) break;

        let swapSuccess = false;

        for (const targetGapHall of gapHalls) {
          const emptySlotIndices = targetGapHall.students
            .map((s, i) => (s === '' ? i : -1))
            .filter((i) => i >= 0);

          if (emptySlotIndices.length === 0) continue;

          // Collect candidate donor departments and halls
          // A donor dept must:
          // a) Be allowed at targetGapHall's empty slots
          // b) Its source hall slots must allow overflowDept when freed
          const candidatePairs: Array<{
            dept: string;
            hall: OptimizedHallData;
            positions: number[];
            targetSlot: number;
          }> = [];

          for (const targetSlot of emptySlotIndices) {
            for (const h of halls) {
              if (h.hall_name === overflowHall.hall_name) continue;
              const distinctDepts = Array.from(new Set(h.studentDepts.filter((d) => d && d !== overflowDept)));
              for (const d of distinctDepts) {
                // Can donor dept 'd' sit at targetGapHall slot?
                if (!canPlaceDeptAtSlot(targetGapHall, targetSlot, d)) continue;

                // Find positions of 'd' in h where overflowDept CAN sit once freed
                const validPositions = h.students
                  .map((s, i) => (s !== '' && h.studentDepts[i] === d ? i : -1))
                  .filter((i) => i >= 0 && canPlaceDeptAtSlot(h, i, overflowDept));

                if (validPositions.length > 0) {
                  candidatePairs.push({ dept: d, hall: h, positions: validPositions, targetSlot });
                }
              }
            }
          }

          if (candidatePairs.length === 0) continue;

          // Randomly pick a candidate donor
          const randomPair = candidatePairs[Math.floor(Math.random() * candidatePairs.length)];
          const donorDept = randomPair.dept;
          const donorSourceHall = randomPair.hall;
          const donorPositions = randomPair.positions;

          // Find consecutive available empty slots matching consecutive donor positions
          const maxMove = Math.min(emptySlotIndices.length, overflowStudentIndices.length, donorPositions.length);
          if (maxMove === 0) continue;

          const maxStart = donorPositions.length - maxMove;
          const randomStart = Math.floor(Math.random() * (maxStart + 1));
          const selectedDonorPositions = donorPositions.slice(randomStart, randomStart + maxMove);

          // Step A: Move donor students → targetGapHall empty slots (AMBER)
          for (let k = 0; k < selectedDonorPositions.length; k++) {
            const fromIdx = selectedDonorPositions[k];
            const toIdx = emptySlotIndices[k];
            targetGapHall.students[toIdx] = donorSourceHall.students[fromIdx];
            targetGapHall.studentDepts[toIdx] = donorDept;
            targetGapHall.donorIndices.add(toIdx);
            donorSourceHall.students[fromIdx] = '';
            donorSourceHall.studentDepts[fromIdx] = '';
          }

          // Step B: Move overflow students → donorSourceHall freed slots (TEAL)
          const newlyFreedInDonor = selectedDonorPositions;
          const countToShift = Math.min(newlyFreedInDonor.length, maxMove);
          for (let k = 0; k < countToShift; k++) {
            const fromIdx = overflowStudentIndices[k];
            const toIdx = newlyFreedInDonor[k];
            donorSourceHall.students[toIdx] = overflowHall.students[fromIdx];
            donorSourceHall.studentDepts[toIdx] = overflowDept;
            donorSourceHall.shiftedIndices.add(toIdx);
            overflowHall.students[fromIdx] = '';
            overflowHall.studentDepts[fromIdx] = '';
          }

          overflowStudentIndices = overflowHall.students
            .map((s, i) => (s !== '' ? i : -1))
            .filter((i) => i >= 0);

          swapSuccess = true;
          break;
        }

        if (!swapSuccess) break;
      }
    }

    // Remove halls that are now completely empty (freed by optimization)
    return halls.filter((h) => h.students.some((s) => s !== ''));
  };
  // ─────────────────────────────────────────────────────────────────────────

  const buildExcelPreviewRows = (hallsData: ExportHallData[]) => {
    const previewRows: Array<Array<string | number>> = [];

    // Master Summary Table Preview
    previewRows.push([`${examDate} ${selectedSession} | ${examTitle} Hall Allocation | ${semesterText}`]);
    previewRows.push(['Dept', 'Count Breakdown', 'Assigned Halls']);

    const deptMap: Record<string, { counts: number[]; halls: string[] }> = {};
    for (const hall of hallsData) {
      if (!deptMap[hall.department]) {
        deptMap[hall.department] = { counts: [], halls: [] };
      }
      deptMap[hall.department].counts.push(hall.students.length);
      deptMap[hall.department].halls.push(hall.hall_name);
    }

    for (const [dept, info] of Object.entries(deptMap)) {
      const breakdown = info.counts.join(' + ') + (info.counts.length > 1 ? ` = ${info.counts.reduce((a, b) => a + b, 0)}` : '');
      previewRows.push([dept, breakdown, ...info.halls]);
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
    return await buildHallExportData();
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
      setMessage('Hall plan generated. Save it to persist the allocation.');
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
        <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#5b1a30]">Generated Hall Plan</h2>
          <p className="mt-2 text-sm text-[#6a4a40]">Review the suggested department and session allocation for each hall.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[#ead7d0] bg-white/95 p-4 shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[#7a2038]">
                <th className="px-3 py-2">Hall</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Semester</th>
                <th className="px-3 py-2">Session</th>
            <th className="px-3 py-2">Conflict</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((row) => (
                <tr key={`${row.hallNumber}-${row.department}-${row.semester}-${row.session}`} className="border-t border-[#f0e4dc]">
                  <td className="px-3 py-2">{row.hallNumber}</td>
                  <td className="px-3 py-2">{row.department}</td>
                  <td className="px-3 py-2">{row.semester}</td>
                  <td className="px-3 py-2">{row.session}</td>
                  <td className="px-3 py-2">{row.conflictReason || '—'}</td>
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
      totalHalls: rows.length,
      totalStudents: totalSeated,
      rows: JSON.parse(JSON.stringify(rows)),
      configuration: JSON.parse(JSON.stringify(configuration)),
      studentSelectionMap: JSON.parse(JSON.stringify(studentSelectionMap)),
      plan: JSON.parse(JSON.stringify(plan)),
      optimizedHallsData: optimizedHallsData
        ? optimizedHallsData.map((h) => ({
            ...h,
            donorIndices: Array.from(h.donorIndices || []),
            shiftedIndices: Array.from(h.shiftedIndices || []),
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
        halls: hallsData.map((hall) => ({
          hall_name: hall.hall_name,
          department: hall.department,
          rows: hall.rows,
          cols: hall.cols,
          pattern: hall.pattern,
          students: hall.students,
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
          rows: hall.rows,
          cols: hall.cols,
          pattern: hall.pattern,
          students: hall.students,
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
          const blockKey = getBlockKey(entry.department, entry.semester, entry.session);
          const regs = log.studentSelectionMap[blockKey] || [];
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

        rawHalls.push({
          hall_name: row.hallNumber,
          department: depts,
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
          rows: hall.rows,
          cols: hall.cols,
          pattern: hall.pattern,
          students: hall.students,
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

  const handleBack = () => navigate('/coe/hall-allocation');

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-2">
      <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_30px_45px_-30px_rgba(111,29,52,0.55)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#5b1a30]">Hall Allocation Plan</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#6a4a40]">
              Select departments, semesters, and FN/AN assignment rules for the halls you entered. The plan avoids placing the same department and semester in adjacent slots where possible.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleStartNewPlan}
              className="rounded-lg border border-[#3c6a5a] bg-[#edf7f2] px-4 py-2 text-sm font-semibold text-[#1f493d] hover:bg-[#d4f0e7]"
              title="Reset form and start entering a new plan"
            >
              + New Plan
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="rounded-lg border border-[#d8a791] bg-white px-4 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fbeee8]"
            >
              Back to Halls
            </button>
            <button
              type="button"
              onClick={generatePlan}
              disabled={!canGeneratePlan || isLoading}
              className="rounded-lg bg-[#3c6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f5649] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Generating...' : 'Generate Plan'}
            </button>
            <button
              type="button"
              onClick={handleSavePlan}
              disabled={plan.length === 0}
              className="rounded-lg bg-[#b2472e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#913925] disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
              title="Save plan as a log and open a new blank form"
            >
              Save Plan
            </button>
            <button
              type="button"
              onClick={handlePublishPlan}
              disabled={plan.length === 0 || isPublishing}
              className="rounded-lg bg-[#1f493d] px-4 py-2 text-sm font-bold text-white hover:bg-[#16382f] disabled:cursor-not-allowed disabled:opacity-60 shadow-md ring-2 ring-[#3c6a5a]/40"
              title="Publish plan to student IDCS portal"
            >
              {isPublishing ? 'Publishing...' : '📢 Publish Plan'}
            </button>
            <button
              type="button"
              onClick={handlePreviewExcel}
              disabled={plan.length === 0 || isExportingExcel}
              className="rounded-lg border border-[#d8a791] bg-[#fff5ee] px-4 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fce8dc] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Preview Excel
            </button>
            <button
              type="button"
              onClick={handleOptimizeSpaces}
              disabled={plan.length === 0 || isOptimizing}
              className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOptimizing ? 'Optimizing...' : '✦ Optimize Spaces'}
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={plan.length === 0 || isExportingExcel}
              className="rounded-lg bg-[#3c6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f5649] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExportingExcel ? 'Preparing Excel...' : 'Download Excel'}
            </button>
          </div>
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

      <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-[#5b1a30]">Exam Details (for Excel Export)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-semibold text-[#5b1a30]">Exam Title</label>
            <input
              type="text"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
              placeholder="e.g., CIA-1"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#5b1a30]">Semester</label>
            <input
              type="text"
              value={semesterText}
              onChange={(e) => setSemesterText(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
              placeholder="e.g., SEM 5"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#5b1a30]">Exam Date</label>
            <input
              type="text"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
              placeholder="e.g., 20.11.2006"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-semibold text-[#5b1a30]">Department</label>
              <select
                value={selectedDepartment}
                onChange={(event) => setSelectedDepartment(event.target.value)}
                className="mt-2 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
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
              <label className="block text-sm font-semibold text-[#5b1a30]">Semester</label>
              <select
                value={selectedSemester}
                onChange={(event) => setSelectedSemester(event.target.value)}
                className="mt-2 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
              >
                {semesters.map((semester) => (
                  <option key={semester} value={semester}>
                    {semester}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#5b1a30]">Session</label>
              <select
                value={selectedSession}
                onChange={(event) => setSelectedSession(event.target.value as 'FN' | 'AN')}
                className="mt-2 w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
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
                className="w-full rounded-lg bg-[#b2472e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#913925]"
              >
                Add Block
              </button>
              {configuration.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllBlocks}
                  className="rounded-lg border border-[#d8a791] bg-white px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fbeee8] whitespace-nowrap"
                  title="Clear all department blocks"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[#7a2038]">
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Semester</th>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {configuration.map((item, index) => {
                const blockKey = getBlockKey(item.department, item.semester, item.session);
                const selectedArr = studentSelectionMap[blockKey];
                const countBadge = selectedArr !== undefined ? ` (${selectedArr.length} Selected)` : '';

                return (
                  <tr key={`${item.department}-${item.semester}-${item.session}-${index}`} className="border-t border-[#f0e4dc]">
                    <td className="px-3 py-2">{item.department}</td>
                    <td className="px-3 py-2">{item.semester}</td>
                    <td className="px-3 py-2">{item.session}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openStudentSelection(item.department, item.semester, item.session)}
                          className="rounded-lg border border-[#d8a791] bg-[#fff5ee] px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fce8dc]"
                        >
                          Select Students{countBadge}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveConfiguration(index)}
                          className="rounded-lg border border-[#d8a791] px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#f7e3db]"
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
                  <td colSpan={4} className="px-3 py-4 text-sm text-[#6a4a40]">
                    Add department and semester blocks to generate a hall plan.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {renderedPlan}

      {optimizedHallsData && optimizedHallsData.length > 0 ? (
        <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#5b1a30]">Optimized Hall Seating</h2>
              <p className="mt-1 text-sm text-[#6a4a40]">
                Empty gaps filled — overflow students redistributed without same-dept conflicts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOptimizedHallsData(null)}
              className="rounded-lg border border-[#d8a791] bg-white px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fbeee8]"
            >
              Clear
            </button>
          </div>

          {/* Legend */}
          <div className="mb-5 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-400" />
              Random Dept (Filled Gap)
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-teal-500 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">
              <span className="inline-block h-3 w-3 rounded-sm bg-teal-400" />
              Shifted Students (from Overflow Hall)
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-[#e1c6b8] bg-[#f9fafb] px-3 py-1.5 text-xs font-semibold text-[#5b1a30]">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#e1c6b8]" />
              Regular Students
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-[#f0e4dc] bg-white px-3 py-1.5 text-xs font-semibold text-[#a09090]">
              <span className="inline-block h-3 w-3 rounded-sm border border-[#e8dcd5]" />
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
                <div key={hall.hall_name} className="rounded-xl border border-[#ead7d0] p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-bold text-[#5b1a30]">{hall.hall_name}</h3>
                    <span className="text-sm text-[#6a4a40]">{hall.department}</span>
                    <span className="rounded-full bg-[#f7e8df] px-2 py-0.5 text-xs font-semibold text-[#7a2038]">
                      {filled} / {hall.rows * hall.cols} seated
                    </span>
                    {donorCount > 0 && (
                      <span className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        +{donorCount} random dept filled
                      </span>
                    )}
                    {shiftedCount > 0 && (
                      <span className="rounded-full border border-teal-500 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">
                        +{shiftedCount} overflow shifted in
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="border-separate" style={{ borderSpacing: '2px' }}>
                      <tbody>
                        {Array.from({ length: hall.rows }, (_, rowIdx) => (
                          <tr key={rowIdx}>
                            {Array.from({ length: hall.cols }, (_, colIdx) => {
                              const role = roleGrid[rowIdx][colIdx];
                              const student = seatGrid[rowIdx][colIdx];
                              const cellClass =
                                role === 'donor'
                                  ? 'bg-amber-50 border-amber-400 text-amber-900 font-semibold ring-1 ring-amber-300'
                                  : role === 'shifted'
                                  ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold ring-1 ring-teal-300'
                                  : role === 'normal'
                                  ? 'bg-[#f9fafb] border-[#e1c6b8] text-[#5b1a30]'
                                  : 'bg-white border-[#f0e4dc] text-[#c0b8b4]';
                              return (
                                <td key={colIdx} title={student || 'Empty seat'}>
                                  <div
                                    className={`rounded border px-2.5 py-1.5 text-center font-mono text-xs transition-all whitespace-nowrap ${cellClass}`}
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
      <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#5b1a30]">
              Saved Plan Logs{' '}
              <span className="ml-2 rounded-full bg-[#f7e8df] px-2.5 py-0.5 text-xs font-bold text-[#7a2038]">
                {planLogs.length} Saved
              </span>
            </h2>
            <p className="mt-1 text-sm text-[#6a4a40]">
              Whenever you save a plan, it is stored here as a log. Click on any log to immediately load and edit it.
            </p>
          </div>
        </div>

        {planLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e1c6b8] p-8 text-center text-sm text-[#6a4a40]">
            No saved plan logs yet. Once you generate and click <strong className="text-[#5b1a30]">Save Plan</strong>, the plan will be logged here and a fresh form will be opened to enter your next plan.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {planLogs.map((log) => (
              <div
                key={log.id}
                className="group flex flex-col justify-between rounded-xl border border-[#e1c6b8] bg-[#fffbf9] p-4 transition-all hover:border-[#b2472e] hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-[#5b1a30] group-hover:text-[#b2472e]">
                      {log.examTitle}
                    </h3>
                    <span className="rounded-md bg-[#edf7f2] border border-[#3c6a5a] px-2 py-0.5 text-xs font-bold text-[#1f493d]">
                      {log.session}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-[#7a6055]">
                    Date: <strong className="text-[#5b1a30]">{log.examDate}</strong> | {log.semesterText}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {log.departments.map((dept) => (
                      <span
                        key={dept}
                        className="rounded bg-[#f7e8df] px-1.5 py-0.5 text-[11px] font-semibold text-[#7a2038]"
                      >
                        {dept}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-[#6a4a40]">
                    <span>🏛 {log.totalHalls} Halls</span>
                    <span>👥 {log.totalStudents} Students</span>
                    {log.optimizedHallsData && (
                      <span className="text-amber-700 font-semibold">✦ Optimized</span>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-[#9b8077]">
                    Saved: {new Date(log.savedAt).toLocaleString()}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#f0e4dc] pt-3">
                  <button
                    type="button"
                    onClick={() => handleLoadLog(log)}
                    className="flex-1 rounded-lg bg-[#3c6a5a] px-3 py-1.5 text-center text-xs font-bold text-white transition hover:bg-[#2f5649]"
                  >
                    Open Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePublishLog(log)}
                    className="rounded-lg bg-[#1f493d] px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#16382f]"
                    title="Publish this saved plan to student IDCS portal"
                  >
                    📢 Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLog(log.id)}
                    className="rounded-lg border border-[#d8a791] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#7a2038] hover:bg-[#fbeee8]"
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#2b1a1f]/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-[#ead7d0] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#f0e4dc] px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#5b1a30]">
                  Student Selection — <span className="text-[#3c6a5a]">{(studentSelectionMap[selectionBlockKey] || []).length} / {selectionStudents.length} Selected</span>
                </h3>
                <p className="text-sm text-[#6a4a40]">{selectionBlockKey.replace(/::/g, ' / ')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectionBlockKey(null);
                  setSelectionSearch('');
                }}
                className="rounded-lg border border-[#d8a791] bg-[#fff5ee] px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fce8dc]"
              >
                Close
              </button>
            </div>

            <div className="border-b border-[#f0e4dc] px-5 py-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <input
                  type="text"
                  value={selectionSearch}
                  onChange={(event) => setSelectionSearch(event.target.value)}
                  placeholder="Search by name or register number"
                  className="w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap rounded-lg bg-[#edf7f2] border border-[#3c6a5a] px-3 py-2 text-xs font-bold text-[#1f493d]">
                    Selected: {(studentSelectionMap[selectionBlockKey] || []).length} / {selectionStudents.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleAllVisibleSelection(true)}
                    className="rounded-lg border border-[#d8a791] bg-[#fff5ee] px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fce8dc]"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAllVisibleSelection(false)}
                    className="rounded-lg border border-[#d8a791] bg-white px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fbeee8]"
                  >
                    Unselect All
                  </button>
                </div>
              </div>
            </div>

            <div className="max-h-[52vh] overflow-y-auto px-5 py-4">
              {selectionLoading ? (
                <div className="text-sm text-[#6a4a40]">Loading students...</div>
              ) : visibleSelectionStudents.length === 0 ? (
                <div className="text-sm text-[#6a4a40]">No students match this search.</div>
              ) : (
                <div className="space-y-2">
                  {visibleSelectionStudents.map((student) => {
                    const selected = (studentSelectionMap[selectionBlockKey] || []).includes(student.reg_no);
                    return (
                      <button
                        key={student.reg_no}
                        type="button"
                        onClick={() => toggleStudentSelection(student.reg_no)}
                        className={`grid w-full grid-cols-[160px_1fr_100px] items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all ${selected ? 'border-[#3c6a5a] bg-[#edf7f2]' : 'border-[#e1c6b8] bg-white hover:bg-[#fff9f6] hover:border-[#c8a090]'}`}
                      >
                        <span className={`text-base font-bold font-mono ${selected ? 'text-[#3c6a5a]' : 'text-[#7a6055]'}`}>
                          {student.reg_no}
                        </span>
                        <span className={`text-base font-bold truncate ${selected ? 'text-[#1f493d]' : 'text-[#5b1a30]'}`}>
                          {student.name}
                        </span>
                        <span className={`justify-self-end text-center w-[95px] shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${selected ? 'border-[#3c6a5a] text-[#1f493d] bg-[#d4f0e7]' : 'border-[#d8a791] text-[#7a2038] bg-white'}`}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1a1f]/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-[#ead7d0] bg-white p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#5b1a30]">Excel Preview</h2>
                <p className="text-sm text-[#6a4a40]">Preview of the worksheet that will be downloaded.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="rounded-lg border border-[#d8a791] bg-[#fff5ee] px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fce8dc]"
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[#7a2038]">
                    {excelPreviewRows[0].map((header, index) => (
                      <th key={`${header}-${index}`} className="border border-[#e1c6b8] px-3 py-2">
                        {String(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelPreviewRows.slice(1).map((row, rowIndex) => (
                    <tr key={`${row.join('-')}-${rowIndex}`} className="border-t border-[#f0e4dc]">
                      {row.map((cell, cellIndex) => (
                        <td key={`${cell}-${cellIndex}`} className="border border-[#e1c6b8] px-3 py-2">
                          {String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={isExportingExcel}
                className="rounded-lg bg-[#3c6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f5649] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExportingExcel ? 'Downloading...' : 'Download Excel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
