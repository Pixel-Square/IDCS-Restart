import fetchWithAuth from './fetchAuth'

export type AuditDepartment = {
  id: number
  code: string
  name: string
  short_name?: string
}

export type AuditStaff = {
  id: number
  staff_id: string
  name: string
  username?: string
  designation?: string
  department?: AuditDepartment | null
}

export type AuditQuestion = {
  id: number
  sl_no: number
  details: string
  documents_checklist?: string
  detailed_description?: string
  max_marks: string
  is_active: boolean
}

export type AuditQuestionSet = {
  id: number
  name: string
  description?: string
  question_ids: number[]
  question_count: number
  questions_detail: AuditQuestion[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AuditRubric = {
  id: number
  name: string
  file: string
  file_url: string | null
  uploaded_by?: number | null
  uploaded_by_name?: string
  uploaded_at: string
  is_active: boolean
}

export type AuditCycle = {
  id: number
  cycle: number
  name: string
  label: string
  is_active: boolean
  assignment_count?: number
}

export type AuditAssignment = {
  id: number
  cycle: number
  cycle_number: number
  cycle_label: string
  department: number
  department_code: string
  department_name: string
  department_short_name?: string
  auditors: { id: number; staff_id: string; name: string; designation?: string }[]
  assigned_by?: number | null
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED'
  remarks?: string
  created_at?: string
  updated_at?: string
  total_marks?: number
  max_marks?: number
  percentage?: number
  below_60_count?: number
  can_view?: boolean
  question_set_id?: number | null
  question_set_name?: string | null
}

export type AuditQuestionRow = {
  question_id: number
  sl_no: number
  details: string
  documents_checklist?: string
  detailed_description?: string
  max_marks: string
  marks: string | null
  comments: string
  below_60: boolean
  atr_action_taken?: string
  atr_status?: string
  score_updated_at?: string | null
  atr_submitted_at?: string | null
}

export type AuditAssignmentDetail = AuditAssignment & {
  questions: AuditQuestionRow[]
  is_auditor: boolean
  is_hod: boolean
  is_iqac?: boolean
  can_edit?: boolean
}

export type AuditReport = {
  assignment_id: number
  cycle: number
  cycle_label: string
  department: AuditDepartment
  auditors: { staff_id: string; name: string; designation?: string }[]
  status: string
  remarks?: string
  total_marks: number
  max_marks: number
  percentage: number
  below_60_count: number
  marks_submitted_on?: string | null
  atr_submitted_on?: string | null
  questions: AuditQuestionRow[]
}

export type AuditATRRow = {
  question_id: number
  sl_no: number
  details: string
  max_marks: string
  marks: string | null
  comments: string
  action_taken: string
  status: string
  submitted_at?: string | null
}

export type AuditConsolidated = {
  cycle_id: number
  cycle: number
  label: string
  departments: {
    assignment_id: number
    department_id: number
    department_code: string
    department_name: string
    department_short_name?: string
    status: string
    auditors: { id?: number; staff_id: string; name: string }[]
    total_marks: number
    max_marks: number
    percentage: number
    below_60_count: number
    atr_submitted: number
    atr_pending: number
  }[]
}

async function parseResults<T>(res: Response): Promise<T[]> {
  if (!res.ok) return []
  try {
    const data = await res.json()
    return data.results || data || []
  } catch {
    return []
  }
}

export async function fetchAuditDepartments(): Promise<AuditDepartment[]> {
  return parseResults<AuditDepartment>(await fetchWithAuth('/api/audits/departments/'))
}

export async function fetchAuditStaff(params?: {
  staff_id?: string
  department_id?: number
  q?: string
}): Promise<AuditStaff[]> {
  const qs = new URLSearchParams()
  if (params?.staff_id) qs.set('staff_id', params.staff_id)
  if (params?.department_id) qs.set('department_id', String(params.department_id))
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return parseResults<AuditStaff>(await fetchWithAuth(`/api/audits/staff/${suffix}`))
}

export async function fetchAuditQuestions(): Promise<AuditQuestion[]> {
  return parseResults<AuditQuestion>(await fetchWithAuth('/api/audits/questions/'))
}

export type AuditQuestionPayload = {
  sl_no: number
  details: string
  documents_checklist?: string
  detailed_description?: string
  max_marks?: string | number
  is_active?: boolean
}

export async function createAuditQuestion(payload: AuditQuestionPayload): Promise<AuditQuestion> {
  const res = await fetchWithAuth('/api/audits/questions/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Failed to create question')
  return data
}

export async function updateAuditQuestion(id: number, payload: Partial<AuditQuestionPayload>): Promise<AuditQuestion> {
  const res = await fetchWithAuth(`/api/audits/questions/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Failed to update question')
  return data
}

export async function deleteAuditQuestion(id: number): Promise<void> {
  const res = await fetchWithAuth(`/api/audits/questions/${id}/`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Failed to delete question')
  }
}

// ── Question Sets ────────────────────────────────────────────────────────────

export async function fetchAuditQuestionSets(): Promise<AuditQuestionSet[]> {
  return parseResults<AuditQuestionSet>(await fetchWithAuth('/api/audits/question-sets/'))
}

export async function createAuditQuestionSet(payload: {
  name: string
  description?: string
  question_ids?: number[]
}): Promise<AuditQuestionSet> {
  const res = await fetchWithAuth('/api/audits/question-sets/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.name?.[0] || 'Failed to create question set')
  return data
}

export async function updateAuditQuestionSet(id: number, payload: {
  name?: string
  description?: string
  question_ids?: number[]
}): Promise<AuditQuestionSet> {
  const res = await fetchWithAuth(`/api/audits/question-sets/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Failed to update question set')
  return data
}

export async function deleteAuditQuestionSet(id: number): Promise<void> {
  const res = await fetchWithAuth(`/api/audits/question-sets/${id}/`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Failed to delete question set')
  }
}

export async function initDefaultQuestionSet(): Promise<{ created: boolean; question_set: AuditQuestionSet }> {
  const res = await fetchWithAuth('/api/audits/question-sets/init-default/', { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Failed to initialise default question set')
  return data
}

// ── Rubrics ──────────────────────────────────────────────────────────────────

export async function fetchAuditRubrics(): Promise<AuditRubric[]> {
  return parseResults<AuditRubric>(await fetchWithAuth('/api/audits/rubrics/'))
}

export async function uploadAuditRubric(name: string, file: File): Promise<AuditRubric> {
  const formData = new FormData()
  formData.append('name', name)
  formData.append('file', file)
  const res = await fetchWithAuth('/api/audits/rubrics/', { method: 'POST', body: formData })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Failed to upload rubric')
  return data
}

export async function deleteAuditRubric(id: number): Promise<void> {
  const res = await fetchWithAuth(`/api/audits/rubrics/${id}/`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Failed to delete rubric')
  }
}

export function getAuditRubricDownloadUrl(id: number): string {
  return `/api/audits/rubrics/${id}/download/`
}

// ── Misc ─────────────────────────────────────────────────────────────────────

export async function removeAuditAuditor(assignmentId: number, staffProfileId: number): Promise<void> {
  const res = await fetchWithAuth(`/api/audits/assignments/${assignmentId}/auditors/${staffProfileId}/`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Failed to remove auditor')
  }
}

export async function importAuditQuestions(file: File): Promise<{ imported: number; skipped: number; total_questions: number; errors?: string[] }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetchWithAuth('/api/audits/questions/import/', { method: 'POST', body: formData })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Import failed')
  }
  return res.json()
}

export async function fetchAuditCycles(): Promise<AuditCycle[]> {
  return parseResults<AuditCycle>(await fetchWithAuth('/api/audits/cycles/'))
}

export async function createAuditCycle(payload: { cycle: number; name?: string; label?: string; is_active?: boolean }): Promise<AuditCycle | null> {
  const res = await fetchWithAuth('/api/audits/cycles/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  return res.json()
}

export async function fetchAuditAssignments(cycleId?: number, scope?: 'auditor' | 'hod'): Promise<AuditAssignment[]> {
  const qs = new URLSearchParams()
  if (cycleId) qs.set('cycle_id', String(cycleId))
  if (scope) qs.set('scope', scope)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return parseResults<AuditAssignment>(await fetchWithAuth(`/api/audits/assignments/${suffix}`))
}

export async function createAuditAssignment(payload: {
  cycle_id: number
  department_id: number
  auditor_ids: number[]
  remarks?: string
  question_set_id?: number | null
}): Promise<AuditAssignment> {
  const res = await fetchWithAuth('/api/audits/assignments/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Failed to create assignment')
  }
  return res.json()
}

export async function deleteAuditAssignment(id: number): Promise<void> {
  const res = await fetchWithAuth(`/api/audits/assignments/${id}/`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Failed to delete assignment')
  }
}

export async function fetchAuditAssignmentDetail(id: number): Promise<AuditAssignmentDetail | null> {
  const res = await fetchWithAuth(`/api/audits/assignments/${id}/`)
  if (!res.ok) return null
  return res.json()
}

export async function saveAuditScores(
  id: number,
  payload: {
    scores: { question_id: number; marks: number | null; comments: string }[]
    submit?: boolean
    status?: string
  },
): Promise<{ saved: number; errors?: string[]; status: string; total_marks: number; max_marks: number; percentage: number; below_60_count: number }> {
  const res = await fetchWithAuth(`/api/audits/assignments/${id}/scores/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Failed to save scores')
  return data
}

export async function fetchAuditReport(id: number): Promise<AuditReport | null> {
  const res = await fetchWithAuth(`/api/audits/assignments/${id}/report/`)
  if (!res.ok) return null
  return res.json()
}

export async function fetchAuditATR(id: number): Promise<{ assignment: AuditAssignment; atr_questions: AuditATRRow[]; below_60_count: number } | null> {
  const res = await fetchWithAuth(`/api/audits/assignments/${id}/atr/`)
  if (!res.ok) return null
  return res.json()
}

export async function saveAuditATR(
  id: number,
  payload: { atrs: { question_id: number; action_taken: string }[]; submit: boolean },
): Promise<{ saved: number; submit: boolean }> {
  const res = await fetchWithAuth(`/api/audits/assignments/${id}/atr/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Failed to save ATR')
  return data
}

export async function fetchAuditConsolidated(cycleId?: number): Promise<AuditConsolidated[]> {
  const suffix = cycleId ? `?cycle_id=${cycleId}` : ''
  return parseResults<AuditConsolidated>(await fetchWithAuth(`/api/audits/consolidated/${suffix}`))
}
