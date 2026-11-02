import React, { useEffect, useState } from 'react'
import {
  Settings2,
  Calendar,
  Layers,
  FileText,
  Users,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react'
import {
  PBASCustomDepartment,
  PBASNode,
  PBASDuration,
  AuthUser,
} from '../types/pbas'
import {
  listCustomDepartments,
  getDepartmentTree,
  updateDepartmentTree,
  createCustomDepartment,
  deleteCustomDepartment,
  fetchPBASDurations,
  createPBASDuration,
  deletePBASDuration,
  fetchApprovalFlow,
  updateApprovalFlow,
  fetchSubmissionLogs,
  fetchUserActivities,
} from '../services/pbas'
import { ModalPortal } from '../components/ModalPortal'

interface Props {
  user: AuthUser | null
}

export default function PBASAdminPage({ user }: Props) {
  const [activeTab, setActiveTab] = useState<'tree' | 'durations' | 'flow' | 'logs' | 'activity'>('tree')
  const [departments, setDepartments] = useState<PBASCustomDepartment[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState<string>('00000000-0000-0000-0000-000000000001')
  const [treeNodes, setTreeNodes] = useState<PBASNode[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Durations Tab State
  const [durations, setDurations] = useState<PBASDuration[]>([])
  const [newDurationTitle, setNewDurationTitle] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')

  // Approval Flow Tab State
  const [staffFlow, setStaffFlow] = useState<string[]>(['HOD', 'PRINCIPAL'])
  const [studentFlow, setStudentFlow] = useState<string[]>(['MENTOR', 'HOD', 'PRINCIPAL'])

  // Audit Logs & Analytics State
  const [logs, setLogs] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])

  useEffect(() => {
    loadDepartments()
  }, [])

  const loadDepartments = async () => {
    try {
      const depts = await listCustomDepartments()
      setDepartments(depts)
      if (depts.length) {
        setSelectedDeptId(depts[0].id)
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (activeTab === 'tree' && selectedDeptId) {
      setLoading(true)
      getDepartmentTree(selectedDeptId)
        .then((res) => setTreeNodes(res.nodes || []))
        .catch((err) => setErrorMsg(err?.message || 'Failed to load tree'))
        .finally(() => setLoading(false))
    } else if (activeTab === 'durations') {
      fetchPBASDurations().then(setDurations).catch(console.error)
    } else if (activeTab === 'flow') {
      fetchApprovalFlow().then((f) => {
        setStaffFlow(f.staff_flow || ['HOD', 'PRINCIPAL'])
        setStudentFlow(f.student_flow || ['MENTOR', 'HOD', 'PRINCIPAL'])
      }).catch(console.error)
    } else if (activeTab === 'logs') {
      fetchSubmissionLogs().then(setLogs).catch(console.error)
    } else if (activeTab === 'activity') {
      fetchUserActivities().then(setActivities).catch(console.error)
    }
  }, [activeTab, selectedDeptId])

  // Tree Handlers
  const handleAddRootNode = () => {
    const newNode: PBASNode = {
      id: 'node_' + Math.random().toString(36).substring(2, 9),
      label: 'New Appraisal Section',
      audience: 'both',
      input_mode: 'upload',
      pbas_credit: 10,
      limit: 20,
      children: [],
    }
    setTreeNodes(prev => [...prev, newNode])
  }

  const handleAddChildNode = (parentIndex: number) => {
    const childNode: PBASNode = {
      id: 'node_' + Math.random().toString(36).substring(2, 9),
      label: 'New Child Criterion',
      audience: 'both',
      input_mode: 'upload',
      pbas_credit: 5,
      children: [],
    }
    setTreeNodes(prev => {
      const copy = [...prev]
      const parent = { ...copy[parentIndex] }
      parent.children = [...(parent.children || []), childNode]
      copy[parentIndex] = parent
      return copy
    })
  }

  const handleSaveTree = async () => {
    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      await updateDepartmentTree(selectedDeptId, treeNodes)
      setSuccessMsg('PBAS criteria tree configuration saved successfully!')
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save tree')
    } finally {
      setLoading(false)
    }
  }

  // Duration Handlers
  const handleCreateDuration = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDurationTitle || !newStartDate || !newEndDate) return
    try {
      await createPBASDuration(newDurationTitle, newStartDate, newEndDate)
      setNewDurationTitle('')
      setNewStartDate('')
      setNewEndDate('')
      fetchPBASDurations().then(setDurations)
      setSuccessMsg('Appraisal assessment cycle created.')
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create duration')
    }
  }

  const handleDeleteDuration = async (id: string) => {
    if (!confirm('Are you sure you want to remove this cycle?')) return
    try {
      await deletePBASDuration(id)
      fetchPBASDurations().then(setDurations)
      setSuccessMsg('Duration cycle removed.')
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete duration')
    }
  }

  // Flow Handlers
  const handleSaveFlow = async () => {
    try {
      await updateApprovalFlow(staffFlow, studentFlow)
      setSuccessMsg('Approval workflow updated.')
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update flow')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-600" />
            <span>PBAS System & Framework Administration</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure institutional criteria hierarchies, assessment cycles, sequential approval stages, and audit logs.
          </p>
        </div>
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

      {/* Nav Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'tree', label: 'Criteria Tree & Points', icon: Layers },
          { id: 'durations', label: 'Appraisal Cycles', icon: Calendar },
          { id: 'flow', label: 'Approval Flows', icon: Settings2 },
          { id: 'logs', label: 'Submission Logs', icon: FileText },
          { id: 'activity', label: 'Faculty Activity', icon: Users },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab 1: Criteria Tree & Builder */}
      {activeTab === 'tree' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">Framework:</span>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-medium"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAddRootNode}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Main Category</span>
              </button>
              <button
                onClick={handleSaveTree}
                disabled={loading}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Framework</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {treeNodes.map((root, rIdx) => (
              <div key={root.id || rIdx} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-bold text-xs text-blue-600">Part {rIdx + 1}:</span>
                    <input
                      type="text"
                      value={root.label}
                      onChange={(e) => {
                        const val = e.target.value
                        setTreeNodes(prev => {
                          const copy = [...prev]
                          copy[rIdx] = { ...copy[rIdx], label: val }
                          return copy
                        })
                      }}
                      className="font-bold text-sm text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 focus:outline-none flex-1 px-1 py-0.5"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Max Limit:</span>
                    <input
                      type="number"
                      value={root.limit ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null
                        setTreeNodes(prev => {
                          const copy = [...prev]
                          copy[rIdx] = { ...copy[rIdx], limit: val }
                          return copy
                        })
                      }}
                      className="w-16 px-2 py-1 text-xs border border-slate-200 rounded-lg text-center font-bold"
                    />
                    <button
                      onClick={() => handleAddChildNode(rIdx)}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Child Node
                    </button>
                  </div>
                </div>

                {/* Children */}
                <div className="space-y-2 pl-4 border-l-2 border-slate-100">
                  {(root.children || []).map((child, cIdx) => (
                    <div key={child.id || cIdx} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between gap-3">
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-mono">§{cIdx + 1}</span>
                        <input
                          type="text"
                          value={child.label}
                          onChange={(e) => {
                            const val = e.target.value
                            setTreeNodes(prev => {
                              const copy = [...prev]
                              const p = { ...copy[rIdx] }
                              const cList = [...(p.children || [])]
                              cList[cIdx] = { ...cList[cIdx], label: val }
                              p.children = cList
                              copy[rIdx] = p
                              return copy
                            })
                          }}
                          className="text-xs font-medium text-slate-800 bg-transparent border-b border-dashed border-slate-200 focus:border-blue-500 focus:outline-none flex-1 px-1 py-0.5"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">Points:</span>
                        <input
                          type="number"
                          value={child.pbas_credit ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : 0
                            setTreeNodes(prev => {
                              const copy = [...prev]
                              const p = { ...copy[rIdx] }
                              const cList = [...(p.children || [])]
                              cList[cIdx] = { ...cList[cIdx], pbas_credit: val }
                              p.children = cList
                              copy[rIdx] = p
                              return copy
                            })
                          }}
                          className="w-14 px-2 py-0.5 text-xs border border-slate-200 rounded-lg text-center font-bold"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Appraisal Duration Cycles */}
      {activeTab === 'durations' && (
        <div className="space-y-6">
          {/* Add Duration Form */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-bold text-sm text-slate-900 mb-4">Create New Appraisal Window</h3>
            <form onSubmit={handleCreateDuration} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cycle Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual Appraisal Cycle 2026-2027"
                  value={newDurationTitle}
                  onChange={(e) => setNewDurationTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  required
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                <input
                  type="date"
                  required
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div className="sm:col-span-4 flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Cycle</span>
                </button>
              </div>
            </form>
          </div>

          {/* Durations Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Appraisal Cycle</th>
                  <th className="px-5 py-3">Start Date</th>
                  <th className="px-5 py-3">End Date</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {durations.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-bold text-slate-900">{d.title}</td>
                    <td className="px-5 py-3.5">{d.start_date}</td>
                    <td className="px-5 py-3.5">{d.end_date}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleDeleteDuration(d.id)}
                        className="text-red-500 hover:text-red-700 p-1 rounded"
                        title="Delete Cycle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Approval Flow Stages */}
      {activeTab === 'flow' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6 max-w-2xl">
          <div>
            <h3 className="font-bold text-base text-slate-900">Sequential Appraisal Flow Configuration</h3>
            <p className="text-xs text-slate-500 mt-1">Configure the sequential clearance hierarchy for submissions.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Faculty & Staff Sequential Steps:
              </label>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                {staffFlow.map((step, idx) => (
                  <React.Fragment key={step}>
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold">
                      {step}
                    </span>
                    {idx < staffFlow.length - 1 && <span className="text-slate-400 font-bold">➔</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Student Sequential Steps:
              </label>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                {studentFlow.map((step, idx) => (
                  <React.Fragment key={step}>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold">
                      {step}
                    </span>
                    {idx < studentFlow.length - 1 && <span className="text-slate-400 font-bold">➔</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleSaveFlow}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/20"
            >
              Update Approval Flow
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Audit Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-sm text-slate-900">
            System Submission Audit Trail
          </div>
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Applicant</th>
                <th className="px-5 py-3">Criterion</th>
                <th className="px-5 py-3">Points</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-900">{log.user_name}</td>
                  <td className="px-5 py-3 text-slate-700">{log.leaf_title}</td>
                  <td className="px-5 py-3 font-bold text-slate-900">{log.pbas_credit} pts</td>
                  <td className="px-5 py-3 capitalize font-bold text-slate-800">{log.status}</td>
                  <td className="px-5 py-3 text-slate-400">
                    {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 5: Faculty Activity Analytics */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-sm text-slate-900">
            Institutional Faculty Performance Ranking
          </div>
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Faculty Name</th>
                <th className="px-5 py-3">Staff ID</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Total Credits</th>
                <th className="px-5 py-3">Academics</th>
                <th className="px-5 py-3">Student Dev</th>
                <th className="px-5 py-3">R&D</th>
                <th className="px-5 py-3">Governance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activities.map((act) => (
                <tr key={act.user_id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-bold text-slate-900">{act.name}</td>
                  <td className="px-5 py-3 font-mono text-slate-500">{act.staff_id}</td>
                  <td className="px-5 py-3">{act.department_name}</td>
                  <td className="px-5 py-3 font-black text-blue-700">{act.total_credit} pts</td>
                  <td className="px-5 py-3 font-medium text-slate-600">{act.academics_credit}</td>
                  <td className="px-5 py-3 font-medium text-slate-600">{act.student_dev_credit}</td>
                  <td className="px-5 py-3 font-medium text-slate-600">{act.rd_credit}</td>
                  <td className="px-5 py-3 font-medium text-slate-600">{act.inst_credit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
