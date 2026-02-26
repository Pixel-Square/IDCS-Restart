import React, { useEffect, useState } from 'react'
import { fetchAssignedSubjects } from '../../services/staff'
import { fetchSubjectBatches, createSubjectBatch } from '../../services/subjectBatches'
import fetchWithAuth from '../../services/fetchAuth'
import { BookOpen, Users, Calendar, AlertCircle, FileText, RotateCcw } from 'lucide-react'

type AssignedSubject = {
  id: number
  subject_code?: string | null
  subject_name?: string | null
  section_name?: string | null
  batch?: string | null
  semester?: number | null
  curriculum_row_id?: number | null
  section_id?: number | null
  elective_subject_id?: number | null
  curriculum_row?: any
}



export default function AssignedSubjectsPage() {
  const [items, setItems] = useState<AssignedSubject[]>([])
  const [batches, setBatches] = useState<any[]>([])
  const [batchNamesById, setBatchNamesById] = useState<Record<number,string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null)
  const [editingBatchName, setEditingBatchName] = useState('')
  const [editingBatchStudents, setEditingBatchStudents] = useState<any[]>([])
  const [editingSelectedStudentIds, setEditingSelectedStudentIds] = useState<number[]>([])
  const [editingBatch, setEditingBatch] = useState<any | null>(null)
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerStudents, setPickerStudents] = useState<any[]>([])
  const [pickerItem, setPickerItem] = useState<any | null>(null)
  const [pickerSelectedIds, setPickerSelectedIds] = useState<number[]>([])
  const [selectionFilter, setSelectionFilter] = useState<'all' | 'first-half' | 'second-half' | 'custom' | 'range'>('all')
  const [customNumbers, setCustomNumbers] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [editSelectionFilter, setEditSelectionFilter] = useState<'all' | 'first-half' | 'second-half' | 'custom' | 'range'>('all')
  const [editCustomNumbers, setEditCustomNumbers] = useState('')
  const [editRangeStart, setEditRangeStart] = useState('')
  const [editRangeEnd, setEditRangeEnd] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAssignedSubjects()
      const bs = await fetchSubjectBatches()
      setItems(data)
      setBatches(bs)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'Failed to load assigned subjects')
    } finally {
      setLoading(false)
    }
  }

    // Batch creation via subject actions only; no free-form batch input here.

  async function createBatchForAssignment(item: any){
    console.log('createBatchForAssignment clicked', item)
    // Always auto-name as next Batch N
    const nums = batches.map(b=>{
      const m = String(b.name || '').match(/Batch\s*(\d+)/i)
      return m ? parseInt(m[1],10) : null
    }).filter(Boolean) as number[]
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    const name = `Batch ${next}`
    // fetch students for section
    try{
      const sres = await fetchWithAuth(`/api/academics/sections/${item.section_id}/students/`)
      if (!sres.ok) {
        const txt = await sres.text()
        throw new Error(txt || 'Failed to load students')
      }
      const sdata = await sres.json()
      const studsAll = (sdata.results || sdata)
      // exclude students already present in existing batches for this curriculum_row
      const crId = item.curriculum_row_id || item.curriculum_row?.id
      const excluded = new Set<number>()
      if (crId) {
        for (const b of batches) {
          if (b.curriculum_row && b.curriculum_row.id === crId) {
            for (const s of (b.students || [])) excluded.add(s.id)
          }
        }
      }
      const studIds = studsAll.map((s:any)=>s.id).filter((id:number)=> !excluded.has(id))
      const payload: any = { name, student_ids: studIds }
      if (item.curriculum_row_id) payload.curriculum_row_id = item.curriculum_row_id
      await createSubjectBatch(payload)
      const bs = await fetchSubjectBatches()
      setBatches(bs)
      setBatchNamesById(prev => ({ ...prev, [item.id]: '' }))
      alert('Batch created for subject')
    }catch(e:any){
      console.error('createBatchForAssignment error', e)
      setError(e?.message || String(e))
      alert('Failed to create batch: ' + (e?.message || e))
    }
  }
  
  // Open the picker for a specific assignment (subject)
  async function openPickerForAssignment(item: any){
    console.log('openPickerForAssignment clicked', item)
    setError(null)
    const name = batchNamesById[item.id] || `Batch for ${item.subject_code || item.subject_name || item.id}`
    setPickerItem(item)
    setBatchNamesById(prev => ({ ...prev, [item.id]: name }))
    try{
      let sdata
      if (item.section_id) {
        // Regular subject with section
        const sres = await fetchWithAuth(`/api/academics/sections/${item.section_id}/students/`)
        if (!sres.ok) {
          const txt = await sres.text()
          throw new Error(txt || 'Failed to load students')
        }
        sdata = await sres.json()
      } else if (item.elective_subject_id) {
        // Elective subject
        const sres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${item.elective_subject_id}`)
        if (!sres.ok) {
          const txt = await sres.text()
          throw new Error(txt || 'Failed to load students')
        }
        sdata = await sres.json()
      } else {
        throw new Error('No student mapping available for this assignment')
      }
      
      const raw = (sdata.results || sdata) || []
      let studs = raw.map((s:any) => ({
        id: Number(s.id),
        reg_no: String(s.reg_no ?? s.regno ?? ''),
        username: String(s.username ?? s.name ?? s.full_name ?? ''),
        full_name: String(s.username ?? s.name ?? s.full_name ?? ''),
        section: s.section_name ?? s.section ?? null,
        section_id: s.section_id ?? null,
      }))
      
      // exclude students already assigned to batches for this curriculum_row
      const crId = item.curriculum_row_id || item.curriculum_row?.id
      if (crId) {
        const excluded = new Set<number>()
        for (const b of batches) {
          if (b.curriculum_row && b.curriculum_row.id === crId) {
            for (const s of (b.students || [])) excluded.add(s.id)
          }
        }
        studs = studs.filter((s:any) => !excluded.has(s.id))
      }
      setPickerStudents(studs)
      setPickerSelectedIds(studs.map((s:any)=>s.id))
      setSelectionFilter('all')
      setCustomNumbers('')
      setRangeStart('')
      setRangeEnd('')
      setPickerOpen(true)
    }catch(e:any){
      console.error('openPickerForAssignment error', e)
      setError(e?.message || String(e))
      alert('Failed to load students: ' + (e?.message || e))
    }
  }



  function togglePickerSelect(id: number){
    setPickerSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }

  function applySelectionFilter() {
    // Sort students alphabetically by name for consistent ordering
    const sortedStudents = [...pickerStudents].sort((a, b) => {
      const nameA = (a.username || a.full_name || a.reg_no || '').toLowerCase()
      const nameB = (b.username || b.full_name || b.reg_no || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })

    let selectedIds: number[] = []

    switch (selectionFilter) {
      case 'all':
        selectedIds = sortedStudents.map(s => s.id)
        break
      case 'first-half':
        const firstHalf = Math.ceil(sortedStudents.length / 2)
        selectedIds = sortedStudents.slice(0, firstHalf).map(s => s.id)
        break
      case 'second-half':
        const secondHalf = Math.floor(sortedStudents.length / 2)
        selectedIds = sortedStudents.slice(secondHalf).map(s => s.id)
        break
      case 'custom':
        if (customNumbers.trim()) {
          const numbers = customNumbers.split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n) && n > 0 && n <= sortedStudents.length)
          selectedIds = numbers.map(n => sortedStudents[n - 1]?.id).filter(Boolean)
        }
        break
      case 'range':
        const start = parseInt(rangeStart)
        const end = parseInt(rangeEnd)
        if (!isNaN(start) && !isNaN(end) && start > 0 && end <= sortedStudents.length && start <= end) {
          selectedIds = sortedStudents.slice(start - 1, end).map(s => s.id)
        }
        break
    }

    setPickerSelectedIds(selectedIds)
  }

  // Apply filter when filter type or values change
  React.useEffect(() => {
    if (pickerStudents.length > 0) {
      applySelectionFilter()
    }
  }, [selectionFilter, customNumbers, rangeStart, rangeEnd, pickerStudents])

  function applyEditSelectionFilter() {
    // Sort students alphabetically by name for consistent ordering
    const sortedStudents = [...editingBatchStudents].sort((a, b) => {
      const nameA = (a.username || a.full_name || a.reg_no || '').toLowerCase()
      const nameB = (b.username || b.full_name || b.reg_no || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })

    let selectedIds: number[] = []

    switch (editSelectionFilter) {
      case 'all':
        selectedIds = sortedStudents.map(s => s.id)
        break
      case 'first-half':
        const firstHalf = Math.ceil(sortedStudents.length / 2)
        selectedIds = sortedStudents.slice(0, firstHalf).map(s => s.id)
        break
      case 'second-half':
        const secondHalf = Math.floor(sortedStudents.length / 2)
        selectedIds = sortedStudents.slice(secondHalf).map(s => s.id)
        break
      case 'custom':
        if (editCustomNumbers.trim()) {
          const numbers = editCustomNumbers.split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n) && n > 0 && n <= sortedStudents.length)
          selectedIds = numbers.map(n => sortedStudents[n - 1]?.id).filter(Boolean)
        }
        break
      case 'range':
        const start = parseInt(editRangeStart)
        const end = parseInt(editRangeEnd)
        if (!isNaN(start) && !isNaN(end) && start > 0 && end <= sortedStudents.length && start <= end) {
          selectedIds = sortedStudents.slice(start - 1, end).map(s => s.id)
        }
        break
    }

    setEditingSelectedStudentIds(selectedIds)
  }

  // Apply edit filter when filter type or values change
  React.useEffect(() => {
    if (editingBatchStudents.length > 0 && editingBatchId) {
      applyEditSelectionFilter()
    }
  }, [editSelectionFilter, editCustomNumbers, editRangeStart, editRangeEnd, editingBatchStudents, editingBatchId])

  async function submitPicker(){
    if (!pickerItem) return
    // Always auto-name as next Batch N
    const nums = batches.map(b=>{
      const m = String(b.name || '').match(/Batch\s*(\d+)/i)
      return m ? parseInt(m[1],10) : null
    }).filter(Boolean) as number[]
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    const name = `Batch ${next}`
    const payload: any = { name, student_ids: pickerSelectedIds }
    if (pickerItem.curriculum_row_id) payload.curriculum_row_id = pickerItem.curriculum_row_id
    try{
      await createSubjectBatch(payload)
      const bs = await fetchSubjectBatches()
      setBatches(bs)
      setPickerOpen(false)
      setPickerStudents([])
      setPickerItem(null)
      setSelectionFilter('all')
      setCustomNumbers('')
      setRangeStart('')
      setRangeEnd('')
      alert('Batch created for subject')
    }catch(e:any){
      console.error(e)
      alert('Failed to create batch: ' + (e?.message || e))
    }
  }

  async function startEditBatch(b:any){
    setEditingBatchId(b.id)
    setEditingBatchName(b.name || '')
    setEditingBatch(b)
    setEditingSelectedStudentIds((b.students || []).map((s:any) => s.id))
    setEditSelectionFilter('all')
    setEditCustomNumbers('')
    setEditRangeStart('')
    setEditRangeEnd('')
    
    // Load all available students for the batch's curriculum_row
    if (b.curriculum_row && b.curriculum_row.id) {
      try {
        // Find the subject/item that corresponds to this curriculum_row
        const matchingItem = items.find(item => item.curriculum_row_id === b.curriculum_row.id)
        if (matchingItem) {
          let sdata
          if (matchingItem.section_id) {
            // Regular subject with section
            const sres = await fetchWithAuth(`/api/academics/sections/${matchingItem.section_id}/students/`)
            if (sres.ok) {
              sdata = await sres.json()
            }
          } else if (matchingItem.elective_subject_id) {
            // Elective subject
            const sres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${matchingItem.elective_subject_id}`)
            if (sres.ok) {
              sdata = await sres.json()
            }
          }
          
          if (sdata) {
            const raw = (sdata.results || sdata) || []
            const allStudents = raw.map((s:any) => ({
              id: Number(s.id),
              reg_no: String(s.reg_no ?? s.regno ?? ''),
              username: String(s.username ?? s.name ?? s.full_name ?? ''),
              full_name: String(s.username ?? s.name ?? s.full_name ?? ''),
              section: s.section_name ?? s.section ?? null,
              section_id: s.section_id ?? null,
            }))
            setEditingBatchStudents(allStudents)
          } else {
            setEditingBatchStudents(b.students || [])
          }
        } else {
          setEditingBatchStudents(b.students || [])
        }
      } catch (e: any) {
        console.error('Failed to load students for batch editing:', e)
        setEditingBatchStudents(b.students || [])
      }
    } else {
      setEditingBatchStudents(b.students || [])
    }
  }

  async function saveBatchEdit(){
    if(!editingBatchId) return
    try{
      const payload = { 
        name: editingBatchName,
        student_ids: editingSelectedStudentIds
      }
      const res = await fetchWithAuth(`/api/academics/subject-batches/${editingBatchId}/`, { method: 'PATCH', body: JSON.stringify(payload) })
      if(!res.ok) throw new Error(await res.text())
      const bs = await fetchSubjectBatches()
      setBatches(bs)
      cancelBatchEdit()
      alert('Batch updated successfully')
    }catch(e:any){
      console.error('saveBatchEdit failed', e)
      alert('Failed to update batch: ' + (e?.message || e))
    }
  }

  function cancelBatchEdit(){
    setEditingBatchId(null)
    setEditingBatchName('')
    setEditingBatch(null)
    setEditingBatchStudents([])
    setEditingSelectedStudentIds([])
    setEditSelectionFilter('all')
    setEditCustomNumbers('')
    setEditRangeStart('')
    setEditRangeEnd('')
  }

  function toggleEditingStudentSelect(id: number){
    setEditingSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function deleteBatch(id:number){
    if(!confirm('Delete this batch?')) return
    try{
      const res = await fetchWithAuth(`/api/academics/subject-batches/${id}/`, { method: 'DELETE' })
      if(!res.ok) throw new Error(await res.text())
      const bs = await fetchSubjectBatches()
      setBatches(bs)
      alert('Batch deleted')
    }catch(e:any){
      console.error('deleteBatch failed', e)
      alert('Failed to delete: ' + (e?.message || e))
    }
  }

  // Group batches by curriculum_row id for display under subjects
  const batchesByCurriculum: Record<string, any[]> = {}
  batches.forEach(b => {
    const crId = b.curriculum_row && b.curriculum_row.id ? String(b.curriculum_row.id) : '___no_cr'
    if (!batchesByCurriculum[crId]) batchesByCurriculum[crId] = []
    batchesByCurriculum[crId].push(b)
  })

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 p-6">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-white to-blue-50 rounded-xl shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-200 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Assigned Subjects</h1>
              <p className="text-sm text-gray-600 mt-1">View all subjects assigned to you for the current academic session</p>
            </div>
          </div>
          {!loading && !error && items.length > 0 && (
            <div className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-full">
              <span className="text-sm font-medium">Total Subjects</span>
              <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-semibold">{items.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 font-medium">Loading your assigned subjects...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors" 
            onClick={load}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Subjects Assigned</h3>
          <p className="text-gray-600">You don't have any subjects assigned for the current session.</p>
        </div>
      )}

      {/* Table View */}
      {!loading && !error && items.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-gray-200">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-blue-700">S.No</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-blue-700">Subject</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-blue-700">Section</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-blue-700">Batch</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-blue-700">Semester</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, index) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{index + 1}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-3">
                        <div>
                          <div className="font-semibold text-gray-900">
                            {item.subject_name || 'Unnamed Subject'}
                          </div>
                          {item.subject_code && (
                            <div className="text-sm text-blue-600 font-medium">{item.subject_code}</div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button 
                            type="button" 
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" 
                            onClick={() => openPickerForAssignment(item)}
                          >
                            Create Batch
                          </button>
                          {!item.section_id && (
                            <span className="text-xs text-gray-500 px-2 py-1">Department-wide elective</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {item.section_name ? (
                        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full w-fit">
                          <Users className="w-4 h-4" />
                          <span className="text-sm font-medium">{item.section_name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {item.batch ? (
                        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1 rounded-full w-fit">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm font-medium">{item.batch}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {item.semester != null ? (
                        <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-semibold">
                          Sem {item.semester}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subject Batches - existing only; creation via subject actions */}
      <div className="mt-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Student Subject Batches
          </h3>
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-3">Existing Batches</h4>
            {batches.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No batches created yet</p>
              </div>
            )}

          {/* Render batches grouped under each assigned subject */}
          {items.map(item => {
            const crId = item.curriculum_row_id ? String(item.curriculum_row_id) : null
            const group = crId ? (batchesByCurriculum[crId] || []) : []
            if (!group || group.length === 0) return null
            return (
                <div key={`subject-${item.id}`} className="mb-6 border-b border-gray-100 pb-4 last:border-b-0">
                  <div className="font-bold text-gray-900 mb-3">{item.subject_name || item.subject_code || 'Unnamed Subject'}</div>
                  <div className="space-y-3">
                    {group.map((b:any) => (
                      <div key={b.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900 mb-2">{b.name}</div>
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">{(b.students || []).length} students</span>
                            </div>
                          </div>
                          <div className="ml-4 flex gap-2">
                            <button 
                              className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                              onClick={()=>startEditBatch(b)}
                            >
                              Edit
                            </button>
                            <button 
                              className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                              onClick={()=>deleteBatch(b.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Batches that don't map to any curriculum_row (or to our assignments) */}
            {(() => {
              const unmatched = batches.filter(b => {
                const cr = b.curriculum_row && b.curriculum_row.id ? b.curriculum_row.id : null
                return !cr || !items.some(it => it.curriculum_row_id === cr)
              })
              if (unmatched.length === 0) return null
              return (
                <div className="mt-6">
                  <div className="font-bold text-gray-900 mb-3">Other Batches</div>
                  <div className="space-y-3">
                    {unmatched.map((b:any) => (
                      <div key={`other-${b.id}`} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900 mb-2">{b.name}</div>
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">{(b.students || []).length} students</span>
                            </div>
                          </div>
                          <div className="ml-4 flex gap-2">
                            <button 
                              className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                              onClick={()=>startEditBatch(b)}
                            >
                              Edit
                            </button>
                            <button 
                              className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                              onClick={()=>deleteBatch(b.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Picker Modal */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {batchNamesById[pickerItem?.id || ''] || 'Create Batch'}
                  </h3>
                  <div className="text-sm text-gray-600">
                    {pickerItem?.subject_name || pickerItem?.subject_code}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors" 
                    onClick={() => { 
                      setPickerOpen(false); 
                      setPickerStudents([]); 
                      setPickerItem(null);
                      setSelectionFilter('all');
                      setCustomNumbers('');
                      setRangeStart('');
                      setRangeEnd('');
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors" 
                    onClick={submitPicker}
                  >
                    Create Batch
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Students ({pickerStudents.length})</h4>
                <p className="text-sm text-gray-600 mb-4">Select students to include in this batch</p>
                
                {/* Selection Filters */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h5 className="font-medium text-gray-900 mb-3">Selection Options</h5>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="selectionFilter"
                          value="all"
                          checked={selectionFilter === 'all'}
                          onChange={(e) => setSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">All Students</span>
                      </label>
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="selectionFilter"
                          value="first-half"
                          checked={selectionFilter === 'first-half'}
                          onChange={(e) => setSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">First Half</span>
                      </label>
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="selectionFilter"
                          value="second-half"
                          checked={selectionFilter === 'second-half'}
                          onChange={(e) => setSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">Second Half</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 mb-2">
                        <input
                          type="radio"
                          name="selectionFilter"
                          value="custom"
                          checked={selectionFilter === 'custom'}
                          onChange={(e) => setSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">Custom Numbers</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., 1,3,5,7"
                        value={customNumbers}
                        onChange={(e) => setCustomNumbers(e.target.value)}
                        disabled={selectionFilter !== 'custom'}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2 mb-2">
                        <input
                          type="radio"
                          name="selectionFilter"
                          value="range"
                          checked={selectionFilter === 'range'}
                          onChange={(e) => setSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">Range</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="From"
                          value={rangeStart}
                          onChange={(e) => setRangeStart(e.target.value)}
                          disabled={selectionFilter !== 'range'}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          min="1"
                          max={pickerStudents.length}
                        />
                        <span className="self-center text-sm text-gray-500">to</span>
                        <input
                          type="number"
                          placeholder="To"
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(e.target.value)}
                          disabled={selectionFilter !== 'range'}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          min="1"
                          max={pickerStudents.length}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 text-xs text-gray-600">
                    Selected: {pickerSelectedIds.length} of {pickerStudents.length} students
                  </div>
                </div>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(() => {
                    // Sort students alphabetically by name for display
                    const sortedStudents = [...pickerStudents].sort((a, b) => {
                      const nameA = (a.username || a.full_name || a.reg_no || '').toLowerCase()
                      const nameB = (b.username || b.full_name || b.reg_no || '').toLowerCase()
                      return nameA.localeCompare(nameB)
                    })
                    
                    return sortedStudents.map((s, index) => (
                      <label 
                        key={s.id} 
                        className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input 
                          type="checkbox" 
                          checked={pickerSelectedIds.includes(s.id)} 
                          onChange={() => togglePickerSelect(s.id)} 
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-6">{index + 1}.</span>
                          <div>
                            <div className="font-medium text-gray-900">
                              {s.username || s.full_name || s.reg_no}
                            </div>
                            {s.reg_no && (
                              <div className="text-xs text-gray-500">{s.reg_no}</div>
                            )}
                          </div>
                        </div>
                      </label>
                    ))
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Edit Modal */}
      {editingBatchId && editingBatch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    Edit Batch
                  </h3>
                  <div className="text-sm text-gray-600">
                    Modify batch name and student assignments
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors" 
                    onClick={cancelBatchEdit}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors" 
                    onClick={saveBatchEdit}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              {/* Batch Name */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Batch Name
                </label>
                <input 
                  type="text"
                  value={editingBatchName} 
                  onChange={e=>setEditingBatchName(e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter batch name"
                />
              </div>

              {/* Student Selection */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center justify-between">
                  <span>Students ({editingSelectedStudentIds.length} selected)</span>
                  <div className="text-sm text-gray-600">
                    Click to add/remove students
                  </div>
                </h4>
                
                {/* Edit Selection Filters */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h5 className="font-medium text-gray-900 mb-3">Selection Options</h5>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="editSelectionFilter"
                          value="all"
                          checked={editSelectionFilter === 'all'}
                          onChange={(e) => setEditSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">All Students</span>
                      </label>
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="editSelectionFilter"
                          value="first-half"
                          checked={editSelectionFilter === 'first-half'}
                          onChange={(e) => setEditSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">First Half</span>
                      </label>
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="editSelectionFilter"
                          value="second-half"
                          checked={editSelectionFilter === 'second-half'}
                          onChange={(e) => setEditSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">Second Half</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 mb-2">
                        <input
                          type="radio"
                          name="editSelectionFilter"
                          value="custom"
                          checked={editSelectionFilter === 'custom'}
                          onChange={(e) => setEditSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">Custom Numbers</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., 1,3,5,7"
                        value={editCustomNumbers}
                        onChange={(e) => setEditCustomNumbers(e.target.value)}
                        disabled={editSelectionFilter !== 'custom'}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2 mb-2">
                        <input
                          type="radio"
                          name="editSelectionFilter"
                          value="range"
                          checked={editSelectionFilter === 'range'}
                          onChange={(e) => setEditSelectionFilter(e.target.value as any)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm font-medium">Range</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="From"
                          value={editRangeStart}
                          onChange={(e) => setEditRangeStart(e.target.value)}
                          disabled={editSelectionFilter !== 'range'}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          min="1"
                          max={editingBatchStudents.length}
                        />
                        <span className="self-center text-sm text-gray-500">to</span>
                        <input
                          type="number"
                          placeholder="To"
                          value={editRangeEnd}
                          onChange={(e) => setEditRangeEnd(e.target.value)}
                          disabled={editSelectionFilter !== 'range'}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          min="1"
                          max={editingBatchStudents.length}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 text-xs text-gray-600">
                    Selected: {editingSelectedStudentIds.length} of {editingBatchStudents.length} students
                  </div>
                </div>
                
                <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg p-4">
                  {editingBatchStudents.length === 0 ? (
                    <div className="text-center text-gray-500 py-4">
                      <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p>No students available for this batch</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(() => {
                        // Sort students alphabetically by name for display
                        const sortedStudents = [...editingBatchStudents].sort((a, b) => {
                          const nameA = (a.username || a.full_name || a.reg_no || '').toLowerCase()
                          const nameB = (b.username || b.full_name || b.reg_no || '').toLowerCase()
                          return nameA.localeCompare(nameB)
                        })
                        
                        return sortedStudents.map((s, index) => (
                          <label 
                            key={s.id} 
                            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                              editingSelectedStudentIds.includes(s.id) 
                                ? 'border-blue-300 bg-blue-50' 
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input 
                              type="checkbox" 
                              checked={editingSelectedStudentIds.includes(s.id)} 
                              onChange={() => toggleEditingStudentSelect(s.id)} 
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-6">{index + 1}.</span>
                              <div>
                                <div className="font-medium text-gray-900">
                                  {s.username || s.full_name || s.reg_no}
                                </div>
                                {s.reg_no && (
                                  <div className="text-xs text-gray-500">{s.reg_no}</div>
                                )}
                              </div>
                            </div>
                          </label>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}