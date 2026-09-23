function trimTrailingSlashes(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

export function getApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE
  if (fromEnv) return trimTrailingSlashes(String(fromEnv))
  if (import.meta.env.DEV) return ''
  return 'https://db.krgi.co.in'
}

export function getMediaUrl(path: string | null | undefined): string {
  const raw = String(path || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('blob:') || raw.startsWith('data:')) return raw
  const base = getApiBase() || 'https://db.krgi.co.in'
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`
}