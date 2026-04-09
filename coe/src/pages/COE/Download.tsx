import React, { useEffect, useState, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import JSZip from 'jszip';

import {
  CoeCourseStudent,
  fetchCoeStudentsMap,
  fetchCoeFinalResult,
  type CoeFinalResultEntry,
} from '../../services/coe';
import fetchWithAuth from '../../services/fetchAuth';
import {
  getCourseKey,
  fetchCourseSelectionMapFromApi,
  QpType,
} from './courseSelectionStorage';
import { getAttendanceFilterKey, readCourseAbsenteesMap, hydrateAttendanceStore } from './attendanceStore';
import { getSemesterStartSequence, generateDummyNumber } from './dummySequence';
import {
  readShuffledLists,
  hydrateShuffledListStore,
} from './shuffledListStore';
import { readStudentTotalMarks, hydrateMarksStore } from './marksStore';
import {
  listFinalizedBundleConfigs,
  hydrateBundleFinalizeStore,
  getBundleFinalizeConfig,
} from '../../utils/coeBundleFinalizeStore';
import { kvHydrate } from '../../utils/coeKvStore';
import { isSameDept } from '../../utils/deptAliases';
import krLogoSrc from '../../assets/krlogo.png';
import newBannerSrc from '../../assets/newban.jpeg';

/* ═══════════════════════════════════════════════════════════
   Constants & helpers (same as existing pages)
   ═══════════════════════════════════════════════════════════ */

/* Non-academic department short_names to exclude from COE downloads */
const NON_ACADEMIC_DEPTS = new Set([
  'ATT', 'GEN', 'LAB', 'LIB', 'OFF', 'PED', 'SCV', 'SWE', 'T&P', 'TP', 'Y  I',
]);

const DEPARTMENT_SHORT: Record<string, string> = {
  /* Backend-normalized names (returned by students-map API) */
  CIVIL: 'CE', IT: 'IT', CSE: 'CS', MECH: 'ME', ECE: 'EC', EEE: 'EE', AIDS: 'AD', AIML: 'AM',
  /* Raw department short_names (from /api/academics/departments/) */
  CE: 'CE', ME: 'ME', 'AI&DS': 'AD', 'AI&ML': 'AM', RE: 'RE', 'S&H': 'SH',
};

const DEPT_CATEGORY_CODE: Record<string, string> = {
  CSE: 'CSE', MECH: 'Mech', ECE: 'ECE', EEE: 'EEE', CIVIL: 'CIVIL',
  'AI&DS': 'AI&DS', 'AI&ML': 'AI&ML', IT: 'IT',
  CE: 'CIVIL', ME: 'Mech', RE: 'RE', 'S&H': 'S&H',
};

const PROGRAM_CODE: Record<string, string> = {
  CSE: 'B.E-CSE', MECH: 'B.E-MECH', ECE: 'B.E-ECE', EEE: 'B.E-EEE', CIVIL: 'B.E-CIVIL',
  'AI&DS': 'B.Tech-AIDS', 'AI&ML': 'B.Tech-AIML', IT: 'B.TECH-IT',
  CE: 'B.E-CIVIL', ME: 'B.E-MECH', RE: 'B.E-MECH', 'S&H': 'B.Sc-S&H',
};

const SEMESTER_CLASS_CODE: Record<string, string> = {
  'CSE::1': 'BCSE-1', 'CSE::2': 'BCSE-2', 'CSE::3': 'BCSE-3', 'CSE::4': 'BCSE-4',
  'CSE::5': 'BCSE-5', 'CSE::6': 'BCSE-6', 'CSE::7': 'BCSE-7', 'CSE::8': 'BCSE-8',
  'MECH::1': 'BMEC-1', 'MECH::2': 'BMEC-2', 'MECH::3': 'BMEC-3', 'MECH::4': 'BMEC-4',
  'MECH::5': 'BMEC-5', 'MECH::6': 'BMEC-6', 'MECH::7': 'BMEC-7', 'MECH::8': 'BMEC-8',
  'ECE::1': 'BECE-1', 'ECE::2': 'BECE-2', 'ECE::3': 'BECE-3', 'ECE::4': 'BECE-4',
  'ECE::5': 'BECE-5', 'ECE::6': 'BECE-6', 'ECE::7': 'BECE-7', 'ECE::8': 'BECE-8',
  'EEE::1': 'BEEE-1', 'EEE::2': 'BEEE-2', 'EEE::3': 'BEEE-3', 'EEE::4': 'BEEE-4',
  'EEE::5': 'BEEE-5', 'EEE::6': 'BEEE-6', 'EEE::7': 'BEEE-7', 'EEE::8': 'BEEE-8',
  'CIVIL::1': 'BCE-1', 'CIVIL::2': 'BCE-2', 'CIVIL::3': 'BCE-3',
  'CIVIL::5': 'BCE-5', 'CIVIL::6': 'BCE-6', 'CIVIL::7': 'BCE-7', 'CIVIL::8': 'BCE-8',
  'AI&DS::1': 'BAIDS-1', 'AI&DS::2': 'BAIDS-2', 'AI&DS::3': 'BAIDS-3', 'AI&DS::4': 'BAIDS-4',
  'AI&DS::5': 'BAIDS-5', 'AI&DS::6': 'BAIDS-6', 'AI&DS::7': 'BAIDS-7', 'AI&DS::8': 'BAIDS-8',
  'AI&ML::1': 'BAIML', 'AI&ML::2': 'BAIML-2', 'AI&ML::3': 'BAIML-3', 'AI&ML::4': 'BAIML-4',
  'AI&ML::5': 'BAIML-5', 'AI&ML::6': 'BAIML-6', 'AI&ML::7': 'BAIML-7', 'AI&ML::8': 'BAIML-8',
  'IT::1': 'BIT-1', 'IT::2': 'BIT-2', 'IT::3': 'BIT-3', 'IT::4': 'BIT-4',
  'IT::5': 'BIT-5', 'IT::6': 'BIT-6', 'IT::7': 'BIT-7', 'IT::8': 'BIT-8',
  /* Aliases for raw department short_names (CE, ME) */
  'CE::1': 'BCE-1', 'CE::2': 'BCE-2', 'CE::3': 'BCE-3', 'CE::4': 'BCE-4',
  'CE::5': 'BCE-5', 'CE::6': 'BCE-6', 'CE::7': 'BCE-7', 'CE::8': 'BCE-8',
  'ME::1': 'BMEC-1', 'ME::2': 'BMEC-2', 'ME::3': 'BMEC-3', 'ME::4': 'BMEC-4',
  'ME::5': 'BMEC-5', 'ME::6': 'BMEC-6', 'ME::7': 'BMEC-7', 'ME::8': 'BMEC-8',
  'RE::1': 'BMEC-1', 'RE::2': 'BMEC-2', 'RE::3': 'BMEC-3', 'RE::4': 'BMEC-4',
  'RE::5': 'BMEC-5', 'RE::6': 'BMEC-6', 'RE::7': 'BMEC-7', 'RE::8': 'BMEC-8',
};

const ALLOWED_COURSE_CODES: Record<string, string> = {
  '20AI8903': '20AI8903-R', '20AM8904': '20AM8904-R', '20CE8925': '20CE8925-R',
  '20CE8926': '20CE8926-R', '20CS8901': '20CS8901-R', '20CS8902': '20CS8902-R',
  '20CS8908': '20CS8908-R', '20EC8901': '20EC8901-R', '20EC8904': '20EC8904-R',
  '20EC8905': '20EC8905-R', '20EE8902': '20EE8902-R', '20EE8907': '20EE8907-R',
  '20ME8106': '20ME8106-R', '20ME8103': '20ME8103-R', '20GE7811': '20GE7811-R',
  '20HS8801': '20HS8801-R', '20CE0803': '20CE0803-R', '20AI0912': '20AI0912 - R',
  '20EC8803': '20EC8803-R', '20CS6801': '20CS6801-R', '20GE7812': '20GE7812-R',
  '20AI0913': '20AI0913-R', '20CS8802': '20CS8802-R', '20EE7802': '20EE7802-R',
  '20CS6802': '20CS6802-R', '20RE8801': '20RE8801-R',
};

const SHUFFLED_LIST_KEY = 'coe-students-shuffled-list-v1';
const COURSE_BUNDLE_DUMMY_STORE_KEY = 'coe-course-bundle-dummies-v1';

type CourseBundleDummyMap = Record<string, { courseDummies: string[]; bundles: Record<string, string[]> }>;
type CourseBundleDummyStore = Record<string, CourseBundleDummyMap>;

function readCourseBundleDummyStore(): CourseBundleDummyStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COURSE_BUNDLE_DUMMY_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

type BundleStudent = { reg_no: string; name: string; dummy: string; isShuffled: boolean };
type BundleStudentWithMarks = BundleStudent & { totalMarks: number; hasSavedMarks: boolean };

type BundleInfo = {
  bundleName: string;
  students: BundleStudent[];
  course_code: string;
  course_name: string;
  department: string;
  qpType: QpType;
};

type AugStudent = { id: number; reg_no: string; name: string; dummy: string; isShuffled: boolean; is_arrear?: boolean };
type AugCourse = { course_code: string; course_name: string; students: AugStudent[]; apiDepartment?: string };

function chunkStudents<T>(students: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < students.length; i += chunkSize) chunks.push(students.slice(i, i + chunkSize));
  return chunks;
}

