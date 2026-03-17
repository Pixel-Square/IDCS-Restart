/**
 * ProposalApprovalPage — shared approval page used by HOD and HAA.
 * Renders event proposals awaiting the current user's approval action.
 */
import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  AlertCircle,
  Loader2,
  Send,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import {
  fetchProposals,
  hodApprove,
  haaApprove,
  rejectProposal,
  buildDocUrl,
  buildPosterUrl,
  type EventProposal,
} from '../../services/proposalService';

type ApprovalRole = 'hod' | 'haa';

interface Props {
  role: ApprovalRole;
}

const ROLE_CONFIG = {
  hod: {
    title: 'HOD: Event Proposal Approvals',
    subtitle: 'Review and approve event proposals forwarded from the Branding team.',
    actionLabel: 'Approve & Forward to HAA',
    pendingStatus: 'forwarded_to_hod',
  },
  haa: {
    title: 'HAA: Event Proposal Approvals',
    subtitle: 'Give final approval for event proposals. This triggers notifications to the staff and generates approved documents.',
    actionLabel: 'Give Final Approval',
    pendingStatus: 'forwarded_to_haa',
  },
};

export default function ProposalApprovalPage({ role }: Props) {
  const config = ROLE_CONFIG[role];
  const [proposals, setProposals] = useState<EventProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [showReject, setShowReject] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchProposals();
      setProposals(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      const note = actionNote[id] || '';
      const fn = role === 'hod' ? hodApprove : haaApprove;
      const updated = await fn(id, note);
      setProposals((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }));
    }
  }

  async function handleReject(id: string) {
    const reason = rejectReason[id] || '';
    if (!reason.trim()) return;
    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      const updated = await rejectProposal(id, reason);
      setProposals((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setShowReject((prev) => ({ ...prev, [id]: false }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }));
    }
  }

  const pending = proposals.filter((p) => p.status === config.pendingStatus);
  const other = proposals.filter((p) => p.status !== config.pendingStatus);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{config.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{config.subtitle}</p>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {!loading && pending.length === 0 && other.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No pending proposals</p>
          </div>
        )}

        {/* Pending approvals */}
        {pending.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending Your Approval ({pending.length})
            </h2>
            <div className="space-y-4">
              {pending.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  expanded={expandedId === p.id}
                  onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  isPending
                  config={config}
                  note={actionNote[p.id] || ''}
                  onNoteChange={(val) => setActionNote((prev) => ({ ...prev, [p.id]: val }))}
                  rejectReason={rejectReason[p.id] || ''}
                  onRejectReasonChange={(val) => setRejectReason((prev) => ({ ...prev, [p.id]: val }))}
                  showReject={showReject[p.id] || false}
                  onShowReject={() => setShowReject((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  processing={processing[p.id] || false}
                  onApprove={() => handleApprove(p.id)}
                  onReject={() => handleReject(p.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Previously handled */}
        {other.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Previously Handled</h2>
            <div className="space-y-3">
              {other.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  expanded={expandedId === p.id}
                  onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  isPending={false}
                  config={config}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalCard({
  proposal: p,
  expanded,
  onToggle,
  isPending,
  config,
  note,
  onNoteChange,
  rejectReason,
  onRejectReasonChange,
  showReject,
  onShowReject,
  processing,
  onApprove,
  onReject,
}: {
  proposal: EventProposal;
  expanded: boolean;
  onToggle: () => void;
  isPending: boolean;
  config: typeof ROLE_CONFIG['hod'];
  note?: string;
  onNoteChange?: (val: string) => void;
  rejectReason?: string;
  onRejectReasonChange?: (val: string) => void;
  showReject?: boolean;
  onShowReject?: () => void;
  processing?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const shouldShowPosterPreview =
    !posterFailed &&
    (
      p.has_final_poster
      || p.status === 'forwarded_to_hod'
      || p.status === 'hod_approved'
      || p.status === 'forwarded_to_haa'
      || p.status === 'haa_approved'
    );

  return (
    <div className={`bg-white rounded-2xl border ${isPending ? 'border-amber-200' : 'border-gray-200'} shadow-sm overflow-hidden`}>
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{p.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              p.status === 'rejected' ? 'bg-red-100 text-red-700' :
              p.status === 'haa_approved' ? 'bg-green-100 text-green-700' :
              p.status === 'hod_approved' || p.status === 'forwarded_to_haa' ? 'bg-emerald-100 text-emerald-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {p.status_display}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>by {p.created_by_name}</span>
            {p.department_name && <span>• {p.department_name}</span>}
            {p.event_type && <span>• {p.event_type}</span>}
            {p.start_date && <span>• {new Date(p.start_date).toLocaleDateString()}</span>}
          </div>
        </div>
        <Eye className="w-4 h-4 text-gray-400" />
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-6 py-4 space-y-4">
          {/* Event details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {p.venue && <Detail label="Venue" value={p.venue} />}
            {p.mode && <Detail label="Mode" value={p.mode} />}
            {p.participants && <Detail label="Participants" value={p.participants} />}
            {p.coordinator_name && <Detail label="Coordinator" value={p.coordinator_name} />}
            {p.co_coordinator_name && <Detail label="Co-Coordinator" value={p.co_coordinator_name} />}
            {p.chief_guest_name && <Detail label="Resource Person" value={`${p.chief_guest_name}${p.chief_guest_designation ? ', ' + p.chief_guest_designation : ''}`} />}
          </div>

          {/* Poster preview */}
          {shouldShowPosterPreview && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" /> Poster Preview
              </h4>
              <img
                src={buildPosterUrl(p.id, true)}
                alt="Final event poster"
                className="max-h-80 rounded-xl border border-gray-200 shadow-sm"
                onError={() => setPosterFailed(true)}
              />
            </div>
          )}

          {/* Document download */}
          {p.proposal_doc_url && (
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
              <a href={buildDocUrl(p.proposal_doc_url)} target="_blank" rel="noopener noreferrer" className="text-sm text-violet-600 hover:underline">
                {p.proposal_doc_name || 'Proposal Document'}
              </a>
            </div>
          )}

          {/* Previous approvals */}
          {p.branding_reviewed_by_name && (
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">Branding:</span> {p.branding_reviewed_by_name}
              {p.branding_reviewed_at && ` on ${new Date(p.branding_reviewed_at).toLocaleDateString()}`}
              {p.branding_note && ` — "${p.branding_note}"`}
            </p>
          )}
          {p.hod_approved_by_name && (
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">HOD Approved:</span> {p.hod_approved_by_name}
              {p.hod_approved_at && <span className="text-gray-400"> at {toIndianTime(p.hod_approved_at)}</span>}
              {p.hod_note && ` — "${p.hod_note}"`}
            </p>
          )}
          {p.haa_approved_by_name && (
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">HAA Approved:</span> {p.haa_approved_by_name}
              {p.haa_approved_at && <span className="text-gray-400"> at {toIndianTime(p.haa_approved_at)}</span>}
              {p.haa_note && ` — "${p.haa_note}"`}
            </p>
          )}

          {p.status === 'rejected' && p.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <span className="font-semibold">Rejected:</span> {p.rejection_reason}
            </div>
          )}

          {/* Actions — only if pending */}
          {isPending && onApprove && (
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={note || ''}
                  onChange={(e) => onNoteChange?.(e.target.value)}
                  placeholder="Add an optional note..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  disabled={processing}
                  onClick={onApprove}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-xl shadow transition-colors text-sm"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {config.actionLabel}
                </button>
                <button
                  type="button"
                  onClick={onShowReject}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-red-200 hover:border-red-400 text-red-600 font-medium rounded-xl text-sm transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>

              {showReject && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                  <label className="text-xs font-medium text-red-700 block">Rejection Reason (required)</label>
                  <textarea
                    value={rejectReason || ''}
                    onChange={(e) => onRejectReasonChange?.(e.target.value)}
                    placeholder="Explain why this proposal is being rejected..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-red-200 text-sm focus:border-red-400 focus:ring-1 focus:ring-red-400 outline-none"
                  />
                  <button
                    disabled={processing || !(rejectReason || '').trim()}
                    onClick={onReject}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Confirm Rejection
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

const toIndianTime = (isoString: string | null | undefined) => {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return '';
  }
};
