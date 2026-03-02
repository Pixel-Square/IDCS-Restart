import fetchWithAuth from './fetchAuth'

export type CalendarMode = 'iqac' | 'hod' | 'student'

export type CalendarConfig = {
  mode: CalendarMode
  showing_department: string
  student_year: number | null
  student_year_roman: string | null
  departments: string[]
  hod_owned_departments: string[]
}

export type CalendarEvent = {
  id: string
  title: string
  description?: string | null
  start_date: string
  end_date: string
  all_day: boolean
  audience_department?: string | null
  year?: number | null
  year_label?: string | null
  source: 'iqac' | 'hod'
  created_by?: { id: number; username?: string | null } | null
  image_url?: string | null
  audience_students?: any
  created_at?: string | null
  updated_at?: string | null
  creator_color?: string | null
  can_edit?: boolean
  can_delete?: boolean
}

async function jsonOrThrow(res: Response) {
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.detail)) || `Request failed (${res.status})`
    throw new Error(String(msg))
  }
  return data
}

export async function getCalendarConfig(mode: CalendarMode): Promise<CalendarConfig> {
  const res = await fetchWithAuth(`/api/academic-calendar/config/?mode=${encodeURIComponent(mode)}`, { method: 'GET' })
  return jsonOrThrow(res)
}

export async function getCalendarEvents(params: {
  mode: CalendarMode
  monthStart: string
  monthEnd: string
}): Promise<CalendarEvent[]> {
  const qs = new URLSearchParams({
    mode: params.mode,
    monthStart: params.monthStart,
    monthEnd: params.monthEnd,
  })
  const res = await fetchWithAuth(`/api/academic-calendar/events/?${qs.toString()}`, { method: 'GET' })
  const data = await jsonOrThrow(res)
  return Array.isArray(data?.events) ? data.events : []
}

export async function createCalendarEvent(mode: CalendarMode, payload: FormData | Record<string, any>): Promise<CalendarEvent> {
  let body: any = payload
  let init: RequestInit

  if (payload instanceof FormData) {
    payload.set('mode', mode)
    init = { method: 'POST', body: payload }
  } else {
    body = { ...payload, mode }
    init = { method: 'POST', body: JSON.stringify(body) }
  }

  const res = await fetchWithAuth('/api/academic-calendar/events/', init)
  const data = await jsonOrThrow(res)
  return data?.event
}

export async function updateCalendarEvent(eventId: string, payload: FormData | Record<string, any>): Promise<CalendarEvent> {
  const init: RequestInit = payload instanceof FormData ? { method: 'POST', body: payload } : { method: 'POST', body: JSON.stringify(payload) }
  const res = await fetchWithAuth(`/api/academic-calendar/events/${encodeURIComponent(eventId)}/update/`, init)
  const data = await jsonOrThrow(res)
  return data?.event
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/academic-calendar/events/${encodeURIComponent(eventId)}/delete/`, { method: 'POST' })
  await jsonOrThrow(res)
}

export async function parseCalendarUpload(file: File): Promise<{ success: boolean; events: any[]; errors: string[] }> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetchWithAuth('/api/academic-calendar/upload/parse/', { method: 'POST', body: fd })
  return jsonOrThrow(res)
}

export async function importCalendarUpload(events: any[]): Promise<{ inserted: number }> {
  const res = await fetchWithAuth('/api/academic-calendar/upload/import/', { method: 'POST', body: JSON.stringify({ events }) })
  return jsonOrThrow(res)
}

export type HodColourRow = { hod_user_id: number; username: string; department?: string | null; color?: string | null }

export async function getHodColours(): Promise<HodColourRow[]> {
  const res = await fetchWithAuth('/api/academic-calendar/hod-colours/', { method: 'GET' })
  const data = await jsonOrThrow(res)
  return Array.isArray(data?.hods) ? data.hods : []
}

export async function setHodColour(hodUserId: number, color: string): Promise<void> {
  const res = await fetchWithAuth('/api/academic-calendar/hod-colours/', {
    method: 'POST',
    body: JSON.stringify({ hod_user_id: hodUserId, color }),
  })
  await jsonOrThrow(res)
}
