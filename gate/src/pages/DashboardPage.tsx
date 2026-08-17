import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BellRing, ClipboardList, ShieldCheck, CheckCheck } from 'lucide-react'
import { fetchApplicationsNav, fetchMyApplications, type ApplicationsNavResponse, type MyApplicationItem } from '../services/applications'
import { getCachedMe } from '../services/auth'
import { getMediaUrl } from '../services/apiBase'

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

export default function DashboardPage(): JSX.Element {
  const cached = getCachedMe()
  const [nav, setNav] = useState<ApplicationsNavResponse | null>(null)
  const [apps, setApps] = useState<MyApplicationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [navRes, appsRes] = await Promise.all([
          fetchApplicationsNav().catch(() => null),
          fetchMyApplications().catch(() => [] as MyApplicationItem[]),
        ])
        if (!mounted) return
        setNav(navRes)
        setApps(appsRes)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const userName = useMemo(() => {
    const full = `${String(cached?.first_name || '').trim()} ${String(cached?.last_name || '').trim()}`.trim()
    return full || cached?.username || 'User'
  }, [cached])

  const avatar = useMemo(() => {
    const candidate = cached?.profile_image || cached?.profile?.profile_image || cached?.profile_image_url || cached?.profile?.profile_image_url
    return getMediaUrl(candidate)
  }, [cached])

  const pendingCount = apps.filter((app) => !['APPROVED', 'REJECTED', 'CANCELLED'].includes(app.current_state?.toUpperCase())).length
  const approvedCount = apps.filter((app) => app.current_state?.toUpperCase() === 'APPROVED').length
  const fineCount = apps.filter((app) => ['APPROVED', 'REJECTED', 'CANCELLED'].includes(app.current_state?.toUpperCase() || '')).length

  return (
    <section className="page-stack">
      <div className="metrics-grid metrics-grid-two">
        <div className="metric-card card-3d">
          <ClipboardList size={18} />
          <div className="metric-value">{apps.length}</div>
          <div className="metric-label">Applications</div>
        </div>
        <div className="metric-card card-3d">
          <BellRing size={18} />
          <div className="metric-value">{pendingCount}</div>
          <div className="metric-label">Pending</div>
        </div>
        <div className="metric-card card-3d">
          <ShieldCheck size={18} />
          <div className="metric-value">{approvedCount}</div>
          <div className="metric-label">Approved</div>
        </div>
        <div className="metric-card card-3d">
          <CheckCheck size={18} />
          <div className="metric-value">{fineCount}</div>
          <div className="metric-label">Fine</div>
        </div>
      </div>

      <div className="grid-stack">
        <article className="section-card glass-panel">
          <div className="section-header">
            <div>
              <div className="section-kicker">Recent activity</div>
              <h3>Recent</h3>
            </div>
          </div>

          {loading ? <div className="loading-shell">Loading dashboard...</div> : null}
          <div className="stack-md">
            {apps.slice(0, 4).map((app) => (
              <div key={app.id} className="history-card pending">
                <div className="history-card-main">
                  <div>
                    <div className="history-title">{app.application_type_name}</div>
                    <div className="history-subtitle">{app.current_step_role || 'Submitted'}</div>
                  </div>
                  <div className="history-badge">{app.current_state}</div>
                </div>
                <div className="history-footer">
                  <span>{app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}</span>
                  <Link to={`/applications/${app.id}`}>Open</Link>
                </div>
              </div>
            ))}
            {apps.length === 0 ? <div className="empty-state">No applications submitted yet.</div> : null}
          </div>
        </article>
      </div>
    </section>
  )
}
