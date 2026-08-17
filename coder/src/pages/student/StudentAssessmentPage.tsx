import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Code2, ClipboardList, Clock, Target, AlertCircle } from 'lucide-react'
import { assessmentsApi } from '../../api'

export default function StudentAssessmentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [assessment, setAssessment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const assessmentId = Number(id)

  // MCQ state
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [mcqResult, setMcqResult] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [currentQ, setCurrentQ] = useState(0)

  useEffect(() => {
    assessmentsApi.studentGet(assessmentId)
      .then(r => setAssessment(r.data))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load assessment'))
      .finally(() => setLoading(false))
  }, [assessmentId])

  const handleMCQSubmit = async () => {
    if (!confirm('Submit MCQ? You cannot change answers after submission.')) return
    setSubmitting(true)
    try {
      const res = await assessmentsApi.submitMCQ(
        assessmentId,
        Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v]))
      )
      setMcqResult(res.data)
      setSubmitted(true)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  if (error) return (
    <div className="page">
      <div style={{
        padding: '2rem', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)',
        borderRadius: 'var(--radius-lg)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
      }}>
        <AlertCircle size={20} color="var(--accent-red)" />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--accent-red)', marginBottom: '0.5rem' }}>Cannot access this assessment</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{error}</div>
          <Link to="/student" className="btn btn-ghost btn-sm" style={{ marginTop: '1rem' }}>
            <ChevronLeft size={14} /> Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )

  const isMCQ = assessment?.assessment_type === 'MCQ'
  const questions = assessment?.questions || []

  // MCQ result view
  if (submitted && mcqResult) {
    const pct = mcqResult.total_score > 0 ? Math.round(mcqResult.score / mcqResult.total_score * 100) : 0
    const passed = pct >= 60
    return (
      <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: '3rem 0' }}>
          <div style={{
            width: 100, height: 100, borderRadius: '50%', margin: '0 auto 1.5rem',
            background: passed ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
            border: `3px solid ${passed ? 'var(--accent-green)' : 'var(--accent-red)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', fontWeight: 800,
            color: passed ? 'var(--accent-green)' : 'var(--accent-red)',
          }}>
            {pct}%
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {passed ? '🎉 Great work!' : 'Keep practicing!'}
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            You scored <strong>{mcqResult.score}</strong> out of <strong>{mcqResult.total_score}</strong> marks
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Link to="/student" className="btn btn-ghost">Dashboard</Link>
            <button className="btn btn-primary" onClick={() => { setSubmitted(false); setMcqResult(null); setAnswers({}); setCurrentQ(0) }}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <Link to={assessment?.session ? `/student/sessions/${assessment.session}` : '/student'} className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Back
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{assessment?.title}</h1>
              <span className={`badge ${isMCQ ? 'badge-yellow' : 'badge-brand'}`}>{assessment?.assessment_type}</span>
            </div>
            <div style={{ display: 'flex', gap: '1.25rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              <span><Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{assessment?.duration_minutes} min</span>
              <span><Target size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{assessment?.total_marks} marks</span>
              <span>Attempts: {assessment?.attempts_used} / {assessment?.max_attempts}</span>
            </div>
          </div>
          {!isMCQ && (
            <Link to={`/student/ide/${assessmentId}`} className="btn btn-primary btn-lg">
              <Code2 size={18} /> Open IDE
            </Link>
          )}
        </div>
      </div>

      {/* MCQ */}
      {isMCQ && questions.length > 0 && (
        <div className="grid-2" style={{ alignItems: 'flex-start' }}>
          {/* Question panel */}
          <div>
            <div className="mcq-question">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Question {currentQ + 1} of {questions.length}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{questions[currentQ].marks} pt{questions[currentQ].marks !== 1 ? 's' : ''}</span>
              </div>
              <p style={{ fontSize: '1rem', fontWeight: 500, lineHeight: 1.6, marginBottom: '1.25rem' }}>
                {questions[currentQ].question_text}
              </p>
              {questions[currentQ].options.map((opt: string, oi: number) => (
                <div
                  key={oi}
                  className={`mcq-option${answers[questions[currentQ].id] === opt ? ' selected' : ''}`}
                  onClick={() => setAnswers(a => ({ ...a, [questions[currentQ].id]: opt }))}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${answers[questions[currentQ].id] === opt ? 'var(--brand)' : 'var(--border)'}`,
                    background: answers[questions[currentQ].id] === opt ? 'var(--brand)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {answers[questions[currentQ].id] === opt && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <span>{opt}</span>
                </div>
              ))}

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem' }}>
                <button className="btn btn-ghost btn-sm" disabled={currentQ === 0} onClick={() => setCurrentQ(q => q - 1)}>
                  <ChevronLeft size={14} /> Previous
                </button>
                {currentQ < questions.length - 1 ? (
                  <button className="btn btn-primary btn-sm" onClick={() => setCurrentQ(q => q + 1)}>
                    Next <ChevronRight size={14} />
                  </button>
                ) : (
                  <button className="btn btn-success" onClick={handleMCQSubmit} disabled={submitting}>
                    {submitting ? <div className="spinner" style={{ width: 16, height: 16 }} /> : null}
                    Submit MCQ
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Question navigator */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.875rem', fontSize: '0.9rem' }}>Question Navigator</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {questions.map((q: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setCurrentQ(i)}
                  style={{
                    width: 34, height: 34,
                    borderRadius: 6, cursor: 'pointer',
                    fontWeight: 600, fontSize: '0.8125rem',
                    background: i === currentQ
                      ? 'var(--brand)'
                      : answers[q.id]
                        ? 'rgba(63,185,80,0.2)'
                        : 'var(--bg-elevated)',
                    color: i === currentQ ? '#fff' : answers[q.id] ? 'var(--accent-green)' : 'var(--text-secondary)',
                    border: i === currentQ ? 'none' : answers[q.id] ? '1px solid rgba(63,185,80,0.4)' : '1px solid var(--border)',
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {Object.keys(answers).length} of {questions.length} answered
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleMCQSubmit}
              disabled={submitting}
            >
              {submitting ? <div className="spinner" style={{ width: 16, height: 16 }} /> : null}
              Submit All Answers
            </button>
          </div>
        </div>
      )}

      {/* Coding assessment */}
      {!isMCQ && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Code2 size={48} color="var(--brand-light)" style={{ marginBottom: '1rem' }} />
          <h2 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Ready to Code?</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            This is a coding assessment. Click "Open IDE" to start writing your solution.
          </p>
          {assessment?.public_test_cases?.length > 0 && (
            <div style={{ marginBottom: '2rem', textAlign: 'left' }}>
              <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Sample Test Cases</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {assessment.public_test_cases.map((tc: any, i: number) => (
                  <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.875rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Input</div>
                      <code style={{ fontSize: '0.8125rem' }}>{tc.input_data || '(none)'}</code>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Expected</div>
                      <code style={{ fontSize: '0.8125rem', color: 'var(--accent-green)' }}>{tc.expected_output || '(none)'}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link to={`/student/ide/${assessmentId}`} className="btn btn-primary btn-lg">
            <Code2 size={18} /> Open IDE
          </Link>
        </div>
      )}
    </div>
  )
}
