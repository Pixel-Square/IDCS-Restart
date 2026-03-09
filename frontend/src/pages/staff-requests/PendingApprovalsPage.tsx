import React, { useState, useEffect } from 'react';
import { Eye, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { getPendingApprovals, getMyApprovals, processApproval, getRequest } from '../../services/staffRequests';
import type { StaffRequest } from '../../types/staffRequests';
import RequestDetailsModal from './RequestDetailsModal';

interface QuickAction {
  request: StaffRequest;
  type: 'approve' | 'reject';
}

export default function PendingApprovalsPage() {
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewRequest, setViewRequest] = useState<StaffRequest | null>(null);
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyViewRequest, setHistoryViewRequest] = useState<StaffRequest | null>(null);
  const [loadingHistoryRequest, setLoadingHistoryRequest] = useState(false);

  const load = async (showRefresh = false) => {
    showRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await getPendingApprovals();
      setRequests([...data].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load pending approvals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadHistory = async () => {
    try {
      const h = await getMyApprovals();
      setHistory([...h].sort((a: any, b: any) =>
        new Date(b.action_date).getTime() - new Date(a.action_date).getTime()
      ));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    loadHistory();
  }, []);

  const getFirstTextFieldValue = (req: StaffRequest): string => {
    // Find first text or textarea field
    if (req.template?.form_schema?.length > 0) {
      const textField = req.template.form_schema.find(f => f.type === 'text' || f.type === 'textarea');
      if (textField && req.form_data[textField.name]) {
        const str = String(req.form_data[textField.name] ?? '—');
        return str.length > 50 ? str.substring(0, 50) + '…' : str || '—';
      }
    }
    return '—';
  };

  const getFirstTextFieldLabel = (req: StaffRequest): string => {
    // Find first text or textarea field in template schema
    if (req.template?.form_schema?.length > 0) {
      const textField = req.template.form_schema.find(f => f.type === 'text' || f.type === 'textarea');
      if (textField) return textField.label;
    }
    return 'Details';
  };

  const openQuickAction = (req: StaffRequest, type: 'approve' | 'reject') => {
    setQuickAction({ request: req, type });
    setActionComment('');
    setActionError(null);
  };

  const submitQuickAction = async () => {
    if (!quickAction) return;
    if (quickAction.type === 'reject' && !actionComment.trim()) {
      setActionError('Rejection reason is required');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await processApproval(quickAction.request.id, {
        action: quickAction.type,
        comments: actionComment.trim(),
      });
      setQuickAction(null);
      load();
      loadHistory();
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || `Failed to ${quickAction.type} request`);
      setSubmitting(false);
    }
  };

  const openHistoryRequest = async (id: number) => {
    setLoadingHistoryRequest(true);
    try {
      const req = await getRequest(id);
      setHistoryViewRequest(req);
    } catch (e) {
      alert('Failed to load request details');
    } finally {
      setLoadingHistoryRequest(false);
    }
  };

  const fmtDate = (ds: string) =>
    new Date(ds).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-600">
        Loading pending approvals…
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* ── Pending Approvals ── */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pending Approvals</h2>
            <p className="text-sm text-gray-500 mt-1">
              {requests.length} request{requests.length !== 1 ? 's' : ''} awaiting your approval
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {requests.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Clock size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No pending approvals at this time.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Staff ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Form</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Reason</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Submitted</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Actions</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {req.applicant.staff_id || req.applicant.username}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {req.applicant.full_name || req.applicant.username}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{req.template.name}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span className="block text-xs text-gray-400 mb-0.5">{getFirstTextFieldLabel(req)}</span>
                      <span>{getFirstTextFieldValue(req)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(req.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openQuickAction(req, 'approve')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle size={13} /> Approve
                        </button>
                        <button
                          onClick={() => openQuickAction(req, 'reject')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition-colors"
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setViewRequest(req)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="View full details"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Approval History ── */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-900">Your Approval History</h3>
        </div>
        {history.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500 text-center">
            You haven't approved or rejected any requests yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Staff ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Applicant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Reason</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Action</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {log.request_summary?.applicant_staff_id || log.request_summary?.applicant_username || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {log.request_summary?.applicant_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span>{log.request_summary?.form_reason || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          log.action === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.action === 'approved' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {log.action.charAt(0).toUpperCase() + log.action.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(log.action_date).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openHistoryRequest(log.request_id)}
                        disabled={loadingHistoryRequest}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                        title="View full request"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick Action Modal ── */}
      {quickAction && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3
              className={`text-lg font-bold mb-1 ${
                quickAction.type === 'approve' ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {quickAction.type === 'approve' ? '✓ Approve Request' : '✗ Reject Request'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">
                {quickAction.request.applicant.full_name || quickAction.request.applicant.username}
              </span>{' '}
              — {quickAction.request.template.name}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comments{' '}
                {quickAction.type === 'reject' ? (
                  <span className="text-red-500">*</span>
                ) : (
                  <span className="text-gray-400 font-normal">(optional)</span>
                )}
              </label>
              <textarea
                value={actionComment}
                onChange={e => setActionComment(e.target.value)}
                rows={3}
                placeholder={
                  quickAction.type === 'reject' ? 'Reason for rejection…' : 'Optional comments…'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {actionError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                {actionError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setQuickAction(null)}
                disabled={submitting}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitQuickAction}
                disabled={submitting}
                className={`px-4 py-2 text-sm text-white rounded transition-colors disabled:opacity-50 ${
                  quickAction.type === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {submitting
                  ? 'Processing…'
                  : quickAction.type === 'approve'
                  ? 'Confirm Approve'
                  : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Details Modal ── */}
      {viewRequest && (
        <RequestDetailsModal request={viewRequest} onClose={() => setViewRequest(null)} />
      )}

      {/* ── View History Request Modal ── */}
      {historyViewRequest && (
        <RequestDetailsModal request={historyViewRequest} onClose={() => setHistoryViewRequest(null)} />
      )}
    </div>
  );
}
