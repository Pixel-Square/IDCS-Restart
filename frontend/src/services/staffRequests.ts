import { apiClient } from './auth';
import { getApiBase } from './apiBase';
import type {
  RequestTemplate,
  StaffRequest,
  StaffRequestCreate,
  ProcessApprovalPayload,
  ProcessApprovalResponse,
  ApprovalStep,
  LeaveBalancesResponse
} from '../types/staffRequests';

const BASE_URL = `${getApiBase()}/api/staff-requests`;

/**
 * Staff Requests API Service
 * Handles all API calls for the dynamic form and workflow engine
 */

// ==================== Request Templates (HR Only) ====================

export async function getTemplates(): Promise<RequestTemplate[]> {
  const res = await apiClient.get(`${BASE_URL}/templates/`);
  return res.data;
}

export async function getActiveTemplates(): Promise<RequestTemplate[]> {
  const res = await apiClient.get(`${BASE_URL}/templates/active/`);
  return res.data;
}

export async function filterTemplatesForDate(date: string): Promise<{ templates: RequestTemplate[], message?: string }> {
  const res = await apiClient.post(`${BASE_URL}/templates/filter_for_date/`, { date });
  return res.data;
}

export async function getTemplate(id: number): Promise<RequestTemplate> {
  const res = await apiClient.get(`${BASE_URL}/templates/${id}/`);
  return res.data;
}

export async function createTemplate(data: Partial<RequestTemplate>): Promise<RequestTemplate> {
  const res = await apiClient.post(`${BASE_URL}/templates/`, data);
  return res.data;
}

export async function updateTemplate(id: number, data: Partial<RequestTemplate>): Promise<RequestTemplate> {
  const res = await apiClient.put(`${BASE_URL}/templates/${id}/`, data);
  return res.data;
}

export async function patchTemplate(id: number, data: Partial<RequestTemplate>): Promise<RequestTemplate> {
  const res = await apiClient.patch(`${BASE_URL}/templates/${id}/`, data);
  return res.data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await apiClient.delete(`${BASE_URL}/templates/${id}/`);
}

export async function addApprovalStep(templateId: number, step: Partial<ApprovalStep>): Promise<ApprovalStep> {
  const res = await apiClient.post(`${BASE_URL}/templates/${templateId}/add_step/`, step);
  return res.data;
}

export async function reorderSteps(templateId: number, steps: { id: number; step_order: number }[]): Promise<RequestTemplate> {
  const res = await apiClient.post(`${BASE_URL}/templates/${templateId}/reorder_steps/`, { steps });
  return res.data;
}

// ==================== Staff Requests (All Users) ====================

export async function getMyRequests(status?: 'pending' | 'approved' | 'rejected'): Promise<StaffRequest[]> {
  const params = status ? { status } : {};
  const res = await apiClient.get(`${BASE_URL}/requests/my_requests/`, { params });
  return res.data;
}

export async function getRequest(id: number): Promise<StaffRequest> {
  const res = await apiClient.get(`${BASE_URL}/requests/${id}/`);
  return res.data;
}

export async function createRequest(data: StaffRequestCreate): Promise<StaffRequest> {
  const res = await apiClient.post(`${BASE_URL}/requests/`, data);
  return res.data;
}

export async function getApprovalHistory(id: number) {
  const res = await apiClient.get(`${BASE_URL}/requests/${id}/approval_history/`);
  return res.data;
}

// ==================== Pending Approvals (Approvers) ====================

export async function getPendingApprovals(): Promise<StaffRequest[]> {
  const res = await apiClient.get(`${BASE_URL}/requests/pending_approvals/`);
  return res.data;
}

export async function getMyApprovals(): Promise<any[]> {
  const res = await apiClient.get(`${BASE_URL}/requests/my_approvals/`);
  return res.data;
}

export async function processApproval(
  requestId: number,
  data: ProcessApprovalPayload
): Promise<ProcessApprovalResponse> {
  const res = await apiClient.post(`${BASE_URL}/requests/${requestId}/process_approval/`, data);
  return res.data;
}

// ==================== Department Requests (HOD) ====================

export async function getDepartmentRequests(): Promise<StaffRequest[]> {
  const res = await apiClient.get(`${BASE_URL}/requests/department_requests/`);
  return res.data;
}

// ==================== Approval Steps Management ====================

export async function getApprovalSteps(templateId?: number): Promise<ApprovalStep[]> {
  const params = templateId ? { template_id: templateId } : {};
  const res = await apiClient.get(`${BASE_URL}/approval-steps/`, { params });
  return res.data;
}

export async function createApprovalStep(data: Partial<ApprovalStep>): Promise<ApprovalStep> {
  const res = await apiClient.post(`${BASE_URL}/approval-steps/`, data);
  return res.data;
}

export async function updateApprovalStep(id: number, data: Partial<ApprovalStep>): Promise<ApprovalStep> {
  const res = await apiClient.put(`${BASE_URL}/approval-steps/${id}/`, data);
  return res.data;
}

export async function deleteApprovalStep(id: number): Promise<void> {
  await apiClient.delete(`${BASE_URL}/approval-steps/${id}/`);
}

// ==================== Leave Balances ====================

export async function getLeaveBalances(): Promise<LeaveBalancesResponse> {
  const res = await apiClient.get(`${BASE_URL}/requests/balances/`);
  return res.data;
}

export async function getColClaimableInfo(): Promise<any> {
  const res = await apiClient.get(`${BASE_URL}/requests/col_claimable_info/`);
  return res.data;
}

export async function processAbsences(data: {
  year: number;
  month: number;
  absence_dates: string[];
  user_id?: number;
}): Promise<any> {
  const res = await apiClient.post(`${BASE_URL}/requests/process_absences/`, data);
  return res.data;
}

export async function getLateEntryStats(month?: string): Promise<import('../types/staffRequests').LateEntryStats> {
  const params = month ? `?month=${month}` : '';
  const res = await apiClient.get(`${BASE_URL}/requests/late_entry_stats/${params}`);
  return res.data;
}
