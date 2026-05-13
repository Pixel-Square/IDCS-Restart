/**
 * Internal Mark Page
 * Overview of internal mark components + CO-wise summary for a course.
 * Two tabs: Exam Assignments | CO Summary (raw & weighted marks)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Users, CheckCircle, Clock, AlertCircle,
  Edit2, Eye, Lock, RefreshCw, FileText, Download, BarChart3, AlertTriangle,
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

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
  cycle_locked?: boolean;
  lock_reason?: string | null;
  cycle_name?: string | null;
  cycle_code?: string | null;
  can_view?: boolean;
  can_edit?: boolean;
  due_date: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'LOCKED';
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
  kind?: 'exam' | 'cqi';
  cqi_cos?: number[];
  cqi_name?: string;
  cia_enabled?: boolean;
  cia_weight?: number;
  exam_max_marks?: number;
  covered_cos: number[];
  weight_per_co: number;
  max_per_co: number;
  co_max_map: Record<string, number>;
  combo_questions?: Array<{ key: string; co_list: number[]; max_marks: number }>;
  status: string;
}

interface COStudent {
  reg_no: string;
  name: string;
  exam_marks: Record<string, Record<string, number | boolean>>;
  weighted_marks: Record<string, number>;
  co_totals: number[];
  final_mark: number;
}

interface COSummary {
  course_code: string;
  course_name: string;
  co_count: number;
  total_internal_marks: number;
  exams: COExam[];
  students: COStudent[];
}

/* ─── component ─── */

