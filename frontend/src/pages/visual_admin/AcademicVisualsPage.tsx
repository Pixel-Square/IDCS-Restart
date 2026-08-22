import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BarChart3, PieChart, LineChart as LineChartIcon, Eye, Plus, Search, Filter,
  Shield, CheckCircle2, AlertTriangle, Save, ArrowLeft, Trash2, Copy,
  Edit3, Lock, Grid, Table as TableIcon, Activity, ChevronRight, Award,
  Check, RefreshCw, Clock, Sparkles, Layers, Sliders, Database, LayoutGrid,
  Download, X, ArrowUpDown, ChevronDown, RotateCcw, HelpCircle, FileSpreadsheet,
  Gauge as GaugeIcon, Share2, FolderPlus, CheckCircle, LayoutDashboard, Users,
  ExternalLink, Key, CheckSquare, Square
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart as RePieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  ScatterChart, Scatter, ZAxis
} from 'recharts';
import {
  fetchDynamicOptions, queryDashboardVisualData, fetchDashboards, saveDashboard, deleteDashboard,
  DashboardVisualConfig, DynamicOptionsResponse, GlobalDashboardFilters, DashboardQueryResult,
  DepartmentOption, SubjectOption
} from '../../services/academicVisuals';

const VISUAL_CATALOG = [
  // Comparison
  { id: 'column', label: 'Clustered Column', category: 'Comparison', icon: BarChart3, desc: 'Vertical category / series comparison' },
  { id: 'bar', label: 'Clustered Bar', category: 'Comparison', icon: BarChart3, desc: 'Horizontal category comparison' },
  { id: 'line', label: 'Line Chart', category: 'Comparison', icon: LineChartIcon, desc: 'Multi-series trend over mark range or exams' },
  { id: 'area', label: 'Area Chart', category: 'Comparison', icon: Activity, desc: 'Multi-series volume comparison over time' },
  // Part to Whole
  { id: 'pie', label: 'Pie Chart', category: 'Part-to-Whole', icon: PieChart, desc: 'Proportional distribution' },
  { id: 'donut', label: 'Donut Chart', category: 'Part-to-Whole', icon: PieChart, desc: 'Ring distribution' },
  // Relationship
  { id: 'scatter', label: 'Scatter Chart', category: 'Relationship', icon: Activity, desc: 'Distribution & multi-group correlation' },
  // KPI / Summary
  { id: 'kpi', label: 'Card / KPI', category: 'KPI & Summary', icon: Award, desc: 'High-impact metrics (supports multi-compare cards)' },
  { id: 'gauge', label: 'Gauge', category: 'KPI & Summary', icon: GaugeIcon, desc: 'Target vs actual progress (multi-gauge cards)' },
  // Tables
  { id: 'table', label: 'Data Table', category: 'Tables', icon: TableIcon, desc: 'Detailed multi-column comparison sheet' },
  { id: 'matrix', label: 'Matrix', category: 'Tables', icon: TableIcon, desc: 'Cross-tabulated summary matrix' },
];

const COMPARE_DIMENSIONS = [
  { id: 'none', label: 'None (Aggregate All)' },
  { id: 'Department', label: 'Department' },
  { id: 'Section', label: 'Section' },
  { id: 'Subject Name', label: 'Subject Name' },
  { id: 'Subject Code', label: 'Subject Code' },
  { id: 'Test / Exam', label: 'Test / Exam' },
  { id: 'Academic Year', label: 'Academic Year' },
  { id: 'Semester', label: 'Semester' },
  { id: 'Course Category', label: 'Course Category' },
  { id: 'Assessment Type', label: 'Assessment Type' },
  { id: 'Mark Range', label: 'Mark Range' }
];

const AVAILABLE_ROLES = [
  { id: 'Super Admin', label: 'Super Admin' },
  { id: 'Admin', label: 'Admin' },
  { id: 'Principal', label: 'Principal' },
  { id: 'Dean', label: 'Deans / Directors' },
  { id: 'HOD', label: 'Head of Department (HOD)' },
  { id: 'Faculty', label: 'Faculty / Staff' },
  { id: 'Student', label: 'Students' },
  { id: 'IQAC', label: 'IQAC Members' }
];

const SERIES_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1',
  '#06b6d4', '#84cc16', '#d946ef', '#f97316', '#a855f7', '#0284c7', '#059669', '#e11d48'
];
const LOCAL_STORAGE_KEY = 'idcs_academic_visuals_active_dashboard_v2';
const SAVED_DASHBOARDS_LIST_KEY = 'idcs_academic_visuals_saved_list_v2';

