import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Users, BarChart2, Layers, TrendingUp, ChevronRight, Plus } from 'lucide-react'
import { coursesApi } from '../../api'

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    coursesApi.adminAnalytics()
      .then(r => setAnalytics(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  const stats = [
    { label: 'Active Courses', value: analytics?.total_courses ?? 0, icon: BookOpen, color: 'var(--brand-light)', bg: 'rgba(99,102,241,0.1)' },
    { label: 'Active Classes', value: analytics?.total_classes ?? 0, icon: Layers, color: 'var(--accent-blue)', bg: 'rgba(88,166,255,0.1)' },
    { label: 'Enrollments', value: analytics?.total_enrollments ?? 0, icon: Users, color: 'var(--accent-green)', bg: 'rgba(63,185,80,0.1)' },
    { label: 'Submissions', value: (analytics?.total_submissions ?? 0) + (analytics?.total_mcq_submissions ?? 0), icon: TrendingUp, color: 'var(--accent-purple)', bg: 'rgba(188,140,255,0.1)' },
  ]

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Admin Dashboard</h1>
            <p className="page-subtitle">Manage courses, classes, and monitor platform activity</p>
          </div>
          <Link to="/admin/courses" className="btn btn-primary">
            <Plus size={16} /> New Course
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '2.5rem' }}>
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div style={{
              width: 40, height: 40, borderRadius: '10px',
              background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '0.5rem',
            }}>
              <Icon size={20} color={color} />
            </div>
            <div className="stat-value" style={{ color }}>{value.toLocaleString()}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Courses table */}
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Active Courses</h2>
        <Link to="/admin/courses" className="btn btn-ghost btn-sm">View all <ChevronRight size={14} /></Link>
      </div>

      {analytics?.courses?.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Code</th>
                <th>Enrollments</th>
                <th>Submissions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {analytics.courses.slice(0, 8).map((c: any) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td><span className="badge badge-brand">{c.code}</span></td>
                  <td>{c.enrollment_count}</td>
                  <td>{c.submission_count}</td>
                  <td>
                    <Link to={`/admin/courses/${c.id}`} className="btn btn-ghost btn-sm">
                      Manage <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          textAlign: 'center', padding: '3rem',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)',
        }}>
          <BookOpen size={40} style={{ marginBottom: '1rem', opacity: 0.4 }} />
          <p style={{ fontWeight: 500, marginBottom: '0.5rem' }}>No active courses yet</p>
          <Link to="/admin/courses" className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }}>
            <Plus size={14} /> Create your first course
          </Link>
        </div>
      )}
    </div>
  )
}
