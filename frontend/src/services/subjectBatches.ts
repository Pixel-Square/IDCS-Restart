import fetchWithAuth from './fetchAuth'

export type SubjectBatch = {
  id: number
  name: string
  academic_year?: number
  section?: { id: number; name?: string | null } | null
  section_id?: number | null
  staff?: { id: number; user?: string; staff_id?: string; name?: string }
  created_by?: { id: number; user?: string; staff_id?: string; name?: string }
  curriculum_row?: { id: number; course_code?: string; course_name?: string }
  elective_subject?: { id: number; course_code?: string; course_name?: string }
  students?: Array<{ id: number; reg_no: string; username: string }>
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export async function fetchSubjectBatches(): Promise<SubjectBatch[]> {
  const res = await fetchWithAuth('/api/academics/subject-batches/?page_size=0')
  if (!res.ok) throw new Error('Failed to fetch subject batches')
  const data = await res.json()
  return data.results || data
}

export async function createSubjectBatch(payload: { 
  name: string
  student_ids?: number[]
  academic_year?: number
  curriculum_row_id?: number
  elective_subject_id?: number
  section_id?: number
  staff_id?: number
}){
  const res = await fetchWithAuth('/api/academics/subject-batches/', { method: 'POST', body: JSON.stringify(payload) })
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()
  if (!res.ok) {
    // if server returned HTML (error page), include it in thrown error for debugging
    const message = ct.includes('application/json') ? (JSON.parse(text)?.detail || text) : text
    throw new Error(message)
  }
  if (ct.includes('application/json')) return JSON.parse(text)
  // fallback: return text
  return text
}

export default { fetchSubjectBatches, createSubjectBatch }
