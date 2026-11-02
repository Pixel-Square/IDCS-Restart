import { fetchWithAuth } from './auth'
import {
  PBASCustomDepartment,
  PBASNode,
  PBASDuration,
  PBASApprovalItem,
  PBASSubmission,
} from '../types/pbas'

export async function listCustomDepartments(viewer?: string): Promise<PBASCustomDepartment[]> {
  const url = viewer ? `/api/pbas/custom-departments/?viewer=${viewer}` : '/api/pbas/custom-departments/'
  const res = await fetchWithAuth(url)
  if (!res.ok) throw new Error('Failed to load custom departments')
  return res.json()
}

export async function createCustomDepartment(data: { title: string; accesses?: string[] }): Promise<PBASCustomDepartment> {
  const res = await fetchWithAuth('/api/pbas/custom-departments/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create custom department')
  return res.json()
}

export async function deleteCustomDepartment(id: string): Promise<void> {
  const res = await fetchWithAuth(`/api/pbas/custom-departments/${id}/`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete department')
}

export async function getDepartmentTree(
  deptId: string = '00000000-0000-0000-0000-000000000001',
  viewer?: string
): Promise<{ department_id: string; title: string; nodes: PBASNode[] }> {
  const url = viewer
    ? `/api/pbas/custom-departments/${deptId}/tree/?viewer=${viewer}`
    : `/api/pbas/custom-departments/${deptId}/tree/`
  const res = await fetchWithAuth(url)
  if (!res.ok) throw new Error('Failed to load PBAS tree')
  return res.json()
}

export async function updateDepartmentTree(deptId: string, nodes: any[]): Promise<any> {
  const res = await fetchWithAuth(`/api/pbas/custom-departments/${deptId}/tree/`, {
    method: 'PUT',
    body: JSON.stringify(nodes),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to save PBAS tree')
  }
  return res.json()
}

export async function createSubmission(payload: {
  node: string
  submission_type: 'form' | 'upload' | 'link'
  form_data?: Record<string, any>
  link?: string
  file?: File
}): Promise<PBASSubmission> {
  let body: any
  if (payload.file) {
    const fd = new FormData()
    fd.append('node', payload.node)
    fd.append('submission_type', payload.submission_type)
    if (payload.form_data) {
      fd.append('form_data', JSON.stringify(payload.form_data))
    }
    if (payload.link) fd.append('link', payload.link)
    fd.append('file', payload.file)
    body = fd
  } else {
    body = JSON.stringify({
      node: payload.node,
      submission_type: payload.submission_type,
      form_data: payload.form_data || {},
      link: payload.link || null,
    })
  }

  const res = await fetchWithAuth('/api/pbas/submissions/', {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.node || err.file || err.submission_type || err.detail || 'Submission failed')
  }
  return res.json()
}

export async function fetchMySubmissions(): Promise<PBASSubmission[]> {
  const res = await fetchWithAuth('/api/pbas/submissions/mine/')
  if (!res.ok) throw new Error('Failed to fetch user submissions')
  const data = await res.json()
  return Array.isArray(data) ? data : data.results || []
}

export async function fetchPBASApprovals(tab: string = 'pending'): Promise<PBASApprovalItem[]> {
  const res = await fetchWithAuth(`/api/pbas/submissions/approvals/?tab=${tab}`)
  if (!res.ok) throw new Error('Failed to fetch approval queue')
  return res.json()
}

export async function submitApprovalAction(
  submissionId: string,
  action: 'approve' | 'reject',
  reason?: string
): Promise<{ message: string; status: string }> {
  const res = await fetchWithAuth(`/api/pbas/submissions/${submissionId}/action/`, {
    method: 'POST',
    body: JSON.stringify({ action, reason }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to submit review action')
  }
  return res.json()
}

export async function fetchPBASDurations(): Promise<PBASDuration[]> {
  const res = await fetchWithAuth('/api/pbas/durations/')
  if (!res.ok) throw new Error('Failed to fetch durations')
  const data = await res.json()
  return Array.isArray(data) ? data : data.results || []
}

export async function createPBASDuration(title: string, startDate: string, endDate: string): Promise<PBASDuration> {
  const res = await fetchWithAuth('/api/pbas/durations/', {
    method: 'POST',
    body: JSON.stringify({ title, start_date: startDate, end_date: endDate }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.start_date || err.end_date || err.detail || 'Failed to create duration')
  }
  return res.json()
}

export async function deletePBASDuration(id: string): Promise<void> {
  const res = await fetchWithAuth(`/api/pbas/durations/${id}/`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete duration')
}

export async function fetchApprovalFlow(): Promise<{ staff_flow: string[]; student_flow: string[] }> {
  const res = await fetchWithAuth('/api/pbas/approval-flow/')
  if (!res.ok) throw new Error('Failed to load approval flow')
  return res.json()
}

export async function updateApprovalFlow(staffFlow: string[], studentFlow: string[]): Promise<any> {
  const res = await fetchWithAuth('/api/pbas/approval-flow/', {
    method: 'PUT',
    body: JSON.stringify({ staff_flow: staffFlow, student_flow: studentFlow }),
  })
  if (!res.ok) throw new Error('Failed to update approval flow')
  return res.json()
}

export async function fetchSubmissionLogs(): Promise<any[]> {
  const res = await fetchWithAuth('/api/pbas/submissions/logs/')
  if (!res.ok) throw new Error('Failed to fetch submission logs')
  const data = await res.json()
  return data.results || []
}

export async function fetchUserActivities(): Promise<any[]> {
  const res = await fetchWithAuth('/api/pbas/activity/users/')
  if (!res.ok) throw new Error('Failed to fetch user activities')
  const data = await res.json()
  return data.results || []
}

export async function fetchStaffList(): Promise<any[]> {
  const res = await fetchWithAuth('/api/pbas/staff-list/')
  if (!res.ok) throw new Error('Failed to fetch staff list')
  return res.json()
}

export async function getNodeApprovers(nodeId: string): Promise<any[]> {
  const res = await fetchWithAuth(`/api/pbas/nodes/${nodeId}/approvers/`)
  if (!res.ok) throw new Error('Failed to fetch node approvers')
  return res.json()
}

export async function updateNodeApprovers(nodeId: string, userIds: number[]): Promise<any> {
  const res = await fetchWithAuth(`/api/pbas/nodes/${nodeId}/approvers/`, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  })
  if (!res.ok) throw new Error('Failed to update node approvers')
  return res.json()
}
