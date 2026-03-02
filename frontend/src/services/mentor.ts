import fetchWithAuth from './fetchAuth'

// NOTE: Do NOT hardcode VITE_API_BASE here.
// In deployments accessed from another machine, a baked-in `http://localhost:8000`
// would point to the *client* machine, causing silent empty lists.
// Using relative `/api/...` lets `fetchWithAuth` route to the correct API base.

export async function fetchMentorStaff() {
  const res = await fetchWithAuth(`/api/academics/mentor/staff/`)
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function fetchStudentsForStaff(staffId:number) {
  const res = await fetchWithAuth(`/api/academics/mentor/staff/${staffId}/students/`)
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function mapMentor(mentorId:number, studentIds:number[]) {
  const res = await fetchWithAuth(`/api/academics/mentor/map/`, { method: 'POST', body: JSON.stringify({ mentor_id: mentorId, student_ids: studentIds }) })
  return res
}

export async function fetchMyStudents() {
  const res = await fetchWithAuth(`/api/academics/my-students/`)
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function unmapStudent(studentId:number, mentorId?:number) {
  const body: any = { student_ids: [studentId] }
  if (mentorId) body.mentor_id = mentorId
  const res = await fetchWithAuth(`/api/academics/mentor/unmap/`, { method: 'POST', body: JSON.stringify(body) })
  return res
}

export async function fetchMyMentees() {
  const res = await fetchWithAuth(`/api/academics/mentor/my-mentees/`)
  if (!res.ok) return { results: [] }
  return res.json()
}
