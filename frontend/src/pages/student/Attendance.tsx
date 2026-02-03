import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import '../Dashboard.css'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  'P': { label: 'Present', color: '#059669', bg: '#d1fae5', icon: '✓' },
  'A': { label: 'Absent', color: '#dc2626', bg: '#fee2e2', icon: '✗' },
  'OD': { label: 'On Duty', color: '#2563eb', bg: '#dbeafe', icon: '⚡' },
  'LATE': { label: 'Late', color: '#d97706', bg: '#fef3c7', icon: '⏰' },
  'LEAVE': { label: 'Leave', color: '#7c3aed', bg: '#ede9fe', icon: '📋' },
}

export default function StudentAttendancePage(){
  const [rows, setRows] = useState<Array<{ date: string; section: string; status: string; marked_at?: string }>>([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<any>(null)

  useEffect(()=>{ fetchData() }, [])

  async function fetchData(){
    setLoading(true)
    try{
      const res = await fetchWithAuth('/api/academics/attendance/day/')
      if(!res.ok) throw new Error(await res.text())
      const d = await res.json()
      setRows(d.results || [])
      setSummary(d.summary || null)
    }catch(e){
      console.error(e)
      alert('Failed to load attendance. See console for details.')
    }finally{ setLoading(false) }
  }

  // Calculate attendance counts by status
  const attendanceCounts = rows.reduce((acc, row) => {
    const status = row.status || 'P'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalDays = rows.length
  const presentDays = (attendanceCounts['P'] || 0)
  const percentage = summary?.overall?.percentage ?? (totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0)

  // Circular progress component
  const CircularProgress = ({ percent }: { percent: number }) => {
    const radius = 70
    const stroke = 12
    const normalizedRadius = radius - stroke / 2
    const circumference = normalizedRadius * 2 * Math.PI
    const strokeDashoffset = circumference - (percent / 100) * circumference
    
    const getColor = (p: number) => {
      if (p >= 75) return '#059669'
      if (p >= 50) return '#d97706'
      return '#dc2626'
    }

    return (
      <svg height={radius * 2} width={radius * 2} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          stroke="#e5e7eb"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={getColor(percent)}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 28 }}>
        <div className="db-loading">Loading attendance information…</div>
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
            <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>My Attendance</h2>
            <div className="welcome-sub">View your day-wise attendance records and statistics.</div>
          </div>
        </div>
      </div>

      {/* Stats Section - Two Cards Side by Side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 }}>
        
        {/* Overall Attendance Visualization Card */}
        <div style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: 24
        }}>
          <div style={{ position: 'relative' }}>
            <CircularProgress percent={percentage} />
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: percentage >= 75 ? '#059669' : percentage >= 50 ? '#d97706' : '#dc2626' }}>
                {percentage}%
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Attendance</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
              Overall Attendance
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#6b7280', fontSize: 14 }}>Present Days</span>
                <span style={{ fontWeight: 600, color: '#059669', fontSize: 16 }}>{summary?.overall?.present ?? presentDays}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#6b7280', fontSize: 14 }}>Total Days</span>
                <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 16 }}>{summary?.overall?.total ?? totalDays}</span>
              </div>
              <div style={{ 
                marginTop: 8, 
                padding: '8px 12px', 
                borderRadius: 8, 
                background: percentage >= 75 ? '#d1fae5' : percentage >= 50 ? '#fef3c7' : '#fee2e2',
                color: percentage >= 75 ? '#059669' : percentage >= 50 ? '#d97706' : '#dc2626',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'center'
              }}>
                {percentage >= 75 ? '✓ Good Standing' : percentage >= 50 ? '⚠ Needs Improvement' : '✗ Below Minimum'}
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Breakdown Card */}
        <div style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb'
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>
            Attendance Breakdown
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => {
              const count = attendanceCounts[key] || 0
              return (
                <div key={key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: config.bg,
                  border: `1px solid ${config.color}20`
                }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}>
                    {config.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{config.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: config.color }}>{count}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
