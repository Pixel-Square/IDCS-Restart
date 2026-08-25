import fetchWithAuth from './fetchAuth'

export type PBASViewer = 'faculty' | 'student'
export type PBASAudience = 'faculty' | 'student' | 'both'
export type PBASInputMode = 'upload' | 'link'

export type PBASFormFieldType = 'short_text' | 'long_text' | 'dropdown' | 'checkboxes' | 'file_upload'

export type PBASFormField = {
  id: string
  label: string
  field_type: PBASFormFieldType
  required?: boolean
  options?: string[]
  placeholder?: string
}

export type PBASCustomDepartment = {
  id: string
  title: string
  accesses: string[]
  department_id?: number
  department_code?: string
  department_short_name?: string
  department_name?: string
  show_in_submission?: boolean
  created_at?: string
}

export type PBASNode = {
  id: string
  label: string
  audience: PBASAudience
  input_mode?: PBASInputMode
  form_schema?: PBASFormField[]
  pbas_credit?: number | null
  link?: string | null
  uploaded_name?: string | null
  limit?: number | null
  college_required?: boolean
  position?: number
  approvers?: { id: number; username: string; name: string }[]
  children?: PBASNode[]
}

export type StaffMember = {
  user_id: number
  name: string
  username: string
  staff_id: string
  department_name: string
  profile_image?: string | null
}

export type PBASApprovalItem = {
  id: string
  user: {
    id: number
    name: string
    reg_or_staff_id: string
    username: string
    profile_image?: string | null
  }
  leaf_title: string
  parent_path: string
  submission_type: 'form' | 'upload' | 'link'
  form_data?: Record<string, any>
  form_schema?: PBASFormField[]
  link?: string | null
  file_url?: string | null
  file_name?: string | null
  pbas_credit: number
  status: 'pending' | 'approved' | 'rejected'
  created_at?: string | null
  reviewed_at?: string | null
  approved_by_name?: string | null
  rejection_reason?: string
}

export type College = {
  id: number
  code?: string | null
  name?: string | null
}

export type PBASSubmissionReport = {
  submission: {
    id: string
    created_at?: string
    submission_type: 'upload' | 'link'
    link?: string | null
    file_url?: string | null
    file_name?: string | null
    college?: College | null
    node: { id: string; label: string; input_mode: PBASInputMode }
  }
  department: {
    id: string
    title: string
    department_id?: number | null
    department_code?: string | null
    department_short_name?: string | null
    department_name?: string | null
    accesses: string[]
    access_staffs: Array<{ id?: number; staff_id?: string; username?: string; email?: string }>
  }
  student: { id?: number | null; reg_no?: string | null; username?: string | null; email?: string | null }
  mentor?: { id?: number; staff_id?: string | null; username?: string | null; email?: string | null }
  ticket?: { id: string; status: 'draft' | 'mentor_pending' | 'dept_pending' } | null
}

export type PBASVerifierTicketItem = {
  id: string
  status: 'draft' | 'mentor_pending' | 'dept_pending'
  created_at?: string
  report: PBASSubmissionReport
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.clone().json()
    if (data?.detail) return String(data.detail)
    return JSON.stringify(data)
  } catch {
    try {
      return await res.clone().text()
    } catch {
      return `HTTP ${res.status}`
    }
  }
}

export async function listCustomDepartments(viewer: PBASViewer): Promise<PBASCustomDepartment[]> {
  const res = await fetchWithAuth(`/api/pbas/custom-departments/?viewer=${encodeURIComponent(viewer)}`)
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return Array.isArray(data?.results) ? data.results : data
}

