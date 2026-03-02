import React, { useEffect, useRef, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Calendar, Clock, Users, CheckCircle2, XCircle, Loader2, Save, X, ChevronDown, AlertCircle, Lock, Unlock, GraduationCap, Check, ArrowLeftRight } from 'lucide-react'

type ViewMode = 'period' | 'daily'

type PeriodItem = {
  id: number
  section_id: number
  section_name: string
  period: { id: number; index: number; label?: string; start_time?: string; end_time?: string }
  subject?: string | null
  subject_display?: string | null
  subject_batch_id?: number | null
  subject_batch_label?: string | null
  teaching_assignment_id?: number | null
  attendance_session_id?: number | null
  attendance_session_locked?: boolean
  unlock_request_status?: string | null
  unlock_request_id?: number | null
  elective_subject_id?: number | null
  elective_subject_name?: string | null

  // Swap/assignment
  assigned_to?: { id: number; name: string; staff_id: string } | null
  original_staff?: { id: number; name: string; staff_id: string } | null

  // UI-only/grouping fields
  section_ids?: number[]
  section_names?: string[]
  attendance_session_ids?: (number | null)[]
  consecutive_periods?: { period_id: number; label?: string }[]
  combined_period_label?: string
  is_special?: boolean
  is_swap?: boolean
}

type Student = {
  id: number
  reg_no: string
  username?: string
  name?: string
  section?: string | null
  section_id?: number | null
  section_name?: string | null
}

