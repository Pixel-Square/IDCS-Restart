import React, { useEffect, useMemo, useState } from 'react'
import {
  Search,
  RefreshCw,
  Download,
  Filter,
  Users,
  GraduationCap,
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Eye,
  FileText,
  UploadCloud,
  Link as LinkIcon,
  Award,
  Layers,
  Sparkles,
  ExternalLink,
  X,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { ModalPortal } from '../../../components/ModalPortal'
import fetchWithAuth from '../../../services/fetchAuth'
import {
  PBASActivityNodeItem,
  PBASActivitySubmissionItem,
  PBASUserActivityDetailResponse,
  PBASUserActivityListResponse,
  PBASUserActivityParams,
  PBASUserActivityRow,
  fetchPBASUserActivityDetail,
  fetchPBASUserActivityList,
} from '../../../services/pbas'
import { fetchDepartments } from '../../../services/academics'
import type { DepartmentRow } from '../../../services/academics'

function getInitials(name?: string | null): string {
  const s = String(name || '').trim()
  if (!s) return '—'
  const parts = s.split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''
  return (a + b).toUpperCase() || s.substring(0, 2).toUpperCase()
}

function fmtDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return '—'
  }
}

interface PBASUserActivityTabProps {
  initialUserId?: number | null
}

export default function PBASUserActivityTab({ initialUserId }: PBASUserActivityTabProps): JSX.Element {
  const [departments, setDepartments] = useState<DepartmentRow[]>([])

  // Filter State for List View
  const [draft, setDraft] = useState<PBASUserActivityParams>({
    role: '',
    department_id: '',
    semester: '',
    status: '',
    q: '',
    limit: 100,
  })
  const [applied, setApplied] = useState<PBASUserActivityParams>(draft)

  // List View Data State
  const [listData, setListData] = useState<PBASUserActivityListResponse>({
    stats: {
      total_users: 0,
      completed_users: 0,
      in_progress_users: 0,
      not_started_users: 0,
      avg_completion_pct: 0,
      matched_count: 0,
    },
    users: [],
  })
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  // Detail View State (Drill-down)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(initialUserId || null)
  const [detailData, setDetailData] = useState<PBASUserActivityDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Detail View UI Controls
  const [detailFilterStatus, setDetailFilterStatus] = useState<'all' | 'pending' | 'completed'>('all')
  const [detailSearch, setDetailSearch] = useState('')
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})

  // Modal for Viewing Submission Evidences
  const [selectedSubmission, setSelectedSubmission] = useState<{
    sub: PBASActivitySubmissionItem
    leafTitle: string
    categoryPath: string
  } | null>(null)
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null)
  const [modalPreviewUrl, setModalPreviewUrl] = useState<string | null>(null)
  const [modalPreviewLoading, setModalPreviewLoading] = useState(false)

  // Load Departments master list
  useEffect(() => {
    let mounted = true
    fetchDepartments()
      .then((items) => {
        if (mounted) setDepartments(items)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  // Fetch Users List
  const loadUserList = () => {
    setListLoading(true)
    setListError(null)
    fetchPBASUserActivityList(applied)
      .then((res) => {
        setListData(res)
      })
      .catch((err: any) => {
        setListError(err?.message || 'Failed to load user activity data.')
      })
      .finally(() => {
        setListLoading(false)
      })
  }

  useEffect(() => {
    loadUserList()
  }, [applied])

  // Fetch Detail Data when a user is selected
  useEffect(() => {
    if (!selectedUserId) {
      setDetailData(null)
      return
    }
    setDetailLoading(true)
    setDetailError(null)
    fetchPBASUserActivityDetail(selectedUserId)
      .then((res) => {
        setDetailData(res)
        // Auto-expand all root and parent nodes
        const defaultExpanded: Record<string, boolean> = {}
        const markExpanded = (nodes: PBASActivityNodeItem[]) => {
          for (const n of nodes) {
            if (!n.is_leaf) {
              defaultExpanded[n.id] = true
              if (n.children && n.children.length > 0) {
                markExpanded(n.children)
              }
            }
          }
        }
        markExpanded(res.nodes_tree)
        setExpandedNodes(defaultExpanded)
      })
      .catch((err: any) => {
        setDetailError(err?.message || 'Failed to load user activity details.')
      })
      .finally(() => {
        setDetailLoading(false)
      })
  }, [selectedUserId])

  // Load Image preview in Modal
  useEffect(() => {
    if (!selectedSubmission || (!selectedSubmission.sub.file_url && !selectedSubmission.sub.file_name)) {
      setModalPreviewUrl(null)
      return
    }
    let isMounted = true
    const fileName = (selectedSubmission.sub.file_name || selectedSubmission.sub.file_url || '').toLowerCase()
    const isImage =
      fileName.endsWith('.png') ||
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.webp') ||
      fileName.endsWith('.gif') ||
      fileName.includes('.png') ||
      fileName.includes('.jpg') ||
      fileName.includes('.jpeg')

    if (isImage) {
      setModalPreviewLoading(true)
      fetchWithAuth(`/api/pbas/submissions/${encodeURIComponent(selectedSubmission.sub.id)}/document/`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load image')
          return res.blob()
        })
        .then((blob) => {
          if (isMounted) {
            const blobUrl = URL.createObjectURL(blob)
            setModalPreviewUrl(blobUrl)
          }
        })
        .catch(() => {
          if (isMounted) setModalPreviewUrl(null)
        })
        .finally(() => {
          if (isMounted) setModalPreviewLoading(false)
        })
    } else {
      setModalPreviewUrl(null)
      setModalPreviewLoading(false)
    }

    return () => {
      isMounted = false
    }
  }, [selectedSubmission])

  const handleApplyFilters = () => {
    setApplied({ ...draft })
  }

  const handleResetFilters = () => {
    const fresh: PBASUserActivityParams = {
      role: '',
      department_id: '',
      semester: '',
      status: '',
      q: '',
      limit: 100,
    }
    setDraft(fresh)
    setApplied(fresh)
  }

  const handleToggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }))
  }

  const handleExpandAll = () => {
    if (!detailData) return
    const allExp: Record<string, boolean> = {}
    const markAll = (nodes: PBASActivityNodeItem[]) => {
      for (const n of nodes) {
        if (!n.is_leaf) {
          allExp[n.id] = true
          if (n.children?.length) markAll(n.children)
        }
      }
    }
    markAll(detailData.nodes_tree)
    setExpandedNodes(allExp)
  }

  const handleCollapseAll = () => {
    setExpandedNodes({})
  }

  const handleViewDocument = async (sub: PBASActivitySubmissionItem) => {
    if (!sub || !sub.id) return
    setLoadingDocId(sub.id)
    let documentWindow: Window | null = null
    try {
      documentWindow = window.open('about:blank', '_blank')
    } catch {
      documentWindow = null
    }

    try {
      const response = await fetchWithAuth(`/api/pbas/submissions/${encodeURIComponent(sub.id)}/document/`)
      if (!response.ok) throw new Error(`Unable to load document (HTTP ${response.status}).`)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      if (documentWindow && !documentWindow.closed) {
        documentWindow.location.href = blobUrl
      } else {
        window.open(blobUrl, '_blank')
      }
    } catch (e: any) {
      if (documentWindow && !documentWindow.closed) {
        documentWindow.close()
      }
      alert(e?.message || 'Unable to open document.')
    } finally {
      setLoadingDocId(null)
    }
  }

  const handleDownloadDocument = async (sub: PBASActivitySubmissionItem) => {
    if (!sub || !sub.id) return
    setLoadingDocId(sub.id)
    try {
      const response = await fetchWithAuth(`/api/pbas/submissions/${encodeURIComponent(sub.id)}/document/`)
      if (!response.ok) throw new Error(`Unable to download document (HTTP ${response.status}).`)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = sub.file_name || 'pbas_document'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
    } catch (e: any) {
      alert(e?.message || 'Unable to download document.')
    } finally {
      setLoadingDocId(null)
    }
  }

  // Export User Activity list to Excel
  const handleExportExcel = () => {
    if (!listData.users.length) return
    const exportRows = listData.users.map((u, idx) => ({
      'S.No': idx + 1,
      Name: u.name,
      'User ID / Reg No': u.reg_or_staff_id,
      Role: u.role,
      Department: u.department.code || u.department.name || '—',
      Semester: u.semester ? `Semester ${u.semester}` : '—',
      'Section / Batch': u.section_name || u.batch || '—',
      Designation: u.designation || '—',
      'Leaf Nodes Completed': u.completed_leaf_nodes,
      'Total Applicable Leaf Nodes': u.total_leaf_nodes,
      'Completion %': `${u.completion_percentage}%`,
      'Total Submissions': u.total_submissions,
      'Total Awarded Credits': u.total_credits,
      Status: u.status === 'completed' ? 'Fully Completed' : u.status === 'in_progress' ? 'In Progress' : 'Not Started',
      'Last Submitted': fmtDateTime(u.last_submitted_at),
    }))

    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PBAS User Activity')
    XLSX.writeFile(wb, `PBAS_User_Activity_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ==========================================
  // RENDER: DRILL-DOWN USER ACTIVITY DETAIL VIEW
  // ==========================================
  if (selectedUserId && detailData) {
    const user = detailData.user
    const stats = detailData.stats
    const completionPct = stats.completion_percentage
    const isCompleted = stats.completed_leaf_nodes === stats.total_leaf_nodes && stats.total_leaf_nodes > 0

    // Filter nodes in detail tree
    const filterNodeTree = (nodes: PBASActivityNodeItem[]): PBASActivityNodeItem[] => {
      const result: PBASActivityNodeItem[] = []
      for (const node of nodes) {
        if (node.is_leaf) {
          const matchStatus =
            detailFilterStatus === 'all' ||
            (detailFilterStatus === 'completed' && node.is_completed) ||
            (detailFilterStatus === 'pending' && !node.is_completed)
          const matchSearch =
            !detailSearch.trim() ||
            node.label.toLowerCase().includes(detailSearch.toLowerCase().trim())

          if (matchStatus && matchSearch) {
            result.push(node)
          }
        } else {
          const filteredChildren = filterNodeTree(node.children || [])
          if (filteredChildren.length > 0) {
            result.push({
              ...node,
              children: filteredChildren,
            })
          }
        }
      }
      return result
    }

    const filteredNodes = filterNodeTree(detailData.nodes_tree)

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Top Navigation & Profile Header */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
          {/* Top Banner Bar */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedUserId(null)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to User Activity List</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 font-medium">Viewing PBAS Activity for:</span>
              <span className="text-xs font-bold text-indigo-300">{user.name}</span>
            </div>
          </div>

          {/* User Profile + Completion Stats Card */}
          <div className="p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Left: User Profile Details */}
            <div className="flex items-center gap-5">
              {user.profile_image ? (
                <img
                  src={user.profile_image}
                  alt={user.name}
                  className="w-20 h-20 rounded-3xl object-cover border-2 border-indigo-100 shadow-md"
                />
              ) : (
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-extrabold text-2xl shadow-md">
                  {getInitials(user.name)}
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">{user.name}</h2>
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wide border ${
                      user.role === 'STAFF'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-sky-50 text-sky-700 border-sky-200'
                    }`}
                  >
                    {user.role}
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    {user.reg_or_staff_id}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                  <span className="flex items-center gap-1 font-medium">
                    <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{user.department.name || user.department.code}</span>
                  </span>
                  {user.semester && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-indigo-600">Semester {user.semester}</span>
                    </>
                  )}
                  {user.section_name && (
                    <>
                      <span>•</span>
                      <span>Section {user.section_name}</span>
                    </>
                  )}
                  {user.designation && (
                    <>
                      <span>•</span>
                      <span className="text-slate-500">{user.designation}</span>
                    </>
                  )}
                  {user.email && (
                    <>
                      <span>•</span>
                      <span className="text-slate-400">{user.email}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Large Completion Percentage & KPI Card */}
            <div className="flex items-center gap-6 bg-slate-50/80 p-5 rounded-3xl border border-slate-200/80 shrink-0">
              {/* Radial Completion Percentage */}
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-200"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={
                        completionPct === 100
                          ? 'text-emerald-500'
                          : completionPct > 40
                          ? 'text-indigo-600'
                          : completionPct > 0
                          ? 'text-amber-500'
                          : 'text-rose-400'
                      }
                      strokeDasharray={`${completionPct}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-lg font-black text-slate-900 leading-none">{completionPct}%</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Progress</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-800'
                          : completionPct > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isCompleted ? '✓ Fully Completed' : completionPct > 0 ? '⏳ In Progress' : '⚠️ Not Started'}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900">
                    <span className="text-base text-indigo-600">{stats.completed_leaf_nodes}</span> /{' '}
                    <span>{stats.total_leaf_nodes}</span> Leaf Nodes
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {stats.total_submissions} submissions • {stats.total_credits} credits earned
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hierarchy Tree Controls Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Filter Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Filter Nodes:</span>
            <button
              type="button"
              onClick={() => setDetailFilterStatus('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                detailFilterStatus === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              All Nodes ({stats.total_leaf_nodes})
            </button>
            <button
              type="button"
              onClick={() => setDetailFilterStatus('pending')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                detailFilterStatus === 'pending'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Pending Only ({stats.total_leaf_nodes - stats.completed_leaf_nodes})</span>
            </button>
            <button
              type="button"
              onClick={() => setDetailFilterStatus('completed')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                detailFilterStatus === 'completed'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Completed Only ({stats.completed_leaf_nodes})</span>
            </button>
          </div>

          {/* Search & Collapse Controls */}
          <div className="flex items-center gap-3">
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search node titles..."
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Nodes Hierarchy Tree View */}
        <div className="space-y-4">
          {filteredNodes.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 text-sm">
              No PBAS nodes matching the current filter criteria.
            </div>
          ) : (
            filteredNodes.map((rootNode) => (
              <RenderNodeHierarchyCard
                key={rootNode.id}
                node={rootNode}
                level={0}
                expandedNodes={expandedNodes}
                onToggleNode={handleToggleNode}
                onViewSubmission={(sub, leafTitle, categoryPath) =>
                  setSelectedSubmission({ sub, leafTitle, categoryPath })
                }
                onViewDoc={handleViewDocument}
                onDownloadDoc={handleDownloadDocument}
                loadingDocId={loadingDocId}
              />
            ))
          )}
        </div>

        {/* Submission Evidence Modal */}
        {selectedSubmission && (
          <ModalPortal>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
              <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">
                        Submission Details
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full capitalize ${
                          selectedSubmission.sub.status === 'approved'
                            ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30'
                            : selectedSubmission.sub.status === 'rejected'
                            ? 'bg-rose-500/30 text-rose-200 border border-rose-400/30'
                            : 'bg-amber-500/30 text-amber-200 border border-amber-400/30'
                        }`}
                      >
                        {selectedSubmission.sub.status}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mt-1.5">{selectedSubmission.leafTitle}</h3>
                    <p className="text-xs text-slate-300 mt-0.5">{selectedSubmission.categoryPath}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSubmission(null)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                  {/* Attached File Card */}
                  {(selectedSubmission.sub.file_url || selectedSubmission.sub.file_name) && (
                    <div className="space-y-3">
                      <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                            <UploadCloud className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {selectedSubmission.sub.file_name || 'Uploaded Document'}
                            </p>
                            <p className="text-[11px] text-slate-500">Document attached with submission</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleViewDocument(selectedSubmission.sub)}
                            disabled={loadingDocId === selectedSubmission.sub.id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                          >
                            {loadingDocId === selectedSubmission.sub.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                            <span>View Full</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadDocument(selectedSubmission.sub)}
                            disabled={loadingDocId === selectedSubmission.sub.id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>
                        </div>
                      </div>

                      {/* Inline Image Preview */}
                      {modalPreviewLoading ? (
                        <div className="p-8 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                          <span>Loading secure image preview...</span>
                        </div>
                      ) : modalPreviewUrl ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 overflow-hidden space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              Document / Image Preview
                            </p>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {selectedSubmission.sub.file_name}
                            </span>
                          </div>
                          <div className="relative max-h-96 overflow-auto rounded-xl border border-slate-200/80 bg-white flex items-center justify-center p-2.5">
                            <img
                              src={modalPreviewUrl}
                              alt={selectedSubmission.sub.file_name || 'Evidence Preview'}
                              className="max-h-80 w-auto object-contain rounded-lg shadow-xs"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* External Link Card */}
                  {selectedSubmission.sub.link && (
                    <div className="p-4 rounded-2xl bg-sky-50/50 border border-sky-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center">
                          <LinkIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">External URL Link</p>
                          <p className="text-[11px] text-slate-500 truncate max-w-xs">{selectedSubmission.sub.link}</p>
                        </div>
                      </div>
                      <a
                        href={selectedSubmission.sub.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Link</span>
                      </a>
                    </div>
                  )}

                  {/* Questionnaire Responses */}
                  {selectedSubmission.sub.submission_type === 'form' &&
                    selectedSubmission.sub.form_data &&
                    Object.keys(selectedSubmission.sub.form_data).length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-indigo-600" />
                          <span>Questionnaire Responses</span>
                        </h4>
                        <div className="space-y-2.5 bg-slate-50/60 rounded-2xl p-4 border border-slate-200/80">
                          {Object.entries(selectedSubmission.sub.form_data).map(([fieldKey, val]: [string, any]) => (
                            <div key={fieldKey} className="bg-white p-3 rounded-xl border border-slate-200/70">
                              <p className="text-xs font-bold text-slate-700 mb-1">{fieldKey}</p>
                              <p className="text-xs text-slate-900 font-medium whitespace-pre-wrap">
                                {Array.isArray(val) ? val.join(', ') : String(val ?? '—')}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Rejection Note */}
                  {selectedSubmission.sub.status === 'rejected' && selectedSubmission.sub.rejection_reason && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                      <p className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-1">Rejection Reason</p>
                      <p className="text-xs text-rose-900">{selectedSubmission.sub.rejection_reason}</p>
                    </div>
                  )}

                  {/* Submission Timestamp & Reviewer Info */}
                  <div className="border-t border-slate-100 pt-4 space-y-2 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <span>Submitted At:</span>
                      <span className="font-medium text-slate-700">{fmtDateTime(selectedSubmission.sub.created_at)}</span>
                    </div>
                    {selectedSubmission.sub.reviewed_at && (
                      <div className="flex justify-between">
                        <span>Reviewed At:</span>
                        <span className="font-medium text-slate-700">{fmtDateTime(selectedSubmission.sub.reviewed_at)}</span>
                      </div>
                    )}
                    {selectedSubmission.sub.approved_by_name && (
                      <div className="flex justify-between">
                        <span>Reviewed By:</span>
                        <span className="font-medium text-slate-700">{selectedSubmission.sub.approved_by_name}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedSubmission(null)}
                    className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all"
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

  // ==========================================
  // RENDER: MAIN USER ACTIVITY LIST VIEW
  // ==========================================
  return (
    <div className="space-y-6">
      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* Total Users */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Users</span>
            <p className="text-xl font-black text-slate-900 mt-0.5">{listData.stats.total_users}</p>
          </div>
        </div>

        {/* 100% Completed */}
        <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/20 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Completed (100%)</span>
            <p className="text-xl font-black text-emerald-900 mt-0.5">{listData.stats.completed_users}</p>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 bg-amber-50/20 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">In Progress</span>
            <p className="text-xl font-black text-amber-900 mt-0.5">{listData.stats.in_progress_users}</p>
          </div>
        </div>

        {/* Not Started */}
        <div className="bg-white p-4 rounded-2xl border border-rose-200/80 bg-rose-50/20 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Not Started (0%)</span>
            <p className="text-xl font-black text-rose-900 mt-0.5">{listData.stats.not_started_users}</p>
          </div>
        </div>

        {/* Average Completion Rate */}
        <div className="bg-white p-4 rounded-2xl border border-indigo-200/80 bg-indigo-50/20 shadow-xs flex items-center gap-3.5 col-span-2 md:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Avg Completion</span>
            <p className="text-xl font-black text-indigo-900 mt-0.5">{listData.stats.avg_completion_pct}%</p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar (Inspired by GatepassLogs) */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-sm">User Activity Filters</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Reset Filters
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={listData.users.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
            <button
              type="button"
              onClick={handleApplyFilters}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Apply Filters</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Role Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Role / Audience</label>
            <select
              value={draft.role || ''}
              onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">All Roles (Staff & Student)</option>
              <option value="staff">Faculty / Staff</option>
              <option value="student">Students</option>
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Department</label>
            <select
              value={draft.department_id || ''}
              onChange={(e) => setDraft((p) => ({ ...p, department_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name || dept.code}
                </option>
              ))}
            </select>
          </div>

          {/* Semester Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Semester (Student)</label>
            <select
              value={draft.semester || ''}
              onChange={(e) => setDraft((p) => ({ ...p, semester: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>
          </div>

          {/* Completion Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Progress Status</label>
            <select
              value={draft.status || ''}
              onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed (100%)</option>
              <option value="in_progress">In Progress (1-99%)</option>
              <option value="not_started">Not Started (0%)</option>
            </select>
          </div>

          {/* Limit Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Fetch Limit</label>
            <select
              value={draft.limit || 100}
              onChange={(e) => setDraft((p) => ({ ...p, limit: Number(e.target.value) }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value={50}>50 users</option>
              <option value={100}>100 users</option>
              <option value={200}>200 users</option>
              <option value={500}>500 users</option>
              <option value={1500}>All Available</option>
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Search User / Reg No</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Name, ID, Email..."
                value={draft.q || ''}
                onChange={(e) => setDraft((p) => ({ ...p, q: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyFilters()
                }}
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Users Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">Matched Users:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-200">
              {listData.users.length} of {listData.stats.matched_count}
            </span>
          </div>
          <button
            type="button"
            onClick={loadUserList}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold shadow-2xs transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-3 text-center w-12">#</th>
                <th className="py-3.5 px-4">User Details</th>
                <th className="py-3.5 px-3">ID / Reg No</th>
                <th className="py-3.5 px-3 text-center">Role</th>
                <th className="py-3.5 px-3">Department & Class</th>
                <th className="py-3.5 px-4 text-center">Nodes Completed</th>
                <th className="py-3.5 px-4 min-w-[170px]">Total Progress Completion %</th>
                <th className="py-3.5 px-3 text-center">Submissions</th>
                <th className="py-3.5 px-3 text-center">Credits</th>
                <th className="py-3.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {listLoading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                      <span className="text-xs text-slate-400 font-semibold">Calculating user activity & completion...</span>
                    </div>
                  </td>
                </tr>
              ) : listError ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-rose-600">
                    <p className="font-semibold">{listError}</p>
                    <button
                      type="button"
                      onClick={loadUserList}
                      className="mt-2 text-xs font-bold text-indigo-600 underline"
                    >
                      Try Again
                    </button>
                  </td>
                </tr>
              ) : listData.users.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Users className="w-8 h-8 text-slate-300" />
                      <p className="font-semibold text-slate-600 text-sm">No users found</p>
                      <p className="text-xs text-slate-400">Try adjusting your filters or search terms.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                listData.users.map((row, idx) => {
                  const pct = row.completion_percentage
                  const is100 = pct === 100
                  const is0 = pct === 0

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* S.No */}
                      <td className="py-3.5 px-3 text-center font-mono text-slate-400 text-[11px]">{idx + 1}</td>

                      {/* User Details */}
                      <td className="py-3.5 px-4 max-w-[220px]">
                        <div className="flex items-center gap-3">
                          {row.profile_image ? (
                            <img
                              src={row.profile_image}
                              alt={row.name}
                              className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                              {getInitials(row.name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate text-xs" title={row.name}>
                              {row.name}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate" title={row.email || row.username}>
                              {row.email || row.username}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* ID / Reg No */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {row.reg_or_staff_id}
                        </span>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            row.role === 'STAFF'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}
                        >
                          {row.role}
                        </span>
                      </td>

                      {/* Department & Class */}
                      <td className="py-3.5 px-3 max-w-[180px]">
                        <p className="font-semibold text-slate-800 truncate" title={row.department.name || row.department.code}>
                          {row.department.code || row.department.name}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {row.semester ? `Sem ${row.semester}` : ''}
                          {row.section_name ? ` • Sec ${row.section_name}` : ''}
                          {row.designation ? ` • ${row.designation}` : ''}
                        </p>
                      </td>

                      {/* Nodes Completed (X / Y) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="font-bold text-slate-800">
                          <span className={is100 ? 'text-emerald-600' : pct > 0 ? 'text-indigo-600' : 'text-slate-400'}>
                            {row.completed_leaf_nodes}
                          </span>
                          <span className="text-slate-400 text-[11px]"> / {row.total_leaf_nodes} nodes</span>
                        </span>
                      </td>

                      {/* Progress Completion % Bar */}
                      <td className="py-3.5 px-4 min-w-[170px]">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span
                              className={`font-extrabold ${
                                is100
                                  ? 'text-emerald-700'
                                  : pct > 40
                                  ? 'text-indigo-700'
                                  : pct > 0
                                  ? 'text-amber-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {pct}%
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded capitalize ${
                                is100
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : pct > 0
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {row.status.replace('_', ' ')}
                            </span>
                          </div>
                          {/* Progress Bar Container */}
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                is100
                                  ? 'bg-emerald-500'
                                  : pct > 40
                                  ? 'bg-indigo-600'
                                  : pct > 0
                                  ? 'bg-amber-500'
                                  : 'bg-transparent'
                              }`}
                              style={{ width: `${Math.max(pct, is0 ? 0 : 4)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Submissions */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                          {row.total_submissions}
                        </span>
                      </td>

                      {/* Credits */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-bold text-indigo-600 font-mono text-[11px]">+{row.total_credits}</span>
                      </td>

                      {/* Action View Button */}
                      <td className="py-3.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(row.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-[11px] font-bold shadow-xs transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Activity</span>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-700">{listData.users.length}</span> of{' '}
            <span className="font-semibold text-slate-700">{listData.stats.matched_count}</span> users
          </div>
          <div>
            Average Completion Rate: <span className="font-bold text-indigo-600">{listData.stats.avg_completion_pct}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// =========================================================================
// RECURSIVE COMPONENT FOR PBAS NODES HIERARCHY (PARENTS & LEAF NODES)
// User requirement:
// - If there is ANY pending in any leaf node, mark that leaf node as RED and its PARENT also RED (milky light red).
// - If all completed, it should be GREEN (milky light green).
// - Completed = minimum of one submission for that leaf node.
// =========================================================================

interface RenderNodeHierarchyCardProps {
  node: PBASActivityNodeItem
  level: number
  expandedNodes: Record<string, boolean>
  onToggleNode: (id: string) => void
  onViewSubmission: (sub: PBASActivitySubmissionItem, leafTitle: string, categoryPath: string) => void
  onViewDoc: (sub: PBASActivitySubmissionItem) => void
  onDownloadDoc: (sub: PBASActivitySubmissionItem) => void
  loadingDocId: string | null
}

function RenderNodeHierarchyCard({
  node,
  level,
  expandedNodes,
  onToggleNode,
  onViewSubmission,
  onViewDoc,
  onDownloadDoc,
  loadingDocId,
}: RenderNodeHierarchyCardProps): JSX.Element {
  const isExpanded = expandedNodes[node.id] ?? true
  const isLeaf = node.is_leaf
  const isCompleted = node.is_completed // for leaf: subs >= 1; for parent: all children completed

  // ==========================================
  // RENDER LEAF NODE
  // ==========================================
  if (isLeaf) {
    const hasSubmissions = node.submissions_count > 0

    return (
      <div
        className={`p-4 rounded-2xl border transition-all duration-150 ${
          isCompleted
            ? 'bg-emerald-50/80 border-emerald-200/90 text-emerald-950 shadow-xs' // Milky light green
            : 'bg-rose-50/80 border-rose-200/90 text-rose-950 shadow-xs' // Milky light red
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Leaf Info & Status Indicator */}
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                isCompleted
                  ? 'bg-emerald-200/70 text-emerald-800'
                  : 'bg-rose-200/70 text-rose-800'
              }`}
            >
              {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isCompleted
                      ? 'bg-emerald-200/80 text-emerald-900 border border-emerald-300'
                      : 'bg-rose-200/80 text-rose-900 border border-rose-300'
                  }`}
                >
                  {isCompleted ? `✓ Completed (${node.submissions_count} Submitted)` : '⚠️ Pending (0 Submissions)'}
                </span>

                <span className="text-[10px] font-semibold text-slate-500 bg-white/80 px-2 py-0.5 rounded border border-slate-200/60 uppercase">
                  {node.input_mode} mode
                </span>

                {node.pbas_credit > 0 && (
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-mono">
                    +{node.pbas_credit} pts
                  </span>
                )}
              </div>

              <h4 className="font-bold text-slate-900 text-sm">{node.label}</h4>
            </div>
          </div>

          {/* Right Action / Submission Count */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {hasSubmissions ? (
              <div className="flex items-center gap-2">
                {node.submissions.map((sub, sIdx) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onViewSubmission(sub, node.label, 'Submission Details')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold shadow-2xs transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Submission {node.submissions.length > 1 ? `#${sIdx + 1}` : ''}</span>
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-xs font-semibold text-rose-700 bg-rose-100/80 px-2.5 py-1 rounded-xl border border-rose-200">
                Action Required
              </span>
            )}
          </div>
        </div>

        {/* Existing Submissions List Preview (Inline) */}
        {hasSubmissions && (
          <div className="mt-3.5 pt-3 border-t border-emerald-200/70 space-y-2">
            <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">Submissions on this Node:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {node.submissions.map((sub, idx) => (
                <div
                  key={sub.id}
                  className="p-2.5 rounded-xl bg-white/90 border border-emerald-200/80 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded capitalize ${
                          sub.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : sub.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {sub.status}
                      </span>
                      <span className="text-slate-500 text-[10px]">{fmtDateTime(sub.created_at)}</span>
                    </div>
                    <p className="text-slate-800 font-medium truncate mt-0.5">
                      {sub.file_name || sub.link || (sub.submission_type === 'form' ? 'Form Questionnaire' : 'Submission')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewSubmission(sub, node.label, 'Submission Details')}
                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 shrink-0"
                    title="View Full Details"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ==========================================
  // RENDER PARENT / CATEGORY NODE
  // ==========================================
  const totalLeafs = node.total_leaf_children || 0
  const completedLeafs = node.completed_leaf_children || 0
  const isParentCompleted = isCompleted // True if ALL descendant leaf nodes are completed

  return (
    <div
      className={`rounded-3xl border transition-all duration-200 overflow-hidden ${
        isParentCompleted
          ? 'bg-emerald-50/40 border-emerald-200/90 shadow-2xs' // Milky light green parent
          : 'bg-rose-50/40 border-rose-200/90 shadow-2xs' // Milky light red parent
      }`}
    >
      {/* Parent Header Row */}
      <div
        onClick={() => onToggleNode(node.id)}
        className={`p-4 md:p-5 flex items-center justify-between cursor-pointer select-none transition-colors ${
          isParentCompleted
            ? 'bg-emerald-100/60 hover:bg-emerald-100/80 text-emerald-950 border-b border-emerald-200/80'
            : 'bg-rose-100/60 hover:bg-rose-100/80 text-rose-950 border-b border-rose-200/80'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className={`p-1 rounded-lg transition-transform ${
              isExpanded ? 'rotate-0' : '-rotate-90'
            } ${isParentCompleted ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'}`}
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                  isParentCompleted
                    ? 'bg-emerald-200 text-emerald-900 border-emerald-300'
                    : 'bg-rose-200 text-rose-900 border-rose-300'
                }`}
              >
                {isParentCompleted ? '✓ All Completed' : '⚠️ Incomplete Leaf Nodes Inside'}
              </span>

              <span className="text-xs font-bold text-slate-700 font-mono">
                {completedLeafs} / {totalLeafs} Leaf Nodes Done
              </span>
            </div>
            <h3 className="font-extrabold text-slate-900 text-base mt-1">{node.label}</h3>
          </div>
        </div>

        {/* Right Status Badge */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-extrabold text-slate-900">
              {totalLeafs > 0 ? Math.round((completedLeafs / totalLeafs) * 100) : 0}% Done
            </p>
            <p className="text-[10px] text-slate-500">{totalLeafs - completedLeafs} pending</p>
          </div>
          <div
            className={`w-3 h-3 rounded-full ${
              isParentCompleted ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'
            }`}
          />
        </div>
      </div>

      {/* Children Container */}
      {isExpanded && (
        <div className="p-4 md:p-5 space-y-3.5 bg-white/60">
          {node.children && node.children.length > 0 ? (
            node.children.map((child) => (
              <RenderNodeHierarchyCard
                key={child.id}
                node={child}
                level={level + 1}
                expandedNodes={expandedNodes}
                onToggleNode={onToggleNode}
                onViewSubmission={onViewSubmission}
                onViewDoc={onViewDoc}
                onDownloadDoc={onDownloadDoc}
                loadingDocId={loadingDocId}
              />
            ))
          ) : (
            <p className="text-xs text-slate-400 italic">No sub-items in this category.</p>
          )}
        </div>
      )}
    </div>
  )
}
