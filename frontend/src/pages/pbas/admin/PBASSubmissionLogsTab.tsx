import React, { useEffect, useMemo, useState } from 'react'
import {
  Search,
  RefreshCw,
  Download,
  Filter,
  FileText,
  Link as LinkIcon,
  UploadCloud,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Award,
  Users,
  GraduationCap,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  X,
  ExternalLink,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { ModalPortal } from '../../../components/ModalPortal'
import fetchWithAuth from '../../../services/fetchAuth'
import {
  PBASSubmissionLogRow,
  PBASSubmissionLogsParams,
  PBASSubmissionLogsResponse,
  fetchPBASSubmissionLogs,
} from '../../../services/pbas'
import { fetchDepartments } from '../../../services/academics'
import type { DepartmentRow } from '../../../services/academics'

const CATEGORY_OPTIONS = [
  'Academics',
  'Student Development',
  'Research and Development',
  'Institutional Contribution',
]

function badgeStatusClass(status: string): { bg: string; text: string; border: string; dot: string } {
  const s = String(status || '').toLowerCase()
  if (s === 'approved') {
    return {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500',
    }
  }
  if (s === 'rejected') {
    return {
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200',
      dot: 'bg-rose-500',
    }
  }
  return {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500 animate-pulse',
  }
}

function categoryBadgeClass(category: string): string {
  const c = String(category || '').toLowerCase()
  if (c.includes('research')) return 'bg-purple-50 text-purple-700 border-purple-200'
  if (c.includes('student')) return 'bg-sky-50 text-sky-700 border-sky-200'
  if (c.includes('institutional')) return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  if (c.includes('academic')) return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
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

function getInitials(name?: string | null): string {
  const s = String(name || '').trim()
  if (!s) return '—'
  const parts = s.split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''
  return (a + b).toUpperCase() || s.substring(0, 2).toUpperCase()
}

export default function PBASSubmissionLogsTab(): JSX.Element {
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [draft, setDraft] = useState<PBASSubmissionLogsParams>({
    role: '',
    department_id: '',
    semester: '',
    status: '',
    category: '',
    submission_type: '',
    from_date: '',
    to_date: '',
    q: '',
    limit: 200,
  })

  const [applied, setApplied] = useState<PBASSubmissionLogsParams>(draft)
  const [data, setData] = useState<PBASSubmissionLogsResponse>({
    stats: { total: 0, pending: 0, approved: 0, rejected: 0, total_credits: 0 },
    submissions: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Detail Modal State
  const [selectedRow, setSelectedRow] = useState<PBASSubmissionLogRow | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  // Document Viewing / Downloading State
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null)
  const [modalPreviewUrl, setModalPreviewUrl] = useState<string | null>(null)
  const [modalPreviewLoading, setModalPreviewLoading] = useState(false)

  // Load inline image preview when detail modal opens
  useEffect(() => {
    if (!selectedRow || (!selectedRow.file_url && !selectedRow.file_name)) {
      setModalPreviewUrl(null)
      return
    }
    let isMounted = true
    const fileName = (selectedRow.file_name || selectedRow.file_url || '').toLowerCase()
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
      fetchWithAuth(`/api/pbas/submissions/${encodeURIComponent(selectedRow.id)}/document/`)
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
  }, [selectedRow])

  const handleViewDocument = async (sub: PBASSubmissionLogRow) => {
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

  const handleDownloadDocument = async (sub: PBASSubmissionLogRow) => {
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

  // Fetch Submissions on filter apply
  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    fetchPBASSubmissionLogs(applied)
      .then((res) => {
        if (!mounted) return
        setData(res)
      })
      .catch((e: any) => {
        if (!mounted) return
        setError(e?.message || 'Failed to load PBAS submission logs.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [applied])

  const handleApply = () => {
    setApplied({ ...draft })
  }

  const handleReset = () => {
    const fresh: PBASSubmissionLogsParams = {
      role: '',
      department_id: '',
      semester: '',
      status: '',
      category: '',
      submission_type: '',
      from_date: '',
      to_date: '',
      q: '',
      limit: 200,
    }
    setDraft(fresh)
    setApplied(fresh)
  }

  const handleRefresh = () => {
    setApplied((prev) => ({ ...prev }))
  }

  const handleOpenDetail = (row: PBASSubmissionLogRow) => {
    setSelectedRow(row)
    setDetailModalOpen(true)
  }

  const departmentOptions = useMemo(() => {
    return [...departments].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
  }, [departments])

  // Export filtered rows to Excel
  const handleExportExcel = () => {
    if (!data.submissions.length) return
    const exportRows = data.submissions.map((s, idx) => ({
      'S.No': idx + 1,
      'Applicant Name': s.user.name,
      'User ID / Reg No': s.user.reg_or_staff_id,
      'Applicant Type': s.user.applicant_type?.toUpperCase() || 'STAFF',
      Department: s.department.code || s.department.name || '—',
      Semester: s.user.semester ? `Semester ${s.user.semester}` : '—',
      'Section / Batch': s.user.section_name || s.user.batch || '—',
      Category: s.category,
      'Node / Activity Title': s.leaf_title,
      'Parent Hierarchy Path': s.parent_path,
      'Submission Type': s.submission_type?.toUpperCase(),
      'PBAS Credits': s.pbas_credit,
      Status: s.status?.toUpperCase(),
      'Submitted At': fmtDateTime(s.created_at),
      'Reviewed By': s.approved_by_name || '—',
      'Reviewed At': fmtDateTime(s.reviewed_at),
      'Rejection Reason': s.rejection_reason || '—',
      'File Name': s.file_name || '—',
      'Link URL': s.link || '—',
    }))

    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PBAS_Submission_Logs')
    XLSX.writeFile(wb, `PBAS_Submission_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* Summary KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Submissions</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{data.stats.total}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Pending Review</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{data.stats.pending}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Approved</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{data.stats.approved}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Rejected</p>
            <p className="text-2xl font-bold text-rose-700 mt-1">{data.stats.rejected}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Total Credits</p>
            <p className="text-2xl font-bold text-indigo-700 mt-1">{data.stats.total_credits} <span className="text-xs font-normal text-slate-500">pts</span></p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Section (Gatepass-style with rich parameters) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Submission Filters</h3>
            <span className="text-xs text-slate-400">({data.submissions.length} results matching)</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={loading || data.submissions.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all duration-200 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all duration-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-200 active:scale-95"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Apply Filters</span>
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 bg-white">
          {/* Role Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Users className="w-3 h-3 text-slate-400" /> Role
            </label>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={draft.role || ''}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
            >
              <option value="">All Roles (Staff & Student)</option>
              <option value="STAFF">Staff / Faculty</option>
              <option value="STUDENT">Student</option>
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-400" /> Department
            </label>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={draft.department_id || ''}
              onChange={(e) => setDraft((d) => ({ ...d, department_id: e.target.value }))}
            >
              <option value="">All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.short_name ? `${dept.short_name} - ${dept.name}` : dept.name}
                </option>
              ))}
            </select>
          </div>

          {/* Semester Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <GraduationCap className="w-3 h-3 text-slate-400" /> Semester (Student)
            </label>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={draft.semester || ''}
              onChange={(e) => setDraft((d) => ({ ...d, semester: e.target.value }))}
            >
              <option value="">All Semesters</option>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
              <option value="3">Semester 3</option>
              <option value="4">Semester 4</option>
              <option value="5">Semester 5</option>
              <option value="6">Semester 6</option>
              <option value="7">Semester 7</option>
              <option value="8">Semester 8</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" /> Status
            </label>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={draft.status || ''}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" /> Category
            </label>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={draft.category || ''}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            >
              <option value="">All Categories</option>
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Submission Mode Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-400" /> Mode
            </label>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={draft.submission_type || ''}
              onChange={(e) => setDraft((d) => ({ ...d, submission_type: e.target.value }))}
            >
              <option value="">All Modes</option>
              <option value="form">Form Questionnaire</option>
              <option value="upload">Document Upload</option>
              <option value="link">URL / Link</option>
            </select>
          </div>

          {/* Date Range: From Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" /> From Date
            </label>
            <input
              type="date"
              className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={draft.from_date || ''}
              onChange={(e) => setDraft((d) => ({ ...d, from_date: e.target.value }))}
            />
          </div>

          {/* Date Range: To Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" /> To Date
            </label>
            <input
              type="date"
              className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={draft.to_date || ''}
              onChange={(e) => setDraft((d) => ({ ...d, to_date: e.target.value }))}
            />
          </div>

          {/* Quick Search */}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Search className="w-3 h-3 text-slate-400" /> Keyword Search
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by Name, Reg No, Staff ID, Activity Title, Approver..."
                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={draft.q || ''}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApply()
                }}
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          {/* Page Limit */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Limit</label>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={String(draft.limit ?? 200)}
              onChange={(e) => setDraft((d) => ({ ...d, limit: e.target.value === 'all' ? 'all' : Number(e.target.value) }))}
            >
              <option value="50">50 rows</option>
              <option value="100">100 rows</option>
              <option value="200">200 rows</option>
              <option value="500">500 rows</option>
              <option value="all">All rows</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3.5 w-12 text-center">#</th>
                <th className="py-3 px-4">Applicant / User</th>
                <th className="py-3 px-3.5">Department</th>
                <th className="py-3 px-4">Category & Path</th>
                <th className="py-3 px-4">Activity / Node</th>
                <th className="py-3 px-3.5 text-center">Mode</th>
                <th className="py-3 px-3 text-center">Credits</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5">Submitted At</th>
                <th className="py-3 px-3.5">Reviewed By</th>
                <th className="py-3 px-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                      <span>Loading submission logs...</span>
                    </div>
                  </td>
                </tr>
              ) : data.submissions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Layers className="w-8 h-8 text-slate-300" />
                      <p className="text-slate-600 font-semibold text-sm">No PBAS Submissions Found</p>
                      <p className="text-xs text-slate-400">Try adjusting your filters or date range.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.submissions.map((sub, idx) => {
                  const statusStyle = badgeStatusClass(sub.status)
                  const isStudent = sub.user.applicant_type === 'student'
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Sl.No */}
                      <td className="py-3 px-3.5 text-center font-mono text-slate-400 font-medium">
                        {idx + 1}
                      </td>

                      {/* Applicant / User info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {sub.user.profile_image ? (
                            <img
                              src={sub.user.profile_image}
                              alt={sub.user.name}
                              className="w-8 h-8 rounded-full object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-200/60">
                              {getInitials(sub.user.name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate max-w-[170px]" title={sub.user.name}>
                              {sub.user.name}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="font-mono text-[10px] text-slate-500 font-medium">
                                {sub.user.reg_or_staff_id}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  isStudent
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-indigo-100 text-indigo-800'
                                }`}
                              >
                                {isStudent ? 'STUDENT' : 'STAFF'}
                              </span>
                              {isStudent && sub.user.semester && (
                                <span className="text-[9px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                  Sem {sub.user.semester}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-3.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[100px]"
                          title={sub.department.name || sub.department.code || '—'}
                        >
                          {sub.department.code || sub.department.name || '—'}
                        </span>
                      </td>

                      {/* Category & Hierarchy */}
                      <td className="py-3 px-4 max-w-[200px]">
                        <span
                          className={`inline-block border px-2 py-0.5 rounded-md text-[10px] font-bold ${categoryBadgeClass(
                            sub.category
                          )}`}
                        >
                          {sub.category}
                        </span>
                        {sub.parent_path && (
                          <p className="text-[10px] text-slate-400 truncate mt-0.5" title={sub.parent_path}>
                            {sub.parent_path}
                          </p>
                        )}
                      </td>

                      {/* Node / Activity Title */}
                      <td className="py-3 px-4 max-w-[220px]">
                        <p className="font-medium text-slate-800 truncate" title={sub.leaf_title}>
                          {sub.leaf_title}
                        </p>
                      </td>

                      {/* Mode / Attachment */}
                      <td className="py-3 px-3.5 text-center">
                        {sub.submission_type === 'upload' && (sub.file_url || sub.file_name) ? (
                          <button
                            type="button"
                            onClick={() => handleViewDocument(sub)}
                            disabled={loadingDocId === sub.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 text-[10px] font-semibold transition-colors disabled:opacity-50"
                            title={sub.file_name || 'View Attached Document'}
                          >
                            {loadingDocId === sub.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                            ) : (
                              <UploadCloud className="w-3 h-3" />
                            )}
                            <span>File</span>
                          </button>
                        ) : sub.submission_type === 'link' && sub.link ? (
                          <a
                            href={sub.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 text-[10px] font-semibold transition-colors"
                            title={sub.link}
                          >
                            <LinkIcon className="w-3 h-3" />
                            <span>Link</span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold">
                            <FileText className="w-3 h-3" />
                            <span>Form</span>
                          </span>
                        )}
                      </td>

                      {/* Credits */}
                      <td className="py-3 px-3 text-center">
                        <span className="font-bold font-mono text-xs text-indigo-600 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-100">
                          +{sub.pbas_credit}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                          <span className="capitalize">{sub.status}</span>
                        </span>
                      </td>

                      {/* Submitted At */}
                      <td className="py-3 px-3.5 text-slate-500 whitespace-nowrap text-[11px]">
                        {fmtDateTime(sub.created_at)}
                      </td>

                      {/* Reviewed By */}
                      <td className="py-3 px-3.5 text-slate-600 text-[11px] max-w-[130px] truncate" title={sub.approved_by_name || '—'}>
                        {sub.approved_by_name ? (
                          <div>
                            <p className="font-medium text-slate-800 truncate">{sub.approved_by_name}</p>
                            <p className="text-[9px] text-slate-400">{fmtDateTime(sub.reviewed_at)}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(sub)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 text-[11px] font-semibold transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
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
            Showing <span className="font-semibold text-slate-700">{data.submissions.length}</span> of{' '}
            <span className="font-semibold text-slate-700">{data.stats.total}</span> entries
          </div>
          <div>
            Credits in current list: <span className="font-bold text-indigo-600">{data.stats.total_credits} pts</span>
          </div>
        </div>
      </div>

      {/* Submission Detail Modal */}
      {detailModalOpen && selectedRow && (
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
                        selectedRow.status === 'approved'
                          ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30'
                          : selectedRow.status === 'rejected'
                          ? 'bg-rose-500/30 text-rose-200 border border-rose-400/30'
                          : 'bg-amber-500/30 text-amber-200 border border-amber-400/30'
                      }`}
                    >
                      {selectedRow.status}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mt-1.5">{selectedRow.leaf_title}</h3>
                  <p className="text-xs text-slate-300 mt-0.5">{selectedRow.parent_path || selectedRow.category}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailModalOpen(false)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                {/* Applicant Profile Card */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {selectedRow.user.profile_image ? (
                      <img
                        src={selectedRow.user.profile_image}
                        alt={selectedRow.user.name}
                        className="w-12 h-12 rounded-2xl object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-base">
                        {getInitials(selectedRow.user.name)}
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{selectedRow.user.name}</h4>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-700">{selectedRow.user.reg_or_staff_id}</span>
                        <span>•</span>
                        <span>{selectedRow.department.name || selectedRow.department.code}</span>
                        {selectedRow.user.semester && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-indigo-600">Sem {selectedRow.user.semester}</span>
                          </>
                        )}
                        {selectedRow.user.section_name && (
                          <>
                            <span>•</span>
                            <span>Sec {selectedRow.user.section_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Awarded Credits</span>
                    <p className="text-xl font-extrabold text-indigo-600">+{selectedRow.pbas_credit} <span className="text-xs font-medium">pts</span></p>
                  </div>
                </div>

                {/* Form Data Questions & Answers */}
                {selectedRow.submission_type === 'form' && selectedRow.form_data && Object.keys(selectedRow.form_data).length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span>Questionnaire Responses</span>
                    </h4>
                    <div className="space-y-2.5 bg-slate-50/60 rounded-2xl p-4 border border-slate-200/80">
                      {Object.entries(selectedRow.form_data).map(([fieldKey, val]: [string, any]) => {
                        const schemaField = (selectedRow.form_schema || []).find(
                          (f) => f.id === fieldKey || f.label === fieldKey
                        )
                        const fieldLabel = schemaField?.label || fieldKey
                        return (
                          <div key={fieldKey} className="bg-white p-3 rounded-xl border border-slate-200/70">
                            <p className="text-xs font-bold text-slate-700 mb-1">{fieldLabel}</p>
                            <p className="text-xs text-slate-900 font-medium whitespace-pre-wrap">
                              {Array.isArray(val) ? val.join(', ') : String(val ?? '—')}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* File Attachment Card */}
                {Boolean(selectedRow.file_url || selectedRow.file_name) && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <UploadCloud className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{selectedRow.file_name || 'Uploaded Document'}</p>
                          <p className="text-[11px] text-slate-500">Document attached with submission</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleViewDocument(selectedRow)}
                          disabled={loadingDocId === selectedRow.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                        >
                          {loadingDocId === selectedRow.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>View Full</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(selectedRow)}
                          disabled={loadingDocId === selectedRow.id}
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
                          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Document / Image Preview</p>
                          <span className="text-[10px] text-slate-400 font-mono">{selectedRow.file_name}</span>
                        </div>
                        <div className="relative max-h-96 overflow-auto rounded-xl border border-slate-200/80 bg-white flex items-center justify-center p-2.5">
                          <img
                            src={modalPreviewUrl}
                            alt={selectedRow.file_name || 'Evidence Preview'}
                            className="max-h-80 w-auto object-contain rounded-lg shadow-xs"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* External Link Card */}
                {selectedRow.link && (
                  <div className="p-4 rounded-2xl bg-sky-50/50 border border-sky-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center">
                        <LinkIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">External URL Link</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-xs">{selectedRow.link}</p>
                      </div>
                    </div>
                    <a
                      href={selectedRow.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Link</span>
                    </a>
                  </div>
                )}

                {/* Rejection Note */}
                {selectedRow.status === 'rejected' && selectedRow.rejection_reason && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                    <p className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-1">Rejection Reason</p>
                    <p className="text-xs text-rose-900">{selectedRow.rejection_reason}</p>
                  </div>
                )}

                {/* Audit & Timeline Info */}
                <div className="border-t border-slate-100 pt-4 space-y-2 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Submitted On:</span>
                    <span className="font-medium text-slate-700">{fmtDateTime(selectedRow.created_at)}</span>
                  </div>
                  {selectedRow.reviewed_at && (
                    <div className="flex justify-between">
                      <span>Reviewed On:</span>
                      <span className="font-medium text-slate-700">{fmtDateTime(selectedRow.reviewed_at)}</span>
                    </div>
                  )}
                  {selectedRow.approved_by_name && (
                    <div className="flex justify-between">
                      <span>Reviewed By:</span>
                      <span className="font-medium text-slate-700">{selectedRow.approved_by_name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailModalOpen(false)}
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
