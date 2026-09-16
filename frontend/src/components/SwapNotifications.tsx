import React, { useState, useEffect } from 'react';
import { Bell, Check, X, Calendar, Clock, User, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import fetchWithAuth from '../services/fetchAuth';

interface SwapRequest {
  id: number;
  section_name: string;
  requested_by: number;
  requested_by_name: string;
  requested_to: number;
  requested_to_name: string;
  from_date: string;
  from_period: number;
  from_period_label: string;
  from_subject_text: string;
  to_date: string;
  to_period: number;
  to_period_label: string;
  to_subject_text: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string;
  response_message: string;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
}

export default function SwapNotifications() {
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    fetchSwapRequests();
  }, []);

  const fetchSwapRequests = async () => {
    try {
      setLoading(true);
      const resp = await fetchWithAuth('/api/timetable/swap-requests/?status=PENDING');
      const data = await resp.json();

      if (data.success) {
        setPendingRequests(data.received || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch swap requests:', err);
      setError(err.message || 'Failed to load swap requests');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId: number, action: 'approve' | 'reject', message?: string) => {
    try {
      setActionLoading(requestId);
      const resp = await fetchWithAuth(
        `/api/timetable/swap-requests/${requestId}/${action}/`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message || '' }) }
      );
      const data = await resp.json();

      if (data.success) {
        setPendingRequests(prev => prev.filter(req => req.id !== requestId));
        alert(data.message);
      }
    } catch (err: any) {
      console.error(`Failed to ${action} swap request:`, err);
      alert(err.message || `Failed to ${action} request`);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Period Swap Requests</h2>
        </div>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-semibold text-gray-900">Period Swap Requests</h2>
        </div>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (pendingRequests.length === 0) {
    return null; // Don't show anything if there are no pending requests
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-5 h-5 text-blue-600" />
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {pendingRequests.length}
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Period Swap Requests</h2>
        </div>
        <button
          onClick={() => navigate('/staff/swap-requests')}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          View All
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        {pendingRequests.map((request) => (
          <div
            key={request.id}
            className="border border-blue-200 bg-blue-50 rounded-lg p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-gray-600" />
                  <span className="font-semibold text-gray-900">
                    {request.requested_by_name}
                  </span>
                  <span className="text-gray-600">wants to swap periods</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="bg-white rounded p-3">
                    <div className="font-medium text-gray-700 mb-1">Their Period:</div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(request.from_date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>{request.from_period_label}</span>
                    </div>
                    <div className="text-gray-900 font-medium mt-1">
                      {request.from_subject_text || 'No subject'}
                    </div>
                  </div>

                  <div className="bg-white rounded p-3">
                    <div className="font-medium text-gray-700 mb-1">Your Period:</div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(request.to_date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>{request.to_period_label}</span>
                    </div>
                    <div className="text-gray-900 font-medium mt-1">
                      {request.to_subject_text || 'No subject'}
                    </div>
                  </div>
                </div>

                {request.reason && (
                  <div className="mt-3 text-sm">
                    <span className="font-medium text-gray-700">Reason: </span>
                    <span className="text-gray-600">{request.reason}</span>
                  </div>
                )}

                <div className="text-xs text-gray-500 mt-2">
                  Section: {request.section_name} • Requested {formatDate(request.created_at)}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleAction(request.id, 'approve')}
                disabled={actionLoading === request.id}
                className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <Check className="w-4 h-4" />
                {actionLoading === request.id ? 'Processing...' : 'Approve'}
              </button>

              <button
                onClick={() => {
                  const msg = prompt('Optional: Enter a reason for rejection');
                  if (msg !== null) { // null means cancelled, empty string is valid
                    handleAction(request.id, 'reject', msg);
                  }
                }}
                disabled={actionLoading === request.id}
                className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <X className="w-4 h-4" />
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
