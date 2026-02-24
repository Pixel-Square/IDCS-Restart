import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  CheckCircle, 
  Clock, 
  Eye, 
  AlertCircle, 
  Loader2, 
  Edit2, 
  Save, 
  X,
  Filter,
  User
} from 'lucide-react';
import { fetchAllQueries, updateQuery, UserQuery } from '../services/queries';

const STATUS_CONFIG = {
  SENT: { label: 'Sent', icon: Send, color: 'bg-blue-100 text-blue-700', borderColor: 'border-blue-300' },
  VIEWED: { label: 'Viewed', icon: Eye, color: 'bg-indigo-100 text-indigo-700', borderColor: 'border-indigo-300' },
  REVIEWED: { label: 'Reviewed', icon: CheckCircle, color: 'bg-purple-100 text-purple-700', borderColor: 'border-purple-300' },
  PENDING: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700', borderColor: 'border-yellow-300' },
  IN_PROGRESS: { label: 'In Progress', icon: AlertCircle, color: 'bg-orange-100 text-orange-700', borderColor: 'border-orange-300' },
  FIXED: { label: 'Fixed', icon: CheckCircle, color: 'bg-green-100 text-green-700', borderColor: 'border-green-300' },
  LATER: { label: 'Later', icon: Clock, color: 'bg-gray-100 text-gray-700', borderColor: 'border-gray-300' },
  CLOSED: { label: 'Closed', icon: CheckCircle, color: 'bg-slate-100 text-slate-700', borderColor: 'border-slate-300' },
};

const STATUS_OPTIONS = Object.keys(STATUS_CONFIG);

export default function QueriesReceiverComponent() {
  const [queries, setQueries] = useState<UserQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadQueries();
  }, [statusFilter]);

  async function loadQueries() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAllQueries(statusFilter);
      setQueries(data);
    } catch (err) {
      setError('Failed to load queries. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(query: UserQuery) {
    setEditingId(query.id);
    setEditStatus(query.status);
    setEditNotes(query.admin_notes || '');
    setSuccess('');
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditStatus('');
    setEditNotes('');
  }

  async function saveEdit(id: number) {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateQuery(id, {
        status: editStatus,
        admin_notes: editNotes,
      });
      setSuccess('Query updated successfully!');
      setEditingId(null);
      await loadQueries();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to update query. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const statusCounts = queries.reduce((acc, q) => {
    acc[q.status] = (acc[q.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-lg">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Query Management</h2>
              <p className="text-sm text-slate-600">All user queries and support tickets</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600 font-medium">Total:</span>
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-bold">
              {queries.length}
            </span>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm text-green-700 font-medium">{success}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* Filter Section */}
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
            <Filter className="w-4 h-4" />
            Filter by status:
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].label} 
                {statusCounts[status] ? ` (${statusCounts[status]})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Queries List */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            <span className="ml-3 text-slate-600">Loading queries...</span>
          </div>
        ) : queries.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <MessageSquare className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Queries Found</h3>
            <p className="text-slate-600 text-sm">
              {statusFilter ? 'No queries match the selected filter.' : 'No queries have been submitted yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {queries.map((query) => {
              const statusConfig = STATUS_CONFIG[query.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.SENT;
              const StatusIcon = statusConfig.icon;
              const isEditing = editingId === query.id;

              return (
                <div
                  key={query.id}
                  className={`border-2 rounded-lg p-5 hover:shadow-md transition-all ${
                    isEditing ? statusConfig.borderColor : 'border-slate-200'
                  }`}
                >
                  {/* Query Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-100 rounded-lg">
                        <User className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{query.username}</div>
                        <div className="text-xs text-slate-500">Query #{query.id}</div>
                      </div>
                    </div>
                    
                    {!isEditing ? (
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${statusConfig.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusConfig.label}
                        </span>
                        <button
                          onClick={() => startEdit(query)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit query"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveEdit(query.id)}
                          disabled={saving}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm font-medium"
                        >
                          {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Query Content */}
                  <div className="mb-3">
                    <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-800 leading-relaxed">
                      {query.query_text}
                    </div>
                  </div>

                  {/* Edit Form or Display */}
                  {isEditing ? (
                    <div className="space-y-3 border-t border-slate-200 pt-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Status
                        </label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          disabled={saving}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Response to User
                          <span className="text-xs text-slate-500 ml-2">(Visible to user)</span>
                        </label>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          disabled={saving}
                          placeholder="Add a response or note that the user will see..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                          rows={3}
                        />
                      </div>
                    </div>
                  ) : query.admin_notes ? (
                    <div className="border-t border-slate-200 pt-3">
                      <div className="text-xs font-medium text-slate-600 mb-1">Response to User:</div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-slate-700">
                        {query.admin_notes}
                      </div>
                    </div>
                  ) : null}

                  {/* Footer */}
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
                    <span>Created: {formatDate(query.created_at)}</span>
                    <span>Updated: {formatDate(query.updated_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
