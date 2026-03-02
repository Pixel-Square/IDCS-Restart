import React, { useEffect, useMemo, useState } from 'react'
import { ModalPortal } from '../../components/ModalPortal'
import {
  CalendarEvent,
  CalendarMode,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarConfig,
  getCalendarEvents,
  getHodColours,
  HodColourRow,
  importCalendarUpload,
  parseCalendarUpload,
  setHodColour,
  updateCalendarEvent,
} from '../../services/academicCalendar'
import { addMonths, daysInMonthGrid, endOfMonth, formatMonthTitle, isoDate, isSameDay, startOfMonth } from './dateUtils'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type EditDraft = {
  id?: string
  title: string
  description: string
  start_date: string
  end_date: string
  year: string
  year_label: string
  audience_all: boolean
  audience_departments: string[]
  image_url: string
  image_file: File | null
}

function toDraft(ev: CalendarEvent, fallbackDate: string): EditDraft {
  return {
    id: ev.id,
    title: ev.title || '',
    description: ev.description || '',
    start_date: ev.start_date || fallbackDate,
    end_date: ev.end_date || ev.start_date || fallbackDate,
    year: ev.year != null ? String(ev.year) : '',
    year_label: ev.year_label || '',
    audience_all: !ev.audience_department,
    audience_departments: ev.audience_department ? String(ev.audience_department).split(',').map(s => s.trim()).filter(Boolean) : [],
    image_url: ev.image_url || '',
    image_file: null,
  }
}

function emptyDraft(dateStr: string): EditDraft {
  return {
    title: '',
    description: '',
    start_date: dateStr,
    end_date: dateStr,
    year: '',
    year_label: '',
    audience_all: true,
    audience_departments: [],
    image_url: '',
    image_file: null,
  }
}

function dateRangeIncludesDay(startIso: string, endIso: string, dayIso: string): boolean {
  return startIso <= dayIso && dayIso <= endIso
}

