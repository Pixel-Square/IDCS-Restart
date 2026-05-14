import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CalendarData, CalendarDate, CalendarEventDef, DateAssignment } from './calendarTypes'
import { addMonths, daysInMonthGrid, formatMonthTitle, isSameDay } from './dateUtils'

// ── helpers ──────────────────────────────────────────────────────────────────

export function parseCalDate(s: string): Date | null {
  if (!s) return null
  // Accept d/m/yyyy, dd/mm/yyyy, d-m-yyyy, dd-mm-yyyy, yyyy-mm-dd
  let parts: string[]
  const trimmed = s.trim()
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    // ISO yyyy-mm-dd
    const [y, m, d] = trimmed.split('-').map(Number)
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null
    return new Date(y, m - 1, d)
  }
  parts = trimmed.split(/[\/\-]/) // split on / or -
  if (parts.length !== 3) return null
  const [d, m, y] = parts.map(Number)
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return new Date(y, m - 1, d)
}

function keyFor(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

// ── types ─────────────────────────────────────────────────────────────────────

interface ExcelEvent {
  label: string
  year: 'I' | 'II' | 'III' | 'IV' | 'all'
}

interface DayInfo {
  isHoliday: boolean
  excelEvents: ExcelEvent[]
  workingDayCount: string
}

const YEAR_COLORS: Record<string, string> = {
  I:   'bg-emerald-100 text-emerald-800 border-emerald-200',
  II:  'bg-blue-100 text-blue-800 border-blue-200',
  III: 'bg-violet-100 text-violet-800 border-violet-200',
  IV:  'bg-amber-100 text-amber-800 border-amber-200',
  all: 'bg-red-100 text-red-800 border-red-200',
}
const YEAR_DOT: Record<string, string> = {
  I: 'bg-emerald-500', II: 'bg-blue-500', III: 'bg-violet-500', IV: 'bg-amber-500', all: 'bg-red-500',
}

function buildDayMap(dates: CalendarDate[]): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>()
  for (const entry of dates) {
    // Normalize the date key so it always matches keyFor() output (no zero-padding)
    const parsed = parseCalDate(entry.date)
    if (!parsed) continue
    const key = keyFor(parsed)

    const day = entry.day.trim().toLowerCase()
    const wd = entry.workingDays.trim().toLowerCase()
    const isWeekend = day === 'sun' || day === 'sat' || wd === 'sun' || wd === 'sat'
    const isNamedHoliday = !isWeekend && wd !== '' && isNaN(Number(wd))
    const isHoliday = isWeekend || isNamedHoliday
    const events: ExcelEvent[] = []
    // Helper: only push if the column value is actual event text (not a number or Sat/Sun)
    const isEventText = (v: string) => !!v && isNaN(Number(v)) && v.toLowerCase() !== 'sat' && v.toLowerCase() !== 'sun'
    if (!isHoliday) {
      if (isEventText(entry.iiYearEvent))  events.push({ label: entry.iiYearEvent,  year: 'II'  })
      if (isEventText(entry.iiiYearEvent)) events.push({ label: entry.iiiYearEvent, year: 'III' })
      if (isEventText(entry.ivYearEvent))  events.push({ label: entry.ivYearEvent,  year: 'IV'  })
      if (isEventText(entry.iYearText))    events.push({ label: entry.iYearText,    year: 'I'   })
    }
    if (isNamedHoliday) events.push({ label: entry.workingDays.trim(), year: 'all' })
    map.set(key, { isHoliday, excelEvents: events, workingDayCount: entry.counter })
  }
  return map
}

