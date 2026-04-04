import React, { useEffect, useMemo, useRef, useState } from 'react';
import Barcode from 'react-barcode';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import BarScanMarkEntry from './BarScanMarkEntry';

import {
  CoeCourseGroup,
  CoeCourseStudent,
  CoeDepartmentCourseMap,
  CoeStudentsMapResponse,
  fetchCoeStudentsMap,
  resetCoeStudentDummies,
  saveCoeStudentDummies,
} from '../../services/coe';
import {
  CourseSelection,
  getCourseKey,
  fetchCourseSelectionMapFromApi,
} from './courseSelectionStorage';
import { getAttendanceFilterKey, readCourseAbsenteesMap } from './attendanceStore';
import { getSemesterStartSequence, generateDummyNumber } from './dummySequence';
import {
  appendRetrivalEntry,
  clearRetrivalApplyPayload,
  readRetrivalApplyPayload,
} from '../../utils/retrivalStore';
import { readTTScheduleMap } from './ttScheduleStore';
import { kvHydrate, kvSave } from '../../utils/coeKvStore';
import { hydrateShuffledListStore, readShuffleLocks, writeShuffleLocks, markFilterAsShuffled, unmarkFilterAsShuffled, isFilterShuffled, readShuffledLists, writeShuffledLists, getPersistedShuffledForFilter, setPersistedShuffledForFilter, clearPersistedShuffledForFilter, PersistedShuffledByDummy } from './shuffledListStore';
import { hydrateMarksStore, getMarksQpType } from './marksStore';
import fetchWithAuth from '../../services/fetchAuth';

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

function getSemesterNumber(value: string): number {
  const parsed = Number.parseInt(String(value || '').replace('SEM', ''), 10);
  if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 8) {
    return parsed;
  }
  return 0;
}

function getSemesterDigit(value: string): string {
  const parsed = getSemesterNumber(value);
  if (parsed >= 1 && parsed <= 8) {
    return String(parsed);
  }
  return '0';
}

type AugStudent = CoeCourseStudent & {
  enrollmentId: string;
  dummy: string;
  saved_qp_type?: 'QP1' | 'QP2' | 'TCPR' | 'TCPL' | 'OE';
};
type AugCourse = CoeCourseGroup & { students: AugStudent[]; shuffled?: boolean };
type AugDept = CoeDepartmentCourseMap & { courses: AugCourse[] };
type EnrichedData = { department_filter: string; semester_filter: string | null; departments: AugDept[] };
const SHUFFLE_LOCK_KEY = 'coe-students-shuffle-lock-v1';
const SHUFFLED_LIST_KEY = 'coe-students-shuffled-list-v1';
const ASSIGNING_STORE_KEY = 'coe-assigning-v1';
const COURSE_BUNDLE_DUMMY_STORE_KEY = 'coe-course-bundle-dummies-v1';
type ArrearShuffleMode = 'include' | 'separate';
type PersistedShuffledStudent = { reg_no: string; name: string };
type PersistedBundleInfo = { name: string; scripts: number };
type CourseBundleDummyMap = Record<string, { courseDummies: string[]; bundles: Record<string, string[]> }>;
type CourseBundleDummyStore = Record<string, CourseBundleDummyMap>;
type PersistedAssigningStore = Record<string, Array<{ courseKey: string; valuators?: Array<{ bundles?: PersistedBundleInfo[] }> }>>;

function readAssigningStoreForBundleDummies(): PersistedAssigningStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ASSIGNING_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedAssigningStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readCourseBundleDummyStore(): CourseBundleDummyStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COURSE_BUNDLE_DUMMY_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CourseBundleDummyStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCourseBundleDummyStore(store: CourseBundleDummyStore) {
  if (typeof window === 'undefined') return;
  const keys = Object.keys(store || {});
  if (keys.length === 0) {
    kvSave(COURSE_BUNDLE_DUMMY_STORE_KEY, null);
    return;
  }
  kvSave(COURSE_BUNDLE_DUMMY_STORE_KEY, store);
}

