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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h2 className="text-xl font-semibold mb-4">
        {permissionLevel === 'department' ? 'Session Unlock Requests' : 'Unlock Requests (Final Approval)'}
      </h2>
      {permissionLevel === 'department' && (
        <p className="text-sm text-gray-600 mb-4">
          Review unlock requests from staff in your department. Approved requests will be forwarded to the attendance administrator.
        </p>
      )}
      {loading && <p>Loading...</p>}
      {!loading && requests.length === 0 && (
        <p className="text-gray-600">
          {permissionLevel === 'department' 
            ? 'No pending HOD approval requests found.' 
            : 'No requests pending final approval found.'}
        </p>
      )}
      {!loading && requests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">No.</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Type</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Session</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Requested By</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Requested At</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Reason</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, idx) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{idx+1}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-sm font-medium ${
                      r.request_type === 'daily' 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-indigo-100 text-indigo-800'
                    }`}>
                      {r.request_type === 'daily' ? 'Daily' : 'Period'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div>{r.department || r.session_display?.split(' | ')[0] || 'N/A'}</div>
                    <div className="text-gray-500 text-xs">{r.session_display || ''}</div>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div>{r.requested_by?.name || r.requested_by_display || 'Unknown'}</div>
                    <div className="text-gray-500 text-xs">{r.requested_by?.staff_id || (r.requested_by && r.requested_by.staff_id) || ''}</div>
                  </td>
                  <td className="px-4 py-2 text-sm">{r.requested_at ? new Date(r.requested_at).toLocaleString() : ''}</td>
                  <td className="px-4 py-2 text-sm max-w-xs truncate" title={r.note || r.reason || r.reason_text || ''}>{r.note || r.reason || r.reason_text || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-sm font-medium ${
                      (r.hod_status === 'PENDING' || r.status === 'PENDING')
                        ? 'bg-yellow-100 text-yellow-800' 
                        : r.status === 'HOD_APPROVED'
                        ? 'bg-blue-100 text-blue-800'
                        : r.status === 'APPROVED'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {r.hod_status || r.status || 'PENDING'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {(r.hod_status === 'PENDING' || r.status === 'PENDING' || r.status === 'HOD_APPROVED') ? (
                      <div className="flex gap-2">
                        <button 
                          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors" 
                          onClick={()=>handleAction(r.id, 'approve', r.request_type || 'period')}
                        >
                          Approve
                        </button>
                        <button 
                          className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors" 
                          onClick={()=>handleAction(r.id, 'reject', r.request_type || 'period')}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (<span className="text-gray-500">-</span>)}
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
