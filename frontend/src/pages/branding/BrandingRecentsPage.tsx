import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Clock, ExternalLink, FileText, Filter, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchProposals, type EventProposal } from '../../services/proposalService';

type ReviewFilter = 'All' | 'Approved' | 'Rejected' | 'In Progress';

const IN_PROGRESS_STATUSES = new Set(['forwarded_to_hod', 'hod_approved', 'forwarded_to_haa']);

function deriveReviewType(proposal: EventProposal): Exclude<ReviewFilter, 'All'> {
  if (proposal.status === 'haa_approved') return 'Approved';
  if (proposal.status === 'rejected') return 'Rejected';
  return 'In Progress';
}

function formatDetailText(proposal: EventProposal): string {
  if (proposal.status === 'haa_approved' && proposal.haa_approved_by_name) {
    return `Final approval by ${proposal.haa_approved_by_name}`;
  }
  if (proposal.status === 'rejected' && proposal.rejection_reason) {
    return `Rejected: ${proposal.rejection_reason}`;
  }
  if (proposal.branding_reviewed_by_name) {
    return `Reviewed by ${proposal.branding_reviewed_by_name}`;
  }
  return proposal.status_display;
}

export default function BrandingRecentsPage() {
  const [searchParams] = useSearchParams();
  const highlightedProposalId = searchParams.get('proposalId') || '';

  const [filter, setFilter] = useState<ReviewFilter>('All');
  const [proposals, setProposals] = useState<EventProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchProposals();
      const reviewed = data.filter((proposal) => proposal.status !== 'forwarded_to_branding');
      setProposals(reviewed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load recents');
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(() => {
    return {
      approved: proposals.filter((proposal) => proposal.status === 'haa_approved').length,
      rejected: proposals.filter((proposal) => proposal.status === 'rejected').length,
      inProgress: proposals.filter((proposal) => IN_PROGRESS_STATUSES.has(proposal.status)).length,
    };
  }, [proposals]);

  const filtered = useMemo(() => {
    if (filter === 'All') return proposals;
    return proposals.filter((proposal) => deriveReviewType(proposal) === filter);
  }, [filter, proposals]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recents</h1>
        <p className="text-gray-500 text-sm mt-1">Previously reviewed events from Branding workflow.</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl p-4 bg-green-100">
          <p className="text-2xl font-bold text-green-700">{counts.approved}</p>
          <p className="text-xs font-medium mt-0.5 text-green-700">Approved</p>
        </div>
        <div className="rounded-2xl p-4 bg-amber-100">
          <p className="text-2xl font-bold text-amber-700">{counts.inProgress}</p>
          <p className="text-xs font-medium mt-0.5 text-amber-700">In Progress</p>
        </div>
        <div className="rounded-2xl p-4 bg-red-100">
          <p className="text-2xl font-bold text-red-700">{counts.rejected}</p>
          <p className="text-xs font-medium mt-0.5 text-red-700">Rejected</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        {(['All', 'Approved', 'In Progress', 'Rejected'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === value ? 'bg-purple-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-purple-300'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-14">
          <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {filtered.map((proposal) => {
            const reviewType = deriveReviewType(proposal);
            const chipClass =
              reviewType === 'Approved'
                ? 'bg-green-100 text-green-700'
                : reviewType === 'Rejected'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700';
            const highlighted = highlightedProposalId === proposal.id;

            return (
              <div
                key={proposal.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 ${highlighted ? 'border-violet-400 ring-1 ring-violet-300' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{proposal.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${chipClass}`}>{reviewType}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDetailText(proposal)}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>by {proposal.created_by_name}</span>
                      {proposal.department_name && <span>• {proposal.department_name}</span>}
                    </div>
                  </div>

                  <Link
                    to="/branding/list-posters"
                    className="inline-flex items-center gap-1.5 text-xs text-violet-700 hover:text-violet-800 font-medium"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Open
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(proposal.updated_at || proposal.created_at || '').toLocaleString()}</span>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No reviewed events found.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
