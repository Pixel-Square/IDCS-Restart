import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

type Section = { id: number; name: string; batch: string; department_id?: number; semester?: number }
type Staff = { id: number; user: string; staff_id: string }
type CurriculumRow = { id: number; course_code?: string; course_name?: string; department?: { id: number } }
  type TeachingAssignment = { id: number; staff: string; subject: string; section: string; academic_year: string; curriculum_row?: { id: number; course_code?: string; course_name?: string } }

export default function TeachingAssignmentsPage(){
  const [sections, setSections] = useState<Section[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumRow[]>([])
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([])

  useEffect(() => { fetchData() }, [])

  async function fetchData(){
    try{
      const sres = await fetchWithAuth('/api/academics/sections/?page_size=0')
      const staffRes = await fetchWithAuth('/api/academics/hod-staff/?page_size=0')
      const curRes = await fetchWithAuth('/api/curriculum/department/?page_size=0')
      const taRes = await fetchWithAuth('/api/academics/teaching-assignments/?page_size=0')

      const safeJson = async (r: Response) => {
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('application/json')) throw new Error('non-json')
        return r.json()
      }

      if (sres.ok){ const d = await safeJson(sres); setSections(d.results || d) }
      if (staffRes.ok){ const d = await safeJson(staffRes); setStaff(d.results || d) }
      if (curRes.ok){ const d = await safeJson(curRes); setCurriculum(d.results || d) }
      if (taRes.ok){ const d = await safeJson(taRes); setAssignments(d.results || d) }
    }catch(e){ console.error(e); alert('Failed to load teaching assignment data') }
  }

  async function assign(sectionId:number){
    const subjSel = document.getElementById(`subject-${sectionId}`) as HTMLSelectElement
    const staffSel = document.getElementById(`staff-${sectionId}`) as HTMLSelectElement
    if (!subjSel?.value || !staffSel?.value) return alert('Select subject and staff')
    const payload = { section_id: sectionId, staff_id: Number(staffSel.value), curriculum_row_id: Number(subjSel.value), is_active: true }
    const res = await fetchWithAuth('/api/academics/teaching-assignments/', { method: 'POST', body: JSON.stringify(payload) })
    if (res.ok){ alert('Assigned'); fetchData() } else { const txt = await res.text(); alert('Error: ' + txt) }
  }

  return (
    <div>
      <h2>Teaching assignments (HOD)</h2>
      <table>
        <thead><tr><th>Section</th><th>Subject</th><th>Staff</th><th>Action</th></tr></thead>
        <tbody>
          {sections.map(s => (
            <tr key={s.id}>
              <td>{s.batch} / {s.name}</td>
              <td>
                <select id={`subject-${s.id}`}>
                  <option value="">-- select --</option>
                  {curriculum.filter(c => c.department && c.department.id === s.department_id && (s.semester ? (c.semester === s.semester) : true)).map(c => (
                    <option key={c.id} value={c.id}>{c.course_name || c.course_code || c.id}</option>
                  ))}
                </select>
              </td>
              <td>
                <select id={`staff-${s.id}`}>
                  <option value="">-- select --</option>
                  {staff.map(st => (<option key={st.id} value={st.id}>{st.staff_id} - {st.user}</option>))}
                </select>
              </td>
              <td><button onClick={() => assign(s.id)}>Assign</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Existing assignments</h3>
      <ul>
        {assignments.map(a => {
          const subjLabel = (a as any).curriculum_row?.course_name || a.subject
          return <li key={a.id}>{a.section} — {subjLabel} — {a.staff} ({a.academic_year})</li>
        })}
      </ul>
    </div>
  )
}
