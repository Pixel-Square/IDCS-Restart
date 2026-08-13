import React, { useEffect, useState } from 'react';
import {
  BarChart3, Filter, Award, TrendingUp, AlertTriangle, Users, BookOpen,
  CheckCircle2, XCircle, Search, Printer, Lock, ChevronRight, FileText,
  UserCheck, RefreshCw, Eye, GraduationCap, Building2, Layers, HelpCircle,
  MessageSquare, User, ArrowUpRight, ArrowDownRight, Compass, ShieldCheck, ArrowRight
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell, PieChart, Pie
} from 'recharts';
import {
  fetchPerformanceAnalytics, fetchStudentProgressReport,
  PerformanceAnalyticsResponse, WeakStudentRow, StudentProgressReportResponse
} from '../../services/academicPerformance';

const DEPARTMENTS = [
  { code: '', name: 'All Departments' },
  { code: 'CSE', name: 'Computer Science & Engineering' },
  { code: 'AI', name: 'Artificial Intelligence & Data Science' },
  { code: 'ECE', name: 'Electronics & Communication' },
  { code: 'EEE', name: 'Electrical & Electronics' },
  { code: 'MECH', name: 'Mechanical Engineering' },
  { code: 'CIVIL', name: 'Civil Engineering' },
  { code: 'IT', name: 'Information Technology' },
];

const EXAM_TYPES = [
  { code: '', name: 'All Exam Types' },
  { code: 'CIA 1', name: 'CIA 1' },
  { code: 'CIA 2', name: 'CIA 2' },
  { code: 'Model Exam', name: 'Model Exam' },
  { code: 'Semester', name: 'Semester Exam' },
];

