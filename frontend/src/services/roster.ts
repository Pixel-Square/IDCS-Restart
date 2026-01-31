export type TeachingAssignmentRosterStudent = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

export type TeachingAssignmentRosterResponse = {
  teaching_assignment: {
    id: number;
    subject_id: number;
    subject_code: string;
    subject_name: string;
    section_id: number;
    section_name: string;
    academic_year: string;
  };
  students: TeachingAssignmentRosterStudent[];
};

export async function fetchTeachingAssignmentRoster(taId: number): Promise<TeachingAssignmentRosterResponse> {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
  const url = `${API_BASE}/api/academics/teaching-assignments/${encodeURIComponent(String(taId))}/students/`;
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
    throw new Error(`Roster fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}
