import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, Edit2, Trash2, Eye, EyeOff, X, Check } from 'lucide-react'
import { coursesApi, sessionsApi } from '../../api'

export default function InchargeCoursePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [course, setCourse] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ title: '', description: '', order: 1, session_type: 'LAB', is_published: false })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const courseId = Number(id)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const [courseRes, sessionsRes] = await Promise.all([
        coursesApi.get(courseId),
        sessionsApi.list(courseId),
      ])
      setCourse(courseRes.data)
      setSessions(sessionsRes.data)
    } catch {
      navigate('/incharge')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [courseId])

  const openCreate = () => {
    setEditing(null)
    setForm({ title: '', description: '', order: (sessions.length + 1), session_type: 'LAB', is_published: false })
    setShowModal(true)
  }

  const openEdit = (s: any) => {
    setEditing(s)
    setForm({ title: s.title, description: s.description, order: s.order, session_type: s.session_type, is_published: s.is_published })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        await sessionsApi.update(editing.id, { ...form, course: courseId })
      } else {
        await sessionsApi.create({ ...form, course: courseId })
      }
      setShowModal(false)
      load()
      showToast(editing ? 'Session updated!' : 'Session created!')
    } catch (e: any) {
      showToast('Error saving session', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (sid: number) => {
    if (!confirm('Delete this session and all its assessments?')) return
    try {
      await sessionsApi.delete(sid)
      load()
      showToast('Session deleted')
    } catch {
      showToast('Error deleting session', 'error')
    }
  }

  const handleTogglePublish = async (s: any) => {
    try {
      await sessionsApi.update(s.id, { is_published: !s.is_published, course: courseId })
      load()
    } catch {
      showToast('Error updating session', 'error')
    }
  }

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  const TYPE_BADGE: Record<string, string> = { MCQ: 'badge-yellow', LAB: 'badge-brand', PROJECT: 'badge-purple' }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.type === 'success' ? <Check size={16} /> : <X size={16} />}{toast.msg}</div>}

      <div className="page-header">
        <Link to="/incharge" className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Back
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 className="page-title" style={{ margin: 0 }}>{course?.name}</h1>
              <span className="badge badge-brand">{course?.code}</span>
            </div>
            <p className="page-subtitle">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add Session
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          <p style={{ fontWeight: 600, marginBottom: '1rem' }}>No sessions yet</p>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add First Session</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sessions.map((s: any, i: number) => (
            <div key={s.id} className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '10px', flexShrink: 0,
                background: 'rgba(99,102,241,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, color: 'var(--brand-light)',
              }}>
                {s.order}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600 }}>{s.title}</span>
                  <span className={`badge ${TYPE_BADGE[s.session_type] || 'badge-gray'}`} style={{ fontSize: '0.7rem' }}>{s.session_type}</span>
                  {s.is_published ? <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>Published</span> : <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>Draft</span>}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {s.assessment_count} assessment{s.assessment_count !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => handleTogglePublish(s)} title={s.is_published ? 'Unpublish' : 'Publish'}>
                  {s.is_published ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>
                  <Edit2 size={13} />
                </button>
                <Link to={`/incharge/sessions/${s.id}`} className="btn btn-primary btn-sm">
                  Open <ChevronRight size={13} />
                </Link>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Session Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Session' : 'New Session'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="label">Title *</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Session title" />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="What will students learn?" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="label">Order</label>
                  <input className="input" type="number" min="1" value={form.order} onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="label">Type</label>
                  <select className="input" value={form.session_type} onChange={e => setForm(f => ({ ...f, session_type: e.target.value }))}>
                    <option value="LAB">Lab</option>
                    <option value="MCQ">MCQ</option>
                    <option value="PROJECT">Project</option>
                  </select>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
                <span style={{ fontSize: '0.875rem' }}>Publish immediately (visible to students)</span>
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.title}>
                  {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <Check size={16} />}
                  {editing ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
