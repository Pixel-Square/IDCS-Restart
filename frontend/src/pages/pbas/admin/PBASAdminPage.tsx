import React, { useEffect, useState } from 'react'
import { ModalPortal } from '../../../components/ModalPortal'
import {
  PBASAudience,
  PBASFormField,
  PBASFormFieldType,
  PBASNode,
  StaffMember,
  fetchStaffList,
  getDepartmentTree,
  getNodeApprovers,
  listCustomDepartments,
  saveStoredPBASTree,
  updateDepartmentTree,
  updateNodeApprovers,
} from '../../../services/pbas'

const MASTER_DEPT_ID = 'master'

function generateId(): string {
  return 'node_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36)
}

function generateFieldId(): string {
  return 'field_' + Math.random().toString(36).substring(2, 9)
}

function draftToPayload(n: PBASNode): any {
  return {
    label: n.label,
    audience: n.audience || 'both',
    input_mode: n.input_mode || 'upload',
    form_schema: n.form_schema || [],
    pbas_credit: n.pbas_credit != null ? Number(n.pbas_credit) : null,
    link: n.link ? n.link : null,
    uploaded_name: n.uploaded_name ? n.uploaded_name : null,
    limit: n.limit != null ? Number(n.limit) : null,
    college_required: Boolean(n.college_required),
    position: n.position != null ? Number(n.position) : 0,
    children: (n.children || []).map(draftToPayload),
  }
}

