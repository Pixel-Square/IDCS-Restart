import fetchWithAuth from './fetchAuth';

const DEFAULT_API_BASE = 'https://db.krgi.co.in';
const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8000' : DEFAULT_API_BASE);

export type IQACTeachingMapRow = {
  teaching_assignment_id: number;
  course_code: string;
  course_name: string;
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
