import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

export default function AttendanceRequests(){
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<any[]>([])

  useEffect(()=>{ loadRequests() }, [])

  async function loadRequests(){
    setLoading(true)
    try{
      const res = await fetchWithAuth('/api/academics/attendance-unlock-requests/')
      if(!res.ok) throw new Error('Failed')
      const j = await res.json()
      setRequests(j.results || j || [])
    }catch(e){ console.error('loadRequests', e); setRequests([]) }
    finally{ setLoading(false) }
  }

  async function handleAction(id:number, action:'approve'|'reject'){
    if(!window.confirm(`Are you sure you want to ${action} this request?`)) return
    try{
      const res = await fetchWithAuth(`/api/academics/attendance-unlock-requests/${id}/${action}/`, { method: 'POST' })
      if(!res.ok){ const err = await res.json().catch(()=>({})); throw new Error(err.detail || 'Failed') }
      await loadRequests()
      alert(`Request ${action}ed`)
    }catch(e){ console.error(action, e); alert('Failed: '+(e instanceof Error? e.message: String(e))) }
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Attendance Unlock Requests</h2>
      {loading && <p>Loading...</p>}
      {!loading && requests.length === 0 && <p>No requests found.</p>}
      {!loading && requests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Session</th>
                <th className="px-4 py-2">Section</th>
                <th className="px-4 py-2">Requested By</th>
                <th className="px-4 py-2">Requested At</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">{r.id}</td>
                  <td className="px-4 py-2">{r.session_display || (r.session && r.session.id) || ''}</td>
                  <td className="px-4 py-2">{r.section_name || (r.session && r.session.section && r.session.section.name) || ''}</td>
                  <td className="px-4 py-2">{r.requested_by_display || (r.requested_by && (r.requested_by.username || r.requested_by.staff_id || r.requested_by.id)) || ''}</td>
                  <td className="px-4 py-2">{r.requested_at || ''}</td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="px-4 py-2">
                    {r.status === 'PENDING' ? (
                      <>
                        <button className="mr-2 px-3 py-1 bg-green-600 text-white rounded" onClick={()=>handleAction(r.id, 'approve')}>Approve</button>
                        <button className="px-3 py-1 bg-red-600 text-white rounded" onClick={()=>handleAction(r.id, 'reject')}>Reject</button>
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
