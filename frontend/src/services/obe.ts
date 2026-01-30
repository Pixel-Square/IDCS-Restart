export type TeachingAssignmentItem = {
  id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  section_id: number;
  section_name: string;
  academic_year: string;
};

export async function fetchMyTeachingAssignments(): Promise<TeachingAssignmentItem[]> {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
  const url = `${API_BASE}/api/academics/my-teaching-assignments/`;
  const token = window.localStorage.getItem('access');

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Teaching assignments fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}
