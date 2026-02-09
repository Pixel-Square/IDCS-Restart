import React, { useEffect, useState } from 'react'
import { User, Edit, BookOpen, Save, X } from 'lucide-react'
import fetchWithAuth from '../../services/fetchAuth'

type Section = { id: number; name: string; batch: string; department_id?: number; department_code?: string; department_short_name?: string }
type Staff = { id: number; user: string; staff_id: string; department?: number }
type Advisor = { id: number; section: string; section_id: number; advisor: string; advisor_id: number; is_active: boolean; department_id?: number }

export default function AdvisorAssignments() {
  const [sections, setSections] = useState<Section[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [assignments, setAssignments] = useState<Advisor[]>([])
  const [loading, setLoading] = useState(false)
  const [canAssign, setCanAssign] = useState(false)
  const [selectedDept, setSelectedDept] = useState<number | null>(null)
  const [editingSections, setEditingSections] = useState<Set<number>>(new Set())

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const sres = await fetchWithAuth('/api/academics/section-advisors/?page_size=0')
      const ares = await fetchWithAuth('/api/academics/sections/?page_size=0')
      // use HOD-limited staff endpoint (backend/academics/hod-staff)
      const staffRes = await fetchWithAuth('/api/academics/hod-staff/?page_size=0')
      // fetch current user to get permissions
      const meRes = await fetchWithAuth('/api/accounts/me/')
      async function safeJson(res: Response) {
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) {
          const txt = await res.text()
          console.error('Expected JSON but got:', txt)
          throw new Error('Server returned non-JSON response (see console)')
        }
        return res.json()
      }

      if (sres.ok) {
        const d = await safeJson(sres); setAssignments(d.results || d)
      }
      if (ares.ok) {
        const d = await safeJson(ares); setSections(d.results || d)
      }
      if (staffRes.ok) {
        const d = await safeJson(staffRes); setStaff(d.results || d)
      }
      // no curriculum fetch needed for advisor assignment
      if (meRes.ok) {
        const md = await safeJson(meRes);
        setCanAssign(Boolean(md.permissions && (md.permissions.includes('academics.assign_advisor') || md.permissions.includes('academics.add_sectionadvisor'))))
      }
    } catch (e) {
      console.error(e)
      alert('Failed to load HOD assignments. Check console for server response.')
    } finally { setLoading(false) }
  }

  async function saveAssignment(sectionId: number, advisorId: number) {
    setLoading(true)
    try {
      if (!canAssign) return alert('You do not have permission to assign advisors')
      const payload = { section_id: sectionId, advisor_id: advisorId, is_active: true }
      const res = await fetchWithAuth('/api/academics/section-advisors/', { method: 'POST', body: JSON.stringify(payload) })
      if (res.ok) {
        setEditingSections(prev => {
          const newSet = new Set(prev)
          newSet.delete(sectionId)
          return newSet
        })
        await fetchData()
      } else {
        const err = await res.text(); alert('Error: ' + err)
      }
    } finally { setLoading(false) }
  }

  function toggleEdit(sectionId: number) {
    setEditingSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return newSet
    })
  }

  function findAssignedAdvisor(sectionId: number) {
    return assignments.find(a => a.section_id === sectionId && a.is_active)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Advisor Assign</h1>
              <p className="text-gray-600">Assign advisors to sections and edit existing assignments</p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-lg shadow-sm p-12">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading assignments...</span>
            </div>
          </div>
        )}

        {!loading && sections.length > 0 && (
          <>
            {/* Department Filter Pills */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Filter by Department</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedDept(null)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedDept === null
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Departments
                </button>
                {Array.from(new Set(sections.map(s => s.department_id || 0)))
                  .filter(deptId => deptId > 0)
                  .map(deptId => {
                  const deptSections = sections.filter(s => (s.department_id || 0) === deptId);
                  if (deptSections.length === 0) return null;
                  const deptCode = deptSections[0]?.department_short_name || deptSections[0]?.department_code || `Dept ${deptId}`;
                  const isActive = selectedDept === deptId;

                  return (
                    <button
                      key={deptId}
                      onClick={() => setSelectedDept(isActive ? null : deptId)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {deptCode}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Department Sections */}
            <div className="space-y-6">
              {Array.from(new Set(sections.map(s => s.department_id || 0)))
                .filter(deptId => selectedDept === null || selectedDept === deptId)
                .map(deptId => {
                const deptSections = sections.filter(s => (s.department_id || 0) === deptId);
                if (deptSections.length === 0) return null;

                const deptCode = deptSections[0]?.department_short_name || deptSections[0]?.department_code || `Department ${deptId}`;
                const deptStaff = staff.filter(st => (st.department || 0) === deptId);

                return (
                  <div key={deptId} className="bg-white rounded-lg shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      {deptCode} Department
                    </h2>

                    {/* Assignment Table */}
                    <div className="overflow-x-auto mb-6">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-gray-200">
                            <th className="px-4 py-3 text-left text-sm font-semibold text-blue-700">Section</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-blue-700">Select Advisor</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-blue-700">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {deptSections.map(sec => {
                            const assignedAdvisor = findAssignedAdvisor(sec.id)
                            const isEditing = editingSections.has(sec.id)
                            const showDropdown = !assignedAdvisor || isEditing

                            return (
                              <tr key={sec.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-gray-700">{sec.name}</td>
                                <td className="px-4 py-3">
                                  {showDropdown ? (
                                    <select
                                      id={`advisor-${sec.id}`}
                                      className="w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      defaultValue={assignedAdvisor?.advisor_id || ""}
                                    >
                                      <option value="">-- Select Advisor --</option>
                                      {deptStaff.map(st => (
                                        <option key={st.id} value={st.id}>{st.staff_id} - {st.user}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div className="text-gray-900 font-medium">
                                      {assignedAdvisor?.advisor || "No advisor assigned"}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {assignedAdvisor && !isEditing ? (
                                    <button
                                      disabled={!canAssign}
                                      className={`p-2 text-sm font-medium rounded-lg transition-colors ${
                                        canAssign 
                                          ? 'text-blue-600 hover:bg-blue-50 border border-blue-300'
                                          : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                      }`}
                                      onClick={() => canAssign && toggleEdit(sec.id)}
                                      title="Edit Assignment"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </button>
                                  ) : (
                                    <div className="flex gap-2">
                                      <button
                                        disabled={!canAssign}
                                        className={`p-2 text-sm font-medium rounded-lg transition-colors ${
                                          canAssign 
                                            ? 'text-blue-600 hover:bg-blue-50 border border-blue-300'
                                            : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                        }`}
                                        onClick={() => {
                                          if (!canAssign) return
                                          const sel = document.getElementById(`advisor-${sec.id}`) as HTMLSelectElement
                                          const val = sel.value
                                          if (!val) return alert('Select an advisor first')
                                          saveAssignment(sec.id, Number(val))
                                        }}
                                        title="Save Assignment"
                                      >
                                        <Save className="h-4 w-4" />
                                      </button>
                                      {isEditing && (
                                        <button
                                          className="p-2 text-sm font-medium rounded-lg transition-colors text-red-600 hover:bg-red-50 border border-red-300"
                                          onClick={() => toggleEdit(sec.id)}
                                          title="Cancel"
                                        >
                                          <X className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loading && sections.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-12">
            <div className="text-center">
              <BookOpen className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No sections available</h3>
              <p className="text-gray-600">There are no sections available for advisor assignment at this time.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}