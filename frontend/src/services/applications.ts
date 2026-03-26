import fetchWithAuth from './fetchAuth'

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

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    let detail = text || `HTTP ${res.status}`
    try {
      const json = text ? JSON.parse(text) : null
      detail = json?.detail || json?.errors?.code || json?.errors?.name || detail
    } catch (_) {}
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export async function fetchApplicationsNav(): Promise<ApplicationsNavResponse> {
  return parseJson(await fetchWithAuth('/api/applications/nav/'))
}

export async function fetchApproverInbox(): Promise<ApproverInboxItem[]> {
  return parseJson(await fetchWithAuth('/api/applications/inbox/'))
}

// ─── Application Types ───────────────────────────────────────────────────────

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

export async function fetchApplicationTypes(): Promise<ApplicationTypeListItem[]> {
  return parseJson(await fetchWithAuth('/api/applications/types/'))
}

export async function fetchApplicationTypeSchema(id: number): Promise<ApplicationTypeSchema> {
  return parseJson(await fetchWithAuth(`/api/applications/types/${id}/schema/`))
}

// ─── Submission ───────────────────────────────────────────────────────────────

export type AssigneeInfo = { id: number; name: string; username: string; staff_id?: string }

export type ForwardedTo = {
  role_name: string
  step_order: number
  is_final: boolean
  assignees: AssigneeInfo[]
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

export async function createAndSubmitApplication(
  application_type_id: number,
  data: Record<string, unknown>,
): Promise<SubmitApplicationResponse> {
  const res = await fetchWithAuth('/api/applications/create-and-submit/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ application_type_id, data }),
  })
  if (res.status === 409) {
    const json = await res.json().catch(() => ({}))
    throw new ActiveApplicationError(
      json.detail || 'You already have an active application of this type.',
      json.active_application_id ?? 0,
      json.active_application_state ?? '',
    )
  }
  return parseJson(res)
}

// ─── My Applications ─────────────────────────────────────────────────────────

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

export async function fetchMyApplications(): Promise<MyApplicationItem[]> {
  return parseJson(await fetchWithAuth('/api/applications/my/'))
}

// ─── Application Detail ───────────────────────────────────────────────────────

export type DynamicFieldValue = {
  label: string
  field_key: string
  field_type?: 'TEXT' | 'DATE' | 'TIME' | 'DATE IN OUT' | 'DATE OUT IN' | 'BOOLEAN' | 'FILE' | 'NUMBER' | 'SELECT'
  value: unknown
}

export type ApprovalHistoryEntry = {
  id: number
  step_role: string | null
  action: string
  acted_by: string
  acted_at: string
  remarks: string
}

export type ApprovalTimelineEntry = {
  step_order: number
  step_role: string | null
  is_starter: boolean
  is_final: boolean
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SKIPPED' | 'PENDING'
  acted_by: string | null
  acted_at: string | null
  remarks: string | null
}

export type ApplicationDetail = {
  id: number
  application_type: string
  current_state: string
  status: string
  submitted_at: string | null
  created_at: string
  current_step: string | null
  dynamic_fields: DynamicFieldValue[]
  approval_history: ApprovalHistoryEntry[]
  approval_timeline: ApprovalTimelineEntry[]
  sla_hours: number | null
  sla_deadline: string | null
  gatepass_scanned_at: string | null
  gatepass_in_scanned_at?: string | null
  time_window_active?: boolean
  gatepass_window_start?: string | null
  gatepass_window_end?: string | null
  gatepass_expired?: boolean
}

export async function fetchApplicationDetail(id: number): Promise<ApplicationDetail> {
  return parseJson(await fetchWithAuth(`/api/applications/${id}/`))
}

export async function cancelApplication(id: number): Promise<{ id: number; current_state: string; status: string }> {
  return parseJson(
    await fetchWithAuth(`/api/applications/${id}/cancel/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  )
}

// ─── Step Info (for approvers) ────────────────────────────────────────────────

export type StepDetail = { order: number; role_name: string; is_final?: boolean }

export type StepInfoResponse = {
  can_act: boolean
  current_step: StepDetail | null
  next_step: StepDetail | null
  is_final_step: boolean
  forward_label: string
  current_state: string
}

export async function fetchApplicationStepInfo(id: number): Promise<StepInfoResponse> {
  return parseJson(await fetchWithAuth(`/api/applications/${id}/step-info/`))
}

// ─── Approver Action ─────────────────────────────────────────────────────────

export type ActionResponse = {
  id: number
  current_state: string
  forwarded_to: ForwardedTo | null
}

export async function submitApplicationAction(
  id: number,
  action: 'FORWARD' | 'REJECT',
  remarks: string = '',
): Promise<ActionResponse> {
  return parseJson(
    await fetchWithAuth(`/api/applications/${id}/action/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, remarks }),
    }),
  )
}

// ─── Past Approvals (approver history with gatepass exit info) ────────────────

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

export async function fetchPastApprovals(): Promise<PastApprovalItem[]> {
  return parseJson(await fetchWithAuth('/api/applications/past-approvals/'))
}

// ─── Cooldown error shape returned by the API (HTTP 429) ────────────────────

export type CooldownError = {
  cooldown: true
  cooldown_until: string
  cooldown_remaining_seconds: number
  detail: string
}
