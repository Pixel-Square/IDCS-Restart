import fetchWithAuth from './fetchAuth'
import { getApiBaseCandidates } from './apiBase'

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    let detail = text || `HTTP ${res.status}`
    try {
      const json = text ? JSON.parse(text) : null
      detail = json?.detail || json?.error || detail
    } catch (_) {}
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export type GatepassTimelineStep = {
  step_order: number
  step_role: string | null
  is_starter: boolean
  is_final: boolean
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED' | 'SUBMITTED'
  acted_by: string | null
  acted_at: string | null
  remarks: string | null
}

export type ScannedStudent = {
  id: number
  reg_no: string
  name: string
  rfid_uid: string | null
  section: string | null
  batch: string | null
  department: string | null
  status: string
  profile_image_url: string | null
}

export type ScannedStaff = {
  id: number
  staff_id: string
  name: string
  rfid_uid: string | null
  department: string | null
  designation: string
  status: string
  profile_image_url: string | null
}

export type GatepassCheckResult = {
  allowed: boolean
  message: string
  reason?: 'unknown_uid' | 'already_scanned' | 'not_approved' | 'not_fully_approved' | 'no_gatepass' | 'outside_gate_window'
  window_status?: 'before_start' | 'after_end' | null
  gatepass_window_start?: string | null
  gatepass_window_end?: string | null
  late_return?: boolean
  application_id?: number
  application_type?: string
  scanned_at?: string
  student?: ScannedStudent
  staff?: ScannedStaff
  profile_type?: 'student' | 'staff' | null
  profile?: ScannedStudent | ScannedStaff | null
  approval_timeline?: GatepassTimelineStep[]
}

export async function gatepassCheck(uid: string): Promise<GatepassCheckResult> {
  return parseJson(
    await fetchWithAuth('/api/idscan/gatepass-check/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    }),
  )
}

export type LookupAnyResult = {
  found: boolean
  uid: string
  profile_type?: 'student' | 'staff' | null
  profile?: ScannedStudent | ScannedStaff | null
}

export async function lookupAny(uid: string): Promise<LookupAnyResult> {
  return parseJson(
    await fetchWithAuth(`/api/idscan/lookup-any/?uid=${encodeURIComponent(uid)}`, {
      method: 'GET',
    }),
  )
}

export async function uploadGatepassOfflineRecords(payload: {
  device_label?: string
  records: Array<{ uid: string; direction: 'OUT' | 'IN'; recorded_at?: string }>
}): Promise<{ created: number; skipped: number }>{
  return parseJson(
    await fetchWithAuth('/api/idscan/gatepass-offline/upload/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
}

export async function ping(): Promise<boolean> {
  // Connectivity probe used for ONLINE/OFFLINE switching.
  // Important: Do NOT call authenticated DRF endpoints here; it can create 401 spam.
  // We only need to know if the backend host is reachable.
  for (const base of getApiBaseCandidates()) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 900)
    try {
      // Use no-cors so this works even if the backend doesn't allow CORS.
      // If the request reaches the server, fetch resolves with an opaque response.
      await fetch(base, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      })
      return true
    } catch {
      // try next base
    } finally {
      window.clearTimeout(timeout)
    }
  }
  return false
}
