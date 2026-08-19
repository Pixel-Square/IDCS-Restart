import React, { useEffect, useState } from 'react'
import { ModalPortal } from '../../../components/ModalPortal'
import {
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

function draftToPayload(n: PBASNode): any {
  return {
    label: n.label,
    audience: n.audience || 'both',
    input_mode: n.input_mode || 'upload',
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
    setErrorMsg('')
    setIsModalOpen(true)
  }

  // Open modal to create subgroup under parentId
  const handleOpenCreateSubgroupModal = (parentId: string, parentLabel: string) => {
    setTargetParentId(parentId)
    setModalTitle(`Create Subgroup under "${parentLabel}"`)
    setInputTitle('')
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
      audience: 'both',
      input_mode: 'upload',
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
      const currentApprovers = await getNodeApprovers(nodeId)
      setSelectedUserIds(currentApprovers.map((a) => a.id))

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
          <h1 className="text-2xl font-bold text-slate-900 mt-2">PBAS Admin - Tree Structure Manager</h1>
          <p className="text-sm text-slate-500 mt-1">
            Build and manage hierarchical PBAS categories, subgroup trees, approvers, node types, and credit allocations.
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
        <div className="flex items-center justify-between border-b pb-4">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Group Tree Hierarchy ({tree.length} Root Groups)
          </h2>
          <span className="text-xs text-slate-400">
            Click "Auth" on parent nodes to authorize faculty approvers • Leaf nodes contain Type & Credit controls.
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
                onChangeNode={handleNodeChange}
                onDeleteNode={handleDeleteNode}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal Popup for Group / Subgroup creation */}
      {isModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden transform transition-all">
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="text-base font-semibold">{modalTitle}</h3>
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
                      placeholder="Search faculty name or staff ID…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <svg
                      className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </div>

                {/* Selected Approvers Badges */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Assigned Approvers ({selectedUserIds.length})
                  </div>
                  {selectedUserIds.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No approvers assigned yet. Select from list below.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedUserIds.map((id) => {
                        const m = staffList.find((s) => s.user_id === id)
                        const label = m ? m.name : `User #${id}`
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 text-xs font-semibold"
                          >
                            <span>{label}</span>
                            <button
                              type="button"
                              onClick={() => toggleUserSelection(id)}
                              className="text-indigo-500 hover:text-indigo-900 font-bold"
                            >
                              ✕
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Faculty Multi-select list */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Select Faculty / Staff Approvers
                  </div>

                  {staffLoading ? (
                    <div className="py-8 text-center text-xs text-slate-400 font-medium">Searching faculty database…</div>
                  ) : staffList.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 font-medium">No faculty members found.</div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 border border-slate-200 rounded-xl p-2 bg-white">
                      {staffList.map((staff) => {
                        const isSelected = selectedUserIds.includes(staff.user_id)
                        return (
                          <div
                            key={staff.user_id}
                            onClick={() => toggleUserSelection(staff.user_id)}
                            className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold'
                                : 'bg-white border-slate-200/80 hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // Handled by parent div onClick
                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                              />
                              <div>
                                <div className="text-xs font-semibold leading-tight">{staff.name}</div>
                                <div className="text-[11px] text-slate-400 font-normal">
                                  ID: {staff.staff_id} • {staff.department_name}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                              @{staff.username}
                            </span>
                          </div>
                        )
                      })}
                    </div>
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
    </div>
  )
}

// Sub-component rendering each tree node recursively
interface TreeNodeItemProps {
  node: PBASNode
  depth: number
  onAddSubgroup: (parentId: string, parentLabel: string) => void
  onOpenAuth: (nodeId: string, nodeLabel: string) => void
  onChangeNode: (nodeId: string, updates: Partial<PBASNode>) => void
  onDeleteNode: (nodeId: string) => void
}

function TreeNodeItem({
  node,
  depth,
  onAddSubgroup,
  onOpenAuth,
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

          {/* Leaf Node Type & Credit Controls */}
          {isLeafNode && (
            <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-medium text-slate-500 pl-1">Type:</span>
                <select
                  value={node.input_mode || 'upload'}
                  onChange={(e) => onChangeNode(node.id, { input_mode: e.target.value as any })}
                  className="text-xs font-semibold bg-white text-slate-800 border border-slate-300 rounded-lg px-2 py-1 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="upload">Upload</option>
                  <option value="link">Link</option>
                </select>
              </div>

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
              onChangeNode={onChangeNode}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}
