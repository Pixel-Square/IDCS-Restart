import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { CheckCircle, XCircle, Clock, User, Calendar, FileText } from 'lucide-react'

interface HalfDayRequest {
  id: number
  staff_name: string
  staff_full_name: string
  staff_id: string
  department: {
    id: number
    name: string
    code: string
  } | null
  attendance_date: string
  requested_at: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by_name: string | null
  reviewed_at: string | null
  review_notes: string
}

export default function HalfDayRequestsApproval() {
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<HalfDayRequest[]>([])
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [isHodAhod, setIsHodAhod] = useState(false)

  useEffect(() => {
    loadRequests()
  }, [])

  async function loadRequests() {
    setLoading(true)
    try {
      const res = await fetchWithAuth('/api/staff-attendance/halfday-requests/pending_for_review/')
      if (!res.ok) {
        if (res.status === 403) {
          // User is not HOD/AHOD
          setRequests([])
          setIsHodAhod(false)
          return
        }
        throw new Error('Failed to load requests')
      }
      const data = await res.json()
      setRequests(data || [])
      setIsHodAhod(true)
    } catch (e) {
      console.error('Failed to load half-day requests:', e)
      setRequests([])
      setIsHodAhod(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleReview(requestId: number, action: 'approve' | 'reject') {
    const actionText = action === 'approve' ? 'approve' : 'reject'
    if (!window.confirm(`Are you sure you want to ${actionText} this period attendance access request?`)) {
      return
    }

    try {
      const res = await fetchWithAuth(
        `/api/staff-attendance/halfday-requests/${requestId}/review_request/`,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
            review_notes: reviewNotes
          })
        }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.detail || `Failed to ${actionText} request`)
      }

      alert(`Period attendance access request ${action}d successfully!`)
      setReviewNotes('')
      setReviewingId(null)
      await loadRequests()
    } catch (e) {
      console.error(`Failed to ${actionText} request:`, e)
      alert(`Failed to ${actionText} request: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Don't show anything if user is not HOD/AHOD
  if (!loading && !isHodAhod && requests.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-600" />
          Period Attendance Access Requests
        </h3>
        <button
          onClick={loadRequests}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading requests...</p>
        </div>
      )}

      {!loading && requests.length === 0 && (
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No pending period attendance access requests</p>
          <p className="text-sm text-gray-500 mt-1">
            Staff members can request access to mark period attendance
          </p>
        </div>
      )}

      {!loading && requests.length > 0 && (
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900">
                      {request.staff_full_name}
                    </h4>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                      {request.staff_id}
                    </span>
                  </div>
                  {request.department && (
                    <p className="text-sm text-gray-600">
                      {request.department.name} ({request.department.code})
                    </p>
                  )}
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  request.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-800'
                    : request.status === 'approved'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Date: <strong>{new Date(request.attendance_date).toLocaleDateString()}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>
                    Requested: {new Date(request.requested_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-700 mb-1">Request Reason:</p>
                    <p className="text-sm text-gray-900">{request.reason || 'No reason provided'}</p>
                  </div>
                </div>
              </div>

              {request.status === 'pending' && (
                <div className="border-t pt-3">
                  {reviewingId === request.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Review Notes (Optional)
                        </label>
                        <textarea
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Add any comments about your decision..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          rows={2}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReview(request.id, 'approve')}
                          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleReview(request.id, 'reject')}
                          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                        <button
                          onClick={() => {
                            setReviewingId(null)
                            setReviewNotes('')
                          }}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReviewingId(request.id)}
                      className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                    >
                      Review Request
                    </button>
                  )}
                </div>
              )}

              {request.status !== 'pending' && (
                <div className="border-t pt-3 text-sm text-gray-600">
                  <p>
                    <strong>Reviewed by:</strong> {request.reviewed_by_name || 'Unknown'}
                  </p>
                  {request.reviewed_at && (
                    <p>
                      <strong>Reviewed at:</strong> {new Date(request.reviewed_at).toLocaleString()}
                    </p>
                  )}
                  {request.review_notes && (
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                      <p className="text-xs font-medium text-gray-700 mb-1">Review Notes:</p>
                      <p className="text-sm">{request.review_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