export default function AcademicCalendarPage(props: { mode: CalendarMode }) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [config, setConfig] = useState<any>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [busy, setBusy] = useState(false)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<any[] | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[] | null>(null)

  const [hodColoursOpen, setHodColoursOpen] = useState(false)
  const [hodRows, setHodRows] = useState<HodColourRow[] | null>(null)
  const [hodErr, setHodErr] = useState<string | null>(null)

  const canCreate = props.mode === 'iqac' || props.mode === 'hod'

  const monthStart = useMemo(() => isoDate(startOfMonth(month)), [month])
  const monthEnd = useMemo(() => isoDate(endOfMonth(month)), [month])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    Promise.all([getCalendarConfig(props.mode), getCalendarEvents({ mode: props.mode, monthStart, monthEnd })])
      .then(([cfg, evs]) => {
        if (!mounted) return
        setConfig(cfg)
        setEvents(evs)
      })
      .catch((e) => {
        if (!mounted) return
        setError(e?.message || 'Failed to load')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [props.mode, monthStart, monthEnd])

  const byDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const e of events) {
      // Expand multi-day events across the month grid (bounded by current month range)
      const start = e.start_date
      const end = e.end_date || e.start_date
      const grid = daysInMonthGrid(month)
      for (const d of grid) {
        const di = isoDate(d)
        if (!dateRangeIncludesDay(start, end, di)) continue
        if (!map[di]) map[di] = []
        map[di].push(e)
      }
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '') || (a.title || '').localeCompare(b.title || ''))
    }
    return map
  }, [events, month])

  const selectedIso = selectedDay ? isoDate(selectedDay) : null
  const selectedEvents = selectedIso ? (byDay[selectedIso] || []) : []

  function openCreateFor(day: Date) {
    const ds = isoDate(day)
    setDraft(emptyDraft(ds))
    setEditorOpen(true)
  }

  function openEdit(ev: CalendarEvent) {
    const fallback = selectedIso || ev.start_date
    setDraft(toDraft(ev, fallback))
    setEditorOpen(true)
  }

  async function refreshMonth() {
    const evs = await getCalendarEvents({ mode: props.mode, monthStart, monthEnd })
    setEvents(evs)
  }

  async function onSaveDraft() {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('title', draft.title)
      fd.set('description', draft.description)
      fd.set('start_date', draft.start_date)
      fd.set('end_date', draft.end_date)
      fd.set('all_day', 'true')
      if (draft.year) fd.set('year', draft.year)
      if (draft.year_label) fd.set('year_label', draft.year_label)

      if (props.mode === 'hod') {
        fd.set('audience_all', draft.audience_all ? 'true' : 'false')
      }
      if (!draft.audience_all && draft.audience_departments.length) {
        fd.set('audience_departments', JSON.stringify(draft.audience_departments))
      } else {
        fd.set('audience_departments', JSON.stringify([]))
      }

      if (draft.image_url) fd.set('image_url', draft.image_url)
      if (draft.image_file) fd.set('image', draft.image_file)

      if (draft.id) {
        await updateCalendarEvent(draft.id, fd)
      } else {
        await createCalendarEvent(props.mode, fd)
      }

      setEditorOpen(false)
      setDraft(null)
      await refreshMonth()
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(ev: CalendarEvent) {
    if (!ev?.id) return
    if (!window.confirm('Delete this event?')) return
    setBusy(true)
    try {
      await deleteCalendarEvent(ev.id)
      await refreshMonth()
      setSelectedDay(null)
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function loadHodColours() {
    setHodErr(null)
    setHodRows(null)
    try {
      const rows = await getHodColours()
      setHodRows(rows)
    } catch (e: any) {
      setHodErr(e?.message || 'Failed to load HOD colours')
    }
  }

  async function onUploadParse() {
    if (!uploadFile) return
    setBusy(true)
    setUploadErrors(null)
    setUploadPreview(null)
    try {
      const out = await parseCalendarUpload(uploadFile)
      setUploadPreview(Array.isArray(out?.events) ? out.events : [])
      setUploadErrors(Array.isArray(out?.errors) ? out.errors : [])
    } catch (e: any) {
      setUploadErrors([e?.message || 'Parse failed'])
    } finally {
      setBusy(false)
    }
  }

  async function onUploadImport() {
    if (!uploadPreview?.length) return
    if (!window.confirm(`Import ${uploadPreview.length} events?`)) return
    setBusy(true)
    try {
      await importCalendarUpload(uploadPreview)
      setUploadOpen(false)
      setUploadFile(null)
      setUploadPreview(null)
      setUploadErrors(null)
      await refreshMonth()
    } catch (e: any) {
      setUploadErrors([e?.message || 'Import failed'])
    } finally {
      setBusy(false)
    }
  }

  const gridDays = useMemo(() => daysInMonthGrid(month), [month])
  const today = useMemo(() => new Date(), [])

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-2xl font-semibold text-gray-900">Academic Calendar</div>
          <div className="text-sm text-gray-600 mt-1">
            Mode: <span className="font-medium">{props.mode.toUpperCase()}</span>
            {config?.showing_department ? (
              <span>
                {' '}
                • Department: <span className="font-medium">{String(config.showing_department)}</span>
              </span>
            ) : null}
            {props.mode === 'student' && config?.student_year_roman ? (
              <span>
                {' '}
                • Year: <span className="font-medium">{String(config.student_year_roman)}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" onClick={() => setMonth(addMonths(month, -1))}>Prev</button>
          <div className="px-3 py-2 rounded-md bg-gray-100 text-gray-800 font-medium min-w-[190px] text-center">{formatMonthTitle(month)}</div>
          <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" onClick={() => setMonth(addMonths(month, 1))}>Next</button>

          {canCreate ? (
            <button
              className="ml-2 px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              onClick={() => openCreateFor(new Date())}
              disabled={busy}
            >
              Add Event
            </button>
          ) : null}

          {props.mode === 'iqac' ? (
            <>
              <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" onClick={() => { setUploadOpen(true); setUploadPreview(null); setUploadErrors(null); }}>
                Upload Calendar
              </button>
              <button
                className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setHodColoursOpen(true)
                  loadHodColours()
                }}
              >
                HOD Colours
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-4 p-3 rounded-md bg-red-50 text-red-700 border border-red-200">{error}</div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-gray-600">Loading…</div>
      ) : (
        <div className="mt-6 bg-white rounded-lg border overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-gray-50">
            {DOW.map((d) => (
              <div key={d} className="px-3 py-2 text-xs font-semibold text-gray-600">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {gridDays.map((d) => {
              const inMonth = d.getMonth() === month.getMonth()
              const di = isoDate(d)
              const evs = byDay[di] || []
              const isToday = isSameDay(d, today)
              return (
                <button
                  key={di}
                  className={`min-h-[110px] border-b border-r last:border-r-0 text-left p-2 hover:bg-blue-50 transition-colors ${inMonth ? 'bg-white' : 'bg-gray-50'} `}
                  onClick={() => setSelectedDay(d)}
                >
                  <div className="flex items-center justify-between">
                    <div className={`text-xs font-semibold ${inMonth ? 'text-gray-900' : 'text-gray-500'}`}>{d.getDate()}</div>
                    {isToday ? <div className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white">Today</div> : null}
                  </div>
                  <div className="mt-1 space-y-1">
                    {evs.slice(0, 3).map((e) => (
                      <div key={e.id} className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: e.creator_color || (e.source === 'iqac' ? '#2563eb' : '#16a34a') }}
                        />
                        <span className="text-xs text-gray-800 truncate">{e.title}</span>
                      </div>
                    ))}
                    {evs.length > 3 ? <div className="text-[11px] text-gray-500">+{evs.length - 3} more</div> : null}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Day modal */}
      {selectedDay ? (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedDay(null)} />
            <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-xl border">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div>
                  <div className="text-lg font-semibold text-gray-900">{selectedDay.toLocaleDateString()}</div>
                  <div className="text-sm text-gray-600">{selectedEvents.length} event(s)</div>
                </div>
                <div className="flex items-center gap-2">
                  {canCreate ? (
                    <button className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={() => openCreateFor(selectedDay)}>
                      Add
                    </button>
                  ) : null}
                  <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" onClick={() => setSelectedDay(null)}>
                    Close
                  </button>
                </div>
              </div>
              <div className="p-4">
                {selectedEvents.length ? (
                  <div className="space-y-3">
                    {selectedEvents.map((e) => (
                      <div key={e.id} className="p-3 rounded-md border">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: e.creator_color || (e.source === 'iqac' ? '#2563eb' : '#16a34a') }}
                              />
                              <div className="font-semibold text-gray-900">{e.title}</div>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{e.source.toUpperCase()}</span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {e.start_date}{e.end_date && e.end_date !== e.start_date ? ` → ${e.end_date}` : ''}
                              {e.year ? ` • Year ${e.year}` : ''}
                              {e.audience_department ? ` • ${e.audience_department}` : ''}
                            </div>
                            {e.description ? <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{e.description}</div> : null}
                            {e.image_url ? (
                              <a className="text-sm text-blue-600 hover:underline mt-2 inline-block" href={e.image_url} target="_blank" rel="noreferrer">
                                View attachment
                              </a>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            {e.can_edit ? (
                              <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" onClick={() => openEdit(e)}>
                                Edit
                              </button>
                            ) : null}
                            {e.can_delete ? (
                              <button className="px-3 py-2 rounded-md bg-red-600 text-white hover:bg-red-700" onClick={() => onDelete(e)}>
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-600">No events.</div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {/* Editor modal */}
      {editorOpen && draft ? (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => { if (!busy) { setEditorOpen(false); setDraft(null) } }} />
            <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl border">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-lg font-semibold text-gray-900">{draft.id ? 'Edit Event' : 'Add Event'}</div>
                <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" onClick={() => { if (!busy) { setEditorOpen(false); setDraft(null) } }}>
                  Close
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-sm font-medium text-gray-700">Title</div>
                    <input className="mt-1 w-full border rounded-md px-3 py-2" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  </label>
                  <label className="block">
                    <div className="text-sm font-medium text-gray-700">Year (optional)</div>
                    <input className="mt-1 w-full border rounded-md px-3 py-2" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })} placeholder="1 / 2 / 3 / 4" />
                  </label>
                  <label className="block">
                    <div className="text-sm font-medium text-gray-700">Start date</div>
                    <input type="date" className="mt-1 w-full border rounded-md px-3 py-2" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
                  </label>
                  <label className="block">
                    <div className="text-sm font-medium text-gray-700">End date</div>
                    <input type="date" className="mt-1 w-full border rounded-md px-3 py-2" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
                  </label>
                </div>

                <label className="block">
                  <div className="text-sm font-medium text-gray-700">Description (optional)</div>
                  <textarea className="mt-1 w-full border rounded-md px-3 py-2" rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-sm font-medium text-gray-700">Year label (optional)</div>
                    <input className="mt-1 w-full border rounded-md px-3 py-2" value={draft.year_label} onChange={(e) => setDraft({ ...draft, year_label: e.target.value })} placeholder="e.g. I / II / III" />
                  </label>
                  <label className="block">
                    <div className="text-sm font-medium text-gray-700">Attachment URL (optional)</div>
                    <input className="mt-1 w-full border rounded-md px-3 py-2" value={draft.image_url} onChange={(e) => setDraft({ ...draft, image_url: e.target.value })} placeholder="https://..." />
                  </label>
                </div>

                <label className="block">
                  <div className="text-sm font-medium text-gray-700">Upload attachment (optional)</div>
                  <input type="file" className="mt-1 w-full" onChange={(e) => setDraft({ ...draft, image_file: e.target.files && e.target.files[0] ? e.target.files[0] : null })} />
                </label>

                {props.mode === 'hod' ? (
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={draft.audience_all} onChange={(e) => setDraft({ ...draft, audience_all: e.target.checked })} />
                    <span className="text-sm text-gray-700">Visible to all departments</span>
                  </label>
                ) : null}

                {!draft.audience_all ? (
                  <label className="block">
                    <div className="text-sm font-medium text-gray-700">Audience departments</div>
                    <select
                      multiple
                      className="mt-1 w-full border rounded-md px-3 py-2 min-h-[120px]"
                      value={draft.audience_departments}
                      onChange={(e) => {
                        const opts = Array.from(e.target.selectedOptions).map(o => o.value)
                        setDraft({ ...draft, audience_departments: opts })
                      }}
                    >
                      {(props.mode === 'hod' ? (config?.hod_owned_departments || []) : (config?.departments || [])).map((d: string) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-gray-500 mt-1">Hold Ctrl/⌘ to select multiple.</div>
                  </label>
                ) : null}

                <div className="flex items-center justify-end gap-2">
                  <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" disabled={busy} onClick={() => { setEditorOpen(false); setDraft(null) }}>
                    Cancel
                  </button>
                  <button className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60" disabled={busy} onClick={onSaveDraft}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {/* Upload modal (IQAC) */}
      {uploadOpen ? (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => { if (!busy) setUploadOpen(false) }} />
            <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-xl border">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-lg font-semibold text-gray-900">Upload Calendar (Excel)</div>
                <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" onClick={() => { if (!busy) setUploadOpen(false) }}>
                  Close
                </button>
              </div>
              <div className="p-4 space-y-4">
                <input type="file" accept=".xlsx,.xls" onChange={(e) => setUploadFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                <div className="flex items-center gap-2">
                  <button className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60" disabled={!uploadFile || busy} onClick={onUploadParse}>
                    {busy ? 'Parsing…' : 'Parse'}
                  </button>
                  <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60" disabled={!uploadPreview?.length || busy} onClick={onUploadImport}>
                    Import
                  </button>
                </div>

                {uploadErrors?.length ? (
                  <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200">
                    {uploadErrors.map((x, idx) => (
                      <div key={idx}>{x}</div>
                    ))}
                  </div>
                ) : null}

                {uploadPreview ? (
                  <div>
                    <div className="text-sm font-medium text-gray-800 mb-2">Preview ({uploadPreview.length})</div>
                    <div className="max-h-[320px] overflow-auto border rounded-md">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 border-b">Date</th>
                            <th className="text-left px-3 py-2 border-b">Title</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uploadPreview.slice(0, 200).map((e: any, idx: number) => (
                            <tr key={idx} className="border-b">
                              <td className="px-3 py-2 whitespace-nowrap">{e.start_date}</td>
                              <td className="px-3 py-2">{e.title}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {uploadPreview.length > 200 ? (
                      <div className="text-xs text-gray-500 mt-1">Showing first 200 rows.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {/* HOD colours modal (IQAC) */}
      {hodColoursOpen ? (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setHodColoursOpen(false)} />
            <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-xl border">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-lg font-semibold text-gray-900">HOD Colours</div>
                <button className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" onClick={() => setHodColoursOpen(false)}>
                  Close
                </button>
              </div>
              <div className="p-4">
                {hodErr ? <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200">{hodErr}</div> : null}
                {!hodRows ? (
                  <div className="text-gray-600">Loading…</div>
                ) : (
                  <div className="max-h-[420px] overflow-auto border rounded-md">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 border-b">Department</th>
                          <th className="text-left px-3 py-2 border-b">HOD</th>
                          <th className="text-left px-3 py-2 border-b">Colour</th>
                          <th className="text-left px-3 py-2 border-b"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {hodRows.map((r) => (
                          <HodColourRowEditor
                            key={r.hod_user_id}
                            row={r}
                            onSave={async (color) => {
                              await setHodColour(r.hod_user_id, color)
                              await loadHodColours()
                            }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  )
}

function HodColourRowEditor(props: { row: HodColourRow; onSave: (color: string) => Promise<void> }) {
  const [color, setColor] = useState(props.row.color || '#2563eb')
  const [busy, setBusy] = useState(false)
  const canSave = Boolean(color)

  useEffect(() => {
    setColor(props.row.color || '#2563eb')
  }, [props.row.color])

  return (
    <tr className="border-b">
      <td className="px-3 py-2">{props.row.department || '-'}</td>
      <td className="px-3 py-2">{props.row.username || props.row.hod_user_id}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <input className="border rounded-md px-2 py-1 w-28" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          disabled={!canSave || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await props.onSave(color)
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </td>
    </tr>
  )
}
