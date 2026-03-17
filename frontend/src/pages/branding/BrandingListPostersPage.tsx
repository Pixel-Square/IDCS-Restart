/**
 * BrandingListPostersPage — shows event proposals forwarded to Branding.
 * Branding team can review posters, proposal docs, and forward to HOD.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Send,
  XCircle,
} from 'lucide-react';
import {
  fetchProposals,
  brandingForward,
  deleteAllProposals,
  rejectProposal,
  buildDocUrl,
  uploadBrandingFinalPoster,
  type EventProposal,
} from '../../services/proposalService';

export default function BrandingListPostersPage() {
  const [proposals, setProposals] = useState<EventProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [showReject, setShowReject] = useState<Record<string, boolean>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [deletingAll, setDeletingAll] = useState(false);
  const [uploadingPosterId, setUploadingPosterId] = useState<string | null>(null);

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

  async function handleForward(id: string) {
    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      const updated = await brandingForward(id, notes[id] || '');
      setProposals((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Forward failed');
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }));
    }
  }

  async function handleReject(id: string) {
    const reason = rejectReasons[id] || '';
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

  async function handleDeleteAll() {
    const confirmed = window.confirm('Delete all event proposals from the workflow? This will affect staff, HOD, HAA, and Branding views.');
    if (!confirmed) return;
    setDeletingAll(true);
    setError('');
    try {
      await deleteAllProposals();
      setProposals([]);
      setExpandedId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete all failed');
    } finally {
      setDeletingAll(false);
    }
  }

  async function handleUploadFinalPoster(proposalId: string, file?: File | null) {
    if (!file) return;
    setUploadingPosterId(proposalId);
    setError('');
    try {
      const updated = await uploadBrandingFinalPoster(proposalId, file);
      setProposals((prev) => prev.map((proposal) => (proposal.id === proposalId ? updated : proposal)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Final poster upload failed');
    } finally {
      setUploadingPosterId(null);
    }
  }

  const pending = proposals.filter((p) => p.status === 'forwarded_to_branding');
  const others = proposals.filter((p) => p.status !== 'forwarded_to_branding');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Event Proposals — Branding Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review event posters and proposal documents submitted by staff. Forward approved items to the department HOD.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Link
            to="/branding/recents"
            className="inline-flex items-center gap-2 px-4 py-2 border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-lg text-sm font-medium"
          >
            View Recents
          </Link>
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={deletingAll}
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60 rounded-lg text-sm font-medium"
          >
            {deletingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Delete All Events
          </button>
        </div>
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

      {!loading && pending.length === 0 && others.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No event proposals to review</p>
          <p className="text-sm">Proposals forwarded by staff will appear here.</p>
        </div>
      )}

      {/* Pending branding review */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Awaiting Your Review ({pending.length})
          </h2>
          <div className="space-y-4">
            {pending.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                <div
                  className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{p.title}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        Pending Review
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

                {expandedId === p.id && (
                  <div className="border-t border-amber-100 px-6 py-4 space-y-4">
                    {/* Event details */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {p.venue && <Detail label="Venue" value={p.venue} />}
                      {p.mode && <Detail label="Mode" value={p.mode} />}
                      {p.participants && <Detail label="Participants" value={p.participants} />}
                      {p.coordinator_name && <Detail label="Coordinator" value={p.coordinator_name} />}
                      {p.chief_guest_name && (
                        <Detail
                          label="Resource Person"
                          value={`${p.chief_guest_name}${p.chief_guest_designation ? ', ' + p.chief_guest_designation : ''}`}
                        />
                      )}
                    </div>

                    {/* Poster */}
                    {(p.poster_url || p.poster_data_url) && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" /> Poster Preview
                        </h4>
                        <img
                          src={p.poster_data_url || p.poster_url}
                          alt="Event poster"
                          className="max-h-80 rounded-xl border border-gray-200 shadow-sm"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {p.proposal_doc_url && (
                        <a
                          href={buildDocUrl(p.proposal_doc_url)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-100 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" /> {p.proposal_doc_name || 'Proposal Document'}
                        </a>
                      )}

                      {p.canva_edit_url && (
                        <a
                          href={p.canva_edit_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" /> Open in Canva
                        </a>
                      )}

                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer">
                        {uploadingPosterId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                        Upload Final Poster
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingPosterId === p.id}
                          onChange={(e) => {
                            const selectedFile = e.target.files?.[0] || null;
                            void handleUploadFinalPoster(p.id, selectedFile);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t border-gray-100 space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Note (optional)</label>
                        <input
                          type="text"
                          value={notes[p.id] || ''}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="Add an optional note for the HOD..."
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          disabled={processing[p.id]}
                          onClick={() => handleForward(p.id)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-xl shadow transition-colors text-sm"
                        >
                          {processing[p.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Forward to HOD
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowReject((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-red-200 hover:border-red-400 text-red-600 font-medium rounded-xl text-sm transition-colors"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>

                      {showReject[p.id] && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                          <label className="text-xs font-medium text-red-700 block">Rejection Reason (required)</label>
                          <textarea
                            value={rejectReasons[p.id] || ''}
                            onChange={(e) => setRejectReasons((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder="Explain why..."
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg border border-red-200 text-sm"
                          />
                          <button
                            disabled={processing[p.id] || !(rejectReasons[p.id] || '').trim()}
                            onClick={() => handleReject(p.id)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            {processing[p.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                            Confirm Rejection
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Already processed */}
      {others.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Previously Reviewed</h2>
          <div className="space-y-3">
            {others.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-4">
                <div className="flex items-center gap-3 mb-1">
                  <Link
                    to={`/branding/recents?proposalId=${encodeURIComponent(p.id)}`}
                    className="text-sm font-semibold text-gray-900 truncate hover:text-violet-700"
                  >
                    {p.title}
                  </Link>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    p.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    p.status === 'haa_approved' ? 'bg-green-100 text-green-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {p.status_display}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>by {p.created_by_name}</span>
                  {p.department_name && <span>• {p.department_name}</span>}
                  {p.start_date && <span>• {new Date(p.start_date).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
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
