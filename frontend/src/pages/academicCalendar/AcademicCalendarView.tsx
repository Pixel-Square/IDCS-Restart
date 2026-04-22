import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar } from 'lucide-react'
import { CalendarData, CalendarEventDef, DateAssignment, loadCalendars, loadEventDefs, loadDateAssignments } from './calendarTypes'
import { CalendarGrid } from './CalendarGrid'

export default function AcademicCalendarView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [calendar, setCalendar] = useState<CalendarData | null>(null)
  const [eventDefs, setEventDefs] = useState<CalendarEventDef[]>([])
  const [assignments, setAssignments] = useState<DateAssignment[]>([])

  useEffect(() => {
    const all = loadCalendars()
    setCalendar(all.find(c => c.id === id) || null)
    setEventDefs(loadEventDefs())
    setAssignments(loadDateAssignments())
  }, [id])

  if (!calendar) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">Calendar not found</p>
          <button onClick={() => navigate('/iqac/calendar/admin')} className="mt-4 text-blue-600 hover:underline text-sm">
            ← Back to Admin
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate('/iqac/calendar/admin')} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <h1 className="text-base font-bold text-gray-900">{calendar.name}</h1>
            <p className="text-xs text-gray-500">
              {calendar.academicYear} &bull;{' '}
              <span className={calendar.semesterType === 'ODD' ? 'text-blue-600 font-medium' : 'text-purple-600 font-medium'}>
                {calendar.semesterType} Semester
              </span>
              &bull; {calendar.dates.length} days
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
          <CalendarGrid calendar={calendar} assignments={assignments} eventDefs={eventDefs} />
        </div>
      </div>
    </div>
  )
}
