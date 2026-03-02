import fetchWithAuth from './fetchAuth'

export type PBASViewer = 'faculty' | 'student'
export type PBASAudience = 'faculty' | 'student' | 'both'
export type PBASInputMode = 'upload' | 'link'

export type PBASCustomDepartment = {
  id: string
  title: string
  accesses: string[]
  department_id?: number
  department_code?: string
  department_short_name?: string
  department_name?: string
  created_at?: string
}

export type PBASNode = {
  id: string
  label: string
  audience: PBASAudience
  input_mode: PBASInputMode
  link?: string | null
  uploaded_name?: string | null
  limit?: number | null
  college_required?: boolean
  position?: number
  children?: PBASNode[]
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

export async function getDepartmentTree(deptId: string): Promise<{ id: string; title: string; nodes: PBASNode[] }> {
  const res = await fetchWithAuth(`/api/pbas/custom-departments/${encodeURIComponent(deptId)}/tree/`)
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
}
