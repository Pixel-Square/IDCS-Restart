import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import '../Dashboard.css'

type Student = { id: number; reg_no: string; username: string; first_name?: string; last_name?: string }

const STATUS_OPTS = [
  { value: 'P', label: 'Present', color: '#059669', bg: '#d1fae5' },
  { value: 'A', label: 'Absent', color: '#dc2626', bg: '#fee2e2' },
  { value: 'OD', label: 'On Duty', color: '#2563eb', bg: '#dbeafe' },
  { value: 'LATE', label: 'Late', color: '#d97706', bg: '#fef3c7' },
  { value: 'LEAVE', label: 'Leave', color: '#7c3aed', bg: '#ede9fe' },
]

export default function DayAttendancePage() {
  const [groups, setGroups] = useState<Array<{ section_id: number; section_name: string; students: Student[] }>>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [selectedSection, setSelectedSection] = useState<number | null>(null)
  const [statuses, setStatuses] = useState<Record<number, string>>({})

  useEffect(() => { fetchGroups() }, [])

  async function fetchGroups() {
    setLoading(true)
    try {
      const res = await fetchWithAuth('/api/academics/my-students/')
      if (!res.ok) throw new Error(await res.text())
      const d = await res.json()
      setGroups(d.results || [])
      if ((d.results || []).length > 0) setSelectedSection(d.results[0].section_id)
    } catch (e) {
      console.error(e)
      alert('Failed to load students. See console for details.')
    } finally { setLoading(false) }
  }

  function onChangeStatus(studentId: number, value: string) {
    setStatuses(prev => ({ ...prev, [studentId]: value }))
  }

  function markAllAs(status: string) {
    if (!currentGroup) return
    const newStatuses: Record<number, string> = {}
    currentGroup.students.forEach(s => { newStatuses[s.id] = status })
    setStatuses(newStatuses)
  }

  async function submit() {
    if (!selectedSection) return alert('Select a section')
    const records = Object.entries(statuses).map(([sid, st]) => ({ student_id: Number(sid), status: st }))
    if (records.length === 0) return alert('No attendance selected')
    setSaving(true)
    try {
      const payload = { section_id: selectedSection, date, records }
      const res = await fetchWithAuth('/api/academics/day-attendance-sessions/', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) throw new Error(await res.text())
      const d = await res.json()
      alert(`Attendance saved successfully! Created: ${d.created}, Updated: ${d.updated}`)
    } catch (e) {
      console.error(e)
      alert('Failed to save attendance. See console for details.')
    } finally { setSaving(false) }
  }

  const currentGroup = groups.find(g => g.section_id === selectedSection)
  const students = [...(currentGroup?.students || [])].sort((a, b) => a.reg_no.localeCompare(b.reg_no))

  // when selected section or groups change, prefill statuses as Present for all students
  useEffect(() => {
    if (!currentGroup) return
    const defaults: Record<number, string> = {}
    currentGroup.students.forEach(s => { defaults[s.id] = 'P' })
    setStatuses(prev => ({ ...defaults, ...prev }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSection, groups])

  // Calculate summary
  const summary = STATUS_OPTS.map(opt => ({
    ...opt,
    count: Object.values(statuses).filter(s => s === opt.value).length
  }))

  if (loading) {
    return (
      <div style={{ padding: 28 }}>
        <div className="db-loading">Loading student information…</div>
      </div>
    )
  }

  return (
    <div style={{ padding: 28 }}>
      {/* Header Section */}
      <div className="welcome" style={{ marginBottom: 24 }}>
        <div className="welcome-left">
          <svg className="welcome-icon" fill="none" viewBox="0 0 48 48">
            <rect width="48" height="48" rx="12" fill="#e0e7ff"/>
            <path d="M14 24l6 6 14-14" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <div>
            <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>Mark Attendance</h2>
            <div className="welcome-sub">Record daily attendance for your assigned sections.</div>
          </div>
        </div>
      </div>

      {!loading && groups.length === 0 && (
        <div className="db-empty" style={{ textAlign: 'center', padding: 32 }}>
          <svg style={{ width: 64, height: 64, margin: '0 auto 16px', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>No sections assigned</div>
          <div style={{ fontSize: 14, color: '#9ca3af' }}>You don't have any sections assigned to mark attendance.</div>
        </div>
      )}

      {groups.length > 0 && (
        <>
          {/* Controls Row */}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: 16, 
            marginBottom: 20, 
            padding: 16,
            background: 'linear-gradient(90deg, #ffffff, #f8fafc)',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Section:</span>
              <select 
                value={selectedSection ?? ''} 
                onChange={e => setSelectedSection(Number(e.target.value))}
                style={{ 
                  padding: '8px 14px', 
                  borderRadius: 8, 
                  border: '1px solid #d1d5db', 
                  background: '#fff',
                  fontSize: 15,
                  fontWeight: 500,
                  color: '#1e293b',
                  minWidth: 150
                }}
              >
                {groups.map(g => (
                  <option key={g.section_id} value={g.section_id}>{g.section_name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Date:</span>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)}
                style={{ 
                  padding: '8px 14px', 
                  borderRadius: 8, 
                  border: '1px solid #d1d5db', 
                  background: '#fff',
                  fontSize: 15,
                  fontWeight: 500,
                  color: '#1e293b'
                }}
              />
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <span style={{ fontWeight: 600, color: '#374151', alignSelf: 'center' }}>Mark All:</span>
              {STATUS_OPTS.slice(0, 2).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => markAllAs(opt.value)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: opt.bg,
                    color: opt.color,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'transform 0.15s'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Pills */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {summary.map(s => (
              <div key={s.value} style={{
                padding: '8px 16px',
                borderRadius: 10,
                background: s.bg,
                color: s.color,
                fontWeight: 600,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                {s.label}: <span style={{ fontWeight: 700, fontSize: 16 }}>{s.count}</span>
              </div>
            ))}
            <div style={{
              padding: '8px 16px',
              borderRadius: 10,
              background: '#f3f4f6',
              color: '#374151',
              fontWeight: 600,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              Total: <span style={{ fontWeight: 700, fontSize: 16 }}>{students.length}</span>
            </div>
          </div>

          {/* Students Table */}
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse', 
              background: '#fff', 
              borderRadius: 10, 
              boxShadow: '0 2px 8px #e5e7eb',
              overflow: 'hidden'
            }}>
              <thead>
                <tr style={{ 
                  background: 'linear-gradient(90deg,#f3f4f6,#e0e7ff)', 
                  textAlign: 'left', 
                  borderBottom: '2px solid #d1d5db' 
                }}>
                  <th style={{ padding: '12px 16px', color: '#3730a3', fontWeight: 700, fontSize: 15 }}>S.No</th>
                  <th style={{ padding: '12px 16px', color: '#3730a3', fontWeight: 700, fontSize: 15 }}>Registration No</th>
                  <th style={{ padding: '12px 16px', color: '#3730a3', fontWeight: 700, fontSize: 15 }}>Student Name</th>
                  <th style={{ padding: '12px 16px', color: '#3730a3', fontWeight: 700, fontSize: 15, textAlign: 'center' }}>Attendance Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, index) => {
                  const currentStatus = statuses[student.id] || 'P'
                  const statusOpt = STATUS_OPTS.find(o => o.value === currentStatus) || STATUS_OPTS[0]
                  return (
                    <tr 
                      key={student.id} 
                      style={{ 
                        borderBottom: '1px solid #f3f4f6', 
                        transition: 'background 0.2s',
                        background: index % 2 === 0 ? '#fff' : '#f9fafb'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = index % 2 === 0 ? '#fff' : '#f9fafb')}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 500, color: '#6b7280' }}>
                        {index + 1}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b', fontSize: 15 }}>
                        {student.reg_no}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 15, color: '#1e293b', fontWeight: 500 }}>
                        {student.first_name && student.last_name 
                          ? `${student.first_name} ${student.last_name}`.trim() 
                          : student.username}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {STATUS_OPTS.map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => onChangeStatus(student.id, opt.value)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: currentStatus === opt.value ? `2px solid ${opt.color}` : '2px solid transparent',
                                background: currentStatus === opt.value ? opt.bg : '#f3f4f6',
                                color: currentStatus === opt.value ? opt.color : '#6b7280',
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                minWidth: 60
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Save Button */}
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={submit}
              disabled={saving}
              style={{
                padding: '12px 32px',
                borderRadius: 10,
                border: 'none',
                background: saving ? '#9ca3af' : 'linear-gradient(90deg,#4f46e5,#06b6d4)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 16,
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {saving ? (
                <>Saving...</>
              ) : (
                <>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Attendance
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
