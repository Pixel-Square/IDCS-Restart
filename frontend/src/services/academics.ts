import fetchWithAuth from './fetchAuth';
import { getApiBase } from './apiBase'

const API_BASE = getApiBase();

export type IQACTeachingMapRow = {
  teaching_assignment_id: number;
  course_code: string;
  course_name: string;
  class_type?: string | null;
  section_id: number;
  section_name: string;
  academic_year: string;
  staff?: {
    id?: number;
    username?: string;
    name?: string;
    email?: string;
  } | null;
};

export async function fetchIQACCourseTeachingMap(courseCode: string): Promise<IQACTeachingMapRow[]> {
  const code = encodeURIComponent(String(courseCode || '').trim());
  const res = await fetchWithAuth(`${API_BASE}/api/academics/iqac/course-teaching/${code}/`);
  if (!res.ok) throw new Error('Failed to fetch course teaching map');
  const data = await res.json();
  if (Array.isArray(data)) return data as IQACTeachingMapRow[];
  const results = (data as any)?.results;
  return Array.isArray(results) ? (results as IQACTeachingMapRow[]) : [];
}

export async function fetchAttendanceNotificationCount(): Promise<{ count: number; role: string }> {
  const res = await fetchWithAuth('/api/academics/analytics/attendance-notification-count/');
  if (!res.ok) return { count: 0, role: 'none' };
  return res.json();
}

export type DepartmentRow = { id: number; code?: string | null; name?: string | null; short_name?: string | null }

export async function fetchDepartments(): Promise<DepartmentRow[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/departments/`)
  if (!res.ok) throw new Error('Failed to fetch departments')
  const data = await res.json()
  const results = (data as any)?.results
  if (Array.isArray(results)) return results as DepartmentRow[]
  if (Array.isArray(data)) return data as DepartmentRow[]
  return []
}

/* ── System Transitions (semester shift) ─────────────────────────────── */

export interface AcademicYearRow {
  id: number;
  name: string;
  is_active?: boolean;
  parity?: string;
  start_year?: number | string | null;
  end_year?: number | string | null;
}

export interface TransitionLog {
  id: number;
  academic_year: number | string | { id: number; name: string } | null;
  performed_by: string | number | null;
  performed_at: string;
  updated_count: number;
  details?: string;
}

export async function fetchAcademicYears(): Promise<AcademicYearRow[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/academic-years/`);
  if (!res.ok) throw new Error('Failed to fetch academic years');
  const data = await res.json();
  const results = (data as any)?.results;
  if (Array.isArray(results)) return results as AcademicYearRow[];
  if (Array.isArray(data)) return data as AcademicYearRow[];
  return [];
}

export async function shiftSemester(academicYearId: number): Promise<{ message: string }> {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/shift-semester/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ academic_year_id: academicYearId }),
  });
  if (!res.ok) throw new Error('Failed to perform semester shift');
  return res.json();
}

export async function fetchTransitionLogs(): Promise<TransitionLog[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/transition-logs/`);
  if (!res.ok) throw new Error('Failed to fetch transition logs');
  const data = await res.json();
  const results = (data as any)?.results;
  if (Array.isArray(results)) return results as TransitionLog[];
  if (Array.isArray(data)) return data as TransitionLog[];
  return [];
}
