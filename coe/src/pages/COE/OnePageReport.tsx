import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import { CoeCourseStudent, fetchCoeStudentsMap } from '../../services/coe';
import { getCourseKey, readCourseSelectionMap } from './courseSelectionStorage';
import { listFinalizedBundleConfigs } from '../../utils/coeBundleFinalizeStore';
import krLogoSrc from '../../assets/krlogo.png';
import newBannerSrc from '../../assets/new_banner.png';
import { getAttendanceFilterKey, readCourseAbsenteesMap } from './attendanceStore';
import { getSemesterStartSequence, generateDummyNumber } from './dummySequence';

const SEMESTERS = ['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8'] as const;
const SHUFFLED_LIST_KEY = 'coe-students-shuffled-list-v1';

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

type PersistedShuffledStudent = { reg_no: string; name: string };
type PersistedShuffledByDummy = Record<string, PersistedShuffledStudent>;

type BundleStudent = {
  dummy: string;
  reg_no: string;
  name: string;
  totalMarks: number;
  hasSavedMarks: boolean;
};

type FinalizedBundle = {
  bundleName: string;
  semester: string;
  bundleSize: number;
  department: string;
  course_code: string;
  course_name: string;
  students: BundleStudent[];
};

type BundleSearchResult =
  | { status: 'ready'; bundle: FinalizedBundle }
  | { status: 'not_finalized' }
  | { status: 'not_found' };

function getCurrentFilterKey(department: string, semester: string): string {
  return `${department}::${semester}`;
}

function getSemesterDigit(value: string): string {
  const numberPart = value.replace('SEM', '');
  const parsed = Number.parseInt(numberPart, 10);
  if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 8) return String(parsed);
  return '0';
}

function readShuffledLists(): Record<string, PersistedShuffledByDummy> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(SHUFFLED_LIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PersistedShuffledByDummy>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function chunkStudents(students: BundleStudent[], chunkSize: number): BundleStudent[][] {
  const chunks: BundleStudent[][] = [];
  for (let i = 0; i < students.length; i += chunkSize) {
    chunks.push(students.slice(i, i + chunkSize));
  }
  return chunks;
}

function readStudentTotalMarks(dummy: string): { hasSavedMarks: boolean; totalMarks: number } {
  if (typeof window === 'undefined') {
    return { hasSavedMarks: false, totalMarks: 0 };
  }

  const raw = window.localStorage.getItem(`marks_${dummy}`);
  if (!raw) return { hasSavedMarks: false, totalMarks: 0 };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { hasSavedMarks: false, totalMarks: 0 };
    }

    const totalMarks = Object.values(parsed).reduce<number>((acc, value) => {
      const num = Number(value);
      return Number.isFinite(num) ? acc + num : acc;
    }, 0);

    return { hasSavedMarks: true, totalMarks };
  } catch {
    return { hasSavedMarks: false, totalMarks: 0 };
  }
}

function sanitizeFileName(value: string): string {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function barcodeDataUrlForValue(value: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    width: 1,
    height: 28,
  });
  return canvas.toDataURL('image/png');
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image as data URL.'));
    };
    reader.onerror = () => reject(new Error('Failed to load logo image.'));
    reader.readAsDataURL(blob);
  });
}

async function imageDataUrlSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error('Failed to read image size.'));
    img.src = dataUrl;
  });
}

function numberToWords(value: number): string {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return '';

  const ones = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const underHundred = (x: number): string => {
    if (x < 20) return ones[x];
    const t = Math.floor(x / 10);
    const r = x % 10;
    return r === 0 ? tens[t] : `${tens[t]} ${ones[r]}`;
  };

  if (n < 100) return underHundred(n);
  if (n === 100) return 'Hundred';

  const h = Math.floor(n / 100);
  const r = n % 100;
  if (r === 0) return `${ones[h]} Hundred`;
  return `${ones[h]} Hundred ${underHundred(r)}`;
}

