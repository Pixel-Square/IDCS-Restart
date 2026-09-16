import fetchWithAuth from './fetchAuth'

export type AssignedSubject = {
  id: number
  subject_code?: string | null
  subject_name?: string | null
  section_name?: string | null
  batch?: string | null
  semester?: number | null
  subject_batches?: Array<{ id: number; name?: string | null }> | null
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
  department?: {
    id: number
    code?: string
    name?: string
    short_name?: string
  }
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
  // Fetch all staff from all departments using batch-staff endpoint
  // This endpoint returns all active staff with their department information
  try {
    const res = await fetchWithAuth('/api/academics/batch-staff/?page_size=0')
    if (res.ok) {
      const data = await res.json()
      const staffList = data.results || data
      console.log('Fetched batch-staff data:', staffList)
      // Transform to match StaffMember interface with department info
      return staffList.map((s: any) => {
        let dept = null
        // API returns department
        const deptField = s.department
        if (deptField) {
          dept = typeof deptField === 'object' ? deptField : { id: deptField }
        }
        console.log(`Staff ${s.staff_id}: department = `, deptField)
        return {
          id: s.id,
          staff_id: s.staff_id,
          name: s.name || (s.user ? `${s.user.first_name || ''} ${s.user.last_name || ''}`.trim() || s.user.username : s.staff_id),
          username: s.username || (s.user?.username || s.staff_id),
          designation: s.designation,
          department: dept
        }
      })
    }
  } catch (e) {
    console.warn('Failed to fetch staff', e)
  }

  // Return empty array if fetch fails
  return []
}

export default { fetchAssignedSubjects, fetchDepartmentStaff }