function sanitizeFileName(value: string): string {
  return String(value || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 120);
}

function barcodeDataUrlForValue(value: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, { format: 'CODE128', displayValue: false, margin: 0, width: 1, height: 24 });
  return canvas.toDataURL('image/png');
}

function barcodeDataUrlTall(value: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, { format: 'CODE128', displayValue: false, margin: 0, width: 1, height: 28 });
  return canvas.toDataURL('image/png');
}

function getSemesterDigit(value: string): string {
  const parsed = Number.parseInt(String(value || '').replace('SEM', ''), 10);
  if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 8) return String(parsed);
  return '0';
}

function formatCourseCode(code: string): string {
  if (!code) return '';
  const base = code.trim().replace(/\s*-\s*R\s*$/, '').trim();
  if (!base) return '';
  return ALLOWED_COURSE_CODES[base] || '';
}

function getMaxMarksForQpType(qpType: string): number {
  switch ((qpType || 'QP1').trim().toUpperCase()) {
    case 'TCPR': return 80;
    case 'OE': return 60;
    case 'QP1': case 'QP2': case 'TCPL': default: return 100;
  }
}

function numberToWords(value: number): string {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return '';
  const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const underHundred = (x: number): string => { if (x < 20) return ones[x]; const t = Math.floor(x / 10); const r = x % 10; return r === 0 ? tens[t] : `${tens[t]} ${ones[r]}`; };
  if (n < 100) return underHundred(n);
  if (n === 100) return 'Hundred';
  const h = Math.floor(n / 100); const r = n % 100;
  if (r === 0) return `${ones[h]} Hundred`;
  return `${ones[h]} Hundred ${underHundred(r)}`;
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => { if (typeof reader.result === 'string') resolve(reader.result); else reject(new Error('read fail')); };
    reader.onerror = () => reject(new Error('read fail'));
    reader.readAsDataURL(blob);
  });
}

