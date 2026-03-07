import React, { useState, useEffect } from 'react';
import { Clock, User, RefreshCw } from 'lucide-react';
import { getPendingApprovals } from '../../services/staffRequests';
import type { StaffRequest } from '../../types/staffRequests';
import ApprovalReviewModal from './ApprovalReviewModal';

export default function PendingApprovalsPage() {
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<StaffRequest | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const loadPendingApprovals = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    
    try {
      const data = await getPendingApprovals();
      setRequests(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load pending approvals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadHistory = async () => {
    try {
      const h = await (await import('../../services/staffRequests')).getMyApprovals();
      setHistory(h);
    } catch (err: any) {
      // ignore history errors for now
    }
  };

  useEffect(() => {
    loadPendingApprovals();
    loadHistory();
  }, []);

  const handleApprovalProcessed = () => {
    setSelectedRequest(null);
    loadPendingApprovals();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Loading pending approvals...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Pending Approvals</h2>
              <p className="text-sm text-gray-600 mt-1">
                Review and approve staff requests awaiting your action
              </p>
            </div>
            <button
              onClick={() => loadPendingApprovals(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-yellow-600" />
            <span className="text-sm font-medium text-gray-700">
              {requests.length} request{requests.length !== 1 ? 's' : ''} awaiting your approval
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Requests List */}
        <div className="p-6">
          {requests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="mb-2">No pending approvals at this time.</p>
              <p className="text-sm">All requests have been processed or no requests require your approval yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-all cursor-pointer hover:border-blue-300"
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {request.template.name}
                        </h3>
                        <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                          Awaiting Your Approval
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-gray-700 mb-3">
                        <User size={16} />
                        <span className="text-sm">
                          <span className="font-medium">Applicant:</span>{' '}
                          {request.applicant.full_name || request.applicant.username}
                        </span>
                        {request.applicant.email && (
                          <span className="text-sm text-gray-500">({request.applicant.email})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Request Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-700 mb-4">
                    <div>
                      <span className="font-medium">Submitted:</span>{' '}
                      {formatDate(request.created_at)}
                    </div>
                    <div>
                      <span className="font-medium">Current Step:</span>{' '}
                      {request.current_step} of {request.total_steps}
                    </div>
                    <div>
                      <span className="font-medium">Progress:</span>{' '}
                      {request.completed_steps || 0}/{request.total_steps || 0} approved
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full transition-all"
                        style={{
                          width: `${((request.completed_steps || 0) / (request.total_steps || 1)) * 100}%`
                        }}
                      />
                    </div>
                  </div>

                  {/* Request Data Preview */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-700 mb-2">Request Details:</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs text-gray-600">
                      {Object.entries(request.form_data).slice(0, 6).map(([key, value]) => (
                        <div key={key}>
                          <span className="font-medium text-gray-700">
                            {key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}:
                          </span>{' '}
                          <span className="text-gray-900">
                            {String(value).substring(0, 30)}
                            {String(value).length > 30 ? '...' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Previous Approvals */}
                  {request.completed_steps && request.completed_steps > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-700 mb-2">
                        Previous Approvals ({request.completed_steps}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {request.approval_logs?.map((log, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded"
                          >
                            Step {log.step_order}: {log.approver_role} ✓
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Button */}
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRequest(request);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Review & Approve/Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Approval Review Modal */}
      {selectedRequest && (
        <ApprovalReviewModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onProcessed={handleApprovalProcessed}
        />
      )}

      {/* History Panel */}
      <div className="max-w-7xl mx-auto p-6 mt-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Your Approval History</h3>
          {history.length === 0 ? (
            <div className="text-sm text-gray-500">You have not approved or rejected any requests yet.</div>
          ) : (
            <div className="space-y-3">
              {history.map((log) => (
                <div key={log.id} className="flex items-center justify-between border rounded p-3">
                  <div>
                    <div className="text-sm font-medium">{log.request_summary?.template_name} — Step {log.step_order}</div>
                    <div className="text-xs text-gray-600">Action: {log.action} • {log.request_summary?.applicant_name}</div>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    {new Date(log.action_date).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
