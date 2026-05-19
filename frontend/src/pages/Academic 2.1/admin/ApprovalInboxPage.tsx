/**
 * Approval Inbox Page
 * Review and process edit requests from faculty (exam marks + CQI)
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, Eye, Filter, Search } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface ExamInfo {
  exam: string;
  subject_code: string;
  subject_name: string;
  section_name: string;
  department_code?: string;
  department_name?: string;
  department_short_name?: string;
}

interface EditRequest {
  id: string;
  /** 'exam' for regular mark-entry requests; 'CQI' for CQI requests */
  request_type?: 'CQI' | 'exam';
  /** Present for regular mark-entry requests */
  exam_info?: ExamInfo;
  /** Present for CQI requests (same shape) */
  cqi_info?: ExamInfo;
  requested_by: string;
  requested_by_name: string;
  requested_by_username?: string;
  requested_by_staff_id?: string;
  requested_by_profile_image?: string;
  requested_at: string;
  reason: string;
  status: string;
  current_stage: number;
  approval_history?: any[];
  approved_until?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
}

const initialsFromName = (name: string) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('') || 'U';

/** Return the exam/course info for a request regardless of its type. */
function getInfo(req: EditRequest): ExamInfo {
  return (req.request_type === 'CQI' ? req.cqi_info : req.exam_info) || {
    exam: '—', subject_code: '—', subject_name: '—', section_name: '—',
  };
}

