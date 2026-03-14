import fetchWithAuth from './fetchAuth'

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

export type LookupResult =
  | { found: true; uid: string; student: ScannedStudent }
  | { found: false; uid: string }

export async function lookupByUID(uid: string): Promise<LookupResult> {
  return parseJson(await fetchWithAuth(`/api/idscan/lookup/?uid=${encodeURIComponent(uid)}`))
}

export async function searchStudents(q: string): Promise<ScannedStudent[]> {
  return parseJson(await fetchWithAuth(`/api/idscan/search/?q=${encodeURIComponent(q)}`))
}

export async function assignUID(studentId: number, uid: string): Promise<{ success: boolean; student: ScannedStudent }> {
  return parseJson(
    await fetchWithAuth('/api/idscan/assign-uid/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, uid }),
    })
  )
}

export async function unassignUID(studentId: number): Promise<{ success: boolean }> {
  return parseJson(
    await fetchWithAuth('/api/idscan/unassign-uid/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId }),
    })
  )
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

export type GatepassCheckResult = {
  allowed: boolean
  message: string
  reason?: 'unknown_uid' | 'already_scanned' | 'not_approved' | 'not_fully_approved' | 'no_gatepass' | 'outside_gate_window'
  application_id?: number
  application_type?: string
  scanned_at?: string
  student?: ScannedStudent
  approval_timeline?: GatepassTimelineStep[]
}

// ── Staff ──────────────────────────────────────────────────────────────────

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

export async function searchStaff(q: string): Promise<ScannedStaff[]> {
  return parseJson(await fetchWithAuth(`/api/idscan/search-staff/?q=${encodeURIComponent(q)}`))
}

export async function assignStaffUID(
  staffId: number,
  uid: string,
): Promise<{ success: boolean; staff: ScannedStaff }> {
  return parseJson(
    await fetchWithAuth('/api/idscan/assign-staff-uid/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId, uid }),
    }),
  )
}

export async function unassignStaffUID(staffId: number): Promise<{ success: boolean }> {
  return parseJson(
    await fetchWithAuth('/api/idscan/unassign-staff-uid/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId }),
    }),
  )
}

export async function gatepassCheck(uid: string): Promise<GatepassCheckResult> {
  return parseJson(
    await fetchWithAuth('/api/idscan/gatepass-check/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    })
  )
}

// ── Lookup any (student OR staff) by RFID UID ──────────────────────────────

export type LookupAnyResult =
  | { found: true;  uid: string; profile_type: 'student'; profile: ScannedStudent }
  | { found: true;  uid: string; profile_type: 'staff';   profile: ScannedStaff }
  | { found: false; uid: string; profile_type: null;      profile: null }

export async function lookupAny(uid: string): Promise<LookupAnyResult> {
  return parseJson(await fetchWithAuth(`/api/idscan/lookup-any/?uid=${encodeURIComponent(uid)}`))
}
