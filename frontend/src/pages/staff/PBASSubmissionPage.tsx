import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalPortal } from '../../components/ModalPortal'
import fetchWithAuth from '../../services/fetchAuth'
import {
  PBASNode,
  PBASSubmissionReport,
  PBASViewer,
  createSubmissionLink,
  createSubmissionUpload,
  getDepartmentTree,
  getSubmissionReport,
} from '../../services/pbas'

type Props = {
  viewer?: PBASViewer
}

const MASTER_DEPT_ID = 'master'
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif']

function fileExt(name: string): string {
  const n = String(name || '')
  const idx = n.lastIndexOf('.')
  if (idx < 0) return ''
  return n.slice(idx + 1).trim().toLowerCase()
}

function validateEvidenceFile(f: File | null): string | null {
  if (!f) return 'Please select a file to upload.'
  if (f.size > MAX_UPLOAD_BYTES) return 'File too large. Max 10 MB.'

  const ext = fileExt(f.name)
  const mime = String((f as any).type || '').toLowerCase()

  const extOk = ext ? ALLOWED_EXTS.includes(ext) : false
  const mimeOk = mime ? (mime === 'application/pdf' || mime.startsWith('image/')) : false
  if (!extOk && !mimeOk) return 'Invalid file type. Allowed: PDF/images.'
  return null
}

