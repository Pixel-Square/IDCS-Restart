import axios, { AxiosHeaders } from 'axios'

const BASE = `${import.meta.env.VITE_API_BASE || 'http://localhost:8000'}/api/accounts/`

// Create an axios instance used across the app so we can centrally handle
// automatic access-token refresh on 401 responses.
export const apiClient = axios.create({ baseURL: BASE })

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
    await getMe()
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
  const res = await apiClient.get('me/')
  const me = res.data
  try{
    // persist roles and permissions for easy access by UI
    localStorage.setItem('roles', JSON.stringify(me.roles || []))
    localStorage.setItem('permissions', JSON.stringify(me.permissions || []))
  }catch(e){
    // ignore storage errors
  }
  return me
}
