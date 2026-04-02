import React, { useEffect, useState } from 'react'
import { fetchAssignedSubjects, fetchDepartmentStaff, StaffMember } from '../../services/staff'
import { fetchSubjectBatches, createSubjectBatch } from '../../services/subjectBatches'
import fetchWithAuth from '../../services/fetchAuth'
import { BookOpen, Users, AlertCircle, FileText, RotateCcw, Search } from 'lucide-react'

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
  subject_batches?: Array<{ id: number; name?: string | null }> | null
  department?: {
    id: number
    code?: string | null
    name?: string | null
    short_name?: string | null
  } | null
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
  const [editingStaffId, setEditingStaffId] = useState<number | null>(null)
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerAllStudents, setPickerAllStudents] = useState<any[]>([])
  const [pickerStudents, setPickerStudents] = useState<any[]>([])
  const [pickerItem, setPickerItem] = useState<any | null>(null)
  const [pickerSelectedIds, setPickerSelectedIds] = useState<number[]>([])
  const [pickerStaffId, setPickerStaffId] = useState<number | null>(null)
  const [pickerShowExistingBatchStudents, setPickerShowExistingBatchStudents] = useState(false)
  const [selectionFilter, setSelectionFilter] = useState<'all' | 'first-half' | 'second-half' | 'custom' | 'range'>('all')
  const [customNumbers, setCustomNumbers] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [editSelectionFilter, setEditSelectionFilter] = useState<'all' | 'first-half' | 'second-half' | 'custom' | 'range'>('all')
  const [editCustomNumbers, setEditCustomNumbers] = useState('')
  const [editRangeStart, setEditRangeStart] = useState('')
  const [editRangeEnd, setEditRangeEnd] = useState('')
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [viewBatchOpen, setViewBatchOpen] = useState(false)
  const [viewBatch, setViewBatch] = useState<any | null>(null)
  const [currentUserStaffId, setCurrentUserStaffId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editSearchQuery, setEditSearchQuery] = useState('')
  const [departments, setDepartments] = useState<any[]>([])
  const [pickerSelectedDept, setPickerSelectedDept] = useState<number | null>(null)
  const [editPickerSelectedDept, setEditPickerSelectedDept] = useState<number | null>(null)

  // Fix scroll container height to allow all students to be visible
  React.useEffect(() => {
    if (pickerOpen) {
      // Find and fix the student list container height to show 8 students
      const containers = document.querySelectorAll('.h-\\[450px\\]')
      containers.forEach(el => {
        if (el instanceof HTMLElement) {
          el.style.height = '280px'
          el.style.maxHeight = '280px'
        }
      })
    }
  }, [pickerOpen])
 
  useEffect(() => { load(); loadStaff(); loadCurrentUser() }, [])

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

  async function loadStaff() {
    setStaffLoading(true)
    try {
      // Load all departments first
      const deptRes = await fetchWithAuth('/api/academics/departments/?page_size=0')
      let depts: any[] = []
      if (deptRes.ok) {
        const deptData = await deptRes.json()
        depts = (deptData.results || deptData || []).sort((a: any, b: any) => {
          const nameA = a.name || a.code || `Dept ${a.id}`
          const nameB = b.name || b.code || `Dept ${b.id}`
          return nameA.localeCompare(nameB)
        })
        console.log('Loaded departments:', depts)
      }
      setDepartments(depts)
      
      // Load all staff
      const staff = await fetchDepartmentStaff()
      console.log('Loaded staff:', staff)
      setStaffList(staff)
    } catch (e: any) {
      console.error('Failed to load staff or departments:', e)
      // Don't show error to user, just log it
    } finally {
      setStaffLoading(false)
    }
  }

  // Filter staff by selected department
  const getFilteredStaffList = (selectedDept: number | null) => {
    if (!selectedDept) {
      return staffList
    }
    return staffList.filter(staff => 
      staff.department && staff.department.id === selectedDept
    )
  }

  async function loadCurrentUser() {
    try {
      const res = await fetchWithAuth('/api/accounts/me/')
      if (res.ok) {
        const data = await res.json()
        if (data.staff_profile?.id) {
          setCurrentUserStaffId(data.staff_profile.id)
        }
      }
    } catch (e: any) {
      console.error('Failed to load current user:', e)
    }
  }

  function openViewBatch(batch: any) {
    // Enrich batch with subject info for elective batches (no curriculum_row)
    if (!batch.curriculum_row) {
      // First try: use subject_info from the API (works for assigned batches too)
      if (batch.subject_info?.course_name) {
        batch = {
          ...batch,
          _derived_subject_name: batch.subject_info.course_name,
          _derived_subject_code: batch.subject_info.course_code || null,
        }
      } else {
        // Fallback: find matching elective teaching assignment from current user's items
        const batchStudentIds = new Set((batch.students || []).map((s: any) => Number(s.id)))
        const electiveItems = items.filter((it: any) => it.elective_subject_id && !it.curriculum_row_id)
        // If only one elective item exists, use it directly; otherwise try student overlap
        let matchItem: any = electiveItems.length === 1 ? electiveItems[0] : null
        if (!matchItem && electiveItems.length > 1 && batchStudentIds.size > 0) {
          // Best-effort: pick the first elective item (staff typically has one elective subject)
          matchItem = electiveItems[0]
        }
        if (matchItem) {
          batch = {
            ...batch,
            _derived_subject_name: matchItem.subject_name || null,
            _derived_subject_code: matchItem.subject_code || null,
          }
        }
      }
    }
    setViewBatch(batch)
    setViewBatchOpen(true)
  }

  function closeViewBatch() {
    setViewBatch(null)
    setViewBatchOpen(false)
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
    // fetch students for section or elective choices
    try{
      let sdata
      if (item.section_id) {
        const sres = await fetchWithAuth(`/api/academics/sections/${item.section_id}/students/?page_size=1000`)
        if (!sres.ok) {
          const txt = await sres.text()
          throw new Error(txt || 'Failed to load students')
        }
        sdata = await sres.json()
      } else if (item.elective_subject_id) {
        const sres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${item.elective_subject_id}&page_size=1000`)
        if (!sres.ok) {
          const txt = await sres.text()
          throw new Error(txt || 'Failed to load students')
        }
        sdata = await sres.json()
      } else {
        throw new Error('No student mapping available for this assignment')
      }
      const studsAll = (sdata.results || sdata)
      // exclude students already present in existing batches for this curriculum_row
      // For elective subjects (no curriculum_row), match batches that also have no curriculum_row
      const crId = item.curriculum_row_id || item.curriculum_row?.id
      const excluded = new Set<number>()
      for (const b of batches) {
        const bCrId = b.curriculum_row?.id ?? null
        if (crId ? (bCrId === crId) : (bCrId === null)) {
          for (const s of (b.students || [])) excluded.add(s.id)
        }
      }
      const studIds = studsAll.map((s:any)=>s.id).filter((id:number)=> !excluded.has(id))
      const payload: any = { name, student_ids: studIds }
      if (item.curriculum_row_id) payload.curriculum_row_id = item.curriculum_row_id
      if (item.section_id) payload.section_id = item.section_id
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
    setPickerAllStudents([])
    setPickerShowExistingBatchStudents(false)
    setBatchNamesById(prev => ({ ...prev, [item.id]: name }))
    try{
      let sdata
      if (item.section_id) {
        // Regular subject with section - fetch all students with large page_size
        const sres = await fetchWithAuth(`/api/academics/sections/${item.section_id}/students/?page_size=1000`)
        if (!sres.ok) {
          const txt = await sres.text()
          throw new Error(txt || 'Failed to load students')
        }
        sdata = await sres.json()
      } else if (item.elective_subject_id) {
        // Elective subject
        const sres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${item.elective_subject_id}&page_size=1000`)
        if (!sres.ok) {
          const txt = await sres.text()
          throw new Error(txt || 'Failed to load students')
        }
        sdata = await sres.json()
      } else {
        throw new Error('No student mapping available for this assignment')
      }
      
      const raw = (sdata.results || sdata) || []
      console.log('=== Student API Response Debug ===')
      console.log('Full API response:', sdata)
      console.log('Raw students array length:', raw.length)
      console.log('Has pagination count?', sdata.count)
      
      const studs = raw.map((s:any) => ({
        id: Number(s.id),
        reg_no: String(s.reg_no ?? s.regno ?? ''),
        username: String(s.username ?? s.name ?? s.full_name ?? ''),
        full_name: String(s.username ?? s.name ?? s.full_name ?? ''),
        section: s.section_name ?? s.section ?? null,
        section_id: s.section_id ?? null,
      }))
      
      console.log('Mapped students count:', studs.length)
      console.log('Student IDs:', studs.map(s => s.id))
      
      // Exclude students already in existing batches for this curriculum_row / subject
      // For elective subjects (no curriculum_row), match batches that also have no curriculum_row
      const crId = item.curriculum_row_id || item.curriculum_row?.id
      const assignedBatchesByStudentId: Record<number, string[]> = {}
      const excluded = new Set<number>()
      for (const b of batches) {
        const bCrId = b.curriculum_row?.id ?? null
        if (crId ? (bCrId === crId) : (bCrId === null)) {
          const batchName = String(b.name || '').trim() || 'Existing batch'
          for (const s of (b.students || [])) {
            const sid = Number((s as any).id)
            if (!Number.isFinite(sid)) continue
            excluded.add(sid)
            if (!assignedBatchesByStudentId[sid]) assignedBatchesByStudentId[sid] = []
            if (!assignedBatchesByStudentId[sid].includes(batchName)) assignedBatchesByStudentId[sid].push(batchName)
          }
        }
      }

      const allStuds = studs.map((s: any) => {
        const sid = Number(s.id)
        const alreadyAssigned = excluded.has(sid)
        const assigned_batches = assignedBatchesByStudentId[sid] || []
        return { ...s, alreadyAssigned, assigned_batches }
      })

      const visible = excluded.size > 0
        ? allStuds.filter((s: any) => !s.alreadyAssigned)
        : allStuds
      if (excluded.size > 0) {
        console.log(`Filtered out ${excluded.size} already-batched students. Remaining: ${visible.length}`)
      }

      setPickerAllStudents(allStuds)
      setPickerStudents(visible)
      // Default select: only students not already in other batches.
      setPickerSelectedIds(allStuds.filter((s: any) => !s.alreadyAssigned).map((s: any) => s.id))
      setPickerStaffId(null)
      setSelectionFilter('all')
      setCustomNumbers('')
      setRangeStart('')
      setRangeEnd('')
      setSearchQuery('')
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

    // Apply the current search filter so bulk selection matches what the user sees.
    const query = searchQuery.trim().toLowerCase()
    const visibleStudents = query
      ? sortedStudents.filter((s: any) => {
          const name = String(s.username || s.full_name || '').toLowerCase()
          const regNo = String(s.reg_no || '').toLowerCase()
          return name.includes(query) || regNo.includes(query)
        })
      : sortedStudents

    let selectedIds: number[] = []

    switch (selectionFilter) {
      case 'all':
        selectedIds = visibleStudents.map((s: any) => s.id)
        break
      case 'first-half': {
        const firstHalf = Math.ceil(visibleStudents.length / 2)
        selectedIds = visibleStudents.slice(0, firstHalf).map((s: any) => s.id)
        break
      }
      case 'second-half': {
        const secondHalf = Math.floor(visibleStudents.length / 2)
        selectedIds = visibleStudents.slice(secondHalf).map((s: any) => s.id)
        break
      }
      case 'custom':
        if (customNumbers.trim()) {
          const numbers = customNumbers.split(',')
            .map(n => n.trim())
            .filter(n => n.length > 0)
          
          // Match students by last digits of registration number
          selectedIds = visibleStudents
            .filter((s: any) => {
              const regNo = String(s.reg_no || '')
              const lastDigits = regNo.slice(-2) // Get last 2 digits
              return numbers.includes(lastDigits)
            })
            .map((s: any) => s.id)
        }
        break
      case 'range': {
        const start = parseInt(rangeStart)
        const end = parseInt(rangeEnd)
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          // Match students whose registration number last 2 digits fall in range
          selectedIds = visibleStudents
            .filter((s: any) => {
              const regNo = String(s.reg_no || '')
              const lastDigits = regNo.slice(-2) // Get last 2 digits
              const numValue = parseInt(lastDigits)
              return !isNaN(numValue) && numValue >= start && numValue <= end
            })
            .map((s: any) => s.id)
        }
        break
      }
    }

    setPickerSelectedIds(selectedIds)
  }

  // Apply filter when filter type or values change
  React.useEffect(() => {
    if (pickerStudents.length > 0) {
      applySelectionFilter()
    }
  }, [selectionFilter, customNumbers, rangeStart, rangeEnd, pickerStudents, pickerShowExistingBatchStudents, searchQuery])

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
      case 'first-half': {
        const firstHalf = Math.ceil(sortedStudents.length / 2)
        selectedIds = sortedStudents.slice(0, firstHalf).map(s => s.id)
        break
      }
      case 'second-half': {
        const secondHalf = Math.floor(sortedStudents.length / 2)
        selectedIds = sortedStudents.slice(secondHalf).map(s => s.id)
        break
      }
      case 'custom':
        if (editCustomNumbers.trim()) {
          const numbers = editCustomNumbers.split(',')
            .map(n => n.trim())
            .filter(n => n.length > 0)
          
          // Match students by last digits of registration number
          selectedIds = sortedStudents
            .filter(s => {
              const regNo = String(s.reg_no || '')
              const lastDigits = regNo.slice(-2) // Get last 2 digits
              return numbers.includes(lastDigits)
            })
            .map(s => s.id)
        }
        break
      case 'range': {
        const start = parseInt(editRangeStart)
        const end = parseInt(editRangeEnd)
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          // Match students whose registration number last 2 digits fall in range
          selectedIds = sortedStudents
            .filter(s => {
              const regNo = String(s.reg_no || '')
              const lastDigits = regNo.slice(-2) // Get last 2 digits
              const numValue = parseInt(lastDigits)
              return !isNaN(numValue) && numValue >= start && numValue <= end
            })
            .map(s => s.id)
        }
        break
      }
    }

    setEditingSelectedStudentIds(selectedIds)
  }

  // Apply edit filter only when user explicitly changes filter options (not on initial load)
  React.useEffect(() => {
    if (editingBatchStudents.length > 0 && editingBatchId) {
      applyEditSelectionFilter()
    }
  }, [editSelectionFilter, editCustomNumbers, editRangeStart, editRangeEnd])

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
    if (pickerItem.section_id) payload.section_id = pickerItem.section_id
    if (pickerStaffId) payload.staff_id = pickerStaffId
    try{
      await createSubjectBatch(payload)
      const bs = await fetchSubjectBatches()
      setBatches(bs)
      setPickerOpen(false)
      setPickerAllStudents([])
      setPickerStudents([])
      setPickerItem(null)
      setPickerSelectedIds([])
      setPickerStaffId(null)
      setPickerSelectedDept(null)
      setPickerShowExistingBatchStudents(false)
      setSelectionFilter('all')
      setCustomNumbers('')
      setRangeStart('')
      setRangeEnd('')
      setSearchQuery('')
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
    setEditingStaffId(b.staff?.id || null)
    setEditSelectionFilter('all')
    setEditCustomNumbers('')
    setEditRangeStart('')
    setEditRangeEnd('')
    setEditSearchQuery('')
    
    // Load all available students for the batch's curriculum_row
    if (b.curriculum_row && b.curriculum_row.id) {
      try {
        // Find the subject/item that corresponds to this curriculum_row
        const batchSectionId = (b.section_id || b.section?.id) ?? null
        const matchingItem = items.find(item => item.curriculum_row_id === b.curriculum_row.id && (!batchSectionId || item.section_id === batchSectionId))
        if (matchingItem) {
          let sdata
          if (matchingItem.section_id) {
            // Regular subject with section - fetch all students with large page_size
            const sres = await fetchWithAuth(`/api/academics/sections/${matchingItem.section_id}/students/?page_size=1000`)
            if (sres.ok) {
              sdata = await sres.json()
            }
          } else if (matchingItem.elective_subject_id) {
            // Elective subject
            const sres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${matchingItem.elective_subject_id}&page_size=1000`)
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
      const payload: any = { 
        name: editingBatchName,
        student_ids: editingSelectedStudentIds
      }
      if (editingStaffId) payload.staff_id = editingStaffId
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
    setEditingStaffId(null)
    setEditPickerSelectedDept(null)
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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 p-3 md:p-6">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-white to-blue-50 rounded-xl shadow-lg p-4 md:p-6 mb-4 md:mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-100 to-indigo-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-blue-700" />
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-gray-900">Assigned Subjects</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-1 hidden sm:block">View all subjects assigned to you</p>
            </div>
          </div>
          {!loading && !error && items.length > 0 && (
            <div className="flex items-center gap-2 md:gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-full self-start md:self-auto">
              <span className="text-xs md:text-sm font-medium">Total</span>
              <span className="bg-white/20 text-white px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs md:text-sm font-semibold">{items.length}</span>
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

      {/* Table View - Desktop */}
      {!loading && !error && items.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-gray-200">
                  <th className="px-4 lg:px-6 py-4 text-left text-sm font-semibold text-blue-700">S.No</th>
                  <th className="px-4 lg:px-6 py-4 text-left text-sm font-semibold text-blue-700">Subject</th>
                  <th className="px-4 lg:px-6 py-4 text-left text-sm font-semibold text-blue-700">Class Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, index) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 lg:px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{index + 1}</span>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
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
                          {item.id > 0 && (
                            <button 
                              type="button" 
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" 
                              onClick={() => openPickerForAssignment(item)}
                            >
                              Create Batch
                            </button>
                          )}
                          {item.id < 0 && (
                            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">Assigned via batch</span>
                          )}
                          {!item.section_id && item.id > 0 && (
                            <span className="text-xs text-gray-500 px-2 py-1">Department-wide elective</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      {(() => {
                        const parts: string[] = []
                        if (item.department) {
                          parts.push(item.department.short_name || item.department.name || '')
                        }
                        if (item.section_name) parts.push(item.section_name)
                        if (item.batch) parts.push(item.batch)
                        if (item.semester != null) parts.push(`Sem ${item.semester}`)
                        const sbNames = (item.subject_batches || []).map(b => (b?.name || '')).filter(Boolean)
                        if (sbNames.length > 0) parts.push(`Subject Batch: ${sbNames.join(', ')}`)
                        
                        if (parts.length > 0) {
                          return (
                            <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-50 to-purple-50 text-gray-800 px-3 py-1.5 rounded-full border border-blue-200">
                              <Users className="w-3.5 h-3.5 text-blue-600" />
                              <span className="text-xs font-medium">{parts.join(' • ')}</span>
                            </div>
                          )
                        }
                        return <span className="text-gray-400 text-xs">—</span>
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-gray-100">
            {items.map((item, index) => (
              <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm mb-1">
                      {item.subject_name || 'Unnamed Subject'}
                    </div>
                    {item.subject_code && (
                      <div className="text-xs text-blue-600 font-medium mb-2">{item.subject_code}</div>
                    )}
                    
                    {/* Class Details */}
                    {(() => {
                      const parts: string[] = []
                      if (item.department) {
                        parts.push(item.department.short_name || item.department.name || '')
                      }
                      if (item.section_name) parts.push(item.section_name)
                      if (item.batch) parts.push(item.batch)
                      if (item.semester != null) parts.push(`Sem ${item.semester}`)
                      const sbNames = (item.subject_batches || []).map(b => (b?.name || '')).filter(Boolean)
                      if (sbNames.length > 0) parts.push(`Subject Batch: ${sbNames.join(', ')}`)
                      
                      if (parts.length > 0) {
                        return (
                          <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-50 to-purple-50 text-gray-800 px-2.5 py-1 rounded-full border border-blue-200 mb-3">
                            <Users className="w-3 h-3 text-blue-600" />
                            <span className="text-xs font-medium">{parts.join(' • ')}</span>
                          </div>
                        )
                      }
                      return null
                    })()}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {item.id > 0 && (
                        <button 
                          type="button" 
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" 
                          onClick={() => openPickerForAssignment(item)}
                        >
                          Create Batch
                        </button>
                      )}
                      {item.id < 0 && (
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">Assigned via batch</span>
                      )}
                      {!item.section_id && item.id > 0 && (
                        <span className="text-xs text-gray-500 px-2 py-1">Dept-wide elective</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Student Subject Batches
          </h3>
          
          {!currentUserStaffId ? (
            <div className="text-center py-8 text-gray-500">
              <p>Loading user information...</p>
            </div>
          ) : (
            <>
              {/* Created Batches Section */}
              <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>Created Batches</span>
              <span className="text-sm font-normal text-gray-500">(Batches you created)</span>
            </h4>
            {(() => {
              // Show batches created by current user, or batches without created_by that belong to current user (backward compatibility)
              const createdBatches = batches.filter(b => 
                b.created_by?.id === currentUserStaffId || 
                (!b.created_by && b.staff?.id === currentUserStaffId)
              )
              if (createdBatches.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No batches created yet</p>
                  </div>
                )
              }
              
              // Group created batches by curriculum_row
              const groupedCreated: Record<string, any[]> = {}
              createdBatches.forEach(b => {
                const crId = b.curriculum_row?.id ? String(b.curriculum_row.id) : 'no_subject'
                if (!groupedCreated[crId]) groupedCreated[crId] = []
                groupedCreated[crId].push(b)
              })
              
              return (
                <div className="space-y-4">
                  {(() => {
                    // De-dupe subject headers by curriculum_row_id.
                    // Prevents duplicate rendering when `items` contains duplicate subject rows.
                    const byCrId: Record<string, any> = {}
                    for (const item of items) {
                      const crId = item.curriculum_row_id ? String(item.curriculum_row_id) : null
                      if (!crId) continue
                      if (!byCrId[crId]) byCrId[crId] = item
                    }
                    const uniqueItems = Object.values(byCrId)

                    return uniqueItems.map((item: any) => {
                      const crId = item.curriculum_row_id ? String(item.curriculum_row_id) : null
                      const group = crId ? (groupedCreated[crId] || []) : []
                      if (!group || group.length === 0) return null
                      return (
                        <div key={`created-subject-${crId}`} className="border-b border-gray-100 pb-4 last:border-b-0">
                          <div className="font-bold text-gray-900 mb-3">{item.subject_name || item.subject_code || 'Unnamed Subject'}</div>
                          <div className="space-y-3">
                            {group.map((b:any) => (
                              <div key={b.id} className="bg-gray-50 rounded-lg p-4">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="font-semibold text-gray-900 mb-2">{b.name}</div>
                                    <div className="text-sm text-gray-600 space-y-1">
                                      <div>
                                        <span className="font-medium">{(b.students || []).length} students</span>
                                      </div>
                                      {b.staff && (
                                        <div className="flex items-center gap-1">
                                          <Users className="w-3 h-3" />
                                          <span>Staff: {b.staff.name || b.staff.user || b.staff.staff_id}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="ml-4 flex gap-2">
                                    <button 
                                      className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                                      onClick={()=>openViewBatch(b)}
                                    >
                                      View
                                    </button>
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
                    })
                  })()}
                  
                  {/* Batches without curriculum_row (elective subjects) */}
                  {groupedCreated['no_subject'] && groupedCreated['no_subject'].length > 0 && (
                    <div className="border-b border-gray-100 pb-4">
                      <div className="font-bold text-gray-900 mb-3">
                        {(() => {
                          // Try to derive subject name from elective teaching assignments
                          const electiveItem = items.find((it: any) => it.elective_subject_id && !it.curriculum_row_id)
                          if (electiveItem?.subject_name || electiveItem?.subject_code) {
                            return electiveItem.subject_name || electiveItem.subject_code
                          }
                          // Fallback: use subject_info from the first batch in this group
                          const firstBatch = groupedCreated['no_subject']?.[0]
                          if (firstBatch?.subject_info?.course_name) return firstBatch.subject_info.course_name
                          return 'Other Batches'
                        })()}
                      </div>
                      <div className="space-y-3">
                        {groupedCreated['no_subject'].map((b:any) => (
                          <div key={b.id} className="bg-gray-50 rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 mb-2">{b.name}</div>
                                <div className="text-sm text-gray-600 space-y-1">
                                  <div>
                                    <span className="font-medium">{(b.students || []).length} students</span>
                                  </div>
                                  {b.staff && (
                                    <div className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      <span>Staff: {b.staff.name || b.staff.user || b.staff.staff_id}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="ml-4 flex gap-2">
                                <button 
                                  className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                                  onClick={()=>openViewBatch(b)}
                                >
                                  View
                                </button>
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
                  )}
                </div>
              )
            })()}
          </div>

          {/* Assigned Batches Section */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>Assigned Batches</span>
              <span className="text-sm font-normal text-gray-500">(Batches assigned to you by others)</span>
            </h4>
            {(() => {
              // Assigned batches are where staff is current user but created_by is different (and not null)
              const assignedBatches = batches.filter(b => 
                b.staff?.id === currentUserStaffId && 
                b.created_by?.id && 
                b.created_by.id !== currentUserStaffId
              )
              
              if (assignedBatches.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No batches assigned to you</p>
                  </div>
                )
              }
              
              // Group assigned batches by curriculum_row
              const groupedAssigned: Record<string, any[]> = {}
              assignedBatches.forEach(b => {
                const crId = b.curriculum_row?.id ? String(b.curriculum_row.id) : 'no_subject'
                if (!groupedAssigned[crId]) groupedAssigned[crId] = []
                groupedAssigned[crId].push(b)
              })
              
              return (
                <div className="space-y-4">
                  {(() => {
                    // De-dupe subject headers by curriculum_row_id.
                    const byCrId: Record<string, any> = {}
                    for (const item of items) {
                      const crId = item.curriculum_row_id ? String(item.curriculum_row_id) : null
                      if (!crId) continue
                      if (!byCrId[crId]) byCrId[crId] = item
                    }
                    const uniqueItems = Object.values(byCrId)

                    return uniqueItems.map((item: any) => {
                      const crId = item.curriculum_row_id ? String(item.curriculum_row_id) : null
                      const group = crId ? (groupedAssigned[crId] || []) : []
                      if (!group || group.length === 0) return null
                      return (
                        <div key={`assigned-subject-${crId}`} className="border-b border-gray-100 pb-4 last:border-b-0">
                          <div className="font-bold text-gray-900 mb-3">{item.subject_name || item.subject_code || 'Unnamed Subject'}</div>
                          <div className="space-y-3">
                            {group.map((b:any) => (
                              <div key={b.id} className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="font-semibold text-gray-900 mb-2">{b.name}</div>
                                    <div className="text-sm text-gray-600 space-y-1">
                                      <div>
                                        <span className="font-medium">{(b.students || []).length} students</span>
                                      </div>
                                      {b.created_by && (
                                        <div className="flex items-center gap-1">
                                          <Users className="w-3 h-3" />
                                          <span>Assigned by: {b.created_by.name || b.created_by.user || b.created_by.staff_id}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <button 
                                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                                      onClick={()=>openViewBatch(b)}
                                    >
                                      View
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  })()}
                  
                  {/* Assigned batches without curriculum_row (elective subjects) */}
                  {groupedAssigned['no_subject'] && groupedAssigned['no_subject'].length > 0 && (
                    <div className="border-b border-gray-100 pb-4">
                      <div className="font-bold text-gray-900 mb-3">
                        {(() => {
                          const electiveItem = items.find((it: any) => it.elective_subject_id && !it.curriculum_row_id)
                          if (electiveItem?.subject_name || electiveItem?.subject_code) {
                            return electiveItem.subject_name || electiveItem.subject_code
                          }
                          // Fallback: use subject_info from the first batch in this group
                          const firstBatch = groupedAssigned['no_subject']?.[0]
                          if (firstBatch?.subject_info?.course_name) return firstBatch.subject_info.course_name
                          return 'Other Assigned Batches'
                        })()}
                      </div>
                      <div className="space-y-3">
                        {groupedAssigned['no_subject'].map((b:any) => (
                          <div key={b.id} className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 mb-2">{b.name}</div>
                                <div className="text-sm text-gray-600 space-y-1">
                                  <div>
                                    <span className="font-medium">{(b.students || []).length} students</span>
                                  </div>
                                  {b.created_by && (
                                    <div className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      <span>Assigned by: {b.created_by.name || b.created_by.user || b.created_by.staff_id}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="ml-4">
                                <button 
                                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                                  onClick={()=>openViewBatch(b)}
                                >
                                  View
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
            </>
          )}
        </div>
      </div>

      {/* Picker Modal */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
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
                      setPickerAllStudents([]);
                      setPickerStudents([]); 
                      setPickerItem(null);
                      setPickerSelectedIds([]);
                      setPickerStaffId(null);
                      setPickerSelectedDept(null);
                      setPickerShowExistingBatchStudents(false);
                      setSelectionFilter('all');
                      setCustomNumbers('');
                      setRangeStart('');
                      setRangeEnd('');
                      setSearchQuery('');
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
            
            <div className="p-6 overflow-y-auto flex-1">
              {/* Department Filter */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Filter by Department
                </label>
                <select
                  value={pickerSelectedDept || ''}
                  onChange={(e) => setPickerSelectedDept(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name || dept.code || `Dept ${dept.id}`}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Staff Assignment */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Assign Staff (Optional)
                </label>
                <select
                  value={pickerStaffId || ''}
                  onChange={(e) => setPickerStaffId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Current Staff (Default)</option>
                  {getFilteredStaffList(pickerSelectedDept).map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} ({staff.staff_id})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to assign to yourself
                </p>
              </div>
              
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Students ({pickerStudents.length})</h4>
                <p className="text-sm text-gray-600 mb-4">Select students to include in this batch - all {pickerStudents.length} students shown</p>

                <div className="mb-3 flex items-center gap-2">
                  <input
                    id="pickerShowExistingBatchStudents"
                    type="checkbox"
                    checked={pickerShowExistingBatchStudents}
                    onChange={(e) => {
                      const next = Boolean(e.target.checked)
                      setPickerShowExistingBatchStudents(next)
                      if (next) {
                        setPickerStudents(pickerAllStudents)
                        return
                      }
                      const filtered = (pickerAllStudents || []).filter((s: any) => !s.alreadyAssigned)
                      setPickerStudents(filtered)
                      const excludedIds = new Set<number>((pickerAllStudents || []).filter((s: any) => s.alreadyAssigned).map((s: any) => Number(s.id)))
                      setPickerSelectedIds((prev) => (prev || []).filter((id) => !excludedIds.has(Number(id))))
                    }}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <label htmlFor="pickerShowExistingBatchStudents" className="text-sm text-gray-700">
                    Also list students already assigned in other batches
                  </label>
                </div>
                
                {/* Search Field */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Search Students</label>
                  <input
                    type="text"
                    placeholder="Search by name or registration number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <div className="mt-2 text-xs text-gray-600">
                    Selected: {pickerSelectedIds.length} of {pickerStudents.length} students
                    {searchQuery.trim() && (
                      <span className="ml-2 text-blue-600">
                        (filtering {pickerStudents.filter(s => {
                          const query = searchQuery.toLowerCase()
                          const name = (s.username || s.full_name || '').toLowerCase()
                          const regNo = (s.reg_no || '').toLowerCase()
                          return name.includes(query) || regNo.includes(query)
                        }).length} matches)
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Selection Filters */}
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <h5 className="font-medium text-gray-900 mb-2 text-sm">Selection Options</h5>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-2 mb-1.5">
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
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2 mb-1.5">
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
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          min="1"
                          max="99"
                        />
                        <span className="self-center text-sm text-gray-500">to</span>
                        <input
                          type="number"
                          placeholder="To"
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(e.target.value)}
                          disabled={selectionFilter !== 'range'}
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          min="1"
                          max="99"
                        />
                      </div>
                    </div>
                  </div>
                  

                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(() => {
                  // Sort students alphabetically by name for display
                  const sortedStudents = [...pickerStudents].sort((a, b) => {
                      const nameA = (a.username || a.full_name || a.reg_no || '').toLowerCase()
                      const nameB = (b.username || b.full_name || b.reg_no || '').toLowerCase()
                      return nameA.localeCompare(nameB)
                    })
                    
                    console.log('=== Rendering Debug ===')
                    console.log('pickerStudents.length:', pickerStudents.length)
                    console.log('sortedStudents.length:', sortedStudents.length)
                    
                    // Filter students based on search query
                    const filteredStudents = searchQuery.trim() 
                      ? sortedStudents.filter(s => {
                          const query = searchQuery.toLowerCase()
                          const name = (s.username || s.full_name || '').toLowerCase()
                          const regNo = (s.reg_no || '').toLowerCase()
                          return name.includes(query) || regNo.includes(query)
                        })
                      : sortedStudents
                    
                    console.log('filteredStudents.length:', filteredStudents.length)
                    console.log('searchQuery:', searchQuery)
                    console.log('About to render', filteredStudents.length, 'student cards')
                    console.log('Container class: max-h-[70vh] overflow-y-auto for full scrolling')
                    
                    // Show message if no students match search
                    if (filteredStudents.length === 0 && searchQuery.trim()) {
                      return (
                        <div className="col-span-2 text-center py-8 text-gray-500">
                          No students found matching "{searchQuery}"
                        </div>
                      )
                    }
                    
                    // All students will be rendered - no slice or limit
                    // Parent container should have max-h-[70vh] overflow-y-auto for scrolling
                    return filteredStudents.map((s,index) => (
                      <label 
                        key={s.id} 
                        className="flex items-center gap-2 p-2 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
                        style={{minHeight: '56px'}}
                      >
                        <input 
                          type="checkbox" 
                          checked={pickerSelectedIds.includes(s.id)} 
                          onChange={() => togglePickerSelect(s.id)} 
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-xs text-gray-400 w-5 flex-shrink-0">{index + 1}.</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {s.username || s.full_name || s.reg_no}
                            </div>
                            {s.reg_no && (
                              <div className="text-xs text-gray-500 truncate">{s.reg_no}</div>
                            )}
                            {pickerShowExistingBatchStudents && s.alreadyAssigned && (
                              <div className="text-xs text-gray-400 truncate">
                                Already in: {(Array.isArray(s.assigned_batches) ? s.assigned_batches : []).join(', ') || 'another batch'}
                              </div>
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
      )}

      {/* Batch Edit Modal */}
      {editingBatchId && editingBatch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Fixed header with title + buttons */}
            <div className="p-3 border-b border-gray-200 flex-shrink-0">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Edit Batch
                  </h3>
                  <div className="text-xs text-gray-600">
                    Modify batch name and student assignments
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                    onClick={cancelBatchEdit}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" 
                    onClick={saveBatchEdit}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="p-3 overflow-y-auto flex-1">
              {/* Batch Name */}
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">
                  Batch Name
                </label>
                <input 
                  type="text"
                  value={editingBatchName} 
                  onChange={e=>setEditingBatchName(e.target.value)} 
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Enter batch name"
                />
              </div>

              {/* Department Filter */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Filter by Department
                </label>
                <select
                  value={editPickerSelectedDept || ''}
                  onChange={(e) => setEditPickerSelectedDept(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name || dept.code || `Dept ${dept.id}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Staff Assignment */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Assigned Staff
                </label>
                <select
                  value={editingStaffId || ''}
                  onChange={(e) => setEditingStaffId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Staff</option>
                  {getFilteredStaffList(editPickerSelectedDept).map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} ({staff.staff_id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Student Selection */}
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Students ({editingBatchStudents.length})</h4>
                <p className="text-sm text-gray-600 mb-4">Select students to include in this batch - all {editingBatchStudents.length} students shown</p>
                
                {/* Search Field */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Search Students</label>
                  <input
                    type="text"
                    placeholder="Search by name or registration number..."
                    value={editSearchQuery}
                    onChange={(e) => setEditSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <div className="mt-2 text-xs text-gray-600">
                    Selected: {editingSelectedStudentIds.length} of {editingBatchStudents.length} students
                    {editSearchQuery.trim() && (
                      <span className="ml-2 text-blue-600">
                        (filtering {editingBatchStudents.filter(s => {
                          const query = editSearchQuery.toLowerCase()
                          const name = (s.username || s.full_name || '').toLowerCase()
                          const regNo = (s.reg_no || '').toLowerCase()
                          return name.includes(query) || regNo.includes(query)
                        }).length} matches)
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Edit Selection Filters */}
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <h5 className="font-medium text-gray-900 mb-2 text-sm">Selection Options</h5>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-2 mb-1.5">
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
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2 mb-1.5">
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
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          min="1"
                          max="99"
                        />
                        <span className="self-center text-sm text-gray-500">to</span>
                        <input
                          type="number"
                          placeholder="To"
                          value={editRangeEnd}
                          onChange={(e) => setEditRangeEnd(e.target.value)}
                          disabled={editSelectionFilter !== 'range'}
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          min="1"
                          max="99"
                        />
                      </div>
                    </div>
                  </div>
                  

                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(() => {
                    // Sort students alphabetically by name for display
                    const sortedStudents = [...editingBatchStudents].sort((a, b) => {
                      const nameA = (a.username || a.full_name || a.reg_no || '').toLowerCase()
                      const nameB = (b.username || b.full_name || b.reg_no || '').toLowerCase()
                      return nameA.localeCompare(nameB)
                    })
                    
                    // Filter students based on search query
                    const filteredStudents = editSearchQuery.trim() 
                      ? sortedStudents.filter(s => {
                          const query = editSearchQuery.toLowerCase()
                          const name = (s.username || s.full_name || '').toLowerCase()
                          const regNo = (s.reg_no || '').toLowerCase()
                          return name.includes(query) || regNo.includes(query)
                        })
                      : sortedStudents
                    
                    // Show message if no students match search
                    if (filteredStudents.length === 0 && editSearchQuery.trim()) {
                      return (
                        <div className="col-span-2 text-center py-8 text-gray-500">
                          No students found matching "{editSearchQuery}"
                        </div>
                      )
                    }
                    
                    // Show message if no students available
                    if (editingBatchStudents.length === 0) {
                      return (
                        <div className="col-span-2 text-center py-8 text-gray-500">
                          <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p>No students available for this batch</p>
                        </div>
                      )
                    }
                    
                    return filteredStudents.map((s, index) => (
                      <label 
                        key={s.id} 
                        className="flex items-center gap-2 p-2 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
                        style={{minHeight: '56px'}}
                      >
                        <input 
                          type="checkbox" 
                          checked={editingSelectedStudentIds.includes(s.id)} 
                          onChange={() => toggleEditingStudentSelect(s.id)} 
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-xs text-gray-400 w-5 flex-shrink-0">{index + 1}.</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {s.username || s.full_name || s.reg_no}
                            </div>
                            {s.reg_no && (
                              <div className="text-xs text-gray-500 truncate">{s.reg_no}</div>
                            )}
                          </div>
                        </div>
                      </label>
                    ))
                  })()}
                </div>
            </div>{/* end scrollable body */}
          </div>
        </div>
      )}

      {/* View Batch Modal */}
      {viewBatchOpen && viewBatch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    Batch Details
                  </h3>
                  <div className="text-sm text-gray-600">
                    View batch information and student list
                  </div>
                </div>
                <button 
                  type="button" 
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors" 
                  onClick={closeViewBatch}
                >
                  Close
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              {/* Batch Information */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-6">
                <h4 className="font-bold text-lg text-gray-900 mb-4">{viewBatch.name}</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Course Information — from curriculum_row or derived from elective assignment */}
                  {(() => {
                    const subjectName = viewBatch.curriculum_row?.course_name || viewBatch._derived_subject_name || null
                    const subjectCode = viewBatch.curriculum_row?.course_code || viewBatch._derived_subject_code || null
                    return subjectName ? (
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Subject</div>
                        <div className="font-semibold text-gray-900">
                          {subjectName}
                        </div>
                        {subjectCode && (
                          <div className="text-sm text-blue-600 font-medium">
                            {subjectCode}
                          </div>
                        )}
                      </div>
                    ) : null
                  })()}
                  
                  {/* Show different information based on whether user created or was assigned */}
                  {viewBatch.created_by?.id === currentUserStaffId ? (
                    /* User created this batch - show assigned staff */
                    viewBatch.staff && (
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                          Assigned Staff
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-600" />
                          <div>
                            <div className="font-semibold text-gray-900">
                              {viewBatch.staff.name || viewBatch.staff.user || 'Unknown'}
                            </div>
                            {viewBatch.staff.staff_id && (
                              <div className="text-xs text-gray-600">
                                ID: {viewBatch.staff.staff_id}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    /* User was assigned this batch - show who created it */
                    viewBatch.created_by && (
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                          Assigned By
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-purple-600" />
                          <div>
                            <div className="font-semibold text-gray-900">
                              {viewBatch.created_by.name || viewBatch.created_by.user || 'Unknown'}
                            </div>
                            {viewBatch.created_by.staff_id && (
                              <div className="text-xs text-gray-600">
                                ID: {viewBatch.created_by.staff_id}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                  
                  {/* Student Count */}
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Total Students</div>
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-green-600" />
                      <div className="text-2xl font-bold text-gray-900">
                        {(viewBatch.students || []).length}
                      </div>
                    </div>
                  </div>
                  
                  {/* Created Date */}
                  {viewBatch.created_at && (
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Created On</div>
                      <div className="font-medium text-gray-900">
                        {new Date(viewBatch.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Student List */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Student List ({(viewBatch.students || []).length} students)
                </h4>
                
                {viewBatch.students && viewBatch.students.length > 0 ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Register No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {viewBatch.students
                          .sort((a: any, b: any) => {
                            const nameA = (a.username || a.full_name || a.reg_no || '').toLowerCase()
                            const nameB = (b.username || b.full_name || b.reg_no || '').toLowerCase()
                            return nameA.localeCompare(nameB)
                          })
                          .map((student: any, index: number) => (
                            <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                              <td className="px-4 py-3 text-sm font-medium text-blue-600">
                                {student.reg_no || student.regno || 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {student.username || student.full_name || 'Unknown'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No students in this batch</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}