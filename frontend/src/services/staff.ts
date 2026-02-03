import fetchWithAuth from './fetchAuth'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export type AssignedSubject = {
  id: number
  subject_code?: string | null
  subject_name?: string | null
  section_name?: string | null
  batch?: string | null
  semester?: number | null
}

export async function fetchAssignedSubjects(staffId?: number): Promise<AssignedSubject[]> {
  const path = staffId ? `/api/academics/staff/${staffId}/assigned-subjects/` : `/api/academics/staff/assigned-subjects/`
  const res = await fetchWithAuth(path)
  if (!res.ok) throw new Error('Failed to fetch assigned subjects')
  const data = await res.json()
  // API returns { results: [...] } or array
  return data.results || data
}

export default { fetchAssignedSubjects }
