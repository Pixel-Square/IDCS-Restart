import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Calendar, Clock, BookOpen, Users, Edit, Trash2, Plus, X, Save, AlertCircle, GraduationCap } from 'lucide-react'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

// Stable CellPopup component outside main component to prevent recreation on every render
function CellPopup(props: any) {
  const {
    editingCell,
    periods,
    assignmentMap,
    specialName,
    setSpecialName,
    selectedSpecialId,
    setSelectedSpecialId,
    specialTimetables,
    specialDate,
    setSpecialDate,
    curriculum,
    currentSectionRegulation,
    editingCurriculumId,
    setEditingCurriculumId,
    customSubjectText,
    setCustomSubjectText,
    editingAvailableBatches,
    setEditingAvailableBatches,
    editingBatchId,
    setEditingBatchId,
    isCustomAssignment,
    setIsCustomAssignment,
    customAssignmentText,
    setCustomAssignmentText,
    selectedStaffId,
    setSelectedStaffId,
    staffList,
    sections,
    sectionId,
    shortLabel,
    loadBatchesForCurriculum,
    handleDeleteSpecialEntry,
    handleDeleteAssignment,
    handleUpdateAssignment,
    handleAssign,
    loadTimetable,
    setShowCellPopup,
    setEditingCell,
    fetchWithAuth,
    customSubjectOptions,
    setSectionId,
    setSectionDepartmentId,
    departments,
    deptCurriculum,
    setDeptCurriculum,
    isOtherDept,
    setIsOtherDept,
    selectedOtherDept,
    setSelectedOtherDept,
    setLastSelectedCurriculumRaw,
    otherDeptStaffList,
    setOtherDeptStaffList,
  } = props
  const [deptCurriculumError, setDeptCurriculumError] = useState<string | null>(null)
  const [specialSubjectType, setSpecialSubjectType] = useState<'curriculum' | 'custom' | 'otherdept' | 'event'>('curriculum')
  const [specialEventText, setSpecialEventText] = useState<string>('')
  


  if(!editingCell) return null
  const day = editingCell.day
  const periodId = editingCell.periodId
  const assigned = assignmentMap[day] && assignmentMap[day][periodId] || []
  const periodObj = periods.find((p: any) => p.id === periodId) || {}

  // Ensure we always work with arrays for curriculum sources
  const subjectSource: any[] = Array.isArray(selectedOtherDept ? deptCurriculum : curriculum)
    ? (selectedOtherDept ? deptCurriculum : curriculum)
    : (selectedOtherDept ? (deptCurriculum && (deptCurriculum.results || []) ) : (curriculum && (curriculum.results || [])))

  // helper: resolve curriculum_row id to use in payload. If item is an ElectiveSubject
  // it may have `parent` pointing to the department curriculum row — prefer that.
  function resolveCurriculumId(item:any){
    if(!item) return null
    // parent may be object or id
    if(item.parent && typeof item.parent === 'object' && item.parent.id) return item.parent.id
    if(item.parent) return item.parent
    if(item.parent_id) return item.parent_id
    return item.id
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
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
                        {a.is_special 
                          ? (a.timetable_name || 'Special')
                          : shortLabel(a.curriculum_row || a.subject_text)
                        }
                        {a.is_special && (
                          <span className="text-amber-600 text-sm">
                            • {shortLabel(a.curriculum_row || a.subject_text)}
                          </span>
                        )}
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
                                    setEditingAvailableBatches((prev: any) => {
                                      if(prev.find((x: any)=> x.id === pb.id)) return prev
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
                                  setEditingAvailableBatches((prev: any) => {
                                    if(prev.find((x: any)=> x.id === pb.id)) return prev
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Type</label>
                    <div className="flex gap-2 items-center">
                    <button
                      onClick={() => {
                        setIsCustomAssignment(false)
                        setIsOtherDept(false)
                        setCustomAssignmentText('')
                        setSelectedStaffId(null)
                        setSelectedOtherDept(null)
                      }}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                        (!isCustomAssignment && !isOtherDept) 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      From Curriculum
                    </button>
                    <button
                      onClick={() => {
                        setIsCustomAssignment(true)
                        setIsOtherDept(false)
                        setEditingCurriculumId(null)
                        setEditingBatchId(null)
                        setEditingAvailableBatches([])
                        setSelectedOtherDept(null)
                      }}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                        isCustomAssignment 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      Custom Subject
                    </button>
                                        <div className="ml-2">
                                          <button
                                            onClick={() => { setIsOtherDept(true); setIsCustomAssignment(false); setSelectedOtherDept(null) }}
                                            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${isOtherDept ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'}`}
                                          >
                                            Other Dept
                                          </button>
                                        </div>
                  </div>
                </div>

                {isOtherDept ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Dept</label>
                      <select
                        value={selectedOtherDept || ''}
                        onChange={async (e) => {
                          const val = Number(e.target.value) || null
                          if (!val) return
                          setDeptCurriculumError(null)
                          setDeptCurriculum([])
                          setSelectedOtherDept(val)
                          try {
                            const r = await fetchWithAuth(`/api/curriculum/?department=${val}&page_size=0`)
                            if (!r.ok) {
                              console.debug('dept curriculum fetch failed', { status: r.status, url: `/api/curriculum/?department=${val}&page_size=0` })
                              // try permissive fallback
                              if (r.status === 401 || r.status === 403) {
                                try {
                                  const fall = await fetchWithAuth('/api/curriculum/?page_size=0')
                                  if (fall.ok) {
                                    const fd = await fall.json()
                                    let raw = fd.results ?? fd ?? []
                                    let items: any[] = []
                                    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
                                      // API returned a link map (e.g. { master, department, elective }) — follow department link
                                      if (typeof raw.department === 'string') {
                                        try {
                                          const follow = await fetchWithAuth(`${raw.department}?department=${val}&page_size=0`)
                                          if (follow.ok) {
                                            const fd2 = await follow.json()
                                            raw = fd2.results ?? fd2 ?? []
                                          }
                                        } catch (e) { console.debug('follow department link failed', e) }
                                      } else {
                                        // otherwise, use object values
                                        raw = Object.values(raw)
                                      }
                                    }
                                    items = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : [])
                                    console.debug('fallback curriculum items normalized', { rawType: typeof raw, itemsLength: items.length })
                                    const section = sections.find(s => s.id === sectionId)
                                    const sectionBatch = section?.batch ?? null
                                    const sectionRegCode = typeof currentSectionRegulation === 'string' ? currentSectionRegulation : currentSectionRegulation?.code
                                    const sectionSem = section?.semester ?? (typeof currentSectionRegulation === 'object' ? currentSectionRegulation?.semester ?? null : null)
                                    const filtered = (items || []).filter((c:any) => {
                                      if (sectionRegCode) {
                                        if (!c.regulation || c.regulation !== sectionRegCode) return false
                                      }
                                      if (sectionSem && c.semester !== undefined) {
                                        if (c.semester !== sectionSem) return false
                                      }
                                      if (sectionBatch && (c.batch !== undefined || c.batch_name !== undefined)) {
                                        if (c.batch !== undefined && String(c.batch) !== String(sectionBatch)) return false
                                        if (c.batch_name !== undefined && String(c.batch_name) !== String(sectionBatch)) return false
                                      }
                                      return true
                                    })
                                    // when viewing other department, prefer elective rows
                                    const electiveOnly = filtered.filter((c:any) => Boolean(c.is_elective))
                                    if (electiveOnly.length > 0) {
                                      setDeptCurriculum(electiveOnly)
                                    } else {
                                      setDeptCurriculum(filtered)
                                      setDeptCurriculumError('No electives found for this department+section; showing all matched subjects as fallback.')
                                    }
                                    // load staff for department
                                    try{
                                      const sres = await fetchWithAuth(`/api/academics/advisor-staff/?department=${val}&page_size=0`)
                                      if(sres.ok){
                                        const sd = await sres.json()
                                        setOtherDeptStaffList(sd.results || sd || [])
                                      } else {
                                        setOtherDeptStaffList([])
                                      }
                                    }catch(e){ console.debug('failed to load other dept staff', e); setOtherDeptStaffList([]) }
                                    return
                                  }
                                } catch (e) { console.debug('fallback fetch failed', e) }
                              }
                              throw new Error('Failed to fetch department curriculum')
                            }
                            const d = await r.json()
                            let raw = d.results ?? d ?? []
                            let items: any[] = []
                            if (raw && !Array.isArray(raw) && typeof raw === 'object') {
                              if (typeof raw.department === 'string') {
                                try {
                                  const follow = await fetchWithAuth(`${raw.department}?department=${val}&page_size=0`)
                                  if (follow.ok) {
                                    const fd2 = await follow.json()
                                    raw = fd2.results ?? fd2 ?? []
                                  }
                                } catch (e) { console.debug('follow department link failed', e) }
                              } else {
                                raw = Object.values(raw)
                              }
                            }
                            items = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : [])
                            console.debug('dept curriculum items normalized', { rawType: typeof raw, itemsLength: items.length })
                            const section = sections.find(s => s.id === sectionId)
                            const sectionBatch = section?.batch ?? null
                            const sectionRegCode = typeof currentSectionRegulation === 'string' ? currentSectionRegulation : currentSectionRegulation?.code
                            const sectionSem = section?.semester ?? (typeof currentSectionRegulation === 'object' ? currentSectionRegulation?.semester ?? null : null)
                            const filtered = (items || []).filter((c:any) => {
                              if (sectionRegCode) {
                                if (!c.regulation || c.regulation !== sectionRegCode) return false
                              }
                              if (sectionSem && c.semester !== undefined) {
                                if (c.semester !== sectionSem) return false
                              }
                              if (sectionBatch && (c.batch !== undefined || c.batch_name !== undefined)) {
                                if (c.batch !== undefined && String(c.batch) !== String(sectionBatch)) return false
                                if (c.batch_name !== undefined && String(c.batch_name) !== String(sectionBatch)) return false
                              }
                              return true
                            })
                            // when viewing other department, prefer elective rows
                            const electiveOnly = filtered.filter((c:any) => Boolean(c.is_elective))
                            if (electiveOnly.length > 0) {
                              setDeptCurriculum(electiveOnly)
                            } else {
                              setDeptCurriculum(filtered)
                              setDeptCurriculumError('No electives found for this department+section; showing all matched subjects as fallback.')
                            }
                            // load staff for department
                            try{
                              const sres = await fetchWithAuth(`/api/academics/advisor-staff/?department=${val}&page_size=0`)
                              if(sres.ok){
                                const sd = await sres.json()
                                setOtherDeptStaffList(sd.results || sd || [])
                              } else {
                                setOtherDeptStaffList([])
                              }
                            }catch(e){ console.debug('failed to load other dept staff', e); setOtherDeptStaffList([]) }
                          } catch (err:any) {
                            console.error('Other Dept selection failed', err)
                            setDeptCurriculum([])
                            setDeptCurriculumError('Failed to load subjects for selected department (permission or network issue). Check DevTools Network.')
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select department…</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    {/* Show subject/batch using deptCurriculum if department selected */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                      <select 
                        value={editingCurriculumId || ''} 
                        onChange={async (e) => {
                          const raw = e.target.value
                          const val = Number(raw) || null
                          try{ console.debug('OtherDept subject select changed', { raw, resolved: val, selectedOtherDept, deptCurriculumSample: (deptCurriculum||[]).slice(0,5) }) } catch(e){}
                          setLastSelectedCurriculumRaw && setLastSelectedCurriculumRaw(String(raw))
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
                        {(selectedOtherDept ? deptCurriculum : curriculum)
                          .filter((c: any) => Boolean(c))
                          .map((c: any) => (
                            <option key={c.id} value={resolveCurriculumId(c)}>{c.course_code} — {c.course_name}</option>
                          ))}
                      </select>
                    </div>
                    {deptCurriculumError && (
                      <p className="text-sm text-amber-600 mt-2">{deptCurriculumError}</p>
                    )}
                    {/* Hidden debug output removed */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Batch (optional)</label>
                      <select 
                        value={editingBatchId || ''} 
                        onChange={e=> setEditingBatchId(Number(e.target.value) || null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select batch (optional)</option>
                        {editingAvailableBatches.map((b: any) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : !isCustomAssignment ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                      <select 
                        value={editingCurriculumId || ''} 
                        onChange={async (e) => {
                          const raw = e.target.value
                          const val = Number(raw) || null
                          try{ console.debug('Subject select changed', { raw, resolved: val, selectedOtherDept }) } catch(e){}
                          setLastSelectedCurriculumRaw && setLastSelectedCurriculumRaw(String(raw))
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
                        {subjectSource
                          .filter((c: any) => {
                            // when other dept selected, show only elective rows (ignore regulation)
                            if (selectedOtherDept) {
                              return Boolean(c.is_elective)
                            }
                            if (!currentSectionRegulation?.code) return true
                            return c.regulation === currentSectionRegulation.code
                          })
                          .map((c: any) => (
                            <option key={c.id} value={resolveCurriculumId(c)}>{c.course_code} — {c.course_name}</option>
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
                        {editingAvailableBatches.map((b: any) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject Name</label>
                      <select
                        value={customAssignmentText || ''}
                        onChange={(e) => setCustomAssignmentText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select custom subject…</option>
                        {customSubjectOptions.map((opt: any) => (
                          <option key={opt.value} value={opt.label}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Staff (optional)</label>
                      <select
                        value={selectedStaffId || ''}
                        onChange={(e) => setSelectedStaffId(Number(e.target.value) || null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select staff (optional)…</option>
                        {staffList.map((staff: any) => (
                          <option key={staff.id} value={staff.id}>
                            {(() => {
                              const firstName = staff.user?.first_name || '';
                              const lastName = staff.user?.last_name || '';
                              const fullName = `${firstName} ${lastName}`.trim();
                              return fullName || staff.user?.username || staff.staff_id;
                            })()}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                
                <button 
                  onClick={async ()=>{
                    if(isCustomAssignment) {
                      if(!customAssignmentText.trim()) return alert('Subject name is required')
                      await handleAssign(day, periodId)
                    } else {
                      if(!editingCurriculumId) return alert('Select a subject')
                      await handleAssign(day, periodId, editingCurriculumId)
                    }
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

                <div className="space-y-4">
                  {/* Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
                    <input
                      type="date"
                      value={specialDate || ''}
                      onChange={e => setSpecialDate(e.target.value || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>

                  {/* Subject type tabs */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Subject Type</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['curriculum', 'custom', 'otherdept', 'event'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setSpecialSubjectType(type)
                            setEditingCurriculumId(null)
                            setCustomSubjectText('')
                            setEditingBatchId(null)
                            setEditingAvailableBatches([])
                            setSpecialEventText('')
                            if (type !== 'otherdept') { setSelectedOtherDept(null); setDeptCurriculum([]) }
                          }}
                          className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            specialSubjectType === type
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-amber-300'
                          }`}
                        >
                          {type === 'curriculum' ? 'Curriculum' : type === 'custom' ? 'Custom' : type === 'otherdept' ? 'Other Dept' : 'Event'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Curriculum */}
                  {specialSubjectType === 'curriculum' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                        <select
                          value={editingCurriculumId ?? ''}
                          onChange={async (e) => {
                            const val = Number(e.target.value) || null
                            setEditingCurriculumId(val)
                            setEditingBatchId(null)
                            if (val) await loadBatchesForCurriculum(val).catch(console.error)
                            else setEditingAvailableBatches([])
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        >
                          <option value="">Select subject…</option>
                          {curriculum
                            .filter((c: any) => !currentSectionRegulation?.code || c.regulation === currentSectionRegulation.code)
                            .map((c: any) => (
                              <option key={c.id} value={resolveCurriculumId(c)}>{c.course_code} — {c.course_name}</option>
                            ))}
                        </select>
                      </div>
                      {editingAvailableBatches.length > 0 && editingCurriculumId && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Batch (optional)</label>
                          <select
                            value={editingBatchId || ''}
                            onChange={e => setEditingBatchId(Number(e.target.value) || null)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                          >
                            <option value="">None</option>
                            {editingAvailableBatches.map((b: any) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}

                  {/* Custom */}
                  {specialSubjectType === 'custom' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Custom Subject</label>
                      <select
                        value={customSubjectText || ''}
                        onChange={e => setCustomSubjectText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      >
                        <option value="">Select…</option>
                        {customSubjectOptions.map((opt: any) => (
                          <option key={opt.value} value={opt.label}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Other Dept */}
                  {specialSubjectType === 'otherdept' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
                        <select
                          value={selectedOtherDept || ''}
                          onChange={async (e) => {
                            const val = Number(e.target.value) || null
                            if (!val) return
                            setDeptCurriculumError(null)
                            setDeptCurriculum([])
                            setEditingCurriculumId(null)
                            setSelectedOtherDept(val)
                            try {
                              const r = await fetchWithAuth(`/api/curriculum/?department=${val}&page_size=0`)
                              const d = r.ok ? await r.json() : null
                              let raw = d?.results ?? d ?? []
                              if (raw && !Array.isArray(raw) && typeof raw === 'object') {
                                if (typeof raw.department === 'string') {
                                  try {
                                    const follow = await fetchWithAuth(`${raw.department}?department=${val}&page_size=0`)
                                    if (follow.ok) { const fd2 = await follow.json(); raw = fd2.results ?? fd2 ?? [] }
                                  } catch { /* ignore */ }
                                } else {
                                  raw = Object.values(raw)
                                }
                              }
                              const items: any[] = Array.isArray(raw) ? raw : []
                              // Filter by the current section's regulation, semester (and optionally batch)
                              const section = sections.find((s: any) => s.id === sectionId)
                              const sectionBatch = section?.batch ?? null
                              const sectionRegCode = typeof currentSectionRegulation === 'string' ? currentSectionRegulation : currentSectionRegulation?.code
                              const sectionSem = section?.semester ?? (typeof currentSectionRegulation === 'object' ? currentSectionRegulation?.semester ?? null : null)
                              const filtered = items.filter((c: any) => {
                                if (sectionRegCode) {
                                  if (!c.regulation || c.regulation !== sectionRegCode) return false
                                }
                                if (sectionSem && c.semester !== undefined) {
                                  if (c.semester !== sectionSem) return false
                                }
                                if (sectionBatch && (c.batch !== undefined || c.batch_name !== undefined)) {
                                  if (c.batch !== undefined && String(c.batch) !== String(sectionBatch)) return false
                                  if (c.batch_name !== undefined && String(c.batch_name) !== String(sectionBatch)) return false
                                }
                                return true
                              })
                              // Prefer elective rows; fall back to all matched
                              const electiveOnly = filtered.filter((c: any) => Boolean(c.is_elective))
                              if (electiveOnly.length > 0) {
                                setDeptCurriculum(electiveOnly)
                              } else if (filtered.length > 0) {
                                setDeptCurriculum(filtered)
                                setDeptCurriculumError('No electives found for this department+section — showing all matched subjects as fallback.')
                              } else if (items.length > 0) {
                                setDeptCurriculum(items)
                                setDeptCurriculumError('No subjects matched this section\'s regulation/semester — showing unfiltered list.')
                              } else {
                                setDeptCurriculum([])
                                setDeptCurriculumError('No subjects found for this department.')
                              }
                            } catch {
                              setDeptCurriculumError('Failed to load department subjects.')
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        >
                          <option value="">Select department…</option>
                          {departments.map((d: any) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      {selectedOtherDept && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                          <select
                            value={editingCurriculumId ?? ''}
                            onChange={async (e) => {
                              const val = Number(e.target.value) || null
                              setEditingCurriculumId(val)
                              setEditingBatchId(null)
                              if (val) await loadBatchesForCurriculum(val).catch(console.error)
                              else setEditingAvailableBatches([])
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                          >
                            <option value="">Select subject…</option>
                            {deptCurriculum.map((c: any) => (
                              <option key={c.id} value={resolveCurriculumId(c)}>{c.course_code} — {c.course_name}</option>
                            ))}
                          </select>
                          {deptCurriculumError && <p className="text-xs text-amber-600 mt-1">{deptCurriculumError}</p>}
                        </div>
                      )}
                    </>
                  )}

                  {/* Event */}
                  {specialSubjectType === 'event' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Guest Lecture, Cultural Day…"
                        value={specialEventText}
                        onChange={e => setSpecialEventText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">You will be assigned as the staff for this event and will handle attendance for it.</p>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      if (!specialDate) return alert('Select a date')
                      // Validate subject selection based on type
                      if (specialSubjectType === 'curriculum' && !editingCurriculumId) return alert('Select a subject from curriculum')
                      if (specialSubjectType === 'custom' && !customSubjectText) return alert('Select a custom subject')
                      if (specialSubjectType === 'otherdept' && !editingCurriculumId) return alert('Select a department and subject')
                      if (specialSubjectType === 'event' && !specialEventText.trim()) return alert('Enter an event name')
                      try {
                        // Auto-create special timetable with a descriptive name
                        const ttName = specialSubjectType === 'event'
                          ? `Event: ${specialEventText.trim()} - ${specialDate}`
                          : `Special - ${specialDate}`
                        const tRes = await fetchWithAuth('/api/timetable/special-timetables/', {
                          method: 'POST',
                          body: JSON.stringify({ name: ttName, section: sectionId, is_active: true })
                        })
                        if (!tRes.ok) { const txt = await tRes.text(); return alert('Failed to create special timetable: ' + txt) }
                        const tData = await tRes.json()
                        const timetableId = tData.id

                        const entryPayload: any = { timetable_id: timetableId, period_id: periodId, date: specialDate }
                        if (specialSubjectType === 'curriculum' || specialSubjectType === 'otherdept') {
                          entryPayload.curriculum_row = editingCurriculumId
                          if (editingBatchId) entryPayload.subject_batch_id = editingBatchId
                        } else if (specialSubjectType === 'custom') {
                          entryPayload.subject_text = customSubjectText
                        } else if (specialSubjectType === 'event') {
                          entryPayload.subject_text = specialEventText.trim()
                          // staff left null = will be auto-set to request user on backend
                        }

                        const eRes = await fetchWithAuth('/api/timetable/special-entries/', {
                          method: 'POST',
                          body: JSON.stringify(entryPayload)
                        })
                        if (!eRes.ok) { const txt = await eRes.text(); return alert('Failed to create special entry: ' + txt) }
                        alert('Special period created')
                        setSpecialEventText('')
                        setSpecialSubjectType('curriculum')
                        await loadTimetable()
                        setShowCellPopup(false)
                        setEditingCell(null)
                      } catch (err) { console.error(err); alert('Failed to create special entry') }
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

export default function TimetableEditor(){
  const [sections, setSections] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [sectionDepartmentId, setSectionDepartmentId] = useState<number | null>(null)
  const [currentSectionRegulation, setCurrentSectionRegulation] = useState<any>(null)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [curriculum, setCurriculum] = useState<any[]>([])
  const [timetable, setTimetable] = useState<any[]>([])
  const [subjectStaffList, setSubjectStaffList] = useState<any[]>([])
  const [editingCell, setEditingCell] = useState<{day:number, periodId:number} | null>(null)
  const [editingCurriculumId, setEditingCurriculumId] = useState<number | null>(null)
  const [lastSelectedCurriculumRaw, setLastSelectedCurriculumRaw] = useState<string | null>(null)
  const [editingAvailableBatches, setEditingAvailableBatches] = useState<any[]>([])
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null)
  const [showCellPopup, setShowCellPopup] = useState(false)
  const [specialDate, setSpecialDate] = useState<string | null>((new Date()).toISOString().slice(0,10))
  const [specialTimetables, setSpecialTimetables] = useState<any[]>([])
  const [selectedSpecialId, setSelectedSpecialId] = useState<number | null>(null)
  const [specialName, setSpecialName] = useState<string>('')
  const [customSubjectText, setCustomSubjectText] = useState<string>('')
  const [customSubjectOptions, setCustomSubjectOptions] = useState<any[]>([])
  const [isCustomAssignment, setIsCustomAssignment] = useState<boolean>(false)
  const [customAssignmentText, setCustomAssignmentText] = useState<string>('')
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null)
  const [staffList, setStaffList] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [deptCurriculum, setDeptCurriculum] = useState<any[]>([])
  const [otherDeptStaffList, setOtherDeptStaffList] = useState<any[]>([])
  const [isOtherDept, setIsOtherDept] = useState<boolean>(false)
  const [selectedOtherDept, setSelectedOtherDept] = useState<number | null>(null)
  // Auto-detect current day: 0=Mon, 1=Tue, ..., 6=Sun
  const getCurrentDay = () => {
    const today = new Date()
    const dow = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    return dow === 0 ? 6 : dow - 1 // Convert to Mon=0, ..., Sun=6
  }
  const [selectedDay, setSelectedDay] = useState(getCurrentDay())

  useEffect(()=>{
    // Advisors don't have access to the HOD sections endpoint; use my-students
    fetchWithAuth('/api/academics/my-students/')
      .then(r=>{
        if(!r.ok) return []
        return r.json()
      }).then(d=>{
        const secs = (d.results || []).map((entry:any) => ({ 
          id: entry.section_id, 
          name: entry.section_name, 
          batch: entry.batch,
          batch_regulation: entry.batch_regulation,
          department_id: entry.department_id,
          // include semester if present on the API response under common keys
          semester: entry.semester ?? entry.section_semester ?? entry.batch_semester ?? entry.sem ?? null
        }))
        setSections(secs)
        // auto-select first section so advisor doesn't need manual selection
        if(!sectionId && secs.length > 0){
          setSectionId(secs[0].id)
          setSectionDepartmentId(secs[0].department_id)
          setCurrentSectionRegulation(secs[0].batch_regulation)
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
    // load migrated custom subject choices for dropdowns
    fetchWithAuth('/api/academics/custom-subjects/')
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => setCustomSubjectOptions(d.results || []))
      .catch(err => console.error('Failed to load custom subjects', err))
    // load departments for Other Dept selector
    fetchWithAuth('/api/academics/departments/?page_size=0')
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => setDepartments(d.results || d || []))
      .catch(e => console.error('Failed to load departments', e))
  },[])

  useEffect(()=>{
    if(sectionId){
      // Update regulation when section changes
      const selectedSection = sections.find(s => s.id === sectionId)
      if(selectedSection) {
        setCurrentSectionRegulation(selectedSection.batch_regulation)
      }
      
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
      
      // fetch staff list for custom assignments - filtered by section's department
      if(sectionDepartmentId) {
        fetchWithAuth(`/api/academics/advisor-staff/?department=${sectionDepartmentId}`).then(r=>{
          if(!r.ok) return []
          return r.json()
        }).then(d=> setStaffList(d.results || d || []))
      }
    }
  },[sectionId, sectionDepartmentId])

  async function loadTimetable(){
    if(!sectionId) return
    try{
      const weekDate = new Date().toISOString().slice(0,10)
      const res = await fetchWithAuth(`/api/timetable/section/${sectionId}/timetable/?week_date=${weekDate}`)
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
    if(item.mnemonic) return item.mnemonic
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

  async function handleAssign(day:number, periodId:number, curriculumId?:number){
    if(!sectionId) return alert('Section is required')
    
    const payload: any = { 
      period_id: periodId, 
      day, 
      section_id: sectionId 
    }
    
    if(isCustomAssignment) {
      // Custom assignment
      if(!customAssignmentText.trim()) return alert('Subject name is required')
      payload.subject_text = customAssignmentText.trim()
      if(selectedStaffId) payload.staff_id = selectedStaffId
    } else {
      // Curriculum-based assignment
      if(!curriculumId) return alert('Select a curriculum row first')
      payload.curriculum_row = curriculumId
      if(editingBatchId) payload.subject_batch_id = editingBatchId
    }
    // if assigning from Other Dept, include metadata so backend can honor chosen dept/option
    if(isOtherDept && selectedOtherDept) {
      payload.other_department_id = selectedOtherDept
      if(lastSelectedCurriculumRaw) payload.original_curriculum_raw = lastSelectedCurriculumRaw
      // include explicit chosen curriculum id so backend can unambiguously use it
      try {
        if(curriculumId) {
          payload.chosen_curriculum_id = curriculumId
          payload.curriculum_department_id = curriculumId
        }
      } catch(e) { /* ignore */ }
    }
    // debug: log payload to help diagnose Other Dept assignments
    try { console.debug('Timetable assign payload', { payload, isOtherDept, selectedOtherDept, lastSelectedCurriculumRaw, editingCurriculumId }) } catch(e){}

    const res = await fetchWithAuth('/api/timetable/assignments/', { method: 'POST', body: JSON.stringify(payload) })
    if(!res.ok){ const txt = await res.text(); return alert('Failed: '+txt) }
    
    // reset editor state
    setEditingCurriculumId(null)
    setEditingAvailableBatches([])
    setEditingBatchId(null)
    setCustomAssignmentText('')
    setSelectedStaffId(null)
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
                  {asg.is_special 
                    ? (asg.timetable_name || 'Special')
                    : shortLabel(asg.curriculum_row || asg.subject_text)
                  }
                  {asg.is_special && (
                    <span className="text-amber-600 ml-1">
                      • {shortLabel(asg.curriculum_row || asg.subject_text)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-700 mt-1 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Staff: {(() => {
                    if (!asg.staff) return '—';
                    const firstName = asg.staff.first_name || '';
                    const lastName = asg.staff.last_name || '';
                    const fullName = `${firstName} ${lastName}`.trim();
                    return fullName || asg.staff.username || '—';
                  })()}{asg.subject_batch ? ` • Batch: ${asg.subject_batch.name}` : ''}
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

  // hide break/lunch periods in the main editor grid (we show only teaching periods)
  const visiblePeriods = periods.filter(p => !p.is_break && !p.is_lunch)

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

  // Create a comprehensive subjects list combining curriculum and staff assignments
  const getCombinedSubjectsList = () => {
    if (!currentSectionRegulation?.code) return []
    
    // Filter curriculum by regulation
    const regulationFilteredCurriculum = curriculum.filter((subject: any) => 
      subject.regulation === currentSectionRegulation.code
    )
    
    // Create map of staff assignments
    const staffMap = new Map()
    subjectStaffList.forEach((staffSubject: any) => {
      if (staffSubject.id && staffSubject.staff) {
        staffMap.set(staffSubject.id, staffSubject.staff)
      }
    })
    
    // Combine curriculum with staff data
    const combined = regulationFilteredCurriculum.map((subject: any) => ({
      ...subject,
      staff: staffMap.get(subject.id) || '—'
    }))
    
    return combined
  }

  const filteredSubjectStaffList = getCombinedSubjectsList()

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
              {currentSectionRegulation && (
                <div className="px-4 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-emerald-900">
                      Regulation: {currentSectionRegulation.code}
                    </span>
                  </div>
                </div>
              )}
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
          
          {/* Desktop view: Horizontal table */}
          <div className="hidden md:block overflow-x-auto lg:overflow-visible">
            <table className="w-full table-fixed">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-blue-50 border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 min-w-[120px] sticky left-0 bg-gradient-to-r from-slate-50 to-blue-50 z-10">
                    Day / Period
                  </th>
                  {visiblePeriods.map(p=> (
                    <th key={p.id} className="px-4 py-3">
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
                    {visiblePeriods.map(p=> {
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

          {/* Mobile view: Day tabs + Period/Subject columns */}
          <div className="md:hidden p-4">
            {/* Day tabs */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {DAYS.map((d, di) => (
                <button
                  key={d}
                  onClick={() => setSelectedDay(di)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                    selectedDay === di
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Period/Subject table for selected day */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-indigo-700 w-24">Period</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-indigo-700">Assignment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    const nonBreakPeriods = visiblePeriods.filter((p: any) => !p.is_break && !p.is_lunch)
                    
                    return nonBreakPeriods.map((p: any) => {
                      const isSelected = editingCell && editingCell.day === (selectedDay + 1) && editingCell.periodId === p.id
                      
                      return (
                        <tr key={p.id} className={`${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-3 py-3 align-top">
                            <div className="text-xs font-semibold text-gray-900">
                              {p.label || `P${p.index || ''}`}
                            </div>
                            {(p.start_time || p.end_time) && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {p.start_time}{p.start_time && p.end_time ? '–' : ''}{p.end_time}
                              </div>
                            )}
                          </td>
                          <td className={`px-3 py-2 ${isSelected ? 'border-2 border-indigo-300' : ''}`}>
                            {renderCell(selectedDay + 1, p)}
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Subjects & Staff Reference */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                Subjects & Staff Reference
                {currentSectionRegulation && (
                  <span className="ml-2 text-sm font-normal text-gray-600">
                    (Regulation: {currentSectionRegulation.code})
                  </span>
                )}
              </h3>
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
                {filteredSubjectStaffList.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-6 py-8 text-center">
                      <BookOpen className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">
                        {currentSectionRegulation 
                          ? `No subjects found for regulation ${currentSectionRegulation.code}`
                          : 'No subjects found'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredSubjectStaffList.map((r:any) => (
                    <tr key={String(r.id)} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-indigo-600" />
                          <div>
                            <div className="font-medium">
                              {r.course_code ? `${r.course_code} — ${r.course_name}` : r.course_name}
                            </div>
                            {r.class_type && (
                              <div className="text-xs text-gray-500 mt-1">
                                {r.class_type} {r.is_elective ? '• Elective' : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-500" />
                          <span className={r.staff === '—' ? 'text-gray-400 italic' : ''}>
                            {r.staff}
                          </span>
                          {r.staff === '—' && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                              Not Assigned
                            </span>
                          )}
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
      
      {showCellPopup ? (
        <CellPopup 
          editingCell={editingCell}
          periods={periods}
          assignmentMap={assignmentMap}
          specialName={specialName}
          setSpecialName={setSpecialName}
          selectedSpecialId={selectedSpecialId}
          setSelectedSpecialId={setSelectedSpecialId}
          specialTimetables={specialTimetables}
          specialDate={specialDate}
          setSpecialDate={setSpecialDate}
          curriculum={curriculum}
          currentSectionRegulation={currentSectionRegulation}
          editingCurriculumId={editingCurriculumId}
          setEditingCurriculumId={setEditingCurriculumId}
          customSubjectText={customSubjectText}
          setCustomSubjectText={setCustomSubjectText}
          editingAvailableBatches={editingAvailableBatches}
          setEditingAvailableBatches={setEditingAvailableBatches}
          editingBatchId={editingBatchId}
          setEditingBatchId={setEditingBatchId}
          isCustomAssignment={isCustomAssignment}
          setIsCustomAssignment={setIsCustomAssignment}
          customAssignmentText={customAssignmentText}
          setCustomAssignmentText={setCustomAssignmentText}
          selectedStaffId={selectedStaffId}
          setSelectedStaffId={setSelectedStaffId}
          staffList={staffList}
          sectionId={sectionId}
          shortLabel={shortLabel}
          loadBatchesForCurriculum={loadBatchesForCurriculum}
          handleDeleteSpecialEntry={handleDeleteSpecialEntry}
          handleDeleteAssignment={handleDeleteAssignment}
          handleUpdateAssignment={handleUpdateAssignment}
          handleAssign={handleAssign}
          loadTimetable={loadTimetable}
          setShowCellPopup={setShowCellPopup}
          setEditingCell={setEditingCell}
            fetchWithAuth={fetchWithAuth}
          customSubjectOptions={customSubjectOptions}
          setSectionId={setSectionId}
          setSectionDepartmentId={setSectionDepartmentId}
              deptCurriculum={deptCurriculum}
              setDeptCurriculum={setDeptCurriculum}
              isOtherDept={isOtherDept}
              setIsOtherDept={setIsOtherDept}
              selectedOtherDept={selectedOtherDept}
              setSelectedOtherDept={setSelectedOtherDept}
                  setLastSelectedCurriculumRaw={setLastSelectedCurriculumRaw}
                otherDeptStaffList={otherDeptStaffList}
                setOtherDeptStaffList={setOtherDeptStaffList}
              departments={departments}
            sections={sections}
        />
      ) : null}
    </div>
  )
}
