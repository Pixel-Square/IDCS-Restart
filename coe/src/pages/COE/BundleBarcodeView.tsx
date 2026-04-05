import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Barcode from 'react-barcode';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { CoeCourseStudent, fetchCoeStudentsMap } from '../../services/coe';
import { getCourseKey, fetchCourseSelectionMapFromApi } from './courseSelectionStorage';
import { getAttendanceFilterKey, readCourseAbsenteesMap } from './attendanceStore';
import { getSemesterStartSequence, generateDummyNumber } from './dummySequence';
import { readShuffledLists, hydrateShuffledListStore, PersistedShuffledByDummy } from './shuffledListStore';

const SHUFFLED_LIST_KEY = 'coe-students-shuffled-list-v1';

const DEPARTMENT_DUMMY_DIGITS: Record<string, string> = {
  AIDS: '1',
  AIML: '2',
  RE: '9',
  SH: '0',
  CIVIL: '3',
  CSE: '4',
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

type BundleStudent = {
  reg_no: string;
  name: string;
  dummy: string;
  isShuffled: boolean;
};

type PersistedDummyRange = { start: number; count: number };

function getCurrentFilterKey(department: string, semester: string): string {
  return `${department}::${semester}`;
}

function getSemesterDigit(value: string): string {
  const parsed = Number.parseInt(String(value || '').replace('SEM', ''), 10);
  if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 8) return String(parsed);
  return '0';
}

function chunkStudents(students: BundleStudent[], chunkSize: number): BundleStudent[][] {
  const chunks: BundleStudent[][] = [];
  for (let i = 0; i < students.length; i += chunkSize) chunks.push(students.slice(i, i + chunkSize));
  return chunks;
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
    height: 24,
  });
  return canvas.toDataURL('image/png');
}

function writeCourseBundleDummyStore(store: Record<string, any>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('coe-course-bundle-dummies-v1', JSON.stringify(store));
}

