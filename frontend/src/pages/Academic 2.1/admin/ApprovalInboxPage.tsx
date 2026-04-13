/**
 * Approval Inbox Page
 * Review and process edit requests from faculty
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, Eye, MessageSquare, Filter, Search } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface EditRequest {
  id: string;
  course_code: string;
  course_name: string;
  exam_name: string;
  faculty_name: string;
  faculty_email: string;
  department: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  current_stage: number;
  created_at: string;
  updated_at: string;
}

export default function ApprovalInboxPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<EditRequest[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<EditRequest | null>(null);
  const [responseNote, setResponseNote] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth('/api/academic-v2/edit-requests/');
      if (!response.ok) throw new Error('Failed to load');
      const data = await response.json();
      setRequests(Array.isArray(data) ? data : (data.results || []));
    } catch (error) {
      console.error('Failed to load:', error);
      setMessage({ type: 'error', text: 'Failed to load edit requests' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      setProcessing(requestId);
      const response = await fetchWithAuth(`/api/academic-v2/edit-requests/${requestId}/approve/`, {
        method: 'POST',
        body: JSON.stringify({ note: responseNote }),
      });
      
      if (!response.ok) throw new Error('Approve failed');
      
      setMessage({ type: 'success', text: 'Request approved' });
      setSelectedRequest(null);
      setResponseNote('');
      loadData();
    } catch (error) {
      console.error('Approve failed:', error);
      setMessage({ type: 'error', text: 'Failed to approve request' });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!responseNote.trim()) {
      setMessage({ type: 'error', text: 'Please provide a reason for rejection' });
      return;
    }
    
    try {
      setProcessing(requestId);
      const response = await fetchWithAuth(`/api/academic-v2/edit-requests/${requestId}/reject/`, {
        method: 'POST',
        body: JSON.stringify({ note: responseNote }),
      });
      
      if (!response.ok) throw new Error('Reject failed');
      
      setMessage({ type: 'success', text: 'Request rejected' });
      setSelectedRequest(null);
      setResponseNote('');
      loadData();
    } catch (error) {
      console.error('Reject failed:', error);
      setMessage({ type: 'error', text: 'Failed to reject request' });
    } finally {
      setProcessing(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (filter !== 'ALL' && r.status !== filter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        r.course_code.toLowerCase().includes(query) ||
        r.course_name.toLowerCase().includes(query) ||
        r.faculty_name.toLowerCase().includes(query) ||
        r.department.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'PENDING').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
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
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by course, faculty, or department..."
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exam</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faculty</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{req.course_code}</div>
                    <div className="text-sm text-gray-500">{req.course_name}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">{req.exam_name}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{req.faculty_name}</div>
                    <div className="text-xs text-gray-500">{req.department}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {req.reason}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {getStatusBadge(req.status)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(req.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {req.status === 'PENDING' ? (
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
              ))}
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
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Course:</span>
                  <p className="font-medium">{selectedRequest.course_code}</p>
                </div>
                <div>
                  <span className="text-gray-500">Exam:</span>
                  <p className="font-medium">{selectedRequest.exam_name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Faculty:</span>
                  <p className="font-medium">{selectedRequest.faculty_name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Department:</span>
                  <p className="font-medium">{selectedRequest.department}</p>
                </div>
              </div>
              
              <div>
                <span className="text-sm text-gray-500">Reason for Edit:</span>
                <p className="mt-1 p-3 bg-gray-50 rounded-lg">{selectedRequest.reason}</p>
              </div>

              {selectedRequest.status === 'PENDING' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Response Note {selectedRequest.status === 'PENDING' && '(required for rejection)'}
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
              {selectedRequest.status === 'PENDING' && (
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
