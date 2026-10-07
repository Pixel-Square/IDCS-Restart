import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  BookOpen,
  UserCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Layers,
  GraduationCap,
  Calendar,
  Building,
  School,
  ArrowLeft,
  Activity,
  Award,
  TrendingUp,
  FileSpreadsheet,
  Check,
  Eye,
  Sliders
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import fetchWithAuth from '../../services/fetchAuth';

export const BELL_RANGES = [
  { label: '0–9',    min: 0,  max: 9   },
  { label: '10–19',  min: 10, max: 19  },
  { label: '20–29',  min: 20, max: 29  },
  { label: '30–39',  min: 30, max: 39  },
  { label: '40–44',  min: 40, max: 44  },
  { label: '45–49',  min: 45, max: 49  },
  { label: '50–54',  min: 50, max: 54  },
  { label: '55–59',  min: 55, max: 59  },
  { label: '60–69',  min: 60, max: 69  },
  { label: '70–79',  min: 70, max: 79  },
  { label: '80–89',  min: 80, max: 89  },
  { label: '90–100', min: 90, max: 100 },
];

const COURSE_PALETTE = [
  '#2563eb', // Blue
  '#059669', // Emerald
  '#d97706', // Amber
  '#7c3aed', // Violet
  '#db2777', // Pink
  '#0891b2', // Cyan
  '#ea580c', // Orange
  '#4f46e5', // Indigo
  '#16a34a', // Green
  '#9333ea', // Purple
  '#0284c7', // Sky
  '#dc2626', // Red
];

interface SectionItem {
  id: number;
  name: string;
  department_id?: number;
  department_code?: string;
  department_short_name?: string;
  department?: { id: number; code?: string; name?: string };
  semester?: number;
  batch?: string | { id?: number; name?: string };
  batch_name?: string;
  batch_regulation?: { id: number; code: string; name?: string } | null;
  managing_department_id?: number;
}

interface AssignedStaff {
  id: number;
  staff_id: string;
  name: string;
  department?: string;
}

interface CourseItem {
  course_id: number;
  course_code: string;
  course_name: string;
  category?: string;
  class_type?: string;
  qp_type?: string;
  credits?: string;
  assigned_staff: AssignedStaff[];
}

interface ExamAssignmentBell {
  exam_id: string;
  course_id: number;
  course_code: string;
  course_name: string;
  exam_name: string;
  display_name: string;
  cycle_name: string;
  max_marks: number;
  weight: number;
  assigned_staff: AssignedStaff[];
  distribution: Array<{ label: string; count: number }>;
  total_students: number;
  class_average: number;
  highest: number;
  lowest: number;
  pass_rate: number;
}

interface CourseStats {
  course_id: number;
  course_code: string;
  course_name: string;
  assigned_staff: AssignedStaff[];
  range_counts: Array<{ label: string; count: number }>;
  total_students: number;
  class_average: number;
  highest: number;
  lowest: number;
  pass_rate: number;
}

