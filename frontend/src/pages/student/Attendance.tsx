import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

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

  return (
    <div>
      <h2>My Attendance (Day-wise)</h2>
      {summary && (
        <div style={{ marginBottom: 12 }}>
          <strong>Overall Attendance:</strong> {summary.overall.percentage}% ({summary.overall.present}/{summary.overall.total})
          {summary.by_section && summary.by_section.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <em>By Section:</em>
              <ul>
                {summary.by_section.map((s: any) => (
                  <li key={s.section_id}>{s.section}: {s.percentage}% ({s.present}/{s.total})</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {loading && <div>Loading…</div>}
      {!loading && rows.length === 0 && <div>No attendance records found.</div>}
      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Section</th>
              <th>Status</th>
              <th>Marked At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td>
                <td>{r.section}</td>
                <td>{r.status}</td>
                <td>{r.marked_at || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
