import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Code2, ClipboardList, CheckCircle, XCircle, Clock } from 'lucide-react'
import { sectionApi } from '../../api'

export default function SectionStudentDetail() {
  const { classId, studentId } = useParams<{ classId: string; studentId: string }>()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sectionApi.studentDetail(Number(classId), Number(studentId))
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [classId, studentId])

  if (loading) return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )
  if (!data) return null

  const pct = data.total_possible_score > 0
    ? Math.round(data.overall_score / data.total_possible_score * 100)
    : 0

  const STATUS_COLOR: Record<string, string> = {
    PASSED: 'badge-green', FAILED: 'badge-red', PENDING: 'badge-gray',
    ERROR: 'badge-red', TIMEOUT: 'badge-yellow', RUNNING: 'badge-blue',
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <Link to={`/section/classes/${classId}/students`} className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Back to Students
        </Link>

        {/* Student header card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.08))',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 'var(--radius-xl)',
          padding: '1.75rem',
          display: 'flex', alignItems: 'center', gap: '1.5rem',
          flexWrap: 'wrap', marginBottom: '2rem',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--brand-from), var(--brand-to))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {(data.student_name || 'S')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>{data.student_name}</h1>
            <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              <span>{data.reg_no}</span>
              {data.section_name && <span>Section: {data.section_name}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '2.5rem', fontWeight: 800,
              color: pct >= 80 ? 'var(--accent-green)' : pct >= 60 ? 'var(--accent-yellow)' : 'var(--accent-red)',
            }}>{pct}%</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {data.overall_score} / {data.total_possible_score} marks
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <Code2 size={20} color="var(--brand-light)" />
          <div className="stat-value" style={{ color: 'var(--brand-light)', fontSize: '1.75rem' }}>
            {data.code_submissions?.length ?? 0}
          </div>
          <div className="stat-label">Code Submissions</div>
        </div>
        <div className="stat-card">
          <ClipboardList size={20} color="var(--accent-yellow)" />
          <div className="stat-value" style={{ color: 'var(--accent-yellow)', fontSize: '1.75rem' }}>
            {data.mcq_submissions?.length ?? 0}
          </div>
          <div className="stat-label">MCQ Submissions</div>
        </div>
        <div className="stat-card">
          <CheckCircle size={20} color="var(--accent-green)" />
          <div className="stat-value" style={{ color: 'var(--accent-green)', fontSize: '1.75rem' }}>
            {data.sessions_completed ?? 0}
          </div>
          <div className="stat-label">Sessions Completed</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        {/* Code Submissions */}
        <div>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, marginBottom: '1rem' }}>
            <Code2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Code Submissions
          </h2>
          {!data.code_submissions?.length ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No code submissions yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.code_submissions.map((s: any) => (
                <div key={s.id} className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.assessment_title}</span>
                    <span className={`badge ${STATUS_COLOR[s.status] || 'badge-gray'}`} style={{ fontSize: '0.68rem' }}>{s.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>Score: <strong style={{ color: 'var(--text-primary)' }}>{s.score} / {s.total_score}</strong></span>
                    <span>Attempt #{s.attempt_number}</span>
                    <span>{s.passed_tests}✓ {s.failed_tests}✗</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                    {new Date(s.submitted_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MCQ Submissions */}
        <div>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, marginBottom: '1rem' }}>
            <ClipboardList size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />MCQ Submissions
          </h2>
          {!data.mcq_submissions?.length ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No MCQ submissions yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.mcq_submissions.map((s: any) => {
                const pct = s.total_score > 0 ? Math.round(s.score / s.total_score * 100) : 0
                return (
                  <div key={s.id} className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.assessment_title}</span>
                      <span style={{
                        fontSize: '0.875rem', fontWeight: 700,
                        color: pct >= 80 ? 'var(--accent-green)' : pct >= 60 ? 'var(--accent-yellow)' : 'var(--accent-red)',
                      }}>{pct}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <span>Score: <strong style={{ color: 'var(--text-primary)' }}>{s.score} / {s.total_score}</strong></span>
                      <span>Attempt #{s.attempt_number}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                      {new Date(s.submitted_at).toLocaleString()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
