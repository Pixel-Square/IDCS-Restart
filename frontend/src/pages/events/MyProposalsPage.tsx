/**
 * MyProposalsPage — shows the staff member's own event proposals
 * with their current status in the approval workflow.
 */
import React, { useEffect, useState } from 'react';
import { FileText, Clock, CheckCircle2, XCircle, Send, AlertCircle, Download, Loader2, Eye } from 'lucide-react';
import { fetchProposals, downloadFinalApprovalDocWithPoster, type EventProposal } from '../../services/proposalService';

const STATUS_BADGE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  draft:                  { bg: 'bg-gray-100',   text: 'text-gray-600',   icon: <FileText className="w-3.5 h-3.5" /> },
  forwarded_to_branding:  { bg: 'bg-blue-100',   text: 'text-blue-700',   icon: <Send className="w-3.5 h-3.5" /> },
  forwarded_to_hod:       { bg: 'bg-amber-100',  text: 'text-amber-700',  icon: <Clock className="w-3.5 h-3.5" /> },
  hod_approved:           { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  forwarded_to_haa:       { bg: 'bg-purple-100', text: 'text-purple-700', icon: <Clock className="w-3.5 h-3.5" /> },
  haa_approved:           { bg: 'bg-green-100',  text: 'text-green-700',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected:               { bg: 'bg-red-100',    text: 'text-red-700',    icon: <XCircle className="w-3.5 h-3.5" /> },
};

function StatusBadge({ status, statusDisplay }: { status: string; statusDisplay: string }) {
  const badge = STATUS_BADGE[status] || STATUS_BADGE['draft'];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
      {badge.icon}
      {statusDisplay}
    </span>
  );
}

export default function MyProposalsPage() {
  const [proposals, setProposals] = useState<EventProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    loadProposals();
  }, []);

  async function loadProposals() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchProposals(undefined, true);
      setProposals(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load proposals');
    } finally {
      setLoading(false);
    }
  }

  async function handleBundleDownload(proposal: EventProposal) {
    setDownloadingId(proposal.id);
    try {
      await downloadFinalApprovalDocWithPoster(
        proposal.id,
        `${proposal.title.replace(/[^A-Za-z0-9_-]+/g, '_') || 'Event'}_Final_Approval_With_Poster.docx`,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to download final document');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Event Proposals</h1>
            <p className="text-sm text-gray-500 mt-1">Track the status of your event proposals through the approval workflow</p>
          </div>
          <a
            href="/events/create-event"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl shadow transition-colors text-sm"
          >
            <Send className="w-4 h-4" />
            Create New Event
          </a>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {!loading && !error && proposals.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No proposals yet</p>
            <p className="text-sm">Create your first event proposal to get started.</p>
          </div>
        )}

        {!loading && proposals.length > 0 && (
          <div className="space-y-4">
            {proposals.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div
                  className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{p.title}</h3>
                      <StatusBadge status={p.status} statusDisplay={p.status_display} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      {p.department_name && <span>{p.department_name}</span>}
                      {p.event_type && <span>• {p.event_type}</span>}
                      {p.start_date && <span>• {new Date(p.start_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <Eye className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === p.id ? 'rotate-180' : ''}`} />
                </div>

                {expandedId === p.id && (
                  <div className="border-t border-gray-100 px-6 py-4 space-y-4">
                    {/* Approval timeline */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Approval Timeline</h4>
                      <div className="space-y-2">
                        <TimelineStep
                          label="Submitted"
                          done
                          detail={p.created_at ? `by ${p.created_by_name} on ${new Date(p.created_at).toLocaleDateString()}` : ''}
                        />
                        <TimelineStep
                          label="Branding Review"
                          done={!!p.branding_reviewed_at}
                          detail={p.branding_reviewed_at ? `by ${p.branding_reviewed_by_name} on ${new Date(p.branding_reviewed_at).toLocaleDateString()}` : ''}
                          note={p.branding_note}
                          active={p.status === 'forwarded_to_branding'}
                        />
                        <TimelineStep
                          label="HOD Approval"
                          done={!!p.hod_approved_at}
                          detail={p.hod_approved_at ? `by ${p.hod_approved_by_name} on ${new Date(p.hod_approved_at).toLocaleDateString()}` : ''}
                          note={p.hod_note}
                          active={p.status === 'forwarded_to_hod'}
                        />
                        <TimelineStep
                          label="HAA Final Approval"
                          done={!!p.haa_approved_at}
                          detail={p.haa_approved_at ? `by ${p.haa_approved_by_name} on ${new Date(p.haa_approved_at).toLocaleDateString()}` : ''}
                          note={p.haa_note}
                          active={p.status === 'forwarded_to_haa'}
                        />
                      </div>
                    </div>

                    {p.status === 'rejected' && p.rejection_reason && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                        <span className="font-semibold">Rejected:</span> {p.rejection_reason}
                      </div>
                    )}

                    {/* Combined download */}
                    <div className="flex flex-wrap gap-2">
                      {(p.poster_url || p.poster_data_url || p.has_final_poster) && (
                        <button
                          type="button"
                          disabled={downloadingId === p.id}
                          onClick={() => handleBundleDownload(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-100 transition-colors"
                        >
                          {downloadingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Download Final Approval DOCX
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineStep({ label, done, detail, note, active }: {
  label: string;
  done: boolean;
  detail?: string;
  note?: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
        done ? 'bg-green-500' : active ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'
      }`}>
        {done ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
        ) : active ? (
          <Clock className="w-3 h-3 text-white" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${done ? 'text-green-700' : active ? 'text-blue-700' : 'text-gray-400'}`}>
          {label}
        </p>
        {detail && <p className="text-xs text-gray-500">{detail}</p>}
        {note && <p className="text-xs text-gray-400 italic mt-0.5">Note: {note}</p>}
      </div>
    </div>
  );
}
