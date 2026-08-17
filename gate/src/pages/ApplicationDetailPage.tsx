import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CircleAlert, FileText, Trash2 } from 'lucide-react'
import { cancelApplication, fetchApplicationDetail, type ApplicationDetail } from '../services/applications'

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') return ''
  return String(value)
}

function isDurationValue(value: unknown): value is { date?: unknown; in_time?: unknown; out_time?: unknown } {
  return Boolean(value && typeof value === 'object' && ('date' in value || 'in_time' in value || 'out_time' in value))
}

export default function ApplicationDetailPage(): JSX.Element {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<ApplicationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const detail = await fetchApplicationDetail(Number(params.id))
        if (mounted) setData(detail)
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Failed to load application.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [params.id])

  const handleCancel = async () => {
    if (!data) return
    const ok = window.confirm('Cancel this application?')
    if (!ok) return
    setBusy(true)
    try {
      const updated = await cancelApplication(data.id)
      setData((prev) => prev ? { ...prev, current_state: updated.current_state, status: updated.status } : prev)
    } catch (err: any) {
      setError(err?.message || 'Unable to cancel application.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="loading-shell">Loading application...</div>
  if (error || !data) {
    return (
      <div className="empty-state glass-panel">
        <CircleAlert size={18} /> {error || 'Application not found.'}
      </div>
    )
  }

  const isTerminal = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(String(data.current_state || '').toUpperCase())

  return (
    <section className="page-stack">
      <Link to="/apply" className="back-link"><ArrowLeft size={16} /> Back</Link>

      <div className="section-card glass-panel">
        <div className="section-header">
          <div>
            <div className="section-kicker">Application detail</div>
            <h2>{data.application_type}</h2>
            <p>Status: {data.current_state}</p>
          </div>
          <div className="page-icon"><FileText size={20} /></div>
        </div>

        <div className="grid-stack">
          <div className="history-card pending">
            <div className="history-card-main">
              <div>
                <div className="history-title">Overview</div>
                <div className="history-subtitle">Submitted {data.submitted_at ? new Date(data.submitted_at).toLocaleString() : '—'}</div>
              </div>
              <div className="history-badge">{data.status}</div>
            </div>
            <div className="history-footer">
              <span>Current step: {data.current_step || 'Submitted'}</span>
              <span>SLA: {data.sla_deadline ? new Date(data.sla_deadline).toLocaleString() : '—'}</span>
            </div>
          </div>

          <div className="stack-md">
            {data.dynamic_fields.map((field) => (
              <div key={field.field_key} className="history-card">
                <div className="history-title">{field.label}</div>
                <div className="history-subtitle">{field.field_key}</div>
                {isDurationValue(field.value) ? (
                  <div className="duration-box">
                    <div className="duration-row">
                      <span className="duration-label">Date</span>
                      <span className="duration-value">{formatFieldValue(field.value.date)}</span>
                    </div>
                    <div className="duration-row">
                      <span className="duration-label">In</span>
                      <span className="duration-value">{formatFieldValue(field.value.in_time)}</span>
                    </div>
                    <div className="duration-row">
                      <span className="duration-label">Out</span>
                      <span className="duration-value">{formatFieldValue(field.value.out_time)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="detail-value">{formatFieldValue(field.value)}</div>
                )}
              </div>
            ))}
          </div>

          <div className="stack-md">
            <div className="section-header">
              <div>
                <div className="section-kicker">Approval trail</div>
                <h3>Timeline</h3>
              </div>
            </div>
            <div className="timeline-list">
              {data.approval_timeline.map((step, index) => {
                const statusKey = String(step.status || '').toLowerCase()
                return (
                  <div key={`${step.step_order}-${step.step_role}`} className={`timeline-item ${statusKey}`}>
                    <div className="timeline-rail">
                      <span className={`timeline-node ${statusKey}`} />
                      {index < data.approval_timeline.length - 1 ? <span className="timeline-line" /> : null}
                    </div>
                    <div className="timeline-card history-card">
                      <div className="history-card-main">
                        <div>
                          <div className="history-title">Step {step.step_order}</div>
                          <div className="history-subtitle">{step.step_role || 'Review'}</div>
                        </div>
                        <div className="history-badge">{step.status}</div>
                      </div>
                      <div className="history-footer">
                        <span>{step.acted_by || 'Pending'}</span>
                        <span>{step.acted_at ? new Date(step.acted_at).toLocaleString() : '—'}</span>
                      </div>
                      {step.remarks ? <div className="timeline-reason">Reason: {step.remarks}</div> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {data.approval_history.length > 0 ? (
            <div className="stack-md">
              <div className="section-header">
                <div>
                  <div className="section-kicker">History log</div>
                  <h3>Actions</h3>
                </div>
              </div>
              {data.approval_history.map((entry) => (
                <div key={entry.id} className="history-card">
                  <div className="history-card-main">
                    <div>
                      <div className="history-title">{entry.action}</div>
                      <div className="history-subtitle">{entry.step_role || 'Review'}</div>
                    </div>
                    <div className="history-badge">{entry.acted_by}</div>
                  </div>
                  <div className="history-footer">
                    <span>{entry.remarks || 'No remarks'}</span>
                    <span>{entry.acted_at ? new Date(entry.acted_at).toLocaleString() : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!isTerminal ? (
            <div className="form-actions">
              <button type="button" className="primary-3d-button" disabled={busy} onClick={handleCancel}>
                <Trash2 size={16} /> {busy ? 'Cancelling...' : 'Cancel application'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
