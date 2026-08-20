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
  semester?: number | null;
  department?: {
    id?: number;
    code?: string | null;
    name?: string | null;
  } | null;
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
export type AcademicYearRow = {
  id: number;
  name: string;
  is_active: boolean;
  parity: 'ODD' | 'EVEN';
};

export async function fetchAcademicYears(): Promise<AcademicYearRow[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/academic-years/`);
  if (!res.ok) throw new Error('Failed to fetch academic years');
  const data = await res.json();
  const results = (data as any)?.results;
  if (Array.isArray(results)) return results as AcademicYearRow[];
  if (Array.isArray(data)) return data as AcademicYearRow[];
  return [];
}

export async function shiftSemester(academicYearId: number): Promise<{ message: string; updated_count: number; skipped_graduated_count?: number }> {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/academic-years/${academicYearId}/shift_semester/`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to shift semester');
  }
  return res.json();
}

export type TransitionLog = {
  id: number;
  academic_year: string;
  parity: string;
  performed_at: string;
  performed_by: string;
  updated_count: number;
  details: string;
};

export async function fetchTransitionLogs(): Promise<TransitionLog[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/academic-years/transition_logs/`);
  if (!res.ok) throw new Error('Failed to fetch transition logs');
  return res.json();
}

// ── Batch Archival / Graduation ──────────────────────────────────────────────

export type BatchYearFull = {
  id: number;
  name: string;
  start_year?: number | null;
  end_year?: number | null;
  is_graduated: boolean;
  graduated_at?: string | null;
  graduated_by?: number | null;
  graduated_by_name?: string | null;
};

export type GraduateResult = {
  message: string;
  batch_year_id: number;
  batches_deactivated: number;
  advisors_deactivated: number;
  students_set_alumni: number;
};

export type UngraduateResult = {
  message: string;
  batch_year_id: number;
  batches_reactivated: number;
};

export async function fetchBatchYearsWithGraduation(): Promise<BatchYearFull[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/batch-years/`);
  if (!res.ok) throw new Error('Failed to fetch batch years');
  const data = await res.json();
  const results = (data as any)?.results;
  if (Array.isArray(results)) return results as BatchYearFull[];
  if (Array.isArray(data)) return data as BatchYearFull[];
  return [];
}

export async function graduateBatch(batchYearId: number): Promise<GraduateResult> {
  const res = await fetchWithAuth(
    `${API_BASE}/api/academics/batch-years/${batchYearId}/graduate_batch/`,
    { method: 'POST' },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.detail || 'Failed to graduate batch');
  return data as GraduateResult;
}

export async function ungraduateBatch(batchYearId: number): Promise<UngraduateResult> {
  const res = await fetchWithAuth(
    `${API_BASE}/api/academics/batch-years/${batchYearId}/ungraduate_batch/`,
    { method: 'POST' },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.detail || 'Failed to un-graduate batch');
  return data as UngraduateResult;
}
