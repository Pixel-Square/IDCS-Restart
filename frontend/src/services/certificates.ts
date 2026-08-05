import fetchWithAuth from './fetchAuth'

export type CertificateRecord = {
  id: number
  title: string
  certificate_type: string
  issuing_organization: string
  issue_date: string
  expiry_date?: string | null
  status: 'PENDING_MENTOR_REVIEW' | 'APPROVED' | 'REJECTED'
  rejection_reason?: string | null
  rejection_message?: string | null
  file?: string | null
  file_hash?: string | null
  created_at?: string
  updated_at?: string
  mentor_username?: string | null
  student?: number
  student_name?: string | null
  student_reg_no?: string | null
  achievement?: AchievementRecord | null
}

export type AchievementRecord = {
  id: number
  student: number
  student_reg_no?: string
  student_name?: string
  title: string
  achievement_type: string
  description?: string
  issuing_body: string
  date_earned: string
  verified_by?: number | null
  verified_by_username?: string | null
  verified_at?: string
  created_at?: string
  certificate?: number
  certificate_file?: string | null
  certificate_status?: string | null
}

export async function uploadCertificate(formData: FormData) {
  const res = await fetchWithAuth('/api/certificates/upload/', {
    method: 'POST',
    body: formData,
  })
  return res
}

export async function fetchMyCertificates(): Promise<{ results: CertificateRecord[] }> {
  const res = await fetchWithAuth('/api/certificates/my-certificates/')
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function fetchPendingReviews(): Promise<{ results: CertificateRecord[] }> {
  const res = await fetchWithAuth('/api/certificates/pending-review/')
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function approveCertificate(id: number) {
  return fetchWithAuth(`/api/certificates/${id}/approve/`, { method: 'POST' })
}

export async function rejectCertificate(id: number, payload: { rejection_reason?: string; rejection_message?: string }) {
  return fetchWithAuth(`/api/certificates/${id}/reject/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function fetchMentorAchievements(): Promise<{ results: AchievementRecord[] }> {
  const res = await fetchWithAuth('/api/certificates/mentor-achievements/')
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function fetchMenteeAchievements(studentId: number): Promise<{ results: AchievementRecord[] }> {
  const res = await fetchWithAuth(`/api/certificates/mentee-achievements/${studentId}/`)
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function fetchAdviseeAchievements(studentId?: number): Promise<{ results: AchievementRecord[] }> {
  const url = studentId ? `/api/certificates/advisee-achievements/${studentId}/` : '/api/certificates/advisee-achievements/'
  const res = await fetchWithAuth(url)
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function fetchDepartmentAchievements(): Promise<{ results: AchievementRecord[] }> {
  const res = await fetchWithAuth('/api/certificates/department-achievements/')
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function fetchAllAchievements(): Promise<{ results: AchievementRecord[] }> {
  const res = await fetchWithAuth('/api/certificates/all-achievements/')
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function fetchCertificateStats(): Promise<{ total: number; approved: number; pending: number; rejected: number }> {
  const res = await fetchWithAuth('/api/certificates/stats/')
  if (!res.ok) return { total: 0, approved: 0, pending: 0, rejected: 0 }
  return res.json()
}

export async function fetchCertificateReports() {
  const res = await fetchWithAuth('/api/certificates/reports/')
  if (!res.ok) return null
  return res.json()
}

export async function exportCertificateReports() {
  const res = await fetchWithAuth('/api/certificates/reports/export/')
  return res
}
