import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Code2, ClipboardList, Clock, Target } from 'lucide-react'
import { sessionsApi, assessmentsApi } from '../../api'

export default function StudentSessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<any>(null)
  const [assessments, setAssessments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const sessionId = Number(id)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [sessionRes, assessmentsRes] = await Promise.all([
          sessionsApi.studentGet(sessionId),
          assessmentsApi.studentList(sessionId),
        ])
        setSession(sessionRes.data)
        setAssessments(assessmentsRes.data)
      } catch {
        navigate('/student')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  if (loading) return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <Link to={`/student/courses/${session?.course}`} className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Back to Course
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              Session {session?.order}: {session?.title}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {assessments.length} assessment{assessments.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {assessments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          No assessments published for this session yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {assessments.map((assessment: any) => {
            const isMCQ = assessment?.assessment_type === 'MCQ'
            return (
              <div key={assessment.id} className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '10px', flexShrink: 0,
                    background: isMCQ ? 'rgba(210,153,34,0.12)' : 'rgba(99,102,241,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isMCQ ? <ClipboardList size={18} color="var(--accent-yellow)" /> : <Code2 size={18} color="var(--brand-light)" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600 }}>{assessment.title}</span>
                      <span className={`badge ${isMCQ ? 'badge-yellow' : 'badge-brand'}`} style={{ fontSize: '0.68rem' }}>{assessment.assessment_type}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span><Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{assessment.duration_minutes} min</span>
                      <span><Target size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{assessment.total_marks} marks</span>
                    </div>
                  </div>
                  <Link to={`/student/assessments/${assessment.id}`} className="btn btn-primary btn-sm">
                    Open <ChevronRight size={13} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
