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
  department?: string | null;
  semester: string;
  qp_type: 'QP1' | 'QP2' | 'TCPR' | 'TCPL' | 'OE';
};

export type CoeFilterOptions = {
  departments: string[];
  semesters: string[];
  source: 'academics' | 'coe-map' | 'mixed' | 'fallback';
};

const ALL_SEMESTERS: string[] = ['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8'];

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
  const rawSemester = String(params.semester || '').trim();
  const normalized = normalizeSemesterLabel(rawSemester);

  const semesterCandidates = uniqueStrings([
    rawSemester,
    normalized || '',
    normalized ? normalized.replace('SEM', '') : '',
  ]);

  let lastError = '';

  for (const semesterCandidate of semesterCandidates) {
    const qp = new URLSearchParams();
    qp.set('department', params.department);
    qp.set('semester', semesterCandidate);

    const res = await fetchWithAuth(`/api/coe/students-map/?${qp.toString()}`);
    if (res.ok) {
      return res.json();
    }

    let text = '';
    try {
      text = await res.clone().text();
    } catch {
      text = '(unable to read response body)';
    }
    lastError = `COE students map fetch failed: ${res.status} ${text}`;

    // Try alternate semester formats when backend rejects one representation.
    if (res.status === 400 || res.status === 404) {
      continue;
    }

    // For non-retriable errors, throw immediately
    throw new Error(lastError);
  }

  throw new Error(lastError || 'COE students map fetch failed.');
}

