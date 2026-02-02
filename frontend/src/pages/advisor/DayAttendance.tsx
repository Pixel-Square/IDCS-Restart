import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

type Student = { id: number; reg_no: string; username: string }

const STATUS_OPTS = [
  { value: 'P', label: 'Present' },
  { value: 'A', label: 'Absent' },
  { value: 'OD', label: 'On Duty' },
  { value: 'LATE', label: 'Late' },
  { value: 'LEAVE', label: 'Leave' },
]

export default function DayAttendancePage() {
  const [groups, setGroups] = useState<Array<{ section_id: number; section_name: string; students: Student[] }>>([])
  const [loading, setLoading] = useState(false)
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

  async function submit() {
    if (!selectedSection) return alert('Select a section')
    const records = Object.entries(statuses).map(([sid, st]) => ({ student_id: Number(sid), status: st }))
    if (records.length === 0) return alert('No attendance selected')
    try {
      const payload = { section_id: selectedSection, date, records }
      const res = await fetchWithAuth('/api/academics/day-attendance-sessions/', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) throw new Error(await res.text())
      const d = await res.json()
      alert(`Saved. created=${d.created} updated=${d.updated}`)
    } catch (e) {
      console.error(e)
      alert('Failed to save attendance. See console for details.')
    }
  }

  const currentGroup = groups.find(g => g.section_id === selectedSection)

  // when selected section or groups change, prefill statuses as Present for all students
  useEffect(() => {
    if (!currentGroup) return
    const defaults: Record<number, string> = {}
    currentGroup.students.forEach(s => { defaults[s.id] = 'P' })
    setStatuses(prev => ({ ...defaults, ...prev }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSection, groups])

  return (
    <div>
      <h2>Day Attendance (Advisor)</h2>
      {loading && <div>Loading…</div>}
      {!loading && groups.length === 0 && <div>No assigned sections found.</div>}

      {groups.length > 0 && (
        <div>
          <label>
            Section:{' '}
            <select value={selectedSection ?? ''} onChange={e => setSelectedSection(Number(e.target.value))}>
              {groups.map(g => (
                <option key={g.section_id} value={g.section_id}>{g.section_name}</option>
              ))}
            </select>
          </label>
          <label style={{ marginLeft: 12 }}>
            Date:{' '}
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </label>

          <div style={{ marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Reg No</th>
                  <th style={{ textAlign: 'left' }}>Name</th>
                  <th style={{ textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentGroup?.students.map(s => (
                  <tr key={s.id}>
                    <td>{s.reg_no}</td>
                    <td>{s.username}</td>
                    <td>
                      <select value={statuses[s.id] || 'P'} onChange={e => onChangeStatus(s.id, e.target.value)}>
                        {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={submit}>Save Attendance</button>
          </div>
        </div>
      )}
    </div>
  )
}
