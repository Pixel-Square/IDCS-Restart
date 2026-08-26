/**
 * Internal Mark Page
 * Overview of internal mark components + CO-wise summary for a course.
 * Two tabs: Exam Assignments | CO Summary (raw & weighted marks)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Users, CheckCircle, Clock, AlertCircle,
  Edit2, Lock, RefreshCw, FileText, Download, BarChart3, AlertTriangle, Copy,
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import { exportCOSummaryToExcel, exportCOSummaryToPDF, exportInternalMarksExcel } from './COSummaryExport';
import FacultyCourseDashboard from './FacultyCourseDashboard';
import ResultAnalysisPage from './result_analysis/ResultAnalysisPage';
import ResetNoticePopup, { type ResetNotice } from './ResetNoticePopup';
const COattainmentTable = React.lazy(() => import('./coattainment/COattainmentTable'));

function COattainmentTableWrapper({ courseId }: { courseId?: string | undefined }) {
  return <COattainmentTable courseId={courseId} />;
}

/* ─── types ─── */

interface ExamMark {
  id: string;
  name: string;
  short_name: string;
  max_marks: number;
  weight: number;
  co_weights: Record<string, number>;  // Per-CO weights from ClassType config
  entered_count: number;
  total_students: number;
  is_locked: boolean;
  due_date: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'LOCKED' | 'PUBLISHED';
  kind?: 'exam' | 'cqi';
  cqi_cos?: number[];
  cqi_name?: string;
}

interface CourseInfo {
  id: string;
  course_code: string;
  course_name: string;
  class_name: string;
  section: string;
  semester: number;
  department: string;
  student_count: number;
  is_elective: boolean;
  class_type: { id: string; name: string; total_internal_marks: number };
  qp_type: string | null;
  faculty_name?: string;
  setup_status: { class_type_assigned: boolean; qp_type_assigned: boolean };
  exams: ExamMark[];
}

interface COExam {
  id: string;
  name: string;
  short_name: string;
  max_marks: number;
  weight: number;
  co_weights: Record<string, number>;  // Per-CO weights from ClassType config
  cia_enabled?: boolean;
  cia_weight?: number;
  cia_weight_per_co?: boolean;  // true = each covered CO gets the full cia_weight (no split)
  exam_max_marks?: number;
  covered_cos: number[];
  weight_per_co: number;
  max_per_co: number;
  co_max_map: Record<string, number>;
  combo_questions?: Array<{ key: string; co_list: number[]; max_marks: number }>;
  status: string;
  kind?: string;
}

interface COStudent {
  reg_no: string;
  name: string;
  exam_marks: Record<string, Record<string, number | boolean>>;
  weighted_marks: Record<string, number>;
  co_totals: number[];
  final_mark: number;
  cqi_satisfied_conditions?: string[];
  /** CO numbers (1-based) where the CQI cap was actually applied for this student. */
  cqi_capped_cos?: number[];
}

interface COSummary {
  course_code: string;
  course_name: string;
  co_count: number;
  total_internal_marks: number;
  exams: COExam[];
  students: COStudent[];
  cqi_config?: {
    exams?: string[];
    conditions?: Array<{ title?: string; name?: string; cap_enabled?: boolean; cap_percent?: number }>;
  } | null;
}

/* ─── component ─── */

