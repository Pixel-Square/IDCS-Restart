import axios, { AxiosHeaders } from 'axios'

function apiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE
  if (fromEnv) return String(fromEnv).replace(/\/+$/, '')

  // Default to same-origin so `/api/...` works behind nginx/proxy setups.
  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = String(window.location.hostname || '').trim().toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000'
    return String(window.location.origin).replace(/\/+$/, '')
  }

  return 'https://db.krgi.co.in'
}

const BASE = `${apiBase()}/api/accounts/`

// Create an axios instance used across the app so we can centrally handle
// automatic access-token refresh on 401 responses.
// Default request timeout (ms) for API calls — configurable via VITE_API_TIMEOUT.
const DEFAULT_API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 5000
export const apiClient = axios.create({ baseURL: BASE, timeout: DEFAULT_API_TIMEOUT })

let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach(cb => cb(token))
  refreshSubscribers = []
}

async function refreshToken(): Promise<string> {
  const refresh = localStorage.getItem('refresh')
  if (!refresh) throw new Error('no refresh token')

  const res = await axios.post(`${BASE}token/refresh/`, { refresh })
  const { access, refresh: newRefresh } = res.data
  if (access) localStorage.setItem('access', access)
  if (newRefresh) localStorage.setItem('refresh', newRefresh)
  return access
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
        return new Promise(resolve => {
          subscribeTokenRefresh((token: string) => {
            const headers = (originalRequest.headers ?? {}) as Record<string, string>
            headers['Authorization'] = `Bearer ${token}`
            originalRequest.headers = new AxiosHeaders(headers)
            resolve(apiClient(originalRequest))
          })
        })
      }

      isRefreshing = true
      try {
        const newAccess = await refreshToken()
        onRefreshed(newAccess)
        const headers = (originalRequest.headers ?? {}) as Record<string, string>
        headers['Authorization'] = `Bearer ${newAccess}`
        originalRequest.headers = new AxiosHeaders(headers)
        return apiClient(originalRequest)
      } catch (refreshErr) {
        // refresh failed -> logout
        logout()
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export async function login(identifier: string, password: string){
  const res = await apiClient.post('token/', { identifier, password })
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
  try{
    // persist roles and permissions for easy access by UI
    localStorage.setItem('roles', JSON.stringify(me.roles || []))
    localStorage.setItem('permissions', JSON.stringify(me.permissions || []))
    localStorage.setItem('me', JSON.stringify(me || null))
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