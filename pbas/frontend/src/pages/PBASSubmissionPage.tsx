import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FilePlus2,
  Upload,
  Link2,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  Layers,
  Award,
  Sparkles,
  Info,
  HelpCircle,
} from 'lucide-react'
import { PBASNode, PBASCustomDepartment, AuthUser } from '../types/pbas'
import { getDepartmentTree, listCustomDepartments, createSubmission } from '../services/pbas'
import { ModalPortal } from '../components/ModalPortal'

interface Props {
  user: AuthUser | null
}

export default function PBASSubmissionPage({ user }: Props) {
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<PBASCustomDepartment[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState<string>('00000000-0000-0000-0000-000000000001')
  const [treeNodes, setTreeNodes] = useState<PBASNode[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Selected leaf node for submission
  const [activeNode, setActiveNode] = useState<PBASNode | null>(null)
  const [activeParentPath, setActiveParentPath] = useState<string>('')
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false)

  // Form submission state
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [webLink, setWebLink] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listCustomDepartments()
      .then((depts) => {
        setDepartments(depts)
        if (depts.length > 0) {
          const master = depts.find(d => d.id === '00000000-0000-0000-0000-000000000001')
          setSelectedDeptId(master ? master.id : depts[0].id)
        }
      })
      .catch((err) => console.error(err))
  }, [])

  useEffect(() => {
    if (!selectedDeptId) return
    setLoading(true)
    setErrorMsg('')
    getDepartmentTree(selectedDeptId)
      .then((res) => {
        setTreeNodes(res.nodes || [])
      })
      .catch((err) => setErrorMsg(err?.message || 'Failed to load PBAS criteria tree'))
      .finally(() => setLoading(false))
  }, [selectedDeptId])

  const openSubmissionModal = (node: PBASNode, path: string) => {
    setActiveNode(node)
    setActiveParentPath(path)
    setFormData({})
    setEvidenceFile(null)
    setWebLink(node.link || '')
    setIsSubmitModalOpen(true)
    setErrorMsg('')
    setSuccessMsg('')
  }

  const handleFieldChange = (fieldId: string, val: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeNode) return
    setSubmitting(true)
    setErrorMsg('')

    try {
      const mode = activeNode.input_mode || 'upload'
      const submissionType = activeNode.form_schema?.length ? 'form' : (mode === 'link' ? 'link' : 'upload')

      await createSubmission({
        node: activeNode.id,
        submission_type: submissionType,
        form_data: formData,
        link: webLink || undefined,
        file: evidenceFile || undefined,
      })

      setSuccessMsg(`Successfully submitted evidence for "${activeNode.label}"!`)
      setIsSubmitModalOpen(false)
      // Navigate to my-submissions after a brief delay
      setTimeout(() => {
        navigate('/dashboard/my-submissions')
      }, 1200)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Submission failed. Please verify required fields.')
    } finally {
      setSubmitting(false)
    }
  }

  // Recursive renderer for category tree
  const renderTree = (nodes: PBASNode[], parentPath: string = '', depth: number = 0) => {
    return (
      <div className={`space-y-3 ${depth > 0 ? 'mt-3 pl-4 sm:pl-6 border-l-2 border-slate-200' : ''}`}>
        {nodes.map((node) => {
          const isLeaf = !node.children || node.children.length === 0
          const currentPath = parentPath ? `${parentPath} > ${node.label}` : node.label

          if (isLeaf) {
            return (
              <div
                key={node.id}
                className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-sm hover:border-blue-500/80 hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                      {node.label}
                    </span>
                    {node.pbas_credit != null && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {node.pbas_credit} pts
                      </span>
                    )}
                    {node.input_mode === 'link' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold flex items-center gap-1">
                        <Link2 className="w-3 h-3" /> Web Link
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Document Upload
                      </span>
                    )}
                  </div>
                  {parentPath && (
                    <div className="text-xs text-slate-400 mt-1 truncate">
                      {parentPath}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openSubmissionModal(node, parentPath)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 flex-shrink-0"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>Submit Evidence</span>
                </button>
              </div>
            )
          }

          // Parent node
          return (
            <div key={node.id} className="bg-slate-50/70 rounded-2xl p-4 sm:p-5 border border-slate-200/70">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    {depth === 0 ? 'Part' : '§'}
                  </div>
                  <h3 className="font-bold text-base text-slate-900">{node.label}</h3>
                </div>
                {node.limit != null && (
                  <span className="text-xs font-bold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    Max: {node.limit} pts
                  </span>
                )}
              </div>
              {node.children && renderTree(node.children, currentPath, depth + 1)}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FilePlus2 className="w-5 h-5 text-blue-600" />
            <span>PBAS Evidence Submission</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Select a criterion from the PBAS appraisal framework to submit your proof and document evidence.
          </p>
        </div>

        {/* Framework Selector */}
        {departments.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Framework:</label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
        )}
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

      {/* Criteria Tree */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-xs text-slate-400 border border-slate-200 shadow-sm">
          Loading PBAS appraisal criteria framework...
        </div>
      ) : treeNodes.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-xs text-slate-400 border border-slate-200 shadow-sm">
          No criteria nodes configured in this framework yet.
        </div>
      ) : (
        <div className="space-y-4">
          {renderTree(treeNodes)}
        </div>
      )}

      {/* Evidence Submission Modal */}
      {isSubmitModalOpen && activeNode && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-fade-in">
              <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
                <div>
                  <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                    {activeParentPath || 'PBAS Criterion'}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    {activeNode.label}
                  </h3>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    <span>Awarded Credit: <strong className="text-slate-800">{activeNode.pbas_credit ?? 0} pts</strong></span>
                    <span>•</span>
                    <span className="capitalize">Mode: {activeNode.input_mode || 'Upload'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Dynamic Schema Fields */}
                {activeNode.form_schema && activeNode.form_schema.length > 0 ? (
                  <div className="space-y-3.5">
                    {activeNode.form_schema.map((field) => (
                      <div key={field.id}>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>

                        {field.field_type === 'short_text' && (
                          <input
                            type="text"
                            required={field.required}
                            value={formData[field.label] || ''}
                            onChange={(e) => handleFieldChange(field.label, e.target.value)}
                            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}

                        {field.field_type === 'long_text' && (
                          <textarea
                            rows={3}
                            required={field.required}
                            value={formData[field.label] || ''}
                            onChange={(e) => handleFieldChange(field.label, e.target.value)}
                            placeholder={field.placeholder || `Enter details`}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}

                        {field.field_type === 'dropdown' && (
                          <select
                            required={field.required}
                            value={formData[field.label] || ''}
                            onChange={(e) => handleFieldChange(field.label, e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select option</option>
                            {(field.options || []).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Evidence Attachment / Link input */}
                {activeNode.input_mode === 'link' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Web Reference / Proof URL <span className="text-red-500">*</span>
                    </label>
                    <div className="relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Link2 className="w-4 h-4" />
                      </div>
                      <input
                        type="url"
                        required
                        value={webLink}
                        onChange={(e) => setWebLink(e.target.value)}
                        placeholder="https://..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Evidence Document (PDF / Images) <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-5 text-center cursor-pointer bg-slate-50/50 hover:bg-blue-50/20 transition-all relative">
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        required={!activeNode.form_schema?.length}
                        onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                      {evidenceFile ? (
                        <div className="text-xs font-semibold text-blue-600">
                          Selected: {evidenceFile.name} ({(evidenceFile.size / 1024 / 1024).toFixed(2)} MB)
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs font-semibold text-slate-700">
                            Click or drag file to attach proof
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Allowed formats: PDF, PNG, JPG (Max 15MB)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsSubmitModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {submitting ? 'Submitting...' : 'Confirm & Submit to Queue'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
