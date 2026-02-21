import React, { useEffect, useState } from 'react'
import { Lock, Unlock, RefreshCw } from 'lucide-react'
import fetchWithAuth from '../../services/fetchAuth'

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
  const [todayPeriods, setTodayPeriods] = useState<TodayPeriods | null>(null)
  const [assignedLoading, setAssignedLoading] = useState(false)
  const [assignedPeriods, setAssignedPeriods] = useState<any[]>([])
  const [overallLoading, setOverallLoading] = useState(false)
  const [overallSections, setOverallSections] = useState<any[]>([])
  const [permissionLevel, setPermissionLevel] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'overall'|'assigned'|'section'>('overall')
  const [sectionLoading, setSectionLoading] = useState(false)
  const [sectionReport, setSectionReport] = useState<any | null>(null)

  useEffect(() => { loadTodayPeriods() }, [])
  useEffect(() => { loadAssignedPeriods() }, [])
  useEffect(() => { loadOverallSections() }, [])
  useEffect(() => { loadAnalyticsFilters() }, [])

  useEffect(() => {
    // choose sensible default view based on permissions
    if (!permissionLevel) return
    if (permissionLevel === 'all' || permissionLevel === 'department') setViewMode('overall')
    else if (permissionLevel === 'class') setViewMode('assigned')
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
      const res = await fetchWithAuth('/api/academics/analytics/today-periods/')
      const data = await res.json().catch(()=>null)
      if (res.ok) setTodayPeriods(data)
      else setTodayPeriods(null)
    }catch(e){ console.error('Failed to load today periods', e); setTodayPeriods(null) }
    finally{ setPeriodLoading(false) }
  }

  async function loadAssignedPeriods(){
    setAssignedLoading(true)
    try{
      const todayIso = new Date().toISOString().split('T')[0]
      const res = await fetchWithAuth(`/api/academics/staff/periods/?date=${todayIso}`)
      const data = await res.json().catch(()=>({ results: [] }))
      if (res.ok) setAssignedPeriods(data.results || [])
      else setAssignedPeriods([])
    }catch(e){ console.error('Failed to load assigned periods', e); setAssignedPeriods([]) }
    finally{ setAssignedLoading(false) }
  }

  async function loadOverallSections(){
    setOverallLoading(true)
    try{
      const todayIso = new Date().toISOString().split('T')[0]
      const res = await fetchWithAuth(`/api/academics/analytics/overall-section/?date=${todayIso}`)
      if (!res.ok) {
        // permission denied or not available
        setOverallSections([])
        setOverallLoading(false)
        return
      }
      const data = await res.json().catch(()=>({ sections: [] }))
      setOverallSections(data.sections || [])
    }catch(e){ console.error('Failed to load overall sections', e); setOverallSections([]) }
    finally{ setOverallLoading(false) }
  }

  const requestUnlock = async (sessionId?: number) => {
    if (!sessionId) return alert('No session available')
    if (!confirm('Request unlock for this session?')) return
    try{
      const res = await fetchWithAuth('/api/academics/attendance-unlock-requests/', {
        method: 'POST',
        body: JSON.stringify({ session: sessionId, note: '' })
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
      alert('Unlock request submitted successfully')
    }catch(e){ console.error(e); alert('Failed to submit request') }
  }

  async function openSectionReport(sectionId?: number){
    if (!sectionId) return
    setSectionLoading(true)
    setSectionReport(null)
    try{
      const todayIso = new Date().toISOString().split('T')[0]
      const res = await fetchWithAuth(`/api/academics/analytics/class-report/?section_id=${sectionId}&date=${todayIso}`)
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
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Attendance Unlock Requests</h1>
        <p className="text-sm text-gray-600">Request unlock for a locked attendance session from the list below.</p>
      </div>

      {periodLoading && <div className="py-6 text-gray-600">Loading today's periods…</div>}

      {/* Navigation buttons (permission-aware) */}
      <div className="mb-4 flex items-center gap-2">
        { (permissionLevel === 'all' || permissionLevel === 'department') && (
          <button
            onClick={() => setViewMode('overall')}
            className={`px-3 py-1 rounded ${viewMode==='overall' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            Overall
          </button>
        )}
        <button
          onClick={() => setViewMode('assigned')}
          className={`px-3 py-1 rounded ${viewMode==='assigned' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
          My Assigned
        </button>
      </div>

      {viewMode === 'overall' && !overallLoading && overallSections && overallSections.length > 0 && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-gray-700">Overall sections (permissioned)</div>
              <button onClick={loadOverallSections} className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Department - Section</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Present</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Absent</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">OD</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Total</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {overallSections.map((s: any) => (
                  <tr key={s.section_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{(s.department_short || s.department_name ? `${s.department_short || s.department_name} - ` : '') + (s.section_name || '')}</td>
                    <td className="px-4 py-3 text-right text-sm text-green-600 font-semibold">{s.present ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-red-600 font-semibold">{s.absent ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{s.on_duty ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{s.total_strength ?? '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      {s.is_locked ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-700"><Lock className="w-3 h-3 mr-1"/>Locked</span>
                      ) : (s.marked_at ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-50 text-green-700">Saved</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700">Not saved</span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openSectionReport(s.section_id)}
                        className="px-3 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'section' && sectionReport && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg font-medium">{sectionReport.section_name}</div>
              <div className="text-sm text-gray-600">Date: {sectionReport.date}</div>
            </div>
            <div>
              <button onClick={() => setViewMode('overall')} className="px-3 py-1 rounded bg-gray-100">Back</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-gray-50 rounded">Present<br/><strong className="text-2xl">{sectionReport.present}</strong></div>
            <div className="p-3 bg-gray-50 rounded">Absent<br/><strong className="text-2xl">{sectionReport.absent}</strong></div>
            <div className="p-3 bg-gray-50 rounded">OD<br/><strong className="text-2xl">{sectionReport.on_duty}</strong></div>
          </div>
        </div>
      )}

      {!assignedLoading && assignedPeriods && assignedPeriods.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-gray-700"></div>
              <button onClick={loadAssignedPeriods} className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Period</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Subject</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Section</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Present</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Absent</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">OD</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Total</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assignedPeriods.map((p: any) => (
                  <tr key={p.id || p.session_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{p.period?.label || p.period?.index || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{p.subject_display || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{p.section_name || '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-green-600 font-semibold">{p.present ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-red-600 font-semibold">{p.absent ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{p.on_duty ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{p.total_strength ?? '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      {p.attendance_session_locked ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-700"><Lock className="w-3 h-3 mr-1"/>Locked</span>
                      ) : (p.present !== null ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-50 text-green-700">Saved</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700">Not saved</span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => requestUnlock(p.attendance_session_id || p.attendance_session?.id || p.session_id)}
                        className={`px-3 py-1 rounded text-sm ${p.attendance_session_locked ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-600 cursor-not-allowed'}`}
                        disabled={!p.attendance_session_locked}
                      >
                        Request Unlock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!periodLoading && (!todayPeriods || todayPeriods.periods.length === 0) && (
        <div className="text-gray-600 py-6">No periods available for today.</div>
      )}
    </div>
  )
}

export default AttendanceAnalytics
