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

export async function deleteMyPendingRequest(id: number): Promise<void> {
  await apiClient.delete(`${BASE_URL}/requests/${id}/`);
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

export async function searchStaffForBalanceEdit(query: string): Promise<any> {
  const res = await apiClient.get(`${BASE_URL}/requests/balances/staff_search/`, {
    params: { q: query }
  });
  return res.data;
}

export async function getBalancesByUser(userId: number): Promise<any> {
  const res = await apiClient.get(`${BASE_URL}/requests/balances/by_user/`, {
    params: { user_id: userId }
  });
  return res.data;
}

export async function setBalanceForUser(userId: number, leaveType: string, balance: number): Promise<any> {
  const res = await apiClient.post(`${BASE_URL}/requests/balances/set/`, {
    user_id: userId,
    leave_type: leaveType,
    balance,
  });
  return res.data;
}

export async function recalculateLopBalances(): Promise<any> {
  const res = await apiClient.post(`${BASE_URL}/requests/balances/recalculate_lop/`);
  return res.data;
}

export async function getLateEntryMonthlyByUser(userId: number, month?: string): Promise<any> {
  const params: Record<string, any> = { user_id: userId };
  if (month) params.month = month;
  const res = await apiClient.get(`${BASE_URL}/requests/balances/late_entry_monthly/`, { params });
  return res.data;
}

export async function deleteLateEntryRecord(requestId: number, month?: string): Promise<any> {
  const payload: Record<string, any> = { request_id: requestId };
  if (month) payload.month = month;
  const res = await apiClient.post(`${BASE_URL}/requests/balances/late_entry/delete/`, payload);
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

// ==================== HR Staff Validation ====================

export async function getStaffValidationOverview(params: {
  from_date: string;
  to_date?: string;
  department_id?: string;
}): Promise<any> {
  const res = await apiClient.get(`${BASE_URL}/requests/staff_validation_overview/`, { params });
  return res.data;
}

export async function getStaffValidationCalendar(params: {
  staff_user_id: number;
  from_date: string;
  to_date?: string;
}): Promise<any> {
  const res = await apiClient.get(`${BASE_URL}/requests/staff_validation_calendar/`, { params });
  return res.data;
}

export async function getHrTemplatesForStaff(params: {
  staff_user_id: number;
  date: string;
}): Promise<{ templates: RequestTemplate[]; message?: string; is_holiday?: boolean; is_absent?: boolean }> {
  const res = await apiClient.get(`${BASE_URL}/requests/hr_templates_for_staff/`, { params });
  return res.data;
}

export async function hrApplyRequest(data: {
  staff_user_id: number;
  template_id: number;
  form_data: Record<string, any>;
}): Promise<any> {
  const res = await apiClient.post(`${BASE_URL}/requests/hr_apply_request/`, data);
  return res.data;
}
