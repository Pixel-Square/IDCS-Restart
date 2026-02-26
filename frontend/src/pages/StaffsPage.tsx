import React, { useEffect, useState, useMemo } from 'react'
import { Users, Building2, AlertCircle, Edit, Trash2, UserPlus, Filter } from 'lucide-react'
import fetchWithAuth from '../services/fetchAuth'
import StaffFormModal from '../components/StaffFormModal'

type StaffMember = {
  id: number
  staff_id: string
  user: {
    username: string
    first_name: string
    last_name: string
    email?: string
  } | null
  user_id: number | null
  designation: string | null
  status: string | null
  department: number | null
  roles: string[]
  user_roles?: string[]
  department_roles?: string[]
  department_role_mappings?: {
    department: {
      id: number
      code: string
      name: string
      short_name?: string
    }
    role: string
    role_code: string
    academic_year?: string
  }[]
}

type Department = {
  id: number
  code: string | null
  name: string | null
  short_name: string | null
  staffs: StaffMember[]
}

const getStaffDisplayName = (staff: StaffMember): string => {
  if (!staff.user) return staff.staff_id
  return staff.user.username || staff.staff_id
}

export default function StaffsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentDeptId, setCurrentDeptId] = useState<number | 'all' | null>(null)
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [canViewAllStaff, setCanViewAllStaff] = useState(false)

  useEffect(() => {
    fetchStaffs()
  }, [])

  async function fetchStaffs() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetchWithAuth('/api/academics/staffs-page/')
      
      if (!res.ok) {
        if (res.status === 403) {
          setError('You do not have permission to view this page.')
        } else {
          setError(`Failed to load staff data: ${res.statusText}`)
        }
        return
      }

      const data = await res.json()
      const depts = data.results || []
      setDepartments(depts)
      setCanEdit(data.can_edit || false)
      setCanViewAllStaff(data.can_view_all || false)
      
      // Set first department as default (or 'all' if user can view all staff)
      if (depts.length > 0 && currentDeptId === null) {
        if (data.can_view_all) {
          setCurrentDeptId('all')
        } else {
          setCurrentDeptId(depts[0].id)
        }
      }
    } catch (err) {
      console.error('Error fetching staffs:', err)
      setError('An error occurred while loading staff data.')
    } finally {
      setLoading(false)
    }
  }

  // Get all unique roles across all departments for filtering
  const allRoles = useMemo(() => {
    const roleSet = new Set<string>()
    departments.forEach(dept => {
      dept.staffs?.forEach(staff => {
        staff.roles?.forEach(role => roleSet.add(role))
      })
    })
    return Array.from(roleSet).sort()
  }, [departments])

  // Filter staff based on selected role
  const getFilteredStaffs = (staffs: StaffMember[]) => {
    if (!selectedRole) return staffs
    return staffs.filter(staff => staff.roles?.includes(selectedRole))
  }

  const handleEdit = (staff: StaffMember) => {
    setEditingStaff(staff)
    setIsModalOpen(true)
  }

  const handleDelete = async (staffId: number, staffName: string) => {
    if (!confirm(`Are you sure you want to delete ${staffName}? This action cannot be undone.`)) {
      return
    }
    
    try {
      const response = await fetchWithAuth(`/api/academics/staffs/${staffId}/delete/`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        // Refresh the staff list
        await fetchStaffs()
        alert('Staff member deleted successfully.')
      } else {
        const errorData = await response.json().catch(() => ({}))
        alert(errorData.detail || 'Failed to delete staff member.')
      }
    } catch (err: any) {
      console.error('Delete error:', err)
      alert('An error occurred while deleting the staff member.')
    }
  }

  const handleAddStaff = (deptId: number) => {
    setEditingStaff(null)
    setSelectedDeptId(deptId)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingStaff(null)
    setSelectedDeptId(null)
  }

  const handleModalSuccess = async () => {
    // Refresh the staff list
    await fetchStaffs()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading staffs...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
          <div className="flex items-center space-x-3 text-red-600 mb-4">
            <AlertCircle className="h-6 w-6" />
            <h2 className="text-lg font-semibold">Error</h2>
          </div>
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    )
  }

  if (departments.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No Data Available</h2>
          <p className="text-gray-600">No departments or staff members found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center space-x-3">
            <Users className="h-8 w-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Staff Directory</h1>
              <p className="text-sm text-gray-600">View staff members by department</p>
            </div>
          </div>
        </div>

        {/* Department Button Navigation */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
            <h3 className="text-lg font-medium text-gray-900">Filter Options</h3>
            {canViewAllStaff && allRoles.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <label htmlFor="role-filter" className="text-sm font-medium text-gray-700">
                  Filter by Role:
                </label>
                <select
                  id="role-filter"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">All Roles</option>
                  {allRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {selectedRole && (
                  <button
                    onClick={() => setSelectedRole('')}
                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Department:</h4>
            <div className="flex flex-wrap gap-2">
              {canViewAllStaff && (
                <button
                  onClick={() => setCurrentDeptId('all')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    currentDeptId === 'all'
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Departments
                </button>
              )}
              {departments.map((dept) => {
                const isActive = currentDeptId === dept.id
                const displayName = dept.short_name || dept.code || dept.name || `Dept ${dept.id}`
                return (
                  <button
                    key={dept.id}
                    onClick={() => setCurrentDeptId(dept.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {displayName}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Staff Table for Selected Department(s) */}
        {currentDeptId !== null && (() => {
          if (currentDeptId === 'all') {
            // Show all staff across all departments
            const allStaffs = departments.flatMap(d => 
              (d.staffs || []).map(staff => ({ ...staff, departmentInfo: d }))
            )
            const filteredStaffs = getFilteredStaffs(allStaffs)
            const staffCount = filteredStaffs.length
            const totalStaffCount = allStaffs.length

            return (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* All Departments Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <Building2 className="h-6 w-6 text-indigo-600" />
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        All Departments
                      </h2>
                      <p className="text-sm text-gray-600">
                        {staffCount} staff member{staffCount !== 1 ? 's' : ''}
                        {selectedRole && totalStaffCount !== staffCount && (
                          <span className="text-gray-500 ml-1">
                            (of {totalStaffCount} total, filtered by {selectedRole})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Staff List */}
                {staffCount === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">
                    <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p>
                      {selectedRole 
                        ? `No staff members with role "${selectedRole}" found`
                        : 'No staff members found'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Department
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Staff ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Designation
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            User & Department Roles
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          {canEdit && (
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredStaffs.map((staff) => (
                          <tr key={`${staff.departmentInfo.id}-${staff.id}`} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800">
                                {staff.departmentInfo.short_name || staff.departmentInfo.code || staff.departmentInfo.name}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {staff.staff_id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {getStaffDisplayName(staff)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {staff.designation || '—'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              <div className="space-y-1">
                                {/* User Roles */}
                                {staff.user_roles && staff.user_roles.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {staff.user_roles.map((role, idx) => (
                                      <span
                                        key={`user-${idx}`}
                                        className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800"
                                      >
                                        {role}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {/* Department Roles */}
                                {staff.department_role_mappings && staff.department_role_mappings.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {staff.department_role_mappings.map((deptRole, idx) => (
                                      <span
                                        key={`dept-${idx}`}
                                        className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 border border-green-200"
                                        title={`${deptRole.role} of ${deptRole.department.code}${deptRole.academic_year ? ` (${deptRole.academic_year})` : ''}`}
                                      >
                                        {deptRole.role} - {deptRole.department.short_name || deptRole.department.code}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {/* No roles */}
                                {(!staff.user_roles || staff.user_roles.length === 0) && 
                                 (!staff.department_role_mappings || staff.department_role_mappings.length === 0) && (
                                  <span className="text-gray-400">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  staff.status === 'ACTIVE'
                                    ? 'bg-green-100 text-green-800'
                                    : staff.status === 'INACTIVE'
                                    ? 'bg-gray-100 text-gray-800'
                                    : staff.status === 'RESIGNED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {staff.status || 'Unknown'}
                              </span>
                            </td>
                            {canEdit && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleEdit(staff)}
                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Edit Staff"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(staff.id, getStaffDisplayName(staff))}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete Staff"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          }

          // Single department view
          const currentDept = departments.find(d => d.id === currentDeptId)
          if (!currentDept) return null

          const allStaffs = currentDept.staffs || []
          const filteredStaffs = getFilteredStaffs(allStaffs)
          const staffCount = filteredStaffs.length
          const totalStaffCount = allStaffs.length

          return (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Department Header with Add Button */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Building2 className="h-6 w-6 text-indigo-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {currentDept.code || currentDept.short_name || 'Unknown'}
                      {currentDept.name && currentDept.name !== currentDept.code && (
                        <span className="text-sm font-normal text-gray-600 ml-2">
                          — {currentDept.name}
                        </span>
                      )}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {staffCount} staff member{staffCount !== 1 ? 's' : ''}
                      {selectedRole && totalStaffCount !== staffCount && (
                        <span className="text-gray-500 ml-1">
                          (of {totalStaffCount} total, filtered by {selectedRole})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleAddStaff(currentDept.id)}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    title="Add Staff"
                  >
                    <UserPlus className="h-5 w-5" />
                    <span className="text-sm font-medium">Add Staff</span>
                  </button>
                )}
              </div>

              {/* Staff List */}
              {staffCount === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p>
                    {selectedRole 
                      ? `No staff members with role "${selectedRole}" in this department`
                      : 'No staff members in this department'
                    }
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Staff ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Designation
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User & Department Roles
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        {canEdit && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredStaffs.map((staff) => (
                        <tr key={staff.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {staff.staff_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {getStaffDisplayName(staff)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {staff.designation || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <div className="space-y-1">
                              {/* User Roles */}
                              {staff.user_roles && staff.user_roles.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {staff.user_roles.map((role, idx) => (
                                    <span
                                      key={`user-${idx}`}
                                      className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800"
                                    >
                                      {role}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Department Roles */}
                              {staff.department_role_mappings && staff.department_role_mappings.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {staff.department_role_mappings.map((deptRole, idx) => (
                                    <span
                                      key={`dept-${idx}`}
                                      className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 border border-green-200"
                                      title={`${deptRole.role} of ${deptRole.department.code}${deptRole.academic_year ? ` (${deptRole.academic_year})` : ''}`}
                                    >
                                      {deptRole.role} - {deptRole.department.short_name || deptRole.department.code}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* No roles */}
                              {(!staff.user_roles || staff.user_roles.length === 0) && 
                               (!staff.department_role_mappings || staff.department_role_mappings.length === 0) && (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                staff.status === 'ACTIVE'
                                  ? 'bg-green-100 text-green-800'
                                  : staff.status === 'INACTIVE'
                                  ? 'bg-gray-100 text-gray-800'
                                  : staff.status === 'RESIGNED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {staff.status || 'Unknown'}
                            </span>
                          </td>
                          {canEdit && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleEdit(staff)}
                                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Edit Staff"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(staff.id, getStaffDisplayName(staff))}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete Staff"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Staff Form Modal */}
      {canEdit && (
        <StaffFormModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          staffId={editingStaff?.id || null}
          initialData={editingStaff}
          departmentId={selectedDeptId}
        />
      )}
    </div>
  )
}
