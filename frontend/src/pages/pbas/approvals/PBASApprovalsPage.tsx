import React, { useEffect, useState } from 'react'
import { ModalPortal } from '../../../components/ModalPortal'
import {
  PBASApprovalItem,
  fetchPBASApprovals,
  submitApprovalAction,
} from '../../../services/pbas'

type Props = {
  user?: any
}

export default function PBASApprovalsPage({ user }: Props) {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [submissions, setSubmissions] = useState<PBASApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // View Detail Popup Modal State
  const [selectedSub, setSelectedSub] = useState<PBASApprovalItem | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  // Load submissions for active tab
  const loadApprovals = async (tab: string = activeTab) => {
    setLoading(true)
    setErrorMsg('')
    try {
      const data = await fetchPBASApprovals(tab)
      setSubmissions(data)
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to load approvals list.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadApprovals(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Open Detail View Modal
  const handleOpenDetailModal = (sub: PBASApprovalItem) => {
    setSelectedSub(sub)
    setRejectReason('')
    setShowRejectForm(false)
    setIsDetailModalOpen(true)
  }

  // Handle Approve Action
  const handleApprove = async () => {
    if (!selectedSub) return
    setActionBusy(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await submitApprovalAction(selectedSub.id, 'approve')
      setSuccessMsg(res.detail || `Submission for "${selectedSub.leaf_title}" approved successfully!`)
      setIsDetailModalOpen(false)
      await loadApprovals(activeTab)
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (e: any) {
      setErrorMsg(e?.message || 'Approval action failed.')
    } finally {
      setActionBusy(false)
    }
  }

  // Handle Reject Action
  const handleReject = async () => {
    if (!selectedSub) return
    setActionBusy(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await submitApprovalAction(selectedSub.id, 'reject', rejectReason)
      setSuccessMsg(res.detail || `Submission for "${selectedSub.leaf_title}" rejected.`)
      setIsDetailModalOpen(false)
      await loadApprovals(activeTab)
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (e: any) {
      setErrorMsg(e?.message || 'Rejection action failed.')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider">
            Approver Portal
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">PBAS Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review, verify, approve, or reject PBAS evidence submissions. Approved credits accumulate directly to candidate profiles.
          </p>
        </div>
      </div>

      {errorMsg && !isDetailModalOpen && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-medium">
          {successMsg}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
              activeTab === tab
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Submissions List */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between border-b pb-4">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Submissions ({submissions.length})
          </h2>
          <span className="text-xs text-slate-400">Click "View" to open full submission evidence modal</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm font-medium">Loading submissions list…</div>
        ) : submissions.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            <p className="text-slate-600 font-medium">No {activeTab} submissions found.</p>
            <p className="text-xs text-slate-400 mt-1">
              Submissions under your authorized parent groups will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="bg-slate-50/80 hover:bg-slate-100/80 border border-slate-200/90 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-200 shadow-sm"
              >
                {/* LEFT END: User Profile Picture & Info */}
                <div className="flex items-center gap-3.5 min-w-[220px]">
                  {sub.user.profile_image ? (
                    <img
                      src={sub.user.profile_image}
                      alt={sub.user.name}
                      className="w-11 h-11 rounded-full object-cover border-2 border-indigo-200 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
                      {sub.user.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <h4 className="font-bold text-slate-900 text-sm md:text-base leading-tight">{sub.user.name}</h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      ID: {sub.user.reg_or_staff_id} • @{sub.user.username}
                    </p>
                  </div>
                </div>

                {/* CENTER: Leaf Node Name & Parent Groups Hierarchy */}
                <div className="flex-1 md:px-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                      Leaf Item
                    </span>
                    <span className="font-bold text-slate-800 text-sm md:text-base">{sub.leaf_title}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Path:</span>
                    <span className="font-semibold text-slate-700 bg-slate-200/70 px-2 py-0.5 rounded text-[11px]">
                      {sub.parent_path}
                    </span>
                  </p>
                </div>

                {/* RIGHT END: Status Badge & View Button */}
                <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border ${
                      sub.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : sub.status === 'rejected'
                        ? 'bg-red-100 text-red-800 border-red-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                    }`}
                  >
                    {sub.status}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleOpenDetailModal(sub)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <span>View</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* VIEW SUBMISSION FULL DETAILS MODAL POPUP */}
      {isDetailModalOpen && selectedSub && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden transform transition-all">
              {/* Header with Title and Animated Big Credit Display */}
              <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between gap-4 border-b border-slate-800">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">
                    PBAS Submission Detail
                  </div>
                  <h3 className="text-lg font-bold text-white truncate mt-0.5" title={selectedSub.leaf_title}>
                    {selectedSub.leaf_title}
                  </h3>
                </div>

                {/* Animated Glowing Big Credit Score Badge */}
                <div className="relative group shrink-0">
                  <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-indigo-500 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-300 animate-pulse"></div>
                  <div className="relative px-4 py-2 bg-slate-900 rounded-xl border border-amber-400/40 flex flex-col items-center justify-center text-center shadow-lg">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                      PBAS Credit
                    </span>
                    <span className="text-2xl font-black tracking-tight text-white drop-shadow-md">
                      {selectedSub.pbas_credit}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5">
                {/* Submitter info card */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center gap-3">
                  {selectedSub.user.profile_image ? (
                    <img
                      src={selectedSub.user.profile_image}
                      alt={selectedSub.user.name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-indigo-300"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                      {selectedSub.user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{selectedSub.user.name}</div>
                    <div className="text-xs text-slate-500 font-medium">
                      ID/Reg: {selectedSub.user.reg_or_staff_id} • @{selectedSub.user.username}
                    </div>
                  </div>
                </div>

                {/* Parent Group Path */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category Path</span>
                  <div className="p-2.5 bg-slate-100 rounded-xl text-xs font-semibold text-slate-800">
                    {selectedSub.parent_path}
                  </div>
                </div>

                {/* Evidence File or Link */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Submitted Evidence</span>
                  {selectedSub.submission_type === 'link' ? (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-medium text-indigo-900 truncate max-w-xs">{selectedSub.link}</span>
                      <a
                        href={selectedSub.link || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold shadow hover:bg-indigo-700 transition-all shrink-0"
                      >
                        Open Link ↗
                      </a>
                    </div>
                  ) : selectedSub.file_url ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-base">📄</span>
                        <span className="text-xs font-bold text-emerald-900 truncate">
                          {selectedSub.file_name || 'Evidence Document'}
                        </span>
                      </div>
                      <a
                        href={selectedSub.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shadow hover:bg-emerald-700 transition-all shrink-0"
                      >
                        View Document ↗
                      </a>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-100 text-slate-500 text-xs font-medium rounded-xl">No file uploaded.</div>
                  )}
                </div>

                {/* Rejection Form view */}
                {showRejectForm && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 animate-fadeIn">
                    <label className="block text-xs font-semibold text-red-800 uppercase tracking-wide">
                      Reason for Rejection (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Specify reason for rejecting this submission..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full p-2.5 text-xs border border-red-300 rounded-xl outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                )}
              </div>

              {/* Modal Footer with Approve / Reject Action Buttons */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                  disabled={actionBusy}
                >
                  Close
                </button>

                {selectedSub.status === 'pending' ? (
                  <div className="flex items-center gap-3">
                    {!showRejectForm ? (
                      <button
                        type="button"
                        onClick={() => setShowRejectForm(true)}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-md shadow-red-500/20 transition-all active:scale-95 disabled:opacity-60"
                        disabled={actionBusy}
                      >
                        Reject
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleReject}
                        className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-sm font-bold shadow-md shadow-red-500/20 transition-all active:scale-95 disabled:opacity-60"
                        disabled={actionBusy}
                      >
                        Confirm Reject
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleApprove}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-60"
                      disabled={actionBusy}
                    >
                      {actionBusy ? 'Processing…' : 'Approve'}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-bold text-slate-400">Status: {selectedSub.status.toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
