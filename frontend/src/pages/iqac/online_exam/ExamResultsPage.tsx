import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Award,
  Search,
  Filter,
  RefreshCw,
  Eye,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Clock,
  Sparkles,
  Send,
  TrendingUp,
  FileSpreadsheet,
  RotateCcw,
  ShieldAlert,
  UserX
} from 'lucide-react';
import {
  LiveSubmissionsResponse,
  StudentSubmissionItem,
  fetchLiveSubmissions,
  publishExamResults,
  allowStudentRetest
} from '../../../services/onlineExam';
import StudentAnswerLogModal from './StudentAnswerLogModal';

export default function ExamResultsPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<LiveSubmissionsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [publishSuccessMsg, setPublishSuccessMsg] = useState<string>('');
  const [retestSuccessMsg, setRetestSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [retestingStudentId, setRetestingStudentId] = useState<number | null>(null);

  // Active top tab: 'RESULTS' or 'KICKED'
  const [activeTab, setActiveTab] = useState<'RESULTS' | 'KICKED'>('RESULTS');

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
      setErrorMsg('');
    } catch (err: any) {
      if (!isBackground) {
        setErrorMsg(err.message || 'Failed to fetch exam results.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [parsedExamId]);

  const handlePublishResults = async () => {
    if (!parsedExamId) return;
    if (!window.confirm('Are you sure you want to publish the results of this exam? Students will immediately be able to view their scores.')) {
      return;
    }

    setPublishing(true);
    setErrorMsg('');
    try {
      const res = await publishExamResults(parsedExamId);
      setPublishSuccessMsg('Exam results published successfully! Students can now view their scores.');
      // Refresh local data
      await loadData(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to publish exam results.');
    } finally {
      setPublishing(false);
    }
  };

  const handleAllowRetest = async (studentId: number) => {
    if (!parsedExamId) return;
    if (!window.confirm('Allow Re-Test for this student? This will clear their kick lock and make the exam available as a Re-Test in their portal.')) {
      return;
    }
    setRetestingStudentId(studentId);
    setErrorMsg('');
    try {
      const res = await allowStudentRetest(parsedExamId, studentId);
      setRetestSuccessMsg(res.message || 'Re-test granted successfully. Candidate can now retake the exam.');
      setTimeout(() => setRetestSuccessMsg(''), 5000);
      await loadData(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to grant re-test.');
    } finally {
      setRetestingStudentId(null);
    }
  };

  const handleOpenStudentLog = (studentId: number) => {
    setSelectedStudentId(studentId);
    setLogModalOpen(true);
  };

  // Filter students based on activeTab
  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const baseList = activeTab === 'RESULTS' ? data.submitted : (data.kicked || []);

    return baseList.filter((item) => {
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

  // Statistics
  const stats = useMemo(() => {
    if (!data || data.submitted.length === 0) {
      return { avgScore: 0, avgPercentage: 0, highestScore: 0, totalQuestions: 0 };
    }
    const scores = data.submitted.map((s) => s.score ?? 0);
    const totalQs = data.submitted[0]?.total_questions || data.exam?.questions_count || 1;
    const sum = scores.reduce((acc, val) => acc + val, 0);
    const avg = sum / scores.length;
    const avgPct = Math.round((avg / totalQs) * 100);
    const highest = Math.max(...scores);
    return {
      avgScore: Math.round(avg * 10) / 10,
      avgPercentage: avgPct,
      highestScore: highest,
      totalQuestions: totalQs,
    };
  }, [data]);

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
  const isResultsPublished = Boolean(exam?.is_results_published);
  const kickedCount = data?.kicked_count ?? 0;

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
                Official Examination Results
              </span>
              {isResultsPublished ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>RESULTS PUBLISHED</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[10px] font-bold">
                  <Clock className="w-3 h-3 text-amber-600" />
                  <span>UNPUBLISHED DRAFT</span>
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-tight mt-0.5">
              {exam?.title || 'Online Exam'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* Publish / Status Button */}
          {!isResultsPublished ? (
            <button
              onClick={handlePublishResults}
              disabled={publishing || loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50"
            >
              {publishing ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Publish Results</span>
            </button>
          ) : (
            <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Scores Live to Students</span>
            </div>
          )}

          <button
            onClick={() => loadData(false)}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {publishSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{publishSuccessMsg}</span>
        </div>
      )}

      {retestSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{retestSuccessMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Analytics KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Evaluated Candidates */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Evaluated Candidates
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {data?.submitted_count ?? 0}
            </div>
            <p className="text-[11px] text-slate-500">
              Out of {data?.total_students_count ?? 0} assigned
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Average Score */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Class Average
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {stats.avgScore}{' '}
              <span className="text-slate-400 text-sm font-normal">
                / {stats.totalQuestions}
              </span>
            </div>
            <p className="text-[11px] text-blue-600 font-bold">
              {stats.avgPercentage}% Average Score
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Highest Score */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Highest Score
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {stats.highestScore}{' '}
              <span className="text-slate-400 text-sm font-normal">
                / {stats.totalQuestions}
              </span>
            </div>
            <p className="text-[11px] text-emerald-600 font-bold">
              Top Mark Achieved
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Kicked Candidates */}
        <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Kicked Candidates
            </span>
            <div className="text-2xl font-black text-rose-700 font-mono">
              {kickedCount}
            </div>
            <p className="text-[11px] text-slate-500">
              Disqualified for malpractice
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <UserX className="w-6 h-6" />
          </div>
        </div>

        {/* Total Questions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Questions Assessed
            </span>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {stats.totalQuestions} Qs
            </div>
            <p className="text-[11px] text-slate-500">
              Duration: {exam?.duration_minutes || 60} mins
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Results Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Navigation Tabs Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="inline-flex p-1.5 rounded-2xl bg-slate-200/70 max-w-md w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('RESULTS')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                activeTab === 'RESULTS'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>Results</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'RESULTS'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-300/80 text-slate-700'
                }`}
              >
                {data?.submitted_count ?? 0}
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

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Section Filter */}
            <div className="relative min-w-[180px]">
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
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
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search candidate name or reg no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
              />
            </div>
          </div>
        </div>

        {/* Results / Kicked Table */}
        <div className="overflow-x-auto">
          {loading && !data ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Loading candidate records...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold">No candidates found</p>
              <p className="text-xs text-slate-400">
                {searchQuery || selectedSection !== 'ALL'
                  ? 'Try modifying your search or section filters.'
                  : activeTab === 'KICKED'
                  ? 'No candidates have been kicked from this examination.'
                  : 'No completed exam submissions found for this exam.'}
              </p>
            </div>
          ) : activeTab === 'RESULTS' ? (
            /* Evaluated Results Table */
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Reg. No.</th>
                  <th className="px-5 py-3.5">Batch</th>
                  <th className="px-5 py-3.5">Section</th>
                  <th className="px-5 py-3.5">Score / Total</th>
                  <th className="px-5 py-3.5">Percentage</th>
                  <th className="px-5 py-3.5">Submitted At</th>
                  <th className="px-5 py-3.5 text-right">Answer Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((st) => (
                  <tr key={st.student_id} className="hover:bg-slate-50/70 transition">
                    {/* Student Info: Profile pic & Name */}
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
                          <div className="text-[11px] text-slate-500">
                            Candidate
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-3.5 text-slate-600 font-medium">
                      {st.department || '—'}
                    </td>

                    {/* Reg No */}
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-700">
                      {st.reg_no}
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

                    {/* Score / Total */}
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-900 text-sm">
                      <span className="text-blue-700">{st.score ?? 0}</span>
                      <span className="text-slate-400 text-xs font-normal"> / {st.total_questions}</span>
                    </td>

                    {/* Percentage */}
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          (st.percentage ?? 0) >= 50
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {st.percentage ?? 0}%
                      </span>
                    </td>

                    {/* Submitted At */}
                    <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                      {st.submitted_at || '—'}
                    </td>

                    {/* Right End: View Button for answered log popup */}
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleOpenStudentLog(st.student_id)}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-xs font-bold transition flex items-center gap-1.5 ml-auto group shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600 group-hover:text-white transition-colors" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Kicked Candidates Table */
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Reg. No.</th>
                  <th className="px-5 py-3.5">Batch</th>
                  <th className="px-5 py-3.5">Section</th>
                  <th className="px-5 py-3.5">Violations & Reason</th>
                  <th className="px-5 py-3.5">Kicked At</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((st) => (
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
                          <div className="text-[11px] text-slate-500 font-mono">
                            {st.reg_no}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-3.5 text-slate-600 font-medium">
                      {st.department || '—'}
                    </td>

                    {/* Reg No */}
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-700">
                      {st.reg_no}
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

                    {/* Violations & Reason */}
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
                          <span>Kicked</span>
                        </span>
                      )}
                    </td>

                    {/* Actions: Re-test button and View Log */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleAllowRetest(st.student_id)}
                          disabled={retestingStudentId === st.student_id}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs ${
                            st.is_retest_allowed
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20'
                          }`}
                          title="Allow student to retake exam"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${retestingStudentId === st.student_id ? 'animate-spin' : ''}`} />
                          <span>{st.is_retest_allowed ? 'Grant Again' : 'Re-Test'}</span>
                        </button>

                        <button
                          onClick={() => handleOpenStudentLog(st.student_id)}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-xs font-bold transition flex items-center gap-1.5 group shadow-xs"
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
