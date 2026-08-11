import axios from 'axios'
import { getApiBase } from './apiBase'

export interface CollegeOption {
  id: number
  code: string
  name: string
  short_name?: string
  city?: string
  display?: string
}

/**
 * Public, unauthenticated search used by the login page's institution
 * picker. Requires at least 2 characters (enforced by the backend too).
 */
export async function searchColleges(query: string): Promise<CollegeOption[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const res = await axios.get(`${getApiBase()}/api/college/search/`, {
    params: { q, limit: 20 },
    timeout: 15000,
  })
  return Array.isArray(res.data?.results) ? res.data.results : []
}
