import fetchWithAuth from './fetchAuth'

export type AssignedSubject = {
  id: number
  subject_code?: string | null
  subject_name?: string | null
  section_name?: string | null
  batch?: string | null
  semester?: number | null
  department?: {
    id: number
    code?: string | null
    name?: string | null
    short_name?: string | null
  } | null
}

export type StaffMember = {
  id: number
  staff_id: string
  name: string
  username: string
  designation?: string
}

export async function fetchAssignedSubjects(staffId?: number): Promise<AssignedSubject[]> {
  const path = staffId ? `/api/academics/staff/${staffId}/assigned-subjects/` : `/api/academics/staff/assigned-subjects/`
  const res = await fetchWithAuth(path)
  if (!res.ok) throw new Error('Failed to fetch assigned subjects')
  const data = await res.json()
  // API returns { results: [...] } or array
  return data.results || data
}

export async function fetchDepartmentStaff(): Promise<StaffMember[]> {
  const res = await fetchWithAuth('/api/academics/department-staff/')
  if (!res.ok) throw new Error('Failed to fetch department staff')
  const data = await res.json()
  return data.results || data
}

export default { fetchAssignedSubjects, fetchDepartmentStaff }
