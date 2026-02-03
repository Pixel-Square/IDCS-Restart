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
  const [loading, setLoading] = useState(true)

  const uniqueSems = sections.length ? Array.from(new Set(sections.map(s => s.semester))).sort((a, b) => (a || 0) - (b || 0)) : []
  const [selectedSem, setSelectedSem] = useState<number | null>(uniqueSems.length === 1 ? uniqueSems[0] ?? null : null)
  
  const uniqueDepts = sections.length ? Array.from(new Set(sections.map(s => s.department_id || s.department?.id).filter(Boolean))) : []
  const [currentDept, setCurrentDept] = useState<number | null>(null)

  useEffect(() => {
    if (currentDept && !uniqueDepts.includes(currentDept)) {
      setCurrentDept(null)
    }
  }, [sections, currentDept, uniqueDepts])

  useEffect(() => { fetchData() }, [])

  async function fetchData(){
    try{
      setLoading(true)
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

  if (loading) return (
    <div style={{ padding: '28px', minHeight: '100vh', background: 'linear-gradient(180deg, #f7fbff 0%, #ffffff 60%)' }}>
      <div style={{ padding: '16px', borderRadius: '8px', background: '#fff', border: '1px solid rgba(15,23,42,0.04)', color: '#6b7280' }}>
        Loading teaching assignments…
      </div>
    </div>
  )

  const filteredSections = sections.filter(s => {
    const matchesDept = !currentDept || (s.department_id === currentDept || s.department?.id === currentDept)
    const matchesSem = !selectedSem || s.semester === selectedSem
    return matchesDept && matchesSem
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

      {/* Department Pills */}
      {uniqueDepts.length > 0 && (
        <div style={{ marginBottom: '18px', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
          {uniqueDepts.map(deptId => {
            const isActive = currentDept === deptId
            const deptCode = sections.find(s => (s.department_id === deptId || s.department?.id === deptId))?.department?.code ||
                           curriculum.find(c => c.department?.id === deptId)?.department?.code ||
                           `Dept ${deptId}`
            return (
              <button
                key={deptId}
                onClick={() => setCurrentDept(deptId as number)}
                style={{
                  minWidth: 64,
                  height: 36,
                  borderRadius: 20,
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 16,
                  border: 'none',
                  outline: 'none',
                  boxShadow: isActive ? '0 2px 8px #e0e7ff' : 'none',
                  background: isActive ? 'linear-gradient(90deg,#4f46e5,#06b6d4)' : '#f3f4f6',
                  color: isActive ? '#fff' : '#1e293b',
                  transition: 'background 0.18s, color 0.18s, box-shadow 0.18s',
                  padding: '0 22px',
                  margin: 0,
                  cursor: 'pointer',
                  letterSpacing: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                }}
              >
                {deptCode}
              </button>
            )
          })}
        </div>
      )}

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
                    {curriculum.filter(c => c.department && c.department.id === s.department_id && (s.semester ? (c.semester === s.semester) : true)).map(c => (
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

      {/* Existing Assignments */}
      <div>
        <h3 style={{ fontSize: '18px', color: '#111827', fontWeight: 700, marginBottom: '12px', marginTop: '0' }}>Existing Assignments</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {assignments
            .filter(a => !currentDept || Number((a as any).department_id) === Number(currentDept))
            .map(a => {
              const entries = Object.entries(a)
              const staffEntry = entries.find(([key, value]) => /staff|faculty/i.test(key) && value !== null && value !== undefined)
              const sectionEntry = entries.find(([key, value]) => /section/i.test(key) && value !== null && value !== undefined)

              return (
                <li key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                      Staff: {staffEntry ? String(staffEntry[1]) : ''}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
                      Section: {sectionEntry ? String(sectionEntry[1]) : ''}
                    </div>
                  </div>
                  {entries.map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#374151' }}>{key}:</span>
                      <span style={{ fontWeight: 500 }}>{String(value)}</span>
                    </div>
                  ))}
                </li>
              )
            })}
        </ul>
      </div>
    </div>
  )
}
