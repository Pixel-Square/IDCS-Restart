import fetchWithAuth from './fetchAuth'

export type AppAdminOverview = {
  summary: {
    application_types: number
    active_application_types: number
    active_flows: number
    schema_versions: number
    active_schema_versions: number
    submissions: number
    role_permissions: number
  }
  warnings: Array<{ type_id: number; type_name: string; message: string }>
}

export type AppTypeRow = {
  id: number
  name: string
  code: string
  description: string
  is_active: boolean
  field_count: number
  submission_count: number
  active_form_version: number | null
  active_form_version_id: number | null
  has_active_flow: boolean
}

export type AppFieldRow = {
  id: number
  application_type_id: number
  field_key: string
  label: string
  field_type: string
  is_required: boolean
  order: number
  meta: Record<string, any>
}

export type AppVersionRow = {
  id: number
  application_type_id: number
  version: number
  schema: Record<string, any>
  is_active: boolean
  created_at: string
}

export type RoleRow = { id: number; name: string; description?: string }

export type FlowStepRow = {
  id: number
  order: number
  role_id: number | null
  role_name: string | null
  stage_id: number | null
  stage_name: string | null
  sla_hours: number | null
  escalate_to_role_id: number | null
  escalate_to_role_name: string | null
  is_final: boolean
  can_override: boolean
  auto_skip_if_unavailable: boolean
}

export type FlowRow = {
  id: number
  application_type_id: number
  department_id: number | null
  department_name: string | null
  is_active: boolean
  sla_hours: number | null
  override_roles: Array<{ id: number; name: string }>
  steps: FlowStepRow[]
}

export type RolePermissionRow = {
  id: number
  role_id: number
  role_name: string | null
  can_edit_all: boolean
  can_override_flow: boolean
}

export type RoleHierarchyRow = {
  id: number
  role_id: number
  role_name: string | null
  rank: number
}

export type RoleHierarchyStageRoleRow = {
  id: number
  role_id: number
  role_name: string | null
  rank: number
}

export type RoleHierarchyStageUserRow = {
  id: number
  user_id: number
  username: string | null
  name: string | null
}

export type RoleHierarchyStageRow = {
  id: number
  name: string
  order: number
  roles: RoleHierarchyStageRoleRow[]
  users: RoleHierarchyStageUserRow[]
}

export type AdminUserSearchRow = {
  user_id: number
  username: string | null
  email: string | null
  name: string | null
  mobile_no: string | null
  reg_no: string | null
  staff_id: string | null
  profile_type: 'STUDENT' | 'STAFF' | null
}

export type SubmissionRow = {
  id: number
  application_type_id: number
  application_type_name: string | null
  applicant_username: string | null
  current_state: string
  status: string
  current_step_role: string | null
  attachments_count: number
  history_count: number
  submitted_at: string | null
  created_at: string
}

export type DepartmentRow = { id: number; code?: string | null; name?: string | null; short_name?: string | null }

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

export async function fetchApplicationsAdminOverview(): Promise<AppAdminOverview> {
  return parseJson(await fetchWithAuth('/api/applications/admin/overview/'))
}

export async function fetchApplicationsAdminRoles(): Promise<RoleRow[]> {
  return parseJson(await fetchWithAuth('/api/applications/admin/roles/'))
}

export async function fetchApplicationTypesAdmin(): Promise<AppTypeRow[]> {
  return parseJson(await fetchWithAuth('/api/applications/admin/types/'))
}

export async function createApplicationTypeAdmin(payload: Partial<AppTypeRow>): Promise<AppTypeRow> {
  return parseJson(await fetchWithAuth('/api/applications/admin/types/', { method: 'POST', body: JSON.stringify(payload) }))
}

export async function updateApplicationTypeAdmin(id: number, payload: Partial<AppTypeRow>): Promise<AppTypeRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(id))}/`, { method: 'PATCH', body: JSON.stringify(payload) }))
}

export async function fetchApplicationFieldsAdmin(typeId: number): Promise<AppFieldRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/fields/`))
}

export async function createApplicationFieldAdmin(typeId: number, payload: Partial<AppFieldRow>): Promise<AppFieldRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/fields/`, { method: 'POST', body: JSON.stringify(payload) }))
}

export async function updateApplicationFieldAdmin(id: number, payload: Partial<AppFieldRow>): Promise<AppFieldRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/fields/${encodeURIComponent(String(id))}/`, { method: 'PATCH', body: JSON.stringify(payload) }))
}

export async function deleteApplicationFieldAdmin(id: number): Promise<void> {
  const res = await fetchWithAuth(`/api/applications/admin/fields/${encodeURIComponent(String(id))}/`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text() || 'Failed to delete field')
}

export async function reorderApplicationFieldsAdmin(typeId: number, fieldIds: number[]): Promise<AppFieldRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/fields/reorder/`, { method: 'POST', body: JSON.stringify({ field_ids: fieldIds }) }))
}

export async function fetchApplicationVersionsAdmin(typeId: number): Promise<AppVersionRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/versions/`))
}

