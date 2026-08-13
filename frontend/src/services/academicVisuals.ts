import fetchWithAuth from './fetchAuth';

export interface DashboardVisualConfig {
  id: string;
  title: string;
  type: 'bar' | 'column' | 'line' | 'area' | 'pie' | 'donut' | 'kpi' | 'table';
  dataset: string;
  category: string;
  measure: string;
  seriesField: string;
  aggregation: 'average' | 'sum' | 'count' | 'min' | 'max';
  department?: string;
  semester?: number | string;
  selectedSubjects?: string[];
  selectedTest?: string;
  layout: { x: number; y: number; w: number; h: number };
}

export interface DashboardDefinition {
  id: string;
  name: string;
  department: string;
  academicYear: string;
  year: string;
  semester: number | string;
  status: 'published' | 'draft';
  accessRoles: string[];
  createdDate: string;
  updatedDate: string;
  globalFilters: {
    academicYear: string;
    department: string;
    year: string;
    semester: number | string;
    subjects: string[];
    test: string;
  };
  visuals: DashboardVisualConfig[];
}

export interface DynamicOptionsResponse {
  departments: string[];
  semesters: number[];
  academicYears: string[];
  subjects: Array<{ id: string; name: string; department?: string; semester?: number }>;
  tests: Array<{ id: string; name: string }>;
  dbConnected: boolean;
}

export interface DashboardQueryResult {
  columns: string[];
  rows: any[];
  pivotedData: any[];
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
    departments: ['CSE', 'AI & DS', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT'],
    semesters: [1, 2, 3, 4, 5, 6, 7, 8],
    academicYears: ['2026-27', '2025-26'],
    subjects: [],
    tests: [],
    dbConnected: false,
  };
}

export async function queryDashboardVisualData(
  globalFilters: DashboardDefinition['globalFilters'],
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

  // Pure Empty State Response — ZERO fake substitute data!
  return {
    columns: [],
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
