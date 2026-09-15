import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalPortal } from '../../components/ModalPortal'
import fetchWithAuth from '../../services/fetchAuth'
import { getCachedMe } from '../../services/auth'
import {
  PBASFormField,
  PBASMenteeItem,
  PBASNode,
  PBASViewer,
  createSubmissionForm,
  createSubmissionLink,
  createSubmissionUpload,
  fetchMenteesList,
  getDepartmentTree,
} from '../../services/pbas'

type Props = {
  viewer?: PBASViewer
}

const MASTER_DEPT_ID = 'master'
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif']
const PBAS_LOG_CATEGORIES = [
  'Academics',
  'Student Development',
  'Research and Development',
  'Institutional Contribution',
] as const

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

function getSubmissionCategory(log: any): string {
  const path = String(log?.category || log?.parent_path || '').toLowerCase()
  if (path.includes('research') && path.includes('development')) return 'Research and Development'
  if (path.includes('institutional') && path.includes('contribution')) return 'Institutional Contribution'
  if (path.includes('student') && path.includes('development')) return 'Student Development'
  if (path.includes('academic')) return 'Academics'
  return 'Other'
}

function formatSubmissionDate(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : 'N/A'
}

export default function PBASSubmissionPage({ viewer: viewerProp }: Props) {
  const navigate = useNavigate()
  const cachedMe = getCachedMe()
  const derivedViewer: PBASViewer =
    viewerProp ||
    (cachedMe?.student_profile ||
    (Array.isArray(cachedMe?.roles) && cachedMe.roles.map((r: any) => String(r?.name || r).toUpperCase()).includes('STUDENT')) ||
    String(cachedMe?.role || '').toUpperCase() === 'STUDENT'
      ? 'student'
      : 'faculty')

  const viewer = derivedViewer
  const isStudent = viewer === 'student'
  const pageTitle = isStudent ? 'My Progress' : 'PBAS Submission'

  // Tab State: Tree View vs Logs View vs Mentees View
  const [activeTab, setActiveTab] = useState<'tree' | 'logs' | 'mentees'>('tree')

  // Master Tree State from Database
  const [adminTree, setAdminTree] = useState<PBASNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  // My Logs State
  const [myLogs, setMyLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Mentees State (For Staff)
  const [mentees, setMentees] = useState<PBASMenteeItem[]>([])
  const [menteesLoading, setMenteesLoading] = useState(false)
  const [selectedMentee, setSelectedMentee] = useState<PBASMenteeItem | null>(null)

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

  // Load staff mentees
  const loadMentees = async () => {
    setMenteesLoading(true)
    try {
      const data = await fetchMenteesList()
      setMentees(data || [])
    } catch {
      setMentees([])
    } finally {
      setMenteesLoading(false)
    }
  }

  useEffect(() => {
    loadMasterTree()
    if (!isStudent) {
      loadMentees()
    }
    const handleUpdate = () => loadMasterTree()
    window.addEventListener('idcs:pbas-tree-updated', handleUpdate)
    return () => window.removeEventListener('idcs:pbas-tree-updated', handleUpdate)
  }, [viewer])

  useEffect(() => {
    if (activeTab === 'logs') {
      loadMyLogs()
    } else if (activeTab === 'mentees') {
      loadMentees()
    }
  }, [activeTab])

  // Toggle Parent Node expand / collapse
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }))
  }

  // Student / Drilldown Navigation Stack State
  // modalStack: array of PBASNode representing drill-down hierarchy
  const [modalStack, setModalStack] = useState<PBASNode[]>([])
  const [slideDirection, setSlideDirection] = useState<'forward' | 'backward' | ''>('')
  const [submitStep, setSubmitStep] = useState<'form' | 'loading' | 'success'>('form')
  const [viewLogData, setViewLogData] = useState<any | null>(null)
  const [documentLogData, setDocumentLogData] = useState<any | null>(null)
  const [documentUrl, setDocumentUrl] = useState<string | null>(null)
  const [documentContentType, setDocumentContentType] = useState('')
  const [documentLoading, setDocumentLoading] = useState(false)

  const handleViewLogDocument = async (log: any) => {
    setDocumentLoading(true)
    setDocumentLogData(log)
    setDocumentUrl(null)
    try {
      const response = await fetchWithAuth(`/api/pbas/submissions/${encodeURIComponent(log.id)}/document/`)
      if (!response.ok) throw new Error(`Unable to open document (HTTP ${response.status}).`)
      const blob = await response.blob()
      setDocumentContentType(blob.type || '')
      setDocumentUrl(URL.createObjectURL(blob))
    } catch (e: any) {
      setDocumentLogData(null)
      setError(e?.message || 'Unable to open document.')
    } finally {
      setDocumentLoading(false)
    }
  }

  const closeDocumentViewer = () => {
    if (documentUrl) URL.revokeObjectURL(documentUrl)
    setDocumentUrl(null)
    setDocumentLogData(null)
    setDocumentContentType('')
  }

  const currentModalNode = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null

  const handleOpenRootModal = (rootNode: PBASNode) => {
    // If root node is leaf, open leaf directly; otherwise start drilldown stack
    if (!rootNode.children || rootNode.children.length === 0) {
      handleLeafClick(rootNode)
    } else {
      setSlideDirection('forward')
      setModalStack([rootNode])
    }
  }

  const handleSubParentClick = (subParentNode: PBASNode) => {
    setSlideDirection('forward')
    setModalStack((prev) => [...prev, subParentNode])
  }

  const handleModalBack = () => {
    setSlideDirection('backward')
    setModalStack((prev) => prev.slice(0, prev.length - 1))
  }

  const handleCloseDrilldown = () => {
    setModalStack([])
  }

  // Click handler for Leaf Node -> Opens Form Popup Modal
  const handleLeafClick = (node: PBASNode) => {
    setActiveLeafNode(node)
    setFormResponses({})
    setFormFiles({})
    setFallbackFile(null)
    setFallbackLink('')
    setError('')
    setSubmitStep('form')
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
      setSubmitStep('loading')
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

        setSuccess(`Submission for "${activeLeafNode.label}" completed successfully!`)
        setSubmitStep('success')
        loadMyLogs()
      } catch (e: any) {
        setError(e?.message || 'Submission failed')
        setSubmitStep('form')
      } finally {
        setBusy(false)
      }
    } else {
      // Fallback simple submission if no fields were configured
      setBusy(true)
      setSubmitStep('loading')
      try {
        if (fallbackFile) {
          const fileErr = validateEvidenceFile(fallbackFile)
          if (fileErr) {
            setError(fileErr)
            setBusy(false)
            setSubmitStep('form')
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

        setSuccess(`Submission for "${activeLeafNode.label}" completed successfully!`)
        setSubmitStep('success')
        loadMyLogs()
      } catch (e: any) {
        setError(e?.message || 'Submission failed')
        setSubmitStep('form')
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(-30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes drawTick {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes drawCircle {
          0% { stroke-dashoffset: 283; }
          100% { stroke-dashoffset: 0; }
        }
        .anim-slide-forward { animation: slideInLeft 0.3s ease-out forwards; }
        .anim-slide-backward { animation: slideInRight 0.3s ease-out forwards; }

        .success-tick-circle {
          stroke-dasharray: 283;
          stroke-dashoffset: 283;
          animation: drawCircle 0.6s ease-out forwards;
        }
        .success-tick-check {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: drawTick 0.4s ease-out 0.6s forwards;
        }
      `}</style>
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider">
            {isStudent ? 'Student Credits Portal' : 'Evidence Portal'}
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{isStudent ? 'My Credits' : pageTitle}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isStudent
              ? 'Browse categories to view available student credits, complete activity submissions, and monitor approval status.'
              : 'Click on parent groups to expand subcategories, click any leaf node to complete the form, and track review status in Logs.'}
          </p>
        </div>
      </div>

      {error && !isLeafModalOpen && !currentModalNode && (
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
          {isStudent ? 'Credit Categories' : 'Activity Categories'}
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
          <span>{isStudent ? 'My Credit Submissions' : 'Submission Logs'}</span>
          {myLogs.length > 0 && (
            <span className="bg-amber-400 text-slate-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              {myLogs.length}
            </span>
          )}
        </button>

        {/* TAB 3: Mentees Tab for Staff */}
        {!isStudent && (
          <button
            type="button"
            onClick={() => setActiveTab('mentees')}
            className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'mentees'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>Mentees</span>
            {mentees.length > 0 && (
              <span className="bg-emerald-400 text-slate-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                {mentees.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* TAB 1: Main Category View */}
      {activeTab === 'tree' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              {isStudent ? 'Credit Categories' : 'PBAS Activity Categories & Subgroups'}
            </h2>
            <span className="text-xs text-slate-400">
              {isStudent
                ? 'Select a parent category to open available activities'
                : 'Expand nodes to view items • Click leaf nodes to fill form & submit'}
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm font-medium">
              Loading categories from Database…
            </div>
          ) : adminTree.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <p className="text-slate-600 font-medium">No activities or credit categories configured.</p>
              <p className="text-xs text-slate-400 mt-1">Please contact IQAC or Administrator.</p>
            </div>
          ) : (
            /* UNIFIED VIEW: SHOW TOP-LEVEL FIRST PARENT NODES AS LIST */
            <div className="space-y-3">
              {adminTree.map((rootNode) => {
                const childCount = rootNode.children?.length || 0
                const isLeaf = childCount === 0
                return (
                  <div
                    key={rootNode.id}
                    onClick={() => handleOpenRootModal(rootNode)}
                    className="group flex flex-col md:flex-row md:items-center justify-between p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer transition-all shadow-sm hover:border-indigo-400 hover:shadow-md gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                        {isLeaf ? '📋' : '📂'}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-600 transition-colors">
                          {rootNode.label}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                          {isLeaf ? 'Direct Activity' : `${childCount} Subcategorie${childCount > 1 ? 's' : ''}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 self-start md:self-auto ml-15 md:ml-0">
                      {isLeaf && rootNode.pbas_credit != null && (
                         <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                           {rootNode.pbas_credit} Credit{rootNode.pbas_credit > 1 ? 's' : ''}
                         </span>
                      )}
                      <span className="text-indigo-600 font-semibold text-sm group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                        Open &rarr;
                      </span>
                    </div>
                  </div>
                )
              })}
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
            <div className="space-y-6">
              {PBAS_LOG_CATEGORIES.map((category) => {
                const categoryLogs = myLogs.filter((log) => getSubmissionCategory(log) === category)
                return (
                  <section key={category} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
                      <h3 className="font-bold">{category}</h3>
                      <span className="text-xs text-slate-300">{categoryLogs.length} submissions</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1120px] text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            {['S.No', 'Leaf Node', 'Path', 'Submitted On', 'Document', 'Credit', 'Status', 'Reason', 'Action', 'External Action'].map((heading) => (
                              <th key={heading} className="px-3 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {categoryLogs.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="px-4 py-6 text-center text-xs text-slate-400">No submissions in this category.</td>
                            </tr>
                          ) : categoryLogs.map((log, index) => (
                            <tr key={log.id} className="hover:bg-slate-50 align-top">
                              <td className="px-3 py-3 text-xs font-semibold text-slate-600">{index + 1}</td>
                              <td className="px-3 py-3 text-xs font-bold text-slate-900">{log.leaf_title || 'PBAS Item'}</td>
                              <td className="px-3 py-3 text-xs text-slate-600 max-w-[180px]">{log.parent_path || 'N/A'}</td>
                              <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{formatSubmissionDate(log.created_at)}</td>
                              <td className="px-3 py-3 text-xs">
                                {log.file ? (
                                  <button type="button" onClick={() => handleViewLogDocument(log)} className="font-semibold text-emerald-700 hover:text-emerald-900 whitespace-nowrap">
                                    Document 📄
                                  </button>
                                ) : <span className="text-slate-400">N/A</span>}
                              </td>
                              <td className="px-3 py-3 text-xs font-black text-amber-800">{log.pbas_credit ?? 0}</td>
                              <td className="px-3 py-3">
                                <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase whitespace-nowrap ${
                                  log.status === 'approved'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : log.status === 'rejected'
                                    ? 'bg-red-100 text-red-800 border-red-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}>{log.status || 'pending'}</span>
                              </td>
                              <td className="px-3 py-3 text-xs text-red-700 max-w-[180px]">{log.rejection_reason || '—'}</td>
                              <td className="px-3 py-3">
                                {log.form_data && typeof log.form_data === 'object' && Object.keys(log.form_data).length > 0 ? (
                                  <button type="button" onClick={() => setViewLogData(log)} className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 whitespace-nowrap">
                                    View Details
                                  </button>
                                ) : <span className="text-xs text-slate-400">—</span>}
                              </td>
                              <td className="px-3 py-3">
                                {log.link ? (
                                  <a href={log.link} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 hover:text-indigo-900 whitespace-nowrap">Open Link ↗</a>
                                ) : <span className="text-xs text-slate-400">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Mentees View (For Staff) */}
      {activeTab === 'mentees' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-6">
          <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-base font-bold">
                🎓
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Assigned Mentees ({mentees.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Students mapped from Student Mentor Mapping. Click any student to review submissions and credit scores.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadMentees}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              🔄 Refresh Mentees
            </button>
          </div>

          {menteesLoading ? (
            <div className="py-12 text-center text-slate-500 text-sm font-medium">Loading mapped mentees…</div>
          ) : mentees.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 p-6">
              <p className="text-slate-600 font-medium">No mentees mapped to your staff profile.</p>
              <p className="text-xs text-slate-400 mt-1">
                Mentee mappings are configured in the Student Mentor Mapping directory.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Mentees List */}
              <div className="space-y-3 lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Select a Mentee
                </span>
                {mentees.map((mentee) => {
                  const isSelected = selectedMentee?.student_id === mentee.student_id
                  return (
                    <div
                      key={mentee.student_id}
                      onClick={() => setSelectedMentee(mentee)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-indigo-50/80 border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                          : 'bg-slate-50/70 border-slate-200 hover:border-indigo-300 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {mentee.profile_image ? (
                          <img
                            src={mentee.profile_image}
                            alt={mentee.name}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                            {mentee.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 text-sm truncate">{mentee.name}</h4>
                          <p className="text-[11px] text-slate-500 font-medium truncate">
                            {mentee.reg_no || mentee.username} • {mentee.department_name}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 block">
                          {mentee.submissions?.length || 0} Subs
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Right Column: Selected Mentee Submissions & Credits */}
              <div className="lg:col-span-2 space-y-4">
                {selectedMentee ? (
                  <div className="space-y-4">
                    {/* Mentee Header Card */}
                    <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        {selectedMentee.profile_image ? (
                          <img
                            src={selectedMentee.profile_image}
                            alt={selectedMentee.name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-indigo-400"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-base border-2 border-indigo-400">
                            {selectedMentee.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3 className="text-base font-bold text-white">{selectedMentee.name}</h3>
                          <p className="text-xs text-indigo-300">
                            Reg: {selectedMentee.reg_no || 'N/A'} • Dept: {selectedMentee.department_name} ({selectedMentee.section_name})
                          </p>
                        </div>
                      </div>

                      {/* Right End: Student Credits & Mentor Credits Display */}
                      <div className="flex items-center gap-3">
                        <div className="bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/20 text-center">
                          <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                            Student Credits
                          </div>
                          <div className="text-base font-black text-white">
                            {selectedMentee.total_student_credits}
                          </div>
                        </div>

                        <div className="bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/20 text-center">
                          <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                            Mentor Credits
                          </div>
                          <div className="text-base font-black text-white">
                            {selectedMentee.total_mentor_credits}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mentee Submissions List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                          Submission Logs ({selectedMentee.submissions?.length || 0})
                        </span>
                      </div>

                      {(!selectedMentee.submissions || selectedMentee.submissions.length === 0) ? (
                        <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                          <p className="text-slate-500 text-xs font-medium">No submissions recorded for this mentee.</p>
                        </div>
                      ) : (
                        selectedMentee.submissions.map((sub: any) => (
                          <div
                            key={sub.id}
                            className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
                          >
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-sm">{sub.leaf_title || 'PBAS Item'}</span>
                              </div>
                              {sub.parent_path && (
                                <div className="text-xs text-slate-500">
                                  Path: <span className="bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">{sub.parent_path}</span>
                                </div>
                              )}
                              <div className="text-[11px] text-slate-400">
                                Submitted: {sub.created_at ? new Date(sub.created_at).toLocaleString() : 'N/A'}
                              </div>

                              {/* Form responses if any */}
                              {sub.form_data && typeof sub.form_data === 'object' && Object.keys(sub.form_data).length > 0 && (
                                <div className="mt-2 text-xs bg-white p-2 rounded-xl border border-slate-200 space-y-1">
                                  <span className="font-bold text-slate-600 text-[10px] uppercase">Form Data:</span>
                                  {Object.entries(sub.form_data).map(([k, v]) => (
                                    <div key={k} className="text-slate-700">
                                      <span className="font-medium text-slate-500">{k}:</span>{' '}
                                      <span className="font-semibold">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Center & Right: Evidence and Credits */}
                            <div className="flex items-center gap-3">
                              {sub.link ? (
                                <a
                                  href={sub.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold"
                                >
                                  Link ↗
                                </a>
                              ) : sub.file ? (
                                <a
                                  href={sub.file}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold"
                                >
                                  File 📄
                                </a>
                              ) : null}

                              {/* Credits breakdown on right end */}
                              <div className="flex items-center gap-1.5">
                                <div className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                                  <div className="text-[8px] font-bold text-emerald-700 uppercase">Student Cr</div>
                                  <div className="text-xs font-black text-emerald-900">{sub.student_credit ?? sub.pbas_credit ?? 0}</div>
                                </div>

                                <div className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-xl text-center">
                                  <div className="text-[8px] font-bold text-amber-700 uppercase">Mentor Cr</div>
                                  <div className="text-xs font-black text-amber-900">{sub.mentor_credit ?? 0}</div>
                                </div>
                              </div>

                              <span
                                className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border ${
                                  sub.status === 'approved'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : sub.status === 'rejected'
                                    ? 'bg-red-100 text-red-800 border-red-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}
                              >
                                {sub.status || 'pending'}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 flex flex-col items-center justify-center p-6">
                    <span className="text-3xl mb-2">👈</span>
                    <p className="text-slate-600 font-medium">Select a mentee from the list to view their submission logs and credit details.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* DRILLDOWN CATEGORY / SUBGROUP POPUP MODAL */}
      {currentModalNode && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-zoom-popup-in transform transition-all">
              {/* Header with Circular Back Button, Title and Close Button */}
              <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between gap-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {modalStack.length > 1 ? (
                    <button
                      type="button"
                      onClick={handleModalBack}
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white border border-white/20 shadow-sm transition-all shrink-0"
                      title="Go Back"
                    >
                      <svg className="w-5 h-5 -ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold border border-indigo-500/30 shrink-0">
                      📂
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest block">
                      {modalStack.length > 1 ? `Subcategory (${modalStack.length} deep)` : 'Category Activities'}
                    </span>
                    <h3 className="text-base md:text-lg font-bold text-white truncate" title={currentModalNode.label}>
                      {currentModalNode.label}
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseDrilldown}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0 text-sm font-bold"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Body: Distinct Sub-parent nodes vs Leaf nodes */}
              <div key={currentModalNode.id} className={`p-6 space-y-4 overflow-y-auto flex-1 bg-slate-50/60 ${slideDirection === 'forward' ? 'anim-slide-forward' : slideDirection === 'backward' ? 'anim-slide-backward' : ''}`}>
                {(!currentModalNode.children || currentModalNode.children.length === 0) ? (
                  <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white p-6">
                    <p className="text-slate-600 font-medium">No items found in this section.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Differentiate Sub-parent groups and Leaf items */}
                    {currentModalNode.children.map((childNode) => {
                      const isSubParent = Boolean(childNode.children && childNode.children.length > 0)
                      const childCount = childNode.children?.length || 0

                      if (isSubParent) {
                        return (
                          /* SUB-PARENT NODE CARD: Soft milky lavender/indigo tinted card */
                          <div
                            key={childNode.id}
                            onClick={() => handleSubParentClick(childNode)}
                            className="group p-4 bg-indigo-50/60 hover:bg-indigo-100/70 rounded-2xl border border-indigo-200/80 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all duration-200 flex items-center justify-between gap-4 backdrop-blur-sm"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center font-bold text-lg shadow-sm transition-all shrink-0">
                                📁
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-200/70 text-indigo-800 uppercase tracking-wide">
                                    Sub-group
                                  </span>
                                  <span className="text-xs text-indigo-700/80 font-medium">
                                    {childCount} item{childCount > 1 ? 's' : ''} inside
                                  </span>
                                </div>
                                <h4 className="font-bold text-slate-900 text-sm md:text-base group-hover:text-indigo-700 transition-colors mt-0.5 truncate">
                                  {childNode.label}
                                </h4>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold text-indigo-700 bg-white/80 px-3 py-1.5 rounded-xl border border-indigo-200 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all shadow-sm group-hover:translate-x-0.5 inline-flex items-center gap-1">
                                Open &rarr;
                              </span>
                            </div>
                          </div>
                        )
                      }

                      /* LEAF NODE CARD: Milky light colored background */
                      return (
                        <div
                          key={childNode.id}
                          onClick={() => handleLeafClick(childNode)}
                          className="group p-4 bg-[#fffef5] hover:bg-[#fff9e6] rounded-2xl border border-amber-200/80 hover:border-amber-400 hover:shadow-md cursor-pointer transition-all duration-200 flex items-center justify-between gap-4 backdrop-blur-sm"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-11 h-11 rounded-2xl bg-amber-100/70 text-amber-700 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center font-bold text-lg shadow-sm transition-all shrink-0">
                              📋
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-200/70 text-amber-800 uppercase tracking-wide">
                                  Leaf Activity
                                </span>
                              </div>
                              <h4 className="font-bold text-slate-900 text-sm md:text-base group-hover:text-amber-800 transition-colors mt-0.5 truncate">
                                {childNode.label}
                              </h4>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {childNode.pbas_credit != null && (
                              <div className="px-3 py-1 bg-amber-100/80 border border-amber-300/80 rounded-xl text-center shadow-xs">
                                <span className="text-[11px] font-black text-amber-900">
                                  {childNode.pbas_credit} Cr
                                </span>
                              </div>
                            )}
                            <span className="text-xs font-bold text-white px-3.5 py-2 rounded-xl bg-amber-600 group-hover:bg-amber-700 shadow-sm transition-all group-hover:scale-105 active:scale-95">
                              Fill Form &rarr;
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* LEAF NODE FORM SUBMISSION POPUP MODAL (RIGHT SLIDE ANIMATION) */}
      {isLeafModalOpen && activeLeafNode && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center md:justify-end p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-none md:rounded-3xl shadow-2xl border-l md:border border-slate-100 w-full md:max-w-xl h-full md:h-auto overflow-hidden flex flex-col md:max-h-[90vh] animate-slide-right-in">
              {/* Header: Title with Circular Back Icon */}
              <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between gap-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setIsLeafModalOpen(false)}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white border border-white/20 shadow-sm transition-all shrink-0"
                    title="Back / Close"
                  >
                    <svg className="w-5 h-5 -ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                      {isStudent ? 'Credit Activity Form' : 'PBAS Submission Form'}
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-white truncate mt-0.5" title={activeLeafNode.label}>
                      {activeLeafNode.label}
                    </h3>
                  </div>
                </div>

                {/* Highlighted PBAS Credit Display */}
                <div className="relative group shrink-0">
                  <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-indigo-500 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-300 animate-pulse"></div>
                  <div className="relative px-3.5 py-1.5 bg-slate-900 rounded-xl border border-amber-400/40 flex flex-col items-center justify-center text-center shadow-lg">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-300">
                      Credit
                    </span>
                    <span className="text-xl font-black tracking-tight text-white drop-shadow-md">
                      {activeLeafNode.pbas_credit != null ? activeLeafNode.pbas_credit : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Body: Google Form Questions */}
              <div className="relative overflow-hidden flex-1 bg-slate-50/50 flex flex-col">
                {submitStep === 'form' && (
                  <div className="p-6 space-y-5 overflow-y-auto flex-1 anim-slide-forward">
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
                )}
                {submitStep === 'loading' && (
                  <div className="p-6 flex-1 flex flex-col items-center justify-center anim-slide-forward">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-600 font-semibold animate-pulse">Submitting evidence...</p>
                  </div>
                )}
                {submitStep === 'success' && (
                  <div className="p-6 flex-1 flex flex-col items-center justify-center anim-slide-forward text-center">
                    <svg className="w-24 h-24 text-emerald-500 mb-6" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="50" cy="50" r="45" className="success-tick-circle" />
                      <path d="M30 50 L45 65 L70 35" className="success-tick-check" />
                    </svg>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Submission Successful!</h3>
                    <p className="text-sm text-slate-500 mb-8">Your PBAS form and evidence were submitted successfully.</p>

                    <div className="flex gap-4">
                      <button type="button" onClick={() => setIsLeafModalOpen(false)} className="px-6 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all">Close</button>
                      <button type="button" onClick={() => { setIsLeafModalOpen(false); setActiveTab('logs'); }} className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-md">View Logs</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              {submitStep === 'form' && (
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
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {/* View Log Data Modal */}
      {viewLogData && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border overflow-hidden flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="relative p-6 bg-slate-900 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4 min-w-0">
                  <button
                    type="button"
                    onClick={() => setViewLogData(null)}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white border border-white/20 shadow-sm transition-all shrink-0"
                  >
                    <svg className="w-5 h-5 -ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                      Submitted Form Details
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-white truncate mt-0.5" title={viewLogData.leaf_title}>
                      {viewLogData.leaf_title}
                    </h3>
                  </div>
                </div>

                <div className="relative px-3.5 py-1.5 bg-slate-900 rounded-xl border border-amber-400/40 flex flex-col items-center justify-center text-center shadow-lg shrink-0">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-300">
                    Credit
                  </span>
                  <span className="text-xl font-black tracking-tight text-white drop-shadow-md">
                    {viewLogData.pbas_credit != null ? viewLogData.pbas_credit : '—'}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 overflow-y-auto flex-1 bg-slate-50/50">
                <div className="space-y-4">
                  {(() => {
                    const formData = viewLogData.form_data && typeof viewLogData.form_data === 'object'
                      ? viewLogData.form_data
                      : {}
                    const schema = Array.isArray(viewLogData.form_schema) ? viewLogData.form_schema : []
                    const schemaIds = new Set(schema.map((field: any) => field.id))
                    const fields = [
                      ...schema.map((field: any) => ({
                        id: field.id,
                        label: field.label || field.id,
                        value: formData[field.id],
                      })),
                      ...Object.entries(formData)
                        .filter(([id]) => !schemaIds.has(id))
                        .map(([id, value]) => ({
                          id,
                          label: id,
                          value,
                        })),
                    ]

                    return fields.map((field: any, idx: number) => (
                      <div key={field.id} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                        <label className="block text-xs font-bold text-slate-800">
                          {idx + 1}. {field.label}
                        </label>
                        <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 whitespace-pre-wrap break-words">
                          {Array.isArray(field.value)
                            ? field.value.join(', ')
                            : field.value === null || field.value === undefined || field.value === ''
                            ? 'Not provided'
                            : String(field.value)}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {documentLogData && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 bg-slate-900/70 backdrop-blur-sm">
            <div className="relative w-full max-w-4xl h-[calc(100vh-2rem)] max-h-[900px] bg-white rounded-2xl shadow-2xl border overflow-hidden flex flex-col">
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Submitted Document</div>
                  <h3 className="text-base font-bold truncate" title={documentLogData.file_name || documentLogData.leaf_title}>
                    {documentLogData.file_name || documentLogData.leaf_title || 'Evidence Document'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeDocumentViewer}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0"
                  aria-label="Close document viewer"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
                {documentLoading ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">Loading document…</div>
                ) : documentUrl && documentContentType.startsWith('image/') ? (
                  <div className="min-h-full flex items-center justify-center">
                    <img src={documentUrl} alt={documentLogData.file_name || 'Submitted document'} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : documentUrl ? (
                  <iframe
                    src={documentUrl}
                    title={documentLogData.file_name || 'Submitted document'}
                    className="w-full h-full min-h-[600px] rounded-lg border border-slate-300 bg-white"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">Document could not be loaded.</div>
                )}
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