function uniqueStrings(values: string[]): string[] {
  const cleaned = values.map((v) => String(v || '').trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

function normalizeSemesterLabel(value: string): string | null {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return null;

  let token = raw;
  if (token.startsWith('SEM')) {
    token = token.replace('SEM', '').trim();
  }

  const parsed = Number.parseInt(token, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 8) return null;
  return `SEM${parsed}`;
}

async function fetchDepartmentsFromAcademics(): Promise<string[]> {
  const res = await fetchWithAuth('/api/academics/departments/');
  if (!res.ok) return [];
  const data = await res.json();
  const rows = data?.results || data || [];
  const names = rows
    .map((d: any) => {
      const label = d?.short_name || d?.code || d?.name || d;
      return label ? String(label).trim().toUpperCase() : '';
    })
    .filter(Boolean);
  return uniqueStrings(names);
}

async function fetchSemestersFromAcademics(): Promise<string[]> {
  const res = await fetchWithAuth('/api/academics/semesters/');
  if (!res.ok) return [];
  const data = await res.json();
  const rows = data?.results || data || [];
  const names = rows
    .map((s: any) => s?.name || s?.code || s)
    .filter(Boolean)
    .map((s: any) => normalizeSemesterLabel(String(s)) || String(s).trim());
  return uniqueStrings(names);
}

async function fetchOptionsFromCoeMap(): Promise<{ departments: string[]; semesters: string[] }> {
  const departments = new Set<string>();
  const semesters = new Set<string>();
  const semCandidates = ALL_SEMESTERS;

  for (const sem of semCandidates) {
    try {
      const res = await fetchCoeStudentsMap({ department: 'ALL', semester: sem });
      const deptBlocks = Array.isArray(res?.departments) ? res.departments : [];
      if (deptBlocks.length > 0) {
        semesters.add(normalizeSemesterLabel(sem) || sem);
      }
      deptBlocks.forEach((block) => {
        const dept = String(block?.department || '').trim().toUpperCase();
        if (dept) departments.add(dept);
      });
    } catch {
      // Ignore failed probes and continue.
    }
  }

  return {
    departments: Array.from(departments),
    semesters: Array.from(semesters),
  };
}

export async function fetchCoeFilterOptions(): Promise<CoeFilterOptions> {
  let departments: string[] = [];
  let semesters: string[] = [];

  try {
    departments = await fetchDepartmentsFromAcademics();
  } catch {
    departments = [];
  }

  try {
    semesters = await fetchSemestersFromAcademics();
  } catch {
    semesters = [];
  }

  const usedAcademicsDepartments = departments.length > 0;
  const usedAcademicsSemesters = semesters.length > 0;

  if (departments.length === 0 || semesters.length === 0) {
    const coeMapOptions = await fetchOptionsFromCoeMap();
    if (departments.length === 0) {
      departments = coeMapOptions.departments;
    }
    if (semesters.length === 0) {
      semesters = coeMapOptions.semesters;
    }
  }

  const normalizedDepartments = departments.length > 0 ? ['ALL', ...uniqueStrings(departments)] : ['ALL'];
  const normalizedSemesters = ALL_SEMESTERS;

  let source: CoeFilterOptions['source'] = 'fallback';
  if (usedAcademicsDepartments && usedAcademicsSemesters) {
    source = 'academics';
  } else if (normalizedDepartments.length > 1 || normalizedSemesters.length > 0) {
    source = usedAcademicsDepartments || usedAcademicsSemesters ? 'mixed' : 'coe-map';
  }

  return {
    departments: normalizedDepartments,
    semesters: normalizedSemesters,
    source,
  };
}

export async function saveCoeStudentDummies(payload: { records: { reg_no: string; dummy: string; semester: string; qp_type: 'QP1' | 'QP2' | 'TCPR' | 'TCPL' | 'OE' }[]; password: string }) {
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

export type ExternalStaffProfile = {
  id: number;
  staff_id: string;
  first_name: string;
  last_name: string;
  email: string;
  department_name: string;
  login_code: string;
  status: string;
};

export type ExternalStaffFetchResult = {
  rows: ExternalStaffProfile[];
  source: 'coe-admin-source' | 'coe-academics-profiles' | 'coe-db-mirror' | 'coe-local' | 'ext-staff-profiles' | 'all-staff' | 'none';
  note?: string;
};

function mapExtProfileRows(data: any[]): ExternalStaffProfile[] {
  return data.map((row: any) => {
    const fullName = String(row?.full_name || row?.username || '').trim();
    const parts = fullName ? fullName.split(/\s+/) : [];
    const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || '');
    const last = parts.length > 1 ? (parts[parts.length - 1] || '') : '';
    return {
      id: Number(row?.id ?? 0),
      staff_id: String(row?.faculty_id || row?.username || row?.id || ''),
      first_name: first,
      last_name: last,
      email: String(row?.email || ''),
      department_name: String(row?.department || 'General'),
      login_code: String(row?.ext_uid || ''),
      status: row?.is_active ? 'ACTIVE' : 'INACTIVE',
    };
  });
}

function mapAllStaffRows(data: any[]): ExternalStaffProfile[] {
  const rows = data.map((row: any) => ({
    id: Number(row?.id ?? 0),
    staff_id: String(row?.staff_id || row?.internal_id || row?.id || ''),
    first_name: String(row?.user?.first_name || '').trim(),
    last_name: String(row?.user?.last_name || '').trim(),
    email: String(row?.user?.email || ''),
    department_name: String(row?.current_department?.name || row?.current_department?.short_name || 'General'),
    login_code: '',
    status: String(row?.status || ''),
  }));

  const externalOnly = rows.filter((r) => String(r.status || '').toUpperCase() === 'EXTERNAL');
  return externalOnly.length > 0 ? externalOnly : rows;
}

export async function fetchExternalStaffWithSource(): Promise<ExternalStaffFetchResult> {
  const coeEndpoints: Array<{ endpoint: string; source: ExternalStaffFetchResult['source'] }> = [
    { endpoint: '/api/coe/external-staff/admin-source/?strict=0', source: 'coe-admin-source' },
    { endpoint: '/api/coe/external-staff/academics-profiles/?strict=0', source: 'coe-academics-profiles' },
    { endpoint: '/api/coe/external-staff/db-mirror/?strict=0', source: 'coe-db-mirror' },
    { endpoint: '/api/coe/external-staff/?strict=0', source: 'coe-local' },
  ];

  let hadSuccessfulCoeResponse = false;
  let lastErrorMessage = '';

  for (const item of coeEndpoints) {
    try {
      const res = await fetchWithAuth(item.endpoint);
      if (!res.ok) {
        lastErrorMessage = `Failed to fetch external staff (${res.status})`;
        continue;
      }

      hadSuccessfulCoeResponse = true;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return { rows: data as ExternalStaffProfile[], source: item.source };
      }
    } catch (err: any) {
      lastErrorMessage = err?.message || 'Failed to fetch external staff';
    }
  }

  try {
    const res = await fetchWithAuth('/api/academics/ext-staff-profiles/');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return { rows: mapExtProfileRows(data), source: 'ext-staff-profiles' };
      }
    }
  } catch (err: any) {
    if (!hadSuccessfulCoeResponse) {
      lastErrorMessage = err?.message || lastErrorMessage || 'Failed to fetch external staff';
    }
  }

  // Last practical fallback: staff master list. If EXTERNAL rows exist, show those; otherwise show all.
  try {
    const res = await fetchWithAuth('/api/academics/all-staff/');
    if (res.ok) {
      const data = await res.json();
      const rows = Array.isArray(data?.results) ? mapAllStaffRows(data.results) : [];
      if (rows.length > 0) {
        return {
          rows,
          source: 'all-staff',
          note: 'Showing staff master data because external-only datasets are empty.',
        };
      }
    }
  } catch {
    // No-op: handled below.
  }

  if (hadSuccessfulCoeResponse) {
    return { rows: [], source: 'none', note: 'COE external staff datasets are reachable but empty.' };
  }

  throw new Error(lastErrorMessage || 'Failed to fetch external staff');
}

export async function fetchExternalStaff(): Promise<ExternalStaffProfile[]> {
  const result = await fetchExternalStaffWithSource();
  return result.rows;
}

export async function assignExternalCodes(): Promise<{ message: string; count: number }> {
  const res = await fetchWithAuth('/api/coe/external-staff/assign-codes/?strict=1', {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to assign external codes');
  return res.json();
}
