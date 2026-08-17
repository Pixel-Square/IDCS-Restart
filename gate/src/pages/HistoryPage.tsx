import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock3, FileText } from 'lucide-react'
import { fetchMyApplications, type MyApplicationItem } from '../services/applications'

function sortKey(item: MyApplicationItem): number {
  return new Date(item.submitted_at || item.created_at || 0).getTime()
}

export default function HistoryPage(): JSX.Element {
  const [items, setItems] = useState<MyApplicationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const rows = await fetchMyApplications()
        if (mounted) setItems(rows)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const ordered = useMemo(() => [...items].sort((a, b) => sortKey(b) - sortKey(a)), [items])

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Application log</div>
          <h2>History</h2>
          <p>Your latest approvals, rejections, and submissions in one timeline.</p>
        </div>
        <div className="page-icon"><Clock3 size={20} /></div>
      </div>

      {loading ? <div className="loading-shell">Loading history...</div> : null}
      <div className="stack-md">
        {ordered.map((item) => (
          <article key={item.id} className="history-card">
            <div className="history-card-main">
              <div>
                <div className="history-title">{item.application_type_name}</div>
                <div className="history-subtitle">Step: {item.current_step_role || 'Submitted'}</div>
              </div>
              <div className="history-badge">{item.current_state}</div>
            </div>
            <div className="history-bar">
              <div className="history-bar-fill" />
            </div>
            <div className="history-footer">
              <span>#{item.id}</span>
              <span>{item.submitted_at ? new Date(item.submitted_at).toLocaleString() : '—'}</span>
              <Link to={`/applications/${item.id}`}>
                <FileText size={14} /> View
              </Link>
            </div>
          </article>
        ))}
        {ordered.length === 0 && !loading ? <div className="empty-state glass-panel">No history yet.</div> : null}
      </div>
    </section>
  )
}
