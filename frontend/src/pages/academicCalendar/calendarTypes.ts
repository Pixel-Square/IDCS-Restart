export interface CalendarDate {
  date: string
  day: string
  workingDays: string
  counter: string
  iiYearEvent: string
  iiYearCount: string
  iiiYearEvent: string
  iiiYearCount: string
  ivYearEvent: string
  ivYearCount: string
  iYearText: string
}

export interface CalendarData {
  id: string
  name: string
  academicYear: string  // e.g. "2025-26"
  fromDate: string
  toDate: string
  createdAt?: string | null
  updatedAt?: string | null
  dates: CalendarDate[]
}

export interface CalendarEventDef {
  id: string
  title: string
  color: string           // hex e.g. '#3B82F6'
  visibleToRoles: string[]
  semesters: string[]     // e.g. ['COMMON'] or ['I', 'II']
  createdAt: string
}

export interface DateAssignment {
  id: string
  calendarId: string
  startDate: string   // d/m/yyyy
  endDate: string     // d/m/yyyy
  eventId: string
  createdAt: string
}

export const ALL_ROLES = ['STUDENT', 'STAFF', 'HOD', 'IQAC', 'PRINCIPAL', 'COE', 'HR']

export const ALL_SEMESTERS = [
  { value: 'COMMON', label: 'Common (All Years)' },
  { value: 'I',      label: 'I Year'  },
  { value: 'II',     label: 'II Year' },
  { value: 'III',    label: 'III Year' },
  { value: 'IV',     label: 'IV Year' },
]

export const CALENDARS_STORAGE_KEY = 'academicCalendars_v2'
export const EVENT_DEFS_KEY = 'calendarEventDefs'
export const DATE_ASSIGNMENTS_KEY = 'calendarDateAssignments'

function tryParse<T>(key: string): T[] {
  try {
    const s = localStorage.getItem(key)
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

export function loadCalendars(): CalendarData[] { return tryParse(CALENDARS_STORAGE_KEY) }
export function saveCalendars(data: CalendarData[]) { localStorage.setItem(CALENDARS_STORAGE_KEY, JSON.stringify(data)) }
export function loadEventDefs(): CalendarEventDef[] { return tryParse(EVENT_DEFS_KEY) }
export function saveEventDefs(defs: CalendarEventDef[]) { localStorage.setItem(EVENT_DEFS_KEY, JSON.stringify(defs)) }
export function loadDateAssignments(): DateAssignment[] { return tryParse(DATE_ASSIGNMENTS_KEY) }
export function saveDateAssignments(a: DateAssignment[]) { localStorage.setItem(DATE_ASSIGNMENTS_KEY, JSON.stringify(a)) }

