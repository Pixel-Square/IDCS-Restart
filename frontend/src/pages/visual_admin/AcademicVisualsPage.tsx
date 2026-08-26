import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, PieChart, LineChart as LineChartIcon, Eye, Plus, Search, Filter,
  Shield, CheckCircle2, AlertTriangle, Save, ArrowLeft, Trash2, Copy,
  Edit3, Lock, Grid, Table as TableIcon, Activity, ChevronRight, Award,
  Check, RefreshCw, Clock, Sparkles, Layers, Sliders, Database, LayoutGrid
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart as RePieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts';
import {
  fetchDashboards, createDashboard, fetchDashboardDetail, saveDashboard, deleteDashboard,
  fetchDynamicOptions, queryDashboardVisualData, DashboardDefinition, DashboardVisualConfig,
  DynamicOptionsResponse, DashboardQueryResult
} from '../../services/academicVisuals';

const CHART_TYPES = [
  { id: 'column', label: 'Column Chart', icon: BarChart3, desc: 'Vertical category comparison' },
  { id: 'bar', label: 'Bar Chart', icon: BarChart3, desc: 'Horizontal category comparison' },
  { id: 'line', label: 'Line Chart', icon: LineChartIcon, desc: 'Trend over time / test' },
  { id: 'area', label: 'Area Chart', icon: Activity, desc: 'Volume trend analysis' },
  { id: 'pie', label: 'Pie Chart', icon: PieChart, desc: 'Proportional distribution' },
  { id: 'donut', label: 'Donut Chart', icon: PieChart, desc: 'Proportional ring view' },
  { id: 'kpi', label: 'KPI Card', icon: Award, desc: 'Single high-impact metric' },
  { id: 'table', label: 'Data Table', icon: TableIcon, desc: 'Detailed tabular view' },
];

const SERIES_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];

