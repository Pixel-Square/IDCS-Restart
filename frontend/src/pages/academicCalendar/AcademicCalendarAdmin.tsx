import React, { useEffect, useRef, useState } from 'react'
import { Calendar, Upload, Plus, Trash2, AlertCircle, Loader2, X, Eye, ChevronUp, MousePointer2 } from 'lucide-react'
import { ModalPortal } from '../../components/ModalPortal'
import { CalendarData } from './calendarTypes'
import { CalendarGrid } from './CalendarGrid'
import fetchWithAuth from '../../services/fetchAuth'

const TEMPLATE_DROPDOWN_VALUES = [
  'Placement training',
  'L1',
  'CIA 1',
  'L2',
  'CIA 2',
  'Model',
  'CQI',
  'ESE LAB',
  'ESE Theory',
]

function formatIsoDateLabel(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString()
}

export default function AcademicCalendarAdmin() {
  const [calendars, setCalendars] = useState<CalendarData[]>([])

  // Viewing state
  const [viewingCalendar, setViewingCalendar] = useState<CalendarData | null>(null)
  const calendarGridRef = useRef<HTMLDivElement>(null)

  // Select mode
  const [selectMode, setSelectMode] = useState(false)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())

  // Create calendar form
  const [showCreatePopup, setShowCreatePopup] = useState(false)
  const [calendarName, setCalendarName] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [oddSaturday, setOddSaturday] = useState(false)
  const [evenSaturday, setEvenSaturday] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarData | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Edit selected days
  const [showEditModal, setShowEditModal] = useState(false)
  const [editError, setEditError] = useState('')
  const [isUpdatingDays, setIsUpdatingDays] = useState(false)
  const [editDraft, setEditDraft] = useState({
    workingDaysOption: '',
    holidayName: '',
    iiYearEvent: '',
    iiiYearEvent: '',
    ivYearEvent: '',
    iYearText: '',
    iiYearEventName: '',
    iiiYearEventName: '',
    ivYearEventName: '',
    iYearEventName: '',
  })

  useEffect(() => {
    refreshCalendarList()
  }, [])

  async function refreshCalendarList() {
    try {
      const res = await fetchWithAuth('/api/academic-calendar/calendars/')
      if (!res.ok) throw new Error('Failed to load calendars')
      const data = await res.json()
      const list = Array.isArray(data?.calendars) ? data.calendars : []
      const mapped: CalendarData[] = list.map((c: any) => ({
        id: c.id,
        name: c.name,
        academicYear: c.academic_year || '',
        fromDate: c.from_date,
        toDate: c.to_date,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        dates: [],
      }))
      setCalendars(mapped)
    } catch {
      setCalendars([])
    }
  }

  const downloadTemplate = async () => {
    if (!fromDate || !toDate) { setCreateError('Please enter from/to dates to download template'); return }
    setIsProcessing(true); setCreateError(null)
    try {
      const qs = new URLSearchParams({
        from_date: fromDate,
        to_date: toDate,
        odd_sat: oddSaturday ? '1' : '0',
        even_sat: evenSaturday ? '1' : '0',
      })
      const res = await fetchWithAuth(`/api/academic-calendar/calendar/template/?${qs.toString()}`)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to download template')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `academic_calendar_template_${fromDate}_${toDate}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to download template')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCreateCalendar = async () => {
    if (!calendarName.trim()) { setCreateError('Please enter a calendar name'); return }
    if (!fromDate || !toDate) { setCreateError('Please select from and to dates'); return }
    if (!uploadedFile) { setCreateError('Please upload an Excel file'); return }
    setIsProcessing(true); setCreateError(null)
    try {
      const fd = new FormData()
      fd.set('name', calendarName.trim())
      fd.set('from_date', fromDate)
      fd.set('to_date', toDate)
      fd.set('file', uploadedFile)
      const res = await fetchWithAuth('/api/academic-calendar/calendars/', { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to create calendar')
      }
      await refreshCalendarList()
      setCalendarName('')
      setFromDate('')
      setToDate('')
      setOddSaturday(false)
      setEvenSaturday(false)
      setUploadedFile(null)
      setShowCreatePopup(false)
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to process Excel file')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteCalendar = async () => {
    if (!selectedCalendar) return
    try {
      const res = await fetchWithAuth(`/api/academic-calendar/calendars/${selectedCalendar.id}/`, { method: 'DELETE' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Delete failed')
      }
      await refreshCalendarList()
      setShowDeleteConfirm(false)
      setSelectedCalendar(null)
      setDeleteError(null)
      if (viewingCalendar?.id === selectedCalendar.id) setViewingCalendar(null)
    } catch (err: any) {
      setDeleteError(err?.message || 'Delete failed')
    }
  }

  const openCalendarView = async (cal: CalendarData) => {
    setSelectMode(false); setSelectedDates(new Set())
    try {
      const res = await fetchWithAuth(`/api/academic-calendar/calendars/${cal.id}/`)
      if (!res.ok) throw new Error('Failed to load calendar')
      const data = await res.json()
      const c = data?.calendar
      if (c) {
        const mapped: CalendarData = {
          id: c.id,
          name: c.name,
          academicYear: c.academic_year || '',
          fromDate: c.from_date,
          toDate: c.to_date,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          dates: Array.isArray(c.dates) ? c.dates : [],
        }
        setViewingCalendar(mapped)
      }
      setTimeout(() => calendarGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch {
      setViewingCalendar(null)
    }
  }

  const toggleDate = (key: string) => {
    setSelectedDates(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  const applyDayEdits = async () => {
    if (!viewingCalendar) return
    if (selectedDates.size === 0) { setEditError('Select at least one date'); return }
    if (editDraft.workingDaysOption === 'Holiday' && !editDraft.holidayName.trim()) {
      setEditError('Enter a holiday name')
      return
    }
    // Validate event name fields
    if (editDraft.iiYearEvent === 'Event' && !editDraft.iiYearEventName.trim()) {
      setEditError('Enter event name for II Year'); return
    }
    if (editDraft.iiiYearEvent === 'Event' && !editDraft.iiiYearEventName.trim()) {
      setEditError('Enter event name for III Year'); return
    }
    if (editDraft.ivYearEvent === 'Event' && !editDraft.ivYearEventName.trim()) {
      setEditError('Enter event name for IV Year'); return
    }
    if (editDraft.iYearText === 'Event' && !editDraft.iYearEventName.trim()) {
      setEditError('Enter event name for I Year'); return
    }
    const workingDays = editDraft.workingDaysOption === 'Holiday'
      ? editDraft.holidayName.trim()
      : (editDraft.workingDaysOption || '')

    // Resolve "Event" placeholders to the typed event name
    const resolveYear = (val: string, name: string) => val === 'Event' ? name.trim() : val
    const iiYearEvent = resolveYear(editDraft.iiYearEvent, editDraft.iiYearEventName)
    const iiiYearEvent = resolveYear(editDraft.iiiYearEvent, editDraft.iiiYearEventName)
    const ivYearEvent = resolveYear(editDraft.ivYearEvent, editDraft.ivYearEventName)
    const iYearText = resolveYear(editDraft.iYearText, editDraft.iYearEventName)

    setIsUpdatingDays(true); setEditError('')
    try {
      // Convert d/m/yyyy keys → YYYY-MM-DD for reliable backend parsing
      const toIso = (key: string) => {
        const [d, m, y] = key.split('/').map(Number)
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      }
      const days = Array.from(selectedDates).map((dateKey) => ({
        date: toIso(dateKey),
        workingDays,
        iiYearEvent,
        iiiYearEvent,
        ivYearEvent,
        iYearText,
      }))
      const res = await fetchWithAuth(`/api/academic-calendar/calendars/${viewingCalendar.id}/`, {
        method: 'PUT',
        body: JSON.stringify({ days }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to update calendar')
      }
      const data = await res.json()
      const c = data?.calendar
      if (c) {
        setViewingCalendar({
          id: c.id,
          name: c.name,
          academicYear: c.academic_year || '',
          fromDate: c.from_date,
          toDate: c.to_date,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          dates: Array.isArray(c.dates) ? c.dates : [],
        })
      }
      setShowEditModal(false)
      setSelectedDates(new Set())
      setSelectMode(false)
      setEditDraft({ workingDaysOption: '', holidayName: '', iiYearEvent: '', iiiYearEvent: '', ivYearEvent: '', iYearText: '', iiYearEventName: '', iiiYearEventName: '', ivYearEventName: '', iYearEventName: '' })
    } catch (err: any) {
      setEditError(err?.message || 'Update failed')
    } finally {
      setIsUpdatingDays(false)
    }
  }

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
                    <button onClick={() => { setSelectedCalendar(calendar); setShowDeleteConfirm(true); setDeleteError(null) }} className="text-red-500 hover:text-red-700 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1 text-sm mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Range:</span>
                      <span className="text-xs font-medium text-gray-700">
                        {formatIsoDateLabel(calendar.fromDate)} - {formatIsoDateLabel(calendar.toDate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Entries:</span>
                      <span className="font-medium">{calendar.dates.length ? calendar.dates.length : '—'}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">Updated: {formatIsoDateLabel(calendar.updatedAt) || '—'}</div>
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
                  {viewingCalendar.academicYear} &bull; {formatIsoDateLabel(viewingCalendar.fromDate)} - {formatIsoDateLabel(viewingCalendar.toDate)}
                  &bull; {viewingCalendar.dates.length} days
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
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
                        onClick={() => { setEditError(''); setShowEditModal(true) }}
                        className="flex items-center gap-1.5 text-sm bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors"
                      >
                        Edit Days
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
                <button
                  onClick={() => {
                    setShowCreatePopup(false)
                    setCalendarName('')
                    setFromDate('')
                    setToDate('')
                    setOddSaturday(false)
                    setEvenSaturday(false)
                    setUploadedFile(null)
                    setCreateError(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={e => setFromDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={e => setToDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={oddSaturday} onChange={e => setOddSaturday(e.target.checked)} />
                    Auto-fill odd Saturdays as holiday
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={evenSaturday} onChange={e => setEvenSaturday(e.target.checked)} />
                    Auto-fill even Saturdays as holiday
                  </label>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    disabled={isProcessing}
                    className="w-full px-4 py-2 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                  >
                    Download Template
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Excel File
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
                  <button
                    onClick={() => {
                      setShowCreatePopup(false)
                      setCalendarName('')
                      setFromDate('')
                      setToDate('')
                      setOddSaturday(false)
                      setEvenSaturday(false)
                      setUploadedFile(null)
                      setCreateError(null)
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
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
              <div className="flex gap-3">
                <button onClick={() => { setShowDeleteConfirm(false); setSelectedCalendar(null); setDeleteError(null) }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleDeleteCalendar} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ── Edit Days Modal ── */}
      {showEditModal && viewingCalendar && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Edit Selected Days</h3>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              {editError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}
              <div className="text-xs text-gray-500 mb-3">Applies to {selectedDates.size} selected date{selectedDates.size !== 1 ? 's' : ''}.</div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Working Days</label>
                  <select
                    value={editDraft.workingDaysOption}
                    onChange={e => setEditDraft({ ...editDraft, workingDaysOption: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select —</option>
                    {TEMPLATE_DROPDOWN_VALUES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    <option value="Holiday">Holiday</option>
                  </select>
                </div>
                {editDraft.workingDaysOption === 'Holiday' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Name</label>
                    <input
                      type="text"
                      value={editDraft.holidayName}
                      onChange={e => setEditDraft({ ...editDraft, holidayName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {/* II Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">II Year</label>
                  <select
                    value={editDraft.iiYearEvent}
                    onChange={e => setEditDraft({ ...editDraft, iiYearEvent: e.target.value, iiYearEventName: '' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select —</option>
                    {TEMPLATE_DROPDOWN_VALUES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    <option value="Event">Event (Custom)</option>
                  </select>
                  {editDraft.iiYearEvent === 'Event' && (
                    <input
                      type="text"
                      placeholder="Enter event name…"
                      value={editDraft.iiYearEventName}
                      onChange={e => setEditDraft({ ...editDraft, iiYearEventName: e.target.value })}
                      className="mt-1.5 w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-amber-50 text-sm"
                    />
                  )}
                </div>
                {/* III Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">III Year</label>
                  <select
                    value={editDraft.iiiYearEvent}
                    onChange={e => setEditDraft({ ...editDraft, iiiYearEvent: e.target.value, iiiYearEventName: '' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select —</option>
                    {TEMPLATE_DROPDOWN_VALUES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    <option value="Event">Event (Custom)</option>
                  </select>
                  {editDraft.iiiYearEvent === 'Event' && (
                    <input
                      type="text"
                      placeholder="Enter event name…"
                      value={editDraft.iiiYearEventName}
                      onChange={e => setEditDraft({ ...editDraft, iiiYearEventName: e.target.value })}
                      className="mt-1.5 w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-amber-50 text-sm"
                    />
                  )}
                </div>
                {/* IV Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IV Year</label>
                  <select
                    value={editDraft.ivYearEvent}
                    onChange={e => setEditDraft({ ...editDraft, ivYearEvent: e.target.value, ivYearEventName: '' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select —</option>
                    {TEMPLATE_DROPDOWN_VALUES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    <option value="Event">Event (Custom)</option>
                  </select>
                  {editDraft.ivYearEvent === 'Event' && (
                    <input
                      type="text"
                      placeholder="Enter event name…"
                      value={editDraft.ivYearEventName}
                      onChange={e => setEditDraft({ ...editDraft, ivYearEventName: e.target.value })}
                      className="mt-1.5 w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-amber-50 text-sm"
                    />
                  )}
                </div>
                {/* I Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">I Year</label>
                  <select
                    value={editDraft.iYearText}
                    onChange={e => setEditDraft({ ...editDraft, iYearText: e.target.value, iYearEventName: '' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select —</option>
                    {TEMPLATE_DROPDOWN_VALUES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    <option value="Event">Event (Custom)</option>
                  </select>
                  {editDraft.iYearText === 'Event' && (
                    <input
                      type="text"
                      placeholder="Enter event name…"
                      value={editDraft.iYearEventName}
                      onChange={e => setEditDraft({ ...editDraft, iYearEventName: e.target.value })}
                      className="mt-1.5 w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-amber-50 text-sm"
                    />
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowEditModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button
                  onClick={applyDayEdits}
                  disabled={isUpdatingDays}
                  className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUpdatingDays ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : 'Apply Changes'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}