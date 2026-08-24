import fetchWithAuth from './fetchAuth';

export interface DashboardVisualConfig {
  id: string;
  title: string;
  type: 'bar' | 'column' | 'line' | 'area' | 'pie' | 'donut' | 'kpi' | 'table' | 'scatter' | 'gauge' | 'matrix';
  dataset: string;
  xAxisField: string;
  yAxisField: string;
  compareBy: string;
  aggregation: 'average' | 'sum' | 'count' | 'min' | 'max';
  analysisMode?: string;
  showLegend?: boolean;
  showGrid?: boolean;
  department?: string;
  semester?: number | string;
  selectedSubjects?: string[];
  selectedTest?: string;
  layout: { x: number; y: number; w: number; h: number };
}

export interface DepartmentOption {
  id: string;
  name: string;
  code?: string;
  label?: string;
}

export interface SubjectOption {
  code: string;
  name: string;
  department?: string;
  departments?: string[];
  semester?: number | string;
  semesterNum?: number | string;
  academicYears?: string[];
  sections?: string[];
}

export interface GlobalDashboardFilters {
  academicYears?: string[];
  departments?: string[];
  semesters?: string[];
  sections?: string[];
  subjectNames?: string[];
  subjectCodes?: string[];
  tests?: string[];
  courseCategories?: string[];
  assessmentTypes?: string[];
  performanceLevels?: string[];
  
  academicYear?: string | string[];
  department?: string | string[];
  semester?: string | string[] | number | number[];
  section?: string | string[];
  subjectName?: string | string[];
  subjectCode?: string | string[];
  test?: string | string[];
  courseCategory?: string | string[];
  assessmentType?: string | string[];
  performanceLevel?: string | string[];
}

export interface DashboardDefinition {
  id: string;
  name: string;
  department?: string;
  academicYear?: string;
  year?: string;
  semester?: number | string;
  status: 'published' | 'draft' | string;
  accessRoles: string[];
  createdDate?: string;
  updatedDate?: string;
  multiFilters: GlobalDashboardFilters;
  visuals: DashboardVisualConfig[];
}

export interface DynamicOptionsResponse {
  departments: DepartmentOption[];
  semesters: number[];
  sections: string[];
  academicYears: string[];
  batches: string[];
  subjects: SubjectOption[];
  tests: Array<{ id: string; name: string }>;
  courseCategories: string[];
  assessmentTypes: string[];
  performanceLevels?: string[];
  markRanges?: string[];
  dbConnected: boolean;
  subjectMappings?: Array<{ subjectName: string; subjectCode: string }>;
}

export interface DashboardQueryResult {
  columns: string[];
  series?: any[];
  rows: any[];
  pivotedData: any[];
  summary?: any;
  meta: {
    dataset: string;
    recordCount: number;
    lastUpdated?: string;
    message?: string;
    compareBy?: string;
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
    name: name || 'New Academic Dashboard',
    department: dept || 'CSE',
    academicYear: academicYear || '2026-27',
    year: year || '3rd Year',
    semester: semester || 5,
    status: 'draft',
    accessRoles: ['Super Admin', 'Admin', 'HOD', 'Faculty'],
    createdDate: new Date().toISOString().split('T')[0],
    updatedDate: new Date().toISOString().split('T')[0],
    multiFilters: {
      academicYears: academicYear ? [academicYear] : [],
      departments: dept ? [dept] : [],
      semesters: semester ? [semester.toString()] : [],
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
        body: JSON.stringify({ name, department: dept, academicYear, year, semester }),
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

export async function saveDashboard(dashboard: DashboardDefinition): Promise<boolean> {
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
    sections: [],
    academicYears: ['2026-27', '2025-26'],
    batches: [],
    subjects: [],
    tests: [],
    courseCategories: [],
    assessmentTypes: [],
    dbConnected: false,
  };
}

export async function queryDashboardVisualData(
  multiFilters: GlobalDashboardFilters,
  visualConfig: DashboardVisualConfig
): Promise<DashboardQueryResult> {
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchWithAuth(`${ep}/dashboard-query/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multiFilters, visualConfig }),
      });
      if (res.ok) {
        const data: DashboardQueryResult = await res.json();
        return data;
      }
    } catch (err) {
      console.warn(`Endpoint ${ep}/dashboard-query/ failed:`, err);
    }
  }

  // Pure Empty State Response — ZERO fake substitute data!
  return {
    columns: [],
    series: [],
    rows: [],
    pivotedData: [],
    summary: {},
    meta: {
      dataset: visualConfig.dataset,
      recordCount: 0,
      dbConnected: false,
      message: 'Unable to reach backend database.'
    }
  };
}
