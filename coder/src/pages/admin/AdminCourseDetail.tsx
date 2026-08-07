import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Users, Layers, UserPlus, RefreshCw, X, Check, Plus, ChevronLeft, UserCheck } from 'lucide-react'
import { coursesApi, inchargesApi, classesApi } from '../../api'

export default function AdminCourseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [course, setCourse] = useState<any>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [incharges, setIncharges] = useState<any[]>([])
  const [sections, setSections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'classes' | 'incharges'>('classes')

  // Modals
  const [showClassModal, setShowClassModal] = useState(false)
  const [showInchargeModal, setShowInchargeModal] = useState(false)
  const [classForm, setClassForm] = useState({ name: '', academic_year: '', idcs_section: '' })
  const [inchargeForm, setInchargeForm] = useState({ user_id: '', username_hint: '' })
  const [saving, setSaving] = useState(false)
  const [syncingClass, setSyncingClass] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // User search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const courseId = Number(id)

  const load = async () => {
    setLoading(true)
    try {
      const [courseRes, classRes, inchargeRes, sectionsRes] = await Promise.all([
        coursesApi.adminGet(courseId),
        classesApi.list(courseId),
        inchargesApi.list(courseId),
        classesApi.fetchSections(),
      ])
      setCourse(courseRes.data)
      setClasses(classRes.data)
      setIncharges(inchargeRes.data)
      setSections(sectionsRes.data)
    } catch {
      navigate('/admin/courses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [courseId])

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await classesApi.searchUsers(searchQuery)
        setSearchResults(res.data)
      } catch (e) {
        console.error(e)
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleCreateClass = async () => {
    setSaving(true)
    try {
      let className = ''
      if (classForm.idcs_section) {
        const selectedSection = sections.find(s => s.id.toString() === classForm.idcs_section.toString())
        if (selectedSection) {
          className = selectedSection.name
        }
      }
      
      await classesApi.create({ ...classForm, name: className, course: courseId })
      setShowClassModal(false)
      setClassForm({ name: '', academic_year: '', idcs_section: '' })
      load()
      showToast('Class created successfully!')
    } catch (e: any) {
      showToast(e?.response?.data?.name?.[0] || 'Error creating class', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddIncharge = async () => {
    setSaving(true)
    try {
      await inchargesApi.create({ course: courseId, user_id: Number(selectedUser.id) })
      setShowInchargeModal(false)
      setSelectedUser(null)
      setSearchQuery('')
      load()
      showToast('Incharge assigned!')
    } catch (e: any) {
      showToast(e?.response?.data?.detail || 'Error assigning incharge', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveIncharge = async (inchargeId: number) => {
    if (!confirm('Remove this incharge?')) return
    try {
      await inchargesApi.remove(inchargeId)
      load()
      showToast('Incharge removed')
    } catch {
      showToast('Error removing incharge', 'error')
    }
  }

  const handleSyncClass = async (classId: number) => {
    setSyncingClass(classId)
    try {
      const res = await classesApi.syncEnrollments(classId)
      showToast(res.data.detail)
    } catch (e: any) {
      showToast(e?.response?.data?.detail || 'Sync failed', 'error')
    } finally {
      setSyncingClass(null)
    }
  }

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <Link to="/admin/courses" className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Back to Courses
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 className="page-title" style={{ margin: 0 }}>{course?.name}</h1>
              <span className={`badge ${course?.status === 'ACTIVE' ? 'badge-green' : course?.status === 'DRAFT' ? 'badge-yellow' : 'badge-gray'}`}>
                {course?.status}
              </span>
              <span className="badge badge-brand">{course?.code}</span>
            </div>
            <p className="page-subtitle">{course?.description || 'No description'}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
        {(['classes', 'incharges'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--brand)' : 'transparent'}`,
              color: tab === t ? 'var(--brand-light)' : 'var(--text-muted)',
              cursor: 'pointer', fontWeight: tab === t ? 600 : 400,
              fontSize: '0.9rem', marginBottom: '-1px', transition: 'all 0.2s',
              textTransform: 'capitalize',
            }}
          >
            {t === 'classes' ? <><Layers size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Classes ({classes.length})</> : <><UserCheck size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Incharges ({incharges.filter(i => i.is_active).length})</>}
          </button>
        ))}
      </div>

      {/* Classes tab */}
      {tab === 'classes' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button className="btn btn-primary" onClick={() => setShowClassModal(true)}>
              <Plus size={16} /> Add Class
            </button>
          </div>
          {classes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              <Layers size={36} style={{ opacity: 0.4, marginBottom: '1rem' }} />
              <p>No classes yet. Add sections of students to this course.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Class Name</th><th>IDCS Section</th><th>Year</th><th>Students</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {classes.map((c: any) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>{c.section_name || <span style={{ color: 'var(--text-muted)' }}>Not linked</span>}</td>
                      <td>{c.academic_year || '—'}</td>
                      <td>{c.enrollment_count}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleSyncClass(c.id)}
                          disabled={syncingClass === c.id || !c.idcs_section}
                          title={!c.idcs_section ? 'Link an IDCS section first' : 'Sync students from IDCS'}
                        >
                          {syncingClass === c.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <RefreshCw size={13} />}
                          Sync
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Incharges tab */}
      {tab === 'incharges' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button className="btn btn-primary" onClick={() => setShowInchargeModal(true)}>
              <UserPlus size={16} /> Assign Incharge
            </button>
          </div>
          {incharges.filter(i => i.is_active).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              <Users size={36} style={{ opacity: 0.4, marginBottom: '1rem' }} />
              <p>No incharges assigned yet.</p>
            </div>
          ) : (
            <div className="grid-auto">
              {incharges.filter(i => i.is_active).map((i: any) => (
                <div key={i.id} className="card" style={{ flexDirection: 'row', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--brand-from), var(--brand-to))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>
                    {(i.user?.full_name || i.user?.username || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{i.user?.full_name || i.user?.username}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{i.user?.email}</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => handleRemoveIncharge(i.id)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add Class Modal */}
      {showClassModal && (
        <div className="modal-overlay" onClick={() => setShowClassModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Class</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowClassModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="label">IDCS Section *</label>
                <select 
                  className="input" 
                  value={classForm.idcs_section} 
                  onChange={e => setClassForm(f => ({ ...f, idcs_section: e.target.value }))}
                >
                  <option value="">-- Select Section --</option>
                  {sections.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  This will be used as the class name and will auto-enroll all students from this section
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowClassModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCreateClass} disabled={saving || !classForm.idcs_section}>
                  {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <Plus size={16} />}
                  Add Class
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Incharge Modal */}
      {showInchargeModal && (
        <div className="modal-overlay" onClick={() => setShowInchargeModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Assign Course Incharge</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowInchargeModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="label">Search User</label>
                {!selectedUser ? (
                  <div style={{ position: 'relative' }}>
                    <input 
                      className="input" 
                      value={searchQuery} 
                      onChange={e => setSearchQuery(e.target.value)} 
                      placeholder="Type name, email, or username..." 
                      autoFocus
                    />
                    {searching && <div className="spinner" style={{ position: 'absolute', right: 10, top: 10, width: 16, height: 16 }} />}
                    
                    {searchResults.length > 0 && (
                      <div style={{ 
                        position: 'absolute', top: '100%', left: 0, right: 0, 
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)', 
                        borderRadius: 'var(--radius-md)', marginTop: '4px', maxHeight: 200, overflowY: 'auto', zIndex: 10 
                      }}>
                        {searchResults.map(u => (
                          <div 
                            key={u.id} 
                            onClick={() => { setSelectedUser(u); setSearchResults([]); setSearchQuery('') }}
                            style={{ padding: '0.5rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                          >
                            <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email} | {u.username}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{selectedUser.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedUser.email}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUser(null)}><X size={14} /></button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button className="btn btn-ghost" onClick={() => setShowInchargeModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddIncharge} disabled={saving || !selectedUser}>
                  {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <UserPlus size={16} />}
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
