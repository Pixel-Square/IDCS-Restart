import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Users, GraduationCap, Mail, Loader2, UserCircle2, ChevronLeft, ChevronRight, Building2, Globe } from 'lucide-react'

type Student = { 
  id: number; 
  reg_no: string; 
  username: string; 
  first_name?: string;
  last_name?: string;
  email?: string;
  section_id?: number; 
  section_name?: string;
  department_code?: string;
  department_name?: string;
  batch?: string;
  status?: string;
  mentor_id?: number;
  mentor_name?: string;
}

type SectionMeta = {
  section_id: number
  section_name: string
  batch_name?: string
  department_code?: string
  department_short_name?: string
  department_name?: string
  label: string  // formatted display label
}

type ViewMode = 'department-students' | 'all-students'

interface StudentsPageProps {
  user?: any;
}

export default function StudentsPage({ user }: StudentsPageProps = {}) {
  const [viewMode, setViewMode] = useState<ViewMode>('department-students')
  // section list + lazy-loaded students per selected section
  const [deptSections, setDeptSections] = useState<SectionMeta[]>([])
  const [allSections, setAllSections] = useState<SectionMeta[]>([])
  const [lazyStudents, setLazyStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedSection, setSelectedSection] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)

  // Get user permissions from localStorage and user object
  const getPermissions = (): string[] => {
    try {
      const localPerms = JSON.parse(localStorage.getItem('permissions') || '[]') as string[]
      const userPerms = user?.permissions || []
      // Normalize to lowercase and remove trailing periods/whitespace
      return [...localPerms, ...userPerms].map(p => String(p).toLowerCase().trim().replace(/\.$/, ''))
    } catch {
      return (user?.permissions || []).map((p: string) => String(p).toLowerCase().trim().replace(/\.$/, ''))
    }
  }
  
  const userPermissions = getPermissions()
  const hasPermission = (permission: string) => userPermissions.includes(permission.toLowerCase())

  // Available view modes based on permissions
  const availableViews = [
    {
      key: 'department-students' as ViewMode, 
      label: 'Department Students',
      icon: Building2,
      permission: 'students.view_department_students',
      description: 'All students in your department'
    },
    {
      key: 'all-students' as ViewMode,
      label: 'All Students', 
      icon: Globe,
      permission: 'students.view_all_students',
      description: 'Students from all departments'
    }
  ].filter(view => hasPermission(view.permission))

  // Set default view mode to the first available view
  useEffect(() => {
    if (availableViews.length > 0 && !availableViews.find(v => v.key === viewMode)) {
      setViewMode(availableViews[0].key)
    }
  }, [availableViews])

  useEffect(() => { 
    setSelectedSection(null)
    setLazyStudents([])
    setCurrentPage(1)
    fetchSectionsOrStudents()
  }, [viewMode])

  useEffect(() => {
    // For dept/all: when section selected, lazy-fetch its students
    if ((viewMode === 'department-students' || viewMode === 'all-students') && selectedSection !== null) {
      fetchSectionStudents(selectedSection)
    }
  }, [selectedSection])

  // Reset to page 1 when section changes
  useEffect(() => { setCurrentPage(1) }, [selectedSection])

  // Fetch section list; then lazy-load students per selected section
  async function fetchSectionsOrStudents() {
    setLoading(true)
    try {
      if (viewMode === 'department-students') {
        const res = await fetchWithAuth('/api/academics/department-students/')
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const sections: SectionMeta[] = (data.sections || []).map((s: any) => ({
          ...s,
          label: [s.department_short_name || s.department_code, s.batch_name, s.section_name].filter(Boolean).join(' · ')
        }))
        setDeptSections(sections)
        if (sections.length > 0) setSelectedSection(sections[0].section_id)

      } else if (viewMode === 'all-students') {
        const res = await fetchWithAuth('/api/academics/all-students/')
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const sections: SectionMeta[] = (data.sections || []).map((s: any) => ({
          ...s,
          label: [s.department_short_name || s.department_code, s.batch_name, s.section_name].filter(Boolean).join(' · ')
        }))
        setAllSections(sections)
        if (sections.length > 0) setSelectedSection(sections[0].section_id)
      }
    } catch (e) {
      console.error('fetchSectionsOrStudents error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchSectionStudents(sectionId: number) {
    const endpoint = viewMode === 'department-students'
      ? `/api/academics/department-students/?section_id=${sectionId}`
      : `/api/academics/all-students/?section_id=${sectionId}`
    setLoadingStudents(true)
    try {
      const res = await fetchWithAuth(endpoint)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setLazyStudents(data.students || [])
    } catch (e) {
      console.error('fetchSectionStudents error:', e)
      setLazyStudents([])
    } finally {
      setLoadingStudents(false)
    }
  }

  // Current section list and students
  const currentSectionList: SectionMeta[] = viewMode === 'department-students' ? deptSections : allSections
  const displayStudentsList: Student[] = lazyStudents

  // Pagination calculations
  const totalItems = displayStudentsList.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const displayStudents = displayStudentsList.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  const renderPageNumbers = () => {
    const pages = []
    const maxPagesToShow = 5
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2))
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1)

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1)
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => handlePageChange(i)}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            currentPage === i
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          {i}
        </button>
      )
    }
    return pages
  }

  // If user has no permissions for any view mode, show access denied
  if (availableViews.length === 0) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="bg-red-100 p-4 rounded-full mb-4 mx-auto w-fit">
            <Users className="w-16 h-16 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Access Denied</h3>
          <p className="text-slate-600 text-sm">You don't have permission to view students data.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <span className="text-slate-600 text-lg">Loading students...</span>
        </div>
      </div>
    )
  }

  const currentView = availableViews.find(v => v.key === viewMode)
  const totalLabel = `${currentSectionList.length} sections`
  const hasContent = currentSectionList.length > 0

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm mb-6 p-6 border border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Students</h1>
              <p className="text-slate-600 text-sm">{currentView?.description || 'View and manage students'}</p>
            </div>
          </div>
          <div className="px-4 py-2 bg-gradient-to-r from-slate-100 to-indigo-100 rounded-lg">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-700" />
              <span className="text-sm font-semibold text-indigo-900">
                {totalLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex items-center gap-1 overflow-x-auto">
          {availableViews.map(view => {
            const Icon = view.icon
            return (
              <button
                key={view.key}
                onClick={() => setViewMode(view.key)}
                className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                  viewMode === view.key
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {view.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Empty State */}
      {!hasContent && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="bg-slate-100 p-4 rounded-full mb-4">
              {currentView && <currentView.icon className="w-16 h-16 text-slate-400" />}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Students Found</h3>
            <p className="text-slate-600 text-sm">
              {viewMode === 'department-students' && 'No students found in your department.'}
              {viewMode === 'all-students' && 'No students found in the system.'}
            </p>
          </div>
        </div>
      )}

      {/* Section Pills */}
      {hasContent && (
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {currentSectionList.map(sec => {
              const isActive = selectedSection === sec.section_id
              return (
                <button
                  key={sec.section_id}
                  onClick={() => setSelectedSection(sec.section_id)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-200'
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  {sec.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Spinner when switching sections */}
      {loadingStudents && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            <span className="text-slate-600">Loading students...</span>
          </div>
        </div>
      )}

      {/* Students Table */}
      {!loadingStudents && displayStudents.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-indigo-50 border-b-2 border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">S.No</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Registration No</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Student Name</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Department</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Email</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayStudents.map((student, index) => (
                  <tr 
                    key={student.id} 
                    className="hover:bg-blue-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-slate-600">{startIndex + index + 1}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-semibold text-slate-900">{student.reg_no}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <UserCircle2 className="w-5 h-5 text-slate-400" />
                        <span className="text-sm font-medium text-slate-900">
                          {student.first_name && student.last_name 
                            ? `${student.first_name} ${student.last_name}`.trim() 
                            : student.username}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                        <span className="text-sm text-slate-700">
                          {student.department_code || '-'}
                        </span>
                      </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        {student.email ? (
                          <>
                            <Mail className="w-4 h-4 text-slate-400" />
                            <span className="text-sm">{student.email}</span>
                          </>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        student.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : student.status === 'resigned'
                          ? 'bg-red-100 text-red-800'
                          : student.status === 'debar'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {student.status || 'active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="text-sm text-slate-600">
                  Showing <span className="font-semibold text-slate-900">{startIndex + 1}</span> to{' '}
                  <span className="font-semibold text-slate-900">{Math.min(endIndex, totalItems)}</span> of{' '}
                  <span className="font-semibold text-slate-900">{totalItems}</span> students
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`p-2 rounded-md transition-colors ${
                      currentPage === 1
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {renderPageNumbers()}
                  </div>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`p-2 rounded-md transition-colors ${
                      currentPage === totalPages
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}