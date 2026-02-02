import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

type Student = { id: number; reg_no: string; username: string; section_id?: number; section_name?: string }

export default function MyStudentsPage() {
  const [data, setData] = useState<Array<{ section_id: number; section_name: string; students: Student[] }>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchData() }, [])

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

  return (
    <div>
      <h2>My Students</h2>
      {loading && <div>Loading…</div>}
      {data.length === 0 && !loading && <div>No students assigned.</div>}
      {data.map(group => (
        <section key={group.section_id} style={{ marginBottom: 16 }}>
          <h3>{group.section_name}</h3>
          <ul>
            {group.students.map(s => (
              <li key={s.id}>{s.reg_no} — {s.username}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