export default function OnePageReport() {
  const [bundleCode, setBundleCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundBundle, setFoundBundle] = useState<FinalizedBundle | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState('one-page-report.pdf');

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const findBundleByCode = async (code: string): Promise<BundleSearchResult> => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) return { status: 'not_found' };

    const selectionMap = readCourseSelectionMap();

    const finalizedConfigs = listFinalizedBundleConfigs();
    if (finalizedConfigs.length === 0) return { status: 'not_found' };

    for (const cfg of finalizedConfigs) {
      const semester = cfg.semester;
      const department = cfg.department;
      const bundleSize = cfg.bundleSize;
      const [response, startSequence] = await Promise.all([
        fetchCoeStudentsMap({ department, semester }),
        getSemesterStartSequence(department, semester)
      ]);
      const semesterDigit = getSemesterDigit(semester);
      const filterKey = getCurrentFilterKey(department, semester);
      const persistedByDummy = readShuffledLists()[filterKey] || {};
      const savedByDummy = new Map(
        (response.saved_dummies || [])
          .filter((row) => row.semester === semester)
          .map((row) => [row.dummy, row])
      );

      const absentCourseMap = readCourseAbsenteesMap(getAttendanceFilterKey(department, semester));
      let globalSequence = startSequence;
      let foundNotFinalized = false;

      for (const deptBlock of response.departments) {
        const deptCode = DEPARTMENT_DUMMY_DIGITS[deptBlock.department] || '9';

        for (const course of deptBlock.courses) {
          const courseKey = getCourseKey({
            department: deptBlock.department,
            semester,
            courseCode: course.course_code || '',
            courseName: course.course_name || '',
          });
          const selection = selectionMap[courseKey];
          if (selection?.eseType !== 'ESE') continue;
          
          const courseAbsentees = absentCourseMap.get(courseKey);
          const originalStudents = (course.students || []).filter((student: CoeCourseStudent) => {
            const regNo = String(student.reg_no || '').trim();
            return regNo ? !(courseAbsentees?.has(regNo)) : true;
          });

          const students: BundleStudent[] = originalStudents.map((student: CoeCourseStudent) => {
            globalSequence += 1;
            const dummy = generateDummyNumber(department, globalSequence);
            const saved = savedByDummy.get(dummy);
            const persisted = persistedByDummy[dummy];

            const resolvedRegNo = saved?.reg_no || persisted?.reg_no || student.reg_no;
            const resolvedName = saved?.name || persisted?.name || student.name;
            const marksData = readStudentTotalMarks(dummy);

            return {
              dummy,
              reg_no: resolvedRegNo,
              name: resolvedName,
              hasSavedMarks: marksData.hasSavedMarks,
              totalMarks: marksData.totalMarks,
            };
          });

          const isCourseShuffled = students.some((student, idx) => {
            const original = course.students[idx];
            if (!original) return false;
            return student.reg_no !== original.reg_no || student.name !== original.name;
          });
          if (!isCourseShuffled) continue;

          const deptShort =
            DEPARTMENT_SHORT[deptBlock.department] ||
            String(deptBlock.department || '')
              .slice(0, 2)
              .toUpperCase();

          const grouped = chunkStudents(students, bundleSize);
          for (let index = 0; index < grouped.length; index += 1) {
            const bundleStudents = grouped[index];
            const bundleName = `${course.course_code || 'COURSE'}${deptShort}${String(index + 1).padStart(3, '0')}`;

            if (bundleName.toUpperCase() !== normalizedCode) continue;

            const isFinalized = bundleStudents.length > 0 && bundleStudents.every((student) => student.hasSavedMarks);
            if (!isFinalized) {
              foundNotFinalized = true;
              continue;
            }

            return {
              status: 'ready',
              bundle: {
                bundleName,
                semester,
                bundleSize,
                department: deptBlock.department,
                course_code: course.course_code || 'NO_CODE',
                course_name: course.course_name || 'Unnamed Course',
                students: bundleStudents,
              },
            };
          }
        }
      }

      if (foundNotFinalized) {
        return { status: 'not_finalized' };
      }
    }

    return { status: 'not_found' };
  };

  const handleSearch = async () => {
    const value = String(bundleCode || '').trim();
    if (!value) {
      setError('Enter or scan a bundle number.');
      setFoundBundle(null);
      return;
    }

    setSearching(true);
    setError(null);
    setFoundBundle(null);
    try {
      const result = await findBundleByCode(value);
      if (result.status === 'ready') {
        setFoundBundle(result.bundle);
        return;
      }
      if (result.status === 'not_finalized') {
        setError('Bundle found, but marks are not fully finalized for all students in this bundle.');
        return;
      }
      setError('Bundle not found. Check the scanned/entered bundle number.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to search bundle.';
      setError(message);
    } finally {
      setSearching(false);
    }
  };

  const buildBundlePdf = async (bundle: FinalizedBundle): Promise<jsPDF> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;
    const headerTop = 12;
    const headerHeight = 26;

    let leftLogoDataUrl = '';
    let rightLogoDataUrl = '';
    let leftLogoSize: { w: number; h: number } | null = null;
    let rightLogoSize: { w: number; h: number } | null = null;
    try {
      leftLogoDataUrl = await imageUrlToDataUrl(newBannerSrc);
      rightLogoDataUrl = await imageUrlToDataUrl(krLogoSrc);
      leftLogoSize = await imageDataUrlSize(leftLogoDataUrl);
      rightLogoSize = await imageDataUrlSize(rightLogoDataUrl);
    } catch {
      leftLogoDataUrl = '';
      rightLogoDataUrl = '';
      leftLogoSize = null;
      rightLogoSize = null;
    }

    const drawHeader = () => {
      const leftBoxWidth = 85;
      const leftBoxHeight = headerHeight - 2;
      const rightBoxSize = headerHeight - 4;
      const leftBoxX = margin + 1;
      const rightBoxX = pageWidth - margin - rightBoxSize - 3;
      const leftBoxY = headerTop + 1;
      const rightBoxY = headerTop + 2;

      const drawLogoInBox = (
        dataUrl: string,
        size: { w: number; h: number } | null,
        boxX: number,
        boxY: number,
        boxW: number,
        boxH: number
      ) => {
        if (!dataUrl || !size) return;
        const imageRatio = size.w / size.h;
        let drawW = boxW;
        let drawH = boxH;

        if (imageRatio > 1) {
          drawH = boxW / imageRatio;
          if (drawH > boxH) {
            drawH = boxH;
            drawW = boxH * imageRatio;
          }
        } else {
          drawW = boxH * imageRatio;
          if (drawW > boxW) {
            drawW = boxW;
            drawH = boxW / imageRatio;
          }
        }

        const isLeftBox = boxX === leftBoxX;
        const drawX = isLeftBox ? boxX : boxX + (boxW - drawW) / 2;
        const drawY = isLeftBox ? boxY : boxY + (boxH - drawH) / 2;
        doc.addImage(dataUrl, 'PNG', drawX, drawY, drawW, drawH);
      };

      drawLogoInBox(leftLogoDataUrl, leftLogoSize, leftBoxX, leftBoxY, leftBoxWidth, leftBoxHeight);
      drawLogoInBox(rightLogoDataUrl, rightLogoSize, rightBoxX, rightBoxY, rightBoxSize, rightBoxSize);

      const textCenterX = pageWidth / 2;
      const textCenterY = headerTop + headerHeight / 2;
      doc.setFont('times', 'bolditalic');
      doc.setFontSize(12);
      doc.text('OFFICE OF THE CONTROLLER', textCenterX, textCenterY - 2, { align: 'center' });
      doc.text('OF EXAMINATIONS', textCenterX, textCenterY + 5, { align: 'center' });
    };

    // Outer border like manual sheet
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.4);
    doc.rect(margin, headerTop, contentWidth, pageHeight - headerTop - margin);

    // Top header: left logo, centered COE title, right logo.
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

    const maxMarkPerStudent = 100;
    const studentRows = bundle.students.map((student, idx) => {
      const mark = Math.max(0, Math.floor(Number(student.totalMarks || 0)));
      return [String(idx + 1), student.dummy, String(maxMarkPerStudent), String(mark), numberToWords(mark), ''];
    });

    const totalStudents = bundle.students.length;
    const sumMarks = bundle.students.reduce((sum, student) => {
      const mark = Math.max(0, Math.floor(Number(student.totalMarks || 0)));
      return sum + mark;
    }, 0);
    const sumMaxMarks = bundle.students.reduce((sum) => sum + maxMarkPerStudent, 0);

    const averageMarks = totalStudents > 0 ? sumMarks / totalStudents : 0;
    const percentage = sumMaxMarks > 0 ? (sumMarks / sumMaxMarks) * 100 : 0;

    const summaryRow = [
      {
        content: 'AVERAGE / PERCENTAGE',
        colSpan: 3,
        styles: { fontStyle: 'bold', halign: 'right' },
      },
      {
        content: averageMarks.toFixed(2),
        styles: { fontStyle: 'bold', halign: 'center' },
      },
      {
        content: `${percentage.toFixed(2)}%`,
        styles: { fontStyle: 'bold', halign: 'center' },
      },
      {
        content: '',
        styles: { fontStyle: 'bold' },
      },
    ];

    const tableBody = [...studentRows, summaryRow] as any[];

    autoTable(doc, {
      startY: headerTop + headerHeight + 16,
      margin: { left: margin, right: margin, bottom: 26 },
      head: [['S.NO', 'DUMMY NUMBER', 'MAX MARK', 'MARK', 'MARKS IN WORDS', 'REMARKS']],
      body: tableBody,
      theme: 'grid',
      showHead: 'everyPage',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 1.6,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 36 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 52 },
        5: { cellWidth: 52 },
      },
      didDrawPage: () => {
        doc.setLineWidth(0.4);
        doc.rect(margin, headerTop, contentWidth, pageHeight - headerTop - margin);
        drawHeader();
      },
    });

    // Bottom signature provisions on last page
    const totalPages = doc.getNumberOfPages();
    doc.setPage(totalPages);
    const signLineY = pageHeight - margin - 10;
    const signLabelY = signLineY + 5;
    const leftX = margin + 8;
    const rightX = pageWidth - margin - 74;
    const signWidth = 66;

    doc.setLineWidth(0.3);
    doc.line(leftX, signLineY, leftX + signWidth, signLineY);
    doc.line(rightX, signLineY, rightX + signWidth, signLineY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Valuator Details', leftX + signWidth / 2, signLabelY, { align: 'center' });
    doc.text('Cheif Examiner Signature', rightX + signWidth / 2, signLabelY, { align: 'center' });

    return doc;
  };

  const getBundlePdfFileName = (bundle: FinalizedBundle): string => {
    return (
      sanitizeFileName(`one-page-report_${bundle.bundleName}_${bundle.department}_${bundle.semester}.pdf`) ||
      'one-page-report.pdf'
    );
  };

  const handlePreviewPdf = async (bundle: FinalizedBundle) => {
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const doc = await buildBundlePdf(bundle);
      const blob = doc.output('blob');
      const nextPreviewUrl = URL.createObjectURL(blob);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setPreviewFileName(getBundlePdfFileName(bundle));
      setPreviewUrl(nextPreviewUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate PDF preview.';
      setPreviewError(message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewError(null);
  };

  const handleDownloadFromPreview = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = previewFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">One Page Report</h1>
        <p className="mt-2 text-sm text-gray-600">
          Scan bundle barcode or enter bundle number to download one-page finalized marks report.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="opr-bundle-code">
              Bundle Barcode / Bundle Number
            </label>
            <input
              id="opr-bundle-code"
              type="text"
              autoFocus
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              value={bundleCode}
              onChange={(e) => setBundleCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder="Scan or type bundle number (example: CSE1201CS001)"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={searching}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? 'Searching...' : 'Find Bundle'}
          </button>
        </div>
      </div>

      {searching ? <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">Searching finalized bundle...</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : null}

      {!searching && !error && foundBundle ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <div className="text-sm text-gray-700">
            Finalized Bundle Found: <span className="font-semibold text-gray-900">{foundBundle.bundleName}</span>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{foundBundle.bundleName}</h3>
                <p className="text-sm text-gray-600">
                  {foundBundle.department} | {foundBundle.course_code} | {foundBundle.course_name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Semester: {foundBundle.semester} | Bundle Size: {foundBundle.bundleSize} | Students: {foundBundle.students.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handlePreviewPdf(foundBundle);
                }}
                disabled={previewLoading}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {previewLoading ? 'Preparing Preview...' : 'Preview One-Page PDF'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          {previewError}
        </div>
      ) : null}

      {previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl h-[90vh] rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-800">PDF Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadFromPreview}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 bg-gray-100">
              <iframe
                src={previewUrl}
                title="One Page Report Preview"
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
