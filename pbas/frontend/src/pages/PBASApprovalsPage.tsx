import React, { useEffect, useState } from 'react'
import {
  FileCheck2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  ExternalLink,
  Download,
  AlertCircle,
  Shield,
  Layers,
  FileText,
  User,
} from 'lucide-react'
import { PBASApprovalItem, AuthUser } from '../types/pbas'
import { fetchPBASApprovals, submitApprovalAction } from '../services/pbas'
import { ModalPortal } from '../components/ModalPortal'

interface Props {
  user: AuthUser | null
}

export default function PBASApprovalsPage({ user }: Props) {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [submissions, setSubmissions] = useState<PBASApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Review Detail Modal
  const [selectedSub, setSelectedSub] = useState<PBASApprovalItem | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const loadApprovals = async (tab: string = activeTab) => {
    setLoading(true)
    setErrorMsg('')
    try {
      const items = await fetchPBASApprovals(tab)
      setSubmissions(items)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load approvals queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadApprovals(activeTab)
  }, [activeTab])

  const filtered = submissions.filter((sub) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const name = (sub.user?.name || '').toLowerCase()
    const staffId = (sub.user?.reg_or_staff_id || '').toLowerCase()
    const title = (sub.leaf_title || '').toLowerCase()
    const dept = (sub.department_name || '').toLowerCase()
    return name.includes(q) || staffId.includes(q) || title.includes(q) || dept.includes(q)
  })

  const openReviewModal = (sub: PBASApprovalItem) => {
    setSelectedSub(sub)
    setShowRejectForm(false)
    setRejectReason('')
    setIsDetailModalOpen(true)
    setErrorMsg('')
    setSuccessMsg('')
  }

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedSub) return
    if (action === 'reject' && !rejectReason.trim()) {
      setErrorMsg('Please specify a rejection reason so the applicant can correct their submission.')
      return
    }

    setActionBusy(true)
    setErrorMsg('')
    try {
      const res = await submitApprovalAction(selectedSub.id, action, rejectReason)
      setSuccessMsg(res.message || `Submission ${action}d successfully.`)
      setIsDetailModalOpen(false)
      loadApprovals(activeTab)
    } catch (err: any) {
      setErrorMsg(err?.message || `Failed to ${action} submission`)
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-blue-600" />
            <span>PBAS Approvals Review Hub</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review faculty & student appraisal evidence, approve credits, and manage multi-stage clearance workflows.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, ID, title..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => {
          const isActive = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <span>{tab === 'pending' ? 'Pending Review' : tab}</span>
            </button>
          )
        })}
      </div>

      {/* List / Table */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-xs text-slate-400 border border-slate-200">
          Loading approval items...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-xs text-slate-400 border border-slate-200">
          No submissions matching the current filter.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Applicant</th>
                  <th className="px-5 py-3">Criterion / Title</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Points</th>
                  <th className="px-5 py-3">Current Step</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const isApproved = item.status === 'approved'
                  const isPending = item.status === 'pending'
                  const isRejected = item.status === 'rejected'

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900">{item.user?.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.user?.reg_or_staff_id} • {item.department_code || 'CSE'}
                        </div>
                      </td>
                      <td className="px-5 py-4 max-w-xs font-medium text-slate-900 truncate">
                        {item.leaf_title}
                      </td>
                      <td className="px-5 py-4 text-slate-500 max-w-[180px] truncate">
                        {item.category || item.parent_path}
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-900">
                        {item.pbas_credit} pts
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {item.current_step || 'Review'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {isApproved && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                            Approved
                          </span>
                        )}
                        {isPending && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-200">
                            Pending
                          </span>
                        )}
                        {isRejected && (
                          <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-bold border border-red-200">
                            Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => openReviewModal(item)}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-xs transition-all"
                        >
                          Review & Act
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Detail Modal */}
      {isDetailModalOpen && selectedSub && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-fade-in">
              <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
                <div>
                  <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                    {selectedSub.category || selectedSub.parent_path}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    {selectedSub.leaf_title}
                  </h3>
                  <div className="text-xs text-slate-500 mt-1">
                    Applicant: <strong className="text-slate-800">{selectedSub.user?.name}</strong> ({selectedSub.user?.reg_or_staff_id}) • {selectedSub.department_name}
                  </div>
                </div>
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Form Data Preview */}
              {selectedSub.form_data && Object.keys(selectedSub.form_data).length > 0 && (
                <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Submitted Evidence Details
                  </div>
                  {Object.entries(selectedSub.form_data).map(([k, v]) => (
                    <div key={k} className="text-xs flex justify-between gap-4">
                      <span className="text-slate-500 font-medium">{k}:</span>
                      <span className="text-slate-900 font-semibold text-right">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Evidence Attachment or Link */}
              <div className="mb-5 p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">Attached Verification Proof</div>
                  <div className="text-[11px] text-slate-400">
                    {selectedSub.file_name ? selectedSub.file_name : (selectedSub.link ? selectedSub.link : 'Evidence submitted via form')}
                  </div>
                </div>
                {selectedSub.link ? (
                  <a
                    href={selectedSub.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open URL</span>
                  </a>
                ) : selectedSub.file_url ? (
                  <a
                    href={selectedSub.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                ) : null}
              </div>

              {/* Reject Reason Form if Reject toggled */}
              {showRejectForm ? (
                <div className="mb-5 p-4 rounded-xl bg-red-50/70 border border-red-200 space-y-2">
                  <label className="block text-xs font-bold text-red-800">
                    Specify Rejection Feedback / Corrections Needed:
                  </label>
                  <textarea
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Please attach Scopus indexing screenshot and update pass percentage..."
                    className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction('reject')}
                      disabled={actionBusy}
                      className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
                    >
                      {actionBusy ? 'Processing...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>

                {selectedSub.status === 'pending' && !showRejectForm && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(true)}
                      className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 transition-colors flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject with Remarks</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAction('approve')}
                      disabled={actionBusy}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve Submission ({selectedSub.pbas_credit} pts)</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
