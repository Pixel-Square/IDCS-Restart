import React, { useEffect, useMemo, useRef, useState } from 'react';
import Barcode from 'react-barcode';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

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
import {
  appendRetrivalEntry,
  clearRetrivalApplyPayload,
  readRetrivalApplyPayload,
} from '../../utils/retrivalStore';
import { kvHydrate } from '../../utils/coeKvStore';
import { hydrateShuffledListStore, readShuffleLocks, writeShuffleLocks, markFilterAsShuffled, unmarkFilterAsShuffled, isFilterShuffled, readShuffledLists, writeShuffledLists, getPersistedShuffledForFilter, setPersistedShuffledForFilter, clearPersistedShuffledForFilter, PersistedShuffledByDummy } from './shuffledListStore';
import { hydrateMarksStore } from './marksStore';

const DEPARTMENTS = ['ALL', 'AIDS', 'AIML', 'CSE', 'CIVIL', 'ECE', 'EEE', 'IT', 'MECH'] as const;
const SEMESTERS = ['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8'] as const;

const DEPARTMENT_DUMMY_DIGITS: Record<string, string> = {
  AIDS: '1',
  AIML: '2',
  CSE: '3',
  CIVIL: '4',
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
  saved_qp_type?: 'QP1' | 'QP2' | 'TCPR';
};
type AugCourse = CoeCourseGroup & { students: AugStudent[]; shuffled?: boolean };
type AugDept = CoeDepartmentCourseMap & { courses: AugCourse[] };
type EnrichedData = { department_filter: string; semester_filter: string | null; departments: AugDept[] };
const SHUFFLE_LOCK_KEY = 'coe-students-shuffle-lock-v1';
const SHUFFLED_LIST_KEY = 'coe-students-shuffled-list-v1';
type ArrearShuffleMode = 'include' | 'separate';
type PersistedShuffledStudent = { reg_no: string; name: string };

const normalizeDeptFilter = (value: unknown): (typeof DEPARTMENTS)[number] | '' => {
  const dept = String(value ?? '').trim().toUpperCase();
  if ((DEPARTMENTS as readonly string[]).includes(dept) && dept !== 'ALL') {
    return dept as (typeof DEPARTMENTS)[number];
  }
  return '';
};

const normalizeSemesterFilter = (value: unknown): (typeof SEMESTERS)[number] | '' => {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return '';

  if ((SEMESTERS as readonly string[]).includes(text)) {
    return text as (typeof SEMESTERS)[number];
  }

  const match = text.match(/[1-8]/);
  if (!match) return '';
  const sem = `SEM${match[0]}`;
  if ((SEMESTERS as readonly string[]).includes(sem)) {
    return sem as (typeof SEMESTERS)[number];
  }
  return '';
};

