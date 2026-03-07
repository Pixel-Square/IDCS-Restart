import React, { useState, useEffect } from 'react';
import { Plus, Eye, Clock, CheckCircle, XCircle, Filter } from 'lucide-react';
import { getMyRequests } from '../../services/staffRequests';
import type { StaffRequest } from '../../types/staffRequests';
import RequestDetailsModal from './RequestDetailsModal';
import NewRequestModal from './NewRequestModal';

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<StaffRequest | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyRequests();
      setRequests(data);
      setFilteredRequests(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredRequests(requests);
    } else {
      setFilteredRequests(requests.filter(r => r.status === statusFilter));
    }
  }, [statusFilter, requests]);

  const handleRequestCreated = () => {
    setShowNewRequest(false);
    loadRequests();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle size={20} className="text-green-600" />;
      case 'rejected': return <XCircle size={20} className="text-red-600" />;
      default: return <Clock size={20} className="text-yellow-600" />;
    }
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
        <div className="text-gray-600">Loading your requests...</div>
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
              <h2 className="text-2xl font-bold text-gray-900">My Requests</h2>
              <p className="text-sm text-gray-600 mt-1">
                View your request history and submit new requests
              </p>
            </div>
            <button
              onClick={() => setShowNewRequest(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              New Request
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Filter:</span>
            <div className="flex gap-2">
              {['all', 'pending', 'approved', 'rejected'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status as any)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    statusFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
            <span className="ml-auto text-sm text-gray-600">
              {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
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
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {statusFilter === 'all' ? (
                <>
                  <p className="mb-4">You haven't submitted any requests yet.</p>
                  <button
                    onClick={() => setShowNewRequest(true)}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Submit your first request
                  </button>
                </>
              ) : (
                <p>No {statusFilter} requests found.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((request) => (
                <div
                  key={request.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(request.status)}
                        <h3 className="text-lg font-semibold text-gray-900">
                          {request.template.name}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(request.status)}`}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-700 mb-3">
                        <div>
                          <span className="font-medium">Submitted:</span>{' '}
                          {formatDate(request.created_at)}
                        </div>
                        <div>
                          <span className="font-medium">Current Step:</span>{' '}
                          {request.current_step} of {request.total_steps}
                        </div>
                        <div>
                          <span className="font-medium">Awaiting:</span>{' '}
                          {request.status === 'pending' ? request.current_approver_role || 'N/A' : '-'}
                        </div>
                        <div>
                          <span className="font-medium">Progress:</span>{' '}
                          {request.completed_steps || 0}/{request.total_steps || 0}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {request.status === 'pending' && request.total_steps && (
                        <div className="mb-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{
                                width: `${((request.completed_steps || 0) / request.total_steps) * 100}%`
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Quick preview of form data */}
                      <div className="text-sm text-gray-600">
                        {Object.entries(request.form_data).slice(0, 2).map(([key, value]) => (
                          <span key={key} className="mr-4">
                            <span className="font-medium">{key}:</span> {String(value).substring(0, 30)}
                            {String(value).length > 30 ? '...' : ''}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRequest(request);
                      }}
                      className="ml-4 p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded"
                      title="View Details"
                    >
                      <Eye size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Request Details Modal */}
      {selectedRequest && (
        <RequestDetailsModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
        />
      )}

      {/* New Request Modal */}
      {showNewRequest && (
        <NewRequestModal
          onClose={() => setShowNewRequest(false)}
          onCreated={handleRequestCreated}
        />
      )}
    </div>
  );
}
