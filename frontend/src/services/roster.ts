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

  const sanitizeHttpErrorText = (text: string, limit = 800) => {
    const raw = String(text || '');
    const noScripts = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const stripped = noScripts
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();

    const cleaned = stripped || raw.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= limit) return cleaned;
    return cleaned.slice(0, limit) + '… (truncated)';
  };

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Roster fetch failed: ${res.status}\n${sanitizeHttpErrorText(text)}`);
  }

  return res.json();
}
