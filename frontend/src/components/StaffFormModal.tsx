import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { ModalPortal } from './ModalPortal'
import fetchWithAuth from '../services/fetchAuth'

type StaffFormData = {
  staff_id: string
  username: string
  password?: string
  first_name: string
  last_name: string
  email: string
  designation: string
  department: number | null
  status: string
  roles: string[]
}

type Department = {
  id: number
  code: string
  name: string
  short_name: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  staffId?: number | null
  initialData?: any
  departmentId?: number | null
}

const AVAILABLE_ROLES = ['STAFF', 'HOD', 'AHOD', 'ADVISOR', 'mentor']
const STATUS_CHOICES = ['ACTIVE', 'INACTIVE', 'RESIGNED']

export default function StaffFormModal({ isOpen, onClose, onSuccess, staffId, initialData, departmentId }: Props) {
  const [formData, setFormData] = useState<StaffFormData>({
    staff_id: '',
    username: '',
    password: '',
    first_name: '',
    last_name: '',
    email: '',
    designation: '',
    department: departmentId || null,
    status: 'ACTIVE',
    roles: ['STAFF'],
  })
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingDepts, setLoadingDepts] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchDepartments()
      if (staffId && initialData) {
        // Editing existing staff - map nested user object
        setFormData({
          staff_id: initialData.staff_id || '',
          username: initialData.user?.username || '',
          password: '', // Don't prefill password
          first_name: initialData.user?.first_name || '',
          last_name: initialData.user?.last_name || '',
          email: initialData.user?.email || '',
          designation: initialData.designation || '',
          department: initialData.department || departmentId || null,
          status: initialData.status || 'ACTIVE',
          roles: initialData.roles || ['STAFF'],
        })
      } else {
        // Adding new staff
        setFormData({
          staff_id: '',
          username: '',
          password: '',
          first_name: '',
          last_name: '',
          email: '',
          designation: '',
          department: departmentId || null,
          status: 'ACTIVE',
          roles: ['STAFF'],
        })
      }
      setError(null)
    }
  }, [isOpen, staffId, initialData, departmentId])

  const fetchDepartments = async () => {
    setLoadingDepts(true)
    try {
      const response = await fetchWithAuth('/api/academics/departments/')
      const data = await response.json()
      setDepartments(data.results || [])
    } catch (err: any) {
      console.error('Failed to fetch departments:', err)
    } finally {
      setLoadingDepts(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload: any = {
        staff_id: formData.staff_id,
        designation: formData.designation,
        department: formData.department,
        status: formData.status,
        roles: formData.roles,
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        username: formData.username,
      }

      if (!staffId) {
        // Creating new staff
        if (formData.password) {
          payload.password = formData.password
        }
      } else {
        // Updating existing staff
        if (formData.password) {
          payload.password = formData.password
        }
      }

      let response
      if (staffId) {
        // Update
        response = await fetchWithAuth(`/api/academics/staffs/${staffId}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        // Create
        response = await fetchWithAuth('/api/academics/staffs/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (response) {
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      console.error('Failed to save staff:', err)
      setError(err.message || 'Failed to save staff profile')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleToggle = (role: string) => {
    setFormData((prev) => {
      const roles = prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role]
      return { ...prev, roles }
    })
  }

  if (!isOpen) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-900">
              {staffId ? 'Edit Staff Member' : 'Add New Staff Member'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              type="button"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Staff ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Staff ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.staff_id}
                  onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required={!staffId}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {!staffId && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required={!staffId}
                  placeholder={staffId ? 'Leave blank to keep current password' : ''}
                />
              </div>

              {/* First Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Designation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., Assistant Professor"
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.department || ''}
                  onChange={(e) => setFormData({ ...formData, department: Number(e.target.value) || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                  disabled={loadingDepts}
                >
                  <option value="">Select Department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.code} - {dept.short_name || dept.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                >
                  {STATUS_CHOICES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Roles */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Roles</label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRoleToggle(role)}
                    className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                      formData.roles.includes(role)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
              
              {/* Note about department role sync */}
              {(formData.roles.includes('HOD') || formData.roles.includes('AHOD')) && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-700">
                    💡 <strong>Auto-sync:</strong> Assigning HOD/AHOD roles will automatically create corresponding 
                    department leadership records for the staff member's assigned department.
                  </p>
                </div>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Saving...' : staffId ? 'Update Staff' : 'Create Staff'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  )
}
