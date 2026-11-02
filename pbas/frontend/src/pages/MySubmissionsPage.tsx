import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderKanban,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  ExternalLink,
  ChevronRight,
  FilePlus2,
  Calendar,
  Layers,
  Award,
} from 'lucide-react'
import { PBASSubmission, AuthUser } from '../types/pbas'
import { fetchMySubmissions } from '../services/pbas'
import { ModalPortal } from '../components/ModalPortal'

interface Props {
  user: AuthUser | null
}

export default function MySubmissionsPage({ user }: Props) {
  const [submissions, setSubmissions] = useState<PBASSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [selectedSub, setSelectedSub] = useState<PBASSubmission | null>(null)

  useEffect(() => {
    fetchMySubmissions()
      .then(setSubmissions)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  const filtered = submissions.filter((s) => {
    if (activeTab === 'all') return true
    return s.status === activeTab
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-600" />
            <span>My PBAS Submissions History</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track multi-tier review status, approval steps, and verification notes across all your submissions.
          </p>
        </div>

        <Link
          to="/dashboard/submit"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>New Submission</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => {
          const count = submissions.filter(s => tab === 'all' ? true : s.status === tab).length
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
              <span>{tab}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Submissions List */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-xs text-slate-400 border border-slate-200">
          Loading your submission history...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-xs text-slate-400 border border-slate-200">
          No submissions found in this category.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sub) => {
            const isApproved = sub.status === 'approved'
            const isPending = sub.status === 'pending'
            const isRejected = sub.status === 'rejected'

            return (
              <div
                key={sub.id}
                className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {sub.parent_path || 'Category'}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {sub.pbas_credit} pts
                    </span>
                    {isApproved && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Fully Approved
                      </span>
                    )}
                    {isPending && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> In Review ({sub.current_step || 'Approver'})
                      </span>
                    )}
                    {isRejected && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Rejected
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-base text-slate-900 mt-1">
                    {sub.leaf_title}
                  </h3>

                  {/* Rejection reason box */}
                  {isRejected && sub.rejection_reason && (
                    <div className="mt-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      <strong>Approver Remarks:</strong> {sub.rejection_reason}
                    </div>
                  )}

                  <div className="text-xs text-slate-400 mt-2 flex items-center gap-3">
                    <span>Submitted: {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : '—'}</span>
                    {sub.approved_by_name && (
                      <span>• Ratified by: <strong>{sub.approved_by_name}</strong></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setSelectedSub(sub)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                  >
                    View Details & Timeline
                  </button>

                  {sub.link && (
                    <a
                      href={sub.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                      title="Open proof link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail & Timeline Modal */}
      {selectedSub && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-fade-in">
              <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
                <div>
                  <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                    {selectedSub.parent_path}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    {selectedSub.leaf_title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedSub(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Form Data */}
              {selectedSub.form_data && Object.keys(selectedSub.form_data).length > 0 && (
                <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Submitted Form Details
                  </div>
                  {Object.entries(selectedSub.form_data).map(([key, val]) => (
                    <div key={key} className="text-xs flex justify-between gap-4">
                      <span className="text-slate-500 font-medium">{key}:</span>
                      <span className="text-slate-900 font-semibold text-right">{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Approval History Stepper */}
              <div className="mb-6">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Workflow Review Timeline
                </div>

                <div className="space-y-4 pl-2 border-l-2 border-slate-200 ml-2">
                  {(selectedSub.approval_history || []).map((step, idx) => (
                    <div key={idx} className="relative pl-5">
                      <div className="absolute -left-[15px] top-0.5 w-5 h-5 rounded-full bg-white border-2 border-blue-600 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 capitalize">
                          {step.step || 'Stage'} — {step.action}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {step.timestamp ? new Date(step.timestamp).toLocaleString() : ''}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">By: {step.by_name}</div>
                      {step.remarks && (
                        <div className="text-xs text-slate-600 mt-1 italic bg-slate-50 p-2 rounded-lg">
                          "{step.remarks}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setSelectedSub(null)}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
