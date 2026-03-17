import axios, { AxiosHeaders } from 'axios'
import { getApiBase, getApiBaseCandidates } from './apiBase'

const BASE = `${getApiBase()}/api/accounts/`

if (import.meta.env.DEV) {
  // Helps diagnose login issues caused by incorrect API host/port.
  // Example: opening the UI on a different machine while API base points to localhost.
  console.info('[auth] API base:', BASE)
}

// Create an axios instance used across the app so we can centrally handle
// automatic access-token refresh on 401 responses.
// Default request timeout (ms) for API calls — configurable via VITE_API_TIMEOUT.
// Keep this reasonably high so login doesn't show '(canceled)' on slightly slow backends.
const DEFAULT_API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 45000
export const apiClient = axios.create({ baseURL: BASE, timeout: DEFAULT_API_TIMEOUT })
const LOGIN_API_TIMEOUT = Math.max(
  Number(import.meta.env.VITE_LOGIN_TIMEOUT) || 60000,
  DEFAULT_API_TIMEOUT,
)
const REFRESH_API_TIMEOUT = Math.max(
  Number(import.meta.env.VITE_REFRESH_TIMEOUT) || 45000,
  DEFAULT_API_TIMEOUT,
)

let isRefreshing = false
let refreshSubscribers: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

  const refreshUrls = Array.from(
    new Set(
      getApiBaseCandidates().map((base) => `${base}/api/accounts/token/refresh/`),
    ),
  )

  let lastError: unknown = null

  for (const refreshUrl of refreshUrls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await axios.post(
          refreshUrl,
          { refresh },
          { timeout: REFRESH_API_TIMEOUT },
        )
        const { access, refresh: newRefresh } = res.data
        if (access) localStorage.setItem('access', access)
        if (newRefresh) localStorage.setItem('refresh', newRefresh)
        return access
      } catch (error: any) {
        lastError = error

        const status = Number(error?.response?.status || 0)
        if (status === 400 || status === 401) {
          throw error
        }

        const isTimeout =
          String(error?.code || '') === 'ECONNABORTED' ||
          String(error?.message || '').toLowerCase().includes('timeout')
        const isNetwork = !error?.response
        const isServerError = status >= 500
        const shouldRetry = attempt === 0 && (isTimeout || isNetwork || isServerError)

        if (shouldRetry) {
          await sleep(350)
          continue
        }
      }
    }
  }

  throw lastError || new Error('token refresh failed')
}

// Response interceptor: on 401, attempt refresh and retry original request.
apiClient.interceptors.response.use(
  res => res,
  async err => {
    const originalRequest = err.config
    if (err.response && err.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      if (isRefreshing) {
        // queue the request until refresh finishes
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token: string) => {
            const headers = (originalRequest.headers ?? {}) as Record<string, string>
            headers['Authorization'] = `Bearer ${token}`
            originalRequest.headers = new AxiosHeaders(headers)
            resolve(apiClient(originalRequest))
          }, reject)
        })
      }

      isRefreshing = true
      try {
        const newAccess = await refreshToken()
        onRefreshSuccess(newAccess)
        const headers = (originalRequest.headers ?? {}) as Record<string, string>
        headers['Authorization'] = `Bearer ${newAccess}`
        originalRequest.headers = new AxiosHeaders(headers)
        return apiClient(originalRequest)
      } catch (refreshErr) {
        onRefreshFailure(refreshErr)
        // refresh failed -> logout silently
        // Only log in development mode
        if (import.meta.env.DEV) {
          console.warn('Token refresh failed, logging out')
        }
        logout()
        // Redirect to login page
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            try { window.location.href = '/login' } catch (_) {}
          }, 50)
        }
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }
    // Don't log 401 errors - they're handled by the refresh mechanism
    // For production, only reject without noisy console logs
    return Promise.reject(err)
  }
)

