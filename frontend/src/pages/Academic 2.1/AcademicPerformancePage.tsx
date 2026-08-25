import { fetchDynamicOptions } from '../../services/academicVisuals';
import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  GraduationCap,
  Award,
  AlertTriangle,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  BookOpen,
  PieChart as PieIcon,
  LineChart as LineIcon,
  ChevronRight,
  UserCheck,
  Building2,
  Lock,
  RefreshCw,
  Sliders,
  X,
  BarChart2
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line
} from 'recharts';
import {
  fetchPerformanceAnalytics,
  fetchStudentProgressReport,
  fetchPublishedDashboards,
  searchStudents,
  compareStudents,
  fetchFacultyWiseAnalytics,
  fetchClassAdvisorDeepDive,
  fetchRangeAnalysis,
  fetchComparisonAnalytics,
  fetchStudentCurriculumMarks,
  fetchStudentAnalysisCharts,
  PerformanceAnalyticsResponse,
  StudentProgressReportResponse,
  FacultyWiseRow,
  ClassAdvisorDeepDiveResponse,
  RangeAnalysisResponse,
  ComparisonAnalyticsResponse,
  StudentCurriculumMarksResponse,
  StudentAnalysisChartsResponse
} from '../../services/academicPerformance';
import {
  DashboardDefinition,
  DashboardQueryResult,
  GlobalDashboardFilters,
  queryDashboardVisualData
} from '../../services/academicVisuals';

// Assessment options are discovered from the database via the analytics
// response (filter_options.exam_types / assessments). No hardcoded list.