export default function PBASAdminPage() {
  const [tree, setTree] = useState<PBASNode[]>([])
  const [loading, setLoading] = useState(true)
  const [savingDB, setSavingDB] = useState(false)
  const [dbStatusMsg, setDbStatusMsg] = useState('')
  const [apiError, setApiError] = useState('')

  // Modal State for creating a Group / Subgroup
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [targetParentId, setTargetParentId] = useState<string | null>(null) // null = top-level Group
  const [inputTitle, setInputTitle] = useState('')
  const [inputAudience, setInputAudience] = useState<PBASAudience>('both')
  const [errorMsg, setErrorMsg] = useState('')

  // Modal State for Approver Authorization ("Auth" button)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authTargetNodeId, setAuthTargetNodeId] = useState<string>('')
  const [authTargetLabel, setAuthTargetLabel] = useState<string>('')
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [deptsList, setDeptsList] = useState<{ id: string; title: string }[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [authSaving, setAuthSaving] = useState(false)
  const [authMsg, setAuthMsg] = useState('')

  // Modal State for Google Forms-like Dynamic Form Builder ("Form" button)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [formTargetNodeId, setFormTargetNodeId] = useState<string>('')
  const [formTargetLabel, setFormTargetLabel] = useState<string>('')
  const [editingFields, setEditingFields] = useState<PBASFormField[]>([])
  const [formMsg, setFormMsg] = useState('')

  // Load master tree from Database on mount
  const loadMasterTree = async () => {
    setLoading(true)
    setApiError('')
    try {
      const res = await getDepartmentTree(MASTER_DEPT_ID)
      const nodes = res?.nodes || []
      setTree(nodes)
      saveStoredPBASTree(nodes)
    } catch (e: any) {
      setApiError(e?.message || 'Failed to fetch tree data from Database.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMasterTree()
  }, [])

  // Helper to persist updated tree to Database API
  const updateTree = async (newTree: PBASNode[]) => {
    setTree(newTree)
    saveStoredPBASTree(newTree)

    setSavingDB(true)
    setDbStatusMsg('Syncing changes to Database…')
    try {
      const payload = newTree.map(draftToPayload)
      const updated = await updateDepartmentTree(MASTER_DEPT_ID, payload)
      if (updated && updated.nodes) {
        setTree(updated.nodes)
        saveStoredPBASTree(updated.nodes)
      }
      setDbStatusMsg('Saved to Database ✓')
      setTimeout(() => setDbStatusMsg(''), 2500)
    } catch (e: any) {
      setDbStatusMsg('Error saving to Database')
      setApiError(e?.message || 'Failed to save tree to server Database.')
      setTimeout(() => setDbStatusMsg(''), 3000)
    } finally {
      setSavingDB(false)
    }
  }

  // Open modal to create top-level group
  const handleOpenCreateGroupModal = () => {
    setTargetParentId(null)
    setModalTitle('Create New Group')
    setInputTitle('')
    setInputAudience('both')
    setErrorMsg('')
    setIsModalOpen(true)
  }

  // Open modal to create subgroup under parentId
  const handleOpenCreateSubgroupModal = (parentId: string, parentLabel: string) => {
    setTargetParentId(parentId)
    setModalTitle(`Create Subgroup under "${parentLabel}"`)
    setInputTitle('')
    setInputAudience('both')
    setErrorMsg('')
    setIsModalOpen(true)
  }

  // Save new Group / Subgroup
  const handleSaveModalNode = () => {
    const title = inputTitle.trim()
    if (!title) {
      setErrorMsg('Please enter a valid title.')
      return
    }

    const newNode: PBASNode = {
      id: generateId(),
      label: title,
      audience: inputAudience || 'both',
      input_mode: 'upload',
      form_schema: [],
      pbas_credit: 10,
      children: [],
    }

    if (targetParentId === null) {
      updateTree([...tree, newNode])
    } else {
      const addRecursively = (nodes: PBASNode[]): PBASNode[] => {
        return nodes.map((node) => {
          if (node.id === targetParentId) {
            const updatedChildren = [...(node.children || []), newNode]
            return {
              ...node,
              children: updatedChildren,
            }
          }
          if (node.children && node.children.length > 0) {
            return {
              ...node,
              children: addRecursively(node.children),
            }
          }
          return node
        })
      }
      updateTree(addRecursively(tree))
    }

    setIsModalOpen(false)
  }

  // Open Approver Authorization Modal for parent node
  const handleOpenAuthModal = async (nodeId: string, nodeLabel: string) => {
    setAuthTargetNodeId(nodeId)
    setAuthTargetLabel(nodeLabel)
    setSearchTerm('')
    setDeptFilter('')
    setAuthMsg('')
    setIsAuthModalOpen(true)
    setStaffLoading(true)

    try {
      // Load current approvers for node
      const currentApproversRes = await getNodeApprovers(nodeId)
      const list = Array.isArray(currentApproversRes)
        ? currentApproversRes
        : currentApproversRes.approvers || []
      setSelectedUserIds(list.map((a: any) => a.id))

      // Load departments for filter
      const depts = await listCustomDepartments('faculty')
      setDeptsList(depts.map((d) => ({ id: d.id, title: d.title })))

      // Load initial staff list
      const staff = await fetchStaffList()
      setStaffList(staff)
    } catch (e: any) {
      setAuthMsg(e?.message || 'Failed to load approvers.')
    } finally {
      setStaffLoading(false)
    }
  }

  // Search/Filter staff list
  useEffect(() => {
    if (!isAuthModalOpen) return
    let cancelled = false
    setStaffLoading(true)

    const timer = setTimeout(() => {
      fetchStaffList({ search: searchTerm, department: deptFilter })
        .then((data) => {
          if (!cancelled) setStaffList(data)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setStaffLoading(false)
        })
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchTerm, deptFilter, isAuthModalOpen])

  // Toggle user selection for approver
  const toggleUserSelection = (userId: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  // Save Approvers to DB
  const handleSaveApprovers = async () => {
    if (!authTargetNodeId) return
    setAuthSaving(true)
    setAuthMsg('')
    try {
      await updateNodeApprovers(authTargetNodeId, selectedUserIds)
      setAuthMsg('Approvers updated & PBAS_APPROVER role assigned ✓')
      await loadMasterTree()
      setTimeout(() => {
        setIsAuthModalOpen(false)
        setAuthMsg('')
      }, 1500)
    } catch (e: any) {
      setAuthMsg(e?.message || 'Failed to update approvers.')
    } finally {
      setAuthSaving(false)
    }
  }

  // Open Form Builder Modal for a leaf node
  const handleOpenFormModal = (node: PBASNode) => {
    setFormTargetNodeId(node.id)
    setFormTargetLabel(node.label)
    setEditingFields(node.form_schema ? JSON.parse(JSON.stringify(node.form_schema)) : [])
    setFormMsg('')
    setIsFormModalOpen(true)
  }

  // Form Builder handlers
  const handleAddField = (type: PBASFormFieldType = 'short_text') => {
    const defaultLabels: Record<PBASFormFieldType, string> = {
      short_text: 'Short Answer Question',
      long_text: 'Detailed Description / Paragraph',
      dropdown: 'Select Option Dropdown',
      checkboxes: 'Select Applicable Options',
      file_upload: 'Upload Evidence File / Document',
    }

    const newField: PBASFormField = {
      id: generateFieldId(),
      label: defaultLabels[type] || 'Untitled Question',
      field_type: type,
      required: true,
      options: type === 'dropdown' || type === 'checkboxes' ? ['Option 1', 'Option 2'] : undefined,
      placeholder: '',
    }
    setEditingFields((prev) => [...prev, newField])
  }

  const handleUpdateField = (fieldId: string, updates: Partial<PBASFormField>) => {
    setEditingFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
    )
  }

  const handleDeleteField = (fieldId: string) => {
    setEditingFields((prev) => prev.filter((f) => f.id !== fieldId))
  }

  const handleAddOption = (fieldId: string) => {
    setEditingFields((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          const opts = f.options || []
          return { ...f, options: [...opts, `Option ${opts.length + 1}`] }
        }
        return f
      })
    )
  }

  const handleUpdateOption = (fieldId: string, optIndex: number, val: string) => {
    setEditingFields((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          const opts = [...(f.options || [])]
          opts[optIndex] = val
          return { ...f, options: opts }
        }
        return f
      })
    )
  }

  const handleDeleteOption = (fieldId: string, optIndex: number) => {
    setEditingFields((prev) =>
      prev.map((f) => {
        if (f.id === fieldId) {
          const opts = (f.options || []).filter((_, idx) => idx !== optIndex)
          return { ...f, options: opts }
        }
        return f
      })
    )
  }

  const handleSaveFormSchema = async () => {
    if (!formTargetNodeId) return
    handleNodeChange(formTargetNodeId, { form_schema: editingFields })
    setFormMsg('Form template saved successfully ✓')
    setTimeout(() => {
      setIsFormModalOpen(false)
      setFormMsg('')
    }, 1000)
  }

  // Update specific node property
  const handleNodeChange = (nodeId: string, updates: Partial<PBASNode>) => {
    const updateRecursively = (nodes: PBASNode[]): PBASNode[] => {
      return nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, ...updates }
        }
        if (node.children && node.children.length > 0) {
          return { ...node, children: updateRecursively(node.children) }
        }
        return node
      })
    }
    updateTree(updateRecursively(tree))
  }

  // Delete node and its subtree
  const handleDeleteNode = (nodeId: string) => {
    if (!window.confirm('Are you sure you want to delete this group and all its subgroup items?')) return

    const deleteRecursively = (nodes: PBASNode[]): PBASNode[] => {
      return nodes
        .filter((node) => node.id !== nodeId)
        .map((node) => ({
          ...node,
          children: node.children ? deleteRecursively(node.children) : [],
        }))
    }
    updateTree(deleteRecursively(tree))
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider">
              PBAS Configuration
            </span>
            {dbStatusMsg && (
              <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full animate-pulse">
                {dbStatusMsg}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">PBAS Admin - Tree & Form Manager</h1>
          <p className="text-sm text-slate-500 mt-1">
            Build hierarchical PBAS groups, set audience visibility (Staff/Student/Both), authorize approvers, and build dynamic forms for leaf submissions.
          </p>
        </div>

        {/* Create Group Button */}
        <button
          type="button"
          onClick={handleOpenCreateGroupModal}
          disabled={loading || savingDB}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-sm shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-200 active:scale-95 shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>Create Group</span>
        </button>
      </div>

      {apiError && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium">
          {apiError}
        </div>
      )}

      {/* Tree Visualization Container */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Group Tree Hierarchy ({tree.length} Root Groups)
          </h2>
          <span className="text-xs text-slate-400">
            Click "Auth" for approvers • Click "Form" on leaf nodes to build custom Google Forms-like questionnaires.
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm font-medium">
            Loading tree from Database…
          </div>
        ) : tree.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <p className="text-slate-600 font-medium">No PBAS Groups created yet.</p>
            <p className="text-xs text-slate-400 mt-1">Click the "Create Group" button above to add your first category.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tree.map((node) => (
              <TreeNodeItem
                key={node.id}
                node={node}
                depth={0}
                onAddSubgroup={handleOpenCreateSubgroupModal}
                onOpenAuth={handleOpenAuthModal}
                onOpenForm={handleOpenFormModal}
                onChangeNode={handleNodeChange}
                onDeleteNode={handleDeleteNode}
              />
            ))}
          </div>
        )}
      </div>

      {/* MODAL POPUP FOR CREATING GROUP / SUBGROUP */}
      {isModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden transform transition-all">
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="text-base font-bold">{modalTitle}</h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                {errorMsg && (
                  <div className="p-3 text-xs font-medium text-red-700 bg-red-50 rounded-lg border border-red-200">
                    {errorMsg}
                  </div>
                )}

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Group / Subgroup Title</span>
                  <input
                    type="text"
                    value={inputTitle}
                    onChange={(e) => setInputTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveModalNode()}
                    placeholder="e.g. Research Grants & Consultancy"
                    className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    autoFocus
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Target Audience</span>
                  <select
                    value={inputAudience}
                    onChange={(e) => setInputAudience(e.target.value as PBASAudience)}
                    className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white font-medium"
                  >
                    <option value="both">Both (Staff & Students)</option>
                    <option value="faculty">Staff Only</option>
                    <option value="student">Students Only</option>
                  </select>
                </label>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveModalNode}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-md shadow-indigo-500/20 transition-all active:scale-95"
                >
                  Save Group
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* MODAL POPUP FOR APPROVER AUTHORIZATION ("Auth" Button) */}
      {isAuthModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div>
                  <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                    Approver Authorization
                  </span>
                  <h3 className="text-base font-bold text-white truncate max-w-md" title={authTargetLabel}>
                    {authTargetLabel}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {authMsg && (
                  <div
                    className={`p-3 text-xs font-semibold rounded-xl border ${
                      authMsg.includes('✓')
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {authMsg}
                  </div>
                )}

                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Department Filter */}
                  {deptsList.length > 0 && (
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="px-3 py-2 text-xs font-semibold bg-slate-100 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">All Departments</option>
                      {deptsList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Search input */}
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Search faculty name, staff ID, username…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Selected count info banner */}
                <div className="flex items-center justify-between text-xs px-3 py-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-indigo-900">
                  <span className="font-semibold">Selected Approvers:</span>
                  <span className="font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[11px]">
                    {selectedUserIds.length} Selected
                  </span>
                </div>

                {/* Faculty Checklist */}
                <div className="border border-slate-200 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {staffLoading ? (
                    <div className="p-8 text-center text-xs text-slate-500 font-medium">Loading faculty list…</div>
                  ) : staffList.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">No faculty members found.</div>
                  ) : (
                    staffList.map((s) => {
                      const isSelected = selectedUserIds.includes(s.user_id)
                      return (
                        <label
                          key={s.user_id}
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                            isSelected ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleUserSelection(s.user_id)}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                          {s.profile_image ? (
                            <img
                              src={s.profile_image}
                              alt={s.name}
                              className="w-8 h-8 rounded-full object-cover border shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                              {s.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-xs text-slate-800 truncate">{s.name}</div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2">
                              <span>ID: {s.staff_id}</span>
                              <span>•</span>
                              <span>{s.department_name}</span>
                            </div>
                          </div>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveApprovers}
                  disabled={authSaving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-60"
                >
                  {authSaving ? 'Saving…' : 'Save Approvers'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* GOOGLE FORMS-LIKE DYNAMIC FORM BUILDER MODAL ("Form" Button) */}
      {isFormModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-indigo-500/30 text-indigo-300 flex items-center justify-center font-bold text-base">
                    📋
                  </span>
                  <div>
                    <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                      Form Builder • Google Forms Interface
                    </span>
                    <h3 className="text-base font-bold text-white truncate max-w-lg" title={formTargetLabel}>
                      {formTargetLabel}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body: Google Forms Form Designer */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-slate-50/60">
                {formMsg && (
                  <div className="p-3 text-xs font-semibold rounded-xl border bg-emerald-50 text-emerald-700 border-emerald-200">
                    {formMsg}
                  </div>
                )}

                {/* Form Title Card */}
                <div className="bg-white p-5 rounded-2xl border-t-8 border-indigo-600 shadow-sm space-y-2">
                  <h4 className="text-lg font-bold text-slate-800">{formTargetLabel}</h4>
                  <p className="text-xs text-slate-500">
                    Configure question fields, input types, and required validations for faculty / students submitting this activity.
                  </p>
                </div>

                {/* Question List */}
                <div className="space-y-4">
                  {editingFields.map((field, fIdx) => (
                    <div
                      key={field.id}
                      className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4 hover:border-indigo-300 transition-all"
                    >
                      {/* Top row: Question Label Input & Type Selector */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <div className="flex-1 w-full">
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                            placeholder={`Question ${fIdx + 1} Title`}
                            className="w-full px-3.5 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                          />
                        </div>

                        {/* Type Dropdown */}
                        <div className="shrink-0 w-full sm:w-auto">
                          <select
                            value={field.field_type}
                            onChange={(e) => {
                              const nextType = e.target.value as PBASFormFieldType
                              const hasOpts = nextType === 'dropdown' || nextType === 'checkboxes'
                              handleUpdateField(field.id, {
                                field_type: nextType,
                                options: hasOpts ? (field.options?.length ? field.options : ['Option 1', 'Option 2']) : undefined,
                              })
                            }}
                            className="w-full sm:w-48 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            <option value="short_text">📝 Short Text</option>
                            <option value="long_text">📄 Long Text / Paragraph</option>
                            <option value="dropdown">🔽 Dropdown</option>
                            <option value="checkboxes">☑️ Checkboxes</option>
                            <option value="file_upload">📎 File Upload</option>
                          </select>
                        </div>
                      </div>

                      {/* Field Type Specific Body / Options */}
                      <div className="pt-1">
                        {field.field_type === 'short_text' && (
                          <div className="border-b border-dashed border-slate-300 pb-2 text-xs text-slate-400 italic">
                            Short text input box will be shown to the user.
                          </div>
                        )}

                        {field.field_type === 'long_text' && (
                          <div className="border border-dashed border-slate-300 rounded-xl p-3 text-xs text-slate-400 italic">
                            Multi-line textarea will be shown to the user.
                          </div>
                        )}

                        {field.field_type === 'file_upload' && (
                          <div className="border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-xl p-4 text-center text-xs text-indigo-700 font-medium flex items-center justify-center gap-2">
                            <span>📎 File upload component (PDF, PNG, JPG up to 10MB)</span>
                          </div>
                        )}

                        {(field.field_type === 'dropdown' || field.field_type === 'checkboxes') && (
                          <div className="space-y-2 pl-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Options:
                            </span>
                            {(field.options || []).map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-2">
                                <span className="text-slate-400 text-xs">
                                  {field.field_type === 'checkboxes' ? '☑' : '●'}
                                </span>
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => handleUpdateOption(field.id, optIdx, e.target.value)}
                                  placeholder={`Option ${optIdx + 1}`}
                                  className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                                />
                                {(field.options?.length || 0) > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteOption(field.id, optIdx)}
                                    className="text-slate-400 hover:text-red-600 p-1 text-xs"
                                    title="Delete option"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => handleAddOption(field.id)}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-1 pl-4"
                            >
                              <span>+ Add option</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Bottom row: Required Toggle & Delete Field */}
                      <div className="flex items-center justify-end gap-4 border-t border-slate-100 pt-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <span className="text-xs font-semibold text-slate-600">Required</span>
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(e) => handleUpdateField(field.id, { required: e.target.checked })}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => handleDeleteField(field.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs font-medium flex items-center gap-1"
                          title="Delete question"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add Question Menu (+ Buttons like Google Forms) */}
                  <div className="bg-white p-4 rounded-2xl border-2 border-dashed border-indigo-200 flex flex-wrap items-center justify-center gap-2.5">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mr-2">
                      + Add Question:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddField('short_text')}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold border border-indigo-200 transition-all active:scale-95"
                    >
                      + Short Text
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddField('long_text')}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold border border-indigo-200 transition-all active:scale-95"
                    >
                      + Long Text
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddField('dropdown')}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold border border-indigo-200 transition-all active:scale-95"
                    >
                      + Dropdown
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddField('checkboxes')}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold border border-indigo-200 transition-all active:scale-95"
                    >
                      + Checkboxes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddField('file_upload')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold border border-emerald-200 transition-all active:scale-95"
                    >
                      + File Upload
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-500 font-medium">
                  {editingFields.length} Form field{editingFields.length === 1 ? '' : 's'} defined
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsFormModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveFormSchema}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition-all active:scale-95"
                  >
                    Save Form
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}

// Sub-component rendering each tree node recursively
interface TreeNodeItemProps {
  node: PBASNode
  depth: number
  onAddSubgroup: (parentId: string, parentLabel: string) => void
  onOpenAuth: (nodeId: string, nodeLabel: string) => void
  onOpenForm: (node: PBASNode) => void
  onChangeNode: (nodeId: string, updates: Partial<PBASNode>) => void
  onDeleteNode: (nodeId: string) => void
}

function TreeNodeItem({
  node,
  depth,
  onAddSubgroup,
  onOpenAuth,
  onOpenForm,
  onChangeNode,
  onDeleteNode,
}: TreeNodeItemProps) {
  const isLeafNode = !node.children || node.children.length === 0
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(node.label)

  const handleCreditChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '')
    const num = cleaned === '' ? null : parseInt(cleaned, 10)
    onChangeNode(node.id, { pbas_credit: num })
  }

  const saveTitle = () => {
    if (titleValue.trim() && titleValue !== node.label) {
      onChangeNode(node.id, { label: titleValue.trim() })
    }
    setEditingTitle(false)
  }

  const formFieldsCount = node.form_schema?.length || 0

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        depth === 0
          ? 'bg-slate-50/70 border-slate-200/90 p-4'
          : 'bg-white border-slate-200/80 p-3 mt-3'
      }`}
      style={{ marginLeft: `${depth > 0 ? Math.min(depth * 20, 80) : 0}px` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left section: Node Icon, Title, Badges & Approver Badges */}
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
              isLeafNode
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-indigo-100 text-indigo-700'
            }`}
          >
            {isLeafNode ? 'L' : 'P'}
          </span>

          {editingTitle ? (
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                className="w-full text-sm font-semibold text-slate-800 px-2 py-1 border border-indigo-400 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span
                onClick={() => setEditingTitle(true)}
                className="font-semibold text-slate-800 text-sm md:text-base hover:text-indigo-600 cursor-pointer transition-colors"
                title="Click to rename"
              >
                {node.label}
              </span>
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✏️
              </button>

              {/* Display Assigned Approvers Badges */}
              {node.approvers && node.approvers.length > 0 && (
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                    🛡️ {node.approvers.length} Approver{node.approvers.length > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Node Category Badge */}
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0 ${
              isLeafNode
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
            }`}
          >
            {isLeafNode ? 'Leaf Node' : 'Parent Group'}
          </span>

          {/* Audience Selector */}
          <select
            value={node.audience || 'both'}
            onChange={(e) => onChangeNode(node.id, { audience: e.target.value as PBASAudience })}
            className="text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-md px-2 py-0.5 outline-none focus:ring-1 focus:ring-indigo-500"
            title="Target Audience"
          >
            <option value="both">View: Both</option>
            <option value="faculty">View: Staff</option>
            <option value="student">View: Student</option>
          </select>
        </div>

        {/* Right Section: Node Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Auth Button for Approvers Assignment */}
          <button
            type="button"
            onClick={() => onOpenAuth(node.id, node.label)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/80 text-xs font-semibold transition-all active:scale-95"
            title="Authorize Approvers for this group"
          >
            <span className="text-xs">🛡️</span>
            <span>Auth</span>
          </button>

          {/* Subgroup + Button */}
          <button
            type="button"
            onClick={() => onAddSubgroup(node.id, node.label)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80 text-xs font-semibold transition-all active:scale-95"
            title="Add Subgroup"
          >
            <span className="text-base font-bold leading-none">+</span>
            <span>Subgroup</span>
          </button>

          {/* Leaf Node Form Builder Button & Credit Controls */}
          {isLeafNode && (
            <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200">
              {/* Form Button */}
              <button
                type="button"
                onClick={() => onOpenForm(node)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 border ${
                  formFieldsCount > 0
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                }`}
                title="Configure Google Forms-like fields for this leaf node"
              >
                <span>📋 Form</span>
                {formFieldsCount > 0 && (
                  <span className="bg-amber-400 text-slate-900 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                    {formFieldsCount}
                  </span>
                )}
              </button>

              {/* PBAS Credit input */}
              <div className="flex items-center gap-1 border-l border-slate-300 pl-2">
                <span className="text-[11px] font-medium text-slate-500">Credit:</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="0"
                  value={node.pbas_credit ?? ''}
                  onChange={(e) => handleCreditChange(e.target.value)}
                  className="w-16 text-xs font-bold text-indigo-700 bg-white border border-slate-300 rounded-lg px-2 py-1 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-center"
                />
              </div>
            </div>
          )}

          {/* Delete Button */}
          <button
            type="button"
            onClick={() => onDeleteNode(node.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete Node"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Recursive Children Subgroups */}
      {node.children && node.children.length > 0 && (
        <div className="mt-2 pl-2 border-l-2 border-indigo-100 space-y-2">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddSubgroup={onAddSubgroup}
              onOpenAuth={onOpenAuth}
              onOpenForm={onOpenForm}
              onChangeNode={onChangeNode}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}
