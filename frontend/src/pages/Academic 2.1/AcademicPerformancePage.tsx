import { fetchDynamicOptions } from '../../services/academicVisuals';
import ErrorBoundary from './components/ErrorBoundary';
import BreadcrumbNavigation, { BreadcrumbLevel } from './components/BreadcrumbNavigation';
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
  fetchFacultyAnalysis,
  fetchClassAdvisorDeepDive,
  fetchComparisonAnalytics,
  fetchStudentCurriculumMarks,
  fetchStudentAnalysisCharts,
  fetchDepartmentAnalysis,
  fetchSubjectAnalysis,
  SubjectAnalysisResponse,
  PerformanceAnalyticsResponse,
  StudentProgressReportResponse,
  FacultyWiseRow,
  ClassAdvisorDeepDiveResponse,
  ComparisonAnalyticsResponse,
  StudentCurriculumMarksResponse,
  StudentAnalysisChartsResponse,
  DepartmentAnalysisResponse,
  FacultyAnalysisResponse
} from '../../services/academicPerformance';
import SubjectWiseAnalysis from './components/SubjectWiseAnalysis';
import {
  DashboardDefinition,
  DashboardQueryResult,
  GlobalDashboardFilters,
  queryDashboardVisualData
} from '../../services/academicVisuals';

// Assessment options are discovered from the database via the analytics
// response (filter_options.exam_types / assessments). No hardcoded list.

// Dashboards removed from the view switcher (navigation-only removal — the
// underlying APIs/views are untouched).
const REMOVED_DASHBOARD_NAMES = new Set<string>([
  'Performance Range Analysis',
  'New Academic Analytics Dashboard',
  'Student Academic Performance Dashboard',
]);

enum HierarchyLevel {
  COLLEGE = 'college',
  DEPARTMENT = 'department',
  FACULTY = 'faculty',
  SUBJECT = 'subject'
}

