import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import '../Dashboard.css'

type Student = { 
  id: number; 
  reg_no: string; 
  username: string; 
  first_name?: string;
  last_name?: string;
  email?: string;
  section_id?: number; 
  section_name?: string;
  batch?: string;
  status?: string;
}

type SectionGroup = {
  section_id: number;
  section_name: string;
  students: Student[];
}

export default function MyStudentsPage() {
  const [data, setData] = useState<SectionGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSection, setSelectedSection] = useState<number | null>(null)

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    if (data.length > 0 && selectedSection === null) {
      setSelectedSection(data[0].section_id)
    }
  }, [data])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetchWithAuth('/api/academics/my-students/')
      if (!res.ok) throw new Error(await res.text())
      const d = await res.json()
      setData(d.results || [])
    } catch (e) {
      console.error(e)
      alert('Failed to load your students. See console for details.')
    } finally { setLoading(false) }
  }

  const currentSection = data.find(s => s.section_id === selectedSection)
  const students = [...(currentSection?.students || [])].sort((a, b) => a.reg_no.localeCompare(b.reg_no))

  if (loading) {
    return (
      <div className="dashboard-main">
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
            <path d="M24 12c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 4c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 14c-4 0-7.5 2-9.5 5h19c-2-3-5.5-5-9.5-5z" fill="#6366f1"/>
          </svg>
          <div>
            <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>My Students</h2>
            <div className="welcome-sub">View and manage your assigned student profiles.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ 
            padding: '8px 16px', 
            background: 'linear-gradient(90deg, #f3f4f6, #e0e7ff)', 
            borderRadius: 10, 
            fontWeight: 600, 
            color: '#3730a3',
            fontSize: 15
          }}>
            Total Students: {data.reduce((sum, s) => sum + s.students.length, 0)}
          </div>
        </div>
      </div>

      {data.length === 0 && !loading && (
        <div className="db-empty" style={{ textAlign: 'center', padding: 32 }}>
          <svg style={{ width: 64, height: 64, margin: '0 auto 16px', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>No students assigned</div>
          <div style={{ fontSize: 14, color: '#9ca3af' }}>You don't have any students assigned to your sections yet.</div>
        </div>
      )}

      {/* Section Pills */}
      {data.length > 0 && (
        <div style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {data.map(section => {
            const isActive = selectedSection === section.section_id
            return (
              <button
                key={section.section_id}
                onClick={() => setSelectedSection(section.section_id)}
                style={{
                  minWidth: 120,
                  height: 36,
                  borderRadius: 20,
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 16,
                  border: 'none',
                  outline: 'none',
                  boxShadow: isActive ? '0 2px 8px #e0e7ff' : 'none',
                  background: isActive ? 'linear-gradient(90deg,#4f46e5,#06b6d4)' : '#f3f4f6',
                  color: isActive ? '#fff' : '#1e293b',
                  transition: 'background 0.18s, color 0.18s, box-shadow 0.18s',
                  padding: '0 22px',
                  margin: 0,
                  cursor: 'pointer',
                  letterSpacing: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxSizing: 'border-box',
                }}
              >
                {section.section_name}
                <span style={{
                  background: isActive ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: isActive ? '#fff' : '#374151'
                }}>
                  {section.students.length}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Students Table */}
      {students.length > 0 && (
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
                <th style={{ padding: '12px 16px', color: '#3730a3', fontWeight: 700, fontSize: 15 }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, index) => (
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
                  <td style={{ padding: '12px 16px', color: '#374151' }}>
                    {student.email || '-'}
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