export async function createApplicationVersionAdmin(typeId: number): Promise<AppVersionRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/versions/`, { method: 'POST', body: JSON.stringify({}) }))
}

export async function activateApplicationVersionAdmin(id: number): Promise<AppVersionRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/versions/${encodeURIComponent(String(id))}/activate/`, { method: 'POST', body: JSON.stringify({}) }))
}

export async function fetchApplicationFlowsAdmin(typeId: number): Promise<FlowRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/flows/`))
}

export async function createApplicationFlowAdmin(typeId: number, payload: { department_id?: number | null; is_active?: boolean; override_role_ids?: number[] }): Promise<FlowRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/flows/`, { method: 'POST', body: JSON.stringify(payload) }))
}

export async function updateApplicationFlowAdmin(id: number, payload: { is_active?: boolean; override_role_ids?: number[]; sla_hours?: number | null }): Promise<FlowRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/flows/${encodeURIComponent(String(id))}/`, { method: 'PATCH', body: JSON.stringify(payload) }))
}

export async function fetchApplicationStepsAdmin(flowId: number): Promise<FlowStepRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/flows/${encodeURIComponent(String(flowId))}/steps/`))
}

export async function createApplicationStepAdmin(flowId: number, payload: Partial<FlowStepRow>): Promise<FlowStepRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/flows/${encodeURIComponent(String(flowId))}/steps/`, { method: 'POST', body: JSON.stringify(payload) }))
}

export async function updateApplicationStepAdmin(id: number, payload: Partial<FlowStepRow>): Promise<FlowStepRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/steps/${encodeURIComponent(String(id))}/`, { method: 'PATCH', body: JSON.stringify(payload) }))
}

export async function deleteApplicationStepAdmin(id: number): Promise<void> {
  const res = await fetchWithAuth(`/api/applications/admin/steps/${encodeURIComponent(String(id))}/`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text() || 'Failed to delete step')
}

export async function fetchApplicationRolePermissionsAdmin(typeId: number): Promise<RolePermissionRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/role-permissions/`))
}

export async function saveApplicationRolePermissionsAdmin(typeId: number, items: Array<{ role_id: number; can_edit_all: boolean; can_override_flow: boolean }>): Promise<RolePermissionRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/role-permissions/`, { method: 'PUT', body: JSON.stringify({ items }) }))
}

export async function fetchApplicationRoleHierarchyAdmin(typeId: number): Promise<RoleHierarchyRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/role-hierarchy/`))
}

export async function saveApplicationRoleHierarchyAdmin(typeId: number, items: Array<{ role_id: number; rank: number }>): Promise<RoleHierarchyRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/role-hierarchy/`, { method: 'PUT', body: JSON.stringify({ items }) }))
}

export async function fetchApplicationRoleHierarchyStagesAdmin(typeId: number): Promise<RoleHierarchyStageRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/role-hierarchy-stages/`))
}

export async function saveApplicationRoleHierarchyStagesAdmin(
  typeId: number,
  items: Array<{
    id?: number
    name: string
    order: number
    roles: Array<{ role_id: number; rank: number }>
    users: Array<{ user_id?: number; username?: string }>
  }>
): Promise<RoleHierarchyStageRow[]> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/role-hierarchy-stages/`, { method: 'PUT', body: JSON.stringify({ items }) }))
}

export async function searchApplicationsAdminUsers(q: string): Promise<AdminUserSearchRow[]> {
  const query = `?q=${encodeURIComponent(String(q || ''))}`
  return parseJson(await fetchWithAuth(`/api/applications/admin/users/search/${query}`))
}

export async function fetchApplicationSubmissionsAdmin(typeId?: number | null): Promise<SubmissionRow[]> {
  const query = typeId ? `?application_type_id=${encodeURIComponent(String(typeId))}` : ''
  return parseJson(await fetchWithAuth(`/api/applications/admin/submissions/${query}`))
}

export async function fetchDepartmentsAdmin(): Promise<DepartmentRow[]> {
  const json = await parseJson<{ results?: DepartmentRow[] }>(await fetchWithAuth('/api/academics/departments/'))
  return Array.isArray(json?.results) ? json.results : []
}

// ─── Notification Settings ─────────────────────────────────────────────────

export type NotificationSettingsRow = {
  id: number
  application_type_id: number
  notify_on_submit: boolean
  submit_template: string
  notify_on_status_change: boolean
  approve_template: string
  reject_template: string
  notify_on_forward: boolean
  forward_approver_template: string
  forward_applicant_template: string
  notify_on_cancel: boolean
  cancel_template: string
  updated_at: string
}

export async function fetchApplicationNotificationSettings(typeId: number): Promise<NotificationSettingsRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/notification-settings/`))
}

export async function updateApplicationNotificationSettings(typeId: number, payload: Partial<NotificationSettingsRow>): Promise<NotificationSettingsRow> {
  return parseJson(await fetchWithAuth(`/api/applications/admin/types/${encodeURIComponent(String(typeId))}/notification-settings/`, { method: 'PUT', body: JSON.stringify(payload) }))
}