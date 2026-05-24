/**
 * Result Analysis Page — Academic 2.1 Faculty (Redesigned)
 * Cycles ordered by backend order field. Exams ordered per QP pattern.
 * Export: PDF + Excel. Views: Mark Sheet | Bell Graph | Range Analysis | Ranking
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Table2, BarChart2, TrendingUp, RefreshCw, AlertTriangle,
  ChevronDown, CheckCircle, Clock, AlertCircle, Trophy,
  FileSpreadsheet, FileText, Download,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import fetchWithAuth from '../../../../services/fetchAuth';
import newBannerSrc from '../../../../assets/new_banner.png';
import krLogoSrc    from '../../../../assets/krlogo.png';
import idcsLogoSrc  from '../../../../assets/idcs-logo.png';
import MarkSheetTable, { SheetExamCol, SheetStudentRow } from './MarkSheetTable';
import BellGraphCard from './BellGraphCard';
import RangeAnalysisCard from './RangeAnalysisCard';
import RankingCard from './RankingCard';
import { computeRangeCounts } from './BellGraphCard';

/* ─── Types ─── */
interface Cycle {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  order: number;
}

interface ExamInfo {
  id: string;
  name: string;
  short_name: string;
  max_marks: number;
  weight: number;
  entered_count: number;
  total_students: number;
  is_locked: boolean;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'LOCKED';
  kind?: 'exam' | 'cqi';
  cycle_name?: string | null;
  cycle_code?: string | null;
}

interface StudentMark {
  id: string;
  roll_number: string;
  name: string;
  mark: number | null;
  co_marks: Record<string, number>;
  is_absent: boolean;
}

type ViewKey = 'sheet' | 'bell' | 'range' | 'rank';
type ExamMarksState = {
  loading: boolean;
  error: string | null;
  students: StudentMark[];
  isMarkManager: boolean;
};

/** Cached info about a mark-manager exam (fetched from /exams/:id/ when MM is detected) */
interface MMExamCache {
  mmEnabled: boolean;
  mmCiaEnabled: boolean;
  mmCoveredCos: number;    // count of enabled COs in the mark manager config
  mmExamQsCount: number;   // number of exam/CIA questions (= mmCoveredCos if cia_enabled, else 0)
  mmSingleItemMax: number; // max_marks for one item (from mark_manager.cos[x].max_marks)
  mmExamMaxTotal: number;  // cia_max_marks * mmCoveredCos  (0 if !cia_enabled)
  mmItemsMaxTotal: number; // num_items * singleItemMax * mmCoveredCos
}

/* ─── Helpers ─── */
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function computeTotal(marks: Record<string, number | null>, cols: SheetExamCol[]): number | null {
  const validCols = cols.filter((c) => marks[c.examId] != null && c.maxMarks > 0);
  if (validCols.length === 0) return null;
  const wSum = validCols.reduce((s, c) => s + c.weight, 0);
  if (wSum === 0) return null;
  const parts = validCols.reduce((s, c) => s + (marks[c.examId]! / c.maxMarks) * c.weight, 0);
  return clamp(Math.round((parts / wSum) * 100), 0, 100);
}

function detectMarkManager(students: StudentMark[]): boolean {
  // Mark manager exams store marks with question IDs like "q0", "q1", etc.
  for (const s of students) {
    const keys = Object.keys(s.co_marks || {});
    if (keys.length > 0 && keys.some((k) => /^q\d+$/i.test(k))) return true;
  }
  return false;
}

async function toBase64(src: string): Promise<string> {
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function imgSize(b64: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = b64;
  });
}

function statusBadge(status: string, locked: boolean) {
  if (locked)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Locked</span>;
  switch (status) {
    case 'COMPLETED':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold"><CheckCircle className="w-3 h-3" />Published</span>;
    case 'IN_PROGRESS':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold"><Clock className="w-3 h-3" />In Progress</span>;
    default:
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-semibold"><AlertCircle className="w-3 h-3" />Not Started</span>;
  }
}

/* ═══════════════ MAIN COMPONENT ═══════════════ */
type Props = { courseId: string };

