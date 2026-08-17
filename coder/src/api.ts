/**
 * IDCS Coder - API Client
 * Reuses the existing IDCS JWT auth (same tokens, same /api/accounts/token/ endpoint)
 */
import axios from 'axios'

const API_BASE = (import.meta as any).env?.VITE_API_BASE || ''
const IDE_API_BASE = (import.meta as any).env?.VITE_IDE_API_BASE || (import.meta as any).env?.VITE_CODER_PROXY_TARGET || ''

function createApiClient(baseURL: string) {
  const client = axios.create({
    baseURL,
    timeout: 45000,
  })

  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('coder_access') || localStorage.getItem('access')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  let isRefreshing = false
  let refreshQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = []

  client.interceptors.response.use(
    (res) => res,
    async (error) => {
      const original = error.config
      if (error.response?.status === 401 && !original._retry) {
        original._retry = true
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            refreshQueue.push({ resolve, reject })
          }).then((token) => {
            original.headers.Authorization = `Bearer ${token}`
            return client(original)
          })
        }
        isRefreshing = true
        try {
          const refresh = localStorage.getItem('coder_refresh') || localStorage.getItem('refresh')
          if (!refresh) throw new Error('no refresh token')
          const res = await axios.post(`${API_BASE}/api/accounts/token/refresh/`, { refresh })
          const newAccess = res.data.access
          localStorage.setItem('coder_access', newAccess)
          localStorage.setItem('access', newAccess)
          refreshQueue.forEach(({ resolve }) => resolve(newAccess))
          refreshQueue = []
          original.headers.Authorization = `Bearer ${newAccess}`
          return client(original)
        } catch (e) {
          refreshQueue.forEach(({ reject }) => reject(e))
          refreshQueue = []
          localStorage.removeItem('coder_access')
          localStorage.removeItem('coder_refresh')
          localStorage.removeItem('access')
          localStorage.removeItem('refresh')
          window.location.href = '/login'
          return Promise.reject(e)
        } finally {
          isRefreshing = false
        }
      }
      return Promise.reject(error)
    }
  )

  return client
}

export const api = createApiClient(API_BASE)
export const ideApi = createApiClient(IDE_API_BASE || API_BASE)

// ── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  access: string
  refresh: string
}

export interface CoderUser {
  user_id: number
  username: string
  email: string
  full_name: string
  coder_role: 'CODE_ADMIN' | 'CODE_COURSE_INCHARGE' | 'CODE_SECTION_INCHARGE' | 'STUDENT' | null
  student_profile?: {
    reg_no: string
    section: string | null
  }
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const res = await axios.post(`${API_BASE}/api/accounts/token/`, { identifier, password })
  return res.data
}

export function saveTokens(data: LoginResponse) {
  localStorage.setItem('coder_access', data.access)
  localStorage.setItem('coder_refresh', data.refresh)
  // Also keep in main IDCS keys for shared usage
  localStorage.setItem('access', data.access)
  localStorage.setItem('refresh', data.refresh)
}

export function clearTokens() {
  localStorage.removeItem('coder_access')
  localStorage.removeItem('coder_refresh')
  localStorage.removeItem('access')
  localStorage.removeItem('refresh')
}

export async function fetchCoderMe(): Promise<CoderUser> {
  const res = await api.get('/api/coder/me/')
  return res.data
}

// ── Courses ─────────────────────────────────────────────────────────────────

export const coursesApi = {
  // Admin
  adminList: (params?: { status?: string }) => api.get('/api/coder/admin/courses/', { params }),
  adminGet: (id: number) => api.get(`/api/coder/admin/courses/${id}/`),
  adminCreate: (data: Record<string, unknown>) => api.post('/api/coder/admin/courses/', data),
  adminUpdate: (id: number, data: Record<string, unknown>) => api.put(`/api/coder/admin/courses/${id}/`, data),
  adminDelete: (id: number) => api.delete(`/api/coder/admin/courses/${id}/`),
  adminAnalytics: () => api.get('/api/coder/admin/analytics/'),

  // Incharge
  list: () => api.get('/api/coder/courses/'),
  get: (id: number) => api.get(`/api/coder/courses/${id}/`),

  // Student
  studentList: () => api.get('/api/coder/student/courses/'),
  studentGet: (id: number) => api.get(`/api/coder/student/courses/${id}/`),
}

