import React, { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Calendar, Upload, Plus, Trash2, AlertCircle, Loader2, X, Eye, ChevronUp, MousePointer2, Tag } from 'lucide-react'
import { ModalPortal } from '../../components/ModalPortal'
import {
  CalendarData, CalendarEventDef, DateAssignment,
  loadCalendars, saveCalendars,
  loadEventDefs, saveEventDefs,
  loadDateAssignments, saveDateAssignments,
  ACADEMIC_YEAR_OPTIONS,
} from './calendarTypes'
import { CalendarGrid } from './CalendarGrid'
import { parseCalDate } from './CalendarGrid'
import CalendarEvents from './CalendarEvents'
import fetchWithAuth from '../../services/fetchAuth'

// ── helpers ──────────────────────────────────────────────────────────────────

function dateKeyToLabel(key: string): string {
  if (!key) return ''
  const [d, m, y] = key.split('/')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${months[Number(m) - 1]} ${y}`
}

function sortedSelectionRange(selectedDates: Set<string>): { start: string; end: string } {
  if (selectedDates.size === 0) return { start: '', end: '' }
  const sorted = Array.from(selectedDates).map(k => {
    const p = parseCalDate(k)
    return { key: k, ts: p ? p.getTime() : 0 }
  }).sort((a, b) => a.ts - b.ts)
  return { start: sorted[0].key, end: sorted[sorted.length - 1].key }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AcademicCalendarAdmin() {
  const [calendars, setCalendars] = useState<CalendarData[]>([])
  const [eventDefs, setEventDefs] = useState<CalendarEventDef[]>([])
  const [assignments, setAssignments] = useState<DateAssignment[]>([])

  // Viewing state
  const [viewingCalendar, setViewingCalendar] = useState<CalendarData | null>(null)
  const calendarGridRef = useRef<HTMLDivElement>(null)

  // Select mode
  const [selectMode, setSelectMode] = useState(false)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())

  // Create calendar form
  const [showCreatePopup, setShowCreatePopup] = useState(false)
  const [calendarName, setCalendarName] = useState('')
  const [startYear, setStartYear] = useState(new Date().getFullYear())
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarData | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignEventId, setAssignEventId] = useState('')
  const [assignError, setAssignError] = useState('')

  // Calendar Events sub-modal
  const [showEventManager, setShowEventManager] = useState(false)

  useEffect(() => {
    setCalendars(loadCalendars())
    // Load event defs from backend, fall back to localStorage
    const loadFromApi = async () => {
      try {
        const [labelsRes, assignRes] = await Promise.all([
          fetchWithAuth('/api/academic-calendar/event-labels/'),
          fetchWithAuth('/api/academic-calendar/event-assignments/'),
        ])
        if (labelsRes.ok) {
          const data = await labelsRes.json()
          const mapped: CalendarEventDef[] = data.map((d: any) => ({
            id: d.id, title: d.title, color: d.color,
            visibleToRoles: d.visible_roles || [],
            semesters: d.semesters || [],
            createdAt: d.created_at,
          }))
          setEventDefs(mapped); saveEventDefs(mapped)
        } else {
          setEventDefs(loadEventDefs())
        }
        if (assignRes.ok) {
          const data = await assignRes.json()
          const mapped: DateAssignment[] = data.map((a: any) => ({
            id: a.id,
            calendarId: a.calendar_ref,
            startDate: a.start_date.split('-').reverse().join('/'),  // YYYY-MM-DD → d/m/yyyy
            endDate:   a.end_date.split('-').reverse().join('/'),
            eventId: a.event_id,
            createdAt: a.created_at,
          }))
          setAssignments(mapped); saveDateAssignments(mapped)
        } else {
          setAssignments(loadDateAssignments())
        }
      } catch {
        setEventDefs(loadEventDefs())
        setAssignments(loadDateAssignments())
      }
    }
    loadFromApi()
  }, [])

  // ── excel parsing ──────────────────────────────────────────────────────────

  const getCellValue = (cell?: XLSX.CellObject): string => {
    if (!cell) return ''
    const formatted = String((cell as any).w ?? '').trim()
    const raw = cell.v
    if (formatted) return formatted
    if (raw === undefined || raw === null) return ''
    return String(raw).trim()
  }

  const getCellStr = (sheet: XLSX.WorkSheet, col: string, row: number): string => {
    const cell = sheet[`${col}${row}`] as XLSX.CellObject | undefined
    return getCellValue(cell)
  }

  const getCellStrByIndex = (sheet: XLSX.WorkSheet, colIndex: number, row: number): string => {
    const addr = XLSX.utils.encode_cell({ c: colIndex, r: row - 1 })
    const cell = sheet[addr] as XLSX.CellObject | undefined
    return getCellValue(cell)
  }

  const normHeader = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')

  const isDateHeader = (v: string) => {
    const n = normHeader(v)
    return n === 'date' || n === 'dates'
  }

  const isDayHeader = (v: string) => {
    const n = normHeader(v)
    return n === 'day' || n === 'days'
  }

  const isWorkingDaysHeader = (v: string) => {
    const n = normHeader(v)
    if (n === 'working days' || n === 'working day') return true
    const squashed = n.replace(/\s+/g, '')
    if (squashed === 'workingdays' || squashed === 'workingday') return true
    return n.includes('working') && n.includes('day')
  }

  const findHeaderRow = (sheet: XLSX.WorkSheet, maxScanRows = 20): number | null => {
    const range = (XLSX.utils as any).decode_range(sheet['!ref'] || 'A1:M500')
    const maxCol = range.e.c
    for (let row = 1; row <= Math.min(maxScanRows, range.e.r + 1); row++) {
      let hasDate = false
      let hasDay = false
      let hasWorkingDays = false
      for (let c = 0; c <= maxCol; c++) {
        const v = getCellStrByIndex(sheet, c, row)
        if (isDateHeader(v)) hasDate = true
        if (isDayHeader(v)) hasDay = true
        if (isWorkingDaysHeader(v)) hasWorkingDays = true
      }
      if (hasDate && hasDay && hasWorkingDays) return row
    }

    // Template fallbacks: common templates place headers on row 3 (or occasionally row 4).
    for (const r of [3, 4]) {
      const b = getCellStr(sheet, 'B', r)
      const c = getCellStr(sheet, 'C', r)
      const d = getCellStr(sheet, 'D', r)
      if (isDateHeader(b) && isDayHeader(c) && isWorkingDaysHeader(d)) return r
    }

    return null
  }

  const detectSheetForCalendar = (workbook: XLSX.WorkBook): XLSX.WorkSheet => {
    const sheetName3 = workbook.SheetNames[2]
    const candidate3 = sheetName3 ? workbook.Sheets[sheetName3] : undefined
    if (candidate3) return candidate3
    // Fallback: return the first available sheet.
    const first = workbook.SheetNames[0]
    if (!first) throw new Error('Excel file must have at least 1 sheet')
    return workbook.Sheets[first]
  }

  const pickBestCalendarSheet = (workbook: XLSX.WorkBook): XLSX.WorkSheet => {
    // Prefer the 3rd sheet, but if it doesn't look like the calendar layout, scan all sheets.
    const preferred = detectSheetForCalendar(workbook)
    const preferredHeaderRow = findHeaderRow(preferred)
    if (preferredHeaderRow) return preferred

    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name]
      const headerRow = findHeaderRow(sheet)
      if (headerRow) return sheet
    }

    return preferred
  }

  const parsePossiblyAmbiguousDateString = (raw: string): Date | null => {
    const trimmed = (raw || '').trim()
    if (!trimmed) return null

    // Try existing parser first (d/m/y or yyyy-mm-dd)
    const asDMY = parseCalDate(trimmed)
    if (asDMY) return asDMY

    // Heuristic for dd/mm/yy (with 2-digit year) and mm/dd/yyyy or mm-dd-yyyy
    const parts = trimmed.split(/[\/\-]/)
    if (parts.length !== 3) return null
    const [p1, p2, p3] = parts.map(p => Number(p))
    if ([p1, p2, p3].some(n => isNaN(n))) return null
    let y = p3
    if (y < 100) y = 2000 + y

    const tryMake = (d: number, m: number) => {
      if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null
      return new Date(y, m - 1, d)
    }

    // Prefer dd/mm first (matches your template)
    return tryMake(p1, p2) ?? tryMake(p2, p1)
  }

  const formatExcelSerialToDMY = (serial: number, date1904: boolean): string => {
    // Excel serials are day counts; using UTC getters avoids local timezone shifting the date.
    const epochDays = date1904 ? 24107 : 25569
    const utcMs = Math.round((serial - epochDays) * 86400 * 1000)
    const dt = new Date(utcMs)
    return `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}/${dt.getUTCFullYear()}`
  }

  const formatExcelDateFromCell = (cell: XLSX.CellObject | undefined, date1904: boolean): string => {
    if (!cell) return ''
    const raw = (cell as any).v
    if (raw instanceof Date) {
      return `${raw.getUTCDate()}/${raw.getUTCMonth() + 1}/${raw.getUTCFullYear()}`
    }
    if (typeof raw === 'number') {
      try {
        const parsed = (XLSX as any).SSF?.parse_date_code?.(raw, { date1904 })
        if (parsed?.y && parsed?.m && parsed?.d) return `${parsed.d}/${parsed.m}/${parsed.y}`
      } catch {}
      return formatExcelSerialToDMY(raw, date1904)
    }

    const formattedOrRaw = getCellValue(cell)
    const parsed = parsePossiblyAmbiguousDateString(formattedOrRaw)
    return parsed ? `${parsed.getDate()}/${parsed.getMonth() + 1}/${parsed.getFullYear()}` : formatExcelDate(formattedOrRaw)
  }

  const findColExact = (sheet: XLSX.WorkSheet, row: number, text: string): number | null => {
    const range = (XLSX.utils as any).decode_range(sheet['!ref'] || 'A1:M500')
    const maxCol = range.e.c
    const want = text.trim().toLowerCase()
    for (let c = 0; c <= maxCol; c++) {
      const v = getCellStrByIndex(sheet, c, row).trim().toLowerCase()
      if (v === want) return c
    }
    return null
  }

  const findColContains = (sheet: XLSX.WorkSheet, row: number, text: string): number | null => {
    const range = (XLSX.utils as any).decode_range(sheet['!ref'] || 'A1:M500')
    const maxCol = range.e.c
    const want = text.trim().toLowerCase()
    for (let c = 0; c <= maxCol; c++) {
      const v = getCellStrByIndex(sheet, c, row).trim().toLowerCase()
      if (v && v.includes(want)) return c
    }
    return null
  }

  const detectSemesterType = (sheet: XLSX.WorkSheet): 'ODD' | 'EVEN' => {
    // The template usually has "ODD SEMESTER" or "EVEN SEMESTER" in row 2.
    const range = (XLSX.utils as any).decode_range(sheet['!ref'] || 'A1:M500')
    const maxCol = Math.min(range.e.c, 30)
    for (let c = 0; c <= maxCol; c++) {
      const v = getCellStrByIndex(sheet, c, 2).toUpperCase()
      if (v.includes('ODD')) return 'ODD'
      if (v.includes('EVEN')) return 'EVEN'
    }
    // Fallback to previous behavior
    const b2 = getCellStr(sheet, 'B', 2).toUpperCase()
    return b2.includes('ODD') ? 'ODD' : 'EVEN'
  }

  const detectCounterCol = (
    sheet: XLSX.WorkSheet,
    dataStartRow: number,
    workingDaysCol: number,
    nextBlockCol: number | null
  ): number => {
    const upper = nextBlockCol !== null ? nextBlockCol - 1 : workingDaysCol + 3
    const end = Math.max(workingDaysCol + 1, upper)
    // Choose the first mostly-numeric column after Working Days (template has 1..n counters)
    for (let c = workingDaysCol + 1; c <= end; c++) {
      let hits = 0
      for (let r = dataStartRow; r < dataStartRow + 15; r++) {
        const v = getCellStrByIndex(sheet, c, r).trim()
        if (v !== '' && !isNaN(Number(v))) hits++
      }
      if (hits >= 3) return c
    }
    return workingDaysCol + 1
  }

  const formatExcelDate = (value: any): string => {
    if (typeof value === 'number') {
      // Convert Excel serial to local date (no UTC shift — use local time methods)
      const utcMs = Math.round((value - 25569) * 86400 * 1000)
      const jsDate = new Date(utcMs)
      return `${jsDate.getDate()}/${jsDate.getMonth() + 1}/${jsDate.getFullYear()}`
    }
    if (value instanceof Date) return `${value.getDate()}/${value.getMonth() + 1}/${value.getFullYear()}`
    // String fallback: normalize via parser to strip zero-padding and unify separators
    if (value) {
      const p = parseCalDate(String(value))
      if (p) return `${p.getDate()}/${p.getMonth() + 1}/${p.getFullYear()}`
      return String(value)
    }
    return ''
  }

  const parseExcelFile = (file: File): Promise<CalendarData> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target?.result, { type: 'binary', cellDates: true })
          if (workbook.SheetNames.length < 1) throw new Error('Excel file has no sheets')
          const date1904 = !!(workbook as any)?.Workbook?.WBProps?.date1904
          const sheet = pickBestCalendarSheet(workbook)

          // Map columns from the template headers (matches the screenshot)
          const headerRow = findHeaderRow(sheet)

          let dateCol: number | null = null
          let dayCol: number | null = null
          let workingDaysCol: number | null = null
          let iiYearCol: number | null = null
          let iiiYearCol: number | null = null
          let ivYearCol: number | null = null
          let iYearCol: number | null = null
          let dataStartRow = 4

          if (headerRow) {
            dateCol = findColExact(sheet, headerRow, 'Date')
            dayCol = findColExact(sheet, headerRow, 'Day')
            workingDaysCol = findColExact(sheet, headerRow, 'Working Days')

            // Year blocks can be on headerRow (merged) or one row above.
            const yrRowA = headerRow
            const yrRowB = Math.max(1, headerRow - 1)
            iiYearCol = findColContains(sheet, yrRowA, 'II Year') ?? findColContains(sheet, yrRowB, 'II Year')
            iiiYearCol = findColContains(sheet, yrRowA, 'III Year') ?? findColContains(sheet, yrRowB, 'III Year')
            ivYearCol = findColContains(sheet, yrRowA, 'IV Year') ?? findColContains(sheet, yrRowB, 'IV Year')
            iYearCol = findColContains(sheet, yrRowA, 'I Year') ?? findColContains(sheet, yrRowB, 'I Year')
            dataStartRow = headerRow + 1
          }

          // Fixed-template fallback for the 3rd sheet mapping shown in the screenshot.
          if (dateCol === null || dayCol === null || workingDaysCol === null) {
            dateCol = 1   // B
            dayCol = 2    // C
            workingDaysCol = 3 // D
            iiYearCol = 6  // G
            iiiYearCol = 8 // I
            ivYearCol = 10 // K
            iYearCol = 12 // M
            dataStartRow = 4
          }

          const counterCol = detectCounterCol(sheet, dataStartRow, workingDaysCol, iiYearCol)

          const semesterType: 'ODD' | 'EVEN' = detectSemesterType(sheet)
          const academicYear = `${startYear}-${String(startYear + 1).slice(-2)}`
          const range = (XLSX.utils as any).decode_range(sheet['!ref'] || 'A1:M500')
          const maxRow = range.e.r + 1
          const dates: import('./calendarTypes').CalendarDate[] = []
          let consecutiveEmpty = 0
          for (let rowIndex = dataStartRow; rowIndex <= maxRow; rowIndex++) {
            const dateAddr = XLSX.utils.encode_cell({ c: dateCol, r: rowIndex - 1 })
            const dateCell = sheet[dateAddr] as XLSX.CellObject | undefined
            const dateStr = formatExcelDateFromCell(dateCell, date1904)
            if (dateStr === '') {
              if (++consecutiveEmpty > 10) break
              continue
            }
            consecutiveEmpty = 0
            dates.push({
              date: dateStr,
              day: getCellStrByIndex(sheet, dayCol, rowIndex),
              workingDays: getCellStrByIndex(sheet, workingDaysCol, rowIndex),
              counter: getCellStrByIndex(sheet, counterCol, rowIndex),
              iiYearEvent: iiYearCol !== null ? getCellStrByIndex(sheet, iiYearCol, rowIndex) : '',
              iiYearCount: iiYearCol !== null ? getCellStrByIndex(sheet, iiYearCol + 1, rowIndex) : '',
              iiiYearEvent: iiiYearCol !== null ? getCellStrByIndex(sheet, iiiYearCol, rowIndex) : '',
              iiiYearCount: iiiYearCol !== null ? getCellStrByIndex(sheet, iiiYearCol + 1, rowIndex) : '',
              ivYearEvent: ivYearCol !== null ? getCellStrByIndex(sheet, ivYearCol, rowIndex) : '',
              ivYearCount: ivYearCol !== null ? getCellStrByIndex(sheet, ivYearCol + 1, rowIndex) : '',
              iYearText: iYearCol !== null ? getCellStrByIndex(sheet, iYearCol, rowIndex) : '',
            })
          }
          if (dates.length === 0) {
            const headerRowDebug = findHeaderRow(sheet)
            const debugRows = [1, 2, 3, 4, 5, 6]
            const debugCols = ['A','B','C','D','E','F','G','H','I','J','K','L','M']
            const dump = debugRows.map(r => ({
              row: r,
              values: debugCols.map(c => getCellStr(sheet, c, r)),
            }))
            // eslint-disable-next-line no-console
            console.warn('[AcademicCalendarImport] No data rows found; sheet preview:', { headerRowDebug, dump })
            throw new Error('No data rows found in the calendar sheet. Please confirm Date values start under the Date column (usually column B) and try again. (Check console for a sheet preview.)')
          }
          resolve({ id: Date.now().toString(), name: calendarName || file.name.replace(/\.[^.]+$/, ''), semesterType, academicYear, startYear, uploadedAt: new Date().toISOString(), dates })
        } catch (err: any) { reject(err) }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsBinaryString(file)
    })

  const countImportedEvents = (dates: import('./calendarTypes').CalendarDate[]) => {
    const isEventText = (v: string) => {
      const s = (v || '').trim()
      if (!s) return false
      const low = s.toLowerCase()
      if (low === 'sat' || low === 'sun') return false
      return isNaN(Number(s))
    }

    let count = 0
    for (const d of dates) {
      if (isEventText(d.iiYearEvent)) count++
      if (isEventText(d.iiiYearEvent)) count++
      if (isEventText(d.ivYearEvent)) count++
      if (isEventText(d.iYearText)) count++
    }
    return count
  }

  const handleCreateCalendar = async () => {
    if (!calendarName.trim()) { setCreateError('Please enter a calendar name'); return }
    if (!uploadedFile) { setCreateError('Please upload an Excel file'); return }
    setIsProcessing(true); setCreateError(null)
    try {
      const data = await parseExcelFile(uploadedFile)

      const importedEvents = countImportedEvents(data.dates)
      window.alert(`Imported ${data.dates.length} dates and ${importedEvents} events.`)

      const updated = [...calendars, data]
      saveCalendars(updated); setCalendars(updated)
      setCalendarName(''); setUploadedFile(null); setShowCreatePopup(false)
    } catch (err: any) { setCreateError(err.message || 'Failed to process Excel file') }
    finally { setIsProcessing(false) }
  }

  const handleDeleteCalendar = () => {
    if (!selectedCalendar) return
    if (deletePassword !== 'admin') { setDeleteError('Incorrect password'); return }
    const updated = calendars.filter(c => c.id !== selectedCalendar.id)
    saveCalendars(updated); setCalendars(updated)
    // also remove assignments for this calendar
    const updatedA = assignments.filter(a => a.calendarId !== selectedCalendar.id)
    saveDateAssignments(updatedA); setAssignments(updatedA)
    setShowDeleteConfirm(false); setDeletePassword(''); setSelectedCalendar(null); setDeleteError(null)
    if (viewingCalendar?.id === selectedCalendar.id) setViewingCalendar(null)
  }

  // ── open calendar view ─────────────────────────────────────────────────────
  const openCalendarView = (cal: CalendarData) => {
    setViewingCalendar(cal); setSelectMode(false); setSelectedDates(new Set())
    setTimeout(() => calendarGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // ── toggle date selection ──────────────────────────────────────────────────
  const toggleDate = (key: string) => {
    setSelectedDates(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  // ── assign event ───────────────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!assignEventId) { setAssignError('Please select an event'); return }
    if (!viewingCalendar) return
    const { start, end } = sortedSelectionRange(selectedDates)
    // Convert d/m/yyyy → YYYY-MM-DD for backend
    const toIso = (key: string) => {
      const [d, m, y] = key.split('/')
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    // Optimistic local update
    const tempId = `temp-${Date.now()}`
    const newAssignment: DateAssignment = {
      id: tempId,
      calendarId: viewingCalendar.id,
      startDate: start, endDate: end,
      eventId: assignEventId,
      createdAt: new Date().toISOString(),
    }
    const updated = [...assignments, newAssignment]
    saveDateAssignments(updated); setAssignments(updated)
    setShowAssignModal(false); setAssignEventId(''); setAssignError('')
    setSelectedDates(new Set()); setSelectMode(false)
    // Post to backend
    try {
      const res = await fetchWithAuth('/api/academic-calendar/event-assignments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: assignEventId,
          calendar_ref: viewingCalendar.id,
          start_date: toIso(start),
          end_date: toIso(end),
          description: '',
        }),
      })
      if (res.ok) {
        const created = await res.json()
        // Replace temp id with real id
        setAssignments(prev => {
          const list = prev.map(a => a.id === tempId ? { ...a, id: created.id } : a)
          saveDateAssignments(list)
          return list
        })
      }
    } catch {}
  }

  const { start: selStart, end: selEnd } = sortedSelectionRange(selectedDates)

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Academic Calendar Admin</h1>
                <p className="text-sm text-gray-600">Manage academic year calendars and events</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEventManager(true)}
                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                <Tag className="w-4 h-4" /> Manage Events
              </button>
              <button
                onClick={() => setShowCreatePopup(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" /> Create Calendar
              </button>
            </div>
          </div>
        </div>

        {/* Calendar cards */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Academic Calendar History</h2>
          {calendars.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>No calendars uploaded yet</p>
              <p className="text-sm">Click "Create Calendar" to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {calendars.map((calendar) => (
                <div key={calendar.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{calendar.name}</h3>
                      <p className="text-sm text-gray-600">{calendar.academicYear}</p>
                    </div>
                    <button onClick={() => { setSelectedCalendar(calendar); setShowDeleteConfirm(true); setDeletePassword(''); setDeleteError(null) }} className="text-red-500 hover:text-red-700 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1 text-sm mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Semester:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${calendar.semesterType === 'ODD' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {calendar.semesterType}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Entries:</span>
                      <span className="font-medium">{calendar.dates.length}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">Uploaded: {new Date(calendar.uploadedAt).toLocaleDateString()}</div>
                  </div>
                  <button
                    onClick={() => openCalendarView(calendar)}
                    className={`w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors ${viewingCalendar?.id === calendar.id ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-50 hover:bg-blue-100 text-blue-700'}`}
                  >
                    <Eye className="w-4 h-4" /> {viewingCalendar?.id === calendar.id ? 'Viewing' : 'View Calendar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inline calendar grid view */}
      {viewingCalendar && (
        <div className="max-w-7xl mx-auto mt-0 px-6 pb-6">
          <div ref={calendarGridRef} className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
            {/* Calendar header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{viewingCalendar.name}</h2>
                <p className="text-xs text-gray-500">
                  {viewingCalendar.academicYear} &bull;{' '}
                  <span className={viewingCalendar.semesterType === 'ODD' ? 'text-blue-600 font-medium' : 'text-purple-600 font-medium'}>
                    {viewingCalendar.semesterType} Semester
                  </span>
                  &bull; {viewingCalendar.dates.length} days
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Select mode toggle */}
                {!selectMode ? (
                  <button
                    onClick={() => { setSelectMode(true); setSelectedDates(new Set()) }}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <MousePointer2 className="w-4 h-4" /> Select Dates
                  </button>
                ) : (
                  <>
                    <span className="text-sm font-medium text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
                      {selectedDates.size} date{selectedDates.size !== 1 ? 's' : ''} selected
                    </span>
                    {selectedDates.size > 0 && (
                      <button
                        onClick={() => { setAssignError(''); setAssignEventId(''); setShowAssignModal(true) }}
                        className="flex items-center gap-1.5 text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Tag className="w-4 h-4" /> Assign Event
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectMode(false); setSelectedDates(new Set()) }}
                      className="flex items-center gap-1.5 text-sm text-gray-500 px-2 py-1.5 rounded-lg hover:bg-gray-100"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setViewingCalendar(null); setSelectMode(false); setSelectedDates(new Set()) }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors px-2 py-1.5"
                >
                  <ChevronUp className="w-4 h-4" /> Close
                </button>
              </div>
            </div>

            <CalendarGrid
              calendar={viewingCalendar}
              selectMode={selectMode}
              selectedDates={selectedDates}
              onToggleDate={toggleDate}
              assignments={assignments}
              eventDefs={eventDefs}
            />
          </div>
        </div>
      )}

      {/* ── Create Calendar Popup ── */}
      {showCreatePopup && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Create New Calendar</h3>
                <button onClick={() => { setShowCreatePopup(false); setCalendarName(''); setUploadedFile(null); setCreateError(null) }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {createError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{createError}</p>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Calendar Name</label>
                  <input type="text" value={calendarName} onChange={e => setCalendarName(e.target.value)} placeholder="e.g., 2025-26 Odd Semester" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year</label>
                  <select
                    value={startYear}
                    onChange={e => setStartYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {ACADEMIC_YEAR_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Excel File <span className="text-gray-400 font-normal">(3rd sheet used)</span>
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center">
                    <input type="file" accept=".xlsx,.xls" onChange={e => { if (e.target.files?.[0]) { setUploadedFile(e.target.files[0]); setCreateError(null) } }} className="hidden" id="calendar-upload" />
                    <label htmlFor="calendar-upload" className="cursor-pointer flex flex-col items-center">
                      <Upload className="w-10 h-10 text-gray-400 mb-2" />
                      {uploadedFile ? <p className="text-sm font-medium text-gray-700">{uploadedFile.name}</p> : <><p className="text-sm font-medium text-gray-700">Click to upload</p><p className="text-xs text-gray-500">Excel (.xlsx / .xls)</p></>}
                    </label>
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setShowCreatePopup(false); setCalendarName(''); setUploadedFile(null); setCreateError(null) }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                  <button onClick={handleCreateCalendar} disabled={isProcessing} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" />Processing...</> : 'Generate Calendar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ── Delete Confirmation ── */}
      {showDeleteConfirm && selectedCalendar && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
              {deleteError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{deleteError}</p>
                </div>
              )}
              <p className="text-gray-600 mb-4">Are you sure you want to delete "{selectedCalendar.name}"?</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Enter password to confirm</label>
                <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Password" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setSelectedCalendar(null); setDeleteError(null) }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleDeleteCalendar} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ── Assign Event Modal ── */}
      {showAssignModal && viewingCalendar && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Assign Event to Dates</h3>
                <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              {/* Date range display */}
              <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Start Date</span>
                  <span className="font-semibold text-gray-900">{dateKeyToLabel(selStart)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">End Date</span>
                  <span className="font-semibold text-gray-900">{dateKeyToLabel(selEnd)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 pt-0.5">
                  <span>Selected dates</span>
                  <span>{selectedDates.size} individual date{selectedDates.size !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Event select */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Event</label>
                {assignError && <p className="text-xs text-red-600 mb-1">{assignError}</p>}
                <div className="flex gap-2">
                  <select
                    value={assignEventId}
                    onChange={e => { setAssignEventId(e.target.value); setAssignError('') }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">— Select an event —</option>
                    {eventDefs.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.title}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowEventManager(true)}
                    className="px-3 py-2 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>
                {/* Color preview of selected event */}
                {assignEventId && (() => {
                  const ev = eventDefs.find(e => e.id === assignEventId)
                  return ev ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ev.color }} />
                      <span>Will show as <strong style={{ color: ev.color }}>{ev.title}</strong> on calendar</span>
                    </div>
                  ) : null
                })()}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowAssignModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleAssign} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Assign</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ── Calendar Events Manager Modal ── */}
      {showEventManager && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
              <CalendarEvents
                asModal
                onClose={() => setShowEventManager(false)}
                onEventCreated={showAssignModal ? (ev) => {
                  const updated = [...eventDefs, ev]
                  setEventDefs(updated)
                  setAssignEventId(ev.id)
                  setShowEventManager(false)
                } : undefined}
              />
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