export default function InternalMarkPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'dashboard' | 'exams' | 'co' | 'result' | 'coattainment'>('dashboard');
  // add coattainment tab
  const [showCoAttainment, setShowCoAttainment] = useState(false);

  // CO summary
  const [coLoading, setCoLoading] = useState(false);
  const [coSummary, setCoSummary] = useState<COSummary | null>(null);
  const [coView, setCoView] = useState<'raw' | 'weighted'>('raw');
  const [courseOutcomeNumbers, setCourseOutcomeNumbers] = useState<number[]>([]);
  const [courseOutcomeLoading, setCourseOutcomeLoading] = useState(false);

  // Internal marks export dropdown
  const [showImExport, setShowImExport] = useState(false);
  const [imExporting, setImExporting] = useState(false);
  const imExportRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showImExport) return;
    const handler = (e: MouseEvent) => {
      if (imExportRef.current && !imExportRef.current.contains(e.target as Node))
        setShowImExport(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showImExport]);

  // Reset notices popup
  const [resetNotices, setResetNotices] = useState<ResetNotice[]>([]);
  const [showResetPopup, setShowResetPopup] = useState(false);

  const dedupedCourseExams = useMemo(() => {
    if (!courseInfo?.exams || courseInfo.exams.length === 0) return [] as ExamMark[];
    const seen = new Set<string>();
    const result: ExamMark[] = [];

    for (const exam of courseInfo.exams) {
      const key = [
        String(exam.kind || 'exam').trim().toLowerCase(),
        String(exam.short_name || exam.name || '').trim().toLowerCase(),
      ].join('::');

      if (seen.has(key)) continue;
      seen.add(key);
      result.push(exam);
    }

    return result;
  }, [courseInfo]);

  useEffect(() => { loadData(); }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    const loadCourseOutcomes = async () => {
      try {
        setCourseOutcomeLoading(true);
        const res = await fetchWithAuth('/api/academic-v2/course-outcomes/');
        if (!res.ok) throw new Error('Failed to load course outcomes');
        const data = await res.json();
        const rows = Array.isArray(data) ? data : (data.results || []);
        const numsSet = new Set<number>();
        for (const row of rows) {
          if (row?.is_active === false) continue;
          const n = Number(row?.number);
          if (Number.isFinite(n) && n > 0) {
            numsSet.add(n);
          }
        }
        const nums = Array.from(numsSet).sort((a, b) => a - b);
        setCourseOutcomeNumbers(nums);
      } catch {
        setCourseOutcomeNumbers([]);
      } finally {
        setCourseOutcomeLoading(false);
      }
    };
    void loadCourseOutcomes();
  }, [courseId]);

  // Fetch reset notices from admin bypass logs for this course
  useEffect(() => {
    if (!courseId) return;
    fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/reset-notices/`)
      .then((r) => r.ok ? r.json() : [])
      .then((notices: ResetNotice[]) => {
        const unread = notices.filter(
          (n) => !localStorage.getItem(`reset_notice_dismissed_${n.id}`)
        );
        if (unread.length > 0) {
          setResetNotices(unread);
          setShowResetPopup(true);
        }
      })
      .catch(() => {});
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to load');
      }
      setCourseInfo(await response.json());
    } catch (error) {
      console.error('Failed to load:', error);
      setMessage({ type: 'error', text: 'Failed to load course information' });
    } finally {
      setLoading(false);
    }
  };

  const loadCOSummary = async () => {
    try {
      setCoLoading(true);
      const response = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/co-summary/`);
      if (!response.ok) throw new Error('Failed to load CO summary');
      setCoSummary(await response.json());
    } catch (error) {
      console.error('CO summary error:', error);
      setMessage({ type: 'error', text: 'Failed to load CO summary' });
    } finally {
      setCoLoading(false);
    }
  };

  // Load CO data when tab switches
  useEffect(() => {
    if (tab === 'co' && !coSummary && !coLoading) loadCOSummary();
  }, [tab]);

  const orderedCoSummary = useMemo(() => {
    if (!coSummary || !courseInfo) return coSummary;
    const orderKeys = dedupedCourseExams.map((e) => String(e.short_name || e.name || '').trim());
    if (orderKeys.length === 0) return coSummary;
    const idxMap = new Map(orderKeys.map((k, i) => [k.toLowerCase(), i]));
    const nextExams = [...coSummary.exams].sort((a, b) => {
      const aKey = String(a.short_name || a.name || '').trim().toLowerCase();
      const bKey = String(b.short_name || b.name || '').trim().toLowerCase();
      const aIdx = idxMap.has(aKey) ? (idxMap.get(aKey) as number) : Number.MAX_SAFE_INTEGER;
      const bIdx = idxMap.has(bKey) ? (idxMap.get(bKey) as number) : Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return { ...coSummary, exams: nextExams };
  }, [coSummary, courseInfo, dedupedCourseExams]);

  const exportReport = async () => {
    try {
      const response = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/export-report/`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `internal_marks_${courseInfo?.course_code}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ type: 'error', text: 'Failed to export report' });
    }
  };

  const handleImExcel = async () => {
    setShowImExport(false);
    if (!courseInfo) return;
    setImExporting(true);
    try {
      let summary = coSummary;
      if (!summary) {
        const r = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/co-summary/`);
        if (!r.ok) throw new Error('Failed to load CO summary');
        summary = await r.json();
        setCoSummary(summary);
      }
      if (!summary) return;
      exportInternalMarksExcel(summary, courseInfo);
    } catch {
      setMessage({ type: 'error', text: 'Failed to export Internal Marks Excel' });
    } finally {
      setImExporting(false);
    }
  };

  const handleImPDF = async () => {
    setShowImExport(false);
    if (!courseInfo) return;
    setImExporting(true);
    try {
      let summary = coSummary;
      if (!summary) {
        const r = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/co-summary/`);
        if (!r.ok) throw new Error('Failed to load CO summary');
        summary = await r.json();
        setCoSummary(summary);
      }
      if (!summary) return;
      await exportCOSummaryToPDF(summary, 'weighted', courseInfo);
    } catch {
      setMessage({ type: 'error', text: 'Failed to export Internal Marks PDF' });
    } finally {
      setImExporting(false);
    }
  };



  /* ─── status helpers ─── */
  const getStatusBadge = (status: string, locked: boolean) => {
    if (status === 'PUBLISHED') return <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm"><CheckCircle className="w-3 h-3" />Published</span>;
    if (locked) return <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-sm"><Lock className="w-3 h-3" />Locked</span>;
    switch (status) {
      case 'COMPLETED': return <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-sm"><CheckCircle className="w-3 h-3" />Completed</span>;
      case 'IN_PROGRESS': return <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-sm"><Clock className="w-3 h-3" />In Progress</span>;
      case 'NOT_STARTED': return <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"><AlertCircle className="w-3 h-3" />Not Started</span>;
      default: return null;
    }
  };

  const getProgressBar = (entered: number, total: number) => {
    const pct = total > 0 ? (entered / total) * 100 : 0;
    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`h-2 rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  /* ─── loading / error states ─── */
  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!courseInfo) return <div className="p-6 text-center text-red-600">Failed to load course information</div>;

  const totalEntered = dedupedCourseExams.reduce((sum, e) => sum + (e.status === 'COMPLETED' ? 1 : 0), 0);
  const totalExams = dedupedCourseExams.length;
  const firstCqiExam = dedupedCourseExams.find((e) => e.kind === 'cqi');

  /* ─── render ─── */
  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto space-y-4">
      {/* Reset notice popup — shown when admin has reset this course/exam */}
      {showResetPopup && resetNotices.length > 0 && (
        <ResetNoticePopup
          notices={resetNotices}
          onDismissAll={() => setShowResetPopup(false)}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/academic-v2/courses')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{courseInfo.course_code}</h1>
            <p className="text-gray-500">{courseInfo.course_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (firstCqiExam) {
                navigate(`/academic-v2/cqi/${firstCqiExam.id}`);
              } else {
                navigate(`/academic-v2/course/${courseId}/cqi`);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
          >
            <BarChart3 className="w-4 h-4" /> CQI Entry
          </button>
          <button onClick={exportReport} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">
            <Download className="w-4 h-4" /> Export Report
          </button>
          {/* Internal Marks export dropdown */}
          <div className="relative" ref={imExportRef}>
            <button
              onClick={() => setShowImExport((v) => !v)}
              disabled={imExporting}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {imExporting ? 'Exporting…' : 'Internal Marks'}
              <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showImExport && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white border rounded-lg shadow-lg z-20">
                <button onClick={handleImExcel} className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 rounded-t-lg">
                  <Download className="w-4 h-4 text-green-600" /> Excel
                </button>
                <button onClick={handleImPDF} className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 rounded-b-lg border-t">
                  <FileText className="w-4 h-4 text-red-600" /> PDF
                </button>
              </div>
            )}
          </div>
          <button onClick={() => { loadData(); if (tab === 'co') loadCOSummary(); }} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* Setup status banner */}
      {(!courseInfo.setup_status.class_type_assigned || !courseInfo.setup_status.qp_type_assigned) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 text-sm">Exam setup incomplete</p>
            <ul className="mt-1 space-y-0.5 text-sm text-amber-700 list-disc list-inside">
              {!courseInfo.setup_status.class_type_assigned && (
                <li>Class type is not configured in Academic 2.1 — contact the administrator.</li>
              )}
              {!courseInfo.setup_status.qp_type_assigned && (
                <li>QP type is not assigned to this course — contact the administrator to set it in the curriculum.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Course info card */}
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-start gap-5">
          <div className="p-3 bg-blue-100 rounded-lg">
            <BookOpen className="w-7 h-7 text-blue-600" />
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-400 block text-xs">Class</span><span className="font-medium">{courseInfo.class_name}</span></div>
            <div><span className="text-gray-400 block text-xs">Section</span><span className="font-medium">{courseInfo.section}</span></div>
            <div><span className="text-gray-400 block text-xs">Semester</span><span className="font-medium">{courseInfo.semester}</span></div>
            <div><span className="text-gray-400 block text-xs">Students</span><span className="font-medium flex items-center gap-1"><Users className="w-3.5 h-3.5" />{courseInfo.student_count}</span></div>
            <div><span className="text-gray-400 block text-xs">Class Type</span><span className="font-medium">{courseInfo.class_type.name}</span></div>
            <div>
              <span className="text-gray-400 block text-xs">QP Type</span>
              {courseInfo.qp_type ? (
                <span className="inline-flex items-center gap-1 font-medium">
                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-semibold">{courseInfo.qp_type}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                  <AlertTriangle className="w-3 h-3" /> Not assigned
                </span>
              )}
            </div>
            <div><span className="text-gray-400 block text-xs">Total Internal Marks</span><span className="font-medium">{courseInfo.class_type.total_internal_marks}</span></div>
            <div><span className="text-gray-400 block text-xs">Type</span><span className="font-medium">{courseInfo.is_elective ? 'Elective' : 'Regular'}</span></div>
            <div><span className="text-gray-400 block text-xs">Progress</span><span className="font-medium">{totalEntered}/{totalExams} completed</span></div>
          </div>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex border-b">
        <button
          onClick={() => setTab('dashboard')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'dashboard' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4 inline mr-1.5 -mt-0.5" />Dashboard
        </button>
        <button
          onClick={() => setTab('exams')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'exams' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />Exam Assignments
        </button>
        <button
          onClick={() => setTab('co')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'co' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4 inline mr-1.5 -mt-0.5" />CO Summary
        </button>
        <button
          onClick={() => setTab('result')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'result' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4 inline mr-1.5 -mt-0.5" />Result Analysis
        </button>
        <button
          onClick={() => { setTab('coattainment'); }}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'coattainment' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4 inline mr-1.5 -mt-0.5" />CO Attainment
        </button>
      </div>

      {/* ─── Tab: Dashboard ─── */}
      {tab === 'dashboard' && courseInfo && (
        <div className="bg-white rounded-lg shadow p-4">
          <FacultyCourseDashboard courseInfo={courseInfo} taId={courseId ? Number(courseId) : undefined} />
        </div>
      )}

      {/* ─── Tab: Exam Assignments ─── */}
      {tab === 'exams' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold">Internal Mark Components</h2>
            {courseInfo.qp_type && (
              <span className="text-xs font-semibold px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full">
                QP Type: {courseInfo.qp_type}
              </span>
            )}
          </div>
          <div className="divide-y">
            {!courseInfo.setup_status.class_type_assigned || !courseInfo.setup_status.qp_type_assigned ? (
              <div className="p-8 text-center text-amber-700">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                <p className="font-medium">Exam assignments are not available yet.</p>
                <p className="text-sm text-gray-500 mt-1">
                  {!courseInfo.setup_status.class_type_assigned
                    ? 'Class type needs to be configured.'
                    : 'QP type needs to be assigned to this course in the curriculum.'}
                </p>
              </div>
            ) : dedupedCourseExams.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No exam components configured for QP type <strong>{courseInfo.qp_type}</strong></div>
            ) : dedupedCourseExams.map((exam) => {
              const isCqi = exam.kind === 'cqi';
              return (
              <div
                key={exam.id}
                className={`p-4 cursor-pointer ${isCqi ? 'bg-purple-50 hover:bg-purple-100 border-l-4 border-purple-400' : 'hover:bg-gray-50'}`}
                onClick={() => {
                  if (isCqi) {
                    navigate(`/academic-v2/cqi/${exam.id}`);
                  } else {
                    navigate(`/academic-v2/exam/${exam.id}`);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${isCqi ? 'bg-purple-200' : 'bg-gray-100'}`}><FileText className={`w-5 h-5 ${isCqi ? 'text-purple-600' : 'text-gray-600'}`} /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{exam.name}</h3>
                        <span className="text-sm text-gray-500">({exam.short_name})</span>
                        {isCqi && exam.cqi_name && (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded font-medium">{exam.cqi_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                        <span>Max: {exam.max_marks}</span>
                        {isCqi ? (
                          // CQI: show configured COs from admin, not co_weights
                          exam.cqi_cos && exam.cqi_cos.length > 0 ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">COs:</span>
                              {exam.cqi_cos.map((co) => (
                                <span key={co} className="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-xs rounded font-medium">CO{co}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-amber-500">COs not configured</span>
                          )
                        ) : (
                          // Regular exam: show per-CO weights
                          exam.co_weights && Object.keys(exam.co_weights).length > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">Wt:</span>
                            {Object.entries(exam.co_weights).sort(([a], [b]) => Number(a) - Number(b)).map(([co, wt]) => (
                              Number(wt) > 0 ? (
                                <span key={co} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded font-medium">
                                  CO{co}:{wt}
                                </span>
                              ) : (
                                <span key={co} className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-500 text-xs rounded font-medium">
                                  <AlertTriangle className="w-2.5 h-2.5" />CO{co}:0
                                </span>
                              )
                            ))}
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />Weights not set (contact admin)
                          </span>
                        ))}
                        {exam.due_date && <span>Due: {new Date(exam.due_date).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(exam.status, exam.is_locked)}
                    <div className="w-32">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Progress</span><span>{exam.entered_count}/{exam.total_students}</span>
                      </div>
                      {getProgressBar(exam.entered_count, exam.total_students)}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCqi) {
                          navigate(`/academic-v2/cqi/${exam.id}`);
                        } else {
                          navigate(`/academic-v2/exam/${exam.id}`);
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-white ${isCqi ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                      <Edit2 className="w-4 h-4" /> {isCqi ? 'Enter CQI' : 'Enter Marks'}
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Tab: Result Analysis ─── */}
      {tab === 'result' && courseId && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <ResultAnalysisPage courseId={courseId} />
        </div>
      )}

      {/* ─── Tab: CO Summary ─── */}
      {tab === 'co' && (
        <COSummaryTab
          loading={coLoading}
          data={orderedCoSummary}
          courseInfo={courseInfo}
          courseOutcomeNumbers={courseOutcomeNumbers}
          courseOutcomeLoading={courseOutcomeLoading}
          view={coView}
          onChangeView={setCoView}
          onRefresh={loadCOSummary}
        />
      )}
      {tab === 'coattainment' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* lazy import faculty COattainment table */}
          <React.Suspense fallback={<div className="p-6">Loading…</div>}>
            <COattainmentTableWrapper courseId={courseId} />
          </React.Suspense>
        </div>
      )}
    </div>
  );
}


