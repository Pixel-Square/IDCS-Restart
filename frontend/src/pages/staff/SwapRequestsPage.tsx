import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { Bell, Check, X, Calendar, Clock, User, RefreshCw, ArrowLeft } from 'lucide-react';
import { getCachedMe } from '../../services/auth';
import fetchWithAuth from '../../services/fetchAuth';

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

export default function SwapRequestsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('ALL');
  const [receivedRequests, setReceivedRequests] = useState<SwapRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    const cachedUser = getCachedMe();
    setUser(cachedUser);
  }, []);

  useEffect(() => {
    if (user?.profile?.id) {
      fetchSwapRequests();
    }
  }, [user, statusFilter]);

  const fetchSwapRequests = async () => {
    try {
      setLoading(true);
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const resp = await fetchWithAuth(`/api/timetable/swap-requests/${params}`);
      const data = await resp.json();

      if (data.success) {
        setReceivedRequests(data.received || []);
        setSentRequests(data.sent || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch swap requests:', err);
      setError(err.message || 'Failed to load swap requests');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId: number, action: 'approve' | 'reject' | 'cancel', message?: string) => {
    try {
      setActionLoading(requestId);
      const resp = await fetchWithAuth(
        `/api/timetable/swap-requests/${requestId}/${action}/`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message || '' }) }
      );
      const data = await resp.json();

      if (data.success) {
        alert(data.message);
        fetchSwapRequests();
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

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredRequests = activeTab === 'received' ? receivedRequests : sentRequests;

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-6">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Period Swap Requests</h2>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab('received')}
              className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'received'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Received
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'sent'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Sent
            </button>
          </nav>
        </div>

        {/* Status Filter */}
        <div className="mb-6 flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Status:</span>
          <div className="flex gap-2">
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as any)}
                className={`px-3 py-1 text-sm rounded-lg ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <button
            onClick={fetchSwapRequests}
            className="ml-auto flex items-center gap-1 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No {activeTab === 'received' ? 'received' : 'sent'} swap requests
            {statusFilter !== 'ALL' && ` with status ${statusFilter}`}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => (
              <div
                key={request.id}
                className={`border rounded-lg p-4 ${
                  request.status === 'PENDING' && activeTab === 'received'
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4 text-gray-600" />
                      <span className="font-semibold text-gray-900">
                        {activeTab === 'received' ? request.requested_by_name : request.requested_to_name}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusBadgeClass(request.status)}`}>
                        {request.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="bg-gray-50 rounded p-3">
                        <div className="font-medium text-gray-700 mb-1">
                          {activeTab === 'sent' ? 'Your Period:' : 'Their Period:'}
                        </div>
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

                      <div className="bg-gray-50 rounded p-3">
                        <div className="font-medium text-gray-700 mb-1">
                          {activeTab === 'sent' ? 'Their Period:' : 'Your Period:'}
                        </div>
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

                    {request.response_message && (
                      <div className="mt-2 text-sm">
                        <span className="font-medium text-gray-700">Response: </span>
                        <span className="text-gray-600">{request.response_message}</span>
                      </div>
                    )}

                    <div className="text-xs text-gray-500 mt-2">
                      Section: {request.section_name} •
                      Requested {formatDateTime(request.created_at)}
                      {request.responded_at && ` • Responded ${formatDateTime(request.responded_at)}`}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {request.status === 'PENDING' && (
                  <div className="flex gap-2 mt-3">
                    {activeTab === 'received' ? (
                      <>
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
                            if (msg !== null) {
                              handleAction(request.id, 'reject', msg);
                            }
                          }}
                          disabled={actionLoading === request.id}
                          className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to cancel this swap request?')) {
                            handleAction(request.id, 'cancel');
                          }
                        }}
                        disabled={actionLoading === request.id}
                        className="flex items-center gap-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        <X className="w-4 h-4" />
                        {actionLoading === request.id ? 'Processing...' : 'Cancel Request'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
