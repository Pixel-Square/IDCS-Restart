import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Trophy, Clock, TrendingUp, ChevronRight, Code2, ClipboardList } from 'lucide-react'
import { studentApi } from '../../api'
import { useAuth } from '../../AuthContext'

export default function StudentDashboard() {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    studentApi.dashboard()
      .then(r => setDashboard(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  const greetName = dashboard?.student_name || user?.full_name || 'Student'

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      {/* Welcome banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.1) 100%)',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 'var(--radius-xl)',
        padding: '2rem',
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>
            Welcome back, {greetName.split(' ')[0]} 👋
          </h1>
          {dashboard?.reg_no && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {dashboard.reg_no} · Keep coding!
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-light)' }}>{dashboard?.enrolled_courses?.length ?? 0}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Courses</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-green)' }}>{dashboard?.recent_results?.length ?? 0}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Submissions</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Enrolled courses */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>My Courses</h2>
            <Link to="/student/courses" className="btn btn-ghost btn-sm">See all <ChevronRight size={13} /></Link>
          </div>
          {!dashboard?.enrolled_courses?.length ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              <BookOpen size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
              <p>Not enrolled in any courses</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {dashboard.enrolled_courses.slice(0, 4).map((c: any) => (
                <Link key={c.id} to={`/student/courses/${c.id}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ padding: '1rem', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{c.name}</span>
                      <span className="badge badge-brand" style={{ fontSize: '0.7rem' }}>{c.code}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${c.progress_percentage}%` }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
                      {c.progress_percentage}% complete
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          {/* Upcoming assessments */}
          {dashboard?.upcoming_assessments?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, marginBottom: '1rem' }}>Upcoming</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {dashboard.upcoming_assessments.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="card" style={{ padding: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{a.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                          {a.end_time ? new Date(a.end_time).toLocaleString() : 'No deadline'}
                        </div>
                      </div>
                      <Link to={`/student/assessments/${a.id}`} className="btn btn-primary btn-sm">
                        Start <ChevronRight size={13} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent results */}
          <div>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, marginBottom: '1rem' }}>Recent Results</h2>
            {!dashboard?.recent_results?.length ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No submissions yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {dashboard.recent_results.slice(0, 5).map((r: any, i: number) => (
                  <div key={i} className="card" style={{ padding: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: r.type === 'MCQ' ? 'rgba(210,153,34,0.1)' : 'rgba(99,102,241,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {r.type === 'MCQ' ? <ClipboardList size={15} color="var(--accent-yellow)" /> : <Code2 size={15} color="var(--brand-light)" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.assessment_title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {r.score} / {r.total_score} marks
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontSize: '0.875rem', fontWeight: 700,
                        color: r.status === 'PASSED' || (r.score / r.total_score) >= 0.6 ? 'var(--accent-green)' : 'var(--accent-red)',
                      }}>
                        {r.total_score > 0 ? `${Math.round(r.score / r.total_score * 100)}%` : '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
