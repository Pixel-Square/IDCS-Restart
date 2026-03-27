import React, { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import fetchWithAuth from '../../services/fetchAuth'
import AttendanceAssignmentRequestsModal from '../../components/AttendanceAssignmentRequestsModal'
import { Calendar, Clock, Users, CheckCircle2, XCircle, Loader2, Save, X, ChevronDown, AlertCircle, Lock, Unlock, GraduationCap, Check, ArrowLeftRight, Bell, Download, Upload, FileSpreadsheet, Eye } from 'lucide-react'
import HalfDayRequestsApproval from './HalfDayRequestsApproval'
import AttendanceRequests from './AttendanceRequests'

type ViewMode = 'period' | 'daily' | 'bulk'

type BulkPreviewRow = {
  reg_no: string
  name: string
  statuses: Record<string, string>
  remarks: Record<string, string>
}

type BulkPreviewData = {
  dates: string[]
  rows: BulkPreviewRow[]
}

type BulkLockedSession = {
  session_id: number
  section_id: number
  section_name: string
  date: string
  unlock_request_id?: number | null
  unlock_request_status?: string | null
  unlock_request_hod_status?: string | null
}

type BulkExcelResult = {
  created: number
  updated: number
  locked: number
  period_records_updated?: number
  locked_sessions?: BulkLockedSession[]
  skipped_locked_sessions?: BulkLockedSession[]
  errors: string[]
}

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
  //   'ABSENT'        → period status is locked to Absent (cannot be changed)
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
  const [bulkAttendanceGrid, setBulkAttendanceGrid] = useState<Record<string, Record<number, 'P' | 'A'>>>({})
  const [markedSessions, setMarkedSessions] = useState<Record<string, Set<string>>>({})
  const [bulkMarkedSessionsLoading, setBulkMarkedSessionsLoading] = useState(false)

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
  const [pendingAssignmentRequests, setPendingAssignmentRequests] = useState<any[]>([]) // DAILY assignment requests sent by this staff
  const [pendingPeriodRequests, setPendingPeriodRequests] = useState<any[]>([]) // PERIOD assignment requests sent by this staff
  const [pendingReceivedCount, setPendingReceivedCount] = useState(0) // Received requests count (DAILY + PERIOD)
  const [showRequestsModal, setShowRequestsModal] = useState(false)

  // Date range attendance marking state
  const [showDateRangeSection, setShowDateRangeSection] = useState(false)
  const [dateRangeStartDate, setDateRangeStartDate] = useState<string>('')
  const [dateRangeEndDate, setDateRangeEndDate] = useState<string>('')
  const [dateRangeAttendanceType, setDateRangeAttendanceType] = useState<'OD' | 'LEAVE'>('OD')
  const [savingDateRange, setSavingDateRange] = useState(false)
  const [selectedStudentsForDateRange, setSelectedStudentsForDateRange] = useState<Set<number>>(new Set())

  // Bulk Excel attendance state
  const [bulkExcelSections, setBulkExcelSections] = useState<any[]>([])
  const [bulkExcelSectionsLoading, setBulkExcelSectionsLoading] = useState(false)
  const [bulkExcelSection, setBulkExcelSection] = useState<any>(null)
  const [bulkExcelStartDate, setBulkExcelStartDate] = useState<string>('')
  const [bulkExcelEndDate, setBulkExcelEndDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [bulkExcelDownloading, setBulkExcelDownloading] = useState(false)
  const bulkExcelFileRef = useRef<HTMLInputElement>(null)
  const [bulkExcelPendingFile, setBulkExcelPendingFile] = useState<File | null>(null)
  const [bulkExcelImporting, setBulkExcelImporting] = useState(false)
  const [bulkExcelResult, setBulkExcelResult] = useState<BulkExcelResult | null>(null)
  const [bulkUnlockRequesting, setBulkUnlockRequesting] = useState(false)
  const [bulkLockedSessionsInRange, setBulkLockedSessionsInRange] = useState<BulkLockedSession[]>([])
  const [bulkExcelExcludedDates, setBulkExcelExcludedDates] = useState<Set<string>>(new Set())

  // Preview state (after Excel is parsed client-side)
  const [bulkPreviewData, setBulkPreviewData] = useState<BulkPreviewData | null>(null)
  const [bulkPreviewDate, setBulkPreviewDate] = useState<string>('')

  // Staff attendance check state
  const [staffAttendanceStatus, setStaffAttendanceStatus] = useState<{
    can_mark_attendance: boolean
    reason: string
    attendance_record: {
      id?: number
      date: string
      status: string
      morning_in: string | null
      evening_out: string | null
    } | null
    pending_request?: {
      id: number
      requested_at: string
      status: string
      reason: string
    } | null
  } | null>(null)
  const [checkingStaffAttendance, setCheckingStaffAttendance] = useState(false)
  const [showHalfDayRequestModal, setShowHalfDayRequestModal] = useState(false)
  const [halfDayRequestReason, setHalfDayRequestReason] = useState('')
  const [submittingHalfDayRequest, setSubmittingHalfDayRequest] = useState(false)

  // Check user permissions for attendance marking
  const userPerms = (() => {
    try { return JSON.parse(localStorage.getItem('permissions') || '[]') as string[] } catch { return [] }
  })()
  const userRoles = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('roles') || '[]') as Array<string | { name?: string }>
      return parsed.map(role => {
        if (typeof role === 'string') return role.toUpperCase().trim()
        return String(role?.name || '').toUpperCase().trim()
      }).filter(Boolean)
    } catch {
      return [] as string[]
    }
  })()
  const hasMarkAttendancePermission = Array.isArray(userPerms) && (userPerms.includes('academics.mark_attendance') || userPerms.includes('MARK_ATTENDANCE'))
  const hasClassAdvisorPermission = myClassSections && myClassSections.length > 0
  const isAdvisorRole = userRoles.includes('ADVISOR')
  const canAccessBulkAttendance = isAdvisorRole && hasMarkAttendancePermission
  const canViewUnlockApprovalSection = userRoles.includes('HOD') || userRoles.includes('AHOD') || userRoles.includes('IQAC')
  
  // Check if user has sections assigned via swap
  const hasAssignedSections = myClassSections && myClassSections.some((section: any) => section.is_assigned_via_swap)
  // Class advisors always have daily attendance access regardless of mark_attendance permission
  const canAccessDailyAttendance = hasClassAdvisorPermission

  useEffect(() => {
    if (viewMode === 'bulk' && !canAccessBulkAttendance) {
      if (canAccessDailyAttendance) {
        setViewMode('daily')
      } else if (hasMarkAttendancePermission) {
        setViewMode('period')
      } else {
        setViewMode('daily')
      }
    }
  }, [viewMode, canAccessBulkAttendance, canAccessDailyAttendance, hasMarkAttendancePermission])

  useEffect(()=>{ fetchPeriods(); loadMyClassSections(); checkStaffAttendanceStatus(); fetchAllPendingRequests() }, [date])
  useEffect(()=>{ if (selectedSection && dailyMode) loadDailyAttendance() }, [selectedSection, date, dailyMode])

  // Check staff attendance status for period attendance access
  async function checkStaffAttendanceStatus() {
    setCheckingStaffAttendance(true)
    try {
      const res = await fetchWithAuth(`/api/staff-attendance/half-day-requests/check_period_attendance_access/?date=${date}`)
      if (res.ok) {
        const data = await res.json()
        setStaffAttendanceStatus(data)
      } else {
        console.error('Failed to check staff attendance status')
        setStaffAttendanceStatus({ 
          can_mark_attendance: true, 
          reason: 'Error checking attendance status', 
          attendance_record: null 
        })
      }
    } catch (e) {
      console.error('Error checking staff attendance:', e)
      setStaffAttendanceStatus({ 
        can_mark_attendance: true, 
        reason: 'Error checking attendance status', 
        attendance_record: null 
      })
    } finally {
      setCheckingStaffAttendance(false)
    }
  }

  // Submit period attendance access request
  async function submitHalfDayRequest() {
    if (!halfDayRequestReason.trim()) {
      alert('Please provide a reason for your request')
      return
    }
    
    setSubmittingHalfDayRequest(true)
    try {
      const res = await fetchWithAuth('/api/staff-attendance/half-day-requests/', {
        method: 'POST',
        body: JSON.stringify({
          attendance_date: date,
          reason: halfDayRequestReason.trim()
        })
      })
      
      if (res.ok) {
        alert('Period attendance access request submitted successfully! Please wait for HOD/AHOD approval.')
        setShowHalfDayRequestModal(false)
        setHalfDayRequestReason('')
        // Re-check status after request
        checkStaffAttendanceStatus()
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        alert(`Failed to submit request: ${errorData.error || errorData.attendance_date?.[0] || 'Unknown error'}`)
      }
    } catch (e) {
      console.error('Error submitting access request:', e)
      alert('Failed to submit access request. Please try again.')
    } finally {
      setSubmittingHalfDayRequest(false)
    }
  }

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

  // HOD/AHOD: show recent period attendance access requests (history)
  function HodRequestHistory() {
    const [loadingHist, setLoadingHist] = useState(true)
    const [history, setHistory] = useState<any[]>([])
    const [isHod, setIsHod] = useState<boolean | null>(null)

    useEffect(() => { loadHistory() }, [])

    async function loadHistory() {
      setLoadingHist(true)
      try {
        const res = await fetchWithAuth('/api/staff-attendance/half-day-requests/?page_size=10')
        if (!res.ok) {
          if (res.status === 403) { setIsHod(false); setHistory([]); return }
          throw new Error('Failed')
        }
        const j = await res.json().catch(() => null)
        const list = (j && (j.results || j)) || []
        setHistory(list)
        setIsHod(true)
      } catch (e) {
        console.error('loadHistory', e)
        setHistory([])
        setIsHod(false)
      } finally {
        setLoadingHist(false)
      }
    }

    if (isHod === false && !loadingHist) return null

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-lg font-semibold text-gray-900">Period Attendance Request Log</h4>
          <button onClick={loadHistory} className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200">Refresh</button>
        </div>
        {loadingHist ? (
          <div className="text-center py-6">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mx-auto" />
            <p className="text-sm text-gray-600 mt-2">Loading history...</p>
          </div>
        ) : !history.length ? (
          <p className="text-sm text-gray-600">No period attendance requests found for your departments.</p>
        ) : (
          <div className="space-y-3">
            {history.map((r: any) => (
              <div key={r.id} className="border border-gray-100 rounded p-3 flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900">{r.staff_full_name || r.staff_name || r.staff_user?.username || 'Unknown'}</div>
                  <div className="text-xs text-gray-500">{r.attendance_date} • {r.requested_at ? new Date(r.requested_at).toLocaleString() : ''}</div>
                  <div className="text-xs text-gray-600 mt-1">{r.reason || ''}</div>
                </div>
                <div className="text-right text-sm">
                  <div className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === 'approved' ? 'bg-green-100 text-green-800' : r.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{(r.status || '').toUpperCase()}</div>
                  {r.reviewed_by_name && <div className="text-xs text-gray-500 mt-1">Reviewed by {r.reviewed_by_name}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
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
                if (status === 'A') {
                  // Mark as Absent and lock it
                  dailyMarks[student.student_id] = 'A';
                  locksByStudent[student.student_id] = 'ABSENT';
                } else if (status === 'OD' || status === 'LEAVE') {
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
          // Re-apply ABSENT/OD/LEAVE locks so saved records can never override them
          for (const [sidStr, lock] of Object.entries(locksByStudent)) {
            if (lock === 'ABSENT') updated[Number(sidStr)] = 'A'
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
          // saving attendance payload prepared
          const res = await fetchWithAuth('/api/academics/period-attendance/bulk-mark/', { method: 'POST', body: JSON.stringify(payload) })
          const j = await (res.ok ? res.json().catch(()=>null) : res.json().catch(()=>null))
          
          // Handle attendance locked error
          if (res.status === 403 && j?.attendance_locked) {
            alert(`Cannot mark period attendance: ${j.error || 'Staff attendance is locked'}\n\nYou are marked as absent for ${date}. Please request half-day access from your HOD to mark period attendance.`)
            setSaving(false)
            return
          }
          
          results.push({ section: sid, period: pid, ok: res.ok, data: j })
        }
      }

      const failed = results.filter(r=> !r.ok)
      if (failed.length) {
        alert('Attendance saved for some sections/periods, but failed for others.')
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
                if (status === 'A') {
                  // Mark as Absent and lock it
                  if (initialMarks[student.student_id] !== undefined) initialMarks[student.student_id] = 'A';
                  consecutiveLocks[student.student_id] = 'ABSENT';
                } else if (status === 'OD' || status === 'LEAVE') {
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

      setBulkAssignments(flat)
      setBulkModalOpen(true)
      setSelectedAssignments({}); setBulkDateSelected({}); setBulkAttendanceGrid({})

      // Load existing marked dates in background (do not block modal open)
      void loadMarkedSessions(bulkMonth, flat)
    }catch(e){ console.error('openBulkModal', e); alert('Failed to open bulk modal') }
  }

  // Load existing attendance sessions for filtering
  async function loadMarkedSessions(month: string, assignments: any[]) {
    setBulkMarkedSessionsLoading(true)
    try {
      if (!assignments || assignments.length === 0) {
        setMarkedSessions({})
        return
      }

      // Build O(1) mapping from weekday+period+section -> assignment keys
      const compositeToAssignmentKeys = new Map<string, string[]>()
      const assignmentFilters: Array<{ section_id: number; period_id: number; day: number }> = []
      const seenFilters = new Set<string>()
      for (const a of assignments) {
        const periodId = Number(a.period_id || a.period?.id)
        const sectionId = Number(a.section_id || a.section?.id)
        const day = Number(a._day)
        if (!Number.isFinite(periodId) || !Number.isFinite(sectionId) || !Number.isFinite(day)) continue
        const assignmentKey = a.id ? String(a.id) : `${day}_${periodId}_${sectionId}`
        const composite = `${day}_${periodId}_${sectionId}`
        if (!compositeToAssignmentKeys.has(composite)) compositeToAssignmentKeys.set(composite, [])
        compositeToAssignmentKeys.get(composite)!.push(assignmentKey)

        const filterKey = `${sectionId}_${periodId}_${day}`
        if (!seenFilters.has(filterKey)) {
          seenFilters.add(filterKey)
          assignmentFilters.push({ section_id: sectionId, period_id: periodId, day })
        }
      }

      const res = await fetchWithAuth('/api/academics/period-attendance/marked-keys/', {
        method: 'POST',
        body: JSON.stringify({ month, assignments: assignmentFilters }),
      })
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
        const sectionId = session.section_id
        const periodId = session.period_id

        if (!sessionDate || !sectionId || !periodId) continue

        const dt = new Date(sessionDate)
        const dayOfWeek = dt.getDay() === 0 ? 7 : dt.getDay()

        const composite = `${dayOfWeek}_${periodId}_${sectionId}`
        const assignmentKeys = compositeToAssignmentKeys.get(composite)
        if (!assignmentKeys || assignmentKeys.length === 0) continue

        for (const key of assignmentKeys) {
          if (!marked[key]) marked[key] = new Set()
          marked[key].add(sessionDate)
        }
      }

      setMarkedSessions(marked)
    } catch (e) {
      console.error('Error loading marked sessions:', e)
      setMarkedSessions({})
    } finally {
      setBulkMarkedSessionsLoading(false)
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
        setBulkAttendanceGrid(prev => {
          const next: Record<string, Record<number, 'P' | 'A'>> = {}
          for (const [date, stuMap] of Object.entries(prev)) {
            next[date] = { ...stuMap }
            const validIds = new Set(all.map((s: any) => s.id))
            for (const s of all) { if (!(s.id in next[date])) next[date][s.id] = 'P' }
            for (const sid in next[date]) { if (!validIds.has(Number(sid))) delete next[date][Number(sid)] }
          }
          return next
        })
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
      // Load pending requests BEFORE hiding spinner so button renders correctly
      await fetchAllPendingRequests()
    } catch (error) {
      console.error('Error loading daily attendance:', error)
      setDailyAttendance([])
      setDailySessionData(null)
      setActualMarkedBy(null)
    } finally {
      setLoadingDaily(false)
    }
  }

  async function fetchAllPendingRequests() {
    try {
      const res = await fetchWithAuth('/api/academics/attendance-assignment-requests/?status=PENDING')
      if (res.ok) {
        const data = await res.json()
        const sent = data.sent || []
        setPendingAssignmentRequests(sent.filter((r: any) => r.assignment_type === 'DAILY' && r.date === date))
        setPendingPeriodRequests(sent.filter((r: any) => r.assignment_type === 'PERIOD' && r.date === date))
        const received = (data.received || []).filter((r: any) => r.status === 'PENDING')
        setPendingReceivedCount(received.length)
      }
    } catch (err) {
      console.error('Failed to load pending requests:', err)
      setPendingAssignmentRequests([])
      setPendingPeriodRequests([])
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

  // Handle attendance status change (local state only, no auto-save)
  function handleAttendanceStatusChange(studentId: number, newStatus: string) {
    // Update local state immediately for responsive UI
    setAttendanceStatus(prev => ({ ...prev, [studentId]: newStatus }))
    // Note: Changes are now saved only when "Save Daily Attendance" button is clicked
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
    setSelectedPeriodForSwap(null)
    setSwapModalOpen(true)
    loadDepartmentStaff()
  }

  function openPeriodSwapModal(period: any) {
    setSwapFor('period')
    setSelectedPeriodForSwap(period)
    setSwapModalOpen(true)
    loadDepartmentStaff()
  }

  function closeSwapModal() {
    setSwapModalOpen(false)
    setSelectedPeriodForSwap(null)
  }

  // Handle staff selection — CREATE REQUEST (pending approval by selected staff)
  async function handleSwapStaff(staff: any) {
    if (swapFor === 'period') {
      await handlePeriodSwapStaff(staff)
      return
    }

    setSwapModalOpen(false)
    setSavingDaily(true)
    try {
      const response = await fetchWithAuth('/api/academics/attendance-assignment-requests/', {
        method: 'POST',
        body: JSON.stringify({
          assignment_type: 'DAILY',
          section_id: selectedSection.section_id,
          date: date,
          requested_to_id: staff.id
        })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to send request')
      }
      const data = await response.json()
      // Refresh pending state before alert so button updates
      await fetchAllPendingRequests()
      alert(data.message || `Request sent to ${staff.name}. They will be notified and can approve or reject it.`)
    } catch (error) {
      console.error('Error sending request:', error)
      alert('Failed: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setSavingDaily(false)
    }
  }

  // Assign period attendance to another staff via REQUEST (pending approval)
  async function handlePeriodSwapStaff(staff: any) {
    const p = selectedPeriodForSwap || selected
    if (!p) return

    setSwapModalOpen(false)
    setSaving(true)
    try {
      const response = await fetchWithAuth('/api/academics/attendance-assignment-requests/', {
        method: 'POST',
        body: JSON.stringify({
          assignment_type: 'PERIOD',
          section_id: p.section_id,
          period_id: p.period?.id,
          date: date,
          requested_to_id: staff.id
        })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to send request')
      }
      const data = await response.json()
      await fetchAllPendingRequests()
      alert(data.message || `Request sent to ${staff.name}. They can approve or reject it.`)
    } catch (error) {
      console.error('Period request error:', error)
      alert('Failed: ' + (error instanceof Error ? error.message : String(error)))
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

  // Bulk Excel: load sections
  async function loadBulkExcelSections() {
    setBulkExcelSectionsLoading(true)
    try {
      const res = await fetchWithAuth('/api/academics/bulk-attendance/sections/')
      if (res.ok) {
        const data = await res.json()
        setBulkExcelSections(data)
        if (data.length === 1) setBulkExcelSection(data[0])
      }
    } catch (e) {
      console.error('Error loading bulk sections:', e)
    } finally {
      setBulkExcelSectionsLoading(false)
    }
  }

  function getBulkExcelEffectiveExcludedDates(startDate: string, endDate: string, excludedDates: Set<string>): string[] {
    const effective = new Set(excludedDates)
    const startD = new Date(startDate + 'T00:00:00')
    const endD = new Date(endDate + 'T00:00:00')
    if (isNaN(startD.getTime()) || isNaN(endD.getTime()) || endD < startD) return [...effective]

    const cursor = new Date(startD)
    while (cursor <= endD) {
      if (cursor.getDay() === 0) {
        effective.add(cursor.toISOString().slice(0, 10))
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return [...effective]
  }

  async function handleBulkExcelDownload() {
    if (!bulkExcelSection || !bulkExcelStartDate || !bulkExcelEndDate) {
      alert('Please select a section and date range')
      return
    }
    setBulkExcelDownloading(true)
    try {
      const params = new URLSearchParams({
        section_id: bulkExcelSection.section_id,
        start_date: bulkExcelStartDate,
        end_date: bulkExcelEndDate,
      })
      const effectiveExcludedDates = getBulkExcelEffectiveExcludedDates(
        bulkExcelStartDate,
        bulkExcelEndDate,
        bulkExcelExcludedDates,
      )
      if (effectiveExcludedDates.length > 0) {
        params.set('excluded_dates', effectiveExcludedDates.join(','))
      }
      const res = await fetchWithAuth(`/api/academics/bulk-attendance/download/?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }))
        alert(err.error || 'Download failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance_${bulkExcelSection.section_name}_${bulkExcelStartDate}_${bulkExcelEndDate}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Download error: ' + String(e))
    } finally {
      setBulkExcelDownloading(false)
    }
  }

  function handleBulkExcelFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) return
    setBulkExcelPendingFile(file)
    setBulkExcelResult(null)

    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const data = evt.target?.result as ArrayBuffer
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]

        if (allRows.length < 2) {
          alert('Excel file has no data rows')
          return
        }

        const headers = allRows[0] as any[]
        // col A = Register Number, col B = Name, col C onwards = dates
        const dates: string[] = headers.slice(2).map(h => String(h || '').trim()).filter(Boolean)

        const previewRows: BulkPreviewRow[] = []
        for (let i = 1; i < allRows.length; i++) {
          const row = allRows[i]
          let regNoRaw: any = row[0]
          // Excel may cast integer reg-nos to float
          if (typeof regNoRaw === 'number') {
            regNoRaw = Number.isInteger(regNoRaw) ? String(regNoRaw) : String(Math.round(regNoRaw))
          }
          const regNo = String(regNoRaw || '').trim()
          if (!regNo) continue

          const name = String(row[1] || '').trim()
          const statuses: Record<string, string> = {}
          const remarks: Record<string, string> = {}
          dates.forEach((date, idx) => {
            statuses[date] = String(row[2 + idx] || '').trim()
            remarks[date] = ''
          })
          previewRows.push({ reg_no: regNo, name, statuses, remarks })
        }

        setBulkPreviewData({ dates, rows: previewRows })
        setBulkPreviewDate(dates[0] || '')
      } catch (err) {
        alert('Failed to parse Excel: ' + String(err))
      }
    }
    reader.readAsArrayBuffer(file)
    // reset so same file can be re-selected
    e.target.value = ''
  }

  async function handleBulkExcelImport(lockSession: boolean) {
    if (!bulkPreviewData || !bulkExcelSection) return
    setBulkExcelImporting(true)
    setBulkExcelResult(null)
    try {
      const attendance = bulkPreviewData.rows.map(row => ({
        reg_no: row.reg_no,
        dates: row.statuses,
        remarks: row.remarks,
      }))
      const res = await fetchWithAuth('/api/academics/bulk-attendance/import/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_id: bulkExcelSection.section_id,
          lock_session: lockSession,
          attendance,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Import failed')
        return
      }
      setBulkExcelResult(data)
      setBulkPreviewData(null)
      setBulkExcelPendingFile(null)
    } catch (e) {
      alert('Import error: ' + String(e))
    } finally {
      setBulkExcelImporting(false)
    }
  }

  async function loadBulkLockedSessionsInRange() {
    if (!bulkExcelSection) {
      setBulkLockedSessionsInRange([])
      return
    }
    try {
      const params = new URLSearchParams({ section_id: String(bulkExcelSection.section_id) })
      if (bulkExcelStartDate) params.set('start_date', bulkExcelStartDate)
      if (bulkExcelEndDate) params.set('end_date', bulkExcelEndDate)
      const res = await fetchWithAuth(`/api/academics/bulk-attendance/locked-sessions/?${params.toString()}`)
      if (!res.ok) {
        setBulkLockedSessionsInRange([])
        return
      }
      const data = await res.json().catch(() => ({}))
      setBulkLockedSessionsInRange(Array.isArray(data?.results) ? data.results : [])
    } catch {
      setBulkLockedSessionsInRange([])
    }
  }

  function getBulkRequestSessions(result: BulkExcelResult | null) {
    if (!result) return [] as BulkLockedSession[]
    const sessionsById = new Map<number, BulkLockedSession>()
    for (const session of result.locked_sessions || []) sessionsById.set(session.session_id, session)
    for (const session of result.skipped_locked_sessions || []) sessionsById.set(session.session_id, session)
    return Array.from(sessionsById.values()).sort((a, b) => a.date.localeCompare(b.date))
  }

  function getBulkRequestableSessions(result: BulkExcelResult | null) {
    return getBulkRequestSessions(result).filter(session => !isBulkSessionRequestPending(session))
  }

  function getCurrentBulkRequestSessions() {
    if (bulkExcelResult) return getBulkRequestSessions(bulkExcelResult)
    return [...bulkLockedSessionsInRange].sort((a, b) => a.date.localeCompare(b.date))
  }

  function getCurrentBulkRequestableSessions() {
    return getCurrentBulkRequestSessions().filter(session => !isBulkSessionRequestPending(session))
  }

  function hasCurrentBulkPendingRequests() {
    return getCurrentBulkRequestSessions().some(session => isBulkSessionRequestPending(session))
  }

  function isBulkSessionRequestPending(session: BulkLockedSession) {
    const status = String(session.unlock_request_status || '').toUpperCase()
    return status === 'PENDING' || status === 'HOD_APPROVED'
  }

  async function handleBulkLockedSessionRequests() {
    const requestableSessions = getCurrentBulkRequestableSessions()
    if (!requestableSessions.length) return

    setBulkUnlockRequesting(true)
    try {
      // Single request for all sessions at once
      const res = await fetchWithAuth('/api/academics/bulk-attendance/unlock-request/', {
        method: 'POST',
        body: JSON.stringify({
          session_ids: requestableSessions.map(s => s.session_id),
          note: '',
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert('Failed to submit unlock request: ' + String(data.error || data.detail || 'Unknown error'))
        return
      }

      // Merge returned statuses back into state
      const updatesBySession = new Map<number, Partial<BulkLockedSession>>()
      for (const item of [...(data.created || []), ...(data.already_pending || [])]) {
        updatesBySession.set(item.session_id, {
          unlock_request_id: item.unlock_request_id,
          unlock_request_status: item.unlock_request_status,
          unlock_request_hod_status: item.unlock_request_hod_status,
        })
      }

      setBulkExcelResult(prev => {
        if (!prev) return prev
        return {
          ...prev,
          locked_sessions: (prev.locked_sessions || []).map(session => {
            const update = updatesBySession.get(session.session_id)
            return update ? { ...session, ...update } : session
          }),
          skipped_locked_sessions: (prev.skipped_locked_sessions || []).map(session => {
            const update = updatesBySession.get(session.session_id)
            return update ? { ...session, ...update } : session
          }),
        }
      })

      setBulkLockedSessionsInRange(prev =>
        prev.map(session => {
          const update = updatesBySession.get(session.session_id)
          return update ? { ...session, ...update } : session
        })
      )

      const created = data.total_created ?? 0
      const pending = data.total_already_pending ?? 0
      if (created > 0) {
        alert('Unlock request sent to IQAC.')
      } else if (pending > 0) {
        alert('Unlock request already pending approval.')
      } else {
        alert('Unlock request submitted.')
      }
    } finally {
      setBulkUnlockRequesting(false)
    }
  }

  async function handleBulkUnlockAndReset() {
    await handleBulkLockedSessionRequests()
  }

  useEffect(() => {
    if (viewMode !== 'bulk') return
    if (!bulkExcelSection) {
      setBulkLockedSessionsInRange([])
      return
    }
    if (bulkExcelResult) return
    loadBulkLockedSessionsInRange()
  }, [viewMode, bulkExcelSection, bulkExcelStartDate, bulkExcelEndDate, bulkExcelResult])

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

      {/* Staff Attendance Status Notification */}
      {checkingStaffAttendance ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm mb-6 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <span className="text-blue-800 text-sm font-medium">Checking staff attendance status...</span>
          </div>
        </div>
      ) : staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance ? (
        <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm mb-6 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-red-800 font-semibold text-sm mb-2">Period Attendance Access Required</h3>
              <p className="text-red-700 text-sm mb-3">{staffAttendanceStatus.reason}</p>
              
              {/* Show pending request status */}
              {staffAttendanceStatus.pending_request && (
                <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">Request Pending Approval</span>
                  </div>
                  <p className="text-xs text-yellow-700 mt-1">
                    Your period attendance access request is pending HOD/AHOD approval.
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Submitted: {new Date(staffAttendanceStatus.pending_request.requested_at).toLocaleString()}
                  </p>
                </div>
              )}
              
              {!staffAttendanceStatus.pending_request && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowHalfDayRequestModal(true)}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Request Period Attendance Access
                  </button>
                  <span className="text-gray-600 text-xs flex items-center">
                    Request approval from your HOD/AHOD to mark period attendance
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : staffAttendanceStatus?.can_mark_attendance && staffAttendanceStatus.attendance_record?.status === 'partial' ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl shadow-sm mb-6 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <div>
              <span className="text-yellow-800 text-sm font-medium">
                You are marked as partial attendance for {date} - Period attendance access is enabled
              </span>
            </div>
          </div>
        </div>
      ) : null}

      

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
          <button
            onClick={() => setShowRequestsModal(true)}
            className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Bell className="w-4 h-4" />
            Requests
            {pendingReceivedCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-white text-blue-600">
                {pendingReceivedCount}
              </span>
            )}
          </button>
      {/* date selector row needs flex to push Requests button right */}
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
          {canAccessBulkAttendance && (
            <button
              onClick={() => {
                setViewMode('bulk')
                if (bulkExcelSections.length === 0) loadBulkExcelSections()
              }}
              className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
                viewMode === 'bulk'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Bulk / Excel
            </button>
          )}
        </div>
      </div>

      {viewMode === 'bulk' && !canAccessBulkAttendance && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl shadow-sm mb-6 p-4">
          <p className="text-sm text-yellow-700">
            Bulk / Excel attendance is available only for users with the Advisor role and daily attendance marking permission.
          </p>
        </div>
      )}

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

      {/* Bulk / Excel Attendance */}
      {viewMode === 'bulk' && canAccessBulkAttendance && (
        <div className="space-y-6">
          {/* Controls card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-indigo-50">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-violet-600" />
                Bulk / Excel Attendance
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">Download an Excel sheet with your class, fill in attendance, then import it back.</p>
            </div>
            <div className="p-6 space-y-5">
              {/* Section selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Section</label>
                {bulkExcelSectionsLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Loading sections…</div>
                ) : (
                  <select
                    value={bulkExcelSection?.section_id ?? ''}
                    onChange={e => {
                      const sec = bulkExcelSections.find(s => String(s.section_id) === e.target.value)
                      setBulkExcelSection(sec ?? null)
                      setBulkExcelResult(null)
                      setBulkExcelExcludedDates(new Set())
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="">-- Select section --</option>
                    {bulkExcelSections.map(s => (
                      <option key={s.section_id} value={s.section_id}>
                        {[s.department_short_name, s.batch_name, s.section_name].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Date range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={bulkExcelStartDate}
                    onChange={e => { setBulkExcelStartDate(e.target.value); setBulkExcelResult(null); setBulkExcelExcludedDates(new Set()) }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={bulkExcelEndDate}
                    onChange={e => { setBulkExcelEndDate(e.target.value); setBulkExcelResult(null); setBulkExcelExcludedDates(new Set()) }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              {/* Date exclusion calendar */}
              {bulkExcelSection && bulkExcelStartDate && bulkExcelEndDate && (() => {
                const startD = new Date(bulkExcelStartDate + 'T00:00:00')
                const endD = new Date(bulkExcelEndDate + 'T00:00:00')
                if (isNaN(startD.getTime()) || isNaN(endD.getTime()) || endD < startD) return null

                // Build list of months
                const months: { year: number; month: number }[] = []
                const mCur = new Date(startD.getFullYear(), startD.getMonth(), 1)
                const mEnd = new Date(endD.getFullYear(), endD.getMonth(), 1)
                while (mCur <= mEnd) {
                  months.push({ year: mCur.getFullYear(), month: mCur.getMonth() })
                  mCur.setMonth(mCur.getMonth() + 1)
                }

                // Total days in range
                let totalDays = 0
                let sundayCount = 0
                const tempC = new Date(startD)
                while (tempC <= endD) {
                  totalDays++
                  if (tempC.getDay() === 0) sundayCount++
                  tempC.setDate(tempC.getDate() + 1)
                }
                const manualExcludedCount = [...bulkExcelExcludedDates].reduce((count, ds) => {
                  const d = new Date(ds + 'T00:00:00')
                  if (isNaN(d.getTime())) return count
                  return d.getDay() === 0 ? count : count + 1
                }, 0)
                const selectedCount = totalDays - sundayCount - manualExcludedCount

                const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

                return (
                  <div className="border border-slate-200 rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">Mark the Non-Working Days</span>
                        <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                          {selectedCount} / {totalDays} days selected
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(bulkExcelExcludedDates)
                            const c = new Date(startD)
                            while (c <= endD) {
                              const day = c.getDay()
                              if (day === 6) next.add(c.toISOString().slice(0, 10))
                              c.setDate(c.getDate() + 1)
                            }
                            setBulkExcelExcludedDates(next)
                          }}
                          className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          Skip Weekends
                        </button>
                        {bulkExcelExcludedDates.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setBulkExcelExcludedDates(new Set())}
                            className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-5">
                      {months.map(({ year, month }) => {
                        const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' })
                        const firstDayOfWeek = new Date(year, month, 1).getDay()
                        const daysInMonth = new Date(year, month + 1, 0).getDate()
                        return (
                          <div key={`${year}-${month}`} className="min-w-[196px]">
                            <div className="text-xs font-semibold text-slate-600 mb-1.5 text-center">{monthName} {year}</div>
                            <div className="grid grid-cols-7 gap-0.5">
                              {dayLabels.map(dl => (
                                <div key={dl} className="text-center text-[10px] font-medium text-slate-400 py-0.5 w-7">{dl}</div>
                              ))}
                              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                                <div key={`empty-${i}`} className="w-7 h-7" />
                              ))}
                              {Array.from({ length: daysInMonth }).map((_, i) => {
                                const d = i + 1
                                const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                                const dt = new Date(ds + 'T00:00:00')
                                const inRange = dt >= startD && dt <= endD
                                const isSunday = dt.getDay() === 0
                                const isExcluded = isSunday || bulkExcelExcludedDates.has(ds)
                                const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
                                if (!inRange) {
                                  return (
                                    <div key={ds} className="w-7 h-7 flex items-center justify-center text-[11px] text-slate-200">
                                      {d}
                                    </div>
                                  )
                                }
                                return (
                                  <button
                                    key={ds}
                                    type="button"
                                    title={isSunday ? `${ds} — Sunday is locked` : `${ds} — click to ${isExcluded ? 'include' : 'exclude'}`}
                                    disabled={isSunday}
                                    onClick={() =>
                                      setBulkExcelExcludedDates(prev => {
                                        if (isSunday) return prev
                                        const next = new Set(prev)
                                        if (next.has(ds)) next.delete(ds); else next.add(ds)
                                        return next
                                      })
                                    }
                                    className={`w-7 h-7 rounded text-[11px] font-medium transition-colors flex items-center justify-center mx-auto ${
                                      isSunday
                                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                        : isExcluded
                                        ? 'bg-red-100 text-red-400 line-through'
                                        : isWeekend
                                        ? 'bg-amber-50 text-amber-700 hover:bg-red-100 hover:text-red-500'
                                        : 'bg-indigo-50 text-indigo-700 hover:bg-red-100 hover:text-red-500'
                                    }`}
                                  >
                                    {d}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  onClick={handleBulkExcelDownload}
                  disabled={bulkExcelDownloading || !bulkExcelSection || !bulkExcelStartDate || !bulkExcelEndDate}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {bulkExcelDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download Excel
                </button>

                <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  (!bulkExcelSection || !bulkExcelStartDate || !bulkExcelEndDate || !!bulkExcelResult)
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}>
                  {bulkExcelImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Import Excel
                  <input
                    ref={bulkExcelFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    disabled={!bulkExcelSection || !bulkExcelStartDate || !bulkExcelEndDate || bulkExcelImporting || !!bulkExcelResult}
                    onChange={handleBulkExcelFileChange}
                  />
                </label>

                {getCurrentBulkRequestSessions().length > 0 && (
                  <button
                    onClick={handleBulkUnlockAndReset}
                    disabled={bulkUnlockRequesting || getCurrentBulkRequestableSessions().length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {bulkUnlockRequesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                    {getCurrentBulkRequestableSessions().length === 0 && hasCurrentBulkPendingRequests()
                      ? 'Pending Approval'
                      : 'Unlock + Reset'}
                  </button>
                )}

              </div>
            </div>
          </div>

        </div>
      )}

      {/* Confirm Import Modal */}
      {/* Bulk Excel Preview Modal */}
      {bulkPreviewData && bulkExcelSection && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ maxHeight: '90vh' }}>

            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-violet-500 to-indigo-600 p-2 rounded-lg shadow">
                  <Eye className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Daily Attendance — {[bulkExcelSection.department_short_name, bulkExcelSection.batch_name, bulkExcelSection.section_name].filter(Boolean).join(' · ')}
                  </h2>
                  <p className="text-sm text-slate-500">{bulkPreviewData.rows.length} students · Review before saving</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkExcelImport(false)}
                  disabled={bulkExcelImporting}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {bulkExcelImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Attendance
                </button>
                <button
                  onClick={() => handleBulkExcelImport(true)}
                  disabled={bulkExcelImporting}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  Save + Lock
                </button>
                <button
                  onClick={() => { setBulkPreviewData(null); setBulkExcelPendingFile(null) }}
                  className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100"
                  title="Cancel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Date tabs (only shown when multiple dates) */}
            {bulkPreviewData.dates.length > 1 && (
              <div className="px-6 py-3 border-b border-slate-200 flex gap-2 overflow-x-auto flex-shrink-0 bg-slate-50">
                {bulkPreviewData.dates.map(date => (
                  <button
                    key={date}
                    onClick={() => setBulkPreviewDate(date)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      bulkPreviewDate === date
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {date}
                  </button>
                ))}
              </div>
            )}

            {/* Mark All Present bar */}
            <div className="px-6 py-3 border-b border-slate-100 flex-shrink-0">
              <button
                onClick={() => {
                  if (!bulkPreviewDate) return
                  setBulkPreviewData(prev => {
                    if (!prev) return prev
                    return {
                      ...prev,
                      rows: prev.rows.map(r => ({
                        ...r,
                        statuses: { ...r.statuses, [bulkPreviewDate]: 'Present' },
                      })),
                    }
                  })
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Check className="w-4 h-4" />
                Mark All Present
              </button>
            </div>

            {/* Student table */}
            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-2/5">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-1/4">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bulkPreviewData.rows.map((row, idx) => {
                    const currentStatus = bulkPreviewDate ? (row.statuses[bulkPreviewDate] || '') : ''
                    const currentRemark = bulkPreviewDate ? (row.remarks[bulkPreviewDate] || '') : ''
                    const statusColor =
                      currentStatus === 'Present' ? 'border-green-300 bg-green-50 text-green-800' :
                      currentStatus === 'Absent'  ? 'border-red-300 bg-red-50 text-red-800' :
                      currentStatus === 'OD'      ? 'border-blue-300 bg-blue-50 text-blue-800' :
                      currentStatus === 'Leave'   ? 'border-amber-300 bg-amber-50 text-amber-800' :
                      'border-slate-300'
                    return (
                      <tr key={row.reg_no} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-50'}>
                        <td className="px-6 py-3">
                          <div className="font-semibold text-slate-900 text-sm">{row.name || row.reg_no}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{row.reg_no}</div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={currentStatus}
                            onChange={e => {
                              if (!bulkPreviewDate) return
                              const val = e.target.value
                              setBulkPreviewData(prev => {
                                if (!prev) return prev
                                const newRows = [...prev.rows]
                                newRows[idx] = { ...newRows[idx], statuses: { ...newRows[idx].statuses, [bulkPreviewDate]: val } }
                                return { ...prev, rows: newRows }
                              })
                            }}
                            className={`w-full border rounded-lg px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer ${statusColor}`}
                          >
                            <option value="">— Select —</option>
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                            <option value="OD">OD</option>
                            <option value="Leave">Leave</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={currentRemark}
                            onChange={e => {
                              if (!bulkPreviewDate) return
                              const val = e.target.value
                              setBulkPreviewData(prev => {
                                if (!prev) return prev
                                const newRows = [...prev.rows]
                                newRows[idx] = { ...newRows[idx], remarks: { ...newRows[idx].remarks, [bulkPreviewDate]: val } }
                                return { ...prev, rows: newRows }
                              })
                            }}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            placeholder="Optional remark"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer count */}
            <div className="px-6 py-3 border-t border-slate-200 flex-shrink-0 bg-slate-50 rounded-b-xl text-xs text-slate-500">
              {bulkPreviewDate && (() => {
                const present = bulkPreviewData.rows.filter(r => r.statuses[bulkPreviewDate] === 'Present').length
                const absent  = bulkPreviewData.rows.filter(r => r.statuses[bulkPreviewDate] === 'Absent').length
                const od      = bulkPreviewData.rows.filter(r => r.statuses[bulkPreviewDate] === 'OD').length
                const leave   = bulkPreviewData.rows.filter(r => r.statuses[bulkPreviewDate] === 'Leave').length
                const unmarked = bulkPreviewData.rows.filter(r => !r.statuses[bulkPreviewDate]).length
                return (
                  <span>
                    {bulkPreviewDate} &nbsp;·&nbsp;
                    <span className="text-green-700 font-medium">{present} Present</span> &nbsp;·&nbsp;
                    <span className="text-red-700 font-medium">{absent} Absent</span> &nbsp;·&nbsp;
                    <span className="text-blue-700 font-medium">{od} OD</span> &nbsp;·&nbsp;
                    <span className="text-amber-700 font-medium">{leave} Leave</span>
                    {unmarked > 0 && <span className="text-slate-400"> &nbsp;·&nbsp; {unmarked} unmarked</span>}
                  </span>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Assigned Periods */}
      {viewMode === 'period' && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 relative">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Assigned Periods
          </h2>
        </div>

        <div className={`p-6 transition-all ${staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance ? 'blur-sm pointer-events-none select-none' : ''}`}>
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
              
            </div>
          )}
        </div>
        {/* Overlay for locked access */}
        {staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance && (
          <div className="absolute inset-0 bg-red-500/5 backdrop-blur-[2px] flex items-center justify-center rounded-xl z-10">
            <div className="bg-white/95 border-2 border-red-300 rounded-xl shadow-2xl p-6 max-w-md mx-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-red-100 rounded-full">
                  <Lock className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-red-800">Period Attendance Locked</h3>
              </div>
              <p className="text-sm text-red-700 mb-4">{staffAttendanceStatus.reason}</p>
              {staffAttendanceStatus.attendance_record?.status === 'absent' && !staffAttendanceStatus.pending_request && (
                <button
                  onClick={() => setShowHalfDayRequestModal(true)}
                  className="w-full px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <AlertCircle className="w-4 h-4" />
                  Request Half-Day Access
                </button>
              )}
              {staffAttendanceStatus.pending_request && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">Request Pending</span>
                  </div>
                  <p className="text-xs text-yellow-700">Your half-day access request is awaiting HOD/AHOD approval</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Request sections: access requests (moved below Assigned Periods) */}
      <div className="mb-6">
        <HalfDayRequestsApproval />
      </div>

      {/* Daily Attendance Marking Panel */}
      {dailyMode && selectedSection && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 relative">
          {/* Overlay for locked access on daily mode */}
          {staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance && (
            <div className="absolute inset-0 bg-red-500/5 backdrop-blur-[2px] flex items-center justify-center rounded-xl z-10">
              <div className="bg-white/95 border-2 border-red-300 rounded-xl shadow-2xl p-6 max-w-md mx-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-red-100 rounded-full">
                    <Lock className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-bold text-red-800">Daily Attendance Locked</h3>
                </div>
                <p className="text-sm text-red-700 mb-4">{staffAttendanceStatus.reason}</p>
                {staffAttendanceStatus.attendance_record?.status === 'absent' && !staffAttendanceStatus.pending_request && (
                  <button
                    onClick={() => setShowHalfDayRequestModal(true)}
                    className="w-full px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Request Half-Day Access
                  </button>
                )}
                {staffAttendanceStatus.pending_request && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-800">Request Pending</span>
                    </div>
                    <p className="text-xs text-yellow-700">Your half-day access request is awaiting HOD/AHOD approval</p>
                  </div>
                )}
              </div>
            </div>
          )}
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
                {!dailySessionData?.assigned_to && (() => {
                  const sectionPending = pendingAssignmentRequests.filter((r: any) => Number(r.section_id) === Number(selectedSection?.section_id))
                  const hasPending = sectionPending.length > 0
                  return hasPending ? (
                    <span className="px-2 sm:px-3 py-1.5 bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2">
                      <Clock className="w-3 sm:w-4 h-3 sm:h-4" />
                      <span className="hidden sm:inline">Pending — {sectionPending[0].requested_to_name}</span>
                      <span className="sm:hidden">Pending</span>
                    </span>
                  ) : (
                    <button
                      onClick={openSwapModal}
                      disabled={dailySessionData?.is_locked}
                      className="px-2 sm:px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border border-indigo-300 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={dailySessionData?.is_locked ? 'Cannot request: session is locked' : 'Request another staff to take this attendance'}
                    >
                      <ArrowLeftRight className="w-3 sm:w-4 h-3 sm:h-4" />
                      <span className="hidden sm:inline">Request Staff</span>
                      <span className="sm:hidden">Request</span>
                    </button>
                  )
                })()}
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
                  <button
                    onClick={() => markAllDaily('A')}
                    disabled={dailySessionData?.is_locked}
                    className={`px-3 sm:px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs sm:text-sm font-medium border border-red-300 flex items-center gap-1 sm:gap-2 ${dailySessionData?.is_locked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-300' : ''}`}
                  >
                    <X className="w-3 sm:w-4 h-3 sm:h-4" />
                    <span className="hidden sm:inline">Mark All Absent</span>
                    <span className="sm:hidden">All Absent</span>
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
                        // Strict lock: if dailyLocks[student.student_id] is set to 'ABSENT', 'OD', 'LEAVE', or 'LATE', lock the selector
                        const lockReason = dailyLocks[student.student_id]
                        const isLocked = lockReason === 'ABSENT' || lockReason === 'OD' || lockReason === 'LEAVE' || lockReason === 'LATE' || dailySessionData?.is_locked || dailySessionData?.is_read_only
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
                                        : 'bg-purple-100 text-purple-800 border-purple-300'
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
                                  disabled={isLocked}
                                  className={`px-2 sm:px-3 py-1.5 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full ${statusClasses[status]} ${isLocked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                                >
                                  <option value="P">Present</option>
                                  <option value="A">Absent</option>
                                  <option value="OD">On Duty</option>
                                  <option value="LATE">Late</option>
                                  <option value="LEAVE">Leave</option>
                                </select>
                                {lockReason && (lockReason === 'ABSENT' || lockReason === 'OD' || lockReason === 'LEAVE' || lockReason === 'LATE') && (
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    <Lock className="w-4 h-4 text-slate-400" title={`Locked by daily status: ${lockReason}`}/>
                                  </div>
                                )}
                              </div>
                              {/* Mobile remarks input */}
                              <div className="mt-2 sm:hidden">
                                <input
                                  type="text"
                                  value={attendanceRemarks[student.student_id] || ''}
                                  onChange={(e) => setAttendanceRemarks(prev => ({ ...prev, [student.student_id]: e.target.value }))}
                                  disabled={isLocked}
                                  placeholder="Remarks (optional)"
                                  className={`px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full ${isLocked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-2 sm:px-4 hidden sm:table-cell">
                              <input
                                type="text"
                                value={attendanceRemarks[student.student_id] || ''}
                                onChange={(e) => setAttendanceRemarks(prev => ({ ...prev, [student.student_id]: e.target.value }))}
                                disabled={isLocked}
                                placeholder="Optional remarks"
                                className={`px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full ${isLocked ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 relative">
          {/* Overlay for locked access on session panel */}
          {staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance && (
            <div className="absolute inset-0 bg-red-500/5 backdrop-blur-[2px] flex items-center justify-center rounded-xl z-10">
              <div className="bg-white/95 border-2 border-red-300 rounded-xl shadow-2xl p-6 max-w-md mx-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-red-100 rounded-full">
                    <Lock className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-bold text-red-800">Period Attendance Locked</h3>
                </div>
                <p className="text-sm text-red-700 mb-4">{staffAttendanceStatus.reason}</p>
                {staffAttendanceStatus.attendance_record?.status === 'absent' && !staffAttendanceStatus.pending_request && (
                  <button
                    onClick={() => setShowHalfDayRequestModal(true)}
                    className="w-full px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Request Half-Day Access
                  </button>
                )}
                {staffAttendanceStatus.pending_request && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-800">Request Pending</span>
                    </div>
                    <p className="text-xs text-yellow-700">Your half-day access request is awaiting HOD/AHOD approval</p>
                  </div>
                )}
              </div>
            </div>
          )}
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
                /* No assignment yet — show Pending badge if request sent, else Request Staff button */
                !selected.attendance_session_locked && (() => {
                  const periodPending = pendingPeriodRequests.filter(
                    (r: any) => Number(r.period_id) === Number(selected.period?.id) &&
                                Number(r.section_id) === Number(selected.section_id)
                  )
                  return periodPending.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-lg text-sm font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      Pending — {periodPending[0].requested_to_name}
                    </span>
                  ) : (
                    <button
                      onClick={() => openPeriodSwapModal(selected)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border border-indigo-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Request Staff
                    </button>
                  )
                })()
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
                    const dailyLock = dailyLocks[s.id] || null  // 'ABSENT' | 'OD' | 'LEAVE' | 'LATE' | null
                    // assigned to someone else = view only for the original staff
                    const isAssignedToOther = !!(selected as any).assigned_to && !(selected as any).original_staff
                    const isLocked = selected.attendance_session_locked || dailyLock === 'ABSENT' || dailyLock === 'OD' || dailyLock === 'LEAVE' || isAssignedToOther
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
                          {dailyLock === 'ABSENT' && (
                            <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700" title="Marked ABSENT in daily attendance">
                              Daily Absent
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 sm:px-4">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-3 h-3 rounded-full ${badgeCls}`} />
                            {isLocked && dailyLock ? (
                              /* ABSENT / OD / LEAVE locked from daily attendance */
                              <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-slate-300 w-full" title={`Locked by daily attendance (${dailyLock === 'ABSENT' ? 'Absent' : dailyLock === 'OD' ? 'On Duty' : 'Leave'})`}>
                                <Lock className="w-3 h-3 text-slate-400" />
                                {dailyLock === 'ABSENT' ? 'Absent' : dailyLock === 'OD' ? 'On Duty' : 'Leave'}
                              </div>
                            ) : (
                            <div className="relative inline-block w-full">
                              <select 
                                value={marks[s.id] || 'P'} 
                                onChange={e=> setMark(s.id, e.target.value)}
                                disabled={isLocked || (staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance)}
                                className={`appearance-none px-2 sm:px-3 py-1.5 pr-8 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-full ${statusCls} ${(isLocked || (staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance)) ? 'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed' : ''}`}
                                title={staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance ? 
                                       "Attendance marking is locked - you are marked as absent" : undefined}
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
                    disabled={saving || selected.attendance_session_locked || (staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    title={staffAttendanceStatus && !staffAttendanceStatus.can_mark_attendance ? 
                           "Period attendance is locked - you are marked as absent" : undefined}
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
      {swapModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-start justify-between rounded-t-xl">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {swapFor === 'period' ? 'Request Staff for Period Attendance' : 'Request Staff for Daily Attendance'}
                </h3>
                {swapFor === 'period' && selectedPeriodForSwap && (
                  <p className="text-xs text-slate-600 mt-1">
                    {(selectedPeriodForSwap as any).combined_period_label || (selectedPeriodForSwap as any).period?.label || `Period ${(selectedPeriodForSwap as any).period?.index}`} - {(selectedPeriodForSwap as any).section_name}
                  </p>
                )}
              </div>
              <button
                onClick={closeSwapModal}
                className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {loadingStaff ? (
                <div className="flex items-center justify-center py-10 text-slate-600">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading department staff...
                </div>
              ) : departmentStaff.length === 0 ? (
                <div className="text-center py-10 text-slate-600">
                  <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-medium">No staff available</p>
                  <p className="text-xs mt-1">No active staff found in your department.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600 mb-3">Select a staff member to send assignment request.</p>
                  {departmentStaff.map((staff: any) => (
                    <button
                      key={staff.id}
                      onClick={() => handleSwapStaff(staff)}
                      disabled={saving || savingDaily}
                      className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-slate-900">{staff.name || staff.username || 'Unknown Staff'}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {staff.staff_id || ''}{staff.designation ? ` - ${staff.designation}` : ''}
                          </div>
                        </div>
                        <ArrowLeftRight className="w-4 h-4 text-indigo-500" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end">
              <button
                onClick={closeSwapModal}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 rounded-t-xl">
              <h3 className="text-xl font-bold text-slate-900">Bulk Mark Attendance</h3>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Select Month:
                </label>
                <input
                  type="month"
                  value={bulkMonth}
                  onChange={e => setBulkMonth(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-3">Assignments</label>
                {bulkMarkedSessionsLoading && (
                  <div className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading already-marked dates...
                  </div>
                )}
                <div className="border border-slate-200 rounded-lg p-4 max-h-60 overflow-y-auto bg-slate-50">
                  <label className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={Object.keys(selectedAssignments).length > 0 && Object.values(selectedAssignments).every(Boolean)}
                      onChange={(e) => {
                        const checked = e.target.checked
                        const next: Record<string, boolean> = {}
                        for (const a of bulkAssignments) {
                          const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
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
                        const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
                        const markedDates = markedSessions[key]
                        if (!markedDates) return true
                        try {
                          const [y, m] = bulkMonth.split('-').map(x => parseInt(x))
                          const lastDay = new Date(y, m, 0).getDate()
                          let possibleDates = 0
                          for (let d = 1; d <= lastDay; d++) {
                            const dt = new Date(y, m - 1, d)
                            const dayOfWeek = dt.getDay() === 0 ? 7 : dt.getDay()
                            if (dayOfWeek === a._day) possibleDates++
                          }
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

                      return filteredAssignments.map(a => {
                        const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
                        const markedDates = markedSessions[key]
                        const markedCount = markedDates ? markedDates.size : 0

                        return (
                          <label key={key} className="flex items-start gap-3 p-2 hover:bg-white rounded-lg transition-colors cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!selectedAssignments[key]}
                              onChange={() => setSelectedAssignments(prev => ({ ...prev, [key]: !prev[key] }))}
                              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 mt-0.5"
                            />
                            <div className="flex-1 text-sm">
                              <div className="font-medium text-slate-900">
                                {a.label || `Period ${a.period_index}`} — {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][a._day - 1] || `Day ${a._day}`}
                                {a.start_time ? ` ${a.start_time}${a.end_time ? ' - ' + a.end_time : ''}` : ''}
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

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-3">Dates (month view for selected assignments)</label>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    try {
                      const [y, m] = bulkMonth.split('-').map(x => parseInt(x))
                      const last = new Date(y, m, 0)
                      const weekdays = new Set<number>()
                      for (const a of bulkAssignments) {
                        const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
                        if (selectedAssignments[key]) weekdays.add(a._day)
                      }
                      const dates: string[] = []
                      for (let d = 1; d <= last.getDate(); d++) {
                        const dt = new Date(y, m - 1, d)
                        const isow = dt.getDay() === 0 ? 7 : dt.getDay()
                        if (weekdays.size > 0 && weekdays.has(isow)) dates.push(dt.toISOString().slice(0, 10))
                      }

                      const selectedKeys = Object.keys(selectedAssignments).filter(k => selectedAssignments[k])
                      const availableDates = dates.filter(dd => {
                        if (selectedKeys.length === 0) return true
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

                      return availableDates.map(dd => {
                        const alreadyMarkedCount = selectedKeys.filter(key => {
                          const markedDates = markedSessions[key]
                          return markedDates && markedDates.has(dd)
                        }).length

                        return (
                          <label key={dd} className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-100 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={!!bulkDateSelected[dd]}
                              onChange={() => {
                                const checking = !bulkDateSelected[dd]
                                setBulkDateSelected(prev => ({ ...prev, [dd]: !prev[dd] }))
                                if (checking) {
                                  setBulkAttendanceGrid(prev => {
                                    if (prev[dd]) return prev
                                    const next = { ...prev, [dd]: {} as Record<number, 'P' | 'A'> }
                                    for (const s of aggStudents) next[dd][s.id] = 'P'
                                    return next
                                  })
                                } else {
                                  setBulkAttendanceGrid(prev => { const next = { ...prev }; delete next[dd]; return next })
                                }
                              }}
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
                    } catch {
                      return <div />
                    }
                  })()}
                </div>
              </div>

              <div>
                {(() => {
                  const checkedDates = Object.keys(bulkDateSelected).filter(d => bulkDateSelected[d]).sort()
                  if (checkedDates.length === 0) {
                    return (
                      <>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                          Students
                          <span className="ml-2 text-sm font-normal text-slate-600">({aggStudents.length} student{aggStudents.length !== 1 ? 's' : ''})</span>
                        </label>
                        {aggLoading ? (
                          <div className="flex items-center justify-center py-6 text-slate-600">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading students...
                          </div>
                        ) : aggStudents.length === 0 ? (
                          <div className="text-center py-6 text-slate-500 text-sm">No students for selected assignments</div>
                        ) : (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                            Tick one or more dates above to mark individual attendance (P / A) per student.
                            <span className="ml-1 text-amber-600 font-medium">({aggStudents.length} student{aggStudents.length !== 1 ? 's' : ''} ready)</span>
                          </div>
                        )}
                      </>
                    )
                  }

                  return (
                    <>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <label className="text-sm font-semibold text-slate-900">
                          Attendance Grid
                          <span className="ml-2 text-sm font-normal text-slate-600">
                            {aggStudents.length} student{aggStudents.length !== 1 ? 's' : ''} x {checkedDates.length} date{checkedDates.length !== 1 ? 's' : ''}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setBulkAttendanceGrid(prev => {
                            const next = { ...prev }
                            for (const d of checkedDates) {
                              next[d] = {}
                              for (const s of aggStudents) next[d][s.id] = 'P'
                            }
                            return next
                          })}
                          className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Mark All Present
                        </button>
                      </div>
                      {aggLoading ? (
                        <div className="flex items-center justify-center py-6 text-slate-600">
                          <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading students...
                        </div>
                      ) : aggStudents.length === 0 ? (
                        <div className="text-center py-6 text-slate-500 text-sm">No students for selected assignments</div>
                      ) : (
                        <div className="border border-slate-200 rounded-lg overflow-auto max-h-72">
                          <table className="min-w-full text-sm border-collapse">
                            <thead className="sticky top-0 z-20">
                              <tr className="bg-slate-100">
                                <th className="text-left px-3 py-2 font-medium text-slate-700 whitespace-nowrap sticky left-0 bg-slate-100 z-30 min-w-[190px] border-b border-slate-200">Student</th>
                                {checkedDates.map(d => {
                                  const allP = aggStudents.every(s => (bulkAttendanceGrid[d]?.[s.id] ?? 'P') === 'P')
                                  const dt = new Date(d + 'T00:00:00')
                                  const label = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                                  return (
                                    <th key={d} className="px-1 py-1 text-center font-medium text-slate-700 min-w-[68px] border-b border-slate-200">
                                      <div className="text-xs mb-0.5">{label}</div>
                                      <button
                                        type="button"
                                        title={`Toggle all -> ${allP ? 'A' : 'P'} for ${d}`}
                                        onClick={() => setBulkAttendanceGrid(prev => {
                                          const next = { ...prev, [d]: { ...(prev[d] || {}) } }
                                          const newSt = allP ? 'A' : 'P'
                                          for (const s of aggStudents) next[d][s.id] = newSt as 'P' | 'A'
                                          return next
                                        })}
                                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${allP ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                                      >
                                        {allP ? 'All P' : 'All A'}
                                      </button>
                                    </th>
                                  )
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {aggStudents.map((s, idx) => (
                                <tr key={s.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                                  <td className={`px-3 py-1.5 whitespace-nowrap sticky left-0 z-10 text-xs border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                                    <span className="font-mono text-slate-400">{s.reg_no}</span>
                                    <span className="ml-1.5 text-slate-800 font-medium">{s.username}</span>
                                  </td>
                                  {checkedDates.map(d => {
                                    const st = bulkAttendanceGrid[d]?.[s.id] ?? 'P'
                                    return (
                                      <td key={d} className="px-1 py-1.5 text-center border-b border-slate-100">
                                        <button
                                          type="button"
                                          onClick={() => setBulkAttendanceGrid(prev => ({
                                            ...prev,
                                            [d]: { ...(prev[d] || {}), [s.id]: st === 'P' ? 'A' : 'P' }
                                          }))}
                                          className={`w-9 h-7 rounded text-xs font-bold transition-colors ${st === 'P' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                                        >
                                          {st}
                                        </button>
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex flex-wrap gap-3 rounded-b-xl">
              <button
                onClick={async () => {
                  const checkedDates = Object.keys(bulkDateSelected).filter(d => bulkDateSelected[d])
                  if (!checkedDates.length) { alert('Select at least one date'); return }

                  const assignmentsMap = new Map<string, { section_id: number; period_id: number }>()
                  for (const a of bulkAssignments) {
                    const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section?.id || a.section_id}`
                    if (!selectedAssignments[key]) continue
                    const raw_section = a.section_id || (a.section && (a.section.id || a.section.pk)) || a.section?.pk || a.section?.id
                    const raw_period = a.period_id || (a.period && (a.period.id || a.period_id)) || a.period?.id || a.period_id
                    const section_id = Number(raw_section)
                    const period_id = Number(raw_period)
                    if (!Number.isFinite(section_id) || !Number.isFinite(period_id)) continue
                    assignmentsMap.set(`${section_id}_${period_id}`, { section_id, period_id })
                  }
                  const assignments_payload = Array.from(assignmentsMap.values())
                  if (!assignments_payload.length) { alert('No assignments selected'); return }
                  if (!aggStudents.length) { alert('No students found for selected assignments'); return }

                  const date_records = checkedDates.map(date => ({
                    date,
                    records: aggStudents.map(s => ({ student_id: s.id, status: bulkAttendanceGrid[date]?.[s.id] ?? 'P' }))
                  }))

                  try {
                    const res = await fetchWithAuth('/api/academics/period-attendance/bulk-mark-statuses/', {
                      method: 'POST',
                      body: JSON.stringify({ assignments: assignments_payload, date_records })
                    })
                    if (!res.ok) {
                      let txt = 'Failed'
                      try { const j = await res.json(); txt = JSON.stringify(j) } catch (_) { try { txt = await res.text() } catch (_) {} }
                      alert('Failed: ' + txt)
                      return
                    }
                    alert('Bulk attendance saved')
                    setBulkModalOpen(false)
                  } catch (e) {
                    console.error('bulk save', e)
                    alert('Failed to save bulk attendance')
                  }
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Bulk
              </button>

              <button
                onClick={async () => {
                  const checkedDates = Object.keys(bulkDateSelected).filter(d => bulkDateSelected[d])
                  if (!checkedDates.length) { alert('Select at least one date first'); return }
                  const allAssignmentsMap = new Map<string, { section_id: number; period_id: number }>()
                  for (const a of bulkAssignments) {
                    const raw_section = a.section_id || (a.section && (a.section.id || a.section.pk)) || a.section?.pk || a.section?.id
                    const raw_period = a.period_id || (a.period && (a.period.id || a.period_id)) || a.period?.id || a.period_id
                    const section_id = Number(raw_section)
                    const period_id = Number(raw_period)
                    if (!Number.isFinite(section_id) || !Number.isFinite(period_id)) continue
                    allAssignmentsMap.set(`${section_id}_${period_id}`, { section_id, period_id })
                  }
                  const all_assignments = Array.from(allAssignmentsMap.values())
                  if (!all_assignments.length) { alert('No assignments available'); return }
                  try {
                    const res = await fetchWithAuth('/api/academics/period-attendance/bulk-mark-range/', {
                      method: 'POST',
                      body: JSON.stringify({ assignments: all_assignments, dates: checkedDates, status: 'P', student_ids: [] })
                    })
                    if (!res.ok) {
                      let txt = 'Failed'
                      try { const j = await res.json(); txt = JSON.stringify(j) } catch (_) { try { txt = await res.text() } catch (_) {} }
                      alert('Failed: ' + txt)
                      return
                    }
                    alert('All assignments marked present')
                    setBulkModalOpen(false)
                  } catch (e) {
                    console.error('all assignments present', e)
                    alert('Failed to save')
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                All Assignments Present
              </button>

              <button
                onClick={() => setBulkModalOpen(false)}
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

      {/* Half-Day Request Modal */}
      {showHalfDayRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-slate-900">Request Period Attendance Access</h3>
              </div>
              <button
                onClick={() => setShowHalfDayRequestModal(false)}
                className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            
            <div className="p-6 flex-1">
              <div className="mb-4">
                <p className="text-sm text-slate-600 mb-4">
                  Submit a request to your HOD/AHOD for period attendance access on <strong>{date}</strong>. Once approved, you'll be able to mark student attendance for your periods.
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Reason for Request <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={halfDayRequestReason}
                  onChange={(e) => setHalfDayRequestReason(e.target.value)}
                  placeholder="Please explain why you need period attendance access..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  rows={4}
                  disabled={submittingHalfDayRequest}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-800">
                    Your HOD/AHOD will review this request. You'll be notified once it's approved or rejected.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex gap-3">
              <button
                onClick={() => setShowHalfDayRequestModal(false)}
                className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                disabled={submittingHalfDayRequest}
              >
                Cancel
              </button>
              <button
                onClick={submitHalfDayRequest}
                disabled={!halfDayRequestReason.trim() || submittingHalfDayRequest}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {submittingHalfDayRequest && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      <AttendanceAssignmentRequestsModal
        isOpen={showRequestsModal}
        onClose={() => setShowRequestsModal(false)}
        onRequestUpdated={() => { fetchAllPendingRequests() }}
      />
    </div>
  )
}
