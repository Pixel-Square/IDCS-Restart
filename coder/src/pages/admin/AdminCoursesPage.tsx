import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, BookOpen, ChevronRight, Edit2, Archive, X, Check } from 'lucide-react'
import { coursesApi } from '../../api'

type Status = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

interface Course {
  id: number
  name: string
  code: string
  description: string
  academic_year: string
  status: Status
  incharge_count: number
  created_at: string
}

const STATUS_BADGE: Record<Status, string> = {
  ACTIVE: 'badge-green',
  DRAFT: 'badge-yellow',
  ARCHIVED: 'badge-gray',
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [form, setForm] = useState({ name: '', code: '', description: '', academic_year: '', status: 'DRAFT' as Status })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const load = () => {
    setLoading(true)
    coursesApi.adminList(statusFilter ? { status: statusFilter } : undefined)
      .then(r => setCourses(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', description: '', academic_year: '', status: 'DRAFT' })
    setShowModal(true)
  }

  const openEdit = (c: Course) => {
    setEditing(c)
    setForm({ name: c.name, code: c.code, description: c.description, academic_year: c.academic_year, status: c.status })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        await coursesApi.adminUpdate(editing.id, form)
      } else {
        await coursesApi.adminCreate(form)
      }
      setShowModal(false)
      load()
    } catch (e: any) {
      alert(e?.response?.data?.code?.[0] || 'Error saving course')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Courses</h1>
            <p className="page-subtitle">Create and manage coding courses</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> New Course
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['', 'ACTIVE', 'DRAFT', 'ARCHIVED'].map(s => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            onClick={() => setStatusFilter(s)}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : courses.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '4rem',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <BookOpen size={48} style={{ marginBottom: '1rem', color: 'var(--text-muted)' }} />
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No courses found</p>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Create your first course to get started</p>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Create Course</button>
        </div>
      ) : (
        <div className="grid-auto">
          {courses.map(c => (
            <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span className={`badge ${STATUS_BADGE[c.status]}`}>{c.status}</span>
                <span className="badge badge-brand">{c.code}</span>
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.375rem' }}>{c.name}</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {c.description || 'No description'}
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {c.incharge_count} incharge{c.incharge_count !== 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>
                    <Edit2 size={13} /> Edit
                  </button>
                  <Link to={`/admin/courses/${c.id}`} className="btn btn-primary btn-sm">
                    Manage <ChevronRight size={13} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Course' : 'Create Course'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="label">Course Name *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Java Programming" />
              </div>
              <div className="form-group">
                <label className="label">Course Code *</label>
                <input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. JAVA101" />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Course description..." rows={3} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="label">Academic Year</label>
                  <input className="input" value={form.academic_year} onChange={e => setForm(f => ({ ...f, academic_year: e.target.value }))} placeholder="2024-2025" />
                </div>
                <div className="form-group">
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}>
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.code}>
                  {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <Check size={16} />}
                  {editing ? 'Save Changes' : 'Create Course'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