async function imageDataUrlSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error('size fail'));
    img.src = dataUrl;
  });
}

/* ═══════════════════════════════════════════════════════════
   Data loading helpers (for a single department + semester)
   ═══════════════════════════════════════════════════════════ */

/** Resolves students with dummies + shuffled mappings for a department */
async function loadDeptStudents(department: string, semester: string): Promise<AugCourse[]> {
  const [response, startSequence] = await Promise.all([
    fetchCoeStudentsMap({ department, semester }),
    getSemesterStartSequence(department, semester),
  ]);

  const filterKey = `${department}::${semester}`;
  const persistedByDummy = readShuffledLists()[filterKey] || {};
  const savedByDummy = new Map(
    (response.saved_dummies || []).filter((r) => r.semester === semester).map((r) => [r.dummy, r]),
  );
  const selectionMap = await fetchCourseSelectionMapFromApi(department, semester);
  const absentCourseMap = readCourseAbsenteesMap(getAttendanceFilterKey(department, semester));

  let globalSequence = startSequence;
  const courses: AugCourse[] = [];

  const bundleStore = readCourseBundleDummyStore();

  for (const deptBlock of response.departments) {
    for (const course of deptBlock.courses) {
      const courseKey = getCourseKey({
        department: deptBlock.department, semester,
        courseCode: course.course_code || '', courseName: course.course_name || '',
      });
      const selection = selectionMap[courseKey];
      if (selection?.eseType !== 'ESE') continue;

      const courseAbsentees = absentCourseMap.get(courseKey);
      const originalStudents = (course.students || []).filter((s: CoeCourseStudent) => {
        const regNo = String(s.reg_no || '').trim();
        return regNo ? !(courseAbsentees?.has(regNo)) : true;
      });

      const students: AugStudent[] = originalStudents.map((student: CoeCourseStudent) => {
        globalSequence += 1;
        const dummy = generateDummyNumber(department, globalSequence);
        const saved = savedByDummy.get(dummy);
        const persisted = persistedByDummy[dummy];
        return {
          id: student.id,
          reg_no: saved?.reg_no || persisted?.reg_no || student.reg_no,
          name: saved?.name || persisted?.name || student.name,
          dummy,
          isShuffled: Boolean(saved || persisted),
          is_arrear: student.is_arrear,
        };
      });

      // Check authoritative course bundle dummy store
      const deptFilterKey = `${deptBlock.department}::${semester}`;
      const courseBundleMap = bundleStore[deptFilterKey] || bundleStore[filterKey] || {};
      const normalizedCourseCode = String(course.course_code || '').trim();
      const normalizedCourseName = String(course.course_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      let matchingKeys: string[] = [];
      if (normalizedCourseCode) {
        const prefix = `${deptBlock.department}::${semester}::${normalizedCourseCode}::`;
        const candidates = Object.keys(courseBundleMap).filter((k) => k.startsWith(prefix));
        if (candidates.length <= 1) matchingKeys = candidates;
        else {
          const exactByName = candidates.filter((k) => String((k.split('::')[3] || '')).trim().toLowerCase().replace(/\s+/g, ' ') === normalizedCourseName);
          matchingKeys = exactByName.length > 0 ? exactByName : candidates;
        }
      }
      const authKey = matchingKeys.length > 0 ? matchingKeys[0] : null;
      const authCourse = authKey ? courseBundleMap[authKey] : null;
      const authDummies = Array.isArray(authCourse?.courseDummies)
        ? authCourse!.courseDummies.map((d: string) => String(d || '').trim()).filter(Boolean) : [];

      let resolvedStudents = students;
      if (authDummies.length > 0) {
        const studentsByDummy = new Map(students.map((s) => [String(s.dummy || '').trim(), s]));
        resolvedStudents = authDummies.map((dummy) => {
          const current = studentsByDummy.get(dummy);
          const saved = savedByDummy.get(dummy);
          const persisted = persistedByDummy[dummy];
          return {
            id: current?.id || 0,
            reg_no: saved?.reg_no || persisted?.reg_no || current?.reg_no || '',
            name: saved?.name || persisted?.name || current?.name || '-',
            dummy,
            isShuffled: Boolean(saved || persisted || current?.isShuffled),
          };
        });
      }

      courses.push({
        course_code: course.course_code || 'NO_CODE',
        course_name: course.course_name || 'Unnamed Course',
        students: resolvedStudents,
        apiDepartment: deptBlock.department,
      });
    }
  }

  return courses;
}

/** Build bundles for a department + semester (same logic as BundleBarcodeView) */
async function loadDeptBundles(department: string, semester: string, bundleSize: number): Promise<BundleInfo[]> {
  const courses = await loadDeptStudents(department, semester);
  const selectionMap = await fetchCourseSelectionMapFromApi(department, semester);
  const filterKey = `${department}::${semester}`;
  const allBundles: BundleInfo[] = [];
  const includedCourseKeys = new Set<string>();

  for (const course of courses) {
    const apiDept = course.apiDepartment || department;
    const courseKey = getCourseKey({ department: apiDept, semester, courseCode: course.course_code, courseName: course.course_name });
    const selection = selectionMap[courseKey];
    const qpType: QpType = (selection?.qpType as QpType) || 'QP1';
    const deptShort = DEPARTMENT_SHORT[apiDept] || DEPARTMENT_SHORT[department] || String(department || '').slice(0, 2).toUpperCase();
    const chunks = chunkStudents(course.students, bundleSize);
    chunks.forEach((students, i) => {
      allBundles.push({
        bundleName: `${course.course_code}${deptShort}${String(i + 1).padStart(3, '0')}`,
        students: students.map((s) => ({ reg_no: s.reg_no, name: s.name, dummy: s.dummy, isShuffled: s.isShuffled })),
        course_code: course.course_code,
        course_name: course.course_name,
        department,
        qpType,
      });
    });
    includedCourseKeys.add(courseKey);
  }

  // Append additional bundles from AdditionalPage store
  const bundleStore = readCourseBundleDummyStore();
  const shuffledLists = readShuffledLists();
  const existingBundleNames = new Set(allBundles.map((b) => b.bundleName));
  const persistedByDummy = shuffledLists[filterKey] || {};

  Object.entries(bundleStore).forEach(([storeKey, courseBundleMap]) => {
    const [storedDept, storedSem] = storeKey.split('::');
    if (storedSem !== semester) return;
    if (!isSameDept(storedDept, department)) return;

    Object.entries(courseBundleMap).forEach(([courseKey, courseData]) => {
      const parts = courseKey.split('::');
      const courseCode = parts[2] || '';
      const courseName = parts[3] || '';

      Object.entries(courseData.bundles || {}).forEach(([bundleName, dummies]) => {
        if (existingBundleNames.has(bundleName)) return;
        const students: BundleStudent[] = (dummies || []).map((dummy) => {
          const info = persistedByDummy[dummy] || { reg_no: '', name: '-' };
          return { reg_no: info.reg_no, name: info.name, dummy, isShuffled: true };
        });
        if (students.length > 0) {
          // Determine qpType from selection map if possible
          const ck = getCourseKey({ department, semester, courseCode, courseName });
          const sel = selectionMap[ck];
          allBundles.push({
            bundleName,
            students,
            course_code: courseCode,
            course_name: courseName,
            department,
            qpType: (sel?.qpType as QpType) || 'QP1',
          });
          existingBundleNames.add(bundleName);
        }
      });
    });
  });

  return allBundles;
}

/* ═══════════════════════════════════════════════════════════
   PDF Builders
   ═══════════════════════════════════════════════════════════ */

/** Build student dummy number PDF for one department (same layout as StudentsList) */
function buildStudentsPdf(department: string, semester: string, courses: AugCourse[]): jsPDF {
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

  const drawHeader = (course: AugCourse) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Department: ${department}`, marginX, topY);
    doc.text(`Course: ${course.course_name}`, marginX + 64, topY);
    doc.text(`Code: ${course.course_code}`, pageWidth - marginX, topY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Semester: ${semester}`, marginX, topY + 6);
  };

  const drawEntry = (x: number, y: number, width: number, student: AugStudent) => {
    const rollText = student.reg_no || '-';
    const dummyText = student.dummy || '-';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(rollText, x + 1, y + 5);
    doc.text(dummyText, x + 1, y + 11);
    const barcodeImg = barcodeDataUrlForValue(dummyText);
    const barcodeW = 34; const barcodeH = 7;
    const barcodeX = x + width - barcodeW - 1;
    doc.addImage(barcodeImg, 'PNG', barcodeX, y + 1, barcodeW, barcodeH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(dummyText, barcodeX, y + 11);
  };

  courses.forEach((course, courseIdx) => {
    if (courseIdx > 0) doc.addPage();
    drawHeader(course);
    let y = contentStartY;
    const sorted = [...course.students].sort((a, b) => {
      const ra = String(a.reg_no || '').trim();
      const rb = String(b.reg_no || '').trim();
      return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
    });
    for (let i = 0; i < sorted.length; i += 2) {
      if (y + rowHeight > pageHeight - bottomMargin) {
        doc.addPage();
        drawHeader(course);
        y = contentStartY;
      }
      drawEntry(marginX, y, colWidth, sorted[i]);
      if (sorted[i + 1]) drawEntry(marginX + colWidth + colGap, y, colWidth, sorted[i + 1]);
      y += rowHeight + rowGap;
    }
  });

  return doc;
}

