function trimTrailingSlashes(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

export function getApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE
  if (fromEnv) return trimTrailingSlashes(String(fromEnv))
  return 'https://db.zynix.us'
}

export function getMediaUrl(path: string | null | undefined): string {
  const raw = String(path || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('blob:') || raw.startsWith('data:')) return raw
  return `${getApiBase()}${raw.startsWith('/') ? '' : '/'}${raw}`
}