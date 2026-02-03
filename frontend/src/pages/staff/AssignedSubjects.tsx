import React, { useEffect, useState } from 'react'
import { fetchAssignedSubjects } from '../../services/staff'
import './AssignedSubjects.css'
import { fetchSubjectBatches, createSubjectBatch } from '../../services/subjectBatches'
import fetchWithAuth from '../../services/fetchAuth'

type AssignedSubject = {
  id: number
  subject_code?: string | null
  subject_name?: string | null
  section_name?: string | null
  batch?: string | null
  semester?: number | null
}

// Icons as inline SVG components
const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
)

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
)

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
)

const AlertCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
)

const FileTextIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
)

export default function AssignedSubjectsPage() {
  const [items, setItems] = useState<AssignedSubject[]>([])
  const [batches, setBatches] = useState<any[]>([])
  const [batchNamesById, setBatchNamesById] = useState<Record<number,string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null)
  const [editingBatchName, setEditingBatchName] = useState('')
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerStudents, setPickerStudents] = useState<any[]>([])
  const [pickerItem, setPickerItem] = useState<any | null>(null)
  const [pickerSelectedIds, setPickerSelectedIds] = useState<number[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAssignedSubjects()
      const bs = await fetchSubjectBatches()
      setItems(data)
      setBatches(bs)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'Failed to load assigned subjects')
    } finally {
      setLoading(false)
    }
  }

    // Batch creation via subject actions only; no free-form batch input here.

  async function createBatchForAssignment(item: any){
    console.log('createBatchForAssignment clicked', item)
    // Always auto-name as next Batch N
    const nums = batches.map(b=>{
      const m = String(b.name || '').match(/Batch\s*(\d+)/i)
      return m ? parseInt(m[1],10) : null
    }).filter(Boolean) as number[]
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    const name = `Batch ${next}`
    // fetch students for section
    try{
      const sres = await fetchWithAuth(`/api/academics/sections/${item.section_id}/students/`)
      if (!sres.ok) {
        const txt = await sres.text()
        throw new Error(txt || 'Failed to load students')
      }
      const sdata = await sres.json()
      const studIds = (sdata.results || sdata).map((s:any)=>s.id)
      const payload: any = { name, student_ids: studIds }
      if (item.curriculum_row_id) payload.curriculum_row_id = item.curriculum_row_id
      await createSubjectBatch(payload)
      const bs = await fetchSubjectBatches()
      setBatches(bs)
      setBatchNamesById(prev => ({ ...prev, [item.id]: '' }))
      alert('Batch created for subject')
    }catch(e:any){
      console.error('createBatchForAssignment error', e)
      setError(e?.message || String(e))
      alert('Failed to create batch: ' + (e?.message || e))
    }
  }
  
  // Open the picker for a specific assignment (subject)
  async function openPickerForAssignment(item: any){
    console.log('openPickerForAssignment clicked', item)
    setError(null)
    const name = batchNamesById[item.id] || `Batch for ${item.subject_code || item.subject_name || item.id}`
    setPickerItem(item)
    setBatchNamesById(prev => ({ ...prev, [item.id]: name }))
    try{
      const sres = await fetchWithAuth(`/api/academics/sections/${item.section_id}/students/`)
      if (!sres.ok) {
        const txt = await sres.text()
        throw new Error(txt || 'Failed to load students')
      }
      const sdata = await sres.json()
      const studs = (sdata.results || sdata)
      setPickerStudents(studs)
      setPickerSelectedIds(studs.map((s:any)=>s.id))
      setPickerOpen(true)
    }catch(e:any){
      console.error('openPickerForAssignment error', e)
      setError(e?.message || String(e))
      alert('Failed to load students: ' + (e?.message || e))
    }
  }

  function togglePickerSelect(id: number){
    setPickerSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }

  async function submitPicker(){
    if (!pickerItem) return
    // Always auto-name as next Batch N
    const nums = batches.map(b=>{
      const m = String(b.name || '').match(/Batch\s*(\d+)/i)
      return m ? parseInt(m[1],10) : null
    }).filter(Boolean) as number[]
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    const name = `Batch ${next}`
    const payload: any = { name, student_ids: pickerSelectedIds }
    if (pickerItem.curriculum_row_id) payload.curriculum_row_id = pickerItem.curriculum_row_id
    try{
      await createSubjectBatch(payload)
      const bs = await fetchSubjectBatches()
      setBatches(bs)
      setPickerOpen(false)
      setPickerStudents([])
      setPickerItem(null)
      alert('Batch created for subject')
    }catch(e:any){
      console.error(e)
      alert('Failed to create batch: ' + (e?.message || e))
    }
  }

  async function startEditBatch(b:any){
    setEditingBatchId(b.id)
    setEditingBatchName(b.name || '')
  }

  async function saveBatchEdit(){
    if(!editingBatchId) return
    try{
      const res = await fetchWithAuth(`/api/academics/subject-batches/${editingBatchId}/`, { method: 'PATCH', body: JSON.stringify({ name: editingBatchName }) })
      if(!res.ok) throw new Error(await res.text())
      const bs = await fetchSubjectBatches()
      setBatches(bs)
      setEditingBatchId(null)
      setEditingBatchName('')
      alert('Batch updated')
    }catch(e:any){
      console.error('saveBatchEdit failed', e)
      alert('Failed to update batch: ' + (e?.message || e))
    }
  }

  async function deleteBatch(id:number){
    if(!confirm('Delete this batch?')) return
    try{
      const res = await fetchWithAuth(`/api/academics/subject-batches/${id}/`, { method: 'DELETE' })
      if(!res.ok) throw new Error(await res.text())
      const bs = await fetchSubjectBatches()
      setBatches(bs)
      alert('Batch deleted')
    }catch(e:any){
      console.error('deleteBatch failed', e)
      alert('Failed to delete: ' + (e?.message || e))
    }
  }

  // Group batches by curriculum_row id for display under subjects
  const batchesByCurriculum: Record<string, any[]> = {}
  batches.forEach(b => {
    const crId = b.curriculum_row && b.curriculum_row.id ? String(b.curriculum_row.id) : '___no_cr'
    if (!batchesByCurriculum[crId]) batchesByCurriculum[crId] = []
    batchesByCurriculum[crId].push(b)
  })

  return (
    <div className="assigned-subjects-container">
      {/* Header Section */}
      <div className="assigned-subjects-header">
        <div className="header-left">
          <div className="header-icon">
            <BookIcon />
          </div>
          <div>
            <h1 className="header-title">Assigned Subjects</h1>
            <p className="header-subtitle">View all subjects assigned to you for the current academic session</p>
          </div>
        </div>
        {!loading && !error && items.length > 0 && (
          <div className="subject-count-badge">
            <span>Total Subjects</span>
            <span className="count">{items.length}</span>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading your assigned subjects...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="error-container">
          <div className="error-icon">
            <AlertCircleIcon />
          </div>
          <p className="error-message">{error}</p>
          <button className="retry-btn" onClick={load}>
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className="empty-container">
          <div className="empty-icon">
            <FileTextIcon />
          </div>
          <h3 className="empty-title">No Subjects Assigned</h3>
          <p className="empty-subtitle">You don't have any subjects assigned for the current session.</p>
        </div>
      )}

      {/* Table View */}
      {!loading && !error && items.length > 0 && (
        <div className="subjects-table-container">
          <table className="subjects-table">
            <thead>
              <tr>
                <th className="serial-cell">S.No</th>
                <th className="subject-cell">Subject</th>
                <th className="section-cell">Section</th>
                <th className="batch-cell">Batch</th>
                <th className="semester-cell">Semester</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td className="serial-cell" data-label="S.No">
                    <span className="serial-number">{index + 1}</span>
                  </td>
                  <td className="subject-cell" data-label="Subject">
                    <div className="subject-info">
                      <span className="subject-name">
                        {item.subject_name || 'Unnamed Subject'}
                      </span>
                      {item.subject_code && (
                        <span className="subject-code">{item.subject_code}</span>
                      )}
                    </div>
                    <div style={{marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button type="button" onClick={() => openPickerForAssignment(item)} style={{ padding: '6px 10px' }}>Create Batch</button>
                    </div>
                  </td>
                  <td className="section-cell" data-label="Section">
                    {item.section_name ? (
                      <span className="section-badge">
                        <UsersIcon />
                        {item.section_name}
                      </span>
                    ) : (
                      <span className="no-data">—</span>
                    )}
                  </td>
                  <td className="batch-cell" data-label="Batch">
                    {item.batch ? (
                      <span className="batch-badge">
                        <CalendarIcon />
                        {item.batch}
                      </span>
                    ) : (
                      <span className="no-data">—</span>
                    )}
                  </td>
                  <td className="semester-cell" data-label="Semester">
                    {item.semester != null ? (
                      <span className="semester-badge">{item.semester}</span>
                    ) : (
                      <span className="no-data">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Subject Batches - existing only; creation via subject actions */}
      <div className="subject-batches-container">
        <h3>Student Subject Batches</h3>
        <div>
          <h4>Existing</h4>
          {batches.length === 0 && <div>No batches</div>}

          {/* Render batches grouped under each assigned subject */}
          {items.map(item => {
            const crId = item.curriculum_row_id ? String(item.curriculum_row_id) : null
            const group = crId ? (batchesByCurriculum[crId] || []) : []
            if (!group || group.length === 0) return null
            return (
              <div key={`subject-${item.id}`} style={{ marginBottom: 12, borderBottom: '1px solid #f2f2f2', paddingBottom: 8 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>{item.subject_name || item.subject_code || 'Unnamed Subject'}</div>
                {group.map((b:any) => (
                  <div key={b.id} style={{ padding: 8, border: '1px solid #eee', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      {editingBatchId === b.id ? (
                        <input value={editingBatchName} onChange={e=>setEditingBatchName(e.target.value)} style={{ padding: 6, width: '100%' }} />
                      ) : (
                        <div style={{ fontWeight: 700 }}>{b.name}</div>
                      )}
                      <div style={{ fontSize: 13, color: '#666' }}>{(b.students || []).map((s:any)=>s.reg_no).join(', ')}</div>
                    </div>
                    <div style={{ marginLeft: 12, display: 'flex', gap: 8 }}>
                      {editingBatchId === b.id ? (
                        <>
                          <button onClick={saveBatchEdit} style={{ padding: '6px 8px' }}>Save</button>
                          <button onClick={()=>{ setEditingBatchId(null); setEditingBatchName('') }} style={{ padding: '6px 8px' }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEditBatch(b)} style={{ padding: '6px 8px' }}>Edit</button>
                          <button onClick={()=>deleteBatch(b.id)} style={{ padding: '6px 8px' }}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {/* Batches that don't map to any curriculum_row (or to our assignments) */}
          {(() => {
            const unmatched = batches.filter(b => {
              const cr = b.curriculum_row && b.curriculum_row.id ? b.curriculum_row.id : null
              return !cr || !items.some(it => it.curriculum_row_id === cr)
            })
            if (unmatched.length === 0) return null
            return (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Other Batches</div>
                {unmatched.map((b:any) => (
                  <div key={`other-${b.id}`} style={{ padding: 8, border: '1px solid #eee', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      {editingBatchId === b.id ? (
                        <input value={editingBatchName} onChange={e=>setEditingBatchName(e.target.value)} style={{ padding: 6, width: '100%' }} />
                      ) : (
                        <div style={{ fontWeight: 700 }}>{b.name}</div>
                      )}
                      <div style={{ fontSize: 13, color: '#666' }}>{(b.students || []).map((s:any)=>s.reg_no).join(', ')}</div>
                    </div>
                    <div style={{ marginLeft: 12, display: 'flex', gap: 8 }}>
                      {editingBatchId === b.id ? (
                        <>
                          <button onClick={saveBatchEdit} style={{ padding: '6px 8px' }}>Save</button>
                          <button onClick={()=>{ setEditingBatchId(null); setEditingBatchName('') }} style={{ padding: '6px 8px' }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEditBatch(b)} style={{ padding: '6px 8px' }}>Edit</button>
                          <button onClick={()=>deleteBatch(b.id)} style={{ padding: '6px 8px' }}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
          </div>
      </div>

      {/* Picker Modal */}
      {pickerOpen && (
        <div className="picker-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', padding: 16, width: 760, maxHeight: '80vh', overflow: 'auto', borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{batchNamesById[pickerItem?.id || ''] || 'Create Batch'}</h3>
                <div style={{ fontSize: 13, color: '#666' }}>{pickerItem?.subject_name || pickerItem?.subject_code}</div>
              </div>
              <div>
                <button type="button" onClick={() => { setPickerOpen(false); setPickerStudents([]); setPickerItem(null); }} style={{ marginRight: 8 }}>Cancel</button>
                <button type="button" onClick={submitPicker}>Create Batch</button>
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <strong>Students ({pickerStudents.length})</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {pickerStudents.map((s:any) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, border: '1px solid #eee', borderRadius: 4 }}>
                  <input type="checkbox" checked={pickerSelectedIds.includes(s.id)} onChange={() => togglePickerSelect(s.id)} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600 }}>{s.username || s.full_name || s.reg_no}</span>
                    <span style={{ fontSize: 12, color: '#666' }}>{s.reg_no || ''}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
