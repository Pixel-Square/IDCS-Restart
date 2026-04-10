
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  fetchApplicationTypeSchema,
  createAndSubmitApplication,
  ActiveApplicationError,
  fetchMyApplications,
  ApplicationTypeSchema,
  ApplicationField,
  ForwardedTo,
} from '../../services/applications'
import { ensureProfilePhotoPresent } from '../../services/auth'

// ─── Forwarded-to popup ───────────────────────────────────────────────────────

function ForwardedModal({
  appId,
  forwarded,
  onClose,
}: {
  appId: number
  forwarded: ForwardedTo
  onClose: () => void
}): JSX.Element {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl">✓</div>
          <div>
            <div className="text-base font-semibold text-gray-900">Application Submitted!</div>
            <div className="text-xs text-gray-500">Your application is now under review.</div>
          </div>
        </div>

        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4 mb-4">
          <div className="text-xs font-medium text-indigo-500 uppercase tracking-wide mb-1">Forwarded to</div>
          <div className="text-sm font-semibold text-indigo-900">
            {forwarded.role_name}
            {forwarded.is_final && <span className="ml-2 text-xs font-normal text-indigo-500">(Final approver)</span>}
          </div>
          {forwarded.assignees.length > 0 && (
            <ul className="mt-2 space-y-1">
              {forwarded.assignees.map((a) => (
                <li key={a.id} className="text-sm text-indigo-800">
                  {a.name}
                  <span className="ml-1 text-xs text-indigo-400">@{a.username}</span>
                  {a.staff_id && <span className="ml-2 text-xs text-indigo-400">• {a.staff_id}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/applications/${appId}`)}
            className="flex-1 rounded-lg bg-indigo-600 text-white text-sm font-medium py-2 hover:bg-indigo-700"
          >
            View Status
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium py-2 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Dynamic field renderers ──────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ApplicationField
  value: unknown
  onChange: (key: string, val: unknown) => void
}): JSX.Element {
  const base =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'

  const composite = (typeof value === 'object' && value !== null) ? (value as Record<string, string>) : {}

  const renderComposite = (timeOrder: Array<'in_time' | 'out_time'>) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
        <input
          type="date"
          className={base}
          value={typeof composite.date === 'string' ? composite.date : ''}
          onChange={(e) => onChange(field.field_key, { ...composite, date: e.target.value })}
        />
      </div>
      {timeOrder.map((k) => (
        <div key={k}>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {k === 'in_time' ? 'In Time' : 'Out Time'}
          </label>
          <input
            type="time"
            className={base}
            value={typeof composite[k] === 'string' ? composite[k] : ''}
            onChange={(e) => onChange(field.field_key, { ...composite, [k]: e.target.value })}
          />
        </div>
      ))}
    </div>
  )

  switch (field.field_type) {
    case 'DATE':
      return (
        <input
          type="date"
          className={base}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(field.field_key, e.target.value)}
        />
      )
    case 'TIME':
      return (
        <input
          type="time"
          className={base}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(field.field_key, e.target.value)}
        />
      )
    case 'DATE IN OUT':
      return renderComposite(['in_time', 'out_time'])
    case 'DATE OUT IN':
      // User request: Ensure OUT time renders first, reflecting it is the start time.
      return renderComposite(['out_time', 'in_time'])
    case 'NUMBER':
      return (
        <input
          type="number"
          className={base}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(field.field_key, e.target.value ? Number(e.target.value) : '')}
        />
      )
    case 'BOOLEAN':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
            checked={Boolean(value)}
            onChange={(e) => onChange(field.field_key, e.target.checked)}
          />
          <span className="text-sm text-gray-700">Yes</span>
        </label>
      )
    case 'SELECT': {
      const options: string[] = Array.isArray((field.meta as any)?.options) ? (field.meta as any).options : []
      return (
        <select
          className={base}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(field.field_key, e.target.value)}
        >
          <option value="">— Select —</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    }
    default:
      return (
        <textarea
          rows={3}
          className={`${base} resize-none`}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(field.field_key, e.target.value)}
        />
      )
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ApplicationFormPage(): JSX.Element {
  const { typeId } = useParams<{ typeId: string }>()
  const navigate = useNavigate()

  const [schema, setSchema] = useState<ApplicationTypeSchema | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ id: number; forwardedTo: ForwardedTo | null } | null>(null)
  const [cooldown, setCooldown] = useState<{ until: string; message: string } | null>(null)
  const [activeApp, setActiveApp] = useState<{ id: number; state: string; message: string } | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const hasPhoto = await ensureProfilePhotoPresent()
      if (!mounted) return
      if (!hasPhoto) {
        alert('Please upload your Profile Photo before applying for applications. Redirecting you to Profile now.')
        navigate('/profile')
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  useEffect(() => {
    if (!typeId) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const s = await fetchApplicationTypeSchema(Number(typeId))
        if (!mounted) return
        setSchema(s)
        // Pre-check for an existing active application of this type
        const TERMINAL = ['APPROVED', 'REJECTED', 'CANCELLED']
        try {
          const myApps = await fetchMyApplications()
          const active = myApps.find((a) => {
            if (a.application_type_name !== s.name) return false
            if (TERMINAL.includes(a.current_state)) return false
            // If gatepass expired, treat as terminal
            if (a.gatepass_window_end) {
              const end = new Date(a.gatepass_window_end).getTime()
              if (Date.now() > end) return false
            }
            return true
          })
          if (active && mounted) {
            setActiveApp({
              id: active.id,
              state: active.current_state,
              message: `You already have a pending ${s.name} application (#${active.id}) that is currently ${active.current_state.replace('_', ' ')}. You can only submit a new one after it is fully approved or rejected.`,
            })
          }
        } catch (_) {}
        // Seed defaults
        const defaults: Record<string, unknown> = {}
        for (const f of s.fields) {
          if (f.field_type === 'BOOLEAN') defaults[f.field_key] = false
          else if (f.field_type === 'DATE IN OUT' || f.field_type === 'DATE OUT IN') defaults[f.field_key] = { date: '', in_time: '', out_time: '' }
          else defaults[f.field_key] = ''
        }
        setFormData(defaults)
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load form schema.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [typeId])

  const handleChange = (key: string, val: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!schema) return
    setError(null)

    const hasPhoto = await ensureProfilePhotoPresent()
    if (!hasPhoto) {
      alert('Please upload your Profile Photo before submitting an application. Redirecting you to Profile now.')
      navigate('/profile')
      return
    }

    // Client-side required check
    for (const f of schema.fields) {
      if (f.is_required) {
        const val = formData[f.field_key]
        const isComposite = f.field_type === 'DATE IN OUT' || f.field_type === 'DATE OUT IN'
        if (isComposite) {
          const comp = (typeof val === 'object' && val !== null) ? (val as Record<string, unknown>) : {}
          if (!comp.date || !comp.in_time || !comp.out_time) {
            setError(`"${f.label}" is required.`)
            return
          }
          continue
        }
        if (val === '' || val === null || val === undefined) {
          setError(`"${f.label}" is required.`)
          return
        }
      }
    }

    setSubmitting(true)
    setCooldown(null)
    setActiveApp(null)
    try {
      const res = await createAndSubmitApplication(schema.id, formData)
      setSubmitted({ id: res.id, forwardedTo: res.forwarded_to })
    } catch (e: any) {
      if (e instanceof ActiveApplicationError) {
        setActiveApp({ id: e.activeApplicationId, state: e.activeApplicationState, message: e.message })
      } else {
        // Detect SLA cooldown (HTTP 429 detail includes cooldown info)
        const msg: string = e?.message || ''
        if (msg.toLowerCase().includes('cooldown') || msg.toLowerCase().includes('cannot submit')) {
          setCooldown({ until: '', message: msg })
        } else {
          setError(msg || 'Failed to submit application.')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <button
            onClick={() => navigate('/applications')}
            className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
          >
            ← Back to Applications
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">Loading form…</div>
        ) : !schema ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error || 'Application type not found.'}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{schema.name}</h1>
              {schema.description && (
                <p className="text-sm text-gray-500 mt-1">{schema.description}</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            {cooldown && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="font-semibold mb-0.5">&#9201; Cooldown Active</div>
                <div>{cooldown.message}</div>
                <div className="mt-1 text-xs text-amber-600">
                  You may submit again once the SLA cooldown window has passed.
                </div>
              </div>
            )}

            {activeApp && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                <div className="font-semibold mb-1">&#9888; Application Already In Progress</div>
                <div>{activeApp.message}</div>
                <button
                  type="button"
                  onClick={() => navigate(`/applications/${activeApp.id}`)}
                  className="mt-2 text-xs font-medium text-orange-700 underline hover:text-orange-900"
                >
                  View Application #{activeApp.id}
                </button>
              </div>
            )}

            <div className="space-y-4">
              {schema.fields.map((field) => (
                <div key={field.field_key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {field.is_required && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <FieldInput field={field} value={formData[field.field_key]} onChange={handleChange} />
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || !!cooldown || !!activeApp}
                className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : activeApp ? 'Application Pending' : cooldown ? 'Cooldown Active' : 'Submit Application'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/applications')}
                className="rounded-lg border border-gray-200 text-gray-700 text-sm font-medium px-6 py-2.5 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {submitted && (
        <ForwardedModal
          appId={submitted.id}
          forwarded={submitted.forwardedTo ?? { role_name: 'Reviewer', step_order: 1, is_final: false, assignees: [] }}
          onClose={() => navigate('/applications')}
        />
      )}
    </main>
  )
}
