import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, RefreshCw, X, Check } from 'lucide-react'
import { classesApi } from '../../api'

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = () => {
    setLoading(true)
    classesApi.list()
      .then(r => setClasses(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSync = async (classId: number) => {
    setSyncing(classId)
    try {
      const res = await classesApi.syncEnrollments(classId)
      showToast(res.data.detail)
      load()
    } catch (e: any) {
      showToast(e?.response?.data?.detail || 'Sync failed', 'error')
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {toast.msg}
        </div>
      )}
      <div className="page-header">
        <h1 className="page-title">All Classes</h1>
        <p className="page-subtitle">Classes are managed from the course detail page</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : classes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          <Layers size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
          <p style={{ fontWeight: 600 }}>No classes found</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Create courses and add classes from the Courses page</p>
          <Link to="/admin/courses" className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }}>Go to Courses</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Class</th><th>Course</th><th>IDCS Section</th><th>Year</th><th>Students</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {classes.map((c: any) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>
                    <Link to={`/admin/courses/${c.course}`} style={{ color: 'var(--brand-light)' }}>
                      {c.course}
                    </Link>
                  </td>
                  <td>{c.section_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{c.academic_year || '—'}</td>
                  <td>
                    <span className="badge badge-blue">{c.enrollment_count}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleSync(c.id)}
                      disabled={syncing === c.id || !c.idcs_section}
                      title={!c.idcs_section ? 'No IDCS section linked' : 'Sync students'}
                    >
                      {syncing === c.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <RefreshCw size={13} />}
                      Sync Students
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