export default function AcademicVisualsPage() {
  const [dashboards, setDashboards] = useState<DashboardDefinition[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<DashboardDefinition | null>(null);
  const [viewMode, setViewMode] = useState<'landing' | 'workspace' | 'preview'>('landing');

  // Dynamic Options queried from DB
  type VisualsOptions = Omit<DynamicOptionsResponse, 'departments'> & { departments: string[] };
  const [options, setOptions] = useState<VisualsOptions>({
    departments: ['CSE', 'AI & DS', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT'],
    semesters: [1, 2, 3, 4, 5, 6, 7, 8],
    sections: [],
    academicYears: ['2026-27', '2025-26'],
    batches: [],
    subjects: [],
    tests: [],
    courseCategories: [],
    assessmentTypes: [],
    dbConnected: true,
  });

  // Query Results cache for each visual on canvas: { [visualId]: DashboardQueryResult }
  const [visualDataMap, setVisualDataMap] = useState<Record<string, DashboardQueryResult>>({});
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);

  // Landing search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('all');

  // Create Dashboard Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDashName, setNewDashName] = useState('Student Academic Performance Dashboard');
  const [newDashDept, setNewDashDept] = useState('CSE');
  const [newDashYear, setNewDashYear] = useState('3rd Year');

  // Add / Edit Visual Modal state
  const [showVisualModal, setShowVisualModal] = useState(false);
  const [editingVisual, setEditingVisual] = useState<DashboardVisualConfig | null>(null);

  // Simulation mode
  const [simulatedRole, setSimulatedRole] = useState<'Admin' | 'HOD' | 'Faculty' | 'Student'>('Admin');

  // Load Dashboards & Dynamic DB Options on mount
  useEffect(() => {
    async function init() {
      const opts = await fetchDynamicOptions();
      if (opts) {
        setOptions({
          ...opts,
          departments: (opts.departments as any[]).map((d) =>
            typeof d === 'string' ? d : String(d?.code || d?.name || d?.id || '')
          ),
        });
      }

      const list = await fetchDashboards();
      if (list && list.length > 0) setDashboards(list);
    }
    init();
  }, []);

  // Cascading Year -> Semesters mapping
  const getSemestersForYear = (yearStr: string) => {
    if (yearStr === '1st Year') return [1, 2];
    if (yearStr === '2nd Year') return [3, 4];
    if (yearStr === '3rd Year') return [5, 6];
    if (yearStr === '4th Year') return [7, 8];
    return [1, 2, 3, 4, 5, 6, 7, 8];
  };

  // Filter subjects based on selected department & semester
  const availableSubjects = options.subjects.filter((s) => {
    const matchesDept = !activeDashboard?.globalFilters.department || activeDashboard.globalFilters.department === 'ALL' || s.department === activeDashboard.globalFilters.department;
    const matchesSem = !activeDashboard?.globalFilters.semester || s.semester === Number(activeDashboard.globalFilters.semester);
    return matchesDept && matchesSem;
  });

  // Query Backend ORM Data for all visuals on canvas
  const refreshCanvasData = useCallback(async (dash: DashboardDefinition) => {
    setIsQuerying(true);
    const newMap: Record<string, DashboardQueryResult> = {};

    for (const vis of dash.visuals) {
      const res = await queryDashboardVisualData(dash.globalFilters, vis);
      newMap[vis.id] = res;
    }

    setVisualDataMap(newMap);
    setIsQuerying(false);
  }, []);

  // Trigger query refresh whenever activeDashboard or globalFilters change in workspace mode
  useEffect(() => {
    if ((viewMode === 'workspace' || viewMode === 'preview') && activeDashboard) {
      refreshCanvasData(activeDashboard);
    }
  }, [activeDashboard, viewMode, refreshCanvasData]);

  // Auto-Refresh Polling
  useEffect(() => {
    if (autoRefreshInterval > 0 && (viewMode === 'workspace' || viewMode === 'preview') && activeDashboard) {
      const timer = setInterval(() => {
        refreshCanvasData(activeDashboard);
      }, autoRefreshInterval * 1000);
      return () => clearInterval(timer);
    }
  }, [autoRefreshInterval, activeDashboard, viewMode, refreshCanvasData]);

  // Ensure a dashboard coming from the backend always has globalFilters populated.
  const withGlobalFilters = (dash: DashboardDefinition): DashboardDefinition => ({
    ...dash,
    globalFilters: dash.globalFilters || {
      academicYear: dash.academicYear || '',
      department: dash.department || 'ALL',
      year: dash.year || '',
      semester: dash.semester ?? '',
      subjects: [],
      test: ''
    }
  });

  const handleOpenDashboard = async (id: string) => {
    const detail = await fetchDashboardDetail(id);
    if (detail) {
      setActiveDashboard(withGlobalFilters(detail));
    } else {
      const target = dashboards.find((d) => d.id === id);
      if (target) setActiveDashboard(withGlobalFilters(target));
    }
    setViewMode('workspace');
  };

  const handleCreateDashboardSubmit = async () => {
    const sem = getSemestersForYear(newDashYear)[0];
    const newDash: DashboardDefinition = {
      id: `dash-${Date.now()}`,
      name: newDashName || 'New Academic Dashboard',
      department: newDashDept || 'CSE',
      academicYear: '2026-27',
      year: newDashYear || '3rd Year',
      semester: sem || 5,
      status: 'draft',
      accessRoles: ['Super Admin', 'Admin', 'HOD', 'Faculty'],
      createdDate: new Date().toISOString().split('T')[0],
      updatedDate: new Date().toISOString().split('T')[0],
      globalFilters: {
        academicYear: '2026-27',
        department: newDashDept || 'CSE',
        year: newDashYear || '3rd Year',
        semester: sem || 5,
        subjects: [],
        test: ''
      },
      multiFilters: {
        academicYears: ['2026-27'],
        departments: [newDashDept || 'CSE'],
        semesters: sem ? [String(sem)] : [],
        sections: [],
        subjectNames: [],
        subjectCodes: [],
        tests: [],
        courseCategories: [],
        assessmentTypes: [],
        performanceLevels: []
      },
      visuals: []
    };

    // Immediate reactive UI state update & modal dismissal
    setActiveDashboard(newDash);
    setDashboards([newDash, ...dashboards]);
    setShowCreateModal(false);
    setViewMode('workspace');

    // Async backend save
    await createDashboard(newDashName, newDashDept, '2026-27', newDashYear, sem);
  };


  const handleSaveActiveDashboard = async (publishStatus?: 'published' | 'draft') => {
    if (!activeDashboard) return;
    const updated: DashboardDefinition = {
      ...activeDashboard,
      status: publishStatus || activeDashboard.status,
      updatedDate: new Date().toISOString().split('T')[0],
    };
    await saveDashboard(updated);
    setActiveDashboard(updated);
    setDashboards(dashboards.map((d) => (d.id === updated.id ? updated : d)));
    alert('Dashboard configuration saved successfully!');
  };

  const handleDeleteDashboard = async (id: string) => {
    if (confirm('Are you sure you want to delete this dashboard?')) {
      await deleteDashboard(id);
      setDashboards(dashboards.filter((d) => d.id !== id));
      if (activeDashboard?.id === id) setViewMode('landing');
    }
  };

  const handleOpenAddVisualModal = () => {
    setEditingVisual({
      id: `vis-${Date.now()}`,
      title: 'New Academic Visual',
      type: 'column',
      dataset: 'student_marks',
      xAxisField: '',
      yAxisField: '',
      compareBy: '',
      category: 'student_name',
      measure: 'marks_obtained',
      seriesField: 'subject',
      aggregation: 'average',
      layout: { x: 0, y: 0, w: 6, h: 4 },
    });
    setShowVisualModal(true);
  };

  const handleOpenEditVisualModal = (vis: DashboardVisualConfig) => {
    setEditingVisual({ ...vis });
    setShowVisualModal(true);
  };

  const handleSaveVisualModal = () => {
    if (!activeDashboard || !editingVisual) return;
    const exists = activeDashboard.visuals.some((v) => v.id === editingVisual.id);
    let updatedVisuals: DashboardVisualConfig[];
    if (exists) {
      updatedVisuals = activeDashboard.visuals.map((v) => (v.id === editingVisual.id ? editingVisual : v));
    } else {
      updatedVisuals = [...activeDashboard.visuals, editingVisual];
    }

    const updatedDash = { ...activeDashboard, visuals: updatedVisuals };
    setActiveDashboard(updatedDash);
    setShowVisualModal(false);
    setEditingVisual(null);
  };

  const handleDeleteVisualOnCanvas = (visId: string) => {
    if (!activeDashboard) return;
    const updatedVisuals = activeDashboard.visuals.filter((v) => v.id !== visId);
    setActiveDashboard({ ...activeDashboard, visuals: updatedVisuals });
  };

  const handleDuplicateVisualOnCanvas = (vis: DashboardVisualConfig) => {
    if (!activeDashboard) return;
    const dup: DashboardVisualConfig = {
      ...vis,
      id: `vis-${Date.now()}`,
      title: `${vis.title} (Copy)`,
    };
    setActiveDashboard({ ...activeDashboard, visuals: [...activeDashboard.visuals, dup] });
  };

  const filteredDashboards = dashboards.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) || d.department.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = filterDept === 'all' || d.department === filterDept;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white py-6 px-6 shadow-md">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 backdrop-blur-md rounded-xl border border-blue-400/30">
              <LayoutGrid className="w-8 h-8 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Academic Visuals Builder</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                  Power BI Dashboard Engine
                </span>
              </div>
              <p className="text-slate-300 text-xs mt-1">
                Multi-visual dashboard builder backed by real Django ORM database queries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {viewMode === 'landing' ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg"
              >
                <Plus className="w-4 h-4" />
                Create Dashboard
              </button>
            ) : (
              <button
                onClick={() => setViewMode('landing')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium backdrop-blur-md border border-white/20 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboards
              </button>
            )}
          </div>
        </div>
      </div>

      {/* VIEW 1: DASHBOARD MANAGEMENT LANDING PAGE */}
      {viewMode === 'landing' && (
        <div className="max-w-[1400px] mx-auto px-6 mt-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Academic Performance Dashboards</h2>
              <p className="text-slate-500 text-xs mt-0.5">Select a dashboard to view or construct multi-visual analytics</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search dashboards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none w-64"
                />
              </div>

              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="all">All Departments</option>
                {options.departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {filteredDashboards.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-2xs">
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <LayoutGrid className="w-10 h-10 text-blue-600" />
              </div>
              <div className="max-w-md">
                <h3 className="text-lg font-bold text-slate-900">No Dashboards Created Yet</h3>
                <p className="text-xs text-slate-500 mt-1">
                  The workspace is clean and empty. Click the button below to start building your academic analytics dashboard from scratch.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                <Plus className="w-4 h-4" />
                Create First Dashboard
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDashboards.map((dash) => (
                <div key={dash.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                        {dash.department} • {dash.year || '3rd Year'}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        dash.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {dash.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-lg mb-1">{dash.name}</h3>
                    <p className="text-xs text-slate-500 mb-4">
                      {dash.visuals.length} Visual Components • Academic Year: {dash.academicYear}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {dash.accessRoles.map((role) => (
                        <span key={role} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold border">
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenDashboard(dash.id)}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Grid className="w-3.5 h-3.5" />
                      Open Dashboard
                    </button>
                    <button
                      onClick={() => handleDeleteDashboard(dash.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: POWER BI STYLE MULTI-VISUAL CANVAS WORKSPACE */}
      {(viewMode === 'workspace' || viewMode === 'preview') && activeDashboard && (
        <div className="max-w-[1600px] mx-auto px-4 mt-4 space-y-4">
          {/* Top Bar Actions */}
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={activeDashboard.name}
                onChange={(e) => setActiveDashboard({ ...activeDashboard, name: e.target.value })}
                className="text-xl font-bold text-slate-900 border-b border-dashed border-slate-300 focus:border-blue-600 focus:outline-none bg-transparent px-1"
              />
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {activeDashboard.department}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-bold text-slate-600">Auto Refresh:</span>
                <select
                  value={autoRefreshInterval}
                  onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-blue-600 focus:outline-none"
                >
                  <option value={0}>Off</option>
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                  <option value={300}>5m</option>
                </select>
              </div>

              <button
                onClick={() => refreshCanvasData(activeDashboard)}
                disabled={isQuerying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isQuerying ? 'animate-spin text-blue-600' : ''}`} />
                Refresh Data
              </button>

              <button
                onClick={handleOpenAddVisualModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Visual
              </button>

              <button
                onClick={() => setViewMode(viewMode === 'preview' ? 'workspace' : 'preview')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'preview' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Eye className="w-4 h-4" />
                {viewMode === 'preview' ? 'Exit Preview' : 'Live Preview'}
              </button>

              <button
                onClick={() => handleSaveActiveDashboard('published')}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                <Save className="w-4 h-4" />
                Save Dashboard
              </button>
            </div>
          </div>

          {/* GLOBAL DASHBOARD FILTERS BAR */}
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Sliders className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Global Dashboard Filters</h3>
              <span className="text-[11px] text-slate-400 ml-auto">Updates all canvas visuals simultaneously</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {/* Academic Year */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Academic Year</label>
                <select
                  value={activeDashboard.globalFilters.academicYear}
                  onChange={(e) => setActiveDashboard({
                    ...activeDashboard,
                    globalFilters: { ...activeDashboard.globalFilters, academicYear: e.target.value }
                  })}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {options.academicYears.map((ay) => (
                    <option key={ay} value={ay}>{ay}</option>
                  ))}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Department</label>
                <select
                  value={activeDashboard.globalFilters.department}
                  onChange={(e) => setActiveDashboard({
                    ...activeDashboard,
                    globalFilters: { ...activeDashboard.globalFilters, department: e.target.value }
                  })}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="ALL">All Departments</option>
                  {options.departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Year -> Cascading Semester */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Academic Year Level</label>
                <select
                  value={activeDashboard.globalFilters.year}
                  onChange={(e) => {
                    const newYr = e.target.value;
                    const sem = getSemestersForYear(newYr)[0];
                    setActiveDashboard({
                      ...activeDashboard,
                      globalFilters: { ...activeDashboard.globalFilters, year: newYr, semester: sem }
                    });
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                </select>
              </div>

              {/* Semester (Cascaded) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Semester</label>
                <select
                  value={activeDashboard.globalFilters.semester}
                  onChange={(e) => setActiveDashboard({
                    ...activeDashboard,
                    globalFilters: { ...activeDashboard.globalFilters, semester: e.target.value }
                  })}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {getSemestersForYear(activeDashboard.globalFilters.year).map((s) => (
                    <option key={s} value={s}>Semester {s}</option>
                  ))}
                </select>
              </div>

              {/* Test Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Test / Exam</label>
                <select
                  value={activeDashboard.globalFilters.test}
                  onChange={(e) => setActiveDashboard({
                    ...activeDashboard,
                    globalFilters: { ...activeDashboard.globalFilters, test: e.target.value }
                  })}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">All Tests</option>
                  {options.tests.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic Subjects Multi-Select Checkboxes */}
            {availableSubjects.length > 0 && (
              <div className="pt-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Dynamic Subjects Filter (DB Records)</label>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                  {availableSubjects.map((subj) => {
                    const isChecked = activeDashboard.globalFilters.subjects.includes(subj.id);
                    return (
                      <label key={subj.id} className="inline-flex items-center text-xs font-semibold text-slate-700 cursor-pointer bg-white px-2 py-1 rounded border border-slate-200 hover:border-blue-300">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let updatedSubjs: string[];
                            if (e.target.checked) {
                              updatedSubjs = [...activeDashboard.globalFilters.subjects, subj.id];
                            } else {
                              updatedSubjs = activeDashboard.globalFilters.subjects.filter((id) => id !== subj.id);
                            }
                            setActiveDashboard({
                              ...activeDashboard,
                              globalFilters: { ...activeDashboard.globalFilters, subjects: updatedSubjs }
                            });
                          }}
                          className="mr-1.5 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>{subj.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* MULTI-VISUAL CANVAS GRID */}
          {activeDashboard.visuals.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm max-w-xl mx-auto my-6">
              <Grid className="w-12 h-12 text-blue-600 mx-auto mb-3" />
              <h3 className="text-lg font-extrabold text-slate-900">Empty Dashboard Canvas</h3>
              <p className="text-slate-500 text-xs mt-1 max-w-xs mx-auto">
                Click "+ Add Visual" to construct your multi-visual dashboard with charts, KPI cards, and data tables.
              </p>
              <button
                onClick={handleOpenAddVisualModal}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md"
              >
                <Plus className="w-4 h-4" />
                Add First Visual
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {activeDashboard.visuals.map((vis) => {
                const resData = visualDataMap[vis.id] || { columns: [], rows: [], pivotedData: [], meta: { dataset: vis.dataset, recordCount: 0, dbConnected: true } };
                const pivotedRows = resData.pivotedData || [];
                const seriesKeys = pivotedRows.length > 0 ? Object.keys(pivotedRows[0]).filter((k) => k !== 'name') : [];

                return (
                  <div
                    key={vis.id}
                    className={`bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between min-h-[320px] transition-all hover:shadow-md ${
                      vis.type === 'kpi' ? 'col-span-12 sm:col-span-6 md:col-span-4' :
                      vis.type === 'table' ? 'col-span-12' : 'col-span-12 md:col-span-6'
                    }`}
                  >
                    {/* Visual Card Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{vis.title}</h4>
                        <p className="text-[11px] text-slate-400">
                          {vis.category} vs {vis.measure} ({vis.aggregation})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {resData.meta?.recordCount > 0 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            Database Connected ({resData.meta.recordCount} DB Rows)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            No Data Available
                          </span>
                        )}

                        {viewMode === 'workspace' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditVisualModal(vis)}
                              title="Edit Visual"
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDuplicateVisualOnCanvas(vis)}
                              title="Duplicate Visual"
                              className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteVisualOnCanvas(vis.id)}
                              title="Delete Visual"
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Visual Card Body */}
                    {pivotedRows.length === 0 ? (
                      <div className="h-48 flex flex-col items-center justify-center text-center p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <AlertTriangle className="w-8 h-8 text-amber-500 mb-1.5" />
                        <h5 className="font-bold text-slate-800 text-xs">No Data Available</h5>
                        <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
                          No matching records found for Department: {activeDashboard.globalFilters.department}, Semester: {activeDashboard.globalFilters.semester}.
                        </p>
                      </div>
                    ) : vis.type === 'kpi' ? (
                      <div className="h-48 flex flex-col items-center justify-center text-center bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
                        <Award className="w-10 h-10 text-blue-600 mb-1" />
                        <span className="text-3xl font-extrabold text-slate-900">
                          {pivotedRows[0] ? pivotedRows[0][seriesKeys[0] || 'Value'] || '0' : 'N/A'}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 mt-1">
                          {vis.measure} ({vis.aggregation})
                        </span>
                      </div>
                    ) : vis.type === 'column' || vis.type === 'bar' ? (
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            layout={vis.type === 'bar' ? 'vertical' : 'horizontal'}
                            data={pivotedRows}
                            margin={{ top: 5, right: 15, left: 0, bottom: 15 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            {vis.type === 'bar' ? (
                              <>
                                <XAxis type="number" stroke="#64748b" fontSize={11} />
                                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} />
                              </>
                            ) : (
                              <>
                                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                                <YAxis stroke="#64748b" fontSize={11} />
                              </>
                            )}
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', color: '#fff' }} />
                            <Legend />
                            {seriesKeys.map((sKey, idx) => (
                              <Bar
                                key={sKey}
                                dataKey={sKey}
                                name={sKey}
                                fill={SERIES_COLORS[idx % SERIES_COLORS.length]}
                                radius={[4, 4, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : vis.type === 'line' || vis.type === 'area' ? (
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          {vis.type === 'area' ? (
                            <AreaChart data={pivotedRows}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                              <YAxis stroke="#64748b" fontSize={11} />
                              <Tooltip />
                              <Legend />
                              {seriesKeys.map((sKey, idx) => (
                                <Area
                                  key={sKey}
                                  type="monotone"
                                  dataKey={sKey}
                                  stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                                  fill={SERIES_COLORS[idx % SERIES_COLORS.length]}
                                  fillOpacity={0.2}
                                />
                              ))}
                            </AreaChart>
                          ) : (
                            <LineChart data={pivotedRows}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                              <YAxis stroke="#64748b" fontSize={11} />
                              <Tooltip />
                              <Legend />
                              {seriesKeys.map((sKey, idx) => (
                                <Line
                                  key={sKey}
                                  type="monotone"
                                  dataKey={sKey}
                                  stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                                  strokeWidth={3}
                                  dot={{ r: 4 }}
                                />
                              ))}
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    ) : vis.type === 'pie' || vis.type === 'donut' ? (
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={pivotedRows}
                              dataKey={seriesKeys[0] || 'Value'}
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={vis.type === 'donut' ? 50 : 0}
                              outerRadius={75}
                              paddingAngle={3}
                            >
                              {pivotedRows.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-64">
                        <table className="w-full text-left text-xs text-slate-700">
                          <thead className="bg-slate-100 font-bold sticky top-0">
                            <tr>
                              <th className="p-2">Name</th>
                              {seriesKeys.map((k) => (
                                <th key={k} className="p-2 text-right">{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {pivotedRows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-2 font-bold">{row.name}</td>
                                {seriesKeys.map((k) => (
                                  <td key={k} className="p-2 text-right text-blue-600 font-bold">{row[k]}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="pt-2 text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-100 mt-2">
                      <span>Dataset: {vis.dataset}</span>
                      <span>Records: {resData.meta?.recordCount || 0}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE DASHBOARD MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create New Academic Dashboard</h3>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Dashboard Title</label>
              <input
                type="text"
                value={newDashName}
                onChange={(e) => setNewDashName(e.target.value)}
                className="w-full p-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Department Scope</label>
              <select
                value={newDashDept}
                onChange={(e) => setNewDashDept(e.target.value)}
                className="w-full p-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {options.departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Academic Year Level</label>
              <select
                value={newDashYear}
                onChange={(e) => setNewDashYear(e.target.value)}
                className="w-full p-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3.5 py-1.5 bg-slate-200 text-slate-700 font-bold text-xs rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDashboardSubmit}
                className="px-4 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-sm"
              >
                Create Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT VISUAL BUILDER MODAL */}
      {showVisualModal && editingVisual && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 my-8">
            <h3 className="text-lg font-bold text-slate-900">Configure Dashboard Visual</h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Visual Title</label>
              <input
                type="text"
                value={editingVisual.title}
                onChange={(e) => setEditingVisual({ ...editingVisual, title: e.target.value })}
                className="w-full p-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">Visual Type</label>
              <div className="grid grid-cols-4 gap-2">
                {CHART_TYPES.map((t) => {
                  const Icon = t.icon;
                  const isSelected = editingVisual.type === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setEditingVisual({ ...editingVisual, type: t.id as any })}
                      className={`p-2 rounded-lg border text-center flex flex-col items-center ${
                        isSelected ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <Icon className="w-4 h-4 mb-1" />
                      <span className="text-[10px]">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category (X-Axis)</label>
                <select
                  value={editingVisual.category}
                  onChange={(e) => setEditingVisual({ ...editingVisual, category: e.target.value })}
                  className="w-full p-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="student_name">Student Name</option>
                  <option value="reg_no">Register Number</option>
                  <option value="subject">Subject</option>
                  <option value="department">Department</option>
                  <option value="test">Test</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Measure (Y-Axis Value)</label>
                <select
                  value={editingVisual.measure}
                  onChange={(e) => setEditingVisual({ ...editingVisual, measure: e.target.value })}
                  className="w-full p-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="marks_obtained">Marks Obtained</option>
                  <option value="attendance_pct">Attendance Percentage</option>
                  <option value="cgpa">CGPA</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Series Grouping (Pivot)</label>
                <select
                  value={editingVisual.seriesField}
                  onChange={(e) => setEditingVisual({ ...editingVisual, seriesField: e.target.value })}
                  className="w-full p-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="subject">Subject</option>
                  <option value="test">Test</option>
                  <option value="department">Department</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Aggregation</label>
                <select
                  value={editingVisual.aggregation}
                  onChange={(e) => setEditingVisual({ ...editingVisual, aggregation: e.target.value as any })}
                  className="w-full p-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="average">Average</option>
                  <option value="sum">Sum</option>
                  <option value="count">Count</option>
                  <option value="min">Minimum</option>
                  <option value="max">Maximum</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowVisualModal(false)}
                className="px-3.5 py-1.5 bg-slate-200 text-slate-700 font-bold text-xs rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVisualModal}
                className="px-4 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-sm"
              >
                Add to Canvas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