export default function AcademicPerformancePage() {
  const [data, setData] = useState<PerformanceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Published Dashboards Switcher
  const [publishedDashboards, setPublishedDashboards] = useState<DashboardDefinition[]>([]);
  const [activeDashboardId, setActiveDashboardId] = useState<string>('overall_overview');

  // Multi-Selection State for Comparison View
  const [multiDepts, setMultiDepts] = useState<string[]>([]);
  const [multiBatches, setMultiBatches] = useState<string[]>([]);
  const [multiSems, setMultiSems] = useState<string[]>([]);
  const [multiSections, setMultiSections] = useState<string[]>([]);
  const [multiSubjects, setMultiSubjects] = useState<string[]>([]);
  const [multiExams, setMultiExams] = useState<string[]>(['CIA 1', 'CIA 2', 'Model Exam', 'Semester Exam']);

  const [comparisonResponse, setComparisonResponse] = useState<ComparisonAnalyticsResponse | null>(null);
  const [compLoading, setCompLoading] = useState<boolean>(false);

  // Load comparison views
  const loadComparisonData = async () => {
    setCompLoading(true);
    try {
      const res = await fetchComparisonAnalytics({
        depts: multiDepts,
        batches: multiBatches,
        sems: multiSems,
        sections: multiSections,
        subjects: multiSubjects,
        qp_types: multiExams
      });
      setComparisonResponse(res);
    } catch (e) {
      console.error(e);
    } finally {
      setCompLoading(false);
    }
  };

  useEffect(() => {
    if (activeDashboardId === 'comparison_view') {
      loadComparisonData();
    }
  }, [activeDashboardId, multiDepts, multiBatches, multiSems, multiSections, multiSubjects, multiExams]);

  const handleToggleMulti = (val: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (list.includes(val)) {
      setter(list.filter(x => x !== val));
    } else {
      setter([...list, val]);
    }
  };

  // Active Standard Tab
  const [activeTab, setActiveTab] = useState<'principal' | 'hod' | 'faculty' | 'advisor' | 'student' | 'range' | 'custom_dash' | ''>('');

  // Sticky Filters
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedSem, setSelectedSem] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedDeptName, setSelectedDeptName] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedExamType, setSelectedExamType] = useState<string>('');

  // When a batch is selected, auto-pick the semester(s) that actually exist for that
  // batch in the database (batch_semesters comes from the backend response).
  useEffect(() => {
    if (!selectedYear) return;
    const sems = data?.filter_options?.batch_semesters?.[selectedYear];
    if (sems && sems.length > 0) {
      setSelectedSem(String(sems[0]));
    } else if (data) {
      setSelectedSem('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, data?.filter_options?.batch_semesters]);

  // Search & Progress Report Modal
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentReport, setStudentReport] = useState<StudentProgressReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState<boolean>(false);

  // Faculty-Wise Data State
  const [faculties, setFaculties] = useState<FacultyWiseRow[]>([]);
  const [facultyLoading, setFacultyLoading] = useState<boolean>(false);

  // Class Advisor Deep Dive State
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorData, setAdvisorData] = useState<ClassAdvisorDeepDiveResponse | null>(null);

  const [studentCurriculumLoading, setStudentCurriculumLoading] = useState(false);
  const [studentCurriculumData, setStudentCurriculumData] = useState<StudentCurriculumMarksResponse | null>(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  const [studentChartsLoading, setStudentChartsLoading] = useState(false);
  const [studentChartsData, setStudentChartsData] = useState<StudentAnalysisChartsResponse | null>(null);

  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeData, setRangeData] = useState<RangeAnalysisResponse | null>(null);
  const [selectedRangeSubject, setSelectedRangeSubject] = useState<string>('');

  // Custom Dashboard Query Results (for Published Dashboards from Visual Admin)
  const [customVisualResults, setCustomVisualResults] = useState<Record<string, DashboardQueryResult>>({});
  const [customVisualLoading, setCustomVisualLoading] = useState<boolean>(false);
  const [dynamicOptions, setDynamicOptions] = useState<any>(null);

  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await fetchDynamicOptions();
        if (res) setDynamicOptions(res);
      } catch (err) {
        console.error('Failed to load dynamic options:', err);
      }
    }
    loadOptions();
  }, []);



  const loadInitialData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch Auth & Published Dashboards
      const dashRes = await fetchPublishedDashboards();
      setPublishedDashboards(dashRes.dashboards || []);

      // 2. Fetch Scoped Performance Analytics
      const res = await fetchPerformanceAnalytics({
        year: selectedYear,
        sem: selectedSem,
        dept: selectedDept,
        section: selectedSection,
        qp_type: selectedExamType,
      });
      setData(res);

      // Auto-set tab based on resolved role ONLY if it hasn't been set yet
      if (activeTab === '') {
        if (res.user_context?.is_principal) {
          setActiveTab('principal');
        } else if (res.user_context?.is_hod) {
          setActiveTab('hod');
          if (res.user_context.department_code) setSelectedDept(res.user_context.department_code);
        } else if (res.user_context?.is_advisor) {
          setActiveTab('advisor');
          if (res.user_context.department_code) setSelectedDept(res.user_context.department_code);
          if (res.user_context.advised_sections && res.user_context.advised_sections.length > 0) {
            setSelectedYear(res.user_context.advised_sections[0].batch || '');
            setSelectedSem(String(res.user_context.advised_sections[0].semester || ''));
          }
        } else if (res.user_context?.is_faculty) {
          setActiveTab('faculty');
          if (res.user_context.department_code) setSelectedDept(res.user_context.department_code);
        } else if (res.user_context?.is_student) {
          setActiveTab('student');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load academic performance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [selectedYear, selectedSem, selectedDept, selectedSection, selectedExamType]);

  // Dynamic section options come straight from the backend response (department/batch/sem aware)
  const sectionOptions: string[] = data?.filter_options?.sections || [];
  const assessmentOptions: string[] = data?.filter_options?.exam_types || data?.filter_options?.assessments || [];
  const batchList: string[] = data?.filter_options?.batches || dynamicOptions?.batches || [];
  const semesterList: Array<number | string> = data?.filter_options?.semesters || [];

    // Reset all college-level filters back to default and restore the College view.
  const handleResetFilters = () => {
    setSelectedYear('');
    setSelectedSem('');
    setSelectedDept('');
    setSelectedDeptName('');
    setSelectedSection('');
    setSelectedExamType('');
    // Always return to the pure College-level view (KPI cards + Department-wise table),
    // regardless of role — never back into a Department/Faculty drill-down.
    setActiveTab('');
    setActiveDashboardId('overall_overview');
  };

  // Navigate to the College-level overview (used by breadcrumb + reset).
  const goCollegeOverview = () => {
    setSelectedDept('');
    setSelectedDeptName('');
    setSelectedSection('');
    setActiveTab('');
    setActiveDashboardId('overall_overview');
  };

  // Load Faculty Wise when tab is switched
  useEffect(() => {
    if (activeTab === 'faculty' || activeTab === 'hod') {
      setFacultyLoading(true);
      fetchFacultyWiseAnalytics(selectedDept)
        .then(res => setFaculties(res))
        .finally(() => setFacultyLoading(false));
    }
  }, [activeTab, selectedDept]);

  // Load Class Advisor when tab is switched
  useEffect(() => {
    if (activeTab === 'advisor') {
      setAdvisorLoading(true);
      const targetSecId = data?.user_context?.advised_sections?.[0]?.section_id
        ? String(data.user_context.advised_sections[0].section_id)
        : '1';
      fetchClassAdvisorDeepDive(targetSecId)
        .then(res => setAdvisorData(res))
        .finally(() => setAdvisorLoading(false));
    }
  }, [activeTab, data?.user_context]);

  // Load Range Analysis when tab is switched
  useEffect(() => {
    if (activeTab === 'range') {
      fetchRangeAnalysis().then(res => setRangeData(res));
    }
  }, [activeTab]);

  // Load Student Curriculum Marks when tab is switched or filters change
  useEffect(() => {
    if (activeTab === 'student') {
      setStudentCurriculumLoading(true);
      fetchStudentCurriculumMarks({
        year: selectedYear,
        sem: selectedSem,
        dept: selectedDept,
        exam: selectedExamType,
        q: studentSearchQuery
      })
        .then(res => setStudentCurriculumData(res))
        .finally(() => setStudentCurriculumLoading(false));
    }
  }, [activeTab, selectedYear, selectedSem, selectedDept, selectedExamType, studentSearchQuery]);


  const [isStudentChartsModalOpen, setIsStudentChartsModalOpen] = useState(false);

  const handleOpenStudentCharts = async (studentId: string) => {
    setStudentChartsLoading(true);
    setIsStudentChartsModalOpen(true);
    try {
      const data = await fetchStudentAnalysisCharts(studentId, selectedExamType);
      setStudentChartsData(data);
    } catch (e) {
      console.error('Failed to load student charts', e);
    } finally {
      setStudentChartsLoading(false);
    }
  };

  // Load Custom Published Dashboard when selected from switcher
  const handleSelectDashboard = async (dashId: string) => {
    setActiveDashboardId(dashId);
    if (dashId === 'overall_overview') {
      setActiveTab(data?.user_context?.is_principal ? 'principal' : (data?.user_context?.is_hod ? 'hod' : 'faculty'));
      return;
    }
    if (dashId === 'student_analysis') {
      setActiveTab('student');
      return;
    }
    if (dashId === 'faculty_analysis') {
      setActiveTab('faculty');
      return;
    }
    if (dashId === 'advisor_deepdive') {
      setActiveTab('advisor');
      return;
    }
    if (dashId === 'range_analysis') {
      setActiveTab('range');
      return;
    }

    // It is a custom published dashboard from Visual Admin
    const targetDash = publishedDashboards.find(d => d.id === dashId);
    if (targetDash) {
      setActiveTab('custom_dash');
      setCustomVisualLoading(true);
      const results: Record<string, DashboardQueryResult> = {};
      for (const vis of targetDash.visuals) {
        try {
          const multiFilters: GlobalDashboardFilters = {
            academicYears: (selectedYear || targetDash.academicYear) ? [selectedYear || targetDash.academicYear!] : (targetDash.multiFilters?.academicYears || []),
            departments: (selectedDept || targetDash.department) ? [selectedDept || targetDash.department!] : (targetDash.multiFilters?.departments || []),
            semesters: (selectedSem || targetDash.semester) ? [String(selectedSem || targetDash.semester)] : (targetDash.multiFilters?.semesters || []),
            sections: targetDash.multiFilters?.sections || [],
            subjectNames: targetDash.multiFilters?.subjectNames || [],
            subjectCodes: targetDash.multiFilters?.subjectCodes || [],
            tests: targetDash.multiFilters?.tests || [],
            courseCategories: targetDash.multiFilters?.courseCategories || [],
            assessmentTypes: targetDash.multiFilters?.assessmentTypes || [],
            performanceLevels: targetDash.multiFilters?.performanceLevels || [],
          };
          const res = await queryDashboardVisualData(multiFilters, vis);
          results[vis.id] = res;
        } catch (e) {
          console.error(`Failed querying visual ${vis.id}:`, e);
        }
      }
      setCustomVisualResults(results);
      setCustomVisualLoading(false);
    }
  };

  const handleOpenReport = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setReportLoading(true);
    try {
      const rep = await fetchStudentProgressReport(studentId, selectedExamType);
      setStudentReport(rep);
    } catch {
      setStudentReport(null);
    } finally {
      setReportLoading(false);
    }
  };



  const sortedDepts = [...(data?.dept_comparison || [])].sort((a, b) => b.pass_rate_pct - a.pass_rate_pct);
  const topDepts = sortedDepts.slice(0, 3);
  const needsImpDepts = sortedDepts.slice(-3).reverse();

  // Comparison View derived variables
  const userCtx = data?.user_context;
  const departmentOptions = comparisonResponse?.departments_list || [];
  const batchOptions = comparisonResponse?.batches_list || [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white py-7 px-6 shadow-md">
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
                    Role-Based Scoped Boundary
                  </span>
                </div>
                <p className="text-slate-300 text-xs mt-1">
                  Hierarchical real-time performance evaluation for Principal, HOD, Faculty, Class Advisors, and Students
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadInitialData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium backdrop-blur-md border border-white/20 transition-all shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Analytics
            </button>
          </div>
        </div>
      </div>
      {/* Interactive Hierarchy Breadcrumb Navigation */}
      <div className="bg-slate-900/90 text-slate-300 py-2.5 px-6 border-t border-blue-500/20 text-xs font-semibold">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto">
                    <button 
            onClick={goCollegeOverview}
            className="hover:text-white transition-colors flex items-center gap-1.5 text-blue-400 font-bold"
          >
            <Building2 className="w-3.5 h-3.5" /> College
          </button>
          {selectedDept && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              <button 
                onClick={() => {
                  setSelectedSection('');
                  setActiveTab('hod');
                  setActiveDashboardId('overall_overview');
                }}
                className={`hover:text-white transition-colors ${activeTab === 'hod' ? 'text-white font-bold' : 'text-slate-300'}`}
              >
                {selectedDeptName || selectedDept}
              </button>
            </>
          )}
          {(activeTab === 'faculty' || activeTab === 'hod') && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-white font-bold">Faculty Analysis</span>
            </>
          )}
          {activeTab === 'advisor' && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-white font-bold">Advisor / Section Deep-Dive</span>
            </>
          )}
          {activeTab === 'student' && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-white font-bold">Student Analysis</span>
            </>
          )}
          {activeTab === 'range' && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-white font-bold">Performance Range Analysis</span>
            </>
          )}
          {activeTab === 'custom_dash' && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-white font-bold">
                {publishedDashboards.find(d => d.id === activeDashboardId)?.name || 'Custom Dashboard'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Sticky Global Context Filter Bar */}
      <div className="sticky top-16 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm py-3.5 px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <span>Filters:</span>
            </div>

            {/* Batch Filter */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All Batches</option>
              {(batchList || []).map((yr: string) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>

            {/* Semester Filter */}
            <select
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All Semesters</option>
              {(semesterList || []).map((s) => (
                <option key={String(s)} value={String(s)}>
                  Semester {String(s)}
                </option>
              ))}
            </select>

            {/* Department Filter (Locked for HOD) */}
            <div className="relative flex items-center">
              <select
                value={selectedDept}
                disabled={data?.user_context?.lock_department}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setSelectedSection('');
                }}
                className={`px-3 py-1.5 text-xs font-semibold border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                  data?.user_context?.lock_department
                    ? 'bg-slate-100 border-slate-300 text-slate-500 font-medium cursor-not-allowed pr-8'
                    : 'bg-slate-50 border-slate-300'
                }`}
              >
                <option value="">All Departments</option>
                {(dynamicOptions?.departments || []).map((d: any) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
              {data?.user_context?.lock_department && (
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
              )}
            </div>

            {/* Section Filter — options are dynamic per department from the backend */}
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All Sections</option>
              {(sectionOptions || []).map((sec) => (
                <option key={sec} value={sec}>
                  Section {sec}
                </option>
              ))}
            </select>

            {/* Exam Type Filter */}
            <select
              value={selectedExamType}
              onChange={(e) => setSelectedExamType(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All Assessments</option>
              {assessmentOptions.map((name) => (
                <option key={name} value={name}>
                  {name === 'Semester' ? 'Semester Exam' : name}
                </option>
              ))}
            </select>

            {/* Reset Filters */}
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors ml-1"
              title="Clear all filters and return to the College overview"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Filters
            </button>
          </div>

          {/* Dashboard Switcher Button Row */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
            <span className="text-xs font-bold text-slate-500 mr-1 whitespace-nowrap">Active View:</span>
            <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl whitespace-nowrap">
              <button
                type="button"
                onClick={() => handleSelectDashboard('overall_overview')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeDashboardId === 'overall_overview'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                Overall Academic/Attendance Analysis
              </button>
              <button
                type="button"
                onClick={() => handleSelectDashboard('student_analysis')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeDashboardId === 'student_analysis'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                Individual Student Analysis
              </button>
              <button
                type="button"
                onClick={() => handleSelectDashboard('faculty_analysis')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeDashboardId === 'faculty_analysis'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                Faculty-Wise Analysis
              </button>
              {data?.user_context?.is_advisor && (
                <button
                  type="button"
                  onClick={() => handleSelectDashboard('advisor_deepdive')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activeDashboardId === 'advisor_deepdive'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Class Advisor Deep-Dive
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSelectDashboard('range_analysis')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeDashboardId === 'range_analysis'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                Performance Range Analysis
              </button>
              <button
                type="button"
                onClick={() => handleSelectDashboard('comparison_view')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeDashboardId === 'comparison_view'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                Comparison View
              </button>
              {publishedDashboards.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelectDashboard(d.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activeDashboardId === d.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  ★ {d.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 pt-6 space-y-6">
                {activeDashboardId === 'overall_overview' && (activeTab === '' || activeTab === 'principal') && !loading && data?.metrics && data.metrics.total_exams_taken === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-800 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            No academic data available for the selected filters.
          </div>
        )}
                {/* Metric Cards Row - College Level (Exact 5 Primary KPI Cards) */}
        {(activeTab === '' || activeTab === 'principal') && activeDashboardId === 'overall_overview' && !loading && data?.metrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 animate-in fade-in-50">
            {/* 1. Total No. of Students */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total No. of Students</p>
                <h3 className="text-2xl font-black text-slate-900 mt-1">
                  {data?.metrics?.total_students !== undefined ? data.metrics.total_students.toLocaleString() : '—'}
                </h3>
                <p className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Live Enrollment
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                <Users className="w-6 h-6" />
              </div>
            </div>

            {/* 2. Overall Pass Percentage */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Pass Percentage</p>
                <h3 className="text-2xl font-black text-slate-900 mt-1">
                  {data?.metrics?.overall_pass_pct !== undefined ? `${data.metrics.overall_pass_pct}%` : '—'}
                </h3>
                <p className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Pass Rate
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
                <Award className="w-6 h-6" />
              </div>
            </div>

            {/* 3. Overall Average Marks */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Average Marks</p>
                <h3 className="text-2xl font-black text-slate-900 mt-1">
                  {data?.metrics?.overall_marks_pct !== undefined ? `${data.metrics.overall_marks_pct}%` : '—'}
                </h3>
                <p className="text-xs text-indigo-600 font-semibold mt-1 flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5" /> Institutional Avg
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
                <GraduationCap className="w-6 h-6" />
              </div>
            </div>

            {/* 4. Overall Attendance */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Attendance</p>
                <h3 className="text-2xl font-black text-slate-900 mt-1">
                  {data?.metrics?.overall_attendance != null ? `${data.metrics.overall_attendance}%` : '—'}
                </h3>
                <p className="text-xs text-blue-600 font-semibold mt-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Present / OD Rate
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600 border border-sky-100">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            {/* 5. Overall Pass / Fail Count */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Pass / Fail Count</p>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  <span className="text-emerald-600">{data?.metrics?.overall_pass_count !== undefined ? data.metrics.overall_pass_count : '—'}</span>
                  <span className="text-slate-400 font-normal mx-1">/</span>
                  <span className="text-rose-600">{data?.metrics?.overall_fail_count !== undefined ? data.metrics.overall_fail_count : '—'}</span>
                </h3>
                <p className="text-xs text-slate-500 font-semibold mt-1 flex items-center gap-1">
                  Unique Students
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </div>
        )}

        {/* View Mode: Custom Published Dashboard */}
        {activeTab === 'custom_dash' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div>
                                <h2 className="text-lg font-bold text-slate-900">
                    {publishedDashboards.find(d => d.id === activeDashboardId)?.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Published dynamic visual layout
                  </p>
                </div>
                <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold">
                  Published Visual Canvas
                </span>
              </div>

              {customVisualLoading ? (
                <div className="py-20 text-center">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-600">Executing live visual queries...</p>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-6">
                  {publishedDashboards.find(d => d.id === activeDashboardId)?.visuals.map((vis) => {
                    const result = customVisualResults[vis.id];
                    const w = vis.layout?.w || 12;
                    const colSpan = w <= 4 ? 'col-span-12 lg:col-span-4' : w <= 6 ? 'col-span-12 lg:col-span-6' : w <= 8 ? 'col-span-12 lg:col-span-8' : 'col-span-12';
                    const chartData = result?.pivotedData?.length ? result.pivotedData : result?.rows || [];
                    return (
                      <div key={vis.id} className={`${colSpan} bg-slate-50/50 p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between`}>
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-slate-800">{vis.title}</h4>
                          <p className="text-xs text-slate-500">{vis.aggregation} of {vis.yAxisField} by {vis.xAxisField}</p>
                        </div>
                        <div className="h-64 w-full min-w-0">
                          {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                              <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748B' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                <Bar dataKey="value" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs text-slate-400">
                              No data records available for current slicers
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* View Mode: Principal / HOD Overview */}
        {(activeTab === 'principal' || activeTab === 'hod') && (
          <div className="space-y-6 animate-in fade-in-50">
            {/* Department Comparison Chart */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-4">Department-Wise Academic Performance Comparison</h3>
              <div className="h-72 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={data?.dept_comparison || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="dept_code" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748B' }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend />
                    <Bar dataKey="pass_rate_pct" name="Pass Rate (%)" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="avg_marks_pct" name="Average Marks (%)" fill="#10B981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Department-wise Academic Performance Table */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Department-wise Academic Performance</h3>
                  <p className="text-xs text-slate-500">Click any department row to drill down into detailed Department Analysis</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4 text-center">Total Students</th>
                      <th className="py-3 px-4 text-center">Pass %</th>
                      <th className="py-3 px-4 text-center">Average Marks %</th>
                      <th className="py-3 px-4 text-center">Attendance %</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data?.dept_comparison || []).map((d) => (
                      <tr 
                        key={d.dept_code} 
                                                onClick={() => {
                          setSelectedDept(d.dept_code);
                          setSelectedDeptName(d.dept_name);
                          setSelectedSection('');
                          setActiveTab('hod');
                          setActiveDashboardId('overall_overview');
                        }}
                        className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                      >
                        <td className="py-3.5 px-4 font-bold text-slate-900 group-hover:text-blue-600">
                          {d.dept_name} ({d.dept_code})
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold text-slate-700">
                          {d.total_students ?? d.total_records ?? '—'}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-600">
                          {d.pass_rate_pct}%
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-blue-600">
                          {d.avg_marks_pct}%
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                          {(d.attendance_pct ?? data?.metrics?.overall_attendance) != null ? `${d.attendance_pct ?? data?.metrics?.overall_attendance}%` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
                            Drill Down <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

                        
        {/* View Mode: Faculty-Wise (Handled Subjects & Mentees) */}
        {(activeTab === 'faculty' || activeTab === 'hod') && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Faculty Academic Portfolio & Assigned Mentees</h3>
                  <p className="text-xs text-slate-500">Personally handled subjects, pass rate performance, and assigned student mentees</p>
                </div>
              </div>

              {facultyLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500">Loading faculty academic portfolio...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {faculties.map((fac) => (
                    <div key={fac.faculty_id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                        <div>
                          <h4 className="text-sm font-black text-slate-900">{fac.name}</h4>
                          <p className="text-xs text-slate-500">{fac.designation} • Dept: {fac.department} • ID: {fac.staff_id}</p>
                        </div>
                        {fac.class_advisor && (
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-bold flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5" /> Class Advisor: Sec {fac.class_advisor.section_name} ({fac.class_advisor.department})
                          </span>
                        )}
                      </div>

                      {/* Handled Subjects */}
                      <div>
                        <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Handled Courses (Click to open Subject Analysis)</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {fac.handled_subjects.map((sub) => (
                            <div 
                              key={sub.id} 
                              onClick={() => {
                                setSelectedRangeSubject(sub.subject_code);
                                setActiveTab('range');
                              }}
                              className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs hover:border-blue-500 hover:shadow-md cursor-pointer transition-all group"
                            >
                              <span className="text-xs font-bold text-slate-900 block truncate group-hover:text-blue-600">{sub.subject_name}</span>
                              <p className="text-[11px] text-slate-500">{sub.subject_code} • Section {sub.section}</p>
                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs">
                                <span className="font-semibold text-emerald-600">Pass: {sub.pass_percentage}%</span>
                                <span className="font-semibold text-blue-600">Avg: {sub.avg_score}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Assigned Mentees */}
                      <div>
                        <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Assigned Mentees (Holistic Semester Performance)</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {fac.mentees.map((m) => (
                            <div key={m.student_id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                              <div>
                                <span className="text-xs font-bold text-slate-900 block">{m.name}</span>
                                <p className="text-[11px] text-slate-400">{m.reg_no}</p>
                                <span className={`text-[10px] font-bold mt-1 inline-block px-2 py-0.5 rounded-full ${
                                  m.performance_level === 'Above 58%' ? 'bg-emerald-50 text-emerald-700' :
                                  m.performance_level === 'Equal to 58%' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {m.performance_level}
                                </span>
                              </div>
                              <button
                                onClick={() => handleOpenReport(m.student_id)}
                                className="p-1.5 bg-slate-50 hover:bg-blue-50 text-blue-600 rounded-lg"
                                title="View Mentee Progress"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* View Mode: Class Advisor Deep-Dive */}
        {activeTab === 'advisor' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Class Advisor Dashboard: Section {advisorData?.section_info?.section_name || 'A'} ({advisorData?.section_info?.department || 'CSE'})
                  </h3>
                  <p className="text-xs text-slate-500">Comprehensive section analytics, top & low scorers, and course pass rates</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold">
                  <div className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl">
                    Class Avg: {advisorData?.section_info?.class_average || 71.8}%
                  </div>
                  <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl">
                    Pass Rate: {advisorData?.section_info?.pass_percentage || 88.5}%
                  </div>
                </div>
              </div>

              {/* Top & Low Scorers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-3">Top 5 Scorers</h4>
                  <div className="space-y-2">
                    {advisorData?.top_scorers.map(s => (
                      <div key={s.student_id} className="p-2.5 bg-white rounded-xl border border-emerald-100 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">{s.name} ({s.reg_no})</span>
                        <span className="font-black text-emerald-600">{s.avg_score}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100">
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3">5 Students Requiring Immediate Support</h4>
                  <div className="space-y-2">
                    {advisorData?.low_scorers.map(s => (
                      <div key={s.student_id} className="p-2.5 bg-white rounded-xl border border-amber-100 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">{s.name} ({s.reg_no})</span>
                        <span className="font-black text-amber-700">{s.avg_score}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Subject Matrix */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Course Performance Matrix</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">Subject</th>
                        <th className="py-2.5 px-4">Code</th>
                        <th className="py-2.5 px-4">Average</th>
                        <th className="py-2.5 px-4">Highest</th>
                        <th className="py-2.5 px-4">Lowest</th>
                        <th className="py-2.5 px-4">Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {advisorData?.subject_matrix.map(sub => (
                        <tr key={sub.subject_code}>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{sub.subject_name}</td>
                          <td className="py-2.5 px-4 text-slate-500">{sub.subject_code}</td>
                          <td className="py-2.5 px-4 font-semibold text-blue-600">{sub.avg_marks}%</td>
                          <td className="py-2.5 px-4 font-semibold text-emerald-600">{sub.highest_marks}</td>
                          <td className="py-2.5 px-4 font-semibold text-rose-600">{sub.lowest_marks}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{sub.pass_percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Mode: Comparison View */}
        {activeDashboardId === 'comparison_view' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Multi-Comparison Analytics</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select multiple dimensions below to render live comparative performance analytics
                </p>
              </div>

              {/* Multi-Select Selectors Layout */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Multi Department Filter */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Departments</label>
                  <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 text-xs space-y-1">
                    {departmentOptions.map((d: any) => {
                      const isChecked = multiDepts.includes(d.id);
                      return (
                        <label key={d.id} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={userCtx?.lock_department}
                            onChange={() => handleToggleMulti(d.id, multiDepts, setMultiDepts)}
                            className="rounded text-blue-600"
                          />
                          <span className="truncate">{d.short_name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Multi Batches Filter */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Batches</label>
                  <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 text-xs space-y-1">
                    {batchOptions.map((b: string) => {
                      const isChecked = multiBatches.includes(b);
                      return (
                        <label key={b} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleMulti(b, multiBatches, setMultiBatches)}
                            className="rounded text-blue-600"
                          />
                          <span>{b}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Multi Semesters Filter */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Semesters</label>
                  <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 text-xs space-y-1">
                    {['1', '2', '3', '4', '5', '6', '7', '8'].map((s: string) => {
                      const isChecked = multiSems.includes(s);
                      return (
                        <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleMulti(s, multiSems, setMultiSems)}
                            className="rounded text-blue-600"
                          />
                          <span>Sem {s}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Multi Sections Filter */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Sections</label>
                  <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 text-xs space-y-1">
                    {['A', 'B', 'C', 'D'].map((s: string) => {
                      const isChecked = multiSections.includes(s);
                      return (
                        <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleMulti(s, multiSections, setMultiSections)}
                            className="rounded text-blue-600"
                          />
                          <span>Sec {s}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Multi Subjects Filter */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Course Subjects</label>
                  <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 text-xs space-y-1">
                    {(comparisonResponse?.subjects_list || []).map((sub: any) => {
                      const isChecked = multiSubjects.includes(sub.id);
                      return (
                        <label key={sub.id} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleMulti(sub.id, multiSubjects, setMultiSubjects)}
                            className="rounded text-blue-600"
                          />
                          <span className="truncate">{sub.name} ({sub.code})</span>
                        </label>
                      );
                    })}
                    {(!comparisonResponse?.subjects_list || comparisonResponse?.subjects_list.length === 0) && (
                      <span className="text-slate-400 block text-center mt-4">Select batch & semester to load courses</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Visual Result Line Chart */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Line Progression Chart
                  </h4>
                </div>

                {compLoading ? (
                  <div className="py-20 text-center">
                    <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-500">Aggregating comparative marks data...</p>
                  </div>
                ) : comparisonResponse?.line_series && comparisonResponse.line_series.length > 0 ? (
                  <div className="h-96 w-full min-w-0" style={{ minHeight: '380px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={350}>
                      <LineChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="exam" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} label={{ value: 'Average Marks (%)', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748B' }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Legend wrapperStyle={{ paddingTop: 10 }} />
                        {comparisonResponse.line_series.map((series, idx) => {
                          const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
                          const strokeColor = colors[idx % colors.length];
                          return (
                            <Line
                              key={series.name}
                              data={series.data}
                              dataKey="score"
                              name={series.name}
                              stroke={strokeColor}
                              strokeWidth={3}
                              dot={{ r: 5, strokeWidth: 2 }}
                              activeDot={{ r: 7 }}
                              type="monotone"
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-20 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-3xl">
                    <Sliders className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    Please check/select filters above to plot comparison lines
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* View Mode: Range Analysis */}
        {activeTab === 'range' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-4">Academic Score Range Distribution</h3>
              <div className="h-72 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={rangeData?.range_distribution || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="student_count" name="Student Count" fill="#6366F1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* View Mode: Individual Student Analysis */}
        {activeTab === 'student' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <h3 className="text-base font-bold text-slate-900">Student Subject Marks & Curriculum Analysis</h3>
                <div className="relative max-w-sm w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by Reg No or Name..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {studentCurriculumLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-medium">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-xl whitespace-nowrap">Reg No</th>
                        <th className="px-4 py-3 whitespace-nowrap">Name</th>
                        <th className="px-4 py-3 whitespace-nowrap">Dept / Sec</th>
                        {studentCurriculumData?.subjects.map(sub => (
                          <th key={sub.id} className="px-4 py-3 whitespace-nowrap text-center" title={sub.name}>
                            {sub.code}
                          </th>
                        ))}
                        <th className="px-4 py-3 whitespace-nowrap text-center rounded-tr-xl">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentCurriculumData?.students.length === 0 ? (
                        <tr>
                          <td colSpan={(studentCurriculumData?.subjects.length || 0) + 4} className="px-4 py-8 text-center text-slate-500">
                            No students found for this selection.
                          </td>
                        </tr>
                      ) : (
                        studentCurriculumData?.students.map((student) => (
                          <tr key={student.student_id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-900">{student.reg_no}</td>
                            <td className="px-4 py-3 text-slate-600">{student.name}</td>
                            <td className="px-4 py-3 text-slate-600">{student.department} / {student.section}</td>
                            {studentCurriculumData?.subjects.map(sub => {
                              const mark = student.marks[sub.id];
                              const hasMark = mark !== undefined && mark !== null;
                              return (
                                <td key={sub.id} className="px-4 py-3 text-center text-slate-700 font-medium">
                                  {hasMark ? mark : '-'}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleOpenStudentCharts(student.student_id)}
                                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium rounded-lg text-xs transition-colors whitespace-nowrap"
                              >
                                View Analysis
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Student Progress Report Modal */}
      {selectedStudentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {studentReport?.student_info?.name || 'Student Progress Report'}
                </h3>
                <p className="text-xs text-slate-500">
                  Reg No: {studentReport?.student_info?.reg_no} • Dept: {studentReport?.student_info?.dept} • Sec {studentReport?.student_info?.section}
                </p>
              </div>
              <button
                onClick={() => setSelectedStudentId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {reportLoading ? (
              <div className="py-12 text-center">
                <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-500">Fetching student academic records...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="text-xs text-slate-400 block font-bold">Overall Average</span>
                    <span className="text-lg font-black text-blue-600">{studentReport?.student_info?.overall_score_pct}%</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="text-xs text-slate-400 block font-bold">Pass Rate</span>
                    <span className="text-lg font-black text-emerald-600">{studentReport?.student_info?.pass_rate_pct}%</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="text-xs text-slate-400 block font-bold">Status</span>
                    <span className="text-xs font-black text-slate-800 mt-1 block">{studentReport?.student_info?.status}</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Subject Breakdown</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {studentReport?.subject_results.map((sub, i) => (
                      <div key={i} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{sub.course_name}</span>
                          <span className="text-[11px] text-slate-400 block">{sub.course_code} • {sub.faculty}</span>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold ${sub.is_pass ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {sub.total_mark} / {sub.max_mark}
                          </span>
                          <span className={`text-[10px] block font-bold ${sub.is_pass ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {sub.is_pass ? 'Passed' : 'Failed'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">Performance Analysis</h4>
                  <div className="h-64 w-full min-w-0" style={{ minHeight: '250px', width: '100%' }}>
                    <ResponsiveContainer width="99%" height="100%" minWidth={0} minHeight={200}>
                      <BarChart data={studentReport?.subject_results || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="course_code" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="total_mark" name="Marks Obtained" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Individual Student Charts Modal */}
      {isStudentChartsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95">
            <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-100 p-6 flex items-center justify-between z-10 rounded-t-3xl">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Individual Student Analysis</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {studentChartsData?.student_name} ({studentChartsData?.reg_no}) - {selectedExamType}
                </p>
              </div>
              <button 
                onClick={() => setIsStudentChartsModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-6">
              {studentChartsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-500 border-t-transparent"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Subject Marks Bar Chart */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-indigo-500" />
                      Subject Marks
                    </h4>
                    <div className="h-64 w-full min-w-0" style={{ minHeight: '256px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                        <BarChart data={studentChartsData?.marks_data || []}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="subject_code" tick={{ fontSize: 11, fill: '#64748B' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748B' }} domain={[0, 100]} />
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                          <Bar dataKey="score" name="Mark" fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={50} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                   {/* Subject Marks Table */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
                    <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-emerald-500" />
                      Subject Performance Details
                    </h4>
                    <div className="overflow-x-auto flex-1 min-h-[256px]">
                      <table className="min-w-full divide-y divide-slate-100 text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject Code</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject Name</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Marks Obtained</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {studentChartsData?.marks_data && studentChartsData.marks_data.length > 0 ? (
                            studentChartsData.marks_data.map((mark: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{mark.subject_code}</td>
                                <td className="px-4 py-3 text-slate-600">{mark.subject_name}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-right font-black text-slate-900">{mark.score}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="px-4 py-8 text-center text-slate-400 font-medium">No subject marks available</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