function readCourseBundleDummyStore(): Record<string, any> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('coe-course-bundle-dummies-v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function BundleBarcodeView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const department = searchParams.get('department') || 'ALL';
  const semester = searchParams.get('semester') || 'SEM1';
  const bundleSize = Number.parseInt(searchParams.get('bundle_size') || '25', 10) || 25;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundles, setBundles] = useState<{ bundleName: string; students: BundleStudent[]; course_code?: string; course_name?: string; department?: string }[]>([]);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFileName, setPdfPreviewFileName] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

    useEffect(() => {
    let active = true;
    (async () => {
      // Hydrate shuffled list store from DB
      await hydrateShuffledListStore().catch(() => {});
      if (!active) return;

      setLoading(true);
      setError(null);
      try {
        const [response, startSequence] = await Promise.all([
          fetchCoeStudentsMap({ department, semester }),
          getSemesterStartSequence(department, semester)
        ]);
        if (!active) return;

        const currentFilterKeyVal = getCurrentFilterKey(department, semester);
        const persistedByDummy = readShuffledLists()[currentFilterKeyVal] || {};
        const savedByDummy = new Map((response.saved_dummies || []).filter((r) => r.semester === semester).map((r) => [r.dummy, r]));
        const selectionMap = await fetchCourseSelectionMapFromApi(department, semester);
        const absentCourseMap = readCourseAbsenteesMap(getAttendanceFilterKey(department, semester));

        let globalSequence = startSequence;
        const gathered: { department: string; course_code?: string; course_name?: string; students: BundleStudent[] }[] = [];

        response.departments.forEach((deptBlock: any) => {
          const deptCode = DEPARTMENT_DUMMY_DIGITS[deptBlock.department] || '9';
          deptBlock.courses
            .filter((course: any) => {
              const courseKey = getCourseKey({ department: deptBlock.department, semester, courseCode: course.course_code || '', courseName: course.course_name || '' });
              const selection = selectionMap[courseKey];
              return selection?.eseType === 'ESE';
            })
            .forEach((course: any) => {
              const courseKey = getCourseKey({ department: deptBlock.department, semester, courseCode: course.course_code || '', courseName: course.course_name || '' });
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
                return { reg_no: resolvedRegNo, name: resolvedName, dummy, isShuffled: Boolean(saved || persisted) };
              });

              const mappedInDbCount = students.filter((student) => {
                const saved = savedByDummy.get(student.dummy);
                const persisted = persistedByDummy[student.dummy];
                return Boolean(saved || persisted);
              }).length;

              const isCourseFullyMappedInDb = originalStudents.length > 0 && mappedInDbCount === originalStudents.length;
              const isCourseShuffledInDb = students.some((student) => student.isShuffled);

              // if (!isCourseFullyMappedInDb || !isCourseShuffledInDb) return;
              gathered.push({ department: deptBlock.department, course_code: course.course_code, course_name: course.course_name, students });
            });
        });

        // Build bundles
        const allBundles: { bundleName: string; students: BundleStudent[]; course_code?: string; course_name?: string; department?: string }[] = [];
        gathered.forEach((course) => {
          const deptShort = DEPARTMENT_SHORT[course.department] || String(course.department || '').slice(0, 2).toUpperCase();
          const grouped = chunkStudents(course.students, bundleSize).map((students, i) => ({ 
            bundleName: `${course.course_code || 'COURSE'}${deptShort}${String(i + 1).padStart(3, '0')}`, 
            students 
          }));
          grouped.forEach((b) => allBundles.push({ ...b, course_code: course.course_code, course_name: course.course_name, department: course.department }));
        });

        // Inject Additional Bundles from localStorage
        const additionalFilterKey = getCurrentFilterKey(department, semester);
        const bundleStore = readCourseBundleDummyStore();
        const additionalForFilter = bundleStore[additionalFilterKey] || {};
        
        Object.entries(additionalForFilter).forEach(([cCode, cData]: [string, any]) => {
          if (cData.bundles) {
            Object.entries(cData.bundles).forEach(([bName, dummieList]: [string, any]) => {
              if (bName.endsWith('-ADD')) {
                const addStudents: BundleStudent[] = (dummieList || []).map((d: string) => {
                  const p = persistedByDummy[d] || {};
                  return { reg_no: p.reg_no || '?', name: p.name || '?', dummy: d, isShuffled: true };
                });
                allBundles.push({
                  bundleName: bName,
                  students: addStudents,
                  course_code: cCode,
                  department: department, 
                  course_name: 'Additional Student'
                });
              }
            });
          }
        });

        if (!active) return;
        setBundles(allBundles);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load bundles');
        setBundles([]);
      } finally {
        // eslint-disable-next-line no-unsafe-finally
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [department, semester, bundleSize]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  const [scanValue, setScanValue] = useState('');
  const matched = useMemo(() => bundles.find((b) => b.bundleName.toUpperCase() === scanValue.trim().toUpperCase()) || null, [bundles, scanValue]);

  const openPdfPreview = () => {
    if (bundles.length === 0) {
      alert('No bundles available to preview.');
      return;
    }

    setPdfLoading(true);
    try {
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

      const drawBundleCard = (x: number, y: number, bundle: { bundleName: string; students?: BundleStudent[]; course_code?: string; course_name?: string; department?: string }) => {
        doc.roundedRect(x, y, colWidth, rowHeight, 1.5, 1.5, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(bundle.bundleName, x + 2, y + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        const courseText = `${bundle.course_code || 'NO_CODE'} | ${bundle.department || '-'} | ${bundle.course_name || '-'}`;
        const courseLines = doc.splitTextToSize(courseText, colWidth - 4);
        doc.text(courseLines.slice(0, 2), x + 2, y + 11);

        const barcodeImg = barcodeDataUrlForValue(bundle.bundleName);
        doc.addImage(barcodeImg, 'PNG', x + 2, y + 16, colWidth - 4, 10);

        // show start-end dummy range under the barcode
        const startDummy = bundle.students && bundle.students.length ? bundle.students[0].dummy : '-';
        const endDummy = bundle.students && bundle.students.length ? bundle.students[bundle.students.length - 1].dummy : '-';

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

        drawBundleCard(marginX, y, bundles[i]);
        if (bundles[i + 1]) {
          drawBundleCard(marginX + colWidth + colGap, y, bundles[i + 1]);
        }
        y += rowHeight + rowGap;
      }

      const fileName = sanitizeFileName(`bundle-barcodes-${department}-${semester}.pdf`) || 'bundle-barcodes.pdf';
      const blob = doc.output('blob');
      const previewUrl = URL.createObjectURL(blob);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return previewUrl;
      });
      setPdfPreviewFileName(fileName);
    } finally {
      setPdfLoading(false);
    }
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

  const closePdfPreview = () => {
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPdfPreviewFileName('');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bundle Barcodes</h1>
          <p className="text-sm text-gray-600">Department: {department} • {semester} • Bundle size: {bundleSize}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openPdfPreview}
            disabled={loading || bundles.length === 0 || pdfLoading}
            className="px-3 py-2 rounded border bg-blue-50 border-blue-200 text-blue-700 disabled:opacity-60"
          >
            {pdfLoading ? 'Preparing PDF...' : 'Preview PDF'}
          </button>
          <button onClick={() => navigate(-1)} className="px-3 py-2 rounded border bg-white">Back</button>
        </div>
      </div>

      {loading ? <div>Loading bundles…</div> : null}
      {error ? <div className="text-red-600">{error}</div> : null}
      {!loading && !error && bundles.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 p-4 text-sm">
          No shuffled bundle data available for the selected department and semester.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-sm text-gray-700 mb-2">Scan Bundle Barcode</label>
          <input value={scanValue} onChange={(e) => setScanValue(e.target.value)} placeholder="Scan or type bundle code" className="w-full border rounded px-3 py-2 font-mono" />
        </div>
        <div>
          <div className="text-sm text-gray-500">Matched: <span className="font-mono">{matched ? matched.bundleName : '-'}</span></div>
        </div>
      </div>

      {pdfPreviewUrl ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">PDF Preview</h3>
              <p className="text-sm text-gray-600">Department: {department} • Semester: {semester}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={downloadFromPreview} className="px-3 py-2 rounded border bg-green-50 border-green-200 text-green-700">Download PDF</button>
              <button onClick={closePdfPreview} className="px-3 py-2 rounded border bg-white">Close Preview</button>
            </div>
          </div>
          <div className="border rounded-lg bg-white overflow-hidden">
            <iframe
              title="Bundle Barcode PDF Preview"
              src={pdfPreviewUrl}
              className="w-full h-[70vh]"
            />
          </div>
        </section>
      ) : null}

      {matched ? (
        <section className="rounded-xl border border-green-200 bg-green-50/40 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{matched.bundleName}</h3>
              <p className="text-sm text-gray-600">{matched.course_code} • {matched.course_name} • {matched.department}</p>
            </div>
            <div className="bg-white rounded-lg border px-3 py-2 inline-flex">
              <Barcode value={matched.bundleName} height={40} width={1.6} fontSize={12} displayValue />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {matched.students.map((s) => (
              <article key={s.dummy} className="rounded-lg border p-3 bg-white">
                <div className="text-xs text-gray-500">Dummy Number</div>
                <div className="font-mono font-semibold text-gray-900">{s.dummy}</div>
                <div className="mt-2 overflow-x-auto"><Barcode value={s.dummy} height={34} width={1.4} fontSize={11} displayValue /></div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">All Bundles</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[28rem] overflow-y-auto pr-1">
          {bundles.map((b) => (
            <article key={b.bundleName} className="rounded-lg border bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Bundle</div>
              <div className="font-mono font-semibold text-gray-900 mb-2">{b.bundleName}</div>
              <div className="overflow-x-auto bg-white rounded border p-2"><Barcode value={b.bundleName} height={36} width={1.4} fontSize={11} displayValue /></div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
