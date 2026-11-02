import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import fetchWithAuth from '../../services/fetchAuth'
import { Users, GraduationCap, Mail, Loader2, UserCircle2, ChevronLeft, ChevronRight, Building2, Globe, UserCheck, Heart, RefreshCw, Edit2, X, Search, Upload, Download, FileText, AlertCircle, CheckCircle2, CheckSquare, Camera, Image as ImageIcon, Phone, Bus, MapPin, ShieldCheck, Clock, Layers } from 'lucide-react'


// Cache key and expiry time (versioned to ensure fresh profile images are loaded)
const CACHE_KEY = 'students_page_cache_v4'
const CACHE_EXPIRY_MS = 1 * 60 * 1000

const BLOOD_GROUPS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
  'A1+', 'A1-', 'A2+', 'A2-', 'A1B+', 'A1B-', 'A2B+', 'A2B-',
  'Bombay Blood Group', 'Other'
] as const;

export function computeStudentCompletion(
  student: Student,
  completionConfig?: { fields_config?: Record<string, boolean> } | null,
  modesOfTransportation: Array<{ id: number; name: string }> = []
): number {
  const config = completionConfig?.fields_config || {
    father_name: true,
    mother_name: true,
    dob: true,
    blood_group: true,
    address_line1: true,
    address_line2: true,
    address_line3: false,
    district: true,
    pincode: true,
    father_mobile: true,
    mother_mobile: true,
    mode_of_transportation: true,
  };

  const motId = student.mode_of_transportation_id;
  const motName = modesOfTransportation.find(m => m.id === motId)?.name || student.mode_of_transportation || '';
  const isBus = motName.toLowerCase().includes('college bus') || motName.toLowerCase().includes('bus');

  const fieldValues: Record<string, any> = {
    father_name: student.father_name,
    mother_name: student.mother_name,
    dob: student.dob,
    blood_group: student.blood_group,
    address_line1: student.address_line1,
    address_line2: student.address_line2,
    address_line3: student.address_line3,
    district: student.district,
    pincode: student.pincode,
    father_mobile: student.father_mobile,
    mother_mobile: student.mother_mobile,
    mode_of_transportation: student.mode_of_transportation_id || student.mode_of_transportation,
    boarding_point: student.boarding_point,
  };

  const evaluatedKeys = Object.keys(config).filter((k) => config[k] === true);
  if (config.mode_of_transportation && isBus && !evaluatedKeys.includes('boarding_point')) {
    evaluatedKeys.push('boarding_point');
  }

  if (evaluatedKeys.length === 0) return 100;

  let completedCount = 0;
  evaluatedKeys.forEach((k) => {
    const val = fieldValues[k];
    if (val !== undefined && val !== null && String(val).trim().length > 0) {
      completedCount += 1;
    }
  });

  return Math.round((completedCount / evaluatedKeys.length) * 100);
}

type Student = {
  id: number;
  reg_no: string;
  name?: string;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  profile_image?: string | null;
  is_photo_verified?: boolean;
  section_id?: number;
  section_name?: string;
  department_code?: string;
  department_short_name?: string;
  department_name?: string;
  home_department_code?: string;
  home_department_short_name?: string;
  batch?: string;
  status?: string;
  mentor_id?: number;
  mentor_name?: string;
  is_shared_section?: boolean;
  mobile_number?: string;
  father_name?: string;
  mother_name?: string;
  dob?: string | null;
  dob_display?: string;
  blood_group?: string;
  address_line1?: string;
  address_line2?: string;
  address_line3?: string;
  district?: string;
  pincode?: string;
  father_mobile?: string;
  mother_mobile?: string;
  mode_of_transportation?: string;
  mode_of_transportation_id?: number | null;
  boarding_point?: string;
  dept_roll_no?: string;
  section_roll_no?: string;
  degree?: string;
  gender?: string;
  address_line4?: string;
}

type SectionMeta = {
  section_id: number
  section_name: string
  batch_name?: string
  department_code?: string
  department_short_name?: string
  department_name?: string
  is_shared_section?: boolean
  label: string  // formatted display label
}

type ViewMode = 'my-students' | 'my-mentees' | 'department-students' | 'all-students' | 'profile-photos'

interface StudentsPageProps {
  user?: any;
}

