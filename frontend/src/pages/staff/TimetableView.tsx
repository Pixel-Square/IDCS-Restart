import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

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
      const res = await fetchWithAuth('/api/timetable/staff/')
      if(!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTimetable(data.results || [])
      const pset: any[] = []
      for(const d of (data.results||[])){
        for(const a of (d.assignments||[])){
          if(!pset.find(x=> x.period_id === a.period_id)) pset.push({ id: a.period_id, index: a.period_index, is_break: a.is_break, label: a.label })
        }
      }
      pset.sort((a,b)=> (a.index||0)-(b.index||0))
      setPeriods(pset)
    }catch(e){ console.error(e) }
    finally{ setLoading(false) }
  }

  return (
    <div style={{padding:20}}>
      <h2>My Timetable</h2>
      {loading && <div>Loading…</div>}
      <div>
        <table style={{borderCollapse:'collapse', width:'100%'}}>
          <thead>
            <tr>
              <th style={{border:'1px solid #ddd', padding:8}}>Day / Period</th>
              {periods.map(p=> (
                <th key={p.id} style={{border:'1px solid #ddd', padding:8}}>
                  {p.is_break || p.is_lunch ? (p.label || (p.is_break ? 'Break' : 'Lunch')) : (p.label || `${p.start_time || ''}${p.start_time && p.end_time ? ' - ' : ''}${p.end_time || ''}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d,di)=> (
              <tr key={d}>
                <td style={{border:'1px solid #ddd', padding:8}}>{d}</td>
                {periods.map(p=> {
                  const dayObj = timetable.find(x=> x.day === di+1) || { assignments: [] }
                  const a = (dayObj.assignments||[]).find((x:any)=> x.period_id === p.id)
                  return (
                    <td key={p.id} style={{border:'1px solid #ddd', padding:8}}>
                      {p.is_break ? <em style={{color:'#666'}}>{p.label||'Break'}</em> : (
                        a ? (
                          <div>
                            <div style={{fontWeight:600}}>{shortLabel(a.curriculum_row || a.subject_text)}</div>
                            <div style={{fontSize:12, color:'#333'}}>Section: {a.section?.name || a.section?.id || '—'}</div>
                          </div>
                        ) : <div style={{color:'#999'}}>—</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
