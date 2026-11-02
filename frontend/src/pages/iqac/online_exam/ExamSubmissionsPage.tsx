import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  ChevronRight,
  TrendingUp,
  Activity,
  RotateCcw,
  ShieldAlert,
  UserX
} from 'lucide-react';
import {
  LiveSubmissionsResponse,
  StudentSubmissionItem,
  fetchLiveSubmissions,
  allowStudentRetest
} from '../../../services/onlineExam';
import StudentAnswerLogModal from './StudentAnswerLogModal';

export default function ExamSubmissionsPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<LiveSubmissionsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [retestingStudentId, setRetestingStudentId] = useState<number | null>(null);

  // Active top slider tab: 'SUBMITTED' | 'NOT_SUBMITTED' | 'KICKED'
  const [activeTab, setActiveTab] = useState<'SUBMITTED' | 'NOT_SUBMITTED' | 'KICKED'>('SUBMITTED');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('ALL');

  // Answer Log Popup
  const [logModalOpen, setLogModalOpen] = useState<boolean>(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  const parsedExamId = examId ? parseInt(examId, 10) : NaN;

  const loadData = async (isBackground = false) => {
    if (!parsedExamId) return;
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetchLiveSubmissions(parsedExamId);
      setData(res);
      setLastRefreshedAt(new Date());
      setErrorMsg('');
    } catch (err: any) {
      if (!isBackground) {
        setErrorMsg(err.message || 'Failed to fetch live exam submissions.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load + 4s live auto-refresh polling
  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [parsedExamId]);

  // Handle allow retest
  const handleAllowRetest = async (studentId: number) => {
    if (!parsedExamId) return;
    if (!window.confirm('Allow Re-Test for this student? This will clear their kick lock and make the exam available as a Re-Test in their portal.')) {
      return;
    }
    setRetestingStudentId(studentId);
    setErrorMsg('');
    try {
      const res = await allowStudentRetest(parsedExamId, studentId);
      setSuccessMsg(res.message || 'Re-test granted successfully. Exam is now active for this student as a Re-Test.');
      setTimeout(() => setSuccessMsg(''), 5000);
      await loadData(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to grant re-test.');
    } finally {
      setRetestingStudentId(null);
    }
  };

  // Filtered lists
  const currentList = useMemo(() => {
    if (!data) return [];
    const list =
      activeTab === 'SUBMITTED'
        ? data.submitted
        : activeTab === 'NOT_SUBMITTED'
        ? data.not_submitted
        : (data.kicked || []);

    return list.filter((item) => {
      // Section filter
      if (selectedSection !== 'ALL' && String(item.section_id) !== selectedSection && item.section !== selectedSection) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesRegNo = item.reg_no.toLowerCase().includes(query);
        const matchesDept = (item.department || '').toLowerCase().includes(query);
        if (!matchesName && !matchesRegNo && !matchesDept) {
          return false;
        }
      }
      return true;
    });
  }, [data, activeTab, selectedSection, searchQuery]);

  const handleOpenStudentLog = (studentId: number) => {
    setSelectedStudentId(studentId);
    setLogModalOpen(true);
  };

  if (!parsedExamId) {
    return (
      <div className="p-8 text-center text-slate-600">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
        <h2 className="text-lg font-bold">Invalid Examination ID</h2>
        <button
          onClick={() => navigate('/iqac/online-exam')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
        >
          Back to Exams
        </button>
      </div>
    );
  }

  const exam = data?.exam;
  const submittedCount = data?.submitted_count ?? 0;
  const notSubmittedCount = data?.not_submitted_count ?? 0;
  const kickedCount = data?.kicked_count ?? 0;
  const totalStudents = data?.total_students_count ?? 0;
  const completionPercentage = totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;
  const isLive = exam?.status === 'RUNNING';

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8 font-sans space-y-6">
      {/* Top Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/iqac/online-exam')}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Exams List</span>
          </button>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                Live Submissions Console
              </span>
              {isLive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 text-[10px] font-bold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>EXAM RUNNING LIVE</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                  {exam?.status || 'SCHEDULED'}
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-tight mt-0.5">
              {exam?.title || 'Online Exam'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {refreshing && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span>Syncing live...</span>
            </span>
          )}

          <button
            onClick={() => loadData(false)}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Assigned Students */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Assigned
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {totalStudents}
            </div>
            <p className="text-[11px] text-slate-500">Registered candidates</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Submitted Count */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Submitted Papers
            </span>
            <div className="text-2xl font-black text-emerald-700 font-mono flex items-center gap-2">
              <span>{submittedCount}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {completionPercentage}%
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Exams fully completed</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Not Submitted Count */}
        <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              In Progress / Pending
            </span>
            <div className="text-2xl font-black text-amber-700 font-mono">
              {notSubmittedCount}
            </div>
            <p className="text-[11px] text-slate-500">Actively taking or waiting</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Kicked Candidates Count */}
        <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Kicked Candidates
            </span>
            <div className="text-2xl font-black text-rose-700 font-mono">
              {kickedCount}
            </div>
            <p className="text-[11px] text-slate-500">Malpractice auto-disqualified</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <UserX className="w-6 h-6" />
          </div>
        </div>

        {/* Live Completion Rate Progress */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>Live Completion</span>
              <span className="text-slate-800 font-bold">{completionPercentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-emerald-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Updated {lastRefreshedAt.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Main Table Container with Sliding Tabs */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Top Slider / Tabs Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Sliding Tabs */}
          <div className="inline-flex p-1.5 rounded-2xl bg-slate-200/70 max-w-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('SUBMITTED')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                activeTab === 'SUBMITTED'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Submitted</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'SUBMITTED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-300/80 text-slate-700'
                }`}
              >
                {submittedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('NOT_SUBMITTED')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                activeTab === 'NOT_SUBMITTED'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Not Submitted</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'NOT_SUBMITTED'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-300/80 text-slate-700'
                }`}
              >
                {notSubmittedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('KICKED')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                activeTab === 'KICKED'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Kicked Candidates</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'KICKED'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-300/80 text-slate-700'
                }`}
              >
                {kickedCount}
              </span>
            </button>
          </div>

          {/* Search and Section Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Section Filter */}
            <div className="relative min-w-[160px]">
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">All Sections</option>
                {data?.sections?.map((sec) => (
                  <option key={sec.id} value={String(sec.id)}>
                    Section: {sec.name || sec.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Box */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search name or reg no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Students Table */}
        <div className="overflow-x-auto">
          {loading && !data ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Loading candidate submissions...</p>
            </div>
          ) : currentList.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold">No students found</p>
              <p className="text-xs text-slate-400">
                {searchQuery || selectedSection !== 'ALL'
                  ? 'Try adjusting your filters or search terms.'
                  : activeTab === 'KICKED'
                  ? 'No candidates have been kicked from this examination.'
                  : 'No student records available for this tab.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Batch</th>
                  <th className="px-5 py-3.5">Section</th>
                  {activeTab === 'SUBMITTED' ? (
                    <>
                      <th className="px-5 py-3.5">Score</th>
                      <th className="px-5 py-3.5">Submitted At</th>
                    </>
                  ) : activeTab === 'NOT_SUBMITTED' ? (
                    <>
                      <th className="px-5 py-3.5">Live Progress (Answered / Total)</th>
                      <th className="px-5 py-3.5">Session Status</th>
                    </>
                  ) : (
                    <>
                      <th className="px-5 py-3.5">Violations & Reason</th>
                      <th className="px-5 py-3.5">Kicked At</th>
                      <th className="px-5 py-3.5">Retest Status</th>
                    </>
                  )}
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentList.map((st) => (
                  <tr key={st.student_id} className="hover:bg-slate-50/70 transition">
                    {/* Student Info */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {st.profile_image ? (
                          <img
                            src={st.profile_image}
                            alt={st.name}
                            className="w-9 h-9 rounded-xl object-cover border border-slate-200 shadow-xs flex-shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0 text-xs">
                            {st.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-900 leading-tight">
                            {st.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {st.reg_no}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-3.5 text-slate-600 font-medium">
                      {st.department || '—'}
                    </td>

                    {/* Batch */}
                    <td className="px-5 py-3.5 text-slate-600">
                      {st.batch || '—'}
                    </td>

                    {/* Section */}
                    <td className="px-5 py-3.5">
                      <span className="px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold text-[11px]">
                        {st.section || '—'}
                      </span>
                    </td>

                    {/* Tab-specific fields */}
                    {activeTab === 'SUBMITTED' ? (
                      <>
                        {/* Score */}
                        <td className="px-5 py-3.5 font-mono">
                          <span className="font-bold text-slate-900 text-sm">
                            {st.score ?? '—'}
                          </span>
                          <span className="text-slate-400"> / {st.total_questions}</span>
                          <span className="ml-2 text-xs font-bold text-emerald-600">
                            ({st.percentage}%)
                          </span>
                        </td>

                        {/* Submission Time */}
                        <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                          {st.submitted_at || '—'}
                        </td>
                      </>
                    ) : activeTab === 'NOT_SUBMITTED' ? (
                      <>
                        {/* Not Submitted: Live Answered / Total Count */}
                        <td className="px-5 py-3.5">
                          <div className="space-y-1.5 max-w-[180px]">
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-slate-800">
                                {st.answered_count} / {st.total_questions || exam?.questions_count} Qs
                              </span>
                              <span className="text-blue-600">
                                {Math.round(
                                  (st.answered_count /
                                    Math.max(1, st.total_questions || exam?.questions_count || 1)) *
                                    100
                                )}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{
                                  width: `${
                                    (st.answered_count /
                                      Math.max(1, st.total_questions || exam?.questions_count || 1)) *
                                    100
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Session Status */}
                        <td className="px-5 py-3.5">
                          {st.status === 'IN_PROGRESS' || st.answered_count > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-800 font-bold text-[11px] animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span>IN PROGRESS</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                              <span>NOT STARTED</span>
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Kicked info: Violations & Reason */}
                        <td className="px-5 py-3.5 max-w-xs">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-bold text-[10px]">
                              <ShieldAlert className="w-3 h-3 text-rose-600" />
                              <span>{st.violations_count || 1} Violation(s)</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-rose-600 font-medium leading-tight">
                            {st.kicked_reason || 'Malpractice violation / Cooldown timeout'}
                          </p>
                        </td>

                        {/* Kicked At */}
                        <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                          {st.kicked_at || st.submitted_at || '—'}
                        </td>

                        {/* Retest status */}
                        <td className="px-5 py-3.5">
                          {st.is_retest_allowed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-[10px]">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Re-Test Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-bold text-[10px]">
                              <span>Disqualified</span>
                            </span>
                          )}
                        </td>
                      </>
                    )}

                    {/* Actions: Re-test button and View Log */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {activeTab === 'KICKED' && (
                          <button
                            onClick={() => handleAllowRetest(st.student_id)}
                            disabled={retestingStudentId === st.student_id}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs ${
                              st.is_retest_allowed
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20'
                            }`}
                            title="Allow student to retake exam from Available Exams"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${retestingStudentId === st.student_id ? 'animate-spin' : ''}`} />
                            <span>{st.is_retest_allowed ? 'Grant Again' : 'Re-Test'}</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenStudentLog(st.student_id)}
                          className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-xs font-bold transition flex items-center gap-1.5 group"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600 group-hover:text-white transition-colors" />
                          <span>View</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Student Answered Log Modal Popup */}
      <StudentAnswerLogModal
        isOpen={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        examId={parsedExamId}
        studentId={selectedStudentId}
      />
    </div>
  );
}
