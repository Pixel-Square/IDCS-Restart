export type BatchYear = {
  id: number;
  name: string;
  start_year?: number | null;
  end_year?: number | null;
};

export type Master = {
  id: number;
  regulation: string;
  semester: number;
  batch?: BatchYear | null;
  batch_id?: number | null;
  course_code?: string | null;
  mnemonic?: string | null;
  course_name?: string | null;
  class_type?: string;
  qp_type?: string;
  enabled_assessments?: string[];
  category?: string;
  is_elective?: boolean;
  l?: number; t?: number; p?: number; s?: number; c?: number;
  internal_mark?: number | null;
  external_mark?: number | null;
  total_mark?: number | null;
  for_all_departments?: boolean;
  departments?: number[];
  editable?: boolean;
};

export type DeptRow = {
  id: number;
  master?: number | null;
  department: { id: number; code: string; name: string };
  regulation: string;
  semester: number;
  batch?: BatchYear | null;
  batch_id?: number | null;
  course_code?: string | null;
  course_name?: string | null;
  class_type?: string | null;
  qp_type?: string | null;
  enabled_assessments?: string[];
  l?: number; t?: number; p?: number; s?: number; c?: number;
  internal_mark?: number | null;
  external_mark?: number | null;
  total_mark?: number | null;
  total_hours?: number | null;
  question_paper_type?: string | null;
  editable?: boolean;
  overridden?: boolean;
  is_elective?: boolean;
};

export type CurriculumPendingDepartmentCount = {
  departmentId: number;
  department: string;
  count: number;
};

export type CurriculumPendingCountResponse = {
  totalPending: number;
  departmentCounts: CurriculumPendingDepartmentCount[];
};
import fetchWithAuth from './fetchAuth';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

export async function fetchBatchYears(): Promise<BatchYear[]> {
  const res = await fetchWithAuth('/api/academics/batch-years/');
  if (!res.ok) throw new Error('Failed to fetch batch years');
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results || []);
}

export async function fetchMasters(): Promise<Master[]> {
  const res = await fetchWithAuth('/api/curriculum/master/');
  if (!res.ok) throw new Error('Failed to fetch masters');
  return res.json();
}

