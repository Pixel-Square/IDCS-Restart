import React, { useEffect, useState, useMemo } from 'react'
import { Users, Building2, AlertCircle, Edit, UserPlus, Filter, List, Plus } from 'lucide-react'
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
  current_department?: {
    id: number
    code: string | null
    name: string | null
    short_name: string | null
  } | null
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
  const [statusEditStaff, setStatusEditStaff] = useState<StaffMember | null>(null)
  const [statusValue, setStatusValue] = useState<string>('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  // All staff modal states
  const [allStaffModalOpen, setAllStaffModalOpen] = useState(false)
  const [allStaff, setAllStaff] = useState<StaffMember[]>([])
  const [allStaffLoading, setAllStaffLoading] = useState(false)
  const [allStaffError, setAllStaffError] = useState<string | null>(null)
  const [assigningStaffId, setAssigningStaffId] = useState<number | null>(null)
  const [allStaffSearch, setAllStaffSearch] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<Record<number, string>>({}) // Track role selection per staff

  // Confirmation modal states
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [confirmModalData, setConfirmModalData] = useState<{
    title: string
    message: string
    staff: StaffMember | null
    role: string
    targetDeptName: string
    isSwap: boolean
    onConfirm: () => void
  } | null>(null)

  // Success/Error notification states
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const [notificationType, setNotificationType] = useState<'success' | 'error'>('success')

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notificationOpen) {
      const timer = setTimeout(() => {
        setNotificationOpen(false)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [notificationOpen])

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

  const handleStatusEdit = (staff: StaffMember) => {
    setStatusEditStaff(staff)
    setStatusValue(staff.status || 'ACTIVE')
    setStatusError(null)
  }

  const handleStatusSave = async () => {
    if (!statusEditStaff) return
    setStatusSaving(true)
    setStatusError(null)
    try {
      const response = await fetchWithAuth(`/api/academics/staffs/${statusEditStaff.id}/status/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusValue }),
      })
      if (response.ok) {
        setStatusEditStaff(null)
        await fetchStaffs()
      } else {
        const errorData = await response.json().catch(() => ({}))
        setStatusError(errorData.detail || 'Failed to update status.')
      }
    } catch (err) {
      setStatusError('An error occurred while updating status.')
    } finally {
      setStatusSaving(false)
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

  const handleListAllStaff = async () => {
    setAllStaffModalOpen(true)
    setAllStaffLoading(true)
    setAllStaffError(null)
    setAllStaffSearch('')

    try {
      const res = await fetchWithAuth('/api/academics/all-staff/')
      if (!res.ok) {
        setAllStaffError('Failed to load staff list.')
        return
      }
      const data = await res.json()
      setAllStaff(data.results || [])
    } catch (err) {
      console.error('Error fetching all staff:', err)
      setAllStaffError('An error occurred while loading staff.')
    } finally {
      setAllStaffLoading(false)
    }
  }

  const refreshAllStaff = async () => {
    try {
      const res = await fetchWithAuth('/api/academics/all-staff/')
      if (res.ok) {
        const data = await res.json()
        setAllStaff(data.results || [])
      }
    } catch (err) {
      console.error('Error refreshing all staff:', err)
    }
  }

  // Filter all staff based on search term (matches staff ID or name)
  const filteredAllStaff = useMemo(() => {
    if (!allStaffSearch.trim()) return allStaff

    const searchLower = allStaffSearch.toLowerCase().trim()
    return allStaff.filter((staff) => {
      // Search by staff ID
      if (staff.staff_id.toLowerCase().includes(searchLower)) return true

      // Search by username
      if (staff.user?.username?.toLowerCase().includes(searchLower)) return true

      // Search by first name
      if (staff.user?.first_name?.toLowerCase().includes(searchLower)) return true

      // Search by last name
      if (staff.user?.last_name?.toLowerCase().includes(searchLower)) return true

      // Search by email
      if (staff.user?.email?.toLowerCase().includes(searchLower)) return true

      return false
    })
  }, [allStaff, allStaffSearch])

  const handleAssignStaffToDept = async (staffId: number) => {
    if (currentDeptId === 'all' || currentDeptId === null) {
      setNotificationMessage('Please select a specific department first.')
      setNotificationType('error')
      setNotificationOpen(true)
      return
    }

    // Get the selected role for this staff (default to STAFF)
    const role = selectedRoles[staffId] || 'STAFF'

    // Find staff details for confirmation message
    const staff = allStaff.find(s => s.id === staffId)
    if (!staff) {
      setNotificationMessage('Staff member not found.')
      setNotificationType('error')
      setNotificationOpen(true)
      return
    }

    const staffName = getStaffDisplayName(staff)
    const targetDept = departments.find(d => d.id === currentDeptId)
    const targetDeptName = targetDept?.short_name || targetDept?.code || targetDept?.name || 'selected department'

    // Define the actual assignment function
    const performAssignment = async () => {
      setAssigningStaffId(staffId)
      setConfirmModalOpen(false)

      try {
        const res = await fetchWithAuth('/api/academics/staff-department-assign/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_id: staffId,
            department_id: currentDeptId,
            role: role,
          }),
        })

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          setNotificationMessage(errorData.detail || 'Failed to assign staff to department.')
          setNotificationType('error')
          setNotificationOpen(true)
          return
        }

        const result = await res.json()

        // Success - refresh both the staff list and all staff modal data (keep modal open)
        await Promise.all([fetchStaffs(), refreshAllStaff()])
        
        // Clear students page cache so new departments/sections show up immediately
        const cacheKey = 'students_page_cache'
        const username = sessionStorage.getItem('username')
        if (username) {
          sessionStorage.removeItem(`${cacheKey}_${username}_my-students`)
          sessionStorage.removeItem(`${cacheKey}_${username}_my-mentees`)
          sessionStorage.removeItem(`${cacheKey}_${username}_department-students`)
          sessionStorage.removeItem(`${cacheKey}_${username}_all-students`)
        }
        // Signal to Students page that departments list should be refreshed
        sessionStorage.setItem('students_departments_refresh', Date.now().toString())
        
        setNotificationMessage(result.detail || 'Staff assigned to department successfully!')
        setNotificationType('success')
        setNotificationOpen(true)
      } catch (err) {
        console.error('Error assigning staff:', err)
        setNotificationMessage('An error occurred while assigning staff.')
        setNotificationType('error')
        setNotificationOpen(true)
      } finally {
        setAssigningStaffId(null)
      }
    }

    // Determine if confirmation is needed
    if (role === 'STAFF') {
      // For STAFF role: Only show confirmation if they already have a department (swap scenario)
      if (!staff.current_department) {
        // No current department - proceed without confirmation
        await performAssignment()
        return
      }

      // Has current department - show swap confirmation
      const currentDeptInfo = `${staff.current_department.short_name || staff.current_department.code || staff.current_department.name}`
      
      setConfirmModalData({
        title: '⚠️ Department Swap Confirmation',
        message: 'This will reassign the staff member\'s primary department. Is this intentional and not accidental?',
        staff: staff,
        role: role,
        targetDeptName: targetDeptName,
        isSwap: true,
        onConfirm: performAssignment,
      })
      setConfirmModalOpen(true)
    } else {
      // For HOD/AHOD: Always show confirmation
      setConfirmModalData({
        title: 'Confirm Role Assignment',
        message: `This will add a ${role} role for this department.`,
        staff: staff,
        role: role,
        targetDeptName: targetDeptName,
        isSwap: false,
        onConfirm: performAssignment,
      })
      setConfirmModalOpen(true)
    }
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
            <div className="flex flex-wrap items-center gap-4">
              {canViewAllStaff && (
                <button
                  onClick={handleListAllStaff}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  title="List all staff members"
                >
                  <List className="h-4 w-4" />
                  <span>List Staffs</span>
                </button>
              )}
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
            ) as (StaffMember & { departmentInfo: Department })[]
            const filteredStaffs = getFilteredStaffs(allStaffs) as (StaffMember & { departmentInfo: Department })[]
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
                                    ? 'bg-red-100 text-red-800'
                                    : staff.status === 'RESIGNED'
                                    ? 'bg-orange-100 text-orange-800'
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
                                  ? 'bg-red-100 text-red-800'
                                  : staff.status === 'RESIGNED'
                                  ? 'bg-orange-100 text-orange-800'
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

      {/* Status Edit Modal */}
      {statusEditStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Edit Status</h3>
            <p className="text-sm text-gray-500 mb-4">
              {getStaffDisplayName(statusEditStaff)}
              <span className="mx-1 text-gray-400">·</span>
              {statusEditStaff.staff_id}
            </p>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Status
              </label>
              <div className="flex flex-col gap-2">
                {(['ACTIVE', 'INACTIVE', 'RESIGNED'] as const).map((s) => (
                  <label
                    key={s}
                    className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg border transition-colors ${
                      statusValue === s
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="staff-status"
                      value={s}
                      checked={statusValue === s}
                      onChange={() => setStatusValue(s)}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        s === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : s === 'INACTIVE'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {s === 'ACTIVE' ? 'Active' : s === 'INACTIVE' ? 'Inactive' : 'Resigned'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {statusError && (
              <p className="text-sm text-red-600 mb-4">{statusError}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setStatusEditStaff(null)}
                disabled={statusSaving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusSave}
                disabled={statusSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {statusSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All Staff Modal */}
      {allStaffModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">All Staff Members</h3>
                  <p className="text-sm text-gray-600">
                    {currentDeptId && currentDeptId !== 'all'
                      ? `Click + to add staff to ${
                          departments.find((d) => d.id === currentDeptId)?.short_name ||
                          departments.find((d) => d.id === currentDeptId)?.code ||
                          'selected department'
                        }`
                      : 'Please select a specific department to add staff'}
                  </p>
                </div>
                <button
                  onClick={() => setAllStaffModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              
              {/* Search Input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by staff ID, name, or email..."
                  value={allStaffSearch}
                  onChange={(e) => setAllStaffSearch(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
                <svg
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </div>
              {allStaffSearch && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing {filteredAllStaff.length} of {allStaff.length} staff members
                </p>
              )}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto">
              {allStaffLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : allStaffError ? (
                <div className="px-6 py-8 text-center text-red-600">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p>{allStaffError}</p>
                </div>
              ) : filteredAllStaff.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p>{allStaffSearch ? 'No staff members match your search' : 'No staff members found'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
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
                          Current Department
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Existing Roles
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        {canEdit && currentDeptId && currentDeptId !== 'all' && (
                          <>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Role
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Action
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredAllStaff.map((staff) => (
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
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {staff.current_department ? (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800">
                                {staff.current_department.short_name ||
                                  staff.current_department.code ||
                                  staff.current_department.name}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <div className="flex flex-wrap gap-1">
                              {/* Show STAFF role if they have a primary department */}
                              {staff.current_department && (
                                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800">
                                  STAFF - {staff.current_department.short_name || staff.current_department.code}
                                </span>
                              )}
                              {/* Show HOD/AHOD roles */}
                              {staff.department_role_mappings && staff.department_role_mappings.length > 0 ? (
                                staff.department_role_mappings.map((deptRole, idx) => (
                                  <span
                                    key={`role-${idx}`}
                                    className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 border border-green-200"
                                    title={`${deptRole.role} of ${deptRole.department.name}${deptRole.academic_year ? ` (${deptRole.academic_year})` : ''}`}
                                  >
                                    {deptRole.role} - {deptRole.department.short_name || deptRole.department.code}
                                  </span>
                                ))
                              ) : null}
                              {/* No roles at all */}
                              {!staff.current_department && (!staff.department_role_mappings || staff.department_role_mappings.length === 0) && (
                                <span className="text-gray-400">None</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                staff.status === 'ACTIVE'
                                  ? 'bg-green-100 text-green-800'
                                  : staff.status === 'INACTIVE'
                                  ? 'bg-red-100 text-red-800'
                                  : staff.status === 'RESIGNED'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {staff.status || 'Unknown'}
                            </span>
                          </td>
                          {canEdit && currentDeptId && currentDeptId !== 'all' && (
                            <>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <select
                                  value={selectedRoles[staff.id] || 'STAFF'}
                                  onChange={(e) => setSelectedRoles({ ...selectedRoles, [staff.id]: e.target.value })}
                                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                  <option value="STAFF">Staff</option>
                                  <option value="HOD">HOD</option>
                                  <option value="AHOD">AHOD</option>
                                </select>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <button
                                  onClick={() => handleAssignStaffToDept(staff.id)}
                                  disabled={assigningStaffId === staff.id}
                                  className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={`Add as ${selectedRoles[staff.id] || 'STAFF'} to current department`}
                                >
                                  {assigningStaffId === staff.id ? (
                                    <>
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                      <span className="text-xs">Adding...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-4 w-4" />
                                      <span className="text-xs">Add</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && confirmModalData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{confirmModalData.title}</h3>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4">
              {confirmModalData.isSwap && confirmModalData.staff?.current_department && (
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Staff ID:</span>
                      <span className="text-gray-900">{confirmModalData.staff.staff_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Name:</span>
                      <span className="text-gray-900">{getStaffDisplayName(confirmModalData.staff)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Current Dept:</span>
                      <span className="text-gray-900">
                        {confirmModalData.staff.current_department.short_name ||
                          confirmModalData.staff.current_department.code ||
                          confirmModalData.staff.current_department.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">New Dept:</span>
                      <span className="text-indigo-600 font-semibold">{confirmModalData.targetDeptName}</span>
                    </div>
                  </div>
                </div>
              )}

              {!confirmModalData.isSwap && confirmModalData.staff && (
                <div className="mb-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Staff ID:</span>
                    <span className="text-gray-900">{confirmModalData.staff.staff_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Name:</span>
                    <span className="text-gray-900">{getStaffDisplayName(confirmModalData.staff)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Role:</span>
                    <span className="text-indigo-600 font-semibold">{confirmModalData.role}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Department:</span>
                    <span className="text-gray-900">{confirmModalData.targetDeptName}</span>
                  </div>
                </div>
              )}

              <p className="text-gray-700">{confirmModalData.message}</p>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmModalData.onConfirm}
                className="px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notificationOpen && (
        <div className="fixed top-4 right-4 z-50 transition-all duration-300 ease-in-out">
          <div
            className={`rounded-lg shadow-lg p-4 max-w-md ${
              notificationType === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                {notificationType === 'success' ? (
                  <svg
                    className="h-6 w-6 text-green-600"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                ) : (
                  <AlertCircle className="h-6 w-6 text-red-600" />
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${notificationType === 'success' ? 'text-green-900' : 'text-red-900'}`}>
                  {notificationMessage}
                </p>
              </div>
              <button
                onClick={() => setNotificationOpen(false)}
                className={`flex-shrink-0 ${
                  notificationType === 'success' ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'
                }`}
              >
                <svg className="h-5 w-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