/** Build bundle barcodes PDF for one department (same layout as BundleBarcodeView) */
function buildBundleBarcodesPdf(department: string, semester: string, bundleSize: number, bundles: BundleInfo[]): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const topY = 14;
  const contentStartY = 34;
  const bottomMargin = 12;
  const colGap = 8;
  const colWidth = (pageWidth - marginX * 2 - colGap) / 2;
  const rowHeight = 36;
  const rowGap = 8;

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Bundle Barcodes', marginX, topY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Department: ${department}   Semester: ${semester}   Bundle Size: ${bundleSize}`, marginX, topY + 6);
  };

  const drawCard = (x: number, y: number, bundle: BundleInfo) => {
    doc.roundedRect(x, y, colWidth, rowHeight, 1.5, 1.5, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(bundle.bundleName, x + 2, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const courseText = `${bundle.course_code} | ${bundle.department} | ${bundle.course_name}`;
    const courseLines = doc.splitTextToSize(courseText, colWidth - 4);
    doc.text(courseLines.slice(0, 2), x + 2, y + 11);
    const barcodeImg = barcodeDataUrlForValue(bundle.bundleName);
    doc.addImage(barcodeImg, 'PNG', x + 2, y + 16, colWidth - 4, 10);
    const startDummy = bundle.students.length ? bundle.students[0].dummy : '-';
    const endDummy = bundle.students.length ? bundle.students[bundle.students.length - 1].dummy : '-';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`${startDummy}-${endDummy}`, x + colWidth / 2, y + 30, { align: 'center' });
  };

  drawHeader();
  let y = contentStartY;
  for (let i = 0; i < bundles.length; i += 2) {
    if (y + rowHeight > pageHeight - bottomMargin) {
      doc.addPage();
      drawHeader();
      y = contentStartY;
    }
    drawCard(marginX, y, bundles[i]);
    if (bundles[i + 1]) drawCard(marginX + colWidth + colGap, y, bundles[i + 1]);
    y += rowHeight + rowGap;
  }

  return doc;
}