export async function createMaster(payload: Partial<Master>) {
  const res = await fetchWithAuth('/api/curriculum/master/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateMaster(id: number, payload: Partial<Master>) {
  const res = await fetchWithAuth(`/api/curriculum/master/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  try {
    if (!res.ok) {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'An error occurred');
      } else {
        throw new Error(await res.text());
      }
    }
    return res.json();
  } catch (error) {
    console.error('Error in updateMaster:', error);
    throw error;
  }
}

export async function fetchDeptRows(): Promise<DeptRow[]> {
  const res = await fetchWithAuth('/api/curriculum/department/');
  if (!res.ok) throw new Error('Failed to fetch dept rows');
  return res.json();
}

export async function fetchDeptRow(id: number): Promise<DeptRow> {
  const res = await fetchWithAuth(`/api/curriculum/department/${encodeURIComponent(String(id))}/`);
  if (!res.ok) throw new Error('Failed to fetch dept row');
  return res.json();
}

export async function fetchCurriculumPendingCount(): Promise<CurriculumPendingCountResponse> {
  const aggregateFromRows = (rows: DeptRow[]): CurriculumPendingCountResponse => {
    const byDept = new Map<number, { department: string; count: number }>();

    for (const row of rows || []) {
      if (Boolean((row as any)?.is_elective)) continue;
      const statusRaw = String((row as any)?.approval_status ?? (row as any)?.status ?? '').toUpperCase().trim();
      if (statusRaw !== 'PENDING') continue;

      const deptId = Number((row as any)?.department?.id || 0);
      if (!deptId) continue;
      const deptLabel =
        String((row as any)?.department?.short_name || (row as any)?.department?.code || (row as any)?.department?.name || '').trim() ||
        `Dept ${deptId}`;

      const prev = byDept.get(deptId);
      if (prev) {
        prev.count += 1;
      } else {
        byDept.set(deptId, { department: deptLabel, count: 1 });
      }
    }

    const departmentCounts = Array.from(byDept.entries())
      .map(([departmentId, value]) => ({ departmentId, department: value.department, count: value.count }))
      .sort((a, b) => a.department.localeCompare(b.department));

    const totalPending = departmentCounts.reduce((sum, d) => sum + d.count, 0);
    return { totalPending, departmentCounts };
  };

  try {
    const res = await fetchWithAuth('/api/curriculum/pending-count/');
    if (res.ok) {
      const data = await res.json();
      return {
        totalPending: Number(data?.totalPending || 0),
        departmentCounts: Array.isArray(data?.departmentCounts)
          ? data.departmentCounts.map((item: any) => ({
              departmentId: Number(item?.departmentId || item?.department_id || 0),
              department: String(item?.department || item?.department_name || ''),
              count: Number(item?.count || 0),
            }))
          : [],
      };
    }
  } catch {
    // Fall through to rows-based aggregation.
  }

  const rows = await fetchDeptRows();
  return aggregateFromRows(rows);
}

export async function fetchElectives(params?: { department_id?: number; regulation?: string; semester?: number }) {
  const qs = new URLSearchParams();
  if (params?.department_id) qs.set('department_id', String(params.department_id));
  if (params?.regulation) qs.set('regulation', params.regulation);
  if (params?.semester) qs.set('semester', String(params.semester));
  qs.set('page_size', '0'); // Disable pagination to get all results
  const url = `/api/curriculum/elective/?${qs.toString()}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error('Failed to fetch electives');
  const data = await res.json();
  // Handle both paginated and non-paginated responses
  return Array.isArray(data) ? data : (data.results || []);
}

export async function createElective(payload: Partial<DeptRow> & { parent: number; semester_id?: number; department_id?: number }) {
  const res = await fetchWithAuth('/api/curriculum/elective/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateDeptRow(id: number, payload: Partial<DeptRow>) {
  const res = await fetchWithAuth(`/api/curriculum/department/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function approveDeptRow(id: number, action: 'approve' | 'reject') {
  const res = await fetchWithAuth(`/api/curriculum/department/${id}/approve/`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function propagateMaster(
  master: Master,
  targetBatchIds: number[]
): Promise<{ success: number[]; errors: string[] }> {
  const results: { success: number[]; errors: string[] } = { success: [], errors: [] };
  for (const batchId of targetBatchIds) {
    const payload: Partial<Master> = {
      regulation: master.regulation,
      semester: master.semester,
      batch_id: batchId,
      course_code: master.course_code,
      course_name: master.course_name,
      category: master.category,
      class_type: master.class_type,
      is_elective: master.is_elective,
      l: master.l, t: master.t, p: master.p, s: master.s, c: master.c,
      internal_mark: master.internal_mark,
      external_mark: master.external_mark,
      for_all_departments: master.for_all_departments,
      departments: master.departments,
      editable: master.editable,
    };
    try {
      const created = await createMaster(payload);
      results.success.push(created.id);
    } catch (e: any) {
      results.errors.push(String(e));
    }
  }
  return results;
}

export async function propagateDeptRow(
  row: DeptRow,
  targetBatchIds: number[]
): Promise<{ success: number[]; errors: string[] }> {
  const results: { success: number[]; errors: string[] } = { success: [], errors: [] };
  for (const batchId of targetBatchIds) {
    const payload: Record<string, any> = {
      master: row.master,
      department_id: row.department?.id,
      regulation: row.regulation,
      semester: row.semester,
      batch_id: batchId,
      course_code: row.course_code,
      course_name: row.course_name,
      class_type: row.class_type,
      l: row.l, t: row.t, p: row.p, s: row.s, c: row.c,
      internal_mark: row.internal_mark,
      external_mark: row.external_mark,
      total_mark: row.total_mark,
      total_hours: row.total_hours,
      question_paper_type: row.question_paper_type,
      editable: row.editable,
    };
    try {
      const res = await fetchWithAuth('/api/curriculum/department/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      results.success.push(data.id);
    } catch (e: any) {
      results.errors.push(String(e));
    }
  }
  return results;
}
