import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat']

function shortLabel(item:any){
  if(!item) return ''
  if(typeof item === 'string'){
    const s = item.trim()
    if(s.length <= 12) return s
    return s.slice(0,12) + '…'
  }
  if(item.course_code) return item.course_code
  const txt = item.course_name || item.course || item.subject_text || ''
  const s = String(txt).trim()
  if(s.length <= 12) return s
  return s.split(' ').map(p=>p[0]).slice(0,3).join('') || s.slice(0,12)
}

export default function StaffTimetable(){
  const [timetable, setTimetable] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ load() }, [])

  async function load(){
    setLoading(true)
    try{
      // Fetch staff timetable
      const res = await fetchWithAuth('/api/timetable/staff/')
      if(!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTimetable(data.results || [])
      
      // Fetch template to get all periods including breaks/lunch
      const templateRes = await fetchWithAuth('/api/timetable/templates/')
      if(templateRes.ok){
        const templateData = await templateRes.json()
        const activeTemplate = templateData.find((t:any)=> t.is_active) || templateData[0]
        if(activeTemplate && activeTemplate.periods){
          setPeriods(activeTemplate.periods)
        } else {
          // Fallback: extract from assignments
          const pset: any[] = []
          for(const d of (data.results||[])){
            for(const a of (d.assignments||[])){
              if(!pset.find(x=> x.id === a.period_id)) pset.push({ id: a.period_id, index: a.period_index, is_break: a.is_break, is_lunch: a.is_lunch, label: a.label, start_time: a.start_time, end_time: a.end_time })
            }
          }
          pset.sort((a,b)=> (a.index||0)-(b.index||0))
          setPeriods(pset)
        }
      }
    }catch(e){ console.error(e) }
    finally{ setLoading(false) }
  }

  return (
    <div style={{padding:20}}>
      <div className="welcome" style={{ marginBottom: 24 }}>
        <div className="welcome-left">
          <svg className="welcome-icon" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0e7ff"/><path d="M16 24h16M16 32h16M16 16h16" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/></svg>
          <div>
            <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>My Timetable</h2>
            <div className="welcome-sub">View your assigned teaching schedule.</div>
          </div>
        </div>
      </div>
      {loading && <div style={{textAlign:'center', padding:20, color:'#6b7280'}}>Loading…</div>}
      {!loading && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{width:'100%', borderCollapse:'collapse', background:'#fff', borderRadius:10, boxShadow:'0 2px 8px #e5e7eb'}}>
            <thead>
              <tr style={{background:'linear-gradient(90deg,#f3f4f6,#e0e7ff)', textAlign:'left', borderBottom:'2px solid #d1d5db'}}>
                <th style={{padding:'12px 8px', color:'#3730a3', fontWeight:700}}>Day / Period</th>
                {periods.map(p=> (
                  <th key={p.id} style={{padding:'12px 8px', color:'#3730a3', fontWeight:700}}>
                    {p.label || `${p.start_time || ''}${p.start_time && p.end_time ? ' - ' : ''}${p.end_time || ''}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d,di)=> (
                <tr key={d}>
                  <td style={{padding:'10px 8px', borderBottom:'1px solid #f3f4f6', fontWeight:500}}>{d}</td>
                  {periods.map(p=> {
                    const dayObj = timetable.find(x=> x.day === di+1) || { assignments: [] }
                      const assignments = (dayObj.assignments||[]).filter((x:any)=> x.period_id === p.id)
                    return (
                      <td key={p.id} style={{padding:'10px 8px', borderBottom:'1px solid #f3f4f6', fontWeight:500}}>
                        {p.is_break || p.is_lunch ? (
                          <em style={{color:'#6b7280'}}>{p.label || (p.is_break ? 'Break' : 'Lunch')}</em>
                        ) : assignments && assignments.length ? (
                          <div>
                            {assignments.map((a:any, i:number)=> (
                              <div key={i} style={{marginBottom:8}}>
                                <div style={{fontWeight:600, color:'#1e293b'}}>{shortLabel(a.curriculum_row || a.subject_text)}</div>
                                <div style={{fontSize:13, color:'#6b7280', marginTop:2}}>Section: {a.section?.name || a.section?.id || '—'}</div>
                                {a.subject_batch && <div style={{fontSize:13, color:'#6b7280'}}>Batch: {a.subject_batch.name}</div>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{color:'#d1d5db'}}>—</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
