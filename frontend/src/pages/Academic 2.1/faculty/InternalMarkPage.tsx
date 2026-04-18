/**
 * Internal Mark Page
 * Overview of internal mark components + CO-wise summary for a course.
 * Two tabs: Exam Assignments | CO Summary (raw & weighted marks)
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Users, CheckCircle, Clock, AlertCircle,
  Edit2, Lock, RefreshCw, FileText, Download, BarChart3,
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
  due_date: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'LOCKED';
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
  exam_max_marks?: number;
  covered_cos: number[];
  weight_per_co: number;
  max_per_co: number;
  co_max_map: Record<string, number>;
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

  const [loading, setLoading] = useState(true);
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'exams' | 'co'>('exams');

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
    if (!coSummary) return;
    const { exams, students, co_count } = coSummary;
    const isW = coView === 'weighted';

    // Build headers
    const headers: string[] = ['#', 'Reg No', 'Name'];
    for (const ex of exams) {
      if (isW) {
        for (const co of ex.covered_cos) {
          const w = (ex.co_weights?.[String(co)] ?? (ex.co_weights as any)?.[co] ?? ex.weight_per_co ?? 0) as number;
          headers.push(`${ex.short_name}_CO${co} (wt:${w && w > 0 ? w : 'NOT_SET'})`);
        }
        if (ex.cia_enabled) headers.push(`${ex.short_name} Exam (wt:${(ex.cia_weight || 0) > 0 ? (ex.cia_weight || 0) : 'NOT_SET'} /${ex.exam_max_marks || 0})`);
      } else {
        for (const co of ex.covered_cos) headers.push(`${ex.short_name} CO${co} (/${ex.max_per_co})`);
        if (ex.cia_enabled) headers.push(`${ex.short_name} Exam (split /${ex.exam_max_marks || 0})`);
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
        const em = s.exam_marks[ex.short_name] || {};
        if (isW) {
          for (const co of ex.covered_cos) row.push(s.weighted_marks[`${ex.short_name}_CO${co}`] ?? '');
          if (ex.cia_enabled) {
            const rawExam = (em.exam as number) ?? 0;
            const examMax = ex.exam_max_marks || 0;
            const examWt = ex.cia_weight || 0;
            const wExam = examMax > 0 && examWt > 0 ? Math.round(((rawExam / examMax) * examWt) * 100) / 100 : '';
            row.push(wExam);
          }
        } else {
          for (const co of ex.covered_cos) row.push(em[`co${co}`] ?? '');
          if (ex.cia_enabled) row.push(em.exam ?? '');
          row.push(em.total ?? '');
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
  const getStatusBadge = (status: string, locked: boolean) => {
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

  const totalEntered = courseInfo.exams.reduce((sum, e) => sum + (e.status === 'COMPLETED' ? 1 : 0), 0);
  const totalExams = courseInfo.exams.length;

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
            <div><span className="text-gray-400 block text-xs">Total Internal Marks</span><span className="font-medium">{courseInfo.class_type.total_internal_marks}</span></div>
            <div><span className="text-gray-400 block text-xs">Type</span><span className="font-medium">{courseInfo.is_elective ? 'Elective' : 'Regular'}</span></div>
            <div><span className="text-gray-400 block text-xs">Progress</span><span className="font-medium">{totalEntered}/{totalExams} completed</span></div>
          </div>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex border-b">
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

      {/* ─── Tab: Exam Assignments ─── */}
      {tab === 'exams' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b"><h2 className="text-lg font-semibold">Internal Mark Components</h2></div>
          <div className="divide-y">
            {courseInfo.exams.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No exam components configured</div>
            ) : courseInfo.exams.map((exam) => (
              <div
                key={exam.id}
                className="p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/academic-v2/exam/${exam.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-lg"><FileText className="w-5 h-5 text-gray-600" /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{exam.name}</h3>
                        <span className="text-sm text-gray-500">({exam.short_name})</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                        <span>Max: {exam.max_marks}</span>
                        {/* Show per-CO weights if available, else show total weight */}
                        {exam.co_weights && Object.keys(exam.co_weights).length > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">Wt:</span>
                            {Object.entries(exam.co_weights).sort(([a], [b]) => Number(a) - Number(b)).map(([co, wt]) => (
                              <span key={co} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                                CO{co}:{wt}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span>Weight: {exam.weight}</span>
                        )}
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
                        navigate(`/academic-v2/exam/${exam.id}`);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Edit2 className="w-4 h-4" /> Enter Marks
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Tab: CO Summary ─── */}
      {tab === 'co' && (
        <COSummaryTab
          loading={coLoading}
          data={coSummary}
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
  type ColDef = { key: string; label: string; sub: string; examIdx: number; co: number };
  const cols: ColDef[] = [];
  exams.forEach((ex, ei) => {
    for (const co of ex.covered_cos) {
      const coMax = ex.co_max_map?.[String(co)] ?? ex.max_per_co;
      if (view === 'raw') {
        cols.push({ key: `${ex.short_name}_co${co}`, label: `CO${co}`, sub: `/${coMax}`, examIdx: ei, co });
      } else {
        const w = (ex.co_weights?.[String(co)] ?? (ex.co_weights as any)?.[co] ?? ex.weight_per_co ?? 0) as number;
        const sub = w && w > 0 ? `wt: ${w}` : 'wt: NOT SET';
        cols.push({ key: `${ex.short_name}_CO${co}`, label: `CO${co}`, sub, examIdx: ei, co });
      }
    }

    // If Mark Manager Exam component is enabled, show it as a separate column (informational).
    if (ex.cia_enabled) {
      const sub = view === 'weighted'
        ? `wt: ${(ex.cia_weight || 0) > 0 ? (ex.cia_weight || 0) : 'NOT SET'} /${ex.exam_max_marks || 0}`
        : `split /${ex.exam_max_marks || 0}`;
      cols.push({ key: `${ex.short_name}_exam`, label: 'Exam', sub, examIdx: ei, co: -1 });
    }

    if (view === 'raw') {
      cols.push({ key: `${ex.short_name}_total`, label: 'Total', sub: `/${ex.max_marks}`, examIdx: ei, co: 0 });
    }
  });

  // Group columns by exam for header row spanning
  type ExamGroup = { exam: COExam; colCount: number };
  const examGroups: ExamGroup[] = [];
  exams.forEach((ex) => {
    const count = ex.covered_cos.length + (ex.cia_enabled ? 1 : 0) + (view === 'raw' ? 1 : 0);
    examGroups.push({ exam: ex, colCount: count });
  });

  const getCellValue = (s: COStudent, col: ColDef): string | number => {
    if (view === 'raw') {
      if (col.co === 0) {
        // Total column
        const em = s.exam_marks[exams[col.examIdx].short_name];
        return em ? (em.total as number) ?? '' : '';
      }
      if (col.co === -1) {
        // Exam split column (raw)
        const em = s.exam_marks[exams[col.examIdx].short_name];
        return em ? (em.exam as number) ?? '' : '';
      }
      // CO column
      const em = s.exam_marks[exams[col.examIdx].short_name];
      return em ? (em[`co${col.co}`] as number) ?? '' : '';
    }
    // Weighted
    if (col.co === -1) {
      const ex = exams[col.examIdx];
      const em = s.exam_marks[ex.short_name];
      if (!em) return '';
      const rawExam = (em.exam as number) ?? 0;
      const examMax = ex.exam_max_marks || 0;
      const examWt = ex.cia_weight || 0;
      if (examMax <= 0 || examWt <= 0) return '';
      return Math.round(((rawExam / examMax) * examWt) * 100) / 100;
    }
    return s.weighted_marks[col.key] ?? '';
  };

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
                      <span>Max: {exam.max_marks}</span>
                      <span>&middot;</span>
                      {exam.co_weights && Object.keys(exam.co_weights).length > 0 ? (
                        exam.covered_cos.map(co => (
                          <span key={co} className="bg-blue-50 px-1 rounded">
                            CO{co}:{exam.co_weights[String(co)] ?? 0}
                          </span>
                        ))
                      ) : (
                        <span>Wt: {exam.weight}</span>
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
                  <th key={ci} className={`px-2 py-1.5 text-center text-[11px] font-medium text-gray-500 ${col.co === 0 ? 'bg-gray-100 font-semibold' : ''} ${ci === 0 || exams[col.examIdx].short_name !== exams[cols[ci - 1]?.examIdx]?.short_name ? 'border-l border-gray-300' : ''}`}>
                    {col.label}
                    <div className="text-[10px] text-gray-400 font-normal">{col.sub}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.length === 0 ? (
                <tr><td colSpan={3 + cols.length + (view === 'weighted' ? co_count + 1 : 0)} className="px-4 py-8 text-center text-gray-400">No students or marks found</td></tr>
              ) : students.map((s, si) => {
                const isAbsentAny = Object.values(s.exam_marks).some(em => em.is_absent);
                return (
                  <tr key={si} className={`${isAbsentAny ? 'bg-yellow-50/40' : ''} hover:bg-blue-50/30`}>
                    <td className="px-3 py-1.5 text-gray-400 sticky left-0 bg-white z-10">{si + 1}</td>
                    <td className="px-3 py-1.5 font-mono text-xs sticky left-10 bg-white z-10">{s.reg_no}</td>
                    <td className="px-3 py-1.5 truncate max-w-[160px]">{s.name}</td>
                    {cols.map((col, ci) => {
                      const val = getCellValue(s, col);
                      const examSN = exams[col.examIdx].short_name;
                      const absent = s.exam_marks[examSN]?.is_absent;
                      return (
                        <td key={ci} className={`px-2 py-1.5 text-center tabular-nums ${col.co === 0 ? 'font-semibold bg-gray-50/60' : ''} ${ci === 0 || exams[col.examIdx].short_name !== exams[cols[ci - 1]?.examIdx]?.short_name ? 'border-l border-gray-200' : ''} ${absent ? 'text-red-400 italic' : ''}`}>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
