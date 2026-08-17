import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Users, ChevronRight, BarChart2, Layers } from 'lucide-react'
import { sectionApi } from '../../api'

export default function SectionDashboard() {
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sectionApi.myClasses()
      .then(r => setClasses(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <h1 className="page-title">Section Dashboard</h1>
        <p className="page-subtitle">Monitor students in your assigned classes — read-only view</p>
      </div>

      {classes.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '4rem',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)',
        }}>
          <Layers size={48} style={{ opacity: 0.4, marginBottom: '1rem' }} />
          <p style={{ fontWeight: 600 }}>No classes assigned</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Ask the Code Admin to assign you as section incharge.</p>
        </div>
      ) : (
        <div className="grid-auto">
          {classes.map((c: any) => (
            <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge badge-brand" style={{ fontSize: '0.7rem' }}>{c.course_code}</span>
                <span className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: '0.7rem' }}>
                  {c.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>{c.name}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.course_name}</p>
              </div>

              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span><Users size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{c.enrollment_count} students</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                <Link to={`/section/classes/${c.id}/students`} className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                  <Users size={13} /> Students
                </Link>
                <Link to={`/section/classes/${c.id}/analytics`} className="btn btn-ghost btn-sm">
                  <BarChart2 size={13} /> Analytics
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
