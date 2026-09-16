import fetchWithAuth from './fetchAuth';

export type AuditDepartment = {
  id: number;
  name: string;
};

export type AuditStaff = {
  id: number;
  name: string;
  department?: string;
  is_iqac?: boolean;
};

export type AuditQuestion = {
  id: number;
  question_text: string;
  category: string;
  max_marks: number;
  is_active: boolean;
};

export type AuditQuestionSet = {
  id: number;
  name: string;
  is_active: boolean;
  questions?: AuditQuestion[];
};

export type AuditRubric = {
  id: number;
  title: string;
  file_url: string;
  uploaded_at: string;
};

export type AuditCycle = {
  cycle: string;
};

export type AuditAssignment = {
  id: number;
  department_name: string;
  cycle: string;
  status: string;
  score_pct: number;
  created_at: string;
  auditors?: AuditStaff[];
};

export type AuditAssignmentDetail = AuditAssignment & {
  question_set_id: number;
  can_edit?: boolean;
  is_iqac?: boolean;
  questions: any[];
};

export type AuditConsolidated = {
  department: string;
  cycle: string;
  score_pct: number;
  status: string;
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
    const text = await res.text();
    throw new Error(text || 'API Error');
  }
  return res.json();
};

export const fetchAuditDepartments = () => req(`${BASE}/departments/`);
export const fetchAuditStaff = () => req(`${BASE}/staff/`);

export const fetchAuditQuestions = () => req(`${BASE}/questions/`);
export const createAuditQuestion = (data: any) => req(`${BASE}/questions/`, { method: 'POST', body: JSON.stringify(data) });
export const updateAuditQuestion = (id: number, data: any) => req(`${BASE}/questions/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteAuditQuestion = (id: number) => req(`${BASE}/questions/${id}/`, { method: 'DELETE' });
export const importAuditQuestions = (data: any) => req(`${BASE}/questions/import/`, { method: 'POST', body: JSON.stringify(data) });

export const fetchAuditQuestionSets = () => req(`${BASE}/question-sets/`);
export const initDefaultQuestionSet = () => req(`${BASE}/question-sets/init-default/`, { method: 'POST' });
export const createAuditQuestionSet = (data: any) => req(`${BASE}/question-sets/`, { method: 'POST', body: JSON.stringify(data) });
export const updateAuditQuestionSet = (id: number, data: any) => req(`${BASE}/question-sets/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteAuditQuestionSet = (id: number) => req(`${BASE}/question-sets/${id}/`, { method: 'DELETE' });

export const fetchAuditRubrics = () => req(`${BASE}/rubrics/`);
export const uploadAuditRubric = async (file: File, title: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  const res = await fetchWithAuth(`${BASE}/rubrics/`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
};
export const deleteAuditRubric = (id: number) => req(`${BASE}/rubrics/${id}/`, { method: 'DELETE' });
export const getAuditRubricDownloadUrl = (id: number) => `${BASE}/rubrics/${id}/download/`;

export const fetchAuditCycles = () => req(`${BASE}/cycles/`);

export const fetchAuditAssignments = (cycle?: string, role?: string) => {
  const params = new URLSearchParams();
  if (cycle) params.append('cycle', cycle);
  if (role) params.append('role', role);
  return req(`${BASE}/assignments/?${params.toString()}`);
};
export const createAuditAssignment = (data: any) => req(`${BASE}/assignments/`, { method: 'POST', body: JSON.stringify(data) });
export const fetchAuditAssignmentDetail = (id: number) => req(`${BASE}/assignments/${id}/`);
export const deleteAuditAssignment = (id: number) => req(`${BASE}/assignments/${id}/`, { method: 'DELETE' });
export const removeAuditAuditor = (assignId: number, staffId: number) => req(`${BASE}/assignments/${assignId}/auditors/${staffId}/`, { method: 'DELETE' });
export const saveAuditScores = (assignId: number, data: any) => req(`${BASE}/assignments/${assignId}/scores/`, { method: 'POST', body: JSON.stringify(data) });
export const fetchAuditReport = (assignId: number) => req(`${BASE}/assignments/${assignId}/report/`);
export const fetchAuditATR = (assignId: number) => req(`${BASE}/assignments/${assignId}/atr/`);
export const saveAuditATR = (assignId: number, data: any) => req(`${BASE}/assignments/${assignId}/atr/`, { method: 'POST', body: JSON.stringify(data) });

export const fetchAuditConsolidated = (cycle: string) => req(`${BASE}/consolidated/?cycle=${encodeURIComponent(cycle)}`);
