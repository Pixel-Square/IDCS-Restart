import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Check, Code2, ClipboardList } from 'lucide-react'
import { coursesApi } from '../../api'

export default function StudentCoursePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [course, setCourse] = useState<any>(null)
  const [progress, setProgress] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const courseId = Number(id)

  useEffect(() => {
    coursesApi.studentGet(courseId)
      .then(r => {
        setCourse(r.data)
        setProgress({
          percentage: r.data.progress_percentage ?? 0,
          completed_sessions: [],
          in_progress_sessions: [],
        })
      })
      .catch(() => navigate('/student'))
      .finally(() => setLoading(false))
  }, [courseId])

  if (loading) return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  const sessions = course?.sessions || []
  const pct = progress?.percentage || course?.progress_percentage || 0
  const completedCount = sessions.filter((s: any) => s.status === 'completed').length

  const TYPE_ICON: Record<string, React.ReactNode> = {
    MCQ: <ClipboardList size={16} color="var(--accent-yellow)" />,
    LAB: <Code2 size={16} color="var(--brand-light)" />,
    PROJECT: <Code2 size={16} color="var(--accent-blue)" />,
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <Link to="/student" className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Dashboard
        </Link>
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.08))',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 'var(--radius-xl)',
          padding: '1.75rem',
          marginBottom: '2rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', marginBottom: '0.375rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{course?.name}</h1>
                <span className="badge badge-brand">{course?.code}</span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 500 }}>{course?.description}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, background: 'linear-gradient(135deg, var(--brand-from), var(--brand-to))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{pct}%</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Complete</div>
            </div>
          </div>
          <div style={{ marginTop: '1.25rem' }}>
            <div className="progress-bar" style={{ height: 8 }}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
              {completedCount} of {sessions.length} sessions completed
            </div>
          </div>
        </div>
      </div>

      {/* Sessions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {sessions.map((s: any, i: number) => {
          const isCompleted = s.status === 'completed'
          const isInProgress = s.status === 'in_progress'

          return (
            <div key={s.id} className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {/* Status icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: isCompleted ? 'rgba(63,185,80,0.15)' : isInProgress ? 'rgba(99,102,241,0.15)' : 'var(--bg-active)',
                  border: `2px solid ${isCompleted ? 'rgba(63,185,80,0.5)' : isInProgress ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isCompleted ? <Check size={18} color="var(--accent-green)" /> : TYPE_ICON[s.session_type] || <Code2 size={16} color="var(--text-muted)" />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Session {s.order}: {s.title}</span>
                    <span className={`badge ${s.session_type === 'MCQ' ? 'badge-yellow' : 'badge-brand'}`} style={{ fontSize: '0.68rem' }}>{s.session_type}</span>
                    {isCompleted && <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>✓ Completed</span>}
                    {isInProgress && !isCompleted && <span className="badge badge-brand" style={{ fontSize: '0.68rem' }}>In Progress</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {s.assessment_count} assessment{s.assessment_count !== 1 ? 's' : ''}
                  </div>
                </div>

                <Link to={`/student/sessions/${s.id}`} className="btn btn-primary btn-sm">
                  {isCompleted ? 'Review' : isInProgress ? 'Continue' : 'Start'} <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {sessions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          No sessions published yet
        </div>
      )}
    </div>
  )
}