function buildAssignmentMap(
  calendarId: string,
  assignments: DateAssignment[],
  eventDefsArr: CalendarEventDef[]
): Map<string, CalendarEventDef[]> {
  const defMap = new Map(eventDefsArr.map(e => [e.id, e]))
  const map = new Map<string, CalendarEventDef[]>()
  for (const a of assignments) {
    if (a.calendarId !== calendarId) continue
    const start = parseCalDate(a.startDate)
    const end = parseCalDate(a.endDate)
    const def = defMap.get(a.eventId)
    if (!start || !end || !def) continue
    const cur = new Date(start)
    while (cur <= end) {
      const key = keyFor(cur)
      const existing = map.get(key) || []
      existing.push(def)
      map.set(key, existing)
      cur.setDate(cur.getDate() + 1)
    }
  }
  return map
}

// ── sub-components ────────────────────────────────────────────────────────────

function LegendChip({ year, label }: { year: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${YEAR_COLORS[year]}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${YEAR_DOT[year]}`} />
      {label}
    </span>
  )
}

function ExcelPill({ ev }: { ev: ExcelEvent }) {
  return (
    <div className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate font-medium ${YEAR_COLORS[ev.year]}`} title={ev.label}>
      {ev.label}
    </div>
  )
}

function AssignedPill({ ev }: { ev: CalendarEventDef }) {
  return (
    <div
      className="text-[10px] leading-tight px-1 py-0.5 rounded truncate font-semibold text-white"
      style={{ backgroundColor: ev.color }}
      title={ev.title}
    >
      {ev.title}
    </div>
  )
}

interface DayCellProps {
  day: Date
  inMonth: boolean
  info?: DayInfo
  assignedEvents?: CalendarEventDef[]
  selectMode?: boolean
  isSelected?: boolean
  onToggle?: () => void
}