export default function StudentsList() {
  const [department, setDepartment] = useState<(typeof DEPARTMENTS)[number]>('ALL');
  const [semester, setSemester] = useState<(typeof SEMESTERS)[number]>('SEM1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CoeStudentsMapResponse | null>(null);
  const [enriched, setEnriched] = useState<EnrichedData | null>(null);
  const [selectionMap, setSelectionMap] = useState<Record<string, CourseSelection>>({});
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shuffleUsed, setShuffleUsed] = useState(false);
  const [arrearShuffleMode, setArrearShuffleMode] = useState<ArrearShuffleMode>('include');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFileName, setPdfPreviewFileName] = useState('');
  const processedRetrivalApplyKeyRef = useRef<string>('');

  const semesterOptions = useMemo<(typeof SEMESTERS)[number][]>(() => {
    const rawSemesters = (data as any)?.available_semesters;
    const normalized = (Array.isArray(rawSemesters) ? rawSemesters : [])
      .map((value: unknown) => normalizeSemesterFilter(value))
      .filter((value): value is (typeof SEMESTERS)[number] => Boolean(value));

    const unique = Array.from(new Set(normalized));
    unique.sort((a, b) => getSemesterNumber(a) - getSemesterNumber(b));

    return unique.length > 0 ? unique : [...SEMESTERS];
  }, [data]);

  const getCurrentFilterKey = () => `${department}::${semester}`;

  const closePdfPreview = () => {
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPdfPreviewFileName('');
  };

  // Hydrate all KV stores from DB on mount
  useEffect(() => {
    Promise.all([
      hydrateShuffledListStore(),
      hydrateMarksStore(),
    ]).catch(() => {});
  }, []);

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

  const getMarkEntryHref = (student: AugStudent, qpType: string, deptName: string, semName: string) => {
    const params = new URLSearchParams();
    if (student.dummy) params.set('code', student.dummy);
    else params.set('code', student.reg_no || '');
    params.set('reg_no', student.reg_no || '');
    params.set('name', student.name || '');
    params.set('qp_type', qpType);
    params.set('dept', deptName);
    params.set('sem', semName);
    if (student.dummy) params.set('dummy_number', student.dummy);
    return `/coe/bar-scan/entry?${params.toString()}`;
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

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(rollText, x + 1, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(dummyText, x + 1, y + 11);

    const barcodeImg = barcodeDataUrlForValue(barcodeValue);
    const barcodeW = 34;
    const barcodeH = 7;
    const barcodeX = x + width - barcodeW - 1;
    const barcodeY = y + 1;

    doc.addImage(barcodeImg, 'PNG', barcodeX, barcodeY, barcodeW, barcodeH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(barcodeValue, barcodeX, y + 11);
  };

  const buildCombinedCoursesPdf = (targets: { dept: string; course: AugCourse }[]) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 12;
    const topY = 16;
    const contentStartY = 30;
    const bottomMargin = 12;
    const colGap = 8;
    const colWidth = (pageWidth - marginX * 2 - colGap) / 2;
    const rowHeight = 16;
    const rowGap = 6;

    const drawHeader = (deptName: string, course: AugCourse) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Department: ${deptName}`, marginX, topY);
      doc.text(`Course: ${course.course_name || 'Unnamed Course'}`, marginX + 64, topY);
      doc.text(`Code: ${course.course_code || 'NO_CODE'}`, pageWidth - marginX, topY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Semester: ${semester}`, marginX, topY + 6);
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

        const da = ra.replace(/\D/g, '');
        const db = rb.replace(/\D/g, '');

        if (da && db) {
          if (da.length !== db.length) {
            return da.length - db.length;
          }
          const numericOrder = da.localeCompare(db, undefined, { numeric: false, sensitivity: 'base' });
          if (numericOrder !== 0) return numericOrder;
        }

        return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
      });

      for (let i = 0; i < students.length; i += 2) {
        if (y + rowHeight > pageHeight - bottomMargin) {
          doc.addPage();
          drawHeader(target.dept, target.course);
          y = contentStartY;
        }

        drawCoursePdfEntry(doc, marginX, y, colWidth, students[i]);

        if (students[i + 1]) {
          drawCoursePdfEntry(doc, marginX + colWidth + colGap, y, colWidth, students[i + 1]);
        }

        y += rowHeight + rowGap;
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
    let globalSequence = 0;

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
          const students: AugStudent[] = course.students.map((student) => {
            globalSequence += 1;
            const enrollmentId = `ROW::${globalSequence}`;
            const dummy = `KR00${deptCode}${semesterDigit}${String(globalSequence).padStart(5, '0')}`;
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
            const original = course.students[index];
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
  }, [data, semester, selectionMap]);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchCoeStudentsMap({ department, semester });
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
  }, [department, semester]);

  useEffect(() => {
    if (semesterOptions.length === 0) return;
    if (!semesterOptions.includes(semester)) {
      setSemester(semesterOptions[0]);
    }
  }, [semester, semesterOptions]);

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

    const payloadDepartments = Array.from(new Set(
      payloadRecords
        .map((record) => normalizeDeptFilter(record.department))
        .filter((value): value is (typeof DEPARTMENTS)[number] => Boolean(value))
    ));
    const payloadSemesters = Array.from(new Set(
      payloadRecords
        .map((record) => normalizeSemesterFilter(record.semester))
        .filter((value): value is (typeof SEMESTERS)[number] => Boolean(value))
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
      department: (typeof DEPARTMENTS)[number] | '';
      semester: (typeof SEMESTERS)[number] | '';
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
      const recDepartment = normalizeDeptFilter(record.department);
      const recSemester = normalizeSemesterFilter(record.semester);
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

          course.students.forEach((student: AugStudent, studentIndex: number) => {
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
          course.students.forEach((student: AugStudent) => {
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
      const records: { reg_no: string; dummy: string; semester: string; qp_type: 'QP1' | 'QP2' | 'TCPR' }[] = [];
      enriched.departments.forEach((dept) => {
        dept.courses.forEach((course) => {
          const courseKey = getCourseKey({
            department: dept.department,
            semester,
            courseCode: course.course_code || '',
            courseName: course.course_name || '',
          });
          const conf = selectionMap[courseKey];
          const qpType = conf?.qpType === 'QP2' || conf?.qpType === 'TCPR' ? conf.qpType : 'QP1';

          course.students.forEach((student: AugStudent) => {
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
        course.students.forEach((student: AugStudent, studentIndex: number) => {
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
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
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
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="coe-semester">
              Semester
            </label>
            <select
              id="coe-semester"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              value={semester}
              onChange={(e) => setSemester(e.target.value as (typeof SEMESTERS)[number])}
            >
              {semesterOptions.map((sem) => (
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
                  deptBlock.courses.map((course: AugCourse, courseIndex: number) => {
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
                                          href={getMarkEntryHref(student, qpType, deptBlock.department, semester)}
                                          target="_blank"
                                          rel="noopener noreferrer"
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
    </div>
  );
}
