function trimTrailingSlashes(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

/**
 * Resolves the backend API base URL.
 *
 * Priority:
 * 1) `VITE_API_BASE` if provided
 * 2) In dev (Vite/CRA ports), assume Django is on :8000 of same host
 * 3) Otherwise, default to same-origin (nginx/proxy deployments)
 * 4) Fallback to production base
 */
export function getApiBase(): string {
  const fromEnv = (import.meta as any)?.env?.VITE_API_BASE
  if (fromEnv) return trimTrailingSlashes(String(fromEnv))

  if (typeof window !== 'undefined' && window.location) {
    const host = String(window.location.hostname || '').trim().toLowerCase()
    const port = String(window.location.port || '').trim()
    const protocol = String(window.location.protocol || 'http:').trim()

    // When serving the frontend from a plain static server (often :80/:443) on
    // localhost, Django commonly runs on :8000 without an `/api` reverse proxy.
    // Prefer :8000 in this case so API calls don't hit the static server and
    // return index.html (which would look like an empty response).
    if ((host === 'localhost' || host === '127.0.0.1') && (port === '' || port === '80' || port === '443')) {
      return trimTrailingSlashes(`${protocol}//${host}:8000`)
    }

    // When the frontend is served by a dev server, default to a Django backend on :8000.
    // This avoids same-origin API calls accidentally hitting the dev server.
    if (port === '5173' || port === '4173' || port === '3000') {
      return trimTrailingSlashes(`${protocol}//${host}:8000`)
    }

    if (window.location.origin) return trimTrailingSlashes(String(window.location.origin))
  }

  return 'https://db.krgi.co.in'
}
