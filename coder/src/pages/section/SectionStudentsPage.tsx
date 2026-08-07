import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search, Trophy, Code2, ClipboardList } from 'lucide-react'
import { sectionApi } from '../../api'

export default function SectionStudentsPage() {
  const { classId } = useParams<{ classId: string }>()
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const id = Number(classId)

  useEffect(() => {
    sectionApi.students(id)
      .then(r => setStudents(r.data.students || r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const filtered = students.filter(s =>
    s.reg_no?.toLowerCase().includes(search.toLowerCase()) ||
    s.name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  const getScorePct = (s: any) => {
    if (!s.overall_score && !s.total_possible_score) return 0
    if (!s.total_possible_score) return 0
    return Math.round(s.overall_score / s.total_possible_score * 100)
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <Link to="/section" className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Dashboard
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Students</h1>
            <p className="page-subtitle">{filtered.length} of {students.length} students</p>
          </div>
          <Link to={`/section/classes/${classId}/analytics`} className="btn btn-ghost btn-sm">
            📊 Class Analytics
          </Link>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.5rem', maxWidth: 360 }}>
        <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          className="input"
          style={{ paddingLeft: '2.25rem' }}
          placeholder="Search by name or reg no..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          {search ? 'No students match your search.' : 'No students enrolled.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reg No</th>
                <th>Name</th>
                <th>Overall Score</th>
                <th>Progress</th>
                <th>Submissions</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => {
                const pct = getScorePct(s)
                return (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{s.reg_no}</td>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: pct >= 80 ? 'var(--accent-green)' : pct >= 60 ? 'var(--accent-yellow)' : 'var(--accent-red)',
                      }}>
                        {s.overall_score ?? 0} / {s.total_possible_score ?? 0}
                      </span>
                    </td>
                    <td style={{ minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="progress-bar" style={{ flex: 1, height: 5 }}>
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 32 }}>{pct}%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <Code2 size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />{s.coding_submissions ?? s.code_submission_count ?? 0}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <ClipboardList size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />{s.mcq_submissions ?? s.mcq_submission_count ?? 0}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Link to={`/section/classes/${classId}/students/${s.student_id || s.id}`} className="btn btn-ghost btn-sm">
                        View <ChevronRight size={13} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
