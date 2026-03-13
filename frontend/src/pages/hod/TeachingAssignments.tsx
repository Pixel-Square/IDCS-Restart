import React, { useEffect, useState } from 'react'
import { User, BookOpen, Save, Edit, X, Trash2, RefreshCw } from 'lucide-react'
import fetchWithAuth from '../../services/fetchAuth'
import { getCachedMe } from '../../services/auth'

type Section = { id: number; name: string; batch: string; batch_regulation?: { id: number; code: string; name?: string } | null; department_id?: number; department_short_name?: string; semester?: number; department?: { id: number; code?: string } }
type Staff = { id: number; user: string | { username?: string; first_name?: string; last_name?: string }; staff_id: string; department?: { id?: number; code?: string; name?: string } }
type CurriculumRow = { id: number; course_code?: string; course_name?: string; department?: { id: number; code?: string }; semester?: number; regulation?: string; home_dept_codes?: string[] }
type TeachingAssignment = { 
  id: number
  staff: string | number
  subject: string
  section: string | number
  academic_year: string
  curriculum_row?: { id: number; course_code?: string; course_name?: string }
  curriculum_row_details?: { id: number; course_code?: string; course_name?: string; semester?: number }
  section_details?: { id: number; name: string; batch: string; semester?: number }
  staff_details?: { id: number; user: string | { username?: string; first_name?: string; last_name?: string }; staff_id: string }
}

// Cache key and expiry time (5 minutes)
const CACHE_KEY_PREFIX = 'teaching_assignments_cache'
const CACHE_EXPIRY_MS = 5 * 60 * 1000

// Generate user-specific cache key to prevent cross-user cache contamination
const getUserCacheKey = () => {
  const me = getCachedMe()
  const userId = me?.id || me?.username || 'anonymous'
  return `${CACHE_KEY_PREFIX}_${userId}`
}

// Helper function to get display name from user
const getStaffDisplayName = (staff: Staff) => {
  if (typeof staff.user === 'string') {
    return staff.user
  }
  if (staff.user && typeof staff.user === 'object') {
    const firstName = staff.user.first_name || ''
    const lastName = staff.user.last_name || ''
    const fullName = `${firstName} ${lastName}`.trim()
    return fullName || staff.user.username || staff.staff_id
  }
  return staff.staff_id
}

const getAssignmentStaffName = (staffDetails: any) => {
  if (!staffDetails) return '—'
  if (typeof staffDetails.user === 'string') {
    return staffDetails.user
  }
  if (staffDetails.user && typeof staffDetails.user === 'object') {
    const firstName = staffDetails.user.first_name || ''
    const lastName = staffDetails.user.last_name || ''
    const fullName = `${firstName} ${lastName}`.trim()
    return fullName || staffDetails.user.username || staffDetails.staff_id
  }
  return staffDetails.staff_id || '—'
}

