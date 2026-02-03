import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function TimetableEditor(){
  const [sections, setSections] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [curriculum, setCurriculum] = useState<any[]>([])
  const [timetable, setTimetable] = useState<any[]>([])
  const [editingCell, setEditingCell] = useState<{day:number, periodId:number} | null>(null)

  useEffect(()=>{
    // Advisors don't have access to the HOD sections endpoint; use my-students
    fetchWithAuth('/api/academics/my-students/')
      .then(r=>{
        if(!r.ok) return []
        return r.json()
      }).then(d=>{
        const secs = (d.results || []).map((entry:any) => ({ id: entry.section_id, name: entry.section_name, batch: '' }))
        setSections(secs)
        // auto-select first section so advisor doesn't need manual selection
        if(!sectionId && secs.length > 0){
          setSectionId(secs[0].id)
        }
      })
    fetchWithAuth('/api/timetable/templates/')
      .then(r=>r.json()).then(d=>{
        const list = d || []
        setTemplates(list)
        const active = list.find((t:any)=> t.is_active) || list[0]
        if(active){
          setTemplateId(active.id)
          setPeriods(active.periods || [])
        }
      })
  },[])

  useEffect(()=>{
    if(sectionId){
      fetchWithAuth(`/api/timetable/curriculum-for-section/?section_id=${sectionId}`)
        .then(r=>r.json()).then(d=>setCurriculum(d.results || []))
      fetchWithAuth(`/api/timetable/section/${sectionId}/timetable/`)
        .then(r=>r.json()).then(d=>setTimetable(d.results || []))
    }
  },[sectionId])

  // build a map of existing assignments for quick lookup: map[day][period_id]
  const assignmentMap: Record<number, Record<number, any>> = {}
  for(const dayObj of timetable){
    const day = dayObj.day
    assignmentMap[day] = assignmentMap[day] || {}
    for(const a of (dayObj.assignments||[])){
      assignmentMap[day][a.period_id] = a
    }
  }

  // Short label for cell display: prefer course_code, else abbreviated subject_text
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

  async function handleAssign(day:number, periodId:number, curriculumId:number){
    if(!curriculumId || !sectionId) return alert('Select a curriculum row and section first')
    const payload = { period_id: periodId, day, section_id: sectionId, curriculum_row: curriculumId }
    const res = await fetchWithAuth('/api/timetable/assignments/', { method: 'POST', body: JSON.stringify(payload) })
    if(!res.ok){ const txt = await res.text(); return alert('Failed: '+txt) }
    // optimistic update: prefer using returned object if available
    let newAssign = null
    try{ newAssign = await res.json() }catch(e){ newAssign = null }

    // create an assignment object consistent with SectionTimetableView shape
    const periodObj = periods.find(p=> p.id === periodId) || {}
    const curriculumRow = curriculum.find(c=> c.id === curriculumId) || null
    const assignmentObj = newAssign && newAssign.id ? {
      period_index: periodObj.index || null,
      period_id: periodId,
      start_time: periodObj.start_time || null,
      end_time: periodObj.end_time || null,
      is_break: periodObj.is_break || false,
      label: periodObj.label || null,
      curriculum_row: newAssign.curriculum_row || (curriculumRow? { id: curriculumRow.id, course_code: curriculumRow.course_code, course_name: curriculumRow.course_name } : null),
      subject_text: newAssign.subject_text || null,
      staff: newAssign.staff || null,
    } : {
      period_index: periodObj.index || null,
      period_id: periodId,
      start_time: periodObj.start_time || null,
      end_time: periodObj.end_time || null,
      is_break: periodObj.is_break || false,
      label: periodObj.label || null,
      curriculum_row: curriculumRow? { id: curriculumRow.id, course_code: curriculumRow.course_code, course_name: curriculumRow.course_name } : null,
      subject_text: null,
      staff: null,
    }

    setTimetable(prev=>{
      // clone
      const next = JSON.parse(JSON.stringify(prev || []))
      let dayEntry = next.find(x=> x.day === day)
      if(!dayEntry){
        dayEntry = { day, assignments: [] }
        next.push(dayEntry)
      }
      // replace existing assignment for the same period if present
      const existingIndex = (dayEntry.assignments||[]).findIndex(a=> a.period_id === periodId)
      if(existingIndex >= 0) dayEntry.assignments.splice(existingIndex, 1, assignmentObj)
      else dayEntry.assignments.push(assignmentObj)
      // sort assignments by period_index
      dayEntry.assignments.sort((a:any,b:any)=> (a.period_index||0) - (b.period_index||0))
      // ensure days sorted
      next.sort((a:any,b:any)=> a.day - b.day)
      return next
    })
  }

  return (
    <div style={{padding:20}}>
      <h2>Timetable Editor (Advisor)</h2>
      <div style={{display:'flex',gap:12,marginBottom:12,alignItems:'center'}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{padding:'8px 12px', border:'1px solid #ddd', borderRadius:4}}>{(sections.find(x=>x.id===sectionId)||{name:'Section'}).name}</div>
        </div>

        {/* Template is selected automatically (active template) */}
        {templateId ? <div style={{padding:'8px 12px', border:'1px solid #ddd', borderRadius:4}}>{(templates.find(t=>t.id===templateId)||{name:'Template'}).name}</div> : null}
      </div>

      <div style={{display:'flex',gap:20}}>
        <div style={{minWidth:300}}>
          <h4>Periods (Template)</h4>
          <ul>
            {periods.map(p=> (
              <li key={p.id}>#{p.index} {p.label||''} {p.start_time||''} - {p.end_time||''}</li>
            ))}
          </ul>

          <h4>Curriculum (fixed)</h4>
          <div style={{maxHeight:300, overflowY:'auto', border:'1px solid #eee', padding:8}}>
            {curriculum.length === 0 ? <div style={{color:'#666'}}>No curriculum rows found for this section.</div> : (
              <ol style={{margin:0,paddingLeft:16}}>
                {curriculum.map(c=> (
                  <li key={c.id} style={{marginBottom:6}}>{c.course_code} — {c.course_name}</li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div style={{flex:1}}>
          <h4>Timetable View</h4>
          <table style={{borderCollapse:'collapse'}}>
            <thead>
                <tr>
                <th style={{border: '1px solid #ddd', padding:6}}>Day / Period</th>
                {periods.map(p=> (
                      <th key={p.id} style={{border: '1px solid #ddd', padding:6}}>
                        {p.is_break || p.is_lunch ? (p.label || (p.is_break ? 'Break' : 'Lunch')) : (p.label || `${p.start_time || ''}${p.start_time && p.end_time ? ' - ' : ''}${p.end_time || ''}`)}
                      </th>
                    ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d,di)=> (
                <tr key={d}>
                  <td style={{border: '1px solid #ddd', padding:6}}>{d}</td>
                  {periods.map(p=> (
                    <td key={p.id} style={{border: '1px solid #ddd', padding:6, verticalAlign: 'top'}}>
                      {p.is_break || p.is_lunch ? (
                        <div style={{fontStyle:'italic', color:'#666'}}>{p.label || (p.is_break? 'Break' : 'Lunch')}</div>
                      ) : (
                        <div>
                          {assignmentMap[di+1] && assignmentMap[di+1][p.id] ? (
                            <div style={{marginBottom:6, cursor:'pointer'}} onClick={()=> setEditingCell({ day: di+1, periodId: p.id })}>
                              <strong>{shortLabel(assignmentMap[di+1][p.id].curriculum_row || assignmentMap[di+1][p.id].subject_text)}</strong>
                              <div style={{fontSize:12, color:'#333'}}>Staff: {assignmentMap[di+1][p.id].staff?.username || '—'}</div>
                            </div>
                          ) : (
                            <div style={{marginBottom:6, color:'#999', cursor:'pointer'}} onClick={()=> setEditingCell({ day: di+1, periodId: p.id })}>Click to assign…</div>
                          )}

                          {editingCell && editingCell.day === di+1 && editingCell.periodId === p.id ? (
                            <select
                              autoFocus
                              onChange={e=> {
                                const val = Number(e.target.value)
                                if(val) handleAssign(di+1, p.id, val)
                                setEditingCell(null)
                              }}
                              onBlur={()=> setEditingCell(null)}
                              defaultValue=""
                            >
                              <option value="">Select subject...</option>
                              {curriculum.map(c=> (
                                <option key={c.id} value={c.id}>{c.course_code} — {c.course_name}</option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