/** Build one-page report PDF for a single bundle (same layout as OnePageReport) */
async function buildOnePageReportPdf(
  bundle: BundleInfo,
  leftLogoDataUrl: string,
  rightLogoDataUrl: string,
  leftLogoSize: { w: number; h: number } | null,
  rightLogoSize: { w: number; h: number } | null,
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const headerTop = 12;
  const headerHeight = 26;
  const tableStartY = headerTop + headerHeight + 16;

  const drawHeader = () => {
    const leftBoxWidth = 85;
    const leftBoxHeight = headerHeight - 2;
    const rightBoxSize = headerHeight - 4;
    const leftBoxX = margin + 1;
    const rightBoxX = pageWidth - margin - rightBoxSize - 3;
    const leftBoxY = headerTop + 1;
    const rightBoxY = headerTop + 2;

    const drawLogoInBox = (
      dataUrl: string, size: { w: number; h: number } | null,
      boxX: number, boxY: number, boxW: number, boxH: number,
    ) => {
      if (!dataUrl || !size) return;
      const imageRatio = size.w / size.h;
      let drawW = boxW; let drawH = boxH;
      if (imageRatio > 1) { drawH = boxW / imageRatio; if (drawH > boxH) { drawH = boxH; drawW = boxH * imageRatio; } }
      else { drawW = boxH * imageRatio; if (drawW > boxW) { drawW = boxW; drawH = boxW / imageRatio; } }
      const isLeftBox = boxX === leftBoxX;
      const drawX = isLeftBox ? boxX : boxX + (boxW - drawW) / 2;
      const drawY = isLeftBox ? boxY : boxY + (boxH - drawH) / 2;
      doc.addImage(dataUrl, 'PNG', drawX, drawY, drawW, drawH);
    };

    drawLogoInBox(leftLogoDataUrl, leftLogoSize, leftBoxX, leftBoxY, leftBoxWidth, leftBoxHeight);
    drawLogoInBox(rightLogoDataUrl, rightLogoSize, rightBoxX, rightBoxY, rightBoxSize, rightBoxSize);
    const textCenterX = pageWidth / 2 + 14;
    const textCenterY = headerTop + headerHeight / 2;
    doc.setFont('times', 'bolditalic');
    doc.setFontSize(12);
    doc.text('OFFICE OF THE CONTROLLER', textCenterX, textCenterY - 2, { align: 'center' });
    doc.text('OF EXAMINATIONS', textCenterX, textCenterY + 5, { align: 'center' });
  };

  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.4);
  doc.rect(margin, headerTop, contentWidth, pageHeight - headerTop - margin);
  drawHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`BUNDLE NUMBER: ${bundle.bundleName}`, margin + 3, headerTop + headerHeight + 7);
  doc.text(`COURSE CODE: ${bundle.course_code}`, margin + 3, headerTop + headerHeight + 12);
  doc.text(`COURSE NAME: ${bundle.course_name}`, margin + 62, headerTop + headerHeight + 12);

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = String(today.getFullYear());
  doc.text(`DATE: ${dd}-${mm}-${yyyy}`, pageWidth - margin - 3, headerTop + headerHeight + 12, { align: 'right' });

  const maxMarkPerStudent = getMaxMarksForQpType(bundle.qpType);

  // Read marks for each student
  const studentsWithMarks = bundle.students.map((s) => {
    const marksData = readStudentTotalMarks(s.dummy);
    return { ...s, totalMarks: marksData.totalMarks, hasSavedMarks: marksData.hasSavedMarks };
  });

  const studentRows = studentsWithMarks.map((student, idx) => {
    const mark = Math.max(0, Math.floor(Number(student.totalMarks || 0)));
    return [String(idx + 1), student.dummy, String(maxMarkPerStudent), String(mark), numberToWords(mark), ''];
  });

  const totalStudents = studentsWithMarks.length;
  const sumMarks = studentsWithMarks.reduce((sum, s) => sum + Math.max(0, Math.floor(Number(s.totalMarks || 0))), 0);
  const sumMaxMarks = studentsWithMarks.reduce((sum) => sum + maxMarkPerStudent, 0);
  const averageMarks = totalStudents > 0 ? sumMarks / totalStudents : 0;
  const percentage = sumMaxMarks > 0 ? (sumMarks / sumMaxMarks) * 100 : 0;

  const summaryRow = [
    { content: 'AVERAGE / PERCENTAGE', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: averageMarks.toFixed(2), styles: { fontStyle: 'bold', halign: 'center' } },
    { content: `${percentage.toFixed(2)}%`, styles: { fontStyle: 'bold', halign: 'center' } },
    { content: '', styles: { fontStyle: 'bold' } },
  ];

  const tableBody = [...studentRows, summaryRow] as any[];

  autoTable(doc, {
    startY: tableStartY,
    margin: { top: tableStartY, left: margin, right: margin, bottom: 26 },
    head: [['S.NO', 'DUMMY NUMBER', 'MAX MARK', 'MARK', 'MARKS IN WORDS', 'REMARKS']],
    body: tableBody,
    theme: 'grid',
    showHead: 'everyPage',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 36 },
      2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 52 }, 5: { cellWidth: 52 },
    },
    didDrawPage: () => {
      doc.setLineWidth(0.4);
      doc.rect(margin, headerTop, contentWidth, pageHeight - headerTop - margin);
      drawHeader();
    },
  });

  const totalPages = doc.getNumberOfPages();
  doc.setPage(totalPages);
  const signLineY = pageHeight - margin - 10;
  const signLabelY = signLineY + 5;
  const leftX = margin + 8;
  const signWidth = 66;
  const centerX = (pageWidth - signWidth) / 2;
  const rightX = pageWidth - margin - 74;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Valuator Details', leftX + signWidth / 2, signLabelY, { align: 'center' });
  doc.text('AE', centerX + signWidth / 2, signLabelY, { align: 'center' });
  doc.text('Cheif Examiner Signature', rightX + signWidth / 2, signLabelY, { align: 'center' });

  return doc;
}

