import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import './TimetableEditor.css'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function TimetableEditor(){
  const [sections, setSections] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [curriculum, setCurriculum] = useState<any[]>([])
  const [timetable, setTimetable] = useState<any[]>([])
  const [subjectStaffList, setSubjectStaffList] = useState<any[]>([])
  const [editingCell, setEditingCell] = useState<{day:number, periodId:number} | null>(null)
  const [editingCurriculumId, setEditingCurriculumId] = useState<number | null>(null)
  const [editingAvailableBatches, setEditingAvailableBatches] = useState<any[]>([])
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null)
  const [showCellPopup, setShowCellPopup] = useState(false)

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
      loadTimetable()
      // fetch aggregated subjects + staff for this section
      fetchWithAuth(`/api/timetable/section/${sectionId}/subjects-staff/`).then(r=>{
        if(!r.ok) return []
        return r.json()
      }).then(d=> setSubjectStaffList(d.results || []))
    }
  },[sectionId])

  async function loadTimetable(){
    if(!sectionId) return
    try{
      const res = await fetchWithAuth(`/api/timetable/section/${sectionId}/timetable/`)
      if(!res.ok) return
      const d = await res.json()
      setTimetable(d.results || [])
    }catch(e){ console.error('loadTimetable failed', e) }
  }

  // build a map of existing assignments for quick lookup: map[day][period_id]
  const assignmentMap: Record<number, Record<number, any>> = {}
  for(const dayObj of timetable){
    const day = dayObj.day
    assignmentMap[day] = assignmentMap[day] || {}
    for(const a of (dayObj.assignments||[])){
      assignmentMap[day][a.period_id] = assignmentMap[day][a.period_id] || []
      assignmentMap[day][a.period_id].push(a)
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
    const payload: any = { period_id: periodId, day, section_id: sectionId, curriculum_row: curriculumId }
    // include subject_batch if selected in the editor
    if(editingBatchId) payload.subject_batch_id = editingBatchId
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

    // reset editor state
    setEditingCurriculumId(null)
    setEditingAvailableBatches([])
    setEditingBatchId(null)
    // reload from server to pick up resolved staff/subject_batch fields
    await loadTimetable()
  }

  async function loadBatchesForCurriculum(curriculumId:number | null){
    setEditingAvailableBatches([])
    if(!curriculumId) return []
    try{
      const bres = await fetchWithAuth(`/api/academics/subject-batches/?curriculum_row_id=${curriculumId}&page_size=0&include_all=1`)
      if(bres.ok){
        const bd = await bres.json()
        const list = bd.results || bd || []
        setEditingAvailableBatches(list)
        return list
      }
    }catch(e){ console.error('loadBatches failed', e) }
    return []
  }

  function renderBatchSelector(day:number, period:any){
    if(!editingAvailableBatches || editingAvailableBatches.length === 0) return null
    if(!editingCell || editingCell.day !== day || editingCell.periodId !== period.id) return null
    return (
      <div style={{marginTop:8}}>
        <select value={editingBatchId || ''} onChange={e=> setEditingBatchId(Number(e.target.value) || null)}>
          <option value="">Select batch (or leave blank)</option>
          {editingAvailableBatches.map(b=> (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button type="button" onClick={async ()=>{ await handleAssign(day, period.id, (editingCurriculumId as number)); setEditingCell(null) }} style={{marginLeft:8}}>Assign with batch</button>
      </div>
    )
  }

  function renderCell(dayIndex:number, p:any){
    if(p.is_break || p.is_lunch){
      return <div style={{fontStyle:'italic', color:'#666'}}>{p.label || (p.is_break? 'Break' : 'Lunch')}</div>
    }
    const assigned = assignmentMap[dayIndex] && assignmentMap[dayIndex][p.id]
    return (
      <div>
        {assigned && assigned.length ? (
          <div style={{marginBottom:6}}>
            {assigned.map((asg:any, idx:number)=> (
              <div key={idx} style={{marginBottom:6, cursor:'pointer'}} onClick={()=> { setEditingCell({ day: dayIndex, periodId: p.id }); setShowCellPopup(true) }}>
                <strong>{shortLabel(asg.curriculum_row || asg.subject_text)}</strong>
                <div style={{fontSize:12, color:'#333'}}>
                  Staff: {asg.staff?.username || '—'}{asg.subject_batch ? ` • Batch: ${asg.subject_batch.name}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{marginBottom:6, color:'#999', cursor:'pointer'}} onClick={()=> { setEditingCell({ day: dayIndex, periodId: p.id }); setShowCellPopup(true) }}>Click to assign…</div>
        )}
      </div>
    )
  }

  // API helpers for update and delete
  async function handleDeleteAssignment(assignId:number){
    if(!assignId) return
    if(!confirm('Delete this assignment?')) return
    try{
      const res = await fetchWithAuth(`/api/timetable/assignments/${assignId}/`, { method: 'DELETE' })
      if(!res.ok) { const txt = await res.text(); return alert('Failed: '+txt) }
      // reload to reflect current assignments
      await loadTimetable()
    }catch(e){ console.error(e); alert('Delete failed') }
  }

  async function handleUpdateAssignment(assignId:number, payload:any){
    if(!assignId) return
    try{
      const res = await fetchWithAuth(`/api/timetable/assignments/${assignId}/`, { method: 'PATCH', body: JSON.stringify(payload) })
      if(!res.ok){ const txt = await res.text(); return alert('Failed: '+txt) }
      await loadTimetable()
      setShowCellPopup(false)
      setEditingCell(null)
    }catch(e){ console.error(e); alert('Update failed') }
  }

  function CellPopup(){
    if(!editingCell) return null
    const day = editingCell.day
    const periodId = editingCell.periodId
    const assigned = assignmentMap[day] && assignmentMap[day][periodId] || []
    const periodObj = periods.find(p=> p.id === periodId) || {}
    return (
      <div style={{position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.3)', zIndex:1400}}>
        <div style={{background:'#fff', padding:16, width:680, borderRadius:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div>
              <strong>Day {day} • {periodObj.label || `${periodObj.start_time||''} - ${periodObj.end_time||''}`}</strong>
            </div>
            <div>
              <button onClick={()=>{ setShowCellPopup(false); setEditingCell(null) }}>Close</button>
            </div>
          </div>

          <div style={{display:'flex',gap:12}}>
            <div style={{flex:1}}>
              <h4>Existing</h4>
              {assigned.length === 0 && <div style={{color:'#666'}}>No assignment</div>}
              {assigned.map((a:any)=> (
                <div key={a.id} style={{padding:8, border:'1px solid #eee', marginBottom:8}}>
                  <div style={{fontWeight:700}}>{shortLabel(a.curriculum_row || a.subject_text)}</div>
                  <div style={{fontSize:13, color:'#666'}}>{a.staff?.username || '—'}{a.subject_batch ? ` • Batch: ${a.subject_batch.name}` : ''}</div>
                  <div style={{marginTop:8, display:'flex', gap:8}}>
                    <button onClick={async ()=>{
                      const crid = a.curriculum_row?.id || null
                      const existingBatchId = a.subject_batch?.id || null
                      setEditingCurriculumId(crid)
                      setEditingBatchId(existingBatchId)
                      if(crid){
                        const list = await loadBatchesForCurriculum(crid)
                        if(existingBatchId && !list.find((b:any)=> b.id === existingBatchId)){
                          try{
                            const pres = await fetchWithAuth(`/api/academics/subject-batches/${existingBatchId}/`)
                            if(pres.ok){
                              const pb = await pres.json()
                              setEditingAvailableBatches(prev => {
                                if(prev.find(x=> x.id === pb.id)) return prev
                                return [...prev, pb]
                              })
                            }
                          }catch(e){ console.error('failed to load existing batch', e) }
                        }
                      } else if(existingBatchId){
                        try{
                          const pres = await fetchWithAuth(`/api/academics/subject-batches/${existingBatchId}/`)
                          if(pres.ok){
                            const pb = await pres.json()
                            setEditingAvailableBatches(prev => {
                              if(prev.find(x=> x.id === pb.id)) return prev
                              return [...prev, pb]
                            })
                          }
                        }catch(e){ console.error('failed to load existing batch', e) }
                      }
                    }}>Edit</button>
                    <button onClick={()=> handleDeleteAssignment(a.id)}>Delete</button>
                    <button onClick={async ()=>{
                      if(!editingCurriculumId) return alert('Select new subject from right panel then click Update')
                      const payload:any = {}
                      if(editingCurriculumId) payload.curriculum_row = editingCurriculumId
                      if(editingBatchId !== null) payload.subject_batch_id = editingBatchId
                      await handleUpdateAssignment(a.id, payload)
                    }}>Update</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{width:300}}>
              <h4>Assign / Edit</h4>
              <div>
                <select value={editingCurriculumId || ''} onChange={async e=>{
                  const val = Number(e.target.value) || null
                  setEditingCurriculumId(val)
                  setEditingBatchId(null)
                  if(val){
                    await loadBatchesForCurriculum(val)
                  } else {
                    setEditingAvailableBatches([])
                  }
                }}>
                  <option value="">Select subject…</option>
                  {curriculum.map(c=> (
                    <option key={c.id} value={c.id}>{c.course_code} — {c.course_name}</option>
                  ))}
                </select>
              </div>
              <div style={{marginTop:8}}>
                <select value={editingBatchId || ''} onChange={e=> setEditingBatchId(Number(e.target.value) || null)}>
                  <option value="">Select batch (optional)</option>
                  {editingAvailableBatches.map(b=> (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div style={{marginTop:12, display:'flex', gap:8}}>
                <button onClick={async ()=>{
                  if(!editingCurriculumId) return alert('Select a subject')
                  await handleAssign(day, periodId, editingCurriculumId)
                  setShowCellPopup(false)
                  setEditingCell(null)
                }}>Assign</button>
                <button onClick={async ()=>{
                  if(!editingCurriculumId) return alert('Select a subject')
                  await handleAssign(day, periodId, editingCurriculumId)
                  setShowCellPopup(false)
                  setEditingCell(null)
                }}>Assign (batch-wise)</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{padding:20}}>
      <h2 className="welcome-title">Timetable Editor (Advisor)</h2>
      <div style={{display:'flex',gap:12,marginBottom:12,alignItems:'center', justifyContent: 'space-between'}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div className="timetable-card" style={{display:'inline-block', padding:'8px 12px', fontWeight:700}}>{(sections.find(x=>x.id===sectionId)||{name:'Section'}).name}</div>
          {templateId ? <div className="timetable-card" style={{display:'inline-block', padding:'8px 12px'}}>{(templates.find(t=>t.id===templateId)||{name:'Template'}).name}</div> : null}
        </div>
      </div>

      <div style={{display:'flex',gap:20, flexDirection: 'column'}}>
        <div style={{flex:1}}>
          <h4 style={{marginTop:0}}>Timetable View</h4>
          <div className="timetable-container">
            <table className="timetable-table">
              <thead>
                <tr>
                  <th style={{width:140}}>Day / Period</th>
                  {periods.map(p=> (
                    <th key={p.id} style={{textAlign:'center'}}>
                      <div style={{fontSize:13, fontWeight:700}}>{p.label || `Period ${p.index || ''}`}</div>
                      <div style={{fontSize:12, color:'#444'}}>{p.start_time ? `${p.start_time}${p.end_time ? ' - ' + p.end_time : ''}` : (p.is_break? 'Break' : '')}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d,di)=> (
                  <tr key={d}>
                    <td style={{borderTop: '1px solid #f2f2f2', padding:10, fontWeight:700}}>{d}</td>
                    {periods.map(p=> (
                      <td key={p.id} style={{borderTop: '1px solid #f2f2f2', padding:10, verticalAlign: 'top'}}>
                        {renderCell(di+1, p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Subjects & Staff table below timetable */}
        <div className="subjects-staff-card">
          <h4 style={{marginTop:0}}>Subjects & Staff</h4>
          <div className="timetable-card" style={{padding:8, maxHeight:520, overflow:'auto', background:'#fff'}}>
            <table className="subjects-table" style={{width:'100%', borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <th style={{textAlign:'left', padding:8, borderBottom:'1px solid #f2f2f2'}}>Subject</th>
                  <th style={{textAlign:'left', padding:8, borderBottom:'1px solid #f2f2f2'}}>Staff</th>
                </tr>
              </thead>
              <tbody>
                {subjectStaffList.length === 0 ? (
                  <tr><td colSpan={2} style={{padding:8}}>No subjects found</td></tr>
                ) : (
                  subjectStaffList.map((r:any) => (
                    <tr key={String(r.id)}>
                      <td style={{padding:8, borderBottom:'1px solid #f7f7f7'}}>{r.course_code ? `${r.course_code} — ${r.course_name}` : r.course_name}</td>
                      <td style={{padding:8, borderBottom:'1px solid #f7f7f7'}}>{r.staff || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showCellPopup ? <CellPopup /> : null}
    </div>
  )
}
