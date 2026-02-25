import React, { useEffect, useState } from 'react'
import { Users, Building2, AlertCircle } from 'lucide-react'
import fetchWithAuth from '../services/fetchAuth'

type StaffMember = {
  id: number
  staff_id: string
  user: {
    username: string
    first_name: string
    last_name: string
  } | null
  designation: string | null
  status: string | null
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
  const firstName = staff.user.first_name || ''
  const lastName = staff.user.last_name || ''
  const fullName = `${firstName} ${lastName}`.trim()
  return fullName || staff.user.username || staff.staff_id
}

export default function StaffsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDepts, setExpandedDepts] = useState<Set<number>>(new Set())

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
      
      // Auto-expand all departments by default
      const allIds = new Set(depts.map((d: Department) => d.id))
      setExpandedDepts(allIds)
    } catch (err) {
      console.error('Error fetching staffs:', err)
      setError('An error occurred while loading staff data.')
    } finally {
      setLoading(false)
    }
  }

  const toggleDepartment = (deptId: number) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev)
      if (next.has(deptId)) {
        next.delete(deptId)
      } else {
        next.add(deptId)
      }
      return next
    })
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

        {/* Departments Grid */}
        <div className="grid grid-cols-1 gap-6">
          {departments.map((dept) => {
            const isExpanded = expandedDepts.has(dept.id)
            const staffCount = dept.staffs?.length || 0

            return (
              <div
                key={dept.id}
                className="bg-white rounded-lg shadow-md overflow-hidden transition-all"
              >
                {/* Department Header */}
                <button
                  onClick={() => toggleDepartment(dept.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <Building2 className="h-6 w-6 text-indigo-600" />
                    <div className="text-left">
                      <h2 className="text-lg font-semibold text-gray-900">
                        {dept.code || dept.short_name || 'Unknown'}
                        {dept.name && dept.name !== dept.code && (
                          <span className="text-sm font-normal text-gray-600 ml-2">
                            — {dept.name}
                          </span>
                        )}
                      </h2>
                      <p className="text-sm text-gray-600">{staffCount} staff member{staffCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-indigo-600">
                      {isExpanded ? 'Hide' : 'Show'}
                    </span>
                    <svg
                      className={`h-5 w-5 text-gray-400 transition-transform ${
                        isExpanded ? 'transform rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Staff List */}
                {isExpanded && (
                  <div className="border-t border-gray-200">
                    {staffCount === 0 ? (
                      <div className="px-6 py-8 text-center text-gray-500">
                        <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p>No staff members in this department</p>
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
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {dept.staffs.map((staff) => (
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
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