/* ═══════════ CO Summary Tab Component ═══════════ */

function COSummaryTab({
  loading, data, courseInfo, courseOutcomeNumbers, courseOutcomeLoading, view, onChangeView, onRefresh,
}: {
  loading: boolean;
  data: COSummary | null;
  courseInfo: CourseInfo | null;
  courseOutcomeNumbers: number[];
  courseOutcomeLoading: boolean;
  view: 'raw' | 'weighted';
  onChangeView: (v: 'raw' | 'weighted') => void;
  onRefresh: () => void;
}) {
  const [showExportModal, setShowExportModal] = React.useState(false);
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null);

  const handleExportExcel = () => {
    if (!data || !courseInfo) return;
    setExporting('excel');
    try {
      exportCOSummaryToExcel(data, view, courseInfo);
    } finally {
      setExporting(null);
      setShowExportModal(false);
    }
  };

  const handleExportPDF = async () => {
    if (!data || !courseInfo) return;
    setExporting('pdf');
    try {
      await exportCOSummaryToPDF(data, view, courseInfo);
    } finally {
      setExporting(null);
      setShowExportModal(false);
    }
  };
  const [decimalPlaces, setDecimalPlaces] = React.useState<1 | 2>(2);
  const [selectedCells, setSelectedCells] = React.useState<Set<string>>(new Set());
  const [selectionStart, setSelectionStart] = React.useState<{ row: number; col: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = React.useState<{ row: number; col: number } | null>(null);
  const [isSelecting, setIsSelecting] = React.useState(false);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const selectedCellsRef = React.useRef<Set<string>>(new Set());

  // Helper function to format numbers based on decimal places
  const formatNumber = (value: number | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    if (value === 0) return '0' + (decimalPlaces === 2 ? '.00' : '.0');
    return decimalPlaces === 1 ? value.toFixed(1) : value.toFixed(2);
  };

  // Cell selection helpers
  const getCellKey = (rowIdx: number, colIdx: number): string => `${rowIdx}-${colIdx}`;
  
  const updateSelection = (start: { row: number; col: number }, end: { row: number; col: number }) => {
    const newSelection = new Set<string>();
    const startRow = Math.min(start.row, end.row);
    const endRow = Math.max(start.row, end.row);
    const startCol = Math.min(start.col, end.col);
    const endCol = Math.max(start.col, end.col);
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        newSelection.add(getCellKey(r, c));
      }
    }
    setSelectedCells(newSelection);
    selectedCellsRef.current = newSelection;
  };

  const handleCellMouseDown = (rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    setIsSelecting(true);
    const start = { row: rowIdx, col: colIdx };
    setSelectionStart(start);
    setSelectionEnd(start);
    updateSelection(start, start);
  };

  const handleCellMouseEnter = (rowIdx: number, colIdx: number) => {
    if (!isSelecting || !selectionStart) return;
    const end = { row: rowIdx, col: colIdx };
    setSelectionEnd(end);
    updateSelection(selectionStart, end);
  };

  React.useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false);
    };

    const handleCopy = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedCellsRef.current.size > 0) {
        e.preventDefault();
        
        const cellArray = Array.from(selectedCellsRef.current)
          .map(key => {
            const [row, col] = key.split('-').map(Number);
            return { row, col };
          })
          .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);
        
        if (cellArray.length === 0) return;

        const minRow = cellArray[0].row;
        const maxRow = cellArray[cellArray.length - 1].row;
        const minCol = Math.min(...cellArray.map(c => c.col));
        const maxCol = Math.max(...cellArray.map(c => c.col));

        const cellMap = new Map(cellArray.map(c => [`${c.row}-${c.col}`, true]));
        const rows: string[][] = [];

        for (let r = minRow; r <= maxRow; r++) {
          const rowData: string[] = [];
          for (let c = minCol; c <= maxCol; c++) {
            if (cellMap.has(`${r}-${c}`)) {
              const text = tableRef.current?.querySelector(`[data-cell="${r}-${c}"]`)?.textContent || '';
              rowData.push(text.trim());
            } else {
              rowData.push('');
            }
          }
          rows.push(rowData);
        }

        const tsvText = rows.map(row => row.join('\t')).join('\n');
        navigator.clipboard.writeText(tsvText).catch(err => console.error('Copy failed:', err));
      }
    };

    window.addEventListener('keydown', handleCopy);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('keydown', handleCopy);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const exams = data?.exams ?? [];
  const students = data?.students ?? [];
  const coNumbers = Array.from(new Set((courseOutcomeNumbers || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b);
  const co_count = coNumbers.length;
  const total_internal_marks = data?.total_internal_marks ?? 0;
  const cqiConfig = data?.cqi_config ?? null;

  // Compute actual total weight from exam co_weights (may differ from class_type total_internal_marks)
  const computedTotalWeight = useMemo(() => {
    let total = 0;
    for (const ex of exams) {
      if (String(ex.kind || 'exam').toLowerCase() === 'cqi') continue;
      const coveredCos = ex.covered_cos && ex.covered_cos.length > 0
        ? ex.covered_cos
        : coNumbers;
      for (const coNum of coveredCos) {
        const w = Number(ex.co_weights?.[String(coNum)] ?? (ex.co_weights as any)?.[coNum] ?? 0) || 0;
        total += w;
      }
      if (ex.cia_enabled && ex.cia_weight && ex.cia_weight > 0) {
        const n = ex.covered_cos?.length || 1;
        const perCo = !!ex.cia_weight_per_co;
        const effectiveW = perCo ? ex.cia_weight : Math.round((ex.cia_weight / n) * 100) / 100;
        for (let i = 0; i < n; i++) total += effectiveW;
      }
    }
    const rounded = Math.round(total * 100) / 100;
    return rounded > 0 ? rounded : total_internal_marks;
  }, [exams, coNumbers, total_internal_marks]);
  const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
  const normalizeExamCode = (value: string) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const cqiConditions = Array.isArray(cqiConfig?.conditions) ? cqiConfig.conditions : [];
  const hasCqiCap = cqiConditions.some((cond) => Boolean(cond?.cap_enabled));
  const cqiConditionByTitle = new Map<string, { title?: string; name?: string; cap_enabled?: boolean; cap_percent?: number }>();
  cqiConditions.forEach((cond, idx) => {
    const keys = [
      String(cond?.title || '').trim(),
      String(cond?.name || '').trim(),
      `Condition ${idx + 1}`,
      `CQI Condition ${idx + 1}`,
    ]
      .filter(Boolean)
      .flatMap((value) => {
        const lower = value.toLowerCase();
        const suffixMatch = value.match(/(\d+)$/);
        const aliases = [lower];
        if (suffixMatch) {
          const idx = suffixMatch[1];
          aliases.push(`condition ${idx}`.toLowerCase());
          aliases.push(`cqi condition ${idx}`.toLowerCase());
        }
        return aliases;
      });

    keys.forEach((key) => {
      if (key) cqiConditionByTitle.set(key, cond);
    });
  });

  const selectedCqiExamWeightByCo = useMemo(() => {
    const out: Record<number, number> = {};
    coNumbers.forEach((coNum) => {
      out[coNum] = 0;
    });
    const selectedExamCodes = new Set(
      Array.isArray(cqiConfig?.exams)
        ? cqiConfig.exams.map((code) => normalizeExamCode(String(code || ''))).filter(Boolean)
        : [],
    );

    exams.forEach((ex) => {
      if (String(ex.kind || 'exam').toLowerCase() === 'cqi') return;
      const examCode = normalizeExamCode(ex.short_name || ex.name || '');
      if (selectedExamCodes.size > 0 && !selectedExamCodes.has(examCode)) return;

      const coveredCos = ex.covered_cos && ex.covered_cos.length > 0
        ? ex.covered_cos
        : Object.keys(ex.co_weights || {}).map((k) => Number(k)).filter((n) => Number.isFinite(n));

      for (const coNum of coveredCos) {
        if (!coNum || !coNumbers.includes(coNum)) continue;
        const weight = Number(ex.co_weights?.[String(coNum)] ?? (ex.co_weights as any)?.[coNum] ?? 0) || 0;
        if (weight > 0) out[coNum] = round2((out[coNum] || 0) + weight);
      }
    });

    return out;
  }, [cqiConfig?.exams, coNumbers, exams]);

  const defaultCqiCapPercent = useMemo(() => {
    const firstCap = cqiConditions.find((cond) => cond?.cap_enabled);
    const pct = Number(firstCap?.cap_percent ?? 58);
    return Number.isFinite(pct) && pct > 0 ? pct : 58;
  }, [cqiConditions]);

  const cqiCapByCo = useMemo(() => {
    const out: Record<number, number> = {};
    coNumbers.forEach((coNum) => {
      const weight = selectedCqiExamWeightByCo[coNum] || 0;
      out[coNum] = weight > 0 ? round2((weight * defaultCqiCapPercent) / 100) : 0;
    });
    return out;
  }, [coNumbers, defaultCqiCapPercent, selectedCqiExamWeightByCo]);

  // Build column groups for the table
  type ColDef = { key: string; label: string; sub: string; examIdx: number; co: number; weightNotSet?: boolean; isExamSplit?: boolean; isCombo?: boolean; comboKey?: string };
  const cols: ColDef[] = [];
  exams.forEach((ex, ei) => {
    // Show only configured COs for this exam (covered_cos), not all COs
    const examCos = ex.covered_cos && ex.covered_cos.length > 0
      ? ex.covered_cos
      : coNumbers;
    for (const co of examCos) {
      const coMax = ex.co_max_map?.[String(co)] ?? ex.max_per_co;
      if (view === 'raw') {
        cols.push({ key: `${ex.id}_co${co}`, label: `CO${co}`, sub: `/${coMax}`, examIdx: ei, co });
      } else {
        const isCqi = String(ex.kind || 'exam').toLowerCase() === 'cqi';
        const w = (ex.co_weights?.[String(co)] ?? (ex.co_weights as any)?.[co] ?? ex.weight_per_co ?? 0) as number;
        const notSet = !isCqi && (!w || w <= 0);
        const cqiCap = isCqi && hasCqiCap ? (cqiCapByCo[co] || 0) : 0;
        const sub = isCqi ? (hasCqiCap && cqiCap > 0 ? `cap: ${cqiCap}` : 'CQI') : (notSet ? 'wt: NOT SET (Admin)' : `wt: ${w}`);
        cols.push({ key: `${ex.id}_CO${co}`, label: `CO${co}`, sub, examIdx: ei, co, weightNotSet: notSet });
      }
    }

    // Combo question columns (raw only)
    if (view === 'raw' && Array.isArray(ex.combo_questions) && ex.combo_questions.length > 0) {
      ex.combo_questions.forEach((cq) => {
        const coLabel = (cq.co_list || []).map((c) => `CO${c}`).join(' & ');
        cols.push({
          key: `${ex.id}_${cq.key}`,
          label: coLabel || 'CO Combo',
          sub: `/${cq.max_marks || 0}`,
          examIdx: ei,
          co: -2,
          isCombo: true,
          comboKey: cq.key,
        });
      });
    }

    // If Mark Manager Exam component is enabled, show per-CO split columns (one per configured COs).
    if (ex.cia_enabled) {
      const ciaCos = ex.covered_cos && ex.covered_cos.length > 0
        ? ex.covered_cos
        : coNumbers;
      const n = ciaCos.length || 1;
      const perCo = !!ex.cia_weight_per_co; // "Same for each CO" checkbox in admin
      for (const co of ciaCos) {
        const ciaNotSet = view === 'weighted' && !((ex.cia_weight || 0) > 0 && (ex.exam_max_marks || 0) > 0);
        // When perCo is true, each CO gets the full exam weight (no division)
        const effectiveW = ex.cia_weight
          ? (perCo ? ex.cia_weight : Math.round((ex.cia_weight / n) * 100) / 100)
          : 0;
        const maxSplit = ex.exam_max_marks ? Math.round((ex.exam_max_marks / n) * 100) / 100 : 0;
        const sub = view === 'weighted'
          ? (effectiveW > 0
              ? (perCo ? `E× wt:${effectiveW}` : `E wt:${effectiveW}`)
              : 'E wt:NOT SET')
          : `E /${maxSplit || '?'}`;
        cols.push({ key: `${ex.id}_exam_CO${co}`, label: `CO${co}`, sub, examIdx: ei, co, isExamSplit: true, weightNotSet: ciaNotSet });
      }
    }

    if (view === 'raw') {
      cols.push({ key: `${ex.id}_total`, label: 'Total', sub: `/${ex.max_marks}`, examIdx: ei, co: 0 });
    }
  });

  // Group columns by exam for header row spanning
  type ExamGroup = { exam: COExam; colCount: number };
  const examGroups: ExamGroup[] = [];
  exams.forEach((ex) => {
    // Calculate colCount using configured COs only (covered_cos)
    const examCos2 = ex.covered_cos && ex.covered_cos.length > 0
      ? ex.covered_cos
      : coNumbers;
    const comboCount = view === 'raw' && Array.isArray(ex.combo_questions) ? ex.combo_questions.length : 0;
    const count = examCos2.length + (ex.cia_enabled ? examCos2.length : 0) + comboCount + (view === 'raw' ? 1 : 0);
    examGroups.push({ exam: ex, colCount: count });
  });

  const getStudentCqiCapPercent = (student: COStudent): number | null => {
    const titles = Array.isArray(student.cqi_satisfied_conditions) ? student.cqi_satisfied_conditions : [];
    for (const title of titles) {
      const cond = cqiConditionByTitle.get(String(title || '').trim().toLowerCase());
      if (cond?.cap_enabled) {
        const pct = Number(cond.cap_percent ?? defaultCqiCapPercent);
        return Number.isFinite(pct) && pct > 0 ? pct : defaultCqiCapPercent;
      }
    }
    return null;
  };

  const getStudentCqiCapForCo = (student: COStudent, coNum: number): number | null => {
    const pct = getStudentCqiCapPercent(student);
    if (pct == null) return null;
    const weightSum = selectedCqiExamWeightByCo[coNum] ?? 0;
    if (!(weightSum > 0)) return null;
    return round2((weightSum * pct) / 100);
  };

  const getDisplayedStudentCoTotals = (student: COStudent): number[] => {
    const totals = [...student.co_totals];
    const cqiExams = exams.filter((ex) => String(ex.kind || 'exam').toLowerCase() === 'cqi');

    for (const ex of cqiExams) {
      const coveredCos = ex.covered_cos && ex.covered_cos.length > 0
        ? ex.covered_cos
        : coNumbers;
      for (const coNum of coveredCos) {
        const idx = coNumbers.indexOf(coNum);
        if (idx < 0) continue;
        const key = `${ex.id}_CO${coNum}`;
        const raw = Number(student.weighted_marks[key] ?? 0) || 0;
        const cap = getStudentCqiCapForCo(student, coNum);
        const display = cap != null && raw > cap ? cap : raw;
        const current = Number(totals[idx] ?? 0) || 0;
        totals[idx] = round2(current - raw + display);
      }
    }

    return totals.map((v) => round2(v));
  };

  const getDisplayedFinalMark = (student: COStudent): number => {
    return round2(getDisplayedStudentCoTotals(student).reduce((sum, value) => sum + value, 0));
  };

  const getCellValue = (s: COStudent, col: ColDef): string | number => {
    if (view === 'raw') {
      if (col.co === 0) {
        // Total column
        const em = s.exam_marks[exams[col.examIdx].id];
        return em ? (em.total as number) ?? '' : '';
      }
      if (col.isExamSplit) {
        // Exam split column (raw) - divide total exam mark equally across covered COs
        const ex = exams[col.examIdx];
        const em = s.exam_marks[ex.id];
        if (!em || em.exam === undefined) return '';
        const n = ex.covered_cos.length || 1;
        const raw = (em.exam as number) ?? 0;
        return Math.round((raw / n) * 100) / 100;
      }
      if (col.isCombo && col.comboKey) {
        const ex = exams[col.examIdx];
        const em = s.exam_marks[ex.id];
        return em ? (em[col.comboKey] as number) ?? '' : '';
      }
      // CO column
      const em = s.exam_marks[exams[col.examIdx].id];
      return em ? (em[`co${col.co}`] as number) ?? '' : '';
    }
    // Weighted
    if (col.isExamSplit) {
      // Exam split column (weighted) - fetched from backend weighted_marks
      return s.weighted_marks[col.key] ?? '';
    }
    const weightedVal = s.weighted_marks[col.key] ?? '';
    const isCqiCol = String(exams[col.examIdx].kind || 'exam').toLowerCase() === 'cqi';
    if (isCqiCol && col.co > 0 && typeof weightedVal === 'number') {
      const cap = getStudentCqiCapForCo(s, col.co);
      if (cap != null && weightedVal > cap) return cap;
    }
    return weightedVal;
  };

  // Compute per-column averages (exclude absent students, skip empty/zero values)
  const colAverages: (number | null)[] = cols.map(col => {
    const vals: number[] = [];
    students.forEach(s => {
      const examId = exams[col.examIdx].id;
      if (s.exam_marks[examId]?.is_absent) return;
      const v = getCellValue(s, col);
      if (typeof v === 'number' && v > 0) vals.push(v);
    });
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  });

  const coTotalAverages: (number | null)[] = view === 'weighted'
    ? coNumbers.map((_, i) => {
        const vals = students.map((s) => getDisplayedStudentCoTotals(s)[i]).filter(v => typeof v === 'number' && v > 0) as number[];
        if (!vals.length) return null;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      })
    : [];

  const finalAverage: number | null = view === 'weighted'
    ? (() => {
        const vals = students.map((s) => getDisplayedFinalMark(s)).filter(v => typeof v === 'number' && v > 0) as number[];
        if (!vals.length) return null;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      })()
    : null;

  if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!courseOutcomeLoading && coNumbers.length === 0) {
    return (
      <div className="p-8 text-center rounded-lg border border-red-200 bg-red-50 text-red-700">
        No Course Outcomes are configured by admin. Please add Course Outcomes in Exam Management, Course Outcome tab.
      </div>
    );
  }
  if (!data) return <div className="p-8 text-center text-gray-400">No data. Click refresh to load.</div>;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border rounded-lg overflow-hidden text-sm">
          <button onClick={() => onChangeView('raw')}
            className={`px-4 py-1.5 ${view === 'raw' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
            Raw Marks
          </button>
          <button onClick={() => onChangeView('weighted')}
            className={`px-4 py-1.5 ${view === 'weighted' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
            Weighted Marks
          </button>
        </div>
        
        {/* Decimal Places Selector */}
        <div className="flex border rounded-lg overflow-hidden text-sm">
          <button
            onClick={() => setDecimalPlaces(1)}
            className={`px-4 py-1.5 flex items-center gap-1.5 ${decimalPlaces === 1 ? 'bg-orange-600 text-white' : 'hover:bg-gray-50'}`}
            title="Fix decimal places to 1 (e.g., 1.2, 5.3)"
          >
            Fix 1
          </button>
          <button
            onClick={() => setDecimalPlaces(2)}
            className={`px-4 py-1.5 flex items-center gap-1.5 ${decimalPlaces === 2 ? 'bg-orange-600 text-white' : 'hover:bg-gray-50'}`}
            title="Fix decimal places to 2 (e.g., 1.23, 5.34)"
          >
            Fix 2
          </button>
        </div>

        <button onClick={() => setShowExportModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" /> Export
        </button>

        {/* Export format modal */}
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-80">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Export CO Summary</h3>
              <p className="text-sm text-gray-500 mb-5">Choose export format for <span className="font-medium">{view === 'weighted' ? 'Weighted' : 'Raw'} Marks</span></p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleExportExcel}
                  disabled={!!exporting}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-green-300 rounded-xl hover:bg-green-50 disabled:opacity-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-green-700 font-bold text-sm">XLS</span>
                  </div>
                  <span className="text-sm font-semibold text-green-800">
                    {exporting === 'excel' ? 'Exporting…' : 'Excel'}
                  </span>
                  <span className="text-[11px] text-gray-400 text-center">Styled with colours &amp; headers</span>
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={!!exporting}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-red-300 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <span className="text-red-700 font-bold text-sm">PDF</span>
                  </div>
                  <span className="text-sm font-semibold text-red-800">
                    {exporting === 'pdf' ? 'Generating…' : 'PDF'}
                  </span>
                  <span className="text-[11px] text-gray-400 text-center">Banner, details &amp; styled table</span>
                </button>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        
        {/* Copy & Selection Controls */}
        {selectedCells.size > 0 && (
          <div className="flex items-center gap-2 ml-2 pl-2 border-l">
            <span className="text-xs text-gray-600">{selectedCells.size} cell{selectedCells.size !== 1 ? 's' : ''} selected</span>
            <button
              onClick={() => {
                const cellArray = Array.from(selectedCellsRef.current).map(key => {
                  const [row, col] = key.split('-').map(Number);
                  return { row, col };
                });
                const minRow = Math.min(...cellArray.map(c => c.row));
                const maxRow = Math.max(...cellArray.map(c => c.row));
                const minCol = Math.min(...cellArray.map(c => c.col));
                const maxCol = Math.max(...cellArray.map(c => c.col));
                const cellMap = new Map(cellArray.map(c => [`${c.row}-${c.col}`, true]));
                const rows: string[][] = [];
                for (let r = minRow; r <= maxRow; r++) {
                  const rowData: string[] = [];
                  for (let c = minCol; c <= maxCol; c++) {
                    if (cellMap.has(`${r}-${c}`)) {
                      const text = tableRef.current?.querySelector(`[data-cell="${r}-${c}"]`)?.textContent || '';
                      rowData.push(text.trim());
                    } else {
                      rowData.push('');
                    }
                  }
                  rows.push(rowData);
                }
                const tsvText = rows.map(row => row.join('\t')).join('\n');
                navigator.clipboard.writeText(tsvText).then(() => {
                  setSelectedCells(new Set());
                  selectedCellsRef.current = new Set();
                });
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              title="Copy selected cells (Ctrl+C)"
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
            <button
              onClick={() => {
                setSelectedCells(new Set());
                selectedCellsRef.current = new Set();
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs border rounded hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        )}
        {view === 'weighted' && (
          <span className="text-xs text-gray-400 ml-2">
            Weighted = (Raw / Max) &times; Weight
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        {view === 'weighted' && hasCqiCap && (
          <div className="px-4 py-2 border-b bg-amber-50 text-xs text-amber-800 flex flex-wrap items-center gap-2">
            <span className="font-semibold">CQI cap active</span>
            <span className="text-amber-600">Cells where the CQI cap limit was reached are highlighted in red. Cap applies only to students who satisfy the cap condition.</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table ref={tableRef} className="min-w-full text-sm divide-y divide-gray-200">
            {/* Header row 1: exam names spanning columns */}
            <thead>
              <tr className="bg-gray-100">
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-100 z-10 w-10">#</th>
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-10 bg-gray-100 z-10 min-w-[100px]">Reg No</th>
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-[140px]">Name</th>
                {examGroups.map(({ exam, colCount }) => (
                  <th
                    key={exam.id}
                    colSpan={colCount}
                    className={`px-2 py-2 text-center text-xs font-semibold border-l ${String(exam.kind || 'exam').toLowerCase() === 'cqi' ? 'bg-purple-50 text-purple-800 border-purple-200' : 'text-gray-700 border-gray-300'}`}
                  >
                    {exam.name}
                    <div className="text-[10px] text-gray-400 font-normal flex items-center justify-center gap-1 flex-wrap">
                      <span>Max: {exam.max_marks}</span>
                      <span>&middot;</span>
                      {String(exam.kind || 'exam').toLowerCase() === 'cqi' ? (
                        <span className="bg-purple-100 text-purple-800 px-1 rounded">CQI</span>
                      ) : exam.co_weights && Object.keys(exam.co_weights).length > 0 ? (
                        exam.covered_cos.map(co => {
                          const wVal = Number(exam.co_weights[String(co)] ?? 0);
                          return wVal > 0 ? (
                            <span key={co} className="bg-blue-50 text-blue-700 px-1 rounded">
                              CO{co}:{wVal}
                            </span>
                          ) : (
                            <span key={co} className="bg-red-50 text-red-500 px-1 rounded font-medium">
                              CO{co}:NOT SET
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-red-500 font-medium">
                          Wt: NOT SET (Admin)
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                {view === 'weighted' && (
                  <>
                    {coNumbers.map((coNum) => (
                      <th key={`co-total-h-${coNum}`} rowSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-indigo-700 border-l border-indigo-200 bg-indigo-50 min-w-[60px]">
                        CO{coNum}<br />Total
                      </th>
                    ))}
                    <th rowSpan={2} className="px-3 py-2 text-center text-xs font-bold text-gray-900 border-l border-gray-300 bg-green-50 min-w-[70px]">
                      Final<br />/{computedTotalWeight}
                    </th>
                    <th rowSpan={2} className="px-3 py-2 text-center text-xs font-bold text-purple-900 border-l border-purple-300 bg-purple-50 min-w-[70px]">
                      Total<br />/100
                    </th>
                  </>
                )}
              </tr>
              {/* Header row 2: CO sub-columns */}
              <tr className="bg-gray-50">
                {cols.map((col, ci) => (
                  <th
                    key={ci}
                    className={`px-2 py-1.5 text-center text-[11px] font-medium ${col.isExamSplit || col.isCombo || String(exams[col.examIdx].kind || 'exam').toLowerCase() === 'cqi' ? 'bg-purple-50 text-purple-700' : 'text-gray-500'} ${col.co === 0 ? 'bg-gray-100 font-semibold' : ''} ${ci === 0 || exams[col.examIdx].id !== exams[cols[ci - 1]?.examIdx]?.id ? 'border-l border-gray-300' : ''}`}
                  >
                    {col.label}
                    <div className={`text-[10px] font-normal ${col.weightNotSet ? 'text-red-500 font-medium' : (col.isExamSplit || col.isCombo) ? 'text-purple-400' : 'text-gray-400'}`}>{col.sub}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.length === 0 ? (
                <tr><td colSpan={3 + cols.length + (view === 'weighted' ? co_count + 2 : 0)} className="px-4 py-8 text-center text-gray-400">No students or marks found</td></tr>
              ) : (
                <>
                  {students.map((s, si) => {
                    const isAbsentAny = Object.values(s.exam_marks).some(em => em.is_absent);
                    const displayCoTotals = view === 'weighted' ? getDisplayedStudentCoTotals(s) : s.co_totals;
                    const displayFinalMark = view === 'weighted' ? getDisplayedFinalMark(s) : s.final_mark;
                    let cellIndex = 3; // Start after row number, reg no, name
                    return (
                      <tr key={si} className={`${isAbsentAny ? 'bg-yellow-50/40' : ''} hover:bg-blue-50/30`}>
                        <td className="px-3 py-1.5 text-gray-400 sticky left-0 bg-white z-10">{si + 1}</td>
                        <td className="px-3 py-1.5 font-mono text-xs sticky left-10 bg-white z-10">{s.reg_no}</td>
                        <td className="px-3 py-1.5 truncate max-w-[160px]">{s.name}</td>
                        {cols.map((col, ci) => {
                          const val = getCellValue(s, col);
                          const examId = exams[col.examIdx].id;
                          const absent = s.exam_marks[examId]?.is_absent;
                          const displayVal = typeof val === 'number' ? formatNumber(val) : (val === '' ? null : val);
                          const cellKey = getCellKey(si, cellIndex);
                          const isSelected = selectedCells.has(cellKey);
                          const isCqiCol = String(exams[col.examIdx].kind || 'exam').toLowerCase() === 'cqi';
                          const capValue = view === 'weighted' && isCqiCol && col.co > 0 ? getStudentCqiCapForCo(s, col.co) : null;
                          // Use the authoritative cqi_capped_cos flag from the backend (the frontend
                          // weight comparison is unreliable because the backend cap is on the *addition*
                          // only, not the full CO weight sum).
                          const isCqiCapHit = view === 'weighted' && isCqiCol && col.co > 0 &&
                            Array.isArray(s.cqi_capped_cos) && s.cqi_capped_cos.includes(col.co);
                          cellIndex++;
                          return (
                            <td
                              key={ci}
                              data-cell={cellKey}
                              onMouseDown={(e) => handleCellMouseDown(si, cellIndex - 1, e)}
                              onMouseEnter={() => handleCellMouseEnter(si, cellIndex - 1)}
                              className={`px-2 py-1.5 text-center tabular-nums cursor-cell select-none transition-colors ${isSelected ? 'bg-blue-200' : ''} ${col.co === 0 ? 'font-semibold bg-gray-50/60' : ''} ${isCqiCapHit ? 'bg-red-100 text-red-900 ring-1 ring-red-300' : (col.isExamSplit || col.isCombo || isCqiCol ? 'bg-purple-50/50 text-purple-700' : '')} ${ci === 0 || exams[col.examIdx].id !== exams[cols[ci - 1]?.examIdx]?.id ? 'border-l border-gray-200' : ''} ${absent ? 'text-red-400 italic' : ''}`}
                              title={isCqiCapHit && capValue != null ? `CQI cap: ${formatNumber(capValue)}` : undefined}
                            >
                              {absent ? 'AB' : displayVal === null ? <span className="text-gray-300">-</span> : displayVal}
                            </td>
                          );
                        })}
                        {view === 'weighted' && (
                          <>
                            {displayCoTotals.map((ct, ci) => {
                              const cellKey = getCellKey(si, cellIndex);
                              const isSelected = selectedCells.has(cellKey);
                              const coNum = coNumbers[ci] ?? (ci + 1);
                              // Red if the backend flagged this CO as capped for this student.
                              const isCoTotalCapped = view === 'weighted' &&
                                Array.isArray(s.cqi_capped_cos) && s.cqi_capped_cos.includes(coNum);
                              cellIndex++;
                              return (
                                <td
                                  key={`co-${ci}`}
                                  data-cell={cellKey}
                                  onMouseDown={(e) => handleCellMouseDown(si, cellIndex - 1, e)}
                                  onMouseEnter={() => handleCellMouseEnter(si, cellIndex - 1)}
                                  className={`px-2 py-1.5 text-center font-semibold border-l border-indigo-100 tabular-nums cursor-cell select-none transition-colors ${
                                    isSelected ? 'bg-blue-200' :
                                    isCoTotalCapped ? 'bg-red-100 text-red-900 ring-1 ring-red-300' :
                                    'text-indigo-700 bg-indigo-50/40'
                                  }`}
                                  title={isCoTotalCapped ? 'CO total includes a capped CQI value' : undefined}
                                >
                                  {ct > 0 ? formatNumber(ct) : <span className="text-gray-300">-</span>}
                                </td>
                              );
                            })}
                            <td
                              data-cell={getCellKey(si, cellIndex)}
                              onMouseDown={(e) => handleCellMouseDown(si, cellIndex, e)}
                              onMouseEnter={() => handleCellMouseEnter(si, cellIndex)}
                              className={`px-3 py-1.5 text-center font-bold border-l border-gray-200 bg-green-50/40 tabular-nums cursor-cell select-none transition-colors ${selectedCells.has(getCellKey(si, cellIndex)) ? 'bg-blue-200' : ''}`}
                            >
                              {displayFinalMark > 0 ? formatNumber(displayFinalMark) : <span className="text-gray-300">-</span>}
                            </td>
                            <td
                              data-cell={getCellKey(si, cellIndex + 1)}
                              onMouseDown={(e) => handleCellMouseDown(si, cellIndex + 1, e)}
                              onMouseEnter={() => handleCellMouseEnter(si, cellIndex + 1)}
                              className={`px-3 py-1.5 text-center font-bold border-l border-purple-200 bg-purple-50/40 tabular-nums text-purple-700 cursor-cell select-none transition-colors ${selectedCells.has(getCellKey(si, cellIndex + 1)) ? 'bg-blue-200' : ''}`}
                            >
                              {displayFinalMark > 0 ? formatNumber((displayFinalMark / computedTotalWeight) * 100) : <span className="text-gray-300">-</span>}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {/* Average row */}
                  <tr className="bg-amber-50 border-t-2 border-amber-200 font-semibold">
                    <td className="px-3 py-2 text-amber-700 text-xs sticky left-0 bg-amber-50 z-10" colSpan={2}>Avg</td>
                    <td className="px-3 py-2 text-amber-700 text-xs sticky left-10 bg-amber-50 z-10">Class Average</td>
                    {colAverages.map((avg, ci) => {
                      const displayAvg = avg !== null ? formatNumber(avg) : null;
                      const cellKey = getCellKey(students.length, 3 + ci);
                      const isSelected = selectedCells.has(cellKey);
                      return (
                        <td
                          key={ci}
                          data-cell={cellKey}
                          onMouseDown={(e) => handleCellMouseDown(students.length, 3 + ci, e)}
                          onMouseEnter={() => handleCellMouseEnter(students.length, 3 + ci)}
                          className={`px-2 py-2 text-center tabular-nums text-amber-800 text-xs select-none transition-colors ${isSelected ? 'bg-blue-200' : ''} ${cols[ci].co === 0 ? 'bg-amber-100' : ''} ${cols[ci].isExamSplit || cols[ci].isCombo ? 'bg-purple-100 text-purple-800' : ''} ${ci === 0 || exams[cols[ci].examIdx].id !== exams[cols[ci - 1]?.examIdx]?.id ? 'border-l border-amber-200' : ''}`}
                        >
                          {displayAvg != null ? displayAvg : <span className="text-gray-300">-</span>}
                        </td>
                      );
                    })}
                    {view === 'weighted' && (
                      <>
                        {coTotalAverages.map((avg, ci) => {
                          const displayAvg = avg !== null ? formatNumber(avg) : null;
                          const cellKey = getCellKey(students.length, 3 + cols.length + ci);
                          const isSelected = selectedCells.has(cellKey);
                          return (
                            <td
                              key={`co-avg-${ci}`}
                              data-cell={cellKey}
                              onMouseDown={(e) => handleCellMouseDown(students.length, 3 + cols.length + ci, e)}
                              onMouseEnter={() => handleCellMouseEnter(students.length, 3 + cols.length + ci)}
                              className={`px-2 py-2 text-center tabular-nums text-indigo-700 border-l border-indigo-100 bg-indigo-50 text-xs font-bold select-none transition-colors ${isSelected ? 'bg-blue-200' : ''}`}
                            >
                              {displayAvg != null ? displayAvg : <span className="text-gray-300">-</span>}
                            </td>
                          );
                        })}
                        <td
                          data-cell={getCellKey(students.length, 3 + cols.length + co_count)}
                          onMouseDown={(e) => handleCellMouseDown(students.length, 3 + cols.length + co_count, e)}
                          onMouseEnter={() => handleCellMouseEnter(students.length, 3 + cols.length + co_count)}
                          className={`px-3 py-2 text-center tabular-nums font-bold border-l border-gray-300 bg-green-100 text-green-800 text-xs select-none transition-colors ${selectedCells.has(getCellKey(students.length, 3 + cols.length + co_count)) ? 'bg-blue-200' : ''}`}
                        >
                          {finalAverage != null ? formatNumber(finalAverage) : <span className="text-gray-300">-</span>}
                        </td>
                        <td
                          data-cell={getCellKey(students.length, 3 + cols.length + co_count + 1)}
                          onMouseDown={(e) => handleCellMouseDown(students.length, 3 + cols.length + co_count + 1, e)}
                          onMouseEnter={() => handleCellMouseEnter(students.length, 3 + cols.length + co_count + 1)}
                          className={`px-3 py-2 text-center tabular-nums font-bold border-l border-purple-300 bg-purple-100 text-purple-800 text-xs select-none transition-colors ${selectedCells.has(getCellKey(students.length, 3 + cols.length + co_count + 1)) ? 'bg-blue-200' : ''}`}
                        >
                          {finalAverage != null ? formatNumber((finalAverage / computedTotalWeight) * 100) : <span className="text-gray-300">-</span>}
                        </td>
                      </>
                    )}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
