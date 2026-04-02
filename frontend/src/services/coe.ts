import fetchWithAuth from './fetchAuth';

export type CoePortalContext = {
  portal_access: boolean;
  is_coe_login: boolean;
  portal_login_email: string;
  access_via_permission: boolean;
  permissions: string[];
  features: {
    exam_control: boolean;
    results: boolean;
    circulars: boolean;
    academic_calendar: boolean;
  };
};

export type CoeCourseStudent = {
  id: number;
  reg_no: string;
  name: string;
  is_arrear?: boolean;
};

export type CoeCourseGroup = {
  course_code: string;
  course_name: string;
  students: CoeCourseStudent[];
};

export type CoeDepartmentCourseMap = {
  department: string;
  courses: CoeCourseGroup[];
};

export type CoeStudentsMapResponse = {
  department_filter: string;
  semester_filter: string | null;
  departments: CoeDepartmentCourseMap[];
  saved_dummies?: CoeSavedDummyMapItem[];
};

export type CoeSavedDummyMapItem = {
  dummy: string;
  reg_no: string;
  name: string;
  semester: string;
  qp_type: 'QP1' | 'QP2' | 'TCPR';
};

export type CoeArrearRecord = {
  id: number;
  batch: string;
  department: string;
  semester: string;
  course_code: string;
  course_name: string;
  student_register_number: string;
  student_name: string;
  updated_at?: string | null;
};

export async function fetchCoePortalContext(): Promise<CoePortalContext> {
  const res = await fetchWithAuth('/api/coe/portal/');

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`COE context fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function fetchCoeStudentsMap(params: { department: string; semester: string }): Promise<CoeStudentsMapResponse> {
  const qp = new URLSearchParams();
  qp.set('department', params.department);
  qp.set('semester', params.semester);

  const res = await fetchWithAuth(`/api/coe/students-map/?${qp.toString()}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`COE students map fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function saveCoeStudentDummies(payload: { records: { reg_no: string; dummy: string; semester: string; qp_type: 'QP1' | 'QP2' | 'TCPR' }[]; password: string }) {
  const res = await fetchWithAuth('/api/coe/save-dummies/', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save dummies: ${res.status} ${text}`);
  }

  return res.json();
}

export async function resetCoeStudentDummies(payload: { semester: string; dummies: string[]; password: string }) {
  const res = await fetchWithAuth('/api/coe/reset-dummies/', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to reset dummies: ${res.status} ${text}`);
  }

  return res.json();
}

export async function fetchCoeArrears(params?: { department?: string; semester?: string }) {
  const qp = new URLSearchParams();
  if (params?.department) qp.set('department', params.department);
  if (params?.semester) qp.set('semester', params.semester);

  const suffix = qp.toString() ? `?${qp.toString()}` : '';
  const res = await fetchWithAuth(`/api/coe/arrears/${suffix}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch arrears: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ results: CoeArrearRecord[] }>;
}

type CoeArrearPayload = {
  batch: string;
  department: string;
  semester: string;
  course_code: string;
  course_name: string;
  student_register_number: string;
  student_name: string;
};

export async function createCoeArrear(payload: CoeArrearPayload) {
  const res = await fetchWithAuth('/api/coe/arrears/', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create arrear record: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ created: boolean; record: CoeArrearRecord }>;
}

export async function updateCoeArrear(id: number, payload: CoeArrearPayload) {
  const res = await fetchWithAuth(`/api/coe/arrears/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update arrear record: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ record: CoeArrearRecord }>;
}

export async function deleteCoeArrear(id: number) {
  const res = await fetchWithAuth(`/api/coe/arrears/${id}/`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete arrear record: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ deleted: boolean }>;
}

export async function bulkUpsertCoeArrears(rows: CoeArrearPayload[]) {
  const res = await fetchWithAuth('/api/coe/arrears/bulk-upsert/', {
    method: 'POST',
    body: JSON.stringify({ rows }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload arrear records: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ created: number; updated: number; errors: string[] }>;
}

/* ── COE Course Selection persistence ─────────────────────────── */

export type CourseSelectionData = {
  selected: boolean;
  qpType: string;
  eseType: string;
};

export type CourseSelectionResponse = {
  selections: Record<string, CourseSelectionData>;
  is_locked: boolean;
};

export async function fetchCoeCourseSel(key: string): Promise<CourseSelectionResponse> {
  const qp = new URLSearchParams();
  qp.set('key', key);
  const res = await fetchWithAuth(`/api/coe/course-selections/?${qp.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch course selections: ${res.status} ${text}`);
  }
  return res.json();
}

export async function saveCoeCourseSel(key: string, selections: Record<string, CourseSelectionData>, is_locked: boolean): Promise<{ saved: boolean }> {
  const res = await fetchWithAuth('/api/coe/course-selections/', {
    method: 'POST',
    body: JSON.stringify({ key, selections, is_locked }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save course selections: ${res.status} ${text}`);
  }
  return res.json();
}

