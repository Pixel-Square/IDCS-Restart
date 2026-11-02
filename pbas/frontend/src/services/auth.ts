import { AuthUser, DemoAccount } from '../types/pbas'

const TOKEN_KEY = 'pbas_access_token'
const REFRESH_KEY = 'pbas_refresh_token'
const USER_KEY = 'pbas_user'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAuthSession(access: string, refresh: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
}

export async function loginUser(email: string, password: string): Promise<{ access: string; user: AuthUser }> {
  const res = await fetch('/api/accounts/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.detail || 'Invalid login credentials')
  }

  const data = await res.json()
  setAuthSession(data.access, data.refresh, data.user)
  return data
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await fetchWithAuth('/api/accounts/me/')
  if (!res.ok) throw new Error('Failed to fetch user profile')
  const user = await res.json()
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}

export async function fetchDemoAccounts(): Promise<DemoAccount[]> {
  const res = await fetch('/api/accounts/demo-users/')
  if (!res.ok) throw new Error('Failed to fetch demo accounts')
  return res.json()
}

export async function fetchWithAuth(input: string, init: RequestInit = {}): Promise<Response> {
  let token = getStoredToken()

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> || {}),
  }

  // Set Content-Type only if not FormData
  if (!(init.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let res = await fetch(input, { ...init, headers })

  // Refresh token on 401
  if (res.status === 401) {
    const refresh = getStoredRefreshToken()
    if (refresh) {
      try {
        const refreshRes = await fetch('/api/accounts/token/refresh/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        })
        if (refreshRes.ok) {
          const data = await refreshRes.json()
          localStorage.setItem(TOKEN_KEY, data.access)
          headers['Authorization'] = `Bearer ${data.access}`
          res = await fetch(input, { ...init, headers })
        } else {
          clearAuthSession()
          window.location.href = '/login'
        }
      } catch {
        clearAuthSession()
        window.location.href = '/login'
      }
    } else {
      clearAuthSession()
      window.location.href = '/login'
    }
  }

  return res
}
