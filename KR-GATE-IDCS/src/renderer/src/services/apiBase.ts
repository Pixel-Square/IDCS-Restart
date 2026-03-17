function trimTrailingSlashes(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

function normalizeBaseUrl(value: string): string {
  const trimmed = trimTrailingSlashes(String(value || '').trim())
  if (!trimmed) return trimmed

  // Allow explicit schemes; otherwise assume https.
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const PROD_API_BASE = 'https://db.krgi.co.in'

function getFallbackFromEnvOrDefault(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_FALLBACK
  if (fromEnv) return normalizeBaseUrl(fromEnv)
  return normalizeBaseUrl('https://db.krgi.co.in')
}

export function getApiBase(): string {
  // Packaged/production builds must always talk to the production backend.
  if (import.meta.env.PROD) return normalizeBaseUrl(PROD_API_BASE)

  const fromEnv = import.meta.env.VITE_API_BASE
  if (fromEnv) return normalizeBaseUrl(fromEnv)

  // Dev convenience fallback.
  return normalizeBaseUrl('http://localhost:8000')
}

export function getApiBaseCandidates(): string[] {
  const primary = trimTrailingSlashes(getApiBase())
  const fallback = trimTrailingSlashes(getFallbackFromEnvOrDefault())
  if (!fallback || fallback === primary) return [primary]
  return [primary, fallback]
}
