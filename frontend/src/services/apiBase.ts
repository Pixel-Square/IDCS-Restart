function trimTrailingSlashes(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

function getFallbackFromEnvOrDefault(): string {
  const fromEnv = (import.meta as any)?.env?.VITE_API_BASE_FALLBACK
  if (fromEnv) return trimTrailingSlashes(String(fromEnv))
  return 'https://db.krgi.co.in'
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
    if (port === '5173' || port === '4173' || port === '3000' || port === '3001') {
      return trimTrailingSlashes(`http://${host}:8000`)
    }

    // If the UI is served on localhost without a port (e.g. http://localhost/),
    // it is usually NOT the Django backend. Prefer :8000 to match the standard runserver port.
    // Production deployments should set VITE_API_BASE explicitly.
    if ((host === 'localhost' || host === '127.0.0.1') && (!port || port === '80' || port === '443')) {
      return trimTrailingSlashes(`${protocol}//${host}:8000`)
    }

    if (window.location.origin) return trimTrailingSlashes(String(window.location.origin))
  }

  return getFallbackFromEnvOrDefault()
}

/**
 * Returns an ordered list of API base URLs to try.
 *
 * - First: getApiBase() (env/same-origin/dev :8000)
 * - Second: a fallback base (env or https://db.krgi.co.in)
 */
export function getApiBaseCandidates(): string[] {
  const primary = trimTrailingSlashes(getApiBase())
  if (typeof window !== 'undefined') {
    const host = String(window.location.hostname || '').trim().toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') {
      return [primary]
    }
  }
  const fallback = trimTrailingSlashes(getFallbackFromEnvOrDefault())
  if (!fallback || fallback === primary) return [primary]
  return [primary, fallback]
}
