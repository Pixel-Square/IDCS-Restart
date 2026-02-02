const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function refreshToken(): Promise<string> {
  const refresh = window.localStorage.getItem('refresh')
  if (!refresh) throw new Error('no refresh token')

  const res = await fetch(`${API_BASE}/api/accounts/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!res.ok) throw new Error('refresh failed')
  const data = await res.json()
  if (data.access) window.localStorage.setItem('access', data.access)
  if (data.refresh) window.localStorage.setItem('refresh', data.refresh)
  return data.access
}

export async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = window.localStorage.getItem('access')
  const headers = Object.assign({}, (init.headers || {}), { 'Content-Type': 'application/json' })
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
  if (res.status !== 401) return res

  // try refresh once
  if (!retry) return res
  try {
    const newAccess = await refreshToken()
    const headers2 = Object.assign({}, (init.headers || {}), { 'Content-Type': 'application/json', 'Authorization': `Bearer ${newAccess}` })
    // retry the same resolved URL (finalInput) so we don't accidentally hit the Vite dev server
    return fetch(finalInput, { ...init, headers: headers2 })
  } catch (e) {
    // failed to refresh -> clear tokens
    try { window.localStorage.removeItem('access'); window.localStorage.removeItem('refresh'); } catch(_){}
    return res
  }
}

export default fetchWithAuth
