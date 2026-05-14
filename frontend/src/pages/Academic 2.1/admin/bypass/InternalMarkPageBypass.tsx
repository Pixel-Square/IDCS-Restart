/**
 * InternalMarkPageBypass — wraps the faculty InternalMarkPage for admin bypass.
 * Adds Reset Exam button to each exam card.
 * Removes lock restrictions (admin already has is_staff on backend).
 * Navigates to bypass-aware exam routes.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Users, CheckCircle, Clock, AlertCircle,
  Edit2, RefreshCw, FileText, AlertTriangle, RotateCcw,
} from 'lucide-react';
import fetchWithAuth from '../../../../services/fetchAuth';
import FacultyCourseDashboard from '../../faculty/FacultyCourseDashboard';
import ResultAnalysisPage from '../../faculty/result_analysis/ResultAnalysisPage';
import { useBypass } from './BypassContext';
import COSummaryPanel from './COSummaryPanel';

/* ─── types (same as InternalMarkPage) ─── */
interface ExamMark {
  id: string;
  name: string;
  short_name: string;
  max_marks: number;
  weight: number;
  co_weights: Record<string, number>;
  entered_count: number;
  total_students: number;
  is_locked: boolean;
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

/* ─── Small floating top bar for success/error messages ─── */
function FloatingBar({
  message,
  onClose,
}: {
  message: { type: 'success' | 'error'; text: string } | null;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    setProgress(100);
    const duration = 3000;
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct <= 0) {
        clearInterval(tick);
        setVisible(false);
        setTimeout(onClose, 300);
      }
    }, 50);
    return () => clearInterval(tick);
  }, [message]);

  if (!message) return null;
  const isSuccess = message.type === 'success';

  return (
    <div
      className="fixed top-16 left-1/2 z-[9998] -translate-x-1/2 rounded-lg shadow-lg overflow-hidden"
      style={{
        minWidth: 260,
        maxWidth: 420,
        opacity: visible ? 1 : 0,
        transform: `translateX(-50%) translateY(${visible ? 0 : -12}px)`,
        transition: 'opacity 0.25s, transform 0.25s',
        pointerEvents: 'none',
      }}
    >
      <div className={`px-4 py-2 text-sm font-medium text-white ${isSuccess ? 'bg-green-600' : 'bg-red-600'}`}>
        {message.text}
      </div>
      <div className="h-1 bg-black/10">
        <div
          className={`h-1 ${isSuccess ? 'bg-green-300' : 'bg-red-300'}`}
          style={{ width: `${progress}%`, transition: 'width 50ms linear' }}
        />
      </div>
    </div>
  );
}

