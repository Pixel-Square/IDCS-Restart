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

export default function StudentTimetable(){
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [timetable, setTimetable] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [studentId, setStudentId] = useState<number | null>(null)

  useEffect(()=>{ fetchProfile() }, [])

  async function fetchProfile(){
    try{
      const res = await fetchWithAuth('/api/accounts/me/')
      if(!res.ok) throw new Error(await res.text())
      const me = await res.json()
      const prof = me.profile || {}
      setStudentId(me.id)
      if(prof.section_id) setSectionId(prof.section_id)
    }catch(e){ console.error(e) }
  }

  useEffect(()=>{
    if(!sectionId) return
    setLoading(true)
    ;(async ()=>{
      try{
        const res = await fetchWithAuth(`/api/timetable/section/${sectionId}/timetable/`)
        if(!res.ok) throw new Error(await res.text())
        const data = await res.json()
        let tt = data.results || []
        // Attempt to resolve missing subject_batch for this student by
        // fetching subject-batches for curriculum rows referenced in the
        // timetable and matching the current student.
        try{
          const needs = new Set<number>()
          for(const d of tt){
            for(const a of (d.assignments||[])){
              if(!a.subject_batch && a.curriculum_row && a.curriculum_row.id) needs.add(a.curriculum_row.id)
            }
          }
          if(studentId && needs.size){
            const crIds = Array.from(needs)
            const crToBatch: Record<number, any> = {}
            await Promise.all(crIds.map(async (crId) => {
              try{
                const sres = await fetchWithAuth(`/api/academics/subject-batches/?page_size=0&curriculum_row_id=${crId}`)
                if(!sres.ok) return
                const sdata = await sres.json()
                const batches = sdata.results || sdata || []
                for(const b of batches){
                  if(Array.isArray(b.students) && b.students.find((s:any) => s.id === studentId)){
                    crToBatch[crId] = b
                    break
                  }
                }
              }catch(e){ /* ignore per-batch failures */ }
            }))
            if(Object.keys(crToBatch).length){
              for(const d of tt){
                for(const a of (d.assignments||[])){
                  if(!a.subject_batch && a.curriculum_row && a.curriculum_row.id){
                    const b = crToBatch[a.curriculum_row.id]
                    if(b) a.subject_batch = { id: b.id, name: b.name }
                  }
                }
              }
            }
          }
        }catch(e){ console.error('resolve student batches failed', e) }

        setTimetable(tt)
        // derive periods from first day's assignments or ask templates endpoint
        const pset = [] as any[]
        for(const d of (tt||[])){
          for(const a of (d.assignments||[])){
            if(!pset.find(x=> x.id === a.period_id)) pset.push({ id: a.period_id, index: a.period_index, is_break: a.is_break, label: a.label })
          }
        }
        pset.sort((a,b)=> (a.index||0)-(b.index||0))
        setPeriods(pset)
      }catch(e){ console.error(e) }
      finally{ setLoading(false) }
    })()
  },[sectionId])

  return (
    <div style={{padding:20}}>
      <h2>My Timetable</h2>
      {loading && <div>Loading…</div>}
      {!sectionId && <div>You are not assigned to a section or your profile is incomplete.</div>}
      {sectionId && (
        <div>
          <table style={{borderCollapse:'collapse', width:'100%'}}>
            <thead>
                <tr>
                <th style={{border:'1px solid #ddd', padding:8}}>Day / Period</th>
                {periods.map(p=> (
                  <th key={`period-${p.id}`} style={{border:'1px solid #ddd', padding:8}}>
                    {p.is_break || p.is_lunch ? (p.label || (p.is_break ? 'Break' : 'Lunch')) : (p.label || `${p.start_time || ''}${p.start_time && p.end_time ? ' - ' : ''}${p.end_time || ''}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d,di)=> (
                <tr key={`day-${di}`}> 
                  <td style={{border:'1px solid #ddd', padding:8}}>{d}</td>
                  {periods.map(p=> {
                    // find assignment for day+period
                    const dayObj = timetable.find(x=> x.day === di+1) || { assignments: [] }
                      const assignments = (dayObj.assignments||[]).filter((x:any)=> x.period_id === p.id)
                    return (
                      <td key={`cell-${di}-${p.id}`} style={{border:'1px solid #ddd', padding:8}}>
                        {p.is_break ? <em style={{color:'#666'}}>{p.label||'Break'}</em> : (
                            assignments && assignments.length ? (
                            <div>
                                {assignments.map((a:any, i:number)=> (
                                  <div key={`${a.id || a.curriculum_row?.id || i}`} style={{marginBottom:8}}>
                                    <div style={{fontWeight:600}}>{shortLabel(a.curriculum_row || a.subject_text)}</div>
                                    <div style={{fontSize:12, color:'#333'}}>Staff: {a.staff?.username || '—'}</div>
                                    {a.subject_batch && <div style={{fontSize:12, color:'#333'}}>Batch: {a.subject_batch.name}</div>}
                                  </div>
                                ))}
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
      )}
    </div>
  )
}
