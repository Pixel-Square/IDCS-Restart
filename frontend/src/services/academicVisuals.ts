import fetchWithAuth from './fetchAuth';

export interface DepartmentOption {
  id: string;
  code: string;
  name: string;
  shortName: string;
  label: string;
}

export interface SubjectOption {
  id: string;
  code: string;
  name: string;
  fullName: string;
  semester: string;
  semesterNum: number;
  academicYears: string[];
  departments: string[];
  sections: string[];
}

export interface SubjectMapping {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  semester: string;
  departments: string[];
  academicYears: string[];
}

export interface DynamicOptionsResponse {
  departments: DepartmentOption[];
  academicYears: string[];
  semesters: number[];
  sections: string[];
  subjects: SubjectOption[];
  subjectMappings: SubjectMapping[];
  tests: Array<{ id: string; name: string }>;
  courseCategories: string[];
  assessmentTypes: string[];
  performanceLevels: string[];
  markRanges?: string[];
  dbConnected: boolean;
}

export interface GlobalDashboardFilters {
  academicYear: string | string[];
  department: string | string[];
  semester: string | string[];
  section: string | string[];
  subjectName: string | string[];
  subjectCode: string | string[];
  test: string | string[];
  courseCategory: string | string[];
  assessmentType: string | string[];
  performanceLevel: string | string[];
}

export interface DashboardVisualConfig {
  id: string;
  title: string;
  type: 'bar' | 'column' | 'line' | 'area' | 'pie' | 'donut' | 'kpi' | 'gauge' | 'table' | 'matrix' | 'scatter';
  dataset: string;
  xAxisField: string;
  yAxisField: string;
  groupByField?: string;
  compareBy?: string;
  analysisMode?: 'filter' | 'compare';
  aggregation: 'average' | 'sum' | 'count' | 'distinct_count' | 'min' | 'max';
  showLegend?: boolean;
  showGrid?: boolean;
  layout: { x: number; y: number; w: number; h: number };
}

export interface DashboardDefinition {
  id: string;
  name: string;
  status: 'published' | 'draft';
  accessRoles: string[];
  createdDate: string;
  updatedDate: string;
  multiFilters: {
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
  };
  visuals: DashboardVisualConfig[];
}

export interface DashboardQueryResult {
  columns: string[];
  series?: string[];
  compareBy?: string;
  rows: any[];
  pivotedData: any[];
  summary?: {
    totalStudents: number;
    averageMarks: number;
    averageAttendance: number;
    above58Percentage: number;
    below58Percentage: number;
    equal58Percentage: number;
    above58Count: number;
    below58Count: number;
    equal58Count: number;
    highestMark: number;
    lowestMark: number;
    comparisonSeriesCount?: number;
  };
  meta: {
    dataset: string;
    recordCount: number;
    compareBy?: string;
    dbConnected: boolean;
    lastUpdated?: string;
    message?: string;
  };
}

const ENDPOINTS = [
  '/api/academic-v2/visuals',
  '/api/accounts/academic-v2/visuals',
];

export async function fetchDashboards(): Promise<DashboardDefinition[]> {
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchWithAuth(`${ep}/dashboards/`);
      if (res.ok) {
        const data = await res.json();
        if (data.dashboards) return data.dashboards;
      }
    } catch (err) {
      console.warn(`Endpoint ${ep}/dashboards/ failed:`, err);
    }
  }
  return [];
}

export async function createDashboard(
  name: string,
  dept: string,
  academicYear: string,
  year: string,
  semester: number
): Promise<DashboardDefinition> {
  const newId = `dash-${Date.now()}`;
  const fallbackDash: DashboardDefinition = {
    id: newId,
    name: name || 'Academic Performance Analysis',
    status: 'draft',
    accessRoles: ['Super Admin', 'Admin', 'Principal', 'Dean', 'HOD', 'Faculty'],
    createdDate: new Date().toISOString().split('T')[0],
    updatedDate: new Date().toISOString().split('T')[0],
    multiFilters: {
      academicYears: academicYear ? [academicYear] : ['2026-27'],
      departments: dept ? [dept] : [],
      semesters: semester ? [`Semester ${semester}`] : [],
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

  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchWithAuth(`${ep}/dashboards/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallbackDash),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.dashboard) return data.dashboard;
      }
    } catch (err) {
      console.warn(`Endpoint ${ep}/dashboards/ failed:`, err);
    }
  }
  return fallbackDash;
}

export async function fetchDashboardDetail(dashId: string): Promise<DashboardDefinition | null> {
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchWithAuth(`${ep}/dashboards/${dashId}/`);
      if (res.ok) {
        const data = await res.json();
        return data.dashboard;
      }
    } catch (err) {
      console.warn(`Endpoint ${ep}/dashboards/${dashId}/ failed:`, err);
    }
  }
  return null;
}

export async function saveDashboard(dashboard: any): Promise<boolean> {
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchWithAuth(`${ep}/dashboards/${dashboard.id}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dashboard),
      });
      if (res.ok) return true;
    } catch (err) {
      console.warn(`Endpoint ${ep}/dashboards/${dashboard.id}/ failed:`, err);
    }
  }
  return false;
}

export async function deleteDashboard(dashId: string): Promise<boolean> {
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchWithAuth(`${ep}/dashboards/${dashId}/`, { method: 'DELETE' });
      if (res.ok) return true;
    } catch (err) {
      console.warn(`Endpoint ${ep}/dashboards/${dashId}/ failed:`, err);
    }
  }
  return false;
}

export async function fetchDynamicOptions(): Promise<DynamicOptionsResponse> {
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchWithAuth(`${ep}/dynamic-options/`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn(`Endpoint ${ep}/dynamic-options/ failed:`, err);
    }
  }
  return {
    departments: [],
    semesters: [1, 2, 3, 4, 5, 6, 7, 8],
    academicYears: ['2026-27', '2025-26', '2024-25'],
    sections: ['A', 'B', 'C', 'D'],
    subjects: [],
    subjectMappings: [],
    tests: [],
    courseCategories: ['PC', 'PE', 'OE', 'EE', 'MC', 'HS'],
    assessmentTypes: ['Theory', 'Lab', 'Integrated', 'Project', 'Review', 'Internal', 'External'],
    performanceLevels: ['Above 58%', 'Equal to 58%', 'Below 58%'],
    markRanges: ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'],
    dbConnected: false,
  };
}

export async function queryDashboardVisualData(
  globalFilters: GlobalDashboardFilters,
  visualConfig: DashboardVisualConfig
): Promise<DashboardQueryResult> {
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchWithAuth(`${ep}/dashboard-query/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalFilters, visualConfig }),
      });
      if (res.ok) {
        const data: DashboardQueryResult = await res.json();
        return data;
      }
    } catch (err) {
      console.warn(`Endpoint ${ep}/dashboard-query/ failed:`, err);
    }
  }

  return {
    columns: [],
    series: [],
    rows: [],
    pivotedData: [],
    meta: {
      dataset: visualConfig.dataset,
      recordCount: 0,
      dbConnected: false,
      message: 'Unable to reach backend database.'
    }
  };
}
