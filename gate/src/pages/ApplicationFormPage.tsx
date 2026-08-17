import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, FileText, Send, Sparkles } from 'lucide-react'
import { ActiveApplicationError, createAndSubmitApplication, fetchApplicationTypeSchema, fetchMyApplications, type ApplicationField, type ApplicationTypeSchema, type ForwardedTo } from '../services/applications'
import { ensureProfilePhotoPresent } from '../services/auth'

function buildDefaults(fields: ApplicationField[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.field_type === 'BOOLEAN') defaults[field.field_key] = false
    else if (field.field_type === 'DATE IN OUT' || field.field_type === 'DATE OUT IN') defaults[field.field_key] = { date: '', in_time: '', out_time: '' }
    else defaults[field.field_key] = ''
  }
  return defaults
}

function FieldEditor({ field, value, onChange }: { field: ApplicationField; value: unknown; onChange: (key: string, val: unknown) => void }): JSX.Element {
  const baseProps = { className: 'field-input form-control' }
  const isComposite = field.field_type === 'DATE IN OUT' || field.field_type === 'DATE OUT IN'
  const composite = typeof value === 'object' && value !== null ? value as Record<string, string> : {}

  if (isComposite) {
    const order = field.field_type === 'DATE OUT IN' ? ['out_time', 'in_time'] : ['in_time', 'out_time']
    return (
      <div className="composite-grid">
        <input type="date" {...baseProps} value={typeof composite.date === 'string' ? composite.date : ''} onChange={(event) => onChange(field.field_key, { ...composite, date: event.target.value })} />
        {order.map((name) => (
          <input
            key={name}
            type="time"
            {...baseProps}
            value={typeof composite[name] === 'string' ? composite[name] : ''}
            onChange={(event) => onChange(field.field_key, { ...composite, [name]: event.target.value })}
          />
        ))}
      </div>
    )
  }

  switch (field.field_type) {
    case 'DATE':
      return <input type="date" {...baseProps} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(field.field_key, event.target.value)} />
    case 'TIME':
      return <input type="time" {...baseProps} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(field.field_key, event.target.value)} />
    case 'BOOLEAN':
      return (
        <label className="boolean-chip">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(field.field_key, event.target.checked)} />
          <span>Enabled</span>
        </label>
      )
    case 'NUMBER':
      return <input type="number" {...baseProps} value={typeof value === 'number' ? value : ''} onChange={(event) => onChange(field.field_key, event.target.value ? Number(event.target.value) : '')} />
    case 'SELECT': {
      const options = Array.isArray((field.meta as any)?.options) ? (field.meta as any).options as string[] : []
      return (
        <select {...baseProps} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(field.field_key, event.target.value)}>
          <option value="">Select one</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      )
    }
    case 'FILE':
      return <input type="text" {...baseProps} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(field.field_key, event.target.value)} placeholder="Paste file URL or filename" />
    default:
      return <textarea rows={4} className="field-input form-control textarea" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(field.field_key, event.target.value)} />
  }
}

export default function ApplicationFormPage(): JSX.Element {
  const params = useParams<{ typeId: string }>()
  const navigate = useNavigate()
  const [schema, setSchema] = useState<ApplicationTypeSchema | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ id: number; forwardedTo: ForwardedTo | null } | null>(null)
  const [activeApp, setActiveApp] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const hasPhoto = await ensureProfilePhotoPresent()
      if (!mounted) return
      if (!hasPhoto) {
        window.alert('Please upload your profile photo before submitting an application.')
        navigate('/profile')
        return
      }
      if (!params.typeId) return
      try {
        setLoading(true)
        const loadedSchema = await fetchApplicationTypeSchema(Number(params.typeId))
        if (!mounted) return
        setSchema(loadedSchema)
        setFormData(buildDefaults(loadedSchema.fields))

        const myApps = await fetchMyApplications().catch(() => [])
        const active = myApps.find((app) => app.application_type_name === loadedSchema.name && !['APPROVED', 'REJECTED', 'CANCELLED'].includes(app.current_state?.toUpperCase()))
        if (active && mounted) {
          setActiveApp({
            id: active.id,
            message: `You already have an active ${loadedSchema.name} application (#${active.id}).`,
          })
        }
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Failed to load form schema.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate, params.typeId])

  const title = useMemo(() => schema?.name || 'Application', [schema])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!schema) return
    setError('')

    for (const field of schema.fields) {
      if (!field.is_required) continue
      const value = formData[field.field_key]
      const composite = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
      if (field.field_type === 'DATE IN OUT' || field.field_type === 'DATE OUT IN') {
        if (!composite.date || !composite.in_time || !composite.out_time) {
          setError(`"${field.label}" is required.`)
          return
        }
      } else if (value === '' || value === null || value === undefined) {
        setError(`"${field.label}" is required.`)
        return
      }
    }

    setSubmitting(true)
    try {
      const result = await createAndSubmitApplication(schema.id, formData)
      setSuccess({ id: result.id, forwardedTo: result.forwarded_to })
    } catch (err: any) {
      if (err instanceof ActiveApplicationError) {
        setActiveApp({ id: err.activeApplicationId, message: err.message })
      } else {
        setError(err?.response?.data?.detail || err?.message || 'Failed to submit application.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="loading-shell">Loading form...</div>

  if (!schema) {
    return (
      <div className="empty-state glass-panel">
        {error || 'Application type not found.'}
      </div>
    )
  }

  if (success) {
    return (
      <div className="success-panel glass-panel">
        <div className="success-icon"><CheckCircle2 size={28} /></div>
        <h2>Application submitted</h2>
        <p>{title} is now in the approval workflow.</p>
        {success.forwardedTo ? <div className="success-forward">Forwarded to {success.forwardedTo.role_name}</div> : null}
        <div className="success-actions">
          <button className="primary-3d-button" onClick={() => navigate(`/applications/${success.id}`)}>View status</button>
          <Link className="secondary-3d-button" to="/apply">Back to Apply</Link>
        </div>
      </div>
    )
  }

  return (
    <section className="page-stack">
      <Link to="/apply" className="back-link"><ChevronLeft size={16} /> Back</Link>
      <div className="section-card glass-panel">
        <div className="section-header">
          <div>
            <div className="section-kicker">Dynamic form</div>
            <h2>{title}</h2>
            <p>{schema.description || 'Fill the fields below and submit to the approval chain.'}</p>
          </div>
          <div className="page-icon"><FileText size={20} /></div>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
        {activeApp ? <div className="warning-banner">{activeApp.message}</div> : null}

        <form className="stack-md" onSubmit={handleSubmit}>
          {schema.fields.slice().sort((a, b) => a.order - b.order).map((field) => (
            <label key={field.field_key} className="field-group">
              <span className="field-label-row">
                {field.label}
                {field.is_required ? <span className="required-dot">*</span> : null}
              </span>
              <FieldEditor field={field} value={formData[field.field_key]} onChange={(key, value) => setFormData((prev) => ({ ...prev, [key]: value }))} />
            </label>
          ))}

          <div className="form-actions">
            <button type="submit" className="primary-3d-button" disabled={submitting || Boolean(activeApp)}>
              <Send size={16} /> {submitting ? 'Submitting...' : 'Submit application'}
            </button>
            <Link to="/apply" className="secondary-3d-button">Cancel</Link>
          </div>
        </form>
      </div>

      <div className="hint-strip wide">
        <Sparkles size={16} />
        <span>Forms use the same backend schema and workflow engine that powers student and faculty approvals.</span>
      </div>
    </section>
  )
}