/** Build Final Result Excel for one department in ArrayBuffer form */
async function buildFinalResultExcel(dept: string, semesterNumber: string, semesterLabel: string): Promise<ArrayBuffer | null> {
  try {
    const resp = await fetchCoeFinalResult(dept, semesterLabel);
    if (!resp.results || resp.results.length === 0) return null;

    const programCode = PROGRAM_CODE[dept] || '';
    const deptCategoryCode = DEPT_CATEGORY_CODE[dept] || '';
    const semClassCode = SEMESTER_CLASS_CODE[`${dept}::${semesterNumber}`] || '';

    const rows = resp.results
      .filter((r: CoeFinalResultEntry) => formatCourseCode(r.course_code) !== '')
      .map((r: CoeFinalResultEntry) => {
        const maxMark = getMaxMarksForQpType(r.qp_type || 'QP1');
        const rawMark = Math.max(0, Math.floor(Number(r.total_marks || 0)));
        const externalMark = Math.min(rawMark, maxMark);
        return {
          'Register Number*': r.reg_no || '',
          'Student Name': r.name || '',
          'Degree Code*': 'UG',
          'Program Code*': programCode,
          'Dept/school category Code*': deptCategoryCode,
          'Semester/Class Code*': semClassCode,
          'Course Code*': formatCourseCode(r.course_code),
          'Sub Exam Code*': 'Theory-1',
          'Assessment Type': '',
          'Examination Code*': 'End Semester Examination',
          'External Mark*': externalMark,
        };
      });

    if (rows.length === 0) return null;

    const xlsx = await import('xlsx');
    const headers = [
      'Register Number*', 'Student Name', 'Degree Code*', 'Program Code*',
      'Dept/school category Code*', 'Semester/Class Code*', 'Course Code*',
      'Sub Exam Code*', 'Assessment Type', 'Examination Code*', 'External Mark*',
    ];
    const ws = xlsx.utils.json_to_sheet(rows, { header: headers });
    ws['!cols'] = headers.map((h) => {
      let maxLen = h.length;
      for (const row of rows) { const val = String((row as any)[h] ?? ''); if (val.length > maxLen) maxLen = val.length; }
      return { wch: Math.min(maxLen + 2, 40) };
    });
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Final Result');
    return xlsx.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  } catch (err) {
    console.warn(`Failed to build final result for ${dept}:`, err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════
   Download Page Component
   ═══════════════════════════════════════════════════════════ */

export default function Download() {
  const [semesters, setSemesters] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedSem, setSelectedSem] = useState<string>('');
  const [hydrating, setHydrating] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Checkboxes
  const [chkStudents, setChkStudents] = useState(false);
  const [chkBundles, setChkBundles] = useState(false);
  const [chkOnePageReport, setChkOnePageReport] = useState(false);
  const [chkFinalResult, setChkFinalResult] = useState(false);

  // Load semesters, departments, and hydrate KV stores on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Hydrate all stores
        await Promise.all([
          hydrateShuffledListStore(),
          hydrateMarksStore(),
          hydrateBundleFinalizeStore(),
          hydrateAttendanceStore(),
          kvHydrate(COURSE_BUNDLE_DUMMY_STORE_KEY),
        ]).catch(() => {});

        // Fetch semesters and departments in parallel
        const [semRes, deptRes] = await Promise.all([
          fetchWithAuth('/api/academics/semesters/'),
          fetchWithAuth('/api/academics/departments/'),
        ]);

        if (!active) return;

        // Process semesters
        if (semRes.ok) {
          const data = await semRes.json();
          const sems = data.results || data || [];
          const semNames = sems.map((s: any) => s.name || s.code || s).filter(Boolean);
          setSemesters(semNames.length > 0 ? semNames : ['SEM1']);
        } else {
          setSemesters(['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8']);
        }

        // Process departments — filter out non-academic ones
        if (deptRes.ok) {
          const data = await deptRes.json();
          const depts = data.results || data || [];
          const deptNames = depts
            .map((d: any) => {
              const label = d?.short_name || d?.code || d?.name || d;
              return label ? String(label).trim().toUpperCase() : null;
            })
            .filter((n: string | null): n is string => Boolean(n) && !NON_ACADEMIC_DEPTS.has(n as string));
          setDepartments(deptNames);
        } else {
          // Fallback: use departments from the shuffled list KV store keys
          const shuffled = readShuffledLists();
          const fromKv = new Set<string>();
          Object.keys(shuffled).forEach((k) => {
            const [d] = k.split('::');
            if (d && !NON_ACADEMIC_DEPTS.has(d.toUpperCase())) fromKv.add(d);
          });
          setDepartments(fromKv.size > 0
            ? Array.from(fromKv).sort()
            : ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'AI&DS', 'AI&ML', 'IT']
          );
        }
      } catch {
        setSemesters(['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8']);
        setDepartments(['CSE', 'ECE', 'EEE', 'ME', 'CE', 'AI&DS', 'AI&ML', 'IT']);
      } finally {
        if (active) setHydrating(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const anySelected = chkStudents || chkBundles || chkOnePageReport || chkFinalResult;

  const handleDownload = useCallback(async () => {
    if (!selectedSem || !anySelected) return;
    setDownloading(true);
    setError(null);
    setProgress('Initializing...');

    try {
      const masterZip = new JSZip();
      const semesterNumber = selectedSem.replace('SEM', '');

      // Use dynamically-fetched departments (raw short_names from API)
      const depts = departments.length > 0 ? departments : ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'AI&DS', 'AI&ML', 'IT'];

      // Pre-load logos for one-page report
      let leftLogoDataUrl = '';
      let rightLogoDataUrl = '';
      let leftLogoSize: { w: number; h: number } | null = null;
      let rightLogoSize: { w: number; h: number } | null = null;
      if (chkOnePageReport) {
        try {
          leftLogoDataUrl = await imageUrlToDataUrl(newBannerSrc);
          rightLogoDataUrl = await imageUrlToDataUrl(krLogoSrc);
          leftLogoSize = await imageDataUrlSize(leftLogoDataUrl);
          rightLogoSize = await imageDataUrlSize(rightLogoDataUrl);
        } catch { /* logos optional */ }
      }

      for (let di = 0; di < depts.length; di++) {
        const dept = depts[di];
        setProgress(`Processing ${dept} (${di + 1}/${depts.length})...`);

        // ─── Students PDF ───
        if (chkStudents) {
          try {
            setProgress(`${dept}: Generating student dummy PDFs...`);
            const courses = await loadDeptStudents(dept, selectedSem);
            if (courses.length > 0) {
              const doc = buildStudentsPdf(dept, selectedSem, courses);
              const pdfBlob = doc.output('arraybuffer');
              const fileName = sanitizeFileName(`Students_${dept}_${selectedSem}.pdf`);
              masterZip.folder('Students')!.file(fileName, pdfBlob);
            }
          } catch (err) {
            console.warn(`Students PDF failed for ${dept}:`, err);
          }
        }

        // ─── Bundles PDF ───
        if (chkBundles) {
          try {
            setProgress(`${dept}: Generating bundle barcode PDFs...`);
            const cfg = getBundleFinalizeConfig(dept, selectedSem);
            const bundleSize = cfg?.bundleSize || 25;
            const bundles = await loadDeptBundles(dept, selectedSem, bundleSize);
            if (bundles.length > 0) {
              const doc = buildBundleBarcodesPdf(dept, selectedSem, bundleSize, bundles);
              const pdfBlob = doc.output('arraybuffer');
              const fileName = sanitizeFileName(`Bundles_${dept}_${selectedSem}.pdf`);
              masterZip.folder('Bundles')!.file(fileName, pdfBlob);
            }
          } catch (err) {
            console.warn(`Bundles PDF failed for ${dept}:`, err);
          }
        }

        // ─── One Page Reports ───
        if (chkOnePageReport) {
          try {
            setProgress(`${dept}: Generating one-page reports...`);
            const cfg = getBundleFinalizeConfig(dept, selectedSem);
            const bundleSize = cfg?.bundleSize || 25;
            const bundles = await loadDeptBundles(dept, selectedSem, bundleSize);
            const deptFolder = masterZip.folder('OnePageReports')!.folder(sanitizeFileName(dept))!;

            for (let bi = 0; bi < bundles.length; bi++) {
              const bundle = bundles[bi];
              try {
                setProgress(`${dept}: One-page report ${bi + 1}/${bundles.length} (${bundle.bundleName})...`);
                const doc = await buildOnePageReportPdf(bundle, leftLogoDataUrl, rightLogoDataUrl, leftLogoSize, rightLogoSize);
                const pdfBlob = doc.output('arraybuffer');
                const fileName = sanitizeFileName(`OPR_${bundle.bundleName}.pdf`);
                deptFolder.file(fileName, pdfBlob);
              } catch (err) {
                console.warn(`OPR failed for bundle ${bundle.bundleName}:`, err);
              }
            }
          } catch (err) {
            console.warn(`One-page reports failed for ${dept}:`, err);
          }
        }

        // ─── Final Result Excel ───
        if (chkFinalResult) {
          try {
            setProgress(`${dept}: Generating final result Excel...`);
            const excelBuf = await buildFinalResultExcel(dept, semesterNumber, selectedSem);
            if (excelBuf) {
              const fileName = sanitizeFileName(`Final_Result_${dept}_${selectedSem}.xlsx`);
              masterZip.folder('FinalResults')!.file(fileName, excelBuf);
            }
          } catch (err) {
            console.warn(`Final result Excel failed for ${dept}:`, err);
          }
        }
      }

      // Generate ZIP and trigger download
      setProgress('Generating ZIP file...');
      const zipBlob = await masterZip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = sanitizeFileName(`COE_Download_${selectedSem}_${new Date().toISOString().slice(0, 10)}.zip`);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setProgress('Download complete!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed.';
      setError(msg);
      setProgress('');
    } finally {
      setDownloading(false);
    }
  }, [selectedSem, chkStudents, chkBundles, chkOnePageReport, chkFinalResult, anySelected, departments]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-2">
      {/* Header */}
      <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)]">
        <h1 className="text-2xl font-bold text-[#5b1a30]">Download</h1>
        <p className="mt-1 text-sm text-[#6f4a3f]">
          Bulk download students, bundles, one-page reports, and final results as a ZIP for all departments.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)] space-y-5">
        {/* Semester Selector */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#5b1a30]">Semester</label>
          <select
            value={selectedSem}
            onChange={(e) => setSelectedSem(e.target.value)}
            disabled={hydrating || downloading}
            className="w-64 rounded-lg border border-[#c8917f]/60 bg-white px-3 py-2 text-sm text-[#3b1520] shadow-sm focus:border-[#6f1d34] focus:outline-none focus:ring-1 focus:ring-[#6f1d34]"
          >
            <option value="">-- Select Semester --</option>
            {semesters.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Checkboxes */}
        <div>
          <p className="mb-2 text-xs font-semibold text-[#5b1a30]">Select items to download</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${chkStudents ? 'border-[#6f1d34] bg-[#fdf2ef]' : 'border-[#deb9ac] bg-white hover:bg-[#fdf6f3]'}`}>
              <input
                type="checkbox"
                checked={chkStudents}
                onChange={(e) => setChkStudents(e.target.checked)}
                disabled={downloading}
                className="h-4 w-4 rounded border-gray-300 text-[#6f1d34] focus:ring-[#6f1d34]"
              />
              <div>
                <span className="text-sm font-medium text-[#3b1520]">Students</span>
                <p className="text-xs text-[#6f4a3f]">Dummy number PDFs with barcodes for all departments</p>
              </div>
            </label>

            <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${chkBundles ? 'border-[#6f1d34] bg-[#fdf2ef]' : 'border-[#deb9ac] bg-white hover:bg-[#fdf6f3]'}`}>
              <input
                type="checkbox"
                checked={chkBundles}
                onChange={(e) => setChkBundles(e.target.checked)}
                disabled={downloading}
                className="h-4 w-4 rounded border-gray-300 text-[#6f1d34] focus:ring-[#6f1d34]"
              />
              <div>
                <span className="text-sm font-medium text-[#3b1520]">Bundles</span>
                <p className="text-xs text-[#6f4a3f]">Bundle barcode PDFs for all departments</p>
              </div>
            </label>

            <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${chkOnePageReport ? 'border-[#6f1d34] bg-[#fdf2ef]' : 'border-[#deb9ac] bg-white hover:bg-[#fdf6f3]'}`}>
              <input
                type="checkbox"
                checked={chkOnePageReport}
                onChange={(e) => setChkOnePageReport(e.target.checked)}
                disabled={downloading}
                className="h-4 w-4 rounded border-gray-300 text-[#6f1d34] focus:ring-[#6f1d34]"
              />
              <div>
                <span className="text-sm font-medium text-[#3b1520]">One Page Report</span>
                <p className="text-xs text-[#6f4a3f]">One-page report PDFs for all bundles of all departments</p>
              </div>
            </label>

            <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${chkFinalResult ? 'border-[#6f1d34] bg-[#fdf2ef]' : 'border-[#deb9ac] bg-white hover:bg-[#fdf6f3]'}`}>
              <input
                type="checkbox"
                checked={chkFinalResult}
                onChange={(e) => setChkFinalResult(e.target.checked)}
                disabled={downloading}
                className="h-4 w-4 rounded border-gray-300 text-[#6f1d34] focus:ring-[#6f1d34]"
              />
              <div>
                <span className="text-sm font-medium text-[#3b1520]">Final Result</span>
                <p className="text-xs text-[#6f4a3f]">Final result Excel files for all departments</p>
              </div>
            </label>
          </div>
        </div>

        {/* Download Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleDownload}
            disabled={downloading || !selectedSem || !anySelected || hydrating}
            className="rounded-lg bg-[#6f1d34] px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#591729] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? 'Downloading...' : 'Download ZIP'}
          </button>
          {!selectedSem && !hydrating && (
            <span className="text-xs text-[#6f4a3f]">Please select a semester</span>
          )}
          {selectedSem && !anySelected && !hydrating && (
            <span className="text-xs text-[#6f4a3f]">Please select at least one item</span>
          )}
        </div>
      </div>

      {/* Progress */}
      {(downloading || progress) && (
        <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)]">
          <h2 className="text-sm font-semibold text-[#5b1a30] mb-2">Progress</h2>
          {downloading && (
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[#deb9ac]/40">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-[#6f1d34]" />
            </div>
          )}
          <p className="text-sm text-[#6f4a3f]">{progress}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
