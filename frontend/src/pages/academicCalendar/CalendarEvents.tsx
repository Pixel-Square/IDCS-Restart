import React, { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2, X, Check, Tag, Loader2 } from 'lucide-react'
import { CalendarEventDef, ALL_ROLES, ALL_SEMESTERS, loadEventDefs, saveEventDefs } from './calendarTypes'
import fetchWithAuth from '../../services/fetchAuth'

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
  '#64748B', '#0EA5E9', '#D946EF', '#F59E0B',
]

/** Map backend shape → CalendarEventDef */
function fromApi(d: any): CalendarEventDef {
  return {
    id: d.id,
    title: d.title,
    color: d.color,
    visibleToRoles: d.visible_roles || [],
    semesters: d.semesters || [],
    createdAt: d.created_at || new Date().toISOString(),
  }
}

interface Props {
  asModal?: boolean
  onClose?: () => void
  /** Called after a new event is created (for inline creation inside assign flow) */
  onEventCreated?: (event: CalendarEventDef) => void
}

export default function CalendarEvents({ asModal, onClose, onEventCreated }: Props) {
  const [events, setEvents] = useState<CalendarEventDef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(!!onEventCreated)
  const [editingEvent, setEditingEvent] = useState<CalendarEventDef | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedSemesters, setSelectedSemesters] = useState<string[]>([])
  const [error, setError] = useState('')

  // Load from backend, fall back to localStorage
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true)
      try {
        const res = await fetchWithAuth('/api/academic-calendar/event-labels/')
        if (res.ok) {
          const data = await res.json()
          const mapped = data.map(fromApi)
          setEvents(mapped)
          saveEventDefs(mapped) // keep localStorage in sync
        } else {
          setEvents(loadEventDefs())
        }
      } catch {
        setEvents(loadEventDefs())
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [])

  const resetForm = () => {
    setTitle(''); setColor(PRESET_COLORS[0])
    setSelectedRoles([]); setSelectedSemesters([])
    setEditingEvent(null); setShowForm(false); setError('')
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Event title is required'); return }
    setSaving(true)
    try {
      const body = {
        title: title.trim(),
        color,
        visible_roles: selectedRoles,
        semesters: selectedSemesters,
      }
      if (editingEvent) {
        const res = await fetchWithAuth(`/api/academic-calendar/event-labels/${editingEvent.id}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to update')
        const updated = fromApi(await res.json())
        const newList = events.map(e => e.id === editingEvent.id ? updated : e)
        setEvents(newList); saveEventDefs(newList); resetForm()
      } else {
        const res = await fetchWithAuth('/api/academic-calendar/event-labels/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to create')
        const created = fromApi(await res.json())
        const newList = [...events, created]
        setEvents(newList); saveEventDefs(newList)
        if (onEventCreated) { onEventCreated(created) } else { resetForm() }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (ev: CalendarEventDef) => {
    setEditingEvent(ev); setTitle(ev.title); setColor(ev.color)
    setSelectedRoles(ev.visibleToRoles)
    setSelectedSemesters(ev.semesters || [])
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetchWithAuth(`/api/academic-calendar/event-labels/${id}/`, { method: 'DELETE' })
    } catch {}
    const updated = events.filter(e => e.id !== id)
    saveEventDefs(updated); setEvents(updated)
  }

  const toggleRole = (role: string) =>
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])

  const toggleSemester = (sem: string) => {
    if (sem === 'COMMON') {
      // If selecting Common, clear the rest; if deselecting Common, keep it deselected
      setSelectedSemesters(prev => prev.includes('COMMON') ? [] : ['COMMON'])
    } else {
      setSelectedSemesters(prev => {
        const without = prev.filter(s => s !== 'COMMON') // remove Common when selecting specific
        return without.includes(sem) ? without.filter(s => s !== sem) : [...without, sem]
      })
    }
  }

  const semesterLabel = (semesters: string[]) => {
    if (!semesters || semesters.length === 0) return 'All years'
    if (semesters.includes('COMMON')) return 'All years (Common)'
    return semesters.map(s => `${s} Year`).join(', ')
  }

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-900">Calendar Events</h2>
        </div>
        <div className="flex items-center gap-2">
          {!showForm && !onEventCreated && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> New Event
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="px-5 py-4 border-b bg-blue-50 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            {editingEvent ? 'Edit Event' : 'Create New Event'}
          </h3>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="space-y-3">
            {/* Title */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Event Title *</label>
              <input
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); setError('') }}
                placeholder="e.g. Placement Drive, Exam, Holiday..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* Color */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Label Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-gray-800 scale-110' : 'border-white shadow'}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <div className="flex items-center gap-1.5 ml-1">
                  <input
                    type="color"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border border-gray-300"
                    title="Custom color"
                  />
                  <span className="text-xs text-gray-500">Custom</span>
                </div>
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: color }}>
                {title || 'Preview'}
              </div>
            </div>

            {/* Semester applicability */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">Applicable To (Semester / Year)</label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {/* Common first */}
                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none font-medium text-blue-700">
                  <input
                    type="checkbox"
                    checked={selectedSemesters.includes('COMMON')}
                    onChange={() => toggleSemester('COMMON')}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  Common (All Years)
                </label>
                {/* Divider */}
                <span className="text-gray-300 text-xs self-center">|</span>
                {/* Individual years */}
                {ALL_SEMESTERS.filter(s => s.value !== 'COMMON').map(sem => (
                  <label key={sem.value} className={`flex items-center gap-1.5 text-xs cursor-pointer select-none ${selectedSemesters.includes('COMMON') ? 'opacity-40 pointer-events-none' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedSemesters.includes(sem.value) || selectedSemesters.includes('COMMON')}
                      onChange={() => toggleSemester(sem.value)}
                      className="rounded border-gray-300 text-blue-600"
                      disabled={selectedSemesters.includes('COMMON')}
                    />
                    {sem.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Leave all unchecked = applies to all years</p>
            </div>

            {/* Role visibility */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Visible To (Roles)</label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {ALL_ROLES.map(role => (
                  <label key={role} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    {role}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Leave all unchecked = visible to everyone</p>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              {!onEventCreated && (
                <button onClick={resetForm} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 bg-white">
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!title.trim() || saving}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingEvent ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event List */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Tag className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No events yet. Create your first event above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                <div className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white shadow" style={{ backgroundColor: ev.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-gray-500">
                      {ev.visibleToRoles.length === 0 ? 'All roles' : ev.visibleToRoles.join(' · ')}
                    </p>
                    {ev.semesters && ev.semesters.length > 0 && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                        {semesterLabel(ev.semesters)}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleEdit(ev)} className="text-gray-400 hover:text-blue-600 p-1 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(ev.id)} className="text-gray-400 hover:text-red-600 p-1 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (asModal) return content

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[500px] flex flex-col">
          {content}
        </div>
      </div>
    </div>
  )
}
