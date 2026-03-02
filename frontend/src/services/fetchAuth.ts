function apiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE
  if (fromEnv) return String(fromEnv).replace(/\/+$/, '')

  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = String(window.location.hostname || '').trim().toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000'
    return String(window.location.origin).replace(/\/+$/, '')
  }

  return 'https://db.krgi.co.in'
}

const API_BASE = apiBase()

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
  const headers: any = Object.assign({}, (init.headers || {}))
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    console.warn('No access token found in localStorage')
  }

  // Normalize API requests: if caller used a leading '/api/...' path,
  // route it to the configured backend API base instead of the Vite dev server.
  let finalInput: RequestInfo | URL = input
  try {
    if (typeof input === 'string' && input.startsWith('/api')) {
      finalInput = `${apiBase()}${input}`
    }
  } catch (e) {
    // ignore if import.meta not available in some runtimes
  }

  const res = await fetch(finalInput, { ...init, headers })

  // Handle 401: Only log detailed errors if not a retry scenario
  if (res.status === 401) {
    // If we have a token and this is the first attempt, we'll try to refresh
    // Don't log errors yet - let the refresh mechanism handle it
    if (retry && token) {
      // Silently proceed to token refresh logic below
    } else {
      // Log only when retry is disabled or no token was present
      console.warn('Authentication required:', String(finalInput))
    }
  }

  // Handle 403: permission denied - warn with minimal details
  if (res.status === 403) {
    console.warn('Permission denied:', String(finalInput))
  }

  // Handle 400: Bad Request - log with response details for debugging
  if (res.status === 400) {
    try {
      const text = await res.clone().text()
      console.error('Bad Request (400):', { url: String(finalInput), response: text })
    } catch (e) {
      console.error('Bad Request (400):', String(finalInput))
    }
  }

  // If not a 401 or retry is disabled, return the response as-is
  if (res.status !== 401 || !retry) return res

  // Try to refresh token and retry the request
  try {
    const newAccess = await refreshToken()
    const headers2: any = Object.assign({}, (init.headers || {}))
    if (!isFormData) {
      headers2['Content-Type'] = 'application/json'
    }
    headers2['Authorization'] = `Bearer ${newAccess}`
    // retry the same resolved URL (finalInput) so we don't accidentally hit the Vite dev server
    const retryRes = await fetch(finalInput, { ...init, headers: headers2 })
    
    // If retry also fails with 401, the session is truly expired
    if (retryRes.status === 401) {
      console.error('Session expired - redirecting to login')
      try { window.localStorage.removeItem('access'); window.localStorage.removeItem('refresh'); } catch (_) {}
      try {
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            try { window.location.href = '/login'; } catch (_) {}
          }, 50);
        }
      } catch (_) {}
    }
    
    return retryRes
  } catch (e) {
    // failed to refresh -> clear tokens and redirect to login
    console.error('Token refresh failed - redirecting to login')
    try { window.localStorage.removeItem('access'); window.localStorage.removeItem('refresh'); } catch (_) {}
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