export default function AcademicPerformancePage() {
  const [data, setData] = useState<PerformanceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Sticky Filters
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedSem, setSelectedSem] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedExamType, setSelectedExamType] = useState<string>('');

  // Active Role Dashboard View (Principal | HOD | Faculty | Student)
  const [activeTab, setActiveTab] = useState<'principal' | 'hod' | 'faculty' | 'student'>('principal');

  // Search & Modal state
  const [weakSearch, setWeakSearch] = useState<string>('');
  const [subjectScope, setSubjectScope] = useState<'all' | 'single'>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentReport, setStudentReport] = useState<StudentProgressReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState<boolean>(false);

  // Student Query Modal State
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [querySubmitted, setQuerySubmitted] = useState(false);

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchPerformanceAnalytics({
        year: selectedYear,
        sem: selectedSem,
        dept: selectedDept,
        section: selectedSection,
        qp_type: selectedExamType,
      });
      setData(res);

      if (res.user_context?.role === 'HOD') setActiveTab('hod');
      else if (res.user_context?.role === 'FACULTY') setActiveTab('faculty');
      else if (res.user_context?.role === 'STUDENT') setActiveTab('student');
    } catch (err: any) {
      setError(err.message || 'Failed to load performance analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [selectedYear, selectedSem, selectedDept, selectedSection, selectedExamType]);

  const handleOpenReport = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setReportLoading(true);
    try {
      const rep = await fetchStudentProgressReport(studentId);
      setStudentReport(rep);
    } catch {
      setStudentReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const filteredWeakStudents = (data?.weak_students || []).filter(
    (s) =>
      s.name.toLowerCase().includes(weakSearch.toLowerCase()) ||
      s.reg_no.toLowerCase().includes(weakSearch.toLowerCase()) ||
      s.dept.toLowerCase().includes(weakSearch.toLowerCase())
  );

  // Department-wise Top vs Needs Improvement
  const sortedDepts = [...(data?.dept_comparison || [])].sort((a, b) => b.pass_rate_pct - a.pass_rate_pct);
  const topDepts = sortedDepts.slice(0, 3);
  const needsImpDepts = sortedDepts.slice(-3).reverse();

  // Mock Faculty-wise Performance data for HOD view
  const facultyList = [
    { name: 'Dr. S. Ramanathan', subject: 'Natural Language Processing (CS601)', passRate: 92, avgScore: 84 },
    { name: 'Prof. M. Kousalya', subject: 'Deep Learning Technologies (AI602)', passRate: 88, avgScore: 79 },
    { name: 'Dr. K. Arunkumar', subject: 'Internet of Things (EC603)', passRate: 74, avgScore: 68 },
    { name: 'Prof. R. Venkatesh', subject: 'Database Systems (CS302)', passRate: 65, avgScore: 59 },
  ];

  // Mock Mentees for Faculty view
  const menteeList = [
    { id: '101', name: 'Prasanna', reg: '23CS001', score: 86, attendance: 94, status: 'Excellent' },
    { id: '102', name: 'Arun Kumar', reg: '23CS002', score: 78, attendance: 89, status: 'Good' },
    { id: '103', name: 'Bala Krishnan', reg: '23CS003', score: 48, attendance: 72, status: 'At Risk' },
    { id: '104', name: 'Chitra Devi', reg: '23CS004', score: 54, attendance: 81, status: 'Needs Support' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white py-8 px-6 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/20 backdrop-blur-md rounded-xl border border-blue-400/30">
                <BarChart3 className="w-8 h-8 text-blue-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                    Academic Performance & Analytics
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    Role-Based Auth System
                  </span>
                </div>
                <p className="text-slate-300 text-xs mt-1">
                  Hierarchical performance evaluation for Principal, HOD, Faculty, and Students
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadAnalytics}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium backdrop-blur-md border border-white/20 transition-all shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Global Context Filter Bar */}
      <div className="sticky top-16 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm py-3.5 px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>Academic Filters:</span>
          </div>

          {/* Year Filter */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All Academic Years</option>
            <option value="I">Year I</option>
            <option value="II">Year II</option>
            <option value="III">Year III</option>
            <option value="IV">Year IV</option>
          </select>

          {/* Semester Filter */}
          <select
            value={selectedSem}
            onChange={(e) => setSelectedSem(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                Semester {s}
              </option>
            ))}
          </select>

          {/* Department Filter (Locked for HOD) */}
          <div className="relative flex items-center">
            <select
              value={selectedDept}
              disabled={data?.user_context?.lock_department}
              onChange={(e) => setSelectedDept(e.target.value)}
              className={`px-3 py-1.5 text-xs font-semibold border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                data?.user_context?.lock_department
                  ? 'bg-slate-100 border-slate-300 text-slate-500 font-medium cursor-not-allowed pr-8'
                  : 'bg-slate-50 border-slate-300'
              }`}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
            {data?.user_context?.lock_department && (
              <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
            )}
          </div>

          {/* Section Filter */}
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All Sections</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
          </select>

          {/* Exam Type Filter */}
          <select
            value={selectedExamType}
            onChange={(e) => setSelectedExamType(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {EXAM_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Clear Filters */}
          {(selectedYear || selectedSem || (selectedDept && !data?.user_context?.lock_department) || selectedSection || selectedExamType) && (
            <button
              onClick={() => {
                setSelectedYear('');
                setSelectedSem('');
                if (!data?.user_context?.lock_department) setSelectedDept('');
                setSelectedSection('');
                setSelectedExamType('');
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold underline ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-6 mt-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ROLE-BASED DASHBOARD NAV TABS */}
        <div className="flex border-b border-slate-200 mb-6 space-x-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('principal')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'principal'
                ? 'border-blue-600 text-blue-600 bg-blue-50/70 shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Principal Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('hod')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'hod'
                ? 'border-blue-600 text-blue-600 bg-blue-50/70 shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>HOD Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('faculty')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'faculty'
                ? 'border-blue-600 text-blue-600 bg-blue-50/70 shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Faculty Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('student')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'student'
                ? 'border-blue-600 text-blue-600 bg-blue-50/70 shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Student Dashboard</span>
          </button>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-500 text-sm font-medium">Fetching real-time academic performance metrics...</p>
          </div>
        ) : (
          <>
            {/* 1. PRINCIPAL DASHBOARD HIERARCHY */}
            {activeTab === 'principal' && (
              <div className="space-y-8">
                {/* College Overall Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <KpiCard
                    icon={<Users className="w-6 h-6 text-blue-600" />}
                    title="College Overall Enrolled"
                    value={data?.metrics.total_students || 0}
                    subtitle="Active students in scope"
                    gradient="from-blue-50 to-indigo-50 border-blue-200"
                  />
                  <KpiCard
                    icon={<BookOpen className="w-6 h-6 text-indigo-600" />}
                    title="Exams Evaluated"
                    value={data?.metrics.total_exams_taken || 0}
                    subtitle="CIA & Semester evaluations"
                    gradient="from-indigo-50 to-purple-50 border-indigo-200"
                  />
                  <KpiCard
                    icon={<Award className="w-6 h-6 text-emerald-600" />}
                    title="College Overall Pass %"
                    value={`${data?.metrics.overall_pass_pct || 0}%`}
                    subtitle="Institutional benchmark (>=50%)"
                    gradient="from-emerald-50 to-teal-50 border-emerald-200"
                  />
                  <KpiCard
                    icon={<TrendingUp className="w-6 h-6 text-purple-600" />}
                    title="College Avg Score %"
                    value={`${data?.metrics.overall_marks_pct || 0}%`}
                    subtitle="College-wide average"
                    gradient="from-purple-50 to-pink-50 border-purple-200"
                  />
                </div>

                {/* College Pass/Fail Trends Chart */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">College Pass / Fail Trends</h2>
                      <p className="text-slate-500 text-xs mt-0.5">Historical pass/fail distribution across continuous assessments</p>
                    </div>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data?.pass_fail_trends || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', color: '#fff' }} />
                        <Legend />
                        <Area type="monotone" dataKey="pass" name="Passed Exams" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                        <Area type="monotone" dataKey="fail" name="Failed Exams" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Department-wise Analysis: Top Performing vs Needs Improvement */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Performing Depts */}
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <ArrowUpRight className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-base font-bold text-slate-900">Top Performing Departments</h3>
                    </div>
                    <div className="space-y-3">
                      {topDepts.map((d, i) => (
                        <div key={d.dept_code} className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center">
                              #{i + 1}
                            </span>
                            <div>
                              <div className="font-bold text-slate-900 text-sm">{d.dept_code}</div>
                              <div className="text-[11px] text-slate-500">Avg Marks: {d.avg_marks_pct}%</div>
                            </div>
                          </div>
                          <span className="text-sm font-extrabold text-emerald-700">{d.pass_rate_pct}% Pass</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Needs Improvement Depts */}
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <ArrowDownRight className="w-5 h-5 text-amber-600" />
                      <h3 className="text-base font-bold text-slate-900">Needs Improvement Departments</h3>
                    </div>
                    <div className="space-y-3">
                      {needsImpDepts.map((d, i) => (
                        <div key={d.dept_code} className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            <div>
                              <div className="font-bold text-slate-900 text-sm">{d.dept_code}</div>
                              <div className="text-[11px] text-slate-500">Avg Marks: {d.avg_marks_pct}%</div>
                            </div>
                          </div>
                          <span className="text-sm font-extrabold text-amber-700">{d.pass_rate_pct}% Pass</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Department Stats Overview */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Department Stats Overview</h2>
                  <p className="text-slate-500 text-xs mb-6">Cross-department comparison of pass rates and average scores</p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.dept_comparison || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="dept_code" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', color: '#fff' }} />
                        <Legend />
                        <Bar dataKey="pass_rate_pct" name="Pass Rate %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg_marks_pct" name="Avg Marks %" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* 2. HOD DASHBOARD HIERARCHY */}
            {activeTab === 'hod' && (
              <div className="space-y-8">
                {/* Department Header */}
                <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white rounded-2xl p-6 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">HOD Scope</span>
                    <h2 className="text-xl font-bold mt-1">
                      {data?.user_context?.department || 'Department'} Performance Dashboard
                    </h2>
                    <p className="text-slate-300 text-xs mt-1">
                      Department stats overview, student filtering, and faculty subject management
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-extrabold text-emerald-400">
                      {data?.metrics.overall_pass_pct || 0}%
                    </span>
                    <p className="text-slate-400 text-xs">Overall Department Pass Rate</p>
                  </div>
                </div>

                {/* Subject-wise Analysis & Faculty Management */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Faculty & Subject Management</h2>
                  <p className="text-slate-500 text-xs mb-4">Subject-wise analysis and assigned faculty metrics</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-700">
                      <thead className="bg-slate-50 font-bold text-xs uppercase text-slate-600 border-b">
                        <tr>
                          <th className="p-3">Faculty Name</th>
                          <th className="p-3">Assigned Subject</th>
                          <th className="p-3 text-center">Pass Rate %</th>
                          <th className="p-3 text-right">Avg Score %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {facultyList.map((f, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">{f.name}</td>
                            <td className="p-3 text-slate-600">{f.subject}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                f.passRate >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {f.passRate}%
                              </span>
                            </td>
                            <td className="p-3 text-right font-bold text-slate-900">{f.avgScore}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Filter & View Individual Student Profile Section */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Students Performance</h2>
                      <p className="text-slate-500 text-xs">Filter by Year / Sem / Section and view student profiles</p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-4 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold text-slate-600">Active Filters:</span>
                    <span className="px-2.5 py-1 bg-white border rounded-lg text-xs font-semibold text-slate-700">
                      Year: {selectedYear || 'All'}
                    </span>
                    <span className="px-2.5 py-1 bg-white border rounded-lg text-xs font-semibold text-slate-700">
                      Sem: {selectedSem || 'All'}
                    </span>
                    <span className="px-2.5 py-1 bg-white border rounded-lg text-xs font-semibold text-slate-700">
                      Section: {selectedSection || 'All'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. FACULTY DASHBOARD HIERARCHY */}
            {activeTab === 'faculty' && (
              <div className="space-y-8">
                {/* My Assigned Classes */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">My Assigned Classes - Performance Analytics</h2>
                      <p className="text-slate-500 text-xs mt-0.5">Subject performance overview for assigned class sections</p>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setSubjectScope('all')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                          subjectScope === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        All Subjects
                      </button>
                      <button
                        onClick={() => setSubjectScope('single')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                          subjectScope === 'single' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Single Subject
                      </button>
                    </div>
                  </div>

                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.subject_performance || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="course_code" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', color: '#fff' }} />
                        <Bar dataKey="avg_marks_pct" name="Average Score %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Assigned Mentees Comparison */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Assigned Mentees Performance</h2>
                  <p className="text-slate-500 text-xs mb-4">Individual mentee scores, attendance, and overall comparison</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {menteeList.map((m) => (
                      <div key={m.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs font-bold text-slate-500">{m.reg}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.status === 'Excellent' ? 'bg-emerald-100 text-emerald-700' :
                            m.status === 'Good' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {m.status}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm mb-2">{m.name}</h4>
                        <div className="space-y-1 text-xs text-slate-600">
                          <div>Marks: <strong className="text-slate-900">{m.score}%</strong></div>
                          <div>Attendance: <strong className="text-slate-900">{m.attendance}%</strong></div>
                        </div>
                        <button
                          onClick={() => handleOpenReport(m.id)}
                          className="mt-3 w-full py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Profile Report
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 4. STUDENT DASHBOARD HIERARCHY */}
            {activeTab === 'student' && (
              <div className="space-y-8">
                {/* My Profile Header */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-5">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-extrabold text-2xl flex items-center justify-center shadow-md">
                    P
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h2 className="text-xl font-bold text-slate-900">Prasanna (My Profile)</h2>
                    <p className="text-xs text-slate-500">Reg No: 23CS001 | Dept: CSE | Semester: 6 (Sec A)</p>
                    <div className="mt-3 flex flex-wrap gap-2 justify-center sm:justify-start">
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold">
                        CGPA: 8.42
                      </span>
                      <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold">
                        Attendance: 92%
                      </span>
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => setShowQueryModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Submit Query / Grievance
                    </button>
                  </div>
                </div>

                {/* Academic Records: Exam Marks & Personal Growth Graph */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Academic Records & Personal Growth Graph</h2>
                  <p className="text-slate-500 text-xs mb-6">Semester-over-semester score progression</p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={[
                          { semester: 'Sem 1', score: 76 },
                          { semester: 'Sem 2', score: 81 },
                          { semester: 'Sem 3', score: 79 },
                          { semester: 'Sem 4', score: 85 },
                          { semester: 'Sem 5', score: 88 },
                          { semester: 'Sem 6', score: 91 },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="semester" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="score" name="Marks Score %" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* TARGET ACTION NODE: WEAK / AT-RISK STUDENTS & GENERATE PROGRESS REPORT TABLE */}
            <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <h2 className="text-lg font-bold text-slate-900">At-Risk & Weak Students Identification</h2>
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Students scoring below 50% average or with failed exam entries
                  </p>
                </div>

                <div className="relative w-full md:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search student or reg..."
                    value={weakSearch}
                    onChange={(e) => setWeakSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Reg No</th>
                      <th className="py-3.5 px-4">Student Name</th>
                      <th className="py-3.5 px-4">Dept / Sec</th>
                      <th className="py-3.5 px-4 text-center">Exams Passed</th>
                      <th className="py-3.5 px-4 text-right">Avg Score %</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-center">Generate Progress Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredWeakStudents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-sm">
                          No weak or at-risk students found matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredWeakStudents.map((s) => (
                        <tr key={s.student_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{s.reg_no}</td>
                          <td className="py-3.5 px-4 font-semibold text-slate-900">{s.name}</td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {s.dept} - Sec {s.section || 'A'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                              {s.passed_exams} / {s.total_exams} Passed
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                            {s.avg_score_pct}%
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                s.status === 'Critical'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleOpenReport(s.student_id)}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Generate Progress Report
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* STUDENT PROGRESS REPORT MODAL */}
      {selectedStudentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 relative my-8">
            <button
              onClick={() => {
                setSelectedStudentId(null);
                setStudentReport(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
            >
              <XCircle className="w-6 h-6" />
            </button>

            {reportLoading ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Generating student progress report...</p>
              </div>
            ) : studentReport ? (
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Student Academic Progress Report</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Comprehensive examination & growth report</p>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-all shadow-sm"
                  >
                    <Printer className="w-4 h-4" />
                    Print Report
                  </button>
                </div>

                {/* Profile Summary Card */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col sm:flex-row items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 font-bold text-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                    {studentReport.student_info.photo ? (
                      <img
                        src={studentReport.student_info.photo}
                        alt="Student"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      studentReport.student_info.name.charAt(0)
                    )}
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h3 className="font-bold text-slate-900 text-lg">{studentReport.student_info.name}</h3>
                    <p className="text-xs text-slate-500">
                      Reg No: <span className="font-mono font-medium text-slate-800">{studentReport.student_info.reg_no}</span> | Dept: {studentReport.student_info.dept} ({studentReport.student_info.section})
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 justify-center sm:justify-start text-xs font-semibold">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                        Overall Score: {studentReport.student_info.overall_score_pct}%
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                        Exams Passed: {studentReport.student_info.passed_exams} / {studentReport.student_info.total_exams}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Semester Growth Line Graph */}
                <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3">
                    Semester-over-Semester Growth Graph
                  </h4>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={studentReport.growth_graph}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="semester" stroke="#64748b" fontSize={11} />
                        <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="score_pct" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Subject Results Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700 border border-slate-200 rounded-lg">
                    <thead className="bg-slate-100 font-semibold text-slate-700">
                      <tr>
                        <th className="py-2 px-3">Subject</th>
                        <th className="py-2 px-3">Exam</th>
                        <th className="py-2 px-3 text-right">Score</th>
                        <th className="py-2 px-3 text-center">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentReport.subject_results.map((sub, i) => (
                        <tr key={i}>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-900">{sub.course_code}</div>
                            <div className="text-[10px] text-slate-500">{sub.course_name}</div>
                          </td>
                          <td className="py-2 px-3 text-slate-600">{sub.exam_name}</td>
                          <td className="py-2 px-3 text-right font-bold">
                            {sub.total_mark} / {sub.max_mark}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                sub.is_pass ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {sub.is_pass ? 'PASS' : 'FAIL'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">Unable to load report details.</p>
            )}
          </div>
        </div>
      )}

      {/* STUDENT QUERY / GRIEVANCE MODAL */}
      {showQueryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => {
                setShowQueryModal(false);
                setQuerySubmitted(false);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <XCircle className="w-6 h-6" />
            </button>

            {querySubmitted ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h3 className="text-lg font-bold text-slate-900">Grievance Submitted</h3>
                <p className="text-xs text-slate-500">Your query has been forwarded to the HOD and Faculty Advisor for resolution.</p>
                <button
                  onClick={() => {
                    setShowQueryModal(false);
                    setQuerySubmitted(false);
                    setQueryText('');
                  }}
                  className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-lg font-bold text-slate-900">Student Academic Query / Grievance</h3>
                </div>
                <textarea
                  rows={4}
                  placeholder="Describe your academic query, re-evaluation request, or attendance grievance..."
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  onClick={() => setQuerySubmitted(true)}
                  disabled={!queryText.trim()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm disabled:opacity-50"
                >
                  Submit Grievance
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon, title, value, subtitle, gradient
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subtitle: string;
  gradient: string;
}) {
  return (
    <div className={`p-5 rounded-2xl border bg-gradient-to-br ${gradient} shadow-sm transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{title}</span>
        {icon}
      </div>
      <div className="text-3xl font-extrabold text-slate-900">{value}</div>
      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
    </div>
  );
}
