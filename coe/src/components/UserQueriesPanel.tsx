import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Eye, Loader2, MessageSquare, Phone, Send } from 'lucide-react';
import { Link } from 'react-router-dom';

import { createQuery, fetchMyQueries, UserQueryListItem } from '../services/queries';

type UserLike = {
  profile?: {
    mobile_verified?: boolean;
  };
};

const STATUS_CONFIG = {
  SENT: { label: 'Sent', icon: Send, color: 'bg-blue-100 text-blue-700' },
  VIEWED: { label: 'Viewed', icon: Eye, color: 'bg-indigo-100 text-indigo-700' },
  REVIEWED: { label: 'Reviewed', icon: CheckCircle, color: 'bg-purple-100 text-purple-700' },
  PENDING: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700' },
  IN_PROGRESS: { label: 'In Progress', icon: AlertCircle, color: 'bg-orange-100 text-orange-700' },
  FIXED: { label: 'Fixed', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  LATER: { label: 'Later', icon: Clock, color: 'bg-gray-100 text-gray-700' },
  CLOSED: { label: 'Closed', icon: CheckCircle, color: 'bg-slate-100 text-slate-700' },
} as const;

export default function UserQueriesPanel({ user }: { user?: UserLike | null }) {
  const [queries, setQueries] = useState<UserQueryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newQuery, setNewQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    } catch {
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
      window.setTimeout(() => setSuccess(''), 3000);
    } catch {
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
    }

    if (diffInDays < 7) {
      const days = Math.floor(diffInDays);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }

    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <div className="rounded-xl border border-[#ead7d0] bg-white shadow-sm">
      <div className="border-b border-[#ead7d0] bg-gradient-to-r from-[#fcf6f2] to-[#f7ece7] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#f2dfd8] p-2">
              <MessageSquare className="h-5 w-5 text-[#7a2038]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#4f1a2c]">Raise Token</h2>
              <p className="text-sm text-[#745247]">Submit queries, doubts, errors, or bug reports</p>
            </div>
          </div>
          <button
            onClick={handleNewTokenClick}
            className="flex items-center gap-2 rounded-lg bg-[#7a2038] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#651c2f]"
          >
            <Send className="h-4 w-4" />
            Raise Token
          </button>
        </div>
      </div>

      {!isPhoneVerified && (
        <div className="mx-6 mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="flex-1">
              <h3 className="mb-1 text-sm font-semibold text-amber-900">Phone Verification Required</h3>
              <p className="mb-2 text-sm text-amber-800">You need to verify your phone number before you can raise a token.</p>
              <Link
                to="/profile"
                className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
              >
                <Phone className="h-4 w-4" />
                Go to Profile to Verify
              </Link>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-700">{success}</span>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {showForm && isPhoneVerified && (
        <div className="border-b border-[#ead7d0] bg-[#faf6f4] px-6 py-4">
          <form onSubmit={handleSubmit}>
            <label className="mb-2 block text-sm font-medium text-[#5d3d34]">Your Token Details</label>
            <textarea
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              placeholder="Describe your query, doubt, error, or bug report..."
              className="w-full resize-none rounded-lg border border-[#dcb9ac] px-4 py-3 focus:border-[#b2472e] focus:outline-none"
              rows={4}
              disabled={submitting}
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting || !newQuery.trim()}
                className="flex items-center gap-2 rounded-lg bg-[#7a2038] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#651c2f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Raising...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
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
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#7a2038]" />
            <span className="ml-3 text-[#6f4a3f]">Loading tokens...</span>
          </div>
        ) : queries.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <MessageSquare className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-[#4f1a2c]">No Tokens Yet</h3>
            <p className="text-sm text-[#745247]">
              {isPhoneVerified ? 'You have not raised any tokens yet. Click Raise Token to get started.' : 'Verify your phone number to start raising tokens.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {queries.map((query) => {
              const statusConfig = STATUS_CONFIG[query.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.SENT;
              const StatusIcon = statusConfig.icon;

              return (
                <div key={query.id} className="rounded-lg border border-slate-200 p-4 transition-shadow hover:shadow-md">
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm leading-relaxed text-slate-800">{query.query_preview}</p>
                    </div>
                    <span className={`ml-3 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${statusConfig.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {statusConfig.label}
                    </span>
                  </div>

                  {query.admin_notes && (
                    <div className="mb-2 mt-3">
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                          <div className="flex-1">
                            <div className="mb-1 text-xs font-semibold text-blue-900">Admin Response:</div>
                            <p className="text-sm leading-relaxed text-blue-800">{query.admin_notes}</p>
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
