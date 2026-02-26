import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Calendar, Clock, Users, CheckCircle2, XCircle, Loader2, Save, X, ChevronDown, AlertCircle, Lock, Unlock, GraduationCap, Check } from 'lucide-react'

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

  // Check user permissions for attendance marking
  const userPerms = (() => {
    try { return JSON.parse(localStorage.getItem('permissions') || '[]') as string[] } catch { return [] }
  })()
  const hasMarkAttendancePermission = Array.isArray(userPerms) && (userPerms.includes('academics.mark_attendance') || userPerms.includes('MARK_ATTENDANCE'))
  const hasClassAdvisorPermission = myClassSections && myClassSections.length > 0

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
      const response = await fetchWithAuth('/api/academics/analytics/my-class-students/')
      if (!response.ok) throw new Error('Failed to load sections')
      const data = await response.json()
      setMyClassSections(data.sections || [])
      if (data.sections && data.sections.length > 0 && !selectedSection) {
        setSelectedSection(data.sections[0])
      }
    } catch (error) {
      console.error('Error loading sections:', error)
      setMyClassSections([])
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
      data.students.forEach((student: any) => {
        statusMap[student.student_id] = student.status || 'P'
        remarksMap[student.student_id] = student.remarks || ''
      })
      setAttendanceStatus(statusMap)
      setAttendanceRemarks(remarksMap)
    } catch (error) {
      console.error('Error loading daily attendance:', error)
      setDailyAttendance([])
      setDailySessionData(null)
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

      const response = await fetchWithAuth('/api/academics/analytics/daily-attendance/', {
        method: 'POST',
        body: JSON.stringify({
          section_id: selectedSection.section_id,
          date: date,
          attendance: records
        })
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

  // Daily attendance lock/unlock functions
  async function toggleDailyLock() {
    if (!dailySessionData || !dailySessionData.session_id) {
      alert('No active daily attendance session to lock/unlock')
      return
    }

    const isLocked = dailySessionData.is_locked
    const sessionId = dailySessionData.session_id
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
        const reqRes = await fetchWithAuth('/api/academics/analytics/daily-attendance-unlock-request/', {
          method: 'POST',
          body: JSON.stringify({ session: sessionId, note: '' }),
        })
        if (!reqRes.ok) {
          const err = await reqRes.json().catch(() => ({}))
          if (reqRes.status === 400 && err.error?.includes('already pending')) {
            alert('An unlock request for this session already exists and is pending approval.')
          } else {
            throw new Error(err.error || 'Failed to create unlock request')
          }
        } else {
          const reqData = await reqRes.json()
          console.log('Daily unlock request created:', reqData)
          alert('Unlock request submitted successfully!')
          // Update local state to reflect pending status
          setDailySessionData(prev => prev ? ({ 
            ...prev, 
            unlock_request_status: reqData.status, 
            unlock_request_id: reqData.id 
          }) : prev)
        }
        // Do not change locked state until approval
      } else {
        // Lock immediately
        const res = await fetchWithAuth(
          `/api/academics/analytics/daily-attendance-lock/${sessionId}/`,
          { method: 'POST' }
        )
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to lock session`)
        }
        const sessionData = await res.json()
        console.log('Daily session locked successfully:', sessionData)
        setDailySessionData(prev => prev ? ({ ...prev, is_locked: true }) : prev)
        alert('Daily attendance session locked successfully!')
      }
    } catch (e) {
      console.error('toggleDailyLock error:', e)
      alert('Failed to perform lock/unlock: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLockingDaily(false)
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
          {hasMarkAttendancePermission && (
            <button
              onClick={() => setViewMode('period')}
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
          {hasClassAdvisorPermission && (
            <button
              onClick={() => setViewMode('daily')}
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
                        {sec.section_name}
                      </h3>
                      <div className="text-sm text-slate-600 mb-1">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-medium">
                          {sec.students?.length || 0} Student{sec.students?.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600">
                        {sec.batch_name || 'Batch'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <button 
                      onClick={() => { setSelectedSection(sec); setDailyMode(true) }}
                      className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Calendar className="w-4 h-4" />
                      Mark Daily Attendance
                    </button>
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
                        className={`w-full px-3 py-2 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${p.is_swap ? 'bg-green-600 hover:bg-green-700' : p.is_special ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
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
          <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              <h3 className="text-lg font-semibold text-slate-900">
                Daily Attendance - {selectedSection.section_name}
                <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-sm font-medium">
                  {dailyAttendance.length} student{dailyAttendance.length !== 1 ? 's' : ''}
                </span>
              </h3>
              {dailySessionData?.is_locked && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-md text-xs font-medium">
                  <Lock className="w-3 h-3" />
                  Locked
                </span>
              )}
              {dailySessionData?.unlock_request_status === 'PENDING' && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 rounded-md text-xs font-medium">
                  Unlock Pending
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dailySessionData?.session_id && (
                <button 
                  onClick={toggleDailyLock}
                  disabled={lockingDaily}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    dailySessionData?.is_locked 
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300' 
                      : 'bg-red-100 hover:bg-red-200 text-red-800 border border-red-300'
                  } ${lockingDaily ? 'disabled:opacity-50' : ''}`}
                >
                  {lockingDaily ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : dailySessionData?.is_locked ? (
                    <Unlock className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  {dailySessionData?.is_locked ? 'Request Unlock' : 'Lock Session'}
                </button>
              )}
              <button 
                onClick={() => { setDailyMode(false); setSelectedSection(null) }}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Close
              </button>
            </div>
          </div>

          <div className="p-6">
            {loadingDaily ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                <span className="ml-3 text-slate-600">Loading attendance...</span>
              </div>
            ) : (
              <>
                {/* Bulk Actions */}
                <div className="mb-4 flex gap-2">
                  <button
                    onClick={() => markAllDaily('P')}
                    disabled={dailySessionData?.is_locked}
                    className={`px-4 py-2 bg-green-100 hover:bg-green-200 text-green-800 rounded-lg text-sm font-medium border border-green-300 flex items-center gap-2 ${dailySessionData?.is_locked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-300' : ''}`}
                  >
                    <Check className="w-4 h-4" />
                    Mark All Present
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
                            </td>
                            <td className="py-3 px-2 sm:px-4">
                              <select
                                value={status}
                                onChange={(e) => setAttendanceStatus(prev => ({ ...prev, [student.student_id]: e.target.value }))}
                                disabled={dailySessionData?.is_locked}
                                className={`px-2 sm:px-3 py-1.5 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full ${statusClasses[status]} ${dailySessionData?.is_locked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                              >
                                <option value="P">Present</option>
                                <option value="OD">On Duty</option>
                                <option value="LATE">Late</option>
                                <option value="LEAVE">Leave</option>
                              </select>
                              {/* Mobile remarks input */}
                              <div className="mt-2 sm:hidden">
                                <input
                                  type="text"
                                  value={attendanceRemarks[student.student_id] || ''}
                                  onChange={(e) => setAttendanceRemarks(prev => ({ ...prev, [student.student_id]: e.target.value }))}
                                  disabled={dailySessionData?.is_locked}
                                  placeholder="Remarks (optional)"
                                  className={`px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full ${dailySessionData?.is_locked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-2 sm:px-4 hidden sm:table-cell">
                              <input
                                type="text"
                                value={attendanceRemarks[student.student_id] || ''}
                                onChange={(e) => setAttendanceRemarks(prev => ({ ...prev, [student.student_id]: e.target.value }))}
                                disabled={dailySessionData?.is_locked}
                                placeholder="Optional remarks"
                                className={`px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full ${dailySessionData?.is_locked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Save Button */}
                <div className="mt-6 flex justify-end">
                  {dailySessionData?.is_locked ? (
                    <button
                      disabled
                      className="px-6 py-3 bg-slate-300 text-slate-500 rounded-lg font-medium cursor-not-allowed flex items-center gap-2"
                    >
                      <Lock className="w-5 h-5" />
                      Session Locked
                    </button>
                  ) : (
                    <button
                      onClick={saveDailyAttendance}
                      disabled={savingDaily}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                    >
                      {savingDaily ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          Save Daily Attendance
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
                    const isLocked = selected.attendance_session_locked || dailyLock === 'OD' || dailyLock === 'LEAVE'
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

    </div>
  )
}
