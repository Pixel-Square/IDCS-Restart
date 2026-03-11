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
