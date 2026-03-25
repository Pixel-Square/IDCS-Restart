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

export type CardDataRow = {
  id: number
  role: 'STUDENT' | 'STAFF'
  identifier: string
  username: string
  name?: string
  department: string | null
  profile_image_url?: string | null
  rfid_uid: string | null
  status: 'Connected' | 'Not Connected'
}

export async function fetchCardsData(): Promise<CardDataRow[]> {
  const res = await parseJson<{ results: CardDataRow[] }>(await fetchWithAuth(`/api/idscan/cards-data/`))
  return res.results
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

// ── HR: Gatepass Logs ─────────────────────────────────────────────────────

export type GatepassLogRow = {
  application_id: number
  uid?: string | null
  user_username: string | null
  user_name: string | null
  user_role: 'STUDENT' | 'STAFF' | null
  department_name: string | null
  reg_no?: string | null
  staff_id?: string | null
  profile_image_url?: string | null
  gate_username: string | null
  mode: 'ONLINE' | 'OFFLINE' | string
  status: string
  reason: string | null
  out_status: 'EXITED' | 'NOT_EXITED'
  in_status: 'ON_TIME' | 'LATE' | 'NOT_RETURNED'
  out_at?: string | null
  in_at?: string | null
  log_at?: string | null
}

export type FetchGatepassLogsParams = {
  role?: 'STUDENT' | 'STAFF' | ''
  department_id?: number | ''
  status?: string
  out?: 'EXITED' | 'NOT_EXITED' | ''
  in?: 'ON_TIME' | 'LATE' | 'NOT_RETURNED' | ''
  from?: string
  to?: string
  q?: string
  limit?: number
}

export async function fetchGatepassLogs(
  params: FetchGatepassLogsParams = {},
): Promise<GatepassLogRow[]> {
  const qp = new URLSearchParams()
  if (params.role) qp.set('role', params.role)
  if (params.department_id) qp.set('department_id', String(params.department_id))
  if (params.status) qp.set('status', String(params.status))
  if (params.out) qp.set('out', params.out)
  if (params.in) qp.set('in', params.in)
  if (params.from) qp.set('from', String(params.from))
  if (params.to) qp.set('to', String(params.to))
  if (params.q) qp.set('q', String(params.q))
  if (params.limit) qp.set('limit', String(params.limit))

  const query = qp.toString()
  const res = await parseJson<{ results: GatepassLogRow[] }>(
    await fetchWithAuth(`/api/idscan/gatepass-logs/${query ? `?${query}` : ''}`),
  )
  return Array.isArray(res?.results) ? res.results : []
}

// ── HR: Offline Gatepass Records ──────────────────────────────────────────

export type GatepassOfflineSecurityUser = {
  id: number
  username: string | null
  name: string | null
  department: string | null
}

export async function fetchGatepassOfflineSecurityUsers(): Promise<GatepassOfflineSecurityUser[]> {
  const res = await parseJson<{ results: GatepassOfflineSecurityUser[] }>(
    await fetchWithAuth('/api/idscan/gatepass-offline/security-users/'),
  )
  return Array.isArray(res?.results) ? res.results : []
}

export type GatepassOfflineRecordRow = {
  id: number
  uid: string
  direction: 'OUT' | 'IN'
  recorded_at: string | null
  device_label: string
  user_role: 'STUDENT' | 'STAFF' | null
  user_username: string | null
  user_name: string | null
  department_id: number | null
  department_name: string | null
  pull_error: string
}

export type FetchGatepassOfflineRecordsParams = {
  role?: 'STUDENT' | 'STAFF' | ''
  department_id?: number | ''
  direction?: 'OUT' | 'IN' | ''
  q?: string
  limit?: number
}

export async function fetchGatepassOfflineRecords(
  params: FetchGatepassOfflineRecordsParams = {},
): Promise<GatepassOfflineRecordRow[]> {
  const qp = new URLSearchParams()
  if (params.role) qp.set('role', params.role)
  if (params.department_id) qp.set('department_id', String(params.department_id))
  if (params.direction) qp.set('direction', params.direction)
  if (params.q) qp.set('q', String(params.q))
  if (params.limit) qp.set('limit', String(params.limit))
  const query = qp.toString()

  const res = await parseJson<{ results: GatepassOfflineRecordRow[] }>(
    await fetchWithAuth(`/api/idscan/gatepass-offline/${query ? `?${query}` : ''}`),
  )
  return Array.isArray(res?.results) ? res.results : []
}

export async function pullGatepassOfflineRecord(
  id: number,
  securityUserId: number,
): Promise<{ success: boolean; message?: string; application_id?: number }>{
  return parseJson(
    await fetchWithAuth(`/api/idscan/gatepass-offline/${id}/pull/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ security_user_id: securityUserId }),
    }),
  )
}

export async function ignoreGatepassOfflineRecord(id: number): Promise<{ success: boolean }>{
  return parseJson(
    await fetchWithAuth(`/api/idscan/gatepass-offline/${id}/ignore/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  )
}

export async function pullAllGatepassOfflineRecords(payload: {
  security_user_id: number
  role?: 'STUDENT' | 'STAFF' | ''
  department_id?: number | ''
  direction?: 'OUT' | 'IN' | ''
  q?: string
  limit?: number
}): Promise<{ pulled: number; failed: number }>{
  return parseJson(
    await fetchWithAuth('/api/idscan/gatepass-offline/pull-all/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
}

export async function ignoreAllGatepassOfflineRecords(payload: {
  role?: 'STUDENT' | 'STAFF' | ''
  department_id?: number | ''
  direction?: 'OUT' | 'IN' | ''
  q?: string
  limit?: number
}): Promise<{ ignored: number }>{
  return parseJson(
    await fetchWithAuth('/api/idscan/gatepass-offline/ignore-all/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
