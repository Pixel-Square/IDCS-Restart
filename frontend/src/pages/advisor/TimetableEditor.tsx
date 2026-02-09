import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Calendar, Clock, BookOpen, Users, Edit, Trash2, Plus, X, Save, AlertCircle, GraduationCap } from 'lucide-react'

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
  const [specialDate, setSpecialDate] = useState<string | null>((new Date()).toISOString().slice(0,10))
  const [specialTimetables, setSpecialTimetables] = useState<any[]>([])
  const [selectedSpecialId, setSelectedSpecialId] = useState<number | null>(null)
  const [specialName, setSpecialName] = useState<string>('')
  const [customSubjectText, setCustomSubjectText] = useState<string>('')

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
      // fetch existing special timetables for this section
      fetchWithAuth(`/api/timetable/special-timetables/?section_id=${sectionId}`).then(r=>{
        if(!r.ok) return []
        return r.json()
      }).then(d=> setSpecialTimetables(d.results || []))
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

  // Compute ISO date (YYYY-MM-DD) for the current week's weekday (1=Mon .. 7=Sun)
  function dateForDayIndex(dayIndex:number){
    const today = new Date()
    const jsDay = today.getDay() // 0 Sun .. 6 Sat
    // find Monday of current week
    const monday = new Date(today)
    const diffToMonday = jsDay === 0 ? -6 : (1 - jsDay)
    monday.setDate(today.getDate() + diffToMonday)
    const target = new Date(monday)
    target.setDate(monday.getDate() + (dayIndex - 1))
    return target.toISOString().slice(0,10)
  }

  async function handleAssign(day:number, periodId:number, curriculumId:number){
    if(!curriculumId || !sectionId) return alert('Select a curriculum row and section first')
    const payload: any = { period_id: periodId, day, section_id: sectionId, curriculum_row: curriculumId }
    // include subject_batch if selected in the editor
    if(editingBatchId) payload.subject_batch_id = editingBatchId
    const res = await fetchWithAuth('/api/timetable/assignments/', { method: 'POST', body: JSON.stringify(payload) })
    if(!res.ok){ const txt = await res.text(); return alert('Failed: '+txt) }
    
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

  function renderCell(dayIndex:number, p:any){
    if(p.is_break || p.is_lunch){
      return (
        <div className="flex items-center justify-center py-2">
          <span className="text-sm text-gray-500 italic">{p.label || (p.is_break? 'Break' : 'Lunch')}</span>
        </div>
      )
    }
    const assigned = assignmentMap[dayIndex] && assignmentMap[dayIndex][p.id]
    return (
      <div>
        {assigned && assigned.length ? (
          <div className="space-y-2">
            {assigned.map((asg:any, idx:number)=> (
              <div 
                key={idx} 
                className={`rounded-lg p-2.5 cursor-pointer transition-all hover:shadow-md ${
                  asg.is_special 
                    ? 'bg-amber-50 border border-amber-200 hover:border-amber-300' 
                    : 'bg-blue-50 border border-blue-200 hover:border-blue-300'
                }`}
                onClick={()=> { setEditingCell({ day: dayIndex, periodId: p.id }); setSpecialDate(dateForDayIndex(dayIndex)); setShowCellPopup(true) }}
              >
                <div className="font-semibold text-gray-900 text-xs leading-tight flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  {shortLabel(asg.curriculum_row || asg.subject_text)}
                  {asg.is_special && <span className="text-amber-600 ml-1">• Special</span>}
                </div>
                <div className="text-xs text-gray-700 mt-1 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Staff: {asg.staff?.username || '—'}{asg.subject_batch ? ` • Batch: ${asg.subject_batch.name}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div 
            className="py-4 text-gray-400 text-sm cursor-pointer hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex items-center justify-center gap-1"
            onClick={()=> { setEditingCell({ day: dayIndex, periodId: p.id }); setSpecialDate(dateForDayIndex(dayIndex)); setShowCellPopup(true) }}
          >
            <Plus className="h-4 w-4" />
            Click to assign…
          </div>
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

  async function handleDeleteSpecialEntry(rawId:string){
    if(!rawId) return
    if(!confirm('Delete this special period?')) return
    // rawId expected in form 'special-<id>' or numeric string
    let idStr = String(rawId)
    if(idStr.startsWith('special-')) idStr = idStr.replace('special-', '')
    const id = Number(idStr)
    if(!id) return alert('Invalid special entry id')
    try{
      const res = await fetchWithAuth(`/api/timetable/special-entries/${id}/`, { method: 'DELETE' })
      if(!res.ok){ const txt = await res.text(); return alert('Failed: '+txt) }
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
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3 text-white">
              <Calendar className="h-5 w-5" />
              <h3 className="text-lg font-semibold">
                Day {day} • {periodObj.label || `${periodObj.start_time||''} - ${periodObj.end_time||''}`}
              </h3>
            </div>
            <button 
              onClick={()=>{ setShowCellPopup(false); setEditingCell(null) }}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1.5 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="h-5 w-5 text-indigo-600" />
                  <h4 className="text-lg font-semibold text-gray-900">Existing Assignments</h4>
                </div>
                {assigned.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">No assignment yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assigned.map((a:any)=> (
                      <div 
                        key={a.id} 
                        className={`rounded-lg p-4 border-2 ${
                          a.is_special 
                            ? 'bg-amber-50 border-amber-200' 
                            : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <div className="font-bold text-gray-900 flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          {shortLabel(a.curriculum_row || a.subject_text)}
                          {a.is_special && <span className="text-amber-600 text-sm">• Special</span>}
                        </div>
                        <div className="text-sm text-gray-700 mt-2 flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {a.staff?.username || '—'}{a.subject_batch ? ` • Batch: ${a.subject_batch.name}` : ''}
                        </div>
                        {a.is_special && (
                          <div className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            Date: {a.date || ''} • {periodObj.label || `${periodObj.start_time || ''}${periodObj.start_time && periodObj.end_time ? ' - ' : ''}${periodObj.end_time || ''}`}
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button 
                            onClick={async ()=>{
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
                            }}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button 
                            onClick={()=> { if(a.is_special) { handleDeleteSpecialEntry(a.id) } else { handleDeleteAssignment(a.id) } }}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                          <button 
                            onClick={async ()=>{
                              if(!editingCurriculumId) return alert('Select new subject from right panel then click Update')
                              const payload:any = {}
                              if(editingCurriculumId) payload.curriculum_row = editingCurriculumId
                              if(editingBatchId !== null) payload.subject_batch_id = editingBatchId
                              await handleUpdateAssignment(a.id, payload)
                            }}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                          >
                            <Save className="h-3.5 w-3.5" />
                            Update
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Plus className="h-5 w-5 text-green-600" />
                  <h4 className="text-lg font-semibold text-gray-900">Assign / Edit</h4>
                </div>
                
                <div className="space-y-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                    <select 
                      value={editingCurriculumId || ''} 
                      onChange={async e=>{
                        const val = Number(e.target.value) || null
                        setEditingCurriculumId(val)
                        setEditingBatchId(null)
                        if(val){
                          await loadBatchesForCurriculum(val)
                        } else {
                          setEditingAvailableBatches([])
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select subject…</option>
                      {curriculum.map(c=> (
                        <option key={c.id} value={c.id}>{c.course_code} — {c.course_name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Batch (optional)</label>
                    <select 
                      value={editingBatchId || ''} 
                      onChange={e=> setEditingBatchId(Number(e.target.value) || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select batch (optional)</option>
                      {editingAvailableBatches.map(b=> (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <button 
                    onClick={async ()=>{
                      if(!editingCurriculumId) return alert('Select a subject')
                      await handleAssign(day, periodId, editingCurriculumId)
                      setShowCellPopup(false)
                      setEditingCell(null)
                    }}
                    className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Assign to Period
                  </button>
                </div>

                <div className="mt-6 border-t border-gray-200 pt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <h4 className="text-lg font-semibold text-gray-900">Mark Special Period</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">Create a date-specific override for this period.</p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Special timetable</label>
                      <select 
                        value={selectedSpecialId ?? ''} 
                        onChange={e=> setSelectedSpecialId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      >
                        <option value="">Create new…</option>
                        {specialTimetables.map(t=> (
                          <option key={t.id} value={t.id}>{t.name} {t.is_active? '': '(inactive)'}</option>
                        ))}
                      </select>
                      {!selectedSpecialId && (
                        <input 
                          placeholder="Name for new special timetable" 
                          value={specialName} 
                          onChange={e=> setSpecialName(e.target.value)}
                          className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
                      <input 
                        type="date" 
                        value={specialDate||''} 
                        onChange={e=> setSpecialDate(e.target.value || null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                      <select 
                        value={editingCurriculumId ?? ''} 
                        onChange={async e=>{
                          const val = Number(e.target.value) || null
                          setEditingCurriculumId(val)
                          setCustomSubjectText('')
                          setEditingBatchId(null)
                          if(val) await loadBatchesForCurriculum(val)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      >
                        <option value="">-- choose from section subjects --</option>
                        {curriculum.map(c=> (
                          <option key={c.id} value={c.id}>{c.course_code} — {c.course_name}</option>
                        ))}
                        <option value="-1">Custom text…</option>
                      </select>
                      {editingCurriculumId === -1 && (
                        <input 
                          placeholder="Custom subject text" 
                          value={customSubjectText} 
                          onChange={e=> setCustomSubjectText(e.target.value)}
                          className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                      )}
                    </div>

                    {editingAvailableBatches && editingAvailableBatches.length > 0 && editingCurriculumId && editingCurriculumId !== -1 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Batch (optional)</label>
                        <select 
                          value={editingBatchId || ''} 
                          onChange={e=> setEditingBatchId(Number(e.target.value) || null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        >
                          <option value="">None</option>
                          {editingAvailableBatches.map(b=> (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button 
                      onClick={async ()=>{
                        if(!specialDate) return alert('Select a date')
                        try{
                          let timetableId = selectedSpecialId
                          if(!timetableId){
                            const name = specialName || `Special - ${specialDate}`
                            const tRes = await fetchWithAuth('/api/timetable/special-timetables/', { method: 'POST', body: JSON.stringify({ name, section: sectionId, is_active: true }) })
                            if(!tRes.ok){ const txt = await tRes.text(); return alert('Failed to create special timetable: '+txt) }
                            const tData = await tRes.json()
                            timetableId = tData.id
                          }

                          const entryPayload: any = { timetable_id: timetableId, timetable: timetableId, date: specialDate, period_id: periodId, period: periodId }
                          if(editingCurriculumId && editingCurriculumId !== -1) entryPayload.curriculum_row = editingCurriculumId
                          if(editingCurriculumId === -1 && customSubjectText) entryPayload.subject_text = customSubjectText
                          if(editingBatchId) entryPayload.subject_batch_id = editingBatchId

                          const eRes = await fetchWithAuth('/api/timetable/special-entries/', { method: 'POST', body: JSON.stringify(entryPayload) })
                          if(!eRes.ok){ const txt = await eRes.text(); return alert('Failed to create special entry: '+txt) }
                          alert('Special period created')
                          await loadTimetable()
                          setShowCellPopup(false)
                          setEditingCell(null)
                        }catch(err){ console.error(err); alert('Failed to create special entry') }
                      }}
                      className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 font-medium"
                    >
                      <AlertCircle className="h-4 w-4" />
                      Mark Special Period
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
                <Calendar className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Timetable Editor</h1>
                <p className="text-gray-600">Manage class schedules and assignments</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-indigo-600" />
                  <span className="font-semibold text-indigo-900">
                    {(sections.find(x=>x.id===sectionId)||{name:'Section'}).name}
                  </span>
                </div>
              </div>
              {templateId && (
                <div className="px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      {(templates.find(t=>t.id===templateId)||{name:'Template'}).name}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timetable Grid */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Weekly Schedule</h3>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-blue-50 border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 min-w-[120px] sticky left-0 bg-gradient-to-r from-slate-50 to-blue-50 z-10">
                    Day / Period
                  </th>
                  {periods.map(p=> (
                    <th key={p.id} className="px-4 py-3 min-w-[160px]">
                      <div className="text-sm font-bold text-indigo-700">
                        {p.label || `Period ${p.index || ''}`}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {p.start_time ? `${p.start_time}${p.end_time ? ' - ' + p.end_time : ''}` : (p.is_break? 'Break' : '')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {DAYS.map((d,di)=> (
                  <tr key={d} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-900 bg-gray-50 sticky left-0 z-10">{d}</td>
                    {periods.map(p=> {
                      const isSelected = editingCell && editingCell.day === (di+1) && editingCell.periodId === p.id
                      return (
                        <td 
                          key={p.id} 
                          className={`px-4 py-3 align-top ${
                            isSelected ? 'bg-indigo-50 border-2 border-indigo-300 shadow-md' : ''
                          }`}
                        >
                          {renderCell(di+1, p)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Subjects & Staff Reference */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Subjects & Staff Reference</h3>
            </div>
          </div>
          
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Subject</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subjectStaffList.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-6 py-8 text-center">
                      <BookOpen className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">No subjects found</p>
                    </td>
                  </tr>
                ) : (
                  subjectStaffList.map((r:any) => (
                    <tr key={String(r.id)} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-indigo-600" />
                          {r.course_code ? `${r.course_code} — ${r.course_name}` : r.course_name}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-500" />
                          {r.staff || '—'}
                        </div>
                      </td>
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
