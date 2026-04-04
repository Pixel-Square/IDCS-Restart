import { getApiBaseCandidates } from './apiBase'

let isRefreshing = false
let refreshPromise: Promise<string> | null = null

async function refreshToken(): Promise<string> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const refresh = window.localStorage.getItem('refresh')
      if (!refresh) throw new Error('no refresh token')

      let res: Response | null = null
      let lastErr: any = null
      for (const base of getApiBaseCandidates()) {
        try {
          res = await fetch(`${base}/api/accounts/token/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh }),
          })
          break
        } catch (e) {
          lastErr = e
        }
      }

      if (!res) {
        window.localStorage.removeItem('access')
        window.localStorage.removeItem('refresh')
        throw new Error(String(lastErr?.message || lastErr || 'refresh failed'))
      }
      
      if (!res.ok) {
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
  const headers = new Headers(init.headers || {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let res: Response | null = null
  let lastErr: any = null
  for (const base of getApiBaseCandidates()) {
    try {
      const url = typeof input === 'string' && !input.startsWith('http') 
        ? `${base}${input.startsWith('/') ? '' : '/'}${input}`
        : input
      res = await fetch(url, { ...init, headers })
      break
    } catch (e) {
      lastErr = e
    }
  }

  if (!res) throw lastErr || new Error('fetch failed')

  if (res.status === 401 && retry) {
    try {
      const newToken = await refreshToken()
      if (newToken) {
        return fetchWithAuth(input, init, false)
      }
    } catch {
      // Refresh failed
    }
  }

  return res
}

export default fetchWithAuth
