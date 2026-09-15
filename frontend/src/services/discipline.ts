import fetchWithAuth from './fetchAuth';

export interface DisciplineApprovalFlow {
  id?: number | string;
  name: string;
  roles: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DisciplineCategory {
  id: number | string;
  title: string;
  description?: string;
  semesters: string[];
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  created_at?: string;
  is_active: boolean;
}

export interface DisciplineIncidentAction {
  id: number | string;
  incident: number | string;
  action_type: 'REPORTED' | 'FINE_FIXED' | 'FINE_MODIFIED' | 'RECEIPT_UPLOADED' | 'FORWARDED' | 'APPROVED' | 'REJECTED';
  role_performed: string;
  user?: number | null;
  user_name: string;
  comments?: string;
  fine_amount?: number | null;
  document_url?: string;
  created_at: string;
}

export interface DisciplineLog {
  id: number | string;
  student?: number | null;
  student_name: string;
  reg_no: string;
  username: string;
  profile_image_url?: string | null;
  department_name?: string;
  section_name?: string;
  batch_name?: string;
  category?: number | string | null;
  category_title?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'REPORTED' | 'PENDING_FINE_PAYMENT' | 'RECEIPT_UPLOADED' | 'IN_APPROVAL' | 'ACTION_TAKEN' | 'RESOLVED' | 'DISMISSED';
  reported_by?: number | null;
  reported_by_name?: string;
  reported_by_profile_image_url?: string | null;
  reported_by_department?: string;
  assigned_approver_name?: string;
  assigned_approver_username?: string;
  assigned_approver_department?: string;
  remarks?: string;
  action_notes?: string;

  // Flow & Fine
  flow_roles?: string[];
  current_step_index?: number;
  current_role?: string;
  has_fine?: boolean;
  fine_amount?: number | string;
  fine_fixed_by?: number | null;
  fine_fixed_at?: string | null;
  receipt_document?: string | null;
  receipt_document_url?: string;
  receipt_notes?: string;
  receipt_uploaded_at?: string | null;
  actions?: DisciplineIncidentAction[];

  incident_date: string;
  updated_at?: string;
}

export interface DisciplineStudent {
  id: number;
  reg_no: string;
  name: string;
  username: string;
  email?: string;
  profile_image_url?: string | null;
  department?: string;
  batch?: string;
  section?: string;
  status?: string;
}

// ── Flow Config API ───────────────────────────────────────────────────────────

export async function fetchDisciplineFlow(): Promise<{ flow: DisciplineApprovalFlow; available_roles: string[] }> {
  const res = await fetchWithAuth('/api/discipline/flow/');
  if (res && res.ok) {
    return res.json();
  }
  return {
    flow: { name: 'Standard Discipline Approval Flow', roles: ['DISCIPLINE_COMMITTEE', 'HOD', 'PRINCIPAL'], is_active: true },
    available_roles: ['DISCIPLINE_COMMITTEE', 'HOD', 'PRINCIPAL', 'IQAC', 'ADMIN', 'STAFF', 'ADVISOR', 'MENTOR'],
  };
}

export async function updateDisciplineFlow(payload: { name?: string; roles: string[] }): Promise<DisciplineApprovalFlow> {
  const res = await fetchWithAuth('/api/discipline/flow/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to update discipline approval flow');
  }
  return res.json();
}

// ── Categories API ────────────────────────────────────────────────────────────

export async function fetchDisciplineCategories(params?: { semester?: string; is_active?: boolean }): Promise<DisciplineCategory[]> {
  const qp = new URLSearchParams();
  if (params?.semester && params.semester !== 'ALL') qp.set('semester', params.semester);
  if (params?.is_active !== undefined) qp.set('is_active', String(params.is_active));

  const query = qp.toString();
  const res = await fetchWithAuth(`/api/discipline/categories/${query ? `?${query}` : ''}`);
  if (res && res.ok) {
    const data = await res.json();
    return data.results || [];
  }
  return [];
}

export async function createDisciplineCategory(payload: Partial<DisciplineCategory>): Promise<DisciplineCategory> {
  const res = await fetchWithAuth('/api/discipline/categories/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to create discipline category');
  }
  return res.json();
}

