import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar } from 'lucide-react'
import { CalendarData, CalendarDate, loadCalendars } from './calendarTypes'

function rowBgClass(entry: CalendarDate): string {
  const d = entry.day.toLowerCase()
  const wd = entry.workingDays.toLowerCase()
  if (d === 'sun' || wd === 'sun') return 'bg-orange-100'
  if (d === 'sat' || wd === 'sat') return 'bg-orange-50'
  return ''
}

function yearCell(event: string, count: string, workingDays: string): string {
  const wd = workingDays.toLowerCase()
  if (wd === 'sun' || wd === 'sat') return workingDays
  if (event) return event
  return count
}

export default function AcademicCalendarView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [calendar, setCalendar] = useState<CalendarData | null>(null)

  useEffect(() => {
    const all = loadCalendars()
    const found = all.find(c => c.id === id)
    setCalendar(found || null)
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-full mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/iqac/calendar/admin')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{calendar.name}</h1>
              <p className="text-sm text-gray-500">
                {calendar.academicYear} &bull;{' '}
                <span className={`font-medium ${calendar.semesterType === 'ODD' ? 'text-blue-600' : 'text-purple-600'}`}>
                  {calendar.semesterType} Semester
                </span>
                &bull; {calendar.dates.length} entries
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="p-6 overflow-x-auto">
        <table className="min-w-full border border-gray-300 text-sm bg-white">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold whitespace-nowrap">Date</th>
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold whitespace-nowrap">Day</th>
              <th className="border border-gray-300 px-3 py-2 text-center font-semibold whitespace-nowrap">Working Days</th>
              <th className="border border-gray-300 px-3 py-2 text-center font-semibold whitespace-nowrap" colSpan={2}>II Year</th>
              <th className="border border-gray-300 px-3 py-2 text-center font-semibold whitespace-nowrap" colSpan={2}>III Year</th>
              <th className="border border-gray-300 px-3 py-2 text-center font-semibold whitespace-nowrap" colSpan={2}>IV Year</th>
              <th className="border border-gray-300 px-3 py-2 text-center font-semibold whitespace-nowrap">I Year</th>
            </tr>
            <tr className="bg-gray-100 text-xs text-gray-600">
              <th className="border border-gray-300 px-3 py-1"></th>
              <th className="border border-gray-300 px-3 py-1"></th>
              <th className="border border-gray-300 px-3 py-1"></th>
              <th className="border border-gray-300 px-3 py-1 text-center">Event</th>
              <th className="border border-gray-300 px-3 py-1 text-center">#</th>
              <th className="border border-gray-300 px-3 py-1 text-center">Event</th>
              <th className="border border-gray-300 px-3 py-1 text-center">#</th>
              <th className="border border-gray-300 px-3 py-1 text-center">Event</th>
              <th className="border border-gray-300 px-3 py-1 text-center">#</th>
              <th className="border border-gray-300 px-3 py-1 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {calendar.dates.map((entry, idx) => {
              const bg = rowBgClass(entry)
              const isHoliday = bg === 'bg-orange-100'
              return (
                <tr key={idx} className={bg || (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                  <td className={`border border-gray-300 px-3 py-1.5 whitespace-nowrap font-medium ${isHoliday ? 'text-orange-800' : ''}`}>
                    {entry.date}
                  </td>
                  <td className={`border border-gray-300 px-3 py-1.5 whitespace-nowrap ${isHoliday ? 'text-orange-800 font-semibold' : ''}`}>
                    {entry.day}
                  </td>
                  <td className={`border border-gray-300 px-3 py-1.5 text-center ${entry.workingDays ? 'font-semibold text-orange-700' : ''}`}>
                    {entry.workingDays}
                  </td>
                  {/* II Year */}
                  <td className={`border border-gray-300 px-3 py-1.5 ${entry.iiYearEvent && !isHoliday ? 'text-blue-700 font-medium' : ''}`}>
                    {isHoliday ? '' : entry.iiYearEvent}
                  </td>
                  <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-700">
                    {isHoliday ? '' : entry.iiYearCount}
                  </td>
                  {/* III Year */}
                  <td className={`border border-gray-300 px-3 py-1.5 ${entry.iiiYearEvent && !isHoliday ? 'text-blue-700 font-medium' : ''}`}>
                    {isHoliday ? '' : entry.iiiYearEvent}
                  </td>
                  <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-700">
                    {isHoliday ? '' : entry.iiiYearCount}
                  </td>
                  {/* IV Year */}
                  <td className={`border border-gray-300 px-3 py-1.5 ${entry.ivYearEvent && !isHoliday ? 'text-blue-700 font-medium' : ''}`}>
                    {isHoliday ? '' : entry.ivYearEvent}
                  </td>
                  <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-700">
                    {isHoliday ? '' : entry.ivYearCount}
                  </td>
                  {/* I Year */}
                  <td className={`border border-gray-300 px-3 py-1.5 text-center ${entry.iYearText && !isHoliday ? 'text-gray-700' : ''}`}>
                    {isHoliday ? '' : entry.iYearText}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
