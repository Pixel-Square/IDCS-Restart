import React, { useState, useEffect } from 'react';
import { Eye, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { getPendingApprovals, getMyApprovals, processApproval, getRequest } from '../../services/staffRequests';
import fetchWithAuth from '../../services/fetchAuth';
import type { StaffRequest } from '../../types/staffRequests';
import RequestDetailsModal from './RequestDetailsModal';
import { formatShortFormValue } from './formValueUtils';

interface Ac21EditRequest {
  id: number;
  exam_info?: {
    exam?: string;
    subject_code?: string;
    subject_name?: string;
    section_name?: string;
    department_code?: string;
    department_name?: string;
    department_short_name?: string;
  };
  requested_by_name?: string;
  requested_by_username?: string;
  requested_by_staff_id?: string;
  requested_by_profile_image?: string;
  requested_at?: string;
  reason?: string;
  status?: string;
}

type QuickAction =
  | { kind: 'staff'; request: StaffRequest; type: 'approve' | 'reject' }
  | { kind: 'ac21'; request: Ac21EditRequest; type: 'approve' | 'reject' };

const initials = (name: string) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('') || 'U';

const extractErrorMessage = async (res: Response, fallback: string) => {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data: any = await res.json().catch(() => ({}));
      return String(data?.detail || data?.error || data?.message || fallback);
    }
    const text = await res.text().catch(() => '');
    if (text?.trim()) return text.trim();
  } catch {
    // ignore
  }
  return fallback;
};

