import { getApiBase } from './apiBase'

type NativeFetchRequest = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | null
}

type NativeFetchResponse = {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

function hasNativeFetch(): boolean {
  return Boolean((window as any)?.krGate?.nativeFetch)
}

async function nativeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headersObj: Record<string, string> = {}
  try {
    const h = new Headers(init.headers || {})
    h.forEach((value, key) => {
      headersObj[key] = value
    })
  } catch {}

  const bodyStr = typeof init.body === 'string' ? init.body : init.body ? String(init.body as any) : null
  const req: NativeFetchRequest = {
    url,
    method: init.method || 'GET',
    headers: headersObj,
    body: bodyStr,
  }

  const res: NativeFetchResponse = await (window as any).krGate.nativeFetch(req)
  const headers = new Headers(res.headers || {})
  return new Response(res.body ?? '', {
    status: res.status || 0,
    statusText: res.statusText || '',
    headers,
  })
}

let isRefreshing = false
let refreshPromise: Promise<string> | null = null

async function refreshToken(): Promise<string> {
  if (isRefreshing && refreshPromise) return refreshPromise
  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const refresh = window.localStorage.getItem('refresh')
      if (!refresh) throw new Error('no refresh token')

      let res: Response
      try {
        const url = `${getApiBase()}/api/accounts/token/refresh/`
        const doFetch = hasNativeFetch() ? nativeFetch : fetch
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        })
      } catch (e: any) {
        window.localStorage.removeItem('access')
        window.localStorage.removeItem('refresh')
        throw new Error(String(e?.message || e || 'refresh failed'))
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

  const isFormData = init.body instanceof FormData
  const headers: any = Object.assign({}, (init.headers || {}))
  if (!isFormData) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const isApiPath = typeof input === 'string' && input.startsWith('/api')
  const candidates = isApiPath ? [`${getApiBase()}${input}`] : [String(input)]

  let res: Response | null = null
  let lastNetworkErr: any = null
  let finalInput: RequestInfo | URL = input

  for (const url of candidates) {
    finalInput = url
    try {
      const doFetch = hasNativeFetch() ? nativeFetch : fetch
      res = await doFetch(String(finalInput), { ...init, headers })
      break
    } catch (e) {
      lastNetworkErr = e
      continue
    }
  }

  if (!res) throw lastNetworkErr || new Error('Network error')
  if (res.status !== 401 || !retry) return res

  try {
    const newAccess = await refreshToken()
    const headers2: any = Object.assign({}, (init.headers || {}))
    if (!isFormData) headers2['Content-Type'] = 'application/json'
    headers2['Authorization'] = `Bearer ${newAccess}`
    const doFetch = hasNativeFetch() ? nativeFetch : fetch
    return await doFetch(String(finalInput), { ...init, headers: headers2 })
  } catch {
    return res
  }
}

export default fetchWithAuth