export default function AcademicPerformancePage() {
  const [data, setData] = useState<PerformanceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [hierarchyLevel, setHierarchyLevel] = useState<HierarchyLevel>(HierarchyLevel.COLLEGE);
  // Breadcrumb navigation path state
  const [breadcrumbPath, setBreadcrumbPath] = useState<BreadcrumbLevel[]>([
    { id: 'college', label: 'College', type: 'COLLEGE' },
  ]);

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
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState<string>('');

  // When a batch is selected, auto-pick the semester(s) that actually exist for that
  // batch in the database (batch_semesters comes from the backend response).
  useEffect(() => {
    // Load data on component mount
    loadInitialData();
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

  // Department Drill Down — opens a real, DB-backed Department Analysis view that
  // preserves the current Academic Year / Semester / Assessment / Section filters.
  const [deptDrilldown, setDeptDrilldown] = useState<{ code: string; name: string } | null>(null);
  const [drilldownData, setDrilldownData] = useState<DepartmentAnalysisResponse | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState('');

  // Faculty-wise Analysis layer (College → Department → Faculty)
  const [facultyRows, setFacultyRows] = useState<FacultyWiseRow[]>([]);
  const [facultyRowsLoading, setFacultyRowsLoading] = useState(false);
  const [facultyDrill, setFacultyDrill] = useState<{ id: string; name: string } | null>(null);
  const [facultyDetail, setFacultyDetail] = useState<FacultyAnalysisResponse | null>(null);

  // Subject drill-down: College → Department → Faculty → Subject (SPA state only)
  const [subjectDrill, setSubjectDrill] = useState<{ code: string; name: string } | null>(null);
  const [subjectDetail, setSubjectDetail] = useState<SubjectAnalysisResponse | null>(null);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectError, setSubjectError] = useState('');
  const [subjectSectionFilter, setSubjectSectionFilter] = useState('');
  const [facultyDetailLoading, setFacultyDetailLoading] = useState(false);
  const [facultyDetailError, setFacultyDetailError] = useState('');

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

  // Dependent-filter options for Individual Student Analysis. Refetched with
  // the current Academic Year / Semester / Department so Sections, Semesters
  // and Subjects are derived from the REAL student cohort + curriculum
  // (Academic Year → Semester → Department → Section → Subject).
  const [cohortOptions, setCohortOptions] = useState<any>(null);
  useEffect(() => {
    if (activeTab !== 'student') return;
    let cancelled = false;
    fetchDynamicOptions({ year: selectedYear, sem: selectedSem, dept: selectedDept })
      .then(res => { if (!cancelled) setCohortOptions(res); })
      .catch(err => {
        console.error('Failed to load cohort filter options:', err);
        if (!cancelled) setCohortOptions(null);
      });
    // cleanup function
    return () => { cancelled = true; };
  }, [activeTab, selectedYear, selectedSem, selectedDept]);



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

  // Dynamic section & subject options come straight from backend
  const sectionOptions: string[] = React.useMemo(() => {
    // Cohort-derived sections win on the Individual Student Analysis view:
    // they are recalculated from REAL students for the selected year/sem/dept.
    if (activeTab === 'student' && cohortOptions?.sections && cohortOptions.sections.length > 0) {
      return cohortOptions.sections;
    }
    if (data?.filter_options?.sections && data.filter_options.sections.length > 0) {
      return data.filter_options.sections;
    }
    return dynamicOptions?.sections || [];
  }, [activeTab, cohortOptions?.sections, data?.filter_options?.sections, dynamicOptions?.sections]);

  const assessmentOptions: string[] = React.useMemo(() => {
    const list = data?.filter_options?.exam_types || data?.filter_options?.assessments || dynamicOptions?.assessmentTypes || [];
    const defaults = ['CIA 1', 'CIA 2', 'SSA 1', 'SSA 2', 'Review 1', 'Review 2', 'Formative 1', 'Formative 2', 'Model Exam', 'Lab Exam', 'Final Internal', 'Semester Exam'];
    return Array.from(new Set([...list, ...defaults]));
  }, [data?.filter_options, dynamicOptions]);

  const batchList: string[] = data?.filter_options?.batches || dynamicOptions?.academicYears || dynamicOptions?.batches || [];
  const semesterList: Array<number | string> = React.useMemo(() => {
    if (activeTab === 'student' && cohortOptions?.semesters && cohortOptions.semesters.length > 0) {
      return cohortOptions.semesters;
    }
    return data?.filter_options?.semesters || dynamicOptions?.semesters || [1, 2, 3, 4, 5, 6, 7, 8];
  }, [activeTab, cohortOptions?.semesters, data?.filter_options?.semesters, dynamicOptions?.semesters]);

  // Full (unsearched) subject list for the current context — used to validate
  // the selected subject so typing in the subject search box never clears a
  // still-valid selection.
  const contextSubjects = React.useMemo(() => {
    let list: Array<{ id: string; code: string; name: string; departments?: string[] }> = dynamicOptions?.subjects || [];
    if (activeTab === 'student' && cohortOptions?.subjects && cohortOptions.subjects.length > 0) {
      list = cohortOptions.subjects;
    }
    if (studentCurriculumData?.subjects && studentCurriculumData.subjects.length > 0) {
      list = studentCurriculumData.subjects;
    }
    if (selectedDept && activeTab !== 'student') {
      list = list.filter((s: any) => {
        if (!s.departments || s.departments.length === 0) return true;
        return s.departments.some((d: string) => d.toLowerCase() === selectedDept.toLowerCase());
      });
    }
    return list;
  }, [activeTab, cohortOptions?.subjects, dynamicOptions?.subjects, studentCurriculumData?.subjects, selectedDept]);

  const availableSubjects = React.useMemo(() => {
    let list = contextSubjects;
    if (subjectSearchQuery.trim()) {
      const q = subjectSearchQuery.toLowerCase();
      list = list.filter((s: any) =>
        (s.code && s.code.toLowerCase().includes(q)) ||
        (s.name && s.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [contextSubjects, subjectSearchQuery]);

  // Filter cascade: whenever a parent filter changes, clear any child selection
  // that is no longer valid for the new context (Academic Year → Semester →
  // Department → Section → Subject). Cohort options come from the REAL student
  // cohort, so a previously valid section/subject may no longer exist.
  useEffect(() => {
    // Academic Year changed → Section and Subject become stale (the auto-pick
    // effect above already recalculates Semester for the new year).
    setSelectedSection('');
    setSelectedSubject('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  useEffect(() => {
    // Semester changed → Section and Subject become stale.
    setSelectedSection('');
    setSelectedSubject('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSem]);

  // Dependent Filter Reset: Reset Section if selectedSection is not valid for
  // the recalculated cohort context (year/sem/dept).
  useEffect(() => {
    if (!selectedSection) return;
    if (activeTab === 'student' && sectionOptions.length === 0) return;
    if (sectionOptions.length > 0 && !sectionOptions.some(s => s.toLowerCase() === selectedSection.toLowerCase())) {
      setSelectedSection('');
    }
  }, [selectedDept, sectionOptions, selectedSection, activeTab]);

  // Dependent Filter Reset: Reset Subject if selectedSubject is not valid for
  // the recalculated cohort context.
  useEffect(() => {
    if (!selectedSubject) return;
    if (activeTab === 'student' && contextSubjects.length === 0) return;
    if (contextSubjects.length > 0 && !contextSubjects.some(s =>
      String(s.id) === String(selectedSubject) || s.code === selectedSubject
    )) {
      setSelectedSubject('');
    }
  }, [selectedDept, contextSubjects, selectedSubject, activeTab]);

  // Reset all college-level filters back to default
  const handleResetFilters = () => {
    setSelectedYear('');
    setSelectedSem('');
    if (!data?.user_context?.lock_department) {
      setSelectedDept('');
      setSelectedDeptName('');
    }
    setSelectedSection('');
    setSelectedExamType('');
    setSelectedSubject('');
    setSubjectSearchQuery('');
    setStudentSearchQuery('');
    // Return to the College-level overview and drop any open department view
    // without reloading the browser page.
    goCollegeOverview();
  };

  // Navigate to the College-level overview (used by breadcrumb + reset).
  const goCollegeOverview = () => {
    setSelectedDept('');
    setSelectedDeptName('');
    setSelectedSection('');
    setSelectedSubject('');
    setDeptDrilldown(null);
    setDrilldownData(null);
    setDrilldownError('');
    setFacultyDrill(null);
    setFacultyDetail(null);
    setFacultyDetailError('');
    setSubjectDrill(null);
    setSubjectDetail(null);
    setSubjectError('');
    setSubjectSectionFilter('');
    setHierarchyLevel(HierarchyLevel.COLLEGE);
    setActiveTab('');
    setActiveDashboardId('overall_overview');
    // Fall back to the college-level analytics dataset.
    loadInitialData();
  };

  const handleBreadcrumbNavigate = (index: number) => {
    const target = breadcrumbPath[index];
    if (target.type === 'COLLEGE') {
      goCollegeOverview();
    } else if (target.type === 'DEPARTMENT') {
      closeFacultyDrilldown();
      setBreadcrumbPath(prev => prev.slice(0, index + 1));
    } else if (target.type === 'FACULTY') {
      closeSubjectDrilldown();
      setBreadcrumbPath(prev => prev.slice(0, index + 1));
    }
  };

  // Reset drilldowns when core filters change to avoid stale data
  useEffect(() => {
    // Only reset if we are drilled down
    if (hierarchyLevel !== HierarchyLevel.COLLEGE) {
      goCollegeOverview();
    }
  }, [selectedYear, selectedSem, selectedSection, selectedExamType, selectedDept]);

  const navigateUp = () => {
    if (hierarchyLevel === HierarchyLevel.SUBJECT) {
      closeSubjectDrilldown();
    } else if (hierarchyLevel === HierarchyLevel.FACULTY) {
      closeFacultyDrilldown();
    } else if (hierarchyLevel === HierarchyLevel.DEPARTMENT) {
      closeDepartmentDrilldown();
    }
    // Remove last breadcrumb level when navigating up
    setBreadcrumbPath(prev => prev.slice(0, -1));
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

  // Load Student Curriculum Marks when tab is switched or filters change
  const [studentCurriculumError, setStudentCurriculumError] = useState<string>('');
  useEffect(() => {
    if (activeTab === 'student') {
      setStudentCurriculumLoading(true);
      setStudentCurriculumError('');
      fetchStudentCurriculumMarks({
        year: selectedYear,
        sem: selectedSem,
        dept: selectedDept,
        section: selectedSection,
        exam: selectedExamType || 'All Assessments',
        subject: selectedSubject,
        q: studentSearchQuery
      })
        .then(res => setStudentCurriculumData(res))
        .catch(err => {
          console.error(err);
          setStudentCurriculumData(null);
          setStudentCurriculumError('Unable to load student analysis data. Please try again.');
        })
        .finally(() => setStudentCurriculumLoading(false));
    }
  }, [activeTab, selectedYear, selectedSem, selectedDept, selectedSection, selectedExamType, selectedSubject, studentSearchQuery]);

  const [isStudentChartsModalOpen, setIsStudentChartsModalOpen] = useState(false);

  const handleOpenStudentCharts = async (studentId: string) => {
    setStudentChartsLoading(true);
    setIsStudentChartsModalOpen(true);
    try {
      const data = await fetchStudentAnalysisCharts(studentId, selectedExamType || 'All Assessments', selectedSubject);
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

  // Open Department Drill Down — the department is added to the current filter
  // context while preserving the selected Year / Semester / Assessment / Section.
  const openDepartmentDrilldown = async (deptCode: string, deptName: string) => {
    setHierarchyLevel(HierarchyLevel.DEPARTMENT);
    // Set department context and initialize loading states
    setDeptDrilldown({ code: deptCode, name: deptName });
    setDrilldownLoading(true);
    setDrilldownError('');
    setFacultyRowsLoading(true);
    setFacultyRows([]);
    // Push breadcrumb for department level
    setBreadcrumbPath(prev => [...prev, { id: deptCode, label: deptName, type: 'DEPARTMENT' }]);

      try {
        const [res, facRows] = await Promise.all([
          fetchDepartmentAnalysis({
            dept: deptCode,
            year: selectedYear,
            sem: selectedSem,
            exam: selectedExamType || undefined,
            section: selectedSection || undefined,
          }),
          fetchFacultyWiseAnalytics(deptCode),
        ]);
        setDrilldownData(res);
        setFacultyRows(facRows || []);
      } catch {
        setDrilldownError('Unable to load department analysis. Please try again.');
      } finally {
        setDrilldownLoading(false);
        setFacultyRowsLoading(false);
      }
  };

  const closeDepartmentDrilldown = () => {
    setHierarchyLevel(HierarchyLevel.COLLEGE);
    setDeptDrilldown(null);
    setDrilldownData(null);
    setDrilldownError('');
    setFacultyDrill(null);
    setFacultyDetail(null);
    setFacultyDetailError('');
    setFacultyRows([]);
    // Clearing the department also clears faculty/subject drill state.
    setSubjectDrill(null);
    setSubjectDetail(null);
    setSubjectError('');
    setSubjectSectionFilter('');
  };

  // Faculty drill-down: College → Department → Faculty (SPA state only)
  const openFacultyDrilldown = async (facultyId: string, facultyName: string) => {
    setHierarchyLevel(HierarchyLevel.FACULTY);
    setFacultyDrill({ id: facultyId, name: facultyName });
    setBreadcrumbPath(prev => [...prev, { id: facultyId, label: facultyName, type: 'FACULTY' }]);
    setFacultyDetailLoading(true);
    setFacultyDetailError('');
    setFacultyDetail(null);
    try {
      const res = await fetchFacultyAnalysis({
        faculty: facultyId,
        dept: deptDrilldown?.code || selectedDept || undefined,
        year: selectedYear || undefined,
        sem: selectedSem || undefined,
        section: selectedSection || undefined,
        exam: selectedExamType || undefined,
      });
      setFacultyDetail(res);
    } catch {
      setFacultyDetailError('Unable to load faculty analysis. Please try again.');
    } finally {
      setFacultyDetailLoading(false);
    }
  };

  const closeFacultyDrilldown = () => {
    setHierarchyLevel(HierarchyLevel.DEPARTMENT);
    setFacultyDrill(null);
    setFacultyDetail(null);
    setFacultyDetailError('');
    // Going up from Faculty must clear lower-level subject state.
    setSubjectDrill(null);
    setSubjectDetail(null);
    setSubjectError('');
    setSubjectSectionFilter('');
  };

  // Subject drill-down: opens the DB-backed Subject Analysis within the
  // department modal, preserving the current academic filter context.
  const openSubjectDrilldown = async (subjectCode: string, subjectName: string) => {
    setHierarchyLevel(HierarchyLevel.SUBJECT);
    setSubjectDrill({ code: subjectCode, name: subjectName });
    setBreadcrumbPath(prev => [...prev, { id: subjectCode, label: subjectName, type: 'SUBJECT' }]);
    setSubjectLoading(true);
    setSubjectError('');
    setSubjectDetail(null);
    setSubjectSectionFilter('');
    try {
      const res = await fetchSubjectAnalysis({
        subject: subjectCode,
        faculty: facultyDrill?.id,
        dept: deptDrilldown?.code || selectedDept || undefined,
        year: selectedYear || undefined,
        sem: selectedSem || undefined,
        section: selectedSection || undefined,
        exam: selectedExamType || undefined,
      });
      setSubjectDetail(res);
    } catch {
      setSubjectError('Unable to load subject analysis. Please try again.');
    } finally {
      setSubjectLoading(false);
    }
  };

  const closeSubjectDrilldown = () => {
    setHierarchyLevel(HierarchyLevel.FACULTY);
    setSubjectDrill(null);
    setSubjectDetail(null);
    setSubjectError('');
    setSubjectSectionFilter('');
  };





  const sortedDepts = [...(data?.dept_comparison || [])].sort((a, b) => b.pass_rate_pct - a.pass_rate_pct);
  const topDepts = sortedDepts.slice(0, 3);
  const needsImpDepts = sortedDepts.slice(-3).reverse();

  // Comparison View derived variables
  const userCtx = data?.user_context;
  const departmentOptions = comparisonResponse?.departments_list || [];
  const batchOptions = comparisonResponse?.batches_list || [];

return (
  <ErrorBoundary>
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-16 font-sans">
      {/* 🌟 Premium Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-[#1e1b4b] to-purple-900 text-white shadow-2xl">
        {/* Dynamic Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[150%] rounded-full bg-gradient-to-l from-purple-500/20 to-transparent blur-[120px] animate-pulse"></div>
          <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[150%] rounded-full bg-gradient-to-r from-blue-500/20 to-transparent blur-[120px] opacity-70"></div>
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-10 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            
            {/* Title Section */}
            <div className="flex items-center gap-5 group">
              <div className="p-3.5 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-xl group-hover:scale-105 transition-transform duration-500">
                <BarChart3 className="w-8 h-8 text-blue-300 drop-shadow-[0_0_8px_rgba(147,197,253,0.5)]" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-purple-200 drop-shadow-sm">
                    Academic Performance & Analytics
                  </h1>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] border border-white/20">
                    Live Role Boundary
                  </span>
                </div>
                <p className="text-indigo-200/80 text-sm mt-1.5 font-medium tracking-wide">
                  Hierarchical real-time performance evaluation for Institutional Excellence
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={loadInitialData}
                className="group relative inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold backdrop-blur-md border border-white/20 transition-all shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_16px_rgba(255,255,255,0.1)] overflow-hidden"
              >
                <div className="absolute inset-0 w-0 bg-gradient-to-r from-blue-500/30 to-purple-500/30 transition-all duration-300 ease-out group-hover:w-full"></div>
                <RefreshCw className={`w-4 h-4 relative z-10 ${loading ? 'animate-spin text-blue-300' : 'text-indigo-200 group-hover:rotate-180 transition-transform duration-500'}`} />
                <span className="relative z-10">Refresh Analytics</span>
              </button>
            </div>
          </div>
        </div>

        {/* 🌟 Interactive Hierarchy Breadcrumb Navigation */}
        <div className="bg-black/20 backdrop-blur-md border-t border-white/10 shadow-inner">
          <div className="max-w-7xl mx-auto flex items-center gap-4 overflow-x-auto px-6 py-3">
            {hierarchyLevel !== HierarchyLevel.COLLEGE && (
              <button
                onClick={navigateUp}
                className="hover:text-white transition-all flex items-center gap-1.5 text-indigo-300 font-bold text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-transparent hover:border-white/10"
              >
                <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back
              </button>
            )}
            <div className="text-white/90">
              <BreadcrumbNavigation path={breadcrumbPath} onNavigate={handleBreadcrumbNavigate} />
            </div>
          </div>
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

            {/* Academic Year Filter */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All Academic Years</option>
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
                  setSelectedSubject('');
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
                    {d.label || d.name}
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

            {/* Assessment Filter */}
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

            {/* Subject Filter & Search */}
            <div className="flex items-center gap-1.5">
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none max-w-[200px] truncate"
              >
                <option value="">All Subjects</option>
                {availableSubjects.map((sub: any) => (
                  <option key={sub.id || sub.code} value={sub.code || sub.id}>
                    {sub.code}{sub.name && sub.name !== sub.code ? ` - ${sub.name}` : ''}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Search subject..."
                value={subjectSearchQuery}
                onChange={(e) => setSubjectSearchQuery(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none w-32"
                title="Search subject by code or name"
              />
            </div>

            {/* Reset Filters */}
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors ml-1"
              title="Clear all filters and return to default state"
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
                onClick={() => handleSelectDashboard('comparison_view')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeDashboardId === 'comparison_view'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                Comparison View
              </button>
              {publishedDashboards
                .filter(d => !REMOVED_DASHBOARD_NAMES.has(d.name))
                .map(d => (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8 relative z-10 animate-in slide-in-from-bottom-4 duration-700 ease-out">
            {/* 1. Total No. of Students */}
            <div className="group bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors"></div>
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total No. of Students</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1.5 tracking-tight group-hover:text-blue-600 transition-colors">{data?.metrics?.total_students || 0}</h3>
                  <p className="text-xs text-blue-600/80 font-semibold mt-1 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Enrolled Cohort
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/50 flex items-center justify-center text-blue-600 border border-blue-100 shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                  <Users className="w-7 h-7 drop-shadow-sm" />
                </div>
              </div>
            </div>

            {/* 2. Overall Pass Percentage */}
            <div className="group bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Overall Pass Percentage</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1.5 tracking-tight group-hover:text-emerald-600 transition-colors">{data?.metrics?.overall_pass_pct || 0}<span className="text-lg text-slate-400">%</span></h3>
                  <p className="text-xs text-emerald-600/80 font-semibold mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Institutional Average
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                  <CheckCircle2 className="w-7 h-7 drop-shadow-sm" />
                </div>
              </div>
            </div>

            {/* 3. Overall Average Marks */}
            <div className="group bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors"></div>
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Overall Average Marks</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1.5 tracking-tight group-hover:text-purple-600 transition-colors">{data?.metrics?.overall_marks_pct || 0}<span className="text-lg text-slate-400">%</span></h3>
                  <p className="text-xs text-purple-600/80 font-semibold mt-1 flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5" /> Academic Mean
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100/50 flex items-center justify-center text-purple-600 border border-purple-100 shadow-inner group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300">
                  <GraduationCap className="w-7 h-7 drop-shadow-sm" />
                </div>
              </div>
            </div>

            {/* 4. Overall Attendance */}
            <div className="group bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors"></div>
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Overall Attendance</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1.5 tracking-tight group-hover:text-amber-500 transition-colors">
                    {data?.metrics?.overall_attendance !== null && data?.metrics?.overall_attendance !== undefined ? data.metrics.overall_attendance : '—'}<span className="text-lg text-slate-400">%</span>
                  </h3>
                  <p className="text-xs text-amber-600/80 font-semibold mt-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Present / OD Rate
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 flex items-center justify-center text-amber-600 border border-amber-100 shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                  <Clock className="w-7 h-7 drop-shadow-sm" />
                </div>
              </div>
            </div>

            {/* 5. Overall Pass / Fail Count */}
            <div className="group bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors"></div>
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pass / Fail Count</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1.5 tracking-tight">
                    <span className="text-emerald-500 group-hover:text-emerald-600 transition-colors">{data?.metrics?.overall_pass_count !== undefined ? data.metrics.overall_pass_count : '—'}</span>
                    <span className="text-slate-300 font-normal mx-1.5 text-xl">/</span>
                    <span className="text-rose-500 group-hover:text-rose-600 transition-colors">{data?.metrics?.overall_fail_count !== undefined ? data.metrics.overall_fail_count : '—'}</span>
                  </h3>
                  <p className="text-xs text-indigo-500/80 font-semibold mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> Distribution
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 flex items-center justify-center text-indigo-600 border border-indigo-100 shadow-inner group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300">
                  <Award className="w-7 h-7 drop-shadow-sm" />
                </div>
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
                          openDepartmentDrilldown(d.dept_code, d.dept_name);
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

                        
        {/* View Mode: Faculty-Wise comparison table (drills into Faculty Analysis) */}
        {(activeTab === 'faculty' || activeTab === 'hod') && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Faculty Academic Performance</h3>
                  <p className="text-xs text-slate-500">Click a row to open detailed faculty analysis</p>
                </div>
              </div>

              {facultyLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500">Loading faculty data...</p>
                </div>
              ) : faculties.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-400">No faculty teaching data available for the selected filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Faculty</th>
                        <th className="py-3 px-4 text-center">Subjects</th>
                        <th className="py-3 px-4 text-center">Students</th>
                        <th className="py-3 px-4 text-center">Avg Marks %</th>
                        <th className="py-3 px-4 text-center">Pass %</th>
                        <th className="py-3 px-4 text-center">Attendance %</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {faculties.map((fac) => (
                        <tr key={fac.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{fac.name}</div>
                            <div className="text-[11px] text-slate-400">{fac.designation}{fac.department ? ` • ${fac.department}` : ''}</div>
                          </td>
                          <td className="py-3 px-4 text-center text-slate-700">{fac.subjects_count}</td>
                          <td className="py-3 px-4 text-center text-slate-700">{fac.students_handled}</td>
                          <td className="py-3 px-4 text-center text-slate-700">{fac.avg_marks_pct != null ? `${fac.avg_marks_pct}%` : '—'}</td>
                          <td className="py-3 px-4 text-center text-slate-700">{fac.pass_pct != null ? `${fac.pass_pct}%` : '—'}</td>
                          <td className="py-3 px-4 text-center text-slate-700">{fac.attendance_pct != null ? `${fac.attendance_pct}%` : '—'}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openFacultyDrilldown(fac.id, fac.name)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                            >
                              Drill Down <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

        {/* View Mode: Individual Student Analysis */}
        {activeTab === 'student' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Individual Student Analysis</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Showing performance records matching selected context & assessment.
                  </p>
                </div>
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
                  <span className="ml-3 text-sm font-semibold text-slate-500">Loading student records...</span>
                </div>
              ) : studentCurriculumError ? (
                <div className="py-10 text-center">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-600">{studentCurriculumError}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-medium">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-xl whitespace-nowrap">Reg No</th>
                        <th className="px-4 py-3 whitespace-nowrap">Name</th>
                        <th className="px-4 py-3 whitespace-nowrap">Dept / Sec</th>
                        <th className="px-4 py-3 whitespace-nowrap">Semester</th>
                        <th className="px-4 py-3 whitespace-nowrap">Academic Year</th>
                        {studentCurriculumData?.subjects.map(sub => (
                          <th key={sub.id} className="px-4 py-3 whitespace-nowrap text-center" title={sub.name}>
                            {sub.code}
                          </th>
                        ))}
                        <th className="px-4 py-3 whitespace-nowrap text-center rounded-tr-xl">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!studentCurriculumData?.students || studentCurriculumData.students.length === 0 ? (
                        <tr>
                          <td colSpan={(studentCurriculumData?.subjects.length || 0) + 6} className="px-4 py-8 text-center text-slate-500">
                            No students found for the selected filters.
                          </td>
                        </tr>
                      ) : (
                        studentCurriculumData.students.map((student) => (
                          <tr key={student.student_id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-900">{student.reg_no}</td>
                            <td className="px-4 py-3 text-slate-600">{student.name}</td>
                            <td className="px-4 py-3 text-slate-600">{student.department} / {student.section}</td>
                            <td className="px-4 py-3 text-slate-600">{student.semester || selectedSem || '1'}</td>
                            <td className="px-4 py-3 text-slate-600">{student.academic_year || selectedYear || '-'}</td>
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

      {deptDrilldown && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider">
                  <Building2 className="w-4 h-4" /> {facultyDrill ? 'Faculty Analysis' : 'Department Analysis'}
                </div>
                {facultyDrill ? (
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    <button
                      type="button"
                      onClick={closeDepartmentDrilldown}
                      className="text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      College
                    </button>
                    <span className="text-slate-400 mx-1.5">→</span>
                    <button
                      type="button"
                      onClick={subjectDrill ? closeSubjectDrilldown : closeFacultyDrilldown}
                      className="text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {deptDrilldown.name}
                    </button>
                    <span className="text-slate-400 mx-1.5">→</span>
                    {subjectDrill ? (
                      <button
                        type="button"
                        onClick={closeSubjectDrilldown}
                        className="text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {facultyDrill.name}
                      </button>
                    ) : (
                      facultyDrill.name
                    )}
                    {subjectDrill && (
                      <>
                        <span className="text-slate-400 mx-1.5">→</span>
                        <span className="text-slate-900">{subjectDrill.code}</span>
                      </>
                    )}
                  </h3>
                ) : (
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">{deptDrilldown.name} ({deptDrilldown.code})</h3>
                )}
                <p className="text-xs text-slate-500">
                  Year: {selectedYear || 'All'} • Semester: {selectedSem || 'All'} • Assessment: {selectedExamType || 'All Assessments'} • Section: {selectedSection || 'All'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {facultyDrill && subjectDrill && (
                  <button
                    type="button"
                    onClick={closeSubjectDrilldown}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" /> Back to {facultyDrill.name}
                  </button>
                )}
                {facultyDrill && !subjectDrill && (
                  <button
                    type="button"
                    onClick={closeFacultyDrilldown}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" /> Back to {deptDrilldown.code}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeDepartmentDrilldown}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" /> Back to Overall
                </button>
                <button type="button" onClick={closeDepartmentDrilldown} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              {facultyDrill && subjectDrill && (
                <SubjectWiseAnalysis
                  data={subjectDetail}
                  loading={subjectLoading}
                  error={subjectError}
                  sectionFilter={subjectSectionFilter}
                  onSectionClick={setSubjectSectionFilter}
                  onViewStudent={handleOpenReport}
                />
              )}
              {facultyDrill && !subjectDrill && (
                facultyDetailLoading ? (
                  <div className="py-16 text-center">
                    <RefreshCw className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-500">Loading faculty analysis...</p>
                  </div>
                ) : facultyDetailError ? (
                  <div className="py-16 text-center text-rose-600 font-bold text-sm">{facultyDetailError}</div>
                ) : !facultyDetail ? (
                  <div className="py-16 text-center text-slate-500 text-sm">No faculty data found for the selected filters.</div>
                ) : (
                  <>
                    {/* Faculty KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Subjects</p>
                        <p className="text-2xl font-black text-slate-900 mt-1">{facultyDetail.metrics.subjects}</p>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Students</p>
                        <p className="text-2xl font-black text-slate-900 mt-1">{facultyDetail.metrics.students}</p>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Avg Marks %</p>
                        <p className="text-2xl font-black text-slate-900 mt-1">{facultyDetail.metrics.average_marks_pct != null ? `${facultyDetail.metrics.average_marks_pct}%` : '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pass %</p>
                        <p className="text-2xl font-black text-emerald-700 mt-1">{facultyDetail.metrics.pass_pct != null ? `${facultyDetail.metrics.pass_pct}%` : '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Attendance %</p>
                        <p className="text-2xl font-black text-slate-900 mt-1">{facultyDetail.metrics.attendance_pct != null ? `${facultyDetail.metrics.attendance_pct}%` : '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pass / Fail</p>
                        <p className="text-2xl font-black text-slate-900 mt-1">{facultyDetail.metrics.pass_count}<span className="text-rose-500 text-lg"> / {facultyDetail.metrics.fail_count}</span></p>
                      </div>
                    </div>

                    {/* Faculty Subject-wise Performance Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100">
                        <h4 className="text-sm font-bold text-slate-900">Subjects Handled by {facultyDetail.faculty.name}</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider">
                            <tr>
                              <th className="py-3 px-4">Subject Code</th>
                              <th className="py-3 px-4">Subject Name</th>
                              <th className="py-3 px-4">Sections</th>
                              <th className="py-3 px-4 text-center">Students</th>
                              <th className="py-3 px-4 text-center">Avg Marks %</th>
                              <th className="py-3 px-4 text-center">Pass %</th>
                              <th className="py-3 px-4 text-center">Attendance %</th>
                              <th className="py-3 px-4 text-center">Records</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {facultyDetail.subjects.length === 0 ? (
                              <tr><td colSpan={8} className="py-6 text-center text-slate-400">No subjects found for this faculty.</td></tr>
                            ) : (
                              facultyDetail.subjects.map((sub) => (
                                <tr
                                  key={sub.subject_code}
                                  onClick={() => openSubjectDrilldown(sub.subject_code, sub.subject_name)}
                                  className="hover:bg-blue-50/60 cursor-pointer transition-colors"
                                >
                                  <td className="py-3 px-4 font-bold text-slate-900">{sub.subject_code}</td>
                                  <td className="py-3 px-4 text-slate-700">{sub.subject_name}</td>
                                  <td className="py-3 px-4 text-slate-700">{sub.sections?.join(', ') || '—'}</td>
                                  <td className="py-3 px-4 text-center text-slate-700">{sub.student_count != null ? sub.student_count : '—'}</td>
                                  <td className="py-3 px-4 text-center text-slate-700">{sub.avg_marks_pct != null ? `${sub.avg_marks_pct}%` : '—'}</td>
                                  <td className="py-3 px-4 text-center text-slate-700">{sub.pass_pct != null ? `${sub.pass_pct}%` : '—'}</td>
                                  <td className="py-3 px-4 text-center text-slate-700">{sub.attendance_pct != null ? `${sub.attendance_pct}%` : '—'}</td>
                                  <td className="py-3 px-4 text-center text-slate-700">{sub.total_records}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900">Students Taught by {facultyDetail.faculty.name}</h4>
                        <span className="text-[11px] font-bold text-slate-400">{facultyDetail.students.length} students</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider">
                            <tr>
                              <th className="py-3 px-4">Register No</th>
                              <th className="py-3 px-4">Student Name</th>
                              <th className="py-3 px-4 text-center">Section</th>
                              <th className="py-3 px-4 text-center">Subjects</th>
                              <th className="py-3 px-4 text-center">Avg Marks %</th>
                              <th className="py-3 px-4 text-center">Result</th>
                              <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {facultyDetail.students.length === 0 ? (
                              <tr><td colSpan={7} className="py-6 text-center text-slate-400">No students found for this faculty under the selected filters.</td></tr>
                            ) : (
                              facultyDetail.students.map((st) => (
                                <tr key={st.student_id} className="hover:bg-slate-50/60">
                                  <td className="py-3 px-4 font-bold text-slate-900">{st.reg_no}</td>
                                  <td className="py-3 px-4 text-slate-700">{st.name}</td>
                                  <td className="py-3 px-4 text-center text-slate-700">{st.section}</td>
                                  <td className="py-3 px-4 text-slate-700">{st.subjects?.join(', ') || '—'}</td>
                                  <td className="py-3 px-4 text-center text-slate-700">
                                    {st.avg_marks_pct != null ? `${st.avg_marks_pct}%` : '—'}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${st.result === 'Pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{st.result || '—'}</span>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReport(st.student_id)}
                                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                                    >
                                      View Analysis <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>))}
                  {/* Department-level content below — only when NOT in faculty drill-down */}
                  {!facultyDrill && (
                    <>
                    <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                      <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Pass %</p>
                      <p className="text-2xl font-black text-blue-700 mt-1">{drilldownData.metrics.pass_pct ?? 0}%</p>
                    </div>
                    <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                      <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Avg Marks</p>
                      <p className="text-2xl font-black text-emerald-700 mt-1">{drilldownData.metrics.avg_marks ?? 0}</p>
                    </div>
                    <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                      <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Attendance</p>
                      <p className="text-2xl font-black text-amber-700 mt-1">
                        {drilldownData.metrics.attendance != null ? `${drilldownData.metrics.attendance}%` : '—'}
                      </p>
                    </div>
                    <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                      <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Pass</p>
                      <p className="text-2xl font-black text-emerald-700 mt-1">{drilldownData.metrics.pass_count ?? 0}</p>
                    </div>
                    <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
                      <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Fail</p>
                      <p className="text-2xl font-black text-rose-700 mt-1">{drilldownData.metrics.fail_count ?? 0}</p>
                    </div>

                  {/* Section-wise */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900">Section-wise Performance</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Section</th>
                            <th className="py-3 px-4 text-center">Students</th>
                            <th className="py-3 px-4 text-center">Avg Marks</th>
                            <th className="py-3 px-4 text-center">Pass %</th>
                            <th className="py-3 px-4 text-center">Attendance %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(drilldownData.section_wise || []).length === 0 ? (
                            <tr><td colSpan={5} className="py-6 text-center text-slate-400">No data found for the selected filters.</td></tr>
                          ) : (
                            (drilldownData.section_wise || []).map((s) => (
                              <tr key={s.section} className="hover:bg-slate-50/60">
                                <td className="py-3 px-4 font-bold text-slate-900">{s.section}</td>
                                <td className="py-3 px-4 text-center text-slate-700">{s.students}</td>
                                <td className="py-3 px-4 text-center text-slate-700">{s.avg_marks != null ? s.avg_marks : '—'}</td>
                                <td className="py-3 px-4 text-center text-slate-700">{s.pass_pct}%</td>
                                <td className="py-3 px-4 text-center text-slate-700">{s.attendance != null ? `${s.attendance}%` : '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Subject-wise */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900">Subject-wise Performance</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Subject Code</th>
                            <th className="py-3 px-4">Subject Name</th>
                            <th className="py-3 px-4 text-center">Students</th>
                            <th className="py-3 px-4 text-center">Avg Marks</th>
                            <th className="py-3 px-4 text-center">Pass %</th>
                            <th className="py-3 px-4 text-center">Attendance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(drilldownData.subject_wise || []).length === 0 ? (
                            <tr><td colSpan={6} className="py-6 text-center text-slate-400">No subject marks found for the selected filters.</td></tr>
                          ) : (
                            (drilldownData.subject_wise || []).map((sub) => (
                              <tr key={sub.subject_code} className="hover:bg-slate-50/60">
                                <td className="py-3 px-4 font-bold text-slate-900">{sub.subject_code}</td>
                                <td className="py-3 px-4 text-slate-700">{sub.subject_name}</td>
                                <td className="py-3 px-4 text-center text-slate-700">{sub.students}</td>
                                <td className="py-3 px-4 text-center text-slate-700">{sub.avg_marks != null ? sub.avg_marks : '—'}</td>
                                <td className="py-3 px-4 text-center text-slate-700">{sub.pass_pct != null ? `${sub.pass_pct}%` : '—'}</td>
                                <td className="py-3 px-4 text-center text-slate-700">—</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Students */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900">Student Performance</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Register No</th>
                            <th className="py-3 px-4">Student Name</th>
                            <th className="py-3 px-4 text-center">Section</th>
                            <th className="py-3 px-4 text-center">Average Marks</th>
                            <th className="py-3 px-4 text-center">Result</th>
                            <th className="py-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(drilldownData.students || []).length === 0 ? (
                            <tr><td colSpan={6} className="py-6 text-center text-slate-400">No students found for the selected filters.</td></tr>
                          ) : (
                            (drilldownData.students || []).map((st) => (
                              <tr key={st.student_id} className="hover:bg-slate-50/60">
                                <td className="py-3 px-4 font-bold text-slate-900">{st.reg_no}</td>
                                <td className="py-3 px-4 text-slate-700">{st.name}</td>
                                <td className="py-3 px-4 text-center text-slate-700">{st.section}</td>
                                <td className="py-3 px-4 text-center text-slate-700">
                                                                    { st.avg_marks != null ? st.avg_marks : '—'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${st.result === 'Pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{st.result}</span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReport(st.student_id)}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                                  >
                                    View Analysis <ChevronRight className="w-3.5 h-3.5" />
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
          </div>
        </div>
      )}

      {/* Student Progress Report Modal */}

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
                <p className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{studentChartsData?.student_name || 'Student'}</span>
                  <span>({studentChartsData?.reg_no || '-'})</span>
                  <span>•</span>
                  <span>Dept: {studentChartsData?.department || selectedDept || 'N/A'}</span>
                  <span>•</span>
                  <span>Sec: {studentChartsData?.section || selectedSection || 'N/A'}</span>
                  <span>•</span>
                  <span>Sem: {studentChartsData?.semester || selectedSem || 'N/A'}</span>
                  <span>•</span>
                  <span>AY: {studentChartsData?.academic_year || selectedYear || 'N/A'}</span>
                  <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-md">
                    {selectedExamType || 'All Assessments'}
                  </span>
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
                <div>
                  {/* Avg / Pass metric cards */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-5 text-center">
                      <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Average Marks</p>
                      <h3 className="text-3xl font-black text-indigo-700 mt-1">
                        {studentChartsData?.avg_pct !== undefined && studentChartsData?.avg_pct !== null
                          ? `${studentChartsData.avg_pct}%`
                          : '—'}
                      </h3>
                    </div>
                    <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5 text-center">
                      <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Pass Percentage</p>
                      <h3 className="text-3xl font-black text-emerald-700 mt-1">
                        {studentChartsData?.pass_pct !== undefined && studentChartsData?.pass_pct !== null
                          ? `${studentChartsData.pass_pct}%`
                          : '—'}
                      </h3>
                    </div>
                  </div>

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
                            <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Result</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {studentChartsData?.marks_data && studentChartsData.marks_data.length > 0 ? (
                            studentChartsData.marks_data.map((mark: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{mark.subject_code}</td>
                                <td className="px-4 py-3 text-slate-600">{mark.subject_name}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-right font-black text-slate-900">{mark.score}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-right">
                                  {mark.result === 'Pass' ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">Pass</span>
                                  ) : mark.result === 'Fail' ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700">Fail</span>
                                  ) : (
                                    <span className="text-slate-400 text-[11px] font-medium">—</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-slate-400 font-medium">No subject marks available</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  </ErrorBoundary>
  );
}
