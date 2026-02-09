import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { fetchMentorStaff, fetchStudentsForStaff, fetchMyStudents, mapMentor, unmapStudent } from '../../services/mentor'
import '../../pages/Dashboard.css'

export default function MentorAssign() {
  const [staff, setStaff] = useState<any[]>([])
  const [selectedStaff, setSelectedStaff] = useState<number | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [assignedStudents, setAssignedStudents] = useState<any[]>([])
  
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ loadStaff() }, [])

  async function loadStaff(){
    const res = await fetchMentorStaff()
    setStaff(res.results || [])
  }

  async function loadMyStudents(){
    const res = await fetchMyStudents()
    const sections = res.results || []
    // flatten students across sections
    const flat: any[] = []
    sections.forEach((sec: any) => {
      const studs = sec.students || []
      studs.forEach((s: any) => flat.push(s))
    })
    setStudents(flat)
  }

  async function onSelectStaff(id:number){
    // When the user clicks View for a staff, load both the mentor's current
    // assigned students and the advisor's available students, then compute
    // the unassigned list.
    setSelectedStaff(id)
    
    setAssignedStudents([])
    setStudents([])

    // fetch mentor's currently assigned students
    const ares = await fetchStudentsForStaff(id)
    const assigned = ares.results || []

    // fetch advisor's students (sections the logged-in user advises)
    const mres = await fetchMyStudents()
    const sections = mres.results || []
    const myFlat: any[] = []
    sections.forEach((sec: any) => {
      const studs = sec.students || []
      studs.forEach((s: any) => myFlat.push(s))
    })

    const assignedIds = new Set(assigned.map((s:any)=>s.id))
    const available = myFlat.filter(s => !assignedIds.has(s.id) && !s.has_mentor)

    setAssignedStudents(assigned)
    setStudents(available)
  }

  

  async function assignSingle(studentId:number){
    if (!selectedStaff) return alert('Select a mentor first')
    setLoading(true)
    const res = await mapMentor(selectedStaff, [studentId])
    if (res.ok) {
      await loadMyStudents()
      if (selectedStaff) await onSelectStaff(selectedStaff)
    } else {
      const j = await res.json().catch(()=>null)
      alert('Failed: '+ (j && j.detail ? j.detail : res.statusText))
    }
    setLoading(false)
  }

  async function removeAssigned(studentId:number){
    if (!selectedStaff) return
    setLoading(true)
    const res = await unmapStudent(studentId, selectedStaff)
    if (res.ok) {
      await loadMyStudents()
      if (selectedStaff) await onSelectStaff(selectedStaff)
    } else {
      const j = await res.json().catch(()=>null)
      alert('Failed to remove: '+ (j && j.detail ? j.detail : res.statusText))
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', background: 'none' }}>
      <div className="welcome" style={{ marginBottom: 18 }}>
        <div className="welcome-left">
          <svg className="welcome-icon" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0e7ff"/><path d="M14 24a3 3 0 116 0 3 3 0 01-6 0zm8 0a3 3 0 116 0 3 3 0 01-6 0zm8 0a3 3 0 116 0 3 3 0 01-6 0z" fill="#6366f1"/></svg>
          <div>
            <h2 className="welcome-title" style={{ fontSize: 20, marginBottom: 2 }}>Mentor Assignment</h2>
            <div className="welcome-sub">Assign and manage mentor mappings for your students.</div>
          </div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ width: '40%' }}>
          <h3 className="font-medium">Staff (Select mentor)</h3>
          <div className="mt-2 overflow-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2 border-b">Name</th>
                  <th className="px-3 py-2 border-b">Staff ID</th>
                  <th className="px-3 py-2 border-b">Action</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id} className={`${selectedStaff===s.id ? 'bg-sky-100 font-semibold' : ''}`}>
                    <td className="px-3 py-2 border-b">{s.username}</td>
                    <td className="px-3 py-2 border-b">{s.staff_id || '-'}</td>
                    <td className="px-3 py-2 border-b">
                      <button
                        className="px-2 py-1 bg-indigo-600 text-white rounded text-sm"
                        onClick={() => onSelectStaff(s.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          <div style={{ width: '60%' }}>
            <div style={{ background: '#fff', padding: 14, borderRadius: 8, boxShadow: '0 1px 6px rgba(15,23,42,0.06)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Students</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: '#fff', border: '1px solid #eef2f7', borderRadius: 8, padding: 10 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#3730a3' }}>Assigned to selected mentor</h4>
                  {assignedStudents.length>0 ? (
                    <ul className="mt-2">
                      {assignedStudents.map(st => (
                        <li key={st.id} className="flex items-center justify-between p-2 border-b text-sm">
                          <div>{st.reg_no} — {st.username} — {st.section_name}</div>
                          <button className="px-2 py-1 text-sm" style={{ background: '#ef4444', color: '#fff', borderRadius: 6 }} onClick={()=>removeAssigned(st.id)} disabled={loading}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: '#64748b', marginTop: 8 }}>No students currently assigned to this mentor</div>
                  )}
                </div>
                <div style={{ background: '#fff', border: '1px solid #eef2f7', borderRadius: 8, padding: 10 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#3730a3' }}>Available to assign</h4>
                  {students.length>0 ? (
                    <>
                      <ul className="mt-2">
                        {students.map(st => (
                          <li key={st.id} className="flex items-center gap-3 p-2 border-b justify-between">
                            <div className="flex items-center gap-3">
                              <div>{st.reg_no} — {st.username} — {st.section_name}</div>
                            </div>
                            <button className="px-2 py-1 text-sm" style={{ background: '#059669', color: '#fff', borderRadius: 6 }} onClick={()=>assignSingle(st.id)} disabled={loading || !selectedStaff}>Assign</button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div style={{ color: '#64748b', marginTop: 8 }}>No available students to assign</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