export async function login(identifier: string, password: string){
  // Clear any stale cached profile/role state before establishing a new session.
  // (Fixes cases where old HOD roles linger for IQAC users.)
  try {
    localStorage.removeItem('roles')
    localStorage.removeItem('permissions')
    localStorage.removeItem('me')
    localStorage.removeItem('role')
  } catch {
    // ignore
  }

  let res
  try {
    res = await apiClient.post('token/', { identifier, password }, { timeout: LOGIN_API_TIMEOUT })
  } catch (err: any) {
    const isTimeout =
      String(err?.code || '') === 'ECONNABORTED' ||
      String(err?.message || '').toLowerCase().includes('timeout')
    if (!isTimeout) throw err
    res = await apiClient.post('token/', { identifier, password }, { timeout: LOGIN_API_TIMEOUT })
  }
  const { access, refresh } = res.data
  localStorage.setItem('access', access)
  localStorage.setItem('refresh', refresh)
  // prefetch user info (roles/permissions) after login
  try{
    // fetch profile asynchronously so login isn't blocked by potentially slow `me/` endpoint
    getMe().catch(() => { /* ignore */ })
  }catch(err){
    // ignore - caller will handle missing profile
  }
  return res.data
}

export function derivePrimaryRole(roles: unknown): string {
  const list = Array.isArray(roles) ? roles : []
  const normalized = list
    .map((r: any) => (typeof r === 'string' ? r : r?.name))
    .map((r: any) => String(r || '').trim().toUpperCase())
    .filter(Boolean)

  // Prefer IQAC when present so multi-role users default correctly.
  if (normalized.includes('IQAC')) return 'IQAC'
  return normalized[0] || ''
}

export function logout(){
  localStorage.removeItem('access')
  localStorage.removeItem('refresh')
  localStorage.removeItem('roles')
  localStorage.removeItem('permissions')
  localStorage.removeItem('me')
}

// Attach access token to outgoing requests
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('access')
    if (token) {
      const headers = (config.headers ?? {}) as Record<string, string>
      headers['Authorization'] = `Bearer ${token}`
      config.headers = new AxiosHeaders(headers)
    }
  return config
})

export async function getMe(){
  const token = localStorage.getItem('access')
  if (!token) {
    throw new Error('no access token')
  }
  const res = await apiClient.get('me/')
  const me = res.data
  const primaryRole = derivePrimaryRole(me?.roles)
  if (primaryRole) {
    me.role = primaryRole
  }
  try{
    // persist roles and permissions for easy access by UI
    localStorage.setItem('roles', JSON.stringify(me.roles || []))
    localStorage.setItem('permissions', JSON.stringify(me.permissions || []))
    localStorage.setItem('me', JSON.stringify(me || null))
    if (primaryRole) localStorage.setItem('role', primaryRole)
  }catch(e){
    // ignore storage errors
  }
  return me
}

export function getCachedMe(): any | null {
  try {
    const raw = localStorage.getItem('me')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function isMobileVerifiedCached(): boolean {
  const me = getCachedMe()
  return Boolean(me?.profile?.mobile_verified)
}

export function hasProfilePhotoCached(): boolean {
  const me = getCachedMe()
  const candidates = [
    String(me?.profile_image ?? '').trim(),
    String(me?.profile?.profile_image ?? '').trim(),
    String(me?.profile_image_url ?? '').trim(),
    String(me?.profile?.profile_image_url ?? '').trim(),
  ]
  return candidates.some((v) => Boolean(v))
}

export async function ensureProfilePhotoPresent(): Promise<boolean> {
  if (hasProfilePhotoCached()) return true
  try {
    const me = await getMe()
    const candidates = [
      String((me as any)?.profile_image ?? '').trim(),
      String((me as any)?.profile?.profile_image ?? '').trim(),
      String((me as any)?.profile_image_url ?? '').trim(),
      String((me as any)?.profile?.profile_image_url ?? '').trim(),
    ]
    return candidates.some((v) => Boolean(v))
  } catch {
    return false
  }
}

export async function ensureMobileVerified(): Promise<boolean> {
  if (isMobileVerifiedCached()) return true
  try {
    const me = await getMe()
    return Boolean(me?.profile?.mobile_verified)
  } catch {
    return false
  }
}

export async function requestMobileOtp(mobile_number: string) {
  const res = await apiClient.post('mobile/request-otp/', { mobile_number })
  return res.data
}

export async function verifyMobileOtp(mobile_number: string, otp: string) {
  const res = await apiClient.post('mobile/verify-otp/', { mobile_number, otp })
  return res.data
}

export async function removeMobileNumber(password: string){
  const res = await apiClient.post('mobile/remove/', { password })
  return res.data
}

export async function changePassword(current_password: string, new_password: string, confirm_password: string) {
  const res = await apiClient.post('change-password/', { current_password, new_password, confirm_password })
  return res.data
}