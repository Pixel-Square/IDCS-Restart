import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Calendar, Clock, Users, CheckCircle2, XCircle, Loader2, Save, X, ChevronDown, AlertCircle, Lock, Unlock } from 'lucide-react'

type PeriodItem = {
  id: number
  section_id: number
  section_name: string
  period: { id: number; index: number; label?: string; start_time?: string; end_time?: string }
  subject?: string | null
  subject_display?: string | null
  subject_batch_id?: number | null
  attendance_session_id?: number | null
  attendance_session_locked?: boolean
  unlock_request_status?: string | null
  unlock_request_id?: number | null
  elective_subject_id?: number | null
  elective_subject_name?: string | null
}

type Student = { id: number; reg_no: string; username?: string; name?: string; section?: string | null; section_id?: number | null }

export default function PeriodAttendance(){
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10))
  const [periods, setPeriods] = useState<PeriodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<PeriodItem | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [marks, setMarks] = useState<Record<number,string>>({})
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)

  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkMonth, setBulkMonth] = useState<string>(new Date().toISOString().slice(0,7))
  const [bulkAssignments, setBulkAssignments] = useState<any[]>([])
  const [selectedAssignments, setSelectedAssignments] = useState<Record<string,boolean>>({})
  const [aggStudents, setAggStudents] = useState<Student[]>([])
  const [aggLoading, setAggLoading] = useState(false)
  const [bulkDateSelected, setBulkDateSelected] = useState<Record<string,boolean>>({})
  const [bulkSelected, setBulkSelected] = useState<Record<number,boolean>>({})
  const [markedSessions, setMarkedSessions] = useState<Record<string, Set<string>>>({})

  // Consecutive period detection
  const [consecutiveModal, setConsecutiveModal] = useState(false)
  const [pendingPeriod, setPendingPeriod] = useState<PeriodItem | null>(null)
  const [consecutivePeriod, setConsecutivePeriod] = useState<PeriodItem | null>(null)

  useEffect(()=>{ fetchPeriods() }, [date])

  // Group periods by canonical subject key so same-subject same-period across
  // multiple sections appear as a single card.
  function groupPeriodsList(raw: PeriodItem[]) {
    const groups: Record<string, PeriodItem & { section_ids?: number[]; section_names?: string[]; attendance_session_ids?: (number | null)[] }> = {}
    for (const p of raw) {
      let key = ''
      if ((p as any).period && (p as any).period.index !== undefined) {
        // include period index in key to avoid merging different periods
        const idx = (p as any).period.index
        if ((p as any).subject_batch_id) key = `batch_${idx}_${p.subject_batch_id}`
        else if ((p as any).elective_subject_id) key = `elective_${idx}_${p.elective_subject_id}`
        else if ((p as any).subject) key = `subj_${idx}_${String((p as any).subject || '').replace(/[^A-Za-z0-9]/g,'').toLowerCase()}`
        else key = `section_${idx}_${p.section_id}`
      } else {
        if (p.subject_batch_id) key = `batch_${p.subject_batch_id}`
        else if (p.elective_subject_id) key = `elective_${p.elective_subject_id}`
        else if (p.subject) key = `subj_${String(p.subject).replace(/[^A-Za-z0-9]/g,'').toLowerCase()}`
        else key = `section_${p.section_id}`
      }

      if (!groups[key]) {
        groups[key] = { ...p, section_ids: [p.section_id], section_names: [p.section_name], attendance_session_ids: [p.attendance_session_id] }
      } else {
        const g = groups[key]
        if (!g.section_ids!.includes(p.section_id)) g.section_ids!.push(p.section_id)
        if (p.section_name && !g.section_names!.includes(p.section_name)) g.section_names!.push(p.section_name)
        g.attendance_session_ids = Array.from(new Set([...(g.attendance_session_ids||[]), p.attendance_session_id]))
      }
    }
    return Object.keys(groups).map(k => ({ ...groups[k], id: k }))
  }

  async function fetchPeriods(){
    setLoading(true)
    try{
      const res = await fetchWithAuth(`/api/academics/staff/periods/?date=${date}`)
      if(!res.ok) throw new Error('Failed to load periods')
      const j = await res.json()
      setPeriods(j.results || [])
    }catch(e){ console.error('fetchPeriods', e); setPeriods([]) }
    finally{ setLoading(false) }
  }

  // Find consecutive period with same subject (including with breaks/lunch in between)
  function findConsecutivePeriod(currentPeriod: PeriodItem | any): PeriodItem | null {
    // Support grouped currentPeriod (multiple sections)
    const currentSectionIds: number[] = currentPeriod.section_ids && Array.isArray(currentPeriod.section_ids) && currentPeriod.section_ids.length ? currentPeriod.section_ids : [currentPeriod.section_id]

    // Look for periods with same section (one of current sections) and same subject
    const sameSubjectPeriods = periods.filter(p => {
      if (!p || p.attendance_session_locked) return false
      if (!currentSectionIds.includes(p.section_id)) return false
      // avoid comparing to the exact same assignment entry
      if (currentPeriod.id && p.id === currentPeriod.id) return false

      // Same subject identification
      const match = (
        (currentPeriod.subject_batch_id && p.subject_batch_id === currentPeriod.subject_batch_id) ||
        (currentPeriod.elective_subject_id && p.elective_subject_id === currentPeriod.elective_subject_id) ||
        (currentPeriod.subject && p.subject === currentPeriod.subject)
      )
      return !!match
    })

    if (sameSubjectPeriods.length === 0) return null

    // Sort by period index to find nearest periods
    const sorted = [...sameSubjectPeriods].sort((a, b) => a.period.index - b.period.index)

    const currentIndex = currentPeriod.period?.index || (currentPeriod.period && currentPeriod.period.index) || 0
    // Find the next period after current (even with gaps like breaks/lunch)
    const nextPeriod = sorted.find(p => p.period.index > currentIndex)
    // Find the previous period before current (even with gaps)
    const prevPeriod = [...sorted].reverse().find(p => p.period.index < currentIndex)

    // Choose the closest one (within reasonable range of 4 periods)
    const maxGap = 4 // Allow up to 4 period indices gap (covers breaks and lunch)

    if (nextPeriod && (nextPeriod.period.index - currentIndex) <= maxGap) {
      return nextPeriod
    }

    if (prevPeriod && (currentIndex - prevPeriod.period.index) <= maxGap) {
      return prevPeriod
    }

    return null
  }

  // Handle period click with consecutive detection
  function handlePeriodClick(p: PeriodItem | any) {
    const consecutive = findConsecutivePeriod(p as PeriodItem)

    if (consecutive) {
      setPendingPeriod(p)
      setConsecutivePeriod(consecutive)
      setConsecutiveModal(true)
    } else {
      openPeriod(p)
    }
  }

  // Open single period
  async function openPeriod(p: PeriodItem | any){
    setSelected(p)
    setStudents([])
    setMarks({})
    setLoading(true)
    try{
      let studs: any[] = []

      // If this is a grouped period (multiple sections), decide how to fetch students
      if (p.section_ids && Array.isArray(p.section_ids) && p.section_ids.length > 1) {
        // If this grouped period corresponds to an elective, fetch only students mapped to that elective
        if (p.elective_subject_id) {
          const esres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${p.elective_subject_id}`)
          if (esres.ok){ const esj = await esres.json(); studs = esj.results || [] }
        } else {
          const tasks: Promise<any>[] = []
          for (const sid of p.section_ids) {
            tasks.push(fetchWithAuth(`/api/academics/sections/${sid}/students/`).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] })))
          }
          const res = await Promise.allSettled(tasks)
          for (const r of res) {
            if (r.status === 'fulfilled') {
              const data = r.value || {}
              const list = data.results || data.students || []
              studs = studs.concat(list)
            }
          }
        }
      } else {
          if (p.elective_subject_id) {
            const esres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${p.elective_subject_id}`)
            if (esres.ok){ const esj = await esres.json(); studs = esj.results || [] }
          } else if (p.subject_batch_id){
          const bres = await fetchWithAuth(`/api/academics/subject-batches/${p.subject_batch_id}/`)
          if (bres.ok){ const bj = await bres.json(); studs = bj.students || bj.results || [] }
        } else {
          const sres = await fetchWithAuth(`/api/academics/sections/${p.section_id}/students/`)
          if (sres.ok){ const sj = await sres.json(); studs = sj.results || [] }
        }
      }

      // Deduplicate students by id
      const uniq: Record<number, any> = {}
      for (const s of (studs||[])) { if (s && s.id) uniq[s.id] = s }
      const deduped = Object.values(uniq)

      setStudents((deduped || []).map((s: any) => ({ 
        id: Number(s.id), 
        reg_no: String(s.reg_no || s.regno || String(s.id)), 
        name: String(s.name ?? s.full_name ?? s.username ?? ''),
        username: String(s.username ?? s.name ?? ''),
        section: s.section_name ?? s.section ?? null,
        section_id: s.section_id ?? null,
      })));
      const initial: Record<number,string> = {};
      (deduped||[]).forEach((s:any)=> initial[s.id] = 'P');
      setMarks(initial);

      // If grouped, try to load existing session records from attendance_session_ids
      if (p.attendance_session_id || (p.attendance_session_ids && p.attendance_session_ids.length)){
        try{
          const sessIds = p.attendance_session_ids && p.attendance_session_ids.length ? p.attendance_session_ids : [p.attendance_session_id]
          // fetch records for all sessions and apply latest status per student (by id)
          const tasks = sessIds.map((sid: any) => fetchWithAuth(`/api/academics/period-attendance/${sid}/`).then(r => r.ok ? r.json() : null).catch(()=>null))
          const settled = await Promise.allSettled(tasks)
          const updated = { ...initial }
          for (const s of settled){ if (s.status !== 'fulfilled' || !s.value) continue; const pj = s.value; const recs = pj.records || []; recs.forEach((r:any)=>{ const sid = r.student_pk || (r.student && r.student.id) || null; if (sid) updated[sid] = r.status || updated[sid] || 'A' }) }
          setMarks(updated)
        }catch(e){ console.error('load session records', e) }
      }
    }catch(e){ console.error('openPeriod', e) }
    finally{ setLoading(false) }
  }

  function setMark(studentId:number, status:string){ setMarks(m=> ({ ...m, [studentId]: status })) }

  async function saveMarks(){
    if (!selected) return
    setSaving(true)
    try{
      const records = students.map(s=> ({ student_id: s.id, status: marks[s.id] || 'P' }))
      // Determine period ids to save for: single or consecutive periods
      const periodIds: number[] = (selected as any).consecutive_periods && Array.isArray((selected as any).consecutive_periods) && (selected as any).consecutive_periods.length > 0
        ? (selected as any).consecutive_periods.map((x:any)=> x.period_id)
        : [ selected.period.id ]

      // Determine section ids to save for
      const sectionIds: number[] = selected.section_ids && Array.isArray(selected.section_ids) && selected.section_ids.length > 0 ? selected.section_ids : [selected.section_id]

      // Build records per section: only include listed students belonging to that section
      const recordsBySection: Record<number, any[]> = {}
      for (const sid of sectionIds) {
        const recsForSection = students.filter(s => (s.section_id || null) === sid).map(s => ({ student_id: s.id, status: marks[s.id] || 'P' }))
        // If no students had section_id metadata (common for some elective lists), fall back to students that match by section_name
        if (recsForSection.length === 0 && selected.section_name) {
          const nameset = new Set((String(selected.section_name)).split(' + ').map(n=>n.trim()))
          const recsByName = students.filter(s => nameset.has(String(s.section_name || s.section || '').trim())).map(s=> ({ student_id: s.id, status: marks[s.id] || 'P' }))
          recordsBySection[sid] = recsByName.length ? recsByName : students.map(s=> ({ student_id: s.id, status: marks[s.id] || 'P' }))
        } else {
          recordsBySection[sid] = recsForSection.length ? recsForSection : students.map(s=> ({ student_id: s.id, status: marks[s.id] || 'P' }))
        }
      }

      const results: any[] = []
      for (const pid of periodIds) {
        for (const sid of sectionIds) {
          const payload = { section_id: sid, period_id: pid, date, records: recordsBySection[sid] || [] }
          console.log('Saving attendance for section', sid, 'period', pid, payload)
          const res = await fetchWithAuth('/api/academics/period-attendance/bulk-mark/', { method: 'POST', body: JSON.stringify(payload) })
          const j = await (res.ok ? res.json().catch(()=>null) : res.json().catch(()=>null))
          results.push({ section: sid, period: pid, ok: res.ok, data: j })
        }
      }

      const failed = results.filter(r=> !r.ok)
      if (failed.length) {
        console.error('Some saves failed:', failed)
        alert('Attendance saved for some sections/periods, but failed for others. Check console for details.')
      } else {
        await fetchPeriods()
        const label = (selected as any).combined_period_label || (selected.period && (selected.period.label || `Period ${selected.period.index}`))
        alert(`Attendance saved successfully!\n\nDate: ${date}\nPeriod(s): ${label}\nSections: ${sectionIds.length}\nStudents: ${students.length}`)
        setSelected(null)
      }
    }catch(e){ 
      console.error('saveMarks error:', e)
      alert('Failed to save attendance: ' + (e instanceof Error ? e.message : String(e)))
    }
    finally{ setSaving(false) }
  }

  // Mark both consecutive periods with same attendance
  async function markBothPeriods() {
    if (!pendingPeriod || !consecutivePeriod) return
    setConsecutiveModal(false)
    // Prepare UI for manual marking across both periods instead of auto-saving
    try {
      // Build student list for pendingPeriod (aggregate across sections if grouped)
      const p = pendingPeriod
      let studs: any[] = []
      if (p.section_ids && Array.isArray(p.section_ids) && p.section_ids.length > 1) {
        const tasks = p.section_ids.map((sid: number) => fetchWithAuth(`/api/academics/sections/${sid}/students/`).then(r => r.ok ? r.json() : { results: [] }).catch(()=>({ results: [] })))
        // If group represents an elective, prefer elective choices instead of raw sections
        if (p.elective_subject_id) {
          const esres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${p.elective_subject_id}`)
          if (esres.ok){ const esj = await esres.json(); studs = esj.results || [] }
        } else {
          const res = await Promise.allSettled(tasks)
          for (const r of res) if (r.status === 'fulfilled') { const data = r.value || {}; studs = studs.concat(data.results || data.students || []) }
        }
      } else {
        if (p.elective_subject_id) {
          const esres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${p.elective_subject_id}`)
          if (esres.ok){ const esj = await esres.json(); studs = esj.results || [] }
        } else if (p.subject_batch_id){
          const bres = await fetchWithAuth(`/api/academics/subject-batches/${p.subject_batch_id}/`)
          if (bres.ok){ const bj = await bres.json(); studs = bj.students || bj.results || [] }
        } else {
          const sres = await fetchWithAuth(`/api/academics/sections/${p.section_id}/students/`)
          if (sres.ok){ const sj = await sres.json(); studs = sj.results || [] }
        }
      }

      // Deduplicate students
      const uniq: Record<number, any> = {}
      for (const s of (studs||[])) if (s && s.id) uniq[s.id] = s
      let studentList = Object.values(uniq).map((s:any)=> ({ id: Number(s.id), reg_no: String(s.reg_no || s.regno || String(s.id)), username: s.username || s.name || '', section_id: s.section_id || s.sectionId || null, section_name: s.section_name || s.section || '' }))

      // Fallback: if elective-choices returned empty for grouped elective, fetch section students
      if ((!studentList || studentList.length === 0) && p.section_ids && Array.isArray(p.section_ids) && p.section_ids.length > 0) {
        const tasks2 = p.section_ids.map((sid: number) => fetchWithAuth(`/api/academics/sections/${sid}/students/`).then(r => r.ok ? r.json() : { results: [] }).catch(()=>({ results: [] })))
        const res2 = await Promise.allSettled(tasks2)
        const extra: any[] = []
        for (const r of res2) if (r.status === 'fulfilled') { const data = r.value || {}; const list = data.results || data.students || []; extra.push(...list) }
        const uniq2: Record<number, any> = {}
        for (const s of extra) if (s && s.id) uniq2[s.id] = s
        studentList = Object.values(uniq2).map((s:any)=> ({ id: Number(s.id), reg_no: String(s.reg_no || s.regno || String(s.id)), username: s.username || s.name || '', section_id: s.section_id || s.sectionId || null, section_name: s.section_name || s.section || '' }))
      }

      // Initialize marks as Present for all students
      const initialMarks: Record<number,string> = {}
      studentList.forEach((s:any)=> initialMarks[s.id] = 'P')

      setStudents(studentList)
      setMarks(initialMarks)
      // Prepare selected with combined info and section names
      const combinedLabel = `${pendingPeriod.period?.label || `Period ${pendingPeriod.period?.index}`} & ${consecutivePeriod.period?.label || `Period ${consecutivePeriod.period?.index}`}`
      const sectionNames = p.section_names && p.section_names.length ? p.section_names.join(' + ') : (p.section_name || '')
      setSelected({ ...pendingPeriod, consecutive_periods: [ { period_id: pendingPeriod.period.id, label: pendingPeriod.period?.label || '' }, { period_id: consecutivePeriod.period.id, label: consecutivePeriod.period?.label || '' } ], combined_period_label: combinedLabel, section_name: sectionNames, section_ids: p.section_ids || [p.section_id] })
      // Do not auto-save: allow user to review/edit then click Save
    } catch(e) {
      console.error('markBothPeriods error:', e)
      alert('Failed to prepare marking for both periods: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setConsecutiveModal(false)
      setPendingPeriod(null)
      setConsecutivePeriod(null)
    }
  }

  // Mark single period only (for consecutive modal)
  function markSinglePeriodOnly() {
    if (!pendingPeriod) return
    setConsecutiveModal(false)
    openPeriod(pendingPeriod)
    setPendingPeriod(null)
    setConsecutivePeriod(null)
  }

  // Lock/Unlock attendance session
  async function toggleLock() {
    if (!selected || !selected.attendance_session_id) {
      alert('No active attendance session to lock/unlock')
      return
    }

    const isLocked = selected.attendance_session_locked
    const selectedSessId = selected.attendance_session_id
    const confirmed = window.confirm(
      isLocked
        ? 'Are you sure you want to request an unlock for this attendance session? Unlocking requires approval.'
        : 'Are you sure you want to lock this attendance session? This will prevent any further changes to attendance records.'
    )

    if (!confirmed) return

    setLocking(true)
    try {
      if (isLocked) {
        // Create an unlock request instead of immediately unlocking
        const reqRes = await fetchWithAuth('/api/academics/attendance-unlock-requests/', {
          method: 'POST',
          body: JSON.stringify({ session: selected.attendance_session_id, note: '' }),
        })
        if (!reqRes.ok) {
          const err = await reqRes.json().catch(() => ({}))
          if (reqRes.status === 400 && err.detail?.includes('already pending')) {
            alert('An unlock request for this session already exists and is pending approval. Please check the Requests section for status.')
          } else {
            throw new Error(err.detail || 'Failed to create unlock request')
          }
        } else {
          const reqData = await reqRes.json()
          console.log('Unlock request created:', reqData)
          alert('Unlock request submitted successfully! Check the "My Requests" button in the Analytics page to view the status.')
          // update UI to reflect pending state immediately
          try{
            setSelected(s => s ? ({ ...s, unlock_request_status: reqData.status, unlock_request_id: reqData.id }) : s)
            setPeriods(prev => prev.map(p => {
              if (p.attendance_session_id && selectedSessId && p.attendance_session_id === selectedSessId){
                return { ...p, unlock_request_status: reqData.status, unlock_request_id: reqData.id }
              }
              return p
            }))
          }catch(e){ console.warn('Failed to update local unlock status', e) }
        }
        // do not change locked state until approval
      } else {
        // Lock immediately
        const res = await fetchWithAuth(
          `/api/academics/period-attendance/${selected.attendance_session_id}/lock/`,
          { method: 'POST' }
        )
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.detail || `Failed to lock session`)
        }
        const sessionData = await res.json()
        console.log('Session locked successfully:', sessionData)
        setSelected({ ...selected, attendance_session_locked: sessionData.is_locked })
        await fetchPeriods()
        alert('Attendance session locked successfully!')
      }
    } catch (e) {
      console.error('toggleLock error:', e)
      alert('Failed to perform lock/unlock: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLocking(false)
    }
  }

  // Bulk helpers (simplified): load assignments and aggregate student lists for selected assignments
  async function openBulkModal(){
    try{
      const res = await fetchWithAuth('/api/timetable/staff/')
      if(!res.ok) throw new Error('Failed to load assignments')
      const j = await res.json()
      const flat: any[] = []
      for (const d of (j.results||[])){
        const dayNum = d.day
        for (const a of (d.assignments||[])) flat.push({ ...a, _day: dayNum })
      }
      
      // Load existing attendance sessions for the current month
      await loadMarkedSessions(bulkMonth, flat)
      
      setBulkAssignments(flat)
      setBulkModalOpen(true)
      setSelectedAssignments({}); setBulkDateSelected({}); setBulkSelected({})
    }catch(e){ console.error('openBulkModal', e); alert('Failed to open bulk modal') }
  }

  // Load existing attendance sessions for filtering
  async function loadMarkedSessions(month: string, assignments: any[]) {
    try {
      const [y, m] = month.split('-').map(x => parseInt(x))
      const startDate = new Date(y, m - 1, 1).toISOString().slice(0, 10)
      const endDate = new Date(y, m, 0).toISOString().slice(0, 10)
      
      // Fetch all attendance sessions for the month
      const res = await fetchWithAuth(`/api/academics/period-attendance/?date_after=${startDate}&date_before=${endDate}`)
      if (!res.ok) {
        console.warn('Failed to load existing sessions')
        setMarkedSessions({})
        return
      }
      
      const data = await res.json()
      const sessions = data.results || []
      
      // Build a map: assignment_key -> Set of marked dates
      const marked: Record<string, Set<string>> = {}
      
      for (const session of sessions) {
        const sessionDate = session.date
        const sectionId = session.section?.id || session.section_id
        const periodId = session.period?.id || session.period_id
        
        if (!sessionDate || !sectionId || !periodId) continue
        
        // Find matching assignment to get the day
        const dt = new Date(sessionDate)
        const dayOfWeek = dt.getDay() === 0 ? 7 : dt.getDay()
        
        const matchingAssignment = assignments.find(a => 
          a._day === dayOfWeek && 
          (a.period_id === periodId || a.period?.id === periodId) && 
          (a.section_id === sectionId || a.section?.id === sectionId)
        )
        
        if (matchingAssignment) {
          const key = matchingAssignment.id ? String(matchingAssignment.id) : `${matchingAssignment._day}_${periodId}_${sectionId}`
          if (!marked[key]) marked[key] = new Set()
          marked[key].add(sessionDate)
        }
      }
      
      setMarkedSessions(marked)
      console.log('Loaded marked sessions:', marked)
    } catch (e) {
      console.error('Error loading marked sessions:', e)
      setMarkedSessions({})
    }
  }

  // Reload marked sessions when month changes
  useEffect(() => {
    if (bulkModalOpen && bulkAssignments.length > 0) {
      loadMarkedSessions(bulkMonth, bulkAssignments)
    }
  }, [bulkMonth])

  useEffect(()=>{
    // when selectedAssignments or bulkAssignments change, aggregate students
    async function loadAgg(){
      const keys = Object.keys(selectedAssignments).filter(k=> selectedAssignments[k])
      if (!keys.length){ setAggStudents([]); return }
      setAggLoading(true)
      try{
        const tasks: Promise<any>[] = []
        for (const a of bulkAssignments){
          const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
          if (!selectedAssignments[key]) continue
          if (a.elective_subject_id) tasks.push(fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${a.elective_subject_id}`).then(r=> r.ok? r.json(): { results: [] }))
          else if (a.subject_batch_id || a.subject_batch?.id) { const sb = a.subject_batch_id || a.subject_batch?.id; tasks.push(fetchWithAuth(`/api/academics/subject-batches/${sb}/`).then(r=> r.ok? r.json(): { students: [] })) }
          else if (a.section_id || a.section?.id) { const sid = a.section_id || a.section?.id; tasks.push(fetchWithAuth(`/api/academics/sections/${sid}/students/`).then(r=> r.ok? r.json(): { results: [] })) }
        }
        const settled = await Promise.allSettled(tasks)
        const all: Student[] = []
        for (const sres of settled){ if (sres.status !== 'fulfilled') continue; const data = sres.value || {}; const list = data.results || data.students || []; for (const st of list){ if (!st || !st.id) continue; if (!all.find(x=> x.id === st.id)) all.push({ id: st.id, reg_no: st.reg_no || st.regno || String(st.id), username: st.username || st.name || '' }) } }
        setAggStudents(all)
        setBulkSelected(prev=> { const copy = { ...prev }; for (const s of all) if (copy[s.id] === undefined) copy[s.id] = false; return copy })
      }catch(e){ console.error('loadAgg', e); setAggStudents([]) }
      finally{ setAggLoading(false) }
    }
    loadAgg()
  }, [selectedAssignments, bulkAssignments])

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm mb-6 p-6 border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
            <Calendar className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Mark Attendance</h1>
            <p className="text-slate-600 text-sm">Record student attendance for periods</p>
          </div>
        </div>
      </div>

      {/* Date Selector */}
      <div className="bg-white rounded-xl shadow-sm mb-6 p-4 border border-slate-200">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            Select Date:
          </label>
          <input 
            type="date" 
            value={date} 
            onChange={e=> setDate(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Assigned Periods */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Assigned Periods
          </h2>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <span className="ml-3 text-slate-600">Loading periods...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupPeriodsList(periods).map(p=> (
                <div key={p.id} className="border border-slate-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 mb-1">
                        {p.period.label || `Period ${p.period.index}`}
                      </h3>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600 mb-1">
                        <Clock className="w-4 h-4" />
                        {p.period.start_time || ''}{p.period.start_time && p.period.end_time ? ` — ${p.period.end_time}` : ''}
                      </div>
                      <div className="text-sm text-slate-700 mb-1">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-medium">
                          {p.section_names && p.section_names.length ? p.section_names.join(' + ') : p.section_name}
                        </span>
                      </div>
                      <div className="text-sm italic text-slate-600">{p.subject_display || p.subject || 'No subject'}</div>
                      {/* Unlock request status label */}
                      {p.unlock_request_status && (
                        <div className="mt-2">
                          {p.unlock_request_status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-md text-xs font-medium">Pending</span>
                          )}
                          {p.unlock_request_status === 'APPROVED' && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-green-100 text-green-800 border border-green-300 rounded-md text-xs font-medium">Approved</span>
                          )}
                          {p.unlock_request_status === 'REJECTED' && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-red-100 text-red-800 border border-red-300 rounded-md text-xs font-medium">Rejected</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    {p.attendance_session_locked ? (
                      <button 
                        onClick={() => openPeriod(p)}
                        className="w-full px-3 py-2 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-sm font-medium hover:bg-amber-200 flex items-center justify-center gap-2"
                      >
                        <Lock className="w-4 h-4" />
                        {p.attendance_session_id ? 'View Locked Session' : 'View Locked Period'}
                      </button>
                    ) : (
                      <button 
                        onClick={()=> handlePeriodClick(p)}
                        className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        {p.attendance_session_id ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Open Session
                          </>
                        ) : (
                          <>
                            <Calendar className="w-4 h-4" />
                            Take Attendance
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              
              {!periods.length && (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <div className="bg-slate-100 p-4 rounded-full mb-4">
                    <Calendar className="w-12 h-12 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-1">No Periods Found</h3>
                  <p className="text-slate-600 text-sm">No periods assigned for this date</p>
                </div>
              )}
              
              <div className="col-span-full mt-2">
                <button 
                  onClick={openBulkModal}
                  className="w-full px-4 py-3 border-2 border-dashed border-indigo-300 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-colors"
                >
                  Bulk Mark (All Assignments)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Session Panel */}
      {selected && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-900">
                {(selected as any).combined_period_label || (selected.period.label || `Period ${selected.period.index}`)} — {selected.section_name}
                <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-sm font-medium">{students.length} student{students.length !== 1 ? 's' : ''}</span>
              </h3>
              {selected.attendance_session_locked && (
                <>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-sm font-medium">
                    <Lock className="w-3.5 h-3.5" />
                    Locked
                  </span>
                  {selected.unlock_request_status === 'PENDING' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-sm font-medium ml-3">
                      Pending
                    </span>
                  )}
                  {selected.unlock_request_status === 'APPROVED' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-800 border border-green-200 rounded-lg text-sm font-medium ml-3">
                      Approved
                    </span>
                  )}
                  {selected.unlock_request_status === 'REJECTED' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-800 border border-red-200 rounded-lg text-sm font-medium ml-3">
                      Rejected
                    </span>
                  )}
                </>
              )}
            </div>
            <button 
              onClick={()=> setSelected(null)}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Close
            </button>
          </div>

          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-slate-50">Reg No</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-slate-50">Student</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-slate-50">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {students.map(s=> {
                    const status = marks[s.id] || 'P'
                    const statusSelectClasses: Record<string,string> = {
                      P: 'bg-green-50 text-green-800 border-green-300',
                      A: 'bg-red-50 text-red-800 border-red-300',
                      LEAVE: 'bg-amber-50 text-amber-800 border-amber-300',
                      OD: 'bg-blue-50 text-blue-800 border-blue-300',
                      LATE: 'bg-indigo-50 text-indigo-800 border-indigo-300',
                    }
                    const statusBadgeClasses: Record<string,string> = {
                      P: 'bg-green-600',
                      A: 'bg-red-600',
                      LEAVE: 'bg-amber-600',
                      OD: 'bg-blue-600',
                      LATE: 'bg-indigo-600',
                    }
                    const statusCls = statusSelectClasses[status] || statusSelectClasses['P']
                    const badgeCls = statusBadgeClasses[status] || statusBadgeClasses['P']

                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">{s.reg_no}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{s.username}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <span className={`inline-block w-3 h-3 rounded-full mr-2 ${badgeCls}`} />
                            <div className="relative inline-block">
                              <select 
                                value={marks[s.id] || 'P'} 
                                onChange={e=> setMark(s.id, e.target.value)}
                                disabled={selected.attendance_session_locked}
                                className={`appearance-none px-3 py-1.5 pr-8 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${statusCls} ${selected.attendance_session_locked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                              >
                                <option value="P">Present</option>
                                <option value="A">Absent</option>
                                <option value="LEAVE">Leave</option>
                                <option value="OD">On Duty</option>
                                <option value="LATE">Late</option>
                              </select>
                              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button 
                onClick={saveMarks} 
                disabled={saving || selected.attendance_session_locked}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Attendance
                  </>
                )}
              </button>
              
              {selected.attendance_session_id && (
                <button 
                  onClick={toggleLock} 
                  disabled={locking}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                    selected.attendance_session_locked
                      ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white'
                      : 'bg-slate-600 hover:bg-slate-700 disabled:bg-slate-300 text-white'
                  }`}
                >
                  {locking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {selected.attendance_session_locked ? 'Unlocking...' : 'Locking...'}
                    </>
                  ) : (
                    <>
                      {selected.attendance_session_locked ? (
                        <>
                          <Unlock className="w-4 h-4" />
                          Unlock Session
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          Lock Session
                        </>
                      )}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 rounded-t-xl">
              <h3 className="text-xl font-bold text-slate-900">Bulk Mark Attendance</h3>
            </div>

            <div className="p-6 space-y-6">
              {/* Month Selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Select Month:
                </label>
                <input 
                  type="month" 
                  value={bulkMonth} 
                  onChange={e=> setBulkMonth(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Assignments */}
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-3">Assignments</label>
                <div className="border border-slate-200 rounded-lg p-4 max-h-60 overflow-y-auto bg-slate-50">
                  <label className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-700">
                    <input 
                      type="checkbox" 
                      checked={Object.keys(selectedAssignments).length>0 && Object.values(selectedAssignments).every(Boolean)} 
                      onChange={(e)=>{ 
                        const checked = e.target.checked
                        const next: Record<string,boolean> = {}
                        for(const a of bulkAssignments){ 
                          const key = a.id? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
                          next[key] = checked 
                        } 
                        setSelectedAssignments(next) 
                      }}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    Select / Deselect all
                  </label>
                  <div className="space-y-2">
                    {(() => {
                      const filteredAssignments = bulkAssignments.filter(a => {
                        // Filter out assignments that are completely marked for the month
                        const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
                        const markedDates = markedSessions[key]
                        if (!markedDates) return true // Show if no dates marked
                        
                        // Calculate total possible dates for this assignment in the month
                        try {
                          const [y, m] = bulkMonth.split('-').map(x => parseInt(x))
                          const lastDay = new Date(y, m, 0).getDate()
                          let possibleDates = 0
                          for (let d = 1; d <= lastDay; d++) {
                            const dt = new Date(y, m - 1, d)
                            const dayOfWeek = dt.getDay() === 0 ? 7 : dt.getDay()
                            if (dayOfWeek === a._day) possibleDates++
                          }
                          // Hide if all possible dates are marked
                          return markedDates.size < possibleDates
                        } catch {
                          return true
                        }
                      })
                      
                      if (filteredAssignments.length === 0) {
                        return (
                          <div className="text-center py-8 text-slate-600">
                            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                            <p className="font-medium">All assignments are fully marked for this month!</p>
                          </div>
                        )
                      }
                      
                      return filteredAssignments.map(a=>{
                        const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
                        const markedDates = markedSessions[key]
                        const markedCount = markedDates ? markedDates.size : 0
                        
                        return (
                          <label key={key} className="flex items-start gap-3 p-2 hover:bg-white rounded-lg transition-colors cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={!!selectedAssignments[key]} 
                              onChange={()=> setSelectedAssignments(prev=> ({ ...prev, [key]: !prev[key] }))}
                              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 mt-0.5"
                            />
                            <div className="flex-1 text-sm">
                              <div className="font-medium text-slate-900">
                                {a.label || `Period ${a.period_index}`} — {['Mon','Tue','Wed','Thu','Fri','Sat'][a._day-1] || `Day ${a._day}`} 
                                {a.start_time ? ` ${a.start_time}${a.end_time? ' - '+a.end_time : ''}` : ''}
                              </div>
                              <div className="text-xs text-slate-600 mt-0.5">
                                {a.section_name || a.section?.name || (a.section_id ? `Section ${a.section_id}` : '')} — {a.subject_display || a.subject_text || ''}
                                {markedCount > 0 && (
                                  <span className="ml-2 text-green-600 font-medium">({markedCount} day{markedCount !== 1 ? 's' : ''} marked)</span>
                                )}
                              </div>
                            </div>
                          </label>
                        )
                      })
                    })()}
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-3">Dates (month view for selected assignments)</label>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    try{
                      const [y,m] = bulkMonth.split('-').map(x=> parseInt(x))
                      const last = new Date(y,m,0)
                      const weekdays = new Set<number>()
                      for(const a of bulkAssignments){ 
                        const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
                        if (selectedAssignments[key]) weekdays.add(a._day) 
                      }
                      const dates: string[] = []
                      for(let d=1; d<= last.getDate(); d++){ 
                        const dt = new Date(y,m-1,d)
                        const isow = dt.getDay() === 0 ? 7 : dt.getDay()
                        if (weekdays.size>0 && weekdays.has(isow)) dates.push(dt.toISOString().slice(0,10)) 
                      }
                      
                      // Get selected assignment keys
                      const selectedKeys = Object.keys(selectedAssignments).filter(k => selectedAssignments[k])
                      
                      // Filter dates: only show if at least one selected assignment doesn't have attendance for that date
                      const availableDates = dates.filter(dd => {
                        if (selectedKeys.length === 0) return true
                        
                        // Show date if ANY selected assignment doesn't have attendance on this date
                        return selectedKeys.some(key => {
                          const markedDates = markedSessions[key]
                          return !markedDates || !markedDates.has(dd)
                        })
                      })
                      
                      if (availableDates.length === 0 && selectedKeys.length > 0) {
                        return (
                          <div className="text-center py-4 text-slate-600">
                            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                            <p className="text-sm">All dates are already marked for selected assignments</p>
                          </div>
                        )
                      }
                      
                      return availableDates.map(dd=> {
                        // Count how many selected assignments already have attendance on this date
                        const alreadyMarkedCount = selectedKeys.filter(key => {
                          const markedDates = markedSessions[key]
                          return markedDates && markedDates.has(dd)
                        }).length
                        
                        return (
                          <label key={dd} className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-100 cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              checked={!!bulkDateSelected[dd]} 
                              onChange={()=> setBulkDateSelected(prev=> ({ ...prev, [dd]: !prev[dd] }))}
                              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                            />
                            <span>
                              {dd}
                              {alreadyMarkedCount > 0 && selectedKeys.length > 1 && (
                                <span className="ml-1 text-xs text-amber-600">({alreadyMarkedCount}/{selectedKeys.length} marked)</span>
                              )}
                            </span>
                          </label>
                        )
                      })
                    }catch(e){ return <div /> }
                  })()}
                </div>
              </div>

              {/* Students */}
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-3">
                  Students (derived from selected assignments)
                  <span className="ml-2 text-sm text-slate-600">({aggStudents.length} student{aggStudents.length !== 1 ? 's' : ''})</span>
                </label>
                <div className="border border-slate-200 rounded-lg p-4 max-h-64 overflow-y-auto bg-slate-50">
                  {aggLoading && (
                    <div className="flex items-center justify-center py-8 text-slate-600">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      Loading students...
                    </div>
                  )}
                  {!aggLoading && aggStudents.length === 0 && (
                    <div className="text-center py-8 text-slate-600">No students for selected assignments</div>
                  )}
                  {!aggLoading && aggStudents.length > 0 && (
                    <div className="space-y-1">
                      {aggStudents.map(s=> (
                        <label key={s.id} className="flex items-center gap-2 p-2 hover:bg-white rounded-lg transition-colors cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={!!bulkSelected[s.id]} 
                            onChange={_=> setBulkSelected(prev=> ({ ...prev, [s.id]: !prev[s.id] }))}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                          />
                          <span className="text-sm text-slate-900">{s.reg_no} — {s.username}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex gap-3 rounded-b-xl">
              <button 
                onClick={async ()=>{
                  const selectedDates = Object.keys(bulkDateSelected).filter(d=> bulkDateSelected[d])
                  if (!selectedDates.length){ alert('Select at least one date'); return }
                  const assignments_payload: any[] = []
                  for(const a of bulkAssignments){ 
                    const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section?.id || a.section_id}`
                    if (!selectedAssignments[key]) continue
                    const raw_section = a.section_id || (a.section && (a.section.id || a.section.pk)) || a.section?.pk || a.section?.id
                    const raw_period = a.period_id || (a.period && (a.period.id || a.period_id)) || a.period?.id || a.period_id
                    const section_id = Number(raw_section)
                    const period_id = Number(raw_period)
                    if (!Number.isFinite(section_id) || !Number.isFinite(period_id)) continue
                    assignments_payload.push({ section_id, period_id }) 
                  }
                  const student_ids = Object.keys(bulkSelected).filter(k=> bulkSelected[Number(k)]).map(k=> Number(k))
                  if (!assignments_payload.length){ alert('No assignments selected'); return }
                  if (!student_ids.length){ alert('No students selected'); return }
                  try{
                    const res = await fetchWithAuth('/api/academics/period-attendance/bulk-mark/', { method: 'POST', body: JSON.stringify({ assignments: assignments_payload, dates: selectedDates, student_ids }) })
                    if (!res.ok) { 
                      let txt = 'Failed'
                      try{ const j = await res.json(); txt = JSON.stringify(j) }catch(_){ try{ txt = await res.text() }catch(_){}} 
                      alert('Failed: '+txt)
                      return 
                    }
                    alert('Bulk attendance saved')
                    setBulkModalOpen(false)
                  }catch(e){ console.error('bulk save', e); alert('Failed to save bulk attendance') }
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Bulk
              </button>
              <button 
                onClick={()=> setBulkModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consecutive Period Confirmation Modal */}
      {consecutiveModal && pendingPeriod && consecutivePeriod && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-4 rounded-t-xl">
              <div className="flex items-center gap-3 text-white">
                <AlertCircle className="w-6 h-6" />
                <h3 className="text-xl font-bold">Consecutive Periods Detected</h3>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-slate-700 mb-3">
                  The same subject has consecutive periods{Math.abs(consecutivePeriod.period.index - pendingPeriod.period.index) > 1 ? ' (with break/lunch in between)' : ''}:
                </p>
                
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                    <span className="font-semibold text-slate-900">
                      {pendingPeriod.period.label || `Period ${pendingPeriod.period.index}`}
                    </span>
                    <span className="text-slate-600">
                      ({pendingPeriod.period.start_time} - {pendingPeriod.period.end_time})
                    </span>
                  </div>
                  
                  {Math.abs(consecutivePeriod.period.index - pendingPeriod.period.index) > 1 && (
                    <div className="flex items-center gap-2 text-sm pl-4">
                      <span className="text-slate-500 italic">
                        ↓ {Math.abs(consecutivePeriod.period.index - pendingPeriod.period.index) - 1} period(s) in between (break/lunch)
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                    <span className="font-semibold text-slate-900">
                      {consecutivePeriod.period.label || `Period ${consecutivePeriod.period.index}`}
                    </span>
                    <span className="text-slate-600">
                      ({consecutivePeriod.period.start_time} - {consecutivePeriod.period.end_time})
                    </span>
                  </div>
                </div>

                <p className="text-sm font-medium text-slate-900">
                  Subject: <span className="text-indigo-600">{pendingPeriod.subject || pendingPeriod.subject_display || 'Same Subject'}</span>
                </p>
              </div>

              <p className="text-sm text-slate-600">
                Would you like to mark attendance for both periods at once (all students Present), 
                or just the selected period?
              </p>
            </div>

            <div className="px-6 pb-6 flex flex-col gap-3">
              <button 
                onClick={markBothPeriods}
                className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Mark Both Periods (All Present)
              </button>
              
              <button 
                onClick={markSinglePeriodOnly}
                className="w-full px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Single Period Only
              </button>
              
              <button 
                onClick={() => {
                  setConsecutiveModal(false)
                  setPendingPeriod(null)
                  setConsecutivePeriod(null)
                }}
                className="w-full px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
