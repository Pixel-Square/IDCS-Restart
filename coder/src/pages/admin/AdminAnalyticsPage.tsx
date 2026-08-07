import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { TrendingUp, Users, BookOpen, Code2, ClipboardList } from 'lucide-react'
import { coursesApi } from '../../api'

const COLORS = ['#6366f1', '#8b5cf6', '#3fb950', '#58a6ff', '#d29922', '#f85149']

export default function AdminAnalyticsPage() {
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
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  )

  const enrollmentData = (analytics?.courses || []).map((c: any) => ({
    name: c.code,
    enrollments: c.enrollment_count,
    submissions: c.submission_count,
  }))

  const courseStatusData = [
    { name: 'Active', value: analytics?.total_courses || 0 },
    { name: 'Classes', value: analytics?.total_classes || 0 },
  ]

  const stats = [
    { label: 'Active Courses', value: analytics?.total_courses ?? 0, icon: BookOpen, color: 'var(--brand-light)' },
    { label: 'Total Classes', value: analytics?.total_classes ?? 0, icon: Code2, color: 'var(--accent-blue)' },
    { label: 'Enrollments', value: analytics?.total_enrollments ?? 0, icon: Users, color: 'var(--accent-green)' },
    { label: 'Code Submissions', value: analytics?.total_submissions ?? 0, icon: TrendingUp, color: 'var(--accent-purple)' },
    { label: 'MCQ Submissions', value: analytics?.total_mcq_submissions ?? 0, icon: ClipboardList, color: 'var(--accent-yellow)' },
  ]

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <h1 className="page-title">Platform Analytics</h1>
        <p className="page-subtitle">Overall activity across all courses and sections</p>
      </div>

      {/* Stats grid */}
      <div className="stats-grid" style={{ marginBottom: '2.5rem' }}>
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <Icon size={20} color={color} />
            <div className="stat-value" style={{ color, fontSize: '1.75rem' }}>{value.toLocaleString()}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {enrollmentData.length > 0 && (
        <div className="grid-2" style={{ marginBottom: '2rem' }}>
          {/* Bar chart */}
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Enrollments & Submissions by Course</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={enrollmentData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Bar dataKey="enrollments" fill="#6366f1" radius={[4, 4, 0, 0]} name="Enrollments" />
                <Bar dataKey="submissions" fill="#3fb950" radius={[4, 4, 0, 0]} name="Submissions" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart */}
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Submission Breakdown</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Code Submissions', value: analytics?.total_submissions || 0 },
                    { name: 'MCQ Submissions', value: analytics?.total_mcq_submissions || 0 },
                  ]}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  paddingAngle={4} dataKey="value"
                >
                  <Cell fill="#6366f1" />
                  <Cell fill="#3fb950" />
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Course table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Course Breakdown</h3>
        </div>
        <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr><th>Course</th><th>Code</th><th>Enrollments</th><th>Submissions</th></tr>
            </thead>
            <tbody>
              {(analytics?.courses || []).map((c: any, i: number) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td><span className="badge badge-brand">{c.code}</span></td>
                  <td>{c.enrollment_count}</td>
                  <td>{c.submission_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
