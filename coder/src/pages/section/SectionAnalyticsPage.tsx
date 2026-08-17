import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, TrendingUp, Users, Trophy, BarChart2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { sectionApi } from '../../api'

export default function SectionAnalyticsPage() {
  const { classId } = useParams<{ classId: string }>()
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const id = Number(classId)

  useEffect(() => {
    sectionApi.analytics(id)
      .then(r => setAnalytics(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  const topStudents = (analytics?.student_scores || [])
    .sort((a: any, b: any) => b.overall_score - a.overall_score)
    .slice(0, 5)

  const chartData = (analytics?.student_scores || []).map((s: any) => ({
    name: s.reg_no,
    score: s.total_possible_score > 0 ? Math.round(s.overall_score / s.total_possible_score * 100) : 0,
  })).sort((a: any, b: any) => b.score - a.score).slice(0, 15)

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <Link to={`/section/classes/${classId}/students`} className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Students
        </Link>
        <h1 className="page-title">Class Analytics</h1>
        <p className="page-subtitle">Read-only performance overview</p>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <Users size={20} color="var(--brand-light)" />
          <div className="stat-value" style={{ color: 'var(--brand-light)', fontSize: '1.75rem' }}>{analytics?.total_students ?? 0}</div>
          <div className="stat-label">Total Students</div>
        </div>
        <div className="stat-card">
          <TrendingUp size={20} color="var(--accent-green)" />
          <div className="stat-value" style={{ color: 'var(--accent-green)', fontSize: '1.75rem' }}>{analytics?.avg_score_pct ?? 0}%</div>
          <div className="stat-label">Class Average</div>
        </div>
        <div className="stat-card">
          <Trophy size={20} color="var(--accent-yellow)" />
          <div className="stat-value" style={{ color: 'var(--accent-yellow)', fontSize: '1.75rem' }}>{analytics?.top_score_pct ?? 0}%</div>
          <div className="stat-label">Top Score</div>
        </div>
        <div className="stat-card">
          <BarChart2 size={20} color="var(--accent-blue)" />
          <div className="stat-value" style={{ color: 'var(--accent-blue)', fontSize: '1.75rem' }}>{analytics?.total_submissions ?? 0}</div>
          <div className="stat-label">Total Submissions</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        {/* Score distribution chart */}
        {chartData.length > 0 && (
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem' }}>Score Distribution (Top 15)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                  formatter={(v: any) => [`${v}%`, 'Score']}
                />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}
                  fill="url(#scoreGradient)"
                />
                <defs>
                  <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top performers */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>🏆 Top Performers</h3>
          {topStudents.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No data yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {topStudents.map((s: any, i: number) => {
                const pct = s.total_possible_score > 0 ? Math.round(s.overall_score / s.total_possible_score * 100) : 0
                return (
                  <div key={s.student_id} className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: i === 0 ? 'rgba(210,153,34,0.2)' : i === 1 ? 'rgba(88,166,255,0.1)' : 'rgba(99,102,241,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1rem',
                    }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.student_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.reg_no}</div>
                    </div>
                    <div style={{
                      fontWeight: 700, fontSize: '1rem',
                      color: pct >= 80 ? 'var(--accent-green)' : pct >= 60 ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                    }}>
                      {pct}%
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
