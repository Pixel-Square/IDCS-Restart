import React, { useEffect, useState } from 'react';
import { X, Check, XCircle, Users, Calendar, Clock } from 'lucide-react';
import fetchWithAuth from '../services/fetchAuth';

interface AttendanceAssignmentRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestUpdated?: () => void;
}

export default function AttendanceAssignmentRequestsModal({
  isOpen,
  onClose,
  onRequestUpdated,
}: AttendanceAssignmentRequestsModalProps) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) fetchRequests();
  }, [isOpen]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/academics/attendance-assignment-requests/?status=PENDING');
      if (res.ok) {
        const data = await res.json();
        const received = (data.received || []).filter(
          (r: any) => r.status === 'PENDING'
        );
        setRequests(received);
      }
    } catch (error) {
      console.error('Error fetching assignment requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId: number, action: 'approve' | 'reject') => {
    setActionLoading(requestId);
    try {
      const res = await fetchWithAuth(
        `/api/academics/attendance-assignment-requests/${requestId}/${action}/`,
        { method: 'POST' }
      );
      if (res.ok) {
        const data = await res.json();
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        if (onRequestUpdated) onRequestUpdated();
        alert(data.message || `Request ${action}d successfully`);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to ${action} request`);
      }
    } catch (error) {
      console.error(`Error ${action}ing request:`, error);
      alert(`Failed to ${action} request`);
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Attendance Assignment Requests</h3>
              <p className="text-sm text-gray-600">
                {requests.length} request{requests.length !== 1 ? 's' : ''} waiting for your approval
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600">No pending assignment requests</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((req) => (
                <div key={req.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-gray-900">{req.requested_by_name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                        <Calendar className="w-3 h-3" />
                        <span>{req.date}</span>
                        <Clock className="w-3 h-3 ml-2" />
                        <span>
                          {req.created_at ? new Date(req.created_at).toLocaleTimeString() : ''}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                      Pending
                    </span>
                  </div>

                  <div className="bg-white rounded p-3 mb-3">
                    <p className="text-xs text-gray-500 mb-1">Section</p>
                    <p className="font-medium text-sm text-gray-900">{req.section_name}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {req.assignment_type === 'PERIOD'
                        ? `Period Attendance${req.period_label ? ` — ${req.period_label}` : ''}`
                        : 'Daily Attendance'}
                    </p>
                  </div>

                  {req.reason && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">Reason</p>
                      <p className="text-sm text-gray-700 italic">"{req.reason}"</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(req.id, 'approve')}
                      disabled={actionLoading === req.id}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {actionLoading === req.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Approve
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'reject')}
                      disabled={actionLoading === req.id}
                      className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {actionLoading === req.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" />
                          Reject
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
