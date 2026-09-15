import React, { useEffect, useState } from 'react'
import { ModalPortal } from '../../../components/ModalPortal'
import {
  PBASApprovalItem,
  PBASNode,
  fetchPBASApprovals,
  getDepartmentTree,
  submitApprovalAction,
} from '../../../services/pbas'
import fetchWithAuth from '../../../services/fetchAuth'

const APPROVAL_CATEGORIES = [
  'Academics',
  'Student Development',
  'Research and Development',
  'Institutional Contribution',
] as const

const APPROVAL_DEPARTMENTS = ['CSE', 'IT', 'AIDS', 'AIML', 'CE', 'ME', 'EEE', 'ECE'] as const

type ApprovalFilters = {
  fromDate: string
  toDate: string
  departments: string[]
  categories: string[]
}

function collectTreeNodes(nodes: PBASNode[], result: PBASNode[] = []): PBASNode[] {
  nodes.forEach((node) => {
    result.push(node)
    collectTreeNodes(node.children || [], result)
  })
  return result
}

function nodeMatchesSelection(submission: PBASApprovalItem, selectedIds: string[]): boolean {
  return selectedIds.length === 0 || selectedIds.some((id) => submission.node_ancestor_ids?.includes(id))
}

function normalizeDepartmentCode(value?: string | null): string {
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized === 'AIDS' || normalized === 'AIDSDEPARTMENT') return 'AIDS'
  if (normalized === 'AIML' || normalized === 'AIMLDEPARTMENT') return 'AIML'
  return normalized
}

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
  const [documentBusy, setDocumentBusy] = useState(false)
  const [approvalTree, setApprovalTree] = useState<PBASNode[]>([])
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [departmentMenuOpen, setDepartmentMenuOpen] = useState(false)
  const [draftFromDate, setDraftFromDate] = useState('')
  const [draftToDate, setDraftToDate] = useState('')
  const [draftDepartments, setDraftDepartments] = useState<string[]>([])
  const [draftCategories, setDraftCategories] = useState<string[]>([])
  const [appliedFilters, setAppliedFilters] = useState<ApprovalFilters>({
    fromDate: '',
    toDate: '',
    departments: [],
    categories: [],
  })

  const isAllView = activeTab === 'all'
  const allTreeNodes = collectTreeNodes(approvalTree)

  const filteredSubmissions = submissions.filter((submission) => {
    if (!isAllView) return true
    const submittedDate = submission.created_at ? new Date(submission.created_at).toISOString().slice(0, 10) : ''
    if (appliedFilters.fromDate && (!submittedDate || submittedDate < appliedFilters.fromDate)) return false
    if (appliedFilters.toDate && (!submittedDate || submittedDate > appliedFilters.toDate)) return false
    if (appliedFilters.departments.length > 0 && !appliedFilters.departments.includes(normalizeDepartmentCode(submission.department_code))) return false
    if (!nodeMatchesSelection(submission, appliedFilters.categories)) return false
    return true
  })

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
  }

  // Load submissions for active tab
  const loadApprovals = async (tab: string = activeTab) => {
    setLoading(true)
    setErrorMsg('')
    try {
      const data = await fetchPBASApprovals(tab === 'all' ? 'all' : tab)
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

  useEffect(() => {
    if (!isAllView || approvalTree.length > 0) return
    getDepartmentTree('master')
      .then((data) => setApprovalTree(data?.nodes || []))
      .catch(() => setApprovalTree([]))
  }, [isAllView, approvalTree.length])

  const applyFilters = () => {
    setAppliedFilters({
      fromDate: draftFromDate,
      toDate: draftToDate,
      departments: draftDepartments,
      categories: draftCategories,
    })
  }

  const toggleValue = (values: string[], value: string): string[] => (
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
  )

  const renderCategoryCheckboxes = (nodes: PBASNode[], values: string[], setValues: (values: string[]) => void, depth = 0): React.ReactNode => (
    <div className={depth ? 'ml-4 border-l border-slate-200 pl-3' : 'space-y-1'}>
      {nodes.map((node) => (
        <div key={node.id}>
          <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={values.includes(node.id)}
              onChange={() => setValues(toggleValue(values, node.id))}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="truncate">{node.label}</span>
          </label>
          {node.children && node.children.length > 0 && renderCategoryCheckboxes(node.children, values, setValues, depth + 1)}
        </div>
      ))}
    </div>
  )

  // Open Detail View Modal
  const handleOpenDetailModal = (sub: PBASApprovalItem) => {
    setSelectedSub(sub)
    setRejectReason('')
    setShowRejectForm(false)
    setIsDetailModalOpen(true)
  }

  const handleViewDocument = async () => {
    if (!selectedSub?.file_url) return

    const documentWindow = window.open('', '_blank')
    setDocumentBusy(true)
    try {
      const response = await fetchWithAuth(`/api/pbas/submissions/${encodeURIComponent(selectedSub.id)}/document/`)
      if (!response.ok) throw new Error(`Unable to open document (HTTP ${response.status}).`)
      const blobUrl = URL.createObjectURL(await response.blob())
      if (documentWindow) {
        documentWindow.location.href = blobUrl
      } else {
        window.open(blobUrl, '_blank')
      }
    } catch (e: any) {
      documentWindow?.close()
      setErrorMsg(e?.message || 'Unable to open document.')
    } finally {
      setDocumentBusy(false)
    }
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

  const renderFilteredDataTable = () => (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1180px] text-left">
        <thead className="bg-slate-900 text-white">
          <tr>
            {['Department Name', 'Faculty Name', 'Academics', 'Student Development', 'Research & Development', 'Institutional Contribution'].map((heading) => (
              <th key={heading} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {filteredSubmissions.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No records match the selected filters.</td>
            </tr>
          ) : filteredSubmissions.map((submission) => {
            const categoryCell = (category: string) => submission.category === category ? (
              <div className="space-y-2 min-w-[190px]">
                <div className="text-sm font-bold text-slate-900">{submission.leaf_title}</div>
                <div className="text-[11px] text-slate-500">{submission.parent_path || 'Root Category'}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-amber-800">{submission.pbas_credit ?? 0} points</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                    submission.status === 'approved'
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                      : submission.status === 'rejected'
                      ? 'border-red-300 bg-red-100 text-red-800'
                      : 'border-amber-300 bg-amber-100 text-amber-800'
                  }`}>{submission.status}</span>
                </div>
                <button type="button" onClick={() => handleOpenDetailModal(submission)} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700">
                  View / Approve
                </button>
              </div>
            ) : <span className="text-slate-300">—</span>

            return (
              <tr key={submission.id} className="align-top hover:bg-slate-50">
                <td className="px-4 py-4 text-sm font-semibold text-slate-800">
                  {submission.department_name || submission.department_code || 'N/A'}
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm font-bold text-slate-900">{submission.user.name}</div>
                  <div className="text-xs text-slate-500">{submission.applicant_type === 'student' ? 'Student' : 'Staff'} · {submission.user.reg_or_staff_id}</div>
                </td>
                <td className="px-4 py-4">{categoryCell('Academics')}</td>
                <td className="px-4 py-4">{categoryCell('Student Development')}</td>
                <td className="px-4 py-4">{categoryCell('Research and Development')}</td>
                <td className="px-4 py-4">{categoryCell('Institutional Contribution')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

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
            onClick={() => handleTabChange(tab)}
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

        {isAllView && loading ? (
          <div className="py-12 text-center text-slate-500 text-sm font-medium">Loading submissions list…</div>
        ) : isAllView ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  From Date
                  <input type="date" value={draftFromDate} onChange={(event) => setDraftFromDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  To Date
                  <input type="date" value={draftToDate} onChange={(event) => setDraftToDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
                </label>

                <div className="relative">
                  <button type="button" onClick={() => setDepartmentMenuOpen((open) => !open)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                    Department {draftDepartments.length ? `(${draftDepartments.length})` : '▼'}
                  </button>
                  {departmentMenuOpen && (
                    <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                      <label className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold text-slate-700">
                        <input type="checkbox" checked={draftDepartments.length === APPROVAL_DEPARTMENTS.length} onChange={() => setDraftDepartments(draftDepartments.length === APPROVAL_DEPARTMENTS.length ? [] : [...APPROVAL_DEPARTMENTS])} className="rounded border-slate-300 text-indigo-600" />
                        Select All
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-1">
                        {APPROVAL_DEPARTMENTS.map((department) => (
                          <label key={department} className="flex items-center gap-2 rounded px-1.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                            <input type="checkbox" checked={draftDepartments.includes(department)} onChange={() => setDraftDepartments(toggleValue(draftDepartments, department))} className="rounded border-slate-300 text-indigo-600" />
                            {department}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button type="button" onClick={() => setCategoryMenuOpen((open) => !open)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                    Categories {draftCategories.length ? `(${draftCategories.length})` : '▼'}
                  </button>
                  {categoryMenuOpen && (
                    <div className="fixed inset-0 z-40 bg-slate-950/45" onClick={() => setCategoryMenuOpen(false)}>
                      <aside
                        role="dialog"
                        aria-modal="true"
                        aria-label="Categories and sub-categories"
                        className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-5 text-white">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300">PBAS Filter</div>
                            <h3 className="mt-1 text-lg font-bold">Categories &amp; Sub-Categories</h3>
                            <p className="mt-1 text-xs text-slate-300">Select parent categories or individual leaf nodes from the complete hierarchy.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCategoryMenuOpen(false)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
                            aria-label="Close categories panel"
                          >
                            ×
                          </button>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3">
                          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <input type="checkbox" checked={allTreeNodes.length > 0 && draftCategories.length === allTreeNodes.length} onChange={() => setDraftCategories(draftCategories.length === allTreeNodes.length ? [] : allTreeNodes.map((node) => node.id))} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                            Select All Categories
                          </label>
                          <span className="text-xs font-semibold text-slate-500">{draftCategories.length} selected</span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                          {approvalTree.length > 0 ? (
                            <div className="space-y-2">{renderCategoryCheckboxes(approvalTree, draftCategories, setDraftCategories)}</div>
                          ) : (
                            <p className="py-12 text-center text-sm text-slate-500">Loading PBAS category hierarchy…</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                          <button type="button" onClick={() => setDraftCategories([])} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Clear Selection</button>
                          <button type="button" onClick={() => setCategoryMenuOpen(false)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">Done</button>
                        </div>
                      </aside>
                    </div>
                  )}
                </div>

                <button type="button" onClick={applyFilters} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">
                  Filter Data
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Showing {filteredSubmissions.length} of {submissions.length} submissions</span>
                {(appliedFilters.fromDate || appliedFilters.toDate || appliedFilters.departments.length || appliedFilters.categories.length) ? (
                  <button type="button" onClick={() => { setDraftFromDate(''); setDraftToDate(''); setDraftDepartments([]); setDraftCategories([]); setAppliedFilters({ fromDate: '', toDate: '', departments: [], categories: [] }) }} className="font-semibold text-indigo-600 hover:text-indigo-800">
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>
            {renderFilteredDataTable()}
          </div>
        ) : loading ? (
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
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg flex flex-col overflow-hidden transform transition-all"
              style={{ maxHeight: 'calc(100vh - 2rem)' }}
            >
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
              <div
                className="p-6 space-y-5 min-h-0 flex-1"
                style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
              >
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

                {/* Dynamic Form Responses */}
                {selectedSub.form_data && typeof selectedSub.form_data === 'object' && Object.keys(selectedSub.form_data).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Questionnaire Responses
                    </span>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                      {selectedSub.form_schema && selectedSub.form_schema.length > 0 ? (
                        selectedSub.form_schema.map((field) => {
                          const val = selectedSub.form_data?.[field.id]
                          return (
                            <div key={field.id} className="text-xs space-y-0.5 border-b border-slate-200/60 pb-2 last:border-0 last:pb-0">
                              <div className="font-bold text-slate-700">{field.label}:</div>
                              <div className="text-slate-900 font-medium pl-1">
                                {Array.isArray(val) ? val.join(', ') : val ? String(val) : <span className="text-slate-400 italic">Not provided</span>}
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        Object.entries(selectedSub.form_data).map(([k, v]) => (
                          <div key={k} className="text-xs space-y-0.5">
                            <div className="font-bold text-slate-700">{k}:</div>
                            <div className="text-slate-900 font-medium pl-1">
                              {Array.isArray(v) ? v.join(', ') : String(v)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Evidence File or Link */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Submitted Evidence</span>
                  {selectedSub.submission_type === 'link' || selectedSub.link ? (
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
                      <button
                        type="button"
                        onClick={handleViewDocument}
                        disabled={documentBusy}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shadow hover:bg-emerald-700 transition-all shrink-0"
                      >
                        {documentBusy ? 'Opening…' : 'View Document ↗'}
                      </button>
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
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
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