function DayCell({ day, inMonth, info, assignedEvents = [], selectMode, isSelected, onToggle }: DayCellProps) {
  const isToday = isSameDay(day, new Date())
  const isSun = day.getDay() === 0
  const isSat = day.getDay() === 6
  const isOffDay = info ? info.isHoliday : (isSun || isSat)
  const allEvents = [...(info?.excelEvents || []), ...(assignedEvents || [])]
  const totalEvents = (info?.excelEvents.length || 0) + assignedEvents.length

  let bg = 'bg-white border-gray-200 hover:border-blue-300'
  if (!inMonth) bg = 'bg-gray-50 border-gray-100 opacity-40'
  else if (isSelected) bg = 'bg-blue-50 border-blue-400 ring-2 ring-inset ring-blue-400'
  else if (isOffDay) bg = 'bg-orange-50 border-orange-300'

  return (
    <div
      onClick={() => selectMode && inMonth && onToggle?.()}
      className={`min-h-[92px] sm:aspect-square border-2 rounded-lg p-1.5 sm:p-2 flex flex-col transition-all hover:shadow-md overflow-hidden
        ${bg}
        ${selectMode && inMonth ? 'cursor-pointer hover:bg-blue-50' : ''}
      `}
    >
      <div className="flex items-start justify-between mb-1">
        <span className={`font-bold text-xl sm:text-2xl
          ${isToday ? 'text-blue-600' : isSun ? 'text-red-500' : isSat ? 'text-orange-500' : 'text-gray-900'}`}>
          {day.getDate()}
        </span>
        <div className="flex flex-col items-end gap-1">
          {info?.workingDayCount && (
            <span className="text-[10px] text-gray-500 font-medium bg-gray-100 px-1 rounded">{info.workingDayCount}</span>
          )}
          {selectMode && inMonth && (
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
              ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-400 bg-white'}`}>
              {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </svg>}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-0.5 overflow-hidden flex-1 mt-1">
        {/* Assigned custom events first */}
        {assignedEvents.slice(0, 2).map((ev, i) => <AssignedPill key={`a-${i}`} ev={ev} />)}
        {/* Excel events */}
        {info?.excelEvents.slice(0, assignedEvents.length > 0 ? 2 : 4).map((ev, i) => <ExcelPill key={`e-${i}`} ev={ev} />)}
        {totalEvents > (assignedEvents.length > 0 ? 2 : 4) && (
          <div className="text-[10px] text-gray-500 pl-1 font-medium">+{totalEvents - (assignedEvents.length > 0 ? 2 : 4)} more</div>
        )}
      </div>
    </div>
  )
}

// ── exported grid ─────────────────────────────────────────────────────────────

export interface CalendarGridProps {
  calendar: CalendarData
  selectMode?: boolean
  selectedDates?: Set<string>
  onToggleDate?: (key: string) => void
  assignments?: DateAssignment[]
  eventDefs?: CalendarEventDef[]
}

export function CalendarGrid({
  calendar,
  selectMode,
  selectedDates = new Set(),
  onToggleDate,
  assignments = [],
  eventDefs = [],
}: CalendarGridProps) {

  // Compute first date month as initial
  const firstDate = parseCalDate(calendar.dates[0]?.date || '')
  const [currentMonth, setCurrentMonth] = useState<Date>(
    firstDate ? new Date(firstDate.getFullYear(), firstDate.getMonth(), 1) : new Date()
  )

  const dayMap = useMemo(() => buildDayMap(calendar.dates), [calendar])
  const assignmentMap = useMemo(() => buildAssignmentMap(calendar.id, assignments, eventDefs), [assignments, eventDefs, calendar.id])
  const gridDays = useMemo(() => daysInMonthGrid(currentMonth), [currentMonth])

  // Restrict navigation to months that have data
  const { minMonth, maxMonth } = useMemo(() => {
    let min: Date | null = null
    let max: Date | null = null
    for (const d of calendar.dates) {
      const p = parseCalDate(d.date)
      if (!p) continue
      if (!min || p < min) min = p
      if (!max || p > max) max = p
    }
    return {
      minMonth: min ? new Date(min.getFullYear(), min.getMonth(), 1) : null,
      maxMonth: max ? new Date(max.getFullYear(), max.getMonth(), 1) : null,
    }
  }, [calendar.dates])

  const canGoPrev = !minMonth || !sameMonth(currentMonth, minMonth) && currentMonth > minMonth
  const canGoNext = !maxMonth || !sameMonth(currentMonth, maxMonth) && currentMonth < maxMonth

  return (
    <div className="flex flex-col">
      {/* Legend + month nav */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => canGoPrev && setCurrentMonth(m => addMonths(m, -1))}
            disabled={!canGoPrev}
            className="p-1 rounded hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-semibold text-gray-800 min-w-[170px] text-center">
            {formatMonthTitle(currentMonth)}
          </span>
          <button
            onClick={() => canGoNext && setCurrentMonth(m => addMonths(m, 1))}
            disabled={!canGoNext}
            className="p-1 rounded hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <LegendChip year="I"   label="I Year" />
          <LegendChip year="II"  label="II Year" />
          <LegendChip year="III" label="III Year" />
          <LegendChip year="IV"  label="IV Year" />
          <LegendChip year="all" label="Holiday" />
          {eventDefs.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border bg-gray-800 text-white border-gray-700">
              ● Events
            </span>
          )}
        </div>
      </div>

      {/* DOW header */}
      <div className="hidden sm:grid grid-cols-7 gap-1 sm:gap-2 border-b border-gray-200 bg-white px-1 sm:px-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dow => (
          <div key={dow} className={`py-1.5 text-center text-xs font-semibold uppercase tracking-wide
            ${dow === 'Sun' ? 'text-red-500' : dow === 'Sat' ? 'text-orange-500' : 'text-gray-500'}`}>
            {dow}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-1 sm:gap-2 p-1 sm:p-2 bg-gray-50">
        {gridDays.map((day, idx) => {
          const k = keyFor(day)
          return (
            <DayCell
              key={idx}
              day={day}
              inMonth={day.getMonth() === currentMonth.getMonth()}
              info={dayMap.get(k)}
              assignedEvents={assignmentMap.get(k)}
              selectMode={selectMode}
              isSelected={selectedDates.has(k)}
              onToggle={() => onToggleDate?.(k)}
            />
          )
        })}
      </div>
    </div>
  )
}
