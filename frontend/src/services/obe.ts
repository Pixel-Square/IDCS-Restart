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


export type Cia1MarksResponse = {
  subject: { code: string; name: string };
  students: Array<{ id: number; reg_no: string; name: string; section?: string | null }>;
  marks: Record<string, string | null>;
};

export async function fetchCia1Marks(subjectId: string): Promise<Cia1MarksResponse> {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
  const url = `${API_BASE}/api/obe/cia1-marks/${encodeURIComponent(subjectId)}`;
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
    try {
      const j = JSON.parse(text);
      const detail = j?.detail || `CIA1 roster fetch failed: ${res.status}`;
      const how = Array.isArray(j?.how_to_fix) ? `\nHow to fix:\n- ${j.how_to_fix.join('\n- ')}` : '';
      throw new Error(`${detail}${how}`);
    } catch {
      throw new Error(`CIA1 roster fetch failed: ${res.status} ${text}`);
    }
  }

  return res.json();
}

export async function saveCia1Marks(subjectId: string, marks: Record<number, number | null>): Promise<Cia1MarksResponse> {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
  const url = `${API_BASE}/api/obe/cia1-marks/${encodeURIComponent(subjectId)}`;
  const token = window.localStorage.getItem('access');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ marks }),
  });

  const dataText = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(dataText);
      const detail = j?.detail || `CIA1 save failed: ${res.status}`;
      const how = Array.isArray(j?.how_to_fix) ? `\nHow to fix:\n- ${j.how_to_fix.join('\n- ')}` : '';
      const errors = Array.isArray(j?.errors) ? `\nErrors:\n- ${j.errors.join('\n- ')}` : '';
      throw new Error(`${detail}${how}${errors}`);
    } catch {
      throw new Error(`CIA1 save failed: ${res.status} ${dataText}`);
    }
  }

  return JSON.parse(dataText);
}
