import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalPortal } from '../../components/ModalPortal'
import fetchWithAuth from '../../services/fetchAuth'
import {
  PBASFormField,
  PBASNode,
  PBASViewer,
  createSubmissionForm,
  createSubmissionLink,
  createSubmissionUpload,
  getDepartmentTree,
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

  // Dynamic Form Values & File State
  const [formResponses, setFormResponses] = useState<Record<string, any>>({})
  const [formFiles, setFormFiles] = useState<Record<string, File>>({})
  const [fallbackFile, setFallbackFile] = useState<File | null>(null)
  const [fallbackLink, setFallbackLink] = useState('')
  const [collegeId, setCollegeId] = useState<string>('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')

  const [successOpen, setSuccessOpen] = useState(false)

  // Load master tree directly from Database on mount with viewer query
  const loadMasterTree = async () => {
    setLoading(true)
    try {
      const res = await getDepartmentTree(MASTER_DEPT_ID, viewer)
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
  }, [viewer])

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

  // Click handler for Leaf Node -> Opens Form Popup Modal
  const handleLeafClick = (node: PBASNode) => {
    setActiveLeafNode(node)
    setFormResponses({})
    setFormFiles({})
    setFallbackFile(null)
    setFallbackLink('')
    setError('')
    setIsLeafModalOpen(true)
  }

  const handleCheckboxToggle = (fieldId: string, opt: string) => {
    const current = (formResponses[fieldId] || []) as string[]
    const next = current.includes(opt)
      ? current.filter((x) => x !== opt)
      : [...current, opt]
    setFormResponses((prev) => ({ ...prev, [fieldId]: next }))
  }

  // Handle Form Submission from Leaf Node Popup Modal
  const handleSubmitEvidence = async () => {
    if (!activeLeafNode) return
    setError('')
    setSuccess('')

    const college = collegeId ? Number(collegeId) : null
    if (activeLeafNode.college_required && !collegeId) {
      setError('Please select a college.')
      return
    }

    const schema = activeLeafNode.form_schema || []

    // If custom dynamic form schema is defined on leaf node:
    if (schema.length > 0) {
      // Validate required fields
      for (const field of schema) {
        const val = formResponses[field.id]
        if (field.required) {
          if (field.field_type === 'file_upload') {
            if (!formFiles[field.id]) {
              setError(`Please upload a file for "${field.label}".`)
              return
            }
          } else if (field.field_type === 'checkboxes') {
            if (!Array.isArray(val) || val.length === 0) {
              setError(`Please select at least one option for "${field.label}".`)
              return
            }
          } else if (!val || String(val).trim() === '') {
            setError(`Please fill out the required field: "${field.label}".`)
            return
          }
        }
      }

      setBusy(true)
      try {
        // Collect primary file if uploaded in form
        const firstFileKey = Object.keys(formFiles)[0]
        const mainFile = firstFileKey ? formFiles[firstFileKey] : null

        await createSubmissionForm({
          node: activeLeafNode.id,
          formData: formResponses,
          file: mainFile,
          college,
        })

        setIsLeafModalOpen(false)
        setSuccess(`Submission for "${activeLeafNode.label}" completed successfully!`)
        setSuccessOpen(true)
        loadMyLogs()
      } catch (e: any) {
        setError(e?.message || 'Submission failed')
      } finally {
        setBusy(false)
      }
    } else {
      // Fallback simple submission if no fields were configured
      setBusy(true)
      try {
        if (fallbackFile) {
          const fileErr = validateEvidenceFile(fallbackFile)
          if (fileErr) {
            setError(fileErr)
            setBusy(false)
            return
          }
          await createSubmissionUpload({ node: activeLeafNode.id, file: fallbackFile, college })
        } else if (fallbackLink.trim()) {
          await createSubmissionLink({ node: activeLeafNode.id, link: fallbackLink.trim(), college })
        } else {
          await createSubmissionForm({
            node: activeLeafNode.id,
            formData: { submitted: true },
            college,
          })
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
            Click on parent groups to expand subcategories, click any leaf node to complete the form, and track review status in Logs.
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
              Expand nodes to view items • Click leaf nodes to fill form & submit
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm font-medium">
              Loading tree from Database…
            </div>
          ) : adminTree.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <p className="text-slate-600 font-medium">No PBAS activities configured for this category.</p>
              <p className="text-xs text-slate-400 mt-1">Please contact IQAC or PBAS Administrator.</p>
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

                    {/* Show form answers summary if available */}
                    {log.form_data && typeof log.form_data === 'object' && Object.keys(log.form_data).length > 0 && (
                      <div className="mt-2 text-xs bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                        <span className="font-bold text-slate-600 text-[11px] uppercase tracking-wide">Form Responses:</span>
                        {Object.entries(log.form_data).map(([k, v]) => (
                          <div key={k} className="text-slate-700">
                            <span className="font-medium text-slate-500">{k}:</span>{' '}
                            <span className="font-semibold">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Center: Evidence File / Link / Credit */}
                  <div className="flex items-center gap-3">
                    {log.link ? (
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

                    <div className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-xl text-center shrink-0">
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

      {/* LEAF NODE FORM SUBMISSION POPUP MODAL */}
      {isLeafModalOpen && activeLeafNode && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden flex flex-col max-h-[88vh]">
              {/* Header: Complete the <name of the leaf> and Animated Big Credit on Right */}
              <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between gap-4 border-b border-slate-800 shrink-0">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">
                    PBAS Submission Form
                  </div>
                  <h3 className="text-lg font-bold text-white truncate mt-0.5" title={activeLeafNode.label}>
                    Complete the {activeLeafNode.label}
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

              {/* Modal Body: Google Form Questions */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-slate-50/50">
                {error && (
                  <div className="p-3 text-xs font-medium text-red-700 bg-red-50 rounded-lg border border-red-200">
                    {error}
                  </div>
                )}

                {/* If custom form_schema questions are configured */}
                {activeLeafNode.form_schema && activeLeafNode.form_schema.length > 0 ? (
                  <div className="space-y-4">
                    {activeLeafNode.form_schema.map((field, idx) => (
                      <div key={field.id} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                        <label className="block text-xs font-bold text-slate-800">
                          <span>{idx + 1}. {field.label}</span>
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>

                        {/* Short Text */}
                        {field.field_type === 'short_text' && (
                          <input
                            type="text"
                            value={formResponses[field.id] || ''}
                            onChange={(e) => setFormResponses({ ...formResponses, [field.id]: e.target.value })}
                            placeholder="Your answer"
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50/50"
                            disabled={busy}
                          />
                        )}

                        {/* Long Text */}
                        {field.field_type === 'long_text' && (
                          <textarea
                            rows={3}
                            value={formResponses[field.id] || ''}
                            onChange={(e) => setFormResponses({ ...formResponses, [field.id]: e.target.value })}
                            placeholder="Your detailed response"
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50/50"
                            disabled={busy}
                          />
                        )}

                        {/* Dropdown */}
                        {field.field_type === 'dropdown' && (
                          <select
                            value={formResponses[field.id] || ''}
                            onChange={(e) => setFormResponses({ ...formResponses, [field.id]: e.target.value })}
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
                            disabled={busy}
                          >
                            <option value="">-- Choose an option --</option>
                            {(field.options || []).map((opt, oIdx) => (
                              <option key={oIdx} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Checkboxes */}
                        {field.field_type === 'checkboxes' && (
                          <div className="space-y-1.5 pt-1">
                            {(field.options || []).map((opt, oIdx) => {
                              const checked = ((formResponses[field.id] || []) as string[]).includes(opt)
                              return (
                                <label key={oIdx} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleCheckboxToggle(field.id, opt)}
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                    disabled={busy}
                                  />
                                  <span>{opt}</span>
                                </label>
                              )
                            })}
                          </div>
                        )}

                        {/* File Upload */}
                        {field.field_type === 'file_upload' && (
                          <div className="mt-1 flex flex-col items-center justify-center p-4 border-2 border-slate-300 border-dashed rounded-xl bg-slate-50 hover:bg-indigo-50/20 transition-colors">
                            <label className="cursor-pointer text-center">
                              <span className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-white px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm inline-block">
                                📎 Browse & Upload File
                              </span>
                              <input
                                type="file"
                                accept=".pdf,image/*"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) setFormFiles({ ...formFiles, [field.id]: f })
                                }}
                                className="sr-only"
                                disabled={busy}
                              />
                            </label>
                            <p className="text-[11px] text-slate-400 mt-1.5">PDF or Images up to 10MB</p>
                            {formFiles[field.id] && (
                              <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 py-1 px-3 rounded-full">
                                Selected: {formFiles[field.id].name}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Fallback default questionnaire when no custom form fields configured */
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                      <label className="block text-xs font-bold text-slate-800">
                        Upload Evidence Document
                      </label>
                      <div className="flex flex-col items-center justify-center p-4 border-2 border-slate-300 border-dashed rounded-xl bg-slate-50">
                        <label className="cursor-pointer text-center">
                          <span className="text-xs font-bold text-indigo-600 bg-white px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm inline-block">
                            Select File
                          </span>
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            onChange={(e) => setFallbackFile(e.target.files?.[0] || null)}
                            className="sr-only"
                            disabled={busy}
                          />
                        </label>
                        <p className="text-[11px] text-slate-400 mt-1.5">PDF or Images up to 10MB</p>
                        {fallbackFile && (
                          <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 py-1 px-3 rounded-full">
                            Selected: {fallbackFile.name}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                      <label className="block text-xs font-bold text-slate-800">
                        Evidence URL / Link (Optional)
                      </label>
                      <input
                        type="url"
                        placeholder="https://example.com/evidence"
                        value={fallbackLink}
                        onChange={(e) => setFallbackLink(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        disabled={busy}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
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
                  {busy ? 'Submitting…' : 'Submit Form'}
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
              <p className="text-sm text-slate-600">Your PBAS form and evidence were submitted successfully.</p>
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
              📋
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
                Fill Form
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
