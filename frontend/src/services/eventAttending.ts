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

// ── IQAC Budget Conditions ──────────────────────────────────────────

import type {
  EventBudgetCondition,
  AcademicCalendarInfo,
  ConditionExpiryStatus,
} from '../types/eventAttending';

export async function fetchEventBudgetConditions(): Promise<EventBudgetCondition[]> {
  const res = await apiClient.get(`${BASE}/event_budget_conditions/`);
  return res.data;
}

export async function saveEventBudgetConditions(
  conditions: EventBudgetCondition[]
): Promise<{ message: string; conditions: EventBudgetCondition[] }> {
  const res = await apiClient.post(`${BASE}/save_event_budget_conditions/`, { conditions });
  return res.data;
}

export async function fetchActiveAcademicCalendar(): Promise<AcademicCalendarInfo> {
  const res = await apiClient.get(`${BASE}/active_academic_calendar/`);
  return res.data;
}

export async function checkConditionExpiry(): Promise<ConditionExpiryStatus> {
  const res = await apiClient.get(`${BASE}/check_condition_expiry/`);
  return res.data;
}

// ── Dynamic Approver Role Check ─────────────────────────────────────

export async function fetchMyEventApproverRoles(): Promise<{ roles: string[]; is_approver: boolean }> {
  const res = await apiClient.get(`${BASE}/my_event_approver_roles/`);
  return res.data;
}

// ── IQAC Analytics ──────────────────────────────────────────────────

export interface EventAnalyticsRow {
  id: number;
  staff_name: string;
  department: string;
  od_type: string;
  grand_total: number;
  approved_at: string;
}

export interface EventAnalyticsResponse {
  forms: EventAnalyticsRow[];
  total_count: number;
  total_amount: number;
  departments: { id: number; name: string; short_name: string }[];
}

export async function fetchEventAnalytics(params: {
  department?: string;
  from_date?: string;
  to_date?: string;
}): Promise<EventAnalyticsResponse> {
  const p = new URLSearchParams();
  if (params.department) p.set('department', params.department);
  if (params.from_date) p.set('from_date', params.from_date);
  if (params.to_date) p.set('to_date', params.to_date);
  const res = await apiClient.get(`${BASE}/event_analytics/?${p.toString()}`);
  return res.data;
}

export function getEventAnalyticsExcelUrl(params: {
  department?: string;
  from_date?: string;
  to_date?: string;
}): string {
  const p = new URLSearchParams({ export: 'excel' });
  if (params.department) p.set('department', params.department);
  if (params.from_date) p.set('from_date', params.from_date);
  if (params.to_date) p.set('to_date', params.to_date);
  return `${BASE}/event_analytics/?${p.toString()}`;
}
