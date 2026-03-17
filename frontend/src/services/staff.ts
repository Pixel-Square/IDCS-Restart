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
  // Try to fetch all staff first (if user has permission)
  try {
    const res = await fetchWithAuth('/api/academics/all-staff/')
    if (res.ok) {
      const data = await res.json()
      const staffList = data.results || data
      console.log('Fetched all-staff data:', staffList)
      // Transform to match StaffMember interface with department info
      return staffList.map((s: any) => {
        let dept = null
        // API returns current_department (not department)
        const deptField = s.current_department || s.department
        if (deptField) {
          dept = typeof deptField === 'object' ? deptField : { id: deptField }
        }
        console.log(`Staff ${s.staff_id}: department field = `, deptField)
        return {
          id: s.id,
          staff_id: s.staff_id,
          name: s.user ? `${s.user.first_name || ''} ${s.user.last_name || ''}`.trim() || s.user.username : s.staff_id,
          username: s.user?.username || s.staff_id,
          designation: s.designation,
          department: dept
        }
      })
    }
  } catch (e) {
    console.warn('Failed to fetch all staff, falling back to department staff', e)
  }
  
  // Fallback to department-specific staff
  const res = await fetchWithAuth('/api/academics/department-staff/')
  if (!res.ok) throw new Error('Failed to fetch department staff')
  const data = await res.json()
  return data.results || data
}

export default { fetchAssignedSubjects, fetchDepartmentStaff }
