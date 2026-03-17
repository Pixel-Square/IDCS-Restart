import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

/** Custom event dispatched whenever an unlock request is approved/rejected.
 *  The notification bell in the Navbar listens for this to refresh instantly. */
export const ATTENDANCE_REQUEST_PROCESSED_EVENT = 'attendance-request-processed'

export default function AttendanceRequests(){
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const [permissionLevel, setPermissionLevel] = useState<string | null>(null)

  useEffect(()=>{ loadPermissionLevel() }, [])
  useEffect(()=>{ if(permissionLevel) loadRequests() }, [permissionLevel])

  async function loadPermissionLevel(){
    try{
      const res = await fetchWithAuth('/api/academics/analytics/filters/')
      if (!res.ok) return
      const data = await res.json().catch(()=>null)
      setPermissionLevel(data?.permission_level || null)
    }catch(e){ console.error('Failed to load permission level', e) }
  }

  async function loadRequests(){
    setLoading(true)
    try{
      // HODs get their department's pending requests, admins get all HOD-approved requests
      const endpoint = permissionLevel === 'department' 
        ? '/api/academics/hod-unlock-requests/'
        : '/api/academics/unified-unlock-requests/'
      const res = await fetchWithAuth(endpoint)
      if(!res.ok) throw new Error('Failed')
      const j = await res.json()
      setRequests(j.results || j || [])
    }catch(e){ console.error('loadRequests', e); setRequests([]) }
    finally{ setLoading(false) }
  }

  async function handleAction(id:number, action:'approve'|'reject', requestType: string = 'period'){
    const isHOD = permissionLevel === 'department'
    const actionText = isHOD 
      ? `${action} this request as HOD` 
      : `${action} this request and unlock the session`
    if(!window.confirm(`Are you sure you want to ${actionText}?`)) return
    try{
      const body = { id, action, request_type: requestType, note: '' }
      const endpoint = isHOD 
        ? '/api/academics/hod-unlock-requests/'
        : '/api/academics/unified-unlock-requests/'
      const method = isHOD ? 'POST' : 'PATCH'
      const res = await fetchWithAuth(endpoint, { 
        method, 
        body: JSON.stringify(body) 
      })
      if(!res.ok){ 
        const err = await res.json().catch(()=>({}))
        throw new Error(err.error || err.detail || 'Failed') 
      }
      await loadRequests()
      const successMsg = action === 'approve' && isHOD 
        ? 'Request approved and forwarded to final approver' 
        : `Request ${action}ed successfully`
      alert(successMsg)
      // Notify the Navbar bell to refresh its count immediately
      window.dispatchEvent(new CustomEvent(ATTENDANCE_REQUEST_PROCESSED_EVENT))
    }catch(e){ console.error(action, e); alert('Failed: '+(e instanceof Error? e.message: String(e))) }
  }

  const getPeriod = (r: any) => {
    const candidates = [r.session_display, r.session?.display, r.session?.label, r.period_label, r.period?.label]
    for (const c of candidates) {
      if (!c) continue
      const s = String(c)
      const m = s.match(/\bPeriod\s*\(?\s*(\d+)\s*\)?/i)
      if (m && m[1]) return `Period ${m[1]}`
      // if short label, use trimmed
      if (s.trim().length && s.trim().length < 60) return s.trim()
    }
    return ''
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 overflow-hidden">
      <div className="mb-6 flex flex-col gap-1">
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">
          {permissionLevel === 'department' ? 'Session Unlock Requests' : 'Unlock Requests (Final Approval)'}
        </h2>
        {permissionLevel === 'department' && (
          <p className="text-sm font-medium text-slate-500">
            Review unlock requests from staff in your department. Approved requests will be forwarded to the attendance administrator.
          </p>
        )}
      </div>

      {loading ? (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-10 flex flex-col items-center justify-center text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-3"></div>
          <p className="font-medium text-sm">Loading requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-500">
          <div className="h-14 w-14 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm border border-slate-100">
            <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-700">All Caught Up!</h3>
          <p className="text-sm mt-1">
            {permissionLevel === 'department' 
              ? 'No pending HOD approval requests found.' 
              : 'No requests pending final approval found.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">No.</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Session</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Requested By</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Requested At</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Reason</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {requests.map((r, idx) => (
                <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-4 text-sm font-medium text-slate-500">{idx+1}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${
                      r.request_type === 'daily' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' 
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200/50'
                    }`}>
                      {r.request_type === 'daily' ? 'Daily' : 'Period'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm">
                    <div className="font-semibold text-slate-800">{r.department || r.session_display?.split(' | ')[0] || 'N/A'}</div>
                    <div className="text-slate-500 text-xs mt-0.5">{r.session_display || ''}</div>
                  </td>
                  <td className="px-5 py-4 text-sm">
                    <div className="font-semibold text-slate-800">{r.requested_by?.name || r.requested_by_display || 'Unknown'}</div>
                    <div className="text-slate-500 text-xs mt-0.5 font-medium">{r.requested_by?.staff_id || (r.requested_by && r.requested_by.staff_id) || ''}</div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600 font-medium">
                    {r.requested_at ? new Date(r.requested_at).toLocaleString(undefined, {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    }) : ''}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    <div className="max-w-[200px] truncate bg-slate-50 px-2 py-1.5 rounded border border-slate-100 font-medium" title={r.note || r.reason || r.reason_text || ''}>
                      {r.note || r.reason || r.reason_text || '-'}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${
                      (r.hod_status === 'PENDING' || r.status === 'PENDING')
                        ? 'bg-amber-50 text-amber-700 border border-amber-200/50' 
                        : r.status === 'HOD_APPROVED'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200/50'
                        : r.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                        : 'bg-rose-50 text-rose-700 border border-rose-200/50'
                    }`}>
                      {r.hod_status || r.status || 'PENDING'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {(r.hod_status === 'PENDING' || r.status === 'PENDING' || r.status === 'HOD_APPROVED') ? (
                      <div className="flex gap-2">
                        <button 
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-500 hover:text-white border border-emerald-200 hover:border-emerald-600 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center"
                          onClick={()=>handleAction(r.id, 'approve', r.request_type || 'period')}
                        >
                          Approve
                        </button>
                        <button 
                          className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-500 hover:text-white border border-rose-200 hover:border-rose-600 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center"
                          onClick={()=>handleAction(r.id, 'reject', r.request_type || 'period')}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (<span className="text-slate-400 font-medium text-xs bg-slate-50 px-2 py-1 rounded border border-slate-100">Processed</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
