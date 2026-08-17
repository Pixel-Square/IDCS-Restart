import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, Edit2, Trash2, X, Check, ClipboardList, Code2 } from 'lucide-react'
import { sessionsApi, assessmentsApi } from '../../api'

const STATUS_BADGE: Record<string, string> = { DRAFT: 'badge-gray', PUBLISHED: 'badge-green', CLOSED: 'badge-red' }

export default function InchargeSessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<any>(null)
  const [assessments, setAssessments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ title: '', description: '', assessment_type: 'CODING', total_marks: 100, duration_minutes: 60, max_attempts: 1, status: 'DRAFT', start_time: '', end_time: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const sessionId = Number(id)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const [sRes, aRes] = await Promise.all([
        sessionsApi.get(sessionId),
        assessmentsApi.list(sessionId),
      ])
      setSession(sRes.data)
      setAssessments(aRes.data)
    } catch {
      navigate('/incharge')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sessionId])

  const openCreate = () => {
    setEditing(null)
    setForm({ title: '', description: '', assessment_type: 'CODING', total_marks: 100, duration_minutes: 60, max_attempts: 1, status: 'DRAFT', start_time: '', end_time: '' })
    setShowModal(true)
  }

  const openEdit = (a: any) => {
    setEditing(a)
    setForm({
      title: a.title, description: a.description, assessment_type: a.assessment_type,
      total_marks: a.total_marks, duration_minutes: a.duration_minutes,
      max_attempts: a.max_attempts, status: a.status,
      start_time: a.start_time ? a.start_time.slice(0, 16) : '',
      end_time: a.end_time ? a.end_time.slice(0, 16) : '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form, session: sessionId }
      if (!payload.start_time) delete (payload as any).start_time
      if (!payload.end_time) delete (payload as any).end_time
      if (editing) {
        await assessmentsApi.update(editing.id, payload)
      } else {
        await assessmentsApi.create(payload)
      }
      setShowModal(false)
      load()
      showToast(editing ? 'Assessment updated!' : 'Assessment created!')
    } catch (e: any) {
      showToast('Error saving assessment', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (aid: number) => {
    if (!confirm('Delete this assessment?')) return
    try {
      await assessmentsApi.delete(aid)
      load()
      showToast('Deleted')
    } catch { showToast('Error', 'error') }
  }

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.type === 'success' ? <Check size={16} /> : <X size={16} />}{toast.msg}</div>}

      <div className="page-header">
        <Link to={`/incharge/courses/${session?.course}`} className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Back to Course
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Session {session?.order}: {session?.title}</h1>
            <p className="page-subtitle">{assessments.length} assessment{assessments.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Assessment</button>
        </div>
      </div>

      {assessments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
          <p style={{ fontWeight: 600, marginBottom: '1rem' }}>No assessments yet</p>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Assessment</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {assessments.map((a: any) => (
            <div key={a.id} className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '10px', flexShrink: 0,
                background: a.assessment_type === 'MCQ' ? 'rgba(210,153,34,0.1)' : 'rgba(99,102,241,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {a.assessment_type === 'MCQ' ? <ClipboardList size={18} color="var(--accent-yellow)" /> : <Code2 size={18} color="var(--brand-light)" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600 }}>{a.title}</span>
                  <span className={`badge ${a.assessment_type === 'MCQ' ? 'badge-yellow' : 'badge-brand'}`} style={{ fontSize: '0.7rem' }}>{a.assessment_type}</span>
                  <span className={`badge ${STATUS_BADGE[a.status] || 'badge-gray'}`} style={{ fontSize: '0.7rem' }}>{a.status}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {a.total_marks} marks · {a.duration_minutes} min · {a.max_attempts} attempt{a.max_attempts !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}><Edit2 size={13} /></button>
                <Link to={`/incharge/assessments/${a.id}`} className="btn btn-primary btn-sm">
                  Manage <ChevronRight size={13} />
                </Link>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assessment Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Assessment' : 'New Assessment'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="label">Title *</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Assessment title" />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="label">Type *</label>
                  <select className="input" value={form.assessment_type} onChange={e => setForm(f => ({ ...f, assessment_type: e.target.value }))}>
                    <option value="CODING">Coding</option>
                    <option value="MCQ">MCQ</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="label">Total Marks</label>
                  <input className="input" type="number" min="1" value={form.total_marks} onChange={e => setForm(f => ({ ...f, total_marks: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="label">Duration (minutes)</label>
                  <input className="input" type="number" min="5" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Max Attempts</label>
                <input className="input" type="number" min="1" value={form.max_attempts} onChange={e => setForm(f => ({ ...f, max_attempts: Number(e.target.value) }))} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="label">Start Time</label>
                  <input className="input" type="datetime-local" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="label">End Time</label>
                  <input className="input" type="datetime-local" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
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
