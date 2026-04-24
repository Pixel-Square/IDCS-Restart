import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { cancelApplication, fetchApplicationDetail, ApplicationDetail, ApprovalTimelineEntry } from '../../services/applications'

function statusBadgeClass(state: string): string {
  switch (state?.toUpperCase()) {
    case 'ACTIVE': return 'bg-green-100 text-green-700'
    case 'WAITING': return 'bg-yellow-100 text-yellow-800'
    case 'OUT_ACCEPTED': return 'bg-green-100 text-green-700'
    case 'IN_ACCEPTED': return 'bg-green-100 text-green-700'
    case 'LATE': return 'bg-red-100 text-red-700'
    case 'EXITED': return 'bg-green-100 text-green-700'
    case 'EXPIRED': return 'bg-red-50 text-red-700'
    case 'APPROVED': return 'bg-green-100 text-green-700'
    case 'REJECTED': return 'bg-red-100 text-red-700'
    case 'CANCELLED': return 'bg-red-50 text-red-700'
    case 'IN_REVIEW':
    case 'SUBMITTED': return 'bg-blue-100 text-blue-700'
    case 'DRAFT': return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function statusLabel(state: string): string {
  switch (state?.toUpperCase()) {
    case 'EXPIRED': return 'Expired'
    case 'ACTIVE': return 'Active'
    case 'WAITING': return 'Waiting for Time'
    case 'OUT_ACCEPTED': return 'Out Accepted'
    case 'IN_ACCEPTED': return 'In Accepted'
    case 'LATE': return 'Late'
    case 'EXITED': return 'Exited'
    case 'IN_REVIEW':
    case 'SUBMITTED': return 'Pending Review'
    case 'APPROVED': return 'Approved'
    case 'REJECTED': return 'Rejected'
    case 'CANCELLED': return 'Self Cancelled'
    case 'DRAFT': return 'Draft'
    default: return state || '—'
  }
}

type StepStyle = {
  circle: string
  badge: string
  connector: string
  label: string
}

type TimelineEntryUI = ApprovalTimelineEntry & {
  label_override?: string
  style_override?: Partial<StepStyle>
}

function stepStyle(status: ApprovalTimelineEntry['status']): StepStyle {
  switch (status) {
    case 'SUBMITTED':
      return {
        circle: 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200',
        badge: 'bg-blue-100 text-blue-700',
        connector: 'bg-blue-300',
        label: 'Submitted',
      }
    case 'APPROVED':
      return {
        circle: 'bg-green-500 border-green-500 text-white shadow-md shadow-green-200',
        badge: 'bg-green-100 text-green-700',
        connector: 'bg-green-300',
        label: 'Approved',
      }
    case 'REJECTED':
      return {
        circle: 'bg-red-500 border-red-500 text-white shadow-md shadow-red-200',
        badge: 'bg-red-100 text-red-700',
        connector: 'bg-red-200',
        label: 'Rejected',
      }
    case 'SKIPPED':
      return {
        circle: 'bg-gray-300 border-gray-300 text-gray-500',
        badge: 'bg-gray-100 text-gray-500',
        connector: 'bg-gray-200',
        label: 'Skipped',
      }
    case 'PENDING':
    default:
      return {
        circle: 'bg-white border-2 border-gray-300 text-gray-400',
        badge: 'bg-amber-50 text-amber-600 border border-amber-200',
        connector: 'bg-gray-200',
        label: 'Pending',
      }
  }
}

function TimelineStep({ entry, index, isLast }: { entry: TimelineEntryUI; index: number; isLast: boolean }) {
  const base = stepStyle(entry.status)
  const s: StepStyle = {
    ...base,
    ...entry.style_override,
    label: entry.label_override ?? base.label,
  }
  const isPending = entry.status === 'PENDING'

  return (
    <div className="flex-1 flex items-start min-w-0">
      {/* Left connector half */}
      <div className="flex-1 h-0.5 mt-5 self-start" style={{ backgroundColor: index > 0 ? (s.connector.includes('blue') ? '#93c5fd' : s.connector.includes('green') ? '#86efac' : s.connector.includes('red') ? '#fca5a5' : '#e5e7eb') : 'transparent' }} />

      {/* Circle + info column */}
      <div className="flex flex-col items-center flex-shrink-0 px-1">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 flex-shrink-0 ${s.circle}`}>
          {isPending ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth="2"/>
              <path strokeLinecap="round" d="M12 6v6l4 2" strokeWidth="2"/>
            </svg>
          ) : (
            <span>{entry.step_order}</span>
          )}
        </div>

        <div className="flex flex-col items-center mt-2 text-center w-full">
          {entry.step_role && (
            <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
              {entry.step_role}
            </span>
          )}
          <span className={`mt-1.5 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>
            {isPending && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
            )}
            {s.label}
          </span>
          {entry.acted_by ? (
            <div className="mt-1.5 text-xs text-gray-700 leading-tight font-medium">{entry.acted_by}</div>
          ) : (
            <div className="mt-1.5 text-xs text-gray-400 italic leading-tight">Awaiting</div>
          )}
          {entry.remarks && (
            <div className="mt-1 text-xs text-gray-500 italic leading-tight max-w-[100px] truncate" title={entry.remarks}>
              &ldquo;{entry.remarks}&rdquo;
            </div>
          )}
          {entry.acted_at && (
            <div className="mt-1 text-xs text-gray-400 leading-tight whitespace-nowrap">
              {new Date(entry.acted_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Right connector half */}
      <div className="flex-1 h-0.5 mt-5 self-start bg-gray-200" style={{ visibility: isLast ? 'hidden' : 'visible' }} />
    </div>
  )
}

export default function ApplicationDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<ApplicationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slaRemaining, setSlaRemaining] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const renderSubmittedValue = (f: ApplicationDetail['dynamic_fields'][number]) => {
    const fieldType = (f as any)?.field_type
    const value = (f as any)?.value

    const isDurationType = fieldType === 'DATE IN OUT' || fieldType === 'DATE OUT IN'
    const isObjectValue = value && typeof value === 'object' && !Array.isArray(value)
    const looksLikeDurationObject = (() => {
      if (!isObjectValue) return false
      const v = value as any
      return (
        v?.date !== undefined ||
        v?.in_time !== undefined ||
        v?.out_time !== undefined ||
        v?.in !== undefined ||
        v?.out !== undefined ||
        v?.inTime !== undefined ||
        v?.outTime !== undefined
      )
    })()

    if ((isDurationType || looksLikeDurationObject) && isObjectValue) {
      const v = value as any
      const date = v?.date ?? v?.DATE ?? v?.Date
      const inTime = v?.in_time ?? v?.inTime ?? v?.IN ?? v?.in
      const outTime = v?.out_time ?? v?.outTime ?? v?.OUT ?? v?.out

      if (!date && !inTime && !outTime) {
        return <span className="text-gray-400 italic">—</span>
      }

      const isOutIn = fieldType === 'DATE OUT IN'

      return (
        <div className="space-y-0.5">
          {date ? <div>Date: {String(date)}</div> : null}
          {isOutIn ? (
            <>
              {outTime ? <div>Out: {String(outTime)}</div> : null}
              {inTime ? <div>In: {String(inTime)}</div> : null}
            </>
          ) : (
            <>
              {inTime ? <div>In: {String(inTime)}</div> : null}
              {outTime ? <div>Out: {String(outTime)}</div> : null}
            </>
          )}
        </div>
      )
    }

    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-400 italic">—</span>
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return <span>{String(value)}</span>
    }

    try {
      return <span className="whitespace-pre-wrap">{JSON.stringify(value)}</span>
    } catch {
      return <span>{String(value)}</span>
    }
  }

  useEffect(() => {
    const state = detail?.current_state?.toUpperCase()
    const isExpired = !!detail?.gatepass_expired

    // For gatepass-duration SLA, hide countdown only if expired.
    if (isExpired) {
      setSlaRemaining(null)
      return
    }

    if (!detail?.sla_deadline || state === 'REJECTED' || state === 'CANCELLED' || state === 'DRAFT') {
      setSlaRemaining(null)
      return
    }

    const hasGateWindow = !!detail.gatepass_window_start && !!detail.gatepass_window_end

    const update = () => {
      const nowMs = Date.now()

      // Gatepass window countdown: WAITING before start, countdown to end during window.
      if (hasGateWindow) {
        const startMs = new Date(detail.gatepass_window_start!).getTime()
        const endMs = new Date(detail.gatepass_window_end!).getTime()

        if (nowMs < startMs) {
          setSlaRemaining('WAITING')
          return
        }
        if (nowMs > endMs) {
          setSlaRemaining(null)
          return
        }

        const diff = Math.floor((endMs - nowMs) / 1000)
        if (diff <= 0) {
          setSlaRemaining(null)
          return
        }
        const h = Math.floor(diff / 3600).toString().padStart(2, '0')
        const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0')
        const s = (diff % 60).toString().padStart(2, '0')
        setSlaRemaining(`${h}:${m}:${s}`)
        return
      }

      // Regular SLA countdown.
      const diff = Math.floor((new Date(detail.sla_deadline!).getTime() - nowMs) / 1000)
      if (diff <= 0) { setSlaRemaining('OVERDUE'); return }
      const h = Math.floor(diff / 3600).toString().padStart(2, '0')
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0')
      const s = (diff % 60).toString().padStart(2, '0')
      setSlaRemaining(`${h}:${m}:${s}`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [detail])

  useEffect(() => {
    if (!id) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const d = await fetchApplicationDetail(Number(id))
        if (mounted) setDetail(d)
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load application.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [id])

  const canCancel = (() => {
    const s = detail?.current_state?.toUpperCase()
    return !!detail && s !== 'APPROVED' && s !== 'REJECTED' && s !== 'CANCELLED'
  })()

  const onCancel = async () => {
    if (!detail) return
    if (cancelling) return
    const ok = window.confirm('Cancel this application? This will mark it as Self Cancelled.')
    if (!ok) return
    try {
      setCancelling(true)
      await cancelApplication(detail.id)
      const d = await fetchApplicationDetail(detail.id)
      setDetail(d)
    } catch (e: any) {
      setError(e?.message || 'Failed to cancel application.')
    } finally {
      setCancelling(false)
    }
  }

  const timeline = detail?.approval_timeline ?? []

  const gateIsLate = (() => {
    if (!detail?.gatepass_in_scanned_at) return false
    if (!detail?.gatepass_window_end) return false
    const scanned = new Date(detail.gatepass_in_scanned_at).getTime()
    const end = new Date(detail.gatepass_window_end).getTime()
    return scanned > end
  })()

  const uiTimeline: TimelineEntryUI[] = (() => {
    if (!detail) return timeline as TimelineEntryUI[]
    if ((detail.current_state || '').toUpperCase() !== 'APPROVED') return timeline as TimelineEntryUI[]
    // Treat as gatepass when a window exists.
    const isGatepass = !!detail.gatepass_window_start && !!detail.gatepass_window_end
    if (!isGatepass) return timeline as TimelineEntryUI[]

    const idx = timeline.findIndex((e) => (e.step_role || '').toUpperCase() === 'SECURITY' && e.is_final)
    if (idx < 0) return timeline as TimelineEntryUI[]

    const security = timeline[idx]
    const outDone = !!detail.gatepass_scanned_at
    const inDone = !!detail.gatepass_in_scanned_at

    const hasInTimeApplied = detail.dynamic_fields.some(f => {
      const type = (f as any)?.field_type
      const value = (f as any)?.value
      if (!value || typeof value !== 'object') return false
      const v = value as any
      const inTime = v?.in_time ?? v?.inTime ?? v?.IN ?? v?.in
      return !!inTime
    })

    const hardExpiryMs = (() => {
      if (detail.gatepass_window_start || detail.gatepass_window_end) {
         const baseStr = detail.gatepass_window_start || detail.gatepass_window_end
         const baseD = new Date(baseStr!)
         baseD.setDate(baseD.getDate() + 1)
         baseD.setHours(0, 0, 0, 0)
         return baseD.getTime()
      }
      return null
    })()

    const nowMs = Date.now()

    const outEntry: TimelineEntryUI = {
      ...security,
      step_role: 'SECURITY (OUT)',
      is_final: false,
      status: outDone ? 'APPROVED' : 'PENDING',
      label_override: outDone ? 'OUT Scanned' : 'Awaiting',
      acted_at: outDone ? detail.gatepass_scanned_at ?? null : null,
      acted_by: outDone ? security.acted_by : null,
      remarks: outDone ? 'Scanned OUT' : null,
    }

    const lateStyle: Partial<StepStyle> = {
      circle: 'bg-red-500 border-red-500 text-white shadow-md shadow-red-200',
      badge: 'bg-red-100 text-red-700',
      connector: 'bg-red-200',
    }

    const showInStep = hasInTimeApplied || inDone

    let inStatus: ApprovalTimelineEntry['status'] = 'PENDING'
    let inLabel = 'Awaiting'
    let inStyle: Partial<StepStyle> | undefined = undefined

    if (showInStep) {
      if (!inDone) {
         if (hardExpiryMs && nowMs >= hardExpiryMs) {
            inStatus = 'REJECTED'
            inLabel = 'Not Returned'
            inStyle = lateStyle
         } else {
            inStatus = 'PENDING'
            inLabel = 'Awaiting'
         }
      } else {
         const inScannedAtMs = new Date(detail.gatepass_in_scanned_at!).getTime()
         if (hardExpiryMs && inScannedAtMs >= hardExpiryMs) {
            inStatus = 'APPROVED'
            inLabel = 'NEW IN'
            // Using standard approved style for NEW IN as it was a valid scan, just late.
         } else if (hasInTimeApplied && gateIsLate) {
            inStatus = 'REJECTED'
            inLabel = 'Late'
            inStyle = lateStyle
         } else {
            inStatus = 'APPROVED'
            inLabel = 'IN Scanned'
         }
      }
    }

    const inEntry: TimelineEntryUI | null = showInStep ? {
      ...security,
      step_role: 'SECURITY (IN)',
      is_final: true,
      status: inStatus,
      label_override: inLabel,
      style_override: inStyle,
      acted_at: inDone ? detail.gatepass_in_scanned_at ?? null : null,
      acted_by: inDone ? security.acted_by : null,
      remarks: inDone ? 'Scanned IN' : null,
    } : null

    const newSteps = [...timeline.slice(0, idx), outEntry]
    if (inEntry) newSteps.push(inEntry)
    newSteps.push(...timeline.slice(idx + 1))
    
    return newSteps
  })()
  const displayState = (() => {
    const base = (detail?.current_state || '').toUpperCase()
    if (!detail) return base
    if (base === 'REJECTED' || base === 'CANCELLED' || base === 'DRAFT') return base
    if (detail.gatepass_in_scanned_at) return gateIsLate ? 'LATE' : 'IN_ACCEPTED'
    if (detail.gatepass_scanned_at) return 'OUT_ACCEPTED'
    if (detail.gatepass_expired) return 'EXPIRED'
    if (detail.gatepass_window_start) {
        if (Date.now() < new Date(detail.gatepass_window_start).getTime()) {
             // If approved but waiting for start:
             if (base === 'APPROVED') return 'WAITING'
             return base // e.g. SUBMITTED
        }
    }
    if (detail.time_window_active && base === 'APPROVED') return 'ACTIVE'
    return base
  })()

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <button
          onClick={() => navigate('/applications')}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← My Applications
        </button>

        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : !detail ? null : (
          <>
            {/* Header card */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Application #{detail.id}</div>
                  <h1 className="text-xl font-bold text-gray-900">{detail.application_type}</h1>
                  <div className="text-sm text-gray-500 mt-1">
                    Submitted: {detail.submitted_at ? new Date(detail.submitted_at).toLocaleString() : '—'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${statusBadgeClass(displayState)}`}>
                    {statusLabel(displayState)}
                  </span>
                  {canCancel && (
                    <button
                      onClick={onCancel}
                      disabled={cancelling}
                      className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {cancelling ? 'Cancelling…' : 'Cancel Application'}
                    </button>
                  )}
                  {detail.current_step && (
                    <div className="text-xs text-gray-500">
                      Awaiting: <span className="font-medium text-gray-700">{detail.current_step}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Approval Timeline */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Approval Timeline</h2>
              </div>

              {/* SLA Countdown bar */}
              {slaRemaining && (
                (() => {
                  const isWaiting = slaRemaining === 'WAITING'
                  const isOverdue = slaRemaining === 'OVERDUE'
                  const hoursLeft = !isWaiting && !isOverdue ? parseInt(slaRemaining.split(':')[0]) : null
                  const isUrgent = hoursLeft !== null && !Number.isNaN(hoursLeft) && hoursLeft < 1

                  const boxClass = isWaiting
                    ? 'bg-amber-50 border border-amber-200'
                    : isOverdue
                    ? 'bg-red-50 border border-red-200'
                    : isUrgent
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-indigo-50 border border-indigo-100'

                  const iconClass = isWaiting
                    ? 'text-amber-500'
                    : isOverdue
                    ? 'text-red-500'
                    : isUrgent
                    ? 'text-amber-500'
                    : 'text-indigo-500'

                  const labelClass = isWaiting
                    ? 'text-amber-700'
                    : isOverdue
                    ? 'text-red-700'
                    : isUrgent
                    ? 'text-amber-700'
                    : 'text-indigo-700'

                  const valueClass = isWaiting
                    ? 'text-amber-600'
                    : isOverdue
                    ? 'text-red-600'
                    : isUrgent
                    ? 'text-amber-600'
                    : 'text-indigo-600'

                  return (
                <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 mb-5 ${
                  boxClass
                }`}>
                  <svg className={`w-4 h-4 shrink-0 ${iconClass}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                  </svg>
                  <span className={`text-xs font-medium ${labelClass}`}>
                    {isWaiting ? 'Waiting for start time' : isOverdue ? 'SLA deadline has passed' : 'SLA time remaining'}
                  </span>
                  <span className={`ml-auto font-mono text-base font-bold tracking-widest ${valueClass}`}>
                    {isWaiting ? 'WAITING' : isOverdue ? 'OVERDUE' : slaRemaining}
                  </span>
                </div>
                  )
                })()
              )}

              {uiTimeline.length === 0 ? (
                <div className="text-sm text-gray-400 italic">No flow configured. Awaiting review.</div>
              ) : (
                <div className="flex items-start w-full">
                  {uiTimeline.map((entry, idx) => (
                    <TimelineStep
                      key={`${entry.step_order}-${idx}`}
                      entry={entry}
                      index={idx}
                      isLast={idx === uiTimeline.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Submitted Details */}
            {detail.dynamic_fields.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Submitted Details</h2>
                <dl className="divide-y divide-gray-100">
                  {detail.dynamic_fields.map((f) => (
                    <div key={f.field_key} className="py-2.5 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-gray-500">{f.label}</dt>
                      <dd className="mt-0.5 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {renderSubmittedValue(f)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
