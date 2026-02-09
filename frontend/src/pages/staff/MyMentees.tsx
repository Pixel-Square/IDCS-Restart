import React, { useEffect, useState } from 'react'
import { fetchMyMentees, unmapStudent } from '../../services/mentor'
import '../../pages/Dashboard.css'

export default function MyMentees() {
  const [mentees, setMentees] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ load() }, [])

  async function load(){
    setLoading(true)
    try{
      const res = await fetchMyMentees()
      setMentees(res.results || [])
    }catch(e){
      console.error(e)
      alert('Failed to load mentees')
    }finally{ setLoading(false) }
  }

  async function remove(id:number){
    if(!confirm('Remove mentor mapping for this student?')) return
    setLoading(true)
    try{
      const res = await unmapStudent(id)
      if(res.ok){
        await load()
      } else {
        const j = await res.json().catch(()=>null)
        alert('Failed to remove: '+ (j && j.detail ? j.detail : res.statusText))
      }
    }catch(e){ console.error(e); alert('Error') }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', padding: 16 }}>
      <div className="welcome" style={{ marginBottom: 18 }}>
        <div className="welcome-left">
          <svg className="welcome-icon" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0e7ff"/><path d="M14 24a3 3 0 116 0 3 3 0 01-6 0zm8 0a3 3 0 116 0 3 3 0 01-6 0zm8 0a3 3 0 116 0 3 3 0 01-6 0z" fill="#6366f1"/></svg>
          <div>
            <h2 className="welcome-title" style={{ fontSize: 20, marginBottom: 2 }}>My Mentees</h2>
            <div className="welcome-sub">Students assigned to you as mentor.</div>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', padding: 14, borderRadius: 8, boxShadow: '0 1px 6px rgba(15,23,42,0.06)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Mentees</h3>
        {loading && <div>Loading…</div>}
        {!loading && mentees.length===0 && <div style={{ color: '#64748b' }}>No mentees assigned.</div>}
        {!loading && mentees.length>0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e6edf3' }}>
                <th style={{ padding: 10 }}>Reg No</th>
                <th style={{ padding: 10 }}>Name</th>
                <th style={{ padding: 10 }}>Section</th>
                <th style={{ padding: 10 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {mentees.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #f3f6f9' }}>
                  <td style={{ padding: 10 }}>{m.reg_no}</td>
                  <td style={{ padding: 10 }}>{m.username}</td>
                  <td style={{ padding: 10 }}>{m.section_name}</td>
                  <td style={{ padding: 10 }}>
                    <button className="px-2 py-1" style={{ background: '#ef4444', color: '#fff', borderRadius: 6 }} onClick={()=>remove(m.id)} disabled={loading}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
