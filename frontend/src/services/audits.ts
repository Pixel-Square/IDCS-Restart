import fetchWithAuth from './fetchAuth';

export type AuditDepartment = {
  id: number;
  code?: string;
  name: string;
  short_name?: string;
  [key: string]: any;
};

export type AuditStaff = {
  id: number;
  staff_id?: string;
  name: string;
  designation?: string;
  department?: { id: number; name: string; code?: string } | string;
  is_iqac?: boolean;
  [key: string]: any;
};

export type AuditQuestion = {
  id: number;
  sl_no: number;
  details: string;
  documents_checklist?: string;
  detailed_description?: string;
  question_text?: string;
  category?: string;
  max_marks: number;
  is_active?: boolean;
  [key: string]: any;
};

export type AuditQuestionSet = {
  id: number;
  name: string;
  description?: string;
  is_active?: boolean;
  question_ids: number[];
  questions?: AuditQuestion[];
  [key: string]: any;
};

export type AuditRubric = {
  id: number;
  name: string;      // backend field is "name"
  title?: string;    // alias
  file_url?: string;
  uploaded_at?: string;
  [key: string]: any;
};

export type AuditCycle = {
  id: number;
  cycle: string | number;
  cycle_number?: number;
  label?: string;
  name?: string;
  [key: string]: any;
};

export type AuditAssignment = {
  id: number;
  department_name: string;
  department_code?: string;
  cycle: string | number;
  cycle_label?: string;
  cycle_number?: number;
  status: string;
  score_pct?: number;
  created_at?: string;
  auditors?: AuditStaff[];
  remarks?: string;
  [key: string]: any;
};

export type AuditAssignmentDetail = AuditAssignment & {
  question_set_id?: number;
  can_edit?: boolean;
  is_iqac?: boolean;
  questions: any[];
  [key: string]: any;
};

export type AuditConsolidated = {
  cycle?: string | number;
  cycle_label?: string;
  departments: any[];
  [key: string]: any;
};

export type AuditATRRow = {
  id: number;
  status: string;
  [key: string]: any;
};

const BASE = '/api/audits';

const req = async (url: string, options?: RequestInit) => {
  const res = await fetchWithAuth(url, options);
  if (!res.ok) {
    let errMsg = 'API Error';
    try { const t = await res.text(); errMsg = t || errMsg; } catch { /* ignore */ }
    throw new Error(errMsg);
  }
  // Some DELETE endpoints return 204 No Content
  if (res.status === 204) return null;
  try { return await res.json(); } catch { return null; }
};

const jsonHeaders = { 'Content-Type': 'application/json' };

export const fetchAuditDepartments = (): Promise<AuditDepartment[]> =>
  req(`${BASE}/departments/`).then((d) => d?.results ?? d ?? []);

export const fetchAuditStaff = (): Promise<AuditStaff[]> =>
  req(`${BASE}/staff/`).then((d) => d?.results ?? d ?? []);

export const fetchAuditQuestions = (): Promise<AuditQuestion[]> =>
  req(`${BASE}/questions/`).then((d) => d?.results ?? d ?? []);

export const createAuditQuestion = (data: any) =>
  req(`${BASE}/questions/`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(data) });

export const updateAuditQuestion = (id: number, data: any) =>
  req(`${BASE}/questions/${id}/`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(data) });

export const deleteAuditQuestion = (id: number, password?: string) =>
  req(`${BASE}/questions/${id}/`, { method: 'DELETE', headers: jsonHeaders, body: JSON.stringify({ password }) });

export const importAuditQuestions = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return req(`${BASE}/questions/import/`, { method: 'POST', body: formData });
};

export const fetchAuditQuestionSets = (): Promise<AuditQuestionSet[]> =>
  req(`${BASE}/question-sets/`).then((d) => d?.results ?? d ?? []);

export const initDefaultQuestionSet = () =>
  req(`${BASE}/question-sets/init-default/`, { method: 'POST' });

export const createAuditQuestionSet = (data: any) =>
  req(`${BASE}/question-sets/`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(data) });

export const updateAuditQuestionSet = (id: number, data: any) =>
  req(`${BASE}/question-sets/${id}/`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(data) });

export const deleteAuditQuestionSet = (id: number, password?: string) =>
  req(`${BASE}/question-sets/${id}/`, { method: 'DELETE', headers: jsonHeaders, body: JSON.stringify({ password }) });

export const fetchAuditRubrics = (): Promise<AuditRubric[]> =>
  req(`${BASE}/rubrics/`).then((d) => d?.results ?? d ?? []);

// Page calls: uploadAuditRubric(name, file)  — name first, file second
export const uploadAuditRubric = async (name: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  formData.append('title', name); // send both for compatibility
  const res = await fetchWithAuth(`${BASE}/rubrics/`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
};

export const deleteAuditRubric = (id: number, password?: string) =>
  req(`${BASE}/rubrics/${id}/`, { method: 'DELETE', headers: jsonHeaders, body: JSON.stringify({ password }) });

export const getAuditRubricDownloadUrl = (id: number) => `${BASE}/rubrics/${id}/download/`;

export const fetchAuditCycles = (): Promise<AuditCycle[]> =>
  req(`${BASE}/cycles/`).then((d) => d?.results ?? d ?? []);

export const fetchAuditAssignments = (cycle?: string, role?: string): Promise<AuditAssignment[]> => {
  const params = new URLSearchParams();
  if (cycle) params.append('cycle_id', cycle);
  if (role) params.append('scope', role);
  return req(`${BASE}/assignments/?${params.toString()}`).then((d) => d?.results ?? d ?? []);
};

export const createAuditAssignment = (data: any) =>
  req(`${BASE}/assignments/`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(data) });

export const fetchAuditAssignmentDetail = (id: number): Promise<AuditAssignmentDetail> =>
  req(`${BASE}/assignments/${id}/`);

export const deleteAuditAssignment = (id: number, password?: string) =>
  req(`${BASE}/assignments/${id}/`, { method: 'DELETE', headers: jsonHeaders, body: JSON.stringify({ password }) });

export const removeAuditAuditor = (assignId: number, staffId: number) =>
  req(`${BASE}/assignments/${assignId}/auditors/${staffId}/`, { method: 'DELETE' });

export const saveAuditScores = (assignId: number, data: any) =>
  req(`${BASE}/assignments/${assignId}/scores/`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(data) });

export const fetchAuditReport = (assignId: number) =>
  req(`${BASE}/assignments/${assignId}/report/`);

export const fetchAuditATR = (assignId: number) =>
  req(`${BASE}/assignments/${assignId}/atr/`);

export const saveAuditATR = (assignId: number, data: any) =>
  req(`${BASE}/assignments/${assignId}/atr/`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(data) });

export const fetchAuditConsolidated = (cycle?: string): Promise<AuditConsolidated[]> => {
  const url = cycle ? `${BASE}/consolidated/?cycle=${encodeURIComponent(cycle)}` : `${BASE}/consolidated/`;
  return req(url).then((d) => d?.results ?? d ?? []);
};