export default function StudentsList() {
  const [departments, setDepartments] = useState<string[]>(['ALL']);
  const [semesters, setSemesters] = useState<string[]>(['SEM1']);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [department, setDepartment] = useState('ALL');
  const [semester, setSemester] = useState('SEM1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CoeStudentsMapResponse | null>(null);
  const [startSequence, setStartSequence] = useState(0);
  const [enriched, setEnriched] = useState<EnrichedData | null>(null);
  const [selectionMap, setSelectionMap] = useState<Record<string, CourseSelection>>({});
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shuffleUsed, setShuffleUsed] = useState(false);
  const [arrearShuffleMode, setArrearShuffleMode] = useState<ArrearShuffleMode>('include');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFileName, setPdfPreviewFileName] = useState('');
  const [activeEntryParams, setActiveEntryParams] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const processedRetrivalApplyKeyRef = useRef<string>('');

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

  // Hydrate all KV stores from DB on mount
  useEffect(() => {
    Promise.all([
      hydrateShuffledListStore(),
      hydrateMarksStore(),
      kvHydrate(ASSIGNING_STORE_KEY),
      kvHydrate(COURSE_BUNDLE_DUMMY_STORE_KEY),
    ]).catch(() => {});
  }, []);

  const absentCourseMap = useMemo(
    () => readCourseAbsenteesMap(getAttendanceFilterKey(department, semester)),
    [department, semester]
  );

  // TT schedule: courseKey -> date string (YYYY-MM-DD)
  const ttScheduleMap = useMemo(
    () => readTTScheduleMap(`${department}::${semester}`),
    [department, semester]
  );

  // Derive available exam dates from schedule
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    Object.values(ttScheduleMap).forEach((date) => {
      if (date) dates.add(date);
    });
    const sorted = Array.from(dates).sort();
    return sorted;
  }, [ttScheduleMap]);

  // Set of course keys that match the selected date
  const dateFilteredCourseKeys = useMemo(() => {
    if (!selectedDate) return null; // null means no date filter active
    const keys = new Set<string>();
    Object.entries(ttScheduleMap).forEach(([courseKey, date]) => {
      if (date === selectedDate) keys.add(courseKey);
    });
    return keys;
  }, [selectedDate, ttScheduleMap]);

  const getCurrentFilterKey = () => `${department}::${semester}`;

  const closePdfPreview = () => {
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPdfPreviewFileName('');
  };

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  const sanitizeFileName = (value: string) =>
    String(value || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 120);

  const handleOpenMarkEntry = (e: React.MouseEvent, student: AugStudent, qpType: string, deptName: string, semName: string) => {
    e.preventDefault();
    setActiveEntryParams({
      code: student.dummy ? student.dummy : (student.reg_no || ''),
      reg_no: student.reg_no || '',
      name: student.name || '',
      qp_type: qpType,
      dept: deptName,
      sem: semName,
      dummy_number: student.dummy || ''
    });
  };

  const getMarkEntryHref = (student: AugStudent, qpType: string, deptName: string, semName: string) => {
    return '#';
  };

  const barcodeDataUrlForValue = (value: string): string => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      width: 1,
      height: 24,
    });
    return canvas.toDataURL('image/png');
  };

  const drawCoursePdfEntry = (
    doc: jsPDF,
    x: number,
    y: number,
    width: number,
    student: AugStudent,
  ) => {
    const dummyText = student.dummy || '-';
    const rollText = student.reg_no || '-';
    const barcodeValue = dummyText;

    // Adjust font for Reg No and Dummy Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14); // Increased from 11
    doc.text(rollText, x, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14); // Increased from 11
    doc.text(dummyText, x, y + 11.8); 

    const barcodeImg = barcodeDataUrlForValue(barcodeValue);
    // Reduced length (width) of the barcode
    const barcodeW = 35; // Reduced from 44
    const barcodeH = 7.5; // Slightly reduced height to fit 15mm row
    // Align barcode to the right of the entry area, moved 2mm to the left
    const barcodeX = x + width - barcodeW - 2;
    const barcodeY = y + 0.5;

    doc.addImage(barcodeImg, 'PNG', barcodeX, barcodeY, barcodeW, barcodeH);

    // Dummy number below barcode with a small gap
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13); // Increased from 10
    doc.text(barcodeValue, barcodeX, y + 11.8); 
  };

  const buildCombinedCoursesPdf = (targets: { dept: string; course: AugCourse }[]) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14; 
    const topY = 16;
    const contentStartY = 31.0; // Shifted 2.5mm up from 33.5
    const bottomMargin = 10;
    const colGap = 12; 
    const colWidth = (pageWidth - marginX * 2 - colGap) / 2;
    const rowHeight = 12; // Reduced further to accommodate more gap
    const rowGap = 12.25; // Increased from 12.15 to shift the last rows down by 1mm (10 gaps * 0.1mm)

    const drawHeader = (deptName: string, course: AugCourse) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Department: ${deptName}`, marginX, topY);
      doc.text(`Course: ${course.course_name || 'Unnamed Course'}`, marginX + 64, topY);
      doc.text(`Code: ${course.course_code || 'NO_CODE'}`, pageWidth - marginX, topY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Semester: ${semester}`, marginX, topY + 4.5); // Reduced from +6
    };

    targets.forEach((target, targetIndex) => {
      if (targetIndex > 0) {
        doc.addPage();
      }

      drawHeader(target.dept, target.course);

      let y = contentStartY;
      const students = [...(target.course.students || [])].sort((a, b) => {
        const ra = String(a.reg_no || '').trim();
        const rb = String(b.reg_no || '').trim();
        return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
      });

      // Page 1: 2 Columns with Barcodes
      const rowsPerPage = 11;
      for (let i = 0; i < students.length; i += rowsPerPage * 2) {
        if (i > 0) {
          doc.addPage();
          drawHeader(target.dept, target.course);
        }

        for (let row = 0; row < rowsPerPage; row++) {
          const yPos = contentStartY + row * (rowHeight + rowGap);
          if (yPos + rowHeight > pageHeight - bottomMargin) break;

          // Student index for Left Column
          const leftIdx = i + row;
          if (leftIdx < students.length) {
            drawCoursePdfEntry(doc, marginX, yPos, colWidth, students[leftIdx]);
          }

          // Student index for Right Column (skips the 'rowsPerPage' of the first column)
          const rightIdx = i + row + rowsPerPage;
          if (rightIdx < students.length) {
            drawCoursePdfEntry(doc, marginX + colWidth + colGap, yPos, colWidth, students[rightIdx]);
          }
        }
      }

      // Page 2: 4 Columns List (No Barcodes) - EXACT distance as barcode page
      doc.addPage();
      drawHeader(target.dept, target.course);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text("Student Summary List (No Barcodes)", marginX, topY + 12);

      let summaryY = contentStartY + 5;
      // Use EXACT SAME rowHeight and rowGap as the barcode page to ensure distance is identical
      const summaryRowHeight = rowHeight; 
      const summaryRowGap = rowGap;

      // Each row contains 4 students with column-wise filling
      const summaryRowsPerPage = 18; // Approximate for summary page, adjust as needed or use a calculation
      const studentsPerPage = summaryRowsPerPage * 4;
      
      for (let i = 0; i < students.length; i += studentsPerPage) {
        if (i > 0) {
          doc.addPage();
          drawHeader(target.dept, target.course);
        }

        for (let row = 0; row < summaryRowsPerPage; row++) {
          const yPos = summaryY + row * (summaryRowHeight + summaryRowGap);
          if (yPos + summaryRowHeight > pageHeight - bottomMargin) break;

          const barcodeW = 48;
          const barcodeXOffset = colWidth - barcodeW;

          // Col 1
          const idx1 = i + row;
          if (idx1 < students.length) {
            const s = students[idx1];
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(s.reg_no || '-', marginX, yPos + 5);
            doc.text(s.dummy || '-', marginX, yPos + 11.5);
          }

          // Col 2
          const idx2 = i + row + summaryRowsPerPage;
          if (idx2 < students.length) {
            const s = students[idx2];
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(s.reg_no || '-', marginX + barcodeXOffset, yPos + 5);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(s.dummy || '-', marginX + barcodeXOffset, yPos + 11.5);
          }

          // Col 3
          const idx3 = i + row + (summaryRowsPerPage * 2);
          if (idx3 < students.length) {
            const s = students[idx3];
            const col3X = marginX + colWidth + colGap;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(s.reg_no || '-', col3X, yPos + 5);
            doc.text(s.dummy || '-', col3X, yPos + 11.5);
          }

          // Col 4
          const idx4 = i + row + (summaryRowsPerPage * 3);
          if (idx4 < students.length) {
            const s = students[idx4];
            const col4X = marginX + colWidth + colGap + barcodeXOffset;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(s.reg_no || '-', col4X, yPos + 5);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(s.dummy || '-', col4X, yPos + 11.5);
          }
        }
      }
    });

    return doc;
  };

  const previewPdf = (doc: jsPDF, fileName: string) => {
    const blob = doc.output('blob');
    const previewUrl = URL.createObjectURL(blob);
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });
    setPdfPreviewFileName(fileName);
  };

  const downloadFromPreview = () => {
    if (!pdfPreviewUrl || !pdfPreviewFileName) return;
    const anchor = document.createElement('a');
    anchor.href = pdfPreviewUrl;
    anchor.download = pdfPreviewFileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  useEffect(() => {
    fetchCourseSelectionMapFromApi(department, semester).then(setSelectionMap);
  }, [department, semester]);

  // Build enriched data with stable per-row dummy and enrollmentId whenever API `data` or `semester` changes
  useEffect(() => {
    if (!data) {
      setEnriched(null);
      return;
    }

    const semesterDigit = getSemesterDigit(semester);
    let globalSequence = startSequence;

    const persistedByDummy = getPersistedShuffledForFilter(getCurrentFilterKey());
    const savedByDummy = new Map(
      (data.saved_dummies || [])
        .filter((row) => row.semester === semester)
        .map((row) => [row.dummy, row])
    );

    const departments: AugDept[] = data.departments.map((deptBlock) => {
      const deptCode = DEPARTMENT_DUMMY_DIGITS[deptBlock.department] || '9';

      const courses: AugCourse[] = deptBlock.courses
        .filter((course) => {
          const courseKey = getCourseKey({
            department: deptBlock.department,
            semester,
            courseCode: course.course_code || '',
            courseName: course.course_name || '',
          });
          const config = selectionMap[courseKey];
          return config?.eseType === 'ESE';
        })
        .map((course) => {
          const courseKey = getCourseKey({
            department: deptBlock.department,
            semester,
            courseCode: course.course_code || '',
            courseName: course.course_name || '',
          });
          const courseAbsentees = absentCourseMap.get(courseKey);

          const sourceStudents = (course.students || []).filter((student) => {
            const regNo = String(student.reg_no || '').trim();
            return regNo ? !(courseAbsentees?.has(regNo)) : true;
          });

          const students: AugStudent[] = sourceStudents.map((student) => {
            globalSequence += 1;
            const enrollmentId = `ROW::${globalSequence}`;
            const dummy = generateDummyNumber(department, globalSequence);
            const saved = savedByDummy.get(dummy);
            const persisted = persistedByDummy[dummy];

            return {
              ...student,
              reg_no: saved?.reg_no || persisted?.reg_no || student.reg_no,
              name: saved?.name || persisted?.name || student.name,
              enrollmentId,
              dummy,
              saved_qp_type: saved?.qp_type,
            };
          });

          const isCourseShuffled = students.some((student, index) => {
            const original = sourceStudents[index];
            const saved = savedByDummy.get(student.dummy);
            if (!saved || !original) return false;
            return saved.reg_no !== original.reg_no || saved.name !== original.name;
          });

          return {
            ...course,
            students,
            shuffled: isCourseShuffled,
          };
        });

      return { ...deptBlock, courses } as AugDept;
    });

    setEnriched({
      department_filter: data.department_filter,
      semester_filter: data.semester_filter,
      departments,
    });
  }, [data, semester, selectionMap, absentCourseMap]);

  useEffect(() => {
    if (!enriched) return;
    if (department === 'ALL') return;

    const filterKey = `${department}::${semester}`;
    const assigningStore = readAssigningStoreForBundleDummies();
    const bundleDefsByCourse: Record<string, PersistedBundleInfo[]> = {};

    Object.entries(assigningStore).forEach(([storeKey, assignments]) => {
      if (!storeKey.startsWith(`${department}::${semester}::`)) return;
      (assignments || []).forEach((assignment) => {
        const allBundles: PersistedBundleInfo[] = [];
        (assignment.valuators || []).forEach((valuator) => {
          (valuator.bundles || []).forEach((bundle) => {
            const scripts = Number(bundle.scripts) || 0;
            const name = String(bundle.name || '').trim();
            if (!name || scripts <= 0) return;
            allBundles.push({ name, scripts });
          });
        });
        if (allBundles.length > 0) {
          bundleDefsByCourse[assignment.courseKey] = allBundles;
        }
      });
    });

    const byCourse: CourseBundleDummyMap = {};

    enriched.departments.forEach((dept) => {
      if (dept.department !== department) return;

      dept.courses.forEach((course) => {
        const courseKey = getCourseKey({
          department: dept.department,
          semester,
          courseCode: course.course_code || '',
          courseName: course.course_name || '',
        });

        const courseDummies = ((course.students as AugStudent[]) || [])
          .map((student) => String(student.dummy || '').trim())
          .filter(Boolean);

        const bundles: Record<string, string[]> = {};
        const defs = bundleDefsByCourse[courseKey] || [];
        let pointer = 0;
        defs.forEach((bundle) => {
          const slice = courseDummies.slice(pointer, pointer + bundle.scripts);
          bundles[bundle.name] = slice;
          pointer += bundle.scripts;
        });

        byCourse[courseKey] = {
          courseDummies,
          bundles,
        };
      });
    });

    const store = readCourseBundleDummyStore();
    store[filterKey] = byCourse;
    writeCourseBundleDummyStore(store);
  }, [department, semester, enriched]);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [res, seq] = await Promise.all([fetchCoeStudentsMap({ department, semester }), getSemesterStartSequence(department, semester)]);
          setStartSequence(seq);
        if (!active) return;
        setData(res);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to load students mapping.';
        setError(message);
      } finally {
        // eslint-disable-next-line no-unsafe-finally
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [department, semester]);

  useEffect(() => {
    setShuffleUsed(isFilterShuffled(getCurrentFilterKey()));
    setSelectedDate('');
  }, [department, semester]);

  useEffect(() => {
    if (semesters.length === 0) return;
    if (!semesters.includes(semester)) {
      setSemester(semesters[0]);
    }
  }, [semester, semesters]);

  useEffect(() => {
    if (!enriched) return;
    const payload = readRetrivalApplyPayload();
    if (!payload || payload.target !== 'coe_students') return;
    const payloadKey = `${String(payload.stagedAt || '')}::${String(payload.entry?.id || '')}`;
    if (processedRetrivalApplyKeyRef.current && processedRetrivalApplyKeyRef.current === payloadKey) return;

    const finishApplyFlow = (clearPayload: boolean) => {
      processedRetrivalApplyKeyRef.current = payloadKey;
      if (clearPayload) {
        clearRetrivalApplyPayload();
      }
    };

    const payloadRecords = Array.isArray(payload.entry.records) ? payload.entry.records : [];
    if (payloadRecords.length === 0) {
      finishApplyFlow(true);
      return;
    }

    // Simple normalization helpers for payload records
    const normalizeDeptFromRecord = (value: unknown): string => {
      return String(value || '').trim().toUpperCase() || '';
    };
    const normalizeSemFromRecord = (value: unknown): string => {
      const text = String(value || '').trim().toUpperCase();
      if (semesters.includes(text)) return text;
      const match = text.match(/[1-8]/);
      if (match) {
        const sem = `SEM${match[0]}`;
        if (semesters.includes(sem)) return sem;
      }
      return '';
    };

    const payloadDepartments = Array.from(new Set(
      payloadRecords
        .map((record) => normalizeDeptFromRecord(record.department))
        .filter(Boolean)
    ));
    const payloadSemesters = Array.from(new Set(
      payloadRecords
        .map((record) => normalizeSemFromRecord(record.semester))
        .filter(Boolean)
    ));

    // Align UI filter to payload context first so apply always targets the correct realtime list.
    if (payloadDepartments.length === 1 && department !== payloadDepartments[0]) {
      setDepartment(payloadDepartments[0]);
      return;
    }
    if (payloadSemesters.length === 1 && semester !== payloadSemesters[0]) {
      setSemester(payloadSemesters[0]);
      return;
    }

    type RestoredMapping = {
      id: number;
      department: string;
      semester: string;
      course_code: string;
      dummy: string;
      reg_no: string;
      name: string;
      is_arrear: boolean;
      course_student_index: number | null;
    };

    const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
    const byDummy: Record<string, RestoredMapping> = {};
    const byCourseCode: Record<string, RestoredMapping[]> = {};

    payloadRecords.forEach((record, index) => {
      const parsedIndex = Number(record.course_student_index ?? record.row_index ?? record.courseIndex);
      const recDepartment = normalizeDeptFromRecord(record.department);
      const recSemester = normalizeSemFromRecord(record.semester);
      const mapping: RestoredMapping = {
        id: index,
        department: recDepartment,
        semester: recSemester,
        course_code: String(record.course_code ?? ''),
        dummy: String(record.dummy ?? '').trim(),
        reg_no: String(record.reg_no ?? ''),
        name: String(record.name ?? ''),
        is_arrear: Boolean(record.is_arrear),
        course_student_index: Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : null,
      };

      if (!mapping.dummy && !mapping.reg_no && !mapping.name) return;
      if (mapping.dummy && mapping.department === department && mapping.semester === semester) {
        byDummy[mapping.dummy] = mapping;
      }

      if (mapping.department === department && mapping.semester === semester) {
        const codeKey = normalize(mapping.course_code);
        if (!byCourseCode[codeKey]) byCourseCode[codeKey] = [];
        byCourseCode[codeKey].push(mapping);
      }
    });

    Object.values(byCourseCode).forEach((rows) => {
      rows.sort((a, b) => {
        const ai = a.course_student_index;
        const bi = b.course_student_index;
        if (ai === null && bi === null) return a.id - b.id;
        if (ai === null) return 1;
        if (bi === null) return -1;
        return ai - bi;
      });
    });

    const scopedCount = Object.values(byCourseCode).reduce((acc, rows) => acc + rows.length, 0);
    if (scopedCount === 0) {
      finishApplyFlow(true);
      return;
    }

    let appliedCount = 0;
    const appliedByDummy: PersistedShuffledByDummy = {};
    const usedMappingIds = new Set<number>();

    setEnriched((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as EnrichedData;
      next.departments.forEach((dept) => {
        if (dept.department !== department) return;
        dept.courses.forEach((course) => {
          const coursePool = byCourseCode[normalize(course.course_code || '')] || [];
          if (coursePool.length === 0) return;

          (course.students as AugStudent[]).forEach((student, studentIndex) => {
            const mappedByDummy = byDummy[student.dummy];

            let mapped: RestoredMapping | undefined = undefined;
            if (mappedByDummy && !usedMappingIds.has(mappedByDummy.id)) {
              mapped = mappedByDummy;
            } else {
              const exactIndex = coursePool.find(
                (row) => row.course_student_index === studentIndex && !usedMappingIds.has(row.id)
              );
              if (exactIndex) {
                mapped = exactIndex;
              } else {
                const nextSequential = coursePool.find((row) => !usedMappingIds.has(row.id));
                if (nextSequential) {
                  mapped = nextSequential;
                }
              }
            }

            if (!mapped) return;
            usedMappingIds.add(mapped.id);

            student.reg_no = mapped.reg_no;
            student.name = mapped.name;
            student.is_arrear = mapped.is_arrear;
            appliedByDummy[student.dummy] = {
              reg_no: mapped.reg_no,
              name: mapped.name,
            };
            appliedCount += 1;
          });
        });
      });
      return next;
    });

    if (appliedCount > 0) {
      const filterKey = getCurrentFilterKey();
      setPersistedShuffledForFilter(filterKey, appliedByDummy);
      markFilterAsShuffled(filterKey);
      setShuffleUsed(true);
    }

    finishApplyFlow(true);
  }, [
    enriched,
    department,
    semester,
    getCurrentFilterKey,
    markFilterAsShuffled,
    setPersistedShuffledForFilter,
  ]);

  function shuffleAllCourses() {
    setEnriched((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as EnrichedData;

      next.departments.forEach((dept) => {
        dept.courses.forEach((course: AugCourse) => {
          // Skip courses not matching the selected date filter
          if (dateFilteredCourseKeys) {
            const courseKey = getCourseKey({
              department: dept.department,
              semester,
              courseCode: course.course_code || '',
              courseName: course.course_name || '',
            });
            if (!dateFilteredCourseKeys.has(courseKey)) return;
          }

          const students = course.students;
          if (!students || students.length === 0) {
            course.shuffled = true;
            return;
          }

          const pairs = students.map((s) => ({
            name: s.name,
            reg_no: s.reg_no,
            is_arrear: Boolean(s.is_arrear),
          }));
          const shuffleInPlace = (list: typeof pairs) => {
            for (let i = list.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [list[i], list[j]] = [list[j], list[i]];
            }
          };

          if (arrearShuffleMode === 'include') {
            shuffleInPlace(pairs);
          } else {
            const arrearPairs = pairs.filter((p) => p.is_arrear);
            const regularPairs = pairs.filter((p) => !p.is_arrear);
            shuffleInPlace(arrearPairs);
            shuffleInPlace(regularPairs);

            const separatedPairs = pairs.map((pair) => {
              if (pair.is_arrear) {
                return arrearPairs.shift() || pair;
              }
              return regularPairs.shift() || pair;
            });

            pairs.splice(0, pairs.length, ...separatedPairs);
          }

          for (let k = 0; k < students.length; k++) {
            students[k].name = pairs[k].name;
            students[k].reg_no = pairs[k].reg_no;
            students[k].is_arrear = pairs[k].is_arrear;
          }

          course.shuffled = true;
        });
      });

      const shuffledByDummy: PersistedShuffledByDummy = {};
      next.departments.forEach((dept) => {
        dept.courses.forEach((course: AugCourse) => {
          (course.students as AugStudent[]).forEach((student) => {
            shuffledByDummy[student.dummy] = {
              reg_no: student.reg_no,
              name: student.name,
            };
          });
        });
      });
      setPersistedShuffledForFilter(getCurrentFilterKey(), shuffledByDummy);

      return next;
    });
  }

  function handleShuffleAllCourses() {
    const modeText = arrearShuffleMode === 'include'
      ? 'Arrear and regular students will be shuffled together.'
      : 'Arrear students will be shuffled only within arrear students (separate from regular students).';
    const confirmed = window.confirm(`Are you sure you want to shuffle all courses for the selected department and semester? ${modeText} This action cannot be undone in the current session.`);
    if (!confirmed) return;
    shuffleAllCourses();
    setShuffleUsed(true);
    markFilterAsShuffled(getCurrentFilterKey());
  }

  const handleSaveToDB = async () => {
    if (!enriched) return;

    if (!shuffleUsed) {
      alert('Please shuffle the student list before saving to DB.');
      return;
    }
    
    // Calculate total students to verify
    let totalRecords = 0;
    enriched.departments.forEach(dept => {
      dept.courses.forEach(course => {
        totalRecords += course.students.length;
      });
    });

    if (totalRecords === 0) {
      alert("No student records to save.");
      return;
    }

    if (!window.confirm(`Are you sure you want to save ${totalRecords} student-to-dummy mappings to the database?`)) {
      return;
    }

    const password = window.prompt('Enter your login password to confirm this save:');
    if (password === null) {
      return;
    }
    if (!password.trim()) {
      alert('Password is required to save mappings.');
      return;
    }

    setSaving(true);
    try {
      const records: { reg_no: string; dummy: string; semester: string; qp_type: 'QP1' | 'QP2' | 'TCPR' | 'TCPL' | 'OE' }[] = [];
      enriched.departments.forEach((dept) => {
        dept.courses.forEach((course) => {
          const courseKey = getCourseKey({
            department: dept.department,
            semester,
            courseCode: course.course_code || '',
            courseName: course.course_name || '',
          });
          const conf = selectionMap[courseKey];
          const qpType = conf?.qpType || 'QP1';

          (course.students as AugStudent[]).forEach((student) => {
             records.push({
               reg_no: student.reg_no,
               dummy: student.dummy,
               semester: semester,
               qp_type: qpType,
             });
          });
        });
      });

      const res = await saveCoeStudentDummies({ records, password });
      const refreshed = await fetchCoeStudentsMap({ department, semester });
      setData(refreshed);
      const currentFilterKey = getCurrentFilterKey();
      markFilterAsShuffled(currentFilterKey);
      setShuffleUsed(true);
      alert(`Successfully saved mappings!\nCreated: ${res.created}\nUpdated: ${res.updated}`);
    } catch (err) {
      console.error(err);
      alert('Failed to save mappings. check console for details.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetList = async () => {
    if (!enriched) return;

    const dummies: string[] = [];
    const resetRecords: Array<Record<string, unknown>> = [];
    enriched.departments.forEach((dept) => {
      dept.courses.forEach((course) => {
        (course.students as AugStudent[]).forEach((student, studentIndex) => {
          if (student.dummy) {
            dummies.push(student.dummy);
            resetRecords.push({
              department: dept.department,
              semester,
              course_code: course.course_code,
              course_name: course.course_name,
              course_student_index: studentIndex,
              dummy: student.dummy,
              reg_no: student.reg_no,
              name: student.name,
              is_arrear: Boolean(student.is_arrear),
            });
          }
        });
      });
    });

    if (dummies.length === 0) {
      alert('No mappings found to reset.');
      return;
    }

    if (!window.confirm(`Reset ${dummies.length} mappings for ${semester}? This will restore original list order and enable shuffle again for reset courses.`)) {
      return;
    }

    const password = window.prompt('Enter your login password to confirm reset:');
    if (password === null) {
      return;
    }
    if (!password.trim()) {
      alert('Password is required to reset mappings.');
      return;
    }

    setResetting(true);
    try {
      const res = await resetCoeStudentDummies({ semester, dummies, password });
      const refreshed = await fetchCoeStudentsMap({ department, semester });
      setData(refreshed);
      const currentFilterKey = getCurrentFilterKey();
      unmarkFilterAsShuffled(currentFilterKey);
      clearPersistedShuffledForFilter(currentFilterKey);
      setShuffleUsed(false);
      appendRetrivalEntry({
        action: 'reset',
        source: 'dummy_reset',
        page: 'COE Students List',
        records: resetRecords,
      });
      alert(`Reset completed.\nDeleted mappings: ${res.deleted}`);
    } catch (err) {
      console.error(err);
      alert('Failed to reset mappings. check console for details.');
    } finally {
      setResetting(false);
    }
  };

  const handleDownloadCoursePdfs = async () => {
    if (!enriched) return;

    const targets: { dept: string; course: AugCourse }[] = [];
    enriched.departments.forEach((dept: AugDept) => {
      dept.courses.forEach((course: AugCourse) => {
        if ((course.students || []).length > 0) {
          targets.push({ dept: dept.department, course });
        }
      });
    });

    if (targets.length === 0) {
      alert('No course data available to download.');
      return;
    }

    setDownloading(true);
    try {
      const doc = buildCombinedCoursesPdf(targets);
      const fileName = sanitizeFileName(`COE_${department}_${semester}_AllCourses.pdf`);
      previewPdf(doc, fileName);
    } catch (err) {
      console.error(err);
      alert('Failed to generate course PDFs. Check console for details.');
    } finally {
      setDownloading(false);
    }
  };

  const savedDummySet = new Set(
    (data?.saved_dummies || [])
      .filter((row) => row.semester === semester)
      .map((row) => row.dummy)
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {!activeEntryParams ? (
        <>
          <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">COE StudentsList</h1>
          <p className="mt-2 text-sm text-gray-600">Filter students by department and semester.</p>
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-700">
            <span className="font-medium text-gray-800">Arrear Shuffle:</span>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="arrear-shuffle-mode"
                value="include"
                checked={arrearShuffleMode === 'include'}
                onChange={() => setArrearShuffleMode('include')}
                disabled={loading || saving || resetting || shuffleUsed}
              />
              Include
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="arrear-shuffle-mode"
                value="separate"
                checked={arrearShuffleMode === 'separate'}
                onChange={() => setArrearShuffleMode('separate')}
                disabled={loading || saving || resetting || shuffleUsed}
              />
              Separate
            </label>
          </div>
        </div>
          <div className="flex items-center gap-2">
           <button
             onClick={handleShuffleAllCourses}
             disabled={loading || saving || resetting || !enriched || shuffleUsed}
             className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
           >
             {shuffleUsed ? 'Shuffled' : 'Shuffle All'}
           </button>
           <button
             onClick={handleResetList}
             disabled={loading || saving || resetting || downloading || !enriched}
             className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
           >
             {resetting ? 'Resetting...' : 'Reset'}
           </button>
           <button
             onClick={handleDownloadCoursePdfs}
             disabled={loading || saving || resetting || downloading || !enriched}
             className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
           >
             {downloading ? 'Downloading...' : 'Download PDFs'}
           </button>
           <button
             onClick={handleSaveToDB}
             disabled={loading || saving || resetting || downloading || !enriched || !shuffleUsed}
             className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
           >
             {saving ? 'Saving...' : 'Save to DB'}
           </button>
          </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="coe-department">
              Department
            </label>
            <select
              id="coe-department"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:opacity-50"
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
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="coe-semester">
              Semester
            </label>
            <select
              id="coe-semester"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
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
        </div>

        <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
          Selected: <span className="font-semibold">{department}</span> | <span className="font-semibold">{semester}</span>
        </div>
      </div>

      {/* Date bar for filtering courses by exam date */}
      <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">Exam Date:</span>
          {availableDates.length === 0 ? (
            <span className="text-sm text-gray-400">No dates assigned. Set TT dates in Course List first.</span>
          ) : (
            <>
              <button
                onClick={() => setSelectedDate('')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedDate === '' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All Dates
              </button>
              {availableDates.map((date) => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedDate === date ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">Loading course-wise students...</div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
      ) : null}

      {!loading && !error && enriched ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
          {enriched.departments.length === 0 ? (
            <p className="text-sm text-gray-600">No course-student mapping found for the selected department and semester.</p>
          ) : (
            enriched.departments.map((deptBlock: AugDept, deptIndex: number) => (
              <div key={deptBlock.department} className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">{deptBlock.department}</h2>

                {deptBlock.courses.length === 0 ? (
                  <p className="text-sm text-gray-600">No ESE courses found for this department.</p>
                ) : (
                  deptBlock.courses
                    .filter((course: AugCourse) => {
                      if (!dateFilteredCourseKeys) return true; // no date filter
                      const ck = getCourseKey({
                        department: deptBlock.department,
                        semester: semester,
                        courseCode: course.course_code,
                        courseName: course.course_name,
                      });
                      return dateFilteredCourseKeys.has(ck);
                    })
                    .map((course: AugCourse, courseIndex: number) => {
                    const courseKey = getCourseKey({
                      department: deptBlock.department,
                      semester: semester,
                      courseCode: course.course_code,
                      courseName: course.course_name,
                    });
                    const qpType = selectionMap[courseKey]?.qpType || 'QP1';
                    const courseUiKey = `${deptBlock.department}::${course.course_code || ''}::${course.course_name || ''}::${courseIndex}`;
                    return (
                    <div key={courseUiKey} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{course.course_name || 'Unnamed Course'}</h3>
                          <p className="text-xs font-medium text-gray-500">{course.course_code || 'NO_CODE'}</p>
                        </div>
                      </div>

                      {course.students.length === 0 ? (
                        <p className="mt-2 text-sm text-gray-600">No students enrolled in this course.</p>
                      ) : (
                        <div className="mt-3 overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 border border-gray-200 bg-white text-sm text-gray-700">
                            <thead className="bg-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                              <tr>
                                <th className="px-3 py-2">Dummy</th>
                                <th className="px-3 py-2">Mark Entry</th>
                                <th className="px-3 py-2">Reg No</th>
                                <th className="px-3 py-2">Name</th>
                                <th className="px-3 py-2">Barcode</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {course.students.map((student: AugStudent) => {
                                const dummy = student.dummy;
                                const enrollmentKey = student.enrollmentId;
                                const canNavigateToMarkEntry = Boolean(
                                  dummy && student.reg_no && shuffleUsed && savedDummySet.has(dummy)
                                );

                                return (
                                  <tr key={enrollmentKey} className="align-middle">
                                    <td className="px-3 py-2 font-semibold text-gray-900">{dummy}</td>
                                    <td className="px-3 py-2">
                                      {canNavigateToMarkEntry ? (
                                        <a
                                          href="#"
                                          
                                          
                                          onClick={(e) => handleOpenMarkEntry(e, student, qpType, deptBlock.department, semester)}
className="font-medium text-blue-700 underline hover:text-blue-800"
                                        >
                                          {dummy}
                                        </a>
                                      ) : (
                                        <span className="text-gray-400" title="Shuffle list and save to DB to enable mark entry.">Locked</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">{student.reg_no || '-'}</td>
                                    <td className="px-3 py-2">
                                      {student.is_arrear ? (
                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 mr-2">
                                          Arrear
                                        </span>
                                      ) : null}
                                      {student.name}
                                    </td>
                                    <td className="px-3 py-2">
                                      <Barcode
                                        value={dummy}
                                        displayValue={true}
                                        height={26}
                                        width={1}
                                        margin={0}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
                )}
              </div>
            ))
          )}
        </div>
      ) : null}

      {pdfPreviewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">PDF Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadFromPreview}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Download
                </button>
                <button
                  onClick={closePdfPreview}
                  className="px-3 py-1.5 rounded-md bg-gray-200 text-gray-800 text-sm font-medium hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="h-[80vh] bg-gray-100">
              <iframe title="COE PDF Preview" src={pdfPreviewUrl} className="w-full h-full" />
            </div>
          </div>
        </div>
      ) : null}
        </>
      ) : (
      <ErrorBoundary fallback={<div>Error</div>}>
        <BarScanMarkEntry
          key={activeEntryParams.code}
          embeddedCode={activeEntryParams.code}
          embeddedRegNo={activeEntryParams.reg_no}
          embeddedName={activeEntryParams.name}
          embeddedQpType={activeEntryParams.qp_type}
          embeddedDept={activeEntryParams.dept}
          embeddedSem={activeEntryParams.sem}
          embeddedDummy={activeEntryParams.dummy_number}
          onClose={() => setActiveEntryParams(null)}
          onNextScan={(newCode) => {
               // Inside StudentList, if they scan next, we might not have all the URL details mapped to variables unless we search for it.
               // We just pass it in bare code.
               setActiveEntryParams({
                  code: newCode,
                  qp_type: activeEntryParams.qp_type // retain qp type if known, or it gets looked up by BarScanMarkEntry fallback
               });
          }}
        />
      </ErrorBoundary>
      )}
    </div>
  );
}
