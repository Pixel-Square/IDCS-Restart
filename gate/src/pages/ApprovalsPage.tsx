import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Clock3, History, UsersRound, Eye } from 'lucide-react'
import { fetchApplicationsNav, fetchApproverInbox, fetchPastApprovals, submitApplicationAction, type ApplicationsNavResponse, type ApproverInboxItem, type PastApprovalItem } from '../services/applications'
import { getMediaUrl } from '../services/apiBase'

function kindLabel(kind?: 'STUDENT' | 'STAFF' | null) {
  if (kind === 'STUDENT') return 'Student'
  if (kind === 'STAFF') return 'Staff'
  return null
}

function avatarFor(name: string, url?: string | null) {
  const resolved = getMediaUrl(url)
  if (resolved) return resolved
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=18233d&color=fff&bold=true`
}

export function ApprovalsPanel(): JSX.Element {
  const navigate = useNavigate()
  const [nav, setNav] = useState<ApplicationsNavResponse | null>(null)
  const [pending, setPending] = useState<ApproverInboxItem[]>([])
  const [history, setHistory] = useState<PastApprovalItem[]>([])
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [actingOn, setActingOn] = useState<number | null>(null)
  const [error, setError] = useState('')

  const loadPending = async () => {
    setLoading(true)
    setError('')
    try {
      const [navRes, inboxRes] = await Promise.all([
        fetchApplicationsNav(),
        fetchApproverInbox().catch(() => [] as ApproverInboxItem[]),
      ])
      setNav(navRes)
      setPending(navRes.show_applications ? inboxRes : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load pending approvals.')
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const rows = await fetchPastApprovals()
      setHistory(rows)
    } catch {
      // keep stale list
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadPending()
  }, [])

  useEffect(() => {
    if (tab === 'history' && history.length === 0 && !historyLoading) {
      loadHistory()
    }
  }, [tab])

  const handleAction = async (applicationId: number, action: 'FORWARD' | 'REJECT') => {
    const ok = window.confirm(`Are you sure you want to ${action === 'FORWARD' ? 'approve' : 'reject'} this application?`)
    if (!ok) return
    setActingOn(applicationId)
    try {
      await submitApplicationAction(applicationId, action)
      await loadPending()
      if (history.length > 0) await loadHistory()
    } catch (err: any) {
      window.alert(err?.message || 'Action failed.')
    } finally {
      setActingOn(null)
    }
  }

  if (loading && pending.length === 0) {
    return <div className="loading-shell">Loading approvals...</div>
  }

  if (!nav?.show_applications) {
    return <div className="empty-state glass-panel">You do not currently have any approval roles configured.</div>
  }

  return (
    <div className="stack-lg">
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="segmented glass-panel">
        <button className={`segment-button${tab === 'pending' ? ' active' : ''}`} onClick={() => setTab('pending')}>
          <Clock3 size={16} />
          Pending
          {pending.length > 0 ? <span className="count-badge">{pending.length}</span> : null}
        </button>
        <button className={`segment-button${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
          <History size={16} />
          History
        </button>
      </div>

      {tab === 'pending' ? (
        <div className="stack-md">
          {pending.length === 0 ? (
            <div className="empty-state glass-panel">No pending approvals right now.</div>
          ) : pending.map((row) => (
            <article key={row.application_id} className="card-3d approval-card">
              <img src={avatarFor(row.applicant_name, row.applicant_profile_image)} alt="" className="approval-avatar" />
              <div className="approval-copy">
                <div className="approval-title-row">
                  <div>
                    <div className="approval-name">{row.applicant_name}</div>
                    <div className="approval-meta">{row.application_type} {row.applicant_roll_or_staff_id ? `#${row.applicant_roll_or_staff_id}` : ''}</div>
                  </div>
                  <div className="approval-pills">
                    {kindLabel(row.applicant_kind) ? <span className="pill subtle">{kindLabel(row.applicant_kind)}</span> : null}
                    <span className="pill strong">{row.current_state}</span>
                  </div>
                </div>
                <p className="approval-step">Pending at {row.current_step_role || 'Review'}</p>
                <div className="approval-actions">
                  <button className="mini-button success" disabled={actingOn === row.application_id} onClick={() => handleAction(row.application_id, 'FORWARD')}>
                    <Check size={16} /> Approve
                  </button>
                  <button className="mini-button neutral" onClick={() => navigate(`/applications/${row.application_id}`)}>
                    <Eye size={16} /> View
                  </button>
                  <button className="mini-button danger" disabled={actingOn === row.application_id} onClick={() => handleAction(row.application_id, 'REJECT')}>
                    Reject
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="stack-md">
          {historyLoading ? <div className="loading-shell">Loading history...</div> : null}
          {history.length === 0 && !historyLoading ? <div className="empty-state glass-panel">No approval history yet.</div> : null}
          {history.map((row) => (
            <article key={row.application_id} className="card-3d approval-card">
              <img src={avatarFor(row.applicant_name, row.applicant_profile_image)} alt="" className="approval-avatar" />
              <div className="approval-copy">
                <div className="approval-title-row">
                  <div>
                    <div className="approval-name">{row.applicant_name}</div>
                    <div className="approval-meta">{row.application_type}</div>
                  </div>
                  <div className="approval-pills">
                    <span className="pill strong">{row.decision || row.current_state}</span>
                  </div>
                </div>
                <p className="approval-step">{row.department_name || 'Department unavailable'}</p>
                <div className="approval-footer">{row.gatepass_scanned_at ? `Exited at ${new Date(row.gatepass_scanned_at).toLocaleString()}` : 'Completed workflow'}</div>
                <div className="approval-actions">
                  <button className="mini-button neutral" onClick={() => navigate(`/applications/${row.application_id}`)}>
                    <Eye size={16} /> View
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ApprovalsPage(): JSX.Element {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Role-based workflow</div>
          <h2>Pending Approvals</h2>
          <p>Approve or reject applications with the same backend workflow used by the ERP.</p>
        </div>
        <div className="page-icon"><UsersRound size={20} /></div>
      </div>
      <ApprovalsPanel />
    </section>
  )
}
