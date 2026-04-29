import { apiClient } from './auth';
import { getApiBase } from './apiBase';
import type {
  ApprovedODForm,
  EventAttendingFormDetail,
  EventAttendingFormListItem,
  EventWorkflowRule,
  StaffDeclaration,
  MyEventBudget,
} from '../types/eventAttending';

const BASE = `${getApiBase()}/api/staff-requests/event-attending`;

// ── Staff endpoints ──────────────────────────────────────────────────

export async function fetchApprovedODForms(): Promise<ApprovedODForm[]> {
  const res = await apiClient.get(`${BASE}/approved_od_forms/`);
  return res.data;
}

export async function submitEventForm(formData: FormData): Promise<EventAttendingFormDetail> {
  const res = await apiClient.post(`${BASE}/submit_event_form/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function fetchMyEventForms(): Promise<EventAttendingFormListItem[]> {
  const res = await apiClient.get(`${BASE}/my_event_forms/`);
  return res.data;
}

export async function fetchEventFormDetail(id: number): Promise<EventAttendingFormDetail> {
  const res = await apiClient.get(`${BASE}/${id}/event_form_detail/`);
  return res.data;
}

export async function fetchMyEventBudget(): Promise<MyEventBudget> {
  const res = await apiClient.get(`${BASE}/my_event_budget/`);
  return res.data;
}

// ── Approval endpoints ───────────────────────────────────────────────

export async function fetchPendingEventApprovals(): Promise<any[]> {
  const res = await apiClient.get(`${BASE}/pending_event_approvals/`);
  return res.data;
}

export async function fetchProcessedEventApprovals(): Promise<any[]> {
  const res = await apiClient.get(`${BASE}/processed_event_approvals/`);
  return res.data;
}

export async function processEventApproval(
  id: number,
  action: 'approve' | 'reject',
  comments: string = '',
): Promise<{ message: string; form: EventAttendingFormDetail }> {
  const res = await apiClient.post(`${BASE}/${id}/process_event_approval/`, {
    action,
    comments,
  });
  return res.data;
}

// ── IQAC Workflow Settings ───────────────────────────────────────────

export async function fetchEventWorkflowSettings(): Promise<EventWorkflowRule[]> {
  const res = await apiClient.get(`${BASE}/event_workflow_settings/`);
  return res.data;
}

export async function saveEventWorkflowSettings(
  rules: EventWorkflowRule[],
): Promise<{ message: string }> {
  const res = await apiClient.post(`${BASE}/save_event_workflow_settings/`, { rules });
  return res.data;
}

// ── IQAC Staff Declarations ──────────────────────────────────────────

export async function fetchStaffDeclarations(): Promise<StaffDeclaration[]> {
  const res = await apiClient.get(`${BASE}/staff_declarations/`);
  return res.data;
}

export async function saveStaffDeclaration(
  user_id: number,
  normal_events_budget: number,
  conference_budget: number,
): Promise<StaffDeclaration> {
  const res = await apiClient.post(`${BASE}/save_staff_declaration/`, {
    user_id,
    normal_events_budget,
    conference_budget,
  });
  return res.data;
}

export async function applyAllDeclaration(
  column: 'normal_events_budget' | 'conference_budget',
  value: number,
): Promise<{ message: string }> {
  const res = await apiClient.post(`${BASE}/apply_all_declaration/`, { column, value });
  return res.data;
}