/* ─── ResetExamConfirm popup ─── */
function ResetExamConfirm({
  examName,
  onConfirm,
  onCancel,
}: {
  examName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <RotateCcw className="w-6 h-6 text-red-500" />
          <h2 className="text-lg font-semibold text-red-700">Reset Exam</h2>
        </div>
        <p className="text-sm text-gray-700 mb-2">
          Reset <strong>{examName}</strong>?
        </p>
        <p className="text-xs text-red-500 mb-6">
          This will permanently delete all marks and revert publish status to DRAFT.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
            Yes, Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── main component ─── */
export default function InternalMarkPageBypass({
  courseId,
  sessionId,
}: {
  courseId: string;
  sessionId: string;
}) {
  const navigate = useNavigate();
  const { addLog } = useBypass();

  const [loading, setLoading] = useState(true);
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'dashboard' | 'exams' | 'co' | 'result'>('dashboard');
  const [resetTarget, setResetTarget] = useState<ExamMark | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const dedupedExams = useMemo(() => {
    if (!courseInfo?.exams) return [] as ExamMark[];
    const seen = new Set<string>();
    return courseInfo.exams.filter((e) => {
      const key = `${e.kind || 'exam'}::${(e.short_name || e.name).toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [courseInfo]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/`);
      if (!res.ok) throw new Error('Failed');
      setCourseInfo(await res.json());
    } catch {
      setMessage({ type: 'error', text: 'Failed to load course information' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [courseId]);

  const handleResetExam = async (exam: ExamMark) => {
    setResetting(exam.id);
    setResetTarget(null);
    try {
      const res = await fetchWithAuth(
        `/api/academic-v2/admin/bypass/${sessionId}/reset-exam/${exam.id}/`,
        { method: 'POST' },
      );
      if (res.ok) {
        setMessage({ type: 'success', text: `${exam.name} reset successfully.` });
        loadData();
      } else {
        const d = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: d.detail || 'Reset failed.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    } finally {
      setResetting(null);
    }
  };

  const getStatusBadge = (exam: ExamMark) => {
    // In bypass mode we show PUBLISHED status but never show as "locked"
    if (exam.status === 'COMPLETED' || exam.status === 'LOCKED')
      return <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-sm"><CheckCircle className="w-3 h-3" />Published</span>;
    if (exam.status === 'IN_PROGRESS')
      return <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-sm"><Clock className="w-3 h-3" />In Progress</span>;
    return <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"><AlertCircle className="w-3 h-3" />Not Started</span>;
  };

  const getProgressBar = (entered: number, total: number) => {
    const pct = total > 0 ? (entered / total) * 100 : 0;
    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`h-2 rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
  if (!courseInfo) return (
    <div className="p-6 text-center text-red-600">Failed to load course information</div>
  );

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Floating reset success/error bar */}
      <FloatingBar message={message} onClose={() => setMessage(null)} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{courseInfo.course_code}</h1>
            <p className="text-gray-500">{courseInfo.course_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { loadData(); }}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {message && message.type === 'error' && (
        <div className="px-4 py-2 rounded-lg text-sm bg-red-50 text-red-800">
          {message.text}
          <button className="ml-3 text-xs underline" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      {/* Course info card */}
      <div className="bg-white rounded-lg shadow p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-gray-400 block text-xs">Class</span><span className="font-medium">{courseInfo.class_name}</span></div>
          <div><span className="text-gray-400 block text-xs">Section</span><span className="font-medium">{courseInfo.section}</span></div>
          <div><span className="text-gray-400 block text-xs">Semester</span><span className="font-medium">{courseInfo.semester}</span></div>
          <div><span className="text-gray-400 block text-xs">Students</span><span className="font-medium">{courseInfo.student_count}</span></div>
          <div><span className="text-gray-400 block text-xs">Class Type</span><span className="font-medium">{courseInfo.class_type.name}</span></div>
          <div><span className="text-gray-400 block text-xs">QP Type</span><span className="font-medium">{courseInfo.qp_type || '—'}</span></div>
          <div><span className="text-gray-400 block text-xs">Total Internal</span><span className="font-medium">{courseInfo.class_type.total_internal_marks}</span></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(['dashboard', 'exams', 'co', 'result'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'dashboard' ? 'Dashboard' : t === 'exams' ? 'Exam Assignments' : t === 'co' ? 'CO Summary' : 'Result Analysis'}
          </button>
        ))}
      </div>

      {/* Dashboard tab */}
      {tab === 'dashboard' && (
        <div className="bg-white rounded-lg shadow p-4">
          <FacultyCourseDashboard courseInfo={courseInfo} />
        </div>
      )}

      {/* Exams tab */}
      {tab === 'exams' && (
        <div className="bg-white rounded-lg shadow divide-y">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold">Internal Mark Components</h2>
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-medium">
              Admin Bypass — all locks disabled
            </span>
          </div>
          {dedupedExams.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No exam components configured</div>
          ) : dedupedExams.map((exam) => {
            const isCqi = exam.kind === 'cqi';
            return (
              <div
                key={exam.id}
                className={`p-4 ${isCqi ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${isCqi ? 'bg-purple-200' : 'bg-gray-100'}`}>
                      <FileText className={`w-5 h-5 ${isCqi ? 'text-purple-600' : 'text-gray-600'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{exam.name}</h3>
                        <span className="text-sm text-gray-500">({exam.short_name})</span>
                        {isCqi && exam.cqi_name && (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">{exam.cqi_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        <span>Max: {exam.max_marks}</span>
                        <span>Weight: {exam.weight}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(exam)}
                    <div className="w-28">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Progress</span>
                        <span>{exam.entered_count}/{exam.total_students}</span>
                      </div>
                      {getProgressBar(exam.entered_count, exam.total_students)}
                    </div>
                    {/* Reset Exam button */}
                    <button
                      onClick={() => setResetTarget(exam)}
                      disabled={resetting === exam.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                      title="Reset marks for this exam"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {resetting === exam.id ? 'Resetting...' : 'Reset'}
                    </button>
                    {/* View / Enter button */}
                    <button
                      onClick={() => {
                        if (isCqi) {
                          navigate(`/academic-v2/course/${courseId}/cqi`);
                        } else {
                          navigate(`/academic-v2/exam/${exam.id}`);
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-white ${
                        isCqi ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      <Edit2 className="w-4 h-4" />
                      {isCqi ? 'Enter CQI' : 'Enter Marks'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Result Analysis tab */}
      {tab === 'result' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <ResultAnalysisPage courseId={courseId} />
        </div>
      )}

      {/* CO summary tab */}
      {tab === 'co' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <COSummaryPanel courseId={courseId} />
        </div>
      )}

      {/* Reset exam confirm popup */}
      {resetTarget && (
        <ResetExamConfirm
          examName={resetTarget.name}
          onConfirm={() => handleResetExam(resetTarget)}
          onCancel={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