interface SectionReportPayload {
  section: {
    id: number;
    name: string;
    department_name: string;
    department_code: string;
    semester: number;
    batch_name: string;
    regulation: string;
    total_students: number;
  };
  advisor: {
    id: number;
    staff_id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  courses: CourseItem[];
  bell_ranges: string[];
  cycles: string[];
  overall: {
    chart_data: Array<Record<string, any>>;
    stats: {
      total_students: number;
      class_average: number;
      highest: number;
      lowest: number;
      pass_rate: number;
    };
    course_stats: CourseStats[];
  };
  cycle_wise: {
    charts_data: Record<string, Array<Record<string, any>>>;
    course_stats: Record<string, Record<string, CourseStats>>;
  };
  exam_assignments: ExamAssignmentBell[];
}

const CustomBellTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl text-xs space-y-1.5 z-50 min-w-[150px]">
        <div className="font-bold text-slate-800 border-b border-slate-100 pb-1">
          Score Range: <span className="text-indigo-600">{label}</span>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {payload.map((p: any) => (
            <div key={p.name} className="flex items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || p.stroke || p.fill }} />
                <span className="font-semibold text-slate-700">{p.name}:</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{p.value} student{p.value !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function SectionsReportView({ onBack }: { onBack: () => void }) {
  // Reference data
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: number; code: string; name: string; short_name?: string }>>([]);
  const [batchYears, setBatchYears] = useState<Array<{ id: number; name: string }>>([]);
  const [advisors, setAdvisors] = useState<Array<{ section_id: number; advisor: string; is_active: boolean }>>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Search & Filter state
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<number | 'all'>('all');
  const [selectedBatchId, setSelectedBatchId] = useState<number | 'all'>('all');
  const [selectedRegulation, setSelectedRegulation] = useState<string | 'all'>('all');
  const [selectedSemester, setSelectedSemester] = useState<number | 'all'>('all');
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  // Section report data state
  const [reportData, setReportData] = useState<SectionReportPayload | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [errorReport, setErrorReport] = useState<string | null>(null);

  // Graph interaction state
  const [selectedCycleTab, setSelectedCycleTab] = useState<string>('Cycle 1');
  const [chartType, setChartType] = useState<'area' | 'line' | 'bar'>('area');
  const [selectedExamCourseFilter, setSelectedExamCourseFilter] = useState<string>('all');

  // Load sections and reference data on mount
  useEffect(() => {
    async function loadInitial() {
      setLoadingInitial(true);
      try {
        const [secRes, deptRes, batchRes, advRes] = await Promise.all([
          fetchWithAuth('/api/academics/sections/?page_size=0').then(r => r.ok ? r.json() : []).catch(() => []),
          fetchWithAuth('/api/academics/departments/?page_size=0').then(r => r.ok ? r.json() : []).catch(() => []),
          fetchWithAuth('/api/academics/batch-years/?page_size=0').then(r => r.ok ? r.json() : []).catch(() => []),
          fetchWithAuth('/api/academics/section-advisors/?page_size=0').then(r => r.ok ? r.json() : []).catch(() => []),
        ]);

        const rawSecs = Array.isArray(secRes) ? secRes : (secRes.results || []);
        setSections(rawSecs);
        setDepartments(Array.isArray(deptRes) ? deptRes : (deptRes.results || []));
        setBatchYears(Array.isArray(batchRes) ? batchRes : (batchRes.results || []));
        setAdvisors(Array.isArray(advRes) ? advRes : (advRes.results || []));

        // Auto-select first section if available
        if (rawSecs.length > 0 && !selectedSectionId) {
          // Prefer Section 20 if present or first
          const sec20 = rawSecs.find((s: SectionItem) => s.id === 20);
          setSelectedSectionId(sec20 ? sec20.id : rawSecs[0].id);
        }
      } catch (err) {
        console.error('Failed to load sections reference data:', err);
      } finally {
        setLoadingInitial(false);
      }
    }
    loadInitial();
  }, []);

  // Filter sections based on criteria
  const filteredSections = useMemo(() => {
    return sections.filter((sec) => {
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const secName = (sec.name || '').toLowerCase();
        const batchName = typeof sec.batch === 'string' ? sec.batch.toLowerCase() : (sec.batch_name || '').toLowerCase();
        const deptCode = (sec.department_code || sec.department_short_name || sec.department?.code || '').toLowerCase();
        if (!secName.includes(q) && !batchName.includes(q) && !deptCode.includes(q)) return false;
      }

      if (selectedDeptId !== 'all') {
        const sDept = sec.department_id || sec.department?.id || sec.managing_department_id;
        if (Number(sDept) !== Number(selectedDeptId)) return false;
      }

      if (selectedBatchId !== 'all') {
        const sBatch = (typeof sec.batch === 'object' ? sec.batch?.id : undefined) || sec.batch_name;
        if (sBatch && String(sBatch) !== String(selectedBatchId)) return false;
      }

      if (selectedRegulation !== 'all') {
        const reg = sec.batch_regulation?.code || '';
        if (reg !== selectedRegulation) return false;
      }

      if (selectedSemester !== 'all') {
        if (Number(sec.semester) !== Number(selectedSemester)) return false;
      }

      return true;
    });
  }, [sections, searchFilter, selectedDeptId, selectedBatchId, selectedRegulation, selectedSemester]);

  // Regulations list
  const regulationsList = useMemo(() => {
    const regs = new Set<string>();
    sections.forEach(s => {
      if (s.batch_regulation?.code) regs.add(s.batch_regulation.code);
    });
    return Array.from(regs).sort();
  }, [sections]);

  // Fetch Section Report & Bell Graph whenever selected section changes
  useEffect(() => {
    if (!selectedSectionId) {
      setReportData(null);
      return;
    }

    async function loadReport(sectionId: number) {
      setLoadingReport(true);
      setErrorReport(null);

      try {
        const res = await fetchWithAuth(`/api/academic-v2/performance/section-report/${sectionId}/`);
        if (!res.ok) {
          throw new Error(`Failed to load section report: HTTP ${res.status}`);
        }
        const data: SectionReportPayload = await res.json();
        setReportData(data);
        if (data.cycles && data.cycles.length > 0) {
          setSelectedCycleTab(data.cycles[0]);
        }
      } catch (err: any) {
        console.error('Error fetching section report:', err);
        setErrorReport(err.message || 'Failed to load report data for this section');
      } finally {
        setLoadingReport(false);
      }
    }

    loadReport(selectedSectionId);
  }, [selectedSectionId]);

  // Selected section object
  const activeSectionObj = useMemo(() => {
    return sections.find(s => s.id === selectedSectionId) || null;
  }, [selectedSectionId, sections]);

  // Filter exam assignments by selected course
  const filteredExamAssignments = useMemo(() => {
    if (!reportData?.exam_assignments) return [];
    if (selectedExamCourseFilter === 'all') return reportData.exam_assignments;
    return reportData.exam_assignments.filter(
      ea => ea.course_code === selectedExamCourseFilter || String(ea.course_id) === selectedExamCourseFilter
    );
  }, [reportData, selectedExamCourseFilter]);

  // List of courses for multi-course line colors
  const courseList = useMemo(() => {
    return reportData?.courses || [];
  }, [reportData]);

  // Color map for each course code
  const courseColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    courseList.forEach((c, idx) => {
      map[c.course_code] = COURSE_PALETTE[idx % COURSE_PALETTE.length];
    });
    return map;
  }, [courseList]);

  // Overall chart data
  const overallChartData = useMemo(() => {
    return reportData?.overall?.chart_data || [];
  }, [reportData]);

  // Current Cycle chart data
  const currentCycleChartData = useMemo(() => {
    if (!reportData?.cycle_wise?.charts_data) return [];
    return reportData.cycle_wise.charts_data[selectedCycleTab] || [];
  }, [reportData, selectedCycleTab]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation & Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all shadow-2xs"
            title="Back to Dashboards"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold text-slate-900">Sections Report & Bell Curve Analysis</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Academic Performance
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Section advisor details, course teaching faculty allocations, overall bell curve, cycle-wise bell graphs & exam distributions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeSectionObj && (
            <div className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-blue-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              Active Section: <strong className="text-blue-700">{activeSectionObj.name}</strong>
            </div>
          )}
          <button
            onClick={() => selectedSectionId && setSelectedSectionId(Number(selectedSectionId))}
            disabled={loadingReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingReport ? 'animate-spin text-blue-600' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* SECTION SEARCH & FILTER CONTROLS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span>Search & Filter Sections</span>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Found {filteredSections.length} matching section{filteredSections.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Quick Search */}
          <div className="lg:col-span-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Quick Search</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Section / Dept / Batch..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department</label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.short_name || d.code} - {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Batch / Year</label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="all">All Batches</option>
              {batchYears.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Regulation Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Regulation</label>
            <select
              value={selectedRegulation}
              onChange={(e) => setSelectedRegulation(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="all">All Regulations</option>
              {regulationsList.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Semester Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Semester</label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="all">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                <option key={sem} value={sem}>Semester {sem}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Section Picker Pills */}
        <div className="pt-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Select a Section ({filteredSections.length} available)
          </label>
          {filteredSections.length === 0 ? (
            <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-dashed border-slate-200">
              No sections match the current filters.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
              {filteredSections.map((sec) => {
                const isSelected = selectedSectionId === sec.id;
                const deptCode = sec.department_code || sec.department_short_name || sec.department?.code || '';
                const hasAdvisor = advisors.some(a => a.section_id === sec.id && a.is_active);

                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setSelectedSectionId(sec.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 scale-[1.02]'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/40'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${hasAdvisor ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="font-bold">{sec.name}</span>
                    {deptCode && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {deptCode}
                      </span>
                    )}
                    {sec.semester && (
                      <span className="text-[10px] opacity-80">
                        Sem {sec.semester}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* LOADING & ERROR STATES */}
      {loadingReport && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-3 border-blue-600 border-t-transparent mb-3" />
          <p className="text-sm font-semibold text-slate-700">Loading Section Performance & Bell Curve Data...</p>
        </div>
      )}

      {errorReport && !loadingReport && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-sm font-medium">{errorReport}</span>
          </div>
          <button
            onClick={() => selectedSectionId && setSelectedSectionId(Number(selectedSectionId))}
            className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* REPORT CONTENT */}
      {reportData && !loadingReport && (
        <div className="space-y-6">

          {/* 1. SECTION DETAILS & ADVISOR CARD (READ-ONLY) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                    {reportData.section.department_code || reportData.section.department_name}
                  </span>
                  <h3 className="text-2xl font-black tracking-tight text-white">
                    Section {reportData.section.name}
                  </h3>
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-white/10 text-white">
                    Semester {reportData.section.semester}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-blue-200 mt-2 font-medium">
                  <span>Batch: <strong className="text-white">{reportData.section.batch_name}</strong></span>
                  <span>•</span>
                  <span>Regulation: <strong className="text-white">{reportData.section.regulation}</strong></span>
                  <span>•</span>
                  <span>Total Students: <strong className="text-white">{reportData.section.total_students}</strong></span>
                </div>
              </div>

              {/* Read-Only Advisor Info Pill */}
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/15">
                <div className="p-2 bg-indigo-500/30 rounded-lg text-indigo-200">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-blue-200 font-semibold uppercase tracking-wider">Section Advisor</div>
                  <div className="text-sm font-bold text-white">
                    {reportData.advisor ? reportData.advisor.name : 'Not Assigned'}
                  </div>
                  {reportData.advisor && (
                    <div className="text-[11px] text-slate-300">
                      ID: {reportData.advisor.staff_id} • {reportData.advisor.department}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. COURSES & TEACHING ASSIGNMENT STAFF (READ-ONLY) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Courses & Teaching Faculty Allocation
                  </h3>
                  <p className="text-xs text-slate-500">
                    Read-only curriculum courses and assigned teaching staff for Semester {reportData.section.semester}
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {reportData.courses.length} Course{reportData.courses.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Course Code</th>
                    <th className="py-3 px-4">Course Title</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Class Type</th>
                    <th className="py-3 px-4">L-T-P-S-C</th>
                    <th className="py-3 px-4 min-w-[280px]">Assigned Faculty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {reportData.courses.map((course, idx) => (
                    <tr key={course.course_id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-xs font-semibold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {course.course_code}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        <div className="max-w-md truncate" title={course.course_name}>
                          {course.course_name}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                          {course.category || 'Core'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          {course.class_type || 'THEORY'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        {course.credits || '—'}
                      </td>
                      <td className="py-3 px-4">
                        {course.assigned_staff && course.assigned_staff.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {course.assigned_staff.map(st => (
                              <span
                                key={st.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200 shadow-2xs"
                              >
                                <span className="font-bold text-slate-900">{st.staff_id}</span>
                                <span>-</span>
                                <span>{st.name}</span>
                                {st.department && (
                                  <span className="px-1 py-0.2 rounded text-[10px] bg-blue-100 text-blue-800 font-medium">
                                    {st.department}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic font-medium">
                            Not assigned
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. OVERALL BELL GRAPH (ALL COURSES FOR SECTION) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    Overall Section Bell Graph
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    Multi-Course Score Distribution
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  X-Axis: Score Ranges (0–100) • Y-Axis: No. of Students across courses
                </p>
              </div>

              {/* Chart Mode Controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Chart Type:</span>
                <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setChartType('area')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      chartType === 'area' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Area
                  </button>
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      chartType === 'line' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      chartType === 'bar' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bar
                  </button>
                </div>
              </div>
            </div>

            {/* Summary Statistics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-black text-blue-600">
                  {reportData.overall.stats.total_students}
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">Total Assessed</div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-black text-emerald-600">
                  {reportData.overall.stats.class_average}%
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">Section Average</div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-black text-purple-600">
                  {reportData.overall.stats.highest}%
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">Highest Score</div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-black text-rose-600">
                  {reportData.overall.stats.lowest}%
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">Lowest Score</div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-black text-amber-600">
                  {reportData.overall.stats.pass_rate}%
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">Pass Rate (≥50%)</div>
              </div>
            </div>

            {/* Multi-Course Recharts Distribution */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 pt-6">
              <ResponsiveContainer width="100%" height={380}>
                {chartType === 'area' ? (
                  <AreaChart data={overallChartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                    <defs>
                      {courseList.map((c, idx) => {
                        const col = courseColorMap[c.course_code] || '#2563eb';
                        return (
                          <linearGradient key={c.course_code} id={`grad-${c.course_code}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={col} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={col} stopOpacity={0.03} />
                          </linearGradient>
                        );
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="range"
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                      dy={4}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      label={{
                        value: 'No. of Students',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: 11, fill: '#94a3b8' },
                        dx: 12,
                      }}
                    />
                    <Tooltip content={<CustomBellTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: 20 }} />
                    {courseList.map((c) => {
                      const col = courseColorMap[c.course_code] || '#2563eb';
                      return (
                        <Area
                          key={c.course_code}
                          type="monotone"
                          dataKey={c.course_code}
                          name={c.course_code}
                          stroke={col}
                          strokeWidth={2.5}
                          fill={`url(#grad-${c.course_code})`}
                          dot={{ r: 3, fill: col }}
                          activeDot={{ r: 6 }}
                        />
                      );
                    })}
                  </AreaChart>
                ) : chartType === 'line' ? (
                  <LineChart data={overallChartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="range"
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                      dy={4}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      label={{
                        value: 'No. of Students',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: 11, fill: '#94a3b8' },
                        dx: 12,
                      }}
                    />
                    <Tooltip content={<CustomBellTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: 20 }} />
                    {courseList.map((c) => {
                      const col = courseColorMap[c.course_code] || '#2563eb';
                      return (
                        <Line
                          key={c.course_code}
                          type="monotone"
                          dataKey={c.course_code}
                          name={c.course_code}
                          stroke={col}
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: col }}
                          activeDot={{ r: 7 }}
                        />
                      );
                    })}
                  </LineChart>
                ) : (
                  <BarChart data={overallChartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="range"
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                      dy={4}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      label={{
                        value: 'No. of Students',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: 11, fill: '#94a3b8' },
                        dx: 12,
                      }}
                    />
                    <Tooltip content={<CustomBellTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: 20 }} />
                    {courseList.map((c) => {
                      const col = courseColorMap[c.course_code] || '#2563eb';
                      return (
                        <Bar
                          key={c.course_code}
                          dataKey={c.course_code}
                          name={c.course_code}
                          fill={col}
                          radius={[4, 4, 0, 0]}
                        />
                      );
                    })}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. CYCLE-WISE BELL GRAPH */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    Cycle-wise Bell Graph
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Cycle Performance Curve
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select an assessment cycle to view score distribution across all courses in Section {reportData.section.name}
                </p>
              </div>

              {/* Cycle Tab Switcher */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl">
                {reportData.cycles.map((ck) => (
                  <button
                    key={ck}
                    type="button"
                    onClick={() => setSelectedCycleTab(ck)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedCycleTab === ck
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ck}
                  </button>
                ))}
              </div>
            </div>

            {/* Cycle Chart */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 pt-6">
              <div className="text-xs font-bold text-slate-700 mb-2 pl-2">
                {selectedCycleTab} — Score Distribution across Courses (out of 100)
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <AreaChart data={currentCycleChartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                  <defs>
                    {courseList.map((c) => {
                      const col = courseColorMap[c.course_code] || '#2563eb';
                      return (
                        <linearGradient key={c.course_code} id={`cycle-grad-${c.course_code}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={col} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={col} stopOpacity={0.03} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="range"
                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    dy={4}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    label={{
                      value: 'No. of Students',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 11, fill: '#94a3b8' },
                      dx: 12,
                    }}
                  />
                  <Tooltip content={<CustomBellTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 20 }} />
                  {courseList.map((c) => {
                    const col = courseColorMap[c.course_code] || '#2563eb';
                    return (
                      <Area
                        key={c.course_code}
                        type="monotone"
                        dataKey={c.course_code}
                        name={c.course_code}
                        stroke={col}
                        strokeWidth={2.5}
                        fill={`url(#cycle-grad-${c.course_code})`}
                        dot={{ r: 3, fill: col }}
                        activeDot={{ r: 6 }}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. INDIVIDUAL EXAM ASSIGNMENT BELL GRAPHS */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    Individual Exam Assignment Bell Graphs
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    {filteredExamAssignments.length} Exam Component{filteredExamAssignments.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed single-exam distribution curves modeled from BellGraphCard
                </p>
              </div>

              {/* Course Selector Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Filter Course:</span>
                <select
                  value={selectedExamCourseFilter}
                  onChange={(e) => setSelectedExamCourseFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="all">All Courses ({courseList.length})</option>
                  {courseList.map((c) => (
                    <option key={c.course_id} value={c.course_code}>
                      {c.course_code} - {c.course_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredExamAssignments.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No individual exam assignments found</p>
                <p className="text-xs text-slate-500 mt-1">Exams will appear as marks are entered for the courses in this section.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredExamAssignments.map((ea) => {
                  const maxCount = Math.max(1, ...ea.distribution.map(d => d.count));
                  const strokeColor = courseColorMap[ea.course_code] || '#2563eb';

                  return (
                    <div
                      key={ea.exam_id}
                      className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 shadow-2xs hover:shadow-sm transition-all p-5 space-y-4"
                    >
                      {/* Exam Header */}
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                              {ea.course_code}
                            </span>
                            <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                              {ea.cycle_name}
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-sm mt-1">
                            {ea.display_name}
                          </h4>
                          <p className="text-xs text-slate-500 truncate max-w-sm" title={ea.course_name}>
                            {ea.course_name}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-slate-600 block">
                            Max: {ea.max_marks} marks
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Weight: {ea.weight}%
                          </span>
                        </div>
                      </div>

                      {/* Summary KPI Badges */}
                      <div className="grid grid-cols-5 gap-2 text-center">
                        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                          <div className="text-sm font-black text-blue-600">{ea.total_students}</div>
                          <div className="text-[10px] font-semibold text-slate-500">Students</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                          <div className="text-sm font-black text-emerald-600">{ea.class_average}%</div>
                          <div className="text-[10px] font-semibold text-slate-500">Average</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                          <div className="text-sm font-black text-purple-600">{ea.highest}%</div>
                          <div className="text-[10px] font-semibold text-slate-500">Highest</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                          <div className="text-sm font-black text-rose-600">{ea.lowest}%</div>
                          <div className="text-[10px] font-semibold text-slate-500">Lowest</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                          <div className="text-sm font-black text-amber-600">{ea.pass_rate}%</div>
                          <div className="text-[10px] font-semibold text-slate-500">Pass Rate</div>
                        </div>
                      </div>

                      {/* Bell Graph Chart */}
                      <div className="bg-slate-50/50 rounded-xl p-2 pt-4 border border-slate-100">
                        <div className="text-[11px] font-bold text-slate-600 pl-2 mb-1">
                          Score Distribution (0–100%)
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={ea.distribution} margin={{ top: 5, right: 15, left: -15, bottom: 25 }}>
                            <defs>
                              <linearGradient id={`grad-exam-${ea.exam_id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.4} />
                                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.05} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }}
                              angle={-35}
                              textAnchor="end"
                              interval={0}
                              dy={2}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fontSize: 10, fill: '#64748b' }}
                              domain={[0, Math.ceil(maxCount * 1.2)]}
                            />
                            <Tooltip content={<CustomBellTooltip />} />
                            <Area
                              type="monotone"
                              dataKey="count"
                              name={ea.display_name}
                              stroke={strokeColor}
                              strokeWidth={2.5}
                              fill={`url(#grad-exam-${ea.exam_id})`}
                              dot={{ r: 3, fill: strokeColor }}
                              activeDot={{ r: 5 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Assigned Faculty details */}
                      {ea.assigned_staff && ea.assigned_staff.length > 0 && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
                          <span className="font-semibold text-slate-700">Faculty:</span>
                          <span>{ea.assigned_staff.map(s => `${s.staff_id} - ${s.name}`).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
