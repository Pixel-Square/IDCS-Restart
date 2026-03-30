import { apiClient } from '../services/auth'

/**
 * Under Construction state shape: { [path]: string[] }
 * The string[] is the list of ROLE names marked UC for that path.
 * e.g. { "/student/attendance": ["STUDENT"] }
 *
 * Source of truth: backend DB via /api/accounts/uc-state/
 * Local cache: in-memory (refreshed on login via MeSerializer.under_construction)
 */
export type UCState = Record<string, string[]>

// ── In-memory cache ───────────────────────────────────────────────────────
// Seeded from `user.under_construction` on login (returned by /api/accounts/me/).
// Updated immediately when the manager saves changes.
let _cache: UCState = {}

export function seedUCState(state: UCState): void {
  _cache = state || {}
}

export function getCachedUCState(): UCState {
  return _cache
}

// ── API calls ─────────────────────────────────────────────────────────────

export async function fetchUCState(): Promise<UCState> {
  try {
    const res = await apiClient.get<{ under_construction: UCState }>('uc-state/')
    _cache = res.data.under_construction || {}
    return _cache
  } catch {
    return _cache
  }
}

export async function saveUCState(state: UCState): Promise<UCState> {
  const res = await apiClient.put<{ under_construction: UCState }>('uc-state/', {
    under_construction: state,
  })
  _cache = res.data.under_construction || {}
  return _cache
}

// ── Check helper (synchronous, uses cache) ────────────────────────────────

export function isPageUnderConstruction(path: string, effectiveRoles: string[]): boolean {
  try {
    const ucRoles = (_cache[path] || []).map((r) => r.toUpperCase())
    const upper = effectiveRoles.map((r) => r.toUpperCase())
    return ucRoles.some((r) => upper.includes(r))
  } catch {
    return false
  }
}