export default function PeriodAttendance(){
  const [viewMode, setViewMode] = useState<ViewMode>('period')
  const viewModeInitialized = useRef(false)
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10))
  const [periods, setPeriods] = useState<PeriodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<PeriodItem | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [marks, setMarks] = useState<Record<number,string>>({})
  // dailyLocks: maps student id → their daily attendance override reason
  //   'OD' | 'LEAVE'  → period status is locked to that value (cannot be changed)
  //   'LATE'          → period status was forced to Present by daily LATE
  const [dailyLocks, setDailyLocks] = useState<Record<number, string>>({})
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
  const [consecutivePeriods, setConsecutivePeriods] = useState<PeriodItem[]>([])

  // Daily attendance state
  const [dailyMode, setDailyMode] = useState(false)
  const [myClassSections, setMyClassSections] = useState<any[]>([])
  const [selectedSection, setSelectedSection] = useState<any>(null)
  const [dailyAttendance, setDailyAttendance] = useState<any[]>([])
  const [dailySessionData, setDailySessionData] = useState<any>(null)
  const [attendanceStatus, setAttendanceStatus] = useState<Record<number, string>>({})
  const [attendanceRemarks, setAttendanceRemarks] = useState<Record<number, string>>({})
  const [savingDaily, setSavingDaily] = useState(false)
  const [loadingDaily, setLoadingDaily] = useState(false)
  const [lockingDaily, setLockingDaily] = useState(false)
  const [revertingAssignment, setRevertingAssignment] = useState(false)
  const [autoSavingStudentId, setAutoSavingStudentId] = useState<number | null>(null)
  const [removingBadgeStudentId, setRemovingBadgeStudentId] = useState<number | null>(null)

  // Swap attendance state
  const [swapModalOpen, setSwapModalOpen] = useState(false)
  const [swapFor, setSwapFor] = useState<'daily' | 'period'>('daily')  // which context the modal is for
  const [selectedPeriodForSwap, setSelectedPeriodForSwap] = useState<any>(null)  // period card being assigned
  const [departmentStaff, setDepartmentStaff] = useState<any[]>([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [selectedSwapStaff, setSelectedSwapStaff] = useState<any>(null)
  const [actualMarkedBy, setActualMarkedBy] = useState<any>(null) // Who actually marked the saved attendance

  // Date range attendance marking state
  const [showDateRangeSection, setShowDateRangeSection] = useState(false)
  const [dateRangeStartDate, setDateRangeStartDate] = useState<string>('')
  const [dateRangeEndDate, setDateRangeEndDate] = useState<string>('')
  const [dateRangeAttendanceType, setDateRangeAttendanceType] = useState<'OD' | 'LEAVE'>('OD')
  const [savingDateRange, setSavingDateRange] = useState(false)
  const [selectedStudentsForDateRange, setSelectedStudentsForDateRange] = useState<Set<number>>(new Set())

  // Check user permissions for attendance marking
  const userPerms = (() => {
    try { return JSON.parse(localStorage.getItem('permissions') || '[]') as string[] } catch { return [] }
  })()
  const hasMarkAttendancePermission = Array.isArray(userPerms) && (userPerms.includes('academics.mark_attendance') || userPerms.includes('MARK_ATTENDANCE'))
  const hasClassAdvisorPermission = myClassSections && myClassSections.length > 0
  
  // Check if user has sections assigned via swap
  const hasAssignedSections = myClassSections && myClassSections.some((section: any) => section.is_assigned_via_swap)
  // Class advisors always have daily attendance access regardless of mark_attendance permission
  const canAccessDailyAttendance = hasClassAdvisorPermission

  useEffect(()=>{ fetchPeriods(); loadMyClassSections() }, [date])
  useEffect(()=>{ if (selectedSection && dailyMode) loadDailyAttendance() }, [selectedSection, date, dailyMode])

  // Reset daily mode when switching to period view
  useEffect(() => {
    if (viewMode === 'period' && dailyMode) {
      setDailyMode(false)
      setSelectedSection(null)
    }
  }, [viewMode])

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
        else if ((p as any).elective_subject_id) key = `elective_${idx}_${(p as any).teaching_assignment_id || p.elective_subject_id}`
        else if ((p as any).subject) key = `subj_${idx}_${String((p as any).subject || '').replace(/[^A-Za-z0-9]/g,'').toLowerCase()}`
        else key = `section_${idx}_${p.section_id}`
      } else {
        if (p.subject_batch_id) key = `batch_${p.subject_batch_id}`
        else if (p.elective_subject_id) key = `elective_${(p as any).teaching_assignment_id || p.elective_subject_id}`
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
  // Returns all OTHER periods with the same subject as currentPeriod that form a
  // consecutive chain with it. Two same-subject periods are considered consecutive
  // when there is NO other teaching period (different subject, same section) between
  // their period indices — break/lunch slots never appear in `periods` so they are
  // transparently skipped, allowing e.g. P1 → Break → P2 to still be chained.
  function findConsecutivePeriods(currentPeriod: PeriodItem | any): PeriodItem[] {
    const currentSectionIds: number[] = currentPeriod.section_ids && Array.isArray(currentPeriod.section_ids) && currentPeriod.section_ids.length ? currentPeriod.section_ids : [currentPeriod.section_id]
    const currentSubjNorm = String(currentPeriod.subject_display || currentPeriod.subject || '').trim().toLowerCase()

    function isSameSubject(p: PeriodItem) {
      if (currentPeriod.subject_batch_id && p.subject_batch_id === currentPeriod.subject_batch_id) return true
      if (currentPeriod.elective_subject_id && p.elective_subject_id === currentPeriod.elective_subject_id) return true
      const pSubjNorm = String(p.subject_display || p.subject || '').trim().toLowerCase()
      return !!(currentSubjNorm && pSubjNorm && currentSubjNorm === pSubjNorm)
    }

    // Collect all periods (including current) that share the same subject & section
    const sameSubjectAll = periods.filter(p => {
      if (!p || p.attendance_session_locked) return false
      const pSectionIds: number[] = p.section_ids && Array.isArray(p.section_ids) && p.section_ids.length ? p.section_ids : [p.section_id]
      if (!pSectionIds.some(sid => currentSectionIds.includes(sid))) return false
      return isSameSubject(p)
    })

    if (sameSubjectAll.length <= 1) return []

    const sorted = [...sameSubjectAll].sort((a, b) => a.period.index - b.period.index)

    // Build chains: adjacent same-subject periods stay in the same chain UNLESS a
    // different-subject teaching period (same section) falls between their indices.
    // Breaks/lunch never appear in `periods`, so gaps caused by them are ignored.
    const chains: PeriodItem[][] = []
    let current: PeriodItem[] = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      const prevIdx = sorted[i - 1].period.index
      const nextIdx = sorted[i].period.index
      // Is there a different-subject teaching period between prevIdx and nextIdx (exclusive)?
      const blocked = periods.some(p => {
        if (!p) return false
        const pIdx = p.period?.index ?? 0
        if (pIdx <= prevIdx || pIdx >= nextIdx) return false
        if (isSameSubject(p)) return false
        const pSectionIds: number[] = p.section_ids && Array.isArray(p.section_ids) ? p.section_ids : [p.section_id]
        return pSectionIds.some(sid => currentSectionIds.includes(sid))
      })
      if (!blocked) {
        current.push(sorted[i])
      } else {
        chains.push(current)
        current = [sorted[i]]
      }
    }
    chains.push(current)

    // Find the chain containing the current period
    const currentId = currentPeriod.id
    const currentIdx = currentPeriod.period?.index ?? 0
    const chain = chains.find(ch =>
      ch.some(p => (currentId && p.id === currentId) || p.period.index === currentIdx)
    )
    if (!chain || chain.length <= 1) return []

    return chain.filter(p => !(currentId && p.id === currentId) && p.period.index !== currentIdx)
  }

  // Handle period click with consecutive detection
  function handlePeriodClick(p: PeriodItem | any) {
    const others = findConsecutivePeriods(p as PeriodItem)

    if (others.length > 0) {
      setPendingPeriod(p)
      setConsecutivePeriods(others)
      setConsecutiveModal(true)
    } else {
      openPeriod(p)
    }
  }

  // Open single period
  async function openPeriod(p: PeriodItem | any){
    setSelected(p)
    setDailyMode(false)
    setSelectedSection(null)
    setStudents([])
    setMarks({})
    setDailyLocks({})
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
      
      // Load daily attendance as default for students (if exists)
      // OD/LEAVE → lock that status in period; LATE → force Present; others → copy as-is
      const locksByStudent: Record<number, string> = {}
      try {
        // Collect section IDs from three sources (priority: student home section > period section_ids):
        //   1. Home section of each student (covers elective/cross-dept students)
        //   2. Period's own section_ids (for non-elective normal periods)
        // This ensures students from other sections/depts get their own daily attendance loaded.
        const studentSectionMap: Record<number, number> = {}
        for (const s of deduped) {
          const sid = Number(s.section_id ?? null)
          if (sid) studentSectionMap[Number(s.id)] = sid
        }
        const studentHomeSections = Array.from(new Set(Object.values(studentSectionMap)))
        const periodSectionIds: number[] = (p.section_ids && Array.isArray(p.section_ids) && p.section_ids.length > 0)
          ? p.section_ids.map(Number).filter(Boolean)
          : (p.section_id ? [Number(p.section_id)] : [])
        // Union of both – de-duplicated
        const allSectionIds = Array.from(new Set([...studentHomeSections, ...periodSectionIds]))

        const dailyMarks: Record<number, string> = {};
        
        await Promise.allSettled(allSectionIds.map(async (secId) => {
          if (!secId) return;
          try {
            const dailyRes = await fetchWithAuth(`/api/academics/analytics/daily-attendance/?section_id=${secId}&date=${date}`);
            if (dailyRes.ok) {
              const dailyData = await dailyRes.json();
              (dailyData.students || []).forEach((student: any) => {
                const status = student.status || 'P';
                if (status === 'OD' || status === 'LEAVE') {
                  dailyMarks[student.student_id] = status;
                  locksByStudent[student.student_id] = status;
                } else if (status === 'LATE') {
                  dailyMarks[student.student_id] = 'P';
                  locksByStudent[student.student_id] = 'LATE';
                } else if (status !== 'P') {
                  dailyMarks[student.student_id] = status;
                }
              });
            }
          } catch (e) {
            console.debug('Could not load daily attendance for section', secId, e);
          }
        }))
        
        // Apply daily attendance as base (overrides initial 'P' for absent/OD/late students)
        Object.assign(initial, dailyMarks);
      } catch (e) {
        console.debug('Could not load daily attendance defaults', e);
      }
      
      setDailyLocks(locksByStudent)
      setMarks(initial);

      // If grouped, try to load existing session records from attendance_session_ids
      // These will override daily attendance defaults if period was manually marked,
      // EXCEPT for OD/LEAVE which stay locked to their daily status.
      if (p.attendance_session_id || (p.attendance_session_ids && p.attendance_session_ids.length)){
        try{
          const sessIds = p.attendance_session_ids && p.attendance_session_ids.length ? p.attendance_session_ids : [p.attendance_session_id]
          // fetch records for all sessions and apply latest status per student (by id)
          const tasks = sessIds.map((sid: any) => fetchWithAuth(`/api/academics/period-attendance/${sid}/`).then(r => r.ok ? r.json() : null).catch(()=>null))
          const settled = await Promise.allSettled(tasks)
          const updated = { ...initial }
          for (const s of settled){ if (s.status !== 'fulfilled' || !s.value) continue; const pj = s.value; const recs = pj.records || []; recs.forEach((r:any)=>{ const sid = r.student_pk || (r.student && r.student.id) || null; if (sid) updated[sid] = r.status || updated[sid] || 'A' }) }
          // Re-apply OD/LEAVE locks so saved records can never override them
          for (const [sidStr, lock] of Object.entries(locksByStudent)) {
            if (lock === 'OD' || lock === 'LEAVE') updated[Number(sidStr)] = lock
            if (lock === 'LATE') updated[Number(sidStr)] = 'P'
          }
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
          const payload = {
            section_id: sid,
            period_id: pid,
            teaching_assignment_id: (selected as any).teaching_assignment_id ?? null,
            date,
            records: recordsBySection[sid] || [],
          }
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

  // Mark all consecutive periods (pendingPeriod + consecutivePeriods) with same attendance
  async function markAllPeriods() {
    if (!pendingPeriod || !consecutivePeriods.length) return
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

      // Load daily attendance as default (if exists)
      // OD/LEAVE → lock; LATE → force Present
      const consecutiveLocks: Record<number, string> = {}
      try {
        // Derive section IDs from students' own home sections first (covers cross-dept/elective)
        const studentSecMap: Record<number, number> = {}
        for (const s of studentList) {
          const sid = Number(s.section_id ?? null)
          if (sid) studentSecMap[Number(s.id)] = sid
        }
        const homeSects = Array.from(new Set(Object.values(studentSecMap)))
        const periodSects: number[] = (p.section_ids && Array.isArray(p.section_ids) && p.section_ids.length > 0)
          ? p.section_ids.map(Number).filter(Boolean)
          : (p.section_id ? [Number(p.section_id)] : [])
        const allSects = Array.from(new Set([...homeSects, ...periodSects]))

        await Promise.allSettled(allSects.map(async (secId) => {
          if (!secId) return;
          try {
            const dailyRes = await fetchWithAuth(`/api/academics/analytics/daily-attendance/?section_id=${secId}&date=${date}`);
            if (dailyRes.ok) {
              const dailyData = await dailyRes.json();
              (dailyData.students || []).forEach((student: any) => {
                const status = student.status || 'P';
                if (status === 'OD' || status === 'LEAVE') {
                  if (initialMarks[student.student_id] !== undefined) initialMarks[student.student_id] = status;
                  consecutiveLocks[student.student_id] = status;
                } else if (status === 'LATE') {
                  consecutiveLocks[student.student_id] = 'LATE';
                } else if (status !== 'P' && initialMarks[student.student_id] !== undefined) {
                  initialMarks[student.student_id] = status;
                }
              });
            }
          } catch (e) {
            console.debug('Could not load daily attendance for section', secId, e);
          }
        }))
      } catch (e) {
        console.debug('Could not load daily attendance defaults for both periods', e);
      }

      setStudents(studentList)
      setMarks(initialMarks)
      setDailyLocks(consecutiveLocks)
      const sectionNames = p.section_names && p.section_names.length ? p.section_names.join(' + ') : (p.section_name || '')
      // Build consecutive_periods from ALL periods in the chain (sorted by index)
      const allPeriodsInChain = [pendingPeriod, ...consecutivePeriods].sort((a, b) => (a.period?.index ?? 0) - (b.period?.index ?? 0))
      const combinedLabel = allPeriodsInChain.map(pp => pp.period?.label || `Period ${pp.period?.index}`).join(' & ')
      const consecutivePeriodsPayload = allPeriodsInChain.map(pp => ({ period_id: pp.period.id, label: pp.period?.label || '' }))
      setDailyMode(false)
      setSelectedSection(null)
      setSelected({ ...pendingPeriod, consecutive_periods: consecutivePeriodsPayload, combined_period_label: combinedLabel, section_name: sectionNames, section_ids: p.section_ids || [p.section_id] })
      // Do not auto-save: allow user to review/edit then click Save
    } catch(e) {
      console.error('markAllPeriods error:', e)
      alert('Failed to prepare marking for all periods: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setConsecutiveModal(false)
      setPendingPeriod(null)
      setConsecutivePeriods([])
    }
  }

  // Mark single period only (for consecutive modal)
  function markSinglePeriodOnly() {
    if (!pendingPeriod) return
    setConsecutiveModal(false)
    openPeriod(pendingPeriod)
    setPendingPeriod(null)
    setConsecutivePeriods([])
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

  // Daily Attendance Functions
  async function loadMyClassSections() {
    setLoadingDaily(true)
    try {
      const response = await fetchWithAuth(`/api/academics/analytics/my-class-students/?date=${date}`)
      if (!response.ok) throw new Error('Failed to load sections')
      const data = await response.json()
      const sections = data.sections || []
      setMyClassSections(sections)
      // Auto-select default tab on first load only
      if (!viewModeInitialized.current) {
        viewModeInitialized.current = true
        // If user has daily sections, default to 'daily' tab
        if (sections.length > 0) {
          setViewMode('daily')
        }
      }
      if (sections.length > 0 && !selectedSection) {
        setSelectedSection(sections[0])
      }
    } catch (error) {
      console.error('Error loading sections:', error)
      setMyClassSections([])
      if (!viewModeInitialized.current) {
        viewModeInitialized.current = true
      }
    } finally {
      setLoadingDaily(false)
    }
  }

  async function loadDailyAttendance() {
    if (!selectedSection) return
    setLoadingDaily(true)
    try {
      const response = await fetchWithAuth(`/api/academics/analytics/daily-attendance/?section_id=${selectedSection.section_id}&date=${date}`)
      if (!response.ok) throw new Error('Failed to load attendance')
      const data = await response.json()
      setDailyAttendance(data.students || [])
      setDailySessionData(data)
      
      const statusMap: Record<number, string> = {}
      const remarksMap: Record<number, string> = {}
      let markedByInfo = null
      
      data.students.forEach((student: any, index: number) => {
        statusMap[student.student_id] = student.status || 'P'
        remarksMap[student.student_id] = student.remarks || ''
        
        // Extract marked_by from first student that has it
        if (index === 0 && student.marked_by) {
          markedByInfo = student.marked_by
        }
      })
      
      setAttendanceStatus(statusMap)
      setAttendanceRemarks(remarksMap)
      setActualMarkedBy(markedByInfo)
    } catch (error) {
      console.error('Error loading daily attendance:', error)
      setDailyAttendance([])
      setDailySessionData(null)
      setActualMarkedBy(null)
    } finally {
      setLoadingDaily(false)
    }
  }

  async function saveDailyAttendance() {
    if (!selectedSection) return
    
    // Check if session is locked
    if (dailySessionData?.is_locked) {
      alert('Daily attendance is locked and cannot be modified')
      return
    }
    
    setSavingDaily(true)
    try {
      const records = dailyAttendance.map(student => ({
        student_id: student.student_id,
        status: attendanceStatus[student.student_id] || 'P',
        remarks: attendanceRemarks[student.student_id] || ''
      }))

      const payload: any = {
        section_id: selectedSection.section_id,
        date: date,
        attendance: records
      }

      const response = await fetchWithAuth('/api/academics/analytics/daily-attendance/', {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      if (!response.ok) throw new Error('Failed to save attendance')
      
      alert('Daily attendance saved successfully!')
      
      await loadDailyAttendance()
    } catch (error) {
      console.error('Error saving daily attendance:', error)
      alert('Failed to save attendance')
    } finally {
      setSavingDaily(false)
    }
  }

  function markAllDaily(status: string) {
    const newStatus: Record<number, string> = {}
    dailyAttendance.forEach(student => {
      newStatus[student.student_id] = status
    })
    setAttendanceStatus(newStatus)
  }

  // Auto-save individual student attendance when dropdown changes
  async function autoSaveStudentAttendance(studentId: number, newStatus: string) {
    if (!selectedSection) return
    
    // Check if session is locked
    if (dailySessionData?.is_locked) {
      return
    }
    
    setAutoSavingStudentId(studentId)
    try {
      const records = [{
        student_id: studentId,
        status: newStatus,
        remarks: attendanceRemarks[studentId] || ''
      }]

      const response = await fetchWithAuth('/api/academics/analytics/daily-attendance/', {
        method: 'POST',
        body: JSON.stringify({
          section_id: selectedSection.section_id,
          date: date,
          attendance: records
        })
      })

      if (!response.ok) throw new Error('Failed to save attendance')
      
      // Reload to get updated badge display
      await loadDailyAttendance()
    } catch (error) {
      console.error('Error auto-saving attendance:', error)
      alert('Failed to save attendance. Please try again.')
      // Revert the change on error
      setAttendanceStatus(prev => {
        const newState = { ...prev }
        // Revert to original value from dailyAttendance
        const originalStudent = dailyAttendance.find(s => s.student_id === studentId)
        if (originalStudent) {
          newState[studentId] = originalStudent.status || 'P'
        }
        return newState
      })
    } finally {
      setAutoSavingStudentId(null)
    }
  }

  // Handle attendance status change with auto-save
  function handleAttendanceStatusChange(studentId: number, newStatus: string) {
    // Update local state immediately for responsive UI
    setAttendanceStatus(prev => ({ ...prev, [studentId]: newStatus }))
    
    // Auto-save to backend
    autoSaveStudentAttendance(studentId, newStatus)
  }

  // Remove OD/Leave badge and records
  async function removeODLeaveBadge(studentId: number, startDate: string, endDate: string) {
    if (!selectedSection) return
    
    // Check if session is locked
    if (dailySessionData?.is_locked) {
      alert('Daily attendance is locked and cannot be modified')
      return
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to remove the OD/Leave record for this date range?\n\n` +
      `This will delete records from ${startDate} to ${endDate}.`
    )
    
    if (!confirmed) return
    
    setRemovingBadgeStudentId(studentId)
    try {
      const response = await fetchWithAuth('/api/academics/analytics/daily-attendance-remove-od-leave/', {
        method: 'DELETE',
        body: JSON.stringify({
          section_id: selectedSection.section_id,
          student_id: studentId,
          start_date: startDate,
          end_date: endDate
        })
      })

      if (!response.ok) throw new Error('Failed to remove attendance records')
      
      // Update local state to set student to Present
      setAttendanceStatus(prev => ({ ...prev, [studentId]: 'P' }))
      
      // Reload to get updated badge display
      await loadDailyAttendance()
    } catch (error) {
      console.error('Error removing OD/Leave records:', error)
      alert('Failed to remove attendance records. Please try again.')
    } finally {
      setRemovingBadgeStudentId(null)
    }
  }

  // Load department staff for swap
  async function loadDepartmentStaff() {
    setLoadingStaff(true)
    try {
      const res = await fetchWithAuth('/api/academics/department-staff/')
      if (!res.ok) throw new Error('Failed to load staff')
      const data = await res.json()
      setDepartmentStaff(data.results || [])
    } catch (error) {
      console.error('Error loading department staff:', error)
      alert('Failed to load staff from your department')
    } finally {
      setLoadingStaff(false)
    }
  }

  // Open swap modal
  function openSwapModal() {
    setSwapFor('daily')
    setSwapModalOpen(true)
    loadDepartmentStaff()
  }

  function openPeriodSwapModal(period: any) {
    setSwapFor('period')
    setSelectedPeriodForSwap(period)
    setSwapModalOpen(true)
    loadDepartmentStaff()
  }

  // Handle staff selection for swap - IMMEDIATELY assigns on backend
  async function handleSwapStaff(staff: any) {
    if (swapFor === 'period') {
      await handlePeriodSwapStaff(staff)
      return
    }
    if (!confirm(`Assign attendance taking to ${staff.name}? This will immediately transfer responsibility for marking attendance to them. You will no longer be able to access this attendance session.`)) {
      return
    }
    
    setSwapModalOpen(false)
    setSavingDaily(true)
    
    try {
      // Immediately send assignment to backend
      const response = await fetchWithAuth('/api/academics/analytics/daily-attendance/', {
        method: 'POST',
        body: JSON.stringify({
          section_id: selectedSection.section_id,
          date: date,
          attendance: [],  // Empty array - we're only assigning, not marking attendance yet
          taken_by_staff_id: staff.id
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to assign attendance')
      }
      
      alert(`Attendance successfully assigned to ${staff.name}! They will now see this section in their daily attendance list. You will be redirected back to the section list.`)
      
      // Close the panel and go back to section list since advisor no longer has access
      setDailyMode(false)
      setSelectedSection(null)
      setSelectedSwapStaff(null)
      setActualMarkedBy(null)
      
      // Reload sections in case there are other assigned sections
      await loadMyClassSections()
    } catch (error) {
      console.error('Error assigning attendance:', error)
      alert('Failed to assign attendance: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setSavingDaily(false)
    }
  }

  // Assign period attendance to another staff
  async function handlePeriodSwapStaff(staff: any) {
    const p = selectedPeriodForSwap || selected
    if (!p) return

    if (!confirm(`Assign ${p.period?.label || 'this period'} attendance to ${staff.name}? They will be responsible for marking this period's attendance.`)) {
      setSwapModalOpen(false)
      return
    }

    setSwapModalOpen(false)
    setSaving(true)
    try {
      const body: any = {
        section_id: p.section_id,
        period_id: p.period?.id,
        date: date,
        taken_by_staff_id: staff.id,
      }
      if (p.teaching_assignment_id) body.teaching_assignment_id = p.teaching_assignment_id

      const res = await fetchWithAuth('/api/academics/analytics/period-attendance-swap/', {
        method: 'POST',
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to assign')
      }
      const data = await res.json()
      // Update local period card to reflect assignment
      setPeriods(prev => prev.map(pp =>
        pp.id === p.id ? { ...pp, assigned_to: data.assigned_to, attendance_session_id: data.session_id } : pp
      ))
      if (selected && selected.id === p.id) {
        setSelected((s: any) => s ? { ...s, assigned_to: data.assigned_to, attendance_session_id: data.session_id } : s)
      }
      alert(`Period attendance assigned to ${staff.name}. They can now mark attendance for this period.`)
    } catch (e) {
      console.error('Period swap error:', e)
      alert('Failed to assign: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
      setSelectedPeriodForSwap(null)
    }
  }

  // Revert period attendance assignment
  async function revertPeriodAssignment(sessionId: number, periodId: any) {
    const assignedName = selected?.assigned_to?.name || selected?.assigned_to?.staff_id || 'assigned staff'
    if (!confirm(`Revert assignment from ${assignedName}? This is only possible if they haven't marked attendance yet.`)) return

    setSaving(true)
    try {
      const res = await fetchWithAuth(`/api/academics/analytics/period-attendance-revert/${sessionId}/`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to revert')
      }
      // Clear assigned_to locally
      setPeriods(prev => prev.map(pp =>
        pp.attendance_session_id === sessionId ? { ...pp, assigned_to: null } : pp
      ))
      setSelected((s: any) => s ? { ...s, assigned_to: null } : s)
      alert('Assignment reverted. You can now mark attendance for this period.')
    } catch (e) {
      console.error('Period revert error:', e)
      alert('Failed to revert: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  // Helper functions for date range student selection
  function toggleStudentForDateRange(studentId: number) {
    setSelectedStudentsForDateRange(prev => {
      const newSet = new Set(prev)
      if (newSet.has(studentId)) {
        newSet.delete(studentId)
      } else {
        newSet.add(studentId)
      }
      return newSet
    })
  }

  function toggleAllStudentsForDateRange() {
    if (selectedStudentsForDateRange.size === dailyAttendance.length) {
      // If all selected, deselect all
      setSelectedStudentsForDateRange(new Set())
    } else {
      // Select all
      const allIds = dailyAttendance.map(s => s.student_id)
      setSelectedStudentsForDateRange(new Set(allIds))
    }
  }

  // Handle start date change and clear end date if it becomes invalid
  function handleStartDateChange(newStartDate: string) {
    setDateRangeStartDate(newStartDate)
    // If end date is set and is before the new start date, clear it
    if (dateRangeEndDate && newStartDate && dateRangeEndDate < newStartDate) {
      setDateRangeEndDate('')
    }
  }

  // Daily attendance lock/unlock functions
  async function toggleDailyLock() {
    if (!dailySessionData || !dailySessionData.session_id) {
      alert('No active daily attendance session to lock/unlock')
      return
    }

    const isLocked = dailySessionData.is_locked
    const sessionId = dailySessionData.session_id
    const action = isLocked ? 'unlock' : 'lock'
    const confirmed = window.confirm(
      isLocked
        ? 'Are you sure you want to request an unlock for this daily attendance session? Unlocking requires approval.'
        : 'Are you sure you want to lock this daily attendance session? This will prevent any further changes to daily attendance records.'
    )

    if (!confirmed) return

    setLockingDaily(true)
    try {
      if (isLocked) {
        // Create an unlock request instead of immediately unlocking
        const reqRes = await fetchWithAuth('/api/academics/daily-attendance-unlock-request/', {
          method: 'POST',
          body: JSON.stringify({ session: sessionId, note: '' }),
        })
        if (!reqRes.ok) {
          const err = await reqRes.json().catch(() => ({}))
          if (reqRes.status === 400 && (err.error?.includes('already pending') || err.error?.includes('already hod_approved'))) {
            alert('An unlock request for this session already exists and is pending approval. Please check with your HOD or administrator.')
          } else {
            throw new Error(err.error || err.detail || 'Failed to create unlock request')
          }
        } else {
          const reqData = await reqRes.json()
          console.log('Daily unlock request created:', reqData)
          alert('Unlock request submitted successfully! It will first be reviewed by your HOD, then by the attendance administrator.')
          // Optionally update UI to reflect pending state
          setDailySessionData(prev => prev ? ({ ...prev, unlock_request_status: reqData.status }) : prev)
        }
        // Do not change locked state until approval
      } else {
        // Lock immediately
        const res = await fetchWithAuth(`/api/academics/analytics/daily-attendance-lock/${sessionId}/`, { method: 'POST' })
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to lock session`)
        }
        
        const sessionData = await res.json()
        console.log('Daily session locked successfully:', sessionData)
        setDailySessionData(prev => prev ? ({ ...prev, is_locked: !isLocked }) : prev)
        alert('Daily attendance session locked successfully!')
      }
    } catch (e) {
      console.error('toggleDailyLock error:', e)
      alert('Failed to perform lock/unlock: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLockingDaily(false)
    }
  }

  // Revert assignment function
  async function revertAssignment() {
    if (!dailySessionData || !dailySessionData.session_id || !dailySessionData.assigned_to) {
      alert('No assignment to revert')
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to revert the assignment from ${dailySessionData.assigned_to.name}? ` +
      'This will give you back control over marking attendance for this section. ' +
      'This is only possible if they haven\'t marked any attendance yet.'
    )

    if (!confirmed) return

    setRevertingAssignment(true)
    
    try {
      const response = await fetchWithAuth(`/api/academics/analytics/daily-attendance-revert/${dailySessionData.session_id}/`, {
        method: 'POST'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to revert assignment')
      }

      const data = await response.json()
      alert(data.message || 'Assignment successfully reverted!')
      
      // Reload the attendance data to reflect the reverted assignment
      await loadDailyAttendance()
      
    } catch (error) {
      console.error('Error reverting assignment:', error)
      alert('Failed to revert assignment: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setRevertingAssignment(false)
    }
  }

  // Date range attendance marking function
  async function saveDateRangeAttendance() {
    if (!selectedSection) {
      alert('No section selected')
      return
    }

    if (!dateRangeStartDate || !dateRangeEndDate) {
      alert('Please select both start and end dates')
      return
    }

    // Validate that at least one student is selected
    if (selectedStudentsForDateRange.size === 0) {
      alert('Please select at least one student for date range marking')
      return
    }

    // Validate dates
    if (dateRangeEndDate < dateRangeStartDate) {
      alert('End date cannot be before start date')
      return
    }

    // Calculate number of days
    const startDate = new Date(dateRangeStartDate)
    const endDate = new Date(dateRangeEndDate)
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Confirm before proceeding
    const confirmed = window.confirm(
      `Are you sure you want to mark ${selectedStudentsForDateRange.size} selected student(s) as ${dateRangeAttendanceType} for ${daysDiff} day(s) from ${dateRangeStartDate} to ${dateRangeEndDate}?\n\n` +
      `Section: ${selectedSection.section_name}`
    )

    if (!confirmed) return

    setSavingDateRange(true)
    try {
      const response = await fetchWithAuth('/api/academics/analytics/daily-attendance-date-range/', {
        method: 'POST',
        body: JSON.stringify({
          section_id: selectedSection.section_id,
          start_date: dateRangeStartDate,
          end_date: dateRangeEndDate,
          attendance_type: dateRangeAttendanceType,
          student_ids: Array.from(selectedStudentsForDateRange)
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to mark attendance by date range')
      }

      const result = await response.json()
      
      // Build detailed success message
      let message = `Success!\n\n${result.message}\n\n`
      message += `Date Range: ${result.start_date} to ${result.end_date}\n`
      message += `Total Days in Range: ${result.days_in_range}\n`
      message += `Days Processed: ${result.days_processed}\n`
      
      if (result.dates_processed && result.dates_processed.length > 0) {
        message += `\nProcessed Dates:\n${result.dates_processed.join(', ')}\n`
      }
      
      message += `\nSessions Updated: ${result.sessions_updated}\n`
      if (result.sessions_locked > 0) {
        message += `Sessions Locked (skipped): ${result.sessions_locked}\n`
      }
      message += `Student Records Updated: ${result.records_updated}\n`
      message += `Students Affected: ${result.students_count}`
      
      alert(message)

      // Reset form and reload daily attendance if current date is in range
      setDateRangeStartDate('')
      setDateRangeEndDate('')
      setSelectedStudentsForDateRange(new Set())
      setShowDateRangeSection(false)
      
      // Reload daily attendance if current date is within the marked range
      if (date >= dateRangeStartDate && date <= dateRangeEndDate) {
        await loadDailyAttendance()
      }

    } catch (error) {
      console.error('Error marking date range attendance:', error)
      alert('Failed to mark attendance: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setSavingDateRange(false)
    }
  }

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

      {/* Navigation Tabs */}
      <div className="mb-6 border-b border-gray-200 bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-1 p-4">
          {canAccessDailyAttendance && (
            <button
              onClick={() => { setViewMode('daily'); setSelected(null); }}
              className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
                viewMode === 'daily'
                  ? 'border-indigo-600 text-indigo-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Daily
            </button>
          )}
          {hasMarkAttendancePermission && (
            <button
              onClick={() => { setViewMode('period'); setDailyMode(false); setSelectedSection(null); }}
              className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
                viewMode === 'period'
                  ? 'border-indigo-600 text-indigo-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Clock className="w-4 h-4" />
              Period Wise
            </button>
          )}
        </div>
      </div>

      {/* Daily Attendance Section */}
      {viewMode === 'daily' && !dailyMode && myClassSections && myClassSections.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              My Class - Daily Attendance
            </h2>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myClassSections.map(sec => (
                <div key={sec.section_id} className="border border-slate-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-emerald-600" />
                        {[sec.department_short_name, sec.batch_name, sec.section_name].filter(Boolean).join(' · ')}
                      </h3>
                      
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-medium text-sm">
                          {sec.students?.length || 0} Student{sec.students?.length !== 1 ? 's' : ''}
                        </span>
                        {sec.is_assigned_via_swap && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-medium text-xs">
                            <ArrowLeftRight className="w-3 h-3 mr-1" />
                            Assigned to you
                          </span>
                        )}
                        {/* Unlock request status badge */}
                        {(() => {
                          const unlockStatus = sec.session_status?.unlock_request_status
                          const hodStatus = sec.session_status?.unlock_request_hod_status
                          if (!unlockStatus) return null
                          if (unlockStatus === 'APPROVED')
                            return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 border border-green-300 rounded-md text-xs font-medium"><Unlock className="w-3 h-3" />Approved</span>
                          if (unlockStatus === 'REJECTED')
                            return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 border border-red-300 rounded-md text-xs font-medium"><Lock className="w-3 h-3" />Rejected</span>
                          if (hodStatus === 'HOD_APPROVED')
                            return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 rounded-md text-xs font-medium"><Clock className="w-3 h-3" />Pending Admin</span>
                          if (unlockStatus === 'PENDING')
                            return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-md text-xs font-medium"><Clock className="w-3 h-3" />Pending Approval</span>
                          return null
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    {(() => {
                      const sessionStatus = sec.session_status || {}
                      const isLocked = sessionStatus.is_locked
                      const hasAttendance = sessionStatus.has_attendance
                      const assignedTo = sessionStatus.assigned_to
                      const isAssignedToOthers = assignedTo && !sec.is_assigned_via_swap
                      
                      // Determine button state and styling
                      if (isLocked) {
                        return (
                          <button 
                            onClick={() => { setSelected(null); setSelectedSection(sec); setDailyMode(true) }}
                            className="w-full px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <Lock className="w-4 h-4" />
                            Locked Session
                          </button>
                        )
                      } else if (hasAttendance) {
                        return (
                          <button 
                            onClick={() => { setSelected(null); setSelectedSection(sec); setDailyMode(true) }}
                            className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            View Attendance
                          </button>
                        )
                      } else if (isAssignedToOthers) {
                        const assignedName = assignedTo.name || assignedTo.staff_id || 'Someone'
                        const truncatedName = assignedName.length > 12 ? `${assignedName.substring(0, 12)}...` : assignedName
                        return (
                          <button 
                            onClick={() => { setSelected(null); setSelectedSection(sec); setDailyMode(true) }}
                            className="w-full px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            title={`Assigned to ${assignedName}`}
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                            Assigned to {truncatedName}
                          </button>
                        )
                      } else {
                        return (
                          <button 
                            onClick={() => { setSelected(null); setSelectedSection(sec); setDailyMode(true) }}
                            className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <Calendar className="w-4 h-4" />
                            Mark Daily Attendance
                          </button>
                        )
                      }
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Assigned Periods */}
      {viewMode === 'period' && (
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
                <div key={p.id} className={`rounded-lg p-4 hover:shadow-md transition-shadow ${p.is_swap ? 'border border-green-300 bg-green-50' : p.is_special ? 'border border-amber-300 bg-amber-50' : 'border border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                        {p.period.label || `Period ${p.period.index}`}
                        {p.is_swap
                          ? <span className="text-xs font-medium px-1.5 py-0.5 bg-green-200 text-green-800 rounded">⇄ Swap</span>
                          : p.is_special && <span className="text-xs font-medium px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded">Special</span>}
                      </h3>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600 mb-1">
                        <Clock className="w-4 h-4" />
                        {p.period.start_time || ''}{p.period.start_time && p.period.end_time ? ` — ${p.period.end_time}` : ''}
                      </div>
                      <div className="text-sm text-slate-700 mb-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md font-medium ${p.is_swap ? 'bg-green-100 text-green-800' : p.is_special ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                          {p.section_names && p.section_names.length ? p.section_names.join(' + ') : p.section_name}
                        </span>
                      </div>
                      <div className="text-sm italic text-slate-600">{p.subject_display || p.subject || 'No subject'}</div>
                      {/* Display batch label if available */}
                      {p.subject_batch_label && (
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-300">
                            {p.subject_batch_label}
                          </span>
                        </div>
                      )}
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
                      {/* Assigned-to badge on period card */}
                      {(p as any).original_staff ? (
                        /* Assignee view: "Assigned by X" */
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
                            <ArrowLeftRight className="w-3 h-3" />
                            Assigned by: {(p as any).original_staff.name || (p as any).original_staff.staff_id}
                          </span>
                        </div>
                      ) : p.assigned_to ? (
                        /* Assigner view: "Assigned to X" */
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
                            <ArrowLeftRight className="w-3 h-3" />
                            Assigned to: {p.assigned_to.name || p.assigned_to.staff_id}
                          </span>
                        </div>
                      ) : null}
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
                    ) : p.assigned_to && !(p as any).original_staff ? (
                      /* Assigner view-only: session is now assigned to someone else */
                      <button
                        onClick={() => handlePeriodClick(p)}
                        className="w-full px-3 py-2 bg-slate-100 text-slate-600 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 flex items-center justify-center gap-2"
                      >
                        <ArrowLeftRight className="w-4 h-4" />
                        View Only
                      </button>
                    ) : (
                      <button 
                        onClick={()=> handlePeriodClick(p)}
                        className={`w-full px-3 py-2 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${(p as any).original_staff ? 'bg-orange-500 hover:bg-orange-600' : p.is_swap ? 'bg-green-600 hover:bg-green-700' : p.is_special ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
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
      )}

      {/* Daily Attendance Marking Panel */}
      {dailyMode && selectedSection && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50">
            {/* Header - Mobile First Layout */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-3">
                  <GraduationCap className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base sm:text-lg font-semibold text-slate-900">
                    Daily Attendance - {selectedSection.section_name}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs sm:text-sm font-medium">
                    {dailyAttendance.length} student{dailyAttendance.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {dailySessionData?.assigned_to && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-300 rounded-md text-xs font-medium">
                      <ArrowLeftRight className="w-3 h-3" />
                      Assigned to: {dailySessionData.assigned_to.name}
                    </span>
                  )}
                  {dailySessionData?.is_locked && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-md text-xs font-medium">
                      <Lock className="w-3 h-3" />
                      Locked
                    </span>
                  )}
                </div>
              </div>
              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedSwapStaff && (
                  <span className="px-3 py-1.5 bg-indigo-100 text-indigo-800 border border-indigo-300 rounded-lg text-xs font-medium flex items-center gap-2">
                    Will be assigned to: {selectedSwapStaff.name}
                  </span>
                )}
                {!selectedSwapStaff && actualMarkedBy && (
                  <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-medium flex items-center gap-2">
                    Marked by: {actualMarkedBy.name}
                  </span>
                )}
                {dailySessionData?.session_id && !dailySessionData?.is_read_only && (
                  <button 
                    onClick={toggleDailyLock}
                    disabled={lockingDaily}
                    className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1 sm:gap-2 ${
                      dailySessionData?.is_locked 
                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300' 
                        : 'bg-red-100 hover:bg-red-200 text-red-800 border border-red-300'
                    } ${lockingDaily ? 'disabled:opacity-50' : ''}`}
                  >
                    {lockingDaily ? (
                      <Loader2 className="w-3 sm:w-4 h-3 sm:h-4 animate-spin" />
                    ) : dailySessionData?.is_locked ? (
                      <Unlock className="w-3 sm:w-4 h-3 sm:h-4" />
                    ) : (
                      <Lock className="w-3 sm:w-4 h-3 sm:h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {dailySessionData?.is_locked ? 'Unlock Session' : 'Lock Session'}
                    </span>
                    <span className="sm:hidden">
                      {dailySessionData?.is_locked ? 'Unlock' : 'Lock'}
                    </span>
                  </button>
                )}
                {/* Unlock Request Status Badge */}
                {dailySessionData?.unlock_request_status && (
                  <span className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border ${
                    dailySessionData.unlock_request_status === 'APPROVED'
                      ? 'bg-green-50 text-green-800 border-green-300'
                      : dailySessionData.unlock_request_status === 'REJECTED'
                      ? 'bg-red-50 text-red-800 border-red-300'
                      : dailySessionData.unlock_request_hod_status === 'HOD_APPROVED'
                      ? 'bg-blue-50 text-blue-800 border-blue-300'
                      : 'bg-yellow-50 text-yellow-800 border-yellow-300'
                  }`} title="Status of unlock request for this session">
                    <Clock className="w-3 h-3" />
                    <span className="hidden sm:inline">
                      {dailySessionData.unlock_request_status === 'APPROVED' && 'Unlock: Approved'}
                      {dailySessionData.unlock_request_status === 'REJECTED' && 'Unlock: Rejected'}
                      {dailySessionData.unlock_request_status !== 'APPROVED' && dailySessionData.unlock_request_status !== 'REJECTED' && dailySessionData.unlock_request_hod_status === 'HOD_APPROVED' && 'Unlock: Pending Admin Approval'}
                      {dailySessionData.unlock_request_status !== 'APPROVED' && dailySessionData.unlock_request_status !== 'REJECTED' && dailySessionData.unlock_request_hod_status !== 'HOD_APPROVED' && 'Unlock: Pending Approval'}
                    </span>
                    <span className="sm:hidden">
                      {dailySessionData.unlock_request_status === 'APPROVED' && 'Approved'}
                      {dailySessionData.unlock_request_status === 'REJECTED' && 'Rejected'}
                      {dailySessionData.unlock_request_status !== 'APPROVED' && dailySessionData.unlock_request_status !== 'REJECTED' && dailySessionData.unlock_request_hod_status === 'HOD_APPROVED' && 'Pending Admin'}
                      {dailySessionData.unlock_request_status !== 'APPROVED' && dailySessionData.unlock_request_status !== 'REJECTED' && dailySessionData.unlock_request_hod_status !== 'HOD_APPROVED' && 'Pending'}
                    </span>
                  </span>
                )}
                {!dailySessionData?.assigned_to && (
                  <button 
                    onClick={openSwapModal}
                    disabled={dailySessionData?.is_locked}
                    className="px-2 sm:px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border border-indigo-300 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={dailySessionData?.is_locked ? 'Cannot swap locked session' : 'Assign attendance to another staff member'}
                  >
                    <ArrowLeftRight className="w-3 sm:w-4 h-3 sm:h-4" />
                    <span className="hidden sm:inline">Assign to Staff</span>
                    <span className="sm:hidden">Assign</span>
                  </button>
                )}
                {dailySessionData?.is_read_only && dailySessionData?.assigned_to && (
                  <button 
                    onClick={revertAssignment}
                    disabled={revertingAssignment || dailySessionData?.is_locked}
                    className="px-2 sm:px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-300 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={dailySessionData?.is_locked ? 'Cannot revert locked session' : 'Revert assignment back to you (only if no attendance marked by assigned staff)'}
                  >
                    {revertingAssignment ? (
                      <>
                        <Loader2 className="w-3 sm:w-4 h-3 sm:h-4 animate-spin" />
                        <span className="hidden sm:inline">Reverting...</span>
                        <span className="sm:hidden">...</span>
                      </>
                    ) : (
                      <>
                        <ArrowLeftRight className="w-3 sm:w-4 h-3 sm:h-4 rotate-180" />
                        <span className="hidden sm:inline">Revert Assignment</span>
                        <span className="sm:hidden">Revert</span>
                      </>
                    )}
                  </button>
                )}
                <button 
                  onClick={() => { setDailyMode(false); setSelectedSection(null); setSelectedSwapStaff(null); setActualMarkedBy(null) }}
                  className="px-2 sm:px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1 sm:gap-2"
                >
                  <X className="w-3 sm:w-4 h-3 sm:h-4" />
                  <span className="hidden sm:inline">Close</span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 overflow-visible">
            {loadingDaily ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                <span className="ml-3 text-slate-600">Loading attendance...</span>
              </div>
            ) : (
              <>
                {/* Swap History */}
                {dailySessionData?.swap_history && dailySessionData.swap_history.length > 0 && (
                  <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                      <ArrowLeftRight className="w-4 h-4" />
                      Assignment History
                    </h4>
                    <div className="space-y-2">
                      {dailySessionData.swap_history.map((swap: any) => (
                        <div key={swap.id} className="text-sm text-indigo-800 bg-white p-3 rounded border border-indigo-200">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <span className="font-medium">
                                {swap.assigned_by?.name || swap.assigned_by?.staff_id || 'Unknown Staff'}
                              </span>
                              <span className="mx-2">→</span>
                              <span className={`font-medium ${!swap.assigned_to ? 'text-green-700' : ''}`}>
                                {swap.assigned_to ? 
                                  (swap.assigned_to.name || swap.assigned_to.staff_id || 'Unknown Staff') : 
                                  'Original Advisor (Reverted)'
                                }
                              </span>
                            </div>
                            <span className="text-xs text-slate-600 ml-3">
                              {new Date(swap.assigned_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          {swap.reason && (
                            <div className="text-xs text-slate-600 mt-1 italic">{swap.reason}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bulk Actions */}
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => markAllDaily('P')}
                    disabled={dailySessionData?.is_locked}
                    className={`px-3 sm:px-4 py-2 bg-green-100 hover:bg-green-200 text-green-800 rounded-lg text-xs sm:text-sm font-medium border border-green-300 flex items-center gap-1 sm:gap-2 ${dailySessionData?.is_locked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-300' : ''}`}
                  >
                    <Check className="w-3 sm:w-4 h-3 sm:h-4" />
                    <span className="hidden sm:inline">Mark All Present</span>
                    <span className="sm:hidden">All Present</span>
                  </button>
                </div>

                {/* Students Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-slate-700 bg-slate-50">Student</th>
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-slate-700 bg-slate-50">Status</th>
                        <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-slate-700 bg-slate-50 hidden sm:table-cell">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dailyAttendance.map(student => {
                        const status = attendanceStatus[student.student_id] || 'P'
                        const statusClasses: Record<string, string> = {
                          P: 'bg-green-50 text-green-800 border-green-300',
                          A: 'bg-red-50 text-red-800 border-red-300',
                          OD: 'bg-blue-50 text-blue-800 border-blue-300',
                          LATE: 'bg-yellow-50 text-yellow-800 border-yellow-300',
                          LEAVE: 'bg-purple-50 text-purple-800 border-purple-300'
                        }
                        return (
                          <tr key={student.student_id} className="hover:bg-slate-50">
                            <td className="py-3 px-2 sm:px-4 text-sm">
                              <div className="font-medium text-slate-900">{student.username}</div>
                              <div className="text-xs text-slate-500 mt-0.5">{student.reg_no}</div>
                              {/* Display most recent OD/LEAVE record with date range */}
                              {student.latest_record && (
                                <div className="mt-2">
                                  <div 
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      student.latest_record.type === 'OD' 
                                        ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                                        : 'bg-purple-100 text-purple-800 border border-purple-300'
                                    }`}
                                  >
                                    <span className="font-semibold">{student.latest_record.type}</span>
                                    <span className="mx-1">-</span>
                                    <span>{student.latest_record.start_date}</span>
                                    {student.latest_record.start_date !== student.latest_record.end_date && (
                                      <>
                                        <span className="mx-1">to</span>
                                        <span>{student.latest_record.end_date}</span>
                                      </>
                                    )}
                                    {/* Remove button */}
                                    {!dailySessionData?.is_locked && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          removeODLeaveBadge(
                                            student.student_id,
                                            student.latest_record.start_date,
                                            student.latest_record.end_date
                                          )
                                        }}
                                        disabled={removingBadgeStudentId === student.student_id}
                                        className="ml-1.5 hover:bg-white/30 rounded-full p-0.5 transition-colors disabled:opacity-50"
                                        title="Remove OD/Leave record"
                                      >
                                        {removingBadgeStudentId === student.student_id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <X className="w-3 h-3" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2 sm:px-4">
                              <div className="relative">
                                <select
                                  value={status}
                                  onChange={(e) => handleAttendanceStatusChange(student.student_id, e.target.value)}
                                  disabled={dailySessionData?.is_locked || dailySessionData?.is_read_only || autoSavingStudentId === student.student_id}
                                  className={`px-2 sm:px-3 py-1.5 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full ${statusClasses[status]} ${(dailySessionData?.is_locked || dailySessionData?.is_read_only || autoSavingStudentId === student.student_id) ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                                >
                                  <option value="P">Present</option>
                                  <option value="OD">On Duty</option>
                                  <option value="LATE">Late</option>
                                  <option value="LEAVE">Leave</option>
                                </select>
                                {autoSavingStudentId === student.student_id && (
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                                  </div>
                                )}
                              </div>
                              {/* Mobile remarks input */}
                              <div className="mt-2 sm:hidden">
                                <input
                                  type="text"
                                  value={attendanceRemarks[student.student_id] || ''}
                                  onChange={(e) => setAttendanceRemarks(prev => ({ ...prev, [student.student_id]: e.target.value }))}
                                  disabled={dailySessionData?.is_locked || dailySessionData?.is_read_only}
                                  placeholder="Remarks (optional)"
                                  className={`px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full ${(dailySessionData?.is_locked || dailySessionData?.is_read_only) ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-2 sm:px-4 hidden sm:table-cell">
                              <input
                                type="text"
                                value={attendanceRemarks[student.student_id] || ''}
                                onChange={(e) => setAttendanceRemarks(prev => ({ ...prev, [student.student_id]: e.target.value }))}
                                disabled={dailySessionData?.is_locked || dailySessionData?.is_read_only}
                                placeholder="Optional remarks"
                                className={`px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full ${(dailySessionData?.is_locked || dailySessionData?.is_read_only) ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Date Range Attendance Marking Section */}
                <div className="mt-6 border-t border-slate-200 pt-6 relative">
                  <button
                    onClick={() => setShowDateRangeSection(!showDateRangeSection)}
                    className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium text-sm mb-4"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${showDateRangeSection ? 'rotate-180' : ''}`} />
                    {showDateRangeSection ? 'Hide' : 'Show'} Date Range Marking (OD/Leave)
                  </button>

                  {showDateRangeSection && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-indigo-200 relative overflow-visible" style={{ zIndex: 20 }}>
                      <div className="flex items-center gap-2 mb-4">
                        <AlertCircle className="w-5 h-5 text-indigo-600" />
                        <h4 className="font-semibold text-slate-900">Mark by Date Range</h4>
                      </div>
                      
                      <p className="text-sm text-slate-600 mb-4">
                        Select students and a date range to mark them as OD or Leave for multiple days at once.
                        This feature is optional and separate from the day-by-day marking above.
                      </p>

                      {/* Student Selection Table */}
                      <div className="mb-4 bg-white rounded-lg border border-slate-200 relative" style={{ zIndex: 1 }}>
                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-700">
                            Select Students ({selectedStudentsForDateRange.size} selected)
                          </span>
                          <button
                            onClick={toggleAllStudentsForDateRange}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            {selectedStudentsForDateRange.size === dailyAttendance.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto overflow-x-hidden">
                          <table className="w-full">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                              <tr className="border-b border-slate-200">
                                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700 w-10">
                                  <input
                                    type="checkbox"
                                    checked={selectedStudentsForDateRange.size === dailyAttendance.length && dailyAttendance.length > 0}
                                    onChange={toggleAllStudentsForDateRange}
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-2 focus:ring-indigo-500"
                                  />
                                </th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">Student</th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">Reg No</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {dailyAttendance.map(student => (
                                <tr key={student.student_id} className="hover:bg-slate-50">
                                  <td className="py-2 px-3">
                                    <input
                                      type="checkbox"
                                      checked={selectedStudentsForDateRange.has(student.student_id)}
                                      onChange={() => toggleStudentForDateRange(student.student_id)}
                                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="py-2 px-3 text-sm text-slate-900">{student.username || student.name}</td>
                                  <td className="py-2 px-3 text-xs text-slate-600">{student.reg_no}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 relative">
                        <div className="relative" style={{ zIndex: 30 }}>
                          <label htmlFor="dateRangeStartDate" className="block text-sm font-medium text-slate-700 mb-2">
                            Start Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="dateRangeStartDate"
                            type="date"
                            value={dateRangeStartDate}
                            onChange={(e) => handleStartDateChange(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white cursor-pointer"
                            style={{ position: 'relative', zIndex: 30 }}
                          />
                        </div>

                        <div className="relative" style={{ zIndex: 30 }}>
                          <label htmlFor="dateRangeEndDate" className="block text-sm font-medium text-slate-700 mb-2">
                            End Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="dateRangeEndDate"
                            type="date"
                            value={dateRangeEndDate}
                            onChange={(e) => setDateRangeEndDate(e.target.value)}
                            {...(dateRangeStartDate ? { min: dateRangeStartDate } : {})}
                            disabled={!dateRangeStartDate}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500"
                            style={{ position: 'relative', zIndex: 30 }}
                          />
                        </div>
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Attendance Type
                        </label>
                        <div className="flex gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="dateRangeType"
                              value="OD"
                              checked={dateRangeAttendanceType === 'OD'}
                              onChange={() => setDateRangeAttendanceType('OD')}
                              className="w-4 h-4 text-indigo-600"
                            />
                            <span className="text-sm font-medium text-slate-700">On Duty (OD)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="dateRangeType"
                              value="LEAVE"
                              checked={dateRangeAttendanceType === 'LEAVE'}
                              onChange={() => setDateRangeAttendanceType('LEAVE')}
                              className="w-4 h-4 text-purple-600"
                            />
                            <span className="text-sm font-medium text-slate-700">Leave</span>
                          </label>
                        </div>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                        <div className="flex gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-800">
                            <strong>Note:</strong> This will mark the selected {selectedStudentsForDateRange.size} student(s) as {dateRangeAttendanceType} for the selected date range.
                            Locked sessions will be skipped. A confirmation will be shown before applying.
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={saveDateRangeAttendance}
                        disabled={savingDateRange || !dateRangeStartDate || !dateRangeEndDate || selectedStudentsForDateRange.size === 0}
                        className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {savingDateRange ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Applying Date Range...
                          </>
                        ) : (
                          <>
                            <Calendar className="w-4 h-4" />
                            Apply Date Range Marking
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div className="mt-6 flex justify-center sm:justify-end">
                  {dailySessionData?.is_locked ? (
                    <button
                      disabled
                      className="w-full sm:w-auto px-4 sm:px-6 py-3 bg-slate-300 text-slate-500 rounded-lg font-medium cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 sm:w-5 h-4 sm:h-5" />
                      <span className="text-sm sm:text-base">Session Locked</span>
                    </button>
                  ) : dailySessionData?.is_read_only ? (
                    <button
                      disabled
                      className="w-full sm:w-auto px-4 sm:px-6 py-3 bg-amber-300 text-amber-700 rounded-lg font-medium cursor-not-allowed flex items-center justify-center gap-2"
                      title="This attendance has been assigned to another staff member"
                    >
                      <ArrowLeftRight className="w-4 sm:w-5 h-4 sm:h-5" />
                      <span className="text-sm sm:text-base">Read-Only (Assigned to Others)</span>
                    </button>
                  ) : (
                    <button
                      onClick={saveDailyAttendance}
                      disabled={savingDaily}
                      className="w-full sm:w-auto px-4 sm:px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                    >
                      {savingDaily ? (
                        <>
                          <Loader2 className="w-4 sm:w-5 h-4 sm:h-5 animate-spin" />
                          <span className="text-sm sm:text-base">Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 sm:w-5 h-4 sm:h-5" />
                          <span className="text-sm sm:text-base hidden sm:inline">Save Daily Attendance</span>
                          <span className="text-sm sm:text-base sm:hidden">Save Attendance</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Session Panel */}
      {selected && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-900">
                {(selected as any).combined_period_label || (selected.period.label || `Period ${selected.period.index}`)} — {selected.section_name}
                {selected.subject_batch_label && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-purple-100 text-purple-800 border border-purple-300">
                    {selected.subject_batch_label}
                  </span>
                )}
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
            <div className="flex items-center gap-2">
              {/* Assigned-to info + assign/revert controls */}
              {(selected as any).original_staff ? (
                /* Current user is the ASSIGNEE — show who assigned this to them */
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-800 border border-orange-300 rounded-lg text-sm font-medium">
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Assigned by: {(selected as any).original_staff.name || (selected as any).original_staff.staff_id}
                </span>
              ) : (selected as any).assigned_to ? (
                /* Current user is the ASSIGNER — show who they assigned to + allow revert */
                <>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-800 border border-orange-300 rounded-lg text-sm font-medium">
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Assigned to: {(selected as any).assigned_to.name || (selected as any).assigned_to.staff_id}
                  </span>
                  {(selected as any).attendance_session_id && (
                    <button
                      onClick={() => revertPeriodAssignment((selected as any).attendance_session_id, (selected as any).period?.id)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Revert Assignment
                    </button>
                  )}
                </>
              ) : (
                /* No assignment yet — allow assigning to another staff */
                !selected.attendance_session_locked && (
                  <button
                    onClick={() => openPeriodSwapModal(selected)}
                    disabled={saving}
                    className="px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border border-indigo-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Assign to Staff
                  </button>
                )
              )}
              <button 
                onClick={()=> setSelected(null)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Close
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* View-only notice when period is assigned to another staff */}
            {(selected as any).assigned_to && !(selected as any).original_staff && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-800 text-sm">
                <Lock className="w-4 h-4 flex-shrink-0" />
                <span>
                  This period has been assigned to <strong>{(selected as any).assigned_to.name || (selected as any).assigned_to.staff_id}</strong>. You can view existing records but cannot modify them.
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-slate-700">Student</th>
                    <th className="text-left py-3 px-2 sm:px-4 text-sm font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {students.map(s=> {
                    const status = marks[s.id] || 'P'
                    const dailyLock = dailyLocks[s.id] || null  // 'OD' | 'LEAVE' | 'LATE' | null
                    // assigned to someone else = view only for the original staff
                    const isAssignedToOther = !!(selected as any).assigned_to && !(selected as any).original_staff
                    const isLocked = selected.attendance_session_locked || dailyLock === 'OD' || dailyLock === 'LEAVE' || isAssignedToOther
                    const statusSelectClasses: Record<string,string> = {
                      P: 'bg-green-50 text-green-800 border-green-300',
                      A: 'bg-red-50 text-red-800 border-red-300',
                      OD: 'bg-blue-50 text-blue-800 border-blue-300',
                      LATE: 'bg-indigo-50 text-indigo-800 border-indigo-300',
                      LEAVE: 'bg-purple-50 text-purple-800 border-purple-300',
                    }
                    const statusBadgeClasses: Record<string,string> = {
                      P: 'bg-green-600',
                      A: 'bg-red-600',
                      OD: 'bg-blue-600',
                      LATE: 'bg-indigo-600',
                      LEAVE: 'bg-purple-600',
                    }
                    const statusCls = statusSelectClasses[status] || statusSelectClasses['P']
                    const badgeCls = statusBadgeClasses[status] || statusBadgeClasses['P']

                    return (
                      <tr key={s.id} className={`transition-colors ${isLocked ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                        <td className="py-3 px-2 sm:px-4 text-sm">
                          <div className="font-medium text-slate-900">{s.username}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{s.reg_no}</div>
                          {dailyLock === 'LATE' && (
                            <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700" title="Marked LATE in daily attendance — counted Present for this period">
                              Late→P
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 sm:px-4">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-3 h-3 rounded-full ${badgeCls}`} />
                            {isLocked && dailyLock ? (
                              /* OD / LEAVE locked from daily attendance */
                              <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-slate-300 w-full" title={`Locked by daily attendance (${dailyLock})`}>
                                <Lock className="w-3 h-3 text-slate-400" />
                                {dailyLock === 'OD' ? 'On Duty' : 'Leave'}
                              </div>
                            ) : (
                            <div className="relative inline-block w-full">
                              <select 
                                value={marks[s.id] || 'P'} 
                                onChange={e=> setMark(s.id, e.target.value)}
                                disabled={isLocked}
                                className={`appearance-none px-2 sm:px-3 py-1.5 pr-8 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-full ${statusCls} ${isLocked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                              >
                                <option value="P">Present</option>
                                <option value="A">Absent</option>
                              </select>
                              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {/* Hide save/lock controls when period is assigned to another staff */}
              {!((selected as any).assigned_to && !(selected as any).original_staff) && (
                <>
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
                </>
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
      {consecutiveModal && pendingPeriod && consecutivePeriods.length > 0 && (() => {
        const allChain = [pendingPeriod, ...consecutivePeriods].sort((a, b) => (a.period?.index ?? 0) - (b.period?.index ?? 0))
        return (
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
                    The same subject spans {allChain.length} consecutive period{allChain.length > 1 ? 's' : ''} today:
                  </p>

                  <div className="space-y-1 mb-3">
                    {allChain.map((pp, i) => {
                        return (
                          <div key={pp.id ?? pp.period.id} className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"></div>
                            <span className="font-semibold text-slate-900">
                              {pp.period.label || `Period ${pp.period.index}`}
                            </span>
                            {pp.period.start_time && (
                              <span className="text-slate-500 text-xs">
                                ({pp.period.start_time}{pp.period.end_time ? ` – ${pp.period.end_time}` : ''})
                              </span>
                            )}
                          </div>
                        )
                      })}
                  </div>

                  <p className="text-sm font-medium text-slate-900">
                    Subject: <span className="text-indigo-600">{pendingPeriod.subject_display || pendingPeriod.subject || 'Same Subject'}</span>
                  </p>
                </div>

                <p className="text-sm text-slate-600">
                  Mark attendance for all {allChain.length} periods at once, or just the selected period?
                </p>
              </div>

              <div className="px-6 pb-6 flex flex-col gap-3">
                <button
                  onClick={markAllPeriods}
                  className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Mark All {allChain.length} Periods
                </button>

                <button
                  onClick={markSinglePeriodOnly}
                  className="w-full px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
                >
                  This Period Only
                </button>

                <button
                  onClick={() => { setConsecutiveModal(false); setPendingPeriod(null); setConsecutivePeriods([]) }}
                  className="w-full px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Staff Swap Modal */}
      {swapModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-slate-900">Select Staff Member</h3>
              </div>
              <button
                onClick={() => setSwapModalOpen(false)}
                className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {loadingStaff ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
                  <p className="text-sm text-slate-600">Loading staff from your department...</p>
                </div>
              ) : departmentStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="bg-slate-100 p-4 rounded-full mb-4">
                    <Users className="w-12 h-12 text-slate-400" />
                  </div>
                  <h4 className="text-lg font-medium text-slate-900 mb-1">No Staff Found</h4>
                  <p className="text-slate-600 text-sm">No other staff from your department are available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600 mb-4">
                    Select a staff member to assign attendance taking for this class:
                  </p>
                  {departmentStaff.map((staff: any) => (
                    <button
                      key={staff.id}
                      onClick={() => handleSwapStaff(staff)}
                      className="w-full p-4 border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{staff.name}</p>
                          <p className="text-sm text-slate-600">{staff.designation || 'Staff'}</p>
                          <p className="text-xs text-slate-500 mt-1">ID: {staff.staff_id}</p>
                        </div>
                        <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button
                onClick={() => setSwapModalOpen(false)}
                className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
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
