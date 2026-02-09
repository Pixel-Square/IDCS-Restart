import fetchWithAuth from './fetchAuth'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export async function fetchMentorStaff() {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/mentor/staff/`)
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function fetchStudentsForStaff(staffId:number) {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/mentor/staff/${staffId}/students/`)
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function mapMentor(mentorId:number, studentIds:number[]) {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/mentor/map/`, { method: 'POST', body: JSON.stringify({ mentor_id: mentorId, student_ids: studentIds }) })
  return res
}

export async function fetchMyStudents() {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/my-students/`)
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function unmapStudent(studentId:number, mentorId?:number) {
  const body: any = { student_ids: [studentId] }
  if (mentorId) body.mentor_id = mentorId
  const res = await fetchWithAuth(`${API_BASE}/api/academics/mentor/unmap/`, { method: 'POST', body: JSON.stringify(body) })
  return res
}

export async function fetchMyMentees() {
  const res = await fetchWithAuth(`${API_BASE}/api/academics/mentor/my-mentees/`)
  if (!res.ok) return { results: [] }
  return res.json()
}
