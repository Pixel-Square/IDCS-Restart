import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function TimetableEditor(){
  const [templates, setTemplates] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '', parity: 'BOTH', is_public: false, is_active: false })
  const [academicYears, setAcademicYears] = useState<any[]>([])
  const [newAcademicYear, setNewAcademicYear] = useState({ name: '', parity: 'ODD', is_active: false })
  const [newSlot, setNewSlot] = useState({ index: 1, start_time: '', end_time: '', is_break: false, is_lunch: false, label: '' })

  useEffect(()=>{ fetchTemplates() }, [])

  useEffect(()=>{ fetchAcademicYears() }, [])

  async function fetchTemplates(){
    setLoading(true)
    try{
      const res = await fetchWithAuth('/api/timetable/templates/')
      if(!res.ok) throw new Error(await res.text())
      const data = await res.json()
      // data may be list or paginated; ensure array
      const list = Array.isArray(data) ? data : (data.results || data)
      setTemplates(list || [])
      if(list && list.length){
        const active = (list as any[]).find(t=> t.is_active) || list[0]
        setSelected(active)
      }
    }catch(e){ console.error(e); alert('Failed to load templates') }
    finally{ setLoading(false) }
  }

  async function createTemplate(){
    try{
      const res = await fetchWithAuth('/api/timetable/templates/', { method: 'POST', body: JSON.stringify(newTemplate) })
      if(!res.ok) throw new Error(await res.text())
      await fetchTemplates()
      setNewTemplate({ name:'', description:'', parity:'BOTH', is_public:false, is_active:false })
    }catch(e){ console.error(e); alert('Failed to create template: '+String(e)) }
  }

  async function fetchAcademicYears(){
    try{
      const res = await fetchWithAuth('/api/academics/academic-years/')
      if(!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data.results || data)
      setAcademicYears(list || [])
    }catch(e){ console.error(e); }
  }

  async function createAcademicYear(){
    try{
      const res = await fetchWithAuth('/api/academics/academic-years/', { method: 'POST', body: JSON.stringify(newAcademicYear) })
      if(!res.ok) throw new Error(await res.text())
      await fetchAcademicYears()
      setNewAcademicYear({ name: '', parity: 'ODD', is_active: false })
    }catch(e){ console.error(e); alert('Failed to create academic year: '+String(e)) }
  }

  async function toggleAcademicYear(id:number, active:boolean){
    try{
      const res = await fetchWithAuth(`/api/academics/academic-years/${id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) })
      if(!res.ok) throw new Error(await res.text())
      await fetchAcademicYears()
      // also refresh templates since activating an academic year may flip active template
      await fetchTemplates()
    }catch(e){ console.error(e); alert('Failed to update academic year: '+String(e)) }
  }

  async function addSlot(){
    if(!selected) return alert('Select a template first')
    try{
      const payload = { ...newSlot, template: selected.id }
      const res = await fetchWithAuth('/api/timetable/slots/', { method: 'POST', body: JSON.stringify(payload) })
      if(!res.ok) throw new Error(await res.text())
      // append locally by refetching the templates
      await fetchTemplates()
      setNewSlot({ index: newSlot.index + 1, start_time:'', end_time:'', is_break:false, is_lunch:false, label:'' })
    }catch(e){ console.error(e); alert('Failed to add slot: '+String(e)) }
  }

  async function deleteSlot(slotId:number){
    if(!confirm('Delete this period?')) return
    try{
      const res = await fetchWithAuth(`/api/timetable/slots/${slotId}/`, { method: 'DELETE' })
      if(!res.ok) throw new Error(await res.text())
      await fetchTemplates()
    }catch(e){ console.error(e); alert('Failed to delete slot: '+String(e)) }
  }

  return (
    <div style={{padding:20}}>
      <div className="welcome" style={{ marginBottom: 18 }}>
        <div className="welcome-left">
          <svg className="welcome-icon" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#eef2ff"/><path d="M16 24h16M16 32h16M16 16h16" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/></svg>
          <div>
            <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>IQAC — Timetable Templates</h2>
            <div className="welcome-sub">Create and manage timetable templates and periods.</div>
          </div>
        </div>
      </div>

      {loading && <div style={{textAlign:'center', padding:20, color:'#6b7280'}}>Loading…</div>}

      <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
        <div style={{width:340, background:'#fff', padding:16, borderRadius:8, boxShadow:'0 2px 10px #e6edf8'}}>
          <h4 style={{marginTop:0, marginBottom:12}}>Academic Years</h4>
          <div style={{marginBottom:10}}>
            <input placeholder="Name (e.g. 2025-26)" value={newAcademicYear.name} onChange={e=>setNewAcademicYear({...newAcademicYear, name: e.target.value})} style={{width:'100%',marginBottom:8,padding:8,borderRadius:6,border:'1px solid #e6eef8'}} />
            <select value={newAcademicYear.parity} onChange={e=>setNewAcademicYear({...newAcademicYear, parity: e.target.value})} style={{width:'100%',marginBottom:8,padding:8,borderRadius:6,border:'1px solid #e6eef8'}}>
              <option value="ODD">Odd</option>
              <option value="EVEN">Even</option>
            </select>
            <label style={{display:'block',marginBottom:8}}><input type="checkbox" checked={newAcademicYear.is_active} onChange={e=>setNewAcademicYear({...newAcademicYear, is_active: e.target.checked})} /> <span style={{marginLeft:8}}>Activate on create</span></label>
            <div>
              <button onClick={createAcademicYear} style={{padding:'8px 12px', background:'#4f46e5', color:'#fff', border:'none', borderRadius:6}}>Create Academic Year</button>
            </div>
          </div>

          <h4 style={{marginTop:6}}>Existing Years</h4>
          <ul style={{paddingLeft:12}}>
            {academicYears.map((ay:any)=> (
              <li key={ay.id} style={{marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:600}}>{ay.name} {ay.parity? `(${ay.parity})`:''} {ay.is_active? <span style={{color:'#059669'}}>• active</span> : null}</div>
                </div>
                <div>
                  <button onClick={()=>toggleAcademicYear(ay.id, !ay.is_active)} style={{padding:'6px 8px', borderRadius:6, border:'1px solid #ddd'}}>{ay.is_active? 'Deactivate':'Activate'}</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div style={{flex:1}}>
          <div style={{background:'#fff', padding:16, borderRadius:10, boxShadow:'0 2px 8px #e5e7eb'}}>
            <h4 style={{marginTop:0}}>Selected Template</h4>
            {!selected && <div style={{color:'#6b7280'}}>Select a template to manage its periods.</div>}
            {selected && (
              <div>
                <div style={{marginBottom:8}}><strong style={{fontSize:16}}>{selected.name}</strong> — <span style={{color:'#6b7280'}}>{selected.parity}</span> {selected.is_active? <span style={{color:'#059669'}}> (active)</span>:''}</div>
                <div style={{marginBottom:12, color:'#374151'}}>{selected.description}</div>

                <h5 style={{marginTop:8}}>Periods</h5>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%', borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{background:'linear-gradient(90deg,#f8fafc,#eef2ff)', textAlign:'left', borderBottom:'2px solid #e6eef8'}}>
                        <th style={{padding:'10px 8px', color:'#3730a3', fontWeight:700}}>Label</th>
                        <th style={{padding:'10px 8px', color:'#3730a3', fontWeight:700}}>Start</th>
                        <th style={{padding:'10px 8px', color:'#3730a3', fontWeight:700}}>End</th>
                        <th style={{padding:'10px 8px', color:'#3730a3', fontWeight:700}}>Flags</th>
                        <th style={{padding:'10px 8px', color:'#3730a3', fontWeight:700}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.periods||[]).map((p:any)=> (
                        <tr key={p.id}>
                          <td style={{padding:'10px 8px', borderBottom:'1px solid #f3f4f6'}}>{p.label}</td>
                          <td style={{padding:'10px 8px', borderBottom:'1px solid #f3f4f6'}}>{p.start_time||'–'}</td>
                          <td style={{padding:'10px 8px', borderBottom:'1px solid #f3f4f6'}}>{p.end_time||'–'}</td>
                          <td style={{padding:'10px 8px', borderBottom:'1px solid #f3f4f6'}}>{p.is_break? 'Break': p.is_lunch? 'Lunch': ''}</td>
                          <td style={{padding:'10px 8px', borderBottom:'1px solid #f3f4f6'}}><button onClick={()=>deleteSlot(p.id)} style={{padding:'6px 8px', borderRadius:6, border:'1px solid #eee'}}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h5 style={{marginTop:12}}>Add Period</h5>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                  <input type="number" value={newSlot.index} onChange={e=>setNewSlot({...newSlot, index: Number(e.target.value)})} style={{width:90,padding:8,borderRadius:6,border:'1px solid #e6eef8'}} />
                  <input type="time" value={newSlot.start_time} onChange={e=>setNewSlot({...newSlot, start_time: e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #e6eef8'}} />
                  <input type="time" value={newSlot.end_time} onChange={e=>setNewSlot({...newSlot, end_time: e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #e6eef8'}} />
                  <input placeholder="Label" value={newSlot.label} onChange={e=>setNewSlot({...newSlot, label: e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #e6eef8'}} />
                </div>
                <div style={{marginBottom:8}}>
                  <label style={{marginRight:12}}><input type="checkbox" checked={newSlot.is_break} onChange={e=>setNewSlot({...newSlot, is_break: e.target.checked, is_lunch: false})} /> <span style={{marginLeft:8}}>Break</span></label>
                  <label><input type="checkbox" checked={newSlot.is_lunch} onChange={e=>setNewSlot({...newSlot, is_lunch: e.target.checked, is_break: false})} /> <span style={{marginLeft:8}}>Lunch</span></label>
                </div>
                <div>
                  <button onClick={addSlot} style={{padding:'8px 12px', background:'#059669', color:'#fff', border:'none', borderRadius:6}}>Add Period</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
