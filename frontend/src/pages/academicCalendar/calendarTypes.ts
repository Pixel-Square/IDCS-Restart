export interface CalendarDate {
  date: string        // B - date value
  day: string         // C - day name (Mon, Tue, etc.)
  workingDays: string // D - holiday/weekend text (Sun, Sat, holiday name) or empty
  counter: string     // E - overall working day counter
  iiYearEvent: string  // G - II Year event description
  iiYearCount: string  // H - II Year working day count
  iiiYearEvent: string // I - III Year event description
  iiiYearCount: string // J - III Year working day count
  ivYearEvent: string  // K - IV Year event description
  ivYearCount: string  // L - IV Year working day count
  iYearText: string   // M - I Year text (event or count)
}

export interface CalendarData {
  id: string
  name: string
  semesterType: 'ODD' | 'EVEN'
  academicYear: string
  uploadedAt: string
  dates: CalendarDate[]
}

export const CALENDARS_STORAGE_KEY = 'academicCalendars_v2'

export function loadCalendars(): CalendarData[] {
  try {
    const stored = localStorage.getItem(CALENDARS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function saveCalendars(data: CalendarData[]) {
  localStorage.setItem(CALENDARS_STORAGE_KEY, JSON.stringify(data))
}
