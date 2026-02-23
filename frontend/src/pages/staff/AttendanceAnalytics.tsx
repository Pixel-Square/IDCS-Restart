import React, { useEffect, useState } from 'react'
import { Lock, Unlock, RefreshCw, Check, X, Calendar, Clock, Users, BarChart3, FileText, Eye, CheckCircle2, XCircle, AlertCircle, TrendingUp, Building2, GraduationCap, Loader2, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react'
import fetchWithAuth from '../../services/fetchAuth'
import AttendanceRequests from './AttendanceRequests'

interface PeriodStat {
  session_id: number
  period_index?: number
  period_label?: string
  section_id?: number
  section_name?: string
  is_locked?: boolean
}

interface TodayPeriods {
  date: string
  total_periods: number
  periods: PeriodStat[]
}

const AttendanceAnalytics: React.FC = () => {
  const [periodLoading, setPeriodLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState<string>(new Date().toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().split('T')[0])
  const [dateMode, setDateMode] = useState<'today' | 'range' | 'complete'>('today')
  const date = dateFrom  // single-date alias used by section-report, today-periods, student-day etc.
  const dateModeParams = dateMode === 'complete' ? 'complete=true' : `date_from=${dateFrom}&date_to=${dateTo}`
  const [todayPeriods, setTodayPeriods] = useState<TodayPeriods | null>(null)
  const [assignedLoading, setAssignedLoading] = useState(false)
  const [assignedPeriods, setAssignedPeriods] = useState<any[]>([])
  const [mergedAssigned, setMergedAssigned] = useState<any[]>([])
  const [overallLoading, setOverallLoading] = useState(false)
  const [overallSections, setOverallSections] = useState<any[]>([])
  const [overallBatchMissingCount, setOverallBatchMissingCount] = useState(0)
  const [showOverallSample, setShowOverallSample] = useState(false)
  const [permissionLevel, setPermissionLevel] = useState<string | null>(null)

  // ── Overall view filters ────────────────────────────────────────────────────
  const [showOverallFilters, setShowOverallFilters] = useState(false)
  const [overallFilterDepts, setOverallFilterDepts] = useState<Set<string>>(new Set())
  const [overallFilterBatches, setOverallFilterBatches] = useState<Set<string>>(new Set())
  const [overallFilterSections, setOverallFilterSections] = useState<Set<string>>(new Set())
  const [overallFilterLowPct, setOverallFilterLowPct] = useState<string>('')
  // ── Department view filters ─────────────────────────────────────────────────
  const [showDeptFilters, setShowDeptFilters] = useState(false)
  const [deptFilterBatches, setDeptFilterBatches] = useState<Set<string>>(new Set())
  const [deptFilterSections, setDeptFilterSections] = useState<Set<string>>(new Set())
  const [deptFilterLowPct, setDeptFilterLowPct] = useState<string>('')
  const [viewMode, setViewMode] = useState<'overall'|'department'|'assigned'|'section'|'myclass'>('assigned')
  const [departmentLoading, setDepartmentLoading] = useState(false)
  const [departmentSections, setDepartmentSections] = useState<any[]>([])
  const [sectionLoading, setSectionLoading] = useState(false)
  const [sectionReport, setSectionReport] = useState<any | null>(null)
  const [myClassLoading, setMyClassLoading] = useState(false)
  const [myClassSections, setMyClassSections] = useState<any[]>([])
  const [myClassDailyAttendance, setMyClassDailyAttendance] = useState<Record<number, any>>({})
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [unlockRequests, setUnlockRequests] = useState<any[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [completedRequests, setCompletedRequests] = useState<Record<string, string>>({})
  const [showRequestsModal, setShowRequestsModal] = useState(false)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportData, setReportData] = useState<any | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  // ── Student-day expansion ───────────────────────────────────────────────────
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [studentDayCache, setStudentDayCache] = useState<Record<string, { loading: boolean; data: any[]; isRange?: boolean }>>({})

  function toggleExpand(key: string, sectionId: number | null, sessionId?: number | null) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key); return next }
      next.add(key)
      // fetch if not yet cached
      if (!studentDayCache[key]) fetchStudentDay(key, sectionId, sessionId)
      return next
    })
  }

  async function fetchStudentDay(key: string, sectionId: number | null, sessionId?: number | null) {
    if (!sectionId) return
    setStudentDayCache(c => ({ ...c, [key]: { loading: true, data: [], isRange: dateMode !== 'today' } }))
    try {
      let url = `/api/academics/analytics/section-student-day/?section_id=${sectionId}&${dateModeParams}`
      if (sessionId) url += `&session_id=${sessionId}`
      const res = await fetchWithAuth(url)
      if (res.ok) {
        const json = await res.json()
        setStudentDayCache(c => ({ ...c, [key]: { loading: false, data: json.students || [], isRange: json.is_range ?? (dateMode !== 'today') } }))
      } else {
        setStudentDayCache(c => ({ ...c, [key]: { loading: false, data: [], isRange: dateMode !== 'today' } }))
      }
    } catch {
      setStudentDayCache(c => ({ ...c, [key]: { loading: false, data: [], isRange: dateMode !== 'today' } }))
    }
  }

  function StudentDayTable({ cacheKey, colSpan }: { cacheKey: string; colSpan: number }) {
    const entry = studentDayCache[cacheKey]
    if (!entry) return null
    if (entry.loading) return (
      <tr><td colSpan={colSpan} className="px-4 py-3 text-center"><Loader2 className="w-4 h-4 animate-spin inline text-indigo-500" /></td></tr>
    )
    if (!entry.data.length) return (
      <tr><td colSpan={colSpan} className="px-4 py-3 text-center text-xs text-gray-500">No attendance data for the selected {entry.isRange ? 'range' : 'date'}</td></tr>
    )
    const isRange = entry.isRange
    const dailyBadge: Record<string, string> = { P: 'bg-green-100 text-green-700', A: 'bg-red-100 text-red-700', OD: 'bg-blue-100 text-blue-700', LATE: 'bg-amber-100 text-amber-700', LEAVE: 'bg-purple-100 text-purple-700' }
    const pctBadge = (p: number | null) => p === null ? 'bg-gray-100 text-gray-500' : p >= 75 ? 'bg-green-100 text-green-700' : p >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-3 bg-slate-50">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Reg No</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Name</th>
                  {isRange ? (
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Daily (P / L days)</th>
                  ) : (
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Daily</th>
                  )}
                  <th className="px-3 py-2 text-center font-semibold text-gray-600">Daily %</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-600">Periods (P/Total)</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-600">{isRange ? 'Period %' : 'Today %'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entry.data.map((s: any) => {
                  const dailyPresent = s.daily_present_days ?? 0
                  const dailyAbsent = s.daily_absent_days ?? 0
                  const dailyLeave = s.daily_leave_days ?? 0
                  const dailyTotal = dailyPresent + dailyAbsent + dailyLeave
                  const dailyPct = isRange
                    ? (dailyTotal > 0 ? Math.round((dailyPresent / dailyTotal) * 100) : null)
                    : (s.daily_status ? (['P','OD','LATE'].includes(s.daily_status) ? 100 : 0) : null)
                  return (
                  <tr key={s.student_id} className="hover:bg-white">
                    <td className="px-3 py-1.5 font-mono text-gray-700">{s.reg_no}</td>
                    <td className="px-3 py-1.5 text-gray-800">{s.name}</td>
                    <td className="px-3 py-1.5 text-center">
                      {isRange ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">{dailyPresent}P</span>
                          {dailyLeave > 0 && <span className="inline-flex px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">{dailyLeave}L</span>}
                        </span>
                      ) : s.daily_status ? (
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${dailyBadge[s.daily_status] || 'bg-gray-100 text-gray-600'}`}>
                          {s.daily_status}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {dailyPct !== null ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${pctBadge(dailyPct)}`}>
                          {dailyPct}%
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center text-gray-700">
                      {s.total_periods > 0 ? `${s.present_periods}/${s.total_periods}` : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {s.percentage !== null ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${pctBadge(s.percentage)}`}>
                          {s.percentage}%
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    )
  }

  // Safe formatter: render strings/numbers directly; pick common display fields from objects
  const formatValue = (v: any) => {
    if (v === null || v === undefined) return '-'
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
    if (Array.isArray(v)) return v.join(', ')
    if (typeof v === 'object') {
      return (
        v.username || v.name || v.display || v.section_name || v.label || v.id || v.staff_name || JSON.stringify(v)
      )
    }
    return String(v)
  }

  const normalizeStatus = (s: any) => {
    if (s === null || s === undefined) return 'pending'
    if (typeof s === 'string' || typeof s === 'number' || typeof s === 'boolean') return String(s).toLowerCase()
    if (typeof s === 'object') {
      if ('status' in s) return String((s as any).status).toLowerCase()
      if ('action' in s) return String((s as any).action).toLowerCase()
      // try common keys
      if ('approved' in s) return (s as any).approved ? 'approved' : 'rejected'
      return JSON.stringify(s).toLowerCase()
    }
    return String(s).toLowerCase()
  }

  const getPeriodDisplay = (r: any) => {
    // Prefer explicit period_index/number when available
    const num = r.period_index ?? r.period_number ?? r.period?.index ?? r.period?.number ?? r.session?.period_index ?? r.session?.period_number ?? r.attendance_session?.period_index ?? r.attendance_session?.period_number
    if (num !== undefined && num !== null && String(num).trim() !== '') return `Period ${num}`

    // If a label already contains 'Period X', extract it from common fields (session_display often contains it)
    const labelCandidates = [r.period_label, r.period?.label, r.session?.period_label, r.attendance_session?.period_label, r.session_display, r.session?.display, r.session_label, r.session?.label]
    for (const cand of labelCandidates) {
      if (!cand) continue
      const s = String(cand)
      const m = s.match(/\bPeriod\s*\(?\s*(\d+)\s*\)?/i)
      if (m && m[1]) return `Period ${m[1]}`
    }

    // As a last resort, if any candidate is a short label, return it trimmed
    for (const cand of labelCandidates) {
      if (!cand) continue
      const s = String(cand).trim()
      if (s.length && s.length < 60) return s
    }

    return '-' 
  }

  const getSectionDisplay = (s: any) => {
    if (!s) return ''
    const extract = (v: any) => {
      if (v === null || v === undefined) return ''
      if (typeof v === 'string' || typeof v === 'number') return String(v)
      if (typeof v === 'object') return v.name || v.display || v.label || v.year || v.academic_year || ''
      return String(v)
    }
    const dept = extract(s.department_short ?? s.department_name ?? s.department ?? s.dept)
    const batch = extract(s.batch ?? s.batch_name ?? s.academic_year ?? s.batch_label ?? s.batch_year)
    const section = extract(s.section_name ?? s.section ?? s.name)
    let out = ''
    if (dept) out += dept
    if (batch) out += (out ? ' - ' : '') + batch
    if (section) out += (batch ? ' / ' : (out ? ' / ' : '')) + section
    return out || ''
  }

  useEffect(() => { loadTodayPeriods() }, [date])
  useEffect(() => { loadAssignedPeriods() }, [date])
  useEffect(() => { loadOverallSections() }, [dateFrom, dateTo, dateMode])
  useEffect(() => { loadDepartmentSections() }, [dateFrom, dateTo, dateMode])
  useEffect(() => { if (permissionLevel === 'class') loadMyClassSections() }, [dateFrom, dateTo, dateMode, permissionLevel])
  useEffect(() => { if (permissionLevel === 'all' || permissionLevel === 'department') loadUnlockRequests() }, [permissionLevel])
  useEffect(() => {
    // clear expansion cache when date range changes
    setExpandedRows(new Set())
    setStudentDayCache({})
  }, [dateFrom, dateTo])
  useEffect(() => {
    // derive pending session ids from unlockRequests so UI buttons reflect pending state
    const ids = (unlockRequests || []).map((r: any) => r.session || r.attendance_session || r.session_id || r.sessionId || r.attendance_session_id).filter(Boolean)
    setPendingRequests(ids)
  }, [unlockRequests])
  useEffect(() => { loadAnalyticsFilters() }, [])

  useEffect(() => {
    // choose sensible default view based on permissions
    if (!permissionLevel) return
    if (permissionLevel === 'all') setViewMode('overall')
    else if (permissionLevel === 'department') setViewMode('department')
    else if (permissionLevel === 'class') setViewMode('myclass')
    else setViewMode('assigned')
  }, [permissionLevel])

  async function loadAnalyticsFilters(){
    try{
      const res = await fetchWithAuth('/api/academics/analytics/filters/')
      if (!res.ok) return setPermissionLevel(null)
      const data = await res.json().catch(()=>null)
      setPermissionLevel(data?.permission_level || null)
    }catch(e){ console.error('Failed to load analytics filters', e); setPermissionLevel(null) }
  }

  

  async function loadTodayPeriods(){
    setPeriodLoading(true)
    try{
      const res = await fetchWithAuth(`/api/academics/analytics/today-periods/?date=${date}`)
      const data = await res.json().catch(()=>null)
      if (res.ok) setTodayPeriods(data)
      else setTodayPeriods(null)
    }catch(e){ console.error('Failed to load today periods', e); setTodayPeriods(null) }
    finally{ setPeriodLoading(false) }
  }

  async function loadAssignedPeriods(){
    setAssignedLoading(true)
    try{
      const res = await fetchWithAuth(`/api/academics/staff/periods/?date=${date}`)
      const data = await res.json().catch(()=>({ results: [] }))
      if (res.ok) setAssignedPeriods(data.results || [])
      else setAssignedPeriods([])
    }catch(e){ console.error('Failed to load assigned periods', e); setAssignedPeriods([]) }
    finally{ setAssignedLoading(false) }
  }

  // compute mergedAssigned and fetch elective student mappings where applicable
  useEffect(() => {
    const m = mergedAssignedPeriods(assignedPeriods)
    setMergedAssigned(m)

    let cancelled = false
    const fetchElectiveCounts = async () => {
      for (let i = 0; i < m.length; i++) {
        const row = m[i]
        const electiveId = row.elective_subject_id || row.elective_subject?.id
        if (!electiveId) continue
        try {
          const res = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${encodeURIComponent(String(electiveId))}&page_size=0`)
          if (!res.ok) continue
          const d = await res.json().catch(()=>({ results: [] }))
          const list = d.results || d || []
          // Attempt to infer student id from common keys
          const ids = new Set<any>()
          for (const it of list) {
            if (it.student_id) ids.add(it.student_id)
            else if (it.student && (typeof it.student === 'object') && (it.student.id)) ids.add(it.student.id)
            else if (it.id) ids.add(it.id)
          }
          if (cancelled) return
          if (ids.size) row.total_strength = ids.size
          else row.total_strength = list.length
        } catch (e) { /* ignore */ }
      }
      // After elective counts, compute attendance-based stats from period-attendance records
      for (let i = 0; i < m.length; i++) {
        const row = m[i]
        try {
          // collect session ids
          const sessIds: any[] = []
          if (row._session_ids && row._session_ids.size) sessIds.push(...Array.from(row._session_ids))
          if (row.attendance_session_id) sessIds.push(row.attendance_session_id)
          if (row.attendance_session_ids && Array.isArray(row.attendance_session_ids)) sessIds.push(...row.attendance_session_ids)
          // unique
          const uniqueSess = Array.from(new Set(sessIds.filter(Boolean)))
          if (uniqueSess.length === 0) continue
          // fetch records for all sessions and compute latest status per student
          const statusMap: Record<string,string> = {}
          for (const sid of uniqueSess) {
            try{
              const r = await fetchWithAuth(`/api/academics/period-attendance/${sid}/`)
              if (!r.ok) continue
              const j = await r.json().catch(()=>null)
              if (!j || !Array.isArray(j.records)) continue
              for (const rec of j.records) {
                const sidKey = rec.student_pk || (rec.student && (rec.student.id || rec.student.pk)) || rec.student_id || rec.id || null
                if (!sidKey) continue
                // use status from record (fallback to r.status or r.attendance)
                const s = (rec.status || rec.attendance || rec.type || '')
                if (!s) continue
                // later sessions override earlier
                statusMap[String(sidKey)] = String(s)
              }
            }catch(e){ /* ignore fetch errors per session */ }
          }
          // compute counts from statusMap
          let present = 0, absent = 0, on_duty = 0, late = 0, leave = 0
          const studentsSet = new Set<string>()
          for (const [stu, st] of Object.entries(statusMap)){
            studentsSet.add(stu)
            const ss = String(st).toLowerCase()
            if (ss === 'p' || ss === 'present') present++
            else if (ss === 'a' || ss === 'absent') absent++
            else if (ss === 'od' || ss.includes('on_duty') || ss.includes('on-duty')) { on_duty++; present++ }
            else if (ss === 'leave' || ss.includes('leave')) leave++
            else if (ss === 'late' || ss.includes('late')) { late++; present++ }
            else if (ss.includes('absent')) absent++
            else if (ss.includes('present')) present++
            else {
              // fallback: consider non-empty as present
              if (ss) present++
            }
          }
          // If we have computed student-level stats, assign them
          if (studentsSet.size > 0) {
            row.present = present
            row.absent = absent
            row.on_duty = on_duty
            row.late = late
            row.leave = leave
            row.total_strength = studentsSet.size
          }
        } catch(e) { /* ignore per-row attendance errors */ }
      }
      if (!cancelled) setMergedAssigned([...m])
    }
    fetchElectiveCounts()
    return () => { cancelled = true }
  }, [assignedPeriods])

  // Merge assigned periods that share the same period and same subject (multi-section same subject)
  const mergedAssignedPeriods = (items: any[]) => {
    if (!items || !items.length) return []
    const map = new Map<string, any>()
    for (const p of items) {
      const periodKey = (p.period && (p.period.index ?? p.period.number ?? p.period.id)) ?? (p.period_index ?? p.period_number) ?? p.period?.label ?? String(p.period?.id || '')
      const subjKey = String(p.subject_display || p.subject || p.subject_text || p.subject_name || '').trim().toLowerCase()
      const key = `${periodKey}||${subjKey}`
      if (!map.has(key)) {
        // clone to avoid mutating original
        const sid = p.attendance_session_id || p.attendance_session?.id || p.session_id || p.session?.id
        // try to extract student id list if present on payload
        const extractIds = (obj:any) => {
          if (!obj) return null
          if (Array.isArray(obj)) return obj
          return null
        }
        let initialStudentIds: Set<any> | null = null
        const candidateArrays = ['student_ids','students','student_list','students_list','studentIds']
        for (const f of candidateArrays) {
          if (Array.isArray((p as any)[f])) {
            initialStudentIds = new Set((p as any)[f].map((x:any) => typeof x === 'object' ? (x.id || x.student_id || x) : x))
            break
          }
        }
        map.set(key, { ...p, _merged_count: 1, _session_ids: new Set([sid].filter(Boolean)), _student_ids: initialStudentIds })
      } else {
        const cur = map.get(key)
        cur._merged_count = (cur._merged_count || 1) + 1
        // sum numeric attendance fields (treat null/undefined as 0)
        cur.present = (Number(cur.present) || 0) + (Number(p.present) || 0)
        cur.absent = (Number(cur.absent) || 0) + (Number(p.absent) || 0)
        cur.on_duty = (Number(cur.on_duty) || 0) + (Number(p.on_duty) || 0)
        cur.leave = (Number(cur.leave) || 0) + (Number(p.leave) || 0)
        // For total_strength, prefer student-id union when available; otherwise take max section size (do not sum)
        const sid = p.attendance_session_id || p.attendance_session?.id || p.session_id || p.session?.id
        // merge student id lists if present
        const candidateArrays = ['student_ids','students','student_list','students_list','studentIds']
        let incomingIds: Set<any> | null = null
        for (const f of candidateArrays) {
          if (Array.isArray((p as any)[f])) {
            incomingIds = new Set((p as any)[f].map((x:any) => typeof x === 'object' ? (x.id || x.student_id || x) : x))
            break
          }
        }
        if (incomingIds) {
          if (!cur._student_ids) cur._student_ids = new Set()
          incomingIds.forEach((id:any)=> cur._student_ids.add(id))
        }
        // if no student id lists, use max of section totals
        cur.total_strength = Math.max(Number(cur.total_strength) || 0, Number(p.total_strength) || 0)
        cur.attendance_session_locked = Boolean(cur.attendance_session_locked) || Boolean(p.attendance_session_locked)
        if (sid) cur._session_ids.add(sid)
        // prefer a non-empty subject_display
        cur.subject_display = cur.subject_display || p.subject_display || p.subject || p.subject_text || p.subject_name
        map.set(key, cur)
      }
    }
    // finalize merged items: if multiple different session ids present, set attendance_session_id to null so actions are disabled
    const out = Array.from(map.values()).map((it:any) => {
      const sessionIds = Array.from(it._session_ids || [])
      if (sessionIds.length === 1) it.attendance_session_id = sessionIds[0]
      else it.attendance_session_id = null
      // If we have accumulated student ids, set total_strength to unique count
      if (it._student_ids && it._student_ids.size) {
        it.total_strength = it._student_ids.size
      }
      return it
    })
    return out
  }

  async function loadOverallSections(){
    setOverallLoading(true)
    try{
      const res = await fetchWithAuth(`/api/academics/analytics/overall-section/?${dateModeParams}`)
      if (!res.ok) {
        // permission denied or not available
        setOverallSections([])
        setOverallLoading(false)
        return
      }
      const data = await res.json().catch(()=>({ sections: [] }))
      let sections = data.sections || []
      
      setOverallSections(sections)
      console.debug('loadOverallSections: sections loaded', sections.slice(0,5))
      
      // count how many entries appear to be missing batch information
      const missing = (sections || []).filter((s: any) => !(s.batch || s.batch_name || s.academic_year || (s.academic_year && (s.academic_year.name || s.academic_year.display)))).length
      setOverallBatchMissingCount(missing)
      
    }catch(e){ console.error('Failed to load overall sections', e); setOverallSections([]) }
    finally{ setOverallLoading(false) }
  }

  async function loadDepartmentSections(){
    setDepartmentLoading(true)
    try{
      const res = await fetchWithAuth(`/api/academics/analytics/overall-section/?${dateModeParams}`)
      if (!res.ok) {
        setDepartmentSections([])
        setDepartmentLoading(false)
        return
      }
      const data = await res.json().catch(()=>({ sections: [] }))
      let sections = data.sections || []
      
      setDepartmentSections(sections)
      console.debug('loadDepartmentSections: sections loaded', sections.slice(0,5))
    }catch(e){ console.error('Failed to load department sections', e); setDepartmentSections([]) }
    finally{ setDepartmentLoading(false) }
  }

  async function loadMyClassSections(){
    setMyClassLoading(true)
    try{
      const res = await fetchWithAuth(`/api/academics/attendance-analytics/?${dateModeParams}&view_mode=class`)
      if (!res.ok) {
        setMyClassSections([])
        setMyClassDailyAttendance({})
        setMyClassLoading(false)
        return
      }
      const data = await res.json().catch(()=>({ sections: [], daily_attendance: {} }))
      let sections = data.sections || []
      let dailyAttendance = data.daily_attendance || {}
      
      setMyClassSections(sections)
      setMyClassDailyAttendance(dailyAttendance)
      console.debug('loadMyClassSections: sections loaded', sections.slice(0,5))
      console.debug('loadMyClassSections: daily attendance loaded', dailyAttendance)
    }catch(e){ console.error('Failed to load my class sections', e); setMyClassSections([]); setMyClassDailyAttendance({}) }
    finally{ setMyClassLoading(false) }
  }

  async function loadUnlockRequests(){
    setUnlockLoading(true)
    try{
      const res = await fetchWithAuth('/api/academics/unified-unlock-requests/')
      if (!res.ok) { setUnlockRequests([]); setUnlockLoading(false); return }
      const data = await res.json().catch(()=>({ results: [] }))
      setUnlockRequests(data.results || data || [])
    }catch(e){ console.error('Failed to load unlock requests', e); setUnlockRequests([]) }
    finally{ setUnlockLoading(false) }
  }

  // Open report card modal: fetch session records and aggregate counts + regno lists
  async function openReportCard(row: any) {
    setReportLoading(true)
    try {
      const sessIds: any[] = []
      if (row._session_ids && row._session_ids.size) sessIds.push(...Array.from(row._session_ids))
      if (row.attendance_session_id) sessIds.push(row.attendance_session_id)
      if (row.attendance_session_ids && Array.isArray(row.attendance_session_ids)) sessIds.push(...row.attendance_session_ids)
      const uniqueSess = Array.from(new Set(sessIds.filter(Boolean)))
      const isDailyAttendance = row.is_daily_attendance === true

      // prepare student regno mapping from sections or elective choices
      const studentRegMap: Record<string,string> = {}
      if (Array.isArray(row.section_ids) && row.section_ids.length) {
        const tasks = row.section_ids.map((sid: any) => fetchWithAuth(`/api/academics/sections/${sid}/students/`).then(r=> r.ok ? r.json() : { results: [] }).catch(()=>({ results: [] })))
        const settled = await Promise.allSettled(tasks)
        for (const s of settled) {
          if (s.status !== 'fulfilled') continue
          const data = s.value || {}
          const list = data.results || data.students || []
          for (const st of list) {
            const id = st.id || st.student_id || st.pk
            const reg = st.reg_no || st.regno || st.registration_number || st.roll_no || st.rollno || st.reg || null
            if (id && reg) studentRegMap[String(id)] = String(reg)
          }
        }
      }
      // if elective, try to fetch elective-choices mapping
      const electiveId = row.elective_subject_id || row.elective_subject?.id
      if (electiveId) {
        try{
          const eres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${encodeURIComponent(String(electiveId))}&page_size=0`)
          if (eres.ok){ const ej = await eres.json().catch(()=>({ results: [] })); const list = ej.results || ej || []
            for (const it of list) {
              const stud = it.student || it.student_info || it || null
              if (!stud) continue
              const id = stud.id || stud.student_id || it.student_id || it.id
              const reg = stud.reg_no || stud.regno || stud.registration_number || stud.roll_no || it.reg_no || it.regno || null
              if (id && reg) studentRegMap[String(id)] = String(reg)
            }
          }
        }catch(e){/* ignore */}
      }

      // aggregate across sessions
      let present = 0, absent = 0, od = 0, late = 0, leave = 0
      const absentRegs = new Set<string>()
      const odRegs = new Set<string>()
      const leaveRegs = new Set<string>()
      let reportDate: string | null = row.date || null

      for (const sid of uniqueSess) {
        try {
          const endpoint = isDailyAttendance 
            ? `/api/academics/analytics/daily-attendance/${sid}/`
            : `/api/academics/period-attendance/${sid}/`
          const r = await fetchWithAuth(endpoint)
          if (!r.ok) continue
          const j = await r.json().catch(()=>null)
          if (!j || !Array.isArray(j.records)) continue
          if (!reportDate) reportDate = j.date || j.session_date || j.attendance_session?.date || null
          for (const rec of j.records) {
            const sidKey = rec.student_pk || (rec.student && (rec.student.id || rec.student.pk)) || rec.student_id || rec.id || null
            if (!sidKey) continue
            const sraw = rec.student || {}
            // Prioritize registration number from multiple sources
            let reg: string | null = rec.reg_no || rec.regno || sraw.reg_no || sraw.regno || sraw.registration_number || sraw.roll_no || null
            // Fallback to student reg map if not found in record
            if (!reg && sidKey && studentRegMap[String(sidKey)]) {
              reg = studentRegMap[String(sidKey)]
            }
            // reg may be null — still count the status, just can't list by regno
            
            const status = String(rec.status || rec.attendance || rec.type || '').toLowerCase()
            if (status === 'p' || status === 'present') present++
            else if (status === 'a' || status === 'absent') { absent++; if (reg) absentRegs.add(String(reg)) }
            else if (status === 'od' || status.includes('on_duty') || status.includes('on-duty')) { od++; if (reg) odRegs.add(String(reg)); present++ }
            else if (status === 'leave') { leave++; if (reg) leaveRegs.add(String(reg)) }
            else if (status === 'late') { late++; present++ }
            else if (status.includes('absent')) { absent++; if (reg) absentRegs.add(String(reg)) }
            else if (status.includes('od') || status.includes('on_duty')) { od++; if (reg) odRegs.add(String(reg)); present++ }
            else if (status.includes('leave')) { leave++; if (reg) leaveRegs.add(String(reg)) }
            else if (status.includes('late')) { late++; present++ }
            else if (status.includes('present') || status === 'p') present++
            else {
              if (status) present++
            }
          }
        } catch (e) { /* ignore per-session errors */ }
      }

      // derive course code/name
      const courseCode = row.course_code || row.subject_code || row.curriculum_row?.course_code || row.subject_batch?.course_code || ''
      const courseName = row.subject_display || row.subject || row.subject_name || row.curriculum_row?.course_name || ''
      const periodDisplay = getPeriodDisplay(row)

      const last8 = (s: string) => s ? (s.length > 8 ? s.slice(-8) : s) : s
      setReportData({ courseCode, courseName, period: periodDisplay, date: reportDate, present, absent, od, late, leave, absentRegs: Array.from(absentRegs).map((r:any)=> last8(String(r))), odRegs: Array.from(odRegs).map((r:any)=> last8(String(r))), leaveRegs: Array.from(leaveRegs).map((r:any)=> last8(String(r))) })
      setReportModalOpen(true)
    } catch (e) {
      console.error('openReportCard error', e)
      setReportData({ courseCode: '', courseName: row.subject_display || row.subject || '', period: getPeriodDisplay(row), date: row.date || null, present: 0, absent: 0, od: 0, late: 0, leave: 0, absentRegs: [], odRegs: [], leaveRegs: [] })
      setReportModalOpen(true)
    } finally {
      setReportLoading(false)
    }
  }

  

  async function performAction(id: number, action: 'approve'|'reject', requestType?: string){
    // Use unified endpoint with request type information
    try{
      // Get the request to find its type if not provided
      const request = unlockRequests.find(r => r.id === id)
      const request_type = requestType || request?.request_type || 'period'
      
      const body = { 
        id: id, 
        action: action, 
        request_type: request_type 
      }
      const res = await fetchWithAuth('/api/academics/unified-unlock-requests/', { 
        method: 'PATCH', 
        body: JSON.stringify(body) 
      })
      
      if (res.ok) {
        setUnlockRequests((prev:any[]) => prev.filter(r => String(r.id) !== String(id)))
        setCompletedRequests(prev => ({ ...prev, [String(id)]: action }))
        await loadOverallSections(); await loadAssignedPeriods(); 
        if (permissionLevel === 'class') await loadMyClassSections();
        return true
      }
      const j = await res.json().catch(()=>({}))
      alert('Action failed: ' + (j.detail || res.status))
      return false
    }catch(e){ console.error(e); alert('Failed to perform action'); return false }
  }

  async function approveRequest(id?: number){
    if (!id) return
    if (!confirm('Approve this unlock request?')) return
    setUnlockLoading(true)
    await performAction(id, 'approve')
    setUnlockLoading(false)
  }

  async function rejectRequest(id?: number){
    if (!id) return
    if (!confirm('Reject this unlock request?')) return
    setUnlockLoading(true)
    await performAction(id, 'reject')
    setUnlockLoading(false)
  }

  const requestUnlock = async (sessionId?: number) => {
    if (!sessionId) return alert('No session available')
    // ask the user for a reason/note so approvers can see it
    const note = prompt('Please provide a reason for the unlock request (optional):', '')
    if (note === null) return // user cancelled
    if (!confirm('Submit unlock request for this session?')) return
    try{
      const res = await fetchWithAuth('/api/academics/attendance-unlock-requests/', {
        method: 'POST',
        body: JSON.stringify({ session: sessionId, note: note || '' })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        if (res.status === 400 && j.detail && String(j.detail).includes('already pending')) {
          alert('An unlock request for this session is already pending.')
        } else {
          alert('Failed to create unlock request: ' + (j.detail || res.status))
        }
        return
      }
      // refresh pending requests so buttons update to "Pending"
      await loadUnlockRequests()
      alert('Unlock request submitted successfully')
    }catch(e){ console.error(e); alert('Failed to submit request') }
  }

  async function openSectionReport(sectionId?: number){
    if (!sectionId) return
    setSectionLoading(true)
    setSectionReport(null)
    try{
      const res = await fetchWithAuth(`/api/academics/analytics/class-report/?section_id=${sectionId}&date=${date}`)
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        alert('Failed to load section report: ' + (j.detail || res.status))
        setSectionLoading(false)
        return
      }
      const data = await res.json().catch(()=>null)
      setSectionReport(data)
      setViewMode('section')
    }catch(e){ console.error('Failed to load section report', e); alert('Failed to load section report') }
    finally{ setSectionLoading(false) }
  }

  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance Analytics</h1>
            <p className="text-sm text-gray-600">View and manage attendance data across sections and periods</p>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-500 shrink-0" />
            {viewMode === 'assigned' ? (
              /* Assigned view: single date only */
              <input
                type="date"
                value={dateFrom}
                onChange={e => { const v = e.target.value; setDateFrom(v); setDateTo(v); setExpandedRows(new Set()); setStudentDayCache({}) }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            ) : (
              <>
            {/* Mode buttons */}
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              {(['today', 'range', 'complete'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => {
                    setDateMode(mode)
                    if (mode === 'today') {
                      const t = new Date().toISOString().split('T')[0]
                      setDateFrom(t); setDateTo(t)
                    }
                    setExpandedRows(new Set())
                    setStudentDayCache({})
                  }}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    dateMode === mode
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            {/* Date pickers — only in range mode */}
            {dateMode === 'range' && (
              <>
                <label className="text-sm font-medium text-gray-700 shrink-0">From:</label>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={e => { setDateFrom(e.target.value); setExpandedRows(new Set()); setStudentDayCache({}) }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <label className="text-sm font-medium text-gray-700 shrink-0">To:</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={e => { setDateTo(e.target.value); setExpandedRows(new Set()); setStudentDayCache({}) }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </>
            )}
            {dateMode === 'today' && (
              <span className="text-sm text-gray-500">{dateFrom}</span>
            )}
              </>
            )}
          </div>
          { (permissionLevel === 'all' || permissionLevel === 'department') && (
            <button 
              onClick={() => { loadUnlockRequests(); setShowRequestsModal(true); }} 
              className="relative px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Lock className="w-4 h-4" />
              Unlock Requests
              {unlockRequests.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-white text-indigo-700">
                  {unlockRequests.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {periodLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-600">Loading attendance data...</p>
          </div>
        </div>
      )}

      {/* Unlock requests are shown only via the Requests modal (button at header) */}

      {/* Navigation Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex items-center gap-1">
          { permissionLevel === 'all' && (
            <button
              onClick={() => setViewMode('overall')}
              className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
                viewMode==='overall' 
                  ? 'border-indigo-600 text-indigo-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Overall
            </button>
          )}
          { permissionLevel === 'department' && (
            <button
              onClick={() => setViewMode('department')}
              className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
                viewMode==='department' 
                  ? 'border-indigo-600 text-indigo-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Building2 className="w-4 h-4" />
              My Department
            </button>
          )}
          { permissionLevel === 'class' && (
            <button
              onClick={() => setViewMode('myclass')}
              className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
                viewMode==='myclass' 
                  ? 'border-indigo-600 text-indigo-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Users className="w-4 h-4" />
              My Class
            </button>
          )}
          <button
            onClick={() => {
              const t = new Date().toISOString().split('T')[0]
              setDateFrom(t); setDateTo(t)
              setDateMode('today')
              setViewMode('assigned')
            }}
            className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
              viewMode==='assigned' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            My Assigned
          </button>
        </div>
      </div>

      {viewMode === 'overall' && !overallLoading && overallSections && overallSections.length > 0 ? (() => {
        // Group by department short name + batch + section - backend now returns ONLY Period 1 data
        const map: Record<string, any> = {}
        const extractDeptShort = (s: any) => s.department_short || s.department?.short_name || s.department?.code || s.department_name || s.dept || (s.department && (s.department.display || s.department.name)) || 'Unknown'
        const extractBatch = (s: any) => s.batch || s.batch_name || s.academic_year || (s.academic_year && (s.academic_year.name || s.academic_year.display)) || s.batch_label || ''
        const extractSection = (s: any) => s.section_name || (s.section && (s.section.name || s.section.display)) || s.section || s.name || ''

        for (const s of overallSections) {
          const deptShort = extractDeptShort(s)
          const batch = extractBatch(s)
          const section = extractSection(s)
          const key = `${deptShort}||${batch}||${section}`
          
          // Backend returns one entry per section (Period 1 data only)
          if (!map[key]) {
            const isRangeMode = dateMode !== 'today'
            map[key] = { 
              deptShort, 
              batch, 
              section, 
              present: Number(s.present) || 0, 
              absent: Number(s.absent) || 0, 
              on_duty: Number(s.on_duty) || 0, 
              leave: Number(s.leave) || 0, 
              total: isRangeMode && Number(s.total_marked) > 0
                ? Number(s.total_marked)
                : (Number(s.total_strength) || 0), 
              is_locked: Boolean(s.is_locked) || Boolean(s.attendance_session_locked), 
              items: [s] 
            }
          }
        }

        const rows = Object.values(map)
        // base filter: remove sections with no attendance data
        const baseRows = rows.filter((r:any) => {
          if (!r.items || !r.items.length) return false
          for (const it of r.items) {
            const sid = it.attendance_session_id || it.attendance_session?.id || it.session_id || it.session?.id
            if (sid) return true
            if ((it.present || it.absent || it.total_strength || it.on_duty || it.late) && (Number(it.present) || Number(it.absent) || Number(it.total_strength))) return true
          }
          if ((r.present || r.absent || r.total) && (Number(r.present) || Number(r.absent) || Number(r.total))) return true
          return false
        })
        // unique values for checkboxes (from all base rows)
        const ovUniqDepts = [...new Set(baseRows.map((r:any) => r.deptShort).filter(Boolean))].sort()
        const ovUniqBatches = [...new Set(baseRows.map((r:any) => r.batch).filter(Boolean))].sort()
        const ovUniqSections = [...new Set(baseRows.map((r:any) => r.section).filter(Boolean))].sort()
        // apply active filters
        const filteredRows = baseRows.filter((r: any) => {
          if (overallFilterDepts.size > 0 && !overallFilterDepts.has(r.deptShort)) return false
          if (overallFilterBatches.size > 0 && !overallFilterBatches.has(r.batch)) return false
          if (overallFilterSections.size > 0 && !overallFilterSections.has(r.section)) return false
          if (overallFilterLowPct !== '') {
            const threshold = parseInt(overallFilterLowPct)
            const pct = r.total > 0 ? Math.round((r.present ?? 0) / r.total * 100) : null
            if (!isNaN(threshold) && (pct === null || pct >= threshold)) return false
          }
          return true
        })
        const ovHasFilters = overallFilterDepts.size > 0 || overallFilterBatches.size > 0 || overallFilterSections.size > 0 || overallFilterLowPct !== ''

        return (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Department / Batch / Section</h2>
                    <p className="text-xs text-gray-500">Daily attendance</p>
                  </div>
                  <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
                    {filteredRows.length}{baseRows.length !== filteredRows.length ? `/${baseRows.length}` : ''} sections
                  </span>
                  {ovHasFilters && <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Filtered</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowOverallFilters(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      showOverallFilters || ovHasFilters
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {showOverallFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Filters
                  </button>
                  <button onClick={loadOverallSections} className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                    <RefreshCw className="w-4 h-4" /> Refresh
                  </button>
                </div>
              </div>

              {/* Filter panel */}
              {showOverallFilters && (
                <div className="mb-4 p-4 border border-indigo-100 rounded-lg bg-indigo-50/40 space-y-3">
                  {/* Department */}
                  {ovUniqDepts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Department</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {ovUniqDepts.map((d: string) => (
                          <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                            <input type="checkbox" className="w-3.5 h-3.5 accent-indigo-600" checked={overallFilterDepts.has(d)}
                              onChange={() => setOverallFilterDepts(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n })} />
                            <span className="text-gray-700">{d}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Batch */}
                  {ovUniqBatches.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Batch</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {ovUniqBatches.map((b: string) => (
                          <label key={b} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                            <input type="checkbox" className="w-3.5 h-3.5 accent-indigo-600" checked={overallFilterBatches.has(b)}
                              onChange={() => setOverallFilterBatches(prev => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n })} />
                            <span className="text-gray-700">{b}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Section */}
                  {ovUniqSections.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Section</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {ovUniqSections.map((s: string) => (
                          <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                            <input type="checkbox" className="w-3.5 h-3.5 accent-indigo-600" checked={overallFilterSections.has(s)}
                              onChange={() => setOverallFilterSections(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })} />
                            <span className="text-gray-700">{s}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Low % */}
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Low % — show below</p>
                    <input type="number" min="0" max="100" value={overallFilterLowPct}
                      onChange={e => setOverallFilterLowPct(e.target.value)}
                      placeholder="e.g. 75"
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                    {overallFilterLowPct && <button onClick={() => setOverallFilterLowPct('')} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>}
                  </div>
                  {ovHasFilters && (
                    <button onClick={() => { setOverallFilterDepts(new Set()); setOverallFilterBatches(new Set()); setOverallFilterSections(new Set()); setOverallFilterLowPct('') }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline">
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Dept</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Batch</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Section</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Present
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center justify-end gap-1">
                        <XCircle className="w-3 h-3" />
                        Absent
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">OD</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Leave</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center justify-end gap-1">
                        <Users className="w-3 h-3" />
                        Total
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">%</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRows.map((r: any, idx: number) => {
                    const expandKey = `overall-${r.items?.[0]?.section_id || idx}`
                    const isExpanded = expandedRows.has(expandKey)
                    const secId = r.items?.[0]?.section_id || null
                    return (
                      <React.Fragment key={`${r.deptShort}-${r.batch}-${r.section}-${idx}`}>
                        <tr className="hover:bg-indigo-50 transition-colors border-b border-gray-100">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.deptShort}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{r.batch || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{r.section || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-bold text-green-700 bg-green-50 rounded-lg">
                              {r.present ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-bold text-red-700 bg-red-50 rounded-lg">
                              {r.absent ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg">
                              {r.on_duty ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg">
                              {r.leave ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-semibold text-gray-900 bg-gray-100 rounded-lg">
                              {r.total ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(() => { const p = r.total > 0 ? Math.round((r.present ?? 0) / r.total * 100) : null; return p !== null ? <span className={`inline-flex items-center px-2 py-1 text-sm font-bold rounded-lg ${p >= 75 ? 'text-green-700 bg-green-50' : p >= 50 ? 'text-yellow-700 bg-yellow-50' : 'text-red-700 bg-red-50'}`}>{p}%</span> : <span className="text-gray-400">—</span> })()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {r.is_locked ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                <Lock className="w-3 h-3" />Locked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <CheckCircle2 className="w-3 h-3" />Ready
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                // Adapt aggregated row data for openReportCard
                                const firstItem = r.items?.[0] || {}
                                const sessionIds = r.items?.map((it: any) => 
                                  it.attendance_session_id || it.session_id || it.id
                                ).filter(Boolean) || []
                                const sectionIds = r.items?.map((it: any) => 
                                  it.section_id || it.section?.id
                                ).filter(Boolean) || []
                                const adaptedRow = {
                                  ...firstItem,
                                  attendance_session_ids: sessionIds,
                                  section_ids: sectionIds,
                                  _session_ids: new Set(sessionIds),
                                  course_code: firstItem.course_code || firstItem.subject_code || r.deptShort,
                                  course_name: firstItem.course_name || firstItem.subject_name || `${r.section} - Daily Attendance`,
                                  period: 1,
                                  section_name: r.section,
                                  batch_name: r.batch,
                                  is_daily_attendance: true
                                }
                                openReportCard(adaptedRow)
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium transition-colors"
                              title="Open report card"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                              Report
                            </button>
                            <button
                              onClick={() => toggleExpand(expandKey, secId)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                              title={isExpanded ? 'Hide students' : 'Show students'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && <StudentDayTable cacheKey={expandKey} colSpan={11} />}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )
      })() : null}

      {viewMode === 'department' && !departmentLoading && departmentSections && departmentSections.length > 0 ? (() => {
        // Group by department short name + batch + section - backend filters by user's mapped departments
        const map: Record<string, any> = {}
        const extractDeptShort = (s: any) => s.department_short || s.department?.short_name || s.department?.code || s.department_name || s.dept || (s.department && (s.department.display || s.department.name)) || 'Unknown'
        const extractBatch = (s: any) => s.batch || s.batch_name || s.academic_year || (s.academic_year && (s.academic_year.name || s.academic_year.display)) || s.batch_label || ''
        const extractSection = (s: any) => s.section_name || (s.section && (s.section.name || s.section.display)) || s.section || s.name || ''

        for (const s of departmentSections) {
          const deptShort = extractDeptShort(s)
          const batch = extractBatch(s)
          const section = extractSection(s)
          const key = `${deptShort}||${batch}||${section}`
          
          if (!map[key]) {
            const isRangeMode = dateMode !== 'today'
            map[key] = { 
              deptShort, 
              batch, 
              section, 
              present: Number(s.present) || 0, 
              absent: Number(s.absent) || 0, 
              on_duty: Number(s.on_duty) || 0, 
              leave: Number(s.leave) || 0, 
              total: isRangeMode && Number(s.total_marked) > 0
                ? Number(s.total_marked)
                : (Number(s.total_strength) || 0), 
              is_locked: Boolean(s.is_locked) || Boolean(s.attendance_session_locked), 
              items: [s] 
            }
          }
        }

        const rows = Object.values(map)
        // For department view, show ALL sections including those without attendance data
        // so HODs can see which sections haven't marked attendance yet
        const baseRows = rows.filter((r:any) => {
          if (r.section && r.total > 0) return true
          if (!r.items || !r.items.length) return false
          for (const it of r.items) {
            if ((it.present || it.absent || it.total_strength || it.on_duty || it.late) && (Number(it.present) || Number(it.absent) || Number(it.total_strength))) return true
          }
          return false
        })
        // unique values for checkboxes
        const deptUniqBatches = [...new Set(baseRows.map((r:any) => r.batch).filter(Boolean))].sort()
        const deptUniqSections = [...new Set(baseRows.map((r:any) => r.section).filter(Boolean))].sort()
        // apply active filters
        const filteredRows = baseRows.filter((r: any) => {
          if (deptFilterBatches.size > 0 && !deptFilterBatches.has(r.batch)) return false
          if (deptFilterSections.size > 0 && !deptFilterSections.has(r.section)) return false
          if (deptFilterLowPct !== '') {
            const threshold = parseInt(deptFilterLowPct)
            const pct = r.total > 0 ? Math.round((r.present ?? 0) / r.total * 100) : null
            if (!isNaN(threshold) && (pct === null || pct >= threshold)) return false
          }
          return true
        })
        const deptHasFilters = deptFilterBatches.size > 0 || deptFilterSections.size > 0 || deptFilterLowPct !== ''

        return (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">My Department Sections</h2>
                    <p className="text-xs text-gray-500">All sections in your department - Daily attendance</p>
                  </div>
                  <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
                    {filteredRows.length}{baseRows.length !== filteredRows.length ? `/${baseRows.length}` : ''} sections
                  </span>
                  {deptHasFilters && <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Filtered</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDeptFilters(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      showDeptFilters || deptHasFilters
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {showDeptFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Filters
                  </button>
                  <button onClick={loadDepartmentSections} className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                    <RefreshCw className="w-4 h-4" /> Refresh
                  </button>
                </div>
              </div>

              {/* Filter panel */}
              {showDeptFilters && (
                <div className="mb-4 p-4 border border-indigo-100 rounded-lg bg-indigo-50/40 space-y-3">
                  {/* Batch */}
                  {deptUniqBatches.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Batch</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {deptUniqBatches.map((b: string) => (
                          <label key={b} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                            <input type="checkbox" className="w-3.5 h-3.5 accent-indigo-600" checked={deptFilterBatches.has(b)}
                              onChange={() => setDeptFilterBatches(prev => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n })} />
                            <span className="text-gray-700">{b}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Section */}
                  {deptUniqSections.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Section</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {deptUniqSections.map((s: string) => (
                          <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                            <input type="checkbox" className="w-3.5 h-3.5 accent-indigo-600" checked={deptFilterSections.has(s)}
                              onChange={() => setDeptFilterSections(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })} />
                            <span className="text-gray-700">{s}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Low % */}
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Low % — show below</p>
                    <input type="number" min="0" max="100" value={deptFilterLowPct}
                      onChange={e => setDeptFilterLowPct(e.target.value)}
                      placeholder="e.g. 75"
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                    {deptFilterLowPct && <button onClick={() => setDeptFilterLowPct('')} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>}
                  </div>
                  {deptHasFilters && (
                    <button onClick={() => { setDeptFilterBatches(new Set()); setDeptFilterSections(new Set()); setDeptFilterLowPct('') }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline">
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Dept</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Batch</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Section</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Present
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center justify-end gap-1">
                        <XCircle className="w-3 h-3" />
                        Absent
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center justify-end gap-1">
                        <FileText className="w-3 h-3" />
                        OD
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Leave</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center justify-end gap-1">
                        <Users className="w-3 h-3" />
                        Total
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">%</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRows.map((r: any, i: number) => {
                    const expandKey = `dept-${r.items?.[0]?.section_id || i}`
                    const isExpanded = expandedRows.has(expandKey)
                    const secId = r.items?.[0]?.section_id || null
                    return (
                      <React.Fragment key={i}>
                        <tr className="hover:bg-indigo-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{r.deptShort}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{r.batch || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{r.section || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-medium text-green-700 bg-green-50 rounded-lg">
                              {r.present ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-medium text-red-700 bg-red-50 rounded-lg">
                              {r.absent ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg">
                              {r.on_duty ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg">
                              {r.leave ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-1 text-sm font-semibold text-gray-900 bg-gray-100 rounded-lg">
                              {r.total ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(() => { const p = r.total > 0 ? Math.round((r.present ?? 0) / r.total * 100) : null; return p !== null ? <span className={`inline-flex items-center px-2 py-1 text-sm font-bold rounded-lg ${p >= 75 ? 'text-green-700 bg-green-50' : p >= 50 ? 'text-yellow-700 bg-yellow-50' : 'text-red-700 bg-red-50'}`}>{p}%</span> : <span className="text-gray-400">—</span> })()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {(r.present === 0 && r.absent === 0 && r.on_duty === 0) ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                <AlertCircle className="w-3 h-3" />Not Marked
                              </span>
                            ) : r.is_locked ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                <Lock className="w-3 h-3" />Locked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <CheckCircle2 className="w-3 h-3" />Marked
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                // Adapt aggregated row data for openReportCard
                                const firstItem = r.items?.[0] || {}
                                const sessionIds = r.items?.map((it: any) => 
                                  it.attendance_session_id || it.session_id || it.id
                                ).filter(Boolean) || []
                                const sectionIds = r.items?.map((it: any) => 
                                  it.section_id || it.section?.id
                                ).filter(Boolean) || []
                                const adaptedRow = {
                                  ...firstItem,
                                  attendance_session_ids: sessionIds,
                                  section_ids: sectionIds,
                                  _session_ids: new Set(sessionIds),
                                  course_code: firstItem.course_code || firstItem.subject_code || r.deptShort,
                                  course_name: firstItem.course_name || firstItem.subject_name || `${r.section} - Daily Attendance`,
                                  period: 1,
                                  section_name: r.section,
                                  batch_name: r.batch,
                                  is_daily_attendance: true
                                }
                                openReportCard(adaptedRow)
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium transition-colors"
                              title="Open report card"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                              Report
                            </button>
                            <button
                              onClick={() => toggleExpand(expandKey, secId)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                              title={isExpanded ? 'Hide students' : 'Show students'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && <StudentDayTable cacheKey={expandKey} colSpan={11} />}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )
      })() : null}

      {viewMode === 'overall' && !overallLoading && (!overallSections || overallSections.length === 0) && (
        <div className="flex items-center justify-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No sections found</p>
            <p className="text-gray-500 text-sm mt-1">Try selecting a different date</p>
          </div>
        </div>
      )}

      {viewMode === 'department' && departmentLoading && (
        <div className="flex items-center justify-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-600">Loading department sections...</p>
          </div>
        </div>
      )}

      {viewMode === 'department' && !departmentLoading && (!departmentSections || departmentSections.length === 0) && (
        <div className="flex items-center justify-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No sections found</p>
            <p className="text-gray-500 text-sm mt-1">No sections available in your department for this date</p>
          </div>
        </div>
      )}

      {viewMode === 'section' && sectionReport && (
        <div className="mb-6 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-white mb-1">
                  <GraduationCap className="w-5 h-5" />
                  <h2 className="text-lg font-semibold">{sectionReport.section_name}</h2>
                </div>
                <div className="flex items-center gap-2 text-indigo-100 text-sm">
                  <Calendar className="w-4 h-4" />
                  {sectionReport.date}
                </div>
              </div>
              <button 
                onClick={() => setViewMode('overall')} 
                className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium transition-colors"
              >
                ← Back
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-700">Present</span>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <strong className="text-3xl font-bold text-green-700">{sectionReport.present}</strong>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-red-700">Absent</span>
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <strong className="text-3xl font-bold text-red-700">{sectionReport.absent}</strong>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-700">On Duty</span>
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <strong className="text-3xl font-bold text-blue-700">{sectionReport.on_duty}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'assigned' && !assignedLoading && assignedPeriods && assignedPeriods.length > 0 ? (() => {
            const displayAssigned = mergedAssigned.length ? mergedAssigned : mergedAssignedPeriods(assignedPeriods)
            return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-lg font-semibold text-gray-900">My Assigned Periods</h2>
                    <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
                      {displayAssigned.length} periods
                    </span>
                  </div>
                  <button 
                    onClick={loadAssignedPeriods} 
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> 
                    Refresh
                  </button>
                </div>
                <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Period
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Subject</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        <div className="flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Present
                        </div>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        <div className="flex items-center justify-end gap-1">
                          <XCircle className="w-3 h-3" />
                          Absent
                        </div>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">OD</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Leave</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        <div className="flex items-center justify-end gap-1">
                          <Users className="w-3 h-3" />
                          Total
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayAssigned.map((p: any) => (
                      <tr key={`${p.attendance_session_id||p.session_id||'merged'}-${p.period?.label||p.period?.index||p.period?.id}-${String(p.subject_display||'')}`} className="hover:bg-indigo-50 transition-colors border-b border-gray-100">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.period?.label || p.period?.index || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{p.subject_display || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center px-2 py-1 text-sm font-bold text-green-700 bg-green-50 rounded-lg">
                            {p.present ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center px-2 py-1 text-sm font-bold text-red-700 bg-red-50 rounded-lg">
                            {p.absent ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center px-2 py-1 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg">
                            {p.on_duty ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center px-2 py-1 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg">
                            {p.leave ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center px-2 py-1 text-sm font-semibold text-gray-900 bg-gray-100 rounded-lg">
                            {p.total_strength ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {p.attendance_session_locked ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <Lock className="w-3 h-3" />Locked
                            </span>
                          ) : (p.present !== null ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircle2 className="w-3 h-3" />Saved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              <AlertCircle className="w-3 h-3" />Not saved
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openReportCard(p)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium transition-colors"
                              title="Open report card for this period"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                              Report
                            </button>
                            {(() => {
                              const sessionId = p.attendance_session_id || p.attendance_session?.id || p.session_id || p.session?.id
                              const isPending = sessionId ? pendingRequests.includes(sessionId) : false
                              if (isPending) {
                                return (
                                  <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-yellow-100 text-yellow-800 font-medium cursor-not-allowed" disabled>
                                    <Clock className="w-4 h-4" />
                                    Pending
                                  </button>
                                )
                              }
                              return (
                                <button
                                  onClick={() => requestUnlock(sessionId)}
                                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    p.attendance_session_locked ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  }`}
                                  disabled={!p.attendance_session_locked || !sessionId}
                                  title={!sessionId ? 'Multiple sessions merged' : ''}
                                >
                                  <Unlock className="w-4 h-4" />
                                  Unlock
                                </button>
                              )
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          )
        })() : null}

      {viewMode === 'assigned' && !periodLoading && (!todayPeriods || !(todayPeriods.periods && todayPeriods.periods.length > 0)) && (!assignedPeriods || assignedPeriods.length === 0) && mergedAssigned.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
            <AlertCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
          <p className="text-gray-600">No attendance periods found for the selected date.</p>
        </div>
      )}

      {/* My Class View */}
      {viewMode === 'myclass' && !myClassLoading && (myClassSections.length > 0 || Object.keys(myClassDailyAttendance).length > 0) ? (() => {
        // Group by section name and display periods
        const map: Record<string, any> = {}
        const extractSectionName = (s: any) => s.section_name || (s.section && (s.section.name || s.section.display)) || s.section || s.name || 'Unknown'
        
        // First, process period attendance data
        for (const s of myClassSections) {
          const sectionName = extractSectionName(s)
          if (!map[sectionName]) {
            map[sectionName] = {
              section_name: sectionName,
              section_id: s.section_id,
              department: s.department || s.department_name || s.dept || 'Unknown',
              batch: s.batch || s.batch_name || s.academic_year || 'Unknown',
              periods: []
            }
          }
          map[sectionName].periods.push(s)
        }
        
        // Also process sections that have daily attendance but no period attendance
        // We need to get section details from the backend response
        // For now, we'll create entries for sections with daily attendance that aren't in the map yet
        Object.keys(myClassDailyAttendance).forEach((sectionIdStr) => {
          const sectionId = parseInt(sectionIdStr)
          const dailyData = myClassDailyAttendance[sectionId]
          
          // Check if this section is not already in the map
          const alreadyExists = Object.values(map).some((group: any) => group.section_id === sectionId)
          
          if (!alreadyExists && dailyData) {
            // Use section details from daily attendance data
            const sectionKey = dailyData.section_name || `Section-${sectionId}`
            map[sectionKey] = {
              section_name: dailyData.section_name || `Section ${sectionId}`,
              section_id: sectionId,
              department: dailyData.department || dailyData.department_name || 'Unknown',
              batch: dailyData.batch || dailyData.batch_name || 'Unknown',
              periods: []
            }
          }
        })
        
        const grouped = Object.values(map)
        
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Users className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">My Class Sections</h2>
                  <p className="text-sm text-gray-600">Daily and period attendance data for your assigned sections</p>
                </div>
              </div>
              <button 
                onClick={loadMyClassSections} 
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                disabled={myClassLoading}
              >
                {myClassLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh
              </button>
            </div>
            
            {grouped.map((group, idx) => (
              <div key={`${group.section_name}-${idx}`} className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-gray-200 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{group.section_name}</h3>
                      <p className="text-sm text-gray-600">{group.department} - Batch {group.batch}</p>
                    </div>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                      {dateMode === 'today' && group.periods.length > 0 
                        ? (() => { const uniq = new Set(group.periods.map((p: any) => p.period_number)); const n = uniq.size; return `${n} period${n !== 1 ? 's' : ''}` })()
                        : 'Daily attendance only'}
                    </span>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="w-16 px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Per.</th>
                        <th className="w-20 px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                        <th className="w-24 px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                        <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Present</th>
                        <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Absent</th>
                        <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">OD</th>
                        <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Leave</th>
                        <th className="w-14 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                        <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">%</th>
                        <th className="w-24 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="w-20 px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Daily Attendance Row */}
                      {(() => {
                        const sectionId = group.section_id
                        const dailyData = sectionId ? myClassDailyAttendance[sectionId] : null
                        if (!dailyData) return null
                        
                        const present = dailyData.present_count || 0
                        const absent = dailyData.absent_count || 0
                        const leaveCount = dailyData.leave_count || 0
                        const odCount = dailyData.od_count || 0
                        const total = present + absent + leaveCount
                        const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0'
                        const status = dailyData.attendance_marked ? 'Marked' : (dailyData.is_locked ? 'Locked' : 'Not Marked')
                        const dailyExpandKey = `daily-${sectionId}`
                        const isDailyExpanded = expandedRows.has(dailyExpandKey)
                        
                        return (
                          <React.Fragment>
                          <tr className="hover:bg-blue-50 bg-blue-25">
                            <td className="px-2 py-2 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
                                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              <span className="text-xs font-semibold text-blue-800">Daily</span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600">
                              Full Day
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {present}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center text-gray-300">—</td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {odCount}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                {leaveCount}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className="text-xs font-medium text-gray-900">{total}</span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                parseFloat(percentage) >= 75 ? 'bg-green-100 text-green-800' :
                                parseFloat(percentage) >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {percentage}%
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                status === 'Marked' ? 'bg-blue-100 text-blue-800' :
                                status === 'Locked' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {status}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1">
                              {dailyData.attendance_marked && (
                                <button
                                  onClick={() => {
                                    const adaptedDaily = {
                                      attendance_session_id: dailyData.session_id,
                                      attendance_session_ids: [dailyData.session_id],
                                      section_ids: [sectionId],
                                      _session_ids: new Set([dailyData.session_id]),
                                      course_code: 'DAILY',
                                      course_name: `${group.section_name} - Daily Attendance`,
                                      period: 'Daily',
                                      section_name: group.section_name,
                                      batch_name: group.batch,
                                      date: date,
                                      is_daily_attendance: true
                                    }
                                    openReportCard(adaptedDaily)
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium transition-colors"
                                  title="Open daily attendance report card"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5" />
                                  Report
                                </button>
                              )}
                              <button
                                onClick={() => toggleExpand(dailyExpandKey, sectionId)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                title={isDailyExpanded ? 'Hide students' : 'Show students'}
                              >
                                {isDailyExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                              </div>
                            </td>
                          </tr>
                          {isDailyExpanded && <StudentDayTable cacheKey={dailyExpandKey} colSpan={11} />}
                          </React.Fragment>
                        )
                      })()}
                      {/* Period Attendance Rows — only shown in Today mode */}
                      {dateMode === 'today' && group.periods.map((period: any, pidx: number) => {
                        const present = period.present_count || 0
                        const absent = period.absent_count || 0
                        const leaveCount = period.leave_count || 0
                        const odCount = period.od_count || 0
                        const total = present + absent + leaveCount
                        const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0'
                        const status = period.attendance_marked ? 'Marked' : (period.is_locked ? 'Locked' : 'Open')
                        const sessionId = period.session_id || period.id
                        const sessionExpandKey = `session-${sessionId || pidx}`
                        const isSessionExpanded = expandedRows.has(sessionExpandKey)
                        
                        return (
                          <React.Fragment key={`${period.id || pidx}`}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-2 py-2 whitespace-nowrap">
                              <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                                <span className="text-xs font-bold text-indigo-600">{period.period_number || pidx + 1}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <span className="text-xs font-semibold text-gray-900 block truncate" title={period.subject_name || period.subject?.name || 'N/A'}>
                                {period.subject_code || period.subject?.code || period.subject_name || 'N/A'}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600">
                              {period.start_time || 'N/A'} - {period.end_time || 'N/A'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {present}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                {absent}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {odCount}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                {leaveCount}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className="text-xs font-medium text-gray-900">{total}</span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                parseFloat(percentage) >= 75 ? 'bg-green-100 text-green-800' :
                                parseFloat(percentage) >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {percentage}%
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                status === 'Marked' ? 'bg-blue-100 text-blue-800' :
                                status === 'Locked' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {status}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  const adaptedPeriod = {
                                    ...period,
                                    attendance_session_id: period.session_id || period.id,
                                    attendance_session_ids: [period.session_id || period.id],
                                    section_ids: [period.section_id],
                                    _session_ids: new Set([period.session_id || period.id]),
                                    course_code: period.subject_code,
                                    course_name: period.subject_name,
                                    period: period.period_number
                                  }
                                  openReportCard(adaptedPeriod)
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium transition-colors"
                                title="Open report card for this period"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                Report
                              </button>
                              <button
                                onClick={() => toggleExpand(sessionExpandKey, group.section_id, sessionId)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                title={isSessionExpanded ? 'Hide students' : 'Show students'}
                              >
                                {isSessionExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                              </div>
                            </td>
                          </tr>
                          {isSessionExpanded && <StudentDayTable cacheKey={sessionExpandKey} colSpan={11} />}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      })() : null}

      {viewMode === 'myclass' && myClassLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-600">Loading my class sections...</p>
          </div>
        </div>
      )}

      {viewMode === 'myclass' && !myClassLoading && (!myClassSections || myClassSections.length === 0) && Object.keys(myClassDailyAttendance).length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Sections Assigned</h3>
          <p className="text-gray-600">You are not assigned as an advisor to any sections, or no attendance data is available.</p>
        </div>
      )}
      
      {showRequestsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowRequestsModal(false)} />
          <div className="bg-white rounded-xl shadow-2xl w-[75vw] max-w-[80vw] mx-4 z-50 overflow-auto max-h-[80vh]">
            <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-indigo-600 to-blue-600">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white">Unlock Requests (Period & Daily)</h3>
              </div>
              <button 
                onClick={() => setShowRequestsModal(false)} 
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors font-medium"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <AttendanceRequests />
            </div>
          </div>
        </div>
      )}
      {reportModalOpen && reportData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setReportModalOpen(false); setReportData(null) }} />
          <div className="bg-white rounded-xl shadow-2xl w-[80vw] max-w-[700px] mx-4 z-50 overflow-auto max-h-[85vh]">
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white mb-1">
                    <FileSpreadsheet className="w-5 h-5" />
                    <h3 className="text-xl font-semibold">Report Card</h3>
                  </div>
                  <div className="text-indigo-100 text-sm">
                    {reportData.courseCode ? `${reportData.courseCode} - ` : ''}{reportData.courseName} — {reportData.period}
                    {reportData.date && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {reportData.date}
                      </span>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => { setReportModalOpen(false); setReportData(null) }} 
                  className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6">
              {reportLoading ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
                  <p className="text-gray-600">Loading report data...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-xs font-medium text-green-700">Present</span>
                      </div>
                      <strong className="text-2xl font-bold text-green-700">{reportData.present}</strong>
                    </div>
                    <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span className="text-xs font-medium text-red-700">Absent</span>
                      </div>
                      <strong className="text-2xl font-bold text-red-700">{reportData.absent}</strong>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-medium text-blue-700">OD</span>
                      </div>
                      <strong className="text-2xl font-bold text-blue-700">{reportData.od}</strong>
                    </div>
                    <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-medium text-amber-700">Late</span>
                      </div>
                      <strong className="text-2xl font-bold text-amber-700">{reportData.late}</strong>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-medium text-purple-700">Leave</span>
                      </div>
                      <strong className="text-2xl font-bold text-purple-700">{reportData.leave ?? 0}</strong>
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <h4 className="text-sm font-semibold text-red-900">Absent Students</h4>
                    </div>
                    <div className="text-sm text-red-800 font-mono">
                      {(reportData.absentRegs || []).length ? (reportData.absentRegs || []).join(', ') : <span className="text-red-600 italic">None</span>}
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-5 h-5 text-blue-600" />
                      <h4 className="text-sm font-semibold text-blue-900">On Duty Students</h4>
                    </div>
                    <div className="text-sm text-blue-800 font-mono">
                      {(reportData.odRegs || []).length ? (reportData.odRegs || []).join(', ') : <span className="text-blue-600 italic">None</span>}
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="w-5 h-5 text-purple-600" />
                      <h4 className="text-sm font-semibold text-purple-900">Leave Students</h4>
                    </div>
                    <div className="text-sm text-purple-800 font-mono">
                      {(reportData.leaveRegs || []).length ? (reportData.leaveRegs || []).join(', ') : <span className="text-purple-600 italic">None</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
    </div>
  )
}

export default AttendanceAnalytics