// Mutually Exclusive Multi-Select Slicer Dropdown Component
function MultiSelectSlicer({
  id,
  label,
  options,
  selectedValues,
  onChange,
  openDropdown,
  setOpenDropdown,
  allLabel = 'All'
}: {
  id: string;
  label: string;
  options: Array<{ id: string; label: string; code?: string }>;
  selectedValues: string[];
  onChange: (vals: string[]) => void;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
  allLabel?: string;
}) {
  const isOpen = openDropdown === id;
  const isAll = selectedValues.length === 0;
  const containerRef = useRef<HTMLDivElement>(null);

  const handleToggle = (optId: string) => {
    if (selectedValues.includes(optId)) {
      onChange(selectedValues.filter(v => v !== optId));
    } else {
      onChange([...selectedValues, optId]);
    }
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  const getDisplayText = () => {
    if (isAll) return allLabel;
    if (selectedValues.length === 1) {
      const match = options.find(o => o.id === selectedValues[0]);
      return match ? match.label : selectedValues[0];
    }
    return `${selectedValues.length} Selected (Multi)`;
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
        <span className="truncate">{label}</span>
        {selectedValues.length > 1 && (
          <span className="text-[9px] font-extrabold px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-md shrink-0">
            Compare ({selectedValues.length})
          </span>
        )}
      </label>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpenDropdown(isOpen ? null : id);
        }}
        className={`w-full p-2 text-left font-semibold text-xs border rounded-xl flex items-center justify-between transition-all bg-slate-50 ${
          selectedValues.length > 1
            ? 'border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/30'
            : 'border-slate-300'
        }`}
      >
        <span className="truncate pr-2">{getDisplayText()}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full left-0 mt-1 w-64 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 space-y-1"
        >
          <button
            type="button"
            onClick={() => {
              handleSelectAll();
              setOpenDropdown(null);
            }}
            className={`w-full p-2 text-left text-xs font-bold rounded-xl flex items-center gap-2 hover:bg-slate-100 ${
              isAll ? 'bg-blue-50 text-blue-600' : 'text-slate-700'
            }`}
          >
            {isAll ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" /> : <Square className="w-4 h-4 text-slate-400 shrink-0" />}
            <span className="truncate">{allLabel}</span>
          </button>

          <div className="border-t border-slate-100 my-1" />

          {options.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400 font-medium">
              No options available
            </div>
          ) : (
            options.map(opt => {
              const isChecked = selectedValues.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleToggle(opt.id)}
                  className={`w-full p-2 text-left text-xs font-semibold rounded-xl flex items-center gap-2 hover:bg-slate-100 transition-colors ${
                    isChecked ? 'bg-blue-50/60 text-blue-700 font-bold' : 'text-slate-700'
                  }`}
                >
                  {isChecked ? (
                    <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function AcademicVisualsPage() {
  // Centralized Mutually Exclusive Dropdown State
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Global Outside Click Listener to Close Active Dropdown
  useEffect(() => {
    const handleGlobalClick = () => {
      if (openDropdown !== null) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [openDropdown]);

  // Dashboard Identity State
  const [dashboardId, setDashboardId] = useState<string>('dash-default');
  const [dashboardName, setDashboardName] = useState<string>('Academic Performance Analytics');
  const [dashboardStatus, setDashboardStatus] = useState<'draft' | 'published'>('draft');
  const [accessRoles, setAccessRoles] = useState<string[]>(['Super Admin', 'Admin', 'Principal', 'Dean', 'HOD', 'Faculty']);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);

  // My Dashboards Manager Modal State
  const [isMyDashboardsOpen, setIsMyDashboardsOpen] = useState(false);
  const [savedDashboardsList, setSavedDashboardsList] = useState<any[]>([]);

  // Permissions Modal State
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [tempAccessRoles, setTempAccessRoles] = useState<string[]>([]);

  // Multi-Selection Global Slicers State (Strictly Academic - Gender Removed)
  const [multiFilters, setMultiFilters] = useState<{
    academicYears: string[];
    departments: string[];
    semesters: string[];
    sections: string[];
    subjectNames: string[];
    subjectCodes: string[];
    tests: string[];
    courseCategories: string[];
    assessmentTypes: string[];
    performanceLevels: string[];
  }>({
    academicYears: [],
    departments: [],
    semesters: [],
    sections: [],
    subjectNames: [],
    subjectCodes: [],
    tests: [],
    courseCategories: [],
    assessmentTypes: [],
    performanceLevels: []
  });

  // Dynamic Options queried directly from DB
  const [options, setOptions] = useState<DynamicOptionsResponse>({
    departments: [],
    academicYears: ['2026-27', '2025-26', '2024-25', '2023-24'],
    semesters: [1, 2, 3, 4, 5, 6, 7, 8],
    sections: ['A', 'B', 'C', 'D'],
    subjects: [],
    subjectMappings: [],
    tests: [
      { id: 'CIA 1', name: 'CIA 1' },
      { id: 'CIA 2', name: 'CIA 2' },
      { id: 'SSA 1', name: 'SSA 1' },
      { id: 'SSA 2', name: 'SSA 2' },
      { id: 'FA 1', name: 'FA 1 (Formative 1)' },
      { id: 'FA 2', name: 'FA 2 (Formative 2)' },
      { id: 'Model Exam', name: 'Model Exam' },
      { id: 'Lab Exam', name: 'Lab Exam' },
      { id: 'Final Internal', name: 'Final Internal' }
    ],
    courseCategories: ['PC', 'PE', 'OE', 'EE', 'MC', 'HS'],
    assessmentTypes: ['Theory', 'Lab', 'Integrated', 'Project', 'Review', 'Internal', 'External'],
    performanceLevels: ['Above 58%', 'Equal to 58%', 'Below 58%'],
    markRanges: ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'],
    dbConnected: true,
  });

  // Multi-Visual Canvas State
  const [visuals, setVisuals] = useState<DashboardVisualConfig[]>([]);
  const [visualDataMap, setVisualDataMap] = useState<Record<string, DashboardQueryResult>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  // Add / Edit Modal Drawer State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<'select' | 'configure'>('select');
  const [selectedVisualType, setSelectedVisualType] = useState<string>('column');
  const [editingVisual, setEditingVisual] = useState<DashboardVisualConfig | null>(null);

  // Cross Filtering & Search State
  const [crossFilterKey, setCrossFilterKey] = useState<string | null>(null);
  const [visualCatalogSearch, setVisualCatalogSearch] = useState('');

  // 1. Initial Load: Restore Active Dashboard & Saved Dashboards List
  useEffect(() => {
    try {
      const savedStr = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedStr) {
        const parsed = JSON.parse(savedStr);
        if (parsed.id) setDashboardId(parsed.id);
        if (parsed.name) setDashboardName(parsed.name);
        if (parsed.status) setDashboardStatus(parsed.status);
        if (Array.isArray(parsed.accessRoles)) setAccessRoles(parsed.accessRoles);
        if (parsed.multiFilters) {
          // Exclude any legacy gender field if present in saved storage
          const { gender, ...sanitizedFilters } = parsed.multiFilters;
          setMultiFilters(sanitizedFilters);
        }
        if (Array.isArray(parsed.visuals) && parsed.visuals.length > 0) {
          setVisuals(parsed.visuals);
        }
      }

      // Load saved list
      const listStr = localStorage.getItem(SAVED_DASHBOARDS_LIST_KEY);
      if (listStr) {
        setSavedDashboardsList(JSON.parse(listStr));
      }
    } catch (e) {
      console.warn('Failed restoring from localStorage:', e);
    }
  }, []);

  // 2. Load Dynamic Options from DB
  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await fetchDynamicOptions();
        if (res) setOptions(res);
      } catch (err) {
        console.error('Failed to load dynamic options:', err);
      }
    }
    loadOptions();
  }, []);

  // 3. Persist Active Dashboard State to LocalStorage on Change
  useEffect(() => {
    try {
      const stateToSave = {
        id: dashboardId,
        name: dashboardName,
        status: dashboardStatus,
        accessRoles,
        multiFilters,
        visuals,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));

      // Also ensure it exists in saved list
      setSavedDashboardsList(prev => {
        const exists = prev.find(d => d.id === dashboardId);
        let updatedList;
        if (exists) {
          updatedList = prev.map(d => d.id === dashboardId ? stateToSave : d);
        } else {
          updatedList = [stateToSave, ...prev];
        }
        localStorage.setItem(SAVED_DASHBOARDS_LIST_KEY, JSON.stringify(updatedList));
        return updatedList;
      });
    } catch (e) {
      console.warn('Failed saving to localStorage:', e);
    }
  }, [dashboardId, dashboardName, dashboardStatus, accessRoles, multiFilters, visuals]);

  // =========================================================================
  // CASCADING FILTER LOGIC (Academic Year -> Dept -> Sem -> Section -> Subjects)
  // =========================================================================
  const filteredSubjectOptions = useMemo(() => {
    if (!options.subjects || options.subjects.length === 0) return [];
    
    return options.subjects.filter(sub => {
      // Filter by Department if selected
      if (multiFilters.departments.length > 0) {
        const deptMatch = sub.departments && sub.departments.some(d =>
          multiFilters.departments.includes(d)
        );
        if (!deptMatch && sub.departments && sub.departments.length > 0) return false;
      }

      // Filter by Academic Year if selected
      if (multiFilters.academicYears.length > 0) {
        const ayMatch = sub.academicYears && sub.academicYears.some(ay =>
          multiFilters.academicYears.includes(ay)
        );
        if (!ayMatch && sub.academicYears && sub.academicYears.length > 0) return false;
      }

      // Filter by Semester if selected
      if (multiFilters.semesters.length > 0) {
        const semMatch = multiFilters.semesters.some(sem =>
          sub.semester === sem || String(sub.semesterNum) === sem || sem.includes(String(sub.semesterNum))
        );
        if (!semMatch) return false;
      }

      // Filter by Section if selected
      if (multiFilters.sections.length > 0) {
        const secMatch = sub.sections && sub.sections.some(s =>
          multiFilters.sections.includes(s)
        );
        if (!secMatch && sub.sections && sub.sections.length > 0) return false;
      }

      return true;
    });
  }, [options.subjects, multiFilters.departments, multiFilters.academicYears, multiFilters.semesters, multiFilters.sections]);

  // Unique Subject Names & Codes calculated dynamically
  const dynamicSubjectNameOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ id: string; label: string }> = [];
    filteredSubjectOptions.forEach(s => {
      if (s.name && !seen.has(s.name)) {
        seen.add(s.name);
        list.push({ id: s.name, label: s.name });
      }
    });
    return list;
  }, [filteredSubjectOptions]);

  const dynamicSubjectCodeOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ id: string; label: string }> = [];
    filteredSubjectOptions.forEach(s => {
      if (s.code && !seen.has(s.code)) {
        seen.add(s.code);
        list.push({ id: s.code, label: `${s.code} - ${s.name}` });
      }
    });
    return list;
  }, [filteredSubjectOptions]);

  // Department Dropdown Options Normalization
  const departmentDropdownOptions = useMemo(() => {
    return options.departments.map(d => ({
      id: d.code,
      label: d.label || d.name,
      code: d.code
    }));
  }, [options.departments]);

  // Auto-prune stale selected subjects if parent filters change
  useEffect(() => {
    if (filteredSubjectOptions.length > 0) {
      const validNames = new Set(filteredSubjectOptions.map(s => s.name));
      const validCodes = new Set(filteredSubjectOptions.map(s => s.code));

      const prunedNames = multiFilters.subjectNames.filter(n => validNames.has(n));
      const prunedCodes = multiFilters.subjectCodes.filter(c => validCodes.has(c));

      if (prunedNames.length !== multiFilters.subjectNames.length || prunedCodes.length !== multiFilters.subjectCodes.length) {
        setMultiFilters(prev => ({
          ...prev,
          subjectNames: prunedNames,
          subjectCodes: prunedCodes
        }));
      }
    }
  }, [filteredSubjectOptions]);

  // Bidirectional Multi-Select Subject Name <-> Subject Code Linking
  const handleSubjectNamesChange = (names: string[]) => {
    const matchedCodes = options.subjectMappings
      .filter(m => names.includes(m.subjectName))
      .map(m => m.subjectCode);
    setMultiFilters(prev => ({
      ...prev,
      subjectNames: names,
      subjectCodes: Array.from(new Set(matchedCodes))
    }));
  };

  const handleSubjectCodesChange = (codes: string[]) => {
    const matchedNames = options.subjectMappings
      .filter(m => codes.includes(m.subjectCode))
      .map(m => m.subjectName);
    setMultiFilters(prev => ({
      ...prev,
      subjectCodes: codes,
      subjectNames: Array.from(new Set(matchedNames))
    }));
  };

  // Reset All Slicers Logic
  const handleResetFilters = () => {
    setOpenDropdown(null);
    setMultiFilters({
      academicYears: [],
      departments: [],
      semesters: [],
      sections: [],
      subjectNames: [],
      subjectCodes: [],
      tests: [],
      courseCategories: [],
      assessmentTypes: [],
      performanceLevels: []
    });
    setCrossFilterKey(null);
  };

  // Convert Multi-Filters to API format (Normalized representation of All)
  const getFilterPayload = (): GlobalDashboardFilters => {
    return {
      academicYear: multiFilters.academicYears.length > 0 ? multiFilters.academicYears : 'All Years',
      department: multiFilters.departments.length > 0 ? multiFilters.departments : 'All Departments',
      semester: multiFilters.semesters.length > 0 ? multiFilters.semesters : 'All Semesters',
      section: multiFilters.sections.length > 0 ? multiFilters.sections : 'All Sections',
      subjectName: multiFilters.subjectNames.length > 0 ? multiFilters.subjectNames : 'All Subjects',
      subjectCode: multiFilters.subjectCodes.length > 0 ? multiFilters.subjectCodes : 'All Subject Codes',
      test: multiFilters.tests.length > 0 ? multiFilters.tests : 'All Tests',
      courseCategory: multiFilters.courseCategories.length > 0 ? multiFilters.courseCategories : 'All Categories',
      assessmentType: multiFilters.assessmentTypes.length > 0 ? multiFilters.assessmentTypes : 'All Assessments',
      performanceLevel: multiFilters.performanceLevels.length > 0 ? multiFilters.performanceLevels : 'All',
    };
  };

  // Refresh Single Visual Data
  const refreshVisualData = useCallback(async (vis: DashboardVisualConfig) => {
    setLoadingMap(prev => ({ ...prev, [vis.id]: true }));
    try {
      const filters = getFilterPayload();
      const data = await queryDashboardVisualData(filters, vis);
      setVisualDataMap(prev => ({ ...prev, [vis.id]: data }));
    } catch (err) {
      console.error(`Failed querying data for visual ${vis.id}:`, err);
    } finally {
      setLoadingMap(prev => ({ ...prev, [vis.id]: false }));
    }
  }, [multiFilters]);

  // Refresh All Visuals on Canvas
  const refreshAllVisuals = useCallback(() => {
    visuals.forEach(vis => refreshVisualData(vis));
  }, [visuals, refreshVisualData]);

  // Trigger Refresh on Filter changes or Visuals change
  useEffect(() => {
    if (visuals.length > 0) {
      refreshAllVisuals();
    }
  }, [multiFilters, refreshAllVisuals]);

  // Button: Create New Dashboard
  const handleCreateNewDashboard = () => {
    const namePrompt = window.prompt('Enter new dashboard name:', 'New Academic Analytics Dashboard');
    if (!namePrompt) return;
    const newId = `dash-${Date.now()}`;
    setDashboardId(newId);
    setDashboardName(namePrompt);
    setDashboardStatus('draft');
    setAccessRoles(['Super Admin', 'Admin', 'Principal', 'Dean', 'HOD', 'Faculty']);
    setVisuals([]);
    setVisualDataMap({});
    handleResetFilters();
    setSaveNotification('Created new blank dashboard successfully.');
    setTimeout(() => setSaveNotification(null), 4000);
  };

  // Button: Save Dashboard to Server & Local Storage
  const handleSaveDashboard = async () => {
    try {
      const payload = {
        id: dashboardId,
        name: dashboardName,
        status: dashboardStatus,
        accessRoles,
        multiFilters,
        visuals
      };
      await saveDashboard(payload);
      setSaveNotification('Dashboard configuration saved successfully.');
      setTimeout(() => setSaveNotification(null), 4000);
    } catch (err) {
      console.error('Failed to save dashboard:', err);
      setSaveNotification('Dashboard saved locally in browser storage.');
      setTimeout(() => setSaveNotification(null), 4000);
    }
  };

  // Button: Publish / Unpublish Dashboard
  const handlePublishDashboard = async () => {
    try {
      const newStatus = dashboardStatus === 'published' ? 'draft' : 'published';
      setDashboardStatus(newStatus);
      const payload = {
        id: dashboardId,
        name: dashboardName,
        status: newStatus,
        accessRoles,
        multiFilters,
        visuals
      };
      await saveDashboard(payload);
      setSaveNotification(
        newStatus === 'published'
          ? `Dashboard published! Visible to: ${accessRoles.join(', ')}`
          : 'Dashboard reverted to Draft status.'
      );
      setTimeout(() => setSaveNotification(null), 4000);
    } catch (err) {
      console.error('Publish error:', err);
    }
  };

  // Open "My Dashboards" Manager Modal
  const handleOpenMyDashboards = async () => {
    try {
      const serverDashboards = await fetchDashboards();
      if (Array.isArray(serverDashboards) && serverDashboards.length > 0) {
        setSavedDashboardsList(serverDashboards);
      }
    } catch (e) {
      console.warn('Failed loading server dashboards:', e);
    }
    setIsMyDashboardsOpen(true);
  };

  // Load a Saved Dashboard from Manager
  const handleLoadDashboard = (dash: any) => {
    setDashboardId(dash.id);
    setDashboardName(dash.name);
    setDashboardStatus(dash.status || 'draft');
    setAccessRoles(dash.accessRoles || ['Super Admin', 'Admin', 'Principal', 'Dean', 'HOD', 'Faculty']);
    if (dash.multiFilters) setMultiFilters(dash.multiFilters);
    if (Array.isArray(dash.visuals)) {
      setVisuals(dash.visuals);
    } else {
      setVisuals([]);
    }
    setIsMyDashboardsOpen(false);
    setSaveNotification(`Loaded dashboard: "${dash.name}"`);
    setTimeout(() => setSaveNotification(null), 4000);
  };

  // Delete a Saved Dashboard from Manager
  const handleDeleteSavedDashboard = async (dashIdToDelete: string) => {
    if (window.confirm('Are you sure you want to permanently delete this dashboard?')) {
      try {
        await deleteDashboard(dashIdToDelete);
      } catch (e) {}

      const updated = savedDashboardsList.filter(d => d.id !== dashIdToDelete);
      setSavedDashboardsList(updated);
      localStorage.setItem(SAVED_DASHBOARDS_LIST_KEY, JSON.stringify(updated));

      if (dashIdToDelete === dashboardId) {
        handleCreateNewDashboard();
      }
    }
  };

  // Open Access Permissions Manager
  const handleOpenPermissions = () => {
    setTempAccessRoles([...accessRoles]);
    setIsPermissionsOpen(true);
  };

  // Save Permissions
  const handleSavePermissions = async () => {
    setAccessRoles(tempAccessRoles);
    setIsPermissionsOpen(false);
    setSaveNotification(`Access permissions updated (${tempAccessRoles.length} roles allowed)`);
    setTimeout(() => setSaveNotification(null), 4000);
  };

  // Toggle Single Role in Permissions Modal
  const handleToggleRole = (roleId: string) => {
    if (tempAccessRoles.includes(roleId)) {
      setTempAccessRoles(tempAccessRoles.filter(r => r !== roleId));
    } else {
      setTempAccessRoles([...tempAccessRoles, roleId]);
    }
  };

  // Open "Add New Visual" Wizard
  const handleOpenAddVisual = () => {
    setSelectedVisualType('column');
    setEditingVisual({
      id: `vis-${Date.now()}`,
      title: 'Average Marks Comparison',
      type: 'column',
      dataset: 'student_marks',
      xAxisField: 'subject_name',
      yAxisField: 'average_marks',
      compareBy: 'department',
      analysisMode: 'compare',
      aggregation: 'average',
      showLegend: true,
      showGrid: true,
      layout: { x: 0, y: 0, w: 6, h: 4 }
    });
    setModalStep('select');
    setIsModalOpen(true);
  };

  // Move from Type Selection to Field Configuration
  const handleSelectTypeAndConfigure = (typeId: string) => {
    setSelectedVisualType(typeId);
    let defaultTitle = 'Academic Visualization';
    let defaultX = 'subject_name';
    let defaultY = 'average_marks';
    let defaultCompare = 'department';

    if (typeId === 'line') {
      defaultTitle = 'Mark Range Distribution Comparison';
      defaultX = 'mark_range';
      defaultY = 'student_count';
      defaultCompare = 'section';
    } else if (typeId === 'column' || typeId === 'bar') {
      defaultTitle = 'Average Marks by Subject Comparison';
      defaultX = 'subject_name';
      defaultY = 'average_marks';
      defaultCompare = 'department';
    } else if (typeId === 'area') {
      defaultTitle = 'Exam Progression Comparison';
      defaultX = 'test';
      defaultY = 'average_marks';
      defaultCompare = 'subject_name';
    } else if (typeId === 'pie' || typeId === 'donut') {
      defaultTitle = 'Pass vs Fail Distribution';
      defaultX = 'department';
      defaultY = 'pass_count';
      defaultCompare = 'none';
    } else if (typeId === 'kpi' || typeId === 'gauge') {
      defaultTitle = 'Performance Score Comparison';
      defaultX = 'department';
      defaultY = 'average_marks';
      defaultCompare = 'department';
    } else if (typeId === 'scatter') {
      defaultTitle = 'Attendance vs Marks Distribution';
      defaultX = 'attendance_pct';
      defaultY = 'marks_obtained';
      defaultCompare = 'department';
    } else if (typeId === 'table' || typeId === 'matrix') {
      defaultTitle = 'Performance Comparison Matrix';
      defaultX = 'subject_name';
      defaultY = 'average_marks';
      defaultCompare = 'department';
    }

    setEditingVisual(prev => ({
      id: prev?.id || `vis-${Date.now()}`,
      title: defaultTitle,
      type: typeId as any,
      dataset: 'student_marks',
      xAxisField: defaultX,
      yAxisField: defaultY,
      compareBy: defaultCompare,
      analysisMode: 'compare',
      aggregation: 'average',
      showLegend: true,
      showGrid: true,
      layout: { x: 0, y: 0, w: 6, h: 4 }
    }));
    setModalStep('configure');
  };

  // Save / Update Visual to Canvas
  const handleSaveVisual = () => {
    if (!editingVisual) return;
    const exists = visuals.some(v => v.id === editingVisual.id);
    let updated: DashboardVisualConfig[];
    if (exists) {
      updated = visuals.map(v => v.id === editingVisual.id ? editingVisual : v);
    } else {
      updated = [...visuals, editingVisual];
    }
    setVisuals(updated);
    setIsModalOpen(false);
    refreshVisualData(editingVisual);
  };

  // Edit Existing Visual
  const handleEditVisual = (vis: DashboardVisualConfig) => {
    setEditingVisual({ ...vis });
    setSelectedVisualType(vis.type);
    setModalStep('configure');
    setIsModalOpen(true);
  };

  // Duplicate Visual
  const handleDuplicateVisual = (vis: DashboardVisualConfig) => {
    const dup: DashboardVisualConfig = {
      ...vis,
      id: `vis-${Date.now()}`,
      title: `${vis.title} (Copy)`
    };
    setVisuals(prev => [...prev, dup]);
    refreshVisualData(dup);
  };

  // Delete Visual
  const handleDeleteVisual = (visId: string) => {
    if (window.confirm('Are you sure you want to delete this visual from the canvas?')) {
      setVisuals(prev => prev.filter(v => v.id !== visId));
      setVisualDataMap(prev => {
        const copy = { ...prev };
        delete copy[visId];
        return copy;
      });
    }
  };

  // Quick Start Templates with Multi-Series Comparisons
  const handleApplyTemplate = (templateType: 'mark_range' | 'dept_compare' | 'exam_progress') => {
    const now = Date.now();
    let templateVisuals: DashboardVisualConfig[] = [];

    if (templateType === 'mark_range') {
      templateVisuals = [
        {
          id: `vis-line-mr-${now}`,
          title: 'Mark Range Distribution – Section A vs Section B',
          type: 'line',
          dataset: 'student_marks',
          xAxisField: 'mark_range',
          yAxisField: 'student_count',
          compareBy: 'section',
          analysisMode: 'compare',
          aggregation: 'count',
          showLegend: true,
          showGrid: true,
          layout: { x: 0, y: 0, w: 8, h: 4 }
        },
        {
          id: `vis-kpi-1-${now}`,
          title: 'Class Average by Section',
          type: 'kpi',
          dataset: 'student_marks',
          xAxisField: 'section',
          yAxisField: 'average_marks',
          compareBy: 'section',
          analysisMode: 'compare',
          aggregation: 'average',
          layout: { x: 8, y: 0, w: 4, h: 4 }
        }
      ];
    } else if (templateType === 'dept_compare') {
      templateVisuals = [
        {
          id: `vis-col-dept-${now}`,
          title: 'Department Performance Comparison',
          type: 'column',
          dataset: 'student_marks',
          xAxisField: 'subject_name',
          yAxisField: 'average_marks',
          compareBy: 'department',
          analysisMode: 'compare',
          aggregation: 'average',
          showLegend: true,
          showGrid: true,
          layout: { x: 0, y: 0, w: 7, h: 4 }
        },
        {
          id: `vis-matrix-dept-${now}`,
          title: 'Department Marks Matrix',
          type: 'matrix',
          dataset: 'student_marks',
          xAxisField: 'subject_name',
          yAxisField: 'average_marks',
          compareBy: 'department',
          analysisMode: 'compare',
          aggregation: 'average',
          layout: { x: 7, y: 0, w: 5, h: 4 }
        }
      ];
    } else {
      templateVisuals = [
        {
          id: `vis-line-exam-${now}`,
          title: 'Assessment Progression – CIA 1 vs CIA 2 vs Model Exam',
          type: 'line',
          dataset: 'student_marks',
          xAxisField: 'test',
          yAxisField: 'average_marks',
          compareBy: 'subject_name',
          analysisMode: 'compare',
          aggregation: 'average',
          showLegend: true,
          showGrid: true,
          layout: { x: 0, y: 0, w: 6, h: 4 }
        },
        {
          id: `vis-bar-exam-${now}`,
          title: 'Pass Percentage Comparison',
          type: 'bar',
          dataset: 'student_marks',
          xAxisField: 'test',
          yAxisField: 'pass_percentage',
          compareBy: 'department',
          analysisMode: 'compare',
          aggregation: 'average',
          showGrid: true,
          showLegend: true,
          layout: { x: 6, y: 0, w: 6, h: 4 }
        }
      ];
    }

    setVisuals(templateVisuals);
    templateVisuals.forEach(v => refreshVisualData(v));
  };

  // Render Core Visual Components (Tailored to Visual Type & Multi-Series Comparison)
  const renderVisualContent = (vis: DashboardVisualConfig) => {
    const dataRes = visualDataMap[vis.id] || { columns: [], series: [], rows: [], pivotedData: [], summary: undefined, meta: { dataset: 'student_marks', recordCount: 0, dbConnected: true } };
    const rows = dataRes.pivotedData || [];
    const seriesKeys = dataRes.series && dataRes.series.length > 0
      ? dataRes.series
      : (rows.length > 0 ? Object.keys(rows[0]).filter(k => k !== 'name' && k !== 'Value') : ['Value']);
    const isLoading = loadingMap[vis.id];

    if (isLoading) {
      return (
        <div className="h-64 flex flex-col items-center justify-center space-y-2 text-slate-400">
          <RefreshCw className="w-7 h-7 animate-spin text-blue-600" />
          <span className="text-xs font-bold">Querying comparison data...</span>
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="h-64 flex flex-col items-center justify-center p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
          <h4 className="font-bold text-slate-800 text-xs">No comparison data available</h4>
          <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
            Try selecting multiple values from the slicers or changing the Compare By dimension.
          </p>
        </div>
      );
    }

    // 1. KPI Comparison Cards
    if (vis.type === 'kpi') {
      return (
        <div className="py-3">
          <div className={`grid gap-3 ${rows.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {rows.map((r, idx) => {
              const val = r.Value ?? r[seriesKeys[0]] ?? '0';
              return (
                <div
                  key={idx}
                  className="flex flex-col items-center justify-center text-center bg-gradient-to-br from-blue-50/80 to-indigo-50/80 rounded-2xl border border-blue-100 p-4"
                >
                  <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs mb-1.5">
                    <Award className="w-4 h-4" />
                  </div>
                  <span className="text-2xl font-black text-slate-900 tracking-tight">
                    {val}
                    {vis.yAxisField.includes('pct') || vis.yAxisField.includes('percentage') ? '%' : ''}
                  </span>
                  <span className="text-[11px] font-bold text-slate-700 mt-0.5 capitalize">
                    {r.name}
                  </span>
                  <span className="text-[9px] font-bold text-blue-600">{vis.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // 2. Gauge Comparison Cards
    if (vis.type === 'gauge') {
      return (
        <div className="py-2">
          <div className={`grid gap-3 ${rows.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {rows.map((r, idx) => {
              const currentVal = Number(r.Value ?? r[seriesKeys[0]] ?? 0);
              const targetVal = 100;
              const pct = Math.min(100, Math.round((currentVal / targetVal) * 100));
              return (
                <div key={idx} className="flex flex-col items-center justify-center p-3 bg-slate-50/80 rounded-2xl border border-slate-200">
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-slate-200"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-blue-600 transition-all duration-700"
                        strokeDasharray={`${pct}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-sm font-black text-slate-900">{currentVal}</span>
                      <span className="text-[9px] font-bold text-slate-400">/ {targetVal}</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-700 mt-2 capitalize">{r.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // 3. Clustered Column Chart (Multi-Series Comparison)
    if (vis.type === 'column') {
      return (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
              {vis.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />}
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 600 }}
              />
              {vis.showLegend && <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />}
              {seriesKeys.map((sKey, sIdx) => (
                <Bar
                  key={sKey}
                  dataKey={sKey}
                  name={sKey}
                  fill={SERIES_COLORS[sIdx % SERIES_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 4. Clustered Horizontal Bar Chart
    if (vis.type === 'bar') {
      return (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              {vis.showGrid && <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />}
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#64748b' }} width={80} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 600 }}
              />
              {vis.showLegend && <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />}
              {seriesKeys.map((sKey, sIdx) => (
                <Bar
                  key={sKey}
                  dataKey={sKey}
                  name={sKey}
                  fill={SERIES_COLORS[sIdx % SERIES_COLORS.length]}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 5. Multi-Series Line Chart (Continuous Curves for Mark Range or Exam Series)
    if (vis.type === 'line') {
      return (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 10, right: 15, left: -20, bottom: 25 }}>
              {vis.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />}
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 600 }}
              />
              {vis.showLegend && <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />}
              {seriesKeys.map((sKey, sIdx) => (
                <Line
                  key={sKey}
                  type="monotone"
                  dataKey={sKey}
                  name={sKey}
                  stroke={SERIES_COLORS[sIdx % SERIES_COLORS.length]}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: SERIES_COLORS[sIdx % SERIES_COLORS.length] }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 6. Multi-Series Area Chart
    if (vis.type === 'area') {
      return (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 10, right: 15, left: -20, bottom: 25 }}>
              {vis.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />}
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 600 }}
              />
              {vis.showLegend && <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />}
              {seriesKeys.map((sKey, sIdx) => {
                const color = SERIES_COLORS[sIdx % SERIES_COLORS.length];
                return (
                  <Area
                    key={sKey}
                    type="monotone"
                    dataKey={sKey}
                    name={sKey}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 7. Pie & Donut Chart
    if (vis.type === 'pie' || vis.type === 'donut') {
      return (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart>
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 600 }}
              />
              {vis.showLegend && <Legend wrapperStyle={{ fontSize: '11px' }} />}
              <Pie
                data={rows}
                dataKey="Value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={vis.type === 'donut' ? 45 : 0}
                outerRadius={80}
                paddingAngle={vis.type === 'donut' ? 3 : 0}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {rows.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
                ))}
              </Pie>
            </RePieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 8. Scatter Plot
    if (vis.type === 'scatter') {
      return (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 15, left: -20, bottom: 25 }}>
              {vis.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />}
              <XAxis dataKey="name" name="Category" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis dataKey="Value" name="Score" tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              {vis.showLegend && <Legend wrapperStyle={{ fontSize: '11px' }} />}
              <Scatter name="Distribution" data={rows} fill="#3b82f6" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 9. Matrix & Data Table (Multi-Column Comparison)
    return (
      <div className="overflow-x-auto max-h-72 mt-2 border border-slate-100 rounded-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <th className="p-2.5">Category / Dimension</th>
              {seriesKeys.map((s, idx) => (
                <th key={idx} className="p-2.5 text-right font-bold text-slate-700">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {rows.map((r, rIdx) => (
              <tr key={rIdx} className="hover:bg-blue-50/40 transition-colors">
                <td className="p-2.5 font-bold text-slate-900">{r.name}</td>
                {seriesKeys.map((sKey, sIdx) => {
                  const val = r[sKey] !== undefined ? r[sKey] : '-';
                  return (
                    <td key={sIdx} className="p-2.5 text-right font-semibold">
                      {typeof val === 'number' ? val.toLocaleString() : val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 space-y-6">
      {/* Toast Notification */}
      {saveNotification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{saveNotification}</span>
        </div>
      )}

      {/* Workspace Header & Action Control Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <PieChart className="w-5 h-5" />
            </span>
            <input
              type="text"
              value={dashboardName}
              onChange={(e) => setDashboardName(e.target.value)}
              className="text-lg font-black text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-hidden px-1 transition-all"
            />
            <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
              dashboardStatus === 'published'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {dashboardStatus}
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Power BI-style interactive visualization builder with multi-selection comparison engine
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto">
          <button
            onClick={handleCreateNewDashboard}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all shadow-2xs"
          >
            <FolderPlus className="w-3.5 h-3.5 text-slate-600" />
            <span>New Dashboard</span>
          </button>

          <button
            onClick={handleOpenMyDashboards}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all shadow-2xs"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-slate-600" />
            <span>My Dashboards</span>
          </button>

          <button
            onClick={handleOpenPermissions}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all shadow-2xs"
          >
            <Users className="w-3.5 h-3.5 text-slate-600" />
            <span>Access Permissions</span>
          </button>

          <button
            onClick={handleSaveDashboard}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-all shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Dashboard</span>
          </button>

          <button
            onClick={handlePublishDashboard}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white rounded-xl transition-all shadow-xs ${
              dashboardStatus === 'published'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{dashboardStatus === 'published' ? 'Unpublish' : 'Publish Dashboard'}</span>
          </button>

          <button
            onClick={handleOpenAddVisual}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Visual</span>
          </button>
        </div>
      </div>

      {/* Global Multi-Select Comparison Slicers Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-xs text-slate-800">Global Slicers & Comparison Filters</h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">
              Multi-Select to Compare
            </span>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset All Slicers</span>
          </button>
        </div>

        {/* Slicers Grid - Clean 10 Dimensional Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* 1. Academic Year */}
          <MultiSelectSlicer
            id="academicYear"
            label="Academic Year"
            options={(options.academicYears || []).map(ay => ({ id: ay, label: ay }))}
            selectedValues={multiFilters.academicYears}
            onChange={(vals) => setMultiFilters(prev => ({ ...prev, academicYears: vals }))}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Years"
          />

          {/* 2. Department */}
          <MultiSelectSlicer
            id="department"
            label="Department"
            options={departmentDropdownOptions}
            selectedValues={multiFilters.departments}
            onChange={(vals) => setMultiFilters(prev => ({ ...prev, departments: vals }))}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Departments"
          />

          {/* 3. Semester */}
          <MultiSelectSlicer
            id="semester"
            label="Semester"
            options={(options.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({ id: `Semester ${s}`, label: `Semester ${s}` }))}
            selectedValues={multiFilters.semesters}
            onChange={(vals) => setMultiFilters(prev => ({ ...prev, semesters: vals }))}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Semesters"
          />

          {/* 4. Section */}
          <MultiSelectSlicer
            id="section"
            label="Section"
            options={(options.sections || []).map(sec => ({ id: sec, label: `Section ${sec}` }))}
            selectedValues={multiFilters.sections}
            onChange={(vals) => setMultiFilters(prev => ({ ...prev, sections: vals }))}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Sections"
          />

          {/* 5. Performance Level */}
          <MultiSelectSlicer
            id="performanceLevel"
            label="Performance Level"
            options={[
              { id: 'Above 58%', label: 'Above 58%' },
              { id: 'Equal to 58%', label: 'Equal to 58%' },
              { id: 'Below 58%', label: 'Below 58%' }
            ]}
            selectedValues={multiFilters.performanceLevels}
            onChange={(vals) => setMultiFilters(prev => ({ ...prev, performanceLevels: vals }))}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Performance"
          />

          {/* 6. Test / Exam */}
          <MultiSelectSlicer
            id="test"
            label="Test / Exam"
            options={(options.tests || []).map(t => ({ id: t.name, label: t.name }))}
            selectedValues={multiFilters.tests}
            onChange={(vals) => setMultiFilters(prev => ({ ...prev, tests: vals }))}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Tests"
          />

          {/* 7. Subject Name */}
          <MultiSelectSlicer
            id="subjectName"
            label="Subject Name"
            options={dynamicSubjectNameOptions}
            selectedValues={multiFilters.subjectNames}
            onChange={handleSubjectNamesChange}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Subjects"
          />

          {/* 8. Subject Code */}
          <MultiSelectSlicer
            id="subjectCode"
            label="Subject Code"
            options={dynamicSubjectCodeOptions}
            selectedValues={multiFilters.subjectCodes}
            onChange={handleSubjectCodesChange}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Subject Codes"
          />

          {/* 9. Course Category */}
          <MultiSelectSlicer
            id="courseCategory"
            label="Course Category"
            options={(options.courseCategories || ['PC', 'PE', 'OE', 'EE', 'MC', 'HS']).map(c => ({ id: c, label: c }))}
            selectedValues={multiFilters.courseCategories}
            onChange={(vals) => setMultiFilters(prev => ({ ...prev, courseCategories: vals }))}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Categories"
          />

          {/* 10. Assessment Type */}
          <MultiSelectSlicer
            id="assessmentType"
            label="Assessment Type"
            options={(options.assessmentTypes || ['Theory', 'Lab', 'Integrated', 'Project', 'Review', 'Internal', 'External']).map(a => ({ id: a, label: a }))}
            selectedValues={multiFilters.assessmentTypes}
            onChange={(vals) => setMultiFilters(prev => ({ ...prev, assessmentTypes: vals }))}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            allLabel="All Assessments"
          />
        </div>
      </div>

      {/* Visual Canvas Area */}
      {visuals.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-4">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
            <LayoutGrid className="w-10 h-10" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="text-base font-extrabold text-slate-900">Your Dashboard Canvas is Empty</h3>
            <p className="text-xs font-semibold text-slate-500 leading-relaxed">
              Start building your Power BI-style dashboard by adding interactive comparison visuals, or click one of the quick templates below.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => handleApplyTemplate('mark_range')}
              className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all border border-blue-200"
            >
              + Mark Range (Sec A vs Sec B)
            </button>
            <button
              onClick={() => handleApplyTemplate('dept_compare')}
              className="px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-200"
            >
              + Department Comparison
            </button>
            <button
              onClick={() => handleApplyTemplate('exam_progress')}
              className="px-4 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all border border-indigo-200"
            >
              + Exam Progression (CIA 1 vs CIA 2 vs Model)
            </button>
            <button
              onClick={handleOpenAddVisual}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm"
            >
              + Custom Visual Wizard
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {visuals.map((vis) => {
            const widthSpan = vis.layout?.w ? `md:col-span-${vis.layout.w}` : 'md:col-span-6';
            const queryRes = visualDataMap[vis.id];
            const activeCompare = queryRes?.meta?.compareBy || vis.compareBy || 'None';

            return (
              <div
                key={vis.id}
                className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${widthSpan}`}
              >
                {/* Visual Card Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="space-y-0.5">
                    <h4 className="font-extrabold text-xs text-slate-800 tracking-tight flex items-center gap-1.5">
                      <span>{vis.title}</span>
                      {activeCompare !== 'None' && activeCompare !== 'none' && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
                          by {activeCompare}
                        </span>
                      )}
                    </h4>
                    <p className="text-[10px] font-semibold text-slate-400 capitalize">
                      {vis.type} Chart • {vis.xAxisField} vs {vis.yAxisField}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => refreshVisualData(vis)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Refresh"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDuplicateVisual(vis)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleEditVisual(vis)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Edit Visual"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteVisual(vis.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Visual Chart Canvas */}
                <div className="flex-1 my-2">
                  {renderVisualContent(vis)}
                </div>

                {/* Visual Footer Info */}
                {queryRes?.summary && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                    <span>
                      Avg: <strong className="text-slate-800">{queryRes.summary.averageMarks}</strong>
                    </span>
                    <span>
                      Pass: <strong className="text-slate-800">{queryRes.summary.above58Percentage}%</strong>
                    </span>
                    <span>
                      Total: <strong className="text-slate-800">{queryRes.summary.totalStudents}</strong>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* ADD / EDIT VISUAL MODAL DRAWER */}
      {/* ===================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-extrabold text-slate-900">
                  {modalStep === 'select' ? 'Choose Visual Type' : 'Configure Visual Fields & Multi-Series Compare'}
                </h3>
                <p className="text-xs font-semibold text-slate-500">
                  {modalStep === 'select'
                    ? 'Select from Power BI catalog of comparison, distribution, and summary charts'
                    : 'Assign axis fields, metrics, and multi-series comparison dimensions'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STEP 1: Catalog Selection */}
            {modalStep === 'select' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                  {VISUAL_CATALOG.map((catItem) => {
                    const Icon = catItem.icon;
                    const isSelected = selectedVisualType === catItem.id;
                    return (
                      <button
                        key={catItem.id}
                        onClick={() => handleSelectTypeAndConfigure(catItem.id)}
                        className={`p-3 rounded-2xl border text-left flex flex-col justify-between space-y-2 transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`p-2 rounded-xl ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            {catItem.category}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-slate-900">{catItem.label}</h4>
                          <p className="text-[10px] font-semibold text-slate-500 mt-0.5 leading-tight">{catItem.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* STEP 2: Field & Multi-Series Configuration */
              <div className="space-y-4 max-h-96 overflow-y-auto p-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Visual Title</label>
                    <input
                      type="text"
                      value={editingVisual?.title || ''}
                      onChange={(e) => setEditingVisual(prev => prev ? ({ ...prev, title: e.target.value }) : null)}
                      className="w-full p-2.5 text-xs font-semibold border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Visual Width (Columns)</label>
                    <select
                      value={editingVisual?.layout?.w || 6}
                      onChange={(e) => setEditingVisual(prev => prev ? ({
                        ...prev,
                        layout: { ...(prev.layout || { x: 0, y: 0, w: 6, h: 4 }), w: Number(e.target.value) }
                      }) : null)}
                      className="w-full p-2.5 text-xs font-semibold border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden bg-white"
                    >
                      <option value={4}>Small (4 Columns / 3 per row)</option>
                      <option value={6}>Medium (6 Columns / 2 per row)</option>
                      <option value={8}>Large (8 Columns / Wide)</option>
                      <option value={12}>Full Width (12 Columns)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Category / X-Axis</label>
                    <select
                      value={editingVisual?.xAxisField || 'subject_name'}
                      onChange={(e) => setEditingVisual(prev => prev ? ({ ...prev, xAxisField: e.target.value }) : null)}
                      className="w-full p-2.5 text-xs font-semibold border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden bg-white"
                    >
                      <option value="subject_name">Subject Name</option>
                      <option value="subject_code">Subject Code</option>
                      <option value="mark_range">Mark Range (0-10, 11-20, ...)</option>
                      <option value="test">Test / Exam (CIA 1, CIA 2, Model)</option>
                      <option value="department">Department</option>
                      <option value="section">Section</option>
                      <option value="semester">Semester</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Measure / Y-Axis</label>
                    <select
                      value={editingVisual?.yAxisField || 'average_marks'}
                      onChange={(e) => setEditingVisual(prev => prev ? ({ ...prev, yAxisField: e.target.value }) : null)}
                      className="w-full p-2.5 text-xs font-semibold border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-hidden bg-white"
                    >
                      <option value="average_marks">Average Marks</option>
                      <option value="student_count">Student Count</option>
                      <option value="pass_percentage">Pass Percentage (%)</option>
                      <option value="marks_obtained">Marks Obtained</option>
                    </select>
                  </div>
                </div>

                {/* Compare By Selector */}
                <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-extrabold text-blue-900">
                      Compare By (Multi-Series Dimension)
                    </label>
                    <span className="text-[10px] font-bold text-blue-700">
                      Generates separate series / lines / bars
                    </span>
                  </div>
                  <select
                    value={editingVisual?.compareBy || 'none'}
                    onChange={(e) => setEditingVisual(prev => prev ? ({ ...prev, compareBy: e.target.value }) : null)}
                    className="w-full p-2.5 text-xs font-semibold border border-blue-200 rounded-xl focus:border-blue-500 focus:outline-hidden bg-white"
                  >
                    {COMPARE_DIMENSIONS.map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              {modalStep === 'configure' ? (
                <button
                  type="button"
                  onClick={() => setModalStep('select')}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Back to Visuals Catalog
                </button>
              ) : (
                <div />
              )}

              {modalStep === 'configure' && (
                <button
                  type="button"
                  onClick={handleSaveVisual}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm"
                >
                  Save Visual to Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MY DASHBOARDS MANAGER MODAL */}
      {/* ===================================================================== */}
      {isMyDashboardsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-extrabold text-slate-900">My Dashboards</h3>
                <p className="text-xs font-semibold text-slate-500">Manage and switch between saved dashboards</p>
              </div>
              <button
                onClick={() => setIsMyDashboardsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {savedDashboardsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 font-medium">
                  No saved dashboards yet.
                </div>
              ) : (
                savedDashboardsList.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between hover:bg-blue-50/50 transition-colors"
                  >
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">{d.name}</h4>
                      <p className="text-[10px] font-semibold text-slate-400">
                        Status: <span className="capitalize font-bold text-slate-600">{d.status || 'draft'}</span> • {d.visuals?.length || 0} visuals
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleLoadDashboard(d)}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-2xs"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleDeleteSavedDashboard(d.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ACCESS PERMISSIONS MODAL */}
      {/* ===================================================================== */}
      {isPermissionsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-extrabold text-slate-900">Dashboard Access Permissions</h3>
                <p className="text-xs font-semibold text-slate-500">
                  Select which user roles can access this dashboard when published
                </p>
              </div>
              <button
                onClick={() => setIsPermissionsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {AVAILABLE_ROLES.map(role => {
                const isChecked = tempAccessRoles.includes(role.id);
                return (
                  <label
                    key={role.id}
                    onClick={() => handleToggleRole(role.id)}
                    className={`p-3 border rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${
                      isChecked
                        ? 'border-blue-500 bg-blue-50/40'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-slate-800">{role.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <button
                onClick={() => setTempAccessRoles(AVAILABLE_ROLES.map(r => r.id))}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Select All Roles
              </button>

              <button
                onClick={handleSavePermissions}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm"
              >
                Save Permissions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}