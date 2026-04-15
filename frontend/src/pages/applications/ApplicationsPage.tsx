import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchApplicationTypes,
  fetchMyApplications,
  cancelApplication,
  fetchApplicationsNav,
  ApplicationsNavResponse,
  ApplicationTypeListItem,
  MyApplicationItem,
} from '../../services/applications'
import { ensureProfilePhotoPresent } from '../../services/auth'
import ApplicationsInboxPage from './ApplicationsInboxPage'

function statusBadgeClass(state: string): string {
  switch (state?.toUpperCase()) {
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
    case 'IN_REVIEW':
    case 'SUBMITTED': return 'Pending'
    case 'APPROVED': return 'Approved'
    case 'REJECTED': return 'Rejected'
    case 'CANCELLED': return 'Self Cancelled'
    case 'DRAFT': return 'Draft'
    default: return state || '—'
  }
}

function formatScanDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function useCountdown(deadline: string | null): string | null {
  const [display, setDisplay] = useState<string | null>(null)

  useEffect(() => {
    if (!deadline) { setDisplay(null); return }
    const update = () => {
      const diff = new Date(deadline).getTime() - Date.now()
      if (diff <= 0) { setDisplay('Expired'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setDisplay(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      )
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadline])

  return display
}

function SlaCountdown({ deadline, endAt }: { deadline: string | null; endAt?: string | null }): JSX.Element {
  const display = useCountdown(deadline)
  const endLabel = endAt ? new Date(endAt).toLocaleString() : null
  if (!display) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-gray-400 text-xs">—</span>
        {endLabel && (
          <span className="text-[11px] text-gray-500">Ends: {endLabel}</span>
        )}
      </div>
    )
  }
  const isExpired = display === 'Expired'
  const diff = deadline ? new Date(deadline).getTime() - Date.now() : 0
  const isUrgent = !isExpired && diff < 3600000 // < 1 hour
  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-full ${
        isExpired ? 'bg-red-100 text-red-600' :
        isUrgent  ? 'bg-amber-100 text-amber-700' :
                    'bg-indigo-50 text-indigo-700'
      }`}>
        {!isExpired && (
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
        )}
        {display}
      </span>
      {endLabel && (
        <span className="text-[11px] text-gray-500">Ends: {endLabel}</span>
      )}
    </div>
  )
}

function AppTimer({ app }: { app: MyApplicationItem }): JSX.Element {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // 1. Gatepass Window Logic (whenever a gatepass window exists)
  // We must respect the configured *start* time (Out for DATE OUT IN).
  if (app.needs_gatepass_scan && app.gatepass_window_start && app.gatepass_window_end) {
    const start = new Date(app.gatepass_window_start).getTime()
    const end = new Date(app.gatepass_window_end).getTime()

    if (app.gatepass_scanned_at) {
      return (
        <div className="flex flex-col gap-1">
          <span className="text-gray-400 text-xs">—</span>
        </div>
      )
    }

    if (now < start) {
      // WAITING
      return (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 w-fit">
            Waiting
          </span>
          <span className="text-[11px] text-gray-500">Starts: {new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )
    } else if (now >= start && now <= end) {
      // ACTIVE - Show Countdown to END
      const diff = end - now
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      const timerStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

      return (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 w-fit">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            {timerStr}
          </span>
          <span className="text-[11px] text-gray-500">Ends: {new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )
    } else {
      // EXPIRED
      return (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 w-fit">
            Expired
          </span>
          <span className="text-[11px] text-gray-500">Ended: {new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )
    }
  }

  // 2. Fallback: SLA Countdown (for In-Review/Draft/etc)
  return <SlaCountdown deadline={app.sla_deadline ?? null} endAt={app.gatepass_window_end ?? null} />
}

export function MyApplicationsContent(): JSX.Element {
  const navigate = useNavigate()

  const [types, setTypes] = useState<ApplicationTypeListItem[]>([])
  const [myApps, setMyApps] = useState<MyApplicationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const onCancel = useCallback(async (appId: number) => {
    const ok = window.confirm('Cancel this application? This will mark it as Self Cancelled.')
    if (!ok) return
    try {
      await cancelApplication(appId)
      setMyApps((prev) => prev.map((a) => (a.id === appId ? { ...a, current_state: 'CANCELLED', status: 'CANCELLED' } : a)))
    } catch (e: any) {
      setError(e?.message || 'Failed to cancel application.')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [typesRes, myRes] = await Promise.allSettled([
          fetchApplicationTypes(),
          fetchMyApplications(),
        ])
        if (!mounted) return

        if (typesRes.status === 'fulfilled') {
          setTypes(typesRes.value)
        } else {
          setTypes([])
          setError(typesRes.reason?.message || 'Failed to load application types.')
        }

        if (myRes.status === 'fulfilled') {
          setMyApps(myRes.value)
        } else {
          setMyApps([])
          setError((prev) => prev || myRes.reason?.message || 'Failed to load your applications.')
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load applications.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  return (
    <div className="space-y-6">

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : (
          <>
            {/* Available Application Types */}
            <section>
              <h2 className="text-base font-semibold text-gray-800 mb-3">Available Applications</h2>
              {types.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
                  No application types are currently available.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {types.map((t) => (
                    <button
                      key={t.id}
                      onClick={async () => {
                        const hasPhoto = await ensureProfilePhotoPresent()
                        if (!hasPhoto) {
                          alert('Please upload your Profile Photo before applying for applications. You will be redirected to Profile now.')
                          navigate('/profile')
                          return
                        }
                        navigate(`/applications/new/${t.id}`)
                      }}
                      className="rounded-2xl border border-gray-200 bg-white p-5 text-left hover:border-indigo-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700">{t.name}</div>
                        {!!t.code && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                            {t.code}
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <div className="text-xs text-gray-500 line-clamp-2">{t.description}</div>
                      )}
                      <div className="mt-3 text-xs font-medium text-indigo-600 group-hover:underline">Apply →</div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* My Applications */}
            <section>
              <h2 className="text-base font-semibold text-gray-800 mb-3">My Applications</h2>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                {myApps.length === 0 ? (
                  <div className="p-5 text-sm text-gray-500">You haven't submitted any applications yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-100">
                          <th className="px-5 py-3">Application</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Current Step</th>
                          <th className="px-5 py-3">SLA Remaining</th>
                          <th className="px-5 py-3">Submitted</th>
                          <th className="px-5 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {myApps.map((app) => (
                          <tr key={app.id} className="border-b border-gray-50 last:border-0">
                            <td className="px-5 py-3 text-gray-900 font-medium">
                              #{app.id} — {app.application_type_name}
                            </td>
                            <td className="px-5 py-3">
                              {(() => {
                                const state = app.current_state?.toUpperCase()
                                const windowStart = app.gatepass_window_start ? new Date(app.gatepass_window_start).getTime() : null
                                const windowEnd = app.gatepass_window_end ? new Date(app.gatepass_window_end).getTime() : null
                                const now = Date.now()
                                const fallbackActive = windowStart !== null && windowEnd !== null && now >= windowStart && now <= windowEnd
                                const isWindowActive = (app.time_window_active ?? fallbackActive) === true

                                if (state === 'CANCELLED') {
                                  return (
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(app.current_state)}`}>
                                      {statusLabel(app.current_state)}
                                    </span>
                                  )
                                }

                                if (app.gatepass_in_scanned_at) {
                                  return (
                                    <div className="flex flex-col gap-1">
                                      <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                        IN ACCEPTED
                                      </span>
                                      <span className="text-[11px] text-gray-500">
                                        IN: {formatScanDateTime(app.gatepass_in_scanned_at)}
                                      </span>
                                    </div>
                                  )
                                }

                                if (app.gatepass_scanned_at) {
                                  return (
                                    <div className="flex flex-col gap-1">
                                      <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                        OUT ACCEPTED
                                      </span>
                                      <span className="text-[11px] text-gray-500">
                                        OUT: {formatScanDateTime(app.gatepass_scanned_at)}
                                      </span>
                                    </div>
                                  )
                                }

                                if (app.gatepass_expired ?? false) {
                                  return (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                      EXPIRED
                                    </span>
                                  )
                                }

                                if (state === 'APPROVED' && windowStart && now < windowStart) {
                                  return (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                      WAITING
                                    </span>
                                  )
                                }

                                if (isWindowActive && state === 'APPROVED') {
                                  return (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                      ACTIVE
                                    </span>
                                  )
                                }

                                if (app.needs_gatepass_scan) {
                                  // Window not active yet: show normal state (e.g. Approved)
                                  return (
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(app.current_state)}`}>
                                      {statusLabel(app.current_state)}
                                    </span>
                                  )
                                }

                                return (
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(app.current_state)}`}>
                                    {statusLabel(app.current_state)}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="px-5 py-3 text-gray-600">{app.current_step_role || '—'}</td>
                            <td className="px-5 py-3">
                              <AppTimer app={app} />
                            </td>
                            <td className="px-5 py-3 text-gray-500">
                              {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-5 py-3">
                              <button
                                onClick={() => navigate(`/applications/${app.id}`)}
                                className="text-xs text-indigo-600 hover:underline font-medium"
                              >
                                View
                              </button>
                              {app.current_state?.toUpperCase() !== 'APPROVED' &&
                               app.current_state?.toUpperCase() !== 'REJECTED' &&
                               app.current_state?.toUpperCase() !== 'CANCELLED' && (
                                <button
                                  onClick={() => onCancel(app.id)}
                                  className="ml-3 text-xs text-red-600 hover:underline font-medium"
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
    </div>
  )
}

export default function ApplicationsPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'my_apps' | 'inbox'>('my_apps');
  const [nav, setNav] = useState<ApplicationsNavResponse | null>(null);

  useEffect(() => {
    fetchApplicationsNav().then(setNav).catch(() => {});
  }, []);

  const nonStudentStaffRoles = (nav?.staff_roles || []).filter((r) => String(r?.code || '').toUpperCase() !== 'STUDENT')
  const nonStudentOverrideRoles = (nav?.override_roles || []).filter((r) => String(r || '').toUpperCase() !== 'STUDENT')
  const hasInboxRole = Boolean(nav?.show_applications) && (nonStudentStaffRoles.length > 0 || nonStudentOverrideRoles.length > 0)

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl w-full mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-gray-200">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Applications Desk</h1>
            <p className="text-sm text-gray-500 mt-1">Manage all your applications and pending approvals.</p>
          </div>
          {hasInboxRole && (
            <div className="flex bg-white shadow-sm border border-gray-200 rounded-xl p-1 shrink-0">
              <button
                onClick={() => setActiveTab('my_apps')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  activeTab === 'my_apps'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                My Applications
              </button>
              <button
                onClick={() => setActiveTab('inbox')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  activeTab === 'inbox'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Approvals Inbox
              </button>
            </div>
          )}
        </div>

        <div className="pb-10 relative mt-4">
          {activeTab === 'my_apps' ? <MyApplicationsContent /> : <ApplicationsInboxPage isSubComponent={true} />}
        </div>
      </div>
    </main>
  )
}
