import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ChevronRight, Code2, ClipboardList } from 'lucide-react'
import { coursesApi } from '../../api'

export default function InchargeDashboard() {
  const [courses, setCourses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    coursesApi.list()
      .then(r => setCourses(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <h1 className="page-title">My Courses</h1>
        <p className="page-subtitle">Manage sessions, assessments, and content for your assigned courses</p>
      </div>

      {courses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          <BookOpen size={48} style={{ opacity: 0.4, marginBottom: '1rem' }} />
          <p style={{ fontWeight: 600 }}>No courses assigned</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Ask the Code Admin to assign you as course incharge.</p>
        </div>
      ) : (
        <div className="grid-auto">
          {courses.map((c: any) => (
            <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className={`badge ${c.status === 'ACTIVE' ? 'badge-green' : 'badge-yellow'}`}>{c.status}</span>
                <span className="badge badge-brand">{c.code}</span>
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>{c.name}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.academic_year || 'No year set'}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span><Code2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{c.incharge_count} incharge(s)</span>
              </div>
              <Link to={`/incharge/courses/${c.id}`} className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 'auto' }}>
                Open Course <ChevronRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
