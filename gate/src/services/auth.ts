import axios, { AxiosHeaders } from 'axios'
import { getApiBase } from './apiBase'

const API_ROOT = getApiBase()
const ACCOUNTS_BASE = `${API_ROOT}/api/accounts/`
const DEFAULT_API_TIMEOUT = 45000

export const apiClient = axios.create({ baseURL: API_ROOT, timeout: DEFAULT_API_TIMEOUT })
const publicClient = axios.create({ baseURL: ACCOUNTS_BASE, timeout: DEFAULT_API_TIMEOUT })

let isRefreshing = false
let refreshSubscribers: Array<{ resolve: (token: string) => void; reject: (error: unknown) => void }> = []

function subscribeTokenRefresh(resolve: (token: string) => void, reject: (error: unknown) => void) {
  refreshSubscribers.push({ resolve, reject })
}

function onRefreshSuccess(token: string) {
  refreshSubscribers.forEach(({ resolve }) => resolve(token))
  refreshSubscribers = []
}

function onRefreshFailure(error: unknown) {
  refreshSubscribers.forEach(({ reject }) => reject(error))
  refreshSubscribers = []
}

async function refreshToken(): Promise<string> {
  const refresh = localStorage.getItem('refresh')
  if (!refresh) throw new Error('no refresh token')
  const res = await axios.post(`${ACCOUNTS_BASE}token/refresh/`, { refresh }, { timeout: DEFAULT_API_TIMEOUT })
  const { access, refresh: newRefresh } = res.data || {}
  if (access) localStorage.setItem('access', access)
  if (newRefresh) localStorage.setItem('refresh', newRefresh)
  return access
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access') || localStorage.getItem('gate_access')
  if (token) {
    const headers = (config.headers ?? {}) as Record<string, string>
    headers.Authorization = `Bearer ${token}`
    config.headers = new AxiosHeaders(headers)
  }
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token: string) => {
            const headers = (originalRequest.headers ?? {}) as Record<string, string>
            headers.Authorization = `Bearer ${token}`
            originalRequest.headers = new AxiosHeaders(headers)
            resolve(apiClient(originalRequest))
          }, reject)
        })
      }

      isRefreshing = true
      try {
        const token = await refreshToken()
        onRefreshSuccess(token)
        const headers = (originalRequest.headers ?? {}) as Record<string, string>
        headers.Authorization = `Bearer ${token}`
        originalRequest.headers = new AxiosHeaders(headers)
        return apiClient(originalRequest)
      } catch (refreshError) {
        onRefreshFailure(refreshError)
        logout()
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  },
)

export type GateUser = {
  id: number
  username: string
  email?: string
  first_name?: string
  last_name?: string
  role?: string
  roles?: Array<string | { name: string }>
  permissions?: string[]
  profile_type?: string | null
  profile?: {
    reg_no?: string | null
    staff_id?: string | null
    profile_image?: string | null
    profile_image_url?: string | null
    department_name?: string | null
    mobile_verified?: boolean
  } | null
  profile_image?: string | null
  profile_image_url?: string | null
  is_superuser?: boolean
}

export interface LoginResponse {
  access: string
  refresh: string
}

export function derivePrimaryRole(roles: unknown): string {
  const list = Array.isArray(roles) ? roles : []
  const normalized = list
    .map((role: any) => (typeof role === 'string' ? role : role?.name))
    .map((role: any) => String(role || '').trim().toUpperCase())
    .filter(Boolean)
  if (normalized.includes('IQAC')) return 'IQAC'
  return normalized[0] || ''
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const res = await publicClient.post('token/', { identifier, password })
  const data = res.data as LoginResponse
  localStorage.setItem('access', data.access)
  localStorage.setItem('refresh', data.refresh)
  localStorage.setItem('gate_access', data.access)
  localStorage.setItem('gate_refresh', data.refresh)
  return data
}

export async function getMe(): Promise<GateUser> {
  const res = await apiClient.get('api/accounts/me/')
  const me = res.data as GateUser
  const primaryRole = derivePrimaryRole(me.roles)
  if (primaryRole) me.role = primaryRole
  try {
    localStorage.setItem('me', JSON.stringify(me || null))
    localStorage.setItem('role', primaryRole)
  } catch {
    // ignore storage failures
  }
  return me
}

export function getCachedMe(): GateUser | null {
  try {
    const raw = localStorage.getItem('me')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function hasProfilePhotoCached(): boolean {
  const me = getCachedMe()
  const candidates = [
    String(me?.profile_image ?? '').trim(),
    String(me?.profile?.profile_image ?? '').trim(),
    String(me?.profile_image_url ?? '').trim(),
    String(me?.profile?.profile_image_url ?? '').trim(),
  ]
  return candidates.some(Boolean)
}

export async function ensureProfilePhotoPresent(): Promise<boolean> {
  if (hasProfilePhotoCached()) return true
  try {
    const me = await getMe()
    const candidates = [
      String(me?.profile_image ?? '').trim(),
      String(me?.profile?.profile_image ?? '').trim(),
      String(me?.profile_image_url ?? '').trim(),
      String(me?.profile?.profile_image_url ?? '').trim(),
    ]
    return candidates.some(Boolean)
  } catch {
    return false
  }
}

export function logout() {
  localStorage.removeItem('access')
  localStorage.removeItem('refresh')
  localStorage.removeItem('gate_access')
  localStorage.removeItem('gate_refresh')
  localStorage.removeItem('me')
  localStorage.removeItem('role')
}