export default function TeachingAssignmentsPage(){
  const [sections, setSections] = useState<Section[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [electiveStaff, setElectiveStaff] = useState<Staff[]>([])
  const [departments, setDepartments] = useState<{ id: number; name?: string; code?: string; short_name?: string }[]>([])
  const [userDepartments, setUserDepartments] = useState<{ id: number; name?: string; code?: string; short_name?: string }[]>([])
  const [selectedDept, setSelectedDept] = useState<number | null>(null)
  const [selectedElectiveDept, setSelectedElectiveDept] = useState<number | null>(null)
  const [selectedElectiveRegulation, setSelectedElectiveRegulation] = useState<string | null>(null)
  const [selectedElectiveSemester, setSelectedElectiveSemester] = useState<number | null>(null)
  const [curriculum, setCurriculum] = useState<CurriculumRow[]>([])
  // Per-section curriculum for shared sections (S&H-type: department_id === null)
  const [sharedSectionCurriculum, setSharedSectionCurriculum] = useState<Record<number, CurriculumRow[]>>({})
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([])
  const [electiveOptions, setElectiveOptions] = useState<any[]>([])
  const [electiveParents, setElectiveParents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAssignments, setEditingAssignments] = useState<Set<string>>(new Set())
  const [editingElectives, setEditingElectives] = useState<Set<string>>(new Set())
  const [isBulkEditMode, setIsBulkEditMode] = useState<boolean>(false)
  const [isBulkElectiveEditMode, setIsBulkElectiveEditMode] = useState<boolean>(false)

  // derive staff list for elective dropdowns: use electiveStaff which is loaded based on filters
  const getFilteredStaffForElective = () => {
    return electiveStaff || []
  }

  // permissions (used to decide which staff endpoint to call)
  const perms = (() => { try { return JSON.parse(localStorage.getItem('permissions') || '[]') as string[] } catch { return [] } })()
  const canAssignTeaching = perms.includes('academics.assign_teaching')
  const canViewElectives = perms.includes('academics.view_elective_teaching')
  const canAssignElectives = perms.includes('academics.assign_elective_teaching')
  const showCourseAssignments = canAssignTeaching && !canViewElectives && !canAssignElectives
  const useCachedTeachingData = showCourseAssignments

  // Helper functions for elective filtering
  const getUniqueElectiveRegulations = () => {
    const regulations = new Set<string>();
    electiveParents.forEach(parent => {
      if (parent.regulation) {
        regulations.add(parent.regulation);
      }
    });
    return Array.from(regulations).sort();
  }

  const getUniqueElectiveSemesters = () => {
    const semesters = new Set<number>();
    electiveParents.forEach(parent => {
      if (parent.semester) {
        semesters.add(parent.semester);
      }
    });
    return Array.from(semesters).sort((a, b) => a - b);
  }

  const getFilteredElectiveParents = () => {
    return electiveParents.filter(p => {
      if ((p as any).is_dept_core) return false; // dept-core handled in its own section
      // Parents from shared sections have no 'department' (they span multiple depts);
      // always include them regardless of the dept filter so Y1 electives are visible.
      const deptMatch = !selectedElectiveDept || !p.department || p.department.id === selectedElectiveDept;
      const regulationMatch = !selectedElectiveRegulation || p.regulation === selectedElectiveRegulation;
      const semesterMatch = !selectedElectiveSemester || p.semester === selectedElectiveSemester;
      return deptMatch && regulationMatch && semesterMatch;
    });
  }

  const getDeptCoreParents = () => {
    return electiveParents.filter(p => {
      if (!(p as any).is_dept_core) return false;
      if (!p.department) return false;
      const deptMatch = !selectedDept || !p.department || p.department.id === selectedDept;
      return deptMatch;
    });
  }

  // Cache helper functions
  const getCachedData = () => {
    try {
      const cacheKey = getUserCacheKey()
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

  const setCachedData = (data: any) => {
    try {
      const cacheKey = getUserCacheKey()
      sessionStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch (e) {
      console.warn('Failed to cache teaching assignments data', e)
    }
  }

  const clearCache = () => {
    try {
      const cacheKey = getUserCacheKey()
      sessionStorage.removeItem(cacheKey)
    } catch {}
  }

  useEffect(() => { fetchData() }, [])

  async function fetchData(forceRefresh = false){
    try{
      setLoading(true)
      
      // Clear cache if force refresh
      if (forceRefresh) {
        clearCache()
      }
      
      // Check cache first unless force refresh
      if (!forceRefresh && useCachedTeachingData) {
        const cached = getCachedData()
        if (cached) {
          console.log('Loading teaching assignments from cache')
          const cachedSections: Section[] = cached.sections || []
          const cachedElectiveParents: any[] = cached.electiveParents || []
          setSections(cachedSections)
          setStaff(cached.staff || [])
          setElectiveStaff(cached.staff || [])
          setCurriculum(cached.curriculum || [])
          setElectiveParents(cachedElectiveParents)
          setElectiveOptions(cached.electiveOptions || [])
          setAssignments(cached.assignments || [])
          setDepartments(cached.departments || [])
          setUserDepartments(cached.userDepartments || [])
          // Always fetch shared-section curriculum (not in cache) so shared sections
          // show subjects and is_elective rows are merged into electiveParents.
          const sharedSecsFromCache = cachedSections.filter(s => s.department_id === null && s.department_short_name === null)
          if (sharedSecsFromCache.length > 0) {
            const sharedMapFromCache: Record<number, CurriculumRow[]> = {}
            await Promise.all(sharedSecsFromCache.map(async sec => {
              try {
                const r = await fetchWithAuth(`/api/timetable/curriculum-for-section/?section_id=${sec.id}`)
                if (r.ok) { sharedMapFromCache[sec.id] = ((await r.json()).results || []) as CurriculumRow[] }
              } catch { /* ignore */ }
            }))
            setSharedSectionCurriculum(sharedMapFromCache)
            const allSharedRows = Object.values(sharedMapFromCache).flat()
            const sharedElectiveRows = allSharedRows.filter((c: any) => c.is_elective)
            const existIds = new Set(cachedElectiveParents.map((p: any) => p.id))
            const newParents = sharedElectiveRows.filter((c: any) => !existIds.has(c.id))
            if (newParents.length > 0) setElectiveParents([...cachedElectiveParents, ...newParents])
          }
          setLoading(false)
          return
        }
      }

      console.log('Fetching teaching assignments from API')
      // HOD-capable users need the department section list so Year-1 dept-core
      // subjects can be assigned to core department sections like AI&DS A.
      // Advisors without HOD permissions still use only their own sections.
      const sectionsEndpoint = showCourseAssignments
        ? '/api/academics/my-students/'
        : '/api/academics/sections/?page_size=0'
      const sres = await fetchWithAuth(sectionsEndpoint)
      const staffEndpoint = (canViewElectives || canAssignElectives) ? '/api/academics/hod-staff/?page_size=0' : '/api/academics/advisor-staff/?page_size=0'
      // fetch staff list optionally filtered by selected department
      let staffRes = await fetchWithAuth(selectedDept && staffEndpoint.includes('hod-staff') ? `${staffEndpoint}&department=${selectedDept}` : staffEndpoint)
      // If hod-staff is forbidden for this token, gracefully fall back to advisor-staff
      if (staffRes.status === 403 && staffEndpoint.includes('hod-staff')) {
        console.warn('hod-staff returned 403 — falling back to advisor-staff endpoint')
        const fallbackUrl = selectedDept ? `/api/academics/advisor-staff/?page_size=0&department=${selectedDept}` : '/api/academics/advisor-staff/?page_size=0'
        try {
          const fb = await fetchWithAuth(fallbackUrl)
          if (fb.ok) staffRes = fb
        } catch (e) {
          console.error('fallback to advisor-staff failed', e)
        }
      }
      const curRes = await fetchWithAuth('/api/curriculum/department/?page_size=0')
      const taRes = await fetchWithAuth('/api/academics/teaching-assignments/?page_size=0')

      const safeJson = async (r: Response) => {
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('application/json')) throw new Error('non-json')
        return r.json()
      }

      // Store data in local variables for caching
      let sectionsData: Section[] = []
      let staffData: Staff[] = []
      let curriculumData: CurriculumRow[] = []
      let electiveParentsData: any[] = []
      let electiveOptionsData: any[] = []
      let assignmentsData: TeachingAssignment[] = []
      let departmentsData: any[] = []
      let userDepartmentsData: any[] = []

      if (sres.ok){
        const d = await safeJson(sres)
        const raw = d.results || d
        sectionsData = raw.map((r: any) => {
          // HODSectionsView format has `id`, advisor my-students format has `section_id`
          if (r.section_id !== undefined) {
            return { id: r.section_id, name: r.section_name, batch: r.batch, batch_regulation: r.batch_regulation, department_id: r.department_id, department_short_name: r.department_short_name, semester: r.semester, department: r.department }
          } else {
            return { id: r.id, name: r.name, batch: r.batch_name, batch_regulation: r.batch_regulation, department_id: r.department_id, semester: r.semester, department: { id: r.department_id, code: r.department_code } }
          }
        })
        setSections(sectionsData)
      }
      if (staffRes.ok){ 
        const d = await safeJson(staffRes); 
        staffData = (d.results || d) as Staff[]
        // if backend didn't filter, apply client-side filter
        if (selectedDept){ 
          staffData = staffData.filter(s => (s.department && s.department.id === selectedDept) || (s as any).department === selectedDept) 
        }
        setStaff(staffData)
        // Initialize elective staff with same data initially
        setElectiveStaff(staffData)
      }
      if (curRes.ok){ 
        const d = await safeJson(curRes); 
        const rows = (d.results || d); 
        curriculumData = rows
        electiveParentsData = rows.filter((r:any)=> r.is_elective || r.is_dept_core)
        setCurriculum(curriculumData); 
        setElectiveParents(electiveParentsData);

        // Derive departments visible to this user from curriculum rows (user-mapped departments)
        const deptMap = new Map();
        rows.forEach((r: any) => {
          if (r.department && r.department.id) {
            deptMap.set(r.department.id, r.department);
          }
        });
        if (deptMap.size > 0) {
          userDepartmentsData = Array.from(deptMap.values())
          setUserDepartments(userDepartmentsData)
        }

        // Prefer fetching the canonical departments list from the academics API (for the top filter).
        try {
          const depsRes = await fetchWithAuth('/api/academics/departments/?page_size=0')
          if (depsRes.ok) {
            const depsJson = await safeJson(depsRes)
            const deps = depsJson.results || depsJson
            if (Array.isArray(deps) && deps.length > 0) {
              departmentsData = deps
              setDepartments(departmentsData)
            }
          } else {
            // fallback: use the curriculum-derived set for top filter too
            if (deptMap.size > 0) {
              departmentsData = Array.from(deptMap.values())
              setDepartments(departmentsData)
            }
          }
        } catch (e) {
          // fallback to curriculum-derived departments on error
          if (deptMap.size > 0) {
            departmentsData = Array.from(deptMap.values())
            setDepartments(departmentsData)
          }
        }

        // Fetch electives for each user department to get cross-department mappings
        // Without department_id query param, backend won't return cross-dept electives
        try {
          const deptIdsToFetch = Array.from(deptMap.keys());
          if (deptIdsToFetch.length > 0) {
            const allElectiveFetches = await Promise.all(
              deptIdsToFetch.map(dId =>
                fetchWithAuth(`/api/curriculum/elective/?page_size=0&department_id=${dId}`)
                  .then(r => r.ok ? safeJson(r) : { results: [] })
                  .then(d => d.results || d)
                  .catch(() => [])
              )
            );
            // Merge, deduplicating by ID (keep cross-dept version when both exist)
            const mergedMap = new Map<number, any>();
            allElectiveFetches.forEach(arr => {
              arr.forEach((elective: any) => {
                const existing = mergedMap.get(elective.id);
                if (!existing || (!existing.is_cross_department && elective.is_cross_department)) {
                  mergedMap.set(elective.id, elective);
                }
              });
            });
            electiveOptionsData = Array.from(mergedMap.values());
          } else {
            const electRes = await fetchWithAuth('/api/curriculum/elective/?page_size=0');
            if (electRes.ok) {
              const d = await safeJson(electRes);
              electiveOptionsData = d.results || d;
            }
          }
          setElectiveOptions(electiveOptionsData);
        } catch (e) {
          console.error('Failed to fetch electives', e);
        }
      }
      if (taRes.ok){ 
        const d = await safeJson(taRes); 
        assignmentsData = d.results || d
        setAssignments(assignmentsData) 
      }

      // For shared sections (S&H-type: department_id === null), fetch the union of
      // home-department curriculum rows via the per-section endpoint.
      const sharedSecs = sectionsData.filter(s => s.department_id === null && s.department_short_name === null)
      if (sharedSecs.length > 0) {
        const sharedCurriculumMap: Record<number, CurriculumRow[]> = {}
        await Promise.all(sharedSecs.map(async sec => {
          try {
            const r = await fetchWithAuth(`/api/timetable/curriculum-for-section/?section_id=${sec.id}`)
            if (r.ok) {
              const d = await r.json()
              sharedCurriculumMap[sec.id] = (d.results || []) as CurriculumRow[]
            }
          } catch { /* ignore */ }
        }))
        setSharedSectionCurriculum(sharedCurriculumMap)
        // Merge is_elective rows from shared sections into electiveParents so they
        // appear in the Elective Subject Assignments section.
        const allSharedRows = Object.values(sharedCurriculumMap).flat()
        const sharedElectiveRows = allSharedRows.filter((c: any) => c.is_elective)
        const existElectiveIds = new Set(electiveParentsData.map((p: any) => p.id))
        const newSharedElectiveParents = sharedElectiveRows.filter((c: any) => !existElectiveIds.has(c.id))
        if (newSharedElectiveParents.length > 0) {
          electiveParentsData = [...electiveParentsData, ...newSharedElectiveParents]
          setElectiveParents(electiveParentsData)
        }
      }

      // Cache the loaded data for faster subsequent loads
      if (useCachedTeachingData) {
        setCachedData({
          sections: sectionsData,
          staff: staffData,
          curriculum: curriculumData,
          electiveParents: electiveParentsData,
          electiveOptions: electiveOptionsData,
          assignments: assignmentsData,
          departments: departmentsData,
          userDepartments: userDepartmentsData
        })
      }
    }catch(e){ console.error(e); alert('Failed to load teaching assignment data') }
    finally{ setLoading(false) }
  }

  // reload staff list when selected department changes
  useEffect(()=>{
    async function loadStaff(){
      try{
        const staffEndpoint = (canViewElectives || canAssignElectives) ? '/api/academics/hod-staff/?page_size=0' : '/api/academics/advisor-staff/?page_size=0'
        const url = selectedDept && staffEndpoint.includes('hod-staff') ? `${staffEndpoint}&department=${selectedDept}` : staffEndpoint
        const res = await fetchWithAuth(url)
        let finalRes = res
        if (res.status === 403 && staffEndpoint.includes('hod-staff')) {
          console.warn('hod-staff returned 403 in loadStaff — trying advisor-staff')
          const fallbackUrl = selectedDept ? `/api/academics/advisor-staff/?page_size=0&department=${selectedDept}` : '/api/academics/advisor-staff/?page_size=0'
          try {
            const fb = await fetchWithAuth(fallbackUrl)
            if (fb.ok) finalRes = fb
            else if (fb.status !== 200) return
          } catch (e) { console.error('fallback failed', e); return }
        }
        if(!finalRes.ok) return
        const data = await finalRes.json()
        let staffList = data.results || data
        // if backend didn't filter and we're on advisor endpoint, filter client-side
        if(!staffEndpoint.includes('hod-staff') && selectedDept){
          staffList = staffList.filter((s:any) => (s.department && s.department.id === selectedDept) || (s.department === selectedDept) )
        }
        setStaff(staffList)
      }catch(e){ console.error('loadStaff failed', e) }
    }
    loadStaff()
  }, [selectedDept])

  // Reload elective options when elective section department filter changes
  useEffect(() => {
    async function loadElectives() {
      try {
        let url = '/api/curriculum/elective/?page_size=0';
        // Prefer elective-specific dept filter, otherwise use top-level dept filter
        const deptFilter = selectedElectiveDept || selectedDept;
        if (deptFilter) {
          url += `&department_id=${deptFilter}`;
        }
        const res = await fetchWithAuth(url);
        if (res.ok) {
          const data = await res.json();
          const electiveOptionsData = data.results || data;
          setElectiveOptions(electiveOptionsData);
          console.log(`Loaded ${electiveOptionsData.length} electives for dept ${deptFilter || 'all'}`);
          // Debug: log cross-department electives
          const crossDept = electiveOptionsData.filter((e: any) => e.is_cross_department);
          if (crossDept.length > 0) {
            console.log(`Found ${crossDept.length} cross-department electives:`, crossDept.map((e: any) => `${e.course_code} from ${e.owner_department_name}`));
          }
        }
      } catch (e) {
        console.error('loadElectives failed', e);
      }
    }
    
    loadElectives();
  }, [selectedElectiveDept, selectedDept])

  // Reload elective staff ONLY when top-level department filter changes (NOT elective section filter)
  useEffect(() => {
    async function loadElectiveStaff() {
      try {
        // ONLY use top-level dept filter for staff (ignore elective section's own filter)
        const deptFilter = selectedDept;
        const staffEndpoint = (canViewElectives || canAssignElectives) ? '/api/academics/hod-staff/?page_size=0' : '/api/academics/advisor-staff/?page_size=0'
        const url = deptFilter && staffEndpoint.includes('hod-staff') ? `${staffEndpoint}&department=${deptFilter}` : staffEndpoint
        const res = await fetchWithAuth(url)
        let finalRes = res
        if (res.status === 403 && staffEndpoint.includes('hod-staff')) {
          console.warn('hod-staff returned 403 in loadElectiveStaff — trying advisor-staff')
          const fallbackUrl = deptFilter ? `/api/academics/advisor-staff/?page_size=0&department=${deptFilter}` : '/api/academics/advisor-staff/?page_size=0'
          try {
            const fb = await fetchWithAuth(fallbackUrl)
            if (fb.ok) finalRes = fb
            else if (fb.status !== 200) return
          } catch (e) { console.error('fallback failed', e); return }
        }
        if(!finalRes.ok) return
        const data = await finalRes.json()
        let staffList = data.results || data
        // if backend didn't filter and we're on advisor endpoint, filter client-side
        if(!staffEndpoint.includes('hod-staff') && deptFilter){
          staffList = staffList.filter((s:any) => (s.department && s.department.id === deptFilter) || (s.department === deptFilter) )
        }
        setElectiveStaff(staffList)
        console.log(`Loaded ${staffList.length} staff for elective section (top-level dept filter: ${deptFilter || 'all'})`)
      } catch(e) { console.error('loadElectiveStaff failed', e) }
    }
    
    loadElectiveStaff();
  }, [selectedDept])

  // Helper functions for assignment management

  // Returns the relevant curriculum rows for a section:
  // - Shared sections (S&H, department_id === null): use per-section fetched curriculum
  // - Normal sections: filter global curriculum by semester + regulation
  const getSectionSubjects = (section: Section): CurriculumRow[] => {
    if (section.department_id === null && section.department_short_name === null) {
      // For shared sections, exclude both is_elective and is_dept_core rows;
      // those appear in the Elective Subject Assignments panel below.
      return (sharedSectionCurriculum[section.id] || []).filter(c => !(c as any).is_elective && !(c as any).is_dept_core)
    }
    return curriculum.filter(c =>
      (section.semester ? (c.semester === section.semester) : true) &&
      (section.batch_regulation ? (c.regulation === section.batch_regulation.code) : true) &&
      !((c as any).is_elective) &&
      !((c as any).is_dept_core)
    )
  }

  const findExistingAssignment = (sectionId: number, curricularRowId: number) => {
    return assignments.find(a => {
      // Check section match using section_details
      const sectionMatches = 
        (a.section_details && a.section_details.id === sectionId) ||
        ((a as any).section_details && (a as any).section_details.id === sectionId) ||
        a.section === sectionId || 
        (a as any).section_id === sectionId;
      
      // Check curriculum match using curriculum_row_details
      const curriculumMatches = 
        (a.curriculum_row_details && a.curriculum_row_details.id === curricularRowId) ||
        ((a as any).curriculum_row_details && (a as any).curriculum_row_details.id === curricularRowId) ||
        (a.curriculum_row && a.curriculum_row.id === curricularRowId) ||
        ((a as any).curriculum_row_id === curricularRowId);
      
      return sectionMatches && curriculumMatches;
    });
  }

  const getAssignmentKey = (sectionId: number, subjectId: number) => `${sectionId}-${subjectId}`

  const startEditing = (sectionId: number, subjectId: number) => {
    const key = getAssignmentKey(sectionId, subjectId)
    setEditingAssignments(prev => new Set(prev).add(key))
  }

  const cancelEditing = (sectionId: number, subjectId: number) => {
    const key = getAssignmentKey(sectionId, subjectId)
    setEditingAssignments(prev => {
      const newSet = new Set(prev)
      newSet.delete(key)
      return newSet
    })
  }

  const isEditing = (sectionId: number, subjectId: number) => {
    const key = getAssignmentKey(sectionId, subjectId)
    return editingAssignments.has(key)
  }

  // Helper functions for elective assignment management
  const findExistingElectiveAssignment = (electiveId: number) => {
    // Prefer exact matching by elective_subject id exposed by the API.
    return assignments.find(a => {
      const aElectiveId = (a as any).elective_subject_id
        || ((a as any).elective_subject && (a as any).elective_subject.id)
        || ((a as any).elective_subject_details && (a as any).elective_subject_details.id)
        || (a as any).elective_subject;
      return Number(aElectiveId) === Number(electiveId);
    });
  }

  const getElectiveAssignmentKey = (electiveId: number) => `elective-${electiveId}`

  const startEditingElective = (electiveId: number) => {
    const key = getElectiveAssignmentKey(electiveId)
    setEditingElectives(prev => new Set(prev).add(key))
  }

  const cancelEditingElective = (electiveId: number) => {
    const key = getElectiveAssignmentKey(electiveId)
    setEditingElectives(prev => {
      const newSet = new Set(prev)
      newSet.delete(key)
      return newSet
    })
  }

  const isEditingElective = (electiveId: number) => {
    const key = getElectiveAssignmentKey(electiveId)
    return editingElectives.has(key)
  }

  async function assignElective(electiveId:number, staffId:number, existingAssignmentId?: number){
    if (!staffId) {
      alert('Select staff')
      return Promise.reject('No staff selected')
    }
    
    try {
      if (existingAssignmentId) {
        // Update existing assignment
        const payload = { staff_id: Number(staffId), is_active: true }
        const res = await fetchWithAuth(`/api/academics/teaching-assignments/${existingAssignmentId}/`, { 
          method: 'PATCH', 
          body: JSON.stringify(payload) 
        })
        if (res.ok) { 
          alert('Updated successfully'); 
          fetchData(true);
          return Promise.resolve()
        } else { 
          const txt = await res.text(); 
          alert('Error: ' + txt);
          return Promise.reject(txt)
        }
      } else {
        // Create new assignment
        const payload = { elective_subject_id: electiveId, staff_id: Number(staffId), is_active: true }
        const res = await fetchWithAuth('/api/academics/teaching-assignments/', { 
          method: 'POST', 
          body: JSON.stringify(payload) 
        })
        if (res.ok) { 
          alert('Assigned successfully'); 
          fetchData(true);
          return Promise.resolve()
        } else { 
          const txt = await res.text(); 
          alert('Error: ' + txt);
          return Promise.reject(txt)
        }
      }
    } catch (error) {
      alert('Error: ' + error);
      return Promise.reject(error)
    }
  }

  // Bulk edit functions
  const startBulkEditing = () => {
    const bulkKeys = new Set<string>();
    // Show all sections - department filter only affects staff dropdown
    const visibleSections = sections
    visibleSections.forEach(section => {
      const sectionSubjects = getSectionSubjects(section);
      sectionSubjects.forEach(subject => {
        const key = getAssignmentKey(section.id, subject.id);
        bulkKeys.add(key);
      });
    });
    setEditingAssignments(bulkKeys);
    setIsBulkEditMode(true);
  }

  const cancelBulkEditing = () => {
    setEditingAssignments(new Set());
    setIsBulkEditMode(false);
  }

  const saveBulkEditing = async () => {
    let successCount = 0;
    let failureCount = 0;
    
    try {
      // Show all sections - department filter only affects staff dropdown
      const visibleSections = sections
      for (const section of visibleSections) {
        const sectionSubjects = getSectionSubjects(section);

        for (const subject of sectionSubjects) {
          const staffSel = document.getElementById(`staff-${section.id}-${subject.id}`) as HTMLSelectElement;
          if (!staffSel?.value) continue;

          const existingAssignment = findExistingAssignment(section.id, subject.id);
          
          try {
            if (existingAssignment) {
              const payload = { 
                staff_id: Number(staffSel.value), 
                is_active: true 
              };
              const res = await fetchWithAuth(`/api/academics/teaching-assignments/${existingAssignment.id}/`, { 
                method: 'PATCH', 
                body: JSON.stringify(payload) 
              });
              if (res.ok) {
                successCount++;
              } else {
                failureCount++;
              }
            } else {
              const payload = { 
                section_id: section.id, 
                staff_id: Number(staffSel.value), 
                curriculum_row_id: subject.id, 
                is_active: true 
              };
              const res = await fetchWithAuth('/api/academics/teaching-assignments/', { 
                method: 'POST', 
                body: JSON.stringify(payload) 
              });
              if (res.ok) {
                successCount++;
              } else {
                failureCount++;
              }
            }
          } catch (e) {
            failureCount++;
          }
        }
      }

      if (successCount > 0 || failureCount === 0) {
        if (failureCount === 0) {
          alert(`Successfully updated ${successCount} assignment(s)`);
        } else {
          alert(`Updated ${successCount} assignment(s) with ${failureCount} failure(s)`);
        }
        setEditingAssignments(new Set());
        setIsBulkEditMode(false);
        fetchData();
      } else {
        alert('Failed to update assignments');
      }
    } catch (error) {
      console.error('Bulk save error:', error);
      alert('Error saving bulk assignments');
    }
  }

  // Bulk elective edit functions
  const startBulkElectiveEditing = () => {
    const bulkElectiveKeys = new Set<string>();
    getFilteredElectiveParents().forEach(parent => {
      electiveOptions
        .filter((e: any) => e.parent === parent.id && !e.is_cross_department)
        .forEach((opt: any) => {
          const key = getElectiveAssignmentKey(opt.id);
          bulkElectiveKeys.add(key);
        });
    });
    setEditingElectives(bulkElectiveKeys);
    setIsBulkElectiveEditMode(true);
  }

  const cancelBulkElectiveEditing = () => {
    setEditingElectives(new Set());
    setIsBulkElectiveEditMode(false);
  }

  const saveBulkElectiveEditing = async () => {
    if (!canAssignElectives) {
      alert('No permission to assign electives');
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    
    try {
      for (const parent of getFilteredElectiveParents()) {
        const options = electiveOptions.filter((e: any) => e.parent === parent.id);
        
        for (const opt of options) {
          // Skip cross-department electives — they are read-only for this department
          if (opt.is_cross_department) continue;
          const staffSel = document.getElementById(`elective-staff-${opt.id}`) as HTMLSelectElement;
          if (!staffSel?.value) continue;

          const existingElectiveAssignment = findExistingElectiveAssignment(opt.id);
          
          try {
            if (existingElectiveAssignment) {
              const payload = { staff_id: Number(staffSel.value), is_active: true };
              const res = await fetchWithAuth(`/api/academics/teaching-assignments/${existingElectiveAssignment.id}/`, { 
                method: 'PATCH', 
                body: JSON.stringify(payload) 
              });
              if (res.ok) {
                successCount++;
              } else {
                failureCount++;
              }
            } else {
              const payload = { elective_subject_id: opt.id, staff_id: Number(staffSel.value), is_active: true };
              const res = await fetchWithAuth('/api/academics/teaching-assignments/', { 
                method: 'POST', 
                body: JSON.stringify(payload) 
              });
              if (res.ok) {
                successCount++;
              } else {
                failureCount++;
              }
            }
          } catch (e) {
            failureCount++;
          }
        }
      }

      if (successCount > 0 || failureCount === 0) {
        if (failureCount === 0) {
          alert(`Successfully updated ${successCount} elective assignment(s)`);
        } else {
          alert(`Updated ${successCount} elective assignment(s) with ${failureCount} failure(s)`);
        }
        setEditingElectives(new Set());
        setIsBulkElectiveEditMode(false);
        fetchData();
      } else {
        alert('Failed to update elective assignments');
      }
    } catch (error) {
      console.error('Bulk elective save error:', error);
      alert('Error saving bulk elective assignments');
    }
  }

  if (loading) return (
    <div style={{ padding: '28px', minHeight: '100vh', background: 'linear-gradient(180deg, #f7fbff 0%, #ffffff 60%)' }}>
      <div style={{ padding: '16px', borderRadius: '8px', background: '#fff', border: '1px solid rgba(15,23,42,0.04)', color: '#6b7280' }}>
        Loading teaching assignments…
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Teaching Assign</h1>
                <p className="text-gray-600">Assign faculty to courses and sections</p>
              </div>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              title="Refresh — clears cached data and reloads"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        {departments.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Filters</h3>
            <div className="flex flex-wrap gap-4">
              {departments.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Department:</span>
                  <select
                    value={selectedDept ?? ''}
                    onChange={e => setSelectedDept(e.target.value ? Number(e.target.value) : null)}
                    className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Departments</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.short_name || d.code || d.name || `Dept ${d.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assignment Table */}
        {showCourseAssignments && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Course Assignments</h3>
            </div>
            {!isBulkEditMode ? (
              <button
                onClick={startBulkEditing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-2 border border-blue-600"
                title="Edit all subjects for the department"
              >
                <Edit className="h-4 w-4" />
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={saveBulkEditing}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm flex items-center gap-2 border border-green-600"
                  title="Save all assignments"
                >
                  <Save className="h-4 w-4" />
                  Save All
                </button>
                <button
                  onClick={cancelBulkEditing}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm flex items-center gap-2 border border-red-600"
                  title="Cancel bulk edit"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            )}
          </div>
          
          {(() => {
            // Show all sections - department filter only affects staff dropdown
            const visibleSections = sections
            if (visibleSections.length === 0) return (
              <div className="text-center py-8">
                <div className="text-gray-500 text-sm">
                  No sections available for the selected filters.
                </div>
              </div>
            )
            return (
            <div className="space-y-6">
              {visibleSections.map(section => {
                const sectionSubjects = getSectionSubjects(section);
                
                return (
                  <div key={section.id} className="border border-gray-200 rounded-lg p-4">
                    {/* Section Header */}
                    <div className={`rounded-lg p-4 mb-4 ${section.department_id === null && section.department_short_name === null ? 'bg-amber-50' : 'bg-blue-50'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className={`text-lg font-semibold ${section.department_id === null && section.department_short_name === null ? 'text-amber-900' : 'text-blue-900'}`}>
                            {section.department_id === null && section.department_short_name === null
                              ? `S&H (Year-1) · ${section.batch} · ${section.name}`
                              : [section.department_short_name || section.department?.code, section.batch, section.name].filter(Boolean).join(' · ')}
                          </h4>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-blue-700 text-sm">
                              Semester: {section.semester || 'Not specified'}
                            </p>
                            {section.batch_regulation && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                                Regulation: {section.batch_regulation.code}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-blue-600 text-sm font-medium">
                          Section ID: {section.id}
                        </div>
                      </div>
                    </div>

                    {/* Subjects Table */}
                    {sectionSubjects.length === 0 ? (
                      <div className="text-gray-500 text-sm py-4">
                        No subjects available for this section.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Subject Code</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Subject Name</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Assigned Staff</th>
                              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {sectionSubjects.map(subject => {
                              const existingAssignment = findExistingAssignment(section.id, subject.id);
                              const editing = isEditing(section.id, subject.id);
                              
                              return (
                                <tr key={`${section.id}-${subject.id}`} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3 font-medium text-gray-900">
                                    {subject.course_code || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">
                                    <div>{subject.course_name || 'Unnamed'}</div>
                                    {subject.home_dept_codes && subject.home_dept_codes.length > 0 && (
                                      <div className="text-xs text-amber-600 font-medium mt-0.5">
                                        {subject.home_dept_codes.join(', ')}
                                      </div>
                                    )}
                                    {(subject as any).is_dept_core && (
                                      <div className="text-xs text-purple-600 font-medium mt-0.5">
                                        Dept-Core
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    {editing ? (
                                      <select 
                                        id={`staff-${section.id}-${subject.id}`}
                                        defaultValue={existingAssignment?.staff_details?.id || existingAssignment?.staff || ''}
                                        className="w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="">-- select staff --</option>
                                        {staff.map(st => (
                                          <option key={st.id} value={st.id}>
                                            {st.staff_id} - {getStaffDisplayName(st)}
                                          </option>
                                        ))}
                                      </select>
                                    ) : existingAssignment ? (
                                      <div className="text-sm text-gray-900 font-medium">
                                        {existingAssignment.staff_details?.staff_id} - {getAssignmentStaffName(existingAssignment.staff_details)}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500 italic">
                                        Not assigned
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {!editing && !isBulkEditMode ? (
                                        <>
                                          <button 
                                            onClick={() => startEditing(section.id, subject.id)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-300"
                                            title="Edit Assignment"
                                          >
                                            <Edit className="h-4 w-4" />
                                          </button>
                                        </>
                                      ) : editing && !isBulkEditMode ? (
                                        <>
                                          <button 
                                            onClick={() => {
                                              const staffSel = document.getElementById(`staff-${section.id}-${subject.id}`) as HTMLSelectElement;
                                              if (!staffSel?.value) return alert('Select staff member');
                                              
                                              if (existingAssignment) {
                                                // Update existing assignment
                                                const payload = { 
                                                  staff_id: Number(staffSel.value), 
                                                  is_active: true 
                                                };
                                                
                                                fetchWithAuth(`/api/academics/teaching-assignments/${existingAssignment.id}/`, { 
                                                  method: 'PATCH', 
                                                  body: JSON.stringify(payload) 
                                                })
                                                .then(res => {
                                                  if (res.ok) {
                                                    alert('Updated successfully');
                                                    cancelEditing(section.id, subject.id);
                                                    fetchData();
                                                  } else {
                                                    res.text().then(txt => alert('Error: ' + txt));
                                                  }
                                                });
                                              } else {
                                                // Create new assignment
                                                const payload = { 
                                                  section_id: section.id, 
                                                  staff_id: Number(staffSel.value), 
                                                  curriculum_row_id: subject.id, 
                                                  is_active: true 
                                                };
                                                
                                                fetchWithAuth('/api/academics/teaching-assignments/', { 
                                                  method: 'POST', 
                                                  body: JSON.stringify(payload) 
                                                })
                                                .then(res => {
                                                  if (res.ok) {
                                                    alert('Assigned successfully');
                                                    cancelEditing(section.id, subject.id);
                                                    fetchData();
                                                  } else {
                                                    res.text().then(txt => alert('Error: ' + txt));
                                                  }
                                                });
                                              }
                                            }}
                                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-green-300"
                                            title="Save Assignment"
                                          >
                                            <Save className="h-4 w-4" />
                                          </button>
                                          {!isBulkEditMode && (
                                            <>
                                              <button 
                                                onClick={() => cancelEditing(section.id, subject.id)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-300"
                                                title="Cancel"
                                              >
                                                <X className="h-4 w-4" />
                                              </button>
                                              {existingAssignment && (
                                                <button
                                                  onClick={async () => {
                                                    if (!confirm('Delete teaching assignment for this subject/section?')) return
                                                    try {
                                                      const res = await fetchWithAuth(`/api/academics/teaching-assignments/${existingAssignment.id}/`, { method: 'DELETE' })
                                                      if (!res.ok) { const txt = await res.text().catch(()=>null); alert('Failed: ' + (txt || res.status)) } else { alert('Deleted'); cancelEditing(section.id, subject.id); fetchData() }
                                                    } catch (e) { console.error(e); alert('Failed to delete') }
                                                  }}
                                                  className="p-2 text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-300"
                                                  title="Delete Assignment"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </button>
                                              )}
                                            </>
                                          )}
                                        </>
                                      ) : isBulkEditMode ? (
                                        <></>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )
          })()}
        </div>
        )}

        {/* Elective Subject Assignments */}
        {/* Dept-Core Subject Assignments */}
        {getDeptCoreParents().length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <BookOpen className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">Dept-Core Subject Assignments</h3>
          </div>
          <div className="space-y-4">
            {getDeptCoreParents().map(parent => {
              // Find shared sections that have this dept-core curriculum row
              const parentDeptId = parent.department?.id;
              const relevantSections = sections.filter(sec => {
                const secDeptId = sec.department_id ?? sec.department?.id;
                const regulationMatch = !parent.regulation || sec.batch_regulation?.code === parent.regulation;
                const semesterMatch = !parent.semester || sec.semester === parent.semester;

                // Normal core-department section, e.g. AI&DS A / batch 2025 / sem 2.
                if (parentDeptId && secDeptId === parentDeptId) {
                  return regulationMatch && semesterMatch;
                }

                // Shared S&H section fallback when the dept-core row is exposed there.
                if (sec.department_id === null && sec.department_short_name === null) {
                  return (sharedSectionCurriculum[sec.id] || []).some((row: any) => row.id === parent.id);
                }

                return false;
              });
              // Prefer staff from the subject's own department
              const deptCoreStaff = parent.department
                ? staff.filter(st =>
                    (st as any).department === parent.department.id ||
                    (st.department && (st.department as any).id === parent.department.id)
                  )
                : staff;
              return (
                <div key={parent.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="mb-4">
                    <div className="font-semibold text-gray-900">{parent.course_name || parent.course_code || 'Unnamed'}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">Dept-Core</span>
                      {parent.department && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                          {(parent.department as any).short_name || (parent.department as any).code || `Dept ${parent.department.id}`}
                        </span>
                      )}
                      {parent.regulation && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">{parent.regulation}</span>
                      )}
                      {parent.semester && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">Semester {parent.semester}</span>
                      )}
                    </div>
                  </div>
                  {relevantSections.length === 0 ? (
                    <div className="text-gray-400 text-sm py-2">No Year-1 sections found for this subject.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-white border-b border-gray-200">
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Section</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Assigned Staff</th>
                            <th className="px-4 py-2 text-center text-sm font-medium text-gray-600">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {relevantSections.map(sec => {
                            const existingAssignment = findExistingAssignment(sec.id, parent.id);
                            const editing = isEditing(sec.id, parent.id);
                            return (
                              <tr key={sec.id} className="hover:bg-white/60">
                                <td className="px-4 py-2 text-sm text-gray-700">
                                  {[sec.batch, sec.name].filter(Boolean).join(' · ')}
                                </td>
                                <td className="px-4 py-2">
                                  {editing ? (
                                    <select
                                      id={`staff-${sec.id}-${parent.id}`}
                                      defaultValue={existingAssignment?.staff_details?.id ?? (existingAssignment?.staff as any) ?? ''}
                                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    >
                                      <option value="">-- select staff --</option>
                                      {(deptCoreStaff.length > 0 ? deptCoreStaff : staff).map(st => (
                                        <option key={st.id} value={st.id}>{st.staff_id} - {getStaffDisplayName(st)}</option>
                                      ))}
                                    </select>
                                  ) : existingAssignment ? (
                                    <span className="text-sm text-gray-900 font-medium">
                                      {existingAssignment.staff_details?.staff_id} - {getAssignmentStaffName(existingAssignment.staff_details)}
                                    </span>
                                  ) : (
                                    <span className="text-sm text-gray-400 italic">Not assigned</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  {editing ? (
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={async () => {
                                          const sel = document.getElementById(`staff-${sec.id}-${parent.id}`) as HTMLSelectElement;
                                          if (!sel?.value) return alert('Select a staff member');
                                          try {
                                            let res;
                                            if (existingAssignment) {
                                              res = await fetchWithAuth(`/api/academics/teaching-assignments/${existingAssignment.id}/`, {
                                                method: 'PATCH',
                                                body: JSON.stringify({ staff_id: Number(sel.value), is_active: true })
                                              });
                                            } else {
                                              res = await fetchWithAuth('/api/academics/teaching-assignments/', {
                                                method: 'POST',
                                                body: JSON.stringify({ section_id: sec.id, curriculum_row_id: parent.id, staff_id: Number(sel.value), is_active: true })
                                              });
                                            }
                                            if (res.ok) { cancelEditing(sec.id, parent.id); fetchData(true); }
                                            else { const txt = await res.text(); alert('Error: ' + txt); }
                                          } catch (e) { alert('Error: ' + e); }
                                        }}
                                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg border border-green-300"
                                        title="Save"
                                      >
                                        <Save className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => cancelEditing(sec.id, parent.id)}
                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg border border-red-300"
                                        title="Cancel"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                      {existingAssignment && (
                                        <button
                                          onClick={async () => {
                                            if (!confirm('Remove this dept-core staff assignment?')) return;
                                            try {
                                              const res = await fetchWithAuth(`/api/academics/teaching-assignments/${existingAssignment.id}/`, { method: 'DELETE' });
                                              if (res.ok) { cancelEditing(sec.id, parent.id); fetchData(true); }
                                              else { alert('Failed to delete'); }
                                            } catch (e) { alert('Error: ' + e); }
                                          }}
                                          className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg border border-red-300"
                                          title="Delete Assignment"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => startEditing(sec.id, parent.id)}
                                      className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg border border-purple-300"
                                      title="Assign Staff"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Elective Subject Assignments */}
        {canViewElectives && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Elective Subject Assignments</h3>
            {!isBulkElectiveEditMode ? (
              <button
                onClick={startBulkElectiveEditing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center justify-center gap-2 border border-blue-600 whitespace-nowrap"
                title="Edit all electives"
              >
                <Edit className="h-4 w-4" />
                Edit
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={saveBulkElectiveEditing}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm flex items-center gap-2 border border-green-600 whitespace-nowrap"
                  title="Save all elective assignments"
                >
                  <Save className="h-4 w-4" />
                  Save All
                </button>
                <button
                  onClick={cancelBulkElectiveEditing}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm flex items-center gap-2 border border-red-600 whitespace-nowrap"
                  title="Cancel bulk edit"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            )}
          </div>
          
          {/* Department Filter Buttons */}
          {userDepartments.length > 1 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Filter by Department</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedElectiveDept(null)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedElectiveDept === null
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Departments
                </button>
                {userDepartments.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedElectiveDept(d.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedElectiveDept === d.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {d.short_name || d.code || d.name || `Dept ${d.id}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Regulation and Semester Filters */}
          <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4">
            {/* Regulation Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Regulation:</span>
              <select
                value={selectedElectiveRegulation || ''}
                onChange={e => setSelectedElectiveRegulation(e.target.value || null)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Regulations</option>
                {getUniqueElectiveRegulations().map(reg => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Semester:</span>
              <select
                value={selectedElectiveSemester || ''}
                onChange={e => setSelectedElectiveSemester(e.target.value ? Number(e.target.value) : null)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Semesters</option>
                {getUniqueElectiveSemesters().map(sem => (
                  <option key={sem} value={sem}>
                    Semester {sem}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {getFilteredElectiveParents().length === 0 ? (
              <div className="text-gray-500 text-sm">No elective parents found for the selected filters.</div>
            ) : (
              getFilteredElectiveParents().map(parent => (
                <div key={parent.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <div className="font-semibold text-gray-900">{parent.course_name || parent.course_code || 'Elective'}</div>
                      <div className="flex items-center gap-3 mt-1">
                        {(parent as any).is_dept_core && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                            Dept-Core
                          </span>
                        )}
                        {parent.regulation && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {parent.regulation}
                          </span>
                        )}
                        {parent.semester && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                            Semester {parent.semester}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      // Get own electives matching this parent by parent ID.
                      // When parent comes from a shared section it has no 'department' field;
                      // rely on parent.id (CurriculumDepartment PK) uniqueness instead.
                      const ownElectives = (electiveOptions || []).filter((e: any) => 
                        e.parent === parent.id && 
                        !e.is_cross_department &&
                        // Only add dept check when parent has explicit department info
                        (!parent.department || !e.department || e.department.id === parent.department.id)
                      );
                      // Get cross-dept electives matching this parent by name, regulation, and semester
                      // This ensures we only show shared electives that belong to the same curriculum context
                      const parentName = (parent.course_name || parent.course_code || '').toLowerCase();
                      const crossDeptElectives = (electiveOptions || []).filter((e: any) => 
                        e.is_cross_department && 
                        e.parent_name && 
                        e.parent_name.toLowerCase() === parentName &&
                        e.regulation === parent.regulation &&
                        e.semester === parent.semester
                      );
                      // Deduplicate: cross-dept electives shouldn't appear in own list
                      const allElectives = [
                        ...ownElectives,
                        ...crossDeptElectives.filter(ce => !ownElectives.some(oe => oe.id === ce.id))
                      ];
                      if (allElectives.length === 0) {
                        return <div className="text-gray-400 text-sm py-2">No elective subjects added yet.</div>;
                      }
                      return allElectives.map((opt: any) => {
                      const existingElectiveAssignment = findExistingElectiveAssignment(opt.id);
                      const editingElective = isEditingElective(opt.id);
                      return (
                        <div key={opt.id} className={`flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border border-gray-200 ${opt.is_cross_department ? 'bg-blue-50/30' : 'bg-white'}`}>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                              <span>{opt.course_code || '-'} — {opt.course_name || '-'}</span>
                              {opt.is_cross_department && opt.owner_department_name && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" title={`Shared from ${opt.owner_department_name}`}>
                                  {opt.owner_department_name.split(' - ')[1] || opt.owner_department_name.split(' - ')[0] || 'Shared'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full md:min-w-[200px] md:w-auto">
                            {opt.is_cross_department ? (
                              // Cross-dept electives are read-only — managed by the owning department
                              existingElectiveAssignment ? (
                                <div className="text-sm text-gray-900 font-medium">
                                  {existingElectiveAssignment.staff_details?.staff_id} - {getAssignmentStaffName(existingElectiveAssignment.staff_details)}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-400 italic">Managed by {opt.owner_department_name?.split(' - ')[1] || opt.owner_department_name?.split(' - ')[0] || 'owner dept'}</div>
                              )
                            ) : editingElective ? (
                              <select 
                                id={`elective-staff-${opt.id}`}
                                defaultValue={existingElectiveAssignment?.staff_details?.id || existingElectiveAssignment?.staff || ''}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">-- select staff --</option>
                                {getFilteredStaffForElective().map(st => (<option key={st.id} value={st.id}>{st.staff_id} - {getStaffDisplayName(st)}</option>))}
                              </select>
                            ) : existingElectiveAssignment ? (
                              <div className="text-sm text-gray-900 font-medium">
                                {existingElectiveAssignment.staff_details?.staff_id} - {getAssignmentStaffName(existingElectiveAssignment.staff_details)}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 italic">
                                Not assigned
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 justify-end md:justify-start">
                            {opt.is_cross_department ? (
                              // No edit actions for cross-dept electives
                              <span className="text-xs text-gray-400 italic">View only</span>
                            ) : !editingElective && !isBulkElectiveEditMode ? (
                              <>
                                <button 
                                  onClick={() => startEditingElective(opt.id)}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-300"
                                  title="Edit Assignment"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                              </>
                            ) : editingElective && !isBulkElectiveEditMode ? (
                              <>
                                <button 
                                  disabled={!canAssignElectives}
                                  onClick={() => {
                                    if (!canAssignElectives) return alert('No permission to assign electives');
                                    const staffSel = document.getElementById(`elective-staff-${opt.id}`) as HTMLSelectElement;
                                    if (!staffSel?.value) return alert('Select staff member');
                                    assignElective(opt.id, Number(staffSel.value), existingElectiveAssignment?.id)
                                      .then(() => { cancelEditingElective(opt.id); })
                                      .catch(() => {});
                                  }}
                                  className={`p-2 rounded-lg transition-colors ${
                                    canAssignElectives 
                                      ? 'text-green-600 hover:bg-green-50 border border-green-300' 
                                      : 'text-gray-400 bg-gray-100 cursor-not-allowed border border-gray-300'
                                  }`}
                                  title={canAssignElectives ? 'Save Assignment' : 'No permission'}
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                                {!isBulkElectiveEditMode && (
                                  <>
                                    <button 
                                      onClick={() => cancelEditingElective(opt.id)}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-300"
                                      title="Cancel"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                    {existingElectiveAssignment && (
                                      <button
                                        onClick={async () => {
                                          if (!confirm('Delete elective teaching assignment for this option?')) return
                                          try {
                                            const res = await fetchWithAuth(`/api/academics/teaching-assignments/${existingElectiveAssignment.id}/`, { method: 'DELETE' })
                                            if (!res.ok) { const txt = await res.text().catch(()=>null); alert('Failed: ' + (txt || res.status)) } else { alert('Deleted'); cancelEditingElective(opt.id); fetchData() }
                                          } catch (e) { console.error(e); alert('Failed to delete') }
                                        }}
                                        className="p-2 text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-300"
                                        title="Delete Assignment"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </>
                            ) : isBulkElectiveEditMode ? (
                              <></>
                            ) : null}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  </div>
                </div>
              ))
            )}

            {/* Cross-dept electives with no matching parent in this dept */}
            {(() => {
              const deptParentNames = electiveParents.map(p => (p.course_name || p.course_code || '').toLowerCase());
              const deptParentIds = electiveParents.map(p => p.id);
              const orphanedCross = (electiveOptions || []).filter((e: any) =>
                e.is_cross_department &&
                !deptParentIds.includes(e.parent) &&
                (!e.parent_name || !deptParentNames.includes(e.parent_name.toLowerCase()))
              );
              if (orphanedCross.length === 0) return null;
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    Other Shared Electives
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">{orphanedCross.length} subject{orphanedCross.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-3">
                    {orphanedCross.map((opt: any) => {
                      const existingElectiveAssignment = findExistingElectiveAssignment(opt.id);
                      const editingElective = isEditingElective(opt.id);
                      return (
                        <div key={opt.id} className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-white rounded-lg border border-amber-200">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                              <span>{opt.course_code || '-'} — {opt.course_name || '-'}</span>
                              {opt.parent_name && <span className="text-xs text-gray-500">({opt.parent_name})</span>}
                              {opt.owner_department_name && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" title={`Shared from ${opt.owner_department_name}`}>
                                  {opt.owner_department_name.split(' - ')[1] || opt.owner_department_name.split(' - ')[0] || 'Shared'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full md:min-w-[200px] md:w-auto">
                            {editingElective ? (
                              <select id={`elective-staff-${opt.id}`} defaultValue={existingElectiveAssignment?.staff_details?.id || existingElectiveAssignment?.staff || ''} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm">
                                <option value="">-- select staff --</option>
                                {getFilteredStaffForElective().map(st => (<option key={st.id} value={st.id}>{st.staff_id} - {getStaffDisplayName(st)}</option>))}
                              </select>
                            ) : existingElectiveAssignment ? (
                              <div className="text-sm text-gray-900 font-medium">{existingElectiveAssignment.staff_details?.staff_id} - {getAssignmentStaffName(existingElectiveAssignment.staff_details)}</div>
                            ) : (
                              <div className="text-sm text-gray-500 italic">Not assigned</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
