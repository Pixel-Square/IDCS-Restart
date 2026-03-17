import { getApiBaseCandidates } from './apiBase'
import fetchWithAuth from './fetchAuth'

export type Me = {
  username: string
  roles?: string[]
  permissions?: string[]
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text || `HTTP ${res.status}`
    try {
      const json = text ? JSON.parse(text) : null
      detail = json?.detail || json?.error || detail
    } catch {}
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export async function login(identifier: string, password: string): Promise<{ access: string; refresh: string }> {
  let res: Response | null = null
  let lastErr: any = null
  for (const base of getApiBaseCandidates()) {
    try {
      const url = `${base}/api/accounts/token/`
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      }
      
      const krGate = (window as any).krGate
      if (krGate && krGate.nativeFetch) {
        const nativeReq = {
          url,
          method: options.method,
          headers: options.headers,
          body: options.body
        }
        const nativeRes = await krGate.nativeFetch(nativeReq)
        res = new Response(nativeRes.body ?? '', {
          status: nativeRes.status || 0,
          statusText: nativeRes.statusText || '',
          headers: new Headers(nativeRes.headers || {})
        })
      } else {
        res = await fetch(url, options)
      }
      break
    } catch (e) {
      lastErr = e
    }
  }
  if (!res) throw lastErr || new Error('Network error')
  const data = await parseJson<{ access: string; refresh: string }>(res)
  window.localStorage.setItem('access', data.access)
  window.localStorage.setItem('refresh', data.refresh)
  return data
}

export function logout() {
  window.localStorage.removeItem('access')
  window.localStorage.removeItem('refresh')
  window.localStorage.removeItem('me')
}

export async function getMe(): Promise<Me> {
  const me = await parseJson<Me>(await fetchWithAuth('/api/accounts/me/'))
  window.localStorage.setItem('me', JSON.stringify(me || null))
  return me
}

export function getCachedMe(): Me | null {
  try {
    const raw = window.localStorage.getItem('me')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function isSecurity(me: Me | null): boolean {
  const roles = (me?.roles || []).map((r) => String(r || '').toUpperCase())
  return roles.includes('SECURITY')
}