export default function ResultAnalysisPage({ courseId }: Props): JSX.Element {
  const [cycles, setCycles]             = useState<Cycle[]>([]);
  const [exams, setExams]               = useState<ExamInfo[]>([]);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [courseError, setCourseError]   = useState<string | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [courseName, setCourseName]     = useState('');
  const [courseCode, setCourseCode]     = useState('');
  const [sectionName, setSectionName]   = useState('');
  const [semesterNum, setSemesterNum]   = useState('');
  const [department, setDepartment]     = useState('');
  const [acadYear, setAcadYear]         = useState('');

  const [examMarksMap, setExamMarksMap] = useState<Record<string, ExamMarksState>>({});
  const [examInfoMap, setExamInfoMap]   = useState<Record<string, MMExamCache>>({});
  const [selectedCycleKey, setSelectedCycleKey] = useState<string | null>(null);
  const [activeView, setActiveView]     = useState<ViewKey>('sheet');
  const [refreshTick, setRefreshTick]   = useState(0);

  const [exportBusy, setExportBusy]     = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [passMarkThreshold, setPassMarkThreshold] = useState<number>(50);
  const exportRef = useRef<HTMLDivElement>(null);

  /* Close export dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node))
        setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Load data ── */
  useEffect(() => {
    let mounted = true;
    setLoadingCourse(true);
    setCourseError(null);

    Promise.all([
      fetchWithAuth('/api/academic-v2/cycles/').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load course')))),
      fetchWithAuth('/api/academic-v2/admin/pass-mark-settings/').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([cycleData, courseData, passMarkData]) => {
        if (!mounted) return;
        if (passMarkData?.pass_mark != null) setPassMarkThreshold(Number(passMarkData.pass_mark));
        const cycleList: Cycle[] = Array.isArray(cycleData) ? cycleData : cycleData?.results || [];
        setCycles(cycleList);
        const examList: ExamInfo[] = Array.isArray(courseData?.exams)
          ? courseData.exams.filter((e: ExamInfo) => e.kind !== 'cqi')
          : [];
        setExams(examList);
        setStudentCount(Number(courseData?.student_count) || 0);
        setCourseName(courseData?.course_name || courseData?.course_code || '');
        setCourseCode(courseData?.course_code || '');
        setSectionName(courseData?.section || '');
        setSemesterNum(courseData?.semester ? `Semester ${courseData.semester}` : '');
        setDepartment(courseData?.department || '');
        setAcadYear(courseData?.academic_year || courseData?.year || '');
        const firstKey = examList.length > 0 ? (examList[0].cycle_name ?? '__none__') : null;
        setSelectedCycleKey((prev) => prev ?? firstKey);
      })
      .catch((err: any) => {
        if (mounted) setCourseError(err?.message || 'Failed to load data');
      })
      .finally(() => {
        if (mounted) setLoadingCourse(false);
      });

    return () => { mounted = false; };
  }, [courseId, refreshTick]);

  /* ── Group exams by cycle_name — preserve backend order ── */
  const cycleGroups = useMemo<Map<string, ExamInfo[]>>(() => {
    const map = new Map<string, ExamInfo[]>();
    for (const ex of exams) {
      const key = ex.cycle_name ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ex);
    }
    return map;
  }, [exams]);

  /* Sort cycle keys by the order of the matching cycle from /cycles/ API */
  const orderedCycleKeys = useMemo(() => {
    const keys = Array.from(cycleGroups.keys());
    const cycleOrderMap = new Map(cycles.map((c) => [c.name, c.order]));
    return keys.sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return (cycleOrderMap.get(a) ?? 999) - (cycleOrderMap.get(b) ?? 999);
    });
  }, [cycleGroups, cycles]);

  const cycleDisplayName = (key: string) => (key === '__none__' ? 'Uncategorized' : key);

  /* ── Exams for selected cycle ── */
  const activeCycleExams = useMemo<ExamInfo[]>(
    () => (selectedCycleKey ? cycleGroups.get(selectedCycleKey) || [] : []),
    [selectedCycleKey, cycleGroups],
  );

  /* ── Load marks ── */
  useEffect(() => {
    if (!selectedCycleKey || activeCycleExams.length === 0) return;
    const toLoad = activeCycleExams.filter((ex) => !examMarksMap[ex.id]);
    if (toLoad.length === 0) return;

    setExamMarksMap((prev) => {
      const next = { ...prev };
      for (const ex of toLoad) {
        next[ex.id] = { loading: true, error: null, students: [], isMarkManager: false };
      }
      return next;
    });

    for (const ex of toLoad) {
      fetchWithAuth(`/api/academic-v2/exams/${ex.id}/marks/`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
        .then((data) => {
          const students: StudentMark[] = Array.isArray(data?.students) ? data.students : [];
          const isMM = detectMarkManager(students);
          setExamMarksMap((prev) => ({
            ...prev,
            [ex.id]: { loading: false, error: null, students, isMarkManager: isMM },
          }));
          // For mark-manager exams, fetch exam info to get question/CO structure for split columns
          if (isMM) {
            fetchWithAuth(`/api/academic-v2/exams/${ex.id}/`)
              .then((r) => (r.ok ? r.json() : null))
              .then((info) => {
                const mm = info?.mark_manager;
                if (!mm?.enabled) return;
                const coveredCos = Object.values(mm.cos || {}).filter((c: any) => c.enabled).length;
                const examQsCount = mm.cia_enabled ? coveredCos : 0;
                const sampleCo: any = Object.values(mm.cos || {}).find((c: any) => c.enabled) || Object.values(mm.cos || {})[0];
                const singleItemMax = Number(sampleCo?.max_marks) || 1;
                const numItems = Number(sampleCo?.num_items) || 1;
                const examMaxTotal = mm.cia_enabled ? (Number(mm.cia_max_marks) || 0) * coveredCos : 0;
                const itemsMaxTotal = numItems * singleItemMax * coveredCos;
                setExamInfoMap((prev) => ({
                  ...prev,
                  [ex.id]: {
                    mmEnabled: true,
                    mmCiaEnabled: !!mm.cia_enabled,
                    mmCoveredCos: coveredCos,
                    mmExamQsCount: examQsCount,
                    mmSingleItemMax: singleItemMax,
                    mmExamMaxTotal: examMaxTotal,
                    mmItemsMaxTotal: itemsMaxTotal,
                  },
                }));
              })
              .catch(() => {});
          }
        })
        .catch((err: any) => {
          setExamMarksMap((prev) => ({
            ...prev,
            [ex.id]: { loading: false, error: err?.message || 'Failed', students: [], isMarkManager: false },
          }));
        });
    }
  }, [selectedCycleKey, activeCycleExams]);

  /* ── Build sheet data ── */
  const sheetCols = useMemo<SheetExamCol[]>(
    () =>
      activeCycleExams.flatMap((ex) => {
        const mmInfo = examInfoMap[ex.id];
        if (mmInfo?.mmEnabled) {
          // Split mark-manager exam into Exam + Items Avg columns
          const grandMax = (mmInfo.mmExamMaxTotal + mmInfo.mmItemsMaxTotal) || ex.max_marks;
          const cols: SheetExamCol[] = [];
          if (mmInfo.mmCiaEnabled && mmInfo.mmExamMaxTotal > 0) {
            const examWeight = grandMax > 0
              ? Math.round(ex.weight * (mmInfo.mmExamMaxTotal / grandMax) * 100) / 100
              : ex.weight / 2;
            cols.push({
              examId: `${ex.id}__exam`,
              examName: `${ex.name} (Exam)`,
              maxMarks: mmInfo.mmExamMaxTotal,
              weight: examWeight,
              isMarkManager: true,
            });
          }
          const itemsWeight = grandMax > 0
            ? Math.round(ex.weight * (mmInfo.mmItemsMaxTotal / grandMax) * 100) / 100
            : (mmInfo.mmCiaEnabled ? ex.weight / 2 : ex.weight);
          cols.push({
            examId: `${ex.id}__items`,
            examName: `${ex.name} (Items Avg)`,
            maxMarks: mmInfo.mmSingleItemMax,
            weight: itemsWeight,
            isMarkManager: true,
          });
          return cols;
        }
        return [{
          examId: ex.id,
          examName: ex.name,
          maxMarks: ex.max_marks,
          weight: ex.weight,
          isMarkManager: examMarksMap[ex.id]?.isMarkManager ?? false,
        }];
      }),
    [activeCycleExams, examMarksMap, examInfoMap],
  );

  const allStudents = useMemo<StudentMark[]>(() => {
    const seen = new Map<string, StudentMark>();
    for (const ex of activeCycleExams) {
      const state = examMarksMap[ex.id];
      if (!state) continue;
      for (const s of state.students) {
        if (!seen.has(s.id)) seen.set(s.id, s);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.roll_number.localeCompare(b.roll_number));
  }, [activeCycleExams, examMarksMap]);

  const sheetRows = useMemo<SheetStudentRow[]>(
    () =>
      allStudents.map((s) => {
        const marks: Record<string, number | null> = {};
        for (const ex of activeCycleExams) {
          const state = examMarksMap[ex.id];
          const mmInfo = examInfoMap[ex.id];
          if (mmInfo?.mmEnabled) {
            // Mark-manager exam: split into exam component + items average
            const sm = state?.students.find((st) => st.id === s.id);
            const absent = sm?.is_absent ?? !sm;
            if (absent) {
              if (mmInfo.mmCiaEnabled) marks[`${ex.id}__exam`] = null;
              marks[`${ex.id}__items`] = null;
            } else {
              const coMarks = sm!.co_marks || {};
              const qKeys = Object.keys(coMarks)
                .filter((k) => /^q\d+$/i.test(k))
                .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
              if (mmInfo.mmCiaEnabled && mmInfo.mmExamQsCount > 0) {
                const examKeys = qKeys.slice(0, mmInfo.mmExamQsCount);
                marks[`${ex.id}__exam`] = examKeys.reduce((acc, k) => acc + (Number(coMarks[k]) || 0), 0);
              }
              const itemKeys = qKeys.slice(mmInfo.mmExamQsCount);
              const itemsSum = itemKeys.reduce((acc, k) => acc + (Number(coMarks[k]) || 0), 0);
              marks[`${ex.id}__items`] = itemKeys.length > 0
                ? Math.round((itemsSum / itemKeys.length) * 100) / 100
                : null;
            }
          } else {
            if (!state) { marks[ex.id] = null; continue; }
            const sm = state.students.find((st) => st.id === s.id);
            marks[ex.id] = sm?.is_absent ? null : sm?.mark ?? null;
          }
        }
        return { studentId: s.id, regNo: s.roll_number, name: s.name, marks, total100: computeTotal(marks, sheetCols) };
      }),
    [allStudents, activeCycleExams, examMarksMap, sheetCols, examInfoMap],
  );

  const cycleTotals = useMemo(
    () => sheetRows.map((r) => r.total100).filter((v): v is number => v != null),
    [sheetRows],
  );

  const anyExamLoading = activeCycleExams.some((ex) => examMarksMap[ex.id]?.loading);
  const firstError = activeCycleExams.map((ex) => examMarksMap[ex.id]?.error).find(Boolean) ?? null;

  /* ── Excel Export ── */
  const handleExcel = () => {
    setExportBusy(true);
    setShowExportMenu(false);
    try {
      const wb = XLSX.utils.book_new();
      const cycleName = cycleDisplayName(selectedCycleKey ?? '');

      const header1 = [
        ['Course', courseName, '', 'Cycle', cycleName],
        ['Students', studentCount, '', '', ''],
        [],
        ['S.No', 'Roll No.', 'Name', ...sheetCols.map((c) => `${c.examName} / ${c.maxMarks}`), 'Total / 100'],
      ];
      const dataRows = sheetRows.map((r, i) => [
        i + 1,
        r.regNo,
        r.name,
        ...sheetCols.map((c) => (r.marks[c.examId] != null ? r.marks[c.examId] : '')),
        r.total100 != null ? r.total100 : '',
      ]);
      const ws1 = XLSX.utils.aoa_to_sheet([...header1, ...dataRows]);
      ws1['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 32 }, ...sheetCols.map(() => ({ wch: 14 })), { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Mark Analysis');

      const rangeCounts = computeRangeCounts(cycleTotals);
      const pass = cycleTotals.filter((v) => v >= passMarkThreshold).length;
      const avg = cycleTotals.length > 0 ? (cycleTotals.reduce((a, b) => a + b, 0) / cycleTotals.length).toFixed(1) : '—';
      const ws2 = XLSX.utils.aoa_to_sheet([
        [`Range Analysis — ${cycleName}`, '', ''],
        ['Range', 'Count', '% of Class'],
        ...rangeCounts.map((r) => [r.label, r.count, cycleTotals.length > 0 ? `${((r.count / cycleTotals.length) * 100).toFixed(1)}%` : '0%']),
        [],
        ['CLASS STATISTICS', '', ''],
        ['Attended', cycleTotals.length, ''],
        ['Absent', studentCount - cycleTotals.length, ''],
        ['Pass', pass, ''],
        ['Fail', cycleTotals.length - pass, ''],
        ['Pass Rate', cycleTotals.length > 0 ? `${Math.round((pass / cycleTotals.length) * 100)}%` : '0%', ''],
        ['Average', avg, ''],
        ['Highest', cycleTotals.length > 0 ? Math.max(...cycleTotals) : '—', ''],
        ['Lowest', cycleTotals.length > 0 ? Math.min(...cycleTotals) : '—', ''],
      ]);
      ws2['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Range Analysis');

      XLSX.writeFile(wb, `Result_Analysis_${courseName}_${cycleName}.xlsx`);
    } catch (e: any) {
      alert('Excel export failed: ' + (e?.message || e));
    } finally {
      setExportBusy(false);
    }
  };

  /* ── PDF Export ── */
  const handlePDF = async () => {
    setExportBusy(true);
    setShowExportMenu(false);
    try {
      const [b64Banner, b64Kr, b64Idcs] = await Promise.all([
        toBase64(newBannerSrc).catch(() => ''),
        toBase64(krLogoSrc).catch(() => ''),
        toBase64(idcsLogoSrc).catch(() => ''),
      ]);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW = 210, PH = 297, ML = 10, MR = 10, UW = 190;
      const cycleName = cycleDisplayName(selectedCycleKey ?? '');

      /* Pre-compute stats */
      const attended   = cycleTotals.length;
      const absent     = Math.max(0, studentCount - attended);
      const pass       = cycleTotals.filter((v) => v >= passMarkThreshold).length;
      const fail       = attended - pass;
      const passRate   = attended > 0 ? Math.round((pass / attended) * 100) : 0;
      const avg        = attended > 0 ? (cycleTotals.reduce((a, b) => a + b, 0) / attended).toFixed(1) : '—';
      const highest    = attended > 0 ? String(Math.max(...cycleTotals)) : '—';
      const lowest     = attended > 0 ? String(Math.min(...cycleTotals)) : '—';

      let curY = 10;

      /* ── Banner ── */
      const HEADER_H = 24;
      if (b64Banner) {
        const { w: bw, h: bh } = await imgSize(b64Banner);
        const bW = Math.min(UW * 0.82, (bw / bh) * HEADER_H);
        doc.addImage(b64Banner, 'PNG', ML, curY, bW, HEADER_H);
      }
      const logoH = 18, logoW = 22, logoGap = 3;
      const logosX = PW - MR - logoW * 2 - logoGap;
      if (b64Kr) {
        const { w: kw, h: kh } = await imgSize(b64Kr);
        const kH = Math.min(logoH, (kh / kw) * logoW);
        doc.addImage(b64Kr, 'PNG', logosX, curY + (HEADER_H - kH) / 2, logoW, kH);
      }
      if (b64Idcs) {
        const { w: iw, h: ih } = await imgSize(b64Idcs);
        const iH = Math.min(logoH, (ih / iw) * logoW);
        doc.addImage(b64Idcs, 'PNG', logosX + logoW + logoGap, curY + (HEADER_H - iH) / 2, logoW, iH);
      }
      curY += HEADER_H + 2;
      doc.setDrawColor(30, 58, 95); doc.setLineWidth(0.6);
      doc.line(ML, curY, PW - MR, curY);
      curY += 3;

      /* ── Info grid (3 cols × 3 rows) ── */
      const infoRows: [string, string, string, string, string, string][] = [
        ['Course Code', courseCode || '—',   'Course Name', courseName || '—', 'Section', sectionName || '—'],
        ['Students',    String(studentCount), 'Attended',    String(attended),   'Cycle',    cycleName],
        ['Semester',    semesterNum || '—',  'Acad. Year',  acadYear || '—',    'Department', department || '—'],
      ];
      const colW3 = UW / 3;
      const infoRowH = 7;
      const infoTotalH = infoRows.length * infoRowH;

      doc.setFillColor(242, 246, 252);
      doc.rect(ML, curY, UW, infoTotalH, 'F');
      doc.setDrawColor(200, 212, 228); doc.setLineWidth(0.25);
      doc.rect(ML, curY, UW, infoTotalH, 'S');
      // Column dividers
      doc.line(ML + colW3, curY, ML + colW3, curY + infoTotalH);
      doc.line(ML + colW3 * 2, curY, ML + colW3 * 2, curY + infoTotalH);
      // Row dividers
      for (let ri = 1; ri < infoRows.length; ri++) {
        doc.setDrawColor(220, 228, 240);
        doc.line(ML, curY + ri * infoRowH, ML + UW, curY + ri * infoRowH);
      }
      infoRows.forEach(([l0, v0, l1, v1, l2, v2], ri) => {
        const rowY = curY + ri * infoRowH;
        [[l0, v0, 0], [l1, v1, 1], [l2, v2, 2]].forEach(([lbl, val, ci]) => {
          const cx = ML + (ci as number) * colW3;
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(30, 58, 95);
          doc.text(`${lbl}:`, cx + 2, rowY + 4.7);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(50, 60, 80);
          // Truncate long values to fit in column
          const maxW = colW3 - 26;
          const truncated = doc.splitTextToSize(String(val), maxW)[0] || String(val);
          doc.text(truncated, cx + 23, rowY + 4.7);
        });
      });
      curY += infoTotalH + 3;

      /* ── Mark sheet — split two side-by-side halves ── */
      const sheetHead = [['S.No', 'Roll No.', 'Name', ...sheetCols.map((c) => `${c.examName}\n/${c.maxMarks}`), 'Total\n/100']];
      const mkBody = (subset: typeof sheetRows, startIdx = 0) =>
        subset.map((r, i) => [
          String(startIdx + i + 1),
          r.regNo,
          r.name,
          ...sheetCols.map((c) => (r.marks[c.examId] != null ? String(r.marks[c.examId]) : '—')),
          r.total100 != null ? String(r.total100) : '—',
        ]);

      const half1    = Math.ceil(sheetRows.length / 2);
      const halfGap  = 4;
      const halfW    = (UW - halfGap) / 2;
      const tSno     = 5.5;
      const tRoll    = 27;   // wider register-number column
      const tTot     = 11;
      const tMark    = sheetCols.length > 0 ? Math.max(7, Math.floor((halfW - tSno - tRoll - 18 - tTot) / sheetCols.length)) : 9;
      const tName    = Math.max(12, halfW - tSno - tRoll - tTot - sheetCols.length * tMark);
      const totalIdx = sheetCols.length + 3;

      const halfStyles = {
        theme: 'grid' as const,
        headStyles: {
          fillColor: [30, 58, 95] as [number, number, number],
          textColor: [255, 255, 255] as [number, number, number],
          fontStyle: 'bold' as const,
          fontSize: 5.5,
          halign: 'center' as const,
          cellPadding: 0.9,
        },
        bodyStyles: { fontSize: 5, cellPadding: 0.7 },
        columnStyles: {
          0: { halign: 'center' as const, cellWidth: tSno },
          1: { halign: 'center' as const, cellWidth: tRoll },
          2: { halign: 'left'   as const, cellWidth: tName },
          ...Object.fromEntries(sheetCols.map((_, i) => [i + 3, { halign: 'center' as const, cellWidth: tMark }])),
          [totalIdx]: { halign: 'center' as const, cellWidth: tTot, fontStyle: 'bold' as const, fillColor: [254, 240, 138] as [number, number, number], textColor: [31, 41, 55] as [number, number, number] },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === totalIdx) {
            const v = Number(data.cell.raw);
            if (!isNaN(v)) {
              if (v >= 75)      data.cell.styles.textColor = [5,   150, 105];
              else if (v >= passMarkThreshold) data.cell.styles.textColor = [37,  99,  235];
              else              data.cell.styles.textColor = [220, 38,  38];
            }
          }
        },
      };

      const startSheet = curY;
      autoTable(doc, {
        startY: startSheet,
        head: sheetHead,
        body: mkBody(sheetRows.slice(0, half1), 0),
        margin: { left: ML, right: PW - ML - halfW },
        tableWidth: halfW,
        ...halfStyles,
      });
      const a1 = (doc as any).lastAutoTable?.finalY ?? startSheet + 40;
      if (sheetRows.length > half1) {
        autoTable(doc, {
          startY: startSheet,
          head: sheetHead,
          body: mkBody(sheetRows.slice(half1), half1),
          margin: { left: ML + halfW + halfGap, right: MR },
          tableWidth: halfW,
          ...halfStyles,
        });
      }
      const a2 = (doc as any).lastAutoTable?.finalY ?? startSheet;
      curY = Math.max(a1, a2) + 5;

      /* ════════════════════════════════════════════════════════
         BOTTOM SECTION: Class Statistics (left) + Bell Curve (right)
         Layout: left half = 85mm, gap = 5mm, right half = 100mm
         ════════════════════════════════════════════════════════ */
      const BOT_Y    = curY;
      const statW    = 85;
      const bellW    = UW - statW - 5;
      const bellX    = ML + statW + 5;

      /* ── Class Statistics table (left) ── */
      const statRows: [string, string, string, string][] = [
        ['Attended', String(attended), 'Absent',    String(absent)],
        ['Pass',     String(pass),     'Fail',       String(fail)],
        ['Pass Rate', `${passRate}%`,  'Average',    avg],
        ['Highest',  highest,          'Lowest',     lowest],
      ];

      // Title
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
      doc.setFillColor(30, 58, 95);
      doc.rect(ML, BOT_Y, statW, 6, 'F');
      doc.text('Class Statistics', ML + statW / 2, BOT_Y + 4.2, { align: 'center' });

      const rowH = 7;
      const cW   = statW / 4;
      statRows.forEach(([l1, v1, l2, v2], ri) => {
        const ry = BOT_Y + 6 + ri * rowH;
        const bg: [number, number, number] = ri % 2 === 0 ? [248, 252, 255] : [255, 255, 255];
        doc.setFillColor(...bg); doc.rect(ML, ry, statW, rowH, 'F');
        doc.setDrawColor(210, 218, 228); doc.setLineWidth(0.2);
        doc.rect(ML, ry, statW, rowH, 'S');
        // vertical dividers
        [1, 2, 3].forEach((d) => { doc.line(ML + d * cW, ry, ML + d * cW, ry + rowH); });
        // labels
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(30, 58, 95);
        doc.text(l1, ML + cW * 0 + 2, ry + 4.5);
        doc.text(l2, ML + cW * 2 + 2, ry + 4.5);
        // values (coloured)
        const v1n = parseFloat(v1);
        const col1: [number, number, number] =
          l1 === 'Pass' ? [22, 163, 74] : l1 === 'Fail' && fail > 0 ? [220, 38, 38] :
          l1 === 'Pass Rate' ? (passRate >= 75 ? [22, 163, 74] : passRate >= 50 ? [234, 88, 12] : [220, 38, 38]) :
          l1 === 'Highest' ? [22, 163, 74] :
          [37, 99, 235];
        const col2: [number, number, number] =
          l2 === 'Absent' && absent > 0 ? [220, 38, 38] : l2 === 'Fail' && fail > 0 ? [220, 38, 38] :
          l2 === 'Lowest' ? (parseFloat(lowest) >= passMarkThreshold ? [22, 163, 74] : [220, 38, 38]) :
          [37, 99, 235];
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
        doc.setTextColor(...col1); doc.text(v1, ML + cW * 1 + cW / 2, ry + 4.5, { align: 'center' });
        doc.setTextColor(...col2); doc.text(v2, ML + cW * 3 + cW / 2, ry + 4.5, { align: 'center' });
      });

      /* ── Bell Curve histogram (right) ── */
      const rangeCounts = computeRangeCounts(cycleTotals);
      const maxCount    = Math.max(1, ...rangeCounts.map((r) => r.count));
      const chartH      = 6 + 4 * rowH; // same total height as stats block
      const chartTop    = BOT_Y;

      // Title bar
      doc.setFillColor(30, 58, 95);
      doc.rect(bellX, chartTop, bellW, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
      doc.text('Bell Curve Distribution', bellX + bellW / 2, chartTop + 4.2, { align: 'center' });

      const plotTop    = chartTop + 6 + 2;          // leave 2mm below title
      const xAxisH     = 6;                          // space for x labels
      const plotH      = chartH - 6 - xAxisH - 2;   // usable bar height
      const barCount   = rangeCounts.length;
      const barGap     = 0.8;
      const barW2      = (bellW - barGap * (barCount + 1)) / barCount;

      // background
      doc.setFillColor(250, 252, 255);
      doc.rect(bellX, plotTop, bellW, plotH + xAxisH, 'F');
      doc.setDrawColor(220, 228, 238); doc.setLineWidth(0.2);
      doc.rect(bellX, plotTop, bellW, plotH + xAxisH, 'S');

      // Draw each bar
      const barColors: [number, number, number][] = [
        [239, 68,  68],  // 0-9    red
        [239, 68,  68],  // 10-19  red
        [249, 115, 22],  // 20-29  orange
        [249, 115, 22],  // 30-39  orange
        [234, 179, 8],   // 40-49  yellow
        [34,  197, 94],  // 50-59  green
        [34,  197, 94],  // 60-69  green
        [59,  130, 246], // 70-74  blue
        [59,  130, 246], // 75-79  blue
        [99,  102, 241], // 80-89  indigo
        [99,  102, 241], // 90-99  indigo
        [139, 92,  246], // 100    purple
      ];

      rangeCounts.forEach((rc, i) => {
        const bx      = bellX + barGap + i * (barW2 + barGap);
        const barFrac = rc.count / maxCount;
        const bh      = barFrac * (plotH - 3);
        const by      = plotTop + plotH - bh;
        const bc      = barColors[i] ?? [99, 102, 241];

        if (rc.count > 0) {
          // Draw bar (light opacity fill behind the curve)
          doc.setFillColor(bc[0], bc[1], bc[2]);
          doc.setDrawColor(bc[0], bc[1], bc[2]);
          doc.setLineWidth(0.1);
          // Semi-transparent bar (draw as lighter shade)
          const lr = Math.round(bc[0] + (255 - bc[0]) * 0.6);
          const lg = Math.round(bc[1] + (255 - bc[1]) * 0.6);
          const lb = Math.round(bc[2] + (255 - bc[2]) * 0.6);
          doc.setFillColor(lr, lg, lb);
          doc.rect(bx, by, barW2, bh, 'F');

          // count label above bar
          doc.setFont('helvetica', 'bold'); doc.setFontSize(4.5); doc.setTextColor(...bc);
          doc.text(String(rc.count), bx + barW2 / 2, by - 0.8, { align: 'center' });
        }

        // x-axis label (range, e.g. "50-59")
        doc.setFont('helvetica', 'normal'); doc.setFontSize(4); doc.setTextColor(100, 110, 130);
        const label = rc.label.replace('–', '-').replace(' ', '');
        doc.text(label, bx + barW2 / 2, plotTop + plotH + xAxisH - 1, { align: 'center' });
      });

      // ── Draw smooth curve over bars ──
      // Compute center-x and top-y of each bar peak
      const curvePoints: { x: number; y: number }[] = rangeCounts.map((rc, i) => {
        const bx   = bellX + barGap + i * (barW2 + barGap);
        const cx   = bx + barW2 / 2;
        const barFrac = rc.count / maxCount;
        const bh   = barFrac * (plotH - 3);
        return { x: cx, y: plotTop + plotH - bh };
      });

      // Catmull-Rom → Bezier conversion for smooth curve
      const crPoints = [curvePoints[0], ...curvePoints, curvePoints[curvePoints.length - 1]];
      if (curvePoints.length >= 2) {
        doc.setDrawColor(30, 58, 95); doc.setLineWidth(0.7);
        for (let i = 0; i < curvePoints.length - 1; i++) {
          const p0 = crPoints[i];
          const p1 = crPoints[i + 1];
          const p2 = crPoints[i + 2];
          const p3 = crPoints[i + 3];
          // Catmull-Rom control points (clamp y to stay within plot bounds)
          const _clampY = (y: number) => Math.max(plotTop, Math.min(plotTop + plotH, y));
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = _clampY(p1.y + (p2.y - p0.y) / 6);
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = _clampY(p2.y - (p3.y - p1.y) / 6);
          (doc as any).lines([[cp1x - p1.x, cp1y - p1.y, cp2x - p1.x, cp2y - p1.y, p2.x - p1.x, p2.y - p1.y]], p1.x, p1.y, [1, 1], 'S', false);
        }

        // Fill area under the curve (gradient effect using filled polygon)
        const fillPts: number[][] = [];
        // Start from bottom-left
        fillPts.push([curvePoints[0].x, plotTop + plotH]);
        // Walk along the curve top-points
        curvePoints.forEach((pt) => fillPts.push([pt.x, pt.y]));
        // Close at bottom-right
        fillPts.push([curvePoints[curvePoints.length - 1].x, plotTop + plotH]);
        doc.setFillColor(59, 130, 246);
        (doc as any).setGState && (doc as any).setGState(new (doc as any).GState({ opacity: 0.15 }));
        const polyLines = fillPts.slice(1).map((p, i) => [p[0] - fillPts[i][0], p[1] - fillPts[i][1]]);
        (doc as any).lines(polyLines, fillPts[0][0], fillPts[0][1], [1, 1], 'F', true);
        (doc as any).setGState && (doc as any).setGState(new (doc as any).GState({ opacity: 1 }));
      }

      // baseline
      doc.setDrawColor(180, 190, 208); doc.setLineWidth(0.3);
      doc.line(bellX + barGap, plotTop + plotH, bellX + bellW - barGap, plotTop + plotH);

      // footnote: attended + avg
      doc.setFont('helvetica', 'italic'); doc.setFontSize(4.5); doc.setTextColor(120, 130, 150);
      doc.text(
        `n=${attended} attended · avg ${avg}/100`,
        bellX + bellW / 2, chartTop + chartH + 1,
        { align: 'center' },
      );

      /* ── Footer (page 1 — drawn before any addPage call) ── */
      const footY = PH - 6;
      doc.setDrawColor(180, 190, 210); doc.setLineWidth(0.3);
      doc.line(ML, footY - 3, PW - MR, footY - 3);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(130, 140, 160);
      const now = new Date();
      const dateStr = `${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
      doc.text(`Generated: ${dateStr}  |  ${courseName}  |  ${cycleName}  |  Page 1`, PW / 2, footY, { align: 'center' });

      /* ── Individual Exam Bell Graphs (new page) ── */
      const examEntries = activeCycleExams.map((ex) => {
        const students = examMarksMap[ex.id]?.students ?? [];
        const totals100 = students
          .filter((s) => !s.is_absent && s.mark != null && ex.max_marks > 0)
          .map((s) => clamp(Math.round((s.mark! / ex.max_marks) * 100), 0, 100));
        return { ex, totals100 };
      }).filter(({ ex }) => ex.kind !== 'cqi');

      if (examEntries.length > 0) {
        /* ── Decide whether to continue on page 1 or open a new page ── */
        // Overhead before the graph row: 5 (gap) + 4 (after separator) + 6 (title) = 15mm
        const EXAM_OVERHEAD = 15;
        const EXAM_MIN_CELL_H = 30; // minimum readable graph height
        const EXAM_MAX_CELL_H = 48; // preferred graph height
        const contentEndY = BOT_Y + chartH + 6;
        // Use the same bottom threshold as the overflow check (PH-15) so fitCellH never exceeds it
        const availH = (PH - 15) - contentEndY - EXAM_OVERHEAD;
        const fitCellH = Math.min(EXAM_MAX_CELL_H, Math.floor(availH));
        const needNewPage = fitCellH < EXAM_MIN_CELL_H;

        let epY: number;
        let examPageNum: number;
        let cellH: number;

        if (needNewPage) {
          doc.addPage();
          epY = 10;
          examPageNum = 2;

          /* Banner on new page */
          if (b64Banner) {
            const { w: bw2, h: bh2 } = await imgSize(b64Banner);
            const bW2 = Math.min(UW * 0.82, (bw2 / bh2) * HEADER_H);
            doc.addImage(b64Banner, 'PNG', ML, epY, bW2, HEADER_H);
          }
          if (b64Kr) {
            const { w: kw2, h: kh2 } = await imgSize(b64Kr);
            const kH2 = Math.min(logoH, (kh2 / kw2) * logoW);
            doc.addImage(b64Kr, 'PNG', logosX, epY + (HEADER_H - kH2) / 2, logoW, kH2);
          }
          if (b64Idcs) {
            const { w: iw2, h: ih2 } = await imgSize(b64Idcs);
            const iH2 = Math.min(logoH, (ih2 / iw2) * logoW);
            doc.addImage(b64Idcs, 'PNG', logosX + logoW + logoGap, epY + (HEADER_H - iH2) / 2, logoW, iH2);
          }
          epY += HEADER_H + 2;
          doc.setDrawColor(30, 58, 95); doc.setLineWidth(0.6);
          doc.line(ML, epY, PW - MR, epY);
          epY += 4;
          cellH = EXAM_MAX_CELL_H;
        } else {
          /* Continue on page 1 — add a small separator and a title */
          epY = contentEndY + 5;
          examPageNum = 1;
          doc.setDrawColor(180, 190, 210); doc.setLineWidth(0.3);
          doc.line(ML, epY, PW - MR, epY);
          epY += 4;
          cellH = fitCellH; // scaled to fit remaining page 1 space
        }

        /* Page title */
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 58, 95);
        doc.text('Individual Exam Bell Graphs', PW / 2, epY, { align: 'center' });
        epY += 6;

        /* Draw 3 exam bell graphs per row */
        const COLS = 3;
        const cellGap = 4;
        const cellW = (UW - cellGap * (COLS - 1)) / COLS;

        for (let gi = 0; gi < examEntries.length; gi++) {
          const col = gi % COLS;
          const row = Math.floor(gi / COLS);
          const cellX = ML + col * (cellW + cellGap);
          const cellY = epY + row * (cellH + 4);

          // Add new page if overflowing
          if (cellY + cellH > PH - 15) {
            doc.addPage();
            epY = 15;
            // Recalculate after page break (handled by continuing; layout restarts)
          }

          const { ex, totals100 } = examEntries[gi];
          const eCounts = computeRangeCounts(totals100);
          const eMax = Math.max(1, ...eCounts.map((r) => r.count));
          const eAttended = totals100.length;
          const eAvg = eAttended > 0 ? (totals100.reduce((a, b) => a + b, 0) / eAttended).toFixed(1) : '—';

          /* Title bar */
          doc.setFillColor(30, 58, 95);
          doc.rect(cellX, cellY, cellW, 6, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(255, 255, 255);
          const titleText = doc.splitTextToSize(`${ex.short_name || ex.name} (/${ex.max_marks})`, cellW - 4)[0];
          doc.text(titleText, cellX + cellW / 2, cellY + 4.2, { align: 'center' });

          const ePlotTop = cellY + 6 + 2;
          const eXAxisH = 5;
          const ePlotH = cellH - 6 - eXAxisH - 4;
          const eBCount = eCounts.length;
          const eBGap = 0.5;
          const eBW = (cellW - eBGap * (eBCount + 1)) / eBCount;

          doc.setFillColor(250, 252, 255);
          doc.rect(cellX, ePlotTop, cellW, ePlotH + eXAxisH, 'F');
          doc.setDrawColor(220, 228, 238); doc.setLineWidth(0.2);
          doc.rect(cellX, ePlotTop, cellW, ePlotH + eXAxisH, 'S');

          eCounts.forEach((rc, i) => {
            const bx2 = cellX + eBGap + i * (eBW + eBGap);
            const bFrac = rc.count / eMax;
            const bh2 = bFrac * (ePlotH - 2);
            const by2 = ePlotTop + ePlotH - bh2;
            const bc2 = barColors[i] ?? [99, 102, 241];
            if (rc.count > 0) {
              const lr2 = Math.round(bc2[0] + (255 - bc2[0]) * 0.6);
              const lg2 = Math.round(bc2[1] + (255 - bc2[1]) * 0.6);
              const lb2 = Math.round(bc2[2] + (255 - bc2[2]) * 0.6);
              doc.setFillColor(lr2, lg2, lb2);
              doc.rect(bx2, by2, eBW, bh2, 'F');
              doc.setFont('helvetica', 'bold'); doc.setFontSize(3.5); doc.setTextColor(...bc2);
              doc.text(String(rc.count), bx2 + eBW / 2, by2 - 0.5, { align: 'center' });
            }
            doc.setFont('helvetica', 'normal'); doc.setFontSize(3); doc.setTextColor(100, 110, 130);
            doc.text(rc.label.replace('–', '-').replace(' ', ''), bx2 + eBW / 2, ePlotTop + ePlotH + eXAxisH - 0.5, { align: 'center' });
          });

          /* Smooth curve */
          const eCurvePoints = eCounts.map((rc, i) => {
            const bx2 = cellX + eBGap + i * (eBW + eBGap);
            const bFrac = rc.count / eMax;
            const bh2 = bFrac * (ePlotH - 2);
            return { x: bx2 + eBW / 2, y: ePlotTop + ePlotH - bh2 };
          });
          const eCrPts = [eCurvePoints[0], ...eCurvePoints, eCurvePoints[eCurvePoints.length - 1]];
          if (eCurvePoints.length >= 2) {
            doc.setDrawColor(30, 58, 95); doc.setLineWidth(0.5);
            for (let ci = 0; ci < eCurvePoints.length - 1; ci++) {
              const p0 = eCrPts[ci], p1 = eCrPts[ci + 1], p2 = eCrPts[ci + 2], p3 = eCrPts[ci + 3];
              const _eClampY = (y: number) => Math.max(ePlotTop, Math.min(ePlotTop + ePlotH, y));
              const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = _eClampY(p1.y + (p2.y - p0.y) / 6);
              const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = _eClampY(p2.y - (p3.y - p1.y) / 6);
              (doc as any).lines([[cp1x - p1.x, cp1y - p1.y, cp2x - p1.x, cp2y - p1.y, p2.x - p1.x, p2.y - p1.y]], p1.x, p1.y, [1, 1], 'S', false);
            }
          }

          doc.setDrawColor(180, 190, 208); doc.setLineWidth(0.2);
          doc.line(cellX + eBGap, ePlotTop + ePlotH, cellX + cellW - eBGap, ePlotTop + ePlotH);

          /* Footnote */
          doc.setFont('helvetica', 'italic'); doc.setFontSize(3.5); doc.setTextColor(120, 130, 150);
          doc.text(`n=${eAttended} · avg ${eAvg}/100`, cellX + cellW / 2, cellY + cellH - 0.5, { align: 'center' });
        }

        /* Footer for individual exam graphs page */
        const fp2Y = PH - 6;
        doc.setDrawColor(180, 190, 210); doc.setLineWidth(0.3);
        doc.line(ML, fp2Y - 3, PW - MR, fp2Y - 3);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(130, 140, 160);
        const now2 = new Date();
        const dateStr2 = `${now2.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${now2.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
        doc.text(`Generated: ${dateStr2}  |  ${courseName}  |  Individual Exam Graphs  |  Page ${examPageNum}`, PW / 2, fp2Y, { align: 'center' });
      }

      doc.save(`Result_Analysis_${courseName}_${cycleName}.pdf`);
    } catch (e: any) {
      alert('PDF export failed: ' + (e?.message || e));
    } finally {
      setExportBusy(false);
    }
  };

  /* ── Loading / error screens ── */
  if (loadingCourse) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (courseError) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800">Failed to load result analysis</p>
            <p className="text-red-700 text-sm mt-1">{courseError}</p>
            <button onClick={() => setRefreshTick((t) => t + 1)} className="mt-2 text-sm text-red-700 underline">Try again</button>
          </div>
        </div>
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className="p-8 text-center">
        <BarChart2 className="w-14 h-14 mx-auto mb-4 text-gray-200" />
        <p className="font-semibold text-gray-600 text-lg">No exam assignments found</p>
        <p className="text-sm text-gray-400 mt-1">Exam assignments will appear here once configured.</p>
      </div>
    );
  }

  const viewMeta: Record<ViewKey, { icon: React.ReactNode; label: string }> = {
    sheet: { icon: <Table2 size={14} />,     label: 'Mark Sheet' },
    bell:  { icon: <BarChart2 size={14} />,  label: 'Bell Graph' },
    range: { icon: <TrendingUp size={14} />, label: 'Range Analysis' },
    rank:  { icon: <Trophy size={14} />,     label: 'Ranking' },
  };

  return (
    <div style={{ background: '#f0f4f8', minHeight: 400 }}>
      {/* ════ HERO HEADER ════ */}
      <div style={{ background: 'linear-gradient(135deg, #0f2044 0%, #1e3a5f 60%, #2563eb 100%)', padding: '20px 24px 0', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 80, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '0.01em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={22} style={{ opacity: 0.9 }} /> Result Analysis
            </div>
            {courseName && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{courseName}</div>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {studentCount > 0 && (
              <span style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#e0e7ff', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
                {studentCount} Students
              </span>
            )}

            {/* Export dropdown */}
            <div ref={exportRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                disabled={exportBusy || !selectedCycleKey || cycleTotals.length === 0}
                style={{ background: exportBusy ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, padding: '7px 12px', cursor: exportBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, transition: 'background 0.15s' }}
              >
                <Download size={14} /> Export <ChevronDown size={12} />
              </button>
              {showExportMenu && (
                <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.13)', minWidth: 160, zIndex: 50, overflow: 'hidden' }}>
                  <button onClick={handleExcel} style={{ width: '100%', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <FileSpreadsheet size={16} /> Excel (.xlsx)
                  </button>
                  <div style={{ height: 1, background: '#f3f4f6' }} />
                  <button onClick={handlePDF} style={{ width: '100%', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <FileText size={16} /> PDF Report
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => { setExamMarksMap({}); setRefreshTick((t) => t + 1); }}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Refresh data"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Cycle tabs */}
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {orderedCycleKeys.map((key) => {
            const isActive = selectedCycleKey === key;
            const cnt = cycleGroups.get(key)?.length ?? 0;
            return (
              <button
                key={key}
                onClick={() => { setSelectedCycleKey(key); setActiveView('sheet'); }}
                style={{ padding: '9px 20px', border: 'none', borderRadius: '8px 8px 0 0', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: isActive ? '#fff' : 'rgba(255,255,255,0.10)', color: isActive ? '#1e3a5f' : 'rgba(255,255,255,0.80)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 7 }}
              >
                {cycleDisplayName(key)}
                <span style={{ fontSize: 11, fontWeight: 700, background: isActive ? '#dbeafe' : 'rgba(255,255,255,0.18)', color: isActive ? '#1d4ed8' : 'rgba(255,255,255,0.75)', borderRadius: 10, padding: '1px 7px' }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ════ VIEW TABS ════ */}
      <div style={{ background: '#fff', borderBottom: '1.5px solid #e5e7eb', padding: '0 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', gap: 0, paddingTop: 8 }}>
          {(Object.keys(viewMeta) as ViewKey[]).map((v) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              style={{ padding: '10px 20px', border: 'none', borderBottom: activeView === v ? '3px solid #2563eb' : '3px solid transparent', background: 'transparent', fontWeight: activeView === v ? 800 : 500, fontSize: 13, cursor: 'pointer', color: activeView === v ? '#2563eb' : '#6b7280', transition: 'color 0.15s, border-color 0.15s', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              {viewMeta[v].icon} {viewMeta[v].label}
            </button>
          ))}
        </div>
      </div>

      {/* ════ CONTENT ════ */}
      {selectedCycleKey ? (
        <div style={{ padding: 24 }}>
          {/* Exam assignment pills */}
          <div style={{ marginBottom: 20, background: '#fff', borderRadius: 14, padding: '14px 18px', border: '1.5px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Exam Assignments — <span style={{ color: '#1e3a5f' }}>{cycleDisplayName(selectedCycleKey)}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {activeCycleExams.map((ex, idx) => {
                const state = examMarksMap[ex.id];
                const isMM = state?.isMarkManager ?? false;
                return (
                  <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13 }}>
                    <span style={{ background: '#1e3a5f', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</span>
                    <span style={{ fontWeight: 700, color: '#1f2937' }}>{ex.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>/{ex.max_marks}</span>
                    {isMM && <span style={{ fontSize: 10, background: '#ede9fe', color: '#7c3aed', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>MM</span>}
                    {statusBadge(ex.status, ex.is_locked)}
                    {state?.loading && <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />}
                  </div>
                );
              })}
            </div>
          </div>

          {firstError && (
            <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} /> {firstError}
            </div>
          )}

          {/* View content */}
          {activeView === 'sheet' && (
            <MarkSheetTable cols={sheetCols} rows={sheetRows} loading={anyExamLoading} error={firstError} />
          )}
          {activeView === 'bell' && (
            <BellGraphCard totals={cycleTotals} loading={anyExamLoading} cycleName={cycleDisplayName(selectedCycleKey)} />
          )}
          {activeView === 'range' && (
            <RangeAnalysisCard totals={cycleTotals} studentCount={studentCount} loading={anyExamLoading} />
          )}
          {activeView === 'rank' && (
            <RankingCard cols={sheetCols} rows={sheetRows} loading={anyExamLoading} />
          )}
        </div>
      ) : (
        <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
          Select a cycle above to view result analysis.
        </div>
      )}
    </div>
  );
}