export async function updateDisciplineCategory(id: number | string, payload: Partial<DisciplineCategory>): Promise<DisciplineCategory> {
  const res = await fetchWithAuth(`/api/discipline/categories/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to update discipline category');
  }
  return res.json();
}

export async function deleteDisciplineCategory(id: number | string): Promise<boolean> {
  const res = await fetchWithAuth(`/api/discipline/categories/${id}/`, {
    method: 'DELETE',
  });
  return res.ok;
}

// ── Incident Logs API ─────────────────────────────────────────────────────────

export async function fetchDisciplineLogs(params?: {
  search?: string;
  status?: string;
  severity?: string;
  department?: string;
  date?: string;
}): Promise<{
  results: DisciplineLog[];
  departments?: string[];
  total_count: number;
  reported_count: number;
  action_taken_count: number;
  resolved_count: number;
}> {
  const qp = new URLSearchParams();
  if (params?.search) qp.set('search', params.search);
  if (params?.status && params.status !== 'ALL') qp.set('status', params.status);
  if (params?.severity && params.severity !== 'ALL') qp.set('severity', params.severity);
  if (params?.department && params.department !== 'ALL') qp.set('department', params.department);
  if (params?.date) qp.set('date', params.date);

  const query = qp.toString();
  const res = await fetchWithAuth(`/api/discipline/logs/${query ? `?${query}` : ''}`);
  if (res && res.ok) {
    return res.json();
  }
  return {
    results: [],
    total_count: 0,
    reported_count: 0,
    action_taken_count: 0,
    resolved_count: 0,
  };
}

export async function createDisciplineLog(payload: Partial<DisciplineLog>): Promise<DisciplineLog> {
  const res = await fetchWithAuth('/api/discipline/logs/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to create discipline log');
  }
  return res.json();
}

export async function updateDisciplineLog(id: number | string, payload: Partial<DisciplineLog>): Promise<DisciplineLog> {
  const res = await fetchWithAuth(`/api/discipline/logs/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to update discipline log');
  }
  return res.json();
}

export async function deleteDisciplineLog(id: number | string): Promise<boolean> {
  const res = await fetchWithAuth(`/api/discipline/logs/${id}/`, {
    method: 'DELETE',
  });
  return res.ok;
}

// ── Students Directory API with Real Database Data ────────────────────────────

export async function fetchDisciplineStudents(params?: {
  department?: string;
  batch?: string;
  section?: string;
  search?: string;
}): Promise<{
  count: number;
  results: DisciplineStudent[];
  departments: string[];
  batches: string[];
}> {
  const qp = new URLSearchParams();
  if (params?.department && params.department !== 'ALL') qp.set('department', params.department);
  if (params?.batch && params.batch !== 'ALL') qp.set('batch', params.batch);
  if (params?.section && params.section !== 'ALL') qp.set('section', params.section);
  if (params?.search) qp.set('search', params.search);

  const query = qp.toString();
  const res = await fetchWithAuth(`/api/discipline/students/${query ? `?${query}` : ''}`);
  if (res && res.ok) {
    return res.json();
  }
  return {
    count: 0,
    results: [],
    departments: [],
    batches: [],
  };
}

export async function exportDisciplineStudentsExcel(payload: {
  student_ids?: (number | string)[];
  reg_nos?: string[];
  department?: string;
  batch?: string;
  section?: string;
  search?: string;
}): Promise<Blob> {
  const res = await fetchWithAuth('/api/discipline/students/export-excel/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error('Failed to generate Excel file with barcodes');
  }
  return res.blob();
}

export async function exportDisciplineStudentsBarcodeZip(payload: {
  student_ids?: (number | string)[];
  reg_nos?: string[];
  department?: string;
  batch?: string;
  section?: string;
  search?: string;
}): Promise<Blob> {
  const res = await fetchWithAuth('/api/discipline/students/export-zip/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error('Failed to generate barcode images ZIP file');
  }
  return res.blob();
}


// ── Approvals & Workflow Actions API ──────────────────────────────────────────

export async function fetchDisciplineApprovals(): Promise<DisciplineLog[]> {
  const res = await fetchWithAuth('/api/discipline/approvals/');
  if (res && res.ok) {
    const data = await res.json();
    return data.results || [];
  }
  return [];
}

export async function fixDisciplineFine(
  logId: number | string,
  payload: {
    has_fine: boolean;
    fine_amount: number | string;
    comments?: string;
    role?: string;
  }
): Promise<DisciplineLog> {
  const res = await fetchWithAuth(`/api/discipline/logs/${logId}/fix-fine/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to fix fine');
  }
  return res.json();
}

export async function forwardDisciplineIncident(
  logId: number | string,
  payload: { comments?: string; role?: string }
): Promise<DisciplineLog> {
  const res = await fetchWithAuth(`/api/discipline/logs/${logId}/forward/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to forward request');
  }
  return res.json();
}

export async function approveDisciplineIncident(
  logId: number | string,
  payload: { comments?: string; action_notes?: string; role?: string }
): Promise<DisciplineLog> {
  const res = await fetchWithAuth(`/api/discipline/logs/${logId}/approve/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to approve incident');
  }
  return res.json();
}

export async function uploadDisciplineReceipt(
  logId: number | string,
  file: File,
  notes?: string
): Promise<DisciplineLog> {
  const formData = new FormData();
  formData.append('receipt_document', file);
  if (notes) formData.append('receipt_notes', notes);

  const res = await fetchWithAuth(`/api/discipline/logs/${logId}/upload-receipt/`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to upload receipt proof');
  }
  return res.json();
}

export async function fetchStudentMyIncidents(): Promise<{
  pending_actions: DisciplineLog[];
  completed_actions: DisciplineLog[];
}> {
  const res = await fetchWithAuth('/api/discipline/student-my-incidents/');
  if (res && res.ok) {
    return res.json();
  }
  return {
    pending_actions: [],
    completed_actions: [],
  };
}