export default function StudentsPage({ user }: StudentsPageProps = {}) {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<ViewMode>('my-students')
  // section list + lazy-loaded students per selected section
  const [myStudentsSections, setMyStudentsSections] = useState<SectionMeta[]>([])
  const [myMenteesSections, setMyMenteesSections] = useState<SectionMeta[]>([])
  const [deptSections, setDeptSections] = useState<SectionMeta[]>([])
  const [allSections, setAllSections] = useState<SectionMeta[]>([])
  // Refs so filter effects can always read the latest sections without extra deps
  const allSectionsRef = useRef<SectionMeta[]>([])
  const deptSectionsRef = useRef<SectionMeta[]>([])
  allSectionsRef.current = allSections
  deptSectionsRef.current = deptSections
  // All departments list (fetched separately for dropdown)
  const [allDepartments, setAllDepartments] = useState<Array<{ id: number; code: string; short_name: string; name: string }>>([])
  // All batch list (fetched separately for dropdown, per-department active status)
  const [allBatches, setAllBatches] = useState<Array<{ id: number; name: string; department_code?: string; department_short_name?: string; is_active: boolean }>>([])
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
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [togglingVerifyId, setTogglingVerifyId] = useState<number | null>(null)
  const [modesOfTransportation, setModesOfTransportation] = useState<Array<{ id: number; name: string }>>([])
  const [completionConfig, setCompletionConfig] = useState<{
    is_overall_compulsory: boolean;
    fields_config: Record<string, boolean>;
  } | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  // Import modal state
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{
    message: string
    created: number
    updated: number
    errors: string[]
    total_errors: number
    warnings?: string[]
    total_warnings?: number
    duplicate_reg_count?: number
    duplicate_reg_rows?: string[]
    used_dept_roll_as_reg_no?: boolean
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [useDeptRollAsRegNo, setUseDeptRollAsRegNo] = useState(false)

  // New batch modal state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [batchResult, setBatchResult] = useState<any>(null)
  const [batchForm, setBatchForm] = useState({
    name: '2026',
    department: '',
    start_year: '2026',
    end_year: '2030',
    sections: 'A,B,C,D,E,F,G,H,I,J,K,L',
  })

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
      key: 'profile-photos' as ViewMode,
      label: 'Profile Photos',
      icon: Camera,
      permission: 'academics.view_my_students',
      description: 'Manage and upload profile photos for your students',
      // Available to advisors and staff with student view permissions
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

  // Fetch all departments for dropdown filters
  async function fetchAllDepartments() {
    try {
      const res = await fetchWithAuth('/api/academics/departments/')
      if (!res.ok) throw new Error('Failed to fetch departments')
      const data = await res.json()
      setAllDepartments(data.results || [])
    } catch (e) {
      console.error('fetchAllDepartments error:', e)
    }
  }

  // Fetch all batches for dropdown filters (per-department active status)
  async function fetchAllBatches() {
    try {
      const res = await fetchWithAuth('/api/academics/batches/')
      if (!res.ok) throw new Error('Failed to fetch batches')
      const data = await res.json()
      setAllBatches(data.results || data || [])
    } catch (e) {
      console.error('fetchAllBatches error:', e)
    }
  }

  // Fetch modes of transportation for profile editing
  async function fetchModesOfTransportation() {
    try {
      const res = await fetchWithAuth('/api/academics/modes-of-transportation/')
      if (res.ok) {
        const data = await res.json()
        setModesOfTransportation(data.results || data || [])
      }
    } catch (e) {
      console.error('fetchModesOfTransportation error:', e)
    }
  }

  // Fetch student profile completion configuration
  async function fetchCompletionConfig() {
    try {
      const res = await fetchWithAuth('/api/academics/student-profile/completion-config/')
      if (res.ok) {
        const data = await res.json()
        if (data) setCompletionConfig(data)
      }
    } catch (e) {
      console.error('fetchCompletionConfig error:', e)
    }
  }

  // Fetch departments, batch years, modes of transportation and completion config once on mount
  useEffect(() => {
    fetchAllDepartments()
    fetchAllBatches()
    fetchModesOfTransportation()
    fetchCompletionConfig()
  }, [])

  // Check for departments/batches refresh signal from other pages (e.g., StaffsPage)
  useEffect(() => {
    const checkRefreshSignal = () => {
      const signal = sessionStorage.getItem('students_departments_refresh')
      if (signal) {
        const signalTime = parseInt(signal, 10)
        const now = Date.now()
        // If signal is less than 5 seconds old, refresh departments and batches
        if (now - signalTime < 5000) {
          console.log('Refresh signal detected, reloading departments and batches...')
          fetchAllDepartments()
          fetchAllBatches()
        }
        // Clear the signal after checking
        sessionStorage.removeItem('students_departments_refresh')
      }
    }

    // Check on mount and when window gains focus
    checkRefreshSignal()
    window.addEventListener('focus', checkRefreshSignal)
    return () => window.removeEventListener('focus', checkRefreshSignal)
  }, [])

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
    fetchSectionsOrStudents(true)  // Bypass cache when switching views
  }, [viewMode])

  useEffect(() => {
    if (selectedSection === null) return
    if (viewMode === 'my-students' || viewMode === 'profile-photos' || viewMode === 'my-mentees') {
      // Data is pre-loaded – pull from cache, no extra API call
      setLazyStudents(studentsCache[selectedSection] || [])
    } else {
      fetchSectionStudents(selectedSection, debouncedSearch)
    }
  }, [selectedSection, viewMode, studentsCache, debouncedSearch])

  // Reset to page 1 when section changes
  useEffect(() => { setCurrentPage(1) }, [selectedSection])
  useEffect(() => { setCurrentPage(1) }, [debouncedSearch])

  // Auto-load all students when sections arrive; reset filters
  useEffect(() => {
    if (viewMode === 'all-students') {
      setAllDeptFilter('')
      setAllBatchFilter('')
      setAllSectionFilter('')
      setSelectedSection(null)
      if (allSections.length > 0) {
        fetchAllStudentsForSections(allSections.map(s => s.section_id))
      } else {
        setLazyStudents([])
      }
    }
  }, [allSections.length])

  // Auto-load dept students when sections arrive; reset filters
  useEffect(() => {
    if (viewMode === 'department-students') {
      setDeptDeptFilter('')
      setDeptBatchFilter('')
      setDeptSectionFilter('')
      setSelectedSection(null)
      if (deptSections.length > 0) {
        fetchDeptStudentsForSections(deptSections.map(s => s.section_id))
      } else {
        setLazyStudents([])
      }
    }
  }, [deptSections.length])

  // Resolve + fetch for dept-students when any dept/batch/section filter changes
  useEffect(() => {
    if (viewMode !== 'department-students') return
    if (!deptDeptFilter && !deptBatchFilter && !deptSectionFilter && !debouncedSearch) {
      setSelectedSection(null)
      const secs = deptSectionsRef.current
      if (secs.length > 0) {
        fetchDeptStudentsForSections(secs.map(s => s.section_id))
      } else {
        setLazyStudents([])
      }
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
      const secs = allSectionsRef.current
      if (secs.length > 0) {
        fetchAllStudentsForSections(secs.map(s => s.section_id))
      } else {
        setLazyStudents([])
      }
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
      name: s.name,
      username: s.username || s.user?.username,
      first_name: s.first_name ?? s.user?.first_name,
      last_name: s.last_name ?? s.user?.last_name,
      email: s.email ?? s.user?.email,
      profile_image: s.profile_image || s.user?.profile_image || null,
      section_id: r.section_id,
      section_name: r.section_name,
      department_code: r.department?.code || r.department_short_name,
      department_short_name: r.department_short_name || r.department?.short_name || r.department?.code,
      status: s.status || 'active',
      is_photo_verified: Boolean(s.is_photo_verified),
      mobile_number: s.mobile_number || '',
      father_name: s.father_name || '',
      mother_name: s.mother_name || '',
      dob: s.dob || null,
      dob_display: s.dob_display || '',
      blood_group: s.blood_group || '',
      address_line1: s.address_line1 || '',
      address_line2: s.address_line2 || '',
      address_line3: s.address_line3 || '',
      district: s.district || '',
      pincode: s.pincode || '',
      father_mobile: s.father_mobile || '',
      mother_mobile: s.mother_mobile || '',
      mode_of_transportation: s.mode_of_transportation || '',
      mode_of_transportation_id: s.mode_of_transportation_id ?? null,
      boarding_point: s.boarding_point || '',
    }))
    return { meta, students }
  }

  // Fetch section list; then lazy-load students per selected section
  async function fetchSectionsOrStudents(bypassCache: boolean = false) {
    // Don't call the API if the current view isn't available to this user
    if (availableViews.length === 0 || !availableViews.find(v => v.key === viewMode)) return

    // Check cache first (unless bypass requested)
    if (!bypassCache) {
      const cached = getCachedData(viewMode)
      if (cached) {
        console.log(`Loading ${viewMode} from cache`)
        if (viewMode === 'my-students' || viewMode === 'profile-photos') {
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
    }

    setLoading(true)
    try {
      if (viewMode === 'my-students' || viewMode === 'profile-photos') {
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
          label: [
            s.is_shared_section ? `${s.department_short_name || s.department_code} (Y1)` : (s.department_short_name || s.department_code),
            s.batch_name,
            s.section_name
          ].filter(Boolean).join(' · ')
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
      const students = (data.students || []).map((s: any) => ({
        ...s,
        profile_image: s.profile_image || s.user?.profile_image || null,
      }))
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
          return (data.students || []).map((s: any) => ({
            ...s,
            profile_image: s.profile_image || s.user?.profile_image || null,
          })) as Student[]
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
          return (data.students || []).map((s: any) => ({
            ...s,
            profile_image: s.profile_image || s.user?.profile_image || null,
          })) as Student[]
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
    viewMode === 'my-students' || viewMode === 'profile-photos' ? myStudentsSections
    : viewMode === 'my-mentees' ? myMenteesSections
    : viewMode === 'department-students' ? deptSections
    : allSections

  const sectionMetaById = new Map<number, SectionMeta>(
    currentSectionList.map(section => [section.section_id, section])
  )

  const editSectionOptions: SectionMeta[] = Array.from(
    [...myStudentsSections, ...myMenteesSections, ...deptSections, ...allSections].reduce((map, section) => {
      map.set(section.section_id, section)
      return map
    }, new Map<number, SectionMeta>()).values()
  ).sort((a, b) => (a.label || '').localeCompare(b.label || ''))

  const getRegNoLastThreeNumber = (regNo?: string): number => {
    if (!regNo) return Number.MAX_SAFE_INTEGER
    const digitsOnly = regNo.replace(/\D/g, '')
    if (!digitsOnly) return Number.MAX_SAFE_INTEGER
    const lastThree = digitsOnly.slice(-3)
    return Number(lastThree)
  }

  const getBatchOrderValue = (batch?: string): number => {
    if (!batch) return -1
    const match = batch.match(/\d{4}/)
    return match ? Number(match[0]) : -1
  }

  const compareByRegNoLastThree = (a: Student, b: Student): number => {
    const regA = getRegNoLastThreeNumber(a.reg_no)
    const regB = getRegNoLastThreeNumber(b.reg_no)
    if (regA !== regB) return regA - regB
    return (a.reg_no || '').localeCompare(b.reg_no || '')
  }

  const compareByDepartmentThenBatchThenRegNoLastThree = (a: Student, b: Student): number => {
    const deptDiff = getStudentDepartment(a).localeCompare(getStudentDepartment(b))
    if (deptDiff !== 0) return deptDiff
    const batchA = getStudentBatch(a)
    const batchB = getStudentBatch(b)
    const batchDiff = getBatchOrderValue(batchB) - getBatchOrderValue(batchA)
    if (batchDiff !== 0) return batchDiff
    const batchNameDiff = batchB.localeCompare(batchA)
    if (batchNameDiff !== 0) return batchNameDiff
    return compareByRegNoLastThree(a, b)
  }

  const getStudentBatch = (student: Student): string => {
    if (student.batch) return student.batch
    const sectionMeta = student.section_id ? sectionMetaById.get(student.section_id) : undefined
    return sectionMeta?.batch_name || ''
  }

  const getStudentDepartment = (student: Student): string => {
    if (student.home_department_short_name) return student.home_department_short_name
    if (student.department_short_name) return student.department_short_name
    const sectionMeta = student.section_id ? sectionMetaById.get(student.section_id) : undefined
    if (sectionMeta?.department_short_name) return sectionMeta.department_short_name
    if (student.department_code) return student.department_code
    return sectionMeta?.department_code || ''
  }

  const compareStudentsByViewMode = (a: Student, b: Student): number => {
    if (viewMode === 'my-students' || viewMode === 'profile-photos') {
      return compareByRegNoLastThree(a, b)
    }

    if (viewMode === 'department-students') {
      return compareByDepartmentThenBatchThenRegNoLastThree(a, b)
    }

    if (viewMode === 'all-students') {
      return compareByDepartmentThenBatchThenRegNoLastThree(a, b)
    }

    // Keep existing behavior for views not explicitly requested (e.g., my-mentees).
    const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase() || (a.username || '').toLowerCase()
    const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase() || (b.username || '').toLowerCase()
    return nameA.localeCompare(nameB)
  }

  const [uploadingStudentId, setUploadingStudentId] = useState<number | null>(null)

  const handleUploadPhoto = async (studentId: number, file: File) => {
    if (!file) return
    // Validate image format
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, JPEG, WEBP).')
      return
    }
    // Limit to 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit.')
      return
    }

    setUploadingStudentId(studentId)
    try {
      const formData = new FormData()
      formData.append('profile_image', file)

      const res = await fetchWithAuth(`/api/academics/students/${studentId}/`, {
        method: 'PATCH',
        body: formData,
      })

      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        alert(data?.error || data?.detail || 'Failed to upload profile photo')
        return
      }

      const newImageUrl = data.profile_image

      // Update in lazyStudents
      setLazyStudents(prev =>
        prev.map(s => (s.id === studentId ? { ...s, profile_image: newImageUrl } : s))
      )

      // Update in studentsCache
      setStudentsCache(prev => {
        const next: Record<number, Student[]> = { ...prev }
        Object.keys(next).forEach(key => {
          const sid = Number(key)
          if (next[sid]) {
            next[sid] = next[sid].map(s => (s.id === studentId ? { ...s, profile_image: newImageUrl } : s))
          }
        })
        return next
      })

      // Update in edit form if open
      if (editFormData && editFormData.id === studentId) {
        setEditFormData(prev => (prev ? { ...prev, profile_image: newImageUrl } : prev))
      }
    } catch (e) {
      console.error('Failed to upload profile image:', e)
      alert('An error occurred while uploading profile photo')
    } finally {
      setUploadingStudentId(null)
    }
  }

  const normalizedSearch = debouncedSearch.toLowerCase()
  const displayStudentsList: Student[] = [...lazyStudents]
    .filter(student => {
      if (!normalizedSearch) return true
      const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim().toLowerCase()
      const username = (student.username || '').toLowerCase()
      const regNo = (student.reg_no || '').toLowerCase()
      return regNo.includes(normalizedSearch) || fullName.includes(normalizedSearch) || username.includes(normalizedSearch)
    })
    .sort(compareStudentsByViewMode)

  // Photo Analytics for Profile Photos Tab
  const photoAnalytics = useMemo(() => {
    const total = displayStudentsList.length
    const uploaded = displayStudentsList.filter(s => Boolean(s.profile_image)).length
    const verified = displayStudentsList.filter(s => Boolean(s.is_photo_verified)).length
    const notUploaded = total - uploaded
    const uploadedPct = total > 0 ? Math.round((uploaded / total) * 100) : 0
    const verifiedPct = total > 0 ? Math.round((verified / total) * 100) : 0
    return { total, uploaded, verified, notUploaded, uploadedPct, verifiedPct }
  }, [displayStudentsList])

  // Profile Completion Analytics for Student Data Tab
  const completionAnalytics = useMemo(() => {
    const total = displayStudentsList.length
    let completed100 = 0
    let inProgress = 0

    displayStudentsList.forEach((s) => {
      const pct = computeStudentCompletion(s, completionConfig, modesOfTransportation)
      if (pct === 100) {
        completed100 += 1
      } else {
        inProgress += 1
      }
    })

    const completedPct = total > 0 ? Math.round((completed100 / total) * 100) : 0
    const inProgressPct = total > 0 ? Math.max(0, 100 - completedPct) : 0

    return { total, completed100, inProgress, completedPct, inProgressPct }
  }, [displayStudentsList, completionConfig, modesOfTransportation])

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
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1)

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

  // Photo Verification Handler
  const handleToggleVerify = async (studentId: number, currentVerified: boolean) => {
    if (togglingVerifyId === studentId) return
    setTogglingVerifyId(studentId)
    const newVerified = !currentVerified
    try {
      const res = await fetchWithAuth(`/api/academics/students/${studentId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_photo_verified: newVerified }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        alert(data?.error || data?.detail || 'Failed to update photo verification')
        return
      }

      if (editFormData && editFormData.id === studentId) {
        setEditFormData(prev => prev ? { ...prev, is_photo_verified: newVerified } : null)
      }
      if (selectedStudent && selectedStudent.id === studentId) {
        setSelectedStudent(prev => prev ? { ...prev, is_photo_verified: newVerified } : null)
      }

      setLazyStudents(prev => prev.map(s => s.id === studentId ? { ...s, is_photo_verified: newVerified } : s))
      setStudentsCache(prev => {
        const next: Record<number, Student[]> = { ...prev }
        Object.keys(next).forEach((key) => {
          const sid = Number(key)
          next[sid] = (next[sid] || []).map(s => s.id === studentId ? { ...s, is_photo_verified: newVerified } : s)
        })
        return next
      })
    } catch (err) {
      console.error('Error toggling photo verify:', err)
      alert('Failed to update photo verification')
    } finally {
      setTogglingVerifyId(null)
    }
  }

  // Edit Modal Handlers
  const handleEdit = async (student: Student) => {
    setSelectedStudent(student)
    setEditFormData({ ...student })
    setIsEditOpen(true)

    // Fetch complete fresh student profile details from backend
    try {
      const res = await fetchWithAuth(`/api/academics/students/${student.id}/`)
      if (res.ok) {
        const freshData = await res.json()
        setEditFormData(prev => {
          if (!prev || prev.id !== student.id) return prev
          return { ...prev, ...freshData }
        })
        setSelectedStudent(prev => {
          if (!prev || prev.id !== student.id) return prev
          return { ...prev, ...freshData }
        })
      }
    } catch (err) {
      console.warn('Failed to load fresh student data for edit:', err)
    }
  }

  const handleEditChange = (field: keyof Student, value: any) => {
    if (editFormData) {
      setEditFormData({
        ...editFormData,
        [field]: value
      })
    }
  }

  const handleSaveEdit = async () => {
    if (!editFormData || !selectedStudent || isSavingEdit) return

    setIsSavingEdit(true)
    try {
      const payload = {
        username: editFormData.username,
        email: editFormData.email || '',
        status: (editFormData.status || 'active').toUpperCase(),
        section_id: editFormData.section_id ?? null,
        mobile_number: editFormData.mobile_number || '',
        father_name: editFormData.father_name || '',
        mother_name: editFormData.mother_name || '',
        dob: editFormData.dob || null,
        blood_group: editFormData.blood_group || '',
        father_mobile: editFormData.father_mobile || '',
        mother_mobile: editFormData.mother_mobile || '',
        address_line1: editFormData.address_line1 || '',
        address_line2: editFormData.address_line2 || '',
        address_line3: editFormData.address_line3 || '',
        address_line4: editFormData.address_line4 || '',
        district: editFormData.district || '',
        pincode: editFormData.pincode || '',
        mode_of_transportation_id: editFormData.mode_of_transportation_id ?? null,
        boarding_point: editFormData.boarding_point || '',
        dept_roll_no: editFormData.dept_roll_no || '',
        section_roll_no: editFormData.section_roll_no || '',
        degree: editFormData.degree || '',
        gender: editFormData.gender || '',
        is_photo_verified: Boolean(editFormData.is_photo_verified),
      }

      const res = await fetchWithAuth(`/api/academics/students/${editFormData.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        alert(data?.error || data?.detail || 'Failed to update student')
        return
      }

      const updatedStudent: Student = {
        ...editFormData,
        ...data,
      }

      setLazyStudents(prev => {
        const replaced = prev.map(s => (s.id === updatedStudent.id ? { ...s, ...updatedStudent } : s))
        if (selectedSection && updatedStudent.section_id && selectedSection !== updatedStudent.section_id) {
          return replaced.filter(s => s.id !== updatedStudent.id)
        }
        return replaced
      })

      setStudentsCache(prev => {
        const next: Record<number, Student[]> = { ...prev }
        Object.keys(next).forEach((key) => {
          const sid = Number(key)
          const list = next[sid] || []
          const without = list.filter(s => s.id !== updatedStudent.id)
          if (updatedStudent.section_id && sid === updatedStudent.section_id) {
            next[sid] = [...without, { ...updatedStudent }]
          } else {
            next[sid] = without
          }
        })
        return next
      })

      setIsEditOpen(false)
      setSelectedStudent(null)
      setEditFormData(null)
    } catch (error) {
      console.error('Failed to update student', error)
      alert('Failed to update student')
    } finally {
      setIsSavingEdit(false)
    }
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
  // ── Import handlers ─────────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    try {
      const res = await fetchWithAuth('/api/academics/students/import/template/')
      if (!res.ok) throw new Error('Failed to download template')
      const blob = await res.blob()
      const url = URL.createObjectURL(
        new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      )
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = 'students_import_template.xlsx'
      document.body.appendChild(a)
      a.click()
      // Delay revoke to ensure the browser has time to initiate the download
      window.setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 30000)
    } catch (e) {
      alert('Failed to download template. Please try again.')
    }
  }

  const handleImport = async () => {
    if (!importFile) return
    setImportLoading(true)
    setImportResult(null)
    setImportError(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('use_dept_roll_as_reg_no', useDeptRollAsRegNo ? 'true' : 'false')
      const res = await fetchWithAuth('/api/academics/students/import/', {
        method: 'POST',
        body: formData,
      })

      let data: any = null
      let fallbackText = ''
      const contentType = (res.headers.get('content-type') || '').toLowerCase()
      if (contentType.includes('application/json')) {
        try {
          data = await res.json()
        } catch {
          data = null
        }
      } else {
        try {
          fallbackText = (await res.text()).trim()
        } catch {
          fallbackText = ''
        }
      }

      if (!res.ok) {
        if (res.status === 504) {
          setImportError('Import timed out (504). The file may be too large for current server timeout. Try fewer rows per file, or ask admin to increase API/Gunicorn timeout.')
        } else {
          const serverMessage =
            data?.error ||
            data?.detail ||
            (typeof data?.message === 'string' ? data.message : '') ||
            (fallbackText && !fallbackText.startsWith('<!DOCTYPE') ? fallbackText : '')
          setImportError(serverMessage || `Import failed with status ${res.status}.`)
        }
      } else {
        setImportResult(data || {
          message: 'Import completed.',
          created: 0,
          updated: 0,
          errors: [],
          total_errors: 0,
        })
        // Refresh students list
        clearCache()
        fetchSectionsOrStudents(true)  // Bypass cache after import
      }
    } catch (e) {
      setImportError('An error occurred while importing. Please try again.')
    } finally {
      setImportLoading(false)
    }
  }

  const handleCloseImport = () => {
    setIsImportOpen(false)
    setImportFile(null)
    setImportResult(null)
    setImportError(null)
    setUseDeptRollAsRegNo(false)
  }

  const openBatchModal = () => {
    const shDept = allDepartments.find(d => {
      const label = `${d.short_name || ''} ${d.code || ''}`.toUpperCase()
      return label.includes('S&H') || label.includes('S & H')
    })
    setBatchForm(current => ({
      ...current,
      department: shDept ? String(shDept.id) : current.department,
    }))
    setBatchError(null)
    setBatchResult(null)
    setIsBatchModalOpen(true)
  }

  const handleCreateBatch = async () => {
    setBatchError(null)
    setBatchResult(null)
    if (!batchForm.name.trim()) {
      setBatchError('Batch name is required.')
      return
    }
    if (!batchForm.department) {
      setBatchError('Select the department that manages this batch (S&H for year-1).')
      return
    }
    setBatchSaving(true)
    try {
      const sections = batchForm.sections
        .split(',')
        .map(section => section.trim().toUpperCase())
        .filter(Boolean)
      const response = await fetchWithAuth('/api/academics/batches/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batchForm.name.trim(),
          department: Number(batchForm.department),
          start_year: batchForm.start_year ? Number(batchForm.start_year) : null,
          end_year: batchForm.end_year ? Number(batchForm.end_year) : null,
          sections,
          is_active: true,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          data?.detail ||
          data?.error ||
          (data && typeof data === 'object' ? JSON.stringify(data) : '') ||
          `Failed to create batch (${response.status}).`,
        )
      }
      setBatchResult(data)
      await fetchAllBatches()
      await fetchSectionsOrStudents(true)
    } catch (error: any) {
      setBatchError(error?.message || 'Failed to create the batch.')
    } finally {
      setBatchSaving(false)
    }
  }

  const canImport = hasPermission('students.bulk_import')

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
            {(isIqacRole || hasRole('ADMIN') || hasRole('admin') || user?.is_superuser || isHodRole || hasPermission('students.view_all_students')) && (
              <button
                onClick={() => navigate('/iqac/students/completion')}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shadow-sm"
                title="Configure student profile completion settings"
              >
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <span className="hidden sm:inline">Completion</span>
              </button>
            )}
            {canImport && (
              <button
                onClick={openBatchModal}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                title="Create a new batch and its sections"
              >
                <Layers className="w-4 h-4" />
                <span className="hidden sm:inline">New Batch</span>
              </button>
            )}
            {canImport && (
              <button
                onClick={() => setIsImportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                title="Import students from Excel or CSV"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
              </button>
            )}
            <button
              onClick={() => { clearCache(); fetchSectionsOrStudents(true) }}  // Bypass cache on manual refresh
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

      {/* Section Selection – for my-students, profile-photos, and my-mentees */}
      {hasContent && (viewMode === 'my-students' || viewMode === 'profile-photos' || viewMode === 'my-mentees') && (
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

      {hasContent && (viewMode === 'my-students' || viewMode === 'profile-photos' || viewMode === 'my-mentees') && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Search</label>
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Register Number or Username..."
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Department-Students dept + batch + section dropdowns */}
      {hasContent && viewMode === 'department-students' && (() => {
        // Derive dept options only from the sections the user actually has access to
        const deptOptions = Array.from(new Set(
          deptSections.map(s => s.department_short_name || s.department_code || '').filter(Boolean)
        )).sort()
        // Batch options: filter by selected dept, use allBatches scoped to accessible dept codes
        const batchOptions = (() => {
          const accessibleDeptCodes = new Set(
            deptSections.map(s => s.department_short_name || s.department_code || '').filter(Boolean)
          )
          const scopedBatches = allBatches.filter(b =>
            accessibleDeptCodes.has((b.department_short_name || b.department_code) || '')
          )
          const deptFiltered = deptDeptFilter
            ? scopedBatches.filter(b => (b.department_short_name || b.department_code) === deptDeptFilter)
            : scopedBatches
          const map = new Map<string, { name: string; is_active: boolean }>()
          for (const b of deptFiltered) {
            if (!b.name) continue
            const existing = map.get(b.name)
            if (!existing || (!b.is_active && existing.is_active)) map.set(b.name, { name: b.name, is_active: b.is_active })
          }
          return Array.from(map.values()).sort((a, b) => b.name.localeCompare(a.name))
        })()
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
                  {batchOptions.map(b => (
                    <option key={b.name} value={b.name}>
                      {b.name}{b.is_active === false ? ' (Inactive)' : ' ✓'}
                    </option>
                  ))}
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
                    placeholder="Search by Register Number or Username..."
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
        // Use all departments for dropdown (not just those with sections)
        const deptOptions = allDepartments
          .map(d => d.short_name || d.code || '')
          .filter(Boolean)
          .sort()
        // Use all batch years for dropdown (not just those with sections)
        const batchOptions = (() => {
          const deptFiltered = allDeptFilter
            ? allBatches.filter(b => (b.department_short_name || b.department_code) === allDeptFilter)
            : allBatches
          const map = new Map<string, { name: string; is_active: boolean }>()
          for (const b of deptFiltered) {
            if (!b.name) continue
            const existing = map.get(b.name)
            if (!existing || (!b.is_active && existing.is_active)) map.set(b.name, { name: b.name, is_active: b.is_active })
          }
          return Array.from(map.values()).sort((a, b) => b.name.localeCompare(a.name))
        })()
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
                  {batchOptions.map(b => (
                    <option key={b.name} value={b.name}>
                      {b.name}{b.is_active === false ? ' (Inactive)' : ' ✓'}
                    </option>
                  ))}
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
                    placeholder="Search by Register Number or Username..."
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

      {/* Profile Photos Table - Full scrollable view without pagination */}
      {!loadingStudents && displayStudentsList.length > 0 && viewMode === 'profile-photos' && (
        <div className="space-y-4">
          {/* Photo Analytics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Students</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{photoAnalytics.total}</p>
                <p className="text-xs text-slate-400 mt-0.5">Total in selected view</p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <Camera className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Photos Uploaded</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className="text-2xl font-bold text-slate-900">{photoAnalytics.uploaded}</p>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {photoAnalytics.uploadedPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-200">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${photoAnalytics.uploadedPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Photos Verified</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className="text-2xl font-bold text-slate-900">{photoAnalytics.verified}</p>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    {photoAnalytics.verifiedPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-200">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${photoAnalytics.verifiedPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">
                Total Students: <span className="text-indigo-600 font-bold">{displayStudentsList.length}</span>
              </div>
              <div className="text-xs text-slate-500">
                Click photo or upload button to add/edit student profile image
              </div>
            </div>
          <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="bg-gradient-to-r from-slate-100 to-indigo-50 border-b-2 border-slate-200">
                  <th className="text-left py-3.5 px-5 text-sm font-semibold text-indigo-900 w-16 bg-slate-100">S.No</th>
                  <th className="text-left py-3.5 px-5 text-sm font-semibold text-indigo-900 bg-slate-100">Registration No</th>
                  <th className="text-left py-3.5 px-5 text-sm font-semibold text-indigo-900 bg-slate-100">Student Name</th>
                  <th className="text-left py-3.5 px-5 text-sm font-semibold text-indigo-900 bg-slate-100">Department / Section</th>
                  <th className="text-left py-3.5 px-5 text-sm font-semibold text-indigo-900 bg-slate-100">Status</th>
                  <th className="text-right py-3.5 px-6 text-sm font-semibold text-indigo-900 bg-slate-100">Profile Photo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayStudentsList.map((student, index) => {
                  const isCurrentUploading = uploadingStudentId === student.id
                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-blue-50/60 transition-colors"
                    >
                      <td className="py-6 px-5 align-middle">
                        <span className="text-sm font-medium text-slate-600">{index + 1}</span>
                      </td>
                      <td className="py-6 px-5 align-middle">
                        <span className="text-base font-bold text-slate-900 tracking-wide">{student.reg_no}</span>
                      </td>
                      <td className="py-6 px-5 align-middle">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-900">
                            {student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.username}
                          </span>
                          <span className="text-xs text-slate-500">
                            @{student.username}
                          </span>
                        </div>
                      </td>
                      <td className="py-6 px-5 align-middle">
                        {(() => {
                          const displayDept = getStudentDepartment(student)
                          const secName = student.section_name || (student.section_id ? sectionMetaById.get(student.section_id)?.section_name : '')
                          return (
                            <span className="text-sm font-medium text-slate-700">
                              {displayDept || '-'} {secName ? `· ${secName}` : ''}
                              {student.is_shared_section && <span className="ml-1 text-xs text-amber-600 font-medium">(Y1)</span>}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="py-6 px-5 align-middle">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          student.status === 'active'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : student.status === 'resigned'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : student.status === 'debar'
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                            : 'bg-gray-100 text-gray-800 border border-gray-200'
                        }`}>
                          {student.status || 'active'}
                        </span>
                      </td>
                      <td className="py-6 px-6 text-right align-middle">
                        <div className="flex items-center justify-end gap-3.5">
                          {student.profile_image ? (
                            <>
                              <label
                                title="Click photo to change"
                                className={`group relative inline-block cursor-pointer ${
                                  isCurrentUploading ? 'opacity-60 cursor-not-allowed' : ''
                                }`}
                              >
                                <img
                                  src={student.profile_image}
                                  alt={student.username || student.reg_no}
                                  className="w-[84px] h-[108px] rounded-lg object-cover border-2 border-indigo-200 group-hover:border-indigo-500 shadow-md group-hover:shadow-lg transition-all bg-slate-50"
                                />
                                {student.is_photo_verified && (
                                  <div
                                    title="Profile Photo Verified"
                                    className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-emerald-500 text-white rounded-full border-2 border-white shadow-md flex items-center justify-center"
                                  >
                                    <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white" />
                                  </div>
                                )}
                                {isCurrentUploading && (
                                  <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center text-white">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                  </div>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={isCurrentUploading}
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                      handleUploadPhoto(student.id, file)
                                    }
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => handleToggleVerify(student.id, Boolean(student.is_photo_verified))}
                                disabled={togglingVerifyId === student.id}
                                title={student.is_photo_verified ? "Photo Verified (Click to unverify)" : "Click to verify student photo"}
                                className={`p-2.5 rounded-xl transition-all border shadow-sm inline-flex items-center justify-center ${
                                  student.is_photo_verified
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                    : 'bg-slate-100 text-slate-500 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 border-slate-200'
                                }`}
                              >
                                {togglingVerifyId === student.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                ) : (
                                  <CheckCircle2 className={`w-4 h-4 ${student.is_photo_verified ? 'text-emerald-600' : ''}`} />
                                )}
                              </button>
                              <label
                                title="Edit profile photo"
                                className={`p-2.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl transition-all border border-slate-200 hover:border-indigo-300 shadow-sm cursor-pointer inline-flex items-center justify-center ${
                                  isCurrentUploading ? 'opacity-60 cursor-not-allowed' : ''
                                }`}
                              >
                                {isCurrentUploading ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                ) : (
                                  <Edit2 className="w-4 h-4" />
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={isCurrentUploading}
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                      handleUploadPhoto(student.id, file)
                                    }
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                            </>
                          ) : (
                            <>
                              <label
                                title="Click to upload passport size photo"
                                className={`w-[84px] h-[108px] rounded-lg border-2 border-dashed border-indigo-300 hover:border-indigo-600 bg-indigo-50/50 hover:bg-indigo-100/60 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm group ${
                                  isCurrentUploading ? 'opacity-70 cursor-not-allowed' : ''
                                }`}
                              >
                                {isCurrentUploading ? (
                                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                                ) : (
                                  <Upload className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition-transform" />
                                )}
                                <span className="text-[11px] font-semibold text-indigo-700 text-center leading-tight">
                                  {isCurrentUploading ? 'Uploading' : 'Upload Photo'}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={isCurrentUploading}
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                      handleUploadPhoto(student.id, file)
                                    }
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                              <label
                                title="Upload / Edit profile photo"
                                className={`p-2.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl transition-all border border-slate-200 hover:border-indigo-300 shadow-sm cursor-pointer inline-flex items-center justify-center ${
                                  isCurrentUploading ? 'opacity-60 cursor-not-allowed' : ''
                                }`}
                              >
                                {isCurrentUploading ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                ) : (
                                  <Edit2 className="w-4 h-4" />
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={isCurrentUploading}
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                      handleUploadPhoto(student.id, file)
                                    }
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Regular Students Table */}
      {!loadingStudents && displayStudents.length > 0 && viewMode !== 'profile-photos' && (
        <div className="space-y-4">
          {/* Profile Completion Analytics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Students</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{completionAnalytics.total}</p>
                <p className="text-xs text-slate-400 mt-0.5">Total in selected view</p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">100% Completed</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className="text-2xl font-bold text-slate-900">{completionAnalytics.completed100}</p>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {completionAnalytics.completedPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-200">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${completionAnalytics.completedPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Incomplete / Pending</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className="text-2xl font-bold text-slate-900">{completionAnalytics.inProgress}</p>
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    {completionAnalytics.inProgressPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-200">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${completionAnalytics.inProgressPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-50 to-indigo-50 border-b-2 border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">S.No</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Registration No</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Username</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Department</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Profile Completion</th>
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
                          <div className="relative inline-block shrink-0">
                            {student.profile_image ? (
                              <img
                                src={student.profile_image}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover border border-slate-300"
                              />
                            ) : (
                              <UserCircle2 className="w-7 h-7 text-slate-400" />
                            )}
                            {student.is_photo_verified && (
                              <span
                                title="Verified Photo"
                                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border border-white rounded-full flex items-center justify-center shadow-xs"
                              >
                                <CheckCircle2 className="w-2 h-2 fill-emerald-500 text-white" />
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-slate-900">
                            {student.username || student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim()}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const displayDept = getStudentDepartment(student)
                          const sectionDept = student.department_short_name || student.department_code || ''
                          const homeDept = student.home_department_short_name || ''
                          const tooltip = homeDept
                            ? `Home: ${homeDept}${sectionDept ? ` | Section: ${sectionDept}` : ''}`
                            : (sectionDept || displayDept)
                          return (
                            <span className="text-sm text-slate-700">
                              <span title={tooltip || undefined}>
                                {displayDept || '-'}
                                {student.is_shared_section && <span className="ml-1 text-xs text-amber-600 font-medium">(Y1)</span>}
                              </span>
                            </span>
                          )
                        })()}
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
                        {(() => {
                          const pct = computeStudentCompletion(student, completionConfig, modesOfTransportation)
                          const isFull = pct === 100
                          const badgeColor = isFull
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : pct >= 75
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : pct >= 50
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                          const barColor = isFull
                            ? 'bg-emerald-500'
                            : pct >= 75
                            ? 'bg-blue-500'
                            : pct >= 50
                            ? 'bg-amber-500'
                            : 'bg-rose-500'

                          return (
                            <div className="flex flex-col gap-1.5 min-w-[130px] max-w-[160px]">
                              <div className="flex items-center justify-between">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeColor}`}>
                                  {isFull ? (
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      100%
                                    </span>
                                  ) : (
                                    `${pct}%`
                                  )}
                                </span>
                                <span className="text-[11px] font-medium text-slate-500">
                                  {isFull ? 'Complete' : 'Incomplete'}
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })()}
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
            <div className="p-6 space-y-5">
              {/* Profile Photo Preview, Upload & Verification */}
              <div className="flex items-center gap-5 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="relative shrink-0">
                  {editFormData.profile_image ? (
                    <img
                      src={editFormData.profile_image}
                      alt={editFormData.username}
                      className="w-20 h-20 rounded-full object-cover border-2 border-indigo-300 shadow-sm"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-slate-200 border-2 border-slate-300 flex items-center justify-center text-slate-400">
                      <UserCircle2 className="w-12 h-12" />
                    </div>
                  )}
                  {/* Green circular check badge on photo bottom right corner */}
                  {editFormData.is_photo_verified && (
                    <div
                      title="Profile Photo Verified"
                      className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 text-white rounded-full border-2 border-white shadow-md flex items-center justify-center animate-in zoom-in duration-200"
                    >
                      <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        Student Profile Photo
                        {editFormData.is_photo_verified && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Verified
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500">Upload portrait photo and verify student identity</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap pt-1">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-indigo-700 rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-colors">
                      {uploadingStudentId === editFormData.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      <span>{uploadingStudentId === editFormData.id ? 'Uploading...' : editFormData.profile_image ? 'Change Photo' : 'Upload Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingStudentId === editFormData.id}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handleUploadPhoto(editFormData.id, file)
                          }
                          e.target.value = ''
                        }}
                      />
                    </label>

                    {/* Verify button directly after profile photo */}
                    <button
                      type="button"
                      onClick={() => handleToggleVerify(editFormData.id, Boolean(editFormData.is_photo_verified))}
                      disabled={togglingVerifyId === editFormData.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all border ${
                        editFormData.is_photo_verified
                          ? 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600'
                          : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                      }`}
                    >
                      {togglingVerifyId === editFormData.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>{editFormData.is_photo_verified ? 'Verified ✓' : 'Verify'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Basic Details: Reg No & Username */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Registration No</label>
                  <input
                    type="text"
                    value={editFormData.reg_no || ''}
                    onChange={(e) => handleEditChange('reg_no', e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Username</label>
                  <input
                    type="text"
                    value={editFormData.username || ''}
                    onChange={(e) => handleEditChange('username', e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                  />
                </div>
              </div>

              {/* Department + Section + Degree */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Department</label>
                  <input
                    type="text"
                    value={editFormData.department_code || ''}
                    readOnly
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Section</label>
                  <select
                    value={editFormData.section_id || ''}
                    onChange={(e) => handleEditChange('section_id', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                  >
                    <option value="">Select section</option>
                    {editSectionOptions.map((section) => (
                      <option key={section.section_id} value={section.section_id}>
                        {section.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Degree</label>
                  <input
                    type="text"
                    placeholder="e.g. B.E, B.Tech"
                    value={editFormData.degree || ''}
                    onChange={(e) => handleEditChange('degree', e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                  />
                </div>
              </div>

              {/* Department Roll No, Section Roll No & Gender */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Department Roll No</label>
                  <input
                    type="text"
                    placeholder="e.g. 21CS045"
                    value={editFormData.dept_roll_no || ''}
                    onChange={(e) => handleEditChange('dept_roll_no', e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Section Roll No</label>
                  <input
                    type="text"
                    placeholder="e.g. A-23"
                    value={editFormData.section_roll_no || ''}
                    onChange={(e) => handleEditChange('section_roll_no', e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Gender (M/F)</label>
                  <select
                    value={editFormData.gender || ''}
                    onChange={(e) => handleEditChange('gender', e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                  >
                    <option value="">-- Select Gender --</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              {/* Contact Details: Email & Student Mobile Number */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Student Email</label>
                  <input
                    type="email"
                    placeholder="student@example.com"
                    value={editFormData.email || ''}
                    onChange={(e) => handleEditChange('email', e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Student Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={editFormData.mobile_number || ''}
                    onChange={(e) => handleEditChange('mobile_number', e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                  />
                </div>
              </div>

              {/* Personal Details Group (Date of Birth & Blood Group) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center gap-2 text-slate-800">
                  <Heart className="w-4 h-4 text-rose-600" />
                  <h4 className="text-sm font-bold">Personal Details</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Date of Birth (DD-MM-YYYY)
                    </label>
                    <input
                      type="date"
                      value={editFormData.dob || ''}
                      onChange={(e) => handleEditChange('dob', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Blood Group
                    </label>
                    <select
                      value={editFormData.blood_group || ''}
                      onChange={(e) => handleEditChange('blood_group', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    >
                      <option value="">-- Select Blood Group --</option>
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Parents Information Group (Father's Name & Mother's Name) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center gap-2 text-slate-800">
                  <Users className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold">Parents Information</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Father's Name
                    </label>
                    <input
                      type="text"
                      placeholder="Enter Father's Name"
                      value={editFormData.father_name || ''}
                      onChange={(e) => handleEditChange('father_name', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mother's Name
                    </label>
                    <input
                      type="text"
                      placeholder="Enter Mother's Name"
                      value={editFormData.mother_name || ''}
                      onChange={(e) => handleEditChange('mother_name', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Status & Mode of Transportation (with dynamic Boarding Point) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
                  {isIqacRole ? (
                    <select
                      value={editFormData.status || 'active'}
                      onChange={(e) => handleEditChange('status', e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                    >
                      <option value="active">Active</option>
                      <option value="alumni">Alumni</option>
                      <option value="debar">Debar</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={editFormData.status || 'active'}
                      readOnly
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed capitalize"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Bus className="w-4 h-4 text-indigo-600" />
                    Mode of Transportation
                  </label>
                  <select
                    value={
                      editFormData.mode_of_transportation_id !== undefined && editFormData.mode_of_transportation_id !== null
                        ? editFormData.mode_of_transportation_id
                        : (editFormData.mode_of_transportation
                            ? (modesOfTransportation.find(m => m.name.toLowerCase() === editFormData.mode_of_transportation?.toLowerCase() || String(m.id) === String(editFormData.mode_of_transportation))?.id ?? '')
                            : '')
                    }
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null
                      const selectedMot = modesOfTransportation.find(m => m.id === val)
                      handleEditChange('mode_of_transportation_id', val)
                      handleEditChange('mode_of_transportation', selectedMot ? selectedMot.name : '')
                    }}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 bg-white"
                  >
                    <option value="">-- Select Mode of Transportation --</option>
                    {modesOfTransportation.map((mot) => (
                      <option key={mot.id} value={mot.id}>
                        {mot.name}
                      </option>
                    ))}
                  </select>

                  {/* Dynamic Boarding Point if College Bus is selected */}
                  {(() => {
                    const motId = editFormData.mode_of_transportation_id
                    const motName = modesOfTransportation.find(m => m.id === motId)?.name || editFormData.mode_of_transportation || ''
                    const isBus = motName.toLowerCase().includes('college bus') || motName.toLowerCase().includes('bus')
                    if (!isBus) return null

                    return (
                      <div className="mt-2.5 p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-1 animate-in fade-in duration-150">
                        <label className="block text-xs font-semibold text-indigo-900 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                          Boarding Point
                        </label>
                        <input
                          type="text"
                          placeholder="Enter Bus Stop / Boarding Point"
                          value={editFormData.boarding_point || ''}
                          onChange={(e) => handleEditChange('boarding_point', e.target.value)}
                          className="w-full px-3 py-1.5 border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                        />
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Parent / Guardian Contacts Group */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center gap-2 text-slate-800">
                  <Phone className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-sm font-bold">Parent / Guardian Contacts</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Parent/Guardian Number 1 (Compulsory)
                    </label>
                    <input
                      type="tel"
                      placeholder="Primary contact (e.g. 9876543210)"
                      value={editFormData.father_mobile || ''}
                      onChange={(e) => handleEditChange('father_mobile', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Parent Mobile Number 2
                    </label>
                    <input
                      type="tel"
                      placeholder="Secondary contact"
                      value={editFormData.mother_mobile || ''}
                      onChange={(e) => handleEditChange('mother_mobile', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Address Details Group */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center gap-2 text-slate-800">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-sm font-bold">Address Details</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Address Line 1 (Door No / Street)</label>
                    <input
                      type="text"
                      placeholder="Door No, Street Name"
                      value={editFormData.address_line1 || ''}
                      onChange={(e) => handleEditChange('address_line1', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Address Line 2 (Area / Locality)</label>
                    <input
                      type="text"
                      placeholder="Area, Locality"
                      value={editFormData.address_line2 || ''}
                      onChange={(e) => handleEditChange('address_line2', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Address Line 3 (Landmark / Town)</label>
                    <input
                      type="text"
                      placeholder="Landmark / Town"
                      value={editFormData.address_line3 || ''}
                      onChange={(e) => handleEditChange('address_line3', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Address Line 4 (City / Additional)</label>
                    <input
                      type="text"
                      placeholder="City / Area / Additional"
                      value={editFormData.address_line4 || ''}
                      onChange={(e) => handleEditChange('address_line4', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">District</label>
                    <input
                      type="text"
                      placeholder="District"
                      value={editFormData.district || ''}
                      onChange={(e) => handleEditChange('district', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Pincode</label>
                    <input
                      type="text"
                      placeholder="Postal PIN"
                      maxLength={10}
                      value={editFormData.pincode || ''}
                      onChange={(e) => handleEditChange('pincode', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                    />
                  </div>
                </div>
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
                disabled={isSavingEdit}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Batch Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 p-2 rounded-lg">
                  <Layers className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">New Batch</h2>
                  <p className="text-xs text-slate-500">Create the cohort and its sections before importing students</p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Batch name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={batchForm.name}
                    onChange={e => setBatchForm({ ...batchForm, name: e.target.value })}
                    placeholder="2026"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Must match the <code>batch</code> column in the import file (e.g. <code>2026</code>).
                  </p>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Managing department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={batchForm.department}
                    onChange={e => setBatchForm({ ...batchForm, department: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="">-- Select department --</option>
                    {allDepartments.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.short_name || dept.code} — {dept.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    For a year-1 cohort select <strong>S&amp;H</strong>. For a regular course-based batch use the API with <code>course</code>.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Start year</label>
                  <input
                    type="number"
                    value={batchForm.start_year}
                    onChange={e => setBatchForm({ ...batchForm, start_year: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">End year</label>
                  <input
                    type="number"
                    value={batchForm.end_year}
                    onChange={e => setBatchForm({ ...batchForm, end_year: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Sections</label>
                  <input
                    type="text"
                    value={batchForm.sections}
                    onChange={e => setBatchForm({ ...batchForm, sections: e.target.value })}
                    placeholder="A,B,C,D,E,F,G,H,I,J,K,L"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Comma separated. Existing sections are kept; missing ones are created.
                  </p>
                </div>
              </div>

              {batchError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{batchError}</span>
                </div>
              )}

              {batchResult && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  <p className="font-medium">{batchResult.message || 'Batch ready.'}</p>
                  <p className="mt-0.5 text-xs">
                    Batch: <strong>{batchResult.batch?.name}</strong>
                    {batchResult.sections?.length ? (
                      <> · Sections: <strong>{batchResult.sections.map((s: any) => s.name).join(', ')}</strong></>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-green-700">
                    The batch is now available in the Batch dropdown. You can import the student file.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 rounded-b-xl">
              <button
                onClick={() => setIsBatchModalOpen(false)}
                disabled={batchSaving}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors disabled:opacity-50"
              >
                Close
              </button>
              <button
                onClick={handleCreateBatch}
                disabled={batchSaving || !batchForm.name.trim() || !batchForm.department}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {batchSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><Layers className="w-4 h-4" /> Create Batch</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Students Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 p-2 rounded-lg">
                  <FileText className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Import Students</h2>
                  <p className="text-xs text-slate-500">Upload Excel (.xlsx) or CSV file</p>
                </div>
              </div>
              <button
                onClick={handleCloseImport}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Template Download */}
              <div className="bg-slate-50 rounded-lg p-4 flex items-start gap-3">
                <Download className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">Download Template (30 Columns)</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Includes all 30 standard columns: <code>student_reg_no, name, department, section, email, password, batch, status, core_department, M/F, deptrollno, secrollnum, fathername, DOB, DD, MM, YYYY, ADD1, ADD2, ADD3, ADDRES4, pincode, fathermobile, bloodgroup, Dept, degree, MOT, Boardingpoint, batch, MENTOR</code>.
                    <br />
                    • <strong>Hostellers</strong>: Set MOT to <em>Hosteller</em> — automatically registers student in the Hostel Portal for room allocation.
                    <br />
                    • <strong>Mentors</strong>: Enter mentor Staff ID, Name, or Email to assign student mentor automatically.
                    <br />
                    • Valid status values: <code>ACTIVE, INACTIVE, ALUMNI, DEBAR</code>.
                  </p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shrink-0"
                >
                  Download
                </button>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select File
                </label>
                <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  importFile
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
                }`}>
                  <div className="flex flex-col items-center justify-center gap-1">
                    <Upload className={`w-6 h-6 ${importFile ? 'text-indigo-500' : 'text-slate-400'}`} />
                    {importFile ? (
                      <span className="text-sm font-medium text-indigo-700">{importFile.name}</span>
                    ) : (
                      <>
                        <span className="text-sm text-slate-600">Click to upload or drag and drop</span>
                        <span className="text-xs text-slate-400">.xlsx, .csv</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.csv"
                    onChange={(e) => {
                      setImportFile(e.target.files?.[0] || null)
                      setImportResult(null)
                      setImportError(null)
                    }}
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-amber-600"
                  checked={useDeptRollAsRegNo}
                  onChange={e => setUseDeptRollAsRegNo(e.target.checked)}
                />
                <span className="text-xs text-amber-900">
                  <span className="block text-sm font-semibold">Use Department Roll No as registration number</span>
                  Enable this when the Excel <code>student_reg_no</code> column contains duplicates or rounded
                  16-digit numbers. Each student will be stored with their <code>deptrollno</code>
                  {' '}(e.g. <code>ADA26001</code>) as the unique registration number.
                </span>
              </label>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                The <code>batch</code> and <code>section</code> values in the file must already exist.
                Use <strong>New Batch</strong> above to create them before importing.
              </div>

              {/* Error message */}
              {importError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Import Result */}
              {importResult && (
                <div className="space-y-3">
                  <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
                    importResult.total_errors === 0
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                  }`}>
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{importResult.message}</p>
                      <p className="mt-0.5">
                        Created: <strong>{importResult.created}</strong>&nbsp;&nbsp;
                        Updated: <strong>{importResult.updated}</strong>
                        {importResult.total_errors > 0 && (
                          <>&nbsp;&nbsp;Errors: <strong>{importResult.total_errors}</strong></>
                        )}
                      </p>
                    </div>
                  </div>
                  {(importResult.duplicate_reg_count || 0) > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <p className="font-semibold">
                        {importResult.duplicate_reg_count} row(s) used a duplicate registration number.
                      </p>
                      <p className="mt-0.5">
                        Those rows updated the same student instead of creating new ones. Enable
                        “Use Department Roll No as registration number” and import again to create every student.
                      </p>
                      {importResult.duplicate_reg_rows?.length ? (
                        <ul className="mt-1 max-h-24 overflow-y-auto space-y-0.5">
                          {importResult.duplicate_reg_rows.map((row, index) => (
                            <li key={index}>• {row}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">
                        Error details {importResult.total_errors > 50 ? `(showing first 50 of ${importResult.total_errors})` : ''}:
                      </p>
                      <ul className="space-y-1">
                        {importResult.errors.map((err, i) => (
                          <li key={i} className="text-xs text-red-600">• {err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(importResult.warnings?.length || 0) > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-semibold text-amber-800 mb-1">
                        Warnings {importResult.total_warnings && importResult.total_warnings > 50 ? `(showing first 50 of ${importResult.total_warnings})` : ''}:
                      </p>
                      <ul className="space-y-1">
                        {importResult.warnings?.map((warning, i) => (
                          <li key={i} className="text-xs text-amber-700">• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 rounded-b-xl">
              <button
                onClick={handleCloseImport}
                disabled={importLoading}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors disabled:opacity-50"
              >
                Close
              </button>
              <button
                onClick={handleImport}
                disabled={!importFile || importLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {importLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                ) : (
                  <><Upload className="w-4 h-4" /> Import</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}