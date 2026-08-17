import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Download } from 'lucide-react'
import { assessmentsApi } from '../../api'

export default function InchargeSubmissionsPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const [submissions, setSubmissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const id = Number(assessmentId)

  useEffect(() => {
    assessmentsApi.inchargeSubmissions(id)
      .then(r => setSubmissions(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const STATUS_COLOR: Record<string, string> = {
    PASSED: 'badge-green', FAILED: 'badge-red', PENDING: 'badge-gray',
    RUNNING: 'badge-blue', ERROR: 'badge-red', REJECTED: 'badge-red', TIMEOUT: 'badge-yellow',
  }

  if (loading) return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <div style={{ marginBottom: '1rem' }}>
          <Link to="/incharge" className="btn btn-ghost btn-sm"><ChevronLeft size={15} /> Dashboard</Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title">Submissions</h1>
            <p className="page-subtitle">{submissions.length} total submission{submissions.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          No submissions yet
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reg No</th>
                <th>Attempt</th>
                <th>Status</th>
                <th>Score</th>
                <th>Passed</th>
                <th>Failed</th>
                <th>Submitted</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s: any) => (
                <>
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                    <td style={{ fontWeight: 600 }}>{s.student_reg_no || s.student}</td>
                    <td>#{s.attempt_number}</td>
                    <td><span className={`badge ${STATUS_COLOR[s.status] || 'badge-gray'}`}>{s.status}</span></td>
                    <td>{s.score !== undefined ? `${s.score} / ${s.total_score}` : `${s.score} / ${s.total_score}`}</td>
                    <td>{s.passed_tests ?? '—'}</td>
                    <td>{s.failed_tests ?? '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(s.submitted_at).toLocaleString()}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm">{expandedId === s.id ? '▲' : '▼'}</button>
                    </td>
                  </tr>
                  {expandedId === s.id && (
                    <tr key={`${s.id}-expand`}>
                      <td colSpan={8} style={{ padding: '1rem', background: 'var(--bg-elevated)' }}>
                        {s.error_message && (
                          <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 6, fontSize: '0.8125rem', color: 'var(--accent-red)' }}>
                            {s.error_message}
                          </div>
                        )}
                        {s.result_details?.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Test Results</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {s.result_details.map((r: any, i: number) => (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                                  padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.8rem',
                                  background: r.passed ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
                                  border: `1px solid ${r.passed ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
                                }}>
                                  <span style={{ color: r.passed ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>
                                    {r.passed ? '✓' : '✗'}
                                  </span>
                                  <span>TC {i + 1} {r.is_hidden ? '(hidden)' : ''}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>{r.marks_awarded} pts</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* MCQ result */}
                        {s.answers && s.result_details?.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {s.result_details.filter((r: any) => r.is_correct).length} / {s.result_details.length} correct
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
