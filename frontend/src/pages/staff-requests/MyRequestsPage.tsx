import React, { useState, useEffect } from 'react';
import { Plus, Eye, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { getMyRequests } from '../../services/staffRequests';
import type { StaffRequest } from '../../types/staffRequests';
import RequestDetailsModal from './RequestDetailsModal';
import NewRequestModal from './NewRequestModal';
import { formatShortFormValue } from './formValueUtils';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const STATUS_FILTERS: StatusFilter[] = ['all', 'pending', 'approved', 'rejected'];

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<StaffRequest | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyRequests();
      // Latest first
      setRequests([...data].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRequests(); }, []);

  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter);

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

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
            <CheckCircle size={12} /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-medium">
            <XCircle size={12} /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
            <Clock size={12} /> Pending
          </span>
        );
    }
  };

  const fmtDate = (ds: string) =>
    new Date(ds).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-600">
        Loading your requests…
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Requests</h2>
            <p className="text-sm text-gray-500 mt-1">
              View your request history and submit new requests
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadRequests}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => setShowNewRequest(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus size={18} /> New Request
            </button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500">
            {filtered.length} request{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Clock size={48} className="mx-auto mb-4 text-gray-300" />
            {statusFilter === 'all' ? (
              <>
                <p className="mb-3">You haven't submitted any requests yet.</p>
                <button
                  onClick={() => setShowNewRequest(true)}
                  className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  Submit your first request →
                </button>
              </>
            ) : (
              <p>No {statusFilter} requests found.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Form</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Reason</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Submitted</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(req => (
                  <tr
                    key={req.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedRequest(req)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {req.template.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span className="block text-xs text-gray-400 mb-0.5">{getFirstTextFieldLabel(req)}</span>
                      <span>{getFirstTextFieldValue(req)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(req.created_at)}</td>
                    <td className="px-4 py-3">{statusBadge(req.status)}</td>
                    <td
                      className="px-4 py-3 text-center"
                      onClick={e => { e.stopPropagation(); setSelectedRequest(req); }}
                    >
                      <button
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="View details"
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

      {selectedRequest && (
        <RequestDetailsModal request={selectedRequest} onClose={() => setSelectedRequest(null)} />
      )}

      {showNewRequest && (
        <NewRequestModal
          onClose={() => setShowNewRequest(false)}
          onCreated={() => { setShowNewRequest(false); loadRequests(); }}
        />
      )}
    </div>
  );
}