// ── Incharge management ──────────────────────────────────────────────────────

export const inchargesApi = {
  list: (courseId?: number) => api.get('/api/coder/admin/course-incharges/', { params: courseId ? { course_id: courseId } : {} }),
  create: (data: Record<string, unknown>) => api.post('/api/coder/admin/course-incharges/', data),
  remove: (id: number) => api.delete(`/api/coder/admin/course-incharges/?id=${id}`),
}

// ── Classes ──────────────────────────────────────────────────────────────────

export const classesApi = {
  list: (courseId?: number) => api.get('/api/coder/admin/classes/', { params: courseId ? { course_id: courseId } : {} }),
  get: (id: number) => api.get(`/api/coder/admin/classes/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/api/coder/admin/classes/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/coder/admin/classes/${id}/`, data),
  syncEnrollments: (classId: number) => api.post('/api/coder/admin/enrollments/sync/', { class_id: classId }),
  fetchSections: () => api.get('/api/coder/admin/sections/'),
  searchUsers: (q: string) => api.get('/api/coder/admin/users/search/', { params: { q } }),
  sectionIncharges: (classId?: number) => api.get('/api/coder/admin/section-incharges/', { params: classId ? { class_id: classId } : {} }),
  assignSectionIncharge: (data: Record<string, unknown>) => api.post('/api/coder/admin/section-incharges/', data),
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export const sessionsApi = {
  list: (courseId: number) => api.get('/api/coder/sessions/', { params: { course_id: courseId } }),
  get: (id: number) => api.get(`/api/coder/sessions/${id}/`),
  studentGet: (id: number) => api.get(`/api/coder/student/sessions/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/api/coder/sessions/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/coder/sessions/${id}/`, data),
  delete: (id: number) => api.delete(`/api/coder/sessions/${id}/`),
}

// ── Assessments ──────────────────────────────────────────────────────────────

export const assessmentsApi = {
  list: (sessionId: number) => api.get('/api/coder/assessments/', { params: { session_id: sessionId } }),
  get: (id: number) => api.get(`/api/coder/assessments/${id}/`),
  studentList: (sessionId: number) => api.get(`/api/coder/student/sessions/${sessionId}/assessments/`),
  create: (data: Record<string, unknown>) => api.post('/api/coder/assessments/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/coder/assessments/${id}/`, data),
  delete: (id: number) => api.delete(`/api/coder/assessments/${id}/`),

  // Student
  studentGet: (id: number) => api.get(`/api/coder/student/assessments/${id}/`),
  submitMCQ: (assessmentId: number, answers: Record<string, string>) =>
    api.post(`/api/coder/student/assessments/${assessmentId}/mcq/submit/`, { answers }),
  runCode: (assessmentId: number, files: Record<string, string>, language: string) =>
    ideApi.post(`/api/coder/student/assessments/${assessmentId}/run/`, { files, language }),
  submitCode: (assessmentId: number, files: Record<string, string>, language: string) =>
    ideApi.post(`/api/coder/student/assessments/${assessmentId}/submit/`, { files, language }),
  submissionStatus: (submissionId: number) => api.get(`/api/coder/student/submissions/${submissionId}/`),

  // Incharge submissions
  inchargeSubmissions: (assessmentId: number) => api.get('/api/coder/submissions/', { params: { assessment_id: assessmentId } }),
}

// ── MCQ ──────────────────────────────────────────────────────────────────────

export const mcqApi = {
  import: (assessmentId: number, file: File) => {
    const fd = new FormData()
    fd.append('assessment_id', String(assessmentId))
    fd.append('file', file)
    return api.post('/api/coder/mcq/import/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  list: (assessmentId: number) => api.get('/api/coder/questions/', { params: { assessment_id: assessmentId } }),
  create: (data: Record<string, unknown>) => api.post('/api/coder/questions/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/coder/questions/${id}/`, data),
  delete: (id: number) => api.delete(`/api/coder/questions/${id}/`),
}

// ── Projects / Files ─────────────────────────────────────────────────────────

export const projectsApi = {
  get: (assessmentId: number) => api.get(`/api/coder/projects/${assessmentId}/`),
  getTree: (assessmentId: number) => api.get(`/api/coder/projects/${assessmentId}/tree/`),
  create: (assessmentId: number, data: Record<string, unknown>) => api.post(`/api/coder/projects/${assessmentId}/`, data),
  update: (assessmentId: number, data: Record<string, unknown>) => api.put(`/api/coder/projects/${assessmentId}/`, data),

  listFiles: (projectId: number) => api.get('/api/coder/files/', { params: { project_id: projectId } }),
  createFile: (data: Record<string, unknown>) => api.post('/api/coder/files/', data),
  updateFile: (id: number, data: Record<string, unknown>) => api.put(`/api/coder/files/${id}/`, data),
  deleteFile: (id: number) => api.delete(`/api/coder/files/${id}/`),

  listFolders: (projectId: number) => api.get('/api/coder/folders/', { params: { project_id: projectId } }),
  createFolder: (data: Record<string, unknown>) => api.post('/api/coder/folders/', data),
  updateFolder: (id: number, data: Record<string, unknown>) => api.put(`/api/coder/folders/${id}/`, data),
  deleteFolder: (id: number) => api.delete(`/api/coder/folders/${id}/`),

  addLockedRegion: (data: Record<string, unknown>) => api.post('/api/coder/locked-regions/', data),
  removeLockedRegion: (id: number) => api.delete(`/api/coder/locked-regions/${id}/`),
  importZip: (projectId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/api/coder/projects/${projectId}/import-zip/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
}

export const templatesApi = {
  list: () => api.get('/api/coder/templates/'),
  apply: (projectId: number, templateId: string) => api.post(`/api/coder/projects/${projectId}/apply-template/`, { template_id: templateId }),
}

// ── Test Cases ───────────────────────────────────────────────────────────────

export const testCasesApi = {
  list: (assessmentId: number) => api.get('/api/coder/testcases/', { params: { assessment_id: assessmentId } }),
  create: (data: Record<string, unknown>) => api.post('/api/coder/testcases/', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/coder/testcases/${id}/`, data),
  delete: (id: number) => api.delete(`/api/coder/testcases/${id}/`),
}

// ── Student ──────────────────────────────────────────────────────────────────

export const studentApi = {
  dashboard: () => api.get('/api/coder/student/dashboard/'),
  progress: (courseId: number) => api.get(`/api/coder/student/progress/${courseId}/`),
}

// ── Section Incharge ─────────────────────────────────────────────────────────

export const sectionApi = {
  myClasses: () => api.get('/api/coder/section/classes/'),
  students: (classId: number) => api.get(`/api/coder/section/classes/${classId}/students/`),
  studentDetail: (classId: number, studentId: number) => api.get(`/api/coder/section/classes/${classId}/students/${studentId}/`),
  analytics: (classId: number) => api.get(`/api/coder/section/classes/${classId}/analytics/`),
}

// ── Execution Sessions (Web Preview) ─────────────────────────────────────────

export const executionsApi = {
  start: (assessmentId: number, files: Record<string, string>) =>
    ideApi.post(`/api/coder/student/assessments/${assessmentId}/execute/`, { files }),
  status: (sessionId: number) =>
    ideApi.get(`/api/coder/executions/${sessionId}/`),
  stop: (sessionId: number) =>
    ideApi.post(`/api/coder/executions/${sessionId}/stop/`),
  logs: (sessionId: number) =>
    ideApi.get(`/api/coder/executions/${sessionId}/logs/`),
}
