export type Master = {
  id: number;
  regulation: string;
  semester: number;
  course_code?: string | null;
  course_name?: string | null;
  class_type?: string;
  category?: string;
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
  l?: number; t?: number; p?: number; s?: number; c?: number;
  internal_mark?: number | null;
  external_mark?: number | null;
  total_mark?: number | null;
  total_hours?: number | null;
  question_paper_type?: string | null;
  editable?: boolean;
  overridden?: boolean;
};

// Default to backend dev server if VITE_API_BASE isn't provided
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function authHeaders() {
  const token = window.localStorage.getItem('access');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchMasters(): Promise<Master[]> {
  const res = await fetch(`${API_BASE}/api/curriculum/master/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch masters');
  return res.json();
}

export async function createMaster(payload: Partial<Master>) {
  const res = await fetch(`${API_BASE}/api/curriculum/master/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateMaster(id: number, payload: Partial<Master>) {
  const res = await fetch(`${API_BASE}/api/curriculum/master/${id}/`, {
    method: 'PATCH',
    headers: authHeaders(),
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
  const res = await fetch(`${API_BASE}/api/curriculum/department/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch dept rows');
  return res.json();
}

export async function updateDeptRow(id: number, payload: Partial<DeptRow>) {
  const res = await fetch(`${API_BASE}/api/curriculum/department/${id}/`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function approveDeptRow(id: number, action: 'approve' | 'reject') {
  const res = await fetch(`${API_BASE}/api/curriculum/department/${id}/approve/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