export async function createCustomDepartment(payload: { title: string; accesses: string[] }): Promise<PBASCustomDepartment> {
  const res = await fetchWithAuth('/api/pbas/custom-departments/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export async function patchCustomDepartment(
  deptId: string,
  payload: Partial<{ title: string; accesses: string[] }>,
): Promise<PBASCustomDepartment> {
  const res = await fetchWithAuth(`/api/pbas/custom-departments/${encodeURIComponent(deptId)}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export async function deleteCustomDepartment(deptId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/pbas/custom-departments/${encodeURIComponent(deptId)}/`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function getDepartmentNodes(deptId: string, viewer: PBASViewer): Promise<PBASNode[]> {
  const res = await fetchWithAuth(
    `/api/pbas/custom-departments/${encodeURIComponent(deptId)}/nodes/?viewer=${encodeURIComponent(viewer)}`,
  )
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data?.nodes || []
}

export async function getDepartmentTree(
  deptId: string,
  viewer?: PBASViewer,
): Promise<{ id: string; title: string; nodes: PBASNode[] }> {
  const query = viewer ? `?viewer=${encodeURIComponent(viewer)}` : ''
  const res = await fetchWithAuth(`/api/pbas/custom-departments/${encodeURIComponent(deptId)}/tree/${query}`)
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export async function updateDepartmentTree(deptId: string, nodes: any[]): Promise<{ nodes: PBASNode[] }> {
  const res = await fetchWithAuth(`/api/pbas/custom-departments/${encodeURIComponent(deptId)}/tree/`, {
    method: 'PUT',
    body: JSON.stringify({ nodes }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export async function listColleges(): Promise<College[]> {
  const res = await fetchWithAuth('/api/pbas/colleges/')
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return Array.isArray(data?.results) ? data.results : data
}

export async function createSubmissionForm(payload: {
  node: string
  formData: Record<string, any>
  file?: File | null
  college?: number | null
}): Promise<any> {
  const fd = new FormData()
  fd.append('node', payload.node)
  fd.append('submission_type', 'form')
  fd.append('form_data', JSON.stringify(payload.formData || {}))
  if (payload.file) {
    fd.append('file', payload.file)
  }
  if (payload.college != null) fd.append('college', String(payload.college))

  const res = await fetchWithAuth('/api/pbas/submissions/', {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export async function createSubmissionLink(payload: {
  node: string
  link: string
  college?: number | null
}): Promise<any> {
  const res = await fetchWithAuth('/api/pbas/submissions/', {
    method: 'POST',
    body: JSON.stringify({
      node: payload.node,
      submission_type: 'link',
      link: payload.link,
      college: payload.college ?? null,
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export async function createSubmissionUpload(payload: {
  node: string
  file: File
  college?: number | null
}): Promise<any> {
  const fd = new FormData()
  fd.append('node', payload.node)
  fd.append('submission_type', 'upload')
  fd.append('file', payload.file)
  if (payload.college != null) fd.append('college', String(payload.college))

  const res = await fetchWithAuth('/api/pbas/submissions/', {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export async function getSubmissionReport(submissionId: string): Promise<PBASSubmissionReport> {
  const res = await fetchWithAuth(`/api/pbas/submissions/${encodeURIComponent(submissionId)}/report/`)
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export async function listMyVerifierTickets(): Promise<PBASVerifierTicketItem[]> {
  const res = await fetchWithAuth('/api/pbas/verifier-tickets/my/')
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return Array.isArray(data?.results) ? data.results : []
}

export async function forwardTicketToMentor(ticketId: string): Promise<{ id: string; status: string }> {
  const res = await fetchWithAuth(`/api/pbas/verifier-tickets/${encodeURIComponent(ticketId)}/forward-to-mentor/`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export async function forwardTicketToDepartment(ticketId: string): Promise<{ id: string; status: string }> {
  const res = await fetchWithAuth(`/api/pbas/verifier-tickets/${encodeURIComponent(ticketId)}/forward-to-department/`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export const PBAS_TREE_STORAGE_KEY = 'pbas_tree_data'

export function getStoredPBASTree(): PBASNode[] {
  try {
    const raw = localStorage.getItem(PBAS_TREE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    console.error('Failed to load pbas_tree_data from localStorage:', e)
  }
  return []
}

export function saveStoredPBASTree(tree: PBASNode[]): void {
  try {
    localStorage.setItem(PBAS_TREE_STORAGE_KEY, JSON.stringify(tree))
    window.dispatchEvent(new CustomEvent('idcs:pbas-tree-updated', { detail: tree }))
  } catch (e) {
    console.error('Failed to save pbas_tree_data to localStorage:', e)
  }
}

export async function fetchStaffList(params?: { search?: string; department?: string }): Promise<StaffMember[]> {
  const query = new URLSearchParams()
  if (params?.search) query.append('search', params.search)
  if (params?.department) query.append('department', params.department)

  const res = await fetchWithAuth(`/api/pbas/staff-list/?${query.toString()}`)
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.staff || []
}

export type PBASApproverHistoryItem = {
  id: string
  user_id: number
  user_name: string
  user_username: string
  action: 'assigned' | 'removed'
  changed_by_id?: number | null
  changed_by_name?: string | null
  timestamp?: string | null
}

export async function getNodeApprovers(nodeId: string): Promise<{
  approvers: { id: number; name: string; username: string }[]
  history?: PBASApproverHistoryItem[]
}> {
  const res = await fetchWithAuth(`/api/pbas/nodes/${encodeURIComponent(nodeId)}/approvers/`)
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return { approvers: data.approvers || [], history: data.history || [] }
}

export async function updateNodeApprovers(nodeId: string, approverIds: number[]): Promise<{ id: number; name: string; username: string }[]> {
  const res = await fetchWithAuth(`/api/pbas/nodes/${encodeURIComponent(nodeId)}/approvers/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approver_ids: approverIds }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.approvers || []
}

export async function fetchPBASApprovals(status: string = 'pending'): Promise<PBASApprovalItem[]> {
  const res = await fetchWithAuth(`/api/pbas/submissions/approvals/?status=${encodeURIComponent(status)}`)
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.submissions || []
}

export async function submitApprovalAction(
  submissionId: string,
  action: 'approve' | 'reject',
  reason?: string
): Promise<{ status: string; detail: string }> {
  const res = await fetchWithAuth(`/api/pbas/submissions/${encodeURIComponent(submissionId)}/action/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reason }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return await res.json()
}

export default {
  listCustomDepartments,
  createCustomDepartment,
  patchCustomDepartment,
  deleteCustomDepartment,
  getDepartmentNodes,
  getDepartmentTree,
  updateDepartmentTree,
  listColleges,
  createSubmissionLink,
  createSubmissionUpload,
  getSubmissionReport,
  listMyVerifierTickets,
  forwardTicketToMentor,
  forwardTicketToDepartment,
  fetchStaffList,
  getNodeApprovers,
  updateNodeApprovers,
  fetchPBASApprovals,
  submitApprovalAction,
  getStoredPBASTree,
  saveStoredPBASTree,
}

