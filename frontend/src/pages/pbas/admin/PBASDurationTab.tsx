import React, { useEffect, useMemo, useState } from 'react'
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  Info,
  CalendarRange,
} from 'lucide-react'
import { ModalPortal } from '../../../components/ModalPortal'
import {
  PBASDuration,
  createPBASDuration,
  deletePBASDuration,
  fetchPBASDurations,
} from '../../../services/pbas'

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function calculateDays(startStr: string, endStr: string): number {
  try {
    const [y1, m1, d1] = startStr.split('-').map(Number)
    const [y2, m2, d2] = endStr.split('-').map(Number)
    const date1 = new Date(y1, m1 - 1, d1)
    const date2 = new Date(y2, m2 - 1, d2)
    const diffTime = date2.getTime() - date1.getTime()
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1)
  } catch {
    return 0
  }
}

function getDurationStatus(startStr: string, endStr: string): 'active' | 'upcoming' | 'completed' {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  if (todayStr >= startStr && todayStr <= endStr) {
    return 'active'
  }
  if (todayStr < startStr) {
    return 'upcoming'
  }
  return 'completed'
}

export default function PBASDurationTab() {
  const [durations, setDurations] = useState<PBASDuration[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Add Duration Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [modalError, setModalError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Calendar month views for the dual calendar
  const today = new Date()
  const [calMonthFrom, setCalMonthFrom] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1))
  const [calMonthTo, setCalMonthTo] = useState<Date>(new Date(today.getFullYear(), today.getMonth() + 1, 1))

  const loadDurations = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const data = await fetchPBASDurations()
      // sort by start_date descending
      data.sort((a, b) => (b.start_date > a.start_date ? 1 : -1))
      setDurations(data)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load PBAS durations.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDurations()
  }, [])

  const handleOpenAddModal = () => {
    setTitle('')
    setStartDate('')
    setEndDate('')
    setModalError('')
    const now = new Date()
    setCalMonthFrom(new Date(now.getFullYear(), now.getMonth(), 1))
    setCalMonthTo(new Date(now.getFullYear(), now.getMonth() + 1, 1))
    setIsAddModalOpen(true)
  }

  // Find which duration a date string (YYYY-MM-DD) falls into, if any
  const getBlockedDurationForDate = (dateStr: string): PBASDuration | null => {
    for (const d of durations) {
      if (dateStr >= d.start_date && dateStr <= d.end_date) {
        return d
      }
    }
    return null
  }

  // Check if any blocked dates fall between startDate and endDate
  const hasBlockedDatesInRange = (fromStr: string, toStr: string): PBASDuration | null => {
    if (!fromStr || !toStr || fromStr > toStr) return null
    for (const d of durations) {
      // Overlap condition: start_date <= toStr && end_date >= fromStr
      if (d.start_date <= toStr && d.end_date >= fromStr) {
        return d
      }
    }
    return null
  }

  const handleSelectStartDate = (dateStr: string) => {
    const blocked = getBlockedDurationForDate(dateStr)
    if (blocked) {
      setModalError(`Date ${formatDateDisplay(dateStr)} is already reserved in "${blocked.title}".`)
      return
    }
    setStartDate(dateStr)
    setModalError('')
    if (endDate && endDate < dateStr) {
      setEndDate('')
    } else if (endDate) {
      const overlapping = hasBlockedDatesInRange(dateStr, endDate)
      if (overlapping) {
        setEndDate('')
        setModalError(`Selected range overlaps with "${overlapping.title}". Please pick a valid end date.`)
      }
    }
  }

  const handleSelectEndDate = (dateStr: string) => {
    const blocked = getBlockedDurationForDate(dateStr)
    if (blocked) {
      setModalError(`Date ${formatDateDisplay(dateStr)} is already reserved in "${blocked.title}".`)
      return
    }
    if (!startDate) {
      setStartDate(dateStr)
      setModalError('')
      return
    }
    if (dateStr < startDate) {
      setStartDate(dateStr)
      setEndDate('')
      setModalError('')
      return
    }
    const overlapping = hasBlockedDatesInRange(startDate, dateStr)
    if (overlapping) {
      setModalError(`Selected range contains reserved days from "${overlapping.title}".`)
      return
    }
    setEndDate(dateStr)
    setModalError('')
  }

  const handleSaveDuration = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setModalError('Please enter a duration title.')
      return
    }
    if (!startDate) {
      setModalError('Please select a From Date.')
      return
    }
    if (!endDate) {
      setModalError('Please select a To Date.')
      return
    }
    if (startDate > endDate) {
      setModalError('From Date cannot be after To Date.')
      return
    }
    const overlapping = hasBlockedDatesInRange(startDate, endDate)
    if (overlapping) {
      setModalError(`This duration overlaps with "${overlapping.title}" (${formatDateDisplay(overlapping.start_date)} - ${formatDateDisplay(overlapping.end_date)}).`)
      return
    }

    setSubmitting(true)
    setModalError('')
    try {
      await createPBASDuration({
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
      })
      setIsAddModalOpen(false)
      setSuccessMsg(`Duration "${title.trim()}" created successfully!`)
      setTimeout(() => setSuccessMsg(''), 4000)
      await loadDurations()
    } catch (err: any) {
      setModalError(err.message || 'Failed to create duration.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteDuration = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    try {
      await deletePBASDuration(deletingId)
      setDeletingId(null)
      setSuccessMsg('Duration removed successfully.')
      setTimeout(() => setSuccessMsg(''), 4000)
      await loadDurations()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete duration.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Summary statistics
  const stats = useMemo(() => {
    let activeCount = 0
    let upcomingCount = 0
    let completedCount = 0
    for (const d of durations) {
      const st = getDurationStatus(d.start_date, d.end_date)
      if (st === 'active') activeCount++
      else if (st === 'upcoming') upcomingCount++
      else completedCount++
    }
    return { total: durations.length, activeCount, upcomingCount, completedCount }
  }, [durations])

  // Helper to render a month calendar grid
  const renderCalendarMonth = (
    currentMonth: Date,
    onChangeMonth: (delta: number) => void,
    isForStart: boolean
  ) => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const monthName = currentMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })

    const firstDayIndex = new Date(year, month, 1).getDay() // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const days: Array<{ dayNum: number; dateStr: string }> = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({ dayNum: d, dateStr })
    }

    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex-1 min-w-[280px]">
        {/* Calendar Header with Navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => onChangeMonth(-1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 block">
              {isForStart ? '1. From Date Calendar' : '2. To Date Calendar'}
            </span>
            <span className="text-sm font-bold text-slate-800">{monthName}</span>
          </div>
          <button
            type="button"
            onClick={() => onChangeMonth(1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dw, i) => (
            <span key={dw} className={`text-[11px] font-bold ${i === 0 || i === 6 ? 'text-rose-500' : 'text-slate-400'}`}>
              {dw}
            </span>
          ))}
        </div>

        {/* Calendar Day Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells before month start */}
          {Array.from({ length: firstDayIndex }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-8" />
          ))}

          {/* Days */}
          {days.map(({ dayNum, dateStr }) => {
            const blocked = getBlockedDurationForDate(dateStr)
            const isStart = startDate === dateStr
            const isEnd = endDate === dateStr
            const inRange = startDate && endDate && dateStr >= startDate && dateStr <= endDate

            if (blocked) {
              return (
                <div
                  key={dateStr}
                  title={`Reserved in: ${blocked.title} (${formatDateDisplay(blocked.start_date)} - ${formatDateDisplay(blocked.end_date)})`}
                  className="h-8 rounded-lg bg-rose-50/70 border border-rose-200 text-rose-400 text-xs font-semibold flex items-center justify-center cursor-not-allowed select-none relative group"
                >
                  <span className="line-through opacity-75">{dayNum}</span>
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-slate-900 text-white text-[10px] font-medium px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-30 pointer-events-none">
                    ⛔ {blocked.title}
                  </span>
                </div>
              )
            }

            let btnClass = 'h-8 rounded-lg text-xs font-semibold transition-all flex items-center justify-center '
            if (isStart || isEnd) {
              btnClass += 'bg-indigo-600 text-white font-black shadow-md shadow-indigo-500/30 scale-105 z-10 ring-2 ring-indigo-300'
            } else if (inRange) {
              btnClass += 'bg-indigo-100 text-indigo-900 font-bold hover:bg-indigo-200'
            } else {
              btnClass += 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
            }

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => {
                  if (isForStart) {
                    handleSelectStartDate(dateStr)
                  } else {
                    handleSelectEndDate(dateStr)
                  }
                }}
                className={btnClass}
              >
                {dayNum}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner & Action */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5" />
              PBAS Assessment Cycles
            </span>
            {successMsg && (
              <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {successMsg}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2 flex items-center gap-2">
            PBAS Duration Management
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Configure non-overlapping academic duration cycles (From & To dates). Maximum credit limits set for leaf nodes in PBAS Config are enforced per duration cycle and automatically reset for new cycles. Submissions remain unlimited and all records are preserved.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-200 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span>Add Duration</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Cycles</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{stats.total}</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <CalendarIcon className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Active Cycle</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">{stats.activeCount}</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider">Upcoming Cycles</div>
            <div className="text-2xl font-black text-amber-700 mt-1">{stats.upcomingCount}</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Cycles</div>
            <div className="text-2xl font-black text-slate-700 mt-1">{stats.completedCount}</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
            <CalendarRange className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Durations List Table / Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="p-6 border-b border-slate-200/80 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Configured Duration Periods ({durations.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Dates cannot overlap across duration periods.
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500 font-medium text-sm flex flex-col items-center justify-center gap-2">
            <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading duration periods…</span>
          </div>
        ) : durations.length === 0 ? (
          <div className="py-16 text-center border-dashed m-6 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center">
            <CalendarIcon className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-slate-700 font-semibold">No PBAS Durations created yet.</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              Click the "Add Duration" button above to define your first assessment timeframe.
            </p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Duration</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {durations.map((dur) => {
              const status = getDurationStatus(dur.start_date, dur.end_date)
              const daysCount = calculateDays(dur.start_date, dur.end_date)

              let statusBadge = null
              if (status === 'active') {
                statusBadge = (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Active Cycle
                  </span>
                )
              } else if (status === 'upcoming') {
                statusBadge = (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock className="w-3 h-3 text-amber-600" />
                    Upcoming
                  </span>
                )
              } else {
                statusBadge = (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    <CheckCircle2 className="w-3 h-3 text-slate-400" />
                    Completed
                  </span>
                )
              }

              return (
                <div
                  key={dur.id}
                  className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 truncate">
                        {dur.title}
                      </h3>
                      {statusBadge}
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {daysCount} Days
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">From:</span>
                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-bold">
                          {formatDateDisplay(dur.start_date)}
                        </span>
                      </div>
                      <span className="text-slate-300">&rarr;</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">To:</span>
                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-bold">
                          {formatDateDisplay(dur.end_date)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDeletingId(dur.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition-all"
                      title="Delete Duration"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL: ADD DURATION WITH DUAL CALENDAR SELECTOR */}
      {isAddModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-3xl overflow-hidden animate-zoom-popup-in transform transition-all flex flex-col max-h-[92vh]">
              {/* Modal Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-xl font-bold border border-indigo-500/30 text-indigo-300">
                    <CalendarRange className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">
                      PBAS Period Configuration
                    </span>
                    <h3 className="text-lg font-bold text-white">Add Assessment Duration</h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveDuration} className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
                {modalError && (
                  <div className="p-3.5 text-xs font-semibold text-red-700 bg-red-50 rounded-xl border border-red-200 flex items-center gap-2 animate-shake">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* 1. Title Input */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Duration Title <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500">
                    Name this assessment period (e.g., "Academic Year 2025-2026" or "Odd Semester 2025").
                  </p>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Academic Year 2025-2026"
                    className="w-full px-4 py-2.5 text-sm font-semibold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                </div>

                {/* 2. Selected Range Display Banner */}
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      📅
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">
                        Selected Time Period
                      </div>
                      <div className="text-xs text-slate-600 font-medium">
                        {startDate && endDate ? (
                          <span className="font-bold text-indigo-950">
                            {formatDateDisplay(startDate)} &rarr; {formatDateDisplay(endDate)} ({calculateDays(startDate, endDate)} days)
                          </span>
                        ) : startDate ? (
                          <span className="text-indigo-800">
                            From: <strong className="font-bold">{formatDateDisplay(startDate)}</strong> — Pick a To Date on the right calendar.
                          </span>
                        ) : (
                          <span className="text-slate-500">Pick From and To dates below. Reserved days are blocked in red.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-bold text-slate-600 shrink-0">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-indigo-600 inline-block" />
                      <span>Selected</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300 inline-block" />
                      <span>Blocked</span>
                    </div>
                  </div>
                </div>

                {/* 3. Dual Interactive Calendars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* From Date Calendar */}
                  {renderCalendarMonth(
                    calMonthFrom,
                    (delta) => {
                      setCalMonthFrom(new Date(calMonthFrom.getFullYear(), calMonthFrom.getMonth() + delta, 1))
                    },
                    true
                  )}

                  {/* To Date Calendar */}
                  {renderCalendarMonth(
                    calMonthTo,
                    (delta) => {
                      setCalMonthTo(new Date(calMonthTo.getFullYear(), calMonthTo.getMonth() + delta, 1))
                    },
                    false
                  )}
                </div>

                {/* Info Note */}
                <div className="p-3.5 rounded-xl bg-slate-100/80 border border-slate-200 text-slate-600 text-xs flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" />
                  <span>
                    When approved credits reach a leaf node's maximum limit within this duration, additional applications in the same duration are accepted but credit points will cap at the maximum. When a new duration begins, the credit limit resets automatically.
                  </span>
                </div>
              </form>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-500 font-medium">
                  {startDate && endDate ? `${calculateDays(startDate, endDate)} days duration` : 'Select date range'}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDuration}
                    disabled={submitting || !title || !startDate || !endDate}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    {submitting ? 'Saving…' : 'Save Duration'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deletingId && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6 space-y-4 animate-zoom-popup-in">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center font-bold">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delete Duration</h3>
                  <p className="text-xs text-slate-500">This action cannot be undone.</p>
                </div>
              </div>

              <p className="text-sm text-slate-600">
                Are you sure you want to remove this duration period? Any leaf node limits associated with this cycle timeframe will no longer apply to this period.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteDuration}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm"
                >
                  {isDeleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