export default function InternalMarkPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const powerBiEmbedUrl = (import.meta.env as any).VITE_POWERBI_EMBED_URL as string | undefined;

  const [loading, setLoading] = useState(true);
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'dashboard' | 'exams' | 'co'>('dashboard');

  // CO summary
  const [coLoading, setCoLoading] = useState(false);
  const [coSummary, setCoSummary] = useState<COSummary | null>(null);
  const [coView, setCoView] = useState<'raw' | 'weighted'>('raw');

  useEffect(() => { loadData(); }, [courseId]);

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
    const orderKeys = courseInfo.exams.map((e) => String(e.short_name || e.name || '').trim());
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
  }, [coSummary, courseInfo]);

  const resolvedPowerBiEmbedUrl = useMemo(() => {
    if (!powerBiEmbedUrl || !courseInfo) return '';

    const replacements: Record<string, string> = {
      course_id: String(courseInfo.id || ''),
      course_code: String(courseInfo.course_code || ''),
      course_name: String(courseInfo.course_name || ''),
      section: String(courseInfo.section || ''),
      semester: String(courseInfo.semester ?? ''),
      sem: String(courseInfo.semester ?? ''),
      qp_type: String(courseInfo.qp_type || ''),
      class_type: String(courseInfo.class_type?.name || ''),
      department: String(courseInfo.department || ''),
    };

    let nextUrl = powerBiEmbedUrl;
    for (const [key, value] of Object.entries(replacements)) {
      nextUrl = nextUrl.replaceAll(`{${key}}`, encodeURIComponent(value));
    }

    try {
      const url = new URL(nextUrl);
      url.searchParams.set('course_code', replacements.course_code);
      url.searchParams.set('section', replacements.section);
      url.searchParams.set('sem', replacements.sem);
      if (replacements.qp_type) url.searchParams.set('qp_type', replacements.qp_type);
      return url.toString();
    } catch {
      return nextUrl;
    }
  }, [powerBiEmbedUrl, courseInfo]);

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

  const exportCOSummaryCSV = () => {
    if (!orderedCoSummary) return;
    const { exams, students, co_count } = orderedCoSummary;
    const isW = coView === 'weighted';

    // Build headers
    const headers: string[] = ['#', 'Reg No', 'Name'];
    for (const ex of exams) {
      if (isW) {
        for (const co of ex.covered_cos) {
          if (ex.kind === 'cqi') headers.push(`${ex.short_name}_CO${co}`);
          else {
            const w = (ex.co_weights?.[String(co)] ?? (ex.co_weights as any)?.[co] ?? ex.weight_per_co ?? 0) as number;
            headers.push(`${ex.short_name}_CO${co} (wt:${w && w > 0 ? w : 'NOT_SET'})`);
          }
        }
        if (ex.cia_enabled) {
          const n = ex.covered_cos.length || 1;
          for (const co of ex.covered_cos) {
            const wSplit = ex.cia_weight ? Math.round((ex.cia_weight / n) * 100) / 100 : 0;
            const maxSplit = ex.exam_max_marks ? Math.round((ex.exam_max_marks / n) * 100) / 100 : 0;
            headers.push(`${ex.short_name} Exam-CO${co} (wt:${wSplit > 0 ? wSplit : 'NOT_SET'} /${maxSplit})`);
          }
        }
      } else {
        for (const co of ex.covered_cos) headers.push(ex.kind === 'cqi' ? `${ex.short_name} CO${co}` : `${ex.short_name} CO${co} (/${ex.max_per_co})`);
        if (ex.cia_enabled) {
          const n = ex.covered_cos.length || 1;
          for (const co of ex.covered_cos) {
            const maxSplit = ex.exam_max_marks ? Math.round((ex.exam_max_marks / n) * 100) / 100 : 0;
            headers.push(`${ex.short_name} Exam-CO${co} (split /${maxSplit})`);
          }
        }
        headers.push(`${ex.short_name} Total (/${ex.max_marks})`);
      }
    }
    if (isW) {
      for (let c = 1; c <= co_count; c++) headers.push(`CO${c} Total`);
      headers.push(`Final (/${coSummary.total_internal_marks})`);
    }

    const rows = students.map((s, i) => {
      const row: (string | number)[] = [i + 1, s.reg_no, s.name];
      for (const ex of exams) {
        const em = s.exam_marks[ex.id] || {};
        if (isW) {
          for (const co of ex.covered_cos) {
            row.push(s.weighted_marks[`${ex.id}_CO${co}`] ?? '');
          }
          if (ex.cia_enabled) {
            for (const co of ex.covered_cos) {
              row.push(s.weighted_marks[`${ex.id}_exam_CO${co}`] ?? '');
            }
          }
        } else {
          for (const co of ex.covered_cos) {
            const v = (em as any)[`co${co}`];
            row.push(typeof v === 'number' ? v : '');
          }
          if (ex.cia_enabled) {
            const n = ex.covered_cos.length || 1;
            const rawExam = (em.exam as number) ?? 0;
            for (const co of ex.covered_cos) row.push(Math.round((rawExam / n) * 100) / 100);
          }
          row.push(typeof (em as any).total === 'number' ? ((em as any).total as number) : '');
        }
      }
      if (isW) {
        for (let c = 0; c < co_count; c++) row.push(s.co_totals[c]);
        row.push(s.final_mark);
      }
      return row;
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${coSummary.course_code}_co_summary_${coView}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─── status helpers ─── */
  const getStatusBadge = (status: string, exam: ExamMark) => {
    if (exam.cycle_locked) {
      return <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-sm"><Lock className="w-3 h-3" />Locked</span>;
    }
    if ((exam.can_view && !exam.can_edit) || (exam.is_locked && status === 'COMPLETED')) {
      return <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded text-sm"><Eye className="w-3 h-3" />View Only</span>;
    }
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

  const totalEntered = courseInfo.exams.reduce((sum, e) => sum + (e.status === 'COMPLETED' ? 1 : 0), 0);
  const totalExams = courseInfo.exams.length;
  const openExam = (exam: ExamMark) => {
    const canEdit = exam.can_edit ?? (!exam.is_locked && !exam.cycle_locked);
    const canView = exam.can_view ?? false;
    if (!canEdit && !canView) return;
    if (exam.kind === 'cqi') {
      navigate(`/academic-v2/course/${courseId}/cqi`);
      return;
    }
    navigate(`/academic-v2/exam/${exam.id}`);
  };

  /* ─── render ─── */
  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
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
            onClick={() => navigate(`/academic-v2/course/${courseId}/cqi`)}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
          >
            <BarChart3 className="w-4 h-4" /> CQI Entry
          </button>
          <button onClick={exportReport} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">
            <Download className="w-4 h-4" /> Export Report
          </button>
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
      {(!courseInfo.setup_status.class_type_assigned || (!courseInfo.setup_status.qp_type_assigned && !courseInfo.qp_type)) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 text-sm">Exam setup incomplete</p>
            <ul className="mt-1 space-y-0.5 text-sm text-amber-700 list-disc list-inside">
              {!courseInfo.setup_status.class_type_assigned && (
                <li>Class type is not configured in Academic 2.1 — contact the administrator.</li>
              )}
              {(!courseInfo.setup_status.qp_type_assigned && !courseInfo.qp_type) && (
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
      </div>

      {/* ─── Tab: Dashboard ─── */}
      {tab === 'dashboard' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dashboard</h2>
            {courseInfo.qp_type && (
              <span className="text-xs font-semibold px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full">
                QP Type: {courseInfo.qp_type}
              </span>
            )}
          </div>
          <div className="p-4">
            {resolvedPowerBiEmbedUrl ? (
              <iframe
                title="Power BI Dashboard"
                src={resolvedPowerBiEmbedUrl}
                className="w-full h-[70vh] rounded border"
                allowFullScreen
              />
            ) : (
              <div className="p-8 text-center text-gray-500">
                Power BI dashboard is not configured.
                <div className="text-sm text-gray-400 mt-1">
                  Set VITE_POWERBI_EMBED_URL in .env.local. You can use placeholders like {'{course_code}'}, {'{section}'}, {'{sem}'}, and {'{qp_type}'}.
                </div>
              </div>
            )}
          </div>
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
            {((!courseInfo.setup_status.class_type_assigned) || (!courseInfo.setup_status.qp_type_assigned && !courseInfo.qp_type)) && courseInfo.exams.length === 0 ? (
              <div className="p-8 text-center text-amber-700">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                <p className="font-medium">Exam assignments are not available yet.</p>
                <p className="text-sm text-gray-500 mt-1">
                  {!courseInfo.setup_status.class_type_assigned
                    ? 'Class type needs to be configured.'
                    : 'QP type needs to be assigned to this course in the curriculum.'}
                </p>
              </div>
            ) : courseInfo.exams.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No exam components configured for QP type <strong>{courseInfo.qp_type}</strong></div>
            ) : courseInfo.exams.map((exam) => {
              const isCqi = exam.kind === 'cqi';
              const canEdit = exam.can_edit ?? (!exam.is_locked && !exam.cycle_locked);
              const canView = exam.can_view ?? false;
              const showAction = canEdit || canView;
              const actionLabel = canEdit ? (isCqi ? 'Enter CQI' : 'Enter Marks') : 'View';
              const actionIcon = canEdit ? Edit2 : Eye;
              const ActionIcon = actionIcon;
              const actionClasses = canEdit
                ? (isCqi ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700')
                : 'bg-slate-600 hover:bg-slate-700';
              return (
              <div
                key={exam.id}
                className={`p-4 ${showAction ? 'cursor-pointer' : 'cursor-default'} ${isCqi ? 'bg-purple-50 border-l-4 border-purple-400' : ''} ${showAction ? (isCqi ? 'hover:bg-purple-100' : 'hover:bg-gray-50') : ''}`}
                onClick={() => openExam(exam)}
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
                    {getStatusBadge(exam.status, exam)}
                    <div className="w-32">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Progress</span><span>{exam.entered_count}/{exam.total_students}</span>
                      </div>
                      {getProgressBar(exam.entered_count, exam.total_students)}
                    </div>
                    {showAction ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openExam(exam);
                        }}
                        title={exam.lock_reason || undefined}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-white ${actionClasses}`}
                      >
                        <ActionIcon className="w-4 h-4" /> {actionLabel}
                      </button>
                    ) : (
                      <span
                        title={exam.lock_reason || undefined}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700"
                      >
                        <Lock className="w-4 h-4" /> Locked
                      </span>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Tab: CO Summary ─── */}
      {tab === 'co' && (
        <COSummaryTab
          loading={coLoading}
          data={orderedCoSummary}
          view={coView}
          onChangeView={setCoView}
          onRefresh={loadCOSummary}
          onExportCSV={exportCOSummaryCSV}
        />
      )}
    </div>
  );
}


/* ═══════════ CO Summary Tab Component ═══════════ */

function COSummaryTab({
  loading, data, view, onChangeView, onRefresh, onExportCSV,
}: {
  loading: boolean;
  data: COSummary | null;
  view: 'raw' | 'weighted';
  onChangeView: (v: 'raw' | 'weighted') => void;
  onRefresh: () => void;
  onExportCSV: () => void;
}) {
  if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!data) return <div className="p-8 text-center text-gray-400">No data. Click refresh to load.</div>;

  const { exams, students, co_count, total_internal_marks } = data;

  // Build column groups for the table
  type ColDef = { key: string; label: string; sub: string; examIdx: number; co: number; weightNotSet?: boolean; isExamSplit?: boolean; isCombo?: boolean; comboKey?: string; isCqi?: boolean };
  const cols: ColDef[] = [];
  exams.forEach((ex, ei) => {
    for (const co of ex.covered_cos) {
      const coMax = ex.co_max_map?.[String(co)] ?? ex.max_per_co;
      if (view === 'raw') {
        cols.push({ key: `${ex.id}_co${co}`, label: `CO${co}`, sub: ex.kind === 'cqi' ? '' : `/${coMax}`, examIdx: ei, co, isCqi: ex.kind === 'cqi' });
      } else {
        if (ex.kind === 'cqi') {
          cols.push({ key: `${ex.id}_CQI_CO${co}`, label: `CO${co}`, sub: '', examIdx: ei, co, isCqi: true });
        } else {
          const w = (ex.co_weights?.[String(co)] ?? (ex.co_weights as any)?.[co] ?? ex.weight_per_co ?? 0) as number;
          const notSet = !w || w <= 0;
          const sub = notSet ? 'wt: NOT SET (Admin)' : `wt: ${w}`;
          cols.push({ key: `${ex.id}_CO${co}`, label: `CO${co}`, sub, examIdx: ei, co, weightNotSet: notSet });
        }
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

    // If Mark Manager Exam component is enabled, show per-CO split columns (one per covered CO).
    if (ex.cia_enabled) {
      const n = ex.covered_cos.length || 1;
      for (const co of ex.covered_cos) {
        const ciaNotSet = view === 'weighted' && !((ex.cia_weight || 0) > 0 && (ex.exam_max_marks || 0) > 0);
        const wSplit = ex.cia_weight ? Math.round((ex.cia_weight / n) * 100) / 100 : 0;
        const maxSplit = ex.exam_max_marks ? Math.round((ex.exam_max_marks / n) * 100) / 100 : 0;
        const sub = view === 'weighted'
          ? (wSplit > 0 ? `E wt:${wSplit}` : 'E wt:NOT SET')
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
    const comboCount = view === 'raw' && Array.isArray(ex.combo_questions) ? ex.combo_questions.length : 0;
    const count = ex.covered_cos.length + (ex.cia_enabled ? ex.covered_cos.length : 0) + comboCount + (view === 'raw' ? 1 : 0);
    examGroups.push({ exam: ex, colCount: count });
  });

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
    if (col.isCqi) {
      return s.weighted_marks[`${exams[col.examIdx].id}_CO${col.co}`] ?? '';
    }
    if (col.isExamSplit) {
      // Exam split column (weighted) - fetched from backend weighted_marks
      return s.weighted_marks[col.key] ?? '';
    }
    return s.weighted_marks[col.key] ?? '';
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
    ? Array.from({ length: co_count }, (_, i) => {
        const vals = students.map(s => s.co_totals[i]).filter(v => typeof v === 'number' && v > 0) as number[];
        if (!vals.length) return null;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      })
    : [];

  const finalAverage: number | null = view === 'weighted'
    ? (() => {
        const vals = students.map(s => s.final_mark).filter(v => typeof v === 'number' && v > 0) as number[];
        if (!vals.length) return null;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      })()
    : null;

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
        <button onClick={onExportCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
        <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        {view === 'weighted' && (
          <span className="text-xs text-gray-400 ml-2">
            Weighted = (Raw / Max) &times; Weight
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            {/* Header row 1: exam names spanning columns */}
            <thead>
              <tr className="bg-gray-100">
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-100 z-10 w-10">#</th>
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-10 bg-gray-100 z-10 min-w-[100px]">Reg No</th>
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-[140px]">Name</th>
                {examGroups.map(({ exam, colCount }) => (
                  <th key={exam.id} colSpan={colCount} className="px-2 py-2 text-center text-xs font-semibold text-gray-700 border-l border-gray-300">
                    {exam.name}
                    <div className="text-[10px] text-gray-400 font-normal flex items-center justify-center gap-1 flex-wrap">
                      {exam.kind === 'cqi' ? (
                        <span className="bg-purple-50 text-purple-700 px-1 rounded font-medium">CQI (no weight)</span>
                      ) : (
                        <>
                          <span>Max: {exam.max_marks}</span>
                          <span>&middot;</span>
                          {exam.co_weights && Object.keys(exam.co_weights).length > 0 ? (
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
                        </>
                      )}
                    </div>
                  </th>
                ))}
                {view === 'weighted' && (
                  <>
                    {Array.from({ length: co_count }, (_, i) => (
                      <th key={`co-total-h-${i}`} rowSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-indigo-700 border-l border-indigo-200 bg-indigo-50 min-w-[60px]">
                        CO{i + 1}<br />Total
                      </th>
                    ))}
                    <th rowSpan={2} className="px-3 py-2 text-center text-xs font-bold text-gray-900 border-l border-gray-300 bg-green-50 min-w-[70px]">
                      Final<br />/{total_internal_marks}
                    </th>
                  </>
                )}
              </tr>
              {/* Header row 2: CO sub-columns */}
              <tr className="bg-gray-50">
                {cols.map((col, ci) => (
                  <th key={ci} className={`px-2 py-1.5 text-center text-[11px] font-medium ${col.isExamSplit || col.isCombo ? 'bg-purple-50 text-purple-700' : 'text-gray-500'} ${col.co === 0 ? 'bg-gray-100 font-semibold' : ''} ${ci === 0 || exams[col.examIdx].id !== exams[cols[ci - 1]?.examIdx]?.id ? 'border-l border-gray-300' : ''}`}>
                    {col.label}
                    <div className={`text-[10px] font-normal ${col.weightNotSet ? 'text-red-500 font-medium' : (col.isExamSplit || col.isCombo) ? 'text-purple-400' : 'text-gray-400'}`}>{col.sub}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.length === 0 ? (
                <tr><td colSpan={3 + cols.length + (view === 'weighted' ? co_count + 1 : 0)} className="px-4 py-8 text-center text-gray-400">No students or marks found</td></tr>
              ) : (
                <>
                  {students.map((s, si) => {
                    const isAbsentAny = Object.values(s.exam_marks).some(em => em.is_absent);
                    return (
                      <tr key={si} className={`${isAbsentAny ? 'bg-yellow-50/40' : ''} hover:bg-blue-50/30`}>
                        <td className="px-3 py-1.5 text-gray-400 sticky left-0 bg-white z-10">{si + 1}</td>
                        <td className="px-3 py-1.5 font-mono text-xs sticky left-10 bg-white z-10">{s.reg_no}</td>
                        <td className="px-3 py-1.5 truncate max-w-[160px]">{s.name}</td>
                        {cols.map((col, ci) => {
                          const val = getCellValue(s, col);
                          const examId = exams[col.examIdx].id;
                          const absent = s.exam_marks[examId]?.is_absent;
                          return (
                            <td key={ci} className={`px-2 py-1.5 text-center tabular-nums ${col.co === 0 ? 'font-semibold bg-gray-50/60' : ''} ${col.isExamSplit || col.isCombo ? 'bg-purple-50/50 text-purple-700' : ''} ${ci === 0 || exams[col.examIdx].id !== exams[cols[ci - 1]?.examIdx]?.id ? 'border-l border-gray-200' : ''} ${absent ? 'text-red-400 italic' : ''}`}>
                              {absent ? 'AB' : val === '' || val === 0 ? <span className="text-gray-300">-</span> : val}
                            </td>
                          );
                        })}
                        {view === 'weighted' && (
                          <>
                            {s.co_totals.map((ct, ci) => (
                              <td key={`co-${ci}`} className="px-2 py-1.5 text-center font-semibold text-indigo-700 border-l border-indigo-100 bg-indigo-50/40 tabular-nums">
                                {ct > 0 ? ct : <span className="text-gray-300">-</span>}
                              </td>
                            ))}
                            <td className="px-3 py-1.5 text-center font-bold border-l border-gray-200 bg-green-50/40 tabular-nums">
                              {s.final_mark > 0 ? s.final_mark : <span className="text-gray-300">-</span>}
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
                    {colAverages.map((avg, ci) => (
                      <td key={ci} className={`px-2 py-2 text-center tabular-nums text-amber-800 text-xs ${cols[ci].co === 0 ? 'bg-amber-100' : ''} ${cols[ci].isExamSplit || cols[ci].isCombo ? 'bg-purple-100 text-purple-800' : ''} ${ci === 0 || exams[cols[ci].examIdx].id !== exams[cols[ci - 1]?.examIdx]?.id ? 'border-l border-amber-200' : ''}`}>
                        {avg != null ? avg : <span className="text-gray-300">-</span>}
                      </td>
                    ))}
                    {view === 'weighted' && (
                      <>
                        {coTotalAverages.map((avg, ci) => (
                          <td key={`co-avg-${ci}`} className="px-2 py-2 text-center tabular-nums text-indigo-700 border-l border-indigo-100 bg-indigo-50 text-xs font-bold">
                            {avg != null ? avg : <span className="text-gray-300">-</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center tabular-nums font-bold border-l border-gray-300 bg-green-100 text-green-800 text-xs">
                          {finalAverage != null ? finalAverage : <span className="text-gray-300">-</span>}
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
