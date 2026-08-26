import fetchWithAuth from './fetchAuth';

export interface DashboardVisualConfig {
  id: string;
  title: string;
  type: 'bar' | 'column' | 'line' | 'area' | 'pie' | 'donut' | 'kpi' | 'table' | 'scatter' | 'gauge';
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
  /** Category (X-axis) field selected in the visual builder */
  category?: string;
  /** Measure (Y-axis value) field selected in the visual builder */
  measure?: string;
  /** Series grouping (pivot) field selected in the visual builder */
  seriesField?: string;
  layout: { x: number; y: number; w: number; h: number };
}

export interface DepartmentOption {
  id: string;
  name: string;
}

export interface SubjectOption {
  id: string;
  code: string;
  name: string;
  department?: string;
  semester?: number;
}

export interface GlobalDashboardFilters {
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
}

/** Simple dashboard-level filter bar state used by the visuals builder workspace */
export interface DashboardGlobalFilters {
  academicYear: string;
  department: string;
  year: string;
  semester: number | string;
  subjects: string[];
  test: string;
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
  /** Global filter-bar state applied to every visual on the canvas */
  globalFilters: DashboardGlobalFilters;
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
  dbConnected: boolean;
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
    globalFilters: {
      academicYear: academicYear || '2026-27',
      department: dept || 'CSE',
      year: year || '3rd Year',
      semester: semester || 5,
      subjects: [],
      test: ''
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
  multiFilters: GlobalDashboardFilters | DashboardGlobalFilters,
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