export default function PBASSubmissionPage({ viewer = 'faculty' }: Props) {
  const navigate = useNavigate()
  const isStudent = viewer === 'student'
  const pageTitle = isStudent ? 'My Progress' : 'PBAS Submission'

  // Tab State: Tree View vs Logs View
  const [activeTab, setActiveTab] = useState<'tree' | 'logs'>('tree')

  // Master Tree State from Database
  const [adminTree, setAdminTree] = useState<PBASNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  // My Logs State
  const [myLogs, setMyLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Leaf Node Submission Popup Modal State
  const [activeLeafNode, setActiveLeafNode] = useState<PBASNode | null>(null)
  const [isLeafModalOpen, setIsLeafModalOpen] = useState(false)

  // Submission Form Fields
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [collegeId, setCollegeId] = useState<string>('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')

  const [successOpen, setSuccessOpen] = useState(false)

  // Load master tree directly from Database on mount
  const loadMasterTree = async () => {
    setLoading(true)
    try {
      const res = await getDepartmentTree(MASTER_DEPT_ID)
      setAdminTree(res?.nodes || [])
    } catch {
      setAdminTree([])
    } finally {
      setLoading(false)
    }
  }

  // Load my submission logs
  const loadMyLogs = async () => {
    setLogsLoading(true)
    try {
      const res = await fetchWithAuth('/api/pbas/submissions/mine/')
      if (res.ok) {
        const data = await res.json()
        setMyLogs(data || [])
      }
    } catch {
      setMyLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    loadMasterTree()
    const handleUpdate = () => loadMasterTree()
    window.addEventListener('idcs:pbas-tree-updated', handleUpdate)
    return () => window.removeEventListener('idcs:pbas-tree-updated', handleUpdate)
  }, [])

  useEffect(() => {
    if (activeTab === 'logs') {
      loadMyLogs()
    }
  }, [activeTab])

  // Toggle Parent Node expand / collapse
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }))
  }

  // Click handler for Leaf Node -> Opens Popup Modal
  const handleLeafClick = (node: PBASNode) => {
    setActiveLeafNode(node)
    setLink('')
    setFile(null)
    setError('')
    setIsLeafModalOpen(true)
  }

  // Handle Evidence Submission from Leaf Node Popup Modal
  const handleSubmitEvidence = async () => {
    if (!activeLeafNode) return
    setError('')
    setSuccess('')

    const college = collegeId ? Number(collegeId) : null
    if (activeLeafNode.college_required && !collegeId) {
      setError('Please select a college.')
      return
    }

    setBusy(true)
    try {
      let created: any = null
      const inputMode = activeLeafNode.input_mode || 'upload'

      if (inputMode === 'link') {
        if (!link.trim()) {
          setError('Please enter a valid evidence link.')
          setBusy(false)
          return
        }
        created = await createSubmissionLink({ node: activeLeafNode.id, link: link.trim(), college })
      } else {
        const fileErr = validateEvidenceFile(file)
        if (fileErr) {
          setError(fileErr)
          setBusy(false)
          return
        }
        created = await createSubmissionUpload({ node: activeLeafNode.id, file: file!, college })
      }

      setIsLeafModalOpen(false)
      setSuccess(`Submission for "${activeLeafNode.label}" completed successfully!`)
      setSuccessOpen(true)
      loadMyLogs()
    } catch (e: any) {
      setError(e?.message || 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider">
            Evidence Portal
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{pageTitle}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Click on parent groups to expand subcategories, click leaf nodes to submit evidence, and track review status in Logs.
          </p>
        </div>
      </div>

      {error && !isLeafModalOpen && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-medium">
          {success}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('tree')}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            activeTab === 'tree'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          Activity Categories
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span>Submission Logs</span>
          {myLogs.length > 0 && (
            <span className="bg-amber-400 text-slate-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              {myLogs.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Main Interactive Tree Browser */}
      {activeTab === 'tree' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              PBAS Activity Categories & Subgroups
            </h2>
            <span className="text-xs text-slate-400">
              Expand nodes to view items • Click leaf nodes to submit
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm font-medium">
              Loading tree from Database…
            </div>
          ) : adminTree.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <p className="text-slate-600 font-medium">No PBAS tree configured.</p>
              <p className="text-xs text-slate-400 mt-1">Please log in to PBAS Admin to set up tree groups.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {adminTree.map((node) => (
                <SubmissionTreeNodeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  expandedNodes={expandedNodes}
                  onToggleExpand={toggleExpand}
                  onLeafClick={handleLeafClick}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Submission Logs View */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              My Submitted Evidence Logs ({myLogs.length})
            </h2>
            <button
              type="button"
              onClick={loadMyLogs}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              🔄 Refresh Logs
            </button>
          </div>

          {logsLoading ? (
            <div className="py-12 text-center text-slate-500 text-sm font-medium">Loading submission logs…</div>
          ) : myLogs.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <p className="text-slate-600 font-medium">No submissions recorded yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Go to the "Activity Categories" tab and click any leaf node to submit your first evidence.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myLogs.map((log) => (
                <div
                  key={log.id}
                  className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
                >
                  {/* Left: Item title & path */}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                        Leaf Node
                      </span>
                      <span className="font-bold text-slate-900 text-base">{log.leaf_title || 'PBAS Item'}</span>
                    </div>
                    {log.parent_path && (
                      <div className="text-xs text-slate-500 font-medium">
                        Path: <span className="text-slate-700 bg-slate-200/70 px-2 py-0.5 rounded text-[11px]">{log.parent_path}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400">
                      Submitted: {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                    </div>
                  </div>

                  {/* Center: Submission Mode & File / Link */}
                  <div className="flex items-center gap-3">
                    {log.submission_type === 'link' && log.link ? (
                      <a
                        href={log.link}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold flex items-center gap-1"
                      >
                        <span>Link ↗</span>
                      </a>
                    ) : log.file ? (
                      <a
                        href={log.file}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold flex items-center gap-1"
                      >
                        <span>Document 📄</span>
                      </a>
                    ) : null}

                    <div className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-xl text-center">
                      <div className="text-[9px] font-bold text-amber-600 uppercase">Credit</div>
                      <div className="text-sm font-black text-amber-800">{log.pbas_credit ?? 0}</div>
                    </div>
                  </div>

                  {/* Right: Status Badge */}
                  <div className="shrink-0">
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border ${
                        log.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : log.status === 'rejected'
                          ? 'bg-red-100 text-red-800 border-red-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                    >
                      {log.status || 'pending'}
                    </span>
                    {log.rejection_reason && (
                      <div className="text-[10px] text-red-600 font-medium mt-1 max-w-xs text-right">
                        Reason: {log.rejection_reason}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LEAF NODE SUBMISSION POPUP MODAL */}
      {isLeafModalOpen && activeLeafNode && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden transform transition-all">
              {/* Header with Title on Left and Animated Big Credit on Right */}
              <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between gap-4 border-b border-slate-800">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">
                    PBAS Leaf Node Item
                  </div>
                  <h3 className="text-lg font-bold text-white truncate mt-0.5" title={activeLeafNode.label}>
                    {activeLeafNode.label}
                  </h3>
                </div>

                {/* Animated Highlighted Big PBAS Credit Display */}
                <div className="relative group shrink-0">
                  <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-indigo-500 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-300 animate-pulse"></div>
                  <div className="relative px-4 py-2 bg-slate-900 rounded-xl border border-amber-400/40 flex flex-col items-center justify-center text-center shadow-lg">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                      PBAS Credit
                    </span>
                    <span className="text-2xl font-black tracking-tight text-white drop-shadow-md">
                      {activeLeafNode.pbas_credit != null ? activeLeafNode.pbas_credit : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5">
                {error && (
                  <div className="p-3 text-xs font-medium text-red-700 bg-red-50 rounded-lg border border-red-200">
                    {error}
                  </div>
                )}

                {/* Type Indicator */}
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-100/80 p-2.5 rounded-xl">
                  <span className="text-slate-400">Submission Mode:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white uppercase tracking-wider font-bold">
                    {(activeLeafNode.input_mode || 'upload').toUpperCase()}
                  </span>
                </div>

                {/* Dynamic Input: Link vs Upload */}
                {activeLeafNode.input_mode === 'link' ? (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Evidence Link URL</span>
                    <input
                      type="url"
                      placeholder="https://example.com/evidence-document"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      disabled={busy}
                      autoFocus
                    />
                    <span className="text-[11px] text-slate-400">Enter a public or institutional document link.</span>
                  </label>
                ) : (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Upload Evidence Document</span>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-xl hover:border-indigo-500 transition-colors bg-slate-50">
                      <div className="space-y-1 text-center">
                        <svg className="mx-auto h-10 w-10 text-slate-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="flex text-sm text-slate-600">
                          <span className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500">
                            <span>Select a file</span>
                            <input
                              type="file"
                              accept=".pdf,image/*"
                              onChange={(e) => setFile(e.target.files?.[0] || null)}
                              className="sr-only"
                              disabled={busy}
                            />
                          </span>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-slate-500">PDF, PNG, JPG up to 10MB</p>
                        {file && (
                          <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 py-1 px-3 rounded-full inline-block">
                            Selected: {file.name}
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsLeafModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitEvidence}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-60"
                  disabled={busy}
                >
                  {busy ? 'Submitting…' : 'Submit Evidence'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Success Modal */}
      {successOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border overflow-hidden p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                ✓
              </div>
              <h3 className="text-xl font-bold text-slate-900">Submission Received</h3>
              <p className="text-sm text-slate-600">Your PBAS evidence was submitted successfully.</p>
              <div className="flex gap-2">
                <button
                  className="w-full py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all text-xs"
                  onClick={() => setSuccessOpen(false)}
                >
                  Close
                </button>
                <button
                  className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all text-xs"
                  onClick={() => {
                    setSuccessOpen(false)
                    setActiveTab('logs')
                  }}
                >
                  View Submission Logs
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}

// Tree view renderer sub-component for Submission Page
interface SubmissionTreeNodeItemProps {
  node: PBASNode
  depth: number
  expandedNodes: Record<string, boolean>
  onToggleExpand: (nodeId: string) => void
  onLeafClick: (node: PBASNode) => void
}

function SubmissionTreeNodeItem({
  node,
  depth,
  expandedNodes,
  onToggleExpand,
  onLeafClick,
}: SubmissionTreeNodeItemProps) {
  const isLeafNode = !node.children || node.children.length === 0
  const isExpanded = Boolean(expandedNodes[node.id])

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        depth === 0
          ? 'bg-slate-50/80 border-slate-200/90'
          : 'bg-white border-slate-200/80'
      }`}
      style={{ marginLeft: `${depth > 0 ? Math.min(depth * 18, 72) : 0}px` }}
    >
      <div
        onClick={() => (isLeafNode ? onLeafClick(node) : onToggleExpand(node.id))}
        className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-100/60 transition-colors rounded-xl"
      >
        {/* Left Section: Chevron + Title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {!isLeafNode ? (
            <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 transition-transform">
              {isExpanded ? '▼' : '▶'}
            </span>
          ) : (
            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
              📄
            </span>
          )}

          <span
            className={`font-semibold text-slate-800 truncate ${
              depth === 0 ? 'text-base' : 'text-sm'
            }`}
          >
            {node.label}
          </span>
        </div>

        {/* Right Section: Node Meta */}
        <div className="flex items-center gap-3 shrink-0">
          {!isLeafNode ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              {node.children?.length} Subgroups
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Credit: {node.pbas_credit != null ? node.pbas_credit : 'N/A'}
              </span>
              <span className="text-xs font-bold text-white px-2.5 py-1 rounded-full bg-indigo-600 shadow-sm">
                Click to Submit
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Children Subgroups when expanded */}
      {!isLeafNode && isExpanded && node.children && node.children.length > 0 && (
        <div className="p-3 pt-0 space-y-2 border-t border-slate-100">
          {node.children.map((child) => (
            <SubmissionTreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
              onLeafClick={onLeafClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
