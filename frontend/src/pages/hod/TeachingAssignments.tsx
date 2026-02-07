import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

type Section = { id: number; name: string; batch: string; department_id?: number; semester?: number; department?: { id: number; code?: string } }
type Staff = { id: number; user: string; staff_id: string }
type CurriculumRow = { id: number; course_code?: string; course_name?: string; department?: { id: number; code?: string }; semester?: number }
type TeachingAssignment = { 
  id: number
  staff: string | number
  subject: string
  section: string | number
  academic_year: string
  curriculum_row?: { id: number; course_code?: string; course_name?: string }
  section_details?: { id: number; name: string; batch: string; semester?: number }
  staff_details?: { id: number; user: string; staff_id: string }
}

export default function TeachingAssignmentsPage(){
  const [sections, setSections] = useState<Section[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumRow[]>([])
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([])
  const [electiveOptions, setElectiveOptions] = useState<any[]>([])
  const [electiveParents, setElectiveParents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const uniqueSems = sections.length ? Array.from(new Set(sections.map(s => s.semester))).sort((a, b) => (a || 0) - (b || 0)) : []
  const [selectedSem, setSelectedSem] = useState<number | null>(uniqueSems.length === 1 ? uniqueSems[0] ?? null : null)

  // permissions (used to decide which staff endpoint to call)
  const perms = (() => { try { return JSON.parse(localStorage.getItem('permissions') || '[]') as string[] } catch { return [] } })()
  const canViewElectives = perms.includes('academics.view_elective_teaching')
  const canAssignElectives = perms.includes('academics.assign_elective_teaching')

  useEffect(() => { fetchData() }, [])

  async function fetchData(){
    try{
      setLoading(true)
      const sres = await fetchWithAuth('/api/academics/my-students/?page_size=0')
      const staffEndpoint = (canViewElectives || canAssignElectives) ? '/api/academics/hod-staff/?page_size=0' : '/api/academics/advisor-staff/?page_size=0'
      const staffRes = await fetchWithAuth(staffEndpoint)
      const curRes = await fetchWithAuth('/api/curriculum/department/?page_size=0')
      const electRes = await fetchWithAuth('/api/curriculum/elective/?page_size=0')
      const taRes = await fetchWithAuth('/api/academics/teaching-assignments/?page_size=0')

      const safeJson = async (r: Response) => {
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('application/json')) throw new Error('non-json')
        return r.json()
      }

      if (sres.ok){ const d = await safeJson(sres); setSections((d.results || d).map((r:any) => ({ id: r.section_id, name: r.section_name, batch: r.batch, department_id: r.department_id, semester: r.semester, department: r.department }))) }
      if (staffRes.ok){ const d = await safeJson(staffRes); setStaff(d.results || d) }
      if (curRes.ok){ const d = await safeJson(curRes); const rows = (d.results || d); setCurriculum(rows); setElectiveParents(rows.filter((r:any)=> r.is_elective)) }
      if (electRes.ok){ const d = await safeJson(electRes); setElectiveOptions(d.results || d) }
      if (taRes.ok){ const d = await safeJson(taRes); setAssignments(d.results || d) }
    }catch(e){ console.error(e); alert('Failed to load teaching assignment data') }
    finally{ setLoading(false) }
  }

  async function assign(sectionId:number){
    const subjSel = document.getElementById(`subject-${sectionId}`) as HTMLSelectElement
    const staffSel = document.getElementById(`staff-${sectionId}`) as HTMLSelectElement
    if (!subjSel?.value || !staffSel?.value) return alert('Select subject and staff')
    const payload = { section_id: sectionId, staff_id: Number(staffSel.value), curriculum_row_id: Number(subjSel.value), is_active: true }
    const res = await fetchWithAuth('/api/academics/teaching-assignments/', { method: 'POST', body: JSON.stringify(payload) })
    if (res.ok){ alert('Assigned successfully'); fetchData() } else { const txt = await res.text(); alert('Error: ' + txt) }
  }

  // permissions are computed above

  async function assignElective(electiveId:number, staffId:number){
    if (!staffId) return alert('Select staff')
    const payload = { elective_subject_id: electiveId, staff_id: Number(staffId), is_active: true }
    const res = await fetchWithAuth('/api/academics/teaching-assignments/', { method: 'POST', body: JSON.stringify(payload) })
    if (res.ok){ alert('Assigned successfully'); fetchData() } else { const txt = await res.text(); alert('Error: ' + txt) }
  }

  if (loading) return (
    <div style={{ padding: '28px', minHeight: '100vh', background: 'linear-gradient(180deg, #f7fbff 0%, #ffffff 60%)' }}>
      <div style={{ padding: '16px', borderRadius: '8px', background: '#fff', border: '1px solid rgba(15,23,42,0.04)', color: '#6b7280' }}>
        Loading teaching assignments…
      </div>
    </div>
  )

  const filteredSections = sections.filter(s => {
    const matchesSem = !selectedSem || s.semester === selectedSem
    return matchesSem
  })

  return (
    <div style={{ padding: '28px', minHeight: '100vh', background: 'linear-gradient(180deg, #f7fbff 0%, #ffffff 60%)' }}>
      {/* Welcome Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(90deg,#ffffff, #f8fafc)', padding: '16px', borderRadius: '12px', boxShadow: '0 6px 18px rgba(15,23,42,0.06)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <svg style={{ width: '44px', height: '44px', color: '#6366f1' }} fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0e7ff"/><path d="M24 12c6.627 0 12 5.373 12 12s-5.373 12-12 12S12 30.627 12 24s5.373-12 12-12zm-3 8v8h6v-8h-6z" fill="#6366f1"/></svg>
          <div>
            <h2 style={{ margin: '0 0 2px 0', fontSize: '22px', color: '#111827', fontWeight: 700 }}>Teaching Assignments</h2>
            <div style={{ margin: 0, color: '#6b7280', fontSize: '15px' }}>Assign faculty to courses and sections</div>
          </div>
        </div>
      </div>

      {/* Semester Filter */}
      {uniqueSems.length > 0 && (
        <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#374151', fontWeight: 500 }}>Semester:</span>
          <select
            value={selectedSem ?? ''}
            onChange={e => setSelectedSem(e.target.value ? Number(e.target.value) : null)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#1e293b', fontWeight: 500 }}
          >
            <option value="">All Semesters</option>
            {uniqueSems.map(s => <option key={s} value={s}>Semester {s}</option>)}
          </select>
        </div>
      )}

      {/* Department filter removed — advisors see only their assigned sections */}

      {/* Assignment Table */}
      <div style={{ overflowX: 'auto', marginTop: '8px', marginBottom: '32px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px #e5e7eb' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(90deg,#f3f4f6,#e0e7ff)', textAlign: 'left', borderBottom: '2px solid #d1d5db' }}>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Section</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Sem</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Subject</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Staff Member</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredSections.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.2s' }}>
                <td style={{ padding: '10px 8px', color: '#1e293b', fontWeight: 500 }}>{s.batch} / {s.name}</td>
                <td style={{ padding: '10px 8px', color: '#1e293b', fontWeight: 500 }}>{s.semester || '-'}</td>
                <td style={{ padding: '10px 8px', width: '250px' }}>
                  <select id={`subject-${s.id}`} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#1e293b', fontWeight: 500, width: '100%', boxSizing: 'border-box' }}>
                    <option value="">-- select subject --</option>
                    {curriculum.filter(c => (s.semester ? (c.semester === s.semester) : true)).map(c => (
                      <option key={c.id} value={c.id}>{c.course_code} - {c.course_name || 'Unnamed'}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <select id={`staff-${s.id}`} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#1e293b', fontWeight: 500, minWidth: '180px' }}>
                    <option value="">-- select staff --</option>
                    {staff.map(st => (<option key={st.id} value={st.id}>{st.staff_id} - {st.user}</option>))}
                  </select>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <button onClick={() => assign(s.id)} style={{ padding: '6px 14px', background: 'linear-gradient(90deg,#4f46e5,#06b6d4)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: 'opacity 0.2s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                    Assign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredSections.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', background: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px #e5e7eb' }}>
            No sections available for the selected filters.
          </div>
        )}
      </div>

      {/* Existing Assignments (cards) */}
      <div>
        <h3 style={{ fontSize: '18px', color: '#111827', fontWeight: 700, marginBottom: '12px', marginTop: '0' }}>Existing Assignments</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {assignments.map(a => {
            const staffName = (a as any).staff_details?.user || (a as any).staff_details?.staff_id || (a as any).staff || ''
            const sectionText = (a as any).section_name || (a as any).section || ''
            // try to split sectionText like "Program - Batch / SectionName" or "Batch / Section"
            const parts = String(sectionText).split(' / ')
            const left = parts[0] || ''
            const right = parts[1] || ''
            const leftParts = String(left).split(' - ')
            const program = leftParts[0] || 'Program'
            const batch = leftParts[1] || left || 'Batch'
            const sectionName = right || ''
            const subject = (a as any).subject || (a as any).curriculum_row?.course_code || ''

            return (
              <div key={a.id}
                style={{
                  background: '#fff',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #eef2f7',
                  boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
                  color: '#1e293b'
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{program}</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#475569', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>Batch:</span>
                  <span>{batch}</span>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span style={{ fontWeight: 600 }}>Section:</span>
                  <span>{sectionName}</span>
                </div>
                <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600, marginBottom: 6 }}>{staffName}</div>
                {subject && (
                  <div style={{ fontSize: 13, color: '#475569' }}><span style={{ fontWeight: 600 }}>Subject:</span> <span style={{ fontWeight: 500 }}>{subject}</span></div>
                )}
              </div>
            )
          })}
          {assignments.length === 0 && (
            <div style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>No assignments yet.</div>
          )}
        </div>
      </div>
      {/* Elective subject assignments */}
      {canViewElectives ? (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: '18px', color: '#111827', fontWeight: 700, marginBottom: '12px' }}>Elective Subject Assignments</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {electiveParents.length === 0 && (<div style={{ color: '#64748b' }}>No elective parents found.</div>)}
            {electiveParents.map(parent => (
              <div key={parent.id} style={{ background: '#fff', padding: 12, borderRadius: 8, boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{parent.course_name || parent.course_code || 'Elective'}</div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  { (electiveOptions && electiveOptions.filter((e:any)=> e.parent === parent.id)).map((opt:any) => (
                    <div key={opt.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>{opt.course_code || '-'} — {opt.course_name || '-'}</div>
                      <select id={`elective-staff-${opt.id}`} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', minWidth: 160 }}>
                        <option value="">-- select staff --</option>
                        {staff.map(st => (<option key={st.id} value={st.id}>{st.staff_id} - {st.user}</option>))}
                      </select>
                      <button disabled={!canAssignElectives} onClick={() => assignElective(opt.id, Number((document.getElementById(`elective-staff-${opt.id}`) as HTMLSelectElement)?.value))} style={{ padding: '6px 12px', borderRadius: 6, background: canAssignElectives ? 'linear-gradient(90deg,#4f46e5,#06b6d4)' : '#f3f4f6', color: canAssignElectives ? '#fff' : '#9ca3af', border: 'none', cursor: canAssignElectives ? 'pointer' : 'not-allowed' }}>{canAssignElectives ? 'Assign' : 'No permission'}</button>
                    </div>
                  )) }
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
