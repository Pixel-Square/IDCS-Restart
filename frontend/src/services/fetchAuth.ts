const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

let isRefreshing = false
let refreshPromise: Promise<string> | null = null

async function refreshToken(): Promise<string> {
  // Prevent multiple simultaneous refresh attempts
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const refresh = window.localStorage.getItem('refresh')
      if (!refresh) throw new Error('no refresh token')

      const res = await fetch(`${API_BASE}/api/accounts/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      
      if (!res.ok) {
        // If refresh fails, clear auth tokens
        window.localStorage.removeItem('access')
        window.localStorage.removeItem('refresh')
        throw new Error('refresh failed')
      }
      
      const data = await res.json()
      if (data.access) window.localStorage.setItem('access', data.access)
      if (data.refresh) window.localStorage.setItem('refresh', data.refresh)
      return data.access
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = window.localStorage.getItem('access')
  
  // Don't set Content-Type for FormData - browser will set it automatically with boundary
  const isFormData = init.body instanceof FormData
  const headers = Object.assign({}, (init.headers || {}))
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  // Normalize API requests: if caller used a leading '/api/...' path,
  // route it to the configured backend API base instead of the Vite dev server.
  let finalInput: RequestInfo | URL = input
  try {
    if (typeof input === 'string' && input.startsWith('/api')) {
      const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
      finalInput = `${API_BASE}${input}`
    }
  } catch (e) {
    // ignore if import.meta not available in some runtimes
  }

  const res = await fetch(finalInput, { ...init, headers })
  
  // If not a 401 or retry is disabled, return the response as-is
  if (res.status !== 401 || !retry) return res

  // Try to refresh token and retry the request
  try {
    const newAccess = await refreshToken()
    const headers2 = Object.assign({}, (init.headers || {}))
    if (!isFormData) {
      headers2['Content-Type'] = 'application/json'
    }
    headers2['Authorization'] = `Bearer ${newAccess}`
    // retry the same resolved URL (finalInput) so we don't accidentally hit the Vite dev server
    return fetch(finalInput, { ...init, headers: headers2 })
  } catch (e) {
    // failed to refresh -> clear tokens, log and redirect to login
    try { window.localStorage.removeItem('access'); window.localStorage.removeItem('refresh'); } catch (_) {}
    console.error('Token refresh failed:', e);
    try {
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          try { window.location.href = '/login'; } catch (_) {}
        }, 50);
      }
    } catch (_) {}
    return res;
  }
}

export default fetchWithAuth
