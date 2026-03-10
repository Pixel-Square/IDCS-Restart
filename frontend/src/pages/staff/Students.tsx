import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Users, GraduationCap, Mail, Loader2, UserCircle2, ChevronLeft, ChevronRight, Building2, Globe, UserCheck, Heart, RefreshCw, Edit2, X, Search } from 'lucide-react'


// Cache key and expiry time (5 minutes)
const CACHE_KEY = 'students_page_cache'
const CACHE_EXPIRY_MS = 5 * 60 * 1000

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

type ViewMode = 'my-students' | 'my-mentees' | 'department-students' | 'all-students'

interface StudentsPageProps {
  user?: any;
}

export default function StudentsPage({ user }: StudentsPageProps = {}) {
  const [viewMode, setViewMode] = useState<ViewMode>('my-students')
  // section list + lazy-loaded students per selected section
  const [myStudentsSections, setMyStudentsSections] = useState<SectionMeta[]>([])
  const [myMenteesSections, setMyMenteesSections] = useState<SectionMeta[]>([])
  const [deptSections, setDeptSections] = useState<SectionMeta[]>([])
  const [allSections, setAllSections] = useState<SectionMeta[]>([])
  // Pre-cached students for my-students / my-mentees modes (keyed by section_id)
  const [studentsCache, setStudentsCache] = useState<Record<number, Student[]>>({})
  const [lazyStudents, setLazyStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedSection, setSelectedSection] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)
  // All-students cascading dropdown filters
  const [allDeptFilter, setAllDeptFilter] = useState<string>('')
  const [allBatchFilter, setAllBatchFilter] = useState<string>('')
  const [allSectionFilter, setAllSectionFilter] = useState<string>('')
  // Department-students dropdown filters
  const [deptDeptFilter, setDeptDeptFilter] = useState<string>('')
  const [deptBatchFilter, setDeptBatchFilter] = useState<string>('')
  const [deptSectionFilter, setDeptSectionFilter] = useState<string>('')
  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [editFormData, setEditFormData] = useState<Student | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

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

  // Get user roles for role-based tab exclusions
  const getUserRoles = (): string[] => {
    try {
      const localRoles = JSON.parse(localStorage.getItem('roles') || '[]') as string[]
      const userRoles = user?.roles || []
      return [...localRoles, ...userRoles].map(r => String(r).toUpperCase().trim())
    } catch {
      return (user?.roles || []).map((r: string) => String(r).toUpperCase().trim())
    }
  }
  const userRoles = getUserRoles()
  const hasRole = (role: string) => userRoles.includes(role.toUpperCase())

  // HOD / AHOD users manage departments — they should not see "My Students"
  // (an advisor tab) even if they also carry the ADVISOR role.
  const isHodRole = hasRole('HOD') || hasRole('AHOD') || hasRole('hod') || hasRole('ahod')

  // IQAC users operate at the system level — they should not see the
  // department-scoped "Department Students" tab (only "All Students").
  const isIqacRole = hasRole('IQAC') || hasRole('iqac')

  // Available view modes based on permissions + role exclusions
  const availableViews = [
    {
      key: 'my-students' as ViewMode,
      label: 'My Students',
      icon: UserCheck,
      permission: 'academics.view_my_students',
      description: 'Students in your advised sections',
      // HOD/AHOD must not see this tab regardless of permissions
      roleExcluded: isHodRole,
    },
    {
      key: 'my-mentees' as ViewMode,
      label: 'My Mentees',
      icon: Heart,
      permission: 'academics.view_mentees',
      description: 'Students assigned to you as mentor',
      roleExcluded: false,
    },
    {
      key: 'department-students' as ViewMode,
      label: 'Department Students',
      icon: Building2,
      permission: 'students.view_department_students',
      description: 'All students in your department',
      // IQAC must not see department-scoped view; they use All Students
      roleExcluded: isIqacRole,
    },
    {
      key: 'all-students' as ViewMode,
      label: 'All Students',
      icon: Globe,
      permission: 'students.view_all_students',
      description: 'Students from all departments',
      roleExcluded: false,
    }
  ].filter(view => hasPermission(view.permission) && !view.roleExcluded)

  // Get current username for user-specific caching
  const getCurrentUsername = () => {
    try {
      return user?.username || localStorage.getItem('username') || 'anonymous'
    } catch {
      return 'anonymous'
    }
  }

  // Cache helper functions
  const getCachedData = (viewKey: ViewMode) => {
    try {
      const username = getCurrentUsername()
      const cacheKey = `${CACHE_KEY}_${username}_${viewKey}`
      const cached = sessionStorage.getItem(cacheKey)
      if (!cached) return null
      const { data, timestamp } = JSON.parse(cached)
      const age = Date.now() - timestamp
      if (age > CACHE_EXPIRY_MS) {
        sessionStorage.removeItem(cacheKey)
        return null
      }
      return data
    } catch {
      return null
    }
  }

  const setCachedData = (viewKey: ViewMode, data: any) => {
    try {
      const username = getCurrentUsername()
      const cacheKey = `${CACHE_KEY}_${username}_${viewKey}`
      sessionStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch (e) {
      console.warn('Failed to cache students data', e)
    }
  }

  const clearCache = (viewKey?: ViewMode) => {
    try {
      const username = getCurrentUsername()
      if (viewKey) {
        sessionStorage.removeItem(`${CACHE_KEY}_${username}_${viewKey}`)
      } else {
        // Clear all students cache for current user
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith(`${CACHE_KEY}_${username}`)) {
            sessionStorage.removeItem(key)
          }
        })
      }
    } catch {}
  }

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
    setSearchQuery('')
    setDebouncedSearch('')
    fetchSectionsOrStudents()
  }, [viewMode])

  useEffect(() => {
    if (selectedSection === null) return
    if (viewMode === 'my-students' || viewMode === 'my-mentees') {
      // Data is pre-loaded – pull from cache, no extra API call
      setLazyStudents(studentsCache[selectedSection] || [])
    } else {
      fetchSectionStudents(selectedSection, debouncedSearch)
    }
  }, [selectedSection, viewMode, studentsCache, debouncedSearch])

  // Reset to page 1 when section changes
  useEffect(() => { setCurrentPage(1) }, [selectedSection])
  useEffect(() => { setCurrentPage(1) }, [debouncedSearch])

  // Reset filters when allSections list is refreshed
  useEffect(() => {
    if (viewMode === 'all-students') {
      setAllDeptFilter('')
      setAllBatchFilter('')
      setAllSectionFilter('')
      setSelectedSection(null)
      setLazyStudents([])
    }
  }, [allSections.length])

  // Reset dept-students filters when deptSections list is refreshed
  useEffect(() => {
    if (viewMode === 'department-students') {
      setDeptDeptFilter('')
      setDeptBatchFilter('')
      setDeptSectionFilter('')
      setSelectedSection(null)
      setLazyStudents([])
    }
  }, [deptSections.length])

  // Resolve + fetch for dept-students when any dept/batch/section filter changes
  useEffect(() => {
    if (viewMode !== 'department-students') return
    if (!deptDeptFilter && !deptBatchFilter && !deptSectionFilter && !debouncedSearch) {
      setSelectedSection(null)
      setLazyStudents([])
      return
    }
    const matched = deptSections.filter(s =>
      (!deptDeptFilter || (s.department_short_name || s.department_code) === deptDeptFilter) &&
      (!deptBatchFilter || s.batch_name === deptBatchFilter) &&
      (!deptSectionFilter || s.section_name === deptSectionFilter)
    )
    if (matched.length === 0) { setSelectedSection(null); setLazyStudents([]); return }
    setSelectedSection(null)
    fetchDeptStudentsForSections(matched.map(s => s.section_id), debouncedSearch)
  }, [deptDeptFilter, deptBatchFilter, deptSectionFilter, debouncedSearch])

  // Resolve + fetch students whenever any filter changes in all-students mode
  // Works with partial selection: dept only → entire dept, dept+batch → entire batch, all three → specific section
  useEffect(() => {
    if (viewMode !== 'all-students') return
    if (!allDeptFilter && !allBatchFilter && !allSectionFilter && !debouncedSearch) {
      setSelectedSection(null)
      setLazyStudents([])
      return
    }
    const matched = allSections.filter(s =>
      (!allDeptFilter || (s.department_short_name || s.department_code) === allDeptFilter) &&
      (!allBatchFilter || s.batch_name === allBatchFilter) &&
      (!allSectionFilter || s.section_name === allSectionFilter)
    )
    if (matched.length === 0) { setSelectedSection(null); setLazyStudents([]); return }
    setSelectedSection(null)
    fetchAllStudentsForSections(matched.map(s => s.section_id), debouncedSearch)
  }, [allDeptFilter, allBatchFilter, allSectionFilter, debouncedSearch])

  // Map a raw result entry (from my-students or my-mentees response) to SectionMeta + Student[]
  function parsePreloadedSection(r: any): { meta: SectionMeta; students: Student[] } {
    const meta: SectionMeta = {
      section_id: r.section_id,
      section_name: r.section_name,
      batch_name: r.batch,
      department_short_name: r.department_short_name || r.department?.code,
      label: [r.department_short_name || r.department?.code, r.batch, r.section_name].filter(Boolean).join(' · '),
    }
    const students: Student[] = (r.students || []).map((s: any) => ({
      id: s.id,
      reg_no: s.reg_no,
      username: s.username || s.user?.username,
      first_name: s.first_name ?? s.user?.first_name,
      last_name: s.last_name ?? s.user?.last_name,
      email: s.email ?? s.user?.email,
      section_id: r.section_id,
      section_name: r.section_name,
      department_code: r.department_short_name || r.department?.code,
      status: s.status || 'active',
    }))
    return { meta, students }
  }

  // Fetch section list; then lazy-load students per selected section
  async function fetchSectionsOrStudents() {
    // Don't call the API if the current view isn't available to this user
    if (availableViews.length === 0 || !availableViews.find(v => v.key === viewMode)) return
    
    // Check cache first
    const cached = getCachedData(viewMode)
    if (cached) {
      console.log(`Loading ${viewMode} from cache`)
      if (viewMode === 'my-students') {
        setStudentsCache(prev => ({ ...prev, ...cached.studentsCache }))
        setMyStudentsSections(cached.sections)
        if (cached.sections.length > 0) setSelectedSection(cached.sections[0].section_id)
      } else if (viewMode === 'my-mentees') {
        setStudentsCache(prev => ({ ...prev, ...cached.studentsCache }))
        setMyMenteesSections(cached.sections)
        if (cached.sections.length > 0) setSelectedSection(cached.sections[0].section_id)
      } else if (viewMode === 'department-students') {
        setDeptSections(cached.sections)
        if (cached.sections.length > 0) setSelectedSection(cached.sections[0].section_id)
      } else if (viewMode === 'all-students') {
        setAllSections(cached.sections)
        if (cached.sections.length > 0) setSelectedSection(cached.sections[0].section_id)
      }
      return
    }
    
    setLoading(true)
    try {
      if (viewMode === 'my-students') {
        const res = await fetchWithAuth('/api/academics/my-students/')
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const cache: Record<number, Student[]> = {}
        const sections: SectionMeta[] = (data.results || []).map((r: any) => {
          const { meta, students } = parsePreloadedSection(r)
          cache[meta.section_id] = students
          return meta
        })
        setStudentsCache(prev => ({ ...prev, ...cache }))
        setMyStudentsSections(sections)
        if (sections.length > 0) setSelectedSection(sections[0].section_id)
        // Cache the data
        setCachedData(viewMode, { sections, studentsCache: cache })

      } else if (viewMode === 'my-mentees') {
        const res = await fetchWithAuth('/api/academics/mentor/my-mentees/')
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const cache: Record<number, Student[]> = {}
        const sections: SectionMeta[] = (data.results || []).map((r: any) => {
          const { meta, students } = parsePreloadedSection(r)
          cache[meta.section_id] = students
          return meta
        })
        setStudentsCache(prev => ({ ...prev, ...cache }))
        setMyMenteesSections(sections)
        if (sections.length > 0) setSelectedSection(sections[0].section_id)
        // Cache the data
        setCachedData(viewMode, { sections, studentsCache: cache })

      } else if (viewMode === 'department-students') {
        const res = await fetchWithAuth('/api/academics/department-students/')
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const sections: SectionMeta[] = (data.sections || []).map((s: any) => ({
          ...s,
          label: [s.department_short_name || s.department_code, s.batch_name, s.section_name].filter(Boolean).join(' · ')
        }))
        setDeptSections(sections)
        if (sections.length > 0) setSelectedSection(sections[0].section_id)
        // Cache the data
        setCachedData(viewMode, { sections })

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
        // Cache the data
        setCachedData(viewMode, { sections })
      }
    } catch (e) {
      console.error('fetchSectionsOrStudents error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchSectionStudents(sectionId: number, searchTerm: string = '') {
    // Check cache for this specific section
    const sectionCacheKey = `${CACHE_KEY}_section_${sectionId}_${viewMode}`
    try {
      const cached = sessionStorage.getItem(sectionCacheKey)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        const age = Date.now() - timestamp
        if (age <= CACHE_EXPIRY_MS) {
          console.log(`Loading section ${sectionId} students from cache`)
          setLazyStudents(data)
          return
        }
      }
    } catch {}

    const encodedSearch = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''
    const endpoint = viewMode === 'department-students'
      ? `/api/academics/department-students/?section_id=${sectionId}${encodedSearch}`
      : `/api/academics/all-students/?section_id=${sectionId}${encodedSearch}`
    setLoadingStudents(true)
    try {
      const res = await fetchWithAuth(endpoint)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const students = data.students || []
      setLazyStudents(students)
      // Cache the section students
      try {
        sessionStorage.setItem(sectionCacheKey, JSON.stringify({
          data: students,
          timestamp: Date.now()
        }))
      } catch {}
    } catch (e) {
      console.error('fetchSectionStudents error:', e)
      setLazyStudents([])
    } finally {
      setLoadingStudents(false)
    }
  }

  // Fetch students for multiple sections in parallel (used by all-students partial filter)
  async function fetchAllStudentsForSections(sectionIds: number[], searchTerm: string = '') {
    setLoadingStudents(true)
    setLazyStudents([])
    try {
      const encodedSearch = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''
      const results = await Promise.all(
        sectionIds.map(async sid => {
          const res = await fetchWithAuth(`/api/academics/all-students/?section_id=${sid}${encodedSearch}`)
          if (!res.ok) return [] as Student[]
          const data = await res.json()
          return (data.students || []) as Student[]
        })
      )
      setLazyStudents(results.flat())
    } catch (e) {
      console.error('fetchAllStudentsForSections error:', e)
      setLazyStudents([])
    } finally {
      setLoadingStudents(false)
    }
  }

  // Fetch students for multiple sections in parallel (used by department-students partial filter)
  async function fetchDeptStudentsForSections(sectionIds: number[], searchTerm: string = '') {
    setLoadingStudents(true)
    setLazyStudents([])
    try {
      const encodedSearch = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''
      const results = await Promise.all(
        sectionIds.map(async sid => {
          const res = await fetchWithAuth(`/api/academics/department-students/?section_id=${sid}${encodedSearch}`)
          if (!res.ok) return [] as Student[]
          const data = await res.json()
          return (data.students || []) as Student[]
        })
      )
      setLazyStudents(results.flat())
    } catch (e) {
      console.error('fetchDeptStudentsForSections error:', e)
      setLazyStudents([])
    } finally {
      setLoadingStudents(false)
    }
  }

  // Current section list and students
  const currentSectionList: SectionMeta[] =
    viewMode === 'my-students' ? myStudentsSections
    : viewMode === 'my-mentees' ? myMenteesSections
    : viewMode === 'department-students' ? deptSections
    : allSections
  const normalizedSearch = debouncedSearch.toLowerCase()
  const displayStudentsList: Student[] = [...lazyStudents]
    .filter(student => {
      if (!normalizedSearch) return true
      const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim().toLowerCase()
      const username = (student.username || '').toLowerCase()
      const regNo = (student.reg_no || '').toLowerCase()
      return regNo.includes(normalizedSearch) || fullName.includes(normalizedSearch) || username.includes(normalizedSearch)
    })
    .sort((a, b) => {
      const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase() || (a.username || '').toLowerCase()
      const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase() || (b.username || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })

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

  // Edit Modal Handlers
  const handleEdit = (student: Student) => {
    setSelectedStudent(student)
    setEditFormData({ ...student })
    setIsEditOpen(true)
  }

  const handleEditChange = (field: keyof Student, value: any) => {
    if (editFormData) {
      setEditFormData({
        ...editFormData,
        [field]: value
      })
    }
  }

  const handleSaveEdit = () => {
    if (!editFormData || !selectedStudent) return

    // Update in lazyStudents
    setLazyStudents(prev => 
      prev.map(s => s.id === editFormData.id ? editFormData : s)
    )

    // Update in studentsCache (for my-students and my-mentees modes)
    if (selectedSection && (viewMode === 'my-students' || viewMode === 'my-mentees')) {
      setStudentsCache(prev => ({
        ...prev,
        [selectedSection]: prev[selectedSection]?.map(s => 
          s.id === editFormData.id ? editFormData : s
        ) || []
      }))
    }

    setIsEditOpen(false)
    setSelectedStudent(null)
    setEditFormData(null)
  }

  const handleCloseEdit = () => {
    setIsEditOpen(false)
    setSelectedStudent(null)
    setEditFormData(null)
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => { clearCache(); fetchSectionsOrStudents() }}
              disabled={loading}
              title="Refresh — clears cached data and reloads sections"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
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
              {viewMode === 'my-students' && 'No students found in your advised sections.'}
              {viewMode === 'my-mentees' && 'No students assigned to you as mentor.'}
              {viewMode === 'department-students' && 'No students found in your department.'}
              {viewMode === 'all-students' && 'No students found in the system.'}
            </p>
          </div>
        </div>
      )}

      {/* Section Selection – only for my-students and my-mentees */}
      {hasContent && (viewMode === 'my-students' || viewMode === 'my-mentees') && (
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

      {hasContent && (viewMode === 'my-students' || viewMode === 'my-mentees') && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Search</label>
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Register Number or Student Name..."
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Department-Students dept + batch + section dropdowns */}
      {hasContent && viewMode === 'department-students' && (() => {
        const deptOptions = Array.from(new Set(
          deptSections.map(s => s.department_short_name || s.department_code || '').filter(Boolean)
        )).sort()
        const batchOptions = Array.from(new Set(
          deptSections.map(s => s.batch_name || '').filter(Boolean)
        )).sort()
        const sectionOptions = Array.from(new Set(
          deptSections.map(s => s.section_name).filter(Boolean)
        )).sort()
        return (
          <div className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex flex-wrap gap-4 items-end">
              {deptOptions.length > 1 && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Department</label>
                  <select
                    value={deptDeptFilter}
                    onChange={e => setDeptDeptFilter(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[160px]"
                  >
                    <option value="">-- All Departments --</option>
                    {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Batch</label>
                <select
                  value={deptBatchFilter}
                  onChange={e => setDeptBatchFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[140px]"
                >
                  <option value="">-- All Batches --</option>
                  {batchOptions.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Section</label>
                <select
                  value={deptSectionFilter}
                  onChange={e => setDeptSectionFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[120px]"
                >
                  <option value="">-- All Sections --</option>
                  {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 min-w-[260px] flex-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Search</label>
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Register Number or Student Name..."
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* All-Students independent dropdowns */}
      {hasContent && viewMode === 'all-students' && (() => {
        const deptOptions = Array.from(new Set(
          allSections.map(s => s.department_short_name || s.department_code || '').filter(Boolean)
        )).sort()
        const batchOptions = Array.from(new Set(
          allSections.map(s => s.batch_name || '').filter(Boolean)
        )).sort()
        const sectionOptions = Array.from(new Set(
          allSections.map(s => s.section_name).filter(Boolean)
        )).sort()
        return (
          <div className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Department</label>
                <select
                  value={allDeptFilter}
                  onChange={e => setAllDeptFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[160px]"
                >
                  <option value="">-- Select --</option>
                  {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Batch</label>
                <select
                  value={allBatchFilter}
                  onChange={e => setAllBatchFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[140px]"
                >
                  <option value="">-- Select --</option>
                  {batchOptions.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Section</label>
                <select
                  value={allSectionFilter}
                  onChange={e => setAllSectionFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[120px]"
                >
                  <option value="">-- Select --</option>
                  {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 min-w-[260px] flex-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Search</label>
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Register Number or Student Name..."
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Actions</th>
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
                    <td className="py-3 px-4">
                      <button 
                        onClick={() => handleEdit(student)}
                        className="p-2 bg-blue-50 text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Edit Student"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
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

      {/* Edit Student Modal */}
      {isEditOpen && editFormData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-4 flex items-center justify-between border-b">
              <div className="flex items-center gap-3">
                <Edit2 className="w-6 h-6" />
                <h2 className="text-xl font-bold">Edit Student Details</h2>
              </div>
              <button
                onClick={handleCloseEdit}
                className="p-1 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              {/* Registration No */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Registration No</label>
                  <input
                    type="text"
                    value={editFormData.reg_no || ''}
                    onChange={(e) => handleEditChange('reg_no', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900"
                  />
                </div>

                {/* Student Name */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Student Name</label>
                  <input
                    type="text"
                    value={editFormData.username || ''}
                    onChange={(e) => handleEditChange('username', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900"
                  />
                </div>
              </div>

              {/* Department */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Department</label>
                  <input
                    type="text"
                    value={editFormData.department_code || ''}
                    readOnly
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={editFormData.email || ''}
                    onChange={(e) => handleEditChange('email', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
                {isIQAC() ? (
                  <select
                    value={editFormData.status || 'active'}
                    onChange={(e) => handleEditChange('status', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="resigned">Resigned</option>
                    <option value="debar">Debar</option>
                    <option value="inactive">Inactive</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editFormData.status || 'active'}
                    readOnly
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed capitalize"
                  />
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={handleCloseEdit}
                className="px-5 py-2.5 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}