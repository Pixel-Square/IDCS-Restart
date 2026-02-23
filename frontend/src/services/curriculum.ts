export type Master = {
  id: number;
  regulation: string;
  semester: number;
  course_code?: string | null;
  mnemonic?: string | null;
  course_name?: string | null;
  class_type?: string;
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
  course_code?: string | null;
  course_name?: string | null;
  class_type?: string | null;
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

// Default to production API if VITE_API_BASE isn't provided
const API_BASE = import.meta.env.VITE_API_BASE || 'https://db.zynix.us';
import fetchWithAuth from './fetchAuth';

export async function fetchMasters(): Promise<Master[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/curriculum/master/`);
  if (!res.ok) throw new Error('Failed to fetch masters');
  return res.json();
}

export async function createMaster(payload: Partial<Master>) {
  const res = await fetchWithAuth(`${API_BASE}/api/curriculum/master/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateMaster(id: number, payload: Partial<Master>) {
  const res = await fetchWithAuth(`${API_BASE}/api/curriculum/master/${id}/`, {
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
  const res = await fetchWithAuth(`${API_BASE}/api/curriculum/department/`);
  if (!res.ok) throw new Error('Failed to fetch dept rows');
  return res.json();
}

export async function fetchDeptRow(id: number): Promise<DeptRow> {
  const res = await fetchWithAuth(`${API_BASE}/api/curriculum/department/${encodeURIComponent(String(id))}/`);
  if (!res.ok) throw new Error('Failed to fetch dept row');
  return res.json();
}

export async function fetchElectives(params?: { department_id?: number; regulation?: string; semester?: number }) {
  const qs = new URLSearchParams();
  if (params?.department_id) qs.set('department_id', String(params.department_id));
  if (params?.regulation) qs.set('regulation', params.regulation);
  if (params?.semester) qs.set('semester', String(params.semester));
  const url = `${API_BASE}/api/curriculum/elective/?${qs.toString()}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error('Failed to fetch electives');
  return res.json();
}

export async function createElective(payload: Partial<DeptRow> & { parent: number; semester_id?: number; department_id?: number }) {
  const res = await fetchWithAuth(`${API_BASE}/api/curriculum/elective/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function updateDeptRow(id: number, payload: Partial<DeptRow>) {
  const res = await fetchWithAuth(`${API_BASE}/api/curriculum/department/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function approveDeptRow(id: number, action: 'approve' | 'reject') {
  const res = await fetchWithAuth(`${API_BASE}/api/curriculum/department/${id}/approve/`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
