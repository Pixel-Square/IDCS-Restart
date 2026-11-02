import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Play,
  Square,
  Clock,
  Calendar,
  Users,
  BookOpen,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Search,
  Filter,
  Layers,
  Sparkles,
  Eye,
  Send
} from 'lucide-react';
import {
  OnlineExam,
  OnlineExamMetaResponse,
  fetchOnlineExamMeta,
  fetchOnlineExams,
  startOnlineExam,
  endOnlineExam,
  publishExamResults,
} from '../../../services/onlineExam';
import CreateExamModal from './CreateExamModal';
import PasswordConfirmModal from './PasswordConfirmModal';

export default function OnlineExamAdminPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<OnlineExam[]>([]);
  const [meta, setMeta] = useState<OnlineExamMetaResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [passwordModalConfig, setPasswordModalConfig] = useState<{
    isOpen: boolean;
    examId: number | null;
    action: 'START' | 'END';
    title: string;
    description: string;
    confirmLabel: string;
    confirmColor: 'emerald' | 'red';
  }>({
    isOpen: false,
    examId: null,
    action: 'START',
    title: '',
    description: '',
    confirmLabel: '',
    confirmColor: 'emerald',
  });

  // Current clock for running timers (ticks every second)
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);
    setErrorMsg('');

    try {
      const [examsRes, metaRes] = await Promise.all([
        fetchOnlineExams('all'),
        meta ? Promise.resolve(meta) : fetchOnlineExamMeta(),
      ]);
      setExams(examsRes);
      if (!meta) setMeta(metaRes);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load online exam data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Smooth auto-refresh polling every 5s so created/started/ended exams and student counts update live
    const interval = setInterval(() => {
      if (!showCreateModal && !passwordModalConfig.isOpen) {
        loadData(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [showCreateModal, passwordModalConfig.isOpen]);

  const handlePublishResults = async (examId: number) => {
    if (!window.confirm('Are you sure you want to publish the results of this exam? Students will immediately be able to view their scores in their portal.')) {
      return;
    }
    setErrorMsg('');
    try {
      await publishExamResults(examId);
      await loadData(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to publish exam results.');
    }
  };

  // Split into Upcoming (Scheduled / Running) and Past (Ended)
  const upcomingExams = useMemo(() => {
    return exams.filter((e) => e.status === 'SCHEDULED' || e.status === 'RUNNING');
  }, [exams]);

  const pastExams = useMemo(() => {
    return exams.filter((e) => e.status === 'ENDED');
  }, [exams]);

  // Format elapsed seconds into HH:MM:SS
  const formatElapsedTime = (startIso?: string) => {
    if (!startIso) return '00:00:00';
    const startMs = new Date(startIso).getTime();
    const elapsedSecs = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    const hours = Math.floor(elapsedSecs / 3600);
    const mins = Math.floor((elapsedSecs % 3600) / 60);
    const secs = elapsedSecs % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Actions
  const handleOpenStartPassword = (exam: OnlineExam) => {
    setPasswordModalConfig({
      isOpen: true,
      examId: exam.id,
      action: 'START',
      title: 'Confirm Password to Start Exam',
      description: `You are about to start "${exam.title}" (${exam.course_code}). Assigned students will be granted live access immediately.`,
      confirmLabel: 'Start Exam',
      confirmColor: 'emerald',
    });
  };

  const handleOpenEndPassword = (exam: OnlineExam) => {
    setPasswordModalConfig({
      isOpen: true,
      examId: exam.id,
      action: 'END',
      title: 'Confirm Password to End Exam',
      description: `Ending "${exam.title}" will close student submissions and move this exam to Past Exams. This action cannot be reversed.`,
      confirmLabel: 'End Exam',
      confirmColor: 'red',
    });
  };

  const handleConfirmPassword = async (password: string) => {
    const { examId, action } = passwordModalConfig;
    if (!examId) return;

    if (action === 'START') {
      await startOnlineExam(examId, password);
    } else {
      await endOnlineExam(examId, password);
    }
    await loadData(true);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 p-4 sm:p-6 lg:p-8 space-y-8 font-sans">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            <Layers className="w-4 h-4" />
            <span>IQAC Module • Online Examination</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Online Exam Admin
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage upcoming live online exams, automated execution, student section targets, and archives.
          </p>
        </div>

        {/* Tab & Refresh Bar */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm text-xs font-semibold text-slate-700">
            <span className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white shadow-sm flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Create / Upcoming Exams</span>
            </span>
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 shadow-sm transition disabled:opacity-50"
            title="Refresh exams"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTOR 1: UPCOMING EXAMS (TOP SECTION)
          ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Upcoming & Live Exams</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                {upcomingExams.length} Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Scheduled and active exams with real-time controls, running duration timers, and password authorization.
            </p>
          </div>

          {/* Create Exam Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition flex items-center justify-center gap-2 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Exam</span>
          </button>
        </div>

        {/* Upcoming Exams Cards */}
        {loading && exams.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-500 font-medium">Loading online exams...</p>
          </div>
        ) : upcomingExams.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">No Upcoming Exams</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              There are no exams scheduled or currently running. Click "Create Exam" to schedule a new examination.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-semibold transition"
            >
              <Plus className="w-4 h-4" />
              Schedule New Exam
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {upcomingExams.map((ex) => {
              const isRunning = ex.status === 'RUNNING';
              return (
                <div
                  key={ex.id}
                  className={`bg-white rounded-2xl p-5 border transition shadow-sm hover:shadow-md ${
                    isRunning ? 'border-emerald-300 ring-2 ring-emerald-500/10' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Exam Meta Info */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isRunning ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 animate-pulse">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span>LIVE NOW</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200">
                              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                              <span>
                                Submissions: <strong>{ex.submitted_count ?? 0}</strong> / {ex.total_students_count ?? 0}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                            <span>SCHEDULED</span>
                          </span>
                        )}

                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                          {ex.course_code}
                        </span>

                        <span className="text-xs text-slate-500">
                          {ex.course_name}
                        </span>
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                        {ex.title}
                      </h3>

                      {/* Details row */}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 pt-1">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Date: <strong className="text-slate-800">{ex.exam_date}</strong></span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Mode:{' '}
                            <strong className="text-slate-800">
                              {ex.start_mode === 'AUTO' ? `Auto (${ex.auto_start_time || 'Scheduled'})` : 'Manual'}
                            </strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Duration: <strong className="text-slate-800">{ex.duration_minutes} mins</strong></span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                          <span>Questions: <strong className="text-slate-800">{ex.questions_count}</strong></span>
                        </div>
                      </div>

                      {/* Target Sections */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-xs font-semibold text-slate-500">Target Sections:</span>
                        {ex.sections_details?.map((sec) => (
                          <span
                            key={sec.id}
                            className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-md text-[11px] font-semibold"
                          >
                            {sec.label || sec.name}
                          </span>
                        ))}
                      </div>

                      {/* Incharge Faculty */}
                      {ex.incharges && ex.incharges.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-xs font-semibold text-slate-500">Faculty Incharge:</span>
                          {ex.incharges.map((inc, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px]"
                            >
                              {inc.staff_name} <strong className="text-slate-500">({inc.role})</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Live Actions & Controls */}
                    <div className="flex flex-col sm:flex-row lg:flex-col items-end justify-center gap-2.5 lg:border-l lg:border-slate-100 lg:pl-6 flex-shrink-0 min-w-[210px]">
                      {/* Running Duration & End Button */}
                      {isRunning ? (
                        <div className="w-full space-y-2">
                          <div className="flex items-center justify-between gap-3 bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200">
                            <div>
                              <div className="text-[10px] uppercase font-bold text-emerald-800">Running Duration</div>
                              <div className="font-mono text-base font-extrabold text-emerald-950">
                                {formatElapsedTime(ex.actual_start_time)}
                              </div>
                            </div>

                            <button
                              onClick={() => handleOpenEndPassword(ex)}
                              className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                            >
                              <Square className="w-3.5 h-3.5" />
                              <span>End Exam</span>
                            </button>
                          </div>

                          {/* View Submissions Button */}
                          <button
                            onClick={() => navigate(`/iqac/online-exam/${ex.id}/submissions`)}
                            className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>View Submissions</span>
                          </button>
                        </div>
                      ) : (
                        /* Scheduled / Manual Start */
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenStartPassword(ex)}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition flex items-center gap-2"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Start Exam</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTOR 2: PAST EXAMS (BOTTOM SECTION)
          ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4 pt-4">
        {/* Section Header */}
        <div className="flex items-center justify-between bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Past Exams History</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                {pastExams.length} Completed
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Archived examination records, completed sessions, and faculty incharge details.
            </p>
          </div>
        </div>

        {/* Past Exams Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Exam Title</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Exam Date</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Questions</th>
                  <th className="px-4 py-3">Sections</th>
                  <th className="px-4 py-3">Faculty Incharge</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Completed At</th>
                  <th className="px-4 py-3 text-right">Actions / Results</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pastExams.map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-bold text-slate-900 max-w-xs">{ex.title}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-blue-700">{ex.course_code}</span>
                      <div className="text-[11px] text-slate-500 truncate max-w-[150px]">{ex.course_name}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">{ex.exam_date}</td>
                    <td className="px-4 py-3 text-slate-600">{ex.duration_minutes} mins</td>
                    <td className="px-4 py-3 text-slate-600 font-semibold">{ex.questions_count} Qs</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {ex.sections_details?.map((s) => (
                          <span
                            key={s.id}
                            className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] text-slate-700"
                          >
                            {s.label || s.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[11px] text-slate-700 max-w-[160px] truncate">
                        {ex.incharges?.map((inc) => `${inc.staff_name} (${inc.role})`).join(', ') || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold border border-slate-200">
                        ENDED
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                      {ex.actual_end_time
                        ? new Date(ex.actual_end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {ex.is_results_published ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Published</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePublishResults(ex.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-bold transition flex items-center gap-1 shadow-xs"
                            title="Publish results so students can view scores"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Publish Results</span>
                          </button>
                        )}

                        <button
                          onClick={() => navigate(`/iqac/online-exam/${ex.id}/results`)}
                          className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-xs font-bold transition flex items-center gap-1 shadow-xs"
                          title="View detailed results and candidate logs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Results</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pastExams.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                      No past exams recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Multi-step Create Exam Modal */}
      {showCreateModal && (
        <CreateExamModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onExamCreated={() => loadData(true)}
          meta={meta}
        />
      )}

      {/* Password Confirmation Modal for Start / End */}
      <PasswordConfirmModal
        isOpen={passwordModalConfig.isOpen}
        title={passwordModalConfig.title}
        description={passwordModalConfig.description}
        confirmLabel={passwordModalConfig.confirmLabel}
        confirmColor={passwordModalConfig.confirmColor}
        onClose={() => setPasswordModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmPassword}
      />
    </div>
  );
}
