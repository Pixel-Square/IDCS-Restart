import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, CheckCircle, Clock, Eye, AlertCircle, Loader2, Phone } from 'lucide-react';
import { fetchMyQueries, createQuery, UserQueryListItem } from '../services/queries';
import { Link } from 'react-router-dom';

const STATUS_CONFIG = {
  SENT: { label: 'Sent', icon: Send, color: 'bg-blue-100 text-blue-700' },
  VIEWED: { label: 'Viewed', icon: Eye, color: 'bg-indigo-100 text-indigo-700' },
  REVIEWED: { label: 'Reviewed', icon: CheckCircle, color: 'bg-purple-100 text-purple-700' },
  PENDING: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700' },
  IN_PROGRESS: { label: 'In Progress', icon: AlertCircle, color: 'bg-orange-100 text-orange-700' },
  FIXED: { label: 'Fixed', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  LATER: { label: 'Later', icon: Clock, color: 'bg-gray-100 text-gray-700' },
  CLOSED: { label: 'Closed', icon: CheckCircle, color: 'bg-slate-100 text-slate-700' },
};

interface UserQueriesComponentProps {
  user?: any;
}

export default function UserQueriesComponent({ user }: UserQueriesComponentProps) {
  const [queries, setQueries] = useState<UserQueryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newQuery, setNewQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check if user's phone is verified
  const isPhoneVerified = Boolean(user?.profile?.mobile_verified);

  useEffect(() => {
    loadQueries();
  }, []);

  async function loadQueries() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMyQueries();
      setQueries(data);
    } catch (err) {
      setError('Failed to load tokens. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleNewTokenClick() {
    if (!isPhoneVerified) {
      setError('Please verify your phone number before raising a token.');
      return;
    }
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!isPhoneVerified) {
      setError('Please verify your phone number before raising a token.');
      return;
    }
    
    if (!newQuery.trim()) {
      setError('Please enter your token details');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await createQuery(newQuery.trim());
      setSuccess('Token raised successfully!');
      setNewQuery('');
      setShowForm(false);
      await loadQueries();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to raise token. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInHours < 24) {
      if (diffInHours < 1) {
        const minutes = Math.floor(diffInMs / (1000 * 60));
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      }
      const hours = Math.floor(diffInHours);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (diffInDays < 7) {
      const days = Math.floor(diffInDays);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString('en-IN', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Token Raise</h2>
              <p className="text-sm text-slate-600">Submit queries, doubts, errors, or bug reports</p>
            </div>
          </div>
          <button
            onClick={handleNewTokenClick}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <Send className="w-4 h-4" />
            Raise Token
          </button>
        </div>
      </div>

      {/* Phone Verification Warning */}
      {!isPhoneVerified && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-300 rounded-lg">
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900 mb-1">Phone Verification Required</h3>
              <p className="text-sm text-amber-800 mb-2">You need to verify your phone number before you can raise a token.</p>
              <Link
                to="/profile"
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors text-sm font-medium"
              >
                <Phone className="w-4 h-4" />
                Go to Profile to Verify
              </Link>
            </div>
          </div>
        </div>
      )}

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

      {/* New Token Form */}
      {showForm && isPhoneVerified && (
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Your Token Details
            </label>
            <textarea
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              placeholder="Describe your query, doubt, error, or bug report..."
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              rows={4}
              disabled={submitting}
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                type="submit"
                disabled={submitting || !newQuery.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Raising...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Raise Token
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setNewQuery('');
                  setError('');
                }}
                disabled={submitting}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tokens List */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <span className="ml-3 text-slate-600">Loading tokens...</span>
          </div>
        ) : queries.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <MessageSquare className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Tokens Yet</h3>
            <p className="text-slate-600 text-sm mb-4">
              {isPhoneVerified 
                ? 'You haven\'t raised any tokens. Click "Raise Token" to get started.'
                : 'Verify your phone number to start raising tokens.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {queries.map((query) => {
              const statusConfig = STATUS_CONFIG[query.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.SENT;
              const StatusIcon = statusConfig.icon;

              return (
                <div
                  key={query.id}
                  className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="text-slate-800 text-sm leading-relaxed">
                        {query.query_preview}
                      </p>
                    </div>
                    <span className={`ml-3 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5 ${statusConfig.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusConfig.label}
                    </span>
                  </div>
                  
                  {/* Admin Response */}
                  {query.admin_notes && (
                    <div className="mt-3 mb-2">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-blue-900 mb-1">Admin Response:</div>
                            <p className="text-sm text-blue-800 leading-relaxed">{query.admin_notes}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Token #{query.serial_number}</span>
                    <span>{formatDate(query.created_at)}</span>
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
