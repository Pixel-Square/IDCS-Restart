import fetchWithAuth from './fetchAuth'

export async function fetchRoles(): Promise<string[]> {
  const res = await fetchWithAuth('/api/accounts/roles/')
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Roles fetch failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  // support either { roles: [...] } or plain array
  if (Array.isArray(data)) return data.map((r) => String(r || '').toUpperCase())
  if (data && Array.isArray(data.roles)) return data.roles.map((r: any) => String(r || '').toUpperCase())
  return []
}
