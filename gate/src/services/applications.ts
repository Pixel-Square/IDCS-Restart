import { apiClient } from './auth'

async function unwrap<T>(promise: Promise<{ data: T }>): Promise<T> {
  const res = await promise
  return res.data
}

export type ApplicationsNavRole = {
  code: string
  department_id: number | null
  department_name: string | null
}

export type ApplicationsNavResponse = {
  show_applications: boolean
  staff_roles: ApplicationsNavRole[]
  staff_department: { id: number | null; name: string | null } | null
  override_roles: string[]
}

export type ApplicationTypeListItem = {
  id: number
  name: string
  code: string
  description: string
}

export type ApplicationField = {
  id: number
  field_key: string
  label: string
  field_type: 'TEXT' | 'DATE' | 'TIME' | 'DATE IN OUT' | 'DATE OUT IN' | 'BOOLEAN' | 'FILE' | 'NUMBER' | 'SELECT'
  is_required: boolean
  order: number
  meta: Record<string, unknown>
}

export type ApplicationTypeSchema = {
  id: number
  name: string
  code: string
  description: string
  fields: ApplicationField[]
}

export type MyApplicationItem = {
  id: number
  application_type_name: string
  application_type_code: string | null
  current_state: string
  status: string
  submitted_at: string | null
  created_at: string
  current_step_role: string | null
  gatepass_scanned_at: string | null
  gatepass_in_scanned_at?: string | null
  needs_gatepass_scan: boolean
  sla_deadline: string | null
  time_window_active?: boolean
  gatepass_window_start?: string | null
  gatepass_window_end?: string | null
  gatepass_expired?: boolean
}

export type ApproverInboxItem = {
  application_id: number
  application_type: string
  applicant_name: string
  applicant_roll_or_staff_id: string | null
  applicant_kind?: 'STUDENT' | 'STAFF' | null
  department_name: string | null
  current_step_role: string | null
  submitted_at: string
  current_state: string
  applicant_profile_image?: string | null
}

export type PastApprovalItem = {
  application_id: number
  application_type: string
  applicant_name: string
  applicant_profile_image?: string | null
  applicant_roll_or_staff_id: string | null
  applicant_kind?: 'STUDENT' | 'STAFF' | null
  department_name: string | null
  current_state: string
  decision?: 'APPROVED' | 'REJECTED' | 'SKIPPED' | null
  decision_at?: string | null
  submitted_at: string | null
  final_decision_at: string | null
  gatepass_scanned_at: string | null
  gatepass_scanned_by: string | null
}

export type ForwardedTo = {
  role_name: string
  step_order: number
  is_final: boolean
  assignees: Array<{ id: number; name: string; username: string; staff_id?: string }>
}

export type SubmitApplicationResponse = {
  id: number
  current_state: string
  forwarded_to: ForwardedTo | null
}

export class ActiveApplicationError extends Error {
  activeApplicationId: number
  activeApplicationState: string
  constructor(detail: string, id: number, state: string) {
    super(detail)
    this.name = 'ActiveApplicationError'
    this.activeApplicationId = id
    this.activeApplicationState = state
  }
}

export type ApplicationDetail = {
  id: number
  application_type: string
  current_state: string
  status: string
  submitted_at: string | null
  created_at: string
  current_step: string | null
  dynamic_fields: Array<{ label: string; field_key: string; field_type?: string; value: unknown }>
  approval_history: Array<{ id: number; step_role: string | null; action: string; acted_by: string; acted_at: string; remarks: string }>
  approval_timeline: Array<{ step_order: number; step_role: string | null; is_starter: boolean; is_final: boolean; status: string; acted_by: string | null; acted_at: string | null; remarks: string | null }>
  sla_hours: number | null
  sla_deadline: string | null
  gatepass_scanned_at: string | null
  gatepass_in_scanned_at?: string | null
  time_window_active?: boolean
  gatepass_window_start?: string | null
  gatepass_window_end?: string | null
  gatepass_expired?: boolean
}

export async function fetchApplicationsNav(): Promise<ApplicationsNavResponse> {
  return unwrap(apiClient.get('/api/applications/nav/'))
}

export async function fetchApplicationTypes(): Promise<ApplicationTypeListItem[]> {
  return unwrap(apiClient.get('/api/applications/types/'))
}

export async function fetchApplicationTypeSchema(id: number): Promise<ApplicationTypeSchema> {
  return unwrap(apiClient.get(`/api/applications/types/${id}/schema/`))
}

export async function fetchMyApplications(): Promise<MyApplicationItem[]> {
  return unwrap(apiClient.get('/api/applications/my/'))
}

export async function fetchApplicationDetail(id: number): Promise<ApplicationDetail> {
  return unwrap(apiClient.get(`/api/applications/${id}/`))
}

export async function cancelApplication(id: number): Promise<{ id: number; current_state: string; status: string }> {
  return unwrap(apiClient.post(`/api/applications/${id}/cancel/`, {}))
}

export async function fetchApproverInbox(): Promise<ApproverInboxItem[]> {
  return unwrap(apiClient.get('/api/applications/inbox/'))
}

export async function fetchPastApprovals(): Promise<PastApprovalItem[]> {
  return unwrap(apiClient.get('/api/applications/past-approvals/'))
}

export async function submitApplicationAction(id: number, action: 'FORWARD' | 'REJECT', remarks = ''): Promise<{ id: number; current_state: string }> {
  return unwrap(apiClient.post(`/api/applications/${id}/action/`, { action, remarks }))
}

export async function createAndSubmitApplication(application_type_id: number, data: Record<string, unknown>): Promise<SubmitApplicationResponse> {
  const res = await apiClient.post('/api/applications/create-and-submit/', { application_type_id, data })
  return res.data as SubmitApplicationResponse
}
