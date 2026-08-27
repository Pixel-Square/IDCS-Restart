import fetchWithAuth from './fetchAuth'
import { getApiBase } from './apiBase'

const API_BASE = getApiBase()

async function readJsonBody(res: Response): Promise<any | null> {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return null
  try {
    return await res.clone().json()
  } catch {
    return null
  }
}

async function buildError(res: Response, fallback: string, body?: any | null) {
  const data = body === undefined ? await readJsonBody(res) : body
  const detail = data?.detail || data?.message
  if (detail) return `${fallback}: ${detail}`
  return `${fallback}: Server returned ${res.status}.`
}

export type RevisionResponse = {
  subject_id: string
  status: string
  data: any
}

export async function fetchLcaRevision(subjectId: string): Promise<RevisionResponse> {
  const url = `${API_BASE}/api/obe/lca-revision/${encodeURIComponent(subjectId)}`
  const res = await fetchWithAuth(url, { method: 'GET' })
  if (!res.ok) {
    const body = await readJsonBody(res)
    throw new Error(await buildError(res, 'LCA fetch failed', body))
  }
  return res.json()
}

export async function saveLcaRevision(subjectId: string, data: any, status: string = 'draft'): Promise<RevisionResponse> {
  const url = `${API_BASE}/api/obe/lca-revision/${encodeURIComponent(subjectId)}`
  const res = await fetchWithAuth(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, data }),
  })
  if (!res.ok) {
    const body = await readJsonBody(res)
    throw new Error(await buildError(res, 'LCA save failed', body))
  }
  return res.json()
}

export async function fetchCoTargetRevision(subjectId: string): Promise<RevisionResponse> {
  const url = `${API_BASE}/api/obe/co-target-revision/${encodeURIComponent(subjectId)}`
  const res = await fetchWithAuth(url, { method: 'GET' })
  if (!res.ok) {
    const body = await readJsonBody(res)
    throw new Error(await buildError(res, 'CO Target fetch failed', body))
  }
  return res.json()
}

export async function saveCoTargetRevision(subjectId: string, data: any, status: string = 'draft'): Promise<RevisionResponse> {
  const url = `${API_BASE}/api/obe/co-target-revision/${encodeURIComponent(subjectId)}`
  const res = await fetchWithAuth(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, data }),
  })
  if (!res.ok) {
    const body = await readJsonBody(res)
    throw new Error(await buildError(res, 'CO Target save failed', body))
  }
  return res.json()
}