export default function ApprovalInboxPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<EditRequest[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CQI' | 'EXAM'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<EditRequest | null>(null);
  const [responseNote, setResponseNote] = useState('');

  const readErrorMessage = async (response: Response): Promise<string> => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const data: any = await response.json();
        return (
          data?.detail ||
          data?.error ||
          (typeof data === 'string' ? data : '') ||
          JSON.stringify(data)
        );
      } catch {
        // fall through
      }
    }
    try {
      const text = await response.text();
      return text || `Request failed (HTTP ${response.status})`;
    } catch {
      return `Request failed (HTTP ${response.status})`;
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const isPendingStatus = (status: string) => {
    const s = String(status || '').toUpperCase();
    return s === 'PENDING' || s === 'HOD_PENDING' || s === 'IQAC_PENDING';
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [examRes, cqiRes] = await Promise.all([
        fetchWithAuth('/api/academic-v2/edit-requests/'),
        fetchWithAuth('/api/academic-v2/cqi-edit-requests/'),
      ]);
      if (!examRes.ok) throw new Error('Failed to load exam requests');
      const examData = await examRes.json();
      const examRequests: EditRequest[] = (Array.isArray(examData) ? examData : (examData.results || [])).map((r: any) => ({ ...r, request_type: 'exam' as const }));

      let cqiRequests: EditRequest[] = [];
      if (cqiRes.ok) {
        const cqiData = await cqiRes.json();
        cqiRequests = (Array.isArray(cqiData) ? cqiData : (cqiData.results || [])).map((r: any) => ({ ...r, request_type: 'CQI' as const }));
      }

      // Merge and sort by date descending
      const all = [...examRequests, ...cqiRequests].sort((a, b) =>
        new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
      );
      setRequests(all);
    } catch (error) {
      console.error('Failed to load:', error);
      setMessage({ type: 'error', text: 'Failed to load edit requests' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    const req = requests.find(r => r.id === requestId);
    const base = req?.request_type === 'CQI' ? 'cqi-edit-requests' : 'edit-requests';
    try {
      setProcessing(requestId);
      const response = await fetchWithAuth(`/api/academic-v2/${base}/${requestId}/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: responseNote }),
      });
      
      if (!response.ok) {
        const msg = await readErrorMessage(response);
        throw new Error(msg || 'Approve failed');
      }
      
      setMessage({ type: 'success', text: 'Request approved' });
      setSelectedRequest(null);
      setResponseNote('');
      loadData();
    } catch (error) {
      console.error('Approve failed:', error);
      const msg = error instanceof Error ? error.message : 'Failed to approve request';
      setMessage({ type: 'error', text: msg || 'Failed to approve request' });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!responseNote.trim()) {
      setMessage({ type: 'error', text: 'Please provide a reason for rejection' });
      return;
    }
    const req = requests.find(r => r.id === requestId);
    const base = req?.request_type === 'CQI' ? 'cqi-edit-requests' : 'edit-requests';
    try {
      setProcessing(requestId);
      const response = await fetchWithAuth(`/api/academic-v2/${base}/${requestId}/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: responseNote }),
      });
      
      if (!response.ok) {
        const msg = await readErrorMessage(response);
        throw new Error(msg || 'Reject failed');
      }
      
      setMessage({ type: 'success', text: 'Request rejected' });
      setSelectedRequest(null);
      setResponseNote('');
      loadData();
    } catch (error) {
      console.error('Reject failed:', error);
      const msg = error instanceof Error ? error.message : 'Failed to reject request';
      setMessage({ type: 'error', text: msg || 'Failed to reject request' });
    } finally {
      setProcessing(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (filter !== 'ALL') {
      if (filter === 'PENDING' && !isPendingStatus(r.status)) return false;
      if (filter === 'APPROVED' && String(r.status || '').toUpperCase() !== 'APPROVED') return false;
      if (filter === 'REJECTED' && String(r.status || '').toUpperCase() !== 'REJECTED') return false;
    }
    if (typeFilter !== 'ALL') {
      if (typeFilter === 'CQI' && r.request_type !== 'CQI') return false;
      if (typeFilter === 'EXAM' && r.request_type === 'CQI') return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const info = getInfo(r);
      return (
        info.subject_code?.toLowerCase().includes(query) ||
        info.subject_name?.toLowerCase().includes(query) ||
        info.exam?.toLowerCase().includes(query) ||
        r.requested_by_name?.toLowerCase().includes(query) ||
        info.section_name?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const pendingCount = requests.filter(r => isPendingStatus(r.status)).length;

  const getStatusBadge = (status: string) => {
    const s = String(status || '').toUpperCase();
    switch (s) {
      case 'PENDING':
      case 'HOD_PENDING':
      case 'IQAC_PENDING':
        return <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-sm"><Clock className="w-3 h-3" />Pending</span>;
      case 'APPROVED':
        return <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-sm"><CheckCircle className="w-3 h-3" />Approved</span>;
      case 'REJECTED':
        return <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-sm"><XCircle className="w-3 h-3" />Rejected</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Inbox</h1>
          <p className="text-gray-500 mt-1">Review and process edit requests from faculty</p>
        </div>
        <div className="flex items-center gap-4">
          {pendingCount > 0 && (
            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">
              {pendingCount} pending
            </span>
          )}
          <button onClick={loadData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium">Status:</span>
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-sm ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">Type:</span>
            {(['ALL', 'EXAM', 'CQI'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-lg text-sm ${
                  typeFilter === t
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by subject, exam, faculty, or section..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {filter === 'PENDING' ? 'No pending requests' : 'No requests found'}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type / Exam</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faculty</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRequests.map((req) => {
                const info = getInfo(req);
                const isCqi = req.request_type === 'CQI';
                return (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{info.subject_code}</div>
                    <div className="text-sm text-gray-500">{info.subject_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {isCqi && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 uppercase tracking-wide">CQI</span>
                      )}
                      <span className="text-sm">{info.exam}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{req.requested_by_name}</div>
                    <div className="text-xs text-gray-500">{info.section_name}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {req.reason}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {getStatusBadge(req.status)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {req.requested_at ? new Date(req.requested_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {isPendingStatus(req.status) ? (
                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm"
                      >
                        <Eye className="w-4 h-4" />
                        Review
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Review Dialog */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Review Edit Request</h2>
            
            <div className="space-y-4 mb-6">
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3">
                {selectedRequest.requested_by_profile_image ? (
                  <img
                    src={selectedRequest.requested_by_profile_image}
                    alt={selectedRequest.requested_by_name || selectedRequest.requested_by_username || 'User'}
                    className="w-12 h-12 rounded-full object-cover border border-gray-200 bg-white"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                    {initialsFromName(selectedRequest.requested_by_name || selectedRequest.requested_by_username || 'User')}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {selectedRequest.requested_by_name || selectedRequest.requested_by_username || '—'}
                  </div>
                  <div className="text-xs text-gray-600 truncate">
                    {selectedRequest.requested_by_staff_id || selectedRequest.requested_by_username || '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Course:</span>
                  <p className="font-medium">{getInfo(selectedRequest).subject_code}</p>
                </div>
                <div>
                  <span className="text-gray-500">{selectedRequest.request_type === 'CQI' ? 'Type' : 'Exam'}:</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {selectedRequest.request_type === 'CQI' && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 uppercase">CQI</span>
                    )}
                    <p className="font-medium">{getInfo(selectedRequest).exam}</p>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Section:</span>
                  <p className="font-medium">{getInfo(selectedRequest).section_name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Department:</span>
                  <p className="font-medium">
                    {getInfo(selectedRequest).department_short_name ||
                      getInfo(selectedRequest).department_name ||
                      getInfo(selectedRequest).department_code ||
                      '—'}
                  </p>
                </div>
              </div>
              
              <div>
                <span className="text-sm text-gray-500">Reason for Edit:</span>
                <p className="mt-1 p-3 bg-gray-50 rounded-lg">{selectedRequest.reason}</p>
              </div>

              {isPendingStatus(selectedRequest.status) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Response Note (required for rejection)
                  </label>
                  <textarea
                    value={responseNote}
                    onChange={(e) => setResponseNote(e.target.value)}
                    placeholder="Add a note for the faculty..."
                    rows={3}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setSelectedRequest(null); setResponseNote(''); }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              {isPendingStatus(selectedRequest.status) && (
                <>
                  <button
                    onClick={() => handleReject(selectedRequest.id)}
                    disabled={processing === selectedRequest.id}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(selectedRequest.id)}
                    disabled={processing === selectedRequest.id}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