export default function PendingApprovalsPage() {
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewRequest, setViewRequest] = useState<StaffRequest | null>(null);
  const [viewAc21Request, setViewAc21Request] = useState<Ac21EditRequest | null>(null);
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyViewRequest, setHistoryViewRequest] = useState<StaffRequest | null>(null);
  const [loadingHistoryRequest, setLoadingHistoryRequest] = useState(false);

  const [ac21Pending, setAc21Pending] = useState<Ac21EditRequest[]>([]);
  const [ac21Loading, setAc21Loading] = useState(false);
  const [ac21Error, setAc21Error] = useState<string | null>(null);

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

  const isAc21Pending = (st: string | undefined) => {
    const s = String(st || '').toUpperCase();
    return s === 'PENDING' || s === 'HOD_PENDING' || s === 'IQAC_PENDING';
  };

  const loadAc21Pending = async () => {
    setAc21Loading(true);
    setAc21Error(null);
    try {
      const response = await fetchWithAuth('/api/academic-v2/edit-requests/');
      if (!response.ok) {
        // If user doesn't have access/feature enabled, just hide this section quietly.
        setAc21Pending([]);
        return;
      }
      const data: any = await response.json();
      const all: Ac21EditRequest[] = Array.isArray(data) ? data : (data.results || []);
      const pending = all.filter(r => isAc21Pending(r.status));
      pending.sort((a, b) => new Date(b.requested_at || 0).getTime() - new Date(a.requested_at || 0).getTime());
      setAc21Pending(pending);
    } catch {
      setAc21Error('Failed to load AC 2.1 pending approvals');
    } finally {
      setAc21Loading(false);
    }
  };

  useEffect(() => {
    load();
    loadHistory();
    loadAc21Pending();
  }, []);

  const getFirstTextFieldValue = (req: StaffRequest): string => {
    // Find first text or textarea field
    if (req.template?.form_schema?.length > 0) {
      const textField = req.template.form_schema.find(f => f.type === 'text' || f.type === 'textarea');
      if (textField && req.form_data[textField.name]) {
        return formatShortFormValue(req.form_data[textField.name]);
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

  const openQuickAction = (
    item: { kind: 'staff'; request: StaffRequest } | { kind: 'ac21'; request: Ac21EditRequest },
    type: 'approve' | 'reject'
  ) => {
    setQuickAction({ ...item, type } as QuickAction);
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
      if (quickAction.kind === 'staff') {
        await processApproval(quickAction.request.id, {
          action: quickAction.type,
          comments: actionComment.trim(),
        });
      } else {
        const url = `/api/academic-v2/edit-requests/${quickAction.request.id}/${quickAction.type}/`;
        const payload =
          quickAction.type === 'approve'
            ? { notes: actionComment.trim() }
            : { reason: actionComment.trim() };
        const res = await fetchWithAuth(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const msg = await extractErrorMessage(res, `Failed to ${quickAction.type} request`);
          throw new Error(msg);
        }
      }
      setQuickAction(null);
      await Promise.all([load(true), loadHistory(), loadAc21Pending()]);
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : `Failed to ${quickAction.type} request`;
      setActionError(msg);
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

  const ac21AsRows = ac21Pending.map(r => ({
    kind: 'ac21' as const,
    id: r.id,
    submitted_at: r.requested_at || '',
    staff_id: r.requested_by_staff_id || r.requested_by_username || '—',
    name: r.requested_by_name || r.requested_by_username || '—',
    form: 'AC 2.1 Edit Request',
    reason_label: 'Reason',
    reason_value: r.reason || '—',
    raw: r,
  }));

  const staffAsRows = requests.map(req => ({
    kind: 'staff' as const,
    id: req.id,
    submitted_at: req.created_at,
    staff_id: req.applicant.staff_id || req.applicant.username,
    name: req.applicant.full_name || req.applicant.username,
    form: req.template.name,
    reason_label: getFirstTextFieldLabel(req),
    reason_value: getFirstTextFieldValue(req),
    raw: req,
  }));

  const rows = [...ac21AsRows, ...staffAsRows].sort(
    (a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* ── Pending Approvals ── */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pending Approvals</h2>
            <p className="text-sm text-gray-500 mt-1">
              {rows.length} request{rows.length !== 1 ? 's' : ''} awaiting your approval
            </p>
          </div>
          <button
            onClick={async () => {
              await Promise.all([load(true), loadAc21Pending()]);
            }}
            disabled={refreshing || ac21Loading}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={refreshing || ac21Loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {ac21Error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {ac21Error}
          </div>
        )}

        {rows.length === 0 ? (
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
                {rows.map(row => (
                  <tr key={`${row.kind}-${row.id}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{row.staff_id}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{row.name}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.form}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span className="block text-xs text-gray-400 mb-0.5">{row.reason_label}</span>
                      <span>{row.reason_value}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {row.submitted_at ? fmtDate(row.submitted_at) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() =>
                            openQuickAction(
                              row.kind === 'staff'
                                ? { kind: 'staff', request: row.raw as StaffRequest }
                                : { kind: 'ac21', request: row.raw as Ac21EditRequest },
                              'approve'
                            )
                          }
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle size={13} /> Approve
                        </button>
                        <button
                          onClick={() =>
                            openQuickAction(
                              row.kind === 'staff'
                                ? { kind: 'staff', request: row.raw as StaffRequest }
                                : { kind: 'ac21', request: row.raw as Ac21EditRequest },
                              'reject'
                            )
                          }
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition-colors"
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.kind === 'staff' ? (
                        <button
                          onClick={() => setViewRequest(row.raw as StaffRequest)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="View full details"
                        >
                          <Eye size={18} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setViewAc21Request(row.raw as Ac21EditRequest)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="View full details"
                        >
                          <Eye size={18} />
                        </button>
                      )}
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
                {quickAction.kind === 'staff'
                  ? quickAction.request.applicant.full_name || quickAction.request.applicant.username
                  : quickAction.request.requested_by_name || quickAction.request.requested_by_username || '—'}
              </span>{' '}
              — {quickAction.kind === 'staff' ? quickAction.request.template.name : 'AC 2.1 Edit Request'}
            </p>

            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3">
              {quickAction.kind === 'staff' ? (
                quickAction.request.applicant.profile_image ? (
                  <img
                    src={quickAction.request.applicant.profile_image}
                    alt={quickAction.request.applicant.full_name || quickAction.request.applicant.username}
                    className="w-12 h-12 rounded-full object-cover border border-gray-200 bg-white"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                    {initials(quickAction.request.applicant.full_name || quickAction.request.applicant.username)}
                  </div>
                )
              ) : quickAction.request.requested_by_profile_image ? (
                <img
                  src={quickAction.request.requested_by_profile_image}
                  alt={quickAction.request.requested_by_name || quickAction.request.requested_by_username || 'User'}
                  className="w-12 h-12 rounded-full object-cover border border-gray-200 bg-white"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                  {initials(quickAction.request.requested_by_name || quickAction.request.requested_by_username || 'User')}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {quickAction.kind === 'staff'
                    ? quickAction.request.applicant.full_name || quickAction.request.applicant.username
                    : quickAction.request.requested_by_name || quickAction.request.requested_by_username || '—'}
                </div>
                <div className="text-xs text-gray-600 truncate">
                  {quickAction.kind === 'staff'
                    ? quickAction.request.applicant.staff_id || quickAction.request.applicant.username
                    : quickAction.request.requested_by_staff_id || quickAction.request.requested_by_username || '—'}
                </div>
              </div>
            </div>

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

      {/* ── View AC 2.1 Details Modal ── */}
      {viewAc21Request && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="border-b border-gray-200 px-6 py-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">AC 2.1 Edit Request</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Submitted {viewAc21Request.requested_at ? fmtDate(viewAc21Request.requested_at) : '—'}
                </p>
              </div>
              <button
                onClick={() => setViewAc21Request(null)}
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3">
                {viewAc21Request.requested_by_profile_image ? (
                  <img
                    src={viewAc21Request.requested_by_profile_image}
                    alt={viewAc21Request.requested_by_name || viewAc21Request.requested_by_username}
                    className="w-12 h-12 rounded-full object-cover border border-gray-200 bg-white"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                    {initials(viewAc21Request.requested_by_name || viewAc21Request.requested_by_username || 'User')}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {viewAc21Request.requested_by_name || viewAc21Request.requested_by_username || '—'}
                  </div>
                  <div className="text-xs text-gray-600 truncate">
                    {viewAc21Request.requested_by_staff_id || viewAc21Request.requested_by_username || '—'}
                  </div>
                </div>
                <div className="ml-auto text-xs text-gray-600">
                  {String(viewAc21Request.status || '').replaceAll('_', ' ') || '—'}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="text-xs font-semibold text-gray-500">Course</div>
                  <div className="text-sm font-medium text-gray-900 mt-1">
                    {viewAc21Request.exam_info?.subject_code || '—'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {viewAc21Request.exam_info?.subject_name || '—'}
                  </div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="text-xs font-semibold text-gray-500">Exam / Section</div>
                  <div className="text-sm font-medium text-gray-900 mt-1">
                    {viewAc21Request.exam_info?.exam || '—'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {viewAc21Request.exam_info?.section_name || '—'}
                  </div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="text-xs font-semibold text-gray-500">Department</div>
                  <div className="text-sm font-medium text-gray-900 mt-1">
                    {viewAc21Request.exam_info?.department_short_name ||
                      viewAc21Request.exam_info?.department_name ||
                      viewAc21Request.exam_info?.department_code ||
                      '—'}
                  </div>
                </div>
              </div>

              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="text-xs font-semibold text-gray-500">Reason</div>
                <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">
                  {viewAc21Request.reason || '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── View History Request Modal ── */}
      {historyViewRequest && (
        <RequestDetailsModal request={historyViewRequest} onClose={() => setHistoryViewRequest(null)} />
      )}
    </div>
  );
}
