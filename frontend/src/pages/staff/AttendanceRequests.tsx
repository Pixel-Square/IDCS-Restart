import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

export default function AttendanceRequests(){
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<any[]>([])

  useEffect(()=>{ loadRequests() }, [])

  async function loadRequests(){
    setLoading(true)
    try{
      const res = await fetchWithAuth('/api/academics/unified-unlock-requests/')
      if(!res.ok) throw new Error('Failed')
      const j = await res.json()
      setRequests(j.results || j || [])
    }catch(e){ console.error('loadRequests', e); setRequests([]) }
    finally{ setLoading(false) }
  }

  async function handleAction(id:number, action:'approve'|'reject', requestType: string = 'period'){
    if(!window.confirm(`Are you sure you want to ${action} this request?`)) return
    try{
      const body = { id, action, request_type: requestType }
      const res = await fetchWithAuth('/api/academics/unified-unlock-requests/', { 
        method: 'PATCH', 
        body: JSON.stringify(body) 
      })
      if(!res.ok){ const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Failed') }
      await loadRequests()
      alert(`Request ${action}ed`)
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
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Unlock Requests (Period & Daily Attendance)</h2>
      {loading && <p>Loading...</p>}
      {!loading && requests.length === 0 && <p>No requests found.</p>}
      {!loading && requests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="px-4 py-2">No.</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Session</th>
                <th className="px-4 py-2">Section</th>
                <th className="px-4 py-2">Requested By</th>
                <th className="px-4 py-2">Requested At</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, idx) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">{idx+1}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-sm ${
                      r.request_type === 'daily' 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-indigo-100 text-indigo-800'
                    }`}>
                      {r.request_type === 'daily' ? 'Daily' : 'Period'}
                    </span>
                  </td>
                  <td className="px-4 py-2">{r.session_display || getPeriod(r) || ''}</td>
                  <td className="px-4 py-2">{r.section_name || (r.session && r.session.section && r.session.section.name) || ''}</td>
                  <td className="px-4 py-2">{r.requested_by_display || (r.requested_by && (r.requested_by.username || r.requested_by.staff_id || r.requested_by.id)) || ''}</td>
                  <td className="px-4 py-2">{r.requested_at || ''}</td>
                  <td className="px-4 py-2">{r.note || r.reason || r.reason_text || ''}</td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="px-4 py-2">
                    {String(r.status || '').toLowerCase().includes('pend') ? (
                      <>
                        <button className="mr-2 px-3 py-1 bg-green-600 text-white rounded" onClick={()=>handleAction(r.id, 'approve', r.request_type || 'period')}>Approve</button>
                        <button className="px-3 py-1 bg-red-600 text-white rounded" onClick={()=>handleAction(r.id, 'reject', r.request_type || 'period')}>Reject</button>
                      </>
                    ) : (<span>-</span>)}
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
